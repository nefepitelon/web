const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../lib/legacy-handlers/asset-daily-report.js");
const DAY = 86_400_000;
const CLOCK = Date.parse("2026-11-16T12:00:00Z");
const context = (extra = {}) => ({ markPx: "120", prevDayPx: "100", dayNtlVlm: "123456", openInterest: "7", funding: "0.0001", ...extra });
const feed = names => [{ universe: names.map(name => ({ name })) }, names.map(() => context())];
const news = async (_asset, { now }) => ({ news: { status: "available", asOf: new Date(now()).toISOString(), items: [{ id: "n1", title: "公开报道", summary: "已明确来源的报道摘要", url: "https://www.panewslab.com/zh/articles/example", publishedAt: new Date(now() - 3600000).toISOString(), sourceName: "PANews", kind: "news" }] },
  xMonitor: { status: "unavailable", asOf: new Date(now()).toISOString(), items: [], searchUrl: "https://x.com/search?q=BTC%20lang%3Azh&f=live", note: "无可核验公开X内容" }, sources: [] });
function fixture(clock = () => CLOCK) {
  const calls = [];
  let fail = false;
  return { calls, setFail(value) { fail = value; }, fetchImpl: async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, init, body });
    if (fail) throw new Error("Offline");
    let payload;
    if (body?.type === "metaAndAssetCtxs") payload = feed(body.dex === "xyz" ? ["xyz:NVDA", "xyz:GOLD", "xyz:SP500"] : ["BTC", "ETH", "SOL", "HYPE", "AAVE", "XRP"]);
    else if (body?.type === "candleSnapshot") payload = Array.from({ length: 46 }, (_, index) => {
      const start = Math.floor(clock() / DAY) * DAY - (45 - index) * DAY;
      return { s: body.req.coin, i: "1d", t: start, T: start + DAY - 1, c: String(100 + index), v: "12" };
    });
    else if (url.includes("hashrate")) payload = { hashrates: Array.from({ length: 30 }, (_, index) => ({ timestamp: Math.floor(clock() / DAY) * 86400 - (29 - index) * 86400, avgHashrate: 900e18 + index * 1e18 })) };
    else if (url.includes("fees/recommended")) payload = { fastestFee: 0 };
    else if (url.includes("/historicalChainTvl/")) payload = Array.from({ length: 46 }, (_, index) => ({ date: Math.floor(clock() / DAY) * 86400 - (45 - index) * 86400, tvl: 100 + index }));
    else if (url.includes("/protocol/")) payload = { tvl: Array.from({ length: 46 }, (_, index) => ({ date: Math.floor(clock() / DAY) * 86400 - (45 - index) * 86400, totalLiquidityUSD: 100 + index })) };
    else if (url.includes("/fees/")) payload = { totalDataChart: Array.from({ length: 46 }, (_, index) => [Math.floor(clock() / DAY) * 86400 - (45 - index) * 86400, 100 + index]), total24h: 999999 };
    else throw new Error("Unexpected public URL: " + url);
    return { ok: true, status: 200, json: async () => payload };
  } };
}
function response() {
  return { statusCode: 200, headers: {}, body: null, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
}

test("daily changes require the actual target date rather than an older available point", async () => {
  const { changeAt } = await load();
  const point = (days, value) => ({ time: new Date(CLOCK - days * DAY).toISOString(), value });
  assert.equal(changeAt([point(2, 100), point(0, 120)], 1), null);
  assert.equal(changeAt([point(8, 100), point(0, 120)], 7), null);
  assert.ok(Math.abs(changeAt([point(7, 100), point(0, 120)], 7) - 20) < 1e-8);
});

test("successfully returned old candles are explicitly stale despite a fresh quote", async () => {
  const { createAssetDailyReportService } = await load();
  const f = fixture();
  const fetchImpl = async (url, init) => {
    if (init.body && JSON.parse(init.body).type === "candleSnapshot") {
      const body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => [22, 21].map(days => {
        const start = Math.floor(CLOCK / DAY) * DAY - days * DAY;
        return { s: body.req.coin, i: "1d", t: start, T: start + DAY - 1, c: "100", v: "12" };
      }) };
    }
    return f.fetchImpl(url, init);
  };
  const report = await createAssetDailyReportService({ fetchImpl, now: () => CLOCK, getNewsImpl: news }).getReport("SOL");
  assert.equal(report.quote.status, "fresh");
  assert.equal(report.coverage.priceHistory, "stale");
  assert.equal(report.sources.find(source => source.id === "price-history").status, "stale");
  assert.equal(report.stale, true);
});

test("strict allowlist is identical to known heatmap classification and never accepts URLs or arbitrary symbols", async () => {
  const { resolveAsset, createAssetDailyReportService } = await load();
  assert.equal(resolveAsset("BTC").group, "crypto");
  assert.equal(resolveAsset("xyz:NVDA").group, "stocks");
  assert.equal(resolveAsset("xyz:GOLD").group, "commodities");
  assert.equal(resolveAsset("xyz:SP500").group, "indices");
  for (const id of ["NVDA", "xyz:BTC", "xyz:JPY", "btC", "https://evil.test", "../BTC", "UNKNOWN", ["BTC"], null]) assert.equal(resolveAsset(id), null);
  let calls = 0;
  const service = createAssetDailyReportService({ fetchImpl: async () => { calls++; }, getNewsImpl: news });
  await assert.rejects(service.getReport("https://evil.test"), { code: "INVALID_ASSET" });
  assert.equal(calls, 0);
});

test("report uses actual quote, funding, original daily history, chain observations and evidence links", async () => {
  const { createAssetDailyReportService } = await load();
  const f = fixture();
  const report = await createAssetDailyReportService({ fetchImpl: f.fetchImpl, now: () => CLOCK, getNewsImpl: news }).getReport("SOL");
  assert.equal(report.asset.id, "SOL");
  assert.equal(report.quote.price, 120);
  assert.equal(report.quote.openInterestUsd, 840);
  assert.equal(report.quote.volume24hUsd, 123456);
  assert.equal(report.quote.fundingRate, 0.0001);
  assert.ok(Math.abs(report.quote.change24hPct - 20) < 1e-8);
  assert.equal(report.priceSeries.length, 46);
  assert.equal(report.priceSeries.at(-1).close, 145);
  assert.equal(report.priceSeries.at(-1).volumeUsd, null);
  assert.equal(report.priceSeries.at(-1).volumeBase, 12);
  assert.equal(report.priceSeries.at(-1).provisional, true);
  assert.equal(report.priceSeries.at(-1).time, new Date(CLOCK).toISOString());
  assert.equal(report.trends.length, 3);
  assert.equal(report.trends[1].current, 145);
  assert.notEqual(report.trends[1].current, 999999, "rolling24h total is not substituted for the daily history");
  assert.ok(Math.abs(report.trends[1].change7dPct - ((145 / 138 - 1) * 100)) < 1e-8);
  assert.equal(report.evidence.method, "rules");
  assert.equal(report.xMonitor.items.length, 0);
  assert.equal(report.coverage.x, "unavailable");
  assert.equal(report.partial, true);
  assert.ok(report.timeline.some(item => item.id === "n1"));
  assert.ok(report.timeline.every(item => Date.parse(item.publishedAt) <= CLOCK));
  assert.equal(report.sources.find(item => item.id === "quote").url, "https://api.hyperliquid.xyz/info");
  assert.ok(f.calls.every(call => call.init.redirect === "error" && !call.init.headers.Authorization));
  assert.ok(f.calls.every(call => /^(https:\/\/api\.hyperliquid\.xyz\/info|https:\/\/api\.llama\.fi\/)/.test(call.url)));
});

test("quote refreshes independently at60s while 5min report/news/trend cache is reused and concurrent readers coalesce", async () => {
  const { createAssetDailyReportService, QUOTE_TTL_MS, REPORT_TTL_MS } = await load();
  let clock = CLOCK, newsCalls = 0;
  const f = fixture(() => clock);
  const service = createAssetDailyReportService({ fetchImpl: f.fetchImpl, now: () => clock, getNewsImpl: async (...args) => { newsCalls++; return news(...args); } });
  const [first, duplicate] = await Promise.all([service.getReport("SOL"), service.getReport("SOL")]);
  assert.deepEqual(first, duplicate);
  assert.equal(f.calls.filter(c => c.body?.type === "metaAndAssetCtxs").length, 1);
  assert.equal(f.calls.filter(c => c.body?.type === "candleSnapshot").length, 1);
  clock += QUOTE_TTL_MS;
  const updated = await service.getReport("SOL");
  assert.equal(newsCalls, 1);
  assert.equal(updated.generatedAt, first.generatedAt);
  assert.notEqual(updated.quote.asOf, first.quote.asOf);
  assert.equal(f.calls.filter(c => c.body?.type === "metaAndAssetCtxs").length, 2);
  assert.equal(f.calls.filter(c => c.body?.type === "candleSnapshot").length, 1);
  assert.ok(Date.parse(updated.nextRefreshAt) - clock <= QUOTE_TTL_MS);
  clock = CLOCK + REPORT_TTL_MS;
  const refreshed = await service.getReport("SOL");
  assert.equal(newsCalls, 2);
  assert.notEqual(refreshed.generatedAt, first.generatedAt);
});

test("synthetic securities never inherit crypto chain metrics and historical OI is never invented", async () => {
  const { createAssetDailyReportService } = await load();
  const f = fixture();
  const report = await createAssetDailyReportService({ fetchImpl: f.fetchImpl, now: () => CLOCK, getNewsImpl: news }).getReport("xyz:NVDA");
  assert.equal(report.asset.market, "perpetual");
  assert.equal(report.trends[0].status, "not-applicable");
  assert.equal(report.coverage.chain, "not-applicable");
  assert.ok(!f.calls.some(call => call.url.includes("llama")));
  assert.ok(!report.trends.some(trend => /open.interest|oi-history/i.test(trend.id)));
  assert.ok(!("openInterestSeries" in report));
});

test("protocol TVL uses real totalLiquidityUSD observations rather than assuming a chain TVL shape", async () => {
  const { createAssetDailyReportService } = await load();
  const f = fixture();
  const report = await createAssetDailyReportService({ fetchImpl: f.fetchImpl, now: () => CLOCK, getNewsImpl: news }).getReport("AAVE");
  const tvl = report.trends.find(trend => trend.id === "chain-tvl");
  assert.equal(tvl.current, 145);
  assert.equal(tvl.status, "fresh");
  assert.ok(tvl.sourceUrl.endsWith("/protocol/aave"));
  assert.equal(tvl.series.length, 46);
});

test("unsupported token chain mapping is explicitly unavailable and missing market does not borrow another quote", async () => {
  const { createAssetDailyReportService } = await load();
  const f = fixture();
  const service = createAssetDailyReportService({ fetchImpl: f.fetchImpl, now: () => CLOCK, getNewsImpl: news });
  const report = await service.getReport("XRP");
  assert.equal(report.trends[0].current, null);
  assert.equal(report.trends[0].status, "unavailable");
  await assert.rejects(service.getReport("ZEC"), /no valid public quote/);
});

test("BTC network values preserve zero and EH/s conversion above1e18 with only genuine hashrate history", async () => {
  const { createAssetDailyReportService } = await load();
  const f = fixture();
  const report = await createAssetDailyReportService({ fetchImpl: f.fetchImpl, now: () => CLOCK, getNewsImpl: news }).getReport("BTC");
  const hash = report.trends.find(t => t.id === "btc-hashrate"), fee = report.trends.find(t => t.id === "btc-priority-fee");
  assert.equal(hash.unit, "EH/s");
  assert.equal(hash.current, 929);
  assert.equal(fee.current, 0);
  assert.deepEqual(fee.series, []);
  assert.equal(fee.change24hPct, null);
});

test("price parser rejects mismatched symbols, future or malformed points without manufacturing missing days", async () => {
  const { parseCandles, resolveAsset, parseSeries, changeAt } = await load();
  const good = { s: "BTC", i: "1d", t: CLOCK - 2 * DAY, T: CLOCK - DAY - 1, c: "99", v: "2" };
  const current = { ...good, t: CLOCK - DAY, T: CLOCK - 1, c: "101" };
  const result = parseCandles([good, current, { ...good, s: "ETH" }, { ...good, t: CLOCK + DAY, T: CLOCK + 2 * DAY }, { ...good, t: CLOCK - 4 * DAY, T: CLOCK - 3 * DAY, c: "NaN" }], resolveAsset("BTC"), CLOCK);
  assert.equal(result.length, 2);
  assert.ok(result.every(point => Date.parse(point.time) <= CLOCK));
  assert.throws(() => parseCandles([{ ...good, s: "ETH" }], resolveAsset("BTC"), CLOCK));
  const chain = parseSeries([{ date: CLOCK / 1000 - DAY / 1000, tvl: 0 }, { date: CLOCK / 1000 + DAY / 1000, tvl: 100 }, { date: CLOCK / 1000, tvl: 1 }], "tvl", CLOCK);
  assert.equal(chain.length, 2);
  assert.equal(changeAt(chain, 1), null, "zero denominator stays unavailable");
  assert.equal(changeAt(chain, 30), null, "insufficient history is never extrapolated");
});

test("bounded dated quote fallback expires after15min and failed sources do not trigger repeated calls inside retry window", async () => {
  const { createAssetDailyReportService, QUOTE_TTL_MS, QUOTE_MAX_STALE_MS } = await load();
  let clock = CLOCK;
  const f = fixture(() => clock);
  const service = createAssetDailyReportService({ fetchImpl: f.fetchImpl, now: () => clock, getNewsImpl: news });
  const first = await service.getReport("SOL");
  f.setFail(true); clock += QUOTE_TTL_MS;
  const stale = await service.getReport("SOL");
  assert.equal(stale.quote.asOf, first.quote.asOf);
  assert.equal(stale.quote.status, "stale");
  assert.equal(stale.stale, true);
  const count = f.calls.length;
  await service.getReport("SOL");
  assert.equal(f.calls.length, count);
  clock = CLOCK + QUOTE_MAX_STALE_MS;
  await assert.rejects(service.getReport("SOL"));
});

test("per-source outages retain usable quote/report data, expose actual missing series and cannot produce fake success", async () => {
  const { createAssetDailyReportService } = await load();
  const f = fixture();
  const report = await createAssetDailyReportService({ now: () => CLOCK,
    fetchImpl: (url, init) => JSON.parse(init.body || "null")?.type === "metaAndAssetCtxs" ? f.fetchImpl(url, init) : Promise.reject(new Error("Offline")),
    getNewsImpl: async () => { throw new Error("News down"); } }).getReport("SOL");
  assert.equal(report.quote.price, 120);
  assert.deepEqual(report.priceSeries, []);
  assert.ok(report.trends.every(t => t.current === null));
  assert.deepEqual(report.news.items, []);
  assert.equal(report.news.status, "unavailable");
  assert.equal(report.partial, true);
  assert.ok(report.timeline.every(t => t.kind === "market"));
});

test("public fetch bounds decoding and oversized content, disallows redirect and aborts timedout bodies", async () => {
  const { requestJson } = await load();
  let seen;
  await assert.rejects(requestJson(async (_url, init) => { seen = init; return { ok: true, json: () => new Promise(() => {}) }; }, "https://api.hyperliquid.xyz/info", { timeoutMs: 10 }), /timeout/);
  assert.equal(seen.signal.aborted, true);
  assert.equal(seen.redirect, "error");
  await assert.rejects(requestJson(async () => ({ ok: true, headers: { get: () => "5000001" }, json: async () => [] }), "https://api.hyperliquid.xyz/info", { timeoutMs: 100 }), /too large/);
});

test("POST accepts asset only, fetches server report before evidence and never trusts browser-supplied evidence", async () => {
  const { createAssetDailyReportHandler, createAssetDailyReportService } = await load();
  const f = fixture(); let captured;
  const service = createAssetDailyReportService({ fetchImpl: f.fetchImpl, now: () => CLOCK, getNewsImpl: news,
    getEvidenceImpl: async report => { captured = report; return { status: "ready", method: "surf-ai", summary: "引用已核验观测", signals: [] }; } });
  const handler = createAssetDailyReportHandler(service);
  for (const raw of [{ asset: "BTC", report: { quote: 999999 } }, { asset: ["BTC"] }, "invalid", { asset: "../BTC" }]) {
    const res = response(); await handler({ method: "POST", body: raw }, res); assert.equal(res.statusCode, 400);
  }
  assert.equal(f.calls.length, 0);
  const res = response(); await handler({ method: "POST", body: JSON.stringify({ asset: "BTC" }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.assetId, "BTC");
  assert.equal(res.body.evidence.method, "surf-ai");
  assert.equal(captured.quote.price, 120);
  assert.equal(res.headers["Cache-Control"], "no-store");
  const over = response(); await handler({ method: "POST", body: "x".repeat(1025) }, over); assert.equal(over.statusCode, 413);
});

test("GET validates repeated/missing assets before fetch, supports query URL and returns safe public failure only", async () => {
  const { createAssetDailyReportHandler } = await load();
  let calls = 0;
  const handler = createAssetDailyReportHandler({ getReport: async id => { calls++; if (id === "SOL") throw new Error("secret upstream details"); return { ok: true, asset: { id } }; } });
  for (const query of [{ asset: ["BTC", "ETH"] }, {}, { asset: "xyz:UNKNOWN" }]) {
    const res = response(); await handler({ method: "GET", query }, res); assert.equal(res.statusCode, 400);
  }
  assert.equal(calls, 0);
  const res = response(); await handler({ method: "GET", url: "/api/asset-daily-report?asset=BTC" }, res);
  assert.equal(res.body.asset.id, "BTC");
  const fail = response(); await handler({ method: "GET", query: { asset: "SOL" } }, fail);
  assert.equal(fail.statusCode, 502);
  assert.ok(!JSON.stringify(fail.body).includes("secret"));
  const method = response(); await handler({ method: "DELETE" }, method); assert.equal(method.statusCode, 405);
});
