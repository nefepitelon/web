const test = require("node:test");
const assert = require("node:assert/strict");

const now = Date.parse("2026-09-05T12:00:00Z");

test("home market preserves ticker percent units and the exchange observation time", async () => {
  const { normalizeTicker } = await import("../api/home-market.js");
  const metric = normalizeTicker({ symbol: "BTCUSDT", lastPrice: "79700", priceChangePercent: "-1.25", closeTime: now - 1000 }, now);
  assert.equal(metric.value, 79700);
  assert.equal(metric.change24h, -1.25);
  assert.equal(metric.unit, "USDT");
  assert.equal(metric.asOf, "2026-09-05T11:59:59.000Z");
  assert.throws(() => normalizeTicker({ symbol: "BTCUSDT", lastPrice: "79700", priceChangePercent: null, closeTime: now }, now));
  assert.throws(() => normalizeTicker({ symbol: "ETHUSDT", lastPrice: "79700", priceChangePercent: "0", closeTime: now }, now));
});

test("home spot spread uses the midpoint in basis points and rejects crossed or empty books", async () => {
  const { normalizeBook } = await import("../api/home-market.js");
  const metric = normalizeBook({ symbol: "BTCUSDT", bidPrice: "99990", askPrice: "100010" }, now);
  assert.equal(metric.value, 2);
  assert.equal(metric.unit, "bps");
  assert.equal(metric.source, "Binance Spot");
  assert.throws(() => normalizeBook({ symbol: "BTCUSDT", bidPrice: "100", askPrice: "99" }, now));
  assert.throws(() => normalizeBook({ symbol: "BTCUSDT", bidPrice: null, askPrice: "100" }, now));
  assert.equal(normalizeBook({ symbol: "BTCUSDT", bidPrice: "100", askPrice: "100" }, now).value, 0);
});

test("home network hashrate converts hashes per second to EH/s without mislabeling it as instantaneous", async () => {
  const { normalizeHashrate } = await import("../api/home-market.js");
  const metric = normalizeHashrate({ currentHashrate: 932.5e18 }, now);
  assert.equal(metric.value, 932.5);
  assert.equal(metric.unit, "EH/s");
  assert.equal(metric.window, "7d");
  assert.equal(metric.estimated, true);
  assert.equal(metric.asOfKind, "retrieved");
  assert.throws(() => normalizeHashrate({ currentHashrate: null }, now));
  assert.throws(() => normalizeHashrate({ currentHashrate: Infinity }, now));
});

test("home stale data expires by original observation, never by the most recent failed refresh", async () => {
  const { resolveMetric, normalizeTicker, normalizeHashrate } = await import("../api/home-market.js");
  const price = normalizeTicker({ symbol: "BTCUSDT", lastPrice: "79700", priceChangePercent: "0", closeTime: now }, now);
  assert.equal(resolveMetric("price", price, now + 30_000).status, "live");
  assert.equal(resolveMetric("price", price, now + 61_000).status, "stale");
  assert.equal(resolveMetric("price", price, now + 20_000, true).status, "stale");
  assert.equal(resolveMetric("price", price, now + 301_000, true).value, null);
  const hashrate = normalizeHashrate({ currentHashrate: 932.5e18 }, now);
  assert.equal(resolveMetric("hashrate", hashrate, now + 301_000).status, "live");
  assert.equal(resolveMetric("hashrate", hashrate, now + 3_600_001).status, "unavailable");
});

test("home API isolates source failures, uses Binance fallback and limits hashrate requests", async (t) => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let clock = now;
  let failPrice = false;
  const calls = [];
  Date.now = () => clock;
  t.after(() => { global.fetch = originalFetch; Date.now = originalNow; });
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes("hashrate")) return Response.json({ currentHashrate: 932.5e18 });
    if (url.includes("bookTicker")) return Response.json({ symbol: "BTCUSDT", bidPrice: "79990", askPrice: "80010" });
    if (url.includes("binance.vision") || failPrice) throw new Error("Unavailable origin");
    return Response.json({ symbol: "BTCUSDT", lastPrice: "80000", priceChangePercent: "0.5", closeTime: clock });
  };
  const { getHomeMarketPayload } = await import("../api/home-market.js?source-test");
  const first = await getHomeMarketPayload();
  assert.equal(first.partial, false);
  assert.equal(first.metrics.price.value, 80000);
  assert.ok(calls.some((url) => url.startsWith("https://api.binance.com") && url.includes("24hr")));
  const firstCount = calls.length;
  await getHomeMarketPayload();
  assert.equal(calls.length, firstCount);

  clock += 31_000;
  failPrice = true;
  const second = await getHomeMarketPayload();
  assert.equal(second.ok, true);
  assert.equal(second.partial, true);
  assert.equal(second.metrics.price.status, "stale");
  assert.equal(second.metrics.price.asOf, first.metrics.price.asOf);
  assert.equal(second.metrics.spread.status, "live");
  assert.equal(second.metrics.hashrate.status, "live");
  assert.equal(calls.filter((url) => url.includes("hashrate")).length, 1);

  clock += 5 * 60_000;
  const third = await getHomeMarketPayload();
  assert.equal(third.metrics.price.status, "unavailable");
  assert.equal(third.metrics.price.value, null);
  assert.equal(third.metrics.spread.status, "live");
});

test("home API reports missing data without returning sample market values", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { throw new Error("Offline"); };
  const { getHomeMarketPayload } = await import("../api/home-market.js?offline-test");
  const result = await getHomeMarketPayload();
  assert.equal(result.ok, false);
  assert.equal(result.partial, true);
  assert.ok(Object.values(result.metrics).every((metric) => metric.status === "unavailable" && metric.value === null));
});
