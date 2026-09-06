const test = require("node:test");
const assert = require("node:assert/strict");

test("median realized price parses the official public latest-value card", async () => {
  const { parseGlassnodeLatestValue } = await import("../api/median-realized-price.js");
  const html = '<span class="latestValueCard_rowValue__abc">$62,810.04</span>';
  assert.equal(parseGlassnodeLatestValue(html), 62810.04);
});

test("median realized price normalizes Glassnode and pair series", async () => {
  const { normalizeGlassnodeSeries, normalizePairSeries } = await import("../api/median-realized-price.js");
  assert.deepEqual(normalizeGlassnodeSeries([{ t: 1722470400, v: 60000 }, { t: "bad", v: 1 }]), [
    { timestamp: 1722470400000, value: 60000 }
  ]);
  assert.deepEqual(normalizePairSeries([[1722470400000, 61000], [1722556800000, null]]), [
    { timestamp: 1722470400000, value: 61000 }
  ]);
});

test("public median reconstruction supplies a continuous multi-year history", async () => {
  const { buildPublicMedianHistory } = await import("../api/median-realized-price.js");
  const start = Date.UTC(2011, 0, 1);
  const supplyRows = Array.from({ length: 2200 }, (_, index) => {
    const timestamp = start + index * 86_400_000;
    const row = { timestamp, date: new Date(timestamp).toISOString().slice(0, 10), price: 5 + index * 0.5 };
    ["age_0d_1d", "age_1d_1w", "age_1w_1m", "age_1m_3m", "age_3m_6m", "age_6m_1y", "age_1y_2y", "age_2y_3y", "age_3y_4y", "age_4y_5y", "age_5y_7y", "age_7y_10y", "age_10y"].forEach((key) => { row[key] = 100 + index; });
    return row;
  });
  const rows = buildPublicMedianHistory(supplyRows);
  assert.ok(rows.length > 1300);
  assert.ok(rows.every((row) => row.estimated === true));
  assert.ok(rows.at(-1).timestamp - rows[0].timestamp > 3 * 365 * 86_400_000);
});

test("median realized series keeps complete BTC history and aligns sparse on-chain observations", async () => {
  const { buildMedianRealizedSeries } = await import("../api/median-realized-price.js");
  const start = Date.UTC(2026, 0, 1);
  const prices = Array.from({ length: 4 }, (_, index) => ({ timestamp: start + index * 86_400_000, value: 70000 + index }));
  const medians = [{ timestamp: start + 2 * 86_400_000, value: 62000 }];
  const series = buildMedianRealizedSeries(prices, medians);
  assert.equal(series.length, 4);
  assert.equal(series[0].median, null);
  assert.equal(series[2].median, 62000);
});

test("median realized snapshot reports support, ratio and long-range growth", async () => {
  const { calculateMedianRealizedSnapshot } = await import("../api/median-realized-price.js");
  const start = Date.UTC(2022, 0, 1);
  const series = Array.from({ length: 1462 }, (_, index) => {
    const progress = index / 1461;
    return {
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      price: 70000,
      median: 30000 + progress * 35000
    };
  });
  const snapshot = calculateMedianRealizedSnapshot(series, { value: 70000, asOf: "2026-01-01T12:00:00Z" });
  assert.equal(snapshot.zone, "support");
  assert.ok(snapshot.ratio > 1 && snapshot.ratio < 1.15);
  assert.ok(snapshot.yoyGrowth > 0);
  assert.ok(snapshot.fourYearGrowth > 100);
});

test("median realized endpoint uses Newhedge history when a token is configured", async () => {
  const module = await import("../api/median-realized-price.js");
  const originalFetch = global.fetch;
  const originalToken = process.env.NEW_HEDGE_API_TOKEN;
  process.env.NEW_HEDGE_API_TOKEN = "test-token";
  delete global.__welinkMedianRealizedPriceCache;
  const start = Date.UTC(2025, 0, 1);
  const dates = Array.from({ length: 400 }, (_, index) => start + index * 86_400_000);

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("realized_profit_loss_ratio_btc_price.json")) {
      return new Response(JSON.stringify(dates.map((timestamp, index) => [timestamp, 60000 + index])));
    }
    if (value.includes("cost_basis_per_coin_pct50")) {
      return new Response(JSON.stringify(dates.map((timestamp, index) => [timestamp, 50000 + index * 10])));
    }
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
    assert.equal(body.completeHistory, true);
    assert.equal(body.sourceMode, "newhedge-history");
    assert.equal(body.series.length, 400);
    assert.equal(body.snapshot.price, 65000);
    assert.match(headers["Cache-Control"], /s-maxage=43200/);
  } finally {
    global.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.NEW_HEDGE_API_TOKEN;
    else process.env.NEW_HEDGE_API_TOKEN = originalToken;
    delete global.__welinkMedianRealizedPriceCache;
  }
});

test("median realized endpoint reconstructs complete public history without paid API keys", async () => {
  const module = await import("../api/median-realized-price.js");
  const originalFetch = global.fetch;
  const envNames = ["NEW_HEDGE_API_TOKEN", "GLASSNODE_API_KEY", "BLOB_READ_WRITE_TOKEN"];
  const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  envNames.forEach((name) => { delete process.env[name]; });
  delete global.__welinkMedianRealizedPriceCache;
  delete global.__welinkBgeometricsSupplyHistoryCache;
  const start = Date.UTC(2023, 0, 1);
  const dates = Array.from({ length: 1300 }, (_, index) => start + index * 86_400_000);
  const pairs = (mapper) => dates.map((timestamp, index) => [timestamp, mapper(index)]);

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("hodl_waves_supply_btc_price.json")) return Response.json(pairs((index) => 20000 + index * 25));
    if (value.includes("hw_age_supply_")) return Response.json(pairs((index) => 1000 + index));
    if (value.includes("studio.glassnode.com")) return new Response('<span class="latestValueCard_rowValue__abc">$62,810.04</span>');
    if (value.includes("ticker/price")) return Response.json({ price: "65000" });
    throw new Error(`Unexpected URL ${value}`);
  };

  let body;
  const response = {
    setHeader() {},
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { body = value; return this; },
    end() {}
  };

  try {
    await module.default({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(body.sourceMode, "public-hodl-reconstruction");
    assert.equal(body.completeHistory, true);
    assert.equal(body.estimatedHistory, true);
    assert.ok(body.series.length >= 1200);
    assert.ok(body.series.filter((row) => Number.isFinite(row.median)).length >= 1200);
  } finally {
    global.fetch = originalFetch;
    envNames.forEach((name) => {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    });
    delete global.__welinkMedianRealizedPriceCache;
    delete global.__welinkBgeometricsSupplyHistoryCache;
  }
});
