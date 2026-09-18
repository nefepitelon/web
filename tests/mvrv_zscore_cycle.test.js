const test = require("node:test");
const assert = require("node:assert/strict");

const loadModule = () => import("../api/mvrv-zscore-cycle.js");

function marketRows(length = 90, start = "2026-07-01") {
  const startTime = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length }, (_, index) => {
    const marketCap = 100 + index * 2 + Math.sin(index / 4) * 3;
    const mvrv = index < length - 30 ? 1.05 : 1.35 + index / 300;
    return {
      date: new Date(startTime + index * 86400000).toISOString().slice(0, 10),
      timestamp: startTime + index * 86400000,
      price: 30000 + index * 200,
      marketCap,
      mvrv,
      realizedCap: marketCap / mvrv,
      source: "test"
    };
  });
}

test("MVRV Z-Score uses cumulative population deviation and a 7-day average", async () => {
  const { buildMvrvZscoreSeries } = await loadModule();
  const rows = marketRows(20);
  const series = buildMvrvZscoreSeries(rows, 7);
  const targetIndex = 19;
  const prefix = rows.slice(0, targetIndex + 1).map((row) => row.marketCap);
  const mean = prefix.reduce((sum, value) => sum + value, 0) / prefix.length;
  const deviation = Math.sqrt(prefix.reduce((sum, value) => sum + (value - mean) ** 2, 0) / prefix.length);
  const raw = (rows[targetIndex].marketCap - rows[targetIndex].realizedCap) / deviation;
  assert.ok(Math.abs(series.at(-1).rawZScore - raw) < 1e-12);
  assert.equal(series.length, 13);

  const sevenRaw = rows.slice(-7).map((row, offset) => {
    const end = rows.length - 7 + offset;
    const local = rows.slice(0, end + 1).map((entry) => entry.marketCap);
    const localMean = local.reduce((sum, value) => sum + value, 0) / local.length;
    const localDeviation = Math.sqrt(local.reduce((sum, value) => sum + (value - localMean) ** 2, 0) / local.length);
    return (rows[end].marketCap - rows[end].realizedCap) / localDeviation;
  });
  const expected = sevenRaw.reduce((sum, value) => sum + value, 0) / sevenRaw.length;
  assert.ok(Math.abs(series.at(-1).zScore - expected) < 1e-12);
});

test("reference model preserves supplied cycles and reports the measured 2022 outlier", async () => {
  const { REFERENCE_CYCLES, CLASSIC_REFERENCE_DAYS, EXPANDED_REFERENCE_DAYS } = await loadModule();
  assert.deepEqual(REFERENCE_CYCLES.map((row) => row.durationDays), [32, 49, 44, 140]);
  assert.equal(CLASSIC_REFERENCE_DAYS, 42);
  assert.equal(EXPANDED_REFERENCE_DAYS, 66);
  assert.equal(REFERENCE_CYCLES.at(-1).basis, "public-reconstruction");
});

test("threshold crossings and countdowns are derived from the public series", async () => {
  const { THRESHOLD, detectThresholdCrossings, calculateMvrvZscoreSnapshot, projectMvrvZscoreScenario } = await loadModule();
  const start = Date.parse("2026-08-20T00:00:00Z");
  const series = Array.from({ length: 28 }, (_, index) => ({
    date: new Date(start + index * 86400000).toISOString().slice(0, 10),
    timestamp: start + index * 86400000,
    price: 70000 + index * 100,
    mvrv: 1.4,
    rawZScore: index < 5 ? 0.7 : 0.8 + index / 100,
    zScore: index < 5 ? 0.7 : 0.8 + index / 100
  }));
  const crossings = detectThresholdCrossings(series, THRESHOLD);
  assert.deepEqual(crossings.map((row) => row.date), ["2026-08-25"]);
  const snapshot = calculateMvrvZscoreSnapshot(series, crossings, { value: 76000, asOf: "2026-09-17T00:00:00.000Z" }, { date: "2026-09-10", zScore: 0.8394, delayed: true });
  assert.equal(snapshot.referenceElapsedDays, 22);
  assert.equal(snapshot.classicRemainingDays, 20);
  assert.equal(snapshot.classicTargetDate, "2026-10-06");
  assert.equal(snapshot.expandedRemainingDays, 44);
  assert.equal(snapshot.expandedTargetDate, "2026-10-30");
  assert.equal(snapshot.price, 76000);
  assert.equal(snapshot.bgeometricsZScore, 0.8394);
  const projection = projectMvrvZscoreScenario(series, snapshot);
  assert.equal(projection.length, 44);
  assert.equal(projection.at(-1).date, "2026-10-30");
});
