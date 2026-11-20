import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { createTwoFactorPass, generateBackupCodes, hashBackupCode, twoFactorBindingFromClaims } from "@/lib/security";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({ factorId: z.string().min(1).max(128) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/account/security", false);
    const rate = await checkRateLimit(`2fa:activate:${viewer.id}`, 6, 10 * 60_000);
    if (!rate.allowed) return Response.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });
    const input = schema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error("认证服务尚未配置");
    const [{ data: claimsData, error: claimsError }, { data: factors }] = await Promise.all([
      supabase.auth.getClaims(),
      supabase.auth.mfa.listFactors()
    ]);
    const verifiedFactor = factors?.totp.find((factor) => factor.id === input.factorId && factor.status === "verified");
    const enabledAt = new Date();
    const binding = twoFactorBindingFromClaims(claimsData?.claims, viewer.id, input.factorId, enabledAt);
    if (claimsError || claimsData?.claims.aal !== "aal2" || !verifiedFactor || !binding) {
      return Response.json({ error: "请先使用验证器完成 TOTP 校验" }, { status: 400 });
    }

    const backupCodes = generateBackupCodes();
    await prisma.$transaction(async (tx) => {
      await tx.twoFactorSetting.upsert({
        where: { userId: viewer.id },
        update: { factorId: input.factorId, enabledAt },
        create: { userId: viewer.id, factorId: input.factorId, enabledAt }
      });
      await tx.backupCode.deleteMany({ where: { userId: viewer.id } });
      await tx.backupCode.createMany({
        data: backupCodes.map((backupCode) => ({ userId: viewer.id, codeHash: hashBackupCode(backupCode) }))
      });
    });
    await writeAudit({ actorUserId: viewer.id, action: "security.2fa.enabled", targetType: "user", targetId: viewer.id, request });
    const response = applyAuthResponseHeaders(Response.json({ ok: true, backupCodes }));
    const token = await createTwoFactorPass(viewer.id, binding);
    response.headers.append("Set-Cookie", `welinkbtc_2fa=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (caught) {
    return applyAuthResponseHeaders(Response.json({ error: caught instanceof z.ZodError ? "2FA 因子格式无效" : "无法启用 2FA，请重新验证后重试。" }, { status: 400 }));
  }
}
