import "server-only";
import { prisma } from "@/lib/prisma";
import { AlphaBinanceClient } from "./binance";
import { decryptTradingSecret } from "./credentials";
import { fetchLiveIncomeForPeriod } from "./pnl";
import { autoConfig, currentAutoGrant, json, TERMINAL_AUTO_ORDER } from "./automation-data";
import type { AlphaAutomationAccount, AlphaAutomationExposure } from "./automation-strategy";
import { automationDailyRisk } from "./automation-baseline";

/** Exchange exposure includes manual orders; local claims reserve capacity before broadcast. */
export async function loadAutomationAccount(userId: string, options: { persistBaseline?: boolean; excludePlanId?: string; excludeReservationId?: string } = {}) {
  const { credential, execution } = await currentAutoGrant(userId);
  const client = new AlphaBinanceClient({ environment: "live", market: "futures",
    apiKey: decryptTradingSecret(credential.apiKeyEncrypted), apiSecret: decryptTradingSecret(credential.apiSecretEncrypted),
    proxy: credential.proxyEncrypted ? decryptTradingSecret(credential.proxyEncrypted) : null });
  try {
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const [snapshot, income, config, managed, pending, reservations] = await Promise.all([
      client.getAutomationAccountSnapshot(), fetchLiveIncomeForPeriod(userId, "futures", Date.parse(`${day}T00:00:00Z`), now), autoConfig(userId),
      prisma.alphaTradingPosition.findMany({ where: { userId, environment: "LIVE", market: "FUTURES", closedAt: null }, include: { plan: { include: { intent: true } } } }),
      prisma.alphaExecutionPlan.findMany({ where: { userId, environment: "LIVE", market: "FUTURES", id: { not: options.excludePlanId },
        state: { in: ["AWAITING_CONFIRMATION", "PLANNED", "EXECUTING", "SUBMITTED", "PARTIALLY_FILLED", "UNKNOWN"] } }, include: { intent: true, orders: { where: { role: "ENTRY" } } } }),
      prisma.alphaAutomationOrder.findMany({ where: { userId, status: { notIn: TERMINAL_AUTO_ORDER }, planId: null, id: { not: options.excludeReservationId } } }),
    ]);
    const calculateRisk = (stored: unknown) => automationDailyRisk({ now: Date.now(),
      equity: snapshot.equity, unrealized: snapshot.unrealizedPnl, income, stored });
    const { baseline, dailyPnl, dayStartEquity } = options.persistBaseline
      ? await prisma.$transaction(async (tx) => {
        // Startup checks can run concurrently without a worker lease. Re-read under an
        // account-specific lock so a later check never replaces today's winning baseline.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`alpha-auto-baseline:${userId}`}))::text`;
        const current = await tx.alphaAutomationConfig.findUniqueOrThrow({ where: { userId }, select: { dailyBaseline: true } });
        const risk = calculateRisk(current.dailyBaseline);
        if (risk.created) await tx.alphaAutomationConfig.update({ where: { userId }, data: { dailyBaseline: json(risk.baseline) } });
        return risk;
      })
      : calculateRisk(config.dailyBaseline);
    const openPositions: AlphaAutomationExposure[] = snapshot.positions.map((position) => {
      const owned = managed.find((entry) => entry.symbol === position.symbol && entry.side.toLowerCase() === position.side);
      return { symbol: position.symbol, side: position.side.toUpperCase() as "LONG" | "SHORT", notional: position.notional,
        openedAt: owned?.openedAt.getTime() ?? now, automationManaged: Boolean(owned?.plan.intent.source.startsWith("alpha-auto:")) };
    });
    const pendingEntries: AlphaAutomationExposure[] = snapshot.openEntryOrders.map((order) => ({ symbol: order.symbol,
      side: order.side === "buy" ? "LONG" : "SHORT", notional: order.notional, openedAt: now }));
    for (const plan of pending) {
      if (plan.orders.some((order) => order.status === "FILLED" || snapshot.openEntryOrders.some((entry) => entry.clientOrderId === order.clientOrderId))) continue;
      if (plan.expiresAt.getTime() <= now && ["AWAITING_CONFIRMATION", "PLANNED"].includes(plan.state)) continue;
      const main = plan.mainOrder as { quantity?: number };
      pendingEntries.push({ symbol: plan.intent.symbol, side: plan.intent.side as "LONG" | "SHORT",
        notional: Number(main.quantity) * plan.intent.entryPrice, openedAt: plan.createdAt.getTime() });
    }
    for (const reservation of reservations) pendingEntries.push({ symbol: reservation.symbol, side: reservation.side as "LONG" | "SHORT",
      notional: reservation.notional, openedAt: reservation.createdAt.getTime() });
    const account: AlphaAutomationAccount = { observedAt: Date.parse(snapshot.observedAt), equity: snapshot.equity,
      dayStartEquity, dailyPnl, availableMargin: snapshot.availableMargin, openPositions, pendingEntries,
      reconciliationHealthy: execution.reconciliationHealthy && Boolean(execution.lastReconciledAt && now - execution.lastReconciledAt.getTime() < 5 * 60_000),
      killSwitch: execution.killSwitchActive, unresolvedOrders: pending.some((plan) => plan.state === "UNKNOWN" || plan.state === "EXECUTING") };
    return { account, baseline, execution };
  } finally { await client.close(); }
}
