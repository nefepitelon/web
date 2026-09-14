const test = require("node:test");
const assert = require("node:assert/strict");
require("tsx/cjs");
const { computeBox, computeVolume, computeFlow, computeControl, matchThemes, scoreConditions } = require("../lib/box-breakout/engine.ts");
const bars = (n = 60, scale = 1) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10), open: 9 * scale, close: 9.2 * scale, low: 8 * scale, high: 10 * scale, volume: 100 }));
const scoring = overrides => scoreConditions({ market: "ashare", volume: { days: 3, ratio: 1.8, ratios: [] }, box: { tests: 3 }, changePct: 10, themeMatched: true, flow: { state: "流入" }, control: { level: "高" }, ...overrides });

test("volume compares with prior five bars, not including itself", () => {
  const sample = bars(9); sample[5].volume = 200; sample[6].volume = 300; sample[7].volume = 450;
  const result = computeVolume(sample);
  assert.equal(result.ratios[5], 2); assert.equal(result.ratios[6], 2.5); assert.equal(result.days, 3);
  assert.ok(result.ratio < 1.8); // Historical streak alone does not award full points.
  assert.equal(scoring({ volume: result }).conditions.find(c => c.key === "volume").points, 12);
});
test("volume handles zero history and only counts last ten days", () => {
  assert.equal(computeVolume([]).ratio, 0);
  const sample = bars(30); sample.slice(0, 5).forEach(b => b.volume = 0); sample[6].volume = 900;
  assert.equal(computeVolume(sample).days, 0); assert.equal(computeVolume(sample).ratios[5], 0);
});
test("box requires 40 bars and excludes the first recent breakout", () => {
  assert.equal(computeBox(bars(39)), null);
  const sample = bars(70); sample[65] = { ...sample[65], high: 13, close: 12 };
  const box = computeBox(sample);
  assert.equal(box.endIndex, 65); assert.equal(box.high, 10); assert.equal(box.startDate, sample[5].date);
  assert.equal(box.endDate, sample[64].date); assert.equal(box.testDates.length, 8);
});
test("box probe needs real upper wick and sufficient volume", () => {
  const sample = bars(60); sample.forEach((b, i) => { b.high = 9.5; if (i < 3) b.high = 10; });
  assert.equal(computeBox(sample).tests, 3);
  sample[0].open = 10; sample[1].volume = 0;
  assert.equal(computeBox(sample).tests, 1);
});
test("micro-priced crypto keeps box precision, and position is clamped", () => {
  const sample = bars(60, .000001); const box = computeBox(sample);
  assert.ok(box.low > 0 && box.high > box.low); assert.ok(box.high < .001);
  sample[59].close = .00002; sample[59].high = .00002;
  assert.equal(computeBox(sample).positionPct, 100);
});
test("flat or invalid boxes are rejected", () => {
  const sample = bars(60); sample.forEach(b => { b.high = 8; b.low = 8; }); assert.equal(computeBox(sample), null);
});
test("fund flow uses only latest five observations and missing remains unknown", () => {
  assert.deepEqual(computeFlow([]), { net5d: null, positiveDays: 0, state: "无数据" });
  assert.equal(computeFlow([-99999, 100, 100, 100, -10, -10].map(net => ({ date: "2026-01-01", net }))).state, "流入");
  assert.equal(computeFlow([100, -1, -1, -1, -1].map(net => ({ date: "2026-01-01", net }))).state, "偏流入");
});
test("control uses disclosure thresholds and turnover downgrade", () => {
  assert.equal(computeControl(2, null), null);
  assert.equal(computeControl(14.99, { ratio: -2, date: "2026-06-30" }).level, "高");
  assert.equal(computeControl(15, { ratio: -2, date: "2026-06-30" }).level, "中");
  assert.equal(computeControl(1, { ratio: .5, date: "2026-06-30" }).level, "中");
  assert.equal(computeControl(1, { ratio: .51, date: "2026-06-30" }).level, "低");
});
test("A-share scoring is four weighted conditions and threshold 85", () => {
  assert.equal(scoring({}).score, 100);
  assert.equal(scoring({ control: { level: "中" } }).score, 90);
  assert.equal(scoring({ box: { tests: 2 } }).score, 85);
  assert.equal(scoring({ themeMatched: false }).qualified, false);
  assert.equal(scoring({ themeMatched: false }).status, "突破观察");
});
test("crypto scores three conditions without inventing funds or holders", () => {
  const result = scoring({ market: "crypto", flow: null, control: null, themeMatched: false });
  assert.equal(result.score, 100); assert.equal(result.conditions.length, 3);
  assert.equal(scoring({ market: "crypto", changePct: 5 }).score, 83);
  assert.equal(scoring({ market: "crypto", changePct: 4.99 }).score, 67);
});
test("hot and user themes match exactly or meaningful substrings only", () => {
  assert.deepEqual(matchThemes(["人工智能", "新能源汽车", "AI"], ["人工智能", "新能源", "A"]), ["人工智能", "新能源汽车"]);
});

const market = require("../lib/box-breakout/market.ts");
test("data adapters reject URLs and unsupported symbols before fetching", async () => {
  await assert.rejects(market.fetchQuote("https://attacker.test", "crypto"), /无效/);
  await assert.rejects(market.fetchBars("600519&url=evil", "ashare"), /无效/);
  await assert.rejects(market.fetchQuote("BTCUSDT", "spot"), /不支持/);
});
test("A-share quote falls back from malformed Tencent data to validated Eastmoney", async () => {
  const fetchOriginal = global.fetch; const calls = [];
  try {
    global.fetch = async url => {
      calls.push(String(url));
      return String(url).includes("qt.gtimg.cn") ? new Response("invalid") : Response.json({ data: { f43: 1234, f170: -123, f58: "测试股", f168: 205, f50: 185 } });
    };
    const quote = await market.fetchQuote("000002", "ashare");
    assert.equal(quote.price, 12.34); assert.equal(quote.changePct, -1.23);
    assert.equal(quote.volumeRatio, 1.85); assert.equal(quote.source, "东方财富"); assert.equal(calls.length, 2);
  } finally { global.fetch = fetchOriginal; }
});
test("crypto kline fallback remains futures-only and keeps tiny prices", async () => {
  const fetchOriginal = global.fetch; const calls = [];
  try {
    global.fetch = async url => {
      calls.push(String(url));
      if (calls.length === 1) return new Response("unavailable", { status: 503 });
      return Response.json(bars(60, .000001).map(b => [Date.parse(b.date), String(b.open), String(b.high), String(b.low), String(b.close), String(b.volume)]));
    };
    const result = await market.fetchBars("TESTUSDT", "crypto");
    assert.equal(result.length, 60); assert.ok(result[0].close < .001);
    assert.equal(calls.length, 2); assert.ok(calls.every(url => url.includes("/fapi/v1/klines")));
  } finally { global.fetch = fetchOriginal; }
});
test("missing stock fundamentals produce explicit warnings rather than fake values", async () => {
  const fetchOriginal = global.fetch;
  try {
    global.fetch = async url => {
      const endpoint = String(url);
      if (endpoint.includes("qt.gtimg.cn")) return new Response("missing", { status: 503 });
      if (endpoint.includes("/stock/get?")) return Response.json({ data: { f43: 920, f170: 100, f58: "测试标的", f168: 100, f50: 100 } });
      if (endpoint.includes("fqkline/get")) return Response.json({ data: { sz000003: { qfqday: bars(60).map(b => [b.date, b.open, b.close, b.high, b.low, b.volume]) } } });
      return new Response("not available", { status: 503 });
    };
    const candidate = await market.analyzeSymbol({ symbol: "000003", name: "测试" }, "ashare", [], []);
    assert.equal(candidate.flow.net5d, null); assert.equal(candidate.control, null);
    assert.deepEqual(candidate.concepts, []); assert.equal(candidate.qualified, false);
    assert.ok(candidate.dataWarnings.some(w => w.includes("主力资金流")));
    assert.ok(candidate.dataWarnings.some(w => w.includes("股东户数")));
  } finally { global.fetch = fetchOriginal; }
});
