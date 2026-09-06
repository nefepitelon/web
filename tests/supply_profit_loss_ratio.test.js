const test = require("node:test");
const assert = require("node:assert/strict");

test("supply profit/loss parser reads public BGeometrics CSV rows", async () => {
  const { parsePublicCsv } = await import("../api/supply-profit-loss-ratio.js");
  const csv = "d,unixTs,supplyProfitBtc\n2026-01-01,1767225600,11800000\n2026-01-02,1767312000,11900000";
  assert.deepEqual(parsePublicCsv(csv, ["supplyProfitBtc", "value"]), [
    { date: "2026-01-01", value: 11800000 },
    { date: "2026-01-02", value: 11900000 }
  ]);
});

test("HODL waves parser combines the seven-to-ten-year and ten-year-plus cohorts", async () => {
  const { parseHodlWavesCsv } = await import("../api/supply-profit-loss-ratio.js");
  const csv = "d,unixTs,age_7y_10y,age_10y\n2026-01-01,1767225600,1680000,3570000";
  assert.deepEqual(parseHodlWavesCsv(csv), [
    { date: "2026-01-01", sevenToTen: 1680000, tenPlus: 3570000, dormantOverSeven: 5250000 }
  ]);
});

test("active supply ratio removes dormant seven-year supply and applies a seven-day moving average", async () => {
  const { mergeSupplyProfitLossSeries } = await import("../api/supply-profit-loss-ratio.js");
  const start = Date.UTC(2026, 0, 1);
  const dates = Array.from({ length: 10 }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
  const priceRows = dates.map((date, index) => ({ date, value: 70000 + index * 100 }));
  const profitRows = dates.map((date, index) => ({ date, value: 13000000 + index * 100000 }));
  const lossRows = dates.map((date) => ({ date, value: 2000000 }));
  const hodlRows = dates.map((date) => ({ date, sevenToTen: 1000000, tenPlus: 3000000, dormantOverSeven: 4000000 }));
  const rows = mergeSupplyProfitLossSeries(priceRows, profitRows, lossRows, hodlRows);

  assert.equal(rows.length, 4);
  assert.equal(rows[0].date, dates[6]);
  assert.equal(rows.at(-1).activeProfitSupply, 9900000);
  assert.equal(rows.at(-1).lossSupply, 2000000);
  assert.equal(rows.at(-1).ratioRaw, 4.95);
  assert.ok(Math.abs(rows[0].ratio - 4.65) < 1e-12);
  assert.ok(Math.abs(rows.at(-1).ratio - 4.8) < 1e-12);
});

test("supply profit/loss snapshot identifies a sub-one bottom zone", async () => {
  const { calculateSupplyProfitLossSnapshot } = await import("../api/supply-profit-loss-ratio.js");
  const start = Date.UTC(2026, 0, 1);
  const series = Array.from({ length: 40 }, (_, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    price: 70000 - index * 100,
    ratio: 1.4 - index * 0.02,
    ratioRaw: 1.4 - index * 0.02,
    activeProfitSupply: 8000000,
    lossSupply: 10000000,
    dormantOverSeven: 5000000
  }));
  const snapshot = calculateSupplyProfitLossSnapshot(series, { value: 65000, asOf: "2026-02-09T12:00:00Z" });

  assert.equal(snapshot.price, 65000);
  assert.equal(snapshot.phase, "bottom");
  assert.equal(snapshot.trend, "falling");
  assert.ok(snapshot.ratio < 1);
  assert.ok(snapshot.profitShare < snapshot.lossShare);
  assert.ok(snapshot.daysBelowOne > 0);
});

test("supply profit/loss endpoint returns a cached public daily payload", async () => {
  const module = await import("../api/supply-profit-loss-ratio.js");
  const originalFetch = global.fetch;
  delete global.__welinkSupplyProfitLossRatioCacheV1;
  const start = Date.UTC(2024, 0, 1);
  const dates = Array.from({ length: 400 }, (_, index) => new Date(start + index * 86_400_000));
  const csv = (column, mapper) => [
    `d,unixTs,${column}`,
    ...dates.map((date, index) => `${date.toISOString().slice(0, 10)},${Math.floor(date.getTime() / 1000)},${mapper(index)}`)
  ].join("\n");
  const hodlCsv = [
    "d,unixTs,age_7y_10y,age_10y",
    ...dates.map((date) => `${date.toISOString().slice(0, 10)},${Math.floor(date.getTime() / 1000)},1500000,3500000`)
  ].join("\n");

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("btc-price/csv")) return new Response(csv("btcPrice", (index) => 60000 + index));
    if (value.includes("supply-profit/csv")) return new Response(csv("supplyProfitBtc", (index) => 13000000 + index * 1000));
    if (value.includes("supply-loss/csv")) return new Response(csv("supplyLossBtc", () => 2500000));
    if (value.includes("hodl-waves-supply/csv")) return new Response(hodlCsv);
    if (value.includes("ticker/price")) return new Response(JSON.stringify({ price: "65000" }));
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
    assert.equal(body.series.length, 394);
    assert.equal(body.snapshot.price, 65000);
    assert.equal(body.threshold, 1);
    assert.match(body.sources.history, /BGeometrics/);
    assert.match(body.sources.methodology, /seven years/);
    assert.match(headers["Cache-Control"], /s-maxage=43200/);
  } finally {
    global.fetch = originalFetch;
    delete global.__welinkSupplyProfitLossRatioCacheV1;
  }
});
