const test = require("node:test");
const assert = require("node:assert/strict");

test("realized profit/loss pair normalization preserves null tails", async () => {
  const { normalizePairSeries } = await import("../api/realized-profit-loss.js");
  const rows = normalizePairSeries([
    [1722470400000, 0.87],
    [1722556800000, null],
    ["bad", 1]
  ], { allowNull: true });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].value, 0.87);
  assert.equal(rows[1].value, null);
});

test("realized profit/loss series converts BTC amounts to a rolling USD average", async () => {
  const { buildRealizedProfitLossSeries } = await import("../api/realized-profit-loss.js");
  const day = 86_400_000;
  const start = Date.UTC(2026, 0, 1);
  const ratio = Array.from({ length: 40 }, (_, index) => ({ timestamp: start + index * day, value: 0.8 + index / 100 }));
  const price = ratio.map((row) => ({ timestamp: row.timestamp, value: 10_000 }));
  const profit = ratio.map((row) => ({ timestamp: row.timestamp, value: 2 }));
  const loss = ratio.map((row) => ({ timestamp: row.timestamp, value: -4 }));
  const series = buildRealizedProfitLossSeries(ratio, price, profit, loss);

  assert.equal(series.length, 40);
  assert.equal(series[29].profit365SmaUsd, 20_000);
  assert.equal(series[29].loss365SmaUsd, 40_000);
  assert.equal(series.at(-1).ratio, 1.19);
});

test("realized profit/loss series carries the latest 365D average across a short public-data tail", async () => {
  const { buildRealizedProfitLossSeries } = await import("../api/realized-profit-loss.js");
  const day = 86_400_000;
  const start = Date.UTC(2026, 0, 1);
  const ratio = Array.from({ length: 44 }, (_, index) => ({ timestamp: start + index * day, value: 0.9 }));
  const price = ratio.map((row) => ({ timestamp: row.timestamp, value: 10_000 }));
  const profit = ratio.slice(0, 40).map((row) => ({ timestamp: row.timestamp, value: 2 }));
  const loss = ratio.slice(0, 40).map((row) => ({ timestamp: row.timestamp, value: -4 }));
  const series = buildRealizedProfitLossSeries(ratio, price, profit, loss);

  assert.equal(series.at(-1).profit365SmaUsd, 20_000);
  assert.equal(series.at(-1).loss365SmaUsd, 40_000);
  assert.equal(series.at(-1).profitLossAsOf, "2026-02-09");
});

test("realized profit/loss snapshot identifies a sub-one bottom zone and latest 2.2 cross", async () => {
  const { calculateRealizedProfitLossSnapshot } = await import("../api/realized-profit-loss.js");
  const start = Date.UTC(2026, 0, 1);
  const series = Array.from({ length: 40 }, (_, index) => ({
    date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    price: 70_000,
    ratio: index === 0 ? 2.4 : 1.5 - index * 0.017,
    profit365SmaUsd: 500_000_000,
    loss365SmaUsd: 600_000_000
  }));
  const snapshot = calculateRealizedProfitLossSnapshot(series, null);

  assert.equal(snapshot.zone, "bottom");
  assert.ok(snapshot.current < 1);
  assert.equal(snapshot.crossedThresholdOn, series[1].date);
  assert.equal(snapshot.daysSinceThreshold, 38);
  assert.equal(snapshot.profit365SmaUsd, 500_000_000);
});

test("realized profit/loss endpoint returns a full public-source payload", async () => {
  const module = await import("../api/realized-profit-loss.js");
  const originalFetch = global.fetch;
  delete global.__welinkRealizedProfitLossCache;
  const start = Date.UTC(2025, 0, 1);
  const dates = Array.from({ length: 400 }, (_, index) => start + index * 86_400_000);

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("realized_profit_loss_ratio.json")) {
      return new Response(JSON.stringify(dates.map((timestamp, index) => [timestamp, index > 390 ? 0.87 : 2.4])));
    }
    if (value.includes("realized_profit_loss_ratio_btc_price.json")) {
      return new Response(JSON.stringify(dates.map((timestamp, index) => [timestamp, 60_000 + index])));
    }
    if (value.includes("realized_profit.json")) {
      return new Response(JSON.stringify(dates.map((timestamp) => [timestamp, 2_000])));
    }
    if (value.includes("realized_loss.json")) {
      return new Response(JSON.stringify(dates.map((timestamp) => [timestamp, -2_300])));
    }
    if (value.includes("ticker/price")) {
      return new Response(JSON.stringify({ price: "63445" }), { headers: { "content-type": "application/json" } });
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
    assert.equal(body.ok, true);
    assert.equal(body.series.length, 400);
    assert.equal(body.snapshot.current, 0.87);
    assert.equal(body.snapshot.price, 63445);
    assert.equal(body.snapshot.zone, "bottom");
    assert.match(headers["Cache-Control"], /s-maxage=43200/);
  } finally {
    global.fetch = originalFetch;
    delete global.__welinkRealizedProfitLossCache;
  }
});
