import assert from "node:assert/strict";
import test from "node:test";
import {
  REFERENCE_CYCLES,
  buildSthMvrvProjection,
  calculateCurrentStructure,
  calculateReferenceCycles,
  calculateSnapshot,
  calculateSthMvrvSeries,
  extractBelowOneZones
} from "../api/sth-mvrv.js";

const dateAt = (offset, start = "2025-01-01T00:00:00Z") => {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

test("STH-MVRV is transparently derived from market price and STH realized price", () => {
  const rows = calculateSthMvrvSeries([
    { date: "2026-01-01", price: 80_000, sth: 100_000 },
    { date: "2026-01-02", price: 105_000, sth: 100_000 }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].mvrv, 0.8);
  assert.ok(Math.abs(rows[0].profitPercent + 20) < 1e-9);
  assert.equal(rows[1].mvrv, 1.05);
  assert.ok(Math.abs(rows[1].profitPercent - 5) < 1e-9);
});

test("2019 reference cycle excludes the March 2020 black swan", () => {
  assert.equal(REFERENCE_CYCLES.find((cycle) => cycle.cycle === "2019").end, "2020-02-29");
  const rows = [
    { date: "2018-12-01", price: 4_000, sth: 5_000, mvrv: 0.8 },
    { date: "2019-06-01", price: 9_000, sth: 7_500, mvrv: 1.2 },
    { date: "2019-11-01", price: 7_000, sth: 8_000, mvrv: 0.875 },
    { date: "2020-03-12", price: 4_000, sth: 8_000, mvrv: 0.5 }
  ];
  const cycles = calculateReferenceCycles(rows);
  assert.equal(cycles[0].firstDip.lowDate, "2018-12-01");
  assert.equal(cycles[0].secondDip.lowDate, "2019-11-01");
  assert.equal(cycles[0].completed, true);
});

test("current double bottom, reclaim snapshot and 365-day scenario are data-derived", () => {
  const values = [
    ...Array(30).fill(1.05),
    ...Array.from({ length: 40 }, (_, index) => 0.98 - index * 0.004),
    ...Array.from({ length: 20 }, (_, index) => 0.84 + index * 0.012),
    ...Array.from({ length: 30 }, (_, index) => 1.06 - index * 0.007),
    ...Array.from({ length: 30 }, (_, index) => 0.86 + index * 0.008)
  ];
  const rows = values.map((mvrv, index) => ({
    date: dateAt(index),
    price: 60_000 * mvrv,
    sth: 60_000,
    mvrv,
    profitPercent: (mvrv - 1) * 100
  }));
  const zones = extractBelowOneZones(rows);
  const structure = calculateCurrentStructure(rows, zones);
  const snapshot = calculateSnapshot(rows, { price: 80_000, priceAsOf: "2026-09-01T00:00:00Z" }, structure);
  const projection = buildSthMvrvProjection(rows, 28);

  assert.equal(structure.completed, true);
  assert.ok(structure.firstDip.lowMvrv < 1);
  assert.ok(structure.rebound.mvrv > 1);
  assert.ok(structure.secondDip.lowMvrv < 1);
  assert.equal(snapshot.price, 80_000);
  assert.equal(snapshot.doubleBottomComplete, true);
  assert.equal(projection.length, 4);
  assert.ok(projection.every((row) => row.scenario && row.mvrv >= 0.45 && row.mvrv <= 2.2));
});
