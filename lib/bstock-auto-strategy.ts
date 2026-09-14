import { z } from "zod";

export const AUTO_STRATEGY_VERSION = "bstock-auto-20260908-v1";
export const AUTO_STRATEGY_SOURCES = [
  {
    strategy: "trend",
    title: "AQR — Time Series Momentum",
    url: "https://www.aqr.com/Insights/Research/Journal-Article/Time-Series-Momentum",
    applicability: "Momentum concept only. The paper studies 12-month excess returns; this hourly EMA/breakout rule is not a replication or a validated high-win-rate strategy."
  },
  {
    strategy: "mean_reversion",
    title: "Fidelity — Bollinger Bands",
    url: "https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/bollinger-bands",
    applicability: "20-period, two-standard-deviation bands with a separate bounce/trend filter. Indicator guidance is not evidence of profitability for bStock."
  }
] as const;

// Baseline allowance for two 0.5% slippage legs plus fees; live quotes must also
// pass assessAutoQuoteFriction. This is a cost gate, not a return forecast.
export const AUTO_MIN_ROUND_TRIP_BUFFER_PCT = 1.5;

const boundedNumber = (min: number, max: number) => z.number().finite().min(min).max(max);
export const autoSettingsSchema = z.object({
  strategy: z.enum(["adaptive", "trend", "mean_reversion"]).default("adaptive"),
  budgetUsd: boundedNumber(20, 2000).default(100),
  orderUsd: boundedNumber(5, 500).default(20),
  maxPositions: boundedNumber(1, 5).int().default(3),
  stopLossPct: boundedNumber(1, 10).default(3),
  takeProfitPct: boundedNumber(2, 30).default(6),
  maxDrawdownPct: boundedNumber(2, 25).default(10),
  dailyLossPct: boundedNumber(1, 15).default(5),
  intervalSeconds: boundedNumber(60, 900).int().default(60)
}).strict().superRefine((settings, context) => {
  if (settings.orderUsd > settings.budgetUsd * 0.25) {
    context.addIssue({ code: "custom", path: ["orderUsd"], message: "单笔金额不得超过自动交易预算的 25%。" });
  }
  if (settings.takeProfitPct <= AUTO_MIN_ROUND_TRIP_BUFFER_PCT) {
    context.addIssue({ code: "custom", path: ["takeProfitPct"], message: "止盈幅度必须覆盖往返交易成本缓冲。" });
  }
  if (settings.takeProfitPct < settings.stopLossPct * 1.5) {
    context.addIssue({ code: "custom", path: ["takeProfitPct"], message: "止盈幅度不得低于止损幅度的 1.5 倍。" });
  }
});

export type AutoSettings = z.infer<typeof autoSettingsSchema>;
export type AutoStrategy = "trend" | "mean_reversion";
export type AutoCandle = {
  openTime?: string;
  closeTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};
export type AutoIndicators = {
  closedBars: number;
  close: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  slopePct: number | null;
  midBand: number | null;
  lowerBand: number | null;
  upperBand: number | null;
  breakoutPrice: number | null;
  expectedUpsidePct: number | null;
};
export type AutoSignal = {
  action: "buy" | "hold";
  strategy: AutoStrategy;
  /** A deterministic candidate ranking; never a probability or expected win rate. */
  score: number;
  reason: string;
  barTime: string | null;
  indicators: AutoIndicators;
};

const HOUR_MS = 3_600_000;
const MAX_BAR_AGE_MS = 75 * 60_000;
const MIN_CLOSED_BARS = 35;
const WINDOW_BARS = 48;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const isoTime = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const pct = (value: number, base: number) => (value / base - 1) * 100;

function emaSeries(values: number[], period: number) {
  const output: number[] = [];
  const factor = 2 / (period + 1);
  for (const value of values) output.push(output.length ? value * factor + output[output.length - 1] * (1 - factor) : value);
  return output;
}

function bands(values: number[]) {
  const mean = average(values);
  const deviation = Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
  return { mean, lower: mean - 2 * deviation, upper: mean + 2 * deviation };
}

function emptyIndicators(): AutoIndicators {
  return { closedBars: 0, close: null, emaFast: null, emaSlow: null, slopePct: null, midBand: null, lowerBand: null, upperBand: null, breakoutPrice: null, expectedUpsidePct: null };
}

/** Uses already closed hourly candles only; it never sorts, fills gaps or reads a forming candle's prices. */
export function selectAutoSignal(input: {
  points: readonly AutoCandle[];
  now: number | string | Date;
  strategy: AutoSettings["strategy"];
  stopLossPct: number;
  takeProfitPct: number;
}): AutoSignal {
  const fallbackStrategy: AutoStrategy = input.strategy === "mean_reversion" ? "mean_reversion" : "trend";
  const hold = (reason: string): AutoSignal => ({ action: "hold", strategy: fallbackStrategy, score: 0, reason, barTime: null, indicators: emptyIndicators() });
  const now = input.now instanceof Date ? input.now.getTime() : typeof input.now === "number" ? input.now : isoTime(input.now);
  if (!Number.isFinite(now) || !["adaptive", "trend", "mean_reversion"].includes(input.strategy) ||
      !positive(input.stopLossPct) || input.stopLossPct < 1 || input.stopLossPct > 10 || !positive(input.takeProfitPct) ||
      input.takeProfitPct < 2 || input.takeProfitPct > 30) return hold("INVALID_SETTINGS");
  if (!Array.isArray(input.points) || input.points.length > 1000) return hold("INVALID_CANDLES");

  const closed: AutoCandle[] = [];
  let previousTime = -Infinity;
  for (const point of input.points) {
    const closeTime = isoTime(point?.closeTime);
    if (!Number.isFinite(closeTime) || closeTime <= previousTime) return hold("INVALID_CANDLE_ORDER");
    previousTime = closeTime;
    if (closeTime > now) continue;
    if (![point.open, point.high, point.low, point.close].every(positive) ||
        point.high < Math.max(point.open, point.close, point.low) || point.low > Math.min(point.open, point.close) ||
        (point.volume !== undefined && (!Number.isFinite(point.volume) || point.volume < 0))) return hold("INVALID_CANDLE_PRICES");
    if (point.openTime !== undefined) {
      const duration = closeTime - isoTime(point.openTime);
      if (!Number.isFinite(duration) || Math.abs(duration - HOUR_MS) > 1) return hold("NON_HOURLY_CANDLES");
    }
    const prior = closed[closed.length - 1];
    if (prior && Math.abs(closeTime - isoTime(prior.closeTime) - HOUR_MS) > 1) return hold("NON_CONTIGUOUS_CANDLES");
    closed.push(point);
  }
  if (closed.length < MIN_CLOSED_BARS) return hold("INSUFFICIENT_CLOSED_CANDLES");
  const candles = closed.slice(-WINDOW_BARS);
  const latest = candles[candles.length - 1];
  if (now - isoTime(latest.closeTime) > MAX_BAR_AGE_MS) return hold("STALE_CANDLES");

  const closes = candles.map((point) => point.close);
  const fast = emaSeries(closes, 10);
  const slow = emaSeries(closes, 30);
  const index = closes.length - 1;
  const slopePct = pct(slow[index], slow[index - 3]);
  const currentBands = bands(closes.slice(-20));
  const previousBands = bands(closes.slice(-21, -1));
  const breakoutPrice = Math.max(...candles.slice(-21, -1).map((point) => point.high));
  const strategy: AutoStrategy = input.strategy === "adaptive" ? (Math.abs(slopePct) <= 0.25 ? "mean_reversion" : "trend") : input.strategy;
  const expectedUpsidePct = strategy === "mean_reversion" ? Math.max(0, pct(currentBands.mean, latest.close)) : input.takeProfitPct;
  const indicators: AutoIndicators = {
    closedBars: candles.length, close: latest.close, emaFast: fast[index], emaSlow: slow[index], slopePct,
    midBand: currentBands.mean, lowerBand: currentBands.lower, upperBand: currentBands.upper, breakoutPrice, expectedUpsidePct
  };
  if (Object.values(indicators).some((value) => value !== null && !Number.isFinite(value))) return hold("INVALID_INDICATORS");

  let qualified = false;
  let reason: string;
  let score = 0;
  if (strategy === "trend") {
    qualified = slopePct > 0.05 && fast[index] > slow[index] && latest.close > breakoutPrice &&
      latest.close > latest.open && pct(latest.close, breakoutPrice) <= input.stopLossPct;
    reason = qualified ? "TREND_CONFIRMED_BREAKOUT" : "WAIT_TREND_CONFIRMATION";
    if (qualified) score = Math.min(95, 65 + Math.min(15, slopePct * 12) + Math.min(15, pct(latest.close, breakoutPrice) * 5));
  } else {
    const previous = candles[index - 1];
    const bounce = previous.close <= previousBands.lower && latest.close > currentBands.lower &&
      latest.close > previous.high && latest.close > latest.open && latest.close < currentBands.mean;
    qualified = Math.abs(slopePct) <= 0.25 && bounce && expectedUpsidePct > AUTO_MIN_ROUND_TRIP_BUFFER_PCT;
    reason = qualified ? "RANGE_CONFIRMED_LOWER_BAND_RECOVERY" : expectedUpsidePct <= AUTO_MIN_ROUND_TRIP_BUFFER_PCT ? "RANGE_TARGET_BELOW_COST_BUFFER" : "WAIT_RANGE_CONFIRMATION";
    if (qualified) score = Math.min(95, 65 + Math.min(20, expectedUpsidePct * 3) + (0.25 - Math.abs(slopePct)) * 40);
  }
  return { action: qualified ? "buy" : "hold", strategy, score: Math.round(score * 100) / 100, reason, barTime: latest.closeTime, indicators };
}

/** Price-triggered exits do not increase a losing position. Quotes still determine actual realized return. */
export function selectAutoExit(input: {
  price: number;
  entryPrice: number;
  highPrice: number;
  stopLossPct: number;
  takeProfitPct: number;
  strategy: AutoStrategy;
  midBand?: number | null;
}): { exit: boolean; reason: string; returnPct: number | null } {
  if (![input.price, input.entryPrice, input.highPrice, input.stopLossPct, input.takeProfitPct].every(positive) ||
      input.stopLossPct < 1 || input.stopLossPct > 10 || input.takeProfitPct > 30 || input.takeProfitPct < 2 ||
      !["trend", "mean_reversion"].includes(input.strategy)) return { exit: false, reason: "INVALID_EXIT_INPUT", returnPct: null };
  const returnPct = pct(input.price, input.entryPrice);
  if (!Number.isFinite(returnPct)) return { exit: false, reason: "INVALID_EXIT_INPUT", returnPct: null };
  if (returnPct <= -input.stopLossPct) return { exit: true, reason: "STOP_LOSS", returnPct };
  if (returnPct >= input.takeProfitPct) return { exit: true, reason: "TAKE_PROFIT", returnPct };
  const highPrice = Math.max(input.highPrice, input.price, input.entryPrice);
  const peakReturnPct = pct(highPrice, input.entryPrice);
  if (peakReturnPct >= Math.max(input.stopLossPct, input.takeProfitPct / 2) && pct(input.price, highPrice) <= -input.stopLossPct) {
    return { exit: true, reason: "TRAILING_STOP", returnPct };
  }
  if (input.strategy === "mean_reversion" && positive(input.midBand) && input.price >= input.midBand && returnPct > AUTO_MIN_ROUND_TRIP_BUFFER_PCT) {
    return { exit: true, reason: "MEAN_REVERSION_TARGET", returnPct };
  }
  return { exit: false, reason: "HOLD_POSITION", returnPct };
}

/** estimatedFeeUsd must include anticipated round-trip network/venue fees. */
export function assessAutoQuoteFriction(input: {
  notionalUsd: number;
  expectedOutput: number;
  quotedOutput: number;
  estimatedFeeUsd: number;
  takeProfitPct: number;
  maxSlippagePct?: number;
}): { allowed: boolean; reason: string; totalCostPct: number | null } {
  const maxSlippagePct = input.maxSlippagePct ?? 0.5;
  if (![input.notionalUsd, input.expectedOutput, input.quotedOutput, input.takeProfitPct].every(positive) ||
      !Number.isFinite(input.estimatedFeeUsd) || input.estimatedFeeUsd < 0 || !positive(maxSlippagePct) || maxSlippagePct > 0.5) {
    return { allowed: false, reason: "INVALID_QUOTE_COSTS", totalCostPct: null };
  }
  const deviationPct = pct(input.quotedOutput, input.expectedOutput);
  if (!Number.isFinite(deviationPct)) return { allowed: false, reason: "INVALID_QUOTE_COSTS", totalCostPct: null };
  const priceImpactPct = Math.max(0, -deviationPct);
  const totalCostPct = priceImpactPct * 2 + input.estimatedFeeUsd / input.notionalUsd * 100 + 0.2;
  if (!Number.isFinite(totalCostPct)) return { allowed: false, reason: "INVALID_QUOTE_COSTS", totalCostPct: null };
  if (Math.abs(deviationPct) > maxSlippagePct + 1e-9) return { allowed: false, reason: "QUOTE_PRICE_DEVIATION", totalCostPct };
  if (totalCostPct >= input.takeProfitPct / 2) return { allowed: false, reason: "QUOTE_COST_EXCEEDS_TARGET_BUFFER", totalCostPct };
  return { allowed: true, reason: "QUOTE_COST_ACCEPTED", totalCostPct };
}
