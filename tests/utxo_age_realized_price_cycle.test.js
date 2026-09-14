const test = require("node:test");
const assert = require("node:assert/strict");

const loadModule = () => import("../api/utxo-age-realized-price-cycle.js");

function syntheticSeries(length = 1100) {
  const start = Date.UTC(2023, 0, 1);
  return Array.from({ length }, (_, index) => {
    const six = 40000 + index * 12 + Math.sin(index / 35) * 500;
    const twelve = index < 780 ? 36000 + index * 13 : 56000 + (index - 780) * 8;
    return {
      date: new Date(start + index * 86400000).toISOString().slice(0, 10),
      timestamp: start + index * 86400000,
      price: 30000 + index * 40,
      sixToTwelve: six,
      twelveToEighteen: twelve,
      oneToTwoYears: twelve * 0.96,
      spread: six - twelve,
      spreadPercent: ((six / twelve) - 1) * 100,
      estimated: index > 900
    };
  });
}

test("reference cycle anchors retain the supplied thousand-day durations", async () => {
  const { REFERENCE_CYCLES, REFERENCE_MEAN_DAYS, REFERENCE_CURRENT_CROSS_DATE } = await loadModule();
  assert.deepEqual(REFERENCE_CYCLES.map((row) => row.durationDays), [1045, 1028, 1063]);
  assert.equal(REFERENCE_MEAN_DAYS, 1045);
  assert.equal(REFERENCE_CURRENT_CROSS_DATE, "2026-07-15");
});

test("death crosses require a persistent negative spread", async () => {
  const { detectDeathCrosses } = await loadModule();
  const rows = syntheticSeries();
  const crosses = detectDeathCrosses(rows, 14);
  assert.ok(crosses.length >= 1);
  const crossIndex = rows.findIndex((row) => row.date === crosses.at(-1).date);
  assert.ok(rows.slice(crossIndex, crossIndex + 14).every((row) => row.spread < 0));
});

test("forward scenario is bounded to the reference cycle horizon and starts after history", async () => {
  const { projectAgeBandCosts } = await loadModule();
  const rows = syntheticSeries();
  const projection = projectAgeBandCosts(rows);
  assert.ok(projection.length >= 365);
  assert.ok(projection.length <= 1045);
  assert.ok(projection[0].date > rows.at(-1).date);
  assert.ok(projection.every((row) => row.sixToTwelve > 0 && row.twelveToEighteen > 0));
});

test("snapshot reports model provenance and keeps the supplied reference cross separate", async () => {
  const { buildSnapshot } = await loadModule();
  const rows = syntheticSeries();
  const projection = [{ date: "2029-05-25", sixToTwelve: 70000, twelveToEighteen: 80000 }];
  const snapshot = buildSnapshot(rows, [], projection, { value: 90000, asOf: "2026-09-13T00:00:00.000Z" }, "2026-04-26");
  assert.equal(snapshot.crossSource, "reference-anchor");
  assert.equal(snapshot.activeCrossDate, "2026-07-15");
  assert.equal(snapshot.price, 90000);
  assert.equal(snapshot.scenarioEndDate, "2029-05-25");
});
