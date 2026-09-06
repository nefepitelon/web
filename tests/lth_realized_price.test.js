const test = require("node:test");
const assert = require("node:assert/strict");

const bands = {
  range_0d_1d: 1,
  range_1d_1w: 1,
  range_1w_1m: 1,
  range_1m_3m: 1,
  range_3m_6m: 1,
  range_6m_12m: 2,
  range_12m_18m: 2,
  range_18m_2y: 2,
  range_2y_3y: 2,
  range_3y_5y: 2,
  range_5y_7y: 3,
  range_7y_10y: 4
};

const realizedBands = Object.fromEntries(
  Object.entries(bands).map(([key, supply], index) => [`${key}_usd`, supply * (100 + index * 10)])
);

test("LTH realized-price aggregation weights each cohort by supply", async () => {
  const { aggregateRealizedPrice } = await import("../api/lth-realized-price.js");
  const selected = ["range_6m_12m", "range_12m_18m", "range_18m_2y"];
  const expected = selected.reduce((sum, key) => sum + realizedBands[`${key}_usd`], 0)
    / selected.reduce((sum, key) => sum + bands[key], 0);
  assert.equal(aggregateRealizedPrice(bands, realizedBands, selected), expected);
});

test("LTH series aligns price, supply and realized-cap rows by date", async () => {
  const { buildLthSeries } = await import("../api/lth-realized-price.js");
  const supplyRows = [
    { date: "2026-08-01", ...bands },
    { date: "2026-08-02", ...bands }
  ];
  const realizedRows = [
    { date: "2026-08-02", ...realizedBands },
    { date: "2026-08-01", ...realizedBands }
  ];
  const prices = [
    { date: "2026-08-01", price: 76000 },
    { date: "2026-08-02", price: 78000 }
  ];
  const series = buildLthSeries(supplyRows, realizedRows, prices);

  assert.equal(series.length, 2);
  assert.equal(series[1].date, "2026-08-02");
  assert.equal(series[1].price, 78000);
  assert.ok(series[1].rp6m5y > 0);
  assert.ok(series[1].rp6m10y > series[1].rp6m5y);
});

test("LTH snapshot reports risk and sequential cross progress", async () => {
  const { calculateLthSnapshot } = await import("../api/lth-realized-price.js");
  const series = [
    {
      date: "2026-08-02",
      price: 78000,
      rp0to10y: 32586,
      rp6m5y: 53195,
      rp6m7y: 41743,
      rp6m10y: 29972
    }
  ];
  const snapshot = calculateLthSnapshot(series, {
    value: 77979,
    asOf: "2026-08-04T00:00:00.000Z",
    source: "test"
  });

  assert.equal(snapshot.risk, "high");
  assert.equal(snapshot.completedCrosses, 2);
  assert.deepEqual(snapshot.crossStates, {
    below6m5y: true,
    below6m7y: true,
    below6m10y: false
  });
  assert.equal(snapshot.price, 77979);
  assert.ok(snapshot.premiums.rp6m5y > 0);
});

test("LTH endpoint returns a complete public HODL-wave history", async () => {
  const module = await import("../api/lth-realized-price.js");
  const originalFetch = global.fetch;
  delete global.__welinkLthRealizedPriceCache;
  delete global.__welinkBgeometricsSupplyHistoryCache;
  delete global.__welinkBgeometricsRealizedHistoryCache;
  const dates = Array.from({ length: 1200 }, (_, index) => new Date(Date.UTC(2013, 3, 28 + index)));
  const pairs = (mapper) => dates.map((date, index) => [date.getTime(), mapper(index)]);

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("hodl_waves_supply_btc_price.json")) return Response.json(pairs((index) => 100 + index * 2));
    if (value.includes("hw_age_supply_")) return Response.json(pairs((index) => 1000 + index));
    if (value.endsWith("/realized_cap.json")) return Response.json(pairs((index) => 10_000_000 + index * 10_000));
    if (value.includes("hw_rc_age_")) return Response.json(pairs(() => 8));
    if (value.includes("ticker/price")) {
      return new Response(JSON.stringify({ price: "77979" }), { headers: { "content-type": "application/json" } });
    }
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
    assert.equal(body.series.length, 1200);
    assert.equal(body.series[0].date, "2013-04-28");
    assert.equal(body.snapshot.price, 77979);
    assert.equal(body.methodology, "public_hodl_wave_realized_cap_divided_by_supply");
    assert.equal(body.completeHistory, true);
    assert.equal(body.reconstructedHistory, true);
    assert.match(headers["Cache-Control"], /s-maxage=21600/);
  } finally {
    global.fetch = originalFetch;
    delete global.__welinkLthRealizedPriceCache;
    delete global.__welinkBgeometricsSupplyHistoryCache;
    delete global.__welinkBgeometricsRealizedHistoryCache;
  }
});

test("public LTH cohort reconstruction marks only the post-publication tail as estimated", async () => {
  const { buildPublicLthSeries } = await import("../api/lth-realized-price.js");
  const start = Date.UTC(2023, 0, 1);
  const supplyRows = Array.from({ length: 500 }, (_, index) => {
    const timestamp = start + index * 86_400_000;
    const row = { timestamp, date: new Date(timestamp).toISOString().slice(0, 10), price: 20000 + index * 20 };
    ["age_0d_1d", "age_1d_1w", "age_1w_1m", "age_1m_3m", "age_3m_6m", "age_6m_1y", "age_1y_2y", "age_2y_3y", "age_3y_4y", "age_4y_5y", "age_5y_7y", "age_7y_10y", "age_10y"].forEach((key) => { row[key] = 1000 + index; });
    return row;
  });
  const realizedRows = supplyRows.map((row, index) => ({
    timestamp: row.timestamp,
    date: row.date,
    realizedCap: 1_000_000_000 + index * 1_000_000,
    age_0d_1d: index < 420 ? 6 : 0,
    age_1d_1w: index < 420 ? 6 : 0,
    age_1w_1m: index < 420 ? 6 : 0,
    age_1m_3m: index < 420 ? 6 : 0,
    age_3m_6m: index < 420 ? 6 : 0,
    age_6m_1y: index < 420 ? 8 : 0,
    age_1y_2y: index < 420 ? 10 : 0,
    age_2y_3y: index < 420 ? 10 : 0,
    age_3y_4y: index < 420 ? 10 : 0,
    age_4y_8y: index < 420 ? 20 : 0,
    age_8y_plus: index < 420 ? 6 : 0
  }));
  const series = buildPublicLthSeries(supplyRows, realizedRows);
  assert.equal(series.length, 500);
  assert.equal(series[419].estimated, false);
  assert.equal(series[420].estimated, true);
  assert.ok(Math.abs(series.at(-1).rp6m5y / series[419].rp6m5y - 1) < 0.1);
});
