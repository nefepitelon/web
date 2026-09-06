const test = require("node:test");
const assert = require("node:assert/strict");

const importModule = () => import("../api/lth-exchange-loss.js");

test("normalizes pair-series timestamps and values", async () => {
  const { normalizePairSeries } = await importModule();
  const rows = normalizePairSeries([[1_700_000_000, "2.5"], [1_700_086_400_000, 3], [null, 4], [5, null]]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].timestamp, 1_700_000_000_000);
  assert.equal(rows[0].value, 2.5);
});

test("builds a transparent 30-day LTH loss-share proxy", async () => {
  const { buildLthExchangeLossProxySeries } = await importModule();
  const make = (value) => Array.from({ length: 40 }, (_, index) => ({ timestamp: 1_700_000_000_000 + index * 86_400_000, value }));
  const price = Array.from({ length: 40 }, (_, index) => ({ timestamp: 1_700_000_000_000 + index * 86_400_000, value: 50_000 + index }));
  const series = buildLthExchangeLossProxySeries(make(3), make(2), make(4), make(1), price);
  assert.equal(series.length, 40);
  assert.equal(series.at(-1).rawPercent, 20);
  assert.equal(series.at(-1).percent, 20);
  assert.equal(series.at(-1).lthLossUsd, 2 * (50_000 + 39));
});

test("calculates snapshot zones and historical peaks", async () => {
  const { calculateHistoricalPeaks, calculateLthExchangeLossSnapshot } = await importModule();
  const series = Array.from({ length: 400 }, (_, index) => ({
    date: new Date(Date.UTC(2024, 0, 1 + index)).toISOString().slice(0, 10),
    price: 40_000 + index,
    percent: index < 399 ? 35 : 52,
    rawPercent: 53,
    lthLossUsd: 2_000,
    lthProfitUsd: 1_000,
    sthLossUsd: 500,
    sthProfitUsd: 500
  }));
  const snapshot = calculateLthExchangeLossSnapshot(series);
  assert.equal(snapshot.zone, "capitulation");
  assert.equal(snapshot.percent, 52);
  assert.equal(snapshot.distanceToCapitulation, 2);
  const peaks = calculateHistoricalPeaks(series, [{ label: "sample", start: "2024-01-01", end: "2025-12-31", referencePercent: 50 }]);
  assert.equal(peaks.length, 1);
  assert.equal(peaks[0].percent, 52);
});
