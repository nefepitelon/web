import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/request-security";
import { createTwoFactorPass, hashBackupCode, safeEqualText } from "@/lib/security";

const schema = z.object({ code: z.string().min(8).max(20) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/auth/verify-2fa", false);
    const input = schema.parse(await request.json());
    const rate = await checkRateLimit(`2fa:backup:${viewer.id}`, 6, 10 * 60 * 1000);
    if (!rate.allowed) return Response.json({ error: "尝试次数过多，请稍后再试" }, { status: 429 });

    const candidateHash = hashBackupCode(input.code);
    const codes = await prisma.backupCode.findMany({ where: { userId: viewer.id, usedAt: null } });
    const matched = codes.find((item) => safeEqualText(item.codeHash, candidateHash));
    if (!matched) return Response.json({ error: "备份码无效或已经使用" }, { status: 400 });
    const updated = await prisma.backupCode.updateMany({ where: { id: matched.id, usedAt: null }, data: { usedAt: new Date() } });
    if (updated.count !== 1) return Response.json({ error: "备份码已经使用" }, { status: 409 });

    await writeAudit({ actorUserId: viewer.id, action: "security.2fa.backup_code.used", targetType: "backup_code", targetId: matched.id, request });
    const token = await createTwoFactorPass(viewer.id);
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", `welinkbtc_2fa=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "备份码验证失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
