const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const loadModule = () => import("../api/market-heatmap.js");
const context = (values = {}) => ({ markPx: "110", prevDayPx: "100", dayNtlVlm: "1000", openInterest: "2", ...values });
const feed = (names, contexts = names.map(() => context())) => [{ universe: names.map(name => ({ name })) }, contexts];
function feeds({ xyzFail = false, defaultFail = false, delay = 0 } = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if ((body.dex === "xyz" && xyzFail) || (body.dex === "" && defaultFail)) throw new Error("Unavailable");
    return { ok: true, json: async () => body.dex === "xyz"
      ? feed(["xyz:NVDA", "xyz:SP500", "xyz:GOLD"], [context({ markPx: "200", prevDayPx: "250" }), context(), context()])
      : feed(["BTC", "ETH", "HYPE", "SOL"]) };
  } };
}
function responseMock() {
  return { statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }, end(value) { this.body = value; return this; } };
}

test("market parser preserves actual mark-price change and converts OI quantity into USD exactly once", async () => {
  const { parseMarketResponse } = await loadModule();
  const rows = parseMarketResponse(feed(["BTC", "ETH"], [context({ markPx: "65000", prevDayPx: "62500", openInterest: "12.5", dayNtlVlm: "987654321.25" }), context()]), "");
  assert.equal(rows[0].price, 65000);
  assert.ok(Math.abs(rows[0].change24hPct - 4) < 1e-10);
  assert.equal(rows[0].openInterestUsd, 812500);
  assert.equal(rows[0].volume24hUsd, 987654321.25);
  assert.equal(rows[0].market, "perpetual");
});

test("missing and malformed numeric metrics remain null while real zero is retained", async () => {
  const { finiteNonnegative, parseMarketResponse } = await loadModule();
  for (const input of [null, undefined, "", " ", false, true, NaN, Infinity, "NaN", -1, "-1", 1e19]) assert.equal(finiteNonnegative(input), null);
  assert.equal(finiteNonnegative("0"), 0);
  const rows = parseMarketResponse(feed(["BTC", "ETH"], [context({ dayNtlVlm: null, openInterest: "" }), context({ dayNtlVlm: "0", openInterest: "0" })]), "");
  assert.equal(rows[0].volume24hUsd, null);
  assert.equal(rows[0].openInterestUsd, null);
  assert.equal(rows[1].volume24hUsd, 0);
  assert.equal(rows[1].openInterestUsd, 0);
});

test("HIP-3 classification is explicit; forex, unknown names, delisted and invalid marks cannot become stock tiles", async () => {
  const { parseMarketResponse } = await loadModule();
  const payload = feed(["xyz:NVDA", "xyz:XYZ100", "xyz:EWY", "xyz:GOLD", "xyz:JPY", "xyz:UNKNOWN", "xyz:TSLA", "xyz:AAPL", "xyz:AMD", "notxyz:COIN", "xyz:NVDA"], [
    context(), context(), context(), context(), context(), context(), context(), context({ markPx: "0" }), context({ prevDayPx: null }), context(), context()
  ]);
  payload[0].universe[6].isDelisted = true;
  const rows = parseMarketResponse(payload, "xyz");
  assert.deepEqual(rows.map(row => [row.symbol, row.group]), [["NVDA", "stocks"], ["XYZ100", "indices"], ["EWY", "indices"], ["GOLD", "commodities"]]);
  assert.equal(rows[0].id, "xyz:NVDA");
});

test("universe/context index mismatch and a wholly invalid response fail instead of fabricating prices", async () => {
  const { parseMarketResponse } = await loadModule();
  for (const bad of [null, {}, [], [{ universe: [{ name: "BTC" }] }, []], feed(["UNKNOWN"]), feed(["BTC"], [context({ markPx: "invalid" })])]) {
    assert.throws(() => parseMarketResponse(bad, ""));
  }
});

test("public reads coalesce; a four-hour window reuses both sources and never calls a trading endpoint", async () => {
  const { createMarketHeatmapService, REFRESH_MS, INFO_URL } = await loadModule();
  let clock = Date.parse("2026-11-15T00:00:00Z");
  const fixture = feeds({ delay: 10 });
  const service = createMarketHeatmapService({ fetchImpl: fixture.fetchImpl, now: () => clock });
  const [first, concurrent] = await Promise.all([service.getSnapshot(), service.getSnapshot()]);
  assert.deepEqual(first, concurrent);
  assert.equal(fixture.calls.length, 2);
  clock += REFRESH_MS - 1;
  const cached = await service.getSnapshot();
  assert.equal(fixture.calls.length, 2);
  assert.equal(cached.asOf, first.asOf);
  assert.equal(Date.parse(cached.nextRefreshAt), Date.parse(first.asOf) + REFRESH_MS);
  assert.equal(first.stale, false);
  assert.equal(first.refreshSeconds, 14400);
  assert.equal(first.source.marketType, "perpetual-derivatives");
  assert.deepEqual(first.groups.map(group => [group.id, group.assets.length]), [["crypto", 4], ["stocks", 1], ["indices", 1], ["commodities", 1]]);
  for (const call of fixture.calls) {
    assert.equal(call.url, INFO_URL);
    assert.equal(call.init.method, "POST");
    assert.deepEqual(Object.keys(call.body).sort(), ["dex", "type"]);
    assert.equal(call.body.type, "metaAndAssetCtxs");
    assert.equal(call.init.headers.Authorization, undefined);
  }
  clock += 1;
  const refreshed = await service.getSnapshot();
  assert.equal(fixture.calls.length, 4);
  assert.equal(Date.parse(refreshed.asOf), clock);
});

test("one unavailable source preserves genuine partial data and missing groups stay empty", async () => {
  const { createMarketHeatmapService } = await loadModule();
  const fixture = feeds({ xyzFail: true });
  const payload = await createMarketHeatmapService({ fetchImpl: fixture.fetchImpl }).getSnapshot();
  assert.equal(payload.stale, true);
  assert.equal(payload.partial, true);
  assert.equal(payload.groups[0].assets.length, 4);
  assert.ok(payload.groups.slice(1).every(group => group.assets.length === 0));
  assert.equal(payload.sources[1].asOf, null);
  assert.equal(payload.sources[1].status, "unavailable");
});

test("source-specific stale fallback keeps its original date while other source can refresh; expires after 24h", async () => {
  const { createMarketHeatmapService, REFRESH_MS, RETRY_MS, MAX_STALE_MS } = await loadModule();
  let clock = Date.parse("2026-11-15T00:00:00Z");
  let failing = false;
  const fixture = feeds();
  const request = async (url, init) => {
    if (failing && JSON.parse(init.body).dex === "xyz") throw new Error("XYZ down");
    return fixture.fetchImpl(url, init);
  };
  const service = createMarketHeatmapService({ fetchImpl: request, now: () => clock });
  const first = await service.getSnapshot();
  failing = true;
  clock += REFRESH_MS;
  const stale = await service.getSnapshot();
  assert.equal(stale.stale, true);
  assert.equal(stale.partial, false);
  assert.equal(stale.sources[0].asOf, new Date(clock).toISOString());
  assert.equal(stale.sources[1].asOf, first.asOf);
  assert.equal(stale.sources[1].status, "stale");
  assert.ok(stale.groups[1].assets.every(asset => asset.stale && asset.asOf === first.asOf));
  assert.ok(stale.groups[0].assets.every(asset => !asset.stale));
  assert.equal(Date.parse(stale.nextRefreshAt), clock + RETRY_MS);
  clock = Date.parse(first.asOf) + MAX_STALE_MS;
  const expired = await service.getSnapshot();
  assert.equal(expired.partial, true);
  assert.equal(expired.groups[1].assets.length, 0);
  assert.equal(expired.sources[1].asOf, null);
});

test("total outage has a strict decoding deadline and never produces an OK empty heatmap", async () => {
  const { createMarketHeatmapService } = await loadModule();
  const service = createMarketHeatmapService({ fetchImpl: async () => ({ ok: true, json: () => new Promise(() => {}) }), timeoutMs: 20 });
  const start = Date.now();
  await assert.rejects(service.getSnapshot(), /unavailable/);
  assert.ok(Date.now() - start < 1000);
});

test("HTTP handler accepts public reads only and CDN lifetime stops at the original four-hour expiry", async () => {
  const { default: handler, REFRESH_MS } = await loadModule();
  const original = globalThis.__welinkMarketHeatmapV1;
  try {
    const now = Date.now();
    globalThis.__welinkMarketHeatmapV1 = { getSnapshot: async () => ({ ok: true, stale: false,
      asOf: new Date(now - REFRESH_MS + 120_000).toISOString(), nextRefreshAt: new Date(now + 120_000).toISOString() }) };
    const get = responseMock();
    await handler({ method: "GET" }, get);
    assert.equal(get.statusCode, 200);
    const ttl = Number(get.headers["Cache-Control"].match(/s-maxage=(\d+)/)[1]);
    assert.ok(ttl > 0 && ttl <= 120);
    for (const method of ["POST", "PUT", "DELETE"]) {
      const response = responseMock();
      await handler({ method }, response);
      assert.equal(response.statusCode, 405);
      assert.equal(response.headers.Allow, "GET, OPTIONS");
    }
    const options = responseMock();
    await handler({ method: "OPTIONS" }, options);
    assert.equal(options.statusCode, 204);
    globalThis.__welinkMarketHeatmapV1 = { getSnapshot: async () => { throw new Error("down"); } };
    const failed = responseMock();
    await handler({ method: "GET" }, failed);
    assert.equal(failed.statusCode, 502);
    assert.equal(failed.headers["Cache-Control"], "no-store");
  } finally {
    if (original === undefined) delete globalThis.__welinkMarketHeatmapV1;
    else globalThis.__welinkMarketHeatmapV1 = original;
  }
});

test("both new read-only endpoints are registered for Next and native Vercel functions", () => {
  const route = fs.readFileSync("app/api/[legacy]/route.ts", "utf8");
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  for (const name of ["market-heatmap", "address-balance-history"]) {
    assert.ok(route.includes(`"${name}": () => import("@/api/${name}.js")`));
    assert.equal(config.functions[`api/${name}.js`].maxDuration, 60);
  }
});
