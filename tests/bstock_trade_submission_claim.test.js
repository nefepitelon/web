const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => {
    if (Object.hasOwn(imports, name)) return imports[name];
    throw new Error(`Unexpected import ${name}`);
  }, Date, console: { info() {}, warn() {}, error() {} } });
  return exports;
}

const claimModule = load("lib/bstock-trade-submission-claim.ts");
const guardModule = load("lib/bstock-auto-execution-guard.ts", { "@/lib/bstock-trade-submission-claim": claimModule });
const { claimBstockTradeSubmission: claim, withBstockManualQuoteGuard: quoteGuard } = claimModule;
const identity = { intentHash: "reviewed-intent", ownerKey: "owner", agentKey: "agent" };
const now = new Date("2026-09-08T00:00:00Z");
const automation = { ownerKey: "owner", generation: "generation-1", orderId: "auto-1", leaseToken: "lease-1" };

function matches(row, where) {
  return row && Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in value) return value.in.includes(row[key]);
    if (value && typeof value === "object" && "not" in value) return row[key] !== value.not;
    return row[key] === value;
  });
}

function database(options = {}) {
  let state = {
    trade: { ...identity, id: "trade-1", side: "buy", status: "INTENT_CREATED", automationIgnoredAt: null, createdAt: now },
    config: null,
    order: null,
    manualRecords: [],
    extraAutoLinks: [],
    ...options
  };
  let queue = Promise.resolve();
  const delegates = (working) => ({
    bstockAutoConfig: {
      findUnique: async () => working.config,
      updateMany: async ({ where, data }) => {
        if (!matches(working.config, where)) return { count: 0 };
        Object.assign(working.config, data); return { count: 1 };
      }
    },
    bstockAutoOrder: {
      findFirst: async ({ where }) => [working.order, working.otherOrder].find(row => matches(row, where)) || null,
      updateMany: async ({ where, data }) => {
        if (working.failAutoUpdate || !matches(working.order, where)) return { count: 0 };
        Object.assign(working.order, data);
        return { count: 1 };
      }
    },
    bstockTradeRecord: {
      findUnique: async ({ where }) => matches(working.trade, where) ? working.trade : null,
      updateMany: async ({ where, data }) => {
        if (!matches(working.trade, where)) return { count: 0 };
        Object.assign(working.trade, data);
        return { count: 1 };
      }
    }
  });
  const db = {
    get state() { return state; },
    get bstockTradeRecord() { return delegates(state).bstockTradeRecord; },
    bstockResearchJob: { findFirst: async () => ({ reportMarkdown: "verified report" }) },
    $transaction(callback) {
      const pending = queue.then(async () => {
        const working = structuredClone(state);
        let locked = false;
        const tx = delegates(working);
        tx.$queryRaw = async (strings, ownerKey, cutoff) => {
          assert.equal(ownerKey, identity.ownerKey);
          const sql = strings.join("?");
          if (/pg_advisory_xact_lock/.test(sql)) { locked = true; return []; }
          assert.equal(locked, true, "manual-order checks must follow the owner lock");
          assert.match(sql, /t\."ownerKey" = \?/);
          assert.match(sql, /"automationIgnoredAt" IS NULL/);
          assert.match(sql, /NOT EXISTS[\s\S]*a\."tradeRecordId" = t\.id/);
          assert.doesNotMatch(sql, /a\."ownerKey"/);
          if (working.failManualLookup) throw new Error("manual-order lookup unavailable");
          const nonPending = new Set(["INTENT_CREATED", "FINISHED", "SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED",
            "FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"]);
          const links = [working.order, working.otherOrder, ...working.extraAutoLinks].filter(Boolean);
          return [working.trade, ...working.manualRecords].filter(row => row.ownerKey === ownerKey
            && !links.some(link => link.tradeRecordId === row.id)
            && ((!row.automationIgnoredAt && !nonPending.has(row.status))
              || (row.status === "INTENT_CREATED" && row.createdAt > cutoff))).slice(0, 1);
        };
        const result = await callback(tx);
        assert.equal(locked, true, "submission must take the owner lock");
        state = working;
        return result;
      });
      queue = pending.catch(() => undefined);
      return pending;
    }
  };
  return db;
}

function enabledState() {
  return {
    config: { ownerKey: "owner", enabled: true, generation: "generation-1", expiresAt: new Date(now.getTime() + 60_000), leaseToken: "lease-1", leaseUntil: new Date(now.getTime() + 60_000) },
    order: { id: "auto-1", ownerKey: "owner", generation: "generation-1", status: "QUOTED", tradeRecordId: "trade-1" }
  };
}

test("concurrent executions of one reviewed intent have only one broadcast claimant", async () => {
  const db = database();
  const result = await Promise.all([claim(db, identity, {}, now), claim(db, identity, {}, now)]);
  assert.deepEqual(result, [true, false]);
  assert.equal(db.state.trade.status, "SUBMITTING");
  assert.equal(db.state.trade.submittedAt.getTime(), now.getTime());
});

test("submitted, ambiguous, finished and rejected intents cannot be claimed again", async () => {
  for (const status of ["SUBMITTING", "SUBMISSION_UNKNOWN", "SUBMITTED", "FINISHED", "REJECTED"]) {
    const db = database({ trade: { ...identity, id: "trade-1", status } });
    assert.equal(await claim(db, identity, {}, now), false, status);
    assert.equal(db.state.trade.status, status);
  }
});

test("wrong owner or agent cannot claim another session's intent", async () => {
  const db = database();
  assert.equal(await claim(db, { ...identity, agentKey: "other-agent" }, {}, now), false);
  assert.equal(await claim(db, identity, {}, now), true);
});

test("active automation and stopped automation with unresolved orders block manual execution", async () => {
  const active = database(enabledState());
  await assert.rejects(claim(active, identity, {}, now), { code: "AUTOMATION_OWNS_WALLET" });
  for (const status of ["QUOTING", "QUOTED", "SUBMITTING", "PENDING", "UNKNOWN"]) {
    const stopped = enabledState();
    stopped.config.enabled = false;
    stopped.order.status = status;
    await assert.rejects(claim(database(stopped), identity, {}, now), { code: "AUTOMATION_OWNS_WALLET" });
  }
});

test("valid automation claims both the trade and matching strategy order atomically", async () => {
  const db = database(enabledState());
  assert.equal(await claim(db, identity, { automation }, now), true);
  assert.equal(db.state.trade.status, "SUBMITTING");
  assert.equal(db.state.order.status, "SUBMITTING");
  assert.equal(db.state.order.submittedAt.getTime(), now.getTime());
});

test("disabled, expired, superseded and mismatched automatic orders cannot broadcast", async () => {
  for (const override of [{ enabled: false }, { expiresAt: now }, { generation: "new-generation" }]) {
    const state = enabledState();
    Object.assign(state.config, override);
    const db = database(state);
    await assert.rejects(claim(db, identity, { automation }, now), { code: "AUTOMATION_AUTHORIZATION_EXPIRED" });
    assert.equal(db.state.trade.status, "INTENT_CREATED");
  }
  const state = enabledState();
  state.order.tradeRecordId = "other-intent";
  await assert.rejects(claim(database(state), identity, { automation }, now), { code: "AUTOMATION_QUOTE_MISMATCH" });
});

test("failure to claim the strategy order rolls back the trade claim", async () => {
  const db = database({ ...enabledState(), failAutoUpdate: true });
  await assert.rejects(claim(db, identity, { automation }, now), { code: "AUTOMATION_ORDER_CHANGED" });
  assert.equal(db.state.trade.status, "INTENT_CREATED");
  assert.equal(db.state.order.status, "QUOTED");
});

test("another in-flight automatic order blocks the final broadcast claim", async () => {
  for (const status of ["SUBMITTING", "PENDING", "UNKNOWN"]) {
    const db = database({ ...enabledState(), otherOrder: { id: "other-order", ownerKey: "owner", status } });
    await assert.rejects(claim(db, identity, { automation }, now), { code: "AUTOMATION_ORDER_IN_FLIGHT" });
    assert.equal(db.state.trade.status, "INTENT_CREATED");
    assert.equal(db.state.order.status, "QUOTED");
  }
});

test("new manual pending and unknown states veto an automatic final claim", async () => {
  for (const status of ["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN", "PENDING", "PROCESSING", "QUEUED", "NEW", "UNKNOWN_PROVIDER_STATE"]) {
    const db = database({ ...enabledState(), manualRecords: [{ id: "manual", ownerKey: "owner", status, createdAt: new Date(0) }] });
    await assert.rejects(claim(db, identity, { automation }, now), { code: "AUTOMATION_MANUAL_ORDER_PENDING" });
    assert.equal(db.state.trade.status, "INTENT_CREATED");
    assert.equal(db.state.order.status, "QUOTED");
  }
});

test("reviewed ignored historical rows do not block but a new unignored row still does", async () => {
  const ignored = { id: "historical", ownerKey: "owner", status: "PENDING", automationIgnoredAt: new Date(0), createdAt: new Date(0) };
  const allowed = database({ ...enabledState(), manualRecords: [ignored] });
  assert.equal(await claim(allowed, identity, { automation }, now), true);
  assert.equal(allowed.state.manualRecords[0].status, "PENDING");
  const blocked = database({ ...enabledState(), manualRecords: [ignored, { id: "new", ownerKey: "owner", status: "SUBMITTED", createdAt: now }] });
  await assert.rejects(claim(blocked, identity, { automation }, now), { code: "AUTOMATION_MANUAL_ORDER_PENDING" });
});

test("manual quotes keep their 90-second window and cannot bypass it through an ignore marker", async () => {
  for (const age of [0, 89_999]) {
    const db = database({ ...enabledState(), manualRecords: [{ id: "manual-quote", ownerKey: "owner", status: "INTENT_CREATED",
      automationIgnoredAt: new Date(0), createdAt: new Date(now.getTime() - age) }] });
    await assert.rejects(claim(db, identity, { automation }, now), { code: "AUTOMATION_MANUAL_ORDER_PENDING" });
  }
  const expired = database({ ...enabledState(), manualRecords: [{ id: "old-quote", ownerKey: "owner", status: "INTENT_CREATED",
    createdAt: new Date(now.getTime() - 90_000) }] });
  assert.equal(await claim(expired, identity, { automation }, now), true);
});

test("every automatic link is excluded from manual blockers while foreign manual rows remain isolated", async () => {
  const db = database({ ...enabledState(), manualRecords: [
    { id: "linked-other-owner", ownerKey: "owner", status: "PENDING", createdAt: now },
    { id: "foreign", ownerKey: "another-owner", status: "SUBMITTED", createdAt: now },
    { id: "terminal", ownerKey: "owner", status: "FINISHED", createdAt: now }
  ], extraAutoLinks: [{ id: "legacy-auto", ownerKey: "another-owner", tradeRecordId: "linked-other-owner", status: "FINISHED" }] });
  assert.equal(await claim(db, identity, { automation }, now), true);
});

test("manual blocker database failures fail closed without consuming either quote", async () => {
  const db = database({ ...enabledState(), failManualLookup: true });
  await assert.rejects(claim(db, identity, { automation }, now), /manual-order lookup unavailable/);
  assert.equal(db.state.trade.status, "INTENT_CREATED");
  assert.equal(db.state.order.status, "QUOTED");
});

test("a stale cycle cannot broadcast after its lease is replaced or expires", async () => {
  for (const changed of [{ leaseToken: "new-lease" }, { leaseUntil: now }]) {
    const state = enabledState(); Object.assign(state.config, changed);
    const db = database(state);
    await assert.rejects(claim(db, identity, { automation }, now), { code: "AUTOMATION_LEASE_EXPIRED" });
    assert.equal(db.state.trade.status, "INTENT_CREATED");
  }
});

test("risk-exit mode vetoes a previously quoted buy but permits a matching sell", async () => {
  const state = enabledState(); state.config.stats = { riskExitOnly: true };
  const buy = database(state);
  await assert.rejects(claim(buy, identity, { automation }, now), { code: "AUTOMATION_EXIT_ONLY" });
  const sell = database({ ...state, trade: { ...identity, id: "trade-1", side: "sell", status: "INTENT_CREATED" } });
  assert.equal(await claim(sell, identity, { automation }, now), true);
});

test("browser quote guard blocks active or unresolved automatic trading before persisting an intent", async () => {
  for (const enabled of [true, false]) {
    const state = enabledState();
    state.config.enabled = enabled;
    let persisted = false;
    await assert.rejects(quoteGuard(database(state), "owner", async () => { persisted = true; }), { code: "AUTOMATION_OWNS_WALLET" });
    assert.equal(persisted, false);
  }
  const available = database();
  assert.equal(await quoteGuard(available, "owner", async () => "persisted-intent"), "persisted-intent");
});

test("a robot starting during browser routing is detected by the final quote guard", async () => {
  const db = database({ config: { ownerKey: "owner", enabled: false } });
  await quoteGuard(db, "owner", async () => undefined);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"owner"}))::text`;
    await tx.bstockAutoConfig.updateMany({ where: { ownerKey: "owner" }, data: { enabled: true } });
  });
  let persisted = false;
  await assert.rejects(quoteGuard(db, "owner", async () => { persisted = true; }), { code: "AUTOMATION_OWNS_WALLET" });
  assert.equal(persisted, false);
});

function executionEvidence(overrides = {}) {
  return { side: "buy", now: now.getTime(),
    market: { registrySourceAvailable: true, deliveryMode: "LIVE", fetchedAt: now.toISOString() },
    asset: { contractAddress: "0xstock", multiplier: "1", marketUpdatedAt: now.toISOString() },
    reviewedAsset: { contractAddress: "0xstock", multiplier: "1" },
    cmc: { deliveryMode: "LIVE", fetchedAt: now.toISOString() }, reportCompletedAt: now,
    settings: { budgetUsd: 100, orderUsd: 20 }, notionalUsd: 20, totalWalletValueUsd: 1000,
    postTradeExposureUsd: 20, robotCostUsd: 0, botEquityUsd: 100, gasUsd: 0.05,
    ...overrides };
}
test("automatic broadcast revalidates fresh market, macro and owned research evidence", () => {
  const validate = guardModule.validateBstockAutoExecution;
  assert.doesNotThrow(() => validate(executionEvidence()));
  assert.throws(() => validate(executionEvidence({ market: { registrySourceAvailable: true, deliveryMode: "CACHE_STALE", fetchedAt: now.toISOString() } })), { code: "AUTOMATION_MARKET_STALE" });
  assert.throws(() => validate(executionEvidence({ asset: { contractAddress: "0xstock", multiplier: "1", marketUpdatedAt: new Date(now.getTime() - 120001).toISOString() } })), { code: "AUTOMATION_MARKET_STALE" });
  assert.throws(() => validate(executionEvidence({ cmc: { deliveryMode: "CACHE_STALE", fetchedAt: now.toISOString() } })), { code: "AUTOMATION_CMC_STALE" });
  assert.throws(() => validate(executionEvidence({ reportCompletedAt: new Date(now.getTime() - 7 * 86400000 - 1) })), { code: "AUTOMATION_RESEARCH_STALE" });
  assert.throws(() => validate(executionEvidence({ reviewedAsset: { contractAddress: "0xstock", multiplier: "2" } })), { code: "AUTOMATION_ASSET_CHANGED" });
});
test("automatic broadcast respects refreshed order, exposure and loss-adjusted budget including gas", () => {
  const validate = guardModule.validateBstockAutoExecution;
  assert.throws(() => validate(executionEvidence({ notionalUsd: 20.01 })), { code: "AUTOMATION_ORDER_LIMIT" });
  assert.throws(() => validate(executionEvidence({ postTradeExposureUsd: 250 })), { code: "AUTOMATION_POSITION_LIMIT" });
  assert.throws(() => validate(executionEvidence({ robotCostUsd: 80 })), { code: "AUTOMATION_TOTAL_BUDGET" });
  assert.throws(() => validate(executionEvidence({ robotCostUsd: 20, botEquityUsd: 39 })), { code: "AUTOMATION_TOTAL_BUDGET" });
  assert.throws(() => validate(executionEvidence({ gasUsd: NaN })), { code: "AUTOMATION_BUDGET_UNAVAILABLE" });
  assert.doesNotThrow(() => validate(executionEvidence({ side: "sell", notionalUsd: 100, cmc: null, reportCompletedAt: null, botEquityUsd: -10 })));
});

test("submission timeout consumes the intent and a retry never broadcasts it twice", async () => {
  const db = database();
  let broadcasts = 0;
  const intent = { ...identity, quoteExpiresAt: Date.now() + 60_000, mode: "policy", side: "buy", symbol: "NVDAB", ticker: "NVDA", fromToken: "pay-token", toToken: "stock-token", amount: "5", slippageRatio: "0.003", quoteOutput: "0.02" };
  const state = { clientId: "client" };
  class WalletError extends Error { constructor(message, options = {}) { super(message); Object.assign(this, { status: 502, code: "UPSTREAM_ERROR", terminal: false }, options); } }
  const next = { NextResponse: { json: (payload, options) => ({ ...options, json: async () => payload, cookies: { set() {} } }) } };
  const client = { AgenticWalletRequestError: WalletError, connectedAgentSession: () => state, agentSessionKey: () => "agent", agentWalletOwnerKey: () => "owner", persistAgentSession: (response) => response, agentWalletRequest: async () => { broadcasts++; throw new Error("Network timed out after submission"); } };
  const walletDto = { totalWalletValueUsd: 100, paymentBalances: { BNB: { balance: 1 }, USDT: { price: 1, balanceExact: "100" } }, bstockBalances: [] };
  const live = { decodeTradeIntent: () => intent, fetchOfficialBstockMarket: async () => ({ assets: [{ symbol: "NVDAB", ticker: "NVDA", contractAddress: "stock-token", multiplier: "1", price: 200, quoteVolume: 1000 }] }), fetchCmcLiveSnapshot: async () => ({ score: 90, regime: "RISK_ON" }), PAY_TOKEN_ADDRESSES: { USDT: "pay-token" }, safeNumber: Number, compareDecimals: (a, b) => Number(a) - Number(b), realLiquidityScore: () => 90, realPortfolioFitScore: () => 90, deterministicBstockScore: () => ({ score: 90 }), extractAgentStudioReportSummary: () => ({ rating: "buy" }), agentStudioRatingScore: () => 90 };
  const handler = load("lib/bstock-trading-execute-handler.ts", {
    "next/server": next, zod: require("zod"),
    "@/lib/bstock-agentic-wallet-auth": { isSameOrigin: () => true, noStoreHeaders: () => ({}) },
    "@/lib/bstock-agentic-wallet-client": client,
    "@/lib/bstock-agentic-wallet-data": { fetchAgentWalletData: async () => ({ state, address: "wallet", tokens: [] }), walletSnapshotDto: () => walletDto },
    "@/lib/bstock-agentic-wallet-order": { normalizeAgenticWalletOrder: (value) => value },
    "@/lib/bstock-agentic-wallet-quote": { zodIssueSummary: () => [] },
    "@/lib/bstock-alpha-live": live,
    "@/lib/prisma": { prisma: db },
    "@/lib/bstock-trade-records": { tradeIntentAuditHash: () => identity.intentHash },
    "@/lib/bstock-trade-submission-claim": claimModule,
    "@/lib/bstock-auto-strategy": { autoSettingsSchema: { parse: value => value } },
    "@/lib/bstock-auto-execution-guard": guardModule,
    "@/lib/bstock-risk-policy": { BSTOCK_MAX_POSITION_PCT: 50, bstockPositionLimitUsd: () => 50, isBstockPositionWithinLimit: () => true }
  }).handleBstockTradingExecute;
  const request = () => ({ json: async () => ({ intent: "encrypted-reviewed-trade-intent", confirmation: "确认实盘交易", acknowledged: true }) });
  const first = await handler(request());
  assert.equal((await first.json()).code, "ORDER_SUBMISSION_STATUS_UNKNOWN");
  assert.equal(db.state.trade.status, "SUBMISSION_UNKNOWN");
  const second = await handler(request());
  assert.equal(second.status, 409);
  assert.equal((await second.json()).code, "TRADE_INTENT_ALREADY_SUBMITTED");
  assert.equal(broadcasts, 1);
});
