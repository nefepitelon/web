import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-security";
import { createTwoFactorPass, hashBackupCode, safeEqualText, twoFactorBindingFromClaims } from "@/lib/security";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

const schema = z.object({ code: z.string().min(8).max(20) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/auth/verify-2fa", false);
    const input = schema.parse(await request.json());
    const rate = await checkRateLimit(`2fa:backup:${viewer.id}`, 6, 10 * 60 * 1000);
    if (!rate.allowed) return Response.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });

    const setting = await prisma.twoFactorSetting.findUnique({ where: { userId: viewer.id } });
    const supabase = await createServerSupabaseClient();
    const claims = supabase ? await supabase.auth.getClaims() : null;
    const binding = twoFactorBindingFromClaims(claims?.data?.claims, viewer.id, setting?.factorId, setting?.enabledAt);
    if (claims?.error || !binding) return Response.json({ error: "请重新登录并验证已启用的 2FA" }, { status: 401 });

    const candidateHash = hashBackupCode(input.code);
    const codes = await prisma.backupCode.findMany({ where: { userId: viewer.id, usedAt: null } });
    const matched = codes.find((item) => safeEqualText(item.codeHash, candidateHash));
    if (!matched) return Response.json({ error: "备份码无效或已经使用" }, { status: 400 });
    const updated = await prisma.backupCode.updateMany({ where: { id: matched.id, usedAt: null }, data: { usedAt: new Date() } });
    if (updated.count !== 1) return Response.json({ error: "备份码已经使用" }, { status: 409 });

    await writeAudit({ actorUserId: viewer.id, action: "security.2fa.backup_code.used", targetType: "backup_code", targetId: matched.id, request });
    const token = await createTwoFactorPass(viewer.id, binding);
    const response = applyAuthResponseHeaders(Response.json({ ok: true }));
    response.headers.append("Set-Cookie", `welinkbtc_2fa=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (caught) {
    return applyAuthResponseHeaders(Response.json({ error: caught instanceof z.ZodError ? "备份码格式无效" : "备份码验证失败，请稍后重试。" }, { status: 400 }));
  }
}
