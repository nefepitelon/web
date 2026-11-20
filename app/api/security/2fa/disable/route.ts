import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

const schema = z.object({ factorId: z.string().min(1).max(128) });

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/account/security", true);
    if (viewer.role === "admin") return Response.json({ error: "管理员必须保持 2FA 启用" }, { status: 403 });
    const rate = await checkRateLimit(`2fa:disable:${viewer.id}`, 6, 10 * 60_000);
    if (!rate.allowed) return Response.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });
    const input = schema.parse(await request.json());
    const setting = await prisma.twoFactorSetting.findUnique({ where: { userId: viewer.id } });
    if (!setting || setting.factorId !== input.factorId) return Response.json({ error: "2FA 因子不匹配" }, { status: 400 });
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error("认证服务尚未配置");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || claims?.claims.sub !== viewer.id || claims.claims.aal !== "aal2") {
      return Response.json({ error: "关闭 2FA 必须使用验证器完成本次会话校验" }, { status: 403 });
    }
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: input.factorId });
    if (unenrollError) throw unenrollError;
    await prisma.$transaction([
      prisma.backupCode.deleteMany({ where: { userId: viewer.id } }),
      prisma.twoFactorSetting.delete({ where: { userId: viewer.id } })
    ]);
    await writeAudit({ actorUserId: viewer.id, action: "security.2fa.disabled", targetType: "user", targetId: viewer.id, request });
    const response = applyAuthResponseHeaders(Response.json({ ok: true }));
    response.headers.append("Set-Cookie", "welinkbtc_2fa=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return response;
  } catch (caught) {
    return applyAuthResponseHeaders(Response.json({ error: caught instanceof z.ZodError ? "2FA 因子格式无效" : "无法关闭 2FA，请重新验证后重试。" }, { status: 400 }));
  }
}
