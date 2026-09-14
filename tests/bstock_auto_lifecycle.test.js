const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createHash } = require("node:crypto");
const { Prisma } = require("@prisma/client");
const viem = require("viem");
require("tsx/cjs");
const strategy = require("../lib/bstock-auto-strategy.ts");
const decimals = require("../lib/bstock-decimals.ts");

const WALLET = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const USDT = "0x5555555555555555555555555555555555555555";
const ROUTER = "0x6666666666666666666666666666666666666666";
const BNB = "0x0000000000000000000000000000000000000000";
const PENDING = ["QUOTING", "QUOTED", "SUBMITTING", "PENDING", "UNKNOWN"];
const D = Prisma.Decimal;
const hash = value => createHash("sha256").update(value).digest("hex");
const compiledModules = new Map();
function clone(value) {
  if (D.isDecimal(value)) return new D(value);
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
}
function matches(row, where = {}) {
  return row && Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some(part => matches(row, part));
    if (key === "AND") return value.every(part => matches(row, part));
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
  let compiled = compiledModules.get(file);
  if (!compiled) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    compiledModules.set(file, compiled);
  }
  const exports = {};
  vm.runInNewContext(compiled, { exports, Date, Buffer, process: { env: {} }, console: { info() {}, warn() {}, error() {} },
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Unexpected integration import: ${name}`); } });
  return exports;
}

// Only transport, persistence and market/research fixtures are substituted. The
// strategy, quote/execute/status handlers, submission claim and log settlement
// below are the same modules used by production. No real wallet or network IO.
function lifecycle(options = {}) {
  const settings = strategy.autoSettingsSchema.parse({});
  const session = { walletAddress: WALLET, stage: "connected", agentSessionId: "test-session", sessionExpireAt: Date.now() + 3_600_000 };
  let rows = { configs: [{ ownerKey: "owner", walletAddress: WALLET, generation: "run", enabled: true, settings,
    sessionEncrypted: "test-encrypted-session", expiresAt: new Date(session.sessionExpireAt), equityHighUsd: new D(100),
    realizedBaseline: new D(0), stats: { riskExitOnly: false }, leaseToken: null, leaseUntil: null }],
    orders: [], positions: [], trades: [], reports: [{ id: "paid-report", symbol: "NVDA", ownerKey: "owner", status: "succeeded", reportMarkdown: "BUY report", completedAt: new Date() }], events: [] };
  const remote = [];
  const receipts = new Map();
  const counts = { quotes: 0, broadcasts: 0, receiptReads: 0, strategyCalls: 0 };
  let rawBalance = new D(0), usdtBalance = new D(500), bnbBalance = new D(1), block = 101n;
  const asset = { symbol: "NVDAB", ticker: "NVDA", contractAddress: TOKEN, multiplier: "10", price: 11.41,
    quoteVolume: 1_000_000, marketUpdatedAt: new Date().toISOString(), campaignEligibility: "CONFIRMED", leveragedOrInverse: false };
  const currentMarket = () => ({ registrySourceAvailable: true, deliveryMode: "LIVE", fetchedAt: new Date().toISOString(), assets: [asset] });
  const quoteRate = 0.99;
  const tokens = () => [{ contractAddress: TOKEN, balance: rawBalance.toFixed(), decimals: 18, symbol: "NVDAB", price: asset.price * 10 },
    { contractAddress: USDT, balance: usdtBalance.toFixed(), decimals: 18, symbol: "USDT", price: quoteRate },
    { contractAddress: BNB, balance: bnbBalance.toFixed(), decimals: 18, symbol: "BNB", price: 600 }];
  const walletDto = () => ({ paymentBalances: {
    USDT: { balance: usdtBalance.toNumber(), balanceExact: usdtBalance.toFixed(), price: quoteRate, valueUsd: usdtBalance.mul(quoteRate).toNumber() },
    BNB: { balance: bnbBalance.toNumber(), balanceExact: bnbBalance.toFixed(), price: 600, valueUsd: bnbBalance.mul(600).toNumber() }
  }, bstockBalances: rawBalance.gt(0) ? [{ address: TOKEN, balance: rawBalance.mul(10).toNumber(), balanceExact: rawBalance.mul(10).toFixed(), price: asset.price, valueUsd: rawBalance.mul(10).mul(asset.price).toNumber() }] : [],
    totalWalletValueUsd: usdtBalance.mul(quoteRate).add(bnbBalance.mul(600)).add(rawBalance.mul(10).mul(asset.price)).toNumber() });
  const tables = { bstockAutoConfig: "configs", bstockAutoOrder: "orders", bstockAutoPosition: "positions", bstockTradeRecord: "trades", bstockResearchJob: "reports", bstockAutoEvent: "events" };
  const database = Object.fromEntries(Object.entries(tables).map(([model, table]) => {
    const find = where => rows[table].find(row => matches(row, where));
    const create = data => {
      if (table === "orders" && rows.orders.some(row => row.signalKey === data.signalKey)) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
      const row = { id: `${table}-${rows[table].length + 1}`, status: "QUOTING", createdAt: new Date(), ...clone(data) };
      rows[table].push(row); return clone(row);
    };
    return [model, {
      findUnique: async ({ where }) => clone(find(where) || null),
      findFirst: async ({ where }) => clone(find(where) || null),
      findUniqueOrThrow: async ({ where }) => { const row = find(where); if (!row) throw new Error(`${model} missing`); return clone(row); },
      findMany: async ({ where = {}, take } = {}) => clone(rows[table].filter(row => matches(row, where)).slice(0, take)),
      aggregate: async ({ where = {}, _sum }) => ({ _sum: Object.fromEntries(Object.keys(_sum || {}).map(key => [key,
        rows[table].filter(row => matches(row, where)).reduce((sum, row) => sum.add(row[key] || 0), new D(0))])) }),
      count: async ({ where }) => rows[table].filter(row => matches(row, where)).length,
      create: async ({ data }) => create(data),
      update: async ({ where, data }) => { const row = find(where); if (!row) throw new Error(`${model} missing`); Object.assign(row, clone(data)); return clone(row); },
      updateMany: async ({ where, data }) => { const matched = rows[table].filter(row => matches(row, where)); matched.forEach(row => Object.assign(row, clone(data))); return { count: matched.length }; },
      upsert: async ({ where, create: data, update }) => { const row = find(where); if (!row) return create(data); Object.assign(row, clone(update)); return clone(row); }
    }];
  }));
  database.$queryRaw = async () => [];
  database.$transaction = async fn => { const before = clone(rows); try { return await fn(database); } catch (error) { rows = before; throw error; } };
  const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status,
    cookies: { get() {}, set() {} }, json: async () => payload });
  class Request { constructor(url, init) { this.url = url; this.init = init; } async json() { return JSON.parse(this.init.body); } }
  class WalletError extends Error { constructor(message, info = {}) { super(message); this.status = info.status || 502; this.code = info.code; this.terminal = info.terminal; } }
  const auth = { AGENT_SESSION_COOKIE: "test-cookie", decodeAgentSession: () => clone(session), encodeAgentSession: () => "test-encrypted-session",
    noStoreHeaders: () => ({}), isSameOrigin: () => true, clearAgentSessionCookieOptions: () => ({}) };
  const client = { AgenticWalletRequestError: WalletError, agentSessionKey: () => "agent", agentWalletOwnerKey: address => address.toLowerCase() === WALLET ? "owner" : "other",
    connectedAgentSession: () => clone(session), persistAgentSession: value => value,
    agentWalletRequest: async (state, endpoint, request) => {
      const input = request.body;
      if (endpoint.endsWith("/quote")) {
        counts.quotes++;
        const buy = input.fromToken.toLowerCase() === USDT;
        const output = buy ? new D(input.amount).mul(quoteRate).div(asset.price).div(10) : new D(input.amount).mul(10).mul(asset.price).div(quoteRate);
        return { state, data: { toCoinAmount: output.toFixed(18, D.ROUND_DOWN), feeDetail: { rateFiatValue: "0.01", ratePercent: "0.05" }, gasDetails: { gasFeeInUsd: "0.06" } } };
      }
      if (endpoint.endsWith("/place-order")) {
        counts.broadcasts++;
        assert.equal(rows.configs[0].enabled, true, "disabled robot reached transport");
        const buy = input.fromToken.toLowerCase() === USDT;
        if (buy) assert.equal(rows.configs[0].stats.riskExitOnly, false, "risk latch reached a buy broadcast");
        if (options.timeoutAfterBroadcast) throw new Error("mock transport timeout after send");
        const output = buy ? new D(input.amount).mul(quoteRate).div(asset.price).div(10) : new D(input.amount).mul(10).mul(asset.price).div(quoteRate);
        const row = { orderId: `wallet-order-${remote.length + 1}`, status: "SUBMITTED", fromToken: input.fromToken, toToken: input.toToken,
          fromAmount: input.amount, toAmount: output.toFixed(18, D.ROUND_DOWN), createdAt: new Date().toISOString(), fromSymbol: buy ? "USDT" : "NVDAB", toSymbol: buy ? "NVDAB" : "USDT", buy };
        remote.push(row);
        return { state, data: { orderId: row.orderId, status: "SUBMITTED", code: "000000" } };
      }
      if (endpoint.endsWith("/batch-query-market-orders")) return { state, data: { rows: clone(input.orderId ? remote.filter(row => row.orderId === input.orderId) : remote) } };
      throw new Error(`Unexpected transport path: ${endpoint}`);
    } };
  const lastClosed = Math.floor(Date.now() / 3_600_000) * 3_600_000 - 1;
  const points = Array.from({ length: 48 }, (_, index) => {
    const close = 10 + index * 0.03, closeMs = lastClosed - (47 - index) * 3_600_000;
    return { openTime: new Date(closeMs - 3_600_000 + 1).toISOString(), closeTime: new Date(closeMs).toISOString(), open: close - 0.01, high: close + 0.01, low: close - 0.02, close, volume: 10000 };
  });
  const live = { ...decimals, BSTOCK_SYMBOL_PATTERN: /^[A-Z0-9]+B$/, PAY_TOKEN_ADDRESSES: { USDT, BNB },
    fetchOfficialBstockMarket: async () => { asset.marketUpdatedAt = new Date().toISOString(); return currentMarket(); },
    fetchCmcLiveSnapshot: async () => ({ score: 90, regime: "RISK_ON", fetchedAt: new Date().toISOString(), deliveryMode: "LIVE" }),
    fetchBstockMarketHistory: async () => ({ points, fetchedAt: new Date().toISOString(), deliveryMode: "LIVE" }),
    encodeTradeIntent: value => Buffer.from(JSON.stringify(value)).toString("base64"), decodeTradeIntent: value => JSON.parse(Buffer.from(value, "base64").toString()),
    safeNumber: value => { const result = Number(value); return Number.isFinite(result) ? result : 0; },
    agentStudioRatingScore: () => 90, extractAgentStudioReportSummary: () => ({ rating: "BUY" }),
    realLiquidityScore: () => 90, realPortfolioFitScore: () => 100,
    deterministicBstockScore: () => ({ score: 90, equityScore: 90, equitySource: "Agent Studio" }) };
  const shared = { "server-only": {}, "node:crypto": require("node:crypto"), "zod": require("zod"), "@prisma/client": { Prisma },
    "next/server": { NextRequest: Request, NextResponse: { json: (payload, init) => response(payload, init?.status) } },
    "@/lib/prisma": { prisma: database }, "@/lib/bstock-agentic-wallet-auth": auth, "@/lib/bstock-agentic-wallet-client": client,
    "@/lib/bstock-agentic-wallet-data": { fetchAgentWalletData: async state => ({ state, address: WALLET, tokens: tokens() }), walletSnapshotDto: walletDto },
    "@/lib/bstock-alpha-live": live, "@/lib/bstock-trade-records": { tradeIntentAuditHash: hash } };
  const claim = load("lib/bstock-trade-submission-claim.ts", shared);
  const modules = { ...shared,
    "@/lib/bstock-auto-strategy": strategy,
    "@/lib/bstock-auto-execution-guard": load("lib/bstock-auto-execution-guard.ts", { ...shared, "@/lib/bstock-trade-submission-claim": claim }),
    "@/lib/bstock-risk-policy": load("lib/bstock-risk-policy.ts", shared),
    "@/lib/bstock-agentic-wallet-quote": load("lib/bstock-agentic-wallet-quote.ts", shared),
    "@/lib/bstock-agentic-wallet-order": load("lib/bstock-agentic-wallet-order.ts", shared),
    "@/lib/bstock-agentic-wallet-order-status": load("lib/bstock-agentic-wallet-order-status.ts", shared),
    "@/lib/bstock-trade-submission-claim": claim };
  const chain = { getTransactionReceipt: async ({ hash: txHash }) => { counts.receiptReads++; const receipt = receipts.get(txHash); if (!receipt) throw new Error("Receipt not found"); return receipt; },
    getBlockNumber: async () => block, readContract: async () => 18 };
  const settlement = load("lib/bstock-auto-settlement.ts", { ...shared, "viem": { ...viem, createPublicClient: () => chain, http: () => ({}) }, "viem/chains": { bsc: {} } });
  const data = {
    AUTO_PENDING: PENDING, jsonValue: value => JSON.parse(JSON.stringify(value)), safeAutoError: error => error.message || "error",
    acquireAutoLease: async () => { rows.configs[0].leaseToken = "lease"; rows.configs[0].leaseUntil = new Date(Date.now() + 300000); return "lease"; },
    withAutoLock: async (owner, fn) => database.$transaction(fn),
    autoEvent: async (ownerKey, generation, kind, reason, extra) => {
      rows.events.push({ ownerKey, generation, kind, reason, ...clone(extra) });
      if (options.stopAfterQuote && kind === "QUOTE") rows.configs[0].enabled = false;
    },
    pauseAuto: async (owner, generation, reason, status) => { rows.configs[0].enabled = false; rows.configs[0].status = status; rows.configs[0].lastError = reason; }
  };
  const statusHandler = load("lib/bstock-trading-status-handler.ts", modules);
  const runtime = load("lib/bstock-auto-runtime.ts", { ...modules, "@/lib/bstock-auto-data": data,
    "@/lib/bstock-auto-strategy": { ...strategy, selectAutoSignal: input => { counts.strategyCalls++; return strategy.selectAutoSignal(input); } },
    "@/lib/bstock-auto-settlement": settlement,
    "@/lib/bstock-trading-quote-handler": load("lib/bstock-trading-quote-handler.ts", modules),
    "@/lib/bstock-trading-execute-handler": load("lib/bstock-trading-execute-handler.ts", modules),
    "@/lib/bstock-trading-status-handler": statusHandler });
  function confirm(index, { proof = true, blocks = 2 } = {}) {
    const order = remote[index];
    assert.ok(order, "simulation has no corresponding remote order");
    const txHash = `0x${String(index + 1).padStart(64, "0")}`;
    const log = (address, from, to, amount) => ({ address,
      topics: viem.encodeEventTopics({ abi: viem.erc20Abi, eventName: "Transfer", args: { from, to } }),
      data: viem.encodeAbiParameters([{ type: "uint256" }], [viem.parseUnits(amount, 18)]) });
    order.status = "FINISHED"; order.txHash = txHash;
    receipts.set(txHash, { status: "success", from: WALLET, blockNumber: 100n, gasUsed: 100000n, effectiveGasPrice: 1000000000n,
      logs: proof ? [log(order.fromToken, WALLET, ROUTER, order.fromAmount), log(order.toToken, ROUTER, WALLET, order.toAmount)] : [] });
    block = 100n + BigInt(blocks - 1);
    if (proof && !order.applied) {
      if (order.buy) { usdtBalance = usdtBalance.sub(order.fromAmount); rawBalance = rawBalance.add(order.toAmount); }
      else { rawBalance = rawBalance.sub(order.fromAmount); usdtBalance = usdtBalance.add(order.toAmount); }
      bnbBalance = bnbBalance.sub("0.0001"); order.applied = true;
    }
  }
  return { run: () => runtime.runAutoCycle("owner", "run"), confirm, asset, counts, remote,
    publicStatus: async index => (await statusHandler.handleBstockTradingStatus(new Request("https://example.test/status", { body: JSON.stringify({ orderId: remote[index].orderId }) }))).json(),
    get rows() { return rows; }, walletDto, setBlock: value => { block = BigInt(value); } };
}

async function buyLot(h) {
  await h.run();
  assert.equal(h.counts.broadcasts, 1, JSON.stringify(h.rows.events));
  assert.equal(h.rows.orders[0].side, "buy");
  assert.equal(h.rows.orders[0].status, "PENDING");
  assert.equal(h.rows.positions.length, 0, "submission must not create a position");
  h.confirm(0);
  await h.run();
  assert.equal(h.rows.orders[0].status, "FINISHED", JSON.stringify(h.rows.events));
  assert.equal(h.rows.positions.length, 1);
}

test("real strategy through quote/claim/broadcast, verified buy lot, exit and realized ledger", async () => {
  const h = lifecycle();
  await h.run();
  assert.equal(h.counts.strategyCalls, 1);
  assert.equal(h.counts.broadcasts, 1, JSON.stringify(h.rows.events));
  assert.equal(h.rows.orders[0].decision.signal.reason, "TREND_CONFIRMED_BREAKOUT");
  assert.equal(h.rows.orders[0].status, "PENDING");
  assert.equal(h.rows.positions.length, 0);
  await h.run();
  assert.equal(h.counts.broadcasts, 1, "pending order was rebroadcast");
  assert.equal(h.rows.positions.length, 0);
  h.confirm(0); await h.run();
  const buy = h.rows.orders[0], lot = h.rows.positions[0];
  assert.equal(buy.status, "FINISHED", JSON.stringify(h.rows.events));
  assert.ok(new D(buy.actualUsd).eq(new D(buy.requestedAmount).mul("0.99")));
  assert.ok(new D(lot.quantity).eq(new D(h.remote[0].toAmount).mul(10)));
  assert.ok(new D(lot.costUsd).eq(buy.actualUsd));
  assert.equal(buy.decision.settlement.gasUsd, "0.06");
  assert.ok(new D(h.rows.trades[0].actualFromAmount).eq(buy.requestedAmount), "shared ledger payment units must stay USDT");
  h.asset.price = 12.4;
  await h.run();
  assert.equal(h.counts.broadcasts, 2, JSON.stringify(h.rows.events));
  assert.equal(h.rows.orders[1].side, "sell");
  assert.equal(h.rows.orders[1].reason, "TAKE_PROFIT");
  assert.ok(new D(h.rows.positions[0].quantity).gt(0), "pending disposal erased inventory");
  h.confirm(1); await h.run();
  const sell = h.rows.orders[1];
  assert.equal(sell.status, "FINISHED", JSON.stringify(h.rows.events));
  assert.ok(new D(sell.realizedPnlUsd).eq(new D(sell.actualUsd).sub(buy.actualUsd)));
  assert.ok(new D(sell.realizedPnlUsd).gt(0));
  assert.equal(h.rows.positions[0].quantity, "0");
  assert.equal(h.rows.positions[0].costUsd.toString(), "0");
  assert.equal(h.rows.trades[1].status, "FINISHED");
  const verifiedAmounts = [h.rows.trades[1].actualFromAmount, h.rows.trades[1].actualToAmount];
  h.remote[1].fromAmount = "999"; h.remote[1].toAmount = "999";
  assert.equal((await h.publicStatus(1)).successful, true);
  assert.deepEqual([h.rows.trades[1].actualFromAmount, h.rows.trades[1].actualToAmount], verifiedAmounts, "later upstream polls overwrote verified settlement amounts");
  await h.run();
  assert.equal(h.counts.broadcasts, 2, "same closed bar produced another buy");
  assert.equal(h.rows.configs[0].stats.generationGasUsd, 0.12);
  assert.ok(Math.abs(h.rows.configs[0].stats.botEquityUsd - (100 + Number(sell.realizedPnlUsd) - 0.12)) < 1e-8);
  const fills = h.rows.events.filter(event => event.kind === "FILLED");
  assert.equal(fills.length, 2);
  assert.ok(fills.every(event => event.orderId && event.txHash && event.metadata.autoOrderId && event.metadata.tradeRecordId));
});

test("user stop after quote wins the real submission claim and prevents transport", async () => {
  const h = lifecycle({ stopAfterQuote: true });
  await h.run();
  assert.equal(h.counts.quotes, 1);
  assert.equal(h.counts.broadcasts, 0);
  assert.equal(h.rows.orders[0].status, "SKIPPED");
  assert.equal(h.rows.positions.length, 0);
  assert.equal(h.rows.trades[0].status, "INTENT_CREATED");
  assert.equal(h.rows.configs[0].enabled, false);
});

test("Gas loss latches exit-only before a sell and stops once the bot lot is flat", async () => {
  const h = lifecycle();
  await buyLot(h);
  h.rows.orders.push({ id: "failed-gas", ownerKey: "owner", generation: "run", status: "FAILED", side: "buy", completedAt: new Date(), decision: { settlement: { gasUsd: "6" } } });
  await h.run();
  assert.equal(h.rows.configs[0].stats.riskExitOnly, true);
  assert.equal(h.rows.configs[0].status, "RISK_EXITING");
  assert.equal(h.rows.orders.at(-1).reason, "RISK_CIRCUIT_EXIT");
  assert.equal(h.rows.orders.at(-1).side, "sell");
  assert.equal(h.counts.broadcasts, 2);
  h.confirm(1); await h.run();
  const broadcasts = h.counts.broadcasts;
  assert.equal((await h.run()).stop, true);
  assert.equal(h.rows.configs[0].enabled, false);
  assert.equal(h.rows.configs[0].status, "RISK_STOPPED");
  assert.equal(h.counts.broadcasts, broadcasts);
});

test("a persisted risk latch cannot buy after a recovery, and manual stop never liquidates", async () => {
  const recovered = lifecycle();
  recovered.rows.configs[0].stats.riskExitOnly = true;
  assert.equal((await recovered.run()).stop, true);
  assert.equal(recovered.counts.broadcasts, 0);
  const stopped = lifecycle();
  await buyLot(stopped);
  stopped.rows.configs[0].enabled = false;
  stopped.asset.price = 1;
  assert.equal((await stopped.run()).stop, true);
  assert.equal(stopped.counts.broadcasts, 1);
  assert.ok(Number(stopped.rows.positions[0].quantity) > 0);
});

test("upstream FINISHED without valid chain proof cannot enter either successful ledger", async () => {
  const h = lifecycle();
  await h.run(); h.confirm(0, { proof: false }); await h.run();
  assert.notEqual(h.rows.orders[0].status, "FINISHED");
  assert.equal(h.rows.positions.length, 0);
  assert.notEqual(h.rows.trades[0].status, "FINISHED", "shared ledger accepted unverified upstream success");
  const visible = await h.publicStatus(0);
  assert.equal(visible.final, false);
  assert.equal(visible.successful, false);
  assert.equal(visible.awaitingChainProof, true);
  assert.equal(h.rows.events.filter(event => event.kind === "FILLED").length, 0);
  await h.run();
  assert.equal(h.counts.broadcasts, 1);
});

test("one-block receipts stay pending and ambiguous submissions are never retried", async () => {
  const unconfirmed = lifecycle();
  await unconfirmed.run(); unconfirmed.confirm(0, { blocks: 1 }); await unconfirmed.run();
  assert.equal(unconfirmed.rows.positions.length, 0);
  assert.notEqual(unconfirmed.rows.orders[0].status, "FINISHED");
  unconfirmed.setBlock(101); await unconfirmed.run();
  assert.equal(unconfirmed.rows.orders[0].status, "FINISHED");
  assert.equal(unconfirmed.counts.broadcasts, 1);
  const ambiguous = lifecycle({ timeoutAfterBroadcast: true });
  await ambiguous.run(); await ambiguous.run();
  assert.equal(ambiguous.counts.broadcasts, 1);
  assert.equal(ambiguous.rows.orders[0].status, "UNKNOWN");
  assert.equal(ambiguous.rows.positions.length, 0);
});
