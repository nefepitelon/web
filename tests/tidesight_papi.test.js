const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
require("tsx/cjs");
const load = Module._load;
Module._load = function(name, parent, main) { return name === "server-only" ? {} : load.call(this, name, parent, main); };
const { TideSightBinanceClient, BinanceRequestError } = require("../lib/tidesight/execution/binance.ts");
const { portfolioRiskSnapshot } = require("../lib/tidesight/execution/portfolio-risk.ts");
const { evaluateTradeIntent } = require("../workers/tidesight_risk_engine.js");
const { papiFixture } = require("./helpers/papi-fixture.cjs");
const entry = { symbol: "ETHUSDT", side: "BUY", type: "MARKET", quantity: 0.2, leverage: 5, clientOrderId: "ts-entry" };
const protection = { symbol: "ETHUSDT", quantity: 0.2, stopLoss: 985, takeProfit: 1030, side: "LONG", stopClientOrderId: "ts-sl", takeProfitClientOrderId: "ts-tp", listClientOrderId: "unused" };
async function withExchange(run, mode = "auto") {
  const fixture = papiFixture(), original = global.fetch;
  global.fetch = fixture.fetch;
  const client = new TideSightBinanceClient({ environment: "live", market: "futures", apiKey: "fixture", apiSecret: "fixture", accountMode: mode });
  try { return await run(client, fixture.state); } finally { global.fetch = original; await client.close(); }
}

test("unified key without classic Futures permission passes signed PAPI preflight; no mutation", () => withExchange(async (c, s) => {
  const result = await c.preflight();
  assert.equal(result.accountType, "PORTFOLIO_MARGIN_UM"); assert.equal(result.accountMode, "portfolio"); assert.equal(result.canTrade, true); assert.equal(result.ipRestricted, false);
  assert.equal(result.equity, 20000); assert.ok(result.availableBalance < 20000); assert.equal(result.portfolioMargin.minUniMMR, 1.5);
  assert.ok(s.calls.every(r => r.method === "GET"));
  assert.equal(s.calls.filter(r => r.path.startsWith("/fapi/")).length, 1);
}));
test("spot/margin permission alone cannot impersonate portfolio or Futures permission", () => withExchange(async (c, s) => {
  s.permissions.enablePortfolioMarginTrading = false; s.permissions.enableSpotAndMarginTrading = true;
  await assert.rejects(c.preflight(), /现货\/杠杆权限不等于合约权限/);
}));
test("withdrawals must be explicitly disabled even for a unified account", async () => {
  for (const value of [true, undefined, "false", null]) await withExchange(async (c, s) => { s.permissions.enableWithdrawals = value; await assert.rejects(c.preflight(), /提现关闭/); });
});
test("verified account route never falls back from PAPI to classic on changed permissions", () => withExchange(async (c, s) => {
  s.permissions.enablePortfolioMarginTrading = false; s.permissions.enableFutures = true;
  await assert.rejects(c.preflight(), /账户模式/); assert.ok(!s.calls.some(r => r.path === "/fapi/v3/account"));
}, "portfolio"));
test("classic account remains supported via explicit classic permission", () => withExchange(async (c, s) => {
  s.permissions.enablePortfolioMarginTrading = false; s.permissions.enableFutures = true;
  s.override = r => r.path === "/fapi/v3/account" ? { canTrade: true, positions: [], totalMarginBalance: "1000", availableBalance: "1000" } : r.path === "/fapi/v1/positionSide/dual" ? { dualSidePosition: false } : undefined;
  assert.equal((await c.preflight()).accountMode, "classic"); assert.ok(!s.calls.some(r => r.path.startsWith("/papi/")));
}));
test("missing UM permission and hedge mode reject without changing account mode", async () => {
  for (const patch of [{ canTrade: false }, { canTrade: undefined }, { dualSidePosition: true }, { dualSidePosition: undefined }]) await withExchange(async (c, s) => {
    Object.assign(s.config, patch); await assert.rejects(c.preflight()); assert.ok(s.calls.every(r => r.method === "GET"));
  });
});
test("unhealthy portfolio account states and thin uniMMR buffers fail closed", async () => {
  for (const patch of [{ accountStatus: "REDUCE_ONLY" }, { accountStatus: "MARGIN_CALL" }, { uniMMR: "1.49", accountMaintMargin: "100" }, { accountMaintMargin: "19000", uniMMR: "100" }]) await withExchange(async (c, s) => { Object.assign(s.account, patch); await assert.rejects(c.preflight()); });
});
test("malformed money and missing exposure snapshots never become a zero-risk account", async () => {
  for (const field of ["accountEquity", "actualEquity", "accountInitialMargin", "accountMaintMargin", "uniMMR"]) for (const value of [undefined, "", "NaN", null, true]) await withExchange(async (c, s) => { s.account[field] = value; await assert.rejects(c.preflight()); });
  await withExchange(async (c, s) => { s.positions = {}; await assert.rejects(c.preflight(), /快照不完整/); });
});
test("mixed CM exposure, cross-margin debt, locked collateral and negative balances veto", async () => {
  for (const field of ["crossMarginBorrowed", "crossMarginInterest", "negativeBalance", "crossMarginLocked"]) await withExchange(async (c, s) => { s.balances[0][field] = "1"; await assert.rejects(c.preflight(), /禁止新增/); });
  await withExchange(async (c, s) => { s.cm = [{ positionAmt: "1" }]; await assert.rejects(c.preflight(), /COIN-M/); });
});
test("net collateral, not withdrawal limits or gross wallet, caps usable margin", () => {
  const { state: s } = papiFixture(); Object.assign(s.account, { accountEquity: "1000", actualEquity: "5000", accountInitialMargin: "100", accountMaintMargin: "100", uniMMR: "10", totalAvailableBalance: "200", virtualMaxWithdrawAmount: "9999999" });
  assert.equal(portfolioRiskSnapshot(s.account, [], s.balances, []).availableBalance, 200);
  s.account.totalAvailableBalance = ""; assert.ok(portfolioRiskSnapshot(s.account, [], s.balances, []).availableBalance < 567);
});
test("PAPI entry, two native Algo protections, query, cancel, close and user stream share one route", () => withExchange(async (c, s) => {
  await c.preflight(); const order = await c.placeOrder(entry); assert.equal(order.status, "FILLED");
  await c.placeProtection(protection); assert.equal(s.algos.size, 2);
  assert.equal((await c.getOrder("ETHUSDT", "ts-entry")).filledQuantity, 0.2);
  assert.equal((await c.getOrder("ETHUSDT", "ts-sl", true)).status, "NEW");
  assert.equal((await c.getFuturesPosition("ETHUSDT")).signedQuantity, 0.2);
  await c.cancelOrder("ETHUSDT", "ts-tp", true);
  const exit = await c.closePosition({ symbol: "ETHUSDT", side: "LONG", quantity: 0.2, clientOrderId: "ts-exit" }); assert.equal(exit.status, "FILLED");
  await c.cancelAll("ETHUSDT"); const stream = await c.startUserStream(); assert.equal(stream.wsUrl, "wss://fstream.binance.com/pm/ws/fixture-stream"); await c.keepaliveUserStream(stream.listenKey); await c.closeUserStream(stream.listenKey);
  assert.ok(!s.calls.some(r => r.path.includes("marginType") || r.method !== "GET" && !r.path.startsWith("/papi/")));
  assert.equal(s.calls.find(r => r.params.newClientOrderId === "ts-entry").params.selfTradePreventionMode, "EXPIRE_BOTH");
  assert.equal(s.calls.find(r => r.params.newClientOrderId === "ts-exit").params.reduceOnly, "true");
}));
test("triggered protection resolves actual child fills, not algo trigger price", () => withExchange(async (c, s) => {
  await c.placeProtection(protection); Object.assign(s.algos.get("ts-sl"), { algoStatus: "FINISHED", actualOrderId: "501", actualPrice: "980" });
  s.orders.set("501", { orderId: "501", status: "PARTIALLY_FILLED", executedQty: "0.1", avgPrice: "979" });
  const result = await c.getOrder("ETHUSDT", "ts-sl", true); assert.equal(result.status, "PARTIALLY_FILLED"); assert.equal(result.filledQuantity, 0.1); assert.equal(result.averagePrice, 979);
}));
test("a missing triggered child stays UNKNOWN and must not become canceled or retry", () => withExchange(async (c, s) => {
  await c.placeProtection(protection); Object.assign(s.algos.get("ts-sl"), { algoStatus: "FINISHED", actualOrderId: "501" });
  await assert.rejects(c.getOrder("ETHUSDT", "ts-sl", true), e => e.statusUnknown && e.code === null);
  assert.equal(s.calls.filter(r => r.method === "POST").length, 2);
}));
test("protection acknowledgement and cancellation receipt must be confirmed", () => withExchange(async (c, s) => {
  s.override = r => r.method === "POST" ? {} : r.method === "DELETE" ? { complete: false } : undefined;
  await assert.rejects(c.placeProtection(protection), /保护单回执/); await assert.rejects(c.cancelOrder("ETHUSDT", "ts-sl", true), /撤销保护单回执/);
}));
test("unknown entry outcome queries the same client ID once and never re-submits", () => withExchange(async (c, s) => {
  s.override = r => r.path === "/papi/v1/um/order" && r.method === "POST" ? new Response('{"msg":"timeout"}', { status: 503 }) : undefined;
  await assert.rejects(c.placeOrder(entry), e => e instanceof BinanceRequestError && e.statusUnknown);
  assert.equal(s.calls.filter(r => r.path === "/papi/v1/um/order" && r.method === "POST").length, 1);
}));
test("PAPI final margin recheck blocks entry but does not block reduce-only exits", () => withExchange(async (c, s) => {
  s.account.totalAvailableBalance = "1";
  await assert.rejects(c.placeOrder(entry), /保证金复核不足/);
  assert.equal(s.calls.filter(r => r.path === "/papi/v1/um/order" && r.method === "POST").length, 0);
  s.account.accountStatus = "REDUCE_ONLY";
  const exit = await c.closePosition({ symbol: "ETHUSDT", side: "LONG", quantity: 0.2, clientOrderId: "exit" }); assert.equal(exit.status, "FILLED");
}, "portfolio"));
test("same-symbol position or pending order prevents a conflicting entry", () => withExchange(async (c, s) => {
  await c.placeOrder(entry); await assert.rejects(c.placeOrder({ ...entry, clientOrderId: "second" }), /已有交易所仓位/);
}));
test("PAPI daily loss uses UM income and conservative BNB fee debit; transfers excluded", () => withExchange(async (c, s) => {
  s.income = [{ incomeType: "REALIZED_PNL", income: "-10", asset: "USDT" }, { incomeType: "COMMISSION", income: "-0.01", asset: "BNB" }, { incomeType: "TRANSFER", income: "1000", asset: "USDT" }];
  assert.equal((await c.tradingRiskSnapshot()).dailyPnl, -17);
  s.income = new Array(1000).fill(s.income[0]); await assert.rejects(c.tradingRiskSnapshot(), /损益明细不完整/);
}));
test("manual position sizing also respects available margin after PAPI safety reserve", () => {
  const intent = { symbol: "ETHUSDT", side: "LONG", mode: "paper", entryPrice: 1000, stopLoss: 985, takeProfit: 1030, leverage: 5, riskPct: 1, tideSightScore: 84 };
  const result = evaluateTradeIntent(intent, { equity: 10000, availableBalance: 10, portfolioMargin: { minUniMMR: 1.5 } }, { policy: { maxLeverage: 5, riskPerTradePct: 1.5 } });
  assert.equal(result.ok, true); assert.ok(result.executionPlan.risk.notional < 50); assert.equal(result.executionPlan.risk.accountMode, "portfolio");
  const fixed = evaluateTradeIntent({ ...intent, requestedNotional: 200 }, { equity: 10000, availableBalance: 10 }, { policy: { maxLeverage: 5, riskPerTradePct: 1.5 } });
  assert.equal(fixed.ok, false); assert.ok(fixed.violations.some(v => v.code === "MARGIN_INSUFFICIENT"));
});
