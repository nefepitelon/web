const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

test("SLRV aligns complete public history and calibrated exact extension", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "slrv-ratio.js")).href);
  const start = Date.UTC(2020, 0, 1);
  const realized = [];
  const prices = [];
  const exact = [];
  for (let index = 0; index < 420; index += 1) {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    realized.push({ date, age_0d_1d: 1 + index / 1000, age_6m_1y: 20 });
    prices.push({ date, price: 10_000 + index * 50 });
    if (index >= 300) exact.push({ date, age_0d_1d: (1 + index / 1000) / 4, age_6m_1y: 20 });
  }
  for (let index = 420; index < 440; index += 1) {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    exact.push({ date, age_0d_1d: (1 + index / 1000) / 4, age_6m_1y: 20 });
    prices.push({ date, price: 10_000 + index * 50 });
  }
  const result = api.buildSlrvSeries(realized, exact, prices);
  assert.equal(result.series.length, 440);
  assert.equal(result.calibration.extensionStart, result.series[420].date);
  assert.ok(Math.abs(result.series[419].rawRatio - result.series[420].rawRatio) < 0.001);
  assert.ok(Math.abs(result.calibration.factor - 4) < 0.0001);
  assert.ok(Number.isFinite(result.series.at(-1).slrv));
});

test("SLRV snapshot, zones and threshold classification are transparent", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "slrv-ratio.js")).href);
  assert.equal(api.classifySlrv(0.03), "bottom");
  assert.equal(api.classifySlrv(0.2), "normal");
  assert.equal(api.classifySlrv(2), "elevated");
  assert.equal(api.classifySlrv(4), "overheated");
  const series = Array.from({ length: 40 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    price: 70_000 + index,
    rawRatio: index < 20 ? 0.03 : 0.08,
    slrv: index < 20 ? 0.03 : 0.08,
    average30: 0.06,
    source: "bgeometrics"
  }));
  const zones = api.detectSlrvLowZones(series);
  assert.equal(zones[0].days, 20);
  const snapshot = api.calculateSlrvSnapshot(series, { value: 78_000, asOf: "2026-02-10T00:00:00Z" });
  assert.equal(snapshot.price, 78_000);
  assert.equal(snapshot.zone, "normal");
  assert.ok(Number.isFinite(snapshot.sevenDayChange));
});
