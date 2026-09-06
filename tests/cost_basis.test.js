const test = require("node:test");
const assert = require("node:assert/strict");

test("cost-basis CSV parser and date merge preserve aligned values", async () => {
  const { parseCsv, mergeCostBasisSeries } = await import("../api/cost-basis.js");
  const rows = parseCsv("d,unixTs,trueMarketMean\n2026-08-01,1785542400,87000\n2026-08-02,1785628800,87100");
  assert.equal(rows.length, 2);
  assert.equal(rows[1].trueMarketMean, "87100");

  const merged = mergeCostBasisSeries({
    sthRows: [{ date: "2026-08-01", value: 80000 }, { date: "2026-08-02", value: 79000 }],
    priceRows: [{ date: "2026-08-01", value: 81000 }, { date: "2026-08-02", value: 78000 }]
  }, [
    { date: "2026-08-01", value: 87000 },
    { date: "2026-08-02", value: 87100 }
  ]);

  assert.deepEqual(merged[1], { date: "2026-08-02", price: 78000, sth: 79000, tmmp: 87100 });
});

test("cost-basis snapshot detects a downward STH/TMMP cross", async () => {
  const { calculateSnapshot } = await import("../api/cost-basis.js");
  const series = [
    { date: "2026-07-30", price: 90000, sth: 89000, tmmp: 88000 },
    { date: "2026-07-31", price: 86000, sth: 87500, tmmp: 88100 },
    { date: "2026-08-01", price: 82000, sth: 86000, tmmp: 88200 },
    { date: "2026-08-02", price: 80000, sth: 85000, tmmp: 88300 }
  ];
  const snapshot = calculateSnapshot(series, { value: 80500, asOf: "2026-08-03T00:00:00.000Z", source: "test" });

  assert.equal(snapshot.deathCrossActive, true);
  assert.equal(snapshot.lastCrossDate, "2026-07-31");
  assert.equal(snapshot.daysSinceCross, 2);
  assert.equal(snapshot.gap, -3300);
  assert.equal(snapshot.price, 80500);
});

test("STH-RP to TMMP ratio snapshot calculates trend and bottom-signal distance", async () => {
  const { calculateRatioSnapshot } = await import("../api/cost-basis.js");
  const series = Array.from({ length: 35 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10),
    price: 95 - index,
    sth: 100 - index * 0.5,
    tmmp: 100
  }));
  const snapshot = calculateRatioSnapshot(series);

  assert.equal(snapshot.current, 0.83);
  assert.equal(snapshot.average7, 0.845);
  assert.equal(snapshot.trend, "declining");
  assert.ok(Math.abs(snapshot.distanceToThreshold - 0.08) < 1e-12);
  assert.equal(snapshot.priceBelowSth, true);
  assert.equal(snapshot.priceBelowTmmp, true);
  assert.equal(snapshot.onchainAsOf, "2026-08-04");
});

test("cost-basis endpoint returns an aligned live payload", async () => {
  const module = await import("../api/cost-basis.js");
  const originalFetch = global.fetch;
  const originalKey = process.env.COINGLASS_API_KEY;
  delete global.__welinkCostBasisCache;
  process.env.COINGLASS_API_KEY = "test-key";
  const dates = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2026, 6, 27 + index)));

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes("true-market-mean")) {
      const rows = dates.map((date, index) => `${date.toISOString().slice(0, 10)},${date.getTime() / 1000},${87000 + index * 20}`);
      return new Response(["d,unixTs,trueMarketMean", ...rows].join("\n"));
    }
    if (value.includes("bitcoin-sth-realized-price")) {
      const data = dates.map((date, index) => ({
        timestamp: date.getTime(),
        price: 82000 - index * 600,
        sth_realized_price: 88400 - index * 1600
      }));
      return new Response(JSON.stringify({ code: "0", data }), { headers: { "content-type": "application/json" } });
    }
    if (value.includes("ticker/price")) {
      return new Response(JSON.stringify({ price: "78250" }), { headers: { "content-type": "application/json" } });
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
    assert.equal(body.series.length, 7);
    assert.equal(body.snapshot.price, 78250);
    assert.equal(body.snapshot.deathCrossActive, true);
    assert.equal(body.ratioSnapshot.trend, "declining");
    assert.ok(body.ratioSnapshot.current > 0.8);
    assert.match(headers["Cache-Control"], /s-maxage=21600/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.COINGLASS_API_KEY;
    else process.env.COINGLASS_API_KEY = originalKey;
    delete global.__welinkCostBasisCache;
  }
});
