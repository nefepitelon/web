import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const schema = z.object({ factorId: z.string().min(1) });

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/account/security", true);
    if (viewer.role === "admin") return Response.json({ error: "管理员必须保持 2FA 启用" }, { status: 403 });
    const input = schema.parse(await request.json());
    const setting = await prisma.twoFactorSetting.findUnique({ where: { userId: viewer.id } });
    if (!setting || setting.factorId !== input.factorId) return Response.json({ error: "2FA 因子不匹配" }, { status: 400 });
    const supabase = await createServerSupabaseClient();
    if (!supabase) throw new Error("认证服务尚未配置");
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: input.factorId });
    if (unenrollError) throw unenrollError;
    await prisma.$transaction([
      prisma.backupCode.deleteMany({ where: { userId: viewer.id } }),
      prisma.twoFactorSetting.delete({ where: { userId: viewer.id } })
    ]);
    await writeAudit({ actorUserId: viewer.id, action: "security.2fa.disabled", targetType: "user", targetId: viewer.id, request });
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", "welinkbtc_2fa=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return response;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "无法关闭 2FA";
    return Response.json({ error: message }, { status: 400 });
  }
}
