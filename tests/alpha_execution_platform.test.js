const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Alpha Radar exposes Paper and Live with the production interlock", () => {
  const html = read("alpha-radar.html");
  for (const mode of ["paper", "live"]) {
    assert.match(html, new RegExp(`data-execution-mode="${mode}"`));
  }
  assert.doesNotMatch(html, /data-execution-mode="(?:mock_exchange|testnet)"|<option value="(?:mock_exchange|testnet)"/);
  assert.match(html, /Binance API 与代理配置/);
  assert.match(html, /生产实盘双重保险锁/);
  assert.doesNotMatch(html, /ENABLE LIVE TRADING|live-unlock-phrase|fill-live-phrase/);
  assert.match(html, /id="live-ack-funds"/);
  assert.match(html, /id="live-ack-withdraw"/);
  assert.match(html, /id="live-lock-help-toggle"[^>]*popovertarget="live-lock-help"/);
  assert.match(html, /id="live-lock-help" popover/);
  assert.doesNotMatch(html, /<p>实盘默认关闭[^<]*<\/p>\s*<label class="live-ack"/);
  assert.match(html, /订单监控与对账/);
});

test("execution center stacks environment and live interlock beside credentials with the save action in the header", () => {
  const html = read("alpha-radar.html");
  const styles = read("alpha-scanner.css");
  const settingsStart = html.indexOf('<form class="execution-settings"');
  const settingsEnd = html.indexOf('</form>', settingsStart);
  const lockStart = html.indexOf('<section class="live-unlock-panel"');
  assert.ok(settingsStart >= 0 && settingsEnd > settingsStart && lockStart > settingsEnd);
  assert.ok(html.indexOf('id="save-execution-config"', settingsStart) < html.indexOf('</header>', settingsStart));
  assert.match(styles, /\.execution-control-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.execution-right-panels\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\)/);
});

test("live portfolio shortens verified automation sources without changing manual sources", () => {
  const client = read("alpha-scanner.js");
  const context = { executionEnum: value => String(value || "").toLowerCase() };
  vm.createContext(context);
  vm.runInContext(client.slice(client.indexOf("function automationTradeBadge("), client.indexOf("function renderExecutionOrders(")), context);
  const automated = { environment: "LIVE", isAutomation: true, automationOrder: { reservationId: "reservation-1", source: "alpha-auto:reservation-1", entryOrderId: "entry-1" }, plan: { intent: { source: "alpha-auto:reservation-1" } } };
  assert.equal(context.activePortfolioSource(automated), "alpha-auto");
  assert.equal(context.activePortfolioSource({ plan: { intent: { source: "telegram" } } }), "telegram");
});

test("execution center navigation and risk policy controls are placed before the risk state machine", () => {
  const html = read("alpha-radar.html");
  const poolNav = html.indexOf('data-section="risk-pool"');
  const executionNav = html.indexOf('data-section="execution-control"');
  const riskNav = html.indexOf('data-section="risk"');
  assert.ok(poolNav >= 0 && executionNav > poolNav && riskNav > executionNav);
  assert.match(html, /href="#execution-control"/);

  const riskSection = html.slice(html.indexOf('id="risk"'), html.indexOf('id="paper"'));
  assert.ok(riskSection.indexOf('class="risk-rules risk-rules-top"') < riskSection.indexOf('class="risk-pipeline"'));
});

test("risk policy changes persist server-side and are flushed before approval", () => {
  const client = read("alpha-scanner.js");
  const submitStart = client.indexOf("async function submitTradeIntent");
  const intentRequest = client.indexOf('executionRequest("/intents"', submitStart);
  assert.match(client, /scheduleExecutionConfigSave\(\)/);
  assert.match(client, /dedupeWindowMinutes: parseControlNumber\("dedupe-window"/);
  assert.ok(client.indexOf("await flushExecutionConfig()", submitStart) < intentRequest);
  assert.match(client, /已保存 · 去重 \$\{alphaExecutionConfig\.dedupeWindowMinutes\} min/);
});

test("risk dedupe is sourced from successfully submitted entry orders instead of unexecuted intents", () => {
  const service = read("lib/alpha-execution/service.ts");
  const engine = read("workers/risk_engine.js");
  const approval = service.slice(service.indexOf("export async function approveTradeIntent"), service.indexOf("export async function readLiveReferencePrice"));
  assert.match(approval, /prisma\.alphaTradingOrder\.findMany/);
  assert.match(approval, /role: AlphaOrderRole\.ENTRY/);
  assert.match(approval, /shouldBlockDedupeFromEntryOrder/);
  assert.doesNotMatch(approval, /prisma\.alphaTradeIntent\.findMany/);
  assert.match(engine, /status === "REJECTED"[\s\S]*return false/);
  assert.match(engine, /\["SUBMITTED", "NEW", "PARTIALLY_FILLED", "FILLED", "UNKNOWN"\]/);
});

test("downstream positions, orders, monitor, and portfolio follow the active execution environment", () => {
  const client = read("alpha-scanner.js");
  assert.match(client, /function activeExecutionPositions\(\)[\s\S]*position\.environment[\s\S]*alphaExecutionConfig\.activeMode/);
  assert.match(client, /function renderExecutionOrders\(\)[\s\S]*order\.environment[\s\S]*alphaExecutionConfig\.activeMode/);
  assert.match(client, /if \(mode === "live"\) return \{ title: "生产实盘组合"/);
  assert.match(client, /await persistExecutionConfig\(\{ overrides: \{ activeMode: mode \} \}\)/);
  assert.match(read("app/api/alpha-execution/live-unlock/route.ts"), /activeMode: AlphaExecutionMode\.LIVE/);
});

test("live unlock requires both explicit acknowledgements and the server administrator gate", () => {
  const client = read("alpha-scanner.js");
  const route = read("app/api/alpha-execution/live-unlock/route.ts");
  const access = read("lib/alpha-execution/access.ts");
  assert.match(client, /acknowledgeRealFunds: fundsAcknowledgement.checked/);
  assert.match(client, /acknowledgeNoWithdrawPermission: withdrawalAcknowledgement.checked/);
  assert.match(client, /请先勾选两项资金与 API 安全确认/);
  assert.match(route, /acknowledgeRealFunds/);
  assert.match(route, /acknowledgeNoWithdrawPermission/);
  assert.match(route, /requireAlphaOperator\(\{ live: true \}\)/);
  assert.doesNotMatch(client, /liveUnlockPhrase|fillLiveUnlockPhrase/);
  assert.match(access, /caught instanceof ZodError/);
  assert.match(access, /caught\.issues\[0\]\?\.message/);
});

test("signal automation always creates a risk-approved plan before execution", () => {
  const source = read("alpha-scanner.js");
  const strongIntent = source.slice(source.indexOf("async function createStrongTradeIntentOrder"), source.indexOf("function renderRecentSignals"));
  assert.match(strongIntent, /executionRequest\("\/intents"/);
  assert.match(strongIntent, /pendingExecutionPlan = result\.executionPlan/);
  assert.match(strongIntent, /confirmUnifiedExecutionPlan/);
  assert.doesNotMatch(strongIntent, /RISK_BYPASSED|riskEngineBypassed|paperRiskState\.positions\.push/);
});

test("authenticated execution routes enforce same-origin mutations and live 2FA gates", () => {
  for (const route of [
    "app/api/alpha-execution/config/route.ts",
    "app/api/alpha-execution/credentials/route.ts",
    "app/api/alpha-execution/intents/route.ts",
    "app/api/alpha-execution/execute/route.ts",
    "app/api/alpha-execution/reconcile/route.ts",
    "app/api/alpha-execution/kill-switch/route.ts",
    "app/api/alpha-execution/live-unlock/route.ts"
  ]) {
    const source = read(route);
    assert.match(source, /assertSameOrigin\(request\)/, route);
    assert.match(source, /requireAlphaOperator/, route);
  }
  assert.match(read("app/api/alpha-execution/live-unlock/route.ts"), /requireAlphaOperator\(\{ live: true \}\)/);
  assert.match(read("app/api/alpha-execution/execute/route.ts"), /AlphaExecutionMode\.LIVE[\s\S]*requireAlphaOperator\(\{ live: true \}\)/);
});

test("Binance executor uses idempotent client order IDs and stops blind retries on unknown status", () => {
  const client = read("lib/alpha-execution/binance.ts");
  const service = read("lib/alpha-execution/service.ts");
  assert.match(client, /origClientOrderId/);
  assert.match(client, /订单状态未知，已停止自动重试并等待对账/);
  assert.match(service, /idempotencyKey/);
  assert.match(service, /reconciliationHealthy: false/);
  assert.match(service, /attachSimulatedProtection/);
});

test("live futures protection uses the current Binance Algo Service and environment-isolated risk", () => {
  const client = read("lib/alpha-execution/binance.ts");
  const service = read("lib/alpha-execution/service.ts");
  assert.match(client, /POST", "\/fapi\/v1\/algoOrder"/);
  assert.match(client, /algoType: "CONDITIONAL"/);
  assert.match(client, /triggerPrice: stop/);
  assert.match(client, /clientAlgoId: input\.stopClientOrderId/);
  assert.match(client, /DELETE", "\/fapi\/v1\/algoOpenOrders"/);
  assert.match(client, /DELETE", "\/fapi\/v1\/algoOrder"/);
  assert.match(service, /where: \{ userId, environment, market, state:/);
  assert.match(service, /client\.getOrder\(order\.symbol, order\.clientOrderId, isConditional\)/);
  assert.match(service, /state: AlphaExecutionState\.CLOSED/);
});

test("trading credentials are encrypted server-side and never returned as secrets", () => {
  const credentialStore = read("lib/alpha-execution/credentials.ts");
  const data = read("lib/alpha-execution/data.ts");
  assert.match(credentialStore, /aes-256-gcm/);
  assert.match(credentialStore, /TRADING_CREDENTIALS_ENCRYPTION_KEY/);
  assert.doesNotMatch(data, /apiSecretEncrypted:\s*true/);
  assert.doesNotMatch(data, /apiKeyEncrypted:\s*true/);
  assert.match(data, /apiKeyHint/);
});

test("signal details, live reference-price guard, plan cancellation and live portfolio controls are wired end to end", () => {
  const html = read("alpha-radar.html");
  const client = read("alpha-scanner.js");
  const service = read("lib/alpha-execution/service.ts");
  const binance = read("lib/alpha-execution/binance.ts");
  assert.match(client, /data-signal-detail/);
  assert.match(client, /信号流水七维信号明细/);
  assert.match(client, /refreshIntentReferencePrice/);
  assert.match(service, /LIVE_PRICE_REFRESHED/);
  assert.match(service, /不再按价格偏差阈值拒绝计划/);
  assert.doesNotMatch(service, /MAX_REFERENCE_PRICE_DEVIATION_BPS|REFERENCE_PRICE_STALE/);
  assert.match(binance, /"\/fapi\/v1\/ticker\/price"/);
  assert.match(client, /CANCEL_PENDING_PLAN/);
  assert.match(read("app/api/alpha-execution/plans/cancel/route.ts"), /cancelExecutionPlan/);
  assert.match(html, /id="live-portfolio-pull"/);
  assert.match(client, /const livePortfolioPullMs = 30_000/);
  assert.match(client, /data-live-close/);
  assert.match(client, /data-live-protection/);
  assert.match(read("app/api/alpha-execution/positions/action/route.ts"), /requireAlphaOperator\(\{ live: true \}\)/);
});

test("live portfolio pull refreshes Binance equity, risk exposure and historical realized pnl", () => {
  const html = read("alpha-radar.html");
  const client = read("alpha-scanner.js");
  const service = read("lib/alpha-execution/service.ts");
  const data = read("lib/alpha-execution/data.ts");
  const binance = read("lib/alpha-execution/binance.ts");
  assert.match(html, /id="portfolio-realized-pnl"/);
  assert.match(html, /近 89 天实际盈亏/);
  assert.match(service, /const snapshot = await client\.preflight\(\)/);
  assert.match(service, /permissionSummary: json\(snapshot\)/);
  assert.match(service, /accountSnapshots/);
  assert.match(binance, /account\.positions/);
  assert.match(binance, /riskExposureNotional/);
  assert.match(binance, /totalUnrealizedProfit/);
  assert.match(data, /state: AlphaExecutionState\.CLOSED/);
  assert.match(data, /historicalRealizedPnl/);
  assert.match(data, /riskExposureNotional/);
  assert.match(client, /activeExecutionPortfolioStats/);
  assert.match(client, /账户全量已同步/);
  assert.match(client, /portfolioRealizedPnl\.textContent = known \? formatSignedMoney\(pnl\.amount\) : "—"/);
});

test("live reconciliation adopts authoritative Binance order and position state without weakening the Kill Switch", () => {
  const service = read("lib/alpha-execution/service.ts");
  const binance = read("lib/alpha-execution/binance.ts");
  const killSwitch = read("app/api/alpha-execution/kill-switch/route.ts");

  assert.match(binance, /isBinanceMissingOrderError/);
  assert.match(binance, /"\/fapi\/v3\/positionRisk"/);
  assert.match(service, /REMOTE_ORDER_MISSING/);
  assert.match(service, /POSITION_CLOSED_EXTERNALLY/);
  assert.match(service, /POSITION_SYNCED/);
  assert.match(service, /ACTIVE_PROTECTION_ORDER_STATES/);
  assert.match(service, /statusUnknown \? AlphaOrderStatus\.UNKNOWN : AlphaOrderStatus\.REJECTED/);
  assert.match(service, /最近一次健康对账已过期/);
  assert.match(service, /缺少完整止损\/止盈保护/);
  assert.match(killSwitch, /releaseKillSwitch/);
});

test("opening a Telegram signal detail reads a no-cache Binance live price with futures-to-spot fallback", () => {
  const client = read("alpha-scanner.js");
  const route = read("app/api/binance-price/route.ts");
  const detailHandler = client.slice(client.indexOf("async function openSignalStreamDetail"), client.indexOf("surfFilterButtons.forEach"));
  assert.match(detailHandler, /\/api\/binance-price/);
  assert.match(detailHandler, /cache: "no-store"/);
  assert.match(detailHandler, /priceNode\.textContent = "同步中…"/);
  assert.match(detailHandler, /formatMomentumPrice\(Number\(payload\.price\)\)/);
  assert.match(route, /\["futures", "spot"\]/);
  assert.match(route, /getLiveBinanceReferencePrice/);
  assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
  assert.doesNotMatch(route, /requireAlphaOperator/);
});

test("scanner switches between anomaly ranking and the exact 13 featured market symbols", () => {
  const html = read("alpha-radar.html");
  const client = read("alpha-scanner.js");
  const scanApi = read("api/alpha-scan.js");
  assert.match(html, /data-ranking-universe="anomaly"/);
  assert.match(html, /data-ranking-universe="mainstream"/);
  assert.match(html, /热门精选主流 <em>13<\/em>/);
  assert.match(client, /const featuredMarketSymbols = trackedMarketSymbols/);
  assert.match(client, /activeRankingUniverse === "mainstream" \? mainstreamUniverse : tokenUniverse/);
  assert.match(client, /featuredToken\.price = formatMarketPrice/);
  assert.match(scanApi, /const FEATURED_SYMBOLS = \["BTC", "ETH", "BNB", "SOL", "DOGE", "ZEC", "TAO", "ENA", "ONDO", "UNI", "XRP", "SUI", "HYPE"\]/);
  assert.match(scanApi, /featuredItems/);
});

test("neutral scanner tokens require an explicit long or short choice before risk review", () => {
  const html = read("alpha-radar.html");
  const client = read("alpha-scanner.js");
  assert.match(html, /id="detail-direction-picker"/);
  assert.match(html, /data-detail-side="LONG"/);
  assert.match(html, /data-detail-side="SHORT"/);
  assert.match(html, /仍须经过 Risk Engine 审批/);
  assert.match(client, /token\.bias === "neutral"[\s\S]*selectedNeutralDirection/);
  assert.match(client, /detailQueueButton\.disabled = !selectedNeutralDirection/);
  assert.match(client, /side,[\s\S]*source: token\.intentSource \|\| "alpha-radar"/);
  assert.match(client, /等待提交 Risk Engine 审批/);
});

test("TradFi agreement rejection is actionable, terminal, and never presented as a retryable order", () => {
  const binance = read("lib/alpha-execution/binance.ts");
  const access = read("lib/alpha-execution/access.ts");
  const service = read("lib/alpha-execution/service.ts");
  const client = read("alpha-scanner.js");
  assert.match(binance, /code === -4411/);
  assert.match(binance, /SIGN_TRADFI_PERPS_AGREEMENT/);
  assert.match(binance, /当前订单未成交，系统不会自动重试/);
  assert.match(access, /actionRequired: details\.actionRequired, retriable: false, state: "FAILED"/);
  assert.match(service, /执行计划当前状态为 \$\{plan\.state\}，不可再次执行/);
  assert.match(client, /TRADFI AGREEMENT REQUIRED/);
  assert.match(client, /打开 Binance 签署协议/);
  assert.match(client, /pendingExecutionPlan = null/);
});
