import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { createTwoFactorPass, generateBackupCodes, hashBackupCode } from "@/lib/security";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({ factorId: z.string().min(1) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/account/security", false);
    const input = schema.parse(await request.json());
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error("认证服务尚未配置");
    const [{ data: assurance }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors()
    ]);
    const verifiedFactor = factors?.totp.find((factor) => factor.id === input.factorId && factor.status === "verified");
    if (assurance?.currentLevel !== "aal2" || !verifiedFactor) {
      return Response.json({ error: "请先使用验证器完成 TOTP 校验" }, { status: 400 });
    }

    const backupCodes = generateBackupCodes();
    await prisma.$transaction(async (tx) => {
      await tx.twoFactorSetting.upsert({
        where: { userId: viewer.id },
        update: { factorId: input.factorId, enabledAt: new Date() },
        create: { userId: viewer.id, factorId: input.factorId, enabledAt: new Date() }
      });
      await tx.backupCode.deleteMany({ where: { userId: viewer.id } });
      await tx.backupCode.createMany({
        data: backupCodes.map((backupCode) => ({ userId: viewer.id, codeHash: hashBackupCode(backupCode) }))
      });
    });
    await writeAudit({ actorUserId: viewer.id, action: "security.2fa.enabled", targetType: "user", targetId: viewer.id, request });
    const response = Response.json({ ok: true, backupCodes });
    const token = await createTwoFactorPass(viewer.id);
    response.headers.append("Set-Cookie", `welinkbtc_2fa=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "无法启用 2FA";
    return Response.json({ error: message }, { status: 400 });
  }
}
