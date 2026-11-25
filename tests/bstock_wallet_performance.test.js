const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(source, { exports, Date, Error, console,
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Unmocked import: ${name}`); }
  });
  return exports;
}
const normalization = load("lib/bstock-agentic-wallet-order-status.ts");
const { buildBstockTradingLedger } = load("lib/bstock-trade-ledger.ts", {
  "@/lib/bstock-agentic-wallet-order-status": normalization
});
class WalletError extends Error { constructor(code, terminal = false) { super(code); this.code = code; this.terminal = terminal; } }
function historyFixture(pages) {
  const calls = [];
  const { fetchAgentWalletOrderHistory } = load("lib/bstock-agentic-wallet-history.ts", {
    "server-only": {}, "@/lib/bstock-agentic-wallet-order-status": normalization,
    "@/lib/bstock-agentic-wallet-client": { AgenticWalletRequestError: WalletError,
      agentWalletRequest: async (state, endpoint, options) => {
        calls.push({ state, endpoint, ...options });
        const data = pages[calls.length - 1];
        if (data instanceof Error) throw data;
        return { data, state: { ...state, agentSessionId: `rotated-${calls.length}` } };
      }
    }
  });
  return { calls, run: options => fetchAgentWalletOrderHistory({ agentSessionId: "initial" }, options) };
}
const orders = (offset, count) => Array.from({ length: count }, (_, index) => ({ orderId: `order-${offset + index}`, status: "FINISHED" }));

test("wallet history reads past the first 100 orders and preserves rotated authentication", async () => {
  const app = historyFixture([{ list: orders(0, 100), total: 150 }, { list: orders(100, 50), total: 150 }]);
  const history = await app.run();
  assert.equal(history.rows.length, 150);
  assert.equal(history.complete, true);
  assert.equal(history.total, 150);
  assert.equal(app.calls[1].body.page, 2);
  assert.equal(app.calls[1].state.agentSessionId, "rotated-1");
  assert.equal(history.state.agentSessionId, "rotated-2");
});
test("a bare 100-order array is only a page, not a complete history", async () => {
  const app = historyFixture([orders(0, 100), orders(100, 1)]);
  const history = await app.run();
  assert.equal(history.rows.length, 101);
  assert.equal(history.total, 101);
  assert.equal(history.complete, true);
  assert.equal(app.calls.length, 2);
});
test("unknown shapes, repeated pages and failed later reads never report a reconciled empty account", async () => {
  const unknown = await historyFixture([{ unexpected: { total: 0 } }]).run();
  assert.equal(unknown.available, false);
  assert.equal(unknown.complete, false);
  assert.equal(unknown.code, "ORDER_HISTORY_RESPONSE_UNRECOGNIZED");
  const repeated = await historyFixture([{ list: orders(0, 100), total: 200 }, { list: orders(0, 100), total: 200 }]).run();
  assert.equal(repeated.rows.length, 100);
  assert.equal(repeated.complete, false);
  assert.equal(repeated.code, "ORDER_HISTORY_PAGE_REPEATED");
  const failed = await historyFixture([{ list: orders(0, 100), total: 200 }, new WalletError("HTTP_503")]).run();
  assert.equal(failed.available, true);
  assert.equal(failed.complete, false);
  assert.equal(failed.rows.length, 100);
  assert.equal(failed.code, "HTTP_503");
});
test("bounded history respects limits, malformed records and terminal session errors", async () => {
  const limited = historyFixture([{ list: orders(0, 100), total: 200 }]);
  assert.equal((await limited.run({ maxPages: 1 })).complete, false);
  assert.equal(limited.calls.length, 1);
  const expired = historyFixture([]);
  assert.equal((await expired.run({ deadline: Date.now() - 1 })).code, "ORDER_HISTORY_BUDGET_EXHAUSTED");
  assert.equal(expired.calls.length, 0);
  assert.equal((await historyFixture([{ list: [{}], total: 1 }]).run()).code, "ORDER_HISTORY_RECORD_INVALID");
  assert.equal((await historyFixture([{ list: orders(0, 1), total: 0 }]).run()).complete, false);
  await assert.rejects(historyFixture([new WalletError("SESSION_EXPIRED", true)]).run(), /SESSION_EXPIRED/);
});

const asset = { symbol: "NVDAB", ticker: "NVDA", contractAddress: `0x${"1".repeat(40)}`, multiplier: "100", price: 220 };
const stable = "0x55d398326f99059fF775485246999027B3197955";
const buy = { orderId: "buy", status: "FINISHED", fromToken: stable, toToken: asset.contractAddress, fromSymbol: "USDT", toSymbol: "NVDAB", fromAmount: "4", toAmount: "0.0002", createdAt: "2026-11-01T00:00:00Z" };
const sell = { orderId: "sell", status: "FINISHED", fromToken: asset.contractAddress, toToken: stable, fromSymbol: "NVDAB", toSymbol: "USDT", fromAmount: "0.00005", toAmount: "1.25", createdAt: "2026-11-02T00:00:00Z" };
const position = { symbol: "NVDAB", address: asset.contractAddress, balance: 0.015, balanceExact: "0.015", price: 220, valueUsd: 3.3 };
const ledger = extra => buildBstockTradingLedger({ assets: [asset], orders: [], totalOrders: 0, walletPositions: [], ...extra });
test("verified empty history retains real zero while win rate and profit factor remain undefined", () => {
  const result = ledger({});
  assert.equal(result.summary.realizedPnlUsd, 0);
  assert.equal(result.summary.unrealizedPnlUsd, 0);
  assert.equal(result.summary.realizedState, "NO_CLOSED_TRADES");
  assert.equal(result.summary.unrealizedState, "NO_POSITIONS");
  assert.equal(result.summary.winRatePct, null);
  assert.equal(result.summary.profitFactor, null);
});
test("partial history and transfer-only holdings never invent average cost or realized profit", () => {
  const partial = ledger({ orders: [sell], totalOrders: null, walletPositions: [position], historyComplete: false });
  assert.equal(partial.historyComplete, false);
  assert.equal(partial.summary.realizedPnlUsd, null);
  assert.equal(partial.summary.realizedState, "PARTIAL_HISTORY");
  assert.equal(partial.summary.unrealizedPnlUsd, null);
  const transferred = ledger({ walletPositions: [position] });
  assert.equal(transferred.summary.realizedPnlUsd, 0);
  assert.equal(transferred.positions[0].averageCostUsd, null);
  assert.equal(transferred.summary.unrealizedState, "COST_UNKNOWN");
  assert.equal(transferred.summary.unrealizedPnlUsd, null);
  const unavailable = ledger({ historyAvailable: false });
  assert.equal(unavailable.summary.realizedPnlUsd, null);
  assert.equal(unavailable.summary.unrealizedPnlUsd, 0); // A verified empty current wallet has no open PnL.
});
test("a complete verified buy/sell history yields finite FIFO performance", () => {
  const result = ledger({ orders: [buy, sell], totalOrders: 2, walletPositions: [position] });
  assert.equal(result.summary.realizedState, "READY");
  assert.equal(result.summary.unrealizedState, "READY");
  assert.ok(Math.abs(result.summary.realizedPnlUsd - 0.25) < 1e-10);
  assert.ok(Math.abs(result.summary.unrealizedPnlUsd - 0.3) < 1e-10);
  assert.equal(result.summary.winRatePct, 100);
  assert.equal(result.summary.profitFactorInfinite, true);
});
test("an unparseable successful sale cannot become a zero-trade zero-PnL account even when the wallet is empty", () => {
  for (const invalid of [{ createdAt: undefined }, { createdAt: "invalid-date" }, { fromAmount: undefined }, { fromAmount: "invalid-amount" }, { fromAmount: "0" }]) {
    const result = ledger({ orders: [{ ...sell, ...invalid }], totalOrders: 1, walletPositions: [] });
    assert.equal(result.historyComplete, true);
    assert.equal(result.summary.realizedState, "COST_UNKNOWN");
    assert.equal(result.summary.realizedPnlUsd, null);
    assert.equal(result.summary.realizedTradeCount, null);
    assert.equal(result.summary.winRatePct, null);
    assert.equal(result.summary.profitFactor, null);
    assert.equal(result.summary.unrealizedPnlUsd, 0); // Empty live holdings do not supply the missing sale cost.
    assert.equal(result.summary.profitFactorInfinite, false);
  }
});

function performanceUi() {
  const script = fs.readFileSync(path.join(__dirname, "../bstock-alpha.js"), "utf8");
  const elements = new Map();
  const byId = id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); };
  const body = script.slice(script.indexOf("  function renderPerformanceMetrics("), script.indexOf("  function renderReportHistory("));
  const setter = script.slice(script.indexOf("  function setPerformanceMetric("), script.indexOf("  function renderRealizedSparkline("));
  const context = { byId, money: value => `$${value.toFixed(2)}`, renderRealizedSparkline() {} };
  vm.createContext(context);
  vm.runInContext(`${setter}\n${body}`, context);
  return { render: context.renderPerformanceMetrics, text: id => byId(id).textContent };
}
test("performance UI distinguishes empty history, missing cost and upstream failure without losing numeric zero", () => {
  const ui = performanceUi();
  ui.render(ledger({}), { bstockBalances: [] });
  assert.equal(ui.text("realized-pnl"), "$0.00");
  assert.equal(ui.text("unrealized-pnl"), "$0.00");
  assert.equal(ui.text("win-rate"), "暂无已平仓");
  assert.equal(ui.text("profit-factor"), "暂无已平仓");
  ui.render(ledger({ walletPositions: [position] }), { bstockBalances: [position] });
  assert.equal(ui.text("unrealized-pnl"), "成本待核验");
  ui.render(ledger({ historyAvailable: false, historyError: "HTTP_503" }), { bstockBalances: [] });
  assert.equal(ui.text("realized-pnl"), "同步失败");
  ui.render(ledger({ historyAvailable: false, historyError: "BROWSER_FULL_HISTORY_UNAVAILABLE" }), { bstockBalances: [] });
  assert.equal(ui.text("realized-pnl"), "历史未接入");
  ui.render({ historyAvailable: false, historyComplete: false, historyError: "WALLET_SNAPSHOT_FAILED", summary: {} }, null);
  assert.equal(ui.text("realized-pnl"), "同步失败");
  assert.equal(ui.text("open-position-count"), "持仓同步失败");
});

test("wallet read failure clears private balances, PnL and reviewed quotes instead of retaining LIVE values", () => {
  const script = fs.readFileSync(path.join(__dirname, "../bstock-alpha.js"), "utf8");
  const body = script.slice(script.indexOf("  function clearLiveWalletData("), script.indexOf("  async function refreshMarketSnapshot("));
  const renders = [];
  const element = {};
  const context = { byId: () => element,
    resetTradeQuote: () => renders.push("quote-reset"),
    renderWalletPositions: (wallet, value) => renders.push({ wallet, value }),
    renderOrderRecords() {}, renderRealizedLedger() {}, renderPerformanceMetrics() {} };
  vm.createContext(context);
  vm.runInContext(`let liveSnapshot = { wallet: { totalWalletValueUsd: 123 }, tradingLedger: { summary: { realizedPnlUsd: 99 } }, cmc: { score: 50 } };\n${body}\nclearLiveWalletData('HTTP_503'); globalThis.result = liveSnapshot;`, context);
  assert.equal(context.result.wallet, null);
  assert.equal(context.result.tradingLedger.summary.realizedPnlUsd, undefined);
  assert.equal(context.result.tradingLedger.historyError, "HTTP_503");
  assert.equal(context.result.cmc.score, 50);
  assert.equal(renders[0], "quote-reset");
  assert.equal(renders[1].wallet, null);
  assert.match(element.innerHTML, /BALANCE UNAVAILABLE/);
});

test("a fresh wallet with no usable ledger cannot inherit the previous wallet's PnL", () => {
  const script = fs.readFileSync(path.join(__dirname, "../bstock-alpha.js"), "utf8");
  const resolver = script.slice(script.indexOf("  function resolveWalletSnapshotLedger("), script.indexOf("  function clearLiveWalletData("));
  const merge = script.slice(script.indexOf("  function applyLiveSnapshot("), script.indexOf("    const cmc = liveSnapshot.cmc;"));
  const previous = { wallet: { address: "same-wallet", totalWalletValueUsd: 123 },
    tradingLedger: { historyAvailable: true, historyComplete: true, summary: { realizedPnlUsd: 99, unrealizedPnlUsd: 42 } }, cmc: { score: 50 } };
  const nextWallet = { address: "same-wallet", totalWalletValueUsd: 321, bstockBalances: [position] };
  const run = payload => {
    const context = { prior: structuredClone(previous), payload,
      clearLiveWalletData() { throw new Error("A valid fresh wallet must not be cleared"); } };
    vm.createContext(context);
    vm.runInContext(`let liveSnapshot = prior;\n${resolver}\n${merge}\nreturn liveSnapshot; }\nglobalThis.result = applyLiveSnapshot(payload);`, context);
    return context.result;
  };
  const unavailable = run({ wallet: nextWallet, sources: { orders: { status: "UNAVAILABLE", code: "MARKET_UNAVAILABLE" } } });
  assert.equal(unavailable.wallet.totalWalletValueUsd, 321);
  assert.equal(unavailable.tradingLedger.historyAvailable, false);
  assert.equal(unavailable.tradingLedger.historyComplete, false);
  assert.equal(unavailable.tradingLedger.historyError, "MARKET_UNAVAILABLE");
  assert.equal(unavailable.tradingLedger.summary.realizedPnlUsd, null);
  assert.equal(unavailable.tradingLedger.summary.unrealizedPnlUsd, null);
  assert.equal(unavailable.cmc.score, 50);
  const missing = run({ wallet: nextWallet });
  assert.equal(missing.tradingLedger.historyError, "ORDER_LEDGER_MISSING");
  assert.equal(missing.tradingLedger.summary.realizedPnlUsd, null);
  const freshLedger = { historyAvailable: true, historyComplete: true, summary: { realizedPnlUsd: 7, unrealizedPnlUsd: 8 } };
  const valid = run({ wallet: nextWallet, tradingLedger: freshLedger, sources: { orders: { status: "LIVE" } } });
  assert.equal(valid.tradingLedger.summary.realizedPnlUsd, 7);
  const contradictory = run({ wallet: nextWallet, tradingLedger: freshLedger, sources: { orders: { status: "UNAVAILABLE" } } });
  assert.equal(contradictory.tradingLedger.summary.realizedPnlUsd, null);
  // A public-only refresh does not invalidate the separately obtained private snapshot.
  const publicOnly = run({ cmc: { score: 30 } });
  assert.equal(publicOnly.wallet.totalWalletValueUsd, 123);
  assert.equal(publicOnly.tradingLedger.summary.realizedPnlUsd, 99);
});
