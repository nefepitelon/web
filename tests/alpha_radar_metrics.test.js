const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "alpha-scanner.js"), "utf8");
const metricSource = client.slice(client.indexOf("function renderLiveSummaryMetrics()"), client.indexOf("function setScanButtonLoading"));
function metricsContext(overrides = {}) {
  const nodes = new Map();
  const context = {
    document: { querySelector: (selector) => {
      if (!nodes.has(selector)) nodes.set(selector, {});
      return nodes.get(selector);
    } },
    alphaExecutionAuthorized: false,
    alphaExecutionSnapshot: null,
    alphaExecutionConfig: { activeMode: "paper", defaultMarket: "futures" },
    livePnlSnapshot: null,
    livePnlMarket: "futures",
    liveAuditExporting: false,
    portfolioRealizedPnl: null,
    portfolioRealizedCount: null,
    paperRiskState: { positions: [], startingEquity: 10_000, sessionStartedAt: "2026-09-09T00:00:00Z" },
    currentPaperEquity: () => 10_000,
    executionModeLabel: () => "PAPER",
    executionMarketLabel: () => "FUTURES",
    formatSignedMoney: (value) => `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(2)}`,
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(metricSource, context);
  context.renderLiveSummaryMetrics();
  return { context, nodes };
}

test("initial and unavailable ledgers show no fabricated performance or risk count", () => {
  const { nodes } = metricsContext();
  assert.equal(nodes.get("#risk-rejected-count").textContent, "—");
  assert.equal(nodes.get("#live-realized-metric").textContent, "—");
  assert.match(nodes.get("#live-realized-detail").textContent, /请登录/);
});

test("risk metric uses the full server aggregate scoped to the selected environment and market", () => {
  const { nodes } = metricsContext({
    alphaExecutionAuthorized: true,
    alphaExecutionSnapshot: { riskMetrics: { rejectedIntents: [
      { environment: "paper", market: "futures", count: 84 },
      { environment: "paper", market: "spot", count: 10 },
      { environment: "live", market: "futures", count: 9 },
    ] } },
  });
  assert.equal(nodes.get("#risk-rejected-count").textContent, "84");
  assert.match(nodes.get("#risk-rejected-detail").textContent, /24 小时拒绝意图/);
});

test("an authenticated account with no rejected intents correctly displays zero", () => {
  const { nodes } = metricsContext({
    alphaExecutionAuthorized: true,
    alphaExecutionSnapshot: { riskMetrics: { rejectedIntents: [] } },
  });
  assert.equal(nodes.get("#risk-rejected-count").textContent, "0");
});

test("live actual PnL never substitutes profitable local Paper history", () => {
  const { nodes } = metricsContext({
    paperRiskState: {
      startingEquity: 10_000,
      sessionStartedAt: "2026-09-09T00:00:00Z",
      positions: [
        { status: "CLOSED", realizedPnl: 120 },
        { status: "CLOSED", realizedPnl: -80 },
        { status: "MONITORING", realizedPnl: 200 },
      ],
    },
    currentPaperEquity: () => 10_150,
  });
  assert.equal(nodes.get("#live-realized-metric").textContent, "—");
  assert.doesNotMatch(nodes.get("#live-realized-detail").textContent, /胜率|50\.0/);
});

test("complete LIVE exchange settlement displays net amount even when Paper mode is selected", () => {
  const { nodes } = metricsContext({
    alphaExecutionAuthorized: true,
    livePnlSnapshot: { status: "ready", asset: "USDT", amount: -42.5, coverageComplete: true, recordCount: 24 },
  });
  assert.equal(nodes.get("#live-realized-metric").textContent, "-42.50");
  assert.equal(nodes.get("#live-realized-metric").className, "down");
  assert.equal(nodes.get("#live-realized-detail").textContent, "近 89 天 · FUTURES · 24 条结算记录");
});

test("partial, missing, wrong-asset or previous-market income cannot appear as complete live PnL", () => {
  const ready = { status: "ready", asset: "USDT", amount: 100, coverageComplete: true, recordCount: 2 };
  for (const patch of [{ status: "partial" }, { amount: null }, { asset: "BNB" }, { coverageComplete: false }]) {
    const { nodes } = metricsContext({ alphaExecutionAuthorized: true, livePnlSnapshot: { ...ready, ...patch } });
    assert.equal(nodes.get("#live-realized-metric").textContent, "—");
  }
  const { nodes } = metricsContext({ alphaExecutionAuthorized: true, livePnlSnapshot: ready, livePnlMarket: "spot" });
  assert.equal(nodes.get("#live-realized-metric").textContent, "—");
});

test("verified zero LIVE settlements stay distinguishable from missing account data", () => {
  const { nodes } = metricsContext({
    alphaExecutionAuthorized: true,
    livePnlSnapshot: { status: "ready", asset: "USDT", amount: 0, coverageComplete: true, recordCount: 0 },
  });
  assert.equal(nodes.get("#live-realized-metric").textContent, "+0.00");
});

test("a lost session cannot replace LIVE portfolio settlement with local Paper profit", () => {
  const pnl = {}, count = {};
  const { context } = metricsContext({
    alphaExecutionConfig: { activeMode: "live", defaultMarket: "futures" },
    portfolioRealizedPnl: pnl, portfolioRealizedCount: count,
    paperRiskState: { positions: [{ status: "CLOSED", realizedPnl: 999 }], realizedPnl: 999, killSwitch: false },
    paperEquity: null, paperPnl: null, paperExposure: null, killSwitchButton: null, riskSubmit: null,
    openPaperPositions: () => [], renderPositionMonitor() {}, renderPaperTable() {}, renderAuditLog() {},
  });
  vm.runInContext(client.slice(client.indexOf("function renderPaperWorkspace()"), client.indexOf("async function submitTradeIntent")), context);
  context.renderPaperWorkspace();
  assert.equal(pnl.textContent, "—");
  assert.match(count.textContent, /等待完整实盘/);
});

test("Alpha no longer ships sample market data or an invented social time series", () => {
  const html = fs.readFileSync(path.join(root, "alpha-radar.html"), "utf8");
  assert.match(client, /^let tokenUniverse = \[\];/);
  assert.doesNotMatch(client, /Math\.sin\(index \* 1\.7\)/);
  assert.doesNotMatch(html, /Telegram 信号解释器|architecture-strip|FOUR ENVIRONMENTS|value="POPCATUSDT"|\+3\.84%|68\.2%/);
  const momentum = html.indexOf('class="panel momentum-panel"');
  assert.ok(momentum > html.indexOf('id="signals"'));
  assert.ok(momentum < html.indexOf('class="panel pulse-panel"'));
});

test("featured fallback preserves asset identity without inventing market scores", () => {
  const source = client.slice(client.indexOf("function createMainstreamFallbackToken("), client.indexOf("function buildMainstreamUniverse("));
  const context = { featuredMarketMeta: { BTC: { name: "Bitcoin", market: "both", category: "主流资产" } } };
  vm.createContext(context);
  vm.runInContext(source, context);
  const token = context.createMainstreamFallbackToken("BTC", 0);
  assert.equal(token.symbol, "BTC");
  for (const field of ["change", "volume", "funding", "oi", "score", "heat"]) assert.equal(token[field], null, field);
  assert.ok(token.dimensions.every((value) => value === null));
  assert.ok(token.dimensionAvailability.every((value) => value === false));
});

test("signals with unknown timestamps cannot qualify as fresh strong trading intents", () => {
  const source = client.slice(client.indexOf("function detectStrongTradeIntent("), client.indexOf("function scheduleStrongTradeIntentExpiry("));
  const context = { candidateDirection: () => "LONG", strongTradeIntentWindowMs: 180_000, strongSignalIdentity: () => "signal" };
  vm.createContext(context);
  vm.runInContext(source, context);
  const counts = new Map([["BTC", 1]]);
  for (const signal_time of [null, undefined, "", "invalid"]) {
    assert.equal(context.detectStrongTradeIntent([{ symbol: "BTC", direction: "long", signal_time }], counts), null);
  }
  const known = context.detectStrongTradeIntent([{ symbol: "BTC", direction: "long", signal_time: new Date().toISOString() }], counts);
  assert.equal(known.symbol, "BTC");
});

test("the automation fill badge requires a server-bound LIVE reservation and a genuine fill", () => {
  const context = { executionEnum: value => String(value || "").toLowerCase() };
  vm.createContext(context);
  vm.runInContext(client.slice(client.indexOf("function automationTradeBadge("), client.indexOf("function renderExecutionOrders(")), context);
  const verified = { environment: "LIVE", isAutomation: true, automationOrder: { reservationId: "reservation-1", source: "alpha-auto:reservation-1", entryOrderId: "entry-1" }, plan: { intent: { source: "alpha-auto:reservation-1" } } };
  assert.match(context.automationTradeBadge(verified), /自成交/);
  for (const record of [null, { ...verified, environment: "PAPER" }, { ...verified, isAutomation: false }, { ...verified, automationOrder: null },
    { ...verified, automationOrder: { ...verified.automationOrder, entryOrderId: "" } },
    { ...verified, automationOrder: { ...verified.automationOrder, source: "alpha-auto:another-reservation" } },
    ...["manual", "alpha-radar", "telegram", "telegram-strong"].map(source => ({ ...verified, plan: { intent: { source } } })),
    { ...verified, role: "ENTRY", filledQuantity: 0 }, { ...verified, role: "STOP_LOSS", filledQuantity: 0 }]) {
    assert.equal(context.automationTradeBadge(record), "", JSON.stringify(record));
  }
  assert.match(context.automationTradeBadge({ ...verified, role: "ENTRY", filledQuantity: 0.01 }), /自成交/);
});

test("live unlocking sends only two explicit acknowledgements and prevents concurrent retries", async () => {
  const nodes = { "#unlock-live": { disabled: true, dataset: {} }, "#live-ack-funds": { checked: false }, "#live-ack-withdraw": { checked: false } };
  const requests = [], notices = [];
  let finishRequest;
  const pending = new Promise(resolve => { finishRequest = resolve; });
  const context = { document: { querySelector: id => nodes[id] }, showToast: message => notices.push(message),
    executionRequest: async (url, options) => { requests.push({ url, ...options }); await pending; }, hydrateAlphaExecution: async () => {} };
  vm.createContext(context);
  vm.runInContext(client.slice(client.indexOf("function syncLiveUnlockAcknowledgements("), client.indexOf("async function relockAlphaLive(")), context);
  await context.unlockAlphaLive();
  nodes["#live-ack-funds"].checked = true;
  await context.unlockAlphaLive();
  assert.equal(requests.length, 0);
  assert.match(notices.at(-1), /请先勾选两项/);
  nodes["#live-ack-withdraw"].checked = true;
  context.syncLiveUnlockAcknowledgements();
  assert.equal(nodes["#unlock-live"].disabled, false);
  const unlocking = context.unlockAlphaLive();
  context.syncLiveUnlockAcknowledgements();
  assert.equal(nodes["#unlock-live"].disabled, true);
  await context.unlockAlphaLive();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/live-unlock");
  assert.deepEqual(JSON.parse(requests[0].body), { acknowledgeRealFunds: true, acknowledgeNoWithdrawPermission: true });
  finishRequest(); await unlocking;
  assert.equal(nodes["#live-ack-funds"].checked, false);
  assert.equal(nodes["#live-ack-withdraw"].checked, false);
  assert.equal(nodes["#unlock-live"].disabled, true);
});
