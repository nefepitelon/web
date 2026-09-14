const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createHash } = require("node:crypto");
const { Prisma } = require("@prisma/client");

const PENDING = ["QUOTING", "QUOTED", "SUBMITTING", "PENDING", "UNKNOWN"];
const walletAddress = "0x1111111111111111111111111111111111111111";
const contractAddress = "0x2222222222222222222222222222222222222222";
const txHash = `0x${"3".repeat(64)}`;
const defaults = { strategy: "adaptive", budgetUsd: 100, orderUsd: 20, maxPositions: 3,
  stopLossPct: 3, takeProfitPct: 6, maxDrawdownPct: 10, dailyLossPct: 5, intervalSeconds: 60 };

function clone(value) {
  if (Prisma.Decimal.isDecimal(value)) return new Prisma.Decimal(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}
function matches(row, where = {}) {
  return row && Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(option => matches(row, option));
    if (key === "AND") return value.every(option => matches(row, option));
    if (key === "ownerKey_symbol") return matches(row, value);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
      if ("gte" in value) return row[key] >= value.gte;
      if ("lt" in value) return row[key] < value.lt;
    }
    return row[key] === value;
  });
}
function load(file, imports) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Date, process: { env: {} }, console: { info() {}, warn() {}, error() {} },
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Unexpected import: ${name}`); } });
  return exports;
}

function harness(options = {}) {
  const now = new Date();
  const session = { walletAddress, stage: "connected", agentSessionId: "opaque-test-session", sessionExpireAt: Date.now() + 3600000, ...options.session };
  let records = {
    configs: [{ ownerKey: "owner", walletAddress, generation: "generation", enabled: true, settings: defaults,
      sessionEncrypted: "encrypted-test-session", expiresAt: new Date(Date.now() + 3600000), equityHighUsd: 100,
      realizedBaseline: 0, leaseToken: null, leaseUntil: null, ...options.config }],
    orders: clone(options.orders || []), positions: clone(options.positions || []), trades: clone(options.trades || []),
    reports: [{ id: "report-1", symbol: "NVDA", ownerKey: "owner", status: "succeeded", reportMarkdown: "paid report", completedAt: now }],
    events: []
  };
  const calls = { quote: 0, execute: 0, status: 0, wallet: 0, market: 0, settlement: 0, lease: 0, releases: 0, exitInputs: [], executionStats: null };
  const delegates = () => Object.fromEntries(Object.entries({ bstockAutoConfig: "configs", bstockAutoOrder: "orders", bstockAutoPosition: "positions", bstockTradeRecord: "trades", bstockResearchJob: "reports", bstockAutoEvent: "events" }).map(([model, table]) => {
    const find = where => records[table].find(row => matches(row, where));
    return [model, {
      findUnique: async ({ where }) => clone(find(where) || null),
      findUniqueOrThrow: async ({ where }) => { const row = find(where); if (!row) throw new Error(`${model} missing`); return clone(row); },
      findFirst: async ({ where }) => clone(find(where) || null),
      findMany: async ({ where = {}, take } = {}) => clone(records[table].filter(row => matches(row, where)).slice(0, take)),
      count: async ({ where }) => records[table].filter(row => matches(row, where)).length,
      create: async ({ data }) => {
        if (model === "bstockAutoOrder" && records.orders.some(row => row.signalKey === data.signalKey)) {
          throw new Prisma.PrismaClientKnownRequestError("duplicate signal", { code: "P2002", clientVersion: "test" });
        }
        const row = { id: `${table}-${records[table].length + 1}`, status: "QUOTING", createdAt: new Date(), ...clone(data) };
        records[table].push(row); return clone(row);
      },
      update: async ({ where, data }) => { const row = find(where); if (!row) throw new Error(`${model} missing`); Object.assign(row, clone(data)); return clone(row); },
      updateMany: async ({ where, data }) => {
        const rows = records[table].filter(row => matches(row, where));
        rows.forEach(row => Object.assign(row, clone(data)));
        if (model === "bstockAutoConfig" && data.leaseToken === null) calls.releases++;
        return { count: rows.length };
      },
      upsert: async ({ where, create, update }) => {
        const row = find(where);
        if (row) { Object.assign(row, clone(update)); return clone(row); }
        const added = { id: `${table}-${records[table].length + 1}`, ...clone(create) }; records[table].push(added); return clone(added);
      }
    }];
  }));
  const db = delegates();
  const asset = { symbol: "NVDAB", ticker: "NVDA", contractAddress, multiplier: "1", price: 10,
    quoteVolume: 1000000, marketUpdatedAt: now.toISOString(), leveragedOrInverse: false };
  const market = { registrySourceAvailable: true, deliveryMode: "LIVE", fetchedAt: now.toISOString(), assets: [asset], ...options.market };
  const wallet = { paymentBalances: { USDT: { balance: 500, price: 1 }, BNB: { balance: 1, price: 600 } }, bstockBalances: [], totalWalletValueUsd: 1000, ...options.wallet };
  const response = payload => ({ ok: true, cookies: { get() {} }, json: async () => payload });
  const data = {
    AUTO_PENDING: PENDING, jsonValue: value => JSON.parse(JSON.stringify(value)), safeAutoError: error => error.message || "error",
    acquireAutoLease: async () => { calls.lease++; if (options.leaseDenied) return null; Object.assign(records.configs[0], { leaseToken: "lease", leaseUntil: new Date(Date.now() + 300000) }); return "lease"; },
    autoEvent: async (ownerKey, generation, kind, reason, extra) => {
      records.events.push({ ownerKey, generation, kind, reason, ...extra });
      if (options.stopOnScan && kind === "SCAN") records.configs[0].enabled = false;
    },
    pauseAuto: async (ownerKey, generation, reason, status) => {
      if (records.configs[0].generation === generation) Object.assign(records.configs[0], { enabled: false, status, lastError: reason });
    },
    withAutoLock: async (ownerKey, operation) => {
      const snapshot = clone(records);
      try { return await operation(db); } catch (error) { records = snapshot; throw error; }
    }
  };
  const barTime = new Date(now.getTime() - 3600000).toISOString();
  const imports = {
    "server-only": {}, "node:crypto": require("node:crypto"), "@prisma/client": { Prisma },
    "next/server": { NextRequest: class { constructor(url, init) { this.url = url; this.init = init; } async json() { return JSON.parse(this.init.body); } } },
    "@/lib/prisma": { prisma: db },
    "@/lib/bstock-agentic-wallet-auth": { AGENT_SESSION_COOKIE: "test-session", decodeAgentSession: () => clone(session), encodeAgentSession: () => "encrypted-test-session" },
    "@/lib/bstock-agentic-wallet-client": { agentSessionKey: () => "agent", agentWalletOwnerKey: address => address === walletAddress ? "owner" : "other-owner" },
    "@/lib/bstock-agentic-wallet-data": { fetchAgentWalletData: async () => { calls.wallet++; return { state: clone(session), address: session.walletAddress, tokens: options.tokens || [] }; }, walletSnapshotDto: () => wallet },
    "@/lib/bstock-alpha-live": { fetchOfficialBstockMarket: async () => { calls.market++; return market; },
      fetchCmcLiveSnapshot: async () => ({ score: 90, regime: "RISK_ON", fetchedAt: new Date().toISOString(), deliveryMode: "LIVE" }),
      fetchBstockMarketHistory: async () => ({ fetchedAt: new Date().toISOString(), deliveryMode: "LIVE", points: [] }),
      compareDecimals: (a, b) => new Prisma.Decimal(a).comparedTo(b), multiplyDecimals: (a, b) => new Prisma.Decimal(a).mul(b).toFixed(), resolveBstockSellRawAmount: value => value },
    "@/lib/bstock-auto-strategy": { AUTO_STRATEGY_VERSION: "test", autoSettingsSchema: {
      parse: value => { if (options.invalidSettings) throw new Error("Invalid settings"); return value; },
      safeParse: value => options.invalidSettings ? { success: false } : { success: true, data: value }
    },
      selectAutoSignal: () => ({ action: "buy", barTime, score: 80, strategy: "trend", reason: "BREAKOUT", indicators: { expectedUpsidePct: 6 } }),
      selectAutoExit: input => { calls.exitInputs.push(input); return { exit: false, reason: "HOLD" }; }, assessAutoQuoteFriction: () => ({ allowed: true, reason: "PASS" }) },
    "@/lib/bstock-auto-data": data,
    "@/lib/bstock-trading-quote-handler": { handleBstockTradingQuote: async request => {
      calls.quote++; const body = await request.json();
      records.trades.push({ id: "trade-created", ownerKey: "owner", status: "INTENT_CREATED" });
      return response({ intent: "opaque-intent", tradeRecordId: "trade-created", toAmount: String(body.side === "buy" ? Number(body.amount) / asset.price : Number(body.amount) * asset.price),
        feeUsd: 0.01, gasUsd: 0.01, expiresAt: Date.now() + 60000, notionalUsd: Number(body.amount) * (body.side === "buy" ? 1 : asset.price), decision: {} });
    } },
    "@/lib/bstock-trading-execute-handler": { handleBstockTradingExecute: async (request, context) => {
      calls.execute++; calls.executionStats = clone(records.configs[0].stats); const row = records.orders.find(order => order.id === context.automation.orderId); row.status = "SUBMITTING";
      if (options.executeTimeout) throw new Error("timeout");
      records.trades.find(trade => trade.id === row.tradeRecordId).orderId = "wallet-order";
      return response({ orderId: "wallet-order", status: "SUBMITTED" });
    } },
    "@/lib/bstock-trading-status-handler": { handleBstockTradingStatus: async () => { calls.status++; return response(options.receipt || { final: false, successful: false, txHash: null }); } },
    "@/lib/bstock-auto-settlement": { readAutoGasCost: async () => ({ gasUsd: "0.01" }), readAutoSettlement: async () => { calls.settlement++; return options.settlement || { paymentAmount: "60", usd: "60", rawQuantity: "5", quantity: "5", gasUsd: "0.01" }; } }
  };
  const runtime = load("lib/bstock-auto-runtime.ts", imports);
  return { ...runtime, calls, get state() { return records; }, barTime, data, db };
}
function pendingOrder(overrides = {}) {
  return { id: "auto-pending", ownerKey: "owner", generation: "generation", symbol: "NVDAB", side: "sell", strategy: "trend",
    tradeRecordId: "trade-pending", status: "PENDING", orderId: "wallet-order", requestedAmount: "5", createdAt: new Date(), submittedAt: new Date(),
    decision: { asset: { contractAddress, multiplier: "1" }, usdtPriceUsd: 1, bnbPriceUsd: 600 }, ...overrides };
}

test("disabled robot without pending orders stops without accessing wallet or markets and releases lease", async () => {
  const h = harness({ config: { enabled: false } });
  assert.equal((await h.runAutoCycle("owner", "generation")).stop, true);
  assert.equal(h.calls.market + h.calls.wallet + h.calls.execute, 0);
  assert.equal(h.calls.releases, 1);
});
test("superseded generation and denied lease cannot create orders", async () => {
  const superseded = harness();
  assert.equal((await superseded.runAutoCycle("owner", "old-generation")).stop, true);
  assert.equal(superseded.calls.lease, 0);
  const held = harness({ leaseDenied: true });
  assert.equal((await held.runAutoCycle("owner", "generation")).stop, false);
  assert.equal(held.calls.market + held.calls.wallet + held.calls.execute, 0);
});
test("expired persisted authorization stops before wallet access", async () => {
  const h = harness({ config: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await h.runAutoCycle("owner", "generation")).stop, true);
  assert.equal(h.state.configs[0].enabled, false);
  assert.equal(h.state.configs[0].status, "EXPIRED");
  assert.equal(h.calls.wallet + h.calls.execute, 0);
});
test("expired decoded wallet session stops even when robot authorization is still valid", async () => {
  const h = harness({ session: { sessionExpireAt: Date.now() - 1000 } });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.state.configs[0].enabled, false);
  assert.equal(h.calls.execute, 0);
});
test("wallet ownership mismatch pauses the robot and never produces a quote", async () => {
  const h = harness({ session: { walletAddress: "0x4444444444444444444444444444444444444444" } });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.state.configs[0].enabled, false);
  assert.equal(h.calls.quote + h.calls.execute, 0);
});
test("invalid settings still release the cycle lease", async () => {
  const h = harness({ invalidSettings: true });
  await h.runAutoCycle("owner", "generation").catch(() => undefined);
  assert.equal(h.calls.releases, 1);
});
test("ambiguous submission is reconciled without rebroadcast across repeated cycles", async () => {
  const h = harness({ orders: [pendingOrder({ status: "UNKNOWN", orderId: null })], trades: [{ id: "trade-pending", status: "SUBMISSION_UNKNOWN", orderId: null }] });
  await h.runAutoCycle("owner", "generation");
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.quote + h.calls.execute, 0);
  assert.equal(h.state.orders[0].status, "UNKNOWN");
  assert.equal(h.state.configs[0].enabled, false);
});
test("known rejected submission without order id becomes FAILED rather than permanently UNKNOWN", async () => {
  const h = harness({ config: { enabled: false }, orders: [pendingOrder({ status: "SUBMITTING", orderId: null })], trades: [{ id: "trade-pending", status: "REJECTED", orderId: null }] });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.state.orders[0].status, "FAILED");
  assert.equal(h.calls.quote + h.calls.execute + h.calls.status, 0);
});
test("stopping during candidate scanning prevents the final order creation", async () => {
  const h = harness({ stopOnScan: true });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.state.orders.length, 0);
  assert.equal(h.calls.quote + h.calls.execute, 0);
});
test("a pending order prevents a second candidate submission", async () => {
  const h = harness();
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.execute, 1);
  assert.equal(h.state.orders[0].status, "PENDING");
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.execute, 1);
  assert.equal(h.calls.status, 1);
});
test("a repeated signal key cannot create another automatic order", async () => {
  const h = harness();
  const signalKey = createHash("sha256").update(`owner:NVDAB:${h.barTime}:buy`).digest("hex");
  h.state.orders.push({ id: "old-signal", ownerKey: "owner", status: "SKIPPED", signalKey });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.quote + h.calls.execute, 0);
  assert.equal(h.state.orders.length, 1);
});
test("next entry cannot exceed the remaining daily turnover allowance", async () => {
  const h = harness({ orders: [{ id: "today-buy", ownerKey: "owner", status: "FINISHED", side: "buy", actualUsd: 195, completedAt: new Date() }] });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.quote + h.calls.execute, 0);
});
test("partial sell settlement retains remaining cost and records only the disposed inventory profit", async () => {
  const h = harness({ config: { enabled: false }, orders: [pendingOrder()], trades: [{ id: "trade-pending", status: "SUBMITTED", orderId: "wallet-order" }],
    positions: [{ id: "position", ownerKey: "owner", symbol: "NVDAB", quantity: "10", costUsd: new Prisma.Decimal(100) }],
    receipt: { final: true, successful: true, txHash, matchStrategy: "ORDER_ID", createdAt: new Date().toISOString() } });
  assert.equal((await h.runAutoCycle("owner", "generation")).stop, true);
  assert.equal(h.state.positions[0].quantity, "5");
  assert.equal(h.state.positions[0].costUsd.toString(), "50");
  assert.equal(h.state.orders[0].realizedPnlUsd.toString(), "10");
  assert.equal(h.state.orders[0].status, "FINISHED");
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.settlement, 1);
});
test("malformed correlated settlement time cannot bypass receipt matching", async () => {
  const h = harness({ config: { enabled: false }, orders: [pendingOrder()], trades: [{ id: "trade-pending", status: "SUBMITTED", orderId: "wallet-order" }],
    receipt: { final: true, successful: true, txHash, matchStrategy: "CORRELATED", createdAt: "not-a-timestamp" } });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.settlement, 0);
  assert.notEqual(h.state.orders[0].status, "FINISHED");
});

test("correlated or caller-provided matches cannot finalize failures or fills even with current timestamps", async () => {
  for (const matchStrategy of ["CORRELATED", "CLIENT_ORDER_ID", "NONE"]) {
    for (const successful of [false, true]) {
      const h = harness({ config: { enabled: false }, orders: [pendingOrder()],
        trades: [{ id: "trade-pending", status: "SUBMITTED", orderId: "wallet-order" }],
        receipt: { final: true, successful, txHash, matchStrategy, createdAt: new Date().toISOString() } });
      await h.runAutoCycle("owner", "generation");
      assert.equal(h.calls.settlement + h.calls.execute, 0);
      assert.equal(h.state.orders[0].status, "PENDING");
      assert.equal(h.state.events.some(event => event.kind === "ORDER_FAILED"), false);
    }
  }
});

function ownedPosition(overrides = {}) {
  return { id: "bot-position", ownerKey: "owner", symbol: "NVDAB", quantity: "1", costUsd: new Prisma.Decimal(10),
    highPrice: 10, contractAddress, multiplier: "1", strategy: "trend", entryOrderId: "entry-order", ...overrides };
}
test("persisted risk exit mode cannot resume buying after equity recovers", async () => {
  const h = harness({ config: { stats: { riskExitOnly: true } } });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.quote + h.calls.execute, 0);
  assert.equal(h.state.configs[0].enabled, false);
  assert.equal(h.state.configs[0].status, "RISK_STOPPED");
});
test("a new drawdown latches risk exit before the first sell broadcast", async () => {
  const h = harness({ config: { equityHighUsd: 200 }, positions: [ownedPosition()],
    wallet: { bstockBalances: [{ address: contractAddress, balanceExact: "1", valueUsd: 10 }] },
    tokens: [{ contractAddress, balance: "1", decimals: 18 }] });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.execute, 1);
  assert.equal(h.calls.executionStats.riskExitOnly, true);
  assert.equal(h.state.orders[0].side, "sell");
  assert.equal(h.state.orders[0].reason, "RISK_CIRCUIT_EXIT");
});
test("user stop does not liquidate already owned bot positions", async () => {
  const h = harness({ config: { enabled: false }, positions: [ownedPosition()] });
  assert.equal((await h.runAutoCycle("owner", "generation")).stop, true);
  assert.equal(h.calls.quote + h.calls.execute, 0);
  assert.equal(h.state.positions[0].quantity, "1");
});
test("mean reversion exits receive the mid-band captured at entry", async () => {
  const h = harness({ positions: [ownedPosition({ strategy: "mean_reversion" })],
    orders: [{ id: "entry-order", ownerKey: "owner", status: "FINISHED", side: "buy", actualUsd: 10, completedAt: new Date(), decision: { signal: { indicators: { midBand: 12 } } } }],
    wallet: { bstockBalances: [{ address: contractAddress, balanceExact: "1", valueUsd: 10 }] } });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.calls.exitInputs.length, 1);
  assert.equal(h.calls.exitInputs[0].midBand, 12);
});
test("actual gas from a failed order counts toward the daily loss circuit", async () => {
  const h = harness({ orders: [{ id: "failed-order", ownerKey: "owner", generation: "generation", status: "FAILED", side: "buy", completedAt: new Date(), decision: { settlement: { gasUsd: "6" } } }] });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.state.configs[0].status, "RISK_STOPPED");
  assert.equal(h.calls.quote + h.calls.execute, 0);
});
test("changed split metadata stops trading before an owned position can be sold incorrectly", async () => {
  const h = harness({ positions: [ownedPosition({ multiplier: "2" })] });
  await h.runAutoCycle("owner", "generation");
  assert.equal(h.state.configs[0].enabled, false);
  assert.equal(h.state.configs[0].status, "RECONCILIATION_REQUIRED");
  assert.equal(h.calls.quote + h.calls.execute, 0);
});

function settlementHarness(overrides = {}) {
  const viem = require("viem");
  const usdt = "0x5555555555555555555555555555555555555555";
  const router = "0x6666666666666666666666666666666666666666";
  const log = (address, from, to, amount) => ({ address,
    topics: viem.encodeEventTopics({ abi: viem.erc20Abi, eventName: "Transfer", args: { from, to } }),
    data: viem.encodeAbiParameters([{ type: "uint256" }], [viem.parseUnits(amount, 18)]) });
  const receipt = { status: "success", from: walletAddress, blockNumber: 100n, gasUsed: 100000n, effectiveGasPrice: 1000000000n,
    logs: [log(usdt, walletAddress, router, "20"), log(usdt, router, walletAddress, "2"), log(contractAddress, router, walletAddress, "2"),
      log(contractAddress, walletAddress, walletAddress, "999")], ...overrides.receipt };
  const chain = { getTransactionReceipt: async () => receipt, getBlockNumber: async () => overrides.blockNumber ?? 101n, readContract: async () => 18 };
  return load("lib/bstock-auto-settlement.ts", {
    "server-only": {}, "viem": { ...viem, createPublicClient: () => chain, http: () => ({}) }, "viem/chains": { bsc: {} },
    "@/lib/bstock-alpha-live": { PAY_TOKEN_ADDRESSES: { USDT: usdt }, multiplyDecimals: (a, b) => new Prisma.Decimal(a).mul(b).toFixed() }
  });
}
const settlementInput = { txHash, walletAddress, contractAddress, multiplier: "10", side: "buy", usdtPriceUsd: 0.99, bnbPriceUsd: 600 };

test("chain settlement uses net wallet flows, split multiplier, captured USD valuation and actual gas", async () => {
  const result = await settlementHarness().readAutoSettlement(settlementInput);
  assert.equal(result.paymentAmount, "18");
  assert.equal(result.usd, "17.82");
  assert.equal(result.rawQuantity, "2");
  assert.equal(result.quantity, "20");
  assert.equal(result.gasUsd, "0.06");
});
test("unconfirmed, failed and wrong-direction receipts never become settled trades", async () => {
  await assert.rejects(settlementHarness({ blockNumber: 100n }).readAutoSettlement(settlementInput), /第二个区块/);
  await assert.rejects(settlementHarness({ receipt: { status: "reverted" } }).readAutoSettlement(settlementInput), /链上交易失败/);
  await assert.rejects(settlementHarness().readAutoSettlement({ ...settlementInput, side: "sell" }), /资金流向/);
  await assert.rejects(settlementHarness().readAutoSettlement({ ...settlementInput, walletAddress: "0x7777777777777777777777777777777777777777" }), /资金流向/);
});
test("sponsored gas is not charged to the user's strategy capital", async () => {
  const module = settlementHarness({ receipt: { from: "0x8888888888888888888888888888888888888888" } });
  assert.equal((await module.readAutoSettlement(settlementInput)).gasUsd, "0");
  assert.equal((await module.readAutoGasCost(settlementInput)).gasUsd, "0");
});
