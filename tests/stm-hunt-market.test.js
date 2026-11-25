const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const NOW = Date.parse("2026-11-25T10:00:30Z");
const minute = Math.floor(NOW / 60_000) * 60_000;
function candle(time = minute) { return [time, "100", "105", "95", "102", "20", time + 59_999, "2000", 10]; }
function payloads(symbol = "BTCUSDT") {
  return {
    depth: { bids: [["101", "2"], ["100", "3"]], asks: [["103", "4"], ["104", "5"]] },
    klines: [candle(minute - 60_000), candle(minute)],
    ticker: { symbol, lastPrice: "102", priceChangePercent: "-1.5", quoteVolume: "50000", highPrice: "110", lowPrice: "90" },
  };
}
function responseFor(url, payload = payloads(new URL(url).searchParams.get("symbol")), status = 200) {
  const endpoint = new URL(url).pathname;
  const body = endpoint.endsWith("/depth") ? payload.depth : endpoint.endsWith("/klines") ? payload.klines : payload.ticker;
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, Map, Set, Error, Math, Number, Promise, URL, Request, Response, AbortSignal,
    require(name) { if (name === "server-only") return {}; if (name in imports) return imports[name]; throw new Error(`Unexpected dependency ${name}`); },
    fetch() { throw new Error("No network permitted in market tests"); }, ...globals,
  });
  return module.exports;
}
function market(fetcher, clock = { now: NOW }) {
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  return load("lib/stm-hunt/market.ts", {}, { Date: ClockDate, ...(fetcher ? { fetch: fetcher } : {}) });
}

test("public chart data keeps actual depth and OHLC values and labels the open last candle", () => {
  const snapshot = market().normalizeStmMarket("BTCUSDT", payloads(), NOW);
  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.price, 102);
  assert.equal(snapshot.change24h, -1.5);
  assert.equal(snapshot.volumeUsd, 50_000);
  assert.equal(snapshot.bids[0].price, 101);
  assert.equal(snapshot.asks[0].quantity, 4);
  assert.equal(snapshot.candles[0].time, minute - 60_000);
  assert.equal(snapshot.candles[0].closed, true);
  assert.equal(snapshot.candles[1].closed, false);
  assert.equal(snapshot.candles[1].open, 100);
  assert.match(snapshot.message, /仅用于图表展示/);
});

test("malformed numbers, crossed books and invalid chronological candles are not painted as valid data", () => {
  const module = market();
  const raw = payloads();
  raw.depth.bids[0][1] = "";
  raw.ticker.lastPrice = "NaN";
  raw.ticker.priceChangePercent = null;
  raw.ticker.quoteVolume = false;
  raw.klines.push(candle(minute - 120_000));
  const snapshot = module.normalizeStmMarket("BTCUSDT", raw, NOW);
  assert.equal(snapshot.status, "partial");
  assert.equal(snapshot.bids.length, 0);
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.change24h, null);
  assert.equal(snapshot.volumeUsd, null);
  assert.equal(snapshot.candles.length, 2);
  assert.ok(snapshot.candles[1].time > snapshot.candles[0].time);
  const crossed = payloads(); crossed.depth.bids[0][0] = "103";
  const crossedSnapshot = module.normalizeStmMarket("BTCUSDT", crossed, NOW);
  assert.equal(crossedSnapshot.status, "partial");
  assert.equal(crossedSnapshot.bids.length, 0);
  assert.equal(crossedSnapshot.asks.length, 0);
  const badOhlc = payloads(); badOhlc.klines[0][2] = "90";
  assert.equal(module.normalizeStmMarket("BTCUSDT", badOhlc, NOW).candles.length, 1);
});

test("missing and mismatched ticker data remain null and never borrow a price from an older candle", () => {
  const raw = payloads("ETHUSDT");
  const snapshot = market().normalizeStmMarket("BTCUSDT", raw, NOW);
  assert.equal(snapshot.price, null);
  assert.equal(snapshot.change24h, null);
  assert.equal(snapshot.volumeUsd, null);
  assert.equal(snapshot.high24h, null);
  assert.equal(snapshot.low24h, null);
  assert.equal(snapshot.candles.length, 2);
  assert.equal(snapshot.status, "partial");
  const empty = market().normalizeStmMarket("BTCUSDT", {}, NOW);
  assert.equal(empty.status, "unavailable");
  assert.equal(empty.candles.length, 0);
  assert.equal(empty.price, null);
});

test("the adapter uses only fixed public endpoints with bounded limits and no trading credentials", async () => {
  const calls = [];
  const module = market(async (url, options) => { calls.push({ url, options }); return responseFor(url); });
  const snapshot = await module.getStmMarketSnapshot("BTCUSDT");
  assert.equal(snapshot.status, "ok");
  assert.equal(calls.length, 3);
  const urls = calls.map(call => new URL(call.url));
  assert.ok(urls.every(url => url.origin === "https://data-api.binance.vision" && url.searchParams.get("symbol") === "BTCUSDT"));
  assert.equal(urls.find(url => url.pathname.endsWith("/depth")).searchParams.get("limit"), "20");
  const klines = urls.find(url => url.pathname.endsWith("/klines"));
  assert.equal(klines.searchParams.get("interval"), "1m");
  assert.equal(klines.searchParams.get("limit"), "60");
  for (const call of calls) {
    assert.deepEqual(Object.keys(call.options.headers), ["Accept"]);
    assert.equal(call.options.redirect, "error");
    assert.equal(call.options.cache, "no-store");
    assert.ok(call.options.signal instanceof AbortSignal);
  }
});

test("singleflight coalesces duplicate reads and the cache expires within three seconds", async () => {
  let calls = 0;
  const clock = { now: NOW };
  const module = market(async url => { calls += 1; return responseFor(url); }, clock);
  const snapshots = await Promise.all(Array.from({ length: 20 }, () => module.getStmMarketSnapshot("BTCUSDT")));
  assert.ok(snapshots.every(snapshot => snapshot.status === "ok"));
  assert.equal(calls, 3);
  clock.now += 2_499;
  await module.getStmMarketSnapshot("BTCUSDT");
  assert.equal(calls, 3);
  clock.now += 2;
  await module.getStmMarketSnapshot("BTCUSDT");
  assert.equal(calls, 6);
});

test("external request concurrency stays bounded when several symbols arrive together", async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let active = 0, maxActive = 0, calls = 0;
  const module = market(async url => {
    calls += 1; active += 1; maxActive = Math.max(maxActive, active);
    await gate; active -= 1; return responseFor(url);
  });
  const first = module.getStmMarketSnapshot("BTCUSDT"), second = module.getStmMarketSnapshot("ETHUSDT");
  const crowded = await module.getStmMarketSnapshot("SOLUSDT");
  assert.equal(crowded.status, "unavailable");
  assert.match(crowded.message, /繁忙/);
  assert.equal(calls, 6);
  release();
  await Promise.all([first, second]);
  assert.equal(maxActive, 6);
});

test("the official fallback can recover server failures but rate limits do not trigger extra requests", async () => {
  const recoveredCalls = [];
  const recovered = market(async url => { recoveredCalls.push(url); return new URL(url).hostname === "data-api.binance.vision" ? new Response("Unavailable", { status: 503 }) : responseFor(url); });
  assert.equal((await recovered.getStmMarketSnapshot("BTCUSDT")).status, "ok");
  assert.equal(recoveredCalls.length, 6);
  assert.ok(recoveredCalls.every(url => ["data-api.binance.vision", "api.binance.com"].includes(new URL(url).hostname)));
  let limitedCalls = 0;
  const limited = market(async () => { limitedCalls += 1; return new Response("Rate limited", { status: 429 }); });
  const snapshot = await limited.getStmMarketSnapshot("BTCUSDT");
  assert.equal(snapshot.status, "unavailable");
  assert.match(snapshot.message, /429/);
  assert.equal(limitedCalls, 3);
});

test("a failing component yields honest partial data; a complete failure never creates replacement candles", async () => {
  const partial = market(async url => new URL(url).pathname.endsWith("/depth") ? new Response("Unavailable", { status: 503 }) : responseFor(url));
  const degraded = await partial.getStmMarketSnapshot("BTCUSDT");
  assert.equal(degraded.status, "partial");
  assert.equal(degraded.bids.length, 0);
  assert.equal(degraded.price, 102);
  assert.equal(degraded.candles.length, 2);
  const unavailable = market(async () => { throw new Error("Network unavailable"); });
  const empty = await unavailable.getStmMarketSnapshot("BTCUSDT");
  assert.equal(empty.status, "unavailable");
  assert.equal(empty.candles.length, 0);
  assert.equal(empty.price, null);
});

test("the public GET route rejects arbitrary URLs, duplicate or invalid symbols before source access", async () => {
  const real = market();
  const accessed = [];
  const route = load("app/api/stm-hunt/market/route.ts", { "@/lib/stm-hunt/market": { isStmMarketSymbol: real.isStmMarketSymbol, async getStmMarketSnapshot(symbol) { accessed.push(symbol); return { symbol, status: "unavailable" }; } } });
  for (const suffix of ["?symbol=btcusdt", "?symbol=BTCUSDT&symbol=ETHUSDT", "?symbol=BTCUSDT&url=https://example.com", "?symbol=", `?symbol=${"A".repeat(25)}USDT`]) {
    assert.equal((await route.GET(new Request(`https://app.test/api/stm-hunt/market${suffix}`))).status, 400);
  }
  assert.equal(accessed.length, 0);
  const response = await route.GET(new Request("https://app.test/api/stm-hunt/market"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).symbol, "BTCUSDT");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(accessed, ["BTCUSDT"]);
});
