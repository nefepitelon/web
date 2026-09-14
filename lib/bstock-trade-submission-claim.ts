import type { Prisma, PrismaClient } from "@prisma/client";

export type BstockTradingExecutionContext = {
  automation?: { ownerKey: string; generation: string; orderId: string; leaseToken: string };
};

export class BstockSubmissionClaimError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "BstockSubmissionClaimError";
  }
}

const openAutoOrderStatuses = ["QUOTING", "QUOTED", "SUBMITTING", "PENDING", "UNKNOWN"];

/** Atomically check browser/manual quote availability and persist its intent. */
export async function withBstockManualQuoteGuard<T>(
  database: Pick<PrismaClient, "$transaction">,
  ownerKey: string,
  operation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerKey}))::text`;
    const config = await tx.bstockAutoConfig.findUnique({ where: { ownerKey } });
    if (config?.enabled || await tx.bstockAutoOrder.findFirst({
      where: { ownerKey, status: { in: openAutoOrderStatuses } }, select: { id: true }
    })) {
      throw new BstockSubmissionClaimError("该钱包正在执行自动交易，请先停止机器人并等待在途订单完成。", "AUTOMATION_OWNS_WALLET");
    }
    return operation(tx);
  }, { maxWait: 5_000, timeout: 10_000 });
}

/** Stop/start controls use the same owner lock; only this winner may broadcast. */
export async function claimBstockTradeSubmission(
  database: Pick<PrismaClient, "$transaction">,
  identity: { intentHash: string; ownerKey: string; agentKey: string },
  context: BstockTradingExecutionContext = {},
  submittedAt?: Date
) {
  return database.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.ownerKey}))::text`;
    const claimedAt = submittedAt ?? new Date();
    const config = await tx.bstockAutoConfig.findUnique({ where: { ownerKey: identity.ownerKey } });
    const automation = context.automation;
    if (automation) {
      if (automation.ownerKey !== identity.ownerKey || !config?.enabled
        || config.generation !== automation.generation || !config.expiresAt
        || config.expiresAt <= claimedAt) {
        throw new BstockSubmissionClaimError("自动交易授权已关闭或过期，本轮订单未广播。", "AUTOMATION_AUTHORIZATION_EXPIRED");
      }
      if (!automation.leaseToken || config.leaseToken !== automation.leaseToken
        || !config.leaseUntil || config.leaseUntil <= claimedAt) {
        throw new BstockSubmissionClaimError("自动交易执行权已变化，本轮订单未广播。", "AUTOMATION_LEASE_EXPIRED");
      }
      const trade = await tx.bstockTradeRecord.findUnique({
        where: { intentHash: identity.intentHash }, select: { id: true, side: true }
      });
      const stats = config.stats && typeof config.stats === "object" && !Array.isArray(config.stats) ? config.stats : {};
      if (trade?.side === "buy" && "riskExitOnly" in stats && stats.riskExitOnly === true) {
        throw new BstockSubmissionClaimError("自动交易已进入风险退出阶段，禁止新开仓。", "AUTOMATION_EXIT_ONLY");
      }
      const order = trade && await tx.bstockAutoOrder.findFirst({
        where: {
          id: automation.orderId, ownerKey: identity.ownerKey, generation: automation.generation,
          status: "QUOTED", tradeRecordId: trade.id
        }, select: { id: true }
      });
      if (!order) {
        throw new BstockSubmissionClaimError("自动交易订单与已审阅报价不匹配，订单未广播。", "AUTOMATION_QUOTE_MISMATCH");
      }
      const inFlight = await tx.bstockAutoOrder.findFirst({
        where: { ownerKey: identity.ownerKey, id: { not: automation.orderId }, status: { in: ["SUBMITTING", "PENDING", "UNKNOWN"] } },
        select: { id: true }
      });
      if (inFlight) {
        throw new BstockSubmissionClaimError("该钱包还有未确认的自动订单，本轮订单未广播。", "AUTOMATION_ORDER_IN_FLIGHT");
      }
      // A delayed browser receipt registration may arrive after the bot starts.
      // Recheck at the broadcast boundary, under the same owner lock as receipt
      // registration and reviewed historical-order overrides. Every automatic
      // link is excluded, including this order's quote and legacy cross-owner links.
      const manualBlockers = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT t.id, t.status FROM "bstock_trade_records" t
        WHERE t."ownerKey" = ${identity.ownerKey}
          AND (
            (t."automationIgnoredAt" IS NULL AND t.status NOT IN
              ('INTENT_CREATED', 'FINISHED', 'SUCCESS', 'SUCCEEDED', 'COMPLETED', 'CONFIRMED', 'FILLED',
               'FAILED', 'FAILURE', 'REJECTED', 'CANCELED', 'CANCELLED', 'EXPIRED'))
            OR (t.status = 'INTENT_CREATED' AND t."createdAt" > ${new Date(claimedAt.getTime() - 90_000)})
          )
          AND NOT EXISTS (SELECT 1 FROM "bstock_auto_orders" a WHERE a."tradeRecordId" = t.id)
        LIMIT 1
      `;
      if (manualBlockers.length) {
        throw new BstockSubmissionClaimError("存在未忽略的手动待确认订单或有效报价，本轮自动订单未广播。", "AUTOMATION_MANUAL_ORDER_PENDING");
      }
    } else if (config?.enabled || await tx.bstockAutoOrder.findFirst({
      where: { ownerKey: identity.ownerKey, status: { in: openAutoOrderStatuses } }, select: { id: true }
    })) {
      throw new BstockSubmissionClaimError("该钱包正在执行自动交易，请先停止机器人并等待在途订单完成。", "AUTOMATION_OWNS_WALLET");
    }
    const claimed = await tx.bstockTradeRecord.updateMany({
      where: { ...identity, status: "INTENT_CREATED" },
      data: { status: "SUBMITTING", submittedAt: claimedAt }
    });
    if (claimed.count !== 1) return false;
    if (automation) {
      const updated = await tx.bstockAutoOrder.updateMany({
        where: { id: automation.orderId, ownerKey: identity.ownerKey, generation: automation.generation, status: "QUOTED" },
        data: { status: "SUBMITTING", submittedAt: claimedAt }
      });
      if (updated.count !== 1) {
        throw new BstockSubmissionClaimError("自动交易状态已变化，订单未广播。", "AUTOMATION_ORDER_CHANGED");
      }
    }
    return true;
  }, { maxWait: 5_000, timeout: 10_000 });
}
