import assert from "node:assert/strict";
import test from "node:test";
import {
  BOLLINGER_STDDEV,
  BOLLINGER_WINDOW,
  calculateSsrBollingerSeries,
  calculateSsrSnapshot,
  clusterMacroBreakouts,
  detectUpperBreakouts,
  normalizeCoinMetricsStablecoinRows,
  normalizeDefiLlamaStablecoinRows
} from "../api/stablecoin-supply-ratio.js";

test("SSR model publishes the requested Bollinger (200, 2) settings", () => {
  assert.equal(BOLLINGER_WINDOW, 200);
  assert.equal(BOLLINGER_STDDEV, 2);
});

test("stablecoin normalizers aggregate the audited basket and all USD-valued pegs", () => {
  const core = normalizeCoinMetricsStablecoinRows([
    { time: "2026-01-01T00:00:00Z", CapMrktCurUSD: "100" },
    { time: "2026-01-01T00:00:00Z", CapMrktCurUSD: "50" },
    { time: "2026-01-02T00:00:00Z", CapMrktCurUSD: "175" }
  ]);
  assert.deepEqual(core, [
    { date: "2026-01-01", marketCap: 150 },
    { date: "2026-01-02", marketCap: 175 }
  ]);

  const llama = normalizeDefiLlamaStablecoinRows([{ date: "1767225600", totalCirculatingUSD: { peggedUSD: 200, peggedEUR: 25 } }]);
  assert.deepEqual(llama, [{ date: "2026-01-01", marketCap: 225 }]);
});

test("SSR series uses the larger public aggregate and calculates rolling bands", () => {
  const btc = Array.from({ length: 6 }, (_, index) => ({
    date: `2026-01-0${index + 1}`,
    price: 100 + index,
    marketCap: [1000, 1000, 1000, 1000, 1000, 2000][index]
  }));
  const core = btc.map((row) => ({ date: row.date, marketCap: 20_000_000 }));
  const aggregate = btc.map((row) => ({ date: row.date, marketCap: 25_000_000 }));
  const rows = calculateSsrBollingerSeries(btc, core, aggregate, 5, 1);

  assert.equal(rows.length, 6);
  assert.equal(rows[0].stablecoinMarketCap, 25_000_000);
  assert.equal(rows[0].stablecoinSource, "defillama");
  assert.equal(rows[3].upper, null);
  assert.ok(Number.isFinite(rows[4].mean));
  assert.ok(rows[5].ssr > rows[5].upper);
});

test("SSR detects upward crossings, clusters whipsaws and reports live confirmation", () => {
  const series = [
    { date: "2026-01-01", price: 100, btcMarketCap: 1000, stablecoinMarketCap: 100, stablecoinSource: "defillama", ssr: 9, mean: 8, upper: 10, lower: 6 },
    { date: "2026-01-02", price: 110, btcMarketCap: 1100, stablecoinMarketCap: 100, stablecoinSource: "defillama", ssr: 11, mean: 8, upper: 10, lower: 6 },
    { date: "2026-01-03", price: 108, btcMarketCap: 1080, stablecoinMarketCap: 100, stablecoinSource: "defillama", ssr: 9.8, mean: 8.1, upper: 10, lower: 6.2 },
    { date: "2026-01-04", price: 115, btcMarketCap: 1150, stablecoinMarketCap: 100, stablecoinSource: "defillama", ssr: 11.5, mean: 8.2, upper: 10.1, lower: 6.3 },
    { date: "2026-01-05", price: 120, btcMarketCap: 1200, stablecoinMarketCap: 100, stablecoinSource: "defillama", ssr: 12, mean: 8.4, upper: 10.2, lower: 6.6 }
  ];
  const breakouts = detectUpperBreakouts(series);
  assert.deepEqual(breakouts.map((event) => event.date), ["2026-01-02", "2026-01-04"]);
  const macro = clusterMacroBreakouts(breakouts);
  assert.equal(macro.length, 1);
  assert.equal(macro[0].date, "2026-01-02");

  const snapshot = calculateSsrSnapshot(series, macro, [], { value: 120, asOf: "2026-01-05T12:00:00Z" }, new Date("2026-01-05T12:00:00Z"));
  assert.equal(snapshot.zone, "breakout-confirmed");
  assert.equal(snapshot.confirmedCloses, 2);
  assert.equal(snapshot.latestBreakoutDate, "2026-01-02");
  assert.equal(snapshot.daysSinceBreakout, 3);
  assert.ok(snapshot.aboveUpper);
});
