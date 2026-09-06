import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { configuredAccess } from "@/lib/content-gates";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ name: z.string().trim().min(2).max(60) });

function hashKey(value: string) {
  if (!process.env.TWO_FACTOR_SIGNING_KEY) throw new Error("TWO_FACTOR_SIGNING_KEY is not configured");
  return createHmac("sha256", process.env.TWO_FACTOR_SIGNING_KEY).update(value).digest("hex");
}

export async function GET() {
  const viewer = await requireViewer("/account/api-keys");
  const access = await configuredAccess(viewer, "api.keys");
  if (!access.allowed) return Response.json({ error: "Max subscription required" }, { status: 403 });
  const keys = await prisma.apiKey.findMany({ where: { userId: viewer.id }, select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } });
  return Response.json({ keys }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireViewer("/account/api-keys");
    const access = await configuredAccess(viewer, "api.keys");
    if (!access.allowed) return Response.json({ error: "Max subscription required" }, { status: 403 });
    const input = schema.parse(await request.json());
    const raw = `wlb_live_${randomBytes(24).toString("base64url")}`;
    const key = await prisma.apiKey.create({ data: { userId: viewer.id, name: input.name, prefix: raw.slice(0, 13), secretHash: hashKey(raw) } });
    return Response.json({ id: key.id, key: raw }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : "API Key creation failed" }, { status: 400 });
  }
}
