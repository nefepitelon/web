const test = require("node:test");
const assert = require("node:assert/strict");
require("tsx/cjs");
const {
  autoSettingsSchema, selectAutoSignal, selectAutoExit, assessAutoQuoteFriction
} = require("../lib/bstock-auto-strategy.ts");

const now = Date.parse("2026-09-08T12:00:00.000Z");
function candles(values) {
  return values.map((close, index) => ({
    openTime: new Date(now - (values.length - index) * 3_600_000 + 1).toISOString(),
    closeTime: new Date(now - (values.length - index - 1) * 3_600_000).toISOString(),
    open: close - 0.1, high: close + 0.1, low: close - 0.2, close, volume: 100
  }));
}
const trend = () => candles(Array.from({ length: 48 }, (_, index) => 100 + index * 0.3));
const range = () => candles([...Array.from({ length: 40 }, (_, index) => index % 2 ? 102 : 98), 101, 102, 104, 104, 104, 108, 94, 98]);
function signal(points = trend(), settings = {}) {
  return selectAutoSignal({ points, now, strategy: "adaptive", stopLossPct: 3, takeProfitPct: 6, ...settings });
}

test("auto settings default to a bounded budget and reject malformed or martingale settings", () => {
  const settings = autoSettingsSchema.parse({});
  assert.equal(settings.orderUsd, 20);
  assert.equal(settings.budgetUsd, 100);
  assert.equal(settings.strategy, "adaptive");
  for (const invalid of [
    { orderUsd: 26 }, { budgetUsd: 10 }, { orderUsd: 4 }, { maxPositions: 6 },
    { maxPositions: 1.5 }, { intervalSeconds: 59 }, { intervalSeconds: 61.5 },
    { stopLossPct: 0 }, { takeProfitPct: 1.5 }, { stopLossPct: 5, takeProfitPct: 7.4 }, { dailyLossPct: 16 },
    { maxDrawdownPct: 26 }, { strategy: "martingale" }, { multiplier: 2 },
    { budgetUsd: "100" }, { budgetUsd: NaN }, { stopLossPct: Infinity }, { orderUsd: -Infinity }
  ]) assert.equal(autoSettingsSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
  assert.equal(autoSettingsSchema.safeParse({ budgetUsd: 20, orderUsd: 5 }).success, true);
  assert.equal(autoSettingsSchema.safeParse({ budgetUsd: 2000, orderUsd: 500 }).success, true);
  assert.equal(autoSettingsSchema.safeParse({ stopLossPct: 5, takeProfitPct: 7.5 }).success, true);
});

test("trend buys only an upward EMA regime with a closed prior-window breakout", () => {
  const result = signal();
  assert.equal(result.action, "buy");
  assert.equal(result.strategy, "trend");
  assert.equal(result.reason, "TREND_CONFIRMED_BREAKOUT");
  assert.equal(result.indicators.closedBars, 48);
  assert.ok(result.indicators.emaFast > result.indicators.emaSlow);
  assert.ok(result.indicators.close > result.indicators.breakoutPrice);
  assert.ok(result.score > 0 && result.score < 100);
  const noBreakout = trend();
  noBreakout[45].high = 116;
  assert.equal(signal(noBreakout).action, "hold");
  assert.equal(signal(candles(Array.from({ length: 48 }, (_, index) => 120 - index * 0.3))).action, "hold");
  const lateChase = trend();
  Object.assign(lateChase[47], { open: 113, high: 125, low: 112, close: 124 });
  assert.equal(signal(lateChase).action, "hold");
});

test("range entry requires lower-band recovery, a confirmed bounce, and cost headroom", () => {
  const result = signal(range());
  assert.equal(result.action, "buy");
  assert.equal(result.strategy, "mean_reversion");
  assert.equal(result.reason, "RANGE_CONFIRMED_LOWER_BAND_RECOVERY");
  assert.ok(Math.abs(result.indicators.slopePct) <= 0.25);
  assert.ok(result.indicators.close < result.indicators.midBand);
  const noBounce = range();
  noBounce[46].high = 99;
  assert.equal(signal(noBounce).action, "hold");
  assert.equal(signal(candles(Array(48).fill(100)), { strategy: "mean_reversion" }).reason, "RANGE_TARGET_BELOW_COST_BUFFER");
});

test("forming candles cannot change signals or indicator values", () => {
  const closed = trend();
  const expected = signal(closed);
  const future = {
    openTime: new Date(now + 1).toISOString(), closeTime: new Date(now + 3_600_000).toISOString(),
    open: 100, high: 9_000_000, low: 0.0001, close: 4_000_000, volume: 1
  };
  assert.deepEqual(signal([...closed, future]), expected);
  assert.deepEqual(signal([...closed, { ...future, close: NaN, high: Infinity }]), expected);
  const beforeClose = signal(closed, { now: now - 1 });
  assert.equal(beforeClose.barTime, closed[46].closeTime);
  assert.equal(beforeClose.indicators.closedBars, 47);
});

test("missing, malformed, duplicated, unordered, non-hourly and stale data cannot produce entries", () => {
  assert.equal(signal(trend().slice(14)).reason, "INSUFFICIENT_CLOSED_CANDLES");
  assert.equal(signal(trend().slice(13)).indicators.closedBars, 35);
  const gap = trend(); gap.splice(30, 1);
  assert.equal(signal(gap).reason, "NON_CONTIGUOUS_CANDLES");
  const duplicate = trend(); duplicate.splice(30, 0, duplicate[30]);
  assert.equal(signal(duplicate).reason, "INVALID_CANDLE_ORDER");
  assert.equal(signal(trend().reverse()).reason, "INVALID_CANDLE_ORDER");
  const nonHourly = trend(); nonHourly[47].openTime = new Date(now - 14_400_000).toISOString();
  assert.equal(signal(nonHourly).reason, "NON_HOURLY_CANDLES");
  for (const mutation of [{ close: NaN }, { close: Infinity }, { low: -1 }, { high: 1 }, { volume: -1 }, { open: "100" }, { closeTime: "yesterday" }]) {
    const points = trend(); Object.assign(points[40], mutation);
    assert.equal(signal(points).action, "hold");
    assert.equal(signal(points).score, 0);
  }
  assert.equal(signal(trend(), { now: now + 76 * 60_000 }).reason, "STALE_CANDLES");
  assert.equal(signal(trend(), { now: NaN }).reason, "INVALID_SETTINGS");
  assert.equal(signal(trend(), { stopLossPct: 0.1 }).reason, "INVALID_SETTINGS");
});

test("exit rules cover stops, profits, trailing stops, range targets and invalid prices", () => {
  const input = { price: 100, entryPrice: 100, highPrice: 100, stopLossPct: 3, takeProfitPct: 6, strategy: "trend" };
  const exit = (overrides) => selectAutoExit({ ...input, ...overrides });
  assert.equal(exit({ price: 96.9 }).reason, "STOP_LOSS");
  assert.equal(exit({ price: 106.1, highPrice: 107 }).reason, "TAKE_PROFIT");
  assert.equal(exit({ price: 100, highPrice: 104 }).reason, "TRAILING_STOP");
  assert.equal(exit({ price: 100, highPrice: 102 }).reason, "HOLD_POSITION");
  assert.equal(exit({ price: 102, highPrice: 102, strategy: "mean_reversion", midBand: 101.9 }).reason, "MEAN_REVERSION_TARGET");
  assert.equal(exit({ price: 101, highPrice: 101, strategy: "mean_reversion", midBand: 100.9 }).exit, false);
  assert.equal(exit({ price: 98, strategy: "mean_reversion", midBand: 97 }).exit, false);
  for (const price of [0, -1, NaN, Infinity]) assert.deepEqual(exit({ price }), { exit: false, reason: "INVALID_EXIT_INPUT", returnPct: null });
  assert.equal(exit({ price: 1e308, entryPrice: 1e-308 }).exit, false);
});

test("quote cost gate blocks bad denominations, adverse prices and uneconomic small orders", () => {
  const base = { notionalUsd: 20, expectedOutput: 0.2, quotedOutput: 0.1996, estimatedFeeUsd: 0.05, takeProfitPct: 6 };
  assert.equal(assessAutoQuoteFriction(base).allowed, true);
  assert.equal(assessAutoQuoteFriction({ ...base, quotedOutput: 0.19 }).reason, "QUOTE_PRICE_DEVIATION");
  assert.equal(assessAutoQuoteFriction({ ...base, quotedOutput: 20 }).reason, "QUOTE_PRICE_DEVIATION");
  assert.equal(assessAutoQuoteFriction({ ...base, estimatedFeeUsd: 1 }).reason, "QUOTE_COST_EXCEEDS_TARGET_BUFFER");
  assert.equal(assessAutoQuoteFriction({ ...base, estimatedFeeUsd: NaN }).allowed, false);
  assert.equal(assessAutoQuoteFriction({ ...base, expectedOutput: 0 }).allowed, false);
  assert.equal(assessAutoQuoteFriction({ ...base, maxSlippagePct: 3 }).allowed, false);
  assert.equal(assessAutoQuoteFriction({ ...base, expectedOutput: 1e-308, quotedOutput: 1e308 }).allowed, false);
});
