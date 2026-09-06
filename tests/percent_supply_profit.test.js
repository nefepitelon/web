const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

test("Percent Supply in Profit parses public daily CSV and derives the ratio from profit and loss supply", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "percent-supply-profit.js")).href);
  const profitRows = api.parsePublicCsv(
    "d,unixTs,supplyProfitBtc\n2026-08-12,1786492800,120\n2026-08-13,1786579200,104",
    ["supplyProfitBtc"]
  );
  const lossRows = api.parsePublicCsv(
    "d,unixTs,supplyLossBtc\n2026-08-12,1786492800,80\n2026-08-13,1786579200,96",
    ["supplyLossBtc"]
  );
  const priceRows = api.parsePublicCsv(
    "d,unixTs,priceUsd\n2026-08-12,1786492800,64000\n2026-08-13,1786579200,63000",
    ["priceUsd"]
  );

  const series = api.mergePercentSupplyProfitSeries(priceRows, profitRows, lossRows);
  assert.equal(series.length, 2);
  assert.equal(series[0].percent, 60);
  assert.equal(series[1].percent, 52);
  assert.equal(series[1].totalSupply, 200);
});

test("Percent Supply in Profit snapshot exposes moving averages, threshold distance and deterministic zones", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "percent-supply-profit.js")).href);
  const series = Array.from({ length: 30 }, (_, index) => ({
    date: `2026-07-${String(index + 1).padStart(2, "0")}`,
    price: 60_000 + index * 100,
    percent: 40 + index * 0.5,
    profitSupply: 8_000_000 + index * 1000,
    lossSupply: 12_000_000 - index * 1000,
    totalSupply: 20_000_000
  }));

  const snapshot = api.calculatePercentSupplyProfitSnapshot(series, {
    value: 63_500,
    asOf: "2026-08-01T00:00:00.000Z"
  });
  assert.equal(snapshot.price, 63_500);
  assert.equal(snapshot.percent, 54.5);
  assert.equal(snapshot.zone, "recovery");
  assert.equal(snapshot.distanceToBottom, 4.5);
  assert.equal(snapshot.distanceToTop, -40.5);
  assert.ok(snapshot.average7 > snapshot.average30);
  assert.equal(snapshot.trend, "rising");
});

test("Percent Supply in Profit historical windows retain observed lows and research references separately", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "percent-supply-profit.js")).href);
  const series = [
    { date: "2015-01-01", percent: 44, price: 250 },
    { date: "2015-08-18", percent: 35.6, price: 218 },
    { date: "2018-12-13", percent: 39.8, price: 3260 },
    { date: "2022-11-21", percent: 44.8, price: 15_778 },
    { date: "2026-06-30", percent: 46.9, price: 58_525 }
  ];
  const windows = [
    { label: "2015", start: "2015-01-01", end: "2015-12-31", referencePercent: 36 },
    { label: "Current", start: "2026-01-01", end: "2026-12-31", referencePercent: 46, referencePrice: 57_800 }
  ];

  const lows = api.calculateHistoricalLows(series, windows);
  assert.equal(lows.length, 2);
  assert.equal(lows[0].percent, 35.6);
  assert.equal(lows[0].referencePercent, 36);
  assert.equal(lows[1].referencePrice, 57_800);
});
