import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCycleSnapshot,
  calculateReferenceCycles,
  classifyHeatZone,
  projectUnder3mCycle
} from "../api/under-3m-realized-cap-cycle.js";

const row = (date, value, price = 50_000) => ({
  date,
  price,
  underThreeMonths: value,
  average7: value,
  average30: value
});

test("heat zones preserve the requested 39% to 45% warning band", () => {
  assert.equal(classifyHeatZone(0.299), "cooldown");
  assert.equal(classifyHeatZone(0.317), "expansion");
  assert.equal(classifyHeatZone(0.39), "caution");
  assert.equal(classifyHeatZone(0.45), "overheated");
});

test("reference cycles keep supplied anchors separate from public observations", () => {
  const series = [
    row("2016-06-01", 0.36), row("2016-08-01", 0.38),
    row("2019-06-01", 0.41), row("2019-07-01", 0.42),
    row("2024-03-01", 0.43), row("2024-12-01", 0.40)
  ];
  const cycles = calculateReferenceCycles(series);
  assert.deepEqual(cycles.map((cycle) => cycle.referenceValue), [0.392, 0.437, 0.447]);
  assert.deepEqual(cycles.map((cycle) => cycle.observedValue), [0.38, 0.42, 0.43]);
});

test("projection is data-derived, bounded and starts after the last observation", () => {
  const series = Array.from({ length: 1500 }, (_, index) => {
    const date = new Date(Date.UTC(2022, 0, 1 + index)).toISOString().slice(0, 10);
    const value = 0.2 + index * 0.00005;
    return row(date, value);
  });
  const projection = projectUnder3mCycle(series, 365);
  assert.equal(projection.length, 365);
  assert.ok(projection[0].date > series.at(-1).date);
  assert.ok(projection.every((point) => point.value >= 0 && point.value <= 1));
  assert.notEqual(projection.at(-1).value, series.at(-1).underThreeMonths);
});

test("snapshot exposes live public value and the 31.7% reference without conflation", () => {
  const projection = [{ date: "2027-01-01", value: 0.34 }];
  const snapshot = buildCycleSnapshot({
    current: 0.32,
    average7: 0.31,
    average30: 0.30,
    onchainAsOf: "2026-09-09"
  }, projection);
  assert.equal(snapshot.current, 0.32);
  assert.equal(snapshot.referenceCurrent, 0.317);
  assert.ok(Math.abs(snapshot.referenceDivergence - 0.003) < 1e-12);
  assert.equal(snapshot.scenarioEnd, 0.34);
});
