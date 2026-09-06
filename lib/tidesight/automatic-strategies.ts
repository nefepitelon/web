export const TIDESIGHT_AUTO_STRATEGIES = [
  { id: "MACD-D1-DEATH", interval: "1d", timeframe: "日线", signal: "DEATH_CROSS", side: "SHORT", leverage: 5, riskPct: 1.5, notional: 200 },
  { id: "MACD-H1-DEATH", interval: "1h", timeframe: "1 小时", signal: "DEATH_CROSS", side: "SHORT", leverage: 10, riskPct: 1, notional: 500 },
  { id: "MACD-M15-DEATH", interval: "15m", timeframe: "15 分钟", signal: "DEATH_CROSS", side: "SHORT", leverage: 25, riskPct: 0.5, notional: 1000 },
  { id: "MACD-M15-REBIRTH", interval: "15m", timeframe: "15 分钟", signal: "REBIRTH_GOLDEN_CROSS", side: "LONG", leverage: 25, riskPct: 0.5, notional: 1000 },
  { id: "MACD-H1-REBIRTH", interval: "1h", timeframe: "1 小时", signal: "REBIRTH_GOLDEN_CROSS", side: "LONG", leverage: 10, riskPct: 1, notional: 500 },
  { id: "MACD-D1-REBIRTH", interval: "1d", timeframe: "日线", signal: "REBIRTH_GOLDEN_CROSS", side: "LONG", leverage: 5, riskPct: 1.5, notional: 200 },
] as const;

export type TideSightAutoStrategy = (typeof TIDESIGHT_AUTO_STRATEGIES)[number];

export function automaticIntent(rule: TideSightAutoStrategy, symbol: string, entryPrice: number, stopPct: number, targetPct: number) {
  if (![entryPrice, stopPct, targetPct].every(Number.isFinite) || entryPrice <= 0 || stopPct < 0.25 || stopPct >= 80 / rule.leverage || targetPct < stopPct * 1.5 || targetPct > 50) {
    throw new Error("必须先确认有效止损/止盈：止损至少 0.25%，低于保守杠杆保证金缓冲，盈亏比至少 1:1.5");
  }
  const direction = rule.side === "LONG" ? 1 : -1;
  return {
    symbol, side: rule.side, entryPrice,
    stopLoss: entryPrice * (1 - direction * stopPct / 100),
    takeProfit: entryPrice * (1 + direction * targetPct / 100),
    leverage: rule.leverage, riskPct: rule.riskPct, requestedNotional: rule.notional,
    orderType: "MARKET", source: `tidesight-macd:${rule.id}`, tideSightScore: null,
    mode: "live", market: "futures",
  };
}

export function isFreshAutomaticSignal(closedAt: string, startedAt: Date, now = Date.now()) {
  const closed = Date.parse(closedAt);
  return Number.isFinite(closed) && closed > startedAt.getTime() && closed <= now && now - closed <= 120_000;
}
