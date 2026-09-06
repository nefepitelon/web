import process from "node:process";

const baseUrl = "http://127.0.0.1:8080";
const exchanges = ["de", "ex", "rs"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`${path}: ${body.error || response.statusText}`);
  }
  return body;
}

try {
  await import("../grid-ops/src/server.js");

  const health = await json("/api/health");
  assert(health.ok && health.service === "welinkbtc-grid-ops", "健康检查不可用");

  const overview = await json("/api/overview");
  assert(exchanges.every((exchange) => overview[exchange]), "总览缺少交易所状态");

  for (const exchange of exchanges) {
    const marketResult = await json(`/api/${exchange}/markets`);
    const market = marketResult.markets?.[0];
    assert(market, `${exchange} 没有可用市场`);

    const price = Number(market.lastPrice);
    const start = await json(`/api/${exchange}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketId: Number(market.marketId),
        mode: "neutral",
        lower: price * 0.92,
        upper: price * 1.08,
        gridCount: 8,
        sizeBase: Math.max(Number(market.minOrderSize || 0), Number(market.stepSize || 0.001)),
        leverage: 2,
        outOfRangeAction: "stop"
      })
    });
    assert(start.running, `${exchange} 模拟网格未启动`);

    const state = await json(`/api/${exchange}/state`);
    assert(state.running && state.openOrders > 0, `${exchange} 未生成模拟挂单`);

    const stopped = await json(`/api/${exchange}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closePosition: true })
    });
    assert(!stopped.running, `${exchange} 模拟网格未停止`);
  }

  console.log("AI网格交易Ops smoke test passed: overview + 3 exchanges start/state/stop");
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
