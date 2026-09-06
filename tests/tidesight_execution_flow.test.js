const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
require("tsx/cjs");
let store, config, sent, protection, failOrder, failProtection, accountSnapshot, papiMode = false, actualClient, actualBinanceError;
function reset() {
  store = { credential: [{ id: "credential", userId: "user", environment: "LIVE", market: "FUTURES", verifiedAt: new Date(), enabled: true, apiKeyEncrypted: "fixture", apiSecretEncrypted: "fixture" }], intent: [], plan: [], order: [], position: [], audit: [], event: [] };
  config = { id: "config", userId: "user", activeMode: "LIVE", defaultMarket: "FUTURES", liveEnabled: true, liveUnlockedAt: new Date(), reconciliationHealthy: true, lastReconciledAt: new Date(), killSwitchActive: false, requireProtectionOrders: true, requireManualConfirmation: true, riskPerTradePct: 1.5, maxLeverage: 25, dailyLossLimitPct: 2, dedupeWindowMinutes: 15, maxOpenPositions: 6, maxPortfolioExposurePct: 50, minTideSightScore: 75, perOrderNotionalLimit: 1000, dailyNotionalLimit: 5000, autoExecuteEnabled: true, autoGeneration: "run", autoStartedAt: new Date(Date.now() - 60000), autoHeartbeatAt: new Date(), autoStopLossPct: 1.5, autoTakeProfitPct: 3, executionLeaseUntil: null, executionLeaseToken: null };
  sent = 0; protection = 0; failOrder = false; failProtection = false;
  accountSnapshot = { equity: 20000, availableBalance: 20000, dailyPnl: 0, riskExposureNotional: 0, openPositionCount: 0 };
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(item => matches(row, item));
    if (key === "userId_environment_market") return matches(row, value);
    const actual = row[key];
    if (value === null) return actual == null;
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("not" in value) return actual !== value.not;
      if ("in" in value) return value.in.includes(actual);
      if ("notIn" in value) return !value.notIn.includes(actual);
      if ("gte" in value) return actual >= value.gte;
      if ("lt" in value) return actual < value.lt;
    }
    return actual === value;
  });
}
function expand(name, row) {
  if (!row) return row;
  const result = { ...row };
  if (name === "plan") Object.assign(result, { intent: store.intent.find(item => item.id === row.intentId), orders: store.order.filter(item => item.planId === row.id), position: store.position.find(item => item.planId === row.id) });
  if (name === "order" || name === "position") result.plan = expand("plan", store.plan.find(item => item.id === row.planId));
  if (name === "order") result.credential = store.credential.find(item => item.id === row.credentialId);
  return result;
}
function table(name) {
  return {
    async findMany({ where } = {}) { return store[name].filter(item => matches(item, where)).map(item => expand(name, item)); },
    async findFirst({ where }) { return expand(name, store[name].find(item => matches(item, where))) || null; },
    async findUnique(args) { return this.findFirst(args); },
    async findUniqueOrThrow(args) { const row = await this.findFirst(args); if (!row) throw new Error("fixture missing"); return row; },
    async findFirstOrThrow(args) { return this.findUniqueOrThrow(args); },
    async count({ where }) { return store[name].filter(item => matches(item, where)).length; },
    async create({ data }) {
      if (name === "event" && store.event.some(item => item.eventKey === data.eventKey)) {
        const { Prisma } = require("@prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" });
      }
      const row = { id: `${name}-${store[name].length}`, createdAt: new Date(), state: "MONITORING", status: name === "event" ? "CLAIMED" : "PENDING", ...data }; store[name].push(row); return expand(name, row);
    },
    async update({ where, data }) { const row = store[name].find(item => matches(item, where)); if (!row) throw new Error(`fixture ${name} missing`); Object.assign(row, data); return expand(name, row); },
    async updateMany({ where, data }) { const rows = store[name].filter(item => matches(item, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    async upsert({ where, create, update }) { const row = store[name].find(item => matches(item, where)); if (row) { Object.assign(row, update); return expand(name, row); } return this.create({ data: create }); },
  };
}
const prisma = {
  tideSightExecutionConfig: {
    async upsert() { return { ...config }; }, async findUnique() { return { ...config }; },
    async update({ data }) { Object.assign(config, data); return { ...config }; },
    async updateMany({ where, data }) { if (!matches(config, where)) return { count: 0 }; Object.assign(config, data); return { count: 1 }; },
  },
  user: { async findUnique() { return { status: "ACTIVE", roles: [{ role: { key: "admin" } }], twoFactor: { enabledAt: new Date() } }; } },
  tideSightTradingCredential: table("credential"), tideSightTradeIntent: table("intent"), tideSightExecutionPlan: table("plan"), tideSightTradingOrder: table("order"), tideSightTradingPosition: table("position"), tideSightTradingAudit: table("audit"), tideSightAutoEvent: table("event"),
  async $transaction(values) { return Promise.all(values); },
};
class BinanceRequestError extends Error { constructor(message) { super(message); this.statusUnknown = true; } }
class Client {
  constructor(options) { if (papiMode) return new actualClient(options); }
  async tradingRiskSnapshot() { return accountSnapshot; }
  async placeOrder(input) { await input.beforeSubmit?.(); sent++; if (failOrder) throw new actualBinanceError("network status unknown", 503, null, true); return { status: "FILLED", filledQuantity: input.quantity, averagePrice: 1000, exchangeOrderId: "fixture-order", raw: {}, clientOrderId: input.clientOrderId }; }
  async placeProtection() { if (failProtection) throw new Error("fixture protection failure"); protection += 2; return {}; }
  async closePosition() { return {}; } async cancelAll() {} async close() {}
}
const originalLoad = Module._load;
Module._load = function(name, parent, isMain) {
  const normalized = name.replaceAll("\\", "/");
  if (name === "server-only") return {};
  if (normalized === "@/lib/prisma") return { prisma };
  if (normalized === "@/lib/tidesight/execution/binance") return { TideSightBinanceClient: Client, BinanceRequestError: actualBinanceError, getLiveBinanceReferencePrice: async () => 1000, isBinanceMissingOrderError: () => false };
  if (normalized === "@/lib/tidesight/execution/credentials") return { decryptTradingSecret: value => value };
  return originalLoad.call(this, name, parent, isMain);
};
actualClient = require("../lib/tidesight/execution/binance.ts").TideSightBinanceClient;
actualBinanceError = require("../lib/tidesight/execution/binance.ts").BinanceRequestError;
const { approveTradeIntent, executePlan, preflightCredential, reconcileExecution } = require("../lib/tidesight/execution/service.ts");
const { executeAutomaticSignal } = require("../lib/tidesight/automation-runtime.ts");
const input = { symbol: "ETHUSDT", side: "LONG", orderType: "MARKET", stopLoss: 985, takeProfit: 1030, leverage: 5, riskPct: 1.5, requestedNotional: 200, tideSightScore: 84, source: "fixture-manual", mode: "live", market: "futures" };

test("manual approval -> final risk recheck -> one entry -> two native protection records", async () => {
  reset(); const approval = await approveTradeIntent(input, "user", true);
  assert.equal(approval.ok, true);
  const result = await executePlan(approval.executionPlan.planId, "user");
  assert.equal(result.ok, true); assert.equal(sent, 1); assert.equal(protection, 2);
  assert.equal(store.position.length, 1); assert.equal(store.order.length, 3);
  assert.equal(store.plan[0].state, "PROTECTION_ACTIVE");
  await executePlan(approval.executionPlan.planId, "user"); assert.equal(sent, 1);
});
test("policy changes after approval are rechecked before any exchange submission", async () => {
  reset(); const approval = await approveTradeIntent(input, "user", true);
  config.maxLeverage = 1;
  await assert.rejects(executePlan(approval.executionPlan.planId, "user"), /风控拒绝/);
  assert.equal(sent, 0); assert.equal(config.executionLeaseToken, null);
});
test("distributed writer lock prevents concurrent execution attempts", async () => {
  reset(); const approval = await approveTradeIntent(input, "user", true);
  const result = await Promise.allSettled([executePlan(approval.executionPlan.planId, "user"), executePlan(approval.executionPlan.planId, "user")]);
  assert.equal(sent, 1); assert.equal(result.filter(item => item.status === "fulfilled").length, 1);
});
test("unknown exchange outcome blocks retry and marks reconciliation unhealthy", async () => {
  reset(); const approval = await approveTradeIntent(input, "user", true); failOrder = true;
  await assert.rejects(executePlan(approval.executionPlan.planId, "user"), /unknown/);
  assert.equal(sent, 1); assert.equal(config.reconciliationHealthy, false);
  assert.equal(store.plan[0].state, "UNKNOWN");
  await assert.rejects(executePlan(approval.executionPlan.planId, "user")); assert.equal(sent, 1);
});
test("native protection failure stops automation and triggers the kill switch", async () => {
  reset(); const approval = await approveTradeIntent(input, "user", true); failProtection = true;
  await assert.rejects(executePlan(approval.executionPlan.planId, "user"), /protection failure/);
  assert.equal(config.killSwitchActive, true); assert.equal(config.autoExecuteEnabled, false);
});
test("automatic candle event is persisted once and cannot send a duplicate entry", async () => {
  reset();
  const signal = { symbol: "ETHUSDT", interval: "15m", closedAt: new Date(Date.now() - 15000).toISOString(), signal: "REBIRTH_GOLDEN_CROSS" };
  await executeAutomaticSignal("user", "run", signal);
  assert.equal(store.event.length, 1); assert.equal(store.event[0].status, "SUBMITTED", store.event[0].message);
  assert.equal(sent, 1); assert.equal(store.intent[0].leverage, 25);
  assert.equal(store.plan[0].riskSnapshot.notional, 1000);
  await executeAutomaticSignal("user", "run", signal); assert.equal(sent, 1); assert.equal(store.event.length, 1);
});
test("automatic target notional is safely reduced before the final risk recheck and only the reduced plan is submitted", async () => {
  reset(); accountSnapshot = { equity: 99.07, availableBalance: 99.07, dailyPnl: 0, riskExposureNotional: 0, openPositionCount: 0 };
  const signal = { symbol: "HYPEUSDT", interval: "15m", closedAt: new Date(Date.now() - 15000).toISOString(), signal: "REBIRTH_GOLDEN_CROSS" };
  await executeAutomaticSignal("user", "run", signal);
  assert.equal(store.event[0].status, "SUBMITTED", store.event[0].message);
  assert.equal(sent, 1); assert.equal(protection, 2);
  assert.equal(store.plan[0].riskSnapshot.targetNotional, 1000);
  assert.equal(store.plan[0].riskSnapshot.notional, 30.02);
  assert.equal(store.plan[0].riskSnapshot.exposureCapped, true);
  assert.match(store.event[0].message, /1000\.00 USDT/);
  assert.match(store.event[0].message, /30\.02 USDT/);
  assert.equal(store.order.find(item => item.role === "ENTRY").quantity, 0.03002121);
});
test("stopped automatic authorization cannot trade or be bypassed through manual execute", async () => {
  reset(); const approval = await approveTradeIntent({ ...input, tideSightScore: null }, "user", true, "run");
  await assert.rejects(executePlan(approval.executionPlan.planId, "user"), /不能经人工入口/);
  config.autoExecuteEnabled = false;
  await assert.rejects(executePlan(approval.executionPlan.planId, "user", "run"), /已停止/);
  assert.equal(sent, 0);
});

async function withPapi(run) {
  reset(); papiMode = true;
  store.credential[0].permissionSummary = { accountMode: "portfolio", adapterVersion: 2 };
  const { state, fetch } = require("./helpers/papi-fixture.cjs").papiFixture(); const original = global.fetch;
  global.fetch = fetch;
  try { await run(state); } finally { global.fetch = original; papiMode = false; }
}
test("real PAPI adapter: risk approval -> signed entry -> native protections -> database facts", () => withPapi(async state => {
  const approved = await approveTradeIntent(input, "user", true);
  assert.equal(approved.ok, true); assert.equal(store.plan[0].riskSnapshot.accountMode, "portfolio");
  await executePlan(approved.executionPlan.planId, "user");
  assert.equal(store.position.length, 1); assert.equal(store.order.length, 3); assert.equal(store.plan[0].state, "PROTECTION_ACTIVE");
  assert.equal(state.calls.filter(c => c.path === "/papi/v1/um/order" && c.method === "POST").length, 1);
  assert.equal(state.algos.size, 2); assert.ok(state.calls.filter(c => c.method === "POST").every(c => c.path.startsWith("/papi/")));
}));
test("real PAPI adapter: MACD event executes once through the same risk and persistence chain", () => withPapi(async state => {
  const signal = { symbol: "ETHUSDT", interval: "15m", closedAt: new Date(Date.now() - 15000).toISOString(), signal: "REBIRTH_GOLDEN_CROSS" };
  await executeAutomaticSignal("user", "run", signal); assert.equal(store.event[0].status, "SUBMITTED", store.event[0].message);
  await executeAutomaticSignal("user", "run", signal);
  assert.equal(state.orders.size, 1); assert.equal(state.algos.size, 2); assert.equal(store.plan[0].riskSnapshot.notional, 1000);
}));
test("real PAPI adapter: first detection pins route and relocks LIVE without starting trading", () => withPapi(async state => {
  store.credential[0].permissionSummary = null; store.credential[0].verifiedAt = null;
  const result = await preflightCredential("user", "LIVE", "FUTURES");
  assert.equal(result.accountMode, "portfolio"); assert.equal(store.credential[0].permissionSummary.accountMode, "portfolio");
  assert.equal(config.liveEnabled, false); assert.equal(config.autoExecuteEnabled, false); assert.equal(config.activeMode, "PAPER");
  assert.equal(config.reconciliationHealthy, false); assert.ok(state.calls.every(c => c.method === "GET"));
}));
test("real PAPI adapter: untracked UM positions and external pending orders cannot share risk budget", () => withPapi(async state => {
  state.positions = [{ symbol: "BTCUSDT", positionAmt: "1", notional: "1000", unRealizedProfit: "0", positionSide: "BOTH" }];
  await assert.rejects(approveTradeIntent(input, "user", true), /未管理的 UM 仓位/);
  state.positions = []; state.orders.set("external", { status: "NEW", clientOrderId: "external", symbol: "BTCUSDT" });
  await assert.rejects(approveTradeIntent(input, "user", true), /未管理的挂单/);
  assert.equal(store.plan.length, 0);
}));
test("real PAPI adapter: confirmed stop child fill closes facts and cancels its sibling", () => withPapi(async state => {
  const approval = await approveTradeIntent(input, "user", true); await executePlan(approval.executionPlan.planId, "user");
  const stop = store.order.find(o => o.role === "STOP_LOSS");
  Object.assign(state.algos.get(stop.clientOrderId), { algoStatus: "FINISHED", actualOrderId: "501" });
  state.orders.set("501", { orderId: "501", symbol: "ETHUSDT", status: "FILLED", executedQty: "0.2", avgPrice: "985" }); state.positions = [];
  await reconcileExecution("user", { environment: "LIVE", market: "FUTURES" });
  assert.equal(store.position[0].state, "CLOSED"); assert.equal(store.position[0].markPrice, 985);
  assert.equal(store.order.find(o => o.role === "STOP_LOSS").status, "FILLED");
  assert.equal(store.order.find(o => o.role === "TAKE_PROFIT").status, "CANCELED");
}));
test("real PAPI adapter: missing triggered child cannot be closed with an invented price", () => withPapi(async state => {
  const approval = await approveTradeIntent(input, "user", true); await executePlan(approval.executionPlan.planId, "user");
  const stop = store.order.find(o => o.role === "STOP_LOSS"); Object.assign(state.algos.get(stop.clientOrderId), { algoStatus: "FINISHED", actualOrderId: "501" }); state.positions = [];
  await reconcileExecution("user", { environment: "LIVE", market: "FUTURES" });
  assert.notEqual(store.position[0].state, "CLOSED"); assert.equal(config.reconciliationHealthy, false);
  assert.equal(store.order.find(o => o.role === "STOP_LOSS").status, "UNKNOWN");
}));
test("real PAPI adapter: unknown entry is persisted UNKNOWN and cannot be sent again", () => withPapi(async state => {
  const approval = await approveTradeIntent(input, "user", true);
  state.override = r => r.path === "/papi/v1/um/order" && r.method === "POST" ? new Response('{"msg":"timeout"}', { status: 503 }) : undefined;
  await assert.rejects(executePlan(approval.executionPlan.planId, "user"));
  assert.equal(store.order[0].status, "UNKNOWN"); assert.equal(config.reconciliationHealthy, false);
  await assert.rejects(executePlan(approval.executionPlan.planId, "user"));
  assert.equal(state.calls.filter(c => c.path === "/papi/v1/um/order" && c.method === "POST").length, 1);
}));
