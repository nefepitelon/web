import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma, isDatabaseConfigured } from "@/lib/prisma";

export const stmPersistenceConfigured = isDatabaseConfigured;
export function stmJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export async function putRecord(userId: string, kind: string, key: string, payload: unknown) {
  return prisma.stmHuntRecord.upsert({ where: { userId_kind_key: { userId, kind, key } },
    create: { userId, kind, key, payload: stmJson(payload) }, update: { payload: stmJson(payload) }, select: { key: true } });
}
export async function getRecord<T = unknown>(userId: string, kind: string, key: string): Promise<T | null> {
  const row = await prisma.stmHuntRecord.findUnique({ where: { userId_kind_key: { userId, kind, key } }, select: { payload: true } });
  return row ? row.payload as T : null;
}
/** Reject stale public evidence in Postgres so expired multi-megabyte captures never cross the pooler. */
export async function getFreshPublicCapture<T = unknown>(nowMs: number, maxAgeMs: number): Promise<T | null> {
  const oldestIso = new Date(nowMs - maxAgeMs).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const rows = await prisma.$queryRaw<{ payload: Prisma.JsonValue }[]>`
    SELECT payload FROM stm_hunt_records
    WHERE "userId" = 'system' AND kind = 'capture' AND key = 'latest'
      AND payload->>'asOf' > ${oldestIso} AND payload->>'asOf' <= ${nowIso}
    LIMIT 1`;
  return rows[0] ? rows[0].payload as T : null;
}
export async function listRecords<T = unknown>(userId: string, kind: string, limit = 100) {
  const rows = await prisma.stmHuntRecord.findMany({ where: { userId, kind }, orderBy: { createdAt: "desc" }, take: Math.min(2000, Math.max(1, limit)) });
  return rows.map(row => ({ ...row, payload: row.payload as T }));
}
export async function deleteRecord(userId: string, kind: string, key: string) {
  return prisma.stmHuntRecord.deleteMany({ where: { userId, kind, key } });
}
export async function retainSnapshots() {
  // Five-minute captures are retained for 30 days; personal journals are never pruned here.
  return prisma.stmHuntRecord.deleteMany({ where: { userId: "system", kind: { in: ["snapshot", "chain-event", "scan-rejected"] },
    createdAt: { lt: new Date(Date.now() - 30 * 86400_000) } } });
}
