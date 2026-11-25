import "server-only";
import { createHash } from "node:crypto";
import { isDatabaseConfigured } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { trustedRequestIp } from "@/lib/request-security";

const local = new Map<string, { count: number; until: number }>();
export async function limitStmResearchRequest(request: Request): Promise<boolean> {
  const key = `stm:research:read:${createHash("sha256").update(trustedRequestIp(request.headers) ?? "unknown").digest("hex").slice(0, 32)}`;
  if (isDatabaseConfigured()) return (await checkRateLimit(key, 90, 60000)).allowed;
  const now = Date.now();
  if (local.size > 1000) for (const [key, bucket] of local) if (bucket.until <= now) local.delete(key);
  if (local.size > 1500 && !local.has(key)) return false;
  const previous = local.get(key), bucket = previous && previous.until > now ? previous : { count: 0, until: now + 60000 };
  local.set(key, bucket); return ++bucket.count <= 90;
}
