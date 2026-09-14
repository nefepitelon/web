const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { z } = require("zod");
const crypto = require("node:crypto");
const os = require("node:os");
const { Prisma } = require("@prisma/client");

// Execute the real route and schema, with an allowlisted module resolver. No
// production database, network, Wallet SDK or workflow runner can be imported.
const compiled = new Map();
function load(file, imports) {
  if (!compiled.has(file)) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    compiled.set(file, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
  }
  const exports = {};
  vm.runInNewContext(compiled.get(file), { exports, Date, Error, URL, Request, Response, Headers,
    process: { env: { NODE_ENV: "production" } }, console: { info() {}, warn() {}, error() {} },
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Non-mocked import forbidden: ${name}`); }
  }, { filename: file });
  return exports;
}
const strategy = load("lib/bstock-auto-strategy.ts", { zod: { z } });
const auth = load("lib/bstock-agentic-wallet-auth.ts", { "server-only": {}, "node:crypto": crypto, "node:os": os, zod: { z },
  "@/lib/alpha-execution/credentials": { encryptTradingSecret: () => "encrypted-fixture", decryptTradingSecret: () => "{}" }
});
const walletAddress = "0x1111111111111111111111111111111111111111";
const contractAddress = "0x2222222222222222222222222222222222222222";
const ownerKey = `owner-${walletAddress.toLowerCase()}`;
const defaults = { strategy: "adaptive", budgetUsd: 100, orderUsd: 20, maxPositions: 3, stopLossPct: 3, takeProfitPct: 6, maxDrawdownPct: 10, dailyLossPct: 5, intervalSeconds: 60 };
const manualNonPendingStatuses = ["INTENT_CREATED", "FINISHED", "SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED", "FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"];
const copy = (value) => structuredClone(value);
const same = (left, right) => left instanceof Date && right instanceof Date ? left.getTime() === right.getTime() : left === right;
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
  if (key === "OR") return value.some(item => matches(row, item));
  if (key === "AND") return (Array.isArray(value) ? value : [value]).every(item => matches(row, item));
  if (key === "NOT") return !(Array.isArray(value) ? value : [value]).some(item => matches(row, item));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.entries(value).every(([operator, expected]) => {
      if (operator === "in") return expected.includes(row[key]);
      if (operator === "notIn") return !expected.includes(row[key]);
      if (operator === "not") return expected === null ? row[key] != null : !same(row[key], expected);
      if (operator === "equals") return same(row[key], expected);
      if (operator === "gt") return row[key] > expected;
      if (operator === "gte") return row[key] >= expected;
      if (operator === "lt") return row[key] < expected;
      if (operator === "lte") return row[key] <= expected;
      throw new Error(`Unsupported test query operator: ${operator}`);
    });
  }
  return same(row[key], value);
});
const selected = (row, select) => row == null ? null : copy(select
  ? Object.fromEntries(Object.entries(select).filter(([, enabled]) => enabled).map(([key]) => [key, row[key]]))
  : row);

function fixture(options = {}) {
  const state = { walletAddress, stage: "connected", sessionExpireAt: Date.now() + 3_600_000, ...options.session };
  let records = { configs: options.config ? [copy(options.config)] : [], events: copy(options.events || []), orders: copy(options.orders || []), positions: copy(options.positions || []),
    trades: copy((options.trades || []).map(row => ({ automationIgnoredAt: null, automationIgnoredBy: null,
      updatedAt: row.createdAt || new Date(0), ...row }))) };
  const calls = { agentIdentity: 0, browserIdentity: [], rate: 0, wallet: 0, market: 0, start: [], pause: [], scan: 0, reconcile: [], queries: [], writes: [], timeline: [] };
  let transactionTail = Promise.resolve();
  const db = {};
  for (const [model, table] of Object.entries({ bstockAutoConfig: "configs", bstockAutoEvent: "events", bstockAutoOrder: "orders", bstockAutoPosition: "positions", bstockTradeRecord: "trades" })) {
    const rows = (where = {}) => records[table].filter(row => matches(row, where));
    const orderedRows = (where, orderBy) => {
      const found = rows(where);
      if (!orderBy) return found;
      const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
      return [...found].sort((a, b) => {
        for (const order of orders) {
          const [key, direction] = Object.entries(order)[0];
          const comparison = (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === "desc" ? -1 : 1);
          if (comparison) return comparison;
        }
        return 0;
      });
    };
    db[model] = {
      findUnique: async ({ where, select }) => selected(rows(where)[0] || null, select),
      findFirst: async ({ where = {}, orderBy, select } = {}) => selected(orderedRows(where, orderBy)[0] || null, select),
      findMany: async ({ where = {}, orderBy, take, select } = {}) => {
        calls.queries.push({ model, where: copy(where), take, select: copy(select) });
        const found = orderedRows(where, orderBy);
        return (take === undefined ? found : found.slice(0, take)).map(row => selected(row, select));
      },
      count: async ({ where }) => rows(where).length,
      aggregate: async () => ({ _sum: { realizedPnlUsd: 0 } }),
      create: async ({ data }) => { const row = { id: `${table}-${records[table].length + 1}`, createdAt: new Date(), ...copy(data) }; records[table].push(row); return copy(row); },
      update: async ({ where, data }) => { const row = rows(where)[0]; if (!row) throw new Error("Missing test row"); Object.assign(row, copy(data)); return copy(row); },
      updateMany: async ({ where, data }) => {
        if (options.beforeUpdateMany) await options.beforeUpdateMany({ model, where: copy(where), data: copy(data), records, calls });
        calls.writes.push({ model, where: copy(where), data: copy(data) });
        const found = rows(where);
        found.forEach(row => Object.assign(row, copy(data), table === "trades" ? { updatedAt: new Date(Math.max(Date.now(), Number(row.updatedAt || 0) + 1)) } : {}));
        return { count: found.length };
      },
      upsert: async ({ where, create, update }) => { const row = rows(where)[0]; if (row) Object.assign(row, copy(update)); else records[table].push(copy(create)); return copy(row || create); }
    };
  }
  db.$queryRaw = async () => [];
  db.$transaction = async (operation) => {
    const previous = transactionTail;
    let release;
    transactionTail = new Promise(resolve => { release = resolve; });
    await previous;
    const before = copy(records);
    try { return await operation(db); } catch (error) { records = before; throw error; } finally { release(); }
  };
  const data = load("lib/bstock-auto-data.ts", { "server-only": {}, "node:crypto": crypto, "@prisma/client": { Prisma }, "@/lib/prisma": { prisma: db }, "@/lib/bstock-auto-strategy": strategy });
  const originalPause = data.pauseAuto;
  data.pauseAuto = async (...args) => { calls.pause.push(args); return originalPause(...args); };
  const market = { registrySourceAvailable: true, deliveryMode: "LIVE", fetchedAt: new Date().toISOString(), assets: [{ symbol: "NVDAB", contractAddress, multiplier: "1", price: 10 }], ...options.market };
  const walletDto = { paymentBalances: { USDT: { price: 1, valueUsd: 500 }, BNB: { balance: 1 } }, bstockBalances: [], ...options.balances };
  class AgentError extends Error { constructor(message, status = 401) { super(message); this.status = status; } }
  const route = load("app/api/bstock-alpha/automation/route.ts", {
    "node:crypto": crypto,
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    zod: { z },
    "workflow/api": { start: async (_workflow, args) => { calls.start.push(args); if (options.startError) throw new Error("mock durable runner unavailable"); return { runId: "durable-mock-run" }; } },
    "@/lib/prisma": { prisma: db },
    "@/lib/rate-limit": { checkRateLimit: async () => { calls.rate++; return { allowed: !options.rateDenied }; } },
    "@/lib/bstock-agentic-wallet-client": {
      connectedAgentSession: () => { calls.agentIdentity++; if (options.agentDenied) throw new AgentError("Not connected"); return copy(state); },
      agentSessionKey: () => "mock-agent-session-key", agentWalletOwnerKey: address => `owner-${address.toLowerCase()}`,
      persistAgentSession: response => response, AgenticWalletRequestError: AgentError
    },
    "@/lib/bstock-agentic-wallet-auth": { ...auth, encodeAgentSession: () => "opaque-encrypted-test-session" },
    "@/lib/bstock-agentic-wallet-data": {
      fetchAgentWalletData: async () => { calls.wallet++; calls.timeline.push("wallet"); if (options.walletFailure) throw new Error("mock wallet offline"); return { address: options.walletAddress || walletAddress, state: { ...copy(state), walletAddress: options.walletAddress || walletAddress }, tokens: [] }; },
      walletSnapshotDto: () => copy(walletDto)
    },
    "@/lib/bstock-browser-wallet": { requireBoundEvmBrowserWallet: async address => { calls.browserIdentity.push(address); if (options.browserDenied) throw new Error("Unbound address"); return { address, ownerKey: `owner-${address.toLowerCase()}` }; } },
    "@/lib/bstock-alpha-live": { fetchOfficialBstockMarket: async () => { calls.market++; calls.timeline.push("market"); return copy(market); }, compareDecimals: (a, b) => Number(a) - Number(b) },
    "@/lib/bstock-auto-strategy": strategy,
    "@/lib/bstock-auto-data": data,
    "@/lib/bstock-auto-runtime": { scanAutoCandidates: async () => { calls.scan++; return { diagnostics: { candidates: [] } }; } },
    "@/lib/bstock-manual-order-reconciliation": {
      MANUAL_NON_PENDING_STATUSES: manualNonPendingStatuses,
      reconcileBstockManualOrders: async (session, key) => {
        calls.reconcile.push({ state: copy(session), ownerKey: key });
        calls.timeline.push("reconcile");
        const result = options.reconcile ? await options.reconcile({ state: copy(session), ownerKey: key, records, calls, db }) : {};
        return { state: copy(session), reconciled: 0,
          remaining: records.trades.filter(row => row.ownerKey === key && row.automationIgnoredAt == null && !manualNonPendingStatuses.includes(row.status)).length,
          lookupFailed: false, ...result };
      }
    },
    "@/lib/bstock-auto-workflow": { bstockAutoWorkflow: () => { throw new Error("Workflow execution forbidden in API tests"); } }
  });
  function request(method, body, query = "provider=agent", headers = {}) {
    const url = `https://bstock.test/api/bstock-alpha/automation${query ? `?${query}` : ""}`;
    const req = new Request(url, { method, headers: { Origin: "https://bstock.test", Host: "bstock.test", "Content-Type": "application/json", ...headers }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
    req.nextUrl = new URL(url);
    return req;
  }
  return { calls, records: () => records, get: (query, headers) => route.GET(request("GET", null, query, headers)), post: (body, query, headers) => route.POST(request("POST", body, query, headers)) };
}
const startBody = () => ({ action: "start", settings: { ...defaults }, acknowledged: true });
const config = (extra = {}) => ({ ownerKey, walletAddress, settings: defaults, enabled: true, status: "RUNNING", generation: "generation-one", sessionEncrypted: "do-not-export-session", leaseToken: "do-not-export-lease", ...extra });
const manualTrade = (extra = {}) => ({ id: "old-manual-trade", ownerKey, agentKey: "retired-agent-session", symbol: "NVDAB", side: "buy", status: "SUBMITTED", orderId: "manual-upstream-order",
  createdAt: new Date(Date.now() - 14 * 86_400_000), submittedAt: new Date(Date.now() - 14 * 86_400_000), txHash: null, completedAt: null,
  updatedAt: new Date(Date.now() - 14 * 86_400_000), automationIgnoredAt: null, automationIgnoredBy: null,
  requestedAmount: "20.0001", quotedAmount: "0.1234", actualFromAmount: null, actualToAmount: null, ...extra });

test("automation GET requires an explicit provider and never falls back to a stale Agent cookie", async () => {
  const app = fixture({ config: config() });
  for (const query of ["provider=disconnected", ""]) {
    const response = await app.get(query);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.capability, "disconnected");
    assert.equal(body.config, null);
  }
  assert.equal(app.calls.agentIdentity, 0);
  assert.equal(app.calls.browserIdentity.length, 0);
  assert.equal(app.calls.queries.length, 0);
});

test("browser auto start requires bound ownership and never inherits an old Agent session", async () => {
  const app = fixture();
  const response = await app.post(startBody(), `provider=browser&address=${walletAddress}`);
  assert.equal(response.status, 403);
  assert.equal(app.calls.agentIdentity, 0);
  assert.deepEqual(app.calls.browserIdentity, [walletAddress]);
  assert.equal(app.calls.wallet, 0);
  assert.equal(app.calls.start.length, 0);
  const denied = fixture({ browserDenied: true });
  assert.equal((await denied.get(`provider=browser&address=${walletAddress}`)).status, 401);
  assert.equal(denied.calls.agentIdentity, 0);
});

test("all automation mutations reject cross-origin or missing production origin before authentication", async () => {
  for (const action of [startBody(), { action: "stop" }, { action: "scan" }, { action: "reconcile" },
    { action: "ignore-manual", scope: "all", reviewVersion: "a".repeat(64), acknowledged: true }]) {
    for (const Origin of ["https://attacker.test", "", "not-a-url"]) {
      const app = fixture();
      assert.equal((await app.post(action, "provider=agent", { Origin })).status, 403);
      assert.equal(app.calls.agentIdentity, 0);
      assert.equal(app.calls.start.length, 0);
    }
  }
});

test("auto start requires explicit acknowledgement and validates bounded settings before any wallet call", async () => {
  for (const body of [
    { action: "start", settings: defaults }, { action: "start", settings: defaults, acknowledged: false },
    { ...startBody(), settings: { ...defaults, orderUsd: 30 } },
    { ...startBody(), settings: { ...defaults, budgetUsd: 3000 } },
    { ...startBody(), acknowledged: true, bypassRisk: true }
  ]) {
    const app = fixture();
    assert.equal((await app.post(body)).status, 400);
    assert.equal(app.calls.agentIdentity, 0);
    assert.equal(app.calls.start.length, 0);
    assert.equal(app.records().configs.length, 0);
  }
});

test("a pending manual trade or fresh manual intent blocks auto start without enabling or scheduling", async () => {
  for (const trade of [
    { status: "SUBMISSION_UNKNOWN", createdAt: new Date(0) },
    { status: "PENDING", createdAt: new Date(0) },
    { status: "PROCESSING", createdAt: new Date(0) },
    { status: "INTENT_CREATED", createdAt: new Date() }
  ]) {
    const app = fixture({ trades: [{ ownerKey, ...trade }] });
    const response = await app.post(startBody());
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /手动交易|报价/);
    assert.equal(app.records().configs.length, 0);
    assert.equal(app.calls.start.length, 0);
    assert.equal(app.records().events.length, 0);
  }
});

test("auto start persists reviewed settings, schedules one durable run and does not expose session state", async () => {
  const app = fixture({ trades: [{ ownerKey, status: "INTENT_CREATED", createdAt: new Date(Date.now() - 100_000) }] });
  const response = await app.post(startBody());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.config.enabled, true);
  assert.equal(body.config.budgetUsd, 100);
  assert.equal(body.config.runId, "durable-mock-run");
  assert.equal(app.calls.start.length, 1);
  assert.equal(app.calls.start[0][0], ownerKey);
  assert.equal(app.records().events[0].kind, "STARTED");
  assert.equal(app.records().events[0].metadata.acknowledged, true);
  assert.doesNotMatch(JSON.stringify(body), /opaque-encrypted-test-session|sessionEncrypted|leaseToken/);
});

test("repeated and concurrent auto starts cannot schedule duplicate workers", async () => {
  const app = fixture();
  const responses = await Promise.all([app.post(startBody()), app.post(startBody())]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(app.calls.start.length, 1);
  assert.equal(app.records().configs.length, 1);
  assert.equal(app.records().events.filter(event => event.kind === "STARTED").length, 1);
  assert.equal((await app.post(startBody())).status, 409);
  assert.equal(app.calls.start.length, 1);
});

test("failure to confirm durable start disables the persisted generation and records its failure", async () => {
  const app = fixture({ startError: true });
  const response = await app.post(startBody());
  assert.equal(response.status, 503);
  assert.equal(app.calls.start.length, 1);
  assert.equal(app.calls.pause.length, 1);
  assert.equal(app.records().configs[0].enabled, false);
  assert.equal(app.records().configs[0].status, "START_FAILED");
  assert.equal(app.records().events.at(-1).kind, "PAUSED");
  assert.equal(app.calls.pause[0][1], app.records().configs[0].generation);
});

test("stop remains available despite rate limiting or wallet-data outage and does not liquidate", async () => {
  const position = { ownerKey, symbol: "NVDAB", quantity: "2", costUsd: 20, strategy: "trend" };
  const app = fixture({ config: config(), rateDenied: true, walletFailure: true, positions: [position], orders: [{ ownerKey, id: "pending-order", status: "PENDING" }] });
  const response = await app.post({ action: "stop" });
  assert.equal(response.status, 200);
  assert.equal(app.records().configs[0].enabled, false);
  assert.equal(app.records().configs[0].status, "STOPPED");
  assert.equal(app.calls.rate, 0);
  assert.equal(app.calls.wallet, 0);
  assert.equal(app.calls.market, 0);
  assert.equal(app.calls.start.length, 0);
  assert.deepEqual(app.records().positions, [position]);
  assert.equal(app.records().orders[0].status, "PENDING");
});

test("expired authorization, stale market, missing gas and excess budget all block start", async () => {
  for (const options of [
    { session: { sessionExpireAt: Date.now() + 100_000 } },
    { market: { fetchedAt: new Date(Date.now() - 180_000).toISOString() } },
    { balances: { paymentBalances: { USDT: { price: 1, valueUsd: 500 }, BNB: { balance: 0 } } } },
    { balances: { paymentBalances: { USDT: { price: 1, valueUsd: 50 }, BNB: { balance: 1 } } } }
  ]) {
    const app = fixture(options);
    assert.ok([401, 409].includes((await app.post(startBody())).status));
    assert.equal(app.calls.start.length, 0);
    assert.equal(app.records().configs.length, 0);
  }
});

test("read-only scan records a decision without scheduling a worker or placing an order", async () => {
  const app = fixture();
  assert.equal((await app.post({ action: "scan" })).status, 200);
  assert.equal(app.calls.scan, 1);
  assert.equal(app.calls.start.length, 0);
  assert.equal(app.records().configs.length, 0);
  assert.equal(app.records().orders.length, 0);
  assert.equal(app.records().events[0].kind, "SCAN");
});

test("event exports paginate without leaking another owner's records or encrypted session", async () => {
  const events = Array.from({ length: 1002 }, (_, i) => ({ id: `event-${String(i).padStart(5, "0")}`, ownerKey, createdAt: new Date(), kind: "WAIT" }));
  events.push({ id: "event-10000", ownerKey: "other-owner", createdAt: new Date(), kind: "PRIVATE" });
  const app = fixture({ config: config(), events });
  const first = await (await app.get("provider=agent&export=1")).json();
  const second = await (await app.get(`provider=agent&export=1&cursor=${first.nextCursor}`)).json();
  assert.equal(first.events.length, 1000);
  assert.equal(second.events.length, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.events, ...second.events].map(event => event.id)).size, 1002);
  assert.ok([...first.events, ...second.events].every(event => event.ownerKey === ownerKey));
  assert.equal(first.orderHistoryLimit, 1000);
  assert.equal(first.auditContainsOrderEvidence, true);
  assert.doesNotMatch(JSON.stringify(first), /do-not-export-session|sessionEncrypted|leaseToken/);
});

test("start reconciles old manual terminal orders before refreshing balances and scheduling once", async () => {
  for (const finalStatus of manualNonPendingStatuses.filter(status => status !== "INTENT_CREATED")) {
    const app = fixture({ trades: [manualTrade()], reconcile: async ({ ownerKey: requestedOwner, records }) => {
      assert.equal(requestedOwner, ownerKey);
      assert.equal(records.configs.length, 0);
      records.trades[0].status = finalStatus;
      records.trades[0].completedAt = new Date();
      return { reconciled: 1, remaining: 0 };
    } });
    const response = await app.post(startBody());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.config.enabled, true);
    assert.equal(body.manualBlockerCount, 0);
    assert.deepEqual(body.manualBlockers, []);
    assert.equal(app.calls.reconcile.length, 1);
    assert.equal(app.calls.start.length, 1);
    assert.equal(app.calls.reconcile[0].ownerKey, ownerKey);
    assert.ok(app.calls.timeline.indexOf("reconcile") < app.calls.timeline.lastIndexOf("wallet"));
    assert.ok(app.calls.timeline.indexOf("reconcile") < app.calls.timeline.indexOf("market"));
    assert.equal(app.records().trades.length, 1);
    assert.equal(app.records().trades[0].status, finalStatus);
  }
});

test("unknown or lookup-failed manual orders retain the safety block and return actionable details", async () => {
  for (const status of ["SUBMITTED", "SUBMISSION_UNKNOWN", "PENDING", "SUBMITTING", "PROCESSING", "QUEUED", "NEW", "UNKNOWN_PROVIDER_STATE"]) {
    const app = fixture({ trades: [manualTrade({ status })], reconcile: async () => ({ reconciled: 0, remaining: 1, lookupFailed: true }) });
    const response = await app.post(startBody());
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.code, "MANUAL_ORDER_PENDING");
    assert.equal(body.manualBlockerCount, 1);
    assert.equal(body.manualBlockers[0].id, "old-manual-trade");
    assert.equal(body.manualBlockers[0].status, status);
    assert.equal(body.manualBlockers[0].orderId, "manual-upstream-order");
    assert.equal(body.manualBlockers[0].quoteValidUntil, null);
    assert.equal(app.calls.reconcile.length, 1);
    assert.equal(app.calls.start.length, 0);
    assert.equal(app.records().configs.length, 0);
    assert.equal(app.records().trades[0].status, status);
    assert.doesNotMatch(JSON.stringify(body), /retired-agent-session|ownerKey|agentKey|sessionEncrypted/);
  }
});

test("the final locked check catches a manual submission arriving during reconciliation", async () => {
  const app = fixture({ reconcile: async ({ records }) => {
    records.trades.push(manualTrade({ id: "concurrent-manual-claim", status: "SUBMITTING", orderId: null, createdAt: new Date() }));
    // A prior upstream snapshot can report no pending orders. It must not waive
    // the fresh database check after another request has claimed a submission.
    return { reconciled: 0, remaining: 0 };
  } });
  const response = await app.post(startBody());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "MANUAL_ORDER_PENDING");
  assert.equal(body.manualBlockers[0].id, "concurrent-manual-claim");
  assert.equal(app.calls.start.length, 0);
  assert.equal(app.records().configs.length, 0);
});

test("an active manual quote has an explicit expiry and a distinct conflict code", async () => {
  const createdAt = new Date();
  const app = fixture({ trades: [manualTrade({ id: "fresh-quote", status: "INTENT_CREATED", orderId: null, submittedAt: null, createdAt })] });
  const response = await app.post(startBody());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "MANUAL_QUOTE_ACTIVE");
  assert.equal(body.manualBlockerCount, 1);
  assert.equal(body.manualBlockers[0].id, "fresh-quote");
  assert.equal(Date.parse(body.manualBlockers[0].quoteValidUntil), createdAt.getTime() + 90_000);
  assert.equal(app.calls.start.length, 0);
});

test("pending manual orders outside the first ten diagnostic rows still determine the conflict code", async () => {
  const freshQuotes = Array.from({ length: 11 }, (_, i) => manualTrade({
    id: `new-quote-${i}`, status: "INTENT_CREATED", orderId: null, submittedAt: null,
    createdAt: new Date(Date.now() - (i + 1) * 1000)
  }));
  const app = fixture({ trades: [...freshQuotes, manualTrade({ id: "older-unconfirmed-order" })] });
  const response = await app.post(startBody());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.manualBlockerCount, 12);
  assert.equal(body.manualBlockers.length, 10);
  assert.ok(body.manualBlockers.every(row => row.status === "INTENT_CREATED"));
  assert.equal(body.code, "MANUAL_ORDER_PENDING");
  assert.equal(app.calls.start.length, 0);
  assert.equal(app.records().configs.length, 0);
  assert.equal(app.records().trades.find(row => row.id === "older-unconfirmed-order").status, "SUBMITTED");
});

test("explicit reconciliation verifies the wallet but never enables a config or starts a worker", async () => {
  const initial = config({ enabled: false, status: "STOPPED" });
  const app = fixture({ config: initial, trades: [manualTrade()], reconcile: async ({ records }) => {
    records.trades[0].status = "FINISHED";
    records.trades[0].completedAt = new Date();
    return { reconciled: 1, remaining: 0 };
  } });
  const response = await app.post({ action: "reconcile" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.manualBlockerCount, 0);
  assert.equal(app.calls.wallet, 1);
  assert.equal(app.calls.reconcile.length, 1);
  assert.ok(app.calls.timeline.indexOf("wallet") < app.calls.timeline.indexOf("reconcile"));
  assert.equal(app.calls.market, 0);
  assert.equal(app.calls.start.length, 0);
  assert.equal(app.calls.scan, 0);
  assert.equal(app.records().orders.length, 0);
  assert.deepEqual(app.records().configs, [initial]);
  assert.ok(app.records().events.every(event => event.kind !== "STARTED"));
});

test("explicit reconciliation with no config and unresolved orders only refreshes blocker diagnostics", async () => {
  const app = fixture({ trades: [manualTrade()] });
  const response = await app.post({ action: "reconcile" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.config, null);
  assert.equal(body.manualBlockerCount, 1);
  assert.equal(app.records().configs.length, 0);
  assert.equal(app.records().orders.length, 0);
  assert.equal(app.calls.start.length, 0);
  assert.equal(app.calls.reconcile.length, 1);
});

test("browser reconciliation cannot inherit Agent credentials or reconcile another wallet", async () => {
  const app = fixture({ trades: [manualTrade()] });
  const response = await app.post({ action: "reconcile" }, `provider=browser&address=${walletAddress}`);
  assert.equal(response.status, 403);
  assert.equal(app.calls.agentIdentity, 0);
  assert.equal(app.calls.wallet, 0);
  assert.equal(app.calls.reconcile.length, 0);
  assert.equal(app.calls.start.length, 0);
  const mismatch = fixture({ walletAddress: "0x9999999999999999999999999999999999999999" });
  assert.equal((await mismatch.post({ action: "reconcile" })).status, 401);
  assert.equal(mismatch.calls.reconcile.length, 0);
  assert.equal(mismatch.calls.start.length, 0);
});

test("manual blocker snapshots are owner-scoped, bounded and contain only public diagnostic fields", async () => {
  const ownTrades = Array.from({ length: 12 }, (_, i) => manualTrade({ id: `own-blocker-${i}`, createdAt: new Date(Date.now() - (i + 1) * 100_000) }));
  const foreign = manualTrade({ id: "foreign-private-order", ownerKey: "foreign-private-owner", agentKey: "foreign-private-agent", orderId: "foreign-upstream-secret", fromToken: "foreign-token-secret" });
  const expired = manualTrade({ id: "expired-quote", status: "INTENT_CREATED", orderId: null, createdAt: new Date(Date.now() - 100_000) });
  const final = manualTrade({ id: "already-finished", status: "FINISHED" });
  const app = fixture({ trades: [...ownTrades, foreign, expired, final] });
  for (const query of ["provider=agent", `provider=browser&address=${walletAddress}`]) {
    const response = await app.get(query);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.manualBlockerCount, 12);
    assert.equal(body.manualBlockers.length, 10);
    assert.ok(body.manualBlockers.every(row => row.id.startsWith("own-blocker-")));
    for (const row of body.manualBlockers) {
      assert.deepEqual(Object.keys(row).sort(), ["canIgnore", "createdAt", "id", "orderId", "quoteValidUntil", "reviewVersion", "side", "status", "symbol"].sort());
    }
    assert.doesNotMatch(JSON.stringify(body), /foreign-private|foreign-upstream|foreign-token|retired-agent-session|expired-quote|already-finished/);
  }
  assert.equal(app.calls.reconcile.length, 0);
  assert.equal(app.calls.start.length, 0);
});

test("automatic linked pending trades are excluded from manual blocker diagnostics", async () => {
  const app = fixture({
    trades: [manualTrade({ id: "robot-pending-trade", status: "PENDING" }), manualTrade({ id: "manual-pending-trade" })],
    orders: [{ id: "robot-order", ownerKey, tradeRecordId: "robot-pending-trade", status: "PENDING", createdAt: new Date() }]
  });
  const response = await app.get("provider=agent");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.manualBlockerCount, 1);
  assert.equal(body.manualPendingCount, 1);
  assert.deepEqual(body.manualBlockers.map(row => row.id), ["manual-pending-trade"]);
  assert.equal(body.orders[0].id, "robot-order");
  assert.equal(body.orders[0].status, "PENDING");
  assert.equal(app.calls.reconcile.length, 0);
  assert.equal(app.calls.start.length, 0);
  assert.equal(app.records().trades.find(row => row.id === "robot-pending-trade").status, "PENDING");
});

test("another wallet's unresolved manual orders never block this wallet or leak in its response", async () => {
  const app = fixture({ trades: [manualTrade({ ownerKey: "another-wallet-owner", id: "another-wallet-order", agentKey: "another-agent-secret" })] });
  const response = await app.post(startBody());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.manualBlockerCount, 0);
  assert.deepEqual(body.manualBlockers, []);
  assert.doesNotMatch(JSON.stringify(body), /another-wallet|another-agent/);
  assert.equal(app.calls.reconcile.length, 1);
  assert.equal(app.calls.reconcile[0].ownerKey, ownerKey);
  assert.equal(app.calls.start.length, 1);
  assert.equal(app.records().trades[0].status, "SUBMITTED");
});

const ignoreBody = (review, row) => row
  ? { action: "ignore-manual", scope: "one", recordId: row.id, reviewVersion: row.reviewVersion, acknowledged: true }
  : { action: "ignore-manual", scope: "all", reviewVersion: review.manualReviewVersion, acknowledged: true };
const readReview = async app => {
  const response = await app.get("provider=agent");
  assert.equal(response.status, 200);
  const review = await response.json();
  assert.match(review.manualReviewVersion, /^[a-f0-9]{64}$/);
  for (const row of review.manualBlockers) assert.match(row.reviewVersion, /^[a-f0-9]{64}$/);
  return review;
};
const unchangedTrade = row => {
  const { automationIgnoredAt, automationIgnoredBy, updatedAt, ...ledger } = row;
  return ledger;
};
const ignoreEvents = app => app.records().events.filter(event => event.kind === "MANUAL_ORDERS_IGNORED");

test("manual review versions are stable for the same snapshot and included in a 409 response", async () => {
  const app = fixture({ trades: [manualTrade(), manualTrade({ id: "second-review-row", orderId: "second-order", status: "PROCESSING" })] });
  const first = await readReview(app);
  const second = await readReview(app);
  assert.equal(first.manualReviewVersion, second.manualReviewVersion);
  assert.deepEqual(first.manualBlockers.map(row => row.reviewVersion), second.manualBlockers.map(row => row.reviewVersion));
  const blocked = await app.post(startBody());
  assert.equal(blocked.status, 409);
  const body = await blocked.json();
  assert.equal(body.manualReviewVersion, first.manualReviewVersion);
  assert.deepEqual(body.manualBlockers.map(row => row.reviewVersion), first.manualBlockers.map(row => row.reviewVersion));
  assert.equal(app.calls.start.length, 0);
});

test("ignore all changes only explicit ignore metadata, audits every row and never starts or edits a bot", async () => {
  const originalConfig = config({ enabled: false, status: "STOPPED" });
  const own = Array.from({ length: 12 }, (_, i) => manualTrade({ id: `reviewed-${i}`, orderId: `order-${i}`, createdAt: new Date(Date.now() - (i + 1) * 100_000) }));
  const foreign = manualTrade({ id: "foreign-ignore-order", ownerKey: "foreign-owner", orderId: "foreign-private-upstream" });
  const terminal = manualTrade({ id: "terminal-order", status: "FINISHED", actualFromAmount: "20", actualToAmount: "0.12" });
  const app = fixture({ config: originalConfig, trades: [...own, foreign, terminal] });
  const before = copy(app.records().trades);
  const review = await readReview(app);
  assert.equal(review.manualBlockerCount, 12);
  const response = await app.post(ignoreBody(review));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ignored.count, 12);
  assert.equal(body.manualBlockerCount, 0);
  assert.deepEqual(body.manualBlockers, []);
  assert.deepEqual(app.records().configs, [originalConfig]);
  assert.equal(app.calls.start.length, 0);
  assert.equal(app.calls.reconcile.length, 0);
  assert.equal(app.calls.scan, 0);
  assert.equal(app.records().orders.length, 0);
  for (const row of app.records().trades) {
    assert.deepEqual(unchangedTrade(row), unchangedTrade(before.find(prior => prior.id === row.id)));
    if (row.id.startsWith("reviewed-")) {
      assert.ok(row.automationIgnoredAt instanceof Date);
      assert.equal(typeof row.automationIgnoredBy, "string");
      assert.ok(row.automationIgnoredBy.length > 0);
    } else assert.equal(row.automationIgnoredAt, null);
  }
  assert.equal(ignoreEvents(app).length, 1);
  const metadata = ignoreEvents(app)[0].metadata;
  assert.ok(Array.isArray(metadata.records));
  assert.deepEqual(metadata.records.map(row => row.id).sort(), own.map(row => row.id).sort());
  assert.ok(metadata.records.every(row => row.status === "SUBMITTED"));
  for (const row of own) {
    assert.ok(JSON.stringify(metadata).includes(row.id), `audit missing reviewed row ${row.id}`);
  }
  assert.ok(JSON.stringify(metadata).includes("SUBMITTED"));
  assert.doesNotMatch(JSON.stringify(metadata), /foreign-ignore-order|foreign-private-upstream|retired-agent-session|sessionEncrypted/);
});

test("ignore one clears only the reviewed row and leaves other and newly-arrived blockers unchanged", async () => {
  const app = fixture({ trades: [manualTrade(), manualTrade({ id: "remaining-order", orderId: "remaining-upstream" })] });
  const review = await readReview(app);
  const row = review.manualBlockers.find(item => item.id === "old-manual-trade");
  app.records().trades.push(manualTrade({ id: "new-unreviewed-order", orderId: "new-upstream" }));
  const response = await app.post(ignoreBody(review, row));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ignored.count, 1);
  assert.equal(body.manualBlockerCount, 2);
  assert.deepEqual(body.manualBlockers.map(item => item.id).sort(), ["new-unreviewed-order", "remaining-order"]);
  assert.ok(app.records().trades.find(item => item.id === row.id).automationIgnoredAt instanceof Date);
  assert.equal(app.records().trades.find(item => item.id === "remaining-order").automationIgnoredAt, null);
  assert.equal(app.records().trades.find(item => item.id === "new-unreviewed-order").automationIgnoredAt, null);
  assert.equal(ignoreEvents(app).length, 1);
  assert.equal(app.calls.start.length, 0);
});

test("explicitly ignored manual blockers no longer prevent a later separately-authorized start", async () => {
  const app = fixture({ trades: [manualTrade({ status: "SUBMISSION_UNKNOWN" })], reconcile: async () => ({ lookupFailed: true }) });
  const review = await readReview(app);
  assert.equal((await app.post(ignoreBody(review))).status, 200);
  assert.equal(app.calls.start.length, 0);
  const response = await app.post(startBody());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.config.enabled, true);
  assert.equal(body.manualBlockerCount, 0);
  assert.equal(app.calls.start.length, 1);
  assert.equal(app.records().trades[0].status, "SUBMISSION_UNKNOWN", "ignoring must not manufacture a terminal trade");
  assert.equal(app.records().trades[0].actualToAmount, null);
  assert.equal(ignoreEvents(app).length, 1);
});

test("ignore requires a valid review and explicit acknowledgement before authenticating or writing", async () => {
  const valid = { action: "ignore-manual", scope: "all", reviewVersion: "a".repeat(64), acknowledged: true };
  for (const body of [
    { action: "ignore-manual", scope: "all", reviewVersion: valid.reviewVersion },
    { ...valid, acknowledged: false }, { ...valid, reviewVersion: "" },
    { ...valid, scope: "one" }, { ...valid, scope: "all", recordId: "unreviewed-extra-id" },
    { ...valid, force: true }, { ...valid, scope: "unknown" }
  ]) {
    const app = fixture({ trades: [manualTrade()] });
    assert.equal((await app.post(body)).status, 400);
    assert.equal(app.calls.agentIdentity, 0);
    assert.equal(app.calls.writes.length, 0);
    assert.equal(app.records().trades[0].automationIgnoredAt, null);
    assert.equal(ignoreEvents(app).length, 0);
  }
});

test("browser or disconnected sessions cannot inherit Agent credentials for ignoring orders", async () => {
  for (const query of [`provider=browser&address=${walletAddress}`, "provider=disconnected"]) {
    const app = fixture({ trades: [manualTrade()] });
    const body = { action: "ignore-manual", scope: "all", reviewVersion: "a".repeat(64), acknowledged: true };
    const response = await app.post(body, query);
    assert.ok([401, 403].includes(response.status));
    if (query.startsWith("provider=browser")) assert.equal(response.status, 403);
    assert.equal(app.calls.agentIdentity, 0);
    assert.equal(app.calls.writes.length, 0);
    assert.equal(app.records().trades[0].automationIgnoredAt, null);
    assert.equal(ignoreEvents(app).length, 0);
  }
});

test("one-row ignore cannot target another owner or an automatic linked record", async () => {
  const app = fixture({ trades: [manualTrade(), manualTrade({ id: "foreign-target", ownerKey: "other-owner", orderId: "private-other-order" }), manualTrade({ id: "linked-auto-target" })],
    orders: [{ id: "auto-order", ownerKey, tradeRecordId: "linked-auto-target", status: "PENDING", createdAt: new Date() }] });
  const review = await readReview(app);
  const row = review.manualBlockers[0];
  for (const recordId of ["foreign-target", "linked-auto-target", "missing-target"]) {
    const response = await app.post({ ...ignoreBody(review, row), recordId });
    assert.ok([404, 409].includes(response.status));
    assert.doesNotMatch(JSON.stringify(await response.json()), /private-other-order|other-owner/);
  }
  assert.ok(app.records().trades.every(trade => trade.automationIgnoredAt === null));
  assert.equal(ignoreEvents(app).length, 0);
  assert.equal(app.calls.start.length, 0);
});

test("ignore all excludes automatic linked records even when manual orders are explicitly ignored", async () => {
  const app = fixture({ trades: [manualTrade(), manualTrade({ id: "linked-auto-target" })],
    orders: [{ id: "auto-order", ownerKey, tradeRecordId: "linked-auto-target", status: "PENDING", createdAt: new Date() }] });
  const review = await readReview(app);
  assert.equal((await app.post(ignoreBody(review))).status, 200);
  assert.equal(app.records().trades.find(row => row.id === "linked-auto-target").automationIgnoredAt, null);
  assert.equal(app.records().orders[0].status, "PENDING");
  assert.equal(app.records().trades.find(row => row.id === "old-manual-trade").status, "SUBMITTED");
  assert.equal((await app.post(startBody())).status, 409);
  assert.equal(app.calls.start.length, 0);
});

test("stale batch review cannot absorb a newly-arrived manual order", async () => {
  const app = fixture({ trades: [manualTrade()] });
  const review = await readReview(app);
  app.records().trades.push(manualTrade({ id: "arrived-after-review", orderId: "new-order" }));
  const response = await app.post(ignoreBody(review));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "MANUAL_REVIEW_CHANGED");
  assert.ok(app.records().trades.every(row => row.automationIgnoredAt === null));
  assert.equal(ignoreEvents(app).length, 0);
});

test("batch review covers all blocker rows, including an altered eleventh row outside diagnostics", async () => {
  const app = fixture({ trades: Array.from({ length: 11 }, (_, i) => manualTrade({ id: `batch-row-${i}`, orderId: `order-${i}`, createdAt: new Date(Date.now() - (i + 1) * 100_000) })) });
  const review = await readReview(app);
  const shown = new Set(review.manualBlockers.map(row => row.id));
  const hidden = app.records().trades.find(row => !shown.has(row.id));
  assert.ok(hidden);
  hidden.status = "PROCESSING";
  hidden.updatedAt = new Date();
  const response = await app.post(ignoreBody(review));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "MANUAL_REVIEW_CHANGED");
  assert.ok(app.records().trades.every(row => row.automationIgnoredAt === null));
  assert.equal(ignoreEvents(app).length, 0);
});

test("row review rejects changed state, changed identity or changed amount without changing the ledger", async () => {
  for (const mutation of [row => { row.status = "PROCESSING"; }, row => { row.orderId = "changed-order-id"; }, row => { row.requestedAmount = "100"; }]) {
    const app = fixture({ trades: [manualTrade()] });
    const review = await readReview(app);
    mutation(app.records().trades[0]);
    app.records().trades[0].updatedAt = new Date();
    const response = await app.post(ignoreBody(review, review.manualBlockers[0]));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "MANUAL_REVIEW_CHANGED");
    assert.equal(app.records().trades[0].automationIgnoredAt, null);
    assert.equal(ignoreEvents(app).length, 0);
  }
});

test("repeated or concurrent ignore requests cannot duplicate ignored rows or audit events", async () => {
  const app = fixture({ trades: [manualTrade()] });
  const review = await readReview(app);
  const body = ignoreBody(review);
  const responses = await Promise.all([app.post(body), app.post(body)]);
  assert.ok(responses.some(response => response.status === 200));
  assert.ok(responses.every(response => [200, 409].includes(response.status)));
  const results = await Promise.all(responses.map(response => response.json()));
  assert.equal(results.filter(result => result.ignored?.count === 1).length, 1);
  const ignoredAt = app.records().trades[0].automationIgnoredAt.getTime();
  const again = await app.post(body);
  assert.ok([200, 409].includes(again.status));
  assert.equal(ignoreEvents(app).length, 1);
  assert.equal(app.records().trades[0].automationIgnoredAt.getTime(), ignoredAt);
  assert.equal(app.calls.start.length, 0);
});

test("ignored metadata never conceals a later unreviewed record from the next auto start", async () => {
  const app = fixture({ trades: [manualTrade()] });
  const review = await readReview(app);
  assert.equal((await app.post(ignoreBody(review))).status, 200);
  app.records().trades.push(manualTrade({ id: "new-blocker", orderId: "new-manual-order" }));
  const response = await app.post(startBody());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.manualBlockerCount, 1);
  assert.equal(body.manualBlockers[0].id, "new-blocker");
  assert.equal(app.calls.start.length, 0);
  assert.equal(app.records().trades.find(row => row.id === "new-blocker").automationIgnoredAt, null);
});

test("ignore all never ignores an active quote and single-quote ignore is rejected", async () => {
  const quote = manualTrade({ id: "active-quote", status: "INTENT_CREATED", orderId: null, createdAt: new Date(), submittedAt: null });
  const app = fixture({ trades: [manualTrade(), quote] });
  const review = await readReview(app);
  assert.equal(review.manualBlockerCount, 2);
  assert.equal(review.manualIgnoreCount, 1);
  const quoteRow = review.manualBlockers.find(row => row.id === quote.id);
  assert.equal(quoteRow.canIgnore, false);
  assert.equal((await app.post(ignoreBody(review, quoteRow))).status, 409);
  assert.equal(ignoreEvents(app).length, 0);
  const response = await app.post(ignoreBody(review));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ignored.count, 1);
  assert.equal(body.manualBlockerCount, 1);
  assert.equal(body.manualIgnoreCount, 0);
  assert.equal(body.manualBlockers[0].id, quote.id);
  assert.equal(app.records().trades.find(row => row.id === quote.id).automationIgnoredAt, null);
  const start = await app.post(startBody());
  assert.equal(start.status, 409);
  assert.equal((await start.json()).code, "MANUAL_QUOTE_ACTIVE");
  assert.equal(app.calls.start.length, 0);
});

test("a quote arriving after batch review invalidates ignore all without being swallowed", async () => {
  const app = fixture({ trades: [manualTrade()] });
  const review = await readReview(app);
  app.records().trades.push(manualTrade({ id: "new-quote", status: "INTENT_CREATED", orderId: null, createdAt: new Date(), submittedAt: null }));
  const response = await app.post(ignoreBody(review));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "MANUAL_REVIEW_CHANGED");
  assert.ok(app.records().trades.every(row => row.automationIgnoredAt === null));
  assert.equal(ignoreEvents(app).length, 0);
});

test("more than 1000 blockers disables batch ignore but permits a reviewed single row", async () => {
  const app = fixture({ trades: Array.from({ length: 1001 }, (_, i) => manualTrade({ id: `large-${i}`, orderId: `large-order-${i}`, createdAt: new Date(Date.now() - (i + 1) * 100_000) })) });
  const review = await readReview(app);
  assert.equal(review.manualIgnoreCount, 1001);
  assert.equal(review.manualIgnoreAllAvailable, false);
  assert.equal((await app.post(ignoreBody(review))).status, 409);
  assert.equal(ignoreEvents(app).length, 0);
  const row = review.manualBlockers[0];
  assert.equal(row.canIgnore, true);
  const response = await app.post(ignoreBody(review, row));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored.count, 1);
  assert.equal(app.records().trades.filter(trade => trade.automationIgnoredAt != null).length, 1);
  assert.equal(ignoreEvents(app).length, 1);
  assert.equal(app.calls.start.length, 0);
});

test("a status change at the final ignore CAS prevents flags and audit from committing", async () => {
  const app = fixture({ trades: [manualTrade()], beforeUpdateMany: ({ model, data, records }) => {
    if (model !== "bstockTradeRecord" || !data.automationIgnoredAt) return;
    records.trades[0].status = "PROCESSING";
    records.trades[0].updatedAt = new Date(Date.now() + 1000);
  } });
  const review = await readReview(app);
  const response = await app.post(ignoreBody(review, review.manualBlockers[0]));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "MANUAL_REVIEW_CHANGED");
  assert.equal(app.records().trades[0].automationIgnoredAt, null);
  assert.equal(app.records().trades[0].automationIgnoredBy, null);
  assert.equal(ignoreEvents(app).length, 0);
  assert.equal(app.calls.start.length, 0);
});
