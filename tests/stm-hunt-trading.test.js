const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateAudit, transactionMatchesQuote, registrationDecision, evaluateBuyBudget, trackedDailyPnl, evaluateCexAccountRisk, evaluateCexSignalPermission, signingQuotePermission, refreshedProtectionValid } = require("../lib/stm-hunt/trading-policy.js");

function completeAudit() {
  return { is_open_source: "1", is_honeypot: "0", cannot_buy: "0", cannot_sell_all: "0", is_proxy: "0", is_mintable: "0", hidden_owner: "0", can_take_back_ownership: "0", owner_change_balance: "0", transfer_pausable: "0", is_blacklisted: "0", slippage_modifiable: "0", selfdestruct: "0", buy_tax: "0", sell_tax: "0" };
}
test("missing audits and null or blank tax fields never authorize trading", () => {
  assert.equal(evaluateAudit(null).passed, false);
  assert.equal(evaluateAudit(completeAudit()).passed, true);
  for (const value of [null, undefined, "", "unknown"]) {
    const audit = completeAudit(); audit.sell_tax = value;
    assert.equal(evaluateAudit(audit).passed, false);
  }
  const audit = completeAudit(); delete audit.is_honeypot;
  assert.equal(evaluateAudit(audit).passed, false);
  assert.ok(evaluateAudit(audit).missing.includes("is_honeypot"));
});
test("honeypots, mutable balances and nonzero taxes are rejected", () => {
  for (const key of ["is_honeypot", "hidden_owner", "owner_change_balance", "transfer_pausable", "is_mintable"]) {
    assert.equal(evaluateAudit({ ...completeAudit(), [key]: "1" }).passed, false);
  }
  assert.equal(evaluateAudit({ ...completeAudit(), buy_tax: "0.001" }).passed, false);
});
test("receipt settlement requires exact wallet, router, calldata, value and BSC identity", () => {
  const quote = { walletAddress: "0x123", transaction: { to: "0x456", data: "0xdeadbeef", value: "0" } };
  const transaction = { from: "0x123", to: "0x456", input: "0xdeadbeef", value: 0n, chainId: 56 };
  assert.equal(transactionMatchesQuote(quote, transaction), true);
  for (const mutation of [{ from: "0x999" }, { to: "0x999" }, { input: "0xface" }, { value: 1n }, { chainId: 1 }]) {
    assert.equal(transactionMatchesQuote(quote, { ...transaction, ...mutation }), false);
  }
});
test("retrying a hash is idempotent and cannot reset final orders or replace a hash", () => {
  assert.equal(registrationDecision({ status: "QUOTED", txHash: null }, "0xabc"), "register");
  assert.equal(registrationDecision({ status: "CONFIRMED", txHash: "0xABC" }, "0xabc"), "idempotent");
  assert.equal(registrationDecision({ status: "SUBMITTED", txHash: "0xabc" }, "0xdef"), "conflict");
  assert.equal(registrationDecision({ status: "MISMATCH", txHash: null }, "0xabc"), "conflict");
});
test("buy budgets include pending exposure, daily reservations and stop risk", () => {
  const input = { notionalUsd: 100, equityUsd: 10_000, stopLossPct: 10, liquidityUsd: 100_000, existingExposureUsd: 0, dailyReservedUsd: 0 };
  const policy = { perOrderNotionalLimit: 2000, dailyNotionalLimit: 10_000, riskPerTradePct: 1, maxPortfolioExposurePct: 25 };
  assert.equal(evaluateBuyBudget(input, policy).passed, true);
  assert.equal(evaluateBuyBudget(input, { ...policy, id: "persisted-config", updatedAt: new Date(), killSwitchActive: false }).passed, true);
  for (const mutation of [{ notionalUsd: 2001 }, { dailyReservedUsd: 9950 }, { equityUsd: 50 }, { liquidityUsd: 10_000 }, { existingExposureUsd: 2490 }, { equityUsd: NaN }]) {
    assert.equal(evaluateBuyBudget({ ...input, ...mutation }, policy).passed, false);
  }
});
test("tracked FIFO reports known realized losses and flags unpriced lots", () => {
  const fill = { status: "CONFIRMED", walletAddress: "0xa", tokenAddress: "0xb", side: "buy", createdAt: 1, completedAt: "2026-11-19T01:00:00Z", actualInput: "100", actualOutput: "10" };
  const sell = { ...fill, side: "sell", createdAt: 2, actualInput: "5", actualOutput: "40" };
  const pnl = trackedDailyPnl([fill, sell], "2026-11-19");
  assert.equal(pnl.realizedUsd, -10);
  assert.equal(pnl.unknownCostBasis, false);
  assert.equal(trackedDailyPnl([sell], "2026-11-19").unknownCostBasis, true);
  assert.equal(trackedDailyPnl([fill, { ...sell, actualInput: "15" }], "2026-11-19").unknownCostBasis, true);
});
test("signed CEX daily-loss guard refuses stale, missing or breached account risk", () => {
  const account = { equity: 10_000, dayStartEquity: 10_000, dailyPnl: -50, observedAt: Date.now(), reconciliationHealthy: true, killSwitch: false, unresolvedOrders: false, openPositions: [], pendingEntries: [] };
  const policy = { dailyLossLimitPct: 2, maxOpenPositions: 3, maxPortfolioExposurePct: 50, perOrderNotionalLimit: 1000, riskPerTradePct: 1, maxLeverage: 3 };
  assert.equal(evaluateCexAccountRisk(account, policy).passed, true);
  for (const mutation of [{ dailyPnl: -201 }, { dailyPnl: NaN }, { observedAt: Date.now() - 61_000 }, { reconciliationHealthy: false }, { unresolvedOrders: true }]) {
    assert.equal(evaluateCexAccountRisk({ ...account, ...mutation }, policy).passed, false);
  }
  assert.equal(evaluateCexAccountRisk(account, policy, { symbol: "BTCUSDT", notional: 500, stopRisk: 25, leverage: 2 }).passed, true);
  assert.equal(evaluateCexAccountRisk({ ...account, openPositions: [{ symbol: "BTCUSDT", notional: 100 }] }, policy, { symbol: "BTCUSDT", notional: 500, stopRisk: 25, leverage: 2 }).passed, false);
});
test("expired, submitted and policy-revoked quotes cannot be signed", () => {
  const now = Date.now();
  const quote = { status: "QUOTED", expiresAt: now + 60_000, policyFingerprint: "original-policy" };
  assert.equal(signingQuotePermission(quote, now, "original-policy").passed, true);
  for (const mutation of [{ status: "SUBMITTED" }, { status: "CONFIRMED" }, { expiresAt: now + 5000 }, { expiresAt: NaN }]) {
    assert.equal(signingQuotePermission({ ...quote, ...mutation }, now, "original-policy").passed, false);
  }
  assert.equal(signingQuotePermission(quote, now, "changed-policy").passed, false);
});
function readyDashboard(now) {
  // These match captureStmSources: evidence uses the base ticker, not the
  // execution pair. This regression fixture must preserve that boundary.
  const signal = { candidateId: "cex:BTC", strategy: "S1", status: "ready", actionable: true, direction: "long", expiresAt: new Date(now + 60_000).toISOString(), asOf: new Date(now).toISOString(), missing: [] };
  return { asOf: new Date(now).toISOString(), candidates: [{ id: "cex:BTC", symbol: "BTC", market: "cex" }], signals: [signal, { ...signal, strategy: "S5", status: "watch", actionable: false, direction: "observe" }], strategies: [{ id: "S1", enabled: true }, { id: "S5", enabled: true }], state: { persistent: true }, capabilities: { persistence: true } };
}
test("live strategy permission rejects arbitrary symbols, chain lookalikes, stale signals and S5 bypasses", () => {
  const now = Date.now();
  const request = { symbol: "BTCUSDT", strategy: "S1", side: "LONG" };
  assert.equal(evaluateCexSignalPermission(readyDashboard(now), request, now).passed, true);
  assert.equal(request.symbol, "BTCUSDT", "checking evidence must not mutate the execution pair");
  for (const symbol of ["BTC", "BTCUSDC", "btcusdt", "BTC/USDT", "USDTBTC", "BTCUSDTBTC", "BTCUSDT ", "0xBTCUSDT"]) {
    assert.equal(evaluateCexSignalPermission(readyDashboard(now), { ...request, symbol }, now).passed, false, symbol);
  }
  assert.equal(evaluateCexSignalPermission(readyDashboard(now), { ...request, symbol: "DOGEUSDT" }, now).passed, false);
  assert.equal(evaluateCexSignalPermission(readyDashboard(now), { ...request, side: "SHORT" }, now).passed, false);
  const mutations = [
    dashboard => { dashboard.candidates[0].market = "onchain"; },
    dashboard => { dashboard.candidates[0].id = "bsc:BTC"; },
    dashboard => { dashboard.candidates[0].id = "cex:BTCUSDT"; dashboard.candidates[0].symbol = "BTCUSDT"; },
    dashboard => { dashboard.signals[0].actionable = false; },
    dashboard => { dashboard.signals[0].missing = ["no exact event"]; },
    dashboard => { dashboard.signals[0].expiresAt = new Date(now - 1).toISOString(); },
    dashboard => { dashboard.signals[0].asOf = new Date(now - 61_000).toISOString(); },
    dashboard => { dashboard.asOf = new Date(now - 361_000).toISOString(); },
    dashboard => { dashboard.signals[1].status = "risk"; },
    dashboard => { dashboard.signals[1].status = "blocked"; dashboard.signals[1].missing = ["unknown funding"]; },
    dashboard => { dashboard.signals.pop(); },
    dashboard => { dashboard.strategies[1].enabled = false; },
    dashboard => { dashboard.capabilities.persistence = false; }
  ];
  for (const mutate of mutations) { const dashboard = readyDashboard(now); mutate(dashboard); assert.equal(evaluateCexSignalPermission(dashboard, request, now).passed, false); }
});
test("all Alpha execute routes keep the STM guard within the shared live lock before broadcast", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const service = fs.readFileSync(path.join(__dirname, "../lib/alpha-execution/service.ts"), "utf8");
  const route = fs.readFileSync(path.join(__dirname, "../app/api/alpha-execution/execute/route.ts"), "utf8");
  const guard = fs.readFileSync(path.join(__dirname, "../lib/stm-hunt/cex-risk.ts"), "utf8");
  const shared = service.slice(service.indexOf("export async function executePlan("), service.indexOf("async function executeClaimedPlan("));
  assert.match(shared, /submissionToken: token/);
  assert.match(shared, /executeClaimedPlan\(planId, userId, token\)/);
  assert.match(route, /executePlan\(input.planId, viewer.id\)/);
  const claim = service.indexOf('state: AlphaExecutionState.EXECUTING', service.indexOf("async function executeClaimedPlan("));
  const check = service.indexOf("await assertStmCexDailyRisk(userId", service.indexOf("async function executeClaimedPlan("));
  assert.ok(check > 0 && check < claim, "the immutable STM source must be checked before its plan is claimed or broadcast");
  assert.match(guard, /await assertStmCexSignal\(userId/);
  assert.match(guard, /plan.intent.source.slice\("stm-hunt:".length\)/);
});
test("fresh execution price must remain strictly between stored stop and take-profit", () => {
  const plan = { side: "LONG", referencePrice: 100, stopLoss: 95, takeProfit: 110 };
  assert.equal(refreshedProtectionValid(plan), true);
  for (const referencePrice of [94, 95, 110, 111, NaN, Infinity, 0]) assert.equal(refreshedProtectionValid({ ...plan, referencePrice }), false);
  assert.equal(refreshedProtectionValid({ side: "SHORT", referencePrice: 100, stopLoss: 105, takeProfit: 90 }), true);
  assert.equal(refreshedProtectionValid({ side: "SHORT", referencePrice: 105, stopLoss: 105, takeProfit: 90 }), false);
});
test("a post-quote withdrawal must be checked against fresh wallet equity before signing", () => {
  const policy = { perOrderNotionalLimit: 2000, dailyNotionalLimit: 10_000, riskPerTradePct: 1, maxPortfolioExposurePct: 50 };
  const initial = { notionalUsd: 1000, equityUsd: 10_000, stopLossPct: 10, liquidityUsd: 1_000_000, existingExposureUsd: 0, dailyReservedUsd: 0 };
  assert.equal(evaluateBuyBudget(initial, policy).passed, true);
  assert.equal(evaluateBuyBudget({ ...initial, equityUsd: 1500 }, policy).passed, false);
  const fs = require("node:fs"); const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "../lib/stm-hunt/trading.ts"), "utf8");
  const validation = source.slice(source.indexOf("async function validateBscQuote("), source.indexOf("async function submitBscQuote("));
  assert.ok(validation.indexOf("await recheckBscBuyBudget(") < validation.indexOf("await stmBscClient.call("));
});
test("wallet chain and bound account are rechecked after approval and validation before sending a chain-bound Swap", () => {
  const fs = require("node:fs"); const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "../components/stm-hunt-surface.tsx"), "utf8");
  const send = source.slice(source.indexOf("const submitBsc = async () =>"), source.indexOf('return <div className="stm-execution-layout"'));
  const validated = send.indexOf('action: "validate-quote"');
  const finalChainCheck = send.indexOf('String(finalChain).toLowerCase() !== "0x38"');
  const finalAccountCheck = send.indexOf("finalAccounts.some");
  const broadcast = send.lastIndexOf('method: "eth_sendTransaction"');
  assert.ok(validated < finalChainCheck && finalChainCheck < broadcast);
  assert.ok(validated < finalAccountCheck && finalAccountCheck < broadcast);
  assert.equal((send.match(/chainId: "0x38", from: address/g) || []).length, 2, "both approval and swap are pinned to BSC");
});
