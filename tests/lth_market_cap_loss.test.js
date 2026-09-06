const test = require("node:test");
const assert = require("node:assert/strict");

test("LTH loss parser accepts BGeometrics CSV value-key candidates", async () => {
  const { parsePublicCsv } = await import("../api/lth-market-cap-loss.js");
  const csv = "d,unixTs,supplyLossLthUsd\n2026-01-01,1767225600,103000000000\n2026-01-02,1767312000,104000000000";
  assert.deepEqual(parsePublicCsv(csv, ["supplyLossLthUsd", "value"]), [
    { date: "2026-01-01", value: 103000000000 },
    { date: "2026-01-02", value: 104000000000 }
  ]);
});

test("LTH loss parser reads the current 10Y cohort from HODL Waves", async () => {
  const { parsePublicJson } = await import("../api/lth-market-cap-loss.js");
  const rows = parsePublicJson([
    { d: "2026-08-06", unixTs: "1785974400", age_10y: "3571835.53333395" }
  ], ["ancientSupplyBtc", "age_10y"]);
  assert.deepEqual(rows, [{ date: "2026-08-06", value: 3571835.53333395 }]);
});

test("LTH loss series calculates loss market cap against LTH market cap excluding ancient supply", async () => {
  const { mergeLthMarketCapLossSeries } = await import("../api/lth-market-cap-loss.js");
  const rows = mergeLthMarketCapLossSeries(
    [{ date: "2026-01-01", value: 78000 }, { date: "2026-01-02", value: 79000 }],
    [{ date: "2026-01-01", value: 150000000000 }, { date: "2026-01-03", value: 160000000000 }],
    [{ date: "2026-01-01", value: 14000000 }],
    [{ date: "2026-01-01", value: 2000000 }]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].activeLthMarketCap, 936000000000);
  assert.ok(Math.abs(rows[0].ratio - 16.025641025641026) < 1e-12);
});

test("LTH loss snapshot reports rising elevated pressure below 27 percent", async () => {
  const { calculateLthMarketCapLossSnapshot } = await import("../api/lth-market-cap-loss.js");
  const start = Date.UTC(2025, 0, 1);
  const series = Array.from({ length: 40 }, (_, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    price: 72000 + index * 100,
    ratio: 8 + index * 0.08
  }));
  const snapshot = calculateLthMarketCapLossSnapshot(series, { value: 78018, asOf: "2025-02-09T12:00:00Z" });
  assert.equal(snapshot.price, 78018);
  assert.equal(snapshot.trend, "rising");
  assert.equal(snapshot.phase, "elevated");
  assert.equal(snapshot.threshold, 27);
  assert.ok(snapshot.distanceToThreshold < 0);
  assert.ok(snapshot.average7 > snapshot.average30);
});

test("LTH loss endpoint returns a cached public daily payload", async () => {
  const module = await import("../api/lth-market-cap-loss.js");
  const originalFetch = global.fetch;
  delete global.__welinkLthMarketCapLossCacheV6;
  const start = Date.UTC(2024, 0, 1);
  const dates = Array.from({ length: 400 }, (_, index) => new Date(start + index * 86_400_000));
  const csv = (column, mapper) => [
    `d,unixTs,${column}`,
    ...dates.map((date, index) => `${date.toISOString().slice(0, 10)},${Math.floor(date.getTime() / 1000)},${mapper(index)}`)
  ].join("\n");

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("btc-price/csv")) return new Response(csv("btcPrice", (index) => 60000 + index));
    if (value.includes("supply-loss-lth-usd/csv")) return new Response(csv("supplyLossLthUsd", (index) => 90000000000 + index * 1000000));
    if (value.includes("long-term-hodler-supply-btc/csv")) return new Response(csv("longTermHodlerSupplyBtc", () => 14000000));
    if (value.includes("ancient-supply/csv")) return new Response(csv("ancientSupply", () => 2000000));
    if (value.includes("ticker/price")) return new Response(JSON.stringify({ price: "78018" }));
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
    assert.equal(body.snapshot.price, 78018);
    assert.equal(body.threshold, 27);
    assert.ok(body.snapshot.ratio > 0 && body.snapshot.ratio < 27);
    assert.match(body.sources.history, /BGeometrics/);
    assert.match(body.sources.methodology, /LTH supply held 155 days to ten years/);
    assert.match(headers["Cache-Control"], /s-maxage=43200/);
  } finally {
    global.fetch = originalFetch;
    delete global.__welinkLthMarketCapLossCacheV6;
  }
});
