import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

async function revoke(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.apiKey.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (changed.count !== 1) return false;
    await writeAudit({ actorUserId: userId, action: "api_key.revoked", targetType: "api_key", targetId: id }, tx);
    return true;
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try { assertSameOrigin(request); }
  catch { return Response.json({ error: "请求来源校验失败" }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
  const viewer = await requireViewer("/account/api-keys");
  const { id } = await params;
  return Response.json({ ok: await revoke(id, viewer.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try { assertSameOrigin(request); }
  catch { return Response.json({ error: "请求来源校验失败" }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
  const viewer = await requireViewer("/account/api-keys");
  const { id } = await params;
  await revoke(id, viewer.id);
  return NextResponse.redirect(new URL("/account/api-keys", request.url), { status: 303 });
}
