import "server-only";
import { randomUUID } from "node:crypto";
import { Prisma, type BstockAutoConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { autoSettingsSchema, AUTO_STRATEGY_VERSION } from "@/lib/bstock-auto-strategy";

export const AUTO_PENDING = ["QUOTING", "QUOTED", "SUBMITTING", "PENDING", "UNKNOWN"];
export const jsonValue = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export function safeAutoError(error: unknown) {
  // Only locally generated/user-facing errors belong in the audit trail.
  return (error instanceof Error ? error.message : "自动交易服务暂时不可用")
    .replace(/(?:v1:[A-Za-z0-9_:-]+|agentSessionId=[^\s;,]+)/g, "[redacted]").slice(0, 1900);
}
export function publicAutoConfig(config: BstockAutoConfig | null) {
  if (!config) return null;
  return { ...autoSettingsSchema.parse(config.settings), enabled: config.enabled, status: config.status,
    generation: config.generation, strategyVersion: config.strategyVersion, runId: config.runId,
    startedAt: config.startedAt, heartbeatAt: config.heartbeatAt, expiresAt: config.expiresAt,
    lastError: config.lastError, equityStartUsd: Number(config.equityStartUsd),
    equityHighUsd: Number(config.equityHighUsd), stats: config.stats };
}
export async function autoEvent(ownerKey: string, generation: string | null, kind: string, reason: string, extra: {
  status?: string; symbol?: string; side?: string; strategy?: string; orderId?: string; txHash?: string; metadata?: unknown;
} = {}) {
  const { metadata, ...fields } = extra;
  return prisma.bstockAutoEvent.create({ data: { ownerKey, generation, kind, reason: reason.slice(0, 1900), ...fields,
    metadata: jsonValue({ strategyVersion: AUTO_STRATEGY_VERSION, ...(metadata && typeof metadata === "object" ? metadata : {}) }) } });
}
export async function withAutoLock<T>(ownerKey: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerKey}))::text`;
    return operation(tx);
  }, { maxWait: 10_000, timeout: 15_000 });
}
export async function acquireAutoLease(ownerKey: string, generation: string) {
  const token = randomUUID();
  const result = await prisma.bstockAutoConfig.updateMany({ where: { ownerKey, generation,
    OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    data: { leaseToken: token, leaseUntil: new Date(Date.now() + 300_000), heartbeatAt: new Date() } });
  return result.count === 1 ? token : null;
}
export async function pauseAuto(ownerKey: string, generation: string, reason: string, status = "PAUSED") {
  await withAutoLock(ownerKey, async tx => {
    const result = await tx.bstockAutoConfig.updateMany({ where: { ownerKey, generation }, data: { enabled: false, status, lastError: reason.slice(0, 1900) } });
    if (result.count) await tx.bstockAutoEvent.create({ data: { ownerKey, generation, kind: "PAUSED", status, reason: reason.slice(0, 1900) } });
  });
}
