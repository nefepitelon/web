import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 191) return Response.json({ error: "Invalid article" }, { status: 400 });

  const rate = await checkRateLimit(`research:view:${id}:${clientAddress(request)}`, 12, 60 * 60 * 1000);
  if (!rate.allowed) {
    return Response.json({ tracked: false }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds), "Cache-Control": "no-store" } });
  }

  const result = await prisma.researchArticle.updateMany({
    where: { id, status: "PUBLISHED", publishedAt: { lte: new Date() } },
    data: { viewCount: { increment: 1 } }
  });
  return Response.json({ tracked: result.count === 1 }, { headers: { "Cache-Control": "no-store" } });
}
