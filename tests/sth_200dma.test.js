import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHistoricalCycles,
  buildSth200dmaSeries,
  calculateSth200dmaSnapshot,
  decodePublicSeed,
  detectGoldenCrosses,
  detectMacroGoldenCrosses,
  mergePrimaryWithPublicSeed
} from "../api/sth-200dma.js";

const day = (index) => new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10);

test("buildSth200dmaSeries derives a transparent 200-day BTC moving average", () => {
  const prices = Array.from({ length: 240 }, (_, index) => ({ date: day(index), value: 100 + index }));
  const sth = Array.from({ length: 240 }, (_, index) => ({ date: day(index), value: 180 + index * 0.2 }));
  const rows = buildSth200dmaSeries(prices, sth);
  assert.equal(rows.length, 41);
  assert.equal(rows[0].dma200, 199.5);
  assert.equal(rows.at(-1).dma200, 239.5);
  assert.ok(Number.isFinite(rows.at(-1).spreadPercent));
});

test("bundled public seed keeps the model available when the free API is rate-limited", () => {
  const seed = decodePublicSeed();
  assert.equal(seed.asOf, "2026-08-27");
  assert.ok(seed.series.length > 1_000);
  assert.equal(seed.series.at(-1).date, seed.asOf);
  assert.ok(seed.series.at(-1).dma200 > 0);
  assert.deepEqual(seed.macroCrosses.map((cross) => cross.date), [
    "2015-07-05",
    "2019-05-08",
    "2023-02-25",
    "2026-08-25"
  ]);
  assert.equal(seed.historicalCycles.length, 3);
});

test("primary live data keeps the 2015 public-history cycle instead of truncating it", () => {
  const seed = decodePublicSeed();
  const primary = {
    series: seed.series.filter((row) => row.date >= "2016-01-01"),
    crosses: seed.crosses.filter((row) => row.date >= "2016-01-01"),
    macroCrosses: seed.macroCrosses.filter((row) => row.date >= "2016-01-01"),
    historicalCycles: seed.historicalCycles.filter((row) => row.crossDate >= "2016-01-01")
  };
  const merged = mergePrimaryWithPublicSeed(primary);
  assert.equal(merged.seededHistory, true);
  assert.equal(merged.macroCrosses[0].date, "2015-07-05");
  assert.deepEqual(merged.historicalCycles.map((cycle) => cycle.crossDate), [
    "2015-07-05",
    "2019-05-08",
    "2023-02-25"
  ]);
  assert.equal(merged.series.at(-1).date, seed.asOf);
});

test("golden-cross confirmation requires two daily closes above the 200DMA", () => {
  const series = Array.from({ length: 190 }, (_, index) => ({
    date: day(index),
    price: 100 + index,
    dma200: 100,
    sth: index < 180 ? 90 : 105,
    spread: index < 180 ? -10 : 5,
    spreadPercent: index < 180 ? -10 : 5
  }));
  const crosses = detectGoldenCrosses(series);
  assert.equal(crosses.length, 1);
  assert.equal(crosses[0].confirmed, true);
  assert.equal(crosses[0].confirmedCloses, 10);
  assert.equal(detectMacroGoldenCrosses(series, crosses).length, 1);
});

test("historical cycle windows and projection remain data-derived", () => {
  const series = Array.from({ length: 900 }, (_, index) => ({
    date: day(index),
    price: index < 500 ? 100 + index : 1_000 - index / 2,
    dma200: 100,
    sth: 105,
    spread: 5,
    spreadPercent: 5
  }));
  const macro = [
    { date: day(0), confirmed: true, confirmedCloses: 300 },
    { date: day(700), confirmed: true, confirmedCloses: 200 }
  ];
  const cycles = buildHistoricalCycles(series, macro);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].daysToPeak, 500);
  const snapshot = calculateSth200dmaSnapshot(series, macro, cycles, { value: 88_000, asOf: "2026-08-28T00:00:00Z" });
  assert.equal(snapshot.price, 88_000);
  assert.equal(snapshot.averageDaysToPeak, 500);
  assert.ok(snapshot.projectedPeakDate);
});
