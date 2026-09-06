const test = require("node:test");
const assert = require("node:assert/strict");

test("LTH/STH public CSV parser reads named BGeometrics columns", async () => {
  const { parsePublicCsv } = await import("../api/lth-sth-ratio.js");
  const csv = "d,unixTs,realizedPriceLth\n2026-01-01,1767225600,51000\n2026-01-02,1767312000,52000";
  assert.deepEqual(parsePublicCsv(csv, "realizedPriceLth"), [
    { date: "2026-01-01", value: 51000 },
    { date: "2026-01-02", value: 52000 }
  ]);
});

test("LTH/STH series aligns public price and cost bases by date", async () => {
  const { mergeLthSthSeries } = await import("../api/lth-sth-ratio.js");
  const rows = mergeLthSthSeries(
    [{ date: "2026-01-01", value: 78000 }, { date: "2026-01-02", value: 79000 }],
    [{ date: "2026-01-01", value: 52000 }, { date: "2026-01-02", value: 53000 }],
    [{ date: "2026-01-01", value: 80000 }]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ratio, 0.65);
});

test("LTH/STH snapshot detects a rising recovery above 0.48", async () => {
  const { calculateLthSthSnapshot } = await import("../api/lth-sth-ratio.js");
  const start = Date.UTC(2025, 0, 1);
  const series = Array.from({ length: 40 }, (_, index) => {
    const ratio = 0.43 + index * 0.006;
    const sth = 80000;
    return {
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      price: 78000 + index,
      lth: sth * ratio,
      sth,
      ratio
    };
  });
  const snapshot = calculateLthSthSnapshot(series, { value: 79000, asOf: "2025-02-09T12:00:00Z" });
  assert.equal(snapshot.price, 79000);
  assert.equal(snapshot.trend, "rising");
  assert.equal(snapshot.phase, "recovery");
  assert.ok(snapshot.latestCrossDate);
  assert.ok(snapshot.daysSinceCross > 0);
  assert.ok(snapshot.average7 > snapshot.average30);
});

test("LTH/STH endpoint returns a cached public daily payload", async () => {
  const module = await import("../api/lth-sth-ratio.js");
  const originalFetch = global.fetch;
  delete global.__welinkLthSthRatioCache;
  const start = Date.UTC(2024, 0, 1);
  const dates = Array.from({ length: 400 }, (_, index) => new Date(start + index * 86_400_000));
  const csv = (column, mapper) => [
    `d,unixTs,${column}`,
    ...dates.map((date, index) => `${date.toISOString().slice(0, 10)},${Math.floor(date.getTime() / 1000)},${mapper(index)}`)
  ].join("\n");

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("btc-price/csv")) return new Response(csv("btcPrice", (index) => 60000 + index));
    if (value.includes("realized-price-lth/csv")) return new Response(csv("realizedPriceLth", (index) => 35000 + index * 20));
    if (value.includes("realized-price-sth/csv")) return new Response(csv("realizedPriceSth", (index) => 70000 + index * 10));
    if (value.includes("ticker/price")) return new Response(JSON.stringify({ price: "78000" }));
    throw new Error(`Unexpected URL ${value}`);
  };

  let body;
  const headers = {};
  const response = {
    setHeader(name, value) { headers[name] = value; },
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { body = value; return this; },
    end() {}
  };

  try {
    await module.default({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(body.ok, true);
    assert.equal(body.series.length, 400);
    assert.equal(body.snapshot.price, 78000);
    assert.equal(body.threshold, 0.48);
    assert.match(body.sources.history, /BGeometrics/);
    assert.match(headers["Cache-Control"], /s-maxage=43200/);
  } finally {
    global.fetch = originalFetch;
    delete global.__welinkLthSthRatioCache;
  }
});
