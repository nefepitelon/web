import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReferenceCycles,
  calculateVddMedianCycleSnapshot,
  detectBottomZones,
  detectTopZones,
  mergeVddMedianSeries
} from "../api/vdd-median-cycle.js";

const day = (index) => new Date(Date.UTC(2018, 0, 1 + index)).toISOString().slice(0, 10);

test("VDD / Median model applies transparent double-threshold signals", () => {
  const vdd = [
    { date: "2026-01-01", price: 100, vdd: 0.8 },
    { date: "2026-01-02", price: 180, vdd: 1.7 },
    { date: "2026-01-03", price: 130, vdd: 1.1 }
  ];
  const median = vdd.map((row) => ({ date: row.date, median: 100, medianEstimated: true }));
  const rows = mergeVddMedianSeries(vdd, median);
  assert.equal(rows[0].bottomSignal, true);
  assert.equal(rows[0].topSignal, false);
  assert.equal(rows[1].bottomSignal, false);
  assert.equal(rows[1].topSignal, true);
  assert.equal(rows[2].bottomSignal, false);
  assert.equal(rows[2].topSignal, false);
});

test("bottom and top zones are derived from contiguous daily observations", () => {
  const series = Array.from({ length: 31 }, (_, index) => ({
    date: day(index),
    price: 100,
    median: 100,
    vdd: index < 25 ? 0.7 : index === 27 ? 1.8 : 1.1,
    medianRatio: index === 27 ? 1.7 : 1,
    bottomSignal: index < 25,
    topSignal: index === 27
  }));
  const bottoms = detectBottomZones(series);
  const tops = detectTopZones(series);
  assert.equal(bottoms.length, 1);
  assert.equal(bottoms[0].days, 25);
  assert.equal(tops.length, 1);
  assert.equal(tops[0].days, 1);
});

test("reference windows preserve 687 and 678 day calibration and project their mean", () => {
  const series = Array.from({ length: 2_900 }, (_, index) => ({
    date: day(index),
    price: 100 + index,
    median: 100,
    vdd: 1,
    medianRatio: 1,
    bottomSignal: false,
    topSignal: false
  }));
  const bottomZones = [
    { start: "2019-01-01", end: "2019-02-01", days: 32, minVdd: 0.4, minMedianRatio: 0.9 },
    { start: "2023-01-01", end: "2023-02-01", days: 32, minVdd: 0.5, minMedianRatio: 0.95 },
    { start: "2025-10-01", end: "2025-11-01", days: 32, minVdd: 0.6, minMedianRatio: 1 }
  ];
  const cycles = buildReferenceCycles(series, bottomZones);
  assert.deepEqual(cycles.map((cycle) => cycle.daysToTop), [687, 678]);
  const snapshot = calculateVddMedianCycleSnapshot(series, bottomZones, cycles, { value: 88_000, asOf: "2026-08-28T00:00:00Z" });
  assert.equal(snapshot.price, 88_000);
  assert.equal(snapshot.averageDaysToTop, 682.5);
  assert.equal(snapshot.completedReferenceCycles, 2);
  assert.ok(snapshot.projectedTopDate);
});
