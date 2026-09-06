import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

async function revoke(id: string, userId: string) {
  const key = await prisma.apiKey.findFirst({ where: { id, userId, revokedAt: null } });
  if (!key) return false;
  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await writeAudit({ actorUserId: userId, action: "api_key.revoked", targetType: "api_key", targetId: id });
  return true;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await requireViewer("/account/api-keys");
  const { id } = await params;
  return Response.json({ ok: await revoke(id, viewer.id) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await requireViewer("/account/api-keys");
  const { id } = await params;
  await revoke(id, viewer.id);
  return NextResponse.redirect(new URL("/account/api-keys", request.url), { status: 303 });
}
