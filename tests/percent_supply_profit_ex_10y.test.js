import assert from "node:assert/strict";
import test from "node:test";
import {
  REFERENCE_WINDOWS,
  buildPercentProfitProjection,
  calculatePercentSupplyProfitEx10ySeries,
  calculateReferenceCycles,
  calculateSnapshot,
  detectWashoutZones
} from "../api/percent-supply-profit-ex-10y.js";

const dateAt = (offset, start = "2023-01-01T00:00:00Z") => {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};

test("ex->10y proxy removes dormant supply from both numerator and denominator", () => {
  const profit = Array.from({ length: 8 }, (_, index) => ({
    date: dateAt(index),
    price: 20_000 + index * 100,
    profitSupply: 80 + index,
    lossSupply: 20 - index,
    totalSupply: 100
  }));
  const supply = Array.from({ length: 8 }, (_, index) => ({ date: dateAt(index), age_10y: 20 }));
  const rows = calculatePercentSupplyProfitEx10ySeries(profit, supply);

  assert.equal(rows.length, 8);
  assert.equal(rows[0].activeSupply, 80);
  assert.equal(rows[0].activeProfitSupply, 60);
  assert.equal(rows[0].percentRaw, 75);
  assert.equal(rows[6].percent7, rows.slice(0, 7).reduce((sum, row) => sum + row.percentRaw, 0) / 7);
  assert.ok(rows.every((row) => row.percentRaw >= 0 && row.percentRaw <= 100));
});

test("historical reference windows exclude the March 2020 black swan", () => {
  assert.equal(REFERENCE_WINDOWS.find((window) => window.cycle === "2019").end, "2020-02-29");
  const series = [
    { date: "2019-07-01", percent7: 58, price: 10_000 },
    { date: "2019-12-15", percent7: 53, price: 7_000 },
    { date: "2020-03-12", percent7: 20, price: 4_000 }
  ];
  const cycles = calculateReferenceCycles(series, [{ cycle: "2019", start: "2019-06-01", end: "2020-02-29", threshold: 55 }]);
  assert.equal(cycles[0].lowDate, "2019-12-15");
  assert.equal(cycles[0].triggered, true);
});

test("washout zones, snapshot and scenario remain bounded and data-derived", () => {
  const series = Array.from({ length: 400 }, (_, index) => {
    const percent7 = index < 360 ? 70 : index < 380 ? 52 : 58 + (index - 380) * 0.25;
    return {
      date: dateAt(index, "2025-01-01T00:00:00Z"),
      price: 50_000 + index * 50,
      percentRaw: percent7,
      percent7,
      dormantOver10y: 3_500_000,
      dormantShare: 17.5,
      activeSupply: 16_500_000,
      activeProfitSupply: 9_000_000,
      lossSupply: 7_500_000
    };
  });
  const zones = detectWashoutZones(series);
  const snapshot = calculateSnapshot(series, { price: 80_000, priceAsOf: "2026-02-01T12:00:00Z" }, []);
  const projection = buildPercentProfitProjection(series, 28);

  assert.ok(zones.some((zone) => zone.threshold === 55 && zone.lowPercent === 52));
  assert.equal(snapshot.price, 80_000);
  assert.equal(snapshot.washoutCompleted, true);
  assert.equal(projection.length, 4);
  assert.ok(projection.every((row) => row.scenario && row.percent7 >= 0 && row.percent7 <= 100));
});
