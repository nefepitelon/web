const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../bstock-alpha.js"), "utf8");
const ast = ts.createSourceFile("bstock-alpha.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
function load(names, context) {
  vm.createContext(context);
  vm.runInContext(names.map((name) => functions.get(name)).join("\n"), context);
  return context;
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function researchContext(mode = "agent") {
  const nodes = new Map();
  const requests = [];
  let signCount = 0;
  const ctx = load(["assertWalletContext", "executePaidResearch"], {
    walletContextVersion: 2, walletActionInFlight: false, walletOperational: () => true,
    researchPreview: { intent: "reviewed-intent", selectedIndex: 1, contextVersion: 2, walletMode: mode, walletAddress: "0x1111", paymentRequired: {} },
    byId(id) {
      if (!nodes.has(id)) nodes.set(id, { checked: true, disabled: false, hidden: true, textContent: "" });
      return nodes.get(id);
    },
    setResearchStatus() {}, showToast() {}, handleStudioExistingTask: () => true,
    signBrowserX402: async () => { signCount++; return { paymentProtocolVersion: "test", paymentHeaderName: "PAYMENT-SIGNATURE", paymentHeaderValue: "signed" }; },
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ provider: "studio", status: "REUSED" }) }; }
  });
  return { ctx, requests, signCount: () => signCount };
}

test("late Agent session restore cannot replace a browser-wallet connection", async () => {
  const pending = deferred();
  let connected = 0;
  const ctx = load(["restoreAgentSession"], {
    walletLoginVersion: 0, walletConnectionMode: "", fetch: () => pending.promise,
    renderConnectedAgentSession: () => { connected++; }
  });
  const restore = ctx.restoreAgentSession();
  ctx.walletLoginVersion++;
  ctx.walletConnectionMode = "browser";
  pending.resolve({ ok: true, json: async () => ({ status: "CONNECTED" }) });
  await restore;
  assert.equal(connected, 0);
  const active = load(["restoreAgentSession"], {
    walletLoginVersion: 0, walletConnectionMode: "", fetch: async () => ({ ok: true, json: async () => ({ status: "CONNECTED" }) }),
    renderConnectedAgentSession: () => { connected++; }
  });
  await active.restoreAgentSession();
  assert.equal(connected, 1);
});

for (const mode of ["agent", "browser"]) test(`${mode} research uses only its own signing and execution route, once`, async () => {
  const { ctx, requests, signCount } = researchContext(mode);
  await ctx.executePaidResearch();
  await ctx.executePaidResearch();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, mode === "browser" ? "/api/bstock-alpha/browser-wallet/research/execute" : "/api/bstock-alpha/research/execute");
  assert.equal(signCount(), mode === "browser" ? 1 : 0);
  assert.equal(requests[0].body.intent, "reviewed-intent");
  assert.equal(requests[0].body.address, mode === "browser" ? "0x1111" : undefined);
  assert.equal(ctx.walletActionInFlight, false);
});

test("wallet switch invalidates old research before signing or replay", async () => {
  const { ctx, requests, signCount } = researchContext("browser");
  ctx.walletContextVersion++;
  await ctx.executePaidResearch();
  assert.equal(requests.length, 0);
  assert.equal(signCount(), 0);
});

test("account changes while signing prevent merchant replay of the old preview", async () => {
  const { ctx, requests } = researchContext("browser");
  const pending = deferred();
  ctx.signBrowserX402 = () => pending.promise;
  const executing = ctx.executePaidResearch();
  ctx.walletContextVersion++;
  ctx.researchPreview = null;
  pending.resolve({ paymentHeaderName: "PAYMENT-SIGNATURE", paymentHeaderValue: "signed" });
  await executing;
  assert.equal(requests.length, 0);
  assert.equal(ctx.walletActionInFlight, false);
});

test("late wallet balance response cannot populate a different wallet context", async () => {
  const pending = deferred();
  let applied = 0;
  const ctx = load(["refreshLiveSnapshot"], {
    walletContextVersion: 0, walletOperational: () => true, liveSnapshotRequest: undefined,
    browserWalletReady: () => false, AbortController, DOMException,
    byId: () => ({ querySelector: () => ({ textContent: "" }) }),
    fetch: () => pending.promise, applyLiveSnapshot: () => { applied++; }, writePublicDataCache() {},
    showToast() {}, liveSnapshot: { wallet: {} }
  });
  const refreshing = ctx.refreshLiveSnapshot();
  ctx.walletContextVersion++;
  pending.resolve({ ok: true, json: async () => ({ wallet: { address: "old-wallet" } }) });
  assert.equal(await refreshing, false);
  assert.equal(applied, 0);
});

test("pending orders and reports do not poll across wallet modes", async () => {
  let polls = 0;
  const ctx = load(["pollOrderStatus", "restoreStudioJob"], {
    walletContextVersion: 1, walletConnectionMode: "browser", walletAddress: "0x2222", walletOperational: () => true,
    bstockStorage: { readStudioJob: () => ({ jobId: "x402_" + "a".repeat(32), walletMode: "agent", createdAt: Date.now() }) },
    pollStudioJob: () => { polls++; }
  });
  await ctx.pollOrderStatus("old-agent-order", 0, Date.now(), { walletMode: "agent" });
  ctx.restoreStudioJob();
  assert.equal(polls, 0);
});

for (const mode of ["agent", "browser"]) test(`${mode} orders use their reviewed wallet route and receipt context`, async () => {
  const requests = [], polled = [], persisted = [];
  let broadcasts = 0;
  const nodes = new Map();
  const ctx = load(["assertWalletContext", "confirmIntent"], {
    walletContextVersion: 3, walletActionInFlight: false, walletOperational: () => true,
    tradeQuote: { contextVersion: 3, walletMode: mode, walletAddress: "0x1111" }, tradeQuoteIntent: "trade-intent",
    byId(id) {
      if (!nodes.has(id)) nodes.set(id, { checked: true, querySelector: () => ({ textContent: "" }) });
      return nodes.get(id);
    },
    browserWalletReady: () => mode === "browser",
    submitBrowserWalletTransaction: async () => { broadcasts++; ctx.tradeQuote = null; ctx.tradeQuoteIntent = ""; return { txHash: "broadcast", approvalTxHash: null }; },
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ orderId: "order1", symbol: "NVDAB", side: "buy" }) }; },
    bstockStorage: { persistPendingOrder: (order) => { persisted.push(order); return { durable: true }; } },
    pollOrderStatus: (...args) => polled.push(args), showToast() {}, refreshLiveSnapshot() {}, resetTradeQuote() {}
  });
  await ctx.confirmIntent();
  await ctx.confirmIntent();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, mode === "browser" ? "/api/bstock-alpha/browser-wallet/trading/submit" : "/api/bstock-alpha/trading/execute");
  assert.equal(requests[0].body.intent, "trade-intent");
  assert.equal(requests[0].body.address, mode === "browser" ? "0x1111" : undefined);
  assert.equal(broadcasts, mode === "browser" ? 1 : 0);
  assert.equal(persisted[0].walletMode, mode);
  assert.equal(polled[0][3].walletMode, mode);
  assert.equal(ctx.walletActionInFlight, false);
});

test("browser swap keeps its reviewed quote through automatic chain switching", async () => {
  const transactions = [];
  const ethereum = { request: async ({ method, params }) => {
    if (method === "eth_call") return "0x0";
    transactions.push(params[0]);
    return "0x" + String(transactions.length).repeat(64);
  } };
  const ctx = load(["assertWalletContext", "hexWord", "addressWord", "submitBrowserWalletTransaction"], {
    walletContextVersion: 4, walletOperational: () => true, walletAddress: "0x" + "11".repeat(20),
    ensureBrowserWalletContext: async () => { ctx.tradeQuote = null; return ethereum; },
    waitForBrowserReceipt: async () => ({ status: "0x1" })
  });
  const quote = { approval: { spender: "0x" + "22".repeat(20), token: "0x" + "33".repeat(20), amount: "10" }, transaction: { to: "0x" + "44".repeat(20), data: "0xabcd", value: "0" } };
  const result = await ctx.submitBrowserWalletTransaction(quote, 4);
  assert.equal(transactions.length, 2);
  assert.equal(transactions[0].to, quote.approval.token);
  assert.equal(transactions[1].to, quote.transaction.to);
  assert.equal(transactions[1].data, quote.transaction.data);
  assert.ok(result.approvalTxHash);
  transactions.length = 0;
  ctx.waitForBrowserReceipt = async () => { ctx.walletContextVersion++; };
  await assert.rejects(ctx.submitBrowserWalletTransaction(quote, 4), /钱包连接方式或账户已改变/);
  assert.equal(transactions.length, 1, "account change after approval must stop the swap");
});

function previewContext(mode = "agent") {
  const nodes = new Map(), requests = [], messages = [];
  const ctx = load(["openPaidResearch", "retryPaidResearchPreview"], {
    selected: { symbol: "DELLB", ticker: "DELL" }, tickerByBstock: {},
    walletContextVersion: 4, walletActionInFlight: false, walletOperational: () => true,
    walletAddress: "0x1111", browserWalletReady: () => mode === "browser",
    researchRequestVersion: 0, researchPreviewRequest: undefined, researchPreviewRetry: null, researchPreview: null,
    AbortController, DOMException, Error, setTimeout, clearTimeout,
    byId(id) {
      if (!nodes.has(id)) nodes.set(id, { checked: true, disabled: false, hidden: true, textContent: "", showModal() {}, replaceChildren() {} });
      return nodes.get(id);
    },
    setResearchStatus: (_, message) => messages.push(message), showToast() {},
    handleStudioExistingTask: () => false, renderPaymentOptions() {}, updateResearchApproval() {},
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      if (requests.length === 1) return { ok: false, json: async () => ({ error: "尚未签名、未付款", retryable: true }) };
      return { ok: true, json: async () => ({ intent: "fresh", purpose: "DELL", options: [{ selectable: true }] }) };
    }
  });
  return { ctx, nodes, requests, messages };
}

for (const mode of ["agent", "browser"]) test(`${mode} retry button only repeats the unsigned preview for the original asset`, async () => {
  const { ctx, nodes, requests } = previewContext(mode);
  await ctx.openPaidResearch("studio");
  assert.equal(nodes.get("retry-research-preview").hidden, false);
  assert.equal(nodes.get("confirm-paid-research").hidden, true);
  assert.equal(ctx.researchPreview, null);
  ctx.selected = { symbol: "NVDAB", ticker: "NVDA" };
  await ctx.retryPaidResearchPreview();
  assert.equal(requests.length, 2);
  assert.ok(requests.every((r) => r.url.endsWith("/research/preview") && r.body.symbol === "DELLB"));
  assert.equal(requests[0].body.address, mode === "browser" ? "0x1111" : undefined);
  assert.equal(ctx.researchPreview.intent, "fresh");
  assert.equal(ctx.researchPreview.walletMode, mode);
  assert.equal(nodes.get("retry-research-preview").hidden, true);
  assert.equal(nodes.get("research-approval-check").checked, false);
  assert.equal(nodes.get("confirm-paid-research").disabled, true);
});

test("duplicate preview clicks are coalesced and a wallet change discards the pending result", async () => {
  const { ctx } = previewContext();
  const pending = deferred();
  let calls = 0;
  ctx.fetch = async () => { calls++; return pending.promise; };
  const first = ctx.openPaidResearch("studio");
  await ctx.openPaidResearch("studio");
  assert.equal(calls, 1);
  ctx.walletContextVersion++;
  pending.resolve({ ok: true, json: async () => ({ intent: "old-wallet" }) });
  await first;
  assert.equal(ctx.researchPreview, null);
  assert.equal(ctx.researchPreviewRetry, null);
  assert.equal(ctx.researchPreviewRequest, undefined);
});

test("failed preview cannot be retried after changing wallets", async () => {
  const { ctx, requests } = previewContext("browser");
  await ctx.openPaidResearch("studio");
  ctx.walletContextVersion++;
  await ctx.retryPaidResearchPreview();
  assert.equal(requests.length, 1);
});
