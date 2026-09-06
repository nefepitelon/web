const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { z } = require("zod");
const { encodePaymentRequiredHeader } = require("@x402/core/http");

function load(file, imports = {}, globals = {}) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, {
    exports, require: (name) => name in imports ? imports[name] : require(name),
    console: { info() {}, warn() {}, error() {} }, Date, Error, Promise, AbortController, DOMException,
    setTimeout, clearTimeout, ...globals
  }, { filename: file });
  return exports;
}
const merchant = {
  url: "https://stock-agent.bnbchain.org/x402/analyze/async", accept: "application/json",
  body: { symbols: ["DELL"], analysis_type: "comprehensive" },
  headers: { "X-BStock-Symbol": "DELLB", "PAYMENT-SIGNATURE": "must-not-forward", "Authorization": "must-not-forward" }
};
const requirement = {
  scheme: "exact", network: "eip155:56", amount: "100000000000000000",
  asset: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
  payTo: "0x1111111111111111111111111111111111111111", maxTimeoutSeconds: 300,
  extra: { assetTransferMethod: "permit2" }
};
const challengeHeader = encodePaymentRequiredHeader({ x402Version: 2, resource: { url: merchant.url }, accepts: [requirement] });
function challenge(status = 402, header = challengeHeader) {
  return new Response(null, { status, headers: header ? { "payment-required": header } : {} });
}
function previewHelper(fetch) {
  return load("lib/bstock-research-preview.ts", {}, { fetch });
}

for (const firstFailure of ["timeout", 502, 503, 504]) test(`unsigned merchant preview recovers once from ${firstFailure}, never sends payment headers`, async () => {
  const calls = [];
  const helper = previewHelper(async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) {
      if (firstFailure === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      return challenge(firstFailure, null);
    }
    return challenge();
  });
  const header = await helper.fetchUnpaidResearchChallenge(merchant, new helper.ResearchPreviewTrace({ walletMode: "agent", requestId: "test" }));
  assert.equal(header, challengeHeader);
  assert.equal(calls.length, 2);
  for (const { init } of calls) {
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers["PAYMENT-SIGNATURE"], undefined);
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.body, JSON.stringify(merchant.body));
  }
});

for (const status of [200, 400, 401, 402, 403, 500]) test(`non-retryable HTTP ${status} does not loop or sign`, async () => {
  let calls = 0;
  const helper = previewHelper(async () => { calls++; return challenge(status, null); });
  await assert.rejects(helper.fetchUnpaidResearchChallenge(merchant, new helper.ResearchPreviewTrace({ walletMode: "browser", requestId: "test" })));
  assert.equal(calls, 1);
});

test("repeated timeout is bounded and returns a safe, stage-specific error", async () => {
  let calls = 0;
  const helper = previewHelper(async () => { calls++; throw new DOMException("timeout", "TimeoutError"); });
  await assert.rejects(helper.fetchUnpaidResearchChallenge(merchant, new helper.ResearchPreviewTrace({ walletMode: "agent", requestId: "test" })), { code: "RESEARCH_PREVIEW_TIMEOUT", stage: "merchant_challenge" });
  assert.equal(calls, 2);
});

test("shared deadline aborts a hanging fetch and stops additional attempts", async () => {
  let signal, calls = 0;
  const helper = previewHelper(async (_, init) => { calls++; signal = init.signal; return new Promise(() => {}); });
  await assert.rejects(helper.fetchUnpaidResearchChallenge(merchant, new helper.ResearchPreviewTrace({ walletMode: "agent", requestId: "test" }, 10)), { code: "RESEARCH_PREVIEW_TIMEOUT" });
  assert.equal(signal.aborted, true);
  assert.equal(calls, 1);
});

test("preview retry helper refuses a payment execution or arbitrary URL", async () => {
  let calls = 0;
  const helper = previewHelper(async () => { calls++; return challenge(); });
  await assert.rejects(helper.fetchUnpaidResearchChallenge({ ...merchant, url: "https://example.com/pay" }, new helper.ResearchPreviewTrace({ walletMode: "agent", requestId: "test" })));
  assert.equal(calls, 0);
});

function routeFixture(mode, options = {}) {
  const calls = [], walletCalls = [];
  const helper = previewHelper(async (url, init) => {
    calls.push({ url, init });
    if (options.timeoutAlways || calls.length === 1) throw new DOMException("timeout", "TimeoutError");
    return challenge();
  });
  class AgenticWalletRequestError extends Error {}
  const state = { walletAddress: "0x" + "22".repeat(20) };
  const imports = {
    "next/server": { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    "@/lib/bstock-agentic-wallet-auth": { isSameOrigin: () => true, noStoreHeaders: () => ({ "Cache-Control": "no-store" }) },
    "@/lib/bstock-research-preview": helper,
    "@/lib/bstock-alpha-live": {
      BSTOCK_SYMBOL_PATTERN: /^[A-Z]+B$/, fetchOfficialBstockMarket: async () => ({ assets: [{ symbol: "DELLB", ticker: "DELL", contractAddress: requirement.asset, campaignEligibility: "CONFIRMED" }] }),
      encodeResearchIntent: () => "agent-intent", extractAgentStudioReportSummary: () => ({}), buildAgentStudioReadableReport: () => ({})
    },
    "@/lib/bstock-agentic-wallet-client": {
      AgenticWalletRequestError, connectedAgentSession: () => state, agentSessionKey: () => "agent-key", persistAgentSession: (response) => response,
      agentWalletRequest: async (_, endpoint) => {
        walletCalls.push(endpoint);
        if (options.walletTimeout) throw new DOMException("timeout", "TimeoutError");
        return { state, data: { paymentId: "preview-id", options: [{ index: 1, status: "READY_TO_SIGN", binanceChainId: "56", originalAccept: requirement }] } };
      }
    },
    "@/lib/bstock-agentic-wallet-x402": { agentX402RequirementSchema: z.object({ network: z.string() }).passthrough() },
    "@/lib/bstock-x402": { sameX402Requirement: (left, right) => JSON.stringify(left) === JSON.stringify(right) },
    "@/lib/bstock-agent-studio": {
      STUDIO_REPORT_REUSE_MS: 1800000, resolveResearchOwner: async () => ({ state }),
      findRecentOwnedStudioJob: async () => options.recent || null, reclaimLegacyStudioJob: async () => null,
      isStudioReportComplete: (r) => Boolean(r.reportMarkdown), isStudioJobPending: () => true, isStudioJobTerminalFailure: () => false
    },
    "@/lib/bstock-agent-studio-status": {},
    "@/lib/bstock-browser-wallet": { browserWalletAddressSchema: z.string(), requireBoundEvmBrowserWallet: async () => ({ address: state.walletAddress, ownerKey: "browser-owner" }), encodeBrowserResearchIntent: () => "browser-intent" },
    "@/lib/prisma": { prisma: { bstockResearchJob: { findFirst: async () => options.recent || null } } },
    "@/lib/bstock-evm": { evmNetworkLabel: () => "BNB", isEvmCaip2Network: () => true, parseEvmCaip2Network: () => 56, getEvmPublicClient: () => null }
  };
  const file = mode === "agent" ? "app/api/bstock-alpha/research/preview/route.ts" : "app/api/bstock-alpha/browser-wallet/research/preview/route.ts";
  return { route: load(file, imports), calls, walletCalls };
}
for (const mode of ["agent", "browser"]) {
  test(`${mode} actual preview route returns selectable options after the first merchant timeout`, async () => {
    const { route, calls, walletCalls } = routeFixture(mode);
    const response = await route.POST({ json: async () => ({ provider: "studio", symbol: "DELLB", address: "0x" + "22".repeat(20) }) });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.intent, `${mode}-intent`);
    assert.equal(payload.options[0].selectable, true);
    assert.equal(calls.length, 2);
    assert.equal(walletCalls.length, mode === "agent" ? 1 : 0);
    assert.ok(walletCalls.every((url) => url.endsWith("/preview")));
    assert.equal(route.maxDuration, 120);
  });
  test(`${mode} actual preview route exposes a retryable timeout, never raw AbortError`, async () => {
    const { route, calls } = routeFixture(mode, { timeoutAlways: true });
    const response = await route.POST({ json: async () => ({ provider: "studio", symbol: "DELLB", address: "address" }) });
    const payload = await response.json();
    assert.equal(response.status, 504);
    assert.equal(payload.code, "RESEARCH_PREVIEW_TIMEOUT");
    assert.equal(payload.retryable, true);
    assert.match(payload.error, /尚未签名、未付款/);
    assert.equal(calls.length, 2);
  });
  test(`${mode} reuses paid pending jobs without a merchant challenge or new payment`, async () => {
    const { route, calls } = routeFixture(mode, { recent: { jobId: "existing-job", status: "running", symbol: "DELL" } });
    const response = await route.POST({ json: async () => ({ provider: "studio", symbol: "DELLB", address: "address" }) });
    assert.equal(response.status, 202);
    assert.equal((await response.json()).status, "RECOVERING");
    assert.equal(calls.length, 0);
  });
}
test("Agent wallet preview timeout is identified independently of merchant cold start", async () => {
  const { route, walletCalls } = routeFixture("agent", { walletTimeout: true });
  const response = await route.POST({ json: async () => ({ provider: "studio", symbol: "DELLB" }) });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).stage, "agent_wallet_preview");
  assert.equal(walletCalls.length, 1);
});
