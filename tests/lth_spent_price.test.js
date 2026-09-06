const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const DAY_MS = 86_400_000;

test("LTH Spent Price follows the public BTC price divided by LTH-SOPR formula", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "lth-spent-price.js")).href);
  const start = Date.UTC(2026, 0, 1);
  const priceHistory = Array.from({ length: 20 }, (_, index) => ({
    date: new Date(start + index * DAY_MS).toISOString().slice(0, 10),
    price: 60_000 + index * 100
  }));
  const soprRows = Array.from({ length: 10 }, (_, index) => ({
    timestamp: Math.floor((start + (index + 10) * DAY_MS) / 1000),
    value: index < 5 ? 0.8 : 1.2
  }));
  const metricPrices = soprRows.map((row, index) => ({
    timestamp: row.timestamp,
    value: 61_000 + index * 100
  }));

  const series = api.buildLthSpentPriceSeries(priceHistory, soprRows, metricPrices);
  assert.equal(series.length, 20);
  assert.equal(series[9].spentPrice, null);
  assert.equal(series[10].spentPrice, 61_000 / 0.8);
  assert.equal(series[10].underwater, true);
  assert.equal(series.at(-1).underwater, false);
  assert.ok(Number.isFinite(series.at(-1).spentAverage7));
});

test("LTH Spent Price classifications, water zones and snapshot stay deterministic", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "lth-spent-price.js")).href);
  assert.equal(api.classifyLthSpentPrice(89, 100), "deep-underwater");
  assert.equal(api.classifyLthSpentPrice(95, 100), "underwater");
  assert.equal(api.classifyLthSpentPrice(104, 100), "reclaim-test");
  assert.equal(api.classifyLthSpentPrice(110, 100), "above-cost");

  const start = Date.UTC(2026, 0, 1);
  const series = Array.from({ length: 12 }, (_, index) => ({
    date: new Date(start + index * DAY_MS).toISOString().slice(0, 10),
    price: index < 4 ? 110 : 90,
    lthSopr: index < 4 ? 1.1 : 0.9,
    spentPrice: 100,
    spentAverage7: 100
  }));
  const zones = api.detectUnderwaterZones(series);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].days, 8);
  assert.equal(zones[0].active, true);

  const snapshot = api.calculateLthSpentPriceSnapshot(series, { value: 88, asOf: "2026-01-12T12:00:00Z" }, zones);
  assert.equal(snapshot.price, 88);
  assert.equal(snapshot.current, 100);
  assert.equal(snapshot.zone, "deep-underwater");
  assert.equal(snapshot.underwaterDays, 8);
  assert.equal(snapshot.activeUnderwaterStart, "2026-01-05");
});

