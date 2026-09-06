const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

test("realized-cap HODL waves preserve full history and append exact public rows", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "realized-cap-hodl-waves.js")).href);
  const start = Date.UTC(2020, 0, 1);
  const realized = [];
  const exact = [];
  const prices = [];
  for (let index = 0; index < 400; index += 1) {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    realized.push({ date, age_3m_6m: 10, age_6m_1y: 15, age_1y_2y: 20, age_2y_3y: 15, age_3y_4y: 10, age_4y_8y: 12, age_8y_plus: 3 });
    prices.push({ date, price: 10_000 + index * 50 });
  }
  for (let index = 390; index < 420; index += 1) {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    exact.push({ date, age_3m_6m: 0.10, age_6m_1y: 0.15, age_1y_2y: 0.20, age_2y_3y: 0.15, age_3y_4y: 0.10, age_4y_5y: 0.05, age_5y_7y: 0.04, age_7y_10y: 0.04, age_10y: 0.02 });
    if (index >= 400) prices.push({ date, price: 10_000 + index * 50 });
  }
  const result = api.buildRealizedCapHodlWaveSeries(realized, exact, prices);
  assert.equal(result.series.length, 420);
  assert.equal(result.extension.start, result.series[400].date);
  assert.equal(result.series[0].source, "bgeometrics");
  assert.equal(result.series.at(-1).source, "bitcoin-data");
  assert.ok(Math.abs(result.series[0].overThreeMonths - 0.85) < 1e-9);
  assert.ok(Math.abs(result.series.at(-1).overThreeMonths - 0.85) < 1e-9);
});

test("realized-cap HODL snapshot and lock zones are deterministic", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "realized-cap-hodl-waves.js")).href);
  assert.equal(api.classifyHodlLock(0.87), "deep-lock");
  assert.equal(api.classifyHodlLock(0.78), "accumulation");
  assert.equal(api.classifyHodlLock(0.65), "balanced");
  assert.equal(api.classifyHodlLock(0.55), "active");
  const series = Array.from({ length: 50 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    price: 70_000 + index,
    overThreeMonths: 0.80 + index / 1000,
    average7: 0.81,
    average30: 0.80,
    source: "bitcoin-data"
  }));
  const snapshot = api.calculateRealizedCapHodlSnapshot(series, { value: 78_000, asOf: "2026-02-20T00:00:00Z" });
  assert.equal(snapshot.price, 78_000);
  assert.equal(snapshot.zone, "deep-lock");
  assert.equal(snapshot.trend, "rising");
  assert.ok(snapshot.allTimePeak >= snapshot.current);
  const peaks = api.detectCyclePeaks(series);
  assert.equal(peaks.length, 1);
});

test("Glassnode public latest card is parsed and appended without changing its over-three-month total", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "realized-cap-hodl-waves.js")).href);
  const html = `<span class="latestValueCard_multilineDate-x">as of <!-- -->11 Aug 2026</span>
    ${[[">10y",0.04],["7y-10y",0.96],["5y-7y",3.7],["3y-5y",5.7],["2y-3y",5.2],["1y-2y",20.6],["6m-12m",34.1],["3m-6m",11.9]].map(([label,value]) => `<span class="latestValueCard_multilineLabel-x">${label === ">10y" ? "&gt;10y" : label}</span><span class="latestValueCard_multilineValue-x">${value}%</span>`).join("")}`;
  const latest = api.parseGlassnodeLatestRealizedCapShares(html);
  assert.equal(latest.date, "2026-08-11");
  const row = api.buildGlassnodeFallbackRow(latest, [{ age_3m_6m: 10, age_6m_1y: 30, age_1y_2y: 20, age_2y_3y: 5, age_3y_4y: 4, age_4y_8y: 5, age_8y_plus: 1 }]);
  const grouped = api.normalizeGroupedBands(row.grouped);
  const total = Object.values(grouped).reduce((sum, value) => sum + value, 0);
  assert.ok(Math.abs(total - 0.822) < 1e-9);
  assert.equal(row.source, "glassnode-latest");
});
