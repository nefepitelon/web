import assert from "node:assert/strict";
import test from "node:test";
import {
  BAND_LEVELS,
  buildBandProjection,
  buildReferenceBreakouts,
  calculateSthCostBasisBandsSeries,
  calculateSthCostBasisBandsSnapshot,
  clusterMacroBreakouts,
  detectLine7Breakouts
} from "../api/sth-cost-basis-bands.js";

const dateAt = (offset) => {
  const date = new Date("2018-01-01T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

test("STH cost basis publishes nine half-standard-deviation rails", () => {
  assert.deepEqual(BAND_LEVELS, [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]);
});

test("four-year model keeps Line5 on STH basis and Line7 at plus one sigma", () => {
  const input = Array.from({ length: 160 }, (_, index) => ({
    date: dateAt(index),
    sth: 100 + index * 0.25,
    price: 100 + index * 0.25 + (index % 5) * 10
  }));
  const rows = calculateSthCostBasisBandsSeries(input, 1461, 30);
  const latest = rows.at(-1);
  assert.ok(rows.length > 100);
  assert.equal(latest.line5, latest.sth);
  assert.ok(latest.line1 < latest.line2 && latest.line8 < latest.line9);
  assert.ok(Math.abs(latest.line7 - (latest.line5 + latest.sigma)) < 1e-9);
  assert.equal(latest.observations, 160);
});

test("Line7 crossings are detected and macro whipsaws are clustered", () => {
  const series = [
    { date: "2019-01-01", price: 90, line7: 100 },
    { date: "2019-01-02", price: 101, line7: 100 },
    { date: "2019-01-03", price: 99, line7: 100 },
    { date: "2019-01-04", price: 102, line7: 100 },
    { date: "2019-06-01", price: 99, line7: 100 },
    { date: "2019-06-02", price: 103, line7: 100 }
  ];
  const events = detectLine7Breakouts(series);
  assert.deepEqual(events.map((event) => event.date), ["2019-01-02", "2019-01-04", "2019-06-02"]);
  assert.deepEqual(clusterMacroBreakouts(events).map((event) => event.date), ["2019-01-02", "2019-06-02"]);
});

test("snapshot and scenario projection remain data-derived", () => {
  const series = Array.from({ length: 400 }, (_, index) => ({
    date: dateAt(index),
    price: 100 + index * 0.2,
    sth: 90 + index * 0.15,
    sigma: 10,
    observations: 400,
    ...Object.fromEntries(BAND_LEVELS.map((level, lineIndex) => [`line${lineIndex + 1}`, 90 + index * 0.15 + level * 10]))
  }));
  const macro = [{ date: series.at(-10).date, price: series.at(-10).price, line7: series.at(-10).line7 }];
  const reference = buildReferenceBreakouts(series, macro);
  const snapshot = calculateSthCostBasisBandsSnapshot(series, macro, reference, { value: 180, asOf: "2019-02-05T12:00:00Z" }, new Date("2019-02-05T12:00:00Z"));
  const projection = buildBandProjection(series, snapshot, 28);

  assert.equal(snapshot.price, 180);
  assert.equal(snapshot.liveAboveLine7, true);
  assert.equal(snapshot.line7, series.at(-1).line7);
  assert.equal(projection.length, 4);
  assert.equal(projection[0].scenario, true);
  assert.ok(projection.every((row) => row.line1 < row.line9));
});
