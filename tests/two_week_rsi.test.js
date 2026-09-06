const test = require("node:test");
const assert = require("node:assert/strict");

const importModule = () => import("../api/two-week-rsi.js");

test("resamples daily prices into deterministic 14-day closes", async () => {
  const { buildBiweeklyCloses } = await importModule();
  const start = Date.UTC(2011, 0, 3);
  const rows = Array.from({ length: 35 }, (_, index) => ({
    timestamp: start + index * 86_400_000,
    value: 100 + index
  }));
  const result = buildBiweeklyCloses(rows);
  assert.equal(result.length, 3);
  assert.equal(result[0].price, 113);
  assert.equal(result[1].price, 127);
  assert.equal(result[2].price, 134);
});

test("calculates Wilder RSI on biweekly closes", async () => {
  const { calculateWilderRsi } = await importModule();
  const rows = Array.from({ length: 20 }, (_, index) => ({
    timestamp: Date.UTC(2020, 0, 1 + index * 14),
    date: new Date(Date.UTC(2020, 0, 1 + index * 14)).toISOString().slice(0, 10),
    price: 100 + index * 2
  }));
  const result = calculateWilderRsi(rows, 14);
  assert.equal(result.length, 6);
  assert.equal(result[0].rsi, 100);
  assert.equal(result.at(-1).rsi, 100);
});

test("builds channels and a transparent current-cycle snapshot", async () => {
  const { attachLongTermChannels, calculateTwoWeekRsiSnapshot } = await importModule();
  const rows = [];
  for (let year = 2012; year <= 2026; year += 1) {
    for (let half = 0; half < 2; half += 1) {
      const timestamp = Date.UTC(year, half ? 8 : 2, 1);
      rows.push({
        timestamp,
        date: new Date(timestamp).toISOString().slice(0, 10),
        price: 100 * 2 ** (year - 2012),
        rsi: half ? 42 - (year - 2012) * 0.3 : 92 - (year - 2012) * 0.2
      });
    }
  }
  const { series } = attachLongTermChannels(rows);
  const snapshot = calculateTwoWeekRsiSnapshot(series);
  assert.equal(series.length, rows.length);
  assert.ok(Number.isFinite(snapshot.lower));
  assert.ok(Number.isFinite(snapshot.upper));
  assert.ok(snapshot.upper > snapshot.lower);
  assert.ok(["lower-touch", "oversold", "neutral", "overheated"].includes(snapshot.zone));
});
