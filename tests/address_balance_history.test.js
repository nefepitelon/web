const test = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../api/address-balance-history.js");
const NOW = Date.parse("2026-11-15T12:00:00Z");
function bulk({ dates = ["2026-11-13", "2026-11-14", "2026-11-15"], offset = 6000 } = {}) {
  return [
    { index: "day1", type: "Date", start: offset, data: dates },
    ...Array.from({ length: 9 }, (_, i) => ({ index: "day1", type: "Count", start: offset, data: dates.map((_, d) => i * 100 + 10 + d) })),
    { index: "day1", type: "Dollars", start: offset, data: dates.map((_, d) => 60000 + d * 1000) }
  ];
}
function response() { return { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.statusCode = s; return this; }, json(body) { this.body = body; return this; }, end() { return this; } }; }

test("address history uses absolute cohort totals and independent BTC daily prices", async () => {
  const { normalizeBulk } = await load();
  const rows = normalizeBulk(bulk(), { now: NOW });
  assert.deepEqual(rows[0], ["2026-11-13", 330, 310, 410, 2640, 60000]);
  assert.deepEqual(rows.at(-1), ["2026-11-15", 336, 312, 412, 2648, 62000]);
  // Absolute observations are summed within a date, never accumulated over time.
  assert.notEqual(rows.at(-1)[4], rows.reduce((sum, row) => sum + row[4], 0));
});

test("date indexes align offset series and prevent shifted historical counts", async () => {
  const { normalizeBulk } = await load();
  const data = bulk();
  data[1].start -= 1; data[1].data.unshift(99999);
  const rows = normalizeBulk(data, { now: NOW });
  assert.equal(rows[0][1], 330);
  data[2].start += 1; data[2].data.shift();
  const shorter = normalizeBulk(data, { now: NOW });
  assert.equal(shorter.length, 2);
  assert.equal(shorter[0][0], "2026-11-14");
  assert.equal(shorter[0][1], 333);
});

test("invalid count types, fractional levels, missing series and future dates are rejected", async () => {
  const { normalizeBulk } = await load();
  const deltas = bulk(); deltas[1].type = "i64";
  assert.throws(() => normalizeBulk(deltas, { now: NOW }), /aligned/);
  const fraction = bulk(); fraction[5].data[0] = 5.5;
  assert.equal(normalizeBulk(fraction, { now: NOW }).length, 2);
  assert.throws(() => normalizeBulk(bulk().slice(1), { now: NOW }), /Incomplete/);
  const future = bulk({ dates: ["2026-11-14", "2026-11-15", "2026-11-16"] });
  assert.deepEqual(normalizeBulk(future, { now: NOW }).map((r) => r[0]), ["2026-11-14", "2026-11-15"]);
});

test("unavailable prices stay missing without turning into zero or removing genuine counts", async () => {
  const { normalizeBulk, assemblePayload } = await load();
  const data = bulk(); data.at(-1).data = [0, null, 62000];
  const rows = normalizeBulk(data, { now: NOW });
  assert.equal(rows.length, 3); assert.equal(rows[0][5], null);
  const result = assemblePayload({ rows, now: NOW });
  assert.equal(result.buckets[3].series.length, 3);
  assert.deepEqual(result.prices, [{ date: "2026-11-15", price: 62000 }]);
});

test("recent observations replace archive overlap while preserving the full early history", async () => {
  const { buildAddressHistoryPayload, NAMES } = await load();
  let requested;
  const archiveData = { asOf: "2026-11-14", rows: [["2010-07-18", 1, 2, 3, 4, .08], ["2026-11-14", 1, 2, 3, 4, 1]] };
  const result = await buildAddressHistoryPayload({ now: NOW, archiveData, fetchImpl: async (url) => { requested = new URL(url); return { ok: true, json: async () => bulk() }; } });
  assert.deepEqual(requested.searchParams.get("series").split(","), NAMES);
  assert.ok(NAMES.every((name) => !name.includes("delta")));
  assert.equal(result.coverage.start, "2010-07-18");
  assert.equal(result.buckets[3].series.find((p) => p.date === "2026-11-14").count, 2644);
  assert.equal(result.prices.find((p) => p.date === "2026-11-14").price, 61000);
  assert.equal(result.stale, false); assert.equal(result.provisional, true);
});

test("a provider failure returns dated archived observations with an explicit stale state", async () => {
  const { buildAddressHistoryPayload } = await load();
  const archiveData = { asOf: "2026-10-01", rows: [["2026-09-30", 1, 2, 3, 4, 60000], ["2026-10-01", 2, 3, 4, 5, 61000]] };
  let requested;
  const result = await buildAddressHistoryPayload({ now: NOW, archiveData, fetchImpl: async (url) => { requested = new URL(url); throw new Error("offline"); } });
  assert.equal(requested.searchParams.get("start"), "2026-10-01", "fetch the archive gap even when it exceeds the usual lookback");
  assert.equal(result.stale, true); assert.equal(result.archiveFallback, true);
  assert.equal(result.asOf, "2026-10-01");
  assert.equal(result.buckets[3].series.at(-1).count, 5);
});

test("a live HTTP response with old source dates remains visibly stale", async () => {
  const { buildAddressHistoryPayload } = await load();
  const result = await buildAddressHistoryPayload({ now: NOW, archiveData: { rows: [] }, fetchImpl: async () => ({ ok: true, json: async () => bulk({ dates: ["2026-10-01", "2026-10-02"] }) }) });
  assert.equal(result.stale, true); assert.equal(result.archiveFallback, false);
  assert.equal(result.asOf, "2026-10-02");
});

test("bundled public archive preserves full daily history and exact >=100 BTC levels", async () => {
  const { default: archive } = await import("../data/bitcoin-address-balance-history.js");
  assert.ok(archive.rows.length > 5900);
  assert.equal(archive.rows[0][0], "2010-07-17");
  assert.ok(archive.rows.every((row, i) => row.slice(1, 5).every((value) => Number.isInteger(value) && value >= 0) && (!i || Date.parse(row[0]) - Date.parse(archive.rows[i - 1][0]) === 86400000)));
  assert.equal(archive.rows.find((row) => row[0] === "2026-11-14")[4], 20269);
  assert.equal(archive.license, "CC BY 4.0");
});

test("read-only endpoint rejects mutations and coalesces concurrent refresh requests", async () => {
  const { default: handler } = await load(); const original = globalThis.fetch;
  delete globalThis.__welinkAddressBalanceHistoryV1;
  const rejected = response(); await handler({ method: "POST" }, rejected); assert.equal(rejected.statusCode, 405);
  const options = response(); await handler({ method: "OPTIONS" }, options); assert.equal(options.statusCode, 204);
  let calls = 0;
  globalThis.fetch = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 15)); return { ok: true, json: async () => bulk() }; };
  try {
    const a = response(), b = response(); await Promise.all([handler({ method: "GET" }, a), handler({ method: "GET" }, b)]);
    assert.equal(calls, 1); assert.equal(a.statusCode, 200); assert.equal(a.body.coverage.start, "2010-07-17");
    assert.deepEqual(a.body, b.body);
    await handler({ method: "GET" }, response()); assert.equal(calls, 1);
  } finally { globalThis.fetch = original; delete globalThis.__welinkAddressBalanceHistoryV1; }
});

test("an upstream outage cannot roll back a newer warm-cache observation to the bundled archive", async () => {
  const { default: handler } = await load(); const original = globalThis.fetch; const originalNow = Date.now;
  Date.now = () => Date.parse("2026-11-17T12:00:00Z");
  globalThis.__welinkAddressBalanceHistoryV1 = { savedAt: 0, payload: { ok: true, asOf: "2026-11-16", stale: false, observation: "latest valid record" } };
  globalThis.fetch = async () => { throw new Error("provider offline"); };
  try {
    const res = response(); await handler({ method: "GET" }, res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.asOf, "2026-11-16");
    assert.equal(res.body.observation, "latest valid record"); assert.equal(res.body.stale, true);
    assert.match(res.headers["Cache-Control"], /s-maxage=300/);
  } finally { globalThis.fetch = original; Date.now = originalNow; delete globalThis.__welinkAddressBalanceHistoryV1; }
});
