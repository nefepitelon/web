import assert from "node:assert/strict";
import test from "node:test";
import { buildMacdChartSeries, calculateMacd, classifyMacdCross, findLatestMacdCross } from "../lib/tidesight/macd";

test("MACD uses the requested cross classifications", () => {
  assert.equal(classifyMacdCross(
    { index: 1, dif: -2, dea: -1, histogram: -2 },
    { index: 2, dif: -0.5, dea: -0.8, histogram: 0.6 },
  ), "REBIRTH_GOLDEN_CROSS");
  assert.equal(classifyMacdCross(
    { index: 1, dif: 1, dea: 2, histogram: -2 },
    { index: 2, dif: 2.2, dea: 2, histogram: 0.4 },
  ), "GOLDEN_CROSS");
  assert.equal(classifyMacdCross(
    { index: 1, dif: 3, dea: 2, histogram: 2 },
    { index: 2, dif: 1.5, dea: 2, histogram: -1 },
  ), "DEATH_CROSS");
});

test("MACD 12/26/9 produces finite points and locates the newest cross", () => {
  const closes = Array.from({ length: 160 }, (_, index) => 100 + Math.sin(index / 5) * 8 + index * 0.08);
  const points = calculateMacd(closes);
  assert.ok(points.length > 100);
  assert.ok(points.every((point) => [point.dif, point.dea, point.histogram].every(Number.isFinite)));
  const cross = findLatestMacdCross(points);
  assert.ok(cross);
  assert.ok(["GOLDEN_CROSS", "REBIRTH_GOLDEN_CROSS", "DEATH_CROSS"].includes(cross.signal));
});

test("MACD rejects insufficient or invalid price history", () => {
  assert.deepEqual(calculateMacd([1, 2, 3]), []);
  assert.deepEqual(calculateMacd(Array(40).fill(0)), []);
});

test("MACD chart series aligns closed OHLC candles with finite indicator points", () => {
  const candles = Array.from({ length: 180 }, (_, index) => {
    const close = 100 + Math.sin(index / 6) * 9 + index * 0.12;
    const open = close + Math.cos(index / 4) * 1.2;
    return {
      openTime: 1_700_000_000_000 + index * 60_000,
      closeTime: 1_700_000_059_999 + index * 60_000,
      open,
      high: Math.max(open, close) + 2,
      low: Math.min(open, close) - 2,
      close,
      volume: 1000 + index * 3,
    };
  });
  const series = buildMacdChartSeries(candles, 120);
  assert.equal(series.length, 120);
  assert.ok(series.every((point) => point.closeTime >= point.openTime));
  assert.ok(series.every((point) => [point.dif, point.dea, point.histogram].every(Number.isFinite)));
  assert.ok(series.some((point) => point.signal !== "NONE"));
});

test("MACD chart series supports shorter monthly histories after indicator warmup", () => {
  const candles = Array.from({ length: 71 }, (_, index) => {
    const close = 80 + (index * 1.4) + (Math.sin(index / 3) * 9);
    return {
      openTime: 1_598_918_400_000 + (index * 2_592_000_000),
      closeTime: 1_598_918_400_000 + ((index + 1) * 2_592_000_000) - 1,
      open: close - 1.2,
      high: close + 2.5,
      low: close - 2.8,
      close,
      volume: 50_000 + (index * 750),
    };
  });

  const series = buildMacdChartSeries(candles, 120);
  assert.equal(series.length, 38);
  assert.ok(series.every((point) => Number.isFinite(point.dif) && Number.isFinite(point.dea)));
});
