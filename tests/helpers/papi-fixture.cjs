const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

// An exchange simulator, not a network proxy. Unknown requests always fail.
function papiFixture() {
  const state = {
    calls: [], permissions: { enableWithdrawals: false, enableFutures: false, enablePortfolioMarginTrading: true, ipRestrict: false },
    account: { accountEquity: "20000", actualEquity: "21000", accountInitialMargin: "0", accountMaintMargin: "0", uniMMR: "99999999", accountStatus: "NORMAL", totalAvailableBalance: "", totalMarginOpenLoss: "", virtualMaxWithdrawAmount: "999999999" },
    config: { canTrade: true, dualSidePosition: false },
    balances: [{ asset: "USDT", crossMarginBorrowed: "0", crossMarginInterest: "0", negativeBalance: "0", crossMarginLocked: "0" }],
    positions: [], cm: [], income: [], orders: new Map(), algos: new Map(), override: null,
  };
  function dispatch(method, path, params) {
    const call = { method, path, params }; state.calls.push(call);
    if (state.override) { const result = state.override(call); if (result !== undefined) return result; }
    if (path === "/fapi/v1/time") return { serverTime: Date.now() };
    if (path === "/sapi/v1/account/apiRestrictions") return state.permissions;
    if (path === "/papi/v1/account") return state.account;
    if (path === "/papi/v1/um/accountConfig") return state.config;
    if (path === "/papi/v1/balance") return state.balances;
    if (path === "/papi/v1/cm/positionRisk") return state.cm;
    if (path === "/papi/v1/cm/openOrders" || path === "/papi/v1/cm/conditional/openOrders") return [];
    if (path === "/papi/v1/um/positionRisk") return params.symbol ? state.positions.filter(p => p.symbol === params.symbol) : state.positions;
    if (path === "/papi/v1/um/income") return state.income;
    if (path === "/papi/v1/um/openOrders") return [...state.orders.values()].filter(o => ["NEW", "PARTIALLY_FILLED"].includes(o.status) && (!params.symbol || o.symbol === params.symbol));
    if (path === "/papi/v1/um/algo/openAlgoOrders") return [...state.algos.values()].filter(o => o.algoStatus === "NEW" && (!params.symbol || o.symbol === params.symbol));
    if (path === "/fapi/v1/exchangeInfo") return { symbols: [{ symbol: params.symbol, status: "TRADING", filters: [{ filterType: "LOT_SIZE", stepSize: "0.001", minQty: "0.001" }, { filterType: "PRICE_FILTER", tickSize: "0.01" }, { filterType: "MIN_NOTIONAL", notional: "5" }] }] };
    if (path === "/fapi/v1/ticker/price") return { price: "1000" };
    if (path === "/fapi/v1/premiumIndex") return { markPrice: "1000" };
    if (path === "/api/v3/ticker/24hr") return { highPrice: "700" };
    if (path === "/papi/v1/um/leverage" && method === "POST") return { leverage: Number(params.leverage), maxNotionalValue: "1000000" };
    if (path === "/papi/v1/um/order" && method === "POST") {
      const order = { orderId: String(state.orders.size + 100), clientOrderId: params.newClientOrderId, status: "FILLED", executedQty: String(params.quantity), avgPrice: "1000", symbol: params.symbol };
      state.orders.set(order.orderId, order);
      state.positions = params.reduceOnly === "true" ? [] : [{ symbol: params.symbol, positionAmt: String(Number(params.quantity) * (params.side === "BUY" ? 1 : -1)), notional: String(Number(params.quantity) * 1000 * (params.side === "BUY" ? 1 : -1)), positionSide: "BOTH", entryPrice: "1000", markPrice: "1000", unRealizedProfit: "0" }];
      return order;
    }
    if (path === "/papi/v1/um/order") {
      const order = params.orderId ? state.orders.get(params.orderId) : [...state.orders.values()].find(o => o.clientOrderId === params.origClientOrderId);
      if (!order) return { code: -2013, msg: "Order does not exist" };
      if (method === "DELETE") order.status = "CANCELED";
      return order;
    }
    if (path === "/papi/v1/um/algo/order" && method === "POST") {
      const algo = { ...params, algoId: state.algos.size + 1000, clientAlgoId: params.clientAlgoId, algoStatus: "NEW", reduceOnly: params.reduceOnly === "true", actualOrderId: "" };
      state.algos.set(algo.clientAlgoId, algo); return algo;
    }
    if (path === "/papi/v1/um/algo/algoOrder") return state.algos.get(params.clientAlgoId) ?? { code: -2013, msg: "Missing algo" };
    if (path === "/papi/v1/um/algo/order" && method === "DELETE") { const algo = state.algos.get(params.clientAlgoId); if (algo) algo.algoStatus = "CANCELED"; return { complete: true }; }
    if (path === "/papi/v1/um/allOpenOrders" || path === "/papi/v1/um/algo/allOpenOrders") return { code: 200, msg: "success" };
    if (path === "/papi/v1/listenKey") return method === "POST" ? { listenKey: "fixture-stream" } : {};
    throw new Error(`Unexpected exchange request: ${method} ${path}`);
  }
  async function fetch(input, init) {
    const url = new URL(input); const method = init.method;
    const expectedHost = url.pathname.startsWith("/papi/") ? "papi.binance.com" : url.pathname.startsWith("/fapi/") ? "fapi.binance.com" : "api.binance.com";
    assert.equal(url.hostname, expectedHost);
    const signature = url.searchParams.get("signature");
    if (url.pathname.startsWith("/sapi/") || url.pathname.startsWith("/papi/") && !url.pathname.endsWith("listenKey")) {
      assert.equal(init.headers["X-MBX-APIKEY"], "fixture");
      assert.ok(url.searchParams.has("timestamp"));
      url.searchParams.delete("signature");
      assert.equal(signature, createHmac("sha256", "fixture").update(url.searchParams.toString()).digest("hex"));
    }
    const raw = dispatch(method, url.pathname, Object.fromEntries(url.searchParams));
    return raw instanceof Response ? raw : new Response(JSON.stringify(raw), { status: Number(raw.code) < 0 ? 400 : 200, headers: { "Content-Type": "application/json" } });
  }
  return { state, fetch };
}
module.exports = { papiFixture };
