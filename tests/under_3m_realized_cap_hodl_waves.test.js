import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnder3mSeries,
  calculateUnder3mSnapshot,
  classifyUnder3mZone,
  detectCycleLows
} from "../api/under-3m-realized-cap-hodl-waves.js";

test("buildUnder3mSeries derives the exact complement and rolling averages", () => {
  const source = Array.from({ length: 35 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    price: 60_000 + index,
    overThreeMonths: 0.85 - index * 0.001,
    source: "public"
  }));
  const series = buildUnder3mSeries(source);
  assert.equal(series.length, source.length);
  assert.ok(Math.abs(series[0].underThreeMonths - 0.15) < 1e-12);
  assert.ok(Math.abs(series.at(-1).underThreeMonths - 0.184) < 1e-12);
  assert.ok(series.at(-1).average7 > series.at(-1).average30);
});

test("classifyUnder3mZone keeps transparent bottom and speculation thresholds", () => {
  assert.equal(classifyUnder3mZone(0.12), "deep-bottom");
  assert.equal(classifyUnder3mZone(0.17), "bottom");
  assert.equal(classifyUnder3mZone(0.24), "accumulation");
  assert.equal(classifyUnder3mZone(0.45), "balanced");
  assert.equal(classifyUnder3mZone(0.7), "speculation");
});

test("snapshot and cycle lows expose actionable public-model state", () => {
  const base = [
    ["2011-11-01", 0.14], ["2015-01-14", 0.13], ["2019-02-01", 0.15],
    ["2022-11-21", 0.12], ["2026-07-01", 0.14], ["2026-07-02", 0.145]
  ].map(([date, value], index) => ({
    date,
    price: 100 * (index + 1),
    underThreeMonths: value,
    average7: value,
    average30: value - 0.01,
    source: "public"
  }));
  const snapshot = calculateUnder3mSnapshot(base, { value: 78_000, asOf: "2026-08-16T00:00:00.000Z", source: "Binance Spot" });
  assert.equal(snapshot.price, 78_000);
  assert.equal(snapshot.zone, "deep-bottom");
  assert.equal(snapshot.trend, "rising");
  assert.equal(detectCycleLows(base).length, 5);
});
