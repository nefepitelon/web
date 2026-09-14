import type { LiveIncomeSummary } from "./pnl-summary";

export type AutomationDailyBaseline = { day: string; equity: number; unrealized: number; income: number; observedAt: number };
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
// These are external capital movements, not settled trading results. Unknown settlement
// types (including liquidation adjustments) must not silently disappear from the risk window.
const CAPITAL_TRANSFERS = new Set(["TRANSFER", "INTERNAL_TRANSFER"]);

export function automationDailyRisk(input: {
  now: number; equity: number; unrealized: number; income: LiveIncomeSummary; stored: unknown;
}) {
  const { now, equity, unrealized, income } = input;
  const day = new Date(now).toISOString().slice(0, 10);
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  if (income.status !== "ready" || !income.coverageComplete || !finite(income.amount))
    throw new Error(`当日结算流水尚未完整核验，暂停自动开仓。${income.message}`);
  const periodEnd = Date.parse(income.periodEnd);
  if (Date.parse(income.periodStart) !== dayStart || !Number.isFinite(periodEnd) || periodEnd > now || now - periodEnd > 60_000)
    throw new Error("当日结算流水时间范围不匹配或已过期，请重新读取日内风险基准");
  if (!finite(equity) || equity <= 0 || !finite(unrealized)) throw new Error("账户权益或浮盈数据无效，无法建立日内风险基准");
  if (income.assets.some(asset => asset.asset !== "USDT" && asset.recordCount > 0))
    throw new Error("当日存在非 USDT 交易结算，尚无法完整换算日内盈亏，暂停自动开仓");
  for (const flow of income.nonTradingFlows) {
    if (flow.asset !== "USDT" || !finite(flow.amount) || !flow.incomeTypes.length || flow.incomeTypes.some(type => !CAPITAL_TRANSFERS.has(type)))
      throw new Error("当日存在尚未归类或非 USDT 的账户调整流水，暂停自动开仓并等待核验");
  }
  const stored = input.stored as Partial<AutomationDailyBaseline> | null;
  const reuse = stored?.day === day;
  if (reuse && (!finite(stored.equity) || stored.equity <= 0 || !finite(stored.income) || !finite(stored.unrealized)
    || !finite(stored.observedAt) || stored.observedAt < dayStart || stored.observedAt > now))
    throw new Error("已保存的当日风险基准无效，暂停自动开仓，不能通过重置基准忽略已有亏损");
  const baseline: AutomationDailyBaseline = reuse ? stored as AutomationDailyBaseline
    : { day, equity, unrealized, income: income.amount, observedAt: now };
  // I + delta(U) is cash-flow neutral: transfers are excluded by the income reader.
  // Keep the stricter window and never expand today's loss budget through a deposit.
  // A withdrawal (or equity loss) immediately reduces the available risk capital.
  const dailyPnl = Math.min(income.amount, income.amount - baseline.income + unrealized - baseline.unrealized);
  const dayStartEquity = Math.min(baseline.equity, equity);
  return { baseline, created: !reuse, dailyPnl, dayStartEquity };
}
