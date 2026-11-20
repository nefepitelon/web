import "server-only";
import { loadAutomationAccount } from "@/lib/alpha-execution/automation-account";
import { prisma } from "@/lib/prisma";
import tradingPolicy from "./trading-policy.js";

export async function assertStmCexSignal(userId: string, input: { symbol: string; strategy: string; side: string }) {
  const { getStmDashboard } = await import("./service");
  const dashboard = await getStmDashboard(userId);
  const permission = tradingPolicy.evaluateCexSignalPermission(dashboard, input, Date.now());
  if (!permission.passed) throw new Error(`STM 实盘策略检查未通过：${permission.reasons.join("；")}`);
}

/** Account-wide signed exchange reads, shared with Alpha's independently
 * tested cash-flow-neutral daily baseline. No local zero-PnL substitution. */
export async function assertStmCexDailyRisk(userId: string, input: { market: string; planId?: string; referencePrice?: number }) {
  if (input.market.toLowerCase() !== "futures") {
    throw new Error("STM 现货实盘开仓尚缺完整历史成本与划转核验，日亏损额度无法验证。请使用现货模拟，或已核验的 USDT 合约实盘。");
  }
  const { account, execution } = await loadAutomationAccount(userId, { persistBaseline: true, excludePlanId: input.planId });
  const riskAccount = { ...account, openPositions: [...account.openPositions], pendingEntries: [...account.pendingEntries] };
  const risk = tradingPolicy.evaluateCexAccountRisk(riskAccount, execution);
  if (!risk.passed) throw new Error(risk.reasons.join("；"));
  if (input.planId) {
    const plan = await prisma.alphaExecutionPlan.findFirst({ where: { id: input.planId, userId, environment: "LIVE", market: "FUTURES", intent: { source: { startsWith: "stm-hunt:" } } }, include: { intent: true } });
    if (!plan) throw new Error("无法核验 STM 实盘执行计划");
    await assertStmCexSignal(userId, { symbol: plan.intent.symbol, strategy: plan.intent.source.slice("stm-hunt:".length), side: plan.intent.side });
    const quantity = Number((plan.mainOrder as { quantity?: number }).quantity);
    const price = input.referencePrice ?? plan.intent.entryPrice;
    if (!tradingPolicy.refreshedProtectionValid({ side: plan.intent.side, referencePrice: price, stopLoss: plan.intent.stopLoss, takeProfit: plan.intent.takeProfit })) {
      throw new Error("实时价已触及或越过原计划的止损/止盈边界，禁止追认旧计划；请重新核验并生成交易计划。");
    }
    const notional = quantity * price;
    const proposed = tradingPolicy.evaluateCexAccountRisk(riskAccount, execution, { symbol: plan.intent.symbol, notional, stopRisk: quantity * Math.abs(price - plan.intent.stopLoss), leverage: plan.intent.leverage });
    if (!proposed.passed) throw new Error(proposed.reasons.join("；"));
  }
  return { dailyPnl: account.dailyPnl, dayStartEquity: account.dayStartEquity, equity: account.equity, observedAt: account.observedAt, scope: "BINANCE_USDT_FUTURES_ACCOUNT", account: riskAccount, policy: execution };
}
