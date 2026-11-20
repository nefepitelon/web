import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { trustedRequestIp } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 191) return Response.json({ error: "Invalid article" }, { status: 400 });

  // Persist only a digest; untrusted forwarding headers must not let clients
  // rotate the rate-limit identity or leave their raw IP in the bucket table.
  const visitor = createHash("sha256").update(trustedRequestIp(request.headers) ?? "unknown").digest("hex").slice(0, 32);
  const rate = await checkRateLimit(`research:view:${id}:${visitor}`, 12, 60 * 60 * 1000);
  if (!rate.allowed) {
    return Response.json({ tracked: false }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store" } });
  }

  const result = await prisma.researchArticle.updateMany({
    where: { id, status: "PUBLISHED", publishedAt: { lte: new Date() } },
    data: { viewCount: { increment: 1 } }
  });
  return Response.json({ tracked: result.count === 1 }, { headers: { "Cache-Control": "no-store" } });
}
