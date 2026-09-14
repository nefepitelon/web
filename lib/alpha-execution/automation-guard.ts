import type { AlphaAutomationAccount, AlphaAutomationCandidate, AlphaAutomationSettings } from "./automation-strategy";
import { ALPHA_AUTOMATION_STRATEGIES } from "./automation-strategy";

/** Pure final check over the actual approved order, not the scanner's requested size. */
export function validateAutomaticOrder(input: { candidate: AlphaAutomationCandidate; settings: AlphaAutomationSettings;
  account: AlphaAutomationAccount; quantity: number; price: number; leverage: number; now: number }) {
  const { candidate: c, settings: s, account: a, quantity, price, leverage, now } = input;
  const reject = (message: string): never => { throw new Error(message); };
  if (!Array.isArray(c.matchedStrategies) || !c.matchedStrategies.length
    || new Set(c.matchedStrategies).size !== c.matchedStrategies.length
    || c.matchedStrategies.some(strategy => !ALPHA_AUTOMATION_STRATEGIES.includes(strategy) || !s.selectedStrategies.includes(strategy)))
    reject("候选策略不在当前已保存的执行范围内");
  if (![now, a.observedAt, c.expiresAt, c.evidenceExpiresAt].every(Number.isFinite)) reject("候选或账户时间无效");
  if (![quantity, price, a.equity, a.availableMargin, a.dayStartEquity, a.dailyPnl].every(Number.isFinite) || quantity <= 0 || price <= 0 || a.equity <= 0 || a.dayStartEquity <= 0)
    reject("最终下单校验缺少有效数量、价格或账户数据");
  if (a.killSwitch || !a.reconciliationHealthy || a.unresolvedOrders || now - a.observedAt > 30_000 || a.observedAt > now + 5000)
    reject("账户状态不健康、存在未决订单或账户快照过期");
  if (now >= c.expiresAt || now >= c.evidenceExpiresAt || quantity > c.quantity + 1e-10 || leverage > s.leverage || leverage !== c.leverage)
    reject("候选已过期或审批后的数量、杠杆超出已授权候选");
  if (!Number.isFinite(c.maxEntryDriftPct) || c.maxEntryDriftPct < 0 || c.maxEntryDriftPct > s.maxSlippagePct)
    reject("候选缺少有效的执行价格窗口，请等待下一轮筛选");
  if (Math.abs(price / c.entryPrice - 1) * 100 > c.maxEntryDriftPct + 1e-10)
    reject("价格偏移超过候选执行窗口，请等待下一轮");
  if ((c.side === "LONG" && !(c.stopLoss < price && price < c.takeProfit)) || (c.side === "SHORT" && !(c.takeProfit < price && price < c.stopLoss)))
    reject("最新价格不再位于已审批的止损与止盈之间");
  const stopDistancePct = Math.abs(price - c.stopLoss) / price * 100;
  if (stopDistancePct < s.minStopLossPct - 1e-8 || stopDistancePct > s.maxStopLossPct + 1e-8) reject("最新价格下止损距离超出配置范围");
  const exposure = [...a.openPositions, ...a.pendingEntries];
  if (exposure.some((entry) => entry.symbol === c.symbol)) reject("账户已持有或挂单同一标的，禁止重复及反向自成交");
  if (exposure.length >= s.maxPositions) reject("持仓与开仓预留总笔数已达上限");
  const notional = quantity * price;
  const openNotional = exposure.reduce((sum, entry) => sum + entry.notional, 0);
  if (!Number.isFinite(openNotional) || notional > Math.min(s.orderNotional, s.maxOrderNotional) + 1e-7
      || openNotional + notional > Math.min(s.maxPortfolioNotional, a.equity * s.maxPortfolioEquityPct / 100) + 1e-7)
    reject("最终订单或账户组合名义金额超限");
  const candidateCostRate = (c.estimatedLossWithCosts - c.quantity * Math.abs(c.entryPrice - c.stopLoss)) / c.notional;
  if (!Number.isFinite(candidateCostRate) || candidateCostRate < 0.0012 - 1e-9) reject("候选缺少有效双边成本预留");
  const cost = notional * candidateCostRate;
  const stopRisk = quantity * Math.abs(price - c.stopLoss) + cost;
  const netReward = quantity * Math.abs(c.takeProfit - price) - cost;
  if (stopRisk > a.equity * s.riskPerTradePct / 100 + 1e-7 || netReward / stopRisk < s.minRiskRewardRatio - 1e-8)
    reject("最新价格下的成本后风险预算或盈亏比不达标");
  if (notional / leverage + cost > a.availableMargin) reject("可用保证金不足以覆盖订单与成本预留");
  if (a.dailyPnl <= -a.dayStartEquity * s.dailyLossLimitPct / 100) reject("日内亏损限制已触发");
  return { notional, stopRisk };
}
