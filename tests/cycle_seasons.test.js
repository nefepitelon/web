const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const loadModule = () => import("../api/cycle-seasons.js");
const DAY_MS = 86_400_000;

function csvRows(rows) {
  return "https://www.CryptoDataDownload.com\nunix,date,symbol,open,high,low,close,Volume BTC,Volume USD\n" + rows.map(row =>
    [Date.parse(row.date) / 1000, row.date, "BTC/USD", row.open, row.high, row.low, row.close, 1, 100].join(",")
  ).join("\n");
}

function recentCsv(now) {
  const day = Math.floor(now / DAY_MS) * DAY_MS;
  return csvRows(Array.from({ length: 370 }, (_, index) => ({
    date: new Date(day - (369 - index) * DAY_MS).toISOString().slice(0, 10),
    open: 70_000 + index, high: 71_000 + index, low: 69_000 + index, close: 70_500 + index
  })).reverse());
}

function mockFeeds(now, { quoteTime = now, quotePrice = 99_999, historyFails = false, quoteFails = false } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes("cryptodatadownload")) {
      if (historyFails) throw new Error("History unavailable");
      return { ok: true, text: async () => recentCsv(now) };
    }
    if (quoteFails) throw new Error("Quote unavailable");
    return { ok: true, json: async () => ({ lastPrice: String(quotePrice), closeTime: quoteTime }) };
  };
  return { calls, fetchImpl };
}

function clearCaches() {
  for (const key of ["__welinkCycleSeasonsV1", "__welinkCycleSeasonsHistoryV1", "__welinkCycleSeasonsPendingV1"]) delete globalThis[key];
}

function responseMock() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end(value) { this.body = value; return this; }
  };
}

test("public CSV parsing uses Unix UTC dates, sorts, deduplicates and rejects future or impossible OHLC", async () => {
  const { parseDailyOhlcCsv } = await loadModule();
  const input = csvRows([
    { date: "2026-11-10", open: 110, high: 120, low: 100, close: 115 },
    { date: "2026-11-09", open: 100, high: 110, low: 90, close: 105 },
    { date: "2026-11-09", open: 101, high: 111, low: 91, close: 106 },
    { date: "2026-11-08", open: 100, high: 50, low: 90, close: 105 },
    { date: "2027-01-01", open: 999, high: 1000, low: 990, close: 999 }
  ]);
  const rows = parseDailyOhlcCsv(input, Date.parse("2026-11-10T10:00:00Z"));
  assert.deepEqual(rows.map(row => row.date), ["2026-11-09", "2026-11-10"]);
  assert.equal(rows[0].open, 101);
  assert.throws(() => parseDailyOhlcCsv("invalid"), /header/);
});

test("weekly bars retain actual first open, extrema and last close in chronological UTC Monday groups", async () => {
  const { aggregateWeeklyCandles } = await loadModule();
  const rows = aggregateWeeklyCandles([
    { date: "2026-11-08", open: 120, high: 150, low: 118, close: 140 },
    { date: "2026-11-02", open: 100, high: 125, low: 95, close: 120 },
    { date: "2026-11-09", open: 140, high: 145, low: 130, close: 135 }
  ], Date.parse("2026-11-10"));
  assert.deepEqual(rows, [
    { date: "2026-11-02", open: 100, high: 150, low: 95, close: 140 },
    { date: "2026-11-09", open: 140, high: 145, low: 130, close: 135 }
  ]);
});

test("bundled public history covers complete 2014-onward cycles without invented or unfinished archived weeks", async () => {
  const { CYCLE_SEASONS_ARCHIVE: archive } = await import("../data/bitcoin-cycle-weekly.js");
  assert.equal(archive.candles[0].date, "2014-01-06");
  assert.ok(archive.candles.length >= 670);
  for (let index = 1; index < archive.candles.length; index += 1) {
    assert.equal(Date.parse(archive.candles[index].date) - Date.parse(archive.candles[index - 1].date), 7 * DAY_MS);
  }
  assert.ok(Date.parse(archive.candles.at(-1).date) + 7 * DAY_MS <= Date.parse(archive.capturedAt));
  assert.match(archive.sources[0].url, /bitstamp\/1day/);
  assert.equal(archive.sources[0].sha, "33b0f78030ccf6f3070ea25c441145f51877a3eb");
  assert.match(archive.sources[0].license, /CC BY-SA/);
});

test("fresh public history merges with early archive; future slots stay empty and live USDT never alters USD candles", async () => {
  clearCaches();
  const { buildCycleSeasonsPayload } = await loadModule();
  const now = Date.parse("2026-11-10T08:00:00Z");
  const feeds = mockFeeds(now);
  try {
    const payload = await buildCycleSeasonsPayload({ fetchImpl: feeds.fetchImpl, now });
    assert.equal(payload.ok, true);
    assert.equal(payload.stale, false);
    assert.equal(payload.quote.price, 99_999);
    assert.equal(payload.quote.currency, "USDT");
    assert.equal(payload.quote.timestamp, new Date(now).toISOString());
    assert.deepEqual(payload.rows.map(row => [row.startYear, row.endYear]), [[2014, 2017], [2018, 2021], [2022, 2025], [2026, 2029]]);
    assert.equal(payload.coverage.start, "2014-01-06");
    const current = payload.rows.at(-1);
    assert.ok(current.candles.length < 53);
    assert.ok(current.candles.every(row => row.date >= "2026-01-01" && row.date <= "2026-11-10"));
    assert.equal(current.candles.at(-1).close, 70_869);
    assert.notEqual(current.candles.at(-1).close, payload.quote.price);
    assert.equal(feeds.calls.length, 2);
    assert.match(payload.methodology, /never modifies USD/);
  } finally { clearCaches(); }
});

test("hourly history cache avoids full downloads while public quotes continue refreshing", async () => {
  clearCaches();
  const { buildCycleSeasonsPayload } = await loadModule();
  const now = Date.parse("2026-11-10T08:00:00Z");
  const feeds = mockFeeds(now);
  try {
    await buildCycleSeasonsPayload({ fetchImpl: feeds.fetchImpl, now });
    await buildCycleSeasonsPayload({ fetchImpl: feeds.fetchImpl, now: now + 6 * 60_000 });
    assert.equal(feeds.calls.filter(url => url.includes("cryptodatadownload")).length, 1);
    assert.equal(feeds.calls.filter(url => url.includes("ticker")).length, 2);
  } finally { clearCaches(); }
});

test("a public mirror beginning on Friday cannot overwrite the complete archived join week", async () => {
  clearCaches();
  const { buildCycleSeasonsPayload } = await loadModule();
  const { CYCLE_SEASONS_ARCHIVE: archive } = await import("../data/bitcoin-cycle-weekly.js");
  const now = Date.parse("2015-12-03T08:00:00Z");
  const daily = Array.from({ length: 370 }, (_, index) => ({
    date: new Date(Date.parse("2014-11-28") + index * DAY_MS).toISOString().slice(0, 10),
    open: 100, high: 120, low: 90, close: 110
  }));
  const fetchImpl = async url => url.includes("cryptodatadownload")
    ? { ok: true, text: async () => csvRows(daily) }
    : { ok: true, json: async () => ({ lastPrice: "110", closeTime: now }) };
  try {
    const payload = await buildCycleSeasonsPayload({ fetchImpl, now });
    const rows = payload.rows[0].candles;
    assert.deepEqual(rows.find(row => row.date === "2014-11-24"), archive.candles.find(row => row.date === "2014-11-24"));
    assert.equal(rows.find(row => row.date === "2014-12-01").open, 100, "first fully covered Monday can refresh from the mirror");
  } finally { clearCaches(); }
});

test("quote failure uses dated history, marks stale and does not claim a fresh quote timestamp", async () => {
  clearCaches();
  const { buildCycleSeasonsPayload } = await loadModule();
  const now = Date.parse("2026-11-10T08:00:00Z");
  try {
    const payload = await buildCycleSeasonsPayload({ fetchImpl: mockFeeds(now, { quoteFails: true }).fetchImpl, now });
    assert.equal(payload.stale, true);
    assert.equal(payload.quote.live, false);
    assert.equal(payload.quote.currency, "USD");
    assert.equal(payload.quote.timestamp, "2026-11-10T00:00:00.000Z");
  } finally { clearCaches(); }
});

test("stale upstream quote or future timestamp cannot be labeled live; history outage retains dated archive", async () => {
  const { buildCycleSeasonsPayload } = await loadModule();
  const now = Date.parse("2026-11-10T08:00:00Z");
  for (const quoteTime of [now - 16 * 60_000, now + 2 * 60_000]) {
    clearCaches();
    const payload = await buildCycleSeasonsPayload({ fetchImpl: mockFeeds(now, { quoteTime, historyFails: true }).fetchImpl, now });
    assert.equal(payload.archiveFallback, true);
    assert.equal(payload.quote.live, false);
    assert.equal(payload.stale, true);
    assert.equal(payload.historyAsOf, "2026-11-08");
    assert.equal(payload.coverage.start, "2014-01-06");
  }
  clearCaches();
});

test("handler coalesces concurrent upstream refreshes, serves five-minute cache and only accepts reads", async () => {
  clearCaches();
  const { default: handler } = await loadModule();
  const originalFetch = globalThis.fetch;
  const feeds = mockFeeds(Date.now());
  globalThis.fetch = feeds.fetchImpl;
  try {
    const first = responseMock(), second = responseMock();
    await Promise.all([handler({ method: "GET" }, first), handler({ method: "GET" }, second)]);
    assert.equal(feeds.calls.length, 2);
    assert.equal(first.statusCode, 200);
    assert.equal(first.headers["Cache-Control"], "public, s-maxage=300, stale-while-revalidate=600");
    assert.equal(first.body.quote.currency, "USDT");
    const cached = responseMock();
    await handler({ method: "GET" }, cached);
    assert.equal(cached.headers["X-Welink-Cache"], "HIT");
    assert.equal(feeds.calls.length, 2);
    const options = responseMock();
    await handler({ method: "OPTIONS" }, options);
    assert.equal(options.statusCode, 204);
    const rejected = responseMock();
    await handler({ method: "POST" }, rejected);
    assert.equal(rejected.statusCode, 405);
    assert.equal(rejected.headers.Allow, "GET, OPTIONS");
  } finally { globalThis.fetch = originalFetch; clearCaches(); }
});

test("Next legacy route explicitly exposes the new read-only public endpoint", () => {
  const route = fs.readFileSync(new URL("../app/api/[legacy]/route.ts", `file://${__filename.replace(/\\/g, "/")}`), "utf8");
  assert.match(route, /"cycle-seasons": \(\) => import\("@\/api\/cycle-seasons\.js"\)/);
});
