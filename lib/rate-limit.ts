import { prisma } from "@/lib/prisma";

export async function checkRateLimit(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + windowMs * 2);

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    update: { count: { increment: 1 }, expiresAt },
    create: { key, windowStart, expiresAt, count: 1 },
    select: { count: true }
  });

  if (Math.random() < 0.02) {
    void prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  return {
    allowed: bucket.count <= maximum,
    remaining: Math.max(0, maximum - bucket.count),
    retryAfterSeconds: Math.ceil((windowStartMs + windowMs - now) / 1000)
  };
}
