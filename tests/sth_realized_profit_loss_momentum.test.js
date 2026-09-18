const test = require("node:test");
const assert = require("node:assert/strict");

const loadModule = () => import("../api/sth-realized-profit-loss-momentum.js");

function rawRows(length = 520) {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length }, (_, index) => ({
    date: new Date(start + index * 86400000).toISOString().slice(0, 10),
    timestamp: start + index * 86400000,
    price: 30000 + index * 50,
    profit: index >= length - 7 ? 4 : 1,
    loss: 1,
    source: "test"
  }));
}

test("reference recovery spans preserve the supplied 113/139/103-day model", async () => {
  const { REFERENCE_CYCLES, REFERENCE_AVERAGE_DAYS, REFERENCE_CURRENT_START_DATE } = await loadModule();
  assert.deepEqual(REFERENCE_CYCLES.map((row) => row.durationDays), [113, 139, 103]);
  assert.equal(REFERENCE_AVERAGE_DAYS, 118);
  assert.equal(REFERENCE_CURRENT_START_DATE, "2026-08-20");
});

test("public momentum follows SMA7(STH P/L) divided by SMA365(STH P/L)", async () => {
  const { buildSthMomentumSeries } = await loadModule();
  const series = buildSthMomentumSeries(rawRows());
  const latest = series.at(-1);
  const expectedAnnual = (358 + 7 * 4) / 365;
  assert.equal(latest.ratio7, 4);
  assert.ok(Math.abs(latest.ratio365 - expectedAnnual) < 1e-12);
  assert.ok(Math.abs(latest.momentum - 4 / expectedAnnual) < 1e-12);
});

test("recent no-token observations override duplicate full-history dates", async () => {
  const { mergeSourceRows } = await loadModule();
  const base = [{ date: "2026-09-16", timestamp: Date.UTC(2026, 8, 16), price: 70000, profit: 1, loss: 2, source: "full" }];
  const recent = [{ date: "2026-09-16", timestamp: Date.UTC(2026, 8, 16), price: 76000, profit: 5, loss: 2, source: "recent" }];
  const merged = mergeSourceRows(base, recent);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "recent");
  assert.equal(merged[0].price, 76000);
});

test("snapshot and forward scenario keep the 27/118-day reference separate", async () => {
  const { buildSthMomentumSeries, calculatePublicPeaks, calculateSthMomentumSnapshot, projectMomentumScenario } = await loadModule();
  const rows = rawRows(624);
  const series = buildSthMomentumSeries(rows);
  const publicPeaks = calculatePublicPeaks(series, [{ cycle: "test", start: series[0].date, end: series.at(-1).date }]);
  const projection = projectMomentumScenario(series, publicPeaks);
  const snapshot = calculateSthMomentumSnapshot(series, publicPeaks, projection, { value: 77000, asOf: "2026-09-17T00:00:00.000Z" });
  assert.equal(snapshot.referenceElapsedDays, 27);
  assert.equal(snapshot.averageCycleDays, 118);
  assert.equal(snapshot.remainingDays, 91);
  assert.equal(snapshot.targetDate, "2026-12-16");
  assert.equal(projection.length, 91);
  assert.equal(projection.at(-1).date, "2026-12-16");
  assert.equal(snapshot.price, 77000);
});
