const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
require("tsx/cjs");
const originalLoad = Module._load;
let sourceCalls = 0;
let alphaSourceCalls = 0;
const scannedAt = new Date().toISOString();
const payload = { scannedAt, items: [{ symbol: "ZEC", name: "Zcash", market: "both", score: 95 }, { symbol: "BTC", market: "both", score: 70 }], featuredItems: [{ symbol: "BTC", market: "both" }, { symbol: "ETH", market: "both" }] };
const alphaPayload = {
  refreshedAt: scannedAt,
  marketCapItems: [{ symbol: "ZEC", futureSymbol: "ZECUSDT" }, { symbol: "MISSING", futureSymbol: "MISSINGUSDT" }],
  openInterestItems: [{ symbol: "ETH", futureSymbol: "ETHUSDT" }, { symbol: "BTC", futureSymbol: "BTCUSDT" }],
};
Module._load = function (name, parent, main) {
  if (name === "server-only") return {};
  if (name === "@/api/alpha-scan.js") return { async buildAlphaScanSnapshot() { sourceCalls++; return payload; } };
  if (name === "@/api/binance-alpha-lists.js") return { async getBinanceAlphaLists() { alphaSourceCalls++; return alphaPayload; } };
  return originalLoad.call(this, name, parent, main);
};
const { normalizeRadarUniverse, fetchRadarUniverse } = require("../lib/box-breakout/radar-source.ts");
const contracts = ["BTC", "ETH", "ZEC", "1000PEPE"].map(symbol => ({ symbol: `${symbol}USDT`, name: symbol }));

test("radar universe keeps genuine anomaly and featured lists distinct, preserving original rank", () => {
  assert.deepEqual(normalizeRadarUniverse(payload, "crypto-radar", contracts).universe.map(item => [item.symbol, item.sourceRank]), [["ZECUSDT", 1], ["BTCUSDT", 2]]);
  assert.deepEqual(normalizeRadarUniverse(payload, "crypto-mainstream", contracts).universe.map(item => item.symbol), ["BTCUSDT", "ETHUSDT"]);
});

test("radar normalization dedupes case/full pairs and explicitly excludes unsupported perpetuals", () => {
  const result = normalizeRadarUniverse({ scannedAt, items: [{ symbol: " btc ", market: "both" }, { symbol: "BTCUSDT", market: "both" }, { symbol: "SPOT", market: "spot" }, { symbol: "UNKNOWN", market: "perp" }, { symbol: "1000pepe", market: "perp" }] }, "crypto-radar", contracts);
  assert.deepEqual(result.universe.map(item => [item.symbol, item.sourceRank]), [["BTCUSDT", 1], ["1000PEPEUSDT", 5]]);
  assert.equal(result.sourceCount, 4); assert.deepEqual(result.skippedSymbols, ["SPOTUSDT", "UNKNOWNUSDT"]);
});

test("radar does not substitute gainers for stale, empty, malformed, or untradeable source lists", () => {
  for (const snapshot of [
    { scannedAt, items: [] }, { scannedAt, featuredItems: [] },
    { ...payload, scannedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString() },
    { ...payload, scannedAt: new Date(Date.now() + 120_000).toISOString() },
    { scannedAt, items: [{ symbol: "BTC/USDT" }] }, { scannedAt, items: [{ symbol: "SPOT", market: "spot" }] },
    { scannedAt, items: Array(201).fill({ symbol: "BTC" }) },
  ]) assert.throws(() => normalizeRadarUniverse(snapshot, "crypto-radar", contracts), /行情源/);
});

test("radar scans share a bounded read-only snapshot load without sharing selected mode", async () => {
  const [radar, mainstream] = await Promise.all([fetchRadarUniverse("crypto-radar", contracts), fetchRadarUniverse("crypto-mainstream", contracts)]);
  assert.equal(sourceCalls, 1);
  assert.equal(radar.universe[0].symbol, "ZECUSDT"); assert.equal(mainstream.universe[0].symbol, "BTCUSDT");
});

test("Skills Hub Alpha box sources preserve the two ranked lists and revalidate perpetual support", async () => {
  const marketCap = await fetchRadarUniverse("crypto-alpha-market-cap", contracts);
  const openInterest = await fetchRadarUniverse("crypto-alpha-open-interest", contracts);
  assert.deepEqual(marketCap.universe.map(item => [item.symbol, item.sourceRank]), [["ZECUSDT", 1]]);
  assert.deepEqual(marketCap.skippedSymbols, ["MISSINGUSDT"]);
  assert.deepEqual(openInterest.universe.map(item => item.symbol), ["ETHUSDT", "BTCUSDT"]);
  assert.equal(alphaSourceCalls, 2);
});

test("original alpha endpoint and box module use the same scanner implementation", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require("node:path").join(__dirname, "../api/alpha-scan.js"), "utf8");
  assert.match(source, /export async function buildAlphaScanSnapshot/);
  assert.match(source, /const snapshot = await buildAlphaScanSnapshot\(\)/);
  assert.match(source, /const featuredItems = FEATURED_SYMBOLS\.map/);
});
