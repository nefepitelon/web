const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
require("tsx/cjs");

const root = path.resolve(__dirname, "..");
const { selectAlphaPerpetualUniverse, rankAlphaLists } = require("../api/binance-alpha-lists.js");

test("Binance Alpha lists enforce Alpha + perpetual - Spot with exact asset matching", () => {
  const alphaTokens = [
    { symbol: "AKE", chainId: "56", contractAddress: "0x1", marketCap: "7200000", price: "0.1", percentChange24h: "5" },
    { symbol: "AKE", chainId: "8453", contractAddress: "0x2", marketCap: "6800000", price: "0.1", percentChange24h: "5" },
    { symbol: "BTC", chainId: "1", contractAddress: "0x3", marketCap: "100", price: "1" },
    { symbol: "SPOTONLY", chainId: "56", contractAddress: "0x4", marketCap: "200", price: "1" },
    { symbol: "$BR", chainId: "56", contractAddress: "0x5", marketCap: "1200000000", price: "0.5" }
  ];
  const spotExchange = { symbols: [
    { baseAsset: "BTC", status: "TRADING", isSpotTradingAllowed: true },
    { baseAsset: "SPOTONLY", status: "TRADING", isSpotTradingAllowed: true }
  ] };
  const futuresExchange = { symbols: [
    { baseAsset: "AKE", symbol: "AKEUSDT", quoteAsset: "USDT", status: "TRADING", contractType: "PERPETUAL" },
    { baseAsset: "BR", symbol: "BRUSDT", quoteAsset: "USDT", status: "TRADING", contractType: "PERPETUAL" },
    { baseAsset: "SPOTONLY", symbol: "SPOTONLYUSDT", quoteAsset: "USDT", status: "TRADING", contractType: "PERPETUAL" }
  ] };
  const rows = selectAlphaPerpetualUniverse({
    alphaTokens,
    spotExchange,
    futuresExchange,
    futuresTickers: [{ symbol: "AKEUSDT", priceChangePercent: "9", quoteVolume: "1000" }, { symbol: "BRUSDT", priceChangePercent: "2", quoteVolume: "500" }],
    premiumIndexes: [{ symbol: "AKEUSDT", markPrice: "0.2", lastFundingRate: "0.0001" }, { symbol: "BRUSDT", markPrice: "0.5", lastFundingRate: "-0.0002" }]
  });
  assert.deepEqual(rows.map((row) => row.symbol).sort(), ["AKE", "BR"]);
  assert.equal(rows.find((row) => row.symbol === "AKE").contractAddress, "0x2");
  assert.equal(rows.find((row) => row.symbol === "AKE").funding, 0.01);
});

test("market-cap and open-interest lists use the requested directions and top-20 limit", () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    symbol: `T${index}`,
    marketCap: 25 - index,
    openInterestUsd: index * 100
  }));
  const ranked = rankAlphaLists(rows);
  assert.equal(ranked.marketCapItems.length, 20);
  assert.equal(ranked.marketCapItems[0].marketCap, 1);
  assert.equal(ranked.openInterestItems.length, 20);
  assert.equal(ranked.openInterestItems[0].openInterestUsd, 2400);
});

test("Alpha Radar exposes the two prominent cached lists and a manual live refresh", () => {
  const html = fs.readFileSync(path.join(root, "alpha-radar.html"), "utf8");
  const client = fs.readFileSync(path.join(root, "alpha-scanner.js"), "utf8");
  const api = fs.readFileSync(path.join(root, "api/binance-alpha-lists.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "alpha-scanner.css"), "utf8");
  assert.match(html, /data-ranking-universe="alpha-market-cap"/);
  assert.match(html, /data-ranking-universe="alpha-open-interest"/);
  assert.match(html, /id="refresh-alpha-lists"/);
  assert.match(client, /hydrateBinanceAlphaLists\(\{ force: true, announce: true \}\)/);
  assert.match(client, /alphaListsTimer = window\.setTimeout/);
  assert.match(api, /rankType:\s*20/);
  assert.match(api, /CACHE_TTL_MS = 2 \* 60 \* 60 \* 1000/);
  assert.match(api, /BINANCE_FUTURES_OI_URL/);
  assert.match(css, /\.ranking-universe-tabs\s*\{[\s\S]*?border:[\s\S]*?box-shadow:/);
});
