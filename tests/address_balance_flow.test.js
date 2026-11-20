const test = require("node:test");
const assert = require("node:assert/strict");

const loadModule = () => import("../api/address-balance-flow.js");
const DAY_MS = 86_400_000;

function standardBulkPayload(series, days = 46) {
  return series.map((entry, seriesIndex) => ({
    version: 1,
    index: "day1",
    type: "i64",
    start: 0,
    end: days,
    data: Array.from({ length: days }, (_, dayIndex) => (seriesIndex + 1) * 100 + dayIndex)
  }));
}

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; }
  };
}

test("Bitview bulk payload aggregates nine live series into four address cohorts", async () => {
  const { INPUT_SERIES, buildAddressBalanceFlowPayload } = await loadModule();
  const now = Date.parse("2026-11-08T00:00:00.000Z");
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => standardBulkPayload(INPUT_SERIES) };
  };
  const payload = await buildAddressBalanceFlowPayload({ fetchImpl, now });

  assert.equal(calls.length, 1, "all nine inputs must use one public bulk request");
  const requested = new URL(calls[0]);
  assert.equal(requested.origin + requested.pathname, "https://bitview.space/api/series/bulk");
  assert.equal(requested.searchParams.get("index"), "day1");
  assert.equal(requested.searchParams.get("start"), "2026-09-24");
  assert.equal(requested.searchParams.get("end"), "2026-11-09");
  assert.deepEqual(requested.searchParams.get("series").split(","), INPUT_SERIES.map((entry) => entry.name));

  assert.equal(payload.stale, false);
  assert.equal(payload.cadence, "daily");
  assert.equal(payload.asOf, "2026-11-08");
  assert.equal(payload.provisional, true);
  assert.equal(payload.dates.length, 30);
  assert.deepEqual(payload.buckets.map((bucket) => bucket.id), ["under_1", "one_to_10", "ten_to_100", "over_100"]);
  assert.equal(payload.buckets[0].label, "0.001–1 BTC");
  assert.equal(payload.buckets[0].latestChange, 735); // (100+45) + (200+45) + (300+45)
  assert.equal(payload.buckets[1].latestChange, 445);
  assert.equal(payload.buckets[2].latestChange, 545);
  assert.equal(payload.buckets[3].latestChange, 3180); // four 100+ inputs
  assert.equal(payload.buckets[3].series.length, 30);
  assert.equal(payload.buckets[3].series.at(-1).count, null);
  assert.match(payload.sources.primary, /Bitview/);
});

test("bulk normalizer accepts named date-value responses without relying on result order", async () => {
  const { INPUT_SERIES, normalizeBulkSeries } = await loadModule();
  const names = INPUT_SERIES.map((entry) => entry.name);
  const payload = {
    data: Object.fromEntries(names.map((name, index) => [name, [
      ["2026-11-06", index + 1],
      ["2026-11-07", index + 2]
    ]]))
  };
  const normalized = normalizeBulkSeries(payload, names, "2026-11-06");
  assert.equal(normalized[names[0]].get("2026-11-07"), 2);
  assert.equal(normalized[names.at(-1)].get("2026-11-07"), 10);
});

test("range selection preserves 7, 14, 18 and 30-day API views", async () => {
  const { DISPLAY_DAYS, normalizeRequestedDays, selectPayloadDays } = await loadModule();
  const dates = Array.from({ length: DISPLAY_DAYS }, (_, index) => `2026-10-${String(index + 1).padStart(2, "0")}`);
  const payload = {
    dates,
    buckets: [{ id: "under_1", series: dates.map((date, index) => ({ date, change: index })) }]
  };
  for (const days of [7, 14, 18, 30]) {
    const selected = selectPayloadDays(payload, days);
    assert.equal(selected.requestedDays, days);
    assert.equal(selected.dates.length, days);
    assert.equal(selected.buckets[0].series.length, days);
    assert.equal(selected.dates.at(-1), dates.at(-1));
  }
  assert.equal(normalizeRequestedDays(["14"]), 14);
  assert.equal(normalizeRequestedDays("31"), 30);
  assert.equal(normalizeRequestedDays(undefined), 30);
});

test("legacy handler caches the canonical 30-day snapshot while serving requested ranges", async () => {
  const module = await loadModule();
  const originalFetch = globalThis.fetch;
  delete globalThis.__welinkAddressBalanceFlowV1;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => standardBulkPayload(module.INPUT_SERIES) };
  };
  try {
    const shortResponse = responseMock();
    await module.default({ method: "GET", query: { days: "7" } }, shortResponse);
    assert.equal(shortResponse.statusCode, 200);
    assert.equal(shortResponse.body.ok, true);
    assert.equal(shortResponse.body.requestedDays, 7);
    assert.equal(shortResponse.body.dates.length, 7);
    assert.equal(shortResponse.body.buckets.length, 4);
    assert.equal(shortResponse.body.buckets[0].series.length, 7);
    assert.equal(shortResponse.headers["Access-Control-Allow-Origin"], "*");
    assert.equal(shortResponse.headers["X-Welink-Cache"], "MISS");
    assert.equal(shortResponse.headers["Cache-Control"], "public, s-maxage=1800, stale-while-revalidate=86400");

    const fullResponse = responseMock();
    await module.default({ method: "GET", query: { days: "30" } }, fullResponse);
    assert.equal(fullResponse.headers["X-Welink-Cache"], "HIT");
    assert.equal(fullResponse.body.requestedDays, 30);
    assert.equal(fullResponse.body.dates.length, 30);
    assert.equal(fullResponse.body.buckets[0].series.length, 30);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__welinkAddressBalanceFlowV1;
  }
});

test("handler retries a failed refresh and serves a valid snapshot for up to one day", async () => {
  const module = await loadModule();
  const originalFetch = globalThis.fetch;
  const cachedPayload = {
    ok: true,
    stale: false,
    generatedAt: "2026-11-07T00:00:00.000Z",
    cadence: "daily",
    asOf: "2026-11-07",
    dates: ["2026-11-07"],
    buckets: [],
    sources: { primary: "Bitview · Bitcoin Research Kit" }
  };
  globalThis.__welinkAddressBalanceFlowV1 = {
    savedAt: Date.now() - module.CACHE_TTL_MS - DAY_MS / 24,
    payload: cachedPayload
  };
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("upstream unavailable"); };
  try {
    const response = responseMock();
    await module.default({ method: "GET", query: { days: "7" } }, response);
    assert.equal(calls, 2, "refresh should retry once before using stale cache");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["X-Welink-Cache"], "STALE");
    assert.equal(response.body.stale, true);
    assert.equal(response.body.requestedDays, 7);
    assert.equal(response.body.asOf, "2026-11-07");
    assert.match(response.body.warning, /Bitview snapshot/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__welinkAddressBalanceFlowV1;
  }
});

test("handler answers preflight and rejects non-read methods", async () => {
  const { default: handler } = await loadModule();
  const preflight = responseMock();
  await handler({ method: "OPTIONS" }, preflight);
  assert.equal(preflight.statusCode, 204);

  const rejected = responseMock();
  await handler({ method: "POST" }, rejected);
  assert.equal(rejected.statusCode, 405);
  assert.equal(rejected.headers.Allow, "GET, OPTIONS");
});
