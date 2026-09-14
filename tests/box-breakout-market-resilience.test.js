const test = require("node:test");
const assert = require("node:assert/strict");
require("tsx/cjs");

const catalog = () => Array.from({ length: 3200 }, (_, i) => ({
  code: i < 1600 ? String(600000 + i) : String(i - 1600).padStart(6, "0"),
  zwjc: `Stock${i}`, category: "A股",
}));
const freshMarket = () => {
  const file = require.resolve("../lib/box-breakout/market.ts");
  delete require.cache[file];
  return require(file);
};
const quoteResponse = (url, overrides = {}) => {
  const symbols = String(url).split("q=")[1].split(",");
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return new Response(symbols.map(full => {
    const symbol = full.slice(2);
    if (overrides.omit?.includes(symbol)) return 'v_pv_none_match="1"';
    const fields = Array(60).fill("0");
    Object.assign(fields, { 0: "51", 1: `Stock${symbol}`, 2: symbol, 3: "10.5", 30: timestamp, 32: "4.2", 37: "2100", 38: "2", 49: "1.8" });
    if (overrides.stale?.includes(symbol)) fields[30] = "20000101000000";
    if (overrides.invalidTime?.includes(symbol)) fields[30] = "20269999000000";
    return `v_${full}="${fields.join("~")}"`;
  }).join(";\n") + ";");
};
async function withFetch(fetcher, run) {
  const original = global.fetch;
  global.fetch = fetcher;
  try { await run(freshMarket()); } finally { global.fetch = original; }
}

test("full and quick A-share initialization work independently of Eastmoney/Sina", async () => {
  const calls = [], progress = [];
  await withFetch(async url => {
    calls.push(String(url));
    if (String(url).includes("cninfo.com.cn")) return Response.json({ stockList: [...catalog(), { code: "920001", zwjc: "Beijing", category: "A股" }, { code: "600001", zwjc: "Duplicate", category: "A股" }, { code: "600999", zwjc: "退市测试", category: "A股" }] });
    if (String(url).includes("qt.gtimg.cn")) return quoteResponse(url);
    throw new Error("legacy providers unavailable");
  }, async market => {
    const universe = await market.fetchUniverse(async message => { progress.push(message); });
    const selected = await market.selectQuickUniverse(universe, [{ symbol: "600010", name: "Pool" }]);
    assert.equal(universe.length, 3200);
    assert.equal(new Set(universe.map(stock => stock.symbol)).size, 3200);
    assert.equal(selected.length, 200);
    assert.equal(calls.length, 17); // one catalog + sixteen 200-symbol quote batches
    assert.ok(calls.every(url => /cninfo.com.cn|qt.gtimg.cn/.test(url)));
    assert.ok(progress.some(message => message.includes("3200/3200")));
    const quote = await market.fetchQuote(universe[0].symbol, "ashare");
    assert.equal(quote.source, "腾讯财经");
    assert.equal(quote.price, 10.5);
    assert.equal(quote.volumeRatio, 1.8);
    assert.ok(Number.isFinite(Date.parse(quote.asOf)));
  });
});

test("Tencent batch transient failures retry once with bounded concurrency", async () => {
  let active = 0, maximum = 0;
  const attempts = new Map();
  await withFetch(async url => {
    if (String(url).includes("cninfo.com.cn")) return Response.json({ stockList: catalog() });
    const key = String(url);
    attempts.set(key, (attempts.get(key) || 0) + 1);
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    if (key.includes("q=sh600000,") && attempts.get(key) === 1) return new Response("temporary", { status: 503 });
    return quoteResponse(url);
  }, async market => {
    assert.equal((await market.fetchUniverse()).length, 3200);
    assert.ok(maximum <= 4);
    assert.equal([...attempts.values()].filter(count => count === 2).length, 1);
    assert.ok([...attempts.values()].every(count => count <= 2));
  });
});

test("shared market load isolates a cancelled progress subscriber and deduplicates concurrent scans", async () => {
  let catalogs = 0, cancelledUpdates = 0;
  const progress = [];
  await withFetch(async url => {
    if (String(url).includes("cninfo.com.cn")) {
      catalogs++;
      await new Promise(resolve => setTimeout(resolve, 5));
      return Response.json({ stockList: catalog() });
    }
    if (String(url).includes("qt.gtimg.cn")) return quoteResponse(url);
    throw new Error("unexpected fallback caused by subscriber failure");
  }, async market => {
    const [cancelledCaller, healthyCaller] = await Promise.all([
      market.fetchUniverse(async () => { cancelledUpdates++; throw new Error("job cancelled"); }),
      market.fetchUniverse(async message => { progress.push(message); }),
    ]);
    assert.equal(cancelledCaller.length, 3200);
    assert.equal(healthyCaller.length, 3200);
    assert.equal(catalogs, 1);
    assert.equal(cancelledUpdates, 1);
    assert.ok(progress.some(message => message.includes("3200/3200")));
    const previousUpdates = progress.length;
    await market.fetchUniverse(); // A cached call must not notify leaked subscribers.
    assert.equal(progress.length, previousUpdates);
    assert.equal(catalogs, 1);
  });
});

test("pre-listing/missing and stale quotes never enter the universe or quick ranking", async () => {
  await withFetch(async url => String(url).includes("cninfo.com.cn")
    ? Response.json({ stockList: catalog() })
    : quoteResponse(url, { omit: ["600003"], stale: ["600004"], invalidTime: ["600005"] }), async market => {
    const universe = await market.fetchUniverse();
    assert.equal(universe.length, 3197);
    assert.ok(!universe.some(stock => ["600003", "600004", "600005"].includes(stock.symbol)));
    const selected = await market.selectQuickUniverse(universe, []);
    assert.ok(!selected.some(stock => ["600003", "600004", "600005"].includes(stock.symbol)));
  });
});

test("incomplete Tencent batches cannot silently become a full-market scan", async () => {
  await withFetch(async url => {
    if (String(url).includes("cninfo.com.cn")) return Response.json({ stockList: catalog() });
    if (String(url).includes("qt.gtimg.cn")) return new Response('v_pv_none_match="1";');
    return new Response("upstream private diagnostic must not leak", { status: 503 });
  }, async market => {
    await assert.rejects(market.fetchUniverse(), error => {
      assert.match(error.message, /沪深全市场清单/);
      assert.match(error.message, /腾讯批量行情不完整/);
      assert.ok(!error.message.includes("private diagnostic"));
      return true;
    });
  });
});

test("malformed catalog falls back to independently validated Eastmoney pagination", async () => {
  const stocks = catalog(), calls = [];
  await withFetch(async url => {
    calls.push(String(url));
    if (String(url).includes("cninfo.com.cn")) return Response.json({ stockList: stocks.slice(0, 500) });
    if (String(url).includes("push2.eastmoney.com")) {
      const page = Number(new URL(url).searchParams.get("pn"));
      return Response.json({ data: { total: stocks.length, diff: stocks.slice((page - 1) * 100, page * 100).map(stock => ({ f12: stock.code, f14: stock.zwjc, f2: 10, f3: 2, f8: 3, f10: 2, f6: 1000 })) } });
    }
    throw new Error("unexpected provider");
  }, async market => {
    const universe = await market.fetchUniverse();
    assert.equal(universe.length, 3200);
    assert.equal((await market.selectQuickUniverse(universe, [])).length, 200);
    assert.equal(calls.filter(url => url.includes("cninfo.com.cn")).length, 2);
    assert.equal(calls.filter(url => url.includes("eastmoney.com")).length, 32);
  });
});

test("quick ranking rejects missing snapshot coverage instead of completing with zero", async () => {
  await withFetch(async url => String(url).includes("cninfo.com.cn") ? Response.json({ stockList: catalog() }) : quoteResponse(url), async market => {
    await market.fetchUniverse();
    await assert.rejects(market.selectQuickUniverse([{ symbol: "300999", name: "Unknown" }], []), /行情快照覆盖不足/);
  });
});

test("remote assignment content is parsed as data, never executed", async () => {
  global.__boxMarketRemoteExecuted = false;
  await withFetch(async url => {
    if (String(url).includes("cninfo.com.cn")) return Response.json({ stockList: catalog() });
    if (String(url).includes("qt.gtimg.cn")) {
      const valid = await quoteResponse(url).text();
      return new Response(`${valid}\nglobal.__boxMarketRemoteExecuted=true;`);
    }
    throw new Error("unexpected provider");
  }, async market => {
    assert.equal((await market.fetchUniverse()).length, 3200);
    assert.equal(global.__boxMarketRemoteExecuted, false);
  });
  delete global.__boxMarketRemoteExecuted;
});
