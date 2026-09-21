let tokenUniverse = [];

const dimensionNames = ["价格动量", "成交异动", "资金费率", "多空比", "爆仓强度", "社交情绪", "媒体热度"];
const rowsRoot = document.querySelector("#token-rows");
const searchInput = document.querySelector("#token-search");
const marketFilter = document.querySelector("#market-filter");
const directionTabs = [...document.querySelectorAll(".direction-tabs button")];
const rankingUniverseTabs = [...document.querySelectorAll("[data-ranking-universe]")];
const scannerModeKicker = document.querySelector("#scanner-mode-kicker");
const scannerModeTitle = document.querySelector("#scanner-mode-title");
const rankingMethodTitle = document.querySelector("#ranking-method-title");
const rankingMethodCopy = document.querySelector("#ranking-method-copy");
const watchCount = document.querySelector("#watch-count");
const emptyState = document.querySelector("#empty-state");
const rankingPagination = document.querySelector("#ranking-pagination");
const rankingPageSummary = document.querySelector("#ranking-page-summary");
const rankingPages = document.querySelector("#ranking-pages");
const rankingPrev = document.querySelector("#ranking-prev");
const rankingNext = document.querySelector("#ranking-next");
const tokenTableWrap = document.querySelector(".token-table-wrap");
const refreshAlphaLists = document.querySelector("#refresh-alpha-lists");
const alphaMarketCapCount = document.querySelector("#alpha-market-cap-count");
const alphaOpenInterestCount = document.querySelector("#alpha-open-interest-count");
const rankingVolumeHead = document.querySelector("#ranking-volume-head");
const rankingOiHead = document.querySelector("#ranking-oi-head");
const rankingScoreHead = document.querySelector("#ranking-score-head");
const rankingBiasHead = document.querySelector("#ranking-bias-head");
const drawer = document.querySelector("#detail-drawer");
const drawerBackdrop = document.querySelector("#drawer-backdrop");
const detailDirectionPicker = document.querySelector("#detail-direction-picker");
const detailDirectionButtons = [...document.querySelectorAll("[data-detail-side]")];
const detailQueueButton = document.querySelector("#detail-queue");
const toast = document.querySelector("#toast");
const spotMarketSymbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "DOGEUSDT", "ZECUSDT", "TAOUSDT", "ENAUSDT", "ONDOUSDT", "UNIUSDT", "XRPUSDT", "SUIUSDT"];
const futuresMarketSymbols = ["HYPEUSDT"];
const trackedMarketSymbols = [...spotMarketSymbols, ...futuresMarketSymbols];
const featuredMarketSymbols = trackedMarketSymbols.map((symbol) => symbol.replace(/USDT$/, ""));
const featuredMarketMeta = {
  BTC: { name: "Bitcoin", category: "主流资产", market: "both" },
  ETH: { name: "Ethereum", category: "主流资产", market: "both" },
  BNB: { name: "BNB", category: "平台资产", market: "both" },
  SOL: { name: "Solana", category: "主流公链", market: "both" },
  DOGE: { name: "Dogecoin", category: "主流 MEME", market: "both" },
  ZEC: { name: "Zcash", category: "隐私资产", market: "both" },
  TAO: { name: "Bittensor", category: "AI 资产", market: "both" },
  ENA: { name: "Ethena", category: "DeFi", market: "both" },
  ONDO: { name: "Ondo", category: "RWA", market: "both" },
  UNI: { name: "Uniswap", category: "DeFi", market: "both" },
  XRP: { name: "XRP", category: "支付资产", market: "both" },
  SUI: { name: "Sui", category: "主流公链", market: "both" },
  HYPE: { name: "Hyperliquid", category: "DEX 资产", market: "perp" }
};
const marketPriceDecimals = {
  BTCUSDT: 1, ETHUSDT: 1, BNBUSDT: 2, SOLUSDT: 2, DOGEUSDT: 5, ZECUSDT: 2,
  TAOUSDT: 2, ENAUSDT: 4, ONDOUSDT: 4, UNIUSDT: 3, XRPUSDT: 4, SUIUSDT: 4, HYPEUSDT: 2
};
const marketFeedStatus = document.querySelector("#market-feed-status");
const bubbleArea = document.querySelector("#bubble-area");
const bubbleLiveState = document.querySelector("#bubble-live-state");
const bubbleUpdated = document.querySelector("#bubble-updated");
const cryptoBubblesRefreshMs = 60_000;
const scanTime = document.querySelector("#scan-time");
const scanNext = document.querySelector("#scan-next");
const scanCycleLabel = document.querySelector("#scan-cycle-label");
const scanUniverseCount = document.querySelector("#scan-universe-count");
const scanMarketMix = document.querySelector("#scan-market-mix");
const strongBreakdown = document.querySelector("#strong-breakdown");
const signalStream = document.querySelector("#signal-stream");
const triggerLive = document.querySelector("#trigger-live");
const refreshTriggers = document.querySelector("#refresh-triggers");
const surfPulseFeed = document.querySelector("#surf-pulse-feed");
const surfLiveState = document.querySelector("#surf-live-state");
const surfPulseCount = document.querySelector("#surf-pulse-count");
const surfSort = document.querySelector("#surf-sort");
const refreshSurfPulse = document.querySelector("#refresh-surf-pulse");
const surfFilterButtons = [...document.querySelectorAll("[data-surf-filter]")];
const riskPoolState = document.querySelector("#risk-pool-state");
const riskPoolTotal = document.querySelector("#risk-pool-total");
const riskPoolScanCount = document.querySelector("#risk-pool-scan-count");
const riskPoolMomentumCount = document.querySelector("#risk-pool-momentum-count");
const riskPoolSignalCount = document.querySelector("#risk-pool-signal-count");
const riskPoolResonanceCount = document.querySelector("#risk-pool-resonance-count");
const vennScanCount = document.querySelector("#venn-scan-count");
const vennMomentumCount = document.querySelector("#venn-momentum-count");
const vennSignalCount = document.querySelector("#venn-signal-count");
const overlapScanMomentum = document.querySelector("#overlap-scan-momentum");
const overlapScanSignal = document.querySelector("#overlap-scan-signal");
const overlapMomentumSignal = document.querySelector("#overlap-momentum-signal");
const overlapAll = document.querySelector("#overlap-all");
const overlapAllSymbols = document.querySelector("#overlap-all-symbols");
const poolCandidateList = document.querySelector("#pool-candidate-list");
const poolVisibleCount = document.querySelector("#pool-visible-count");
const poolFilterButtons = [...document.querySelectorAll("[data-pool-filter]")];
const boxScanButtons = [...document.querySelectorAll("[data-box-scan]")];
const boxNotice = document.querySelector("#alpha-box-notice");
const boxResults = document.querySelector("#alpha-box-results");
const boxSearch = document.querySelector("#alpha-box-search");
const boxFilter = document.querySelector("#alpha-box-filter");
const boxSort = document.querySelector("#alpha-box-sort");
const boxJob = document.querySelector("#alpha-box-job");
const boxProgress = document.querySelector("#alpha-box-progress");
const boxJobLabel = document.querySelector("#alpha-box-job-label");
const boxJobCount = document.querySelector("#alpha-box-job-count");
const boxJobLog = document.querySelector("#alpha-box-job-log");
const boxChartDialog = document.querySelector("#alpha-box-chart-dialog");
const boxExpandedChart = document.querySelector("#alpha-box-expanded-chart");
const boxChartDialogTitle = document.querySelector("#alpha-box-chart-dialog-title");
const boxChartSummary = document.querySelector("#alpha-box-chart-summary");
const boxChartCaption = document.querySelector("#alpha-box-chart-caption");
const boxChartFullLink = document.querySelector("#alpha-box-chart-full-link");
const tradeIntentForm = document.querySelector("#trade-intent-form");
const riskDecisionView = document.querySelector("#risk-decision-view");
const riskSubmit = document.querySelector("#risk-submit");
const loadSignalCandidateButton = document.querySelector("#load-signal-candidate");
const loadPoolCandidateButton = document.querySelector("#load-pool-candidate");
const killSwitchButton = document.querySelector("#kill-switch");
const riskAuditList = document.querySelector("#risk-audit-list");
const positionMonitorList = document.querySelector("#position-monitor-list");
const monitorCount = document.querySelector("#monitor-count");
const paperRows = document.querySelector("#paper-rows");
const paperEquity = document.querySelector("#paper-equity");
const paperPnl = document.querySelector("#paper-pnl");
const paperExposure = document.querySelector("#paper-exposure");
const portfolioRealizedStat = document.querySelector("#portfolio-realized-stat");
const portfolioRealizedPnl = document.querySelector("#portfolio-realized-pnl");
const portfolioRealizedCount = document.querySelector("#portfolio-realized-count");
const paperResetButton = document.querySelector("#reset-paper-trading");
const livePortfolioPullButton = document.querySelector("#live-portfolio-pull");
const livePortfolioPullState = document.querySelector("#live-portfolio-pull-state");
const paperCurrentView = document.querySelector("#paper-current-view");
const paperHistoryView = document.querySelector("#paper-history-view");
const paperHistoryList = document.querySelector("#paper-history-list");
const paperHistoryCount = document.querySelector("#paper-history-count");
const paperViewTabs = [...document.querySelectorAll("[data-paper-view]")];
const paperPanel = document.querySelector("#paper");
const portfolioTitle = document.querySelector("#portfolio-title");
const portfolioKicker = document.querySelector("#portfolio-kicker");
const portfolioNavTitle = document.querySelector("#portfolio-nav-title");
const portfolioNavSubtitle = document.querySelector("#portfolio-nav-subtitle");
const portfolioEquityLabel = document.querySelector("#portfolio-equity-label");
const portfolioFootnote = document.querySelector("#portfolio-footnote");
const portfolioExportLabel = document.querySelector("#portfolio-export-label");
const positionMonitorTitle = document.querySelector("#position-monitor-title");
const positionMonitorKicker = document.querySelector("#position-monitor-kicker");
const riskPolicySaveState = document.querySelector("#risk-policy-save-state");
const executionControl = document.querySelector("#execution-control");
const executionConfigForm = document.querySelector("#execution-config-form");
const executionCredentialForm = document.querySelector("#execution-credential-form");
const executionModeButtons = [...document.querySelectorAll("[data-execution-mode]")];
const executionOrderList = document.querySelector("#execution-order-list");
const executionOrderCount = document.querySelector("#execution-order-count");
const executionHealth = document.querySelector("#execution-health");
const executionCredentialState = document.querySelector("#execution-credential-state");
const executionCredentialList = document.querySelector("#execution-credential-list");
const executionReconcileState = document.querySelector("#execution-reconcile-state");
const executionStreamState = document.querySelector("#execution-stream-state");
const liveUnlockPanel = document.querySelector("#live-unlock-panel");
const alphaScanRefreshMs = 2 * 60 * 60 * 1000;
const telegramSignalRefreshMs = 5 * 60_000;
const surfPulseRefreshMs = 10 * 60_000;
const paperMonitorRefreshMs = 15_000;
const alphaExecutionRefreshMs = 15_000;
const alphaExecutionIdleRefreshMs = 15 * 60_000;
const livePortfolioPullMs = 30_000;
const strongTradeIntentWindowMs = 3 * 60_000;
const paperRiskStorageKey = "alpha-radar-paper-risk-v1";
const paperHistoryStorageKey = "alpha-radar-paper-history-v1";
const strongTradeIntentSeenStorageKey = "alpha-radar-strong-intent-seen-v1";
const paperHistoryLimit = 12;

let activeFilter = "all";
let activeRankingUniverse = "anomaly";
let activeRankingPage = 1;
const rankingPageSize = 12;
let activeToken = tokenUniverse[0];
let mainstreamUniverse = [];
let alphaMarketCapUniverse = [];
let alphaOpenInterestUniverse = [];
let alphaListsMeta = null;
let alphaListsTimer = null;
let alphaListsLoading = false;
let selectedNeutralDirection = null;
let toastTimer;
let marketSocket = null;
let marketReconnectTimer = null;
let marketReconnectAttempts = 0;
let futuresMarketSocket = null;
let futuresReconnectTimer = null;
let futuresReconnectAttempts = 0;
let lastMarketStatusUpdate = 0;
const lastMarketPrices = new Map();
let cryptoBubblesTimer = null;
let cryptoBubblesHasData = false;
let cryptoBubblesLoading = false;
let latestMomentumPayload = null;
const momentumDetailTokens = new Map();
const momentumWatchedSymbols = new Set();
const riskPoolDetailTokens = new Map();
const signalDetailTokens = new Map();
let alphaScanTimer = null;
let alphaScanHasData = false;
let alphaScanLoading = false;
let telegramSignalTimer = null;
let telegramSignalLoading = false;
let telegramSignalLastRequestAt = 0;
let latestTelegramSignals = [];
let latestTelegramSignalsAutoEligible = false;
let activeRiskPoolFilter = "all";
let surfPulseTimer = null;
let surfPulseLoading = false;
let surfPulseItems = [];
let surfPulseSeenIds = new Set();
let surfPulseNewIds = new Set();
let activeSurfFilter = "all";
let boxBreakoutState = null;
let boxBreakoutLoading = false;
let boxBreakoutTimer = null;
let boxQuoteTimer = null;
let boxQuotes = new Map();
let boxChartRequest = 0;
const boxChartCache = new Map();
let pendingExecutionPlan = null;
let paperMonitorTimer = null;
let paperRenderQueued = false;
let activePaperView = "current";
let paperHistory = [];
let strongTradeIntentSeen = [];
let strongTradeIntentExpiryTimer = null;
const strongTradeIntentProcessing = new Set();
let alphaExecutionTimer = null;
let alphaExecutionUserSocket = null;
let alphaExecutionSnapshot = null;
let alphaExecutionAuthorized = false;
let alphaExecutionLoading = false;
let alphaExecutionConfigSaving = false;
let alphaExecutionConfigDirty = false;
let alphaExecutionConfigSaveTimer = null;
let livePortfolioPullTimer = null;
let livePortfolioPulling = false;
const livePnlRefreshMs = 5 * 60_000;
let livePnlSnapshot = null;
let livePnlMarket = null;
let livePnlLoading = false;
let livePnlLastAttempt = 0;
let livePnlTimer = null;
let liveAuditExporting = false;
let alphaExecutionConfig = {
  activeMode: "paper",
  defaultMarket: "futures",
  testnetEnabled: false,
  liveEnabled: false,
  liveUnlocked: false,
  autoExecuteEnabled: false,
  killSwitchActive: false,
  requireManualConfirmation: true,
  requireProtectionOrders: true,
  riskPerTradePct: 0.75,
  maxLeverage: 3,
  dailyLossLimitPct: 2,
  dedupeWindowMinutes: 15,
  maxOpenPositions: 4,
  maxPortfolioExposurePct: 35,
  minAlphaScore: 75,
  perOrderNotionalLimit: 50,
  dailyNotionalLimit: 200,
  reconciliationHealthy: true,
  lastReconciledAt: null
};

function createInitialPaperRiskState() {
  return {
    version: 1,
    sessionStartedAt: new Date().toISOString(),
    startingEquity: 10_000,
    realizedPnl: 0,
    killSwitch: false,
    pendingDecision: null,
    intents: [],
    positions: [],
    audits: []
  };
}

let paperRiskState = createInitialPaperRiskState();

const sourceHealth = new Map();
function updateSourceHealth(key, state = "live", timestamp = Date.now()) {
  sourceHealth.set(key, { state, timestamp });
  renderSourceHealth();
}

function renderSourceHealth() {
  const healthyKeys = new Set();
  const configuredKeys = new Set();
  document.querySelectorAll("[data-source-health]").forEach((row) => {
    const key = row.dataset.sourceHealth;
    configuredKeys.add(key);
    const source = sourceHealth.get(key);
    const ttl = key === "alpha" ? alphaScanRefreshMs + 5 * 60_000 : key === "signals" ? telegramSignalRefreshMs + 60_000 : key === "momentum" ? cryptoBubblesRefreshMs + 60_000 : 120_000;
    const fresh = source && source.state === "live" && Date.now() - source.timestamp < ttl;
    if (fresh) healthyKeys.add(key);
    row.querySelector("i").className = `source-dot${fresh ? " live" : ""}`;
    row.querySelector("em").textContent = fresh ? radarText("实时", "LIVE") : source ? source.state === "error" ? radarText("重连", "RETRY") : radarText("缓存", "CACHED") : radarText("等待", "WAITING");
    row.title = source ? `${radarText("最近同步", "Last sync")} ${new Date(source.timestamp).toLocaleTimeString(platformLang === "en" ? "en-GB" : "zh-CN", { hour12: false })}` : radarText("尚未收到数据", "No data received yet");
  });
  const count = document.querySelector("#source-health-count");
  if (count) count.textContent = `${healthyKeys.size} / ${configuredKeys.size}`;
}

function renderLiveSummaryMetrics() {
  const count = document.querySelector("#risk-rejected-count");
  const detail = document.querySelector("#risk-rejected-detail");
  const metrics = alphaExecutionAuthorized && alphaExecutionSnapshot?.riskMetrics;
  if (count) count.textContent = metrics
    ? String(metrics.rejectedIntents.filter((item) => item.environment === alphaExecutionConfig.activeMode && item.market === alphaExecutionConfig.defaultMarket).reduce((sum, item) => sum + item.count, 0))
    : "—";
  if (detail) detail.textContent = metrics
    ? `${executionModeLabel()} · ${executionMarketLabel()} · 24 小时拒绝意图`
    : "账户风控记录尚未同步";
  const pnl = alphaExecutionAuthorized && livePnlMarket === alphaExecutionConfig.defaultMarket ? livePnlSnapshot : null;
  const known = pnl?.status === "ready" && pnl.coverageComplete === true && pnl.asset === "USDT"
    && pnl.amount != null && Number.isFinite(Number(pnl.amount));
  const result = document.querySelector("#live-realized-metric");
  const pnlDetail = document.querySelector("#live-realized-detail");
  if (result) {
    result.textContent = known ? formatSignedMoney(pnl.amount) : "—";
    result.className = known ? Number(pnl.amount) >= 0 ? "green" : "down" : "";
    result.title = known ? `LIVE ${executionMarketLabel()} · ${pnl.periodStart || ""} 至 ${pnl.periodEnd || ""} · 已实现盈亏、手续费和资金费的 USDT 净额` : "仅展示交易所核验完成的 LIVE 结算记录";
  }
  if (pnlDetail) pnlDetail.textContent = known
    ? `近 89 天 · ${executionMarketLabel()} · ${Number(pnl.recordCount) || 0} 条结算记录`
    : pnl?.message || (alphaExecutionAuthorized ? "正在同步 LIVE 历史结算记录" : "请登录后读取实盘历史结算记录");
  if (alphaExecutionConfig.activeMode === "live") {
    if (portfolioRealizedPnl) {
      portfolioRealizedPnl.textContent = known ? formatSignedMoney(pnl.amount) : "—";
      portfolioRealizedPnl.className = known ? Number(pnl.amount) >= 0 ? "up" : "down" : "";
    }
    if (portfolioRealizedCount) portfolioRealizedCount.textContent = known ? `近 89 天 · ${Number(pnl.recordCount) || 0} 条结算记录` : "等待完整实盘结算记录";
  }
  const auditButton = document.querySelector("#export-audit");
  if (auditButton) auditButton.disabled = !alphaExecutionAuthorized || liveAuditExporting;
  const equity = currentPaperEquity(true);
  const sidebarEquity = document.querySelector("#sidebar-equity");
  if (sidebarEquity) sidebarEquity.textContent = `本机 PAPER · ${equity.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT`;
}

function ensureLivePnlSchedule() {
  window.clearTimeout(livePnlTimer);
  if (document.hidden || !alphaExecutionAuthorized || livePnlLoading) return;
  const elapsed = Date.now() - livePnlLastAttempt;
  if (livePnlMarket !== alphaExecutionConfig.defaultMarket || elapsed >= livePnlRefreshMs) {
    void hydrateLivePnl();
    return;
  }
  livePnlTimer = window.setTimeout(() => hydrateLivePnl(), Math.max(1000, livePnlRefreshMs - elapsed));
}

async function hydrateLivePnl() {
  if (livePnlLoading || !alphaExecutionAuthorized || document.hidden) return;
  const market = alphaExecutionConfig.defaultMarket;
  livePnlLoading = true;
  livePnlLastAttempt = Date.now();
  if (livePnlMarket !== market) livePnlSnapshot = null;
  livePnlMarket = market;
  renderLiveSummaryMetrics();
  try {
    const snapshot = await executionRequest(`/pnl?${new URLSearchParams({ market })}`);
    if (alphaExecutionAuthorized && alphaExecutionConfig.defaultMarket === market) livePnlSnapshot = snapshot;
  } catch (error) {
    if (alphaExecutionConfig.defaultMarket === market) livePnlSnapshot = { status: "unavailable", amount: null, message: error.message || "实盘结算数据暂时不可用" };
  } finally {
    livePnlLoading = false;
    renderLiveSummaryMetrics();
    ensureLivePnlSchedule();
  }
}

async function exportLiveAudit() {
  if (!alphaExecutionAuthorized || liveAuditExporting) return;
  liveAuditExporting = true;
  const button = document.querySelector("#export-audit");
  const original = button?.innerHTML;
  if (button) { button.disabled = true; button.textContent = "正在导出实盘审计…"; }
  const market = alphaExecutionConfig.defaultMarket;
  try {
    const query = new URLSearchParams({ mode: "live", format: "csv", market });
    const response = await fetch(`/api/alpha-execution/audits?${query}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) {
      let payload = null;
      try { payload = await response.json(); } catch {}
      throw new Error(executionErrorMessage(payload, "实盘审计导出失败，请稍后重试"));
    }
    if (!response.headers.get("content-type")?.includes("text/csv")) throw new Error("实盘审计返回格式异常，未生成导出文件");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `alpha-radar-live-${market}-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("服务端 LIVE 实盘审计记录已导出");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    liveAuditExporting = false;
    if (button) button.innerHTML = original;
    renderLiveSummaryMetrics();
  }
}

function setScanButtonLoading(loading) {
  const button = document.querySelector("#refresh-scan");
  if (!button) return;
  button.classList.toggle("loading", loading);
  button.disabled = loading;
  button.querySelector("span").textContent = loading ? "同步扫描…" : "刷新快照";
}

function formatScanTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("zh-CN", { hour12: false });
}

function updateScanSummary(payload) {
  const market = payload.marketBreakdown || {};
  if (scanUniverseCount) scanUniverseCount.textContent = market.total ?? "—";
  if (scanMarketMix) scanMarketMix.innerHTML = `<i class="up">${market.spot ?? 0} 现货</i> · <i>${market.perp ?? 0} 永续</i>`;
  if (scanTime) scanTime.textContent = formatScanTime(payload.scannedAt);
  if (scanNext) scanNext.textContent = `下轮 ${formatScanTime(payload.nextScanAt)}`;
  if (scanCycleLabel) scanCycleLabel.innerHTML = `<i></i>每 2 小时扫描 · 本轮候选 ${payload.shortlistSize ?? tokenUniverse.length} 个`;

  const strong = tokenUniverse.filter((token) => token.score >= 80);
  const longs = strong.filter((token) => token.bias === "long").length;
  const shorts = strong.filter((token) => token.bias === "short").length;
  const overheated = strong.filter((token) => token.signalType === "反指过热").length;
  if (strongBreakdown) strongBreakdown.innerHTML = `<i class="up">${longs} 多</i> · <i class="down">${shorts} 空</i> · <i>${overheated} 过热</i>`;
}

function scheduleAlphaScan(nextScanAt, fallbackDelay = alphaScanRefreshMs) {
  window.clearTimeout(alphaScanTimer);
  if (document.hidden) return;
  const nextTime = nextScanAt ? new Date(nextScanAt).getTime() : Number.NaN;
  const delay = Number.isFinite(nextTime) ? Math.max(60_000, nextTime - Date.now() + 5_000) : fallbackDelay;
  alphaScanTimer = window.setTimeout(() => hydrateAlphaScan(), delay);
}

function showAlphaScanError() {
  if (!alphaScanHasData && activeRankingUniverse === "anomaly") {
    rowsRoot.innerHTML = "";
    emptyState.textContent = "实时扫描暂时不可用，正在自动重连";
    emptyState.hidden = false;
    if (rankingPagination) rankingPagination.hidden = true;
    if (scanUniverseCount) scanUniverseCount.textContent = "—";
    document.querySelector("#strong-count").textContent = "—";
  }
  if (scanCycleLabel) scanCycleLabel.innerHTML = "<i></i>扫描源暂时不可用 · 5 分钟后重试";
}

async function hydrateAlphaScan({ announce = false } = {}) {
  if (alphaScanLoading || (document.hidden && !announce)) return;
  alphaScanLoading = true;
  setScanButtonLoading(true);
  window.clearTimeout(alphaScanTimer);
  try {
    const response = await fetch("/api/alpha-scan", { cache: "no-store" });
    if (!response.ok) throw new Error(`Alpha scan ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.items) || !payload.items.length) throw new Error("Alpha scan returned no candidates");
    const watched = new Set([...tokenUniverse, ...mainstreamUniverse, ...alphaMarketCapUniverse, ...alphaOpenInterestUniverse].filter((token) => token.watched).map((token) => token.symbol));
    tokenUniverse = payload.items.map((token) => ({ ...token, watched: watched.has(token.symbol) }));
    mainstreamUniverse = buildMainstreamUniverse(payload.featuredItems, watched);
    activeToken = tokenUniverse[0];
    alphaScanHasData = true;
    emptyState.textContent = "没有符合当前条件的标的";
    renderRows();
    updateScanSummary(payload);
    renderRankingModeMeta();
    renderRiskPool();
    scheduleAlphaScan(payload.nextScanAt);
    if (announce) showToast("两小时异动扫描快照已同步");
  } catch (error) {
    console.warn("Alpha scan unavailable", error);
    showAlphaScanError();
    scheduleAlphaScan(null, 5 * 60 * 1000);
    if (announce) showToast("扫描源暂时不可用，已安排重试", true);
  } finally {
    alphaScanLoading = false;
    setScanButtonLoading(false);
  }
}

function setBubbleLiveState(state, message) {
  updateSourceHealth("momentum", state);
  if (!bubbleLiveState) return;
  bubbleLiveState.className = `bubble-live-state ${state}`;
  bubbleLiveState.querySelector("span").textContent = message;
}

function formatBubbleVolume(value) {
  return new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function bubbleSizeForVolume(volume, minimumLog, maximumLog) {
  const valueLog = Math.log10(Math.max(1, Number(volume)));
  const ratio = maximumLog === minimumLog ? 0.5 : (valueLog - minimumLog) / (maximumLog - minimumLog);
  return Math.round(50 + Math.max(0, Math.min(1, ratio)) * 24);
}

function formatMomentumPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price)) return "$—";
  if (price >= 1_000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (price >= 0.01) return `$${price.toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `$${price.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function momentumCoinToDetailToken(coin, tone, index, minimumLog, maximumLog) {
  const symbol = String(coin.symbol || "").toUpperCase();
  const rank = index + 1;
  const change = Number(coin.change24h) || 0;
  const valueLog = Math.log10(Math.max(1, Number(coin.volume)));
  const volumeRatio = maximumLog === minimumLog ? 0.5 : Math.max(0, Math.min(1, (valueLog - minimumLog) / (maximumLog - minimumLog)));
  const priceMomentumScore = Math.round(Math.min(100, 55 + Math.abs(change) * 1.5));
  const volumeScore = Math.round(50 + volumeRatio * 45);
  const momentumScore = Math.round(priceMomentumScore * 0.65 + volumeScore * 0.35);
  const scannerToken = findToken(symbol);
  const hasRadarDetail = Boolean(scannerToken);
  const directionText = tone === "gain" ? "涨幅" : "跌幅";
  const directionRisk = tone === "gain" ? "短线追涨与快速回撤风险" : "下跌延续与急反弹风险";
  const priceLabel = `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
  const sourceHeadline = `${symbol} Binance 1 日${directionText} ${priceLabel}，位列 ${directionText}榜 #${rank}`;
  const volumeHeadline = `24H 成交额 $${formatBubbleVolume(coin.volume)} · 市值 $${formatBubbleVolume(coin.marketCap)}`;

  if (hasRadarDetail) {
    return {
      ...scannerToken,
      name: coin.name || scannerToken.name,
      price: formatMomentumPrice(coin.price),
      change,
      momentumRank: rank,
      momentumTone: tone,
      sourceKind: "crypto-bubbles-radar",
      detailMode: "radar",
      intentSource: "crypto-bubbles",
      detailSubtitle: `Crypto Bubbles · Binance 1D ${directionText} #${rank} · 七维雷达已覆盖`,
      detailReason: `${sourceHeadline}。该标的同时进入异动排行榜；${scannerToken.reason}`,
      headlines: [sourceHeadline, volumeHeadline, ...scannerToken.headlines].slice(0, 4),
      risks: [...scannerToken.risks, directionRisk],
      watched: scannerToken.watched || momentumWatchedSymbols.has(symbol)
    };
  }

  return {
    symbol,
    name: coin.name || symbol,
    type: "1D 动量",
    market: "spot",
    price: formatMomentumPrice(coin.price),
    change,
    volume: Number(coin.volume) || 0,
    funding: 0,
    fundingAvailable: false,
    oi: null,
    score: momentumScore,
    bias: tone === "gain" ? "long" : "short",
    signalType: `1D ${tone === "gain" ? "上行" : "下行"}动量`,
    detailSignal: tone === "gain" ? "1D MOMENTUM UP" : "1D MOMENTUM DOWN",
    reason: `${sourceHeadline}。该详情仅基于 Binance 1D 价格和成交量；资金费率、OI、爆仓、社交与媒体维度等待七维扫描补充。`,
    heat: volumeScore,
    kols: ["Crypto Bubbles", "Binance Market"],
    risks: ["仅代表 1D 动量，不构成买入或卖出信号", directionRisk, "衍生品与舆情维度待补充"],
    headlines: [sourceHeadline, volumeHeadline],
    dimensions: [priceMomentumScore, volumeScore, 50, 50, 50, 50, 50],
    dimensionAvailability: [true, true, false, false, false, false, false],
    momentumRank: rank,
    momentumTone: tone,
    sourceKind: "crypto-bubbles",
    detailMode: "momentum",
    intentSource: "crypto-bubbles",
    detailSubtitle: `Crypto Bubbles · Binance 1D ${directionText} #${rank}`,
    watched: momentumWatchedSymbols.has(symbol)
  };
}

function createMomentumCluster(title, coins, tone) {
  const cluster = document.createElement("section");
  cluster.className = `bubble-cluster ${tone === "gain" ? "gainers" : "losers"}`;
  cluster.setAttribute("aria-label", `${title}前十`);

  const heading = document.createElement("div");
  heading.className = "bubble-cluster-title";
  heading.innerHTML = `<strong>${title} TOP 10</strong><span>BINANCE · 1D</span>`;
  cluster.append(heading);

  const volumeLogs = coins.map((coin) => Math.log10(Math.max(1, Number(coin.volume))));
  const minimumLog = Math.min(...volumeLogs);
  const maximumLog = Math.max(...volumeLogs);

  coins.forEach((coin, index) => {
    const bubble = document.createElement("button");
    const change = Number(coin.change24h);
    const symbol = String(coin.symbol || "—").toUpperCase();
    const detailToken = momentumCoinToDetailToken(coin, tone, index, minimumLog, maximumLog);
    momentumDetailTokens.set(symbol, detailToken);
    bubble.type = "button";
    bubble.className = `coin-bubble ${tone}`;
    bubble.dataset.momentumSymbol = symbol;
    bubble.style.setProperty("--bubble-size", `${bubbleSizeForVolume(coin.volume, minimumLog, maximumLog)}px`);
    bubble.style.animationDelay = `${-(index * 0.47).toFixed(2)}s`;
    bubble.title = `${coin.name} · Binance ${coin.binanceSymbol} · 1D ${change >= 0 ? "+" : ""}${change.toFixed(1)}% · 24H 成交量 $${formatBubbleVolume(coin.volume)}`;
    bubble.setAttribute("aria-label", `查看 ${symbol} 1 日动量详情，${change >= 0 ? "上涨" : "下跌"} ${Math.abs(change).toFixed(1)}%`);
    bubble.innerHTML = `<strong>${escapeHtml(symbol)}</strong><span>${change >= 0 ? "+" : ""}${change.toFixed(1)}%</span><small>#${index + 1}</small>`;
    cluster.append(bubble);
  });

  return cluster;
}

function renderCryptoBubbles(payload) {
  if (!bubbleArea || payload.gainers?.length !== 10 || payload.losers?.length !== 10) {
    throw new Error("Crypto Bubbles ranking is incomplete");
  }

  momentumDetailTokens.clear();
  bubbleArea.replaceChildren(
    createMomentumCluster("涨幅", payload.gainers, "gain"),
    createMomentumCluster("跌幅", payload.losers, "loss")
  );
  cryptoBubblesHasData = true;
  latestMomentumPayload = payload;
  setBubbleLiveState("live", "实时");
  renderRiskPool();

  const sourceTime = payload.sourceUpdatedAt ? new Date(payload.sourceUpdatedAt) : new Date(payload.fetchedAt);
  if (bubbleUpdated) {
    bubbleUpdated.textContent = `更新 ${sourceTime.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })} · 每 60 秒`;
  }
}

function renderCryptoBubblesError() {
  setBubbleLiveState("error", "重连中");
  if (cryptoBubblesHasData || !bubbleArea) return;
  bubbleArea.innerHTML = '<div class="bubble-error"><strong>动量数据暂时不可用</strong><button type="button" id="bubble-retry">重新连接</button></div>';
  document.querySelector("#bubble-retry")?.addEventListener("click", hydrateCryptoBubbles);
}

async function hydrateCryptoBubbles() {
  if (cryptoBubblesLoading || document.hidden) return;
  cryptoBubblesLoading = true;
  window.clearTimeout(cryptoBubblesTimer);
  if (!cryptoBubblesHasData) setBubbleLiveState("loading", "连接中");
  try {
    const response = await fetch("/api/cryptobubbles", { cache: "no-store" });
    if (!response.ok) throw new Error(`Crypto Bubbles proxy ${response.status}`);
    renderCryptoBubbles(await response.json());
  } catch (error) {
    console.warn("Crypto Bubbles momentum feed unavailable", error);
    renderCryptoBubblesError();
  } finally {
    cryptoBubblesLoading = false;
    if (!document.hidden) cryptoBubblesTimer = window.setTimeout(hydrateCryptoBubbles, cryptoBubblesRefreshMs);
  }
}

function normalizeRiskPoolSymbol(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
}

function riskPoolIntersection(first, second) {
  return [...first].filter((symbol) => second.has(symbol)).sort();
}

function renderRiskPoolOverlap(element, symbols, ready) {
  if (!element) return;
  if (!ready) {
    element.textContent = "等待数据";
    return;
  }
  if (!symbols.length) {
    element.textContent = "暂无交集";
    return;
  }
  const visible = symbols.slice(0, 3).join(" · ");
  element.textContent = symbols.length > 3 ? `${visible} +${symbols.length - 3}` : visible;
  element.title = symbols.join(" · ");
}

function buildRiskPoolModel() {
  const scanTokens = alphaScanHasData ? tokenUniverse.slice(0, 10) : [];
  const momentumCoins = latestMomentumPayload
    ? [
        ...latestMomentumPayload.gainers.slice(0, 5).map((coin, index) => ({ ...coin, momentumTone: "gain", momentumRank: index + 1 })),
        ...latestMomentumPayload.losers.slice(0, 5).map((coin, index) => ({ ...coin, momentumTone: "loss", momentumRank: index + 1 }))
      ]
    : [];

  const scanMap = new Map(scanTokens.map((token, index) => [normalizeRiskPoolSymbol(token.symbol), { token, rank: index + 1 }]));
  const momentumMap = new Map(momentumCoins.map((coin) => [normalizeRiskPoolSymbol(coin.symbol), coin]));
  const signalMap = new Map();
  latestTelegramSignals.forEach((signal) => {
    const symbol = normalizeRiskPoolSymbol(signal.symbol);
    if (!symbol) return;
    const current = signalMap.get(symbol) || { signal, count: 0 };
    current.count += 1;
    signalMap.set(symbol, current);
  });

  const scanSet = new Set(scanMap.keys());
  const momentumSet = new Set(momentumMap.keys());
  const signalSet = new Set(signalMap.keys());
  const allSymbols = new Set([...scanSet, ...momentumSet, ...signalSet]);
  const candidates = [...allSymbols].map((symbol) => {
    const scan = scanMap.get(symbol);
    const momentum = momentumMap.get(symbol);
    const signal = signalMap.get(symbol);
    const sources = [scan && "scan", momentum && "momentum", signal && "signal"].filter(Boolean);
    return { symbol, scan, momentum, signal, sources, sourceCount: sources.length };
  }).sort((left, right) => {
    if (right.sourceCount !== left.sourceCount) return right.sourceCount - left.sourceCount;
    const leftRank = left.scan?.rank ?? 99;
    const rightRank = right.scan?.rank ?? 99;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.symbol.localeCompare(right.symbol);
  });

  return {
    ready: {
      scan: alphaScanHasData,
      momentum: Boolean(latestMomentumPayload),
      signal: latestTelegramSignals.length > 0
    },
    scanSet,
    momentumSet,
    signalSet,
    candidates
  };
}

function riskPoolPriority(candidate) {
  if (candidate.sourceCount === 3) return { className: "triple", label: "P1 三源" };
  if (candidate.sourceCount === 2) return { className: "double", label: "P2 双源" };
  return { className: "single", label: "单源观察" };
}

function riskPoolSourceNames(candidate) {
  return [candidate.scan && "异动雷达", candidate.momentum && "1D 动量", candidate.signal && "Telegram"].filter(Boolean);
}

function riskPoolSignalSummary(signal) {
  if (!signal) return "";
  const oi = formatSignalPercent(signal.oi_change_pct);
  const price = formatSignalPercent(signal.price_change_pct);
  return `Telegram 最新触发：OI ${oi} · 价格 ${price} · ${triggerTypeLabel(signal.trigger_type)}`;
}

function riskPoolCandidateToDetailToken(candidate) {
  const priority = riskPoolPriority(candidate);
  const sourceNames = riskPoolSourceNames(candidate);
  const sourceSummary = `${priority.label} · ${sourceNames.join(" + ")}`;
  const signal = candidate.signal?.signal;
  const signalSummary = riskPoolSignalSummary(signal);

  if (candidate.scan?.token) {
    const token = candidate.scan.token;
    return {
      ...token,
      sourceKind: "risk-pool-radar",
      detailMode: "radar",
      intentSource: "risk-pool",
      detailDrawerKicker: "RISK POOL DETAIL",
      detailDrawerTitle: "风控候选七维明细",
      detailSubtitle: `Alpha 雷达风控执行池 · ${sourceSummary}`,
      detailReason: `${candidate.symbol} 当前进入风控候选清单，来源为 ${sourceNames.join("、")}。${signalSummary ? `${signalSummary}。` : ""}${token.reason}`,
      headlines: [`${candidate.symbol} 进入 Alpha 雷达风控执行池 · ${sourceSummary}`, ...(signalSummary ? [signalSummary] : []), ...token.headlines].slice(0, 4),
      risks: [...new Set([...token.risks, "进入候选池不代表已通过 Risk Engine"])] ,
      rawPriceHints: [token.price, candidate.momentum?.price, signal?.price]
    };
  }

  const momentumToken = momentumDetailTokens.get(candidate.symbol);
  if (momentumToken) {
    return {
      ...momentumToken,
      sourceKind: momentumToken.sourceKind,
      detailMode: "momentum",
      intentSource: "risk-pool",
      detailDrawerKicker: "RISK POOL DETAIL",
      detailDrawerTitle: "风控候选动量明细",
      detailSubtitle: `Alpha 雷达风控执行池 · ${sourceSummary}`,
      detailReason: `${candidate.symbol} 当前进入风控候选清单，来源为 ${sourceNames.join("、")}。${signalSummary ? `${signalSummary}。` : ""}${momentumToken.reason}`,
      headlines: [`${candidate.symbol} 进入 Alpha 雷达风控执行池 · ${sourceSummary}`, ...(signalSummary ? [signalSummary] : []), ...momentumToken.headlines].slice(0, 4),
      risks: [...new Set([...momentumToken.risks, "进入候选池不代表已通过 Risk Engine"])] ,
      rawPriceHints: [momentumToken.price, candidate.momentum?.price, signal?.price]
    };
  }

  const confidence = Math.round(Math.max(0, Math.min(1, Number(signal?.confidence) || 0)) * 100);
  const priceChange = Number(signal?.price_change_pct) || 0;
  const oiChange = Number(signal?.oi_change_pct);
  const bias = signal?.direction === "long" ? "long" : signal?.direction === "short" ? "short" : "neutral";
  const parsedPrice = validCandidateNumber(signal?.price) || validCandidateNumber(lastMarketPrices.get(`${candidate.symbol}USDT`));
  const signalTime = formatSignalTimestamp(signal?.signal_time);
  const priceMomentumScore = Math.round(Math.min(100, 50 + Math.abs(priceChange) * 3));
  return {
    symbol: candidate.symbol,
    name: candidate.symbol,
    type: "Telegram OI 信号",
    market: "perp",
    price: parsedPrice ? formatMomentumPrice(parsedPrice) : "$—",
    change: priceChange,
    volume: 0,
    funding: 0,
    fundingAvailable: false,
    oi: Number.isFinite(oiChange) ? oiChange : null,
    score: confidence,
    bias,
    signalType: triggerTypeLabel(signal?.trigger_type),
    detailSignal: bias === "long" ? "LONG TRIGGER" : bias === "short" ? "SHORT TRIGGER" : "OBSERVE",
    reason: `${signalSummary || "Telegram 信号已进入候选池"}。当前仅完成消息解析，资金费率、账户多空比、爆仓、社交与媒体数据等待七维扫描补充。`,
    heat: confidence,
    kols: ["BWE OI Monitor", "Telegram"],
    risks: ["外部信号只作为交易意图触发源", "进入候选池不代表已通过 Risk Engine", "七维市场数据待补充"],
    headlines: [`${candidate.symbol} 进入 Alpha 雷达风控执行池 · ${sourceSummary}`, signalSummary || "Telegram 最新信号已解析"],
    dimensions: [priceMomentumScore, 50, 50, 50, 50, 50, 50],
    dimensionAvailability: [signal?.price_change_pct != null, false, false, false, false, false, false],
    sourceKind: "risk-pool-signal",
    detailMode: "signal",
    intentSource: "risk-pool",
    detailDrawerKicker: "RISK POOL DETAIL",
    detailDrawerTitle: "风控候选信号明细",
    detailSubtitle: `Alpha 雷达风控执行池 · ${sourceSummary}`,
    scoreLabel: "CONF",
    dimensionTitle: "已解析信号 / 七维待补充",
    dimensionWindow: "Telegram 最新触发",
    heatTitle: "解析置信度与来源",
    heatLabel: `解析置信度 ${confidence}/100`,
    kolLabel: "信号来源",
    kolMetric: "TG",
    headlineTitle: "信号数据摘要",
    headlineWindow: signalTime,
    watched: false,
    rawPriceHints: [signal?.price]
  };
}

async function openRiskPoolCandidateDetail(symbol, trigger) {
  const token = riskPoolDetailTokens.get(symbol);
  if (!token) return;
  trigger?.classList.add("loading");
  try {
    const price = await resolveCandidateReferencePrice(symbol, token.rawPriceHints || [token.price]);
    if (price) token.price = formatMomentumPrice(price);
    openDrawer(token);
  } finally {
    trigger?.classList.remove("loading");
  }
}

function renderRiskPoolCandidate(candidate) {
  const priority = riskPoolPriority(candidate);
  const tags = [];
  if (candidate.scan) tags.push(`<i class="scan">雷达 #${candidate.scan.rank}</i>`);
  if (candidate.momentum) {
    const tone = candidate.momentum.momentumTone === "gain" ? "涨" : "跌";
    tags.push(`<i class="momentum">动量${tone} #${candidate.momentum.momentumRank}</i>`);
  }
  if (candidate.signal) tags.push(`<i class="signal">TG${candidate.signal.count > 1 ? ` ×${candidate.signal.count}` : ""}</i>`);
  return `
    <button class="pool-candidate" type="button" data-pool-detail="${escapeHtml(candidate.symbol)}" aria-label="查看 ${escapeHtml(candidate.symbol)} 风控候选详情">
      <span class="token-avatar ${avatarClass(candidate.symbol)}">${escapeHtml(candidate.symbol[0] || "?")}</span>
      <div><span class="pool-candidate-line"><strong>${escapeHtml(candidate.symbol)}</strong><em class="pool-priority ${priority.className}">${priority.label}</em></span><span class="pool-source-tags">${tags.join("")}</span></div>
      <span class="pool-source-count"><strong>${candidate.sourceCount}</strong><span>来源 · 查看 ›</span></span>
    </button>`;
}

function renderRiskPool() {
  if (!poolCandidateList) return;
  const model = buildRiskPoolModel();
  riskPoolDetailTokens.clear();
  model.candidates.forEach((candidate) => riskPoolDetailTokens.set(candidate.symbol, riskPoolCandidateToDetailToken(candidate)));
  const readyCount = Object.values(model.ready).filter(Boolean).length;
  const allReady = readyCount === 3;
  const scanMomentum = riskPoolIntersection(model.scanSet, model.momentumSet);
  const scanSignal = riskPoolIntersection(model.scanSet, model.signalSet);
  const momentumSignal = riskPoolIntersection(model.momentumSet, model.signalSet);
  const triple = scanMomentum.filter((symbol) => model.signalSet.has(symbol));
  const resonanceCount = model.candidates.filter((candidate) => candidate.sourceCount >= 2).length;

  riskPoolScanCount.textContent = model.ready.scan ? model.scanSet.size : "—";
  riskPoolMomentumCount.textContent = model.ready.momentum ? model.momentumSet.size : "—";
  riskPoolSignalCount.textContent = model.ready.signal ? model.signalSet.size : "—";
  riskPoolResonanceCount.textContent = allReady ? resonanceCount : "—";
  vennScanCount.textContent = model.ready.scan ? model.scanSet.size : "—";
  vennMomentumCount.textContent = model.ready.momentum ? model.momentumSet.size : "—";
  vennSignalCount.textContent = model.ready.signal ? model.signalSet.size : "—";
  riskPoolTotal.textContent = model.candidates.length || "—";
  riskPoolState.textContent = allReady
    ? radarText("三路实时 · 已去重", "Three sources live · deduplicated")
    : radarText(`已连接 ${readyCount} / 3 路`, `${readyCount} / 3 sources connected`);

  renderRiskPoolOverlap(overlapScanMomentum, scanMomentum, model.ready.scan && model.ready.momentum);
  renderRiskPoolOverlap(overlapScanSignal, scanSignal, model.ready.scan && model.ready.signal);
  renderRiskPoolOverlap(overlapMomentumSignal, momentumSignal, model.ready.momentum && model.ready.signal);
  overlapAll.textContent = allReady ? triple.length : "—";
  overlapAllSymbols.textContent = !allReady ? "等待三路数据" : triple.length ? triple.slice(0, 4).join(" · ") : "暂无三源交集";
  overlapAllSymbols.title = triple.join(" · ");

  const visibleCandidates = model.candidates.filter((candidate) => {
    if (activeRiskPoolFilter === "triple") return candidate.sourceCount === 3;
    if (activeRiskPoolFilter === "double") return candidate.sourceCount === 2;
    if (activeRiskPoolFilter === "single") return candidate.sourceCount === 1;
    return true;
  });
  poolVisibleCount.textContent = `${visibleCandidates.length} 个`;

  if (!model.candidates.length) {
    poolCandidateList.innerHTML = '<div class="pool-loading"><i></i><strong>正在汇聚实时候选</strong><span>Radar · Momentum · Telegram</span></div>';
    return;
  }
  poolCandidateList.innerHTML = visibleCandidates.length
    ? visibleCandidates.map(renderRiskPoolCandidate).join("")
    : '<div class="pool-empty"><strong>当前筛选暂无候选</strong><span>切换其他来源层级查看</span></div>';
}

function setMarketFeedStatus(state, message) {
  if (!marketFeedStatus) return;
  marketFeedStatus.classList.remove("connecting", "error");
  if (state !== "live") marketFeedStatus.classList.add(state);
  marketFeedStatus.querySelector("span").textContent = message;
}

function formatMarketPrice(symbol, value) {
  const decimals = marketPriceDecimals[symbol] ?? 2;
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

function prepareMarketTape() {
  const track = document.querySelector("#market-tape-track");
  const sourceGroup = track?.querySelector(".market-tape-group");
  if (!track || !sourceGroup || track.children.length > 1) return;
  const clone = sourceGroup.cloneNode(true);
  clone.setAttribute("aria-hidden", "true");
  track.append(clone);
}

function formatRankingUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: amount >= 1_000_000_000 ? 2 : 1 }).format(amount)}`;
}

function alphaListDetailToken(item, listKind, watchedSymbols) {
  const marketCap = Number(item.marketCap);
  const openInterestUsd = Number(item.openInterestUsd);
  const marketCapLabel = formatRankingUsd(marketCap);
  const openInterestLabel = formatRankingUsd(openInterestUsd);
  const chainLabel = item.chainName || item.chainId || "—";
  const isMarketCap = listKind === "market-cap";
  return {
    symbol: String(item.symbol || "—").toUpperCase(),
    name: item.name || item.symbol,
    type: radarText("Alpha 合约交集", "Alpha-perpetual match"),
    market: "perp",
    price: formatMomentumPrice(item.price),
    change: Number.isFinite(Number(item.change24h)) ? Number(item.change24h) : null,
    volume: null,
    funding: Number.isFinite(Number(item.funding)) ? Number(item.funding) : null,
    fundingAvailable: Number.isFinite(Number(item.funding)),
    oi: null,
    score: null,
    bias: "neutral",
    signalType: radarText("结构筛选", "Screened universe"),
    watched: watchedSymbols.has(String(item.symbol || "").toUpperCase()),
    dimensions: Array(7).fill(null),
    dimensionAvailability: Array(7).fill(false),
    reason: isMarketCap
      ? radarText(`该标的已上 Binance Alpha、未上 Binance 现货且已上 U 本位永续；当前市值 ${marketCapLabel}，清单按市值从小到大排序。`, `Listed on Binance Alpha and USDⓈ-M perpetuals, but not Binance Spot. Current market cap is ${marketCapLabel}; this list is sorted smallest first.`)
      : radarText(`该标的已上 Binance Alpha、未上 Binance 现货且已上 U 本位永续；当前合约持仓名义价值 ${openInterestLabel}。`, `Listed on Binance Alpha and USDⓈ-M perpetuals, but not Binance Spot. Current futures open-interest notional is ${openInterestLabel}.`),
    detailMode: "alpha-list",
    sourceKind: "binance-alpha-list",
    detailDrawerKicker: isMarketCap ? "BINANCE ALPHA · SMALL CAP TOP 20" : "BINANCE ALPHA · OPEN INTEREST TOP 20",
    detailDrawerTitle: radarText("Alpha 合约交集详情", "Alpha-perpetual match details"),
    detailSubtitle: `${chainLabel} · ${item.futureSymbol || `${item.symbol}USDT`} · ${radarText("仅研究筛选", "Research screen only")}`,
    detailSignal: "ALPHA × PERP · NO SPOT",
    dimensionTitle: radarText("清单筛选条件", "List eligibility"),
    dimensionWindow: radarText("Binance Skills Hub · 每两小时刷新", "Binance Skills Hub · refreshed every 2 hours"),
    heatTitle: radarText("数据来源与口径", "Sources and methodology"),
    heatLabel: radarText("Alpha、现货与永续元数据实时交叉验证", "Cross-checked Alpha, Spot and perpetual metadata"),
    headlineTitle: radarText("清单数据摘要", "List data summary"),
    headlineWindow: radarText("当前实时快照", "Current live snapshot"),
    kolLabel: radarText("数据来源", "Data sources"),
    kolMetric: "2H",
    heat: null,
    kols: ["Binance Skills Hub", "Binance USDⓈ-M Futures"],
    risks: [
      radarText("清单仅表示上市结构与排序，不构成买入或卖出信号", "The list reflects listing structure and ranking only, not a buy or sell signal"),
      radarText("小市值与高持仓合约都可能伴随高波动和流动性风险", "Small-cap and high-OI contracts may carry elevated volatility and liquidity risk"),
      radarText("任何交易意图仍须经过风控审批", "Any trade intent must still pass risk approval")
    ],
    headlines: [
      `${radarText("市值", "Market cap")} ${marketCapLabel} · ${radarText("合约持仓", "Futures OI")} ${openInterestLabel}`,
      `${radarText("链", "Chain")} ${chainLabel} · ${radarText("合约地址", "Contract")} ${item.contractAddress || "—"}`
    ],
    marketCap: Number.isFinite(marketCap) ? marketCap : null,
    openInterestUsd: Number.isFinite(openInterestUsd) ? openInterestUsd : null,
    chainName: chainLabel,
    contractAddress: item.contractAddress || "",
    futureSymbol: item.futureSymbol || `${item.symbol}USDT`,
    listKind
  };
}

function scheduleAlphaLists(nextRefreshAt) {
  window.clearTimeout(alphaListsTimer);
  if (document.hidden) return;
  const next = nextRefreshAt ? new Date(nextRefreshAt).getTime() : Number.NaN;
  const delay = Number.isFinite(next) ? Math.max(60_000, next - Date.now() + 5_000) : alphaScanRefreshMs;
  alphaListsTimer = window.setTimeout(() => hydrateBinanceAlphaLists(), delay);
}

function setAlphaListsLoading(loading) {
  if (!refreshAlphaLists) return;
  refreshAlphaLists.disabled = loading;
  refreshAlphaLists.classList.toggle("loading", loading);
  const label = refreshAlphaLists.querySelector("span");
  if (label) label.textContent = loading ? radarText("同步中…", "Syncing…") : radarText("实时刷新", "Refresh now");
}

async function hydrateBinanceAlphaLists({ force = false, announce = false } = {}) {
  if (alphaListsLoading || (document.hidden && !force)) return;
  alphaListsLoading = true;
  setAlphaListsLoading(true);
  window.clearTimeout(alphaListsTimer);
  try {
    const query = force ? `?refresh=${Date.now()}` : "";
    const response = await fetch(`/api/binance-alpha-lists${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Binance Alpha lists ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.marketCapItems) || !Array.isArray(payload.openInterestItems)) throw new Error("Binance Alpha lists returned an invalid payload");
    const watched = new Set([...tokenUniverse, ...mainstreamUniverse, ...alphaMarketCapUniverse, ...alphaOpenInterestUniverse].filter((token) => token.watched).map((token) => token.symbol));
    alphaMarketCapUniverse = payload.marketCapItems.map((item) => alphaListDetailToken(item, "market-cap", watched));
    alphaOpenInterestUniverse = payload.openInterestItems.map((item) => alphaListDetailToken(item, "open-interest", watched));
    alphaListsMeta = payload;
    updateSourceHealth("alpha", payload.stale ? "cached" : "live", Date.parse(payload.refreshedAt) || Date.now());
    if (alphaMarketCapCount) alphaMarketCapCount.textContent = alphaMarketCapUniverse.length;
    if (alphaOpenInterestCount) alphaOpenInterestCount.textContent = alphaOpenInterestUniverse.length;
    if (activeRankingUniverse.startsWith("alpha-")) renderRows();
    scheduleAlphaLists(payload.nextRefreshAt);
    if (announce) showToast(radarText("Binance Alpha 两份清单已实时刷新", "Both Binance Alpha lists are now refreshed"));
  } catch (error) {
    console.warn("Binance Alpha lists unavailable", error);
    updateSourceHealth("alpha", "error");
    scheduleAlphaLists(null);
    if (announce) showToast(radarText("Alpha 清单暂时不可用，已安排自动重试", "Alpha lists are temporarily unavailable; retry scheduled"), true);
  } finally {
    alphaListsLoading = false;
    setAlphaListsLoading(false);
  }
}

function prepareSourceTape() {
  const track = document.querySelector("#source-tape-track");
  const sourceGroup = track?.querySelector(".source-tape-group");
  if (!track || !sourceGroup || track.children.length > 1) return;
  const clone = sourceGroup.cloneNode(true);
  clone.setAttribute("aria-hidden", "true");
  track.append(clone);
}

function applyMarketTicker(ticker) {
  const symbol = ticker.s || ticker.symbol;
  if (!trackedMarketSymbols.includes(symbol)) return;
  const price = Number(ticker.c ?? ticker.lastPrice);
  const change = Number(ticker.P ?? ticker.priceChangePercent);
  if (!Number.isFinite(price) || !Number.isFinite(change)) return;
  updateSourceHealth(futuresMarketSymbols.includes(symbol) ? "futures" : "spot");

  const priceElements = document.querySelectorAll(`[data-market-price="${symbol}"]`);
  const changeElements = document.querySelectorAll(`[data-market-change="${symbol}"]`);
  const previousPrice = lastMarketPrices.get(symbol);
  priceElements.forEach((priceElement) => {
    priceElement.textContent = formatMarketPrice(symbol, price);
    priceElement.classList.remove("tick-up", "tick-down");
    if (Number.isFinite(previousPrice) && price !== previousPrice) {
      requestAnimationFrame(() => priceElement.classList.add(price > previousPrice ? "tick-up" : "tick-down"));
      window.setTimeout(() => priceElement.classList.remove("tick-up", "tick-down"), 360);
    }
  });
  changeElements.forEach((changeElement) => {
    changeElement.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
    changeElement.className = change > 0 ? "up" : change < 0 ? "down" : "";
  });
  lastMarketPrices.set(symbol, price);
  const featuredToken = mainstreamUniverse.find((token) => `${token.symbol}USDT` === symbol);
  if (featuredToken) {
    featuredToken.price = formatMarketPrice(symbol, price);
    featuredToken.change = Number(change.toFixed(2));
    const rankingChange = document.querySelector(`[data-ranking-change="${featuredToken.symbol}"]`);
    if (rankingChange) {
      rankingChange.textContent = `${featuredToken.change >= 0 ? "+" : ""}${featuredToken.change.toFixed(1)}%`;
      rankingChange.className = featuredToken.change >= 0 ? "up" : "down";
    }
    if (activeToken === featuredToken && drawer?.classList.contains("open")) {
      document.querySelector("#detail-price").textContent = featuredToken.price;
      const detailChange = document.querySelector("#detail-change");
      detailChange.textContent = `${featuredToken.change >= 0 ? "+" : ""}${featuredToken.change.toFixed(1)}%`;
      detailChange.className = featuredToken.change >= 0 ? "up" : "down";
    }
  }
  updatePaperPositionsFromMarket(symbol, price);

  const now = Date.now();
  if (now - lastMarketStatusUpdate > 900) {
    lastMarketStatusUpdate = now;
    setMarketFeedStatus("live", `实时 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
  }
}

async function hydrateMarketSnapshot() {
  if (document.hidden) return;
  const symbols = encodeURIComponent(JSON.stringify(spotMarketSymbols));
  const requests = [
    fetch(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${symbols}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Binance spot snapshot ${response.status}`);
        return response.json();
      }),
    fetch("https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=HYPEUSDT", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Binance futures snapshot ${response.status}`);
        return response.json();
      })
  ];
  const results = await Promise.allSettled(requests);
  let receivedSnapshot = false;
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    const tickers = Array.isArray(result.value) ? result.value : [result.value];
    tickers.forEach(applyMarketTicker);
    receivedSnapshot = true;
  });
  if (!receivedSnapshot && lastMarketPrices.size === 0) setMarketFeedStatus("error", "行情重连中…");
}

function scheduleMarketReconnect() {
  window.clearTimeout(marketReconnectTimer);
  if (document.hidden) return;
  marketReconnectAttempts += 1;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(5, marketReconnectAttempts - 1));
  setMarketFeedStatus("error", `行情重连中 · ${Math.ceil(delay / 1000)}s`);
  marketReconnectTimer = window.setTimeout(connectMarketFeed, delay);
}

function connectMarketFeed() {
  window.clearTimeout(marketReconnectTimer);
  if (marketSocket && (marketSocket.readyState === WebSocket.OPEN || marketSocket.readyState === WebSocket.CONNECTING)) return;
  setMarketFeedStatus("connecting", "连接实时行情…");
  const streams = spotMarketSymbols.map((symbol) => `${symbol.toLowerCase()}@ticker`).join("/");
  marketSocket = new WebSocket(`wss://data-stream.binance.vision:443/stream?streams=${streams}`);

  marketSocket.addEventListener("open", () => {
    marketReconnectAttempts = 0;
    setMarketFeedStatus("live", "实时行情 · 已连接");
  });
  marketSocket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      applyMarketTicker(payload.data || payload);
    } catch (error) {
      // Ignore malformed frames; the next 1-second ticker frame will refresh the UI.
    }
  });
  marketSocket.addEventListener("error", () => {
    if (marketSocket) marketSocket.close();
  });
  marketSocket.addEventListener("close", () => {
    marketSocket = null;
    scheduleMarketReconnect();
  });
}

function scheduleFuturesMarketReconnect() {
  window.clearTimeout(futuresReconnectTimer);
  if (document.hidden) return;
  futuresReconnectAttempts += 1;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(5, futuresReconnectAttempts - 1));
  if (marketSocket?.readyState === WebSocket.OPEN) setMarketFeedStatus("connecting", "现货实时 · HYPE 重连中");
  futuresReconnectTimer = window.setTimeout(connectFuturesMarketFeed, delay);
}

function connectFuturesMarketFeed() {
  window.clearTimeout(futuresReconnectTimer);
  if (futuresMarketSocket && (futuresMarketSocket.readyState === WebSocket.OPEN || futuresMarketSocket.readyState === WebSocket.CONNECTING)) return;
  futuresMarketSocket = new WebSocket("wss://fstream.binance.com/stream?streams=hypeusdt@ticker");

  futuresMarketSocket.addEventListener("open", () => {
    futuresReconnectAttempts = 0;
    if (marketSocket?.readyState === WebSocket.OPEN) setMarketFeedStatus("live", "实时行情 · 已连接");
  });
  futuresMarketSocket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      applyMarketTicker(payload.data || payload);
    } catch (error) {
      // Ignore malformed frames; the next ticker frame will refresh HYPE.
    }
  });
  futuresMarketSocket.addEventListener("error", () => {
    if (futuresMarketSocket) futuresMarketSocket.close();
  });
  futuresMarketSocket.addEventListener("close", () => {
    futuresMarketSocket = null;
    scheduleFuturesMarketReconnect();
  });
}

function startMarketFeed() {
  prepareMarketTape();
  prepareSourceTape();
  hydrateMarketSnapshot();
  connectMarketFeed();
  connectFuturesMarketFeed();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function radarText(zh, en) {
  return platformLang === "en" ? en : zh;
}

function boxSourceLabel(mode) {
  if (mode === "crypto-risk-pool") return radarText("Alpha 雷达风控候选清单", "Alpha Radar risk candidates");
  if (mode === "crypto-radar") return radarText("α-RadarTP 异动排行榜", "α-RadarTP anomaly ranking");
  if (mode === "crypto-mainstream") return radarText("α-RadarTP 热门精选主流", "α-RadarTP featured majors");
  if (mode === "crypto-alpha-market-cap") return radarText("Binance Skills Hub Alpha 小市值", "Binance Skills Hub Alpha small cap");
  if (mode === "crypto-alpha-open-interest") return radarText("Binance Skills Hub Alpha 持仓量", "Binance Skills Hub Alpha open interest");
  return radarText("Binance 永续涨幅 TOP 30", "Binance futures top 30 gainers");
}

function boxStatusLabel(candidate) {
  if (candidate.score >= 85) return radarText("达标关注", "Qualified");
  if (candidate.score >= 70) return radarText("突破观察", "Breakout watch");
  if (candidate.score >= 50) return radarText("观察", "Watch");
  return radarText("箱内 / 排除", "Inside box / excluded");
}

function boxConditionLabel(condition) {
  const labels = {
    volume: ["倍量启动", "Volume expansion"],
    tests: ["上沿试盘", "Upper-bound tests"],
    momentum: ["24 小时涨幅强度", "24h momentum"],
    theme: ["热点题材", "Theme momentum"],
    flow: ["资金与控盘", "Flow and control"]
  };
  const value = labels[condition.key] || [condition.label || "评分项", condition.key || "Condition"];
  return radarText(value[0], value[1]);
}

function boxConditionDetail(condition, candidate) {
  if (platformLang !== "en") return condition.detail || "—";
  if (condition.key === "volume") return `${candidate.volume?.days || 0} consecutive days · ${Number(candidate.volume?.ratio || 0).toFixed(2)}× current ratio`;
  if (condition.key === "tests") return `${candidate.box?.tests || 0} verified upper-bound tests`;
  if (condition.key === "momentum") return `${Number(candidate.quote?.changePct || 0) >= 0 ? "+" : ""}${Number(candidate.quote?.changePct || 0).toFixed(2)}% over 24h`;
  return `${condition.points || 0} / ${condition.maximum || 0}`;
}

function boxDisplayCandidates() {
  const source = Array.isArray(boxBreakoutState?.crypto) ? boxBreakoutState.crypto : [];
  const search = String(boxSearch?.value || "").trim().toUpperCase();
  const filter = boxFilter?.value || "all";
  const sort = boxSort?.value || "change";
  return source.filter((candidate) => {
    if (search && !`${candidate.symbol} ${candidate.name}`.toUpperCase().includes(search)) return false;
    if (filter === "qualified" && !candidate.qualified) return false;
    if (filter === "watch" && candidate.score < 70) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "score") return Number(b.score) - Number(a.score);
    if (sort === "volume") return Number(b.volume?.ratio || 0) - Number(a.volume?.ratio || 0);
    return Number(b.quote?.changePct || 0) - Number(a.quote?.changePct || 0);
  });
}

function formatBoxPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price)) return "—";
  const digits = price >= 100 ? 2 : price >= 1 ? 4 : 6;
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}

function boxConditionPercent(candidate, key) {
  const condition = (candidate.conditions || []).find((item) => item.key === key);
  const points = Number(condition?.points);
  const maximum = Number(condition?.maximum);
  return Number.isFinite(points) && maximum > 0 ? Math.round(Math.max(0, Math.min(100, points / maximum * 100))) : null;
}

function boxCandidateDetailToken(candidate) {
  const symbol = String(candidate.symbol || "").replace(/USDT$/i, "").toUpperCase();
  const quote = boxQuotes.get(candidate.symbol) || candidate.quote || {};
  const existing = findToken(symbol)
    || alphaMarketCapUniverse.find((token) => token.symbol === symbol)
    || alphaOpenInterestUniverse.find((token) => token.symbol === symbol);
  const dimensions = Array.isArray(existing?.dimensions) ? [...existing.dimensions] : Array(7).fill(null);
  const volumeScore = boxConditionPercent(candidate, "volume");
  const momentumScore = boxConditionPercent(candidate, "momentum");
  if (momentumScore != null) dimensions[0] = momentumScore;
  if (volumeScore != null) dimensions[1] = volumeScore;
  const availability = dimensions.map((value) => value != null && Number.isFinite(Number(value)));
  const source = boxSourceLabel(boxBreakoutState?.cryptoSourceMode || "crypto");
  const boxSummary = candidate.box
    ? `${radarText("箱体", "Box")} ${formatBoxPrice(candidate.box.low)} — ${formatBoxPrice(candidate.box.high)} · ${radarText("位置", "Position")} ${Number(candidate.box.positionPct || 0).toFixed(1)}% · ${radarText("上沿试盘", "Upper tests")} ${candidate.box.tests || 0}`
    : radarText("当前尚未形成有效箱体", "No valid box is currently formed");
  return {
    ...(existing || {}),
    symbol,
    name: candidate.name || symbol,
    type: radarText("箱体突破候选", "Box-breakout candidate"),
    market: "perp",
    price: formatBoxPrice(quote.price),
    change: Number.isFinite(Number(quote.changePct)) ? Number(quote.changePct) : null,
    score: Number(candidate.score || 0),
    scoreLabel: "BOX",
    bias: "neutral",
    signalType: boxStatusLabel(candidate),
    watched: Boolean(existing?.watched),
    dimensions,
    dimensionAvailability: availability,
    reason: radarText(`该标的来自${source}；箱体评分 ${Number(candidate.score || 0)}/100。${boxSummary}。方向保持中性，须由用户明确选择后才能送入风控审批。`, `This candidate comes from ${source} with a box score of ${Number(candidate.score || 0)}/100. ${boxSummary}. Direction remains neutral until explicitly selected for risk approval.`),
    heat: existing?.heat ?? null,
    kols: [radarText("箱体突破扫描", "Box breakout scan"), source],
    risks: [
      radarText("箱体突破可能出现假突破与快速回落", "Box breakouts may fail and reverse quickly"),
      ...(candidate.dataWarnings || []).slice(0, 2),
      radarText("送审前必须人工选择方向，仍须经过 Risk Engine", "Choose a direction manually; Risk Engine approval is still required")
    ],
    headlines: [
      `${radarText("箱体评分", "Box score")} ${Number(candidate.score || 0)}/100 · ${boxStatusLabel(candidate)}`,
      boxSummary,
      `${radarText("24 小时涨跌", "24h change")} ${Number(quote.changePct || 0) >= 0 ? "+" : ""}${Number(quote.changePct || 0).toFixed(2)}% · ${radarText("量比", "Volume ratio")} ${Number(candidate.volume?.ratio || 0).toFixed(2)}×`
    ],
    intentSource: "alpha-radar",
    sourceKind: "box-breakout",
    detailDrawerKicker: "BOX BREAKOUT · 7D DETAIL",
    detailDrawerTitle: radarText("箱体突破七维信号明细", "Box-breakout seven-dimension detail"),
    detailSubtitle: `${source} · Binance USDT ${radarText("永续", "perpetual")}`,
    dimensionTitle: radarText("七维信号与箱体评分", "Seven dimensions and box score"),
    dimensionWindow: radarText("箱体日线 · 七维实时快照", "Daily box · live seven-dimension snapshot"),
    detailReason: radarText("箱体评分只覆盖价格、成交与结构条件；缺失的七维数据会明确标记，不使用模拟值。", "Box scoring covers price, volume and structure only. Missing dimensions are explicitly marked and never simulated."),
    headlineTitle: radarText("箱体扫描摘要", "Box scan summary"),
    headlineWindow: radarText("当前扫描快照", "Current scan snapshot"),
    kolLabel: radarText("数据来源", "Data sources"),
    kolMetric: `${availability.filter(Boolean).length}/7`
  };
}

function renderBoxCandidate(candidate) {
  const quote = boxQuotes.get(candidate.symbol) || candidate.quote || {};
  const change = Number(quote.changePct || 0);
  const warnings = Array.isArray(candidate.dataWarnings) ? candidate.dataWarnings.length : 0;
  const conditions = Array.isArray(candidate.conditions) ? candidate.conditions.slice(0, 3) : [];
  return `<article class="alpha-box-card">
    <header><div><small>${escapeHtml(String(candidate.symbol || "").replace(/USDT$/i, ""))} / USDT</small><h3>${escapeHtml(candidate.name || String(candidate.symbol || "").replace(/USDT$/i, ""))}</h3></div><strong>${Number(candidate.score || 0)}<em>/100</em></strong></header>
    <div class="alpha-box-quote"><b>${formatBoxPrice(quote.price)}</b><span class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "+" : ""}${change.toFixed(2)}%</span><em>${boxStatusLabel(candidate)}</em></div>
    <canvas class="alpha-box-chart" data-box-chart="${escapeHtml(candidate.symbol)}" width="520" height="150" aria-label="${escapeHtml(candidate.symbol)} ${radarText("日线箱体图", "daily box chart")}"></canvas>
    <div class="alpha-box-conditions">${conditions.map((condition) => `<div class="${condition.passed ? "passed" : ""}"><span>${escapeHtml(boxConditionLabel(condition))}<b>${Number(condition.points || 0)} / ${Number(condition.maximum || 0)}</b></span><small>${escapeHtml(boxConditionDetail(condition, candidate))}</small></div>`).join("")}</div>
    <footer><span>${candidate.box ? `${radarText("箱体位置", "Box position")} ${Number(candidate.box.positionPct || 0).toFixed(1)}% · ${radarText("试盘", "Tests")} ${candidate.box.tests || 0}` : radarText("尚未形成有效箱体", "No valid box yet")}</span><div class="alpha-box-card-actions"><button type="button" data-box-detail="${escapeHtml(candidate.symbol)}">${radarText("七维明细", "7D detail")}</button><button type="button" data-box-expand="${escapeHtml(candidate.symbol)}">${radarText("展开图表", "Expand chart")}</button><a href="/box-breakout" target="_top">${radarText("完整复盘", "Full review")} ↗</a></div></footer>
    ${warnings ? `<p class="alpha-box-warning">${radarText(`${warnings} 项数据说明`, `${warnings} data note${warnings === 1 ? "" : "s"}`)}</p>` : ""}
  </article>`;
}

function renderBoxBreakout() {
  if (!boxResults) return;
  const candidates = Array.isArray(boxBreakoutState?.crypto) ? boxBreakoutState.crypto : [];
  const visible = boxDisplayCandidates();
  const qualified = candidates.filter((candidate) => candidate.qualified).length;
  const watch = candidates.filter((candidate) => candidate.score >= 70 && candidate.score < 85).length;
  const mode = boxBreakoutState?.cryptoSourceMode || "crypto";
  document.querySelector("#alpha-box-total").textContent = candidates.length.toLocaleString();
  document.querySelector("#alpha-box-qualified").textContent = qualified.toLocaleString();
  document.querySelector("#alpha-box-watch").textContent = watch.toLocaleString();
  document.querySelector("#alpha-box-source").textContent = boxSourceLabel(mode);
  document.querySelector("#alpha-box-visible-count").textContent = radarText(`${visible.length} 个结果`, `${visible.length} results`);
  document.querySelector("#alpha-box-pool-title").textContent = mode === "crypto-radar"
    ? radarText("α-RadarTP 异动机会池", "α-RadarTP anomaly opportunities")
    : mode === "crypto-mainstream"
      ? radarText("α-RadarTP 主流机会池", "α-RadarTP major opportunities")
      : mode === "crypto-risk-pool"
        ? radarText("雷达执行池箱体机会", "Radar risk-pool box opportunities")
        : mode === "crypto-alpha-market-cap"
          ? radarText("Alpha 小市值箱体机会", "Alpha small-cap box opportunities")
          : mode === "crypto-alpha-open-interest"
            ? radarText("Alpha 持仓量箱体机会", "Alpha open-interest box opportunities")
            : radarText("加密涨幅机会池", "Crypto gainer opportunities");
  const updated = boxBreakoutState?.asOf ? new Date(boxBreakoutState.asOf) : null;
  document.querySelector("#alpha-box-updated").textContent = updated && !Number.isNaN(updated.getTime())
    ? updated.toLocaleString(platformLang === "en" ? "en-GB" : "zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

  const job = boxBreakoutState?.job;
  const cryptoJob = job && ["crypto", "crypto-radar", "crypto-mainstream", "crypto-risk-pool", "crypto-alpha-market-cap", "crypto-alpha-open-interest"].includes(job.mode);
  boxJob.hidden = !cryptoJob;
  if (cryptoJob) {
    const jobState = { queued: ["排队中", "Queued"], running: ["进行中", "Running"], complete: ["已完成", "Complete"], cancelled: ["已取消", "Cancelled"], failed: ["失败", "Failed"] }[job.status] || [job.status, job.status];
    boxJobLabel.textContent = `${boxSourceLabel(job.mode)} · ${radarText(jobState[0], jobState[1])}`;
    boxJobCount.textContent = `${Number(job.processed || 0)} / ${Number(job.total || 0)}`;
    boxProgress.max = Math.max(Number(job.total || 0), 1);
    boxProgress.value = Number(job.processed || 0);
    boxJobLog.textContent = platformLang === "en" ? radarText("", "Background scan state is synced from the full dashboard.") : (job.logs?.at(-1) || "正在准备行情源…");
  }

  boxScanButtons.forEach((button) => {
    const running = job && ["queued", "running"].includes(job.status);
    button.disabled = boxBreakoutLoading || running || !boxBreakoutState?.signedIn;
    button.classList.toggle("active", button.dataset.boxScan === mode);
  });

  if (!boxBreakoutState?.signedIn) {
    boxNotice.hidden = false;
    boxNotice.innerHTML = `${radarText("登录并完成账户验证后，可启动独立后台扫描；已有快照仍可在此查看。", "Sign in and complete account verification to start a persistent scan. Existing snapshots remain available here.")} <a href="/login?next=%2Falpha-radar" target="_top">${radarText("登录 / 注册", "Sign in / register")} ↗</a>`;
  } else if (boxBreakoutState.error) {
    boxNotice.hidden = false;
    boxNotice.textContent = boxBreakoutState.error;
  } else {
    boxNotice.hidden = true;
    boxNotice.textContent = "";
  }

  boxResults.innerHTML = visible.length
    ? visible.slice(0, 12).map(renderBoxCandidate).join("")
    : `<div class="alpha-box-empty"><i aria-hidden="true">◎</i><strong>${radarText(candidates.length ? "当前筛选暂无结果" : "等待加密市场扫描", candidates.length ? "No results match this filter" : "Ready for a crypto scan")}</strong><span>${radarText(candidates.length ? "调整筛选条件查看完整扫描结果。" : "选择一种真实数据源，扫描任务会在后台持续完成。", candidates.length ? "Change the filter to inspect the complete scan." : "Choose a live source; the scan continues safely in the background.")}</span></div>`;
  hydrateBoxCharts();
  scheduleBoxQuoteRefresh();
}

function boxChartColor(name, fallback) {
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
}

function drawBoxChart(canvas, bars, box, { expanded = false } = {}) {
  const context = canvas.getContext("2d");
  if (!context || !Array.isArray(bars) || !bars.length) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 520;
  const height = canvas.clientHeight || 150;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const shown = bars.slice(expanded ? -160 : -64);
  const low = Math.min(...shown.map((bar) => Number(bar.low)));
  const high = Math.max(...shown.map((bar) => Number(bar.high)));
  const range = Math.max(high - low, high * 0.002, 0.000001);
  const xStep = width / shown.length;
  const y = (value) => 8 + (high - Number(value)) / range * (height - 22);
  context.strokeStyle = boxChartColor("--box-chart-grid", "rgba(126, 164, 222, .12)");
  context.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((part) => { context.beginPath(); context.moveTo(0, height * part); context.lineTo(width, height * part); context.stroke(); });
  if (box) {
    context.fillStyle = boxChartColor("--box-chart-zone", "rgba(132, 164, 255, .07)");
    context.fillRect(0, y(box.high), width, Math.max(1, y(box.low) - y(box.high)));
    context.setLineDash([4, 4]);
    context.strokeStyle = boxChartColor("--box-chart-boundary", "rgba(244, 196, 93, .62)");
    [box.high, box.low].forEach((value) => { context.beginPath(); context.moveTo(0, y(value)); context.lineTo(width, y(value)); context.stroke(); });
    context.setLineDash([]);
  }
  shown.forEach((bar, index) => {
    const x = index * xStep + xStep / 2;
    const rising = Number(bar.close) >= Number(bar.open);
    context.strokeStyle = rising ? boxChartColor("--box-chart-up", "#75ddb1") : boxChartColor("--box-chart-down", "#ee8d94");
    context.fillStyle = context.strokeStyle;
    context.beginPath(); context.moveTo(x, y(bar.high)); context.lineTo(x, y(bar.low)); context.stroke();
    const top = Math.min(y(bar.open), y(bar.close));
    context.fillRect(x - Math.max(1, xStep * 0.26), top, Math.max(2, xStep * 0.52), Math.max(1, Math.abs(y(bar.open) - y(bar.close))));
  });
  if (expanded) {
    context.fillStyle = boxChartColor("--box-chart-label", "#91a4bd");
    context.font = "12px ui-monospace, SFMono-Regular, Consolas, monospace";
    context.textAlign = "right";
    context.fillText(formatBoxPrice(high), width - 12, 18);
    context.fillText(formatBoxPrice(low), width - 12, height - 8);
    if (box) {
      context.textAlign = "left";
      context.fillText(`${radarText("箱顶", "Top")} ${formatBoxPrice(box.high)}`, 12, Math.max(18, y(box.high) - 7));
      context.fillText(`${radarText("箱底", "Bottom")} ${formatBoxPrice(box.low)}`, 12, Math.min(height - 8, y(box.low) + 15));
    }
  }
}

async function boxChartBars(symbol) {
  const cached = boxChartCache.get(symbol);
  if (cached && Date.now() - cached.at < 60_000) return cached.bars;
  const response = await fetch(`/api/box-breakout/chart?market=crypto&symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || radarText("图表数据暂不可用", "Chart data is unavailable"));
  boxChartCache.set(symbol, { at: Date.now(), bars: payload.bars });
  return payload.bars;
}

async function openBoxChart(symbol) {
  const candidate = (boxBreakoutState?.crypto || []).find((item) => item.symbol === symbol);
  if (!candidate || !boxChartDialog || !boxExpandedChart) return;
  const quote = boxQuotes.get(symbol) || candidate.quote || {};
  const change = Number(quote.changePct || 0);
  boxChartDialog.dataset.symbol = symbol;
  boxChartDialogTitle.textContent = `${candidate.name || symbol.replace(/USDT$/i, "")} / USDT · ${radarText("日 K 复盘", "Daily review")}`;
  boxChartSummary.textContent = `${radarText("共振评分", "Confluence score")} ${Number(candidate.score || 0)} / 100 · ${radarText("最新价", "Last price")} ${formatBoxPrice(quote.price)} · 24H ${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
  boxChartCaption.textContent = candidate.box
    ? `${radarText("箱体", "Box")} ${formatBoxPrice(candidate.box.low)} — ${formatBoxPrice(candidate.box.high)} · ${radarText("位置", "Position")} ${Number(candidate.box.positionPct || 0).toFixed(1)}% · ${radarText("试盘", "Tests")} ${candidate.box.tests || 0}`
    : radarText("当前尚未形成有效箱体，图表保留完整价格轨迹供复盘。", "No valid box is formed yet; the full price path remains available for review.");
  boxChartFullLink.href = `/box-breakout?market=crypto&symbol=${encodeURIComponent(symbol)}`;
  if (!boxChartDialog.open) boxChartDialog.showModal();
  boxExpandedChart.setAttribute("aria-busy", "true");
  try {
    const bars = await boxChartBars(symbol);
    requestAnimationFrame(() => drawBoxChart(boxExpandedChart, bars, candidate.box, { expanded: true }));
  } catch (error) {
    boxChartCaption.textContent = error instanceof Error ? error.message : radarText("图表数据暂不可用", "Chart data is unavailable");
  } finally {
    boxExpandedChart.removeAttribute("aria-busy");
  }
}

async function hydrateBoxCharts() {
  const requestId = ++boxChartRequest;
  const candidates = new Map(boxDisplayCandidates().slice(0, 12).map((candidate) => [candidate.symbol, candidate]));
  const canvases = [...document.querySelectorAll("[data-box-chart]")];
  await Promise.all(canvases.map(async (canvas) => {
    const symbol = canvas.dataset.boxChart;
    const candidate = candidates.get(symbol);
    if (!candidate) return;
    const cached = boxChartCache.get(symbol);
    if (cached && Date.now() - cached.at < 60_000) {
      drawBoxChart(canvas, cached.bars, candidate.box);
      return;
    }
    try {
      const bars = await boxChartBars(symbol);
      if (requestId !== boxChartRequest) return;
      drawBoxChart(canvas, bars, candidate.box);
    } catch {}
  }));
}

function scheduleBoxBreakout(delay) {
  window.clearTimeout(boxBreakoutTimer);
  if (!document.hidden) boxBreakoutTimer = window.setTimeout(() => hydrateBoxBreakout(), delay);
}

async function hydrateBoxBreakout() {
  if (!boxResults || boxBreakoutLoading || document.hidden) return;
  boxBreakoutLoading = true;
  try {
    const response = await fetch("/api/box-breakout", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || radarText("箱体扫描状态暂不可用", "Box scan status is unavailable"));
    boxBreakoutState = payload;
    renderBoxBreakout();
  } catch (error) {
    if (boxNotice) {
      boxNotice.hidden = false;
      boxNotice.textContent = error instanceof Error ? error.message : radarText("箱体扫描状态暂不可用", "Box scan status is unavailable");
    }
  } finally {
    boxBreakoutLoading = false;
    const running = boxBreakoutState?.job && ["queued", "running"].includes(boxBreakoutState.job.status);
    scheduleBoxBreakout(running ? 2500 : 45_000);
  }
}

async function startBoxBreakoutScan(mode) {
  if (boxBreakoutLoading) return;
  boxBreakoutLoading = true;
  boxScanButtons.forEach((button) => { button.disabled = true; });
  if (boxNotice) {
    boxNotice.hidden = false;
    boxNotice.textContent = radarText("扫描任务正在提交…", "Submitting the scan…");
  }
  try {
    const command = { action: "scan", mode };
    if (mode === "crypto-risk-pool") {
      const symbols = [...new Set(buildRiskPoolModel().candidates
        .map((candidate) => normalizeRiskPoolSymbol(candidate.symbol))
        .filter((symbol) => /^[A-Z0-9]{2,24}$/.test(symbol))
        .map((symbol) => `${symbol}USDT`))].slice(0, 100);
      if (!symbols.length) throw new Error(radarText("风控候选清单尚未生成，请先刷新雷达数据。", "The risk candidate list is not ready. Refresh Radar data first."));
      command.symbols = symbols;
    }
    const response = await fetch("/api/box-breakout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || radarText("扫描提交失败", "Unable to start scan"));
    boxBreakoutState = payload;
    renderBoxBreakout();
    scheduleBoxBreakout(1200);
  } catch (error) {
    boxNotice.hidden = false;
    boxNotice.textContent = error instanceof Error ? error.message : radarText("扫描提交失败", "Unable to start scan");
  } finally {
    boxBreakoutLoading = false;
  }
}

function scheduleBoxQuoteRefresh() {
  window.clearTimeout(boxQuoteTimer);
  const symbols = boxDisplayCandidates().slice(0, 12).map((candidate) => candidate.symbol);
  if (!symbols.length || document.hidden) return;
  boxQuoteTimer = window.setTimeout(async () => {
    try {
      const response = await fetch(`/api/box-breakout/quotes?market=crypto&symbols=${encodeURIComponent(symbols.join(","))}`, { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.quotes)) {
        payload.quotes.forEach((quote) => boxQuotes.set(quote.symbol, quote));
        renderBoxBreakout();
      }
    } catch {
      scheduleBoxQuoteRefresh();
    }
  }, 3000);
}

function avatarClass(symbol) {
  const names = {
    POPCAT: "token-pop", WIF: "token-wif", TURBO: "token-turbo", PEOPLE: "token-people",
    NEIRO: "token-neiro", ORDI: "token-ordi", ENA: "token-ena", "1000SATS": "token-sats",
    PENDLE: "token-pendle", NOT: "token-not", DOGE: "token-doge", PEPE: "token-pepe"
  };
  return names[symbol] || "";
}

function biasLabel(bias) {
  return bias === "long" ? "偏多" : bias === "short" ? "偏空" : "中性";
}

function createMainstreamFallbackToken(symbol, index) {
  const meta = featuredMarketMeta[symbol];
  return {
    symbol,
    name: meta.name,
    type: "中性观察",
    market: meta.market,
    price: "$—",
    change: null,
    volume: null,
    funding: null,
    fundingAvailable: false,
    oi: null,
    score: null,
    bias: "neutral",
    signalType: "中性观察",
    watched: false,
    dimensions: Array(7).fill(null),
    dimensionAvailability: Array(7).fill(false),
    reason: `${symbol} 属于顶部实时行情的热门精选主流标的；等待当前两小时七维快照完成后再判断共振方向。`,
    heat: null,
    kols: ["Binance 实时行情", "热门精选主流"],
    risks: ["主流资产仍可能出现高波动", "中性标的必须人工选择方向并经过风控审批"],
    headlines: [`${symbol} 已纳入顶部 13 个实时行情标的`, "价格与 24H 涨跌幅由 Binance 实时行情持续更新"],
    sourceKind: "featured-mainstream",
    detailDrawerKicker: "FEATURED MAINSTREAM · 7D DETAIL",
    detailSubtitle: `${meta.category} · Binance ${meta.market === "perp" ? "永续" : "现货 / 永续"}`
  };
}

function buildMainstreamUniverse(items = [], watchedSymbols = new Set()) {
  const incoming = new Map((Array.isArray(items) ? items : []).map((token) => [token.symbol, token]));
  return featuredMarketSymbols.map((symbol, index) => {
    const fallback = createMainstreamFallbackToken(symbol, index);
    const live = incoming.get(symbol) || tokenUniverse.find((token) => token.symbol === symbol);
    return {
      ...fallback,
      ...(live || {}),
      symbol,
      name: featuredMarketMeta[symbol].name,
      market: featuredMarketMeta[symbol].market,
      sourceKind: "featured-mainstream",
      detailDrawerKicker: "FEATURED MAINSTREAM · 7D DETAIL",
      detailSubtitle: `${featuredMarketMeta[symbol].category} · Binance ${featuredMarketMeta[symbol].market === "perp" ? "永续" : "现货 / 永续"}`,
      watched: watchedSymbols.has(symbol) || Boolean(live?.watched)
    };
  });
}

function activeRankingTokens() {
  if (activeRankingUniverse === "mainstream") return mainstreamUniverse;
  if (activeRankingUniverse === "alpha-market-cap") return alphaMarketCapUniverse;
  if (activeRankingUniverse === "alpha-open-interest") return alphaOpenInterestUniverse;
  return tokenUniverse;
}

function renderRankingModeMeta() {
  const modes = {
    anomaly: {
      kicker: "2H LIVE SCAN · BINANCE USDT",
      title: radarText("异动排行榜", "Anomaly ranking"),
      method: radarText("异常强度 ≠ 买入信号", "Anomaly intensity ≠ buy signal"),
      copy: radarText("价格、成交、资金费率、多空比、爆仓代理、社交趋势与媒体资讯分别评分，再判断共振或反指过热。", "Price, volume, funding, positioning, liquidation proxy, social and media signals are scored before resonance or contrarian-overheat classification."),
      cycle: radarText("每 2 小时扫描 · Binance 现货与永续", "Scans every 2 hours · Binance Spot and perpetuals")
    },
    mainstream: {
      kicker: "REAL-TIME · BINANCE FEATURED 13",
      title: radarText("热门精选主流", "Featured majors"),
      method: radarText("热门主流 ≠ 自动交易", "Featured majors ≠ automatic trade"),
      copy: radarText("固定覆盖顶部 13 个主流标的；沿用同一套七维评分、详情与风控送审链路。", "Covers 13 featured majors with the same seven-dimension detail and risk-approval workflow."),
      cycle: radarText("顶部 13 个行情币种 · Binance 实时价格", "13 featured markets · live Binance prices")
    },
    "alpha-market-cap": {
      kicker: "2H · BINANCE SKILLS HUB · MARKET CAP ASC",
      title: radarText("Alpha 小市值前 20", "Alpha smallest market caps"),
      method: radarText("Alpha 已上 × 现货未上 × 合约已上", "Alpha listed × no Spot × perpetual listed"),
      copy: radarText("通过 Binance Skills Hub Alpha 榜单与交易所元数据实时交叉验证，按市值从小到大展示前 20 名。", "Cross-checks the Binance Skills Hub Alpha rank with exchange metadata, then shows the 20 smallest market caps."),
      cycle: radarText("每 2 小时刷新 · 可手动实时同步", "Refreshes every 2 hours · manual live sync available")
    },
    "alpha-open-interest": {
      kicker: "2H · BINANCE SKILLS HUB · OPEN INTEREST",
      title: radarText("Alpha 合约持仓前 20", "Alpha open-interest leaders"),
      method: radarText("Alpha 已上 × 现货未上 × 合约已上", "Alpha listed × no Spot × perpetual listed"),
      copy: radarText("对同一交集清单读取 U 本位永续实时持仓数量与标记价格，按持仓名义价值从高到低展示前 20 名。", "For the same intersection, multiplies live USDⓈ-M open interest by mark price and ranks the top 20 notional values."),
      cycle: radarText("每 2 小时刷新 · 可手动实时同步", "Refreshes every 2 hours · manual live sync available")
    }
  };
  const mode = modes[activeRankingUniverse] || modes.anomaly;
  const alphaList = activeRankingUniverse.startsWith("alpha-");
  if (scannerModeKicker) scannerModeKicker.textContent = mode.kicker;
  if (scannerModeTitle) scannerModeTitle.textContent = mode.title;
  if (rankingMethodTitle) rankingMethodTitle.textContent = mode.method;
  if (rankingMethodCopy) rankingMethodCopy.textContent = mode.copy;
  if (scanCycleLabel) scanCycleLabel.innerHTML = `<i></i>${mode.cycle}${alphaList && alphaListsMeta?.refreshedAt ? ` · ${radarText("更新", "updated")} ${formatScanTime(alphaListsMeta.refreshedAt)}` : ""}`;
  if (refreshAlphaLists) refreshAlphaLists.hidden = !alphaList;
  if (rankingVolumeHead) rankingVolumeHead.textContent = alphaList ? radarText("市值", "Market cap") : radarText("成交异动", "Volume anomaly");
  if (rankingOiHead) rankingOiHead.textContent = alphaList ? radarText("合约持仓", "Futures OI") : radarText("OI 变化", "OI change");
  if (rankingScoreHead) rankingScoreHead.textContent = alphaList ? radarText("筛选状态", "Eligibility") : radarText("Alpha 分", "Alpha score");
  if (rankingBiasHead) rankingBiasHead.textContent = alphaList ? radarText("用途", "Use") : radarText("方向", "Direction");
  rankingUniverseTabs.forEach((button) => {
    const selected = button.dataset.rankingUniverse === activeRankingUniverse;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
}

mainstreamUniverse = buildMainstreamUniverse();

function scoreColor(score) {
  if (score >= 80) return "#47e7a3";
  if (score >= 70) return "#f8bd55";
  return "#8b969c";
}

function renderRankingPagination(totalItems, totalPages) {
  if (!rankingPagination || !rankingPages) return;
  rankingPagination.hidden = totalItems === 0;
  if (!totalItems) return;

  const firstRank = (activeRankingPage - 1) * rankingPageSize + 1;
  const lastRank = Math.min(activeRankingPage * rankingPageSize, totalItems);
  rankingPageSummary.textContent = `第 ${firstRank}–${lastRank} 名 · 共 ${totalItems} 个标的`;
  rankingPages.innerHTML = Array.from({ length: totalPages }, (_, index) => {
    const page = index + 1;
    return `<button type="button" data-ranking-page="${page}" class="${page === activeRankingPage ? "active" : ""}" aria-label="第 ${page} 页" ${page === activeRankingPage ? 'aria-current="page"' : ""}>${String(page).padStart(2, "0")}</button>`;
  }).join("");
  rankingPrev.disabled = activeRankingPage <= 1;
  rankingNext.disabled = activeRankingPage >= totalPages;
}

function setRankingPage(page, { scroll = true } = {}) {
  const nextPage = Number(page);
  if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage === activeRankingPage) return;
  activeRankingPage = nextPage;
  renderRows();
  if (scroll) {
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    tokenTableWrap?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }
}

function renderRows() {
  renderRankingModeMeta();
  const keyword = searchInput.value.trim().toUpperCase();
  const market = marketFilter.value;
  const rankingTokens = activeRankingTokens();
  const visible = rankingTokens.filter((token) => {
    const directionMatch = activeFilter === "all" || (activeFilter === "watch" ? token.watched : token.bias === activeFilter);
    const marketMatch = market === "all" || token.market === market || token.market === "both";
    const searchMatch = !keyword || token.symbol.includes(keyword) || token.name.toUpperCase().includes(keyword);
    return directionMatch && marketMatch && searchMatch;
  });

  const totalPages = Math.max(1, Math.ceil(visible.length / rankingPageSize));
  activeRankingPage = Math.min(activeRankingPage, totalPages);
  const pageStart = (activeRankingPage - 1) * rankingPageSize;
  const pagedTokens = visible.slice(pageStart, pageStart + rankingPageSize);

  rowsRoot.innerHTML = pagedTokens.map((token) => {
    const rank = rankingTokens.indexOf(token) + 1;
    const deltaClass = token.change >= 0 ? "up" : "down";
    const oiClass = token.oi >= 0 ? "up" : "down";
    const marketLabels = token.market === "perp"
      ? [{ label: "永续", className: "perp" }]
      : token.market === "spot"
        ? [{ label: "现货", className: "spot" }]
        : [{ label: "现货", className: "spot" }, { label: "永续", className: "perp" }];
    const marketMeta = marketLabels
      .map((item) => `<i class="token-meta-market ${item.className}">${item.label}</i>`)
      .join('<b class="token-meta-separator">·</b>');
    const fundingCell = token.fundingAvailable === false || token.funding == null
      ? '<td class="dim">—</td>'
      : `<td class="${token.funding < 0 ? "up" : token.funding > 0.04 ? "down" : ""}">${token.funding > 0 ? "+" : ""}${token.funding.toFixed(3)}%</td>`;
    const alphaList = token.sourceKind === "binance-alpha-list";
    const volumeCell = alphaList
      ? `<td class="alpha-list-metric">${formatRankingUsd(token.marketCap)}</td>`
      : `<td>${token.volume == null ? '<span class="dim">—</span>' : `<span class="volume-cell"><i style="--volume:${Math.min(100, token.volume * 22)}%"></i>${token.volume.toFixed(1)}×</span>`}</td>`;
    const oiCell = alphaList
      ? `<td class="alpha-list-metric">${formatRankingUsd(token.openInterestUsd)}</td>`
      : token.oi == null
        ? '<td class="dim">—</td>'
        : `<td class="${oiClass}">${token.oi > 0 ? "+" : ""}${token.oi.toFixed(1)}%</td>`;
    const scoreCell = alphaList
      ? `<td><span class="alpha-qualified-badge">ALPHA × PERP</span></td>`
      : `<td><span class="score-cell" style="--score:${token.score ?? 0};--score-color:${scoreColor(token.score)}"><i><strong>${token.score ?? "—"}</strong></i></span></td>`;
    const biasCell = alphaList
      ? `<td><span class="bias-tag neutral">${radarText("研究清单", "Research list")}</span></td>`
      : `<td><span class="bias-tag ${token.bias}">${biasLabel(token.bias)}</span></td>`;
    const chainMeta = alphaList ? `<b class="token-meta-separator">·</b><i class="token-meta-chain">${escapeHtml(token.chainName)}</i>` : "";
    return `
      <tr tabindex="0" data-symbol="${escapeHtml(token.symbol)}" aria-label="查看 ${escapeHtml(token.symbol)} 七维信号明细">
        <td><div class="token-cell"><span class="token-rank">${String(rank).padStart(2, "0")}</span><span class="token-avatar ${avatarClass(token.symbol)}">${escapeHtml(token.symbol[0])}</span><span><strong>${escapeHtml(token.symbol)}</strong><small>${marketMeta}${chainMeta}<b class="token-meta-separator">·</b><i class="token-meta-signal ${token.bias}">${escapeHtml(token.type)}</i></small></span></div></td>
        <td class="${token.change == null ? "dim" : deltaClass}" data-ranking-change="${escapeHtml(token.symbol)}">${formatSignalPercent(token.change)}</td>
        ${volumeCell}
        ${fundingCell}
        ${oiCell}
        ${scoreCell}
        ${biasCell}
        <td><button class="row-open" type="button" data-open="${escapeHtml(token.symbol)}" aria-label="打开 ${escapeHtml(token.symbol)} 详情">›</button></td>
      </tr>`;
  }).join("");

  emptyState.hidden = visible.length > 0;
  renderRankingPagination(visible.length, totalPages);
  watchCount.textContent = rankingTokens.filter((token) => token.watched).length;
  document.querySelector("#strong-count").textContent = alphaScanHasData ? tokenUniverse.filter((token) => token.score >= 80).length : "—";
  directionTabs.forEach((tab) => {
    const filter = tab.dataset.filter;
    const count = filter === "all"
      ? rankingTokens.length
      : filter === "watch"
        ? rankingTokens.filter((token) => token.watched).length
        : rankingTokens.filter((token) => token.bias === filter).length;
    tab.querySelector("em").textContent = count;
  });
}

function findToken(symbol) {
  return activeRankingTokens().find((token) => token.symbol === symbol)
    || tokenUniverse.find((token) => token.symbol === symbol)
    || mainstreamUniverse.find((token) => token.symbol === symbol)
    || alphaMarketCapUniverse.find((token) => token.symbol === symbol)
    || alphaOpenInterestUniverse.find((token) => token.symbol === symbol);
}

function setNeutralDetailDirection(side) {
  selectedNeutralDirection = ["LONG", "SHORT"].includes(side) ? side : null;
  detailDirectionButtons.forEach((button) => {
    const selected = button.dataset.detailSide === selectedNeutralDirection;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  if (!detailQueueButton) return;
  detailQueueButton.disabled = !selectedNeutralDirection;
  const label = detailQueueButton.querySelector("span");
  if (label) label.textContent = selectedNeutralDirection === "LONG"
    ? "做多并送入风控审批"
    : selectedNeutralDirection === "SHORT"
      ? "做空并送入风控审批"
      : "请选择做多或做空";
}

function configureDetailDirectionPicker(token) {
  const neutral = token?.bias === "neutral";
  if (detailDirectionPicker) detailDirectionPicker.hidden = !neutral;
  if (neutral) {
    setNeutralDetailDirection(null);
    return;
  }
  selectedNeutralDirection = null;
  detailDirectionButtons.forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  });
  if (detailQueueButton) {
    detailQueueButton.disabled = false;
    const label = detailQueueButton.querySelector("span");
    if (label) label.textContent = "送入风控审批";
  }
}

function openDrawer(token) {
  if (!token) return;
  activeToken = token;
  const detailMode = token.detailMode || (String(token.sourceKind || "").startsWith("crypto-bubbles") ? "momentum" : "radar");
  const momentumOnly = detailMode === "momentum";
  const momentumDetail = momentumOnly || String(token.sourceKind || "").startsWith("crypto-bubbles");
  const avatar = document.querySelector("#detail-avatar");
  avatar.className = `token-avatar ${avatarClass(token.symbol)}`;
  avatar.textContent = token.symbol[0];
  document.querySelector("#detail-drawer-kicker").textContent = token.detailDrawerKicker || (momentumDetail ? "1D MOMENTUM DETAIL" : "SIGNAL DETAIL");
  document.querySelector("#detail-drawer-title").textContent = token.detailDrawerTitle || (momentumOnly ? "1 日动量明细" : momentumDetail ? "动量与七维信号明细" : "七维信号明细");
  document.querySelector("#detail-name").innerHTML = `${escapeHtml(token.symbol)} <span>/ USDT</span>`;
  document.querySelector("#detail-subtitle").textContent = token.detailSubtitle || `${token.type} · Binance ${token.market === "spot" ? "现货" : token.market === "both" ? "现货 / 永续" : "永续"}`;
  document.querySelector("#detail-price").textContent = token.price;
  const change = document.querySelector("#detail-change");
  change.textContent = formatSignalPercent(token.change);
  change.className = token.change == null ? "dim" : token.change >= 0 ? "up" : "down";
  document.querySelector("#detail-score").textContent = token.score ?? "—";
  document.querySelector("#detail-score-label").textContent = token.scoreLabel || (momentumOnly ? "1D" : "ALPHA");
  document.querySelector("#detail-bias").textContent = token.signalType || (token.bias === "long" ? "偏多共振" : token.bias === "short" ? "偏空共振" : "中性观察");
  document.querySelector("#detail-signal").textContent = token.detailSignal || (token.bias === "long" ? "LONG BIAS" : token.bias === "short" ? "SHORT BIAS" : "NEUTRAL");
  document.querySelector("#detail-reason").textContent = token.detailReason || token.reason;
  const biasCard = document.querySelector("#bias-card");
  biasCard.className = `bias-card ${token.bias}`;
  document.querySelector("#watch-button").classList.toggle("active", token.watched);
  document.querySelector("#detail-watch").textContent = token.watched ? "移出自选" : "加入自选";
  document.querySelector("#detail-dimension-title").textContent = token.dimensionTitle || (momentumOnly ? "动量维度与待补充项" : "七维雷达");
  document.querySelector("#detail-dimension-window").textContent = token.dimensionWindow || (momentumDetail ? "Crypto Bubbles · Binance 1D" : "当前窗口 · 15m / 4h");
  document.querySelector("#detail-heat-title").textContent = token.heatTitle || (momentumOnly ? "数据来源与覆盖" : "X / 媒体热度");
  document.querySelector("#heat-label").textContent = token.heatLabel || (token.heat == null ? "暂无评分" : momentumOnly ? `价格 / 成交量覆盖 ${token.heat}/100` : `公开趋势热度 ${token.heat}/100`);
  document.querySelector("#detail-headline-title").textContent = token.headlineTitle || (momentumDetail ? "动量数据摘要" : "媒体头条");
  document.querySelector("#detail-headline-window").textContent = token.headlineWindow || (momentumDetail ? "当前 1D 快照" : "近 6 小时");
  document.querySelector("#dimension-list").innerHTML = dimensionNames.map((name, index) => `
    <div class="dimension-item ${token.dimensionAvailability?.[index] === false || token.dimensions[index] == null ? "pending" : ""}"><span>${name}</span><i style="--dimension:${token.dimensionAvailability?.[index] === false ? 0 : token.dimensions[index] ?? 0}%"></i><strong>${token.dimensionAvailability?.[index] === false ? "—" : token.dimensions[index] ?? "—"}</strong></div>
  `).join("");
  document.querySelector("#kol-row").innerHTML = `<span>${token.kolLabel || (momentumOnly ? "数据来源" : "社交趋势")}</span>${token.kols.map((kol) => `<i>${escapeHtml(kol)}</i>`).join("")}<em>${token.kolMetric || (momentumOnly ? "1D" : token.heat == null ? "—" : `${token.heat}/100`)}</em>`;
  document.querySelector("#headline-list").innerHTML = token.headlines.map((headline, index) => `
    <article><i></i><strong>${escapeHtml(headline)}</strong><span>${detailMode === "signal" ? index ? "Telegram" : "风控池" : momentumDetail ? index ? "Binance" : "1D 排名" : index ? "扫描" : "实时源"}</span></article>
  `).join("");
  document.querySelector("#detail-risks").innerHTML = token.risks.map((risk) => `<span class="risk-chip">${escapeHtml(risk)}</span>`).join("");
  configureDetailDirectionPicker(token);
  drawer.setAttribute("aria-label", `${token.symbol} ${momentumDetail ? "1 日动量详情" : "代币详情"}`);
  drawerBackdrop.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    drawer.classList.add("open");
    drawRadar(token.dimensions.map((value, index) => token.dimensionAvailability?.[index] === false ? null : value), token.bias);
    drawHeat(token);
  });
}

function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  window.setTimeout(() => { drawerBackdrop.hidden = true; }, 220);
}

function drawRadar(values, bias) {
  const canvas = document.querySelector("#radar-canvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2 + 2;
  const radius = 83;
  const count = values.length;
  const color = bias === "short" ? "#ff6470" : bias === "neutral" ? "#f8bd55" : "#47e7a3";
  ctx.clearRect(0, 0, width, height);
  ctx.font = '8px "Noto Sans SC", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let ring = 1; ring <= 4; ring += 1) {
    ctx.beginPath();
    for (let index = 0; index < count; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
      const x = cx + Math.cos(angle) * radius * ring / 4;
      const y = cy + Math.sin(angle) * radius * ring / 4;
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = ring === 4 ? "#344047" : "#222b30";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  dimensionNames.forEach((name, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = "#242d32";
    ctx.stroke();
    const labelRadius = radius + 18;
    ctx.fillStyle = "#69757a";
    ctx.fillText(name, cx + Math.cos(angle) * labelRadius, cy + Math.sin(angle) * labelRadius);
  });

  if (values.every((value) => value != null && Number.isFinite(Number(value)))) {
    ctx.beginPath();
    values.forEach((value, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
      const pointRadius = radius * value / 100;
      const x = cx + Math.cos(angle) * pointRadius;
      const y = cy + Math.sin(angle) * pointRadius;
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = `${color}24`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  values.forEach((value, index) => {
    if (value == null || !Number.isFinite(Number(value))) return;
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    const pointRadius = radius * value / 100;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * pointRadius, cy + Math.sin(angle) * pointRadius, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

function drawHeat(token) {
  const canvas = document.querySelector("#heat-canvas");
  const ctx = canvas.getContext("2d");
  const dimension = (index) => token.dimensionAvailability?.[index] === false ? null : token.dimensions?.[index];
  const entries = token.detailMode === "momentum"
    ? [["价格动量", dimension(0)], ["成交量", dimension(1)]]
    : [["社交评分", dimension(5)], ["媒体评分", dimension(6)]];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "16px sans-serif";
  entries.forEach(([label, value], index) => {
    const y = 26 + index * 52;
    const available = value != null && Number.isFinite(Number(value));
    ctx.fillStyle = "#91a79e";
    ctx.fillText(label, 12, y);
    ctx.fillStyle = "#24322d";
    ctx.fillRect(110, y - 14, 340, 18);
    if (available) {
      ctx.fillStyle = "#72dbaa";
      ctx.fillRect(110, y - 14, 340 * Math.max(0, Math.min(100, Number(value))) / 100, 18);
    }
    ctx.fillStyle = "#b5c9bf";
    ctx.fillText(available ? `${Math.round(Number(value))}/100` : "暂无", 468, y);
  });
}

function showToast(message, warning = false) {
  window.clearTimeout(toastTimer);
  toast.querySelector("span").textContent = message;
  const icon = toast.querySelector("i");
  icon.textContent = warning ? "!" : "✓";
  icon.style.background = warning ? "#f8bd55" : "#47e7a3";
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2500);
}

function formatSignalPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function formatSignalTimestamp(value) {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function triggerTypeLabel(value) {
  const labels = {
    oi_up_price_up: "OI 增 · 价涨",
    oi_up_price_down: "OI 增 · 价跌",
    oi_down_price_up: "OI 降 · 价涨",
    oi_down_price_down: "OI 降 · 价跌",
    liquidation: "爆仓触发",
    oi_breakout: "OI 突破",
    volume_spike: "成交放大",
    funding_extreme: "费率极端",
    unknown: "待解释"
  };
  return labels[value] || String(value || "待解释").replaceAll("_", " ");
}

function signalDirectionMeta(direction) {
  if (direction === "long") return { className: "long", textClass: "long-text", label: "上行" };
  if (direction === "short") return { className: "short", textClass: "short-text", label: "下行" };
  return { className: "neutral", textClass: "neutral-text", label: "观察" };
}

function signalMetricTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "neutral";
  return number > 0 ? "positive" : "negative";
}

function renderSignalMetrics(signal, direction) {
  const oiValue = formatSignalPercent(signal.oi_change_pct);
  const priceValue = formatSignalPercent(signal.price_change_pct);
  return `
    <small class="stream-metrics">
      <span class="stream-metric oi ${signalMetricTone(signal.oi_change_pct)}"><em>OI</em><b>${escapeHtml(oiValue)}</b></span>
      <span class="stream-metric price ${signalMetricTone(signal.price_change_pct)}"><em>价格</em><b>${escapeHtml(priceValue)}</b></span>
      <span class="stream-structure ${direction.className}">${escapeHtml(triggerTypeLabel(signal.trigger_type))}</span>
    </small>`;
}

function setTriggerLive(state, label) {
  updateSourceHealth("signals", state);
  if (!triggerLive) return;
  triggerLive.className = `trigger-live ${state}`;
  triggerLive.querySelector("span").textContent = label;
}

function renderSignalStreamState(title, detail, state = "empty") {
  if (!signalStream) return;
  signalStream.innerHTML = `<div class="stream-state ${state}"><i></i><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
}

function strongSignalIdentity(signal) {
  return String(signal?.dedupe_hash || signal?.telegram_message_id || signal?.source_message_url || [
    signal?.symbol,
    signal?.signal_time,
    signal?.direction,
    signal?.oi_change_pct,
    signal?.price_change_pct
  ].join("|"));
}

function detectStrongTradeIntent(signals, symbolCounts, nowMs = Date.now()) {
  const timedSignals = (Array.isArray(signals) ? signals : [])
    .filter((signal) => signal?.signal_time && signal?.source_mode !== "public_preview_markdown")
    .map((signal) => ({ signal, timestamp: new Date(signal?.signal_time).getTime() }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((left, right) => right.timestamp - left.timestamp);
  const latest = timedSignals[0];
  if (!latest?.signal?.symbol) return null;
  const side = candidateDirection(latest.signal.direction);
  const repeatCount = symbolCounts.get(latest.signal.symbol) || 0;
  const ageMs = nowMs - latest.timestamp;
  if (!side || repeatCount !== 1 || ageMs < -15_000 || ageMs > strongTradeIntentWindowMs) return null;
  return {
    signal: latest.signal,
    side,
    symbol: latest.signal.symbol,
    identity: strongSignalIdentity(latest.signal),
    ageMs,
    expiresInMs: strongTradeIntentWindowMs - Math.max(0, ageMs)
  };
}

function scheduleStrongTradeIntentExpiry(meta) {
  window.clearTimeout(strongTradeIntentExpiryTimer);
  if (!meta) return;
  strongTradeIntentExpiryTimer = window.setTimeout(() => {
    if (latestTelegramSignals.length) renderRecentSignals(latestTelegramSignals, { allowAuto: latestTelegramSignalsAutoEligible });
  }, Math.max(500, meta.expiresInMs + 250));
}

async function createStrongTradeIntentOrder(meta) {
  if (!meta || strongTradeIntentProcessing.has(meta.identity) || strongTradeIntentWasHandled(meta.identity)) return;
  if (!meta.signal?.signal_time || meta.signal.source_mode === "public_preview_markdown") return;
  strongTradeIntentProcessing.add(meta.identity);
  try {
    if (!alphaExecutionAuthorized) await hydrateAlphaExecution();
    if (!alphaExecutionAuthorized) return;
    if (alphaExecutionConfig.killSwitchActive) {
      rememberStrongTradeIntent(meta.identity, "blocked_kill_switch");
      showToast(`${canonicalIntentSymbol(meta.symbol)} 强交易意图已被 Kill Switch 阻止`, true);
      return;
    }
    const signal = meta.signal;
    const signalAgeMs = Date.now() - new Date(signal.signal_time).getTime();
    if (!Number.isFinite(signalAgeMs) || signalAgeMs < -15_000 || signalAgeMs > strongTradeIntentWindowMs) return;
    const symbol = canonicalIntentSymbol(meta.symbol);
    const priceQuery = new URLSearchParams({ symbol, market: alphaExecutionConfig.defaultMarket });
    const livePrice = await executionRequest(`/price?${priceQuery}`);
    const entryPrice = Number(livePrice.price);
    if (!(entryPrice > 0)) return showToast(`${canonicalIntentSymbol(meta.symbol)} 强交易意图暂时无法取得 Binance 参考价`, true);
    const volatility = Math.abs(Number(signal.price_change_pct) || 0);
    const stopPct = Math.min(8, Math.max(4, 4 + volatility * 0.05));
    const stopDistance = entryPrice * stopPct / 100;
    const confidence = Math.round(Math.max(0, Math.min(1, Number(signal.confidence) || 0)) * 100);
    const intent = {
      mode: alphaExecutionConfig.activeMode,
      market: alphaExecutionConfig.defaultMarket,
      symbol,
      side: meta.side,
      orderType: "MARKET",
      entryPrice,
      stopLoss: meta.side === "LONG" ? entryPrice - stopDistance : entryPrice + stopDistance,
      takeProfit: meta.side === "LONG" ? entryPrice + stopDistance * 2 : entryPrice - stopDistance * 2,
      leverage: alphaExecutionConfig.defaultMarket === "spot" ? 1 : Math.min(Number(alphaExecutionConfig.maxLeverage) || 3, 3),
      riskPct: Number(alphaExecutionConfig.riskPerTradePct) || 0.75,
      source: "telegram-strong",
      alphaScore: confidence,
      equity: currentPaperEquity(),
      dailyPnl: todayPaperPnl()
    };
    const result = await executionRequest("/intents", { method: "POST", body: JSON.stringify(intent) });
    pendingExecutionPlan = result.executionPlan || null;
    paperRiskState.pendingDecision = result.ok ? result : null;
    savePaperRiskState();
    renderRiskDecision(result);
    rememberStrongTradeIntent(meta.identity, "risk_approved", result.executionPlan?.planId || null);
    await hydrateAlphaExecution();
    if (result.ok && result.executionPlan && alphaExecutionConfig.autoExecuteEnabled && !alphaExecutionConfig.requireManualConfirmation) {
      await confirmUnifiedExecutionPlan({ strongTradeIntent: true });
    } else {
      showToast(`${intent.symbol} 强交易意图已通过 Risk Engine，等待执行确认`);
    }
  } catch (error) {
    if (error.payload?.decision) renderRiskDecision(error.payload);
    rememberStrongTradeIntent(meta.identity, "risk_rejected");
    showToast(`${canonicalIntentSymbol(meta.symbol)} 强交易意图未获放行：${error.message}`, true);
  } finally {
    strongTradeIntentProcessing.delete(meta.identity);
  }
}

function renderRecentSignals(signals, { allowAuto = true } = {}) {
  if (!signalStream) return;
  if (!signals.length) {
    window.clearTimeout(strongTradeIntentExpiryTimer);
    latestTelegramSignals = [];
    latestTelegramSignalsAutoEligible = false;
    renderRiskPool();
    renderSignalStreamState("暂未读取到频道消息", "系统会在下一轮自动重试");
    return;
  }

  const latestSignals = signals.slice(0, 20);
  latestTelegramSignals = latestSignals;
  latestTelegramSignalsAutoEligible = allowAuto;
  const symbolCounts = latestSignals.reduce((counts, signal) => {
    const symbol = signal.symbol || "UNKNOWN";
    counts.set(symbol, (counts.get(symbol) || 0) + 1);
    return counts;
  }, new Map());
  const strongIntent = allowAuto ? detectStrongTradeIntent(latestSignals, symbolCounts) : null;
  signalDetailTokens.clear();

  signalStream.innerHTML = latestSignals.map((signal, index) => {
    const symbol = signal.symbol || "UNKNOWN";
    const direction = signalDirectionMeta(signal.direction);
    const confidence = Math.round(Math.max(0, Math.min(1, Number(signal.confidence) || 0)) * 100);
    const repeatCount = symbolCounts.get(symbol) || 1;
    const repeatTag = repeatCount > 1 ? `<mark class="stream-repeat">同币 ×${repeatCount}</mark>` : "";
    const isStrongIntent = strongIntent?.identity === strongSignalIdentity(signal);
    const strongIntentTag = isStrongIntent ? '<mark class="stream-strong-intent">强交易意图</mark>' : "";
    const detailKey = String(signal.id || signal.dedupe_hash || `${symbol}-${signal.signal_time || index}-${index}`);
    const candidate = { symbol: normalizeRiskPoolSymbol(symbol), sourceCount: 1, scan: null, momentum: null, signal: { signal, count: repeatCount } };
    const scannerToken = findToken(candidate.symbol);
    if (scannerToken) candidate.scan = { token: scannerToken, rank: tokenUniverse.indexOf(scannerToken) + 1 };
    const detailToken = riskPoolCandidateToDetailToken(candidate);
    signalDetailTokens.set(detailKey, {
      ...detailToken,
      detailDrawerKicker: "RECENT TRIGGER DETAIL",
      detailDrawerTitle: "信号流水七维信号明细",
      detailSubtitle: `Telegram · BWE OI Price Monitor · ${formatSignalTimestamp(signal.signal_time)}`,
      detailReason: `${riskPoolSignalSummary(signal)}。${scannerToken ? `已合并 ${candidate.symbol} 当前七维雷达快照。` : "其余七维数据暂无同窗口扫描结果，界面明确标记为待补充。"}`,
      headlineTitle: "Telegram 信号与七维摘要",
      headlines: [riskPoolSignalSummary(signal), ...(detailToken.headlines || [])].filter(Boolean).slice(0, 4),
      intentSource: "telegram"
    });
    return `
      <article class="signal-stream-item${isStrongIntent ? " strong-trade-intent" : ""}" data-signal-detail="${escapeHtml(detailKey)}" role="button" tabindex="0" aria-label="查看 ${escapeHtml(symbol)}${isStrongIntent ? " 强交易意图" : " 信号记录"}七维明细">
        <span class="stream-time">${formatSignalTimestamp(signal.signal_time)}</span><i class="stream-line ${direction.className}"></i>
        <span class="token-avatar ${avatarClass(symbol)}">${escapeHtml(symbol[0] || "?")}</span>
        <span class="stream-copy"><span class="stream-symbol-row"><strong>${escapeHtml(symbol)}</strong>${strongIntentTag}${repeatTag}<em class="${direction.textClass}">${direction.label}</em></span>${renderSignalMetrics(signal, direction)}</span>
        <b title="解析置信度">${confidence}</b>
      </article>`;
  }).join("");
  renderRiskPool();
  scheduleStrongTradeIntentExpiry(strongIntent);
  if (strongIntent) void createStrongTradeIntentOrder(strongIntent);
}

function scheduleTelegramSignals(delay = telegramSignalRefreshMs) {
  window.clearTimeout(telegramSignalTimer);
  if (!document.hidden) telegramSignalTimer = window.setTimeout(() => hydrateRecentSignals({ force: true }), delay);
}

async function hydrateRecentSignals({ announce = false, force = false } = {}) {
  if (document.hidden && !announce) return;
  if (telegramSignalLoading) return;
  const requestStartedAt = Date.now();
  const elapsedSinceLastRequest = requestStartedAt - telegramSignalLastRequestAt;
  if (!announce && telegramSignalLastRequestAt && elapsedSinceLastRequest < telegramSignalRefreshMs) {
    scheduleTelegramSignals(telegramSignalRefreshMs - elapsedSinceLastRequest);
    return;
  }
  telegramSignalLoading = true;
  telegramSignalLastRequestAt = requestStartedAt;
  refreshTriggers?.classList.add("loading");
  if (!signalStream?.querySelector(".signal-stream-item")) renderSignalStreamState("正在同步 Telegram 最新 20 条消息", "@BWE_OI_Price_monitor", "loading");
  setTriggerLive("loading", "同步中");

  try {
    const query = force ? "?public=1&refresh=1" : "?public=1";
    const response = await fetch(`/api/telegram-signal-collector${query}`, force ? { cache: "no-store" } : {});
    if (!response.ok) throw new Error(`signal stream ${response.status}`);
    const payload = await response.json();
    const signals = Array.isArray(payload.latest) ? payload.latest : [];
    renderRecentSignals(signals, { allowAuto: !payload.stale });
    signalStream.setAttribute("aria-busy", "false");
    const latestTime = signals[0]?.signal_time ? formatSignalTimestamp(signals[0].signal_time) : "—";
    setTriggerLive(payload.stale ? "stale" : "live", `${payload.stale ? "缓存" : "实时"} · ${signals.length} 条 · ${latestTime}`);
    if (announce) showToast(`已同步 ${signals.length} 条真实 Telegram 信号${payload.stale ? "（缓存）" : ""}`, payload.stale);
    scheduleTelegramSignals(telegramSignalRefreshMs);
  } catch (error) {
    if (!signalStream?.querySelector(".signal-stream-item")) renderSignalStreamState("信号源暂时不可用", "将在 30 秒后自动重试", "error");
    setTriggerLive("error", "连接异常");
    if (announce) showToast("Telegram 信号源暂时不可用", true);
    scheduleTelegramSignals(telegramSignalRefreshMs);
  } finally {
    telegramSignalLoading = false;
    refreshTriggers?.classList.remove("loading");
  }
}

function surfScoreColor(score) {
  if (score >= 90) return "#ff6470";
  if (score >= 75) return "#f8bd55";
  return "#47e7a3";
}

function surfCategoryMatches(item, filter) {
  if (filter === "all") return true;
  const eventType = String(item.eventType || "").toLowerCase();
  if (filter === "listing") return /tge|listing/.test(eventType);
  if (filter === "product") return /product|upgrade|mainnet|testnet/.test(eventType);
  if (filter === "institution") return /institutional|regulatory|legal|fundraising/.test(eventType);
  if (filter === "unlock") return /unlock/.test(eventType);
  return true;
}

function formatSurfPulseTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) return date.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderSurfBattery(item) {
  const level = Math.max(1, Math.min(5, Number(item.batteryLevel) || 1));
  const bars = Array.from({ length: 5 }, (_, index) => `<i class="${index < level ? "on" : ""}"></i>`).join("");
  const dayLabel = Number(item.ageDay) === 0 ? "当天" : `第 ${Number(item.ageDay) + 1} 天`;
  return `<span class="surf-battery ${escapeHtml(item.batteryTone || "stale")}" title="${escapeHtml(dayLabel)} · 时效电量 ${level}/5" aria-label="${escapeHtml(dayLabel)}，时效电量 ${level}/5">${bars}</span>`;
}

function renderSurfPulse() {
  if (!surfPulseFeed) return;
  const sortMode = surfSort?.value || "score";
  const visible = surfPulseItems
    .filter((item) => surfCategoryMatches(item, activeSurfFilter))
    .sort((left, right) => sortMode === "latest"
      ? new Date(right.publishedAt) - new Date(left.publishedAt)
      : right.score - left.score || new Date(right.publishedAt) - new Date(left.publishedAt));

  if (surfPulseCount) surfPulseCount.textContent = `${visible.length} 条`;
  if (!visible.length) {
    surfPulseFeed.innerHTML = `<div class="surf-feed-state"><strong>当前分类暂无 15 日内信息</strong><span>新事件同步后会自动出现</span></div>`;
    return;
  }

  surfPulseFeed.innerHTML = visible.map((item) => {
    const projectName = item.project?.name || item.sourceName || "Market";
    const projectInitial = projectName.trim().charAt(0).toUpperCase() || "S";
    const score = Math.max(0, Math.min(100, Math.round(Number(item.score) || 0)));
    const newClass = surfPulseNewIds.has(String(item.id)) ? " new" : "";
    const sourceCount = Math.max(1, Number(item.sourceCount) || 1);
    const sourceHubUrl = item.sourceHubUrl || item.surfUrl || "https://asksurf.ai/pulse";
    const sourceHubName = item.sourceHubName || "Surf";
    return `
      <article class="surf-feed-card${newClass}" style="--score-color:${surfScoreColor(score)}">
        <div class="surf-card-top">
          <strong class="surf-score">${score}分</strong>
          <span class="surf-event-tag" title="${escapeHtml(item.eventType)}">${escapeHtml(item.eventType)}</span>
          ${renderSurfBattery(item)}
          <time class="surf-card-time" datetime="${escapeHtml(item.publishedAt)}">${escapeHtml(formatSurfPulseTime(item.publishedAt))}</time>
        </div>
        <a class="surf-card-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>
        <div class="surf-card-project"><i>${escapeHtml(projectInitial)}</i><span>${escapeHtml(projectName)}</span></div>
        <p class="surf-card-summary">${escapeHtml(item.summary || "Surf 已捕获该市场事件，等待更多摘要信息。")}</p>
        <div class="surf-card-source">
          <span>${escapeHtml(item.sourceName)} · ${sourceCount} ${sourceCount > 1 ? "SOURCES" : "SOURCE"}</span>
          <span><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a> · <a href="${escapeHtml(sourceHubUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceHubName)}</a></span>
        </div>
      </article>`;
  }).join("");
}

function setSurfLiveState(state, label) {
  if (!surfLiveState) return;
  surfLiveState.className = `surf-live-state ${state}`;
  surfLiveState.querySelector("span").textContent = label;
}

function scheduleSurfPulse(delay = surfPulseRefreshMs) {
  window.clearTimeout(surfPulseTimer);
  if (!document.hidden) surfPulseTimer = window.setTimeout(() => hydrateSurfPulse(), delay);
}

async function hydrateSurfPulse({ announce = false } = {}) {
  if (document.hidden && !announce) return;
  if (!surfPulseFeed || surfPulseLoading) return;
  surfPulseLoading = true;
  refreshSurfPulse?.classList.add("loading");
  setSurfLiveState("loading", surfPulseItems.length ? radarText("刷新中", "Refreshing") : radarText("同步中", "Syncing"));
  surfPulseFeed.setAttribute("aria-busy", "true");

  try {
    const refreshParam = announce ? `&refresh=${Date.now()}` : "";
    const response = await fetch(`/api/surf-pulse?limit=90&lang=${platformLang}${refreshParam}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Surf Pulse ${response.status}`);
    const payload = await response.json();
    const incoming = Array.isArray(payload.items) ? payload.items : [];
    const incomingIds = new Set(incoming.map((item) => String(item.id)));
    surfPulseNewIds = surfPulseSeenIds.size
      ? new Set([...incomingIds].filter((id) => !surfPulseSeenIds.has(id)))
      : new Set();
    surfPulseSeenIds = incomingIds;
    surfPulseItems = incoming;
    renderSurfPulse();
    const fetchedAt = new Date(payload.fetchedAt);
    const time = Number.isNaN(fetchedAt.getTime()) ? radarText("实时", "Live") : fetchedAt.toLocaleTimeString(platformLang === "en" ? "en-GB" : "zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setSurfLiveState("live", `${radarText("实时", "Live")} · ${time}`);
    if (announce) showToast(radarText(`实时情报流已更新 ${incoming.length} 条 15 日内信息`, `Intelligence feed updated with ${incoming.length} items from the last 15 days`));
  } catch (error) {
    if (!surfPulseItems.length) {
      surfPulseFeed.innerHTML = `<div class="surf-feed-state"><strong>${radarText("实时情报源暂时不可用", "Live intelligence is temporarily unavailable")}</strong><span>${radarText("系统将在 10 分钟后自动重试", "The system will retry in 10 minutes")}</span></div>`;
    }
    setSurfLiveState("error", radarText("重试中", "Retrying"));
    if (announce) showToast(radarText("实时情报源暂时不可用，正在自动重试", "Live intelligence is unavailable; retrying automatically"), true);
  } finally {
    surfPulseFeed.setAttribute("aria-busy", "false");
    surfPulseLoading = false;
    refreshSurfPulse?.classList.remove("loading");
    scheduleSurfPulse();
  }
}

function toggleWatch(token) {
  token.watched = !token.watched;
  [...tokenUniverse, ...mainstreamUniverse].forEach((candidate) => {
    if (candidate.symbol === token.symbol) candidate.watched = token.watched;
  });
  if (String(token.sourceKind || "").startsWith("crypto-bubbles")) {
    if (token.watched) momentumWatchedSymbols.add(token.symbol);
    else momentumWatchedSymbols.delete(token.symbol);
  }
  document.querySelector("#watch-button").classList.toggle("active", token.watched);
  document.querySelector("#detail-watch").textContent = token.watched ? "移出自选" : "加入自选";
  renderRows();
  showToast(token.watched ? `${token.symbol} 已加入自选` : `${token.symbol} 已移出自选`);
}

function makeClientId(prefix) {
  const uuid = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid.slice(0, 12).toUpperCase()}`;
}

function clonePaperData(value) {
  return JSON.parse(JSON.stringify(value));
}

function inferPaperSessionStartedAt(stored) {
  if (stored?.sessionStartedAt && !Number.isNaN(new Date(stored.sessionStartedAt).getTime())) return stored.sessionStartedAt;
  const timestamps = [
    ...(Array.isArray(stored?.positions) ? stored.positions.map((item) => item.createdAt || item.openedAt) : []),
    ...(Array.isArray(stored?.intents) ? stored.intents.map((item) => item.createdAt) : []),
    ...(Array.isArray(stored?.audits) ? stored.audits.map((item) => item.timestamp) : [])
  ].filter((value) => !Number.isNaN(new Date(value).getTime())).sort();
  return timestamps[0] || new Date().toISOString();
}

function loadPaperRiskState() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(paperRiskStorageKey) || "null");
    if (!stored || stored.version !== 1) return;
    paperRiskState = {
      ...paperRiskState,
      ...stored,
      sessionStartedAt: inferPaperSessionStartedAt(stored),
      startingEquity: Number(stored.startingEquity) || 10_000,
      realizedPnl: Number(stored.realizedPnl) || 0,
      killSwitch: stored.killSwitch === true,
      intents: Array.isArray(stored.intents) ? stored.intents.slice(-60) : [],
      positions: Array.isArray(stored.positions) ? stored.positions.slice(-100) : [],
      audits: Array.isArray(stored.audits) ? stored.audits.slice(-250) : []
    };
  } catch {
    window.localStorage.removeItem(paperRiskStorageKey);
  }
}

function loadPaperHistory() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(paperHistoryStorageKey) || "null");
    const archives = Array.isArray(stored) ? stored : stored?.archives;
    paperHistory = Array.isArray(archives) ? archives.filter((item) => item?.archiveId).slice(0, paperHistoryLimit) : [];
  } catch {
    paperHistory = [];
    window.localStorage.removeItem(paperHistoryStorageKey);
  }
}

function savePaperRiskState() {
  try {
    window.localStorage.setItem(paperRiskStorageKey, JSON.stringify(paperRiskState));
  } catch {
    // Local persistence is a convenience layer; the risk gate remains server-side.
  }
}

function savePaperHistory() {
  try {
    window.localStorage.setItem(paperHistoryStorageKey, JSON.stringify({ version: 1, archives: paperHistory.slice(0, paperHistoryLimit) }));
    return true;
  } catch {
    return false;
  }
}

function loadStrongTradeIntentSeen() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(strongTradeIntentSeenStorageKey) || "[]");
    const cutoff = Date.now() - 48 * 60 * 60_000;
    strongTradeIntentSeen = (Array.isArray(stored) ? stored : [])
      .filter((item) => item?.id && new Date(item.processedAt).getTime() >= cutoff)
      .slice(0, 100);
  } catch {
    strongTradeIntentSeen = [];
    window.localStorage.removeItem(strongTradeIntentSeenStorageKey);
  }
}

function rememberStrongTradeIntent(id, status, positionId = null) {
  const record = { id, status, positionId, processedAt: new Date().toISOString() };
  strongTradeIntentSeen = [record, ...strongTradeIntentSeen.filter((item) => item.id !== id)].slice(0, 100);
  try {
    window.localStorage.setItem(strongTradeIntentSeenStorageKey, JSON.stringify(strongTradeIntentSeen));
  } catch {
    // The paper order itself also stores the signal hash as a second dedupe layer.
  }
}

function strongTradeIntentWasHandled(id) {
  return strongTradeIntentSeen.some((item) => item.id === id)
    || paperRiskState.positions.some((position) => position.strongSignalDedupeHash === id);
}

function parseControlNumber(id, fallback) {
  const value = document.querySelector(`#${id}`)?.value || "";
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function currentRiskPolicy() {
  return {
    riskPerTradePct: parseControlNumber("risk-per-trade", 0.75),
    maxLeverage: parseControlNumber("max-leverage", 3),
    dailyLossLimitPct: parseControlNumber("daily-stop", 2),
    dedupeWindowMinutes: parseControlNumber("dedupe-window", 15),
    maxOpenPositions: 6,
    maxPortfolioExposurePct: 50,
    minRiskRewardRatio: 1.5,
    minAlphaScore: 75,
    maxSlippageBps: 25
  };
}

function openPaperPositions() {
  return paperRiskState.positions.filter((position) => position.status === "MONITORING");
}

function paperPositionPnl(position, markPrice = position.markPrice) {
  const mark = Number(markPrice) || Number(position.entryPrice);
  const distance = position.side === "LONG" ? mark - position.entryPrice : position.entryPrice - mark;
  return distance * position.quantity;
}

function currentPaperEquity(includeUnrealized = false) {
  const unrealized = includeUnrealized ? openPaperPositions().reduce((sum, position) => sum + paperPositionPnl(position), 0) : 0;
  return paperRiskState.startingEquity + paperRiskState.realizedPnl + unrealized;
}

function todayPaperPnl() {
  const today = new Date().toISOString().slice(0, 10);
  return paperRiskState.positions
    .filter((position) => position.status === "CLOSED" && String(position.closedAt || "").startsWith(today))
    .reduce((sum, position) => sum + (Number(position.realizedPnl) || 0), 0);
}

function appendClientAudit(state, status, message, details = null, intentId = null) {
  paperRiskState.audits.push({
    auditId: makeClientId("AUD"),
    intentId,
    state,
    status,
    message,
    details,
    timestamp: new Date().toISOString()
  });
  paperRiskState.audits = paperRiskState.audits.slice(-250);
}

function ingestServerAudit(records) {
  (Array.isArray(records) ? records : []).forEach((record, index) => {
    paperRiskState.audits.push({ ...record, sequence: index });
  });
  paperRiskState.audits = paperRiskState.audits.slice(-250);
}

function formatRiskPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (number >= 1_000) return number.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (number >= 1) return number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (number >= 0.01) return number.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
  return number.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function formatSignedMoney(value) {
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
}

function executionModeLabel(mode = alphaExecutionConfig.activeMode) {
  return ({ paper: "PAPER", live: "LIVE" })[mode] || "PAPER";
}

function executionMarketLabel(market = alphaExecutionConfig.defaultMarket) {
  return market === "spot" ? "SPOT" : "FUTURES";
}

function executionEnum(value) {
  return String(value || "").toLowerCase();
}

function executionErrorMessage(payload, fallback = "交易执行服务暂时不可用") {
  if (!payload) return fallback;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  if (Array.isArray(payload.issues) && payload.issues[0]?.message) return payload.issues[0].message;
  return fallback;
}

async function executionRequest(path, options = {}) {
  const response = await fetch(`/api/alpha-execution${path}`, {
    cache: "no-store",
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(executionErrorMessage(payload, `执行服务返回 ${response.status}`));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload || {};
}

function setExecutionOperationState(element, message, tone = "") {
  if (!element) return;
  element.classList.remove("active", "warning", "error");
  if (tone) element.classList.add(tone);
  element.innerHTML = `<i></i>${escapeHtml(message)}`;
}

function credentialSelection() {
  return {
    environment: document.querySelector("#execution-credential-environment")?.value || "live",
    market: document.querySelector("#execution-credential-market")?.value || "futures"
  };
}

function selectedCredential() {
  const selected = credentialSelection();
  return (alphaExecutionSnapshot?.credentials || []).find((credential) => executionEnum(credential.environment) === selected.environment && executionEnum(credential.market) === selected.market) || null;
}

function renderExecutionCredentials() {
  const credentials = (alphaExecutionSnapshot?.credentials || []).filter((credential) => executionEnum(credential.environment) === "live");
  const selected = selectedCredential();
  if (executionCredentialState) {
    executionCredentialState.classList.toggle("verified", Boolean(selected?.verifiedAt));
    executionCredentialState.classList.toggle("error", Boolean(selected?.lastError));
    const state = selected?.verifiedAt
      ? `${credentialSelection().environment.toUpperCase()} / ${credentialSelection().market.toUpperCase()} 已校验 · Key ${selected.apiKeyHint || "***"}`
      : selected?.lastError
        ? `校验失败：${selected.lastError}`
        : selected
          ? `Key ${selected.apiKeyHint || "***"} 已保存，等待连接校验`
          : "当前环境尚未配置 Binance API Key";
    executionCredentialState.innerHTML = `<i></i><span>${escapeHtml(state)}</span>`;
  }
  if (!executionCredentialList) return;
  if (!credentials.length) {
    executionCredentialList.innerHTML = "<span>尚无实盘凭据 · PAPER 无需 API Key</span>";
    return;
  }
  executionCredentialList.innerHTML = credentials.map((credential) => {
    const environment = executionEnum(credential.environment);
    const market = executionEnum(credential.market);
    return `<article><strong>${escapeHtml(environment.toUpperCase())} · ${escapeHtml(market.toUpperCase())}</strong><span>${escapeHtml(credential.apiKeyHint || "***")}${credential.proxyConfigured ? " · PROXY" : ""}</span><em>${credential.verifiedAt ? "VERIFIED" : credential.lastError ? "ERROR" : "PENDING"}</em></article>`;
  }).join("");
}

function automationTradeBadge(record) {
  const binding = record?.automationOrder;
  if (executionEnum(record?.environment) !== "live" || record?.isAutomation !== true
    || !binding || typeof binding.reservationId !== "string" || !binding.reservationId.trim()
    || typeof binding.entryOrderId !== "string" || !binding.entryOrderId.trim()
    || binding.source !== `alpha-auto:${binding.reservationId}`
    || (record.plan?.intent?.source != null && record.plan.intent.source !== binding.source)
    || (record.role != null && !(Number(record.filledQuantity) > 0))) return "";
  return '<em class="automation-fill-badge" title="服务端已核验的自动策略实盘成交" aria-label="自成交：自动策略实盘成交">自成交</em>';
}

function activePortfolioSource(record) {
  return automationTradeBadge(record) ? "alpha-auto" : (record?.plan?.intent?.source || "execution-engine");
}

function renderExecutionOrders() {
  const orders = (alphaExecutionSnapshot?.orders || []).filter((order) =>
    executionEnum(order.environment) === alphaExecutionConfig.activeMode
    && executionEnum(order.market) === alphaExecutionConfig.defaultMarket
  );
  if (executionOrderCount) executionOrderCount.textContent = `${orders.length} ORDERS`;
  if (!executionOrderList) return;
  if (!orders.length) {
    executionOrderList.innerHTML = '<div class="execution-empty"><strong>暂无服务端订单</strong><span>审批后的执行计划会在这里显示环境、幂等键、成交与保护单状态。</span></div>';
    return;
  }
  executionOrderList.innerHTML = orders.map((order) => {
    const mode = executionEnum(order.environment);
    const market = executionEnum(order.market);
    const status = executionEnum(order.status);
    const created = new Date(order.createdAt);
    const createdText = Number.isNaN(created.getTime()) ? "—" : created.toLocaleString("zh-CN", { hour12: false });
    const quantity = Number(order.filledQuantity || order.quantity || 0);
    const price = Number(order.averagePrice || order.price || order.stopPrice || 0);
    return `<article class="execution-order-row">
      <span><strong>${escapeHtml(order.symbol)} · ${escapeHtml(order.role)} ${automationTradeBadge(order)}</strong><em>${escapeHtml(order.clientOrderId || "NO CLIENT ID")}</em></span>
      <span class="mode-${escapeHtml(mode)}"><em>环境</em><strong>${escapeHtml(executionModeLabel(mode))}</strong></span>
      <span><em>市场 / 方向</em><strong>${escapeHtml(market.toUpperCase())} · ${escapeHtml(order.side)}</strong></span>
      <span><em>数量 / 价格</em><strong>${formatRiskPrice(quantity)} / ${formatRiskPrice(price)}</strong></span>
      <span class="status-${escapeHtml(status)}"><em>状态</em><strong>${escapeHtml(String(order.status || "UNKNOWN"))}</strong></span>
      <span><em>创建时间</em><strong>${escapeHtml(createdText)}</strong></span>
    </article>`;
  }).join("");
}

function renderExecutionPositions() {
  if (!alphaExecutionAuthorized || !positionMonitorList) return;
  const positions = activeExecutionPositions();
  if (monitorCount) monitorCount.textContent = `${positions.length} OPEN`;
  if (!positions.length) {
    positionMonitorList.innerHTML = '<div class="risk-list-empty"><strong>暂无受控持仓</strong><span>执行计划成交并附加保护单后才会进入监控</span></div>';
    return;
  }
  positionMonitorList.innerHTML = positions.map((position) => {
    const pnl = Number(position.unrealizedPnl) || 0;
    return `<article class="monitor-item"><i>${escapeHtml(position.symbol?.[0] || "?")}</i><div><strong>${escapeHtml(position.symbol)} · ${escapeHtml(position.side)} · ${escapeHtml(executionEnum(position.environment).toUpperCase())}</strong><span>MARK ${formatRiskPrice(position.markPrice)} · SL ${formatRiskPrice(position.stopLoss)} · TP ${formatRiskPrice(position.takeProfit)}</span></div><div class="monitor-pnl"><strong class="${pnl >= 0 ? "up" : "down"}">${formatSignedMoney(pnl)}</strong><span>${escapeHtml(String(position.state || "MONITORING"))}</span></div></article>`;
  }).join("");
}

function renderExecutionAudits() {
  if (!alphaExecutionAuthorized || !riskAuditList) return;
  const audits = alphaExecutionSnapshot?.audits || [];
  if (!audits.length) {
    riskAuditList.innerHTML = '<div class="risk-list-empty"><strong>等待首条服务端审计事件</strong><span>审批、下单、保护单、对账和熔断均会持久化留痕</span></div>';
    return;
  }
  riskAuditList.innerHTML = audits.map((audit) => {
    const state = String(audit.state || "AUDIT");
    const status = String(audit.status || "OK");
    const tone = status.includes("ERROR") || state.includes("FAILED") || state.includes("REJECTED") ? "rejected" : state.includes("KILLED") ? "killed" : status.includes("WARNING") ? "warning" : "";
    const timestamp = new Date(audit.createdAt);
    const time = Number.isNaN(timestamp.getTime()) ? "—" : timestamp.toLocaleTimeString("zh-CN", { hour12: false });
    return `<article class="audit-item ${tone}"><i></i><div><strong>${escapeHtml(state)} · ${escapeHtml(status)}</strong><span title="${escapeHtml(audit.message)}">${escapeHtml(audit.message)}</span></div><time>${escapeHtml(time)}</time></article>`;
  }).join("");
}

function syncExecutionRiskControls() {
  const mappings = [
    ["risk-per-trade", `${Number(alphaExecutionConfig.riskPerTradePct).toFixed(2)}%`],
    ["max-leverage", `${Number(alphaExecutionConfig.maxLeverage)}×`],
    ["daily-stop", `-${Number(alphaExecutionConfig.dailyLossLimitPct).toFixed(1)}%`],
    ["dedupe-window", `${Number(alphaExecutionConfig.dedupeWindowMinutes)} min`]
  ];
  mappings.forEach(([id, value]) => {
    const control = document.querySelector(`#${id}`);
    if (control && [...control.options].some((option) => option.value === value)) control.value = value;
  });
}

function activeExecutionCredential() {
  return (alphaExecutionSnapshot?.credentials || []).find((credential) =>
    executionEnum(credential.environment) === alphaExecutionConfig.activeMode
    && executionEnum(credential.market) === alphaExecutionConfig.defaultMarket
  ) || null;
}

function activeExecutionPositions() {
  return (alphaExecutionSnapshot?.positions || []).filter((position) =>
    executionEnum(position.environment) === alphaExecutionConfig.activeMode
    && executionEnum(position.market) === alphaExecutionConfig.defaultMarket
    && !["closed", "canceled", "killed"].includes(executionEnum(position.state))
  );
}

function activeExecutionPortfolioStats() {
  return (alphaExecutionSnapshot?.portfolioStats || []).find((stats) =>
    executionEnum(stats.environment) === alphaExecutionConfig.activeMode
    && executionEnum(stats.market) === alphaExecutionConfig.defaultMarket
  ) || null;
}

function executionPortfolioCopy() {
  const mode = alphaExecutionConfig.activeMode;
  if (mode === "live") return { title: "生产实盘组合", kicker: "PRODUCTION LIVE PORTFOLIO", nav: "实盘组合", navSub: "Live Portfolio", monitor: "实盘持仓监控", foot: "生产实盘订单来自 Binance；持仓、保护单与成交状态以交易所对账为准", exportLabel: "导出实盘记录" };
  return { title: "纸面交易", kicker: "PAPER PORTFOLIO", nav: "纸面交易", navSub: "Paper Trading Only", monitor: "持仓监控", foot: "Paper Executor 不连接 Binance；所有盈亏均为模拟计算", exportLabel: "导出纸面记录" };
}

function renderExecutionWorkspaceMode() {
  const copy = executionPortfolioCopy();
  if (portfolioTitle) portfolioTitle.textContent = copy.title;
  if (portfolioKicker) portfolioKicker.textContent = copy.kicker;
  if (portfolioNavTitle) portfolioNavTitle.textContent = copy.nav;
  if (portfolioNavSubtitle) portfolioNavSubtitle.textContent = copy.navSub;
  if (positionMonitorTitle) positionMonitorTitle.textContent = copy.monitor;
  if (positionMonitorKicker) positionMonitorKicker.textContent = `${executionModeLabel()} POSITION MONITOR`;
  if (portfolioFootnote) portfolioFootnote.innerHTML = `<i></i>${escapeHtml(copy.foot)}`;
  if (portfolioExportLabel) portfolioExportLabel.textContent = copy.exportLabel;
  const environmentPortfolio = alphaExecutionConfig.activeMode !== "paper";
  paperPanel?.classList.toggle("environment-portfolio", environmentPortfolio);
  paperPanel?.classList.toggle("environment-live", alphaExecutionConfig.activeMode === "live");
  paperPanel?.classList.toggle("environment-testnet", alphaExecutionConfig.activeMode === "testnet");
  if (portfolioRealizedStat) portfolioRealizedStat.hidden = alphaExecutionConfig.activeMode !== "live";
  if (livePortfolioPullButton) livePortfolioPullButton.hidden = alphaExecutionConfig.activeMode !== "live";
  ensureLivePortfolioPullSchedule();
  if (environmentPortfolio) {
    if (paperCurrentView) paperCurrentView.hidden = false;
    if (paperHistoryView) paperHistoryView.hidden = true;
  }
}

function setRiskPolicySaveState(message, tone = "") {
  if (!riskPolicySaveState) return;
  riskPolicySaveState.classList.remove("saving", "error");
  if (tone) riskPolicySaveState.classList.add(tone);
  riskPolicySaveState.innerHTML = `<i></i>${escapeHtml(message)}`;
}

function renderExecutionControl() {
  const config = alphaExecutionConfig;
  executionModeButtons.forEach((button) => {
    const active = button.dataset.executionMode === config.activeMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  const formFields = {
    "execution-mode": config.activeMode,
    "execution-market": config.defaultMarket,
    "execution-per-order-limit": config.perOrderNotionalLimit,
    "execution-daily-limit": config.dailyNotionalLimit
  };
  Object.entries(formFields).forEach(([id, value]) => {
    const field = document.querySelector(`#${id}`);
    if (field && document.activeElement !== field) field.value = String(value);
  });
  const checks = {
    "execution-auto": config.autoExecuteEnabled,
    "execution-manual-confirm": config.requireManualConfirmation
  };
  Object.entries(checks).forEach(([id, checked]) => {
    const field = document.querySelector(`#${id}`);
    if (field) field.checked = Boolean(checked);
  });
  const intentMarket = document.querySelector("#intent-market");
  if (intentMarket) intentMarket.value = config.defaultMarket;
  const intentModeLabel = document.querySelector("#intent-mode-label");
  const intentMarketLabel = document.querySelector("#intent-market-label");
  if (intentModeLabel) intentModeLabel.textContent = executionModeLabel();
  if (intentMarketLabel) intentMarketLabel.textContent = executionMarketLabel();
  const riskLock = document.querySelector("#risk-environment-lock");
  if (riskLock) riskLock.textContent = `${executionModeLabel()} · ${executionMarketLabel()}`;

  const modeName = document.querySelector("#mode-pill-name");
  const modeState = document.querySelector("#mode-pill-state");
  const modeToggle = document.querySelector("#mode-toggle");
  if (modeName) modeName.textContent = executionModeLabel();
  if (modeState) modeState.textContent = config.killSwitchActive ? "KILLED" : config.activeMode === "live" ? (config.liveUnlocked ? "UNLOCKED" : "LOCKED") : "READY";
  modeToggle?.classList.toggle("locked", config.activeMode === "live" ? !config.liveUnlocked : config.killSwitchActive);
  modeToggle?.classList.toggle("testnet", config.activeMode === "testnet");
  modeToggle?.classList.toggle("live", config.activeMode === "live" && config.liveUnlocked);

  const lockTitle = document.querySelector("#execution-lock-title");
  const lockCopy = document.querySelector("#execution-lock-copy");
  if (lockTitle) lockTitle.textContent = config.liveUnlocked ? "生产实盘已显式解锁" : "生产实盘默认加锁";
  if (lockCopy) lockCopy.textContent = `${executionModeLabel()} · ${executionMarketLabel()} · ${config.killSwitchActive ? "KILL SWITCH ON" : "风控强制"}`;

  const healthy = !config.killSwitchActive && config.reconciliationHealthy;
  if (executionHealth) {
    executionHealth.classList.toggle("healthy", healthy);
    executionHealth.classList.toggle("danger", Boolean(config.killSwitchActive));
    executionHealth.innerHTML = `<i></i><span>${escapeHtml(config.killSwitchActive ? "Kill Switch 已触发" : config.reconciliationHealthy ? "状态机与对账闸门正常" : "对账状态异常，实盘禁止")}</span><strong>${escapeHtml(config.killSwitchActive ? "EXECUTION HALTED" : healthy ? "FAIL CLOSED · READY" : "RECONCILE REQUIRED")}</strong>`;
  }
  const configState = document.querySelector("#execution-config-state");
  if (configState) configState.textContent = alphaExecutionAuthorized ? "服务端配置已同步" : "需要 MAX / ADMIN 权限";
  liveUnlockPanel?.classList.toggle("unlocked", Boolean(config.liveUnlocked));
  const liveLockState = document.querySelector("#live-lock-state");
  if (liveLockState) liveLockState.textContent = config.liveUnlocked ? "UNLOCKED" : "LOCKED";
  const lastReconciled = config.lastReconciledAt ? new Date(config.lastReconciledAt).toLocaleTimeString("zh-CN", { hour12: false }) : null;
  setExecutionOperationState(executionReconcileState, lastReconciled ? `${config.reconciliationHealthy ? "对账健康" : "对账异常"} · ${lastReconciled}` : "等待首轮对账", config.reconciliationHealthy ? "active" : "warning");
  killSwitchButton?.classList.toggle("active", Boolean(config.killSwitchActive));
  if (killSwitchButton) killSwitchButton.querySelector("em").textContent = config.killSwitchActive ? "已熔断" : "未触发";
  if (riskSubmit) riskSubmit.disabled = config.killSwitchActive || !alphaExecutionAuthorized;
  if (!alphaExecutionConfigDirty && !alphaExecutionConfigSaving) syncExecutionRiskControls();
  renderExecutionWorkspaceMode();
  renderExecutionCredentials();
  renderExecutionOrders();
  renderExecutionPositions();
  renderExecutionAudits();
  renderPaperWorkspace();
  ensureLivePnlSchedule();
}

function alphaExecutionHasActiveWork(snapshot = alphaExecutionSnapshot) {
  return (snapshot?.positions || []).some(position => !["CLOSED", "CANCELED", "KILLED"].includes(String(position.state).toUpperCase()))
    || (snapshot?.orders || []).some(order => ["PENDING", "NEW", "PARTIALLY_FILLED", "UNKNOWN"].includes(String(order.status).toUpperCase()));
}

function scheduleAlphaExecutionRefresh(delay = alphaExecutionRefreshMs) {
  window.clearTimeout(alphaExecutionTimer);
  if (document.hidden || !alphaExecutionAuthorized) return;
  if (!alphaExecutionHasActiveWork()) delay = Math.max(delay, alphaExecutionIdleRefreshMs);
  alphaExecutionTimer = window.setTimeout(() => hydrateAlphaExecution(), delay);
}

async function hydrateAlphaExecution({ announce = false } = {}) {
  if (alphaExecutionLoading || document.hidden) return;
  alphaExecutionLoading = true;
  try {
    const snapshot = await executionRequest("/status");
    alphaExecutionAuthorized = true;
    alphaExecutionSnapshot = snapshot;
    alphaExecutionConfig = { ...alphaExecutionConfig, ...(snapshot.config || {}) };
    renderExecutionControl();
    if (announce) showToast("交易执行中心已同步服务端状态");
  } catch (error) {
    alphaExecutionAuthorized = false;
    livePnlSnapshot = null;
    livePnlLastAttempt = 0;
    window.clearTimeout(livePnlTimer);
    if (executionHealth) {
      executionHealth.classList.remove("healthy");
      executionHealth.classList.add("danger");
      executionHealth.innerHTML = `<i></i><span>${escapeHtml(error.status === 401 ? "请登录后使用交易执行中心" : error.status === 403 ? "当前账户没有交易执行权限" : error.message)}</span><strong>NO EXECUTION ACCESS</strong>`;
    }
    if (riskSubmit) riskSubmit.disabled = true;
    renderLiveSummaryMetrics();
    if (announce) showToast(error.message, true);
  } finally {
    alphaExecutionLoading = false;
    scheduleAlphaExecutionRefresh();
  }
}

function executionConfigPayload(overrides = {}) {
  return {
    activeMode: overrides.activeMode || document.querySelector("#execution-mode").value,
    defaultMarket: overrides.defaultMarket || document.querySelector("#execution-market").value,
    testnetEnabled: false,
    autoExecuteEnabled: document.querySelector("#execution-auto").checked,
    requireManualConfirmation: document.querySelector("#execution-manual-confirm").checked,
    requireProtectionOrders: true,
    riskPerTradePct: parseControlNumber("risk-per-trade", alphaExecutionConfig.riskPerTradePct),
    maxLeverage: parseControlNumber("max-leverage", alphaExecutionConfig.maxLeverage),
    dailyLossLimitPct: Math.abs(parseControlNumber("daily-stop", alphaExecutionConfig.dailyLossLimitPct)),
    dedupeWindowMinutes: parseControlNumber("dedupe-window", alphaExecutionConfig.dedupeWindowMinutes),
    maxOpenPositions: Number(alphaExecutionConfig.maxOpenPositions) || 4,
    maxPortfolioExposurePct: Number(alphaExecutionConfig.maxPortfolioExposurePct) || 35,
    minAlphaScore: Math.max(75, Number(alphaExecutionConfig.minAlphaScore) || 75),
    perOrderNotionalLimit: Number(document.querySelector("#execution-per-order-limit").value),
    dailyNotionalLimit: Number(document.querySelector("#execution-daily-limit").value)
  };
}

async function persistExecutionConfig({ announce = false, overrides = {} } = {}) {
  if (!alphaExecutionAuthorized) return showToast("请先登录具备交易权限的账户", true);
  const button = document.querySelector("#save-execution-config");
  if (alphaExecutionConfigSaving) {
    alphaExecutionConfigDirty = true;
    return null;
  }
  alphaExecutionConfigSaving = true;
  alphaExecutionConfigDirty = false;
  if (button) button.disabled = true;
  setRiskPolicySaveState("正在保存到服务端…", "saving");
  try {
    const payload = executionConfigPayload(overrides);
    const result = await executionRequest("/config", { method: "PATCH", body: JSON.stringify(payload) });
    alphaExecutionConfig = { ...alphaExecutionConfig, ...result.config };
    if (alphaExecutionSnapshot) alphaExecutionSnapshot.config = alphaExecutionConfig;
    renderExecutionControl();
    setRiskPolicySaveState(`已保存 · 去重 ${alphaExecutionConfig.dedupeWindowMinutes} min`);
    if (announce) showToast(`${executionModeLabel()} / ${executionMarketLabel()} 配置已保存`);
    return result.config;
  } catch (error) {
    alphaExecutionConfigDirty = false;
    setRiskPolicySaveState(`保存失败 · ${error.message}`, "error");
    showToast(error.message, true);
    throw error;
  } finally {
    alphaExecutionConfigSaving = false;
    if (button) button.disabled = false;
    if (alphaExecutionConfigDirty) scheduleExecutionConfigSave(500);
  }
}

async function saveExecutionConfig(event) {
  event.preventDefault();
  await persistExecutionConfig({ announce: true }).catch(() => undefined);
}

function scheduleExecutionConfigSave(delay = 350) {
  alphaExecutionConfigDirty = true;
  window.clearTimeout(alphaExecutionConfigSaveTimer);
  alphaExecutionConfigSaveTimer = window.setTimeout(() => persistExecutionConfig().catch(() => undefined), delay);
}

async function flushExecutionConfig() {
  window.clearTimeout(alphaExecutionConfigSaveTimer);
  if (alphaExecutionConfigSaving) {
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    return flushExecutionConfig();
  }
  if (alphaExecutionConfigDirty) await persistExecutionConfig();
}

async function saveExecutionCredential(event) {
  event.preventDefault();
  const button = document.querySelector("#save-execution-credential");
  button.disabled = true;
  try {
    const payload = {
      ...credentialSelection(),
      apiKey: document.querySelector("#execution-api-key").value.trim(),
      apiSecret: document.querySelector("#execution-api-secret").value.trim(),
      proxy: document.querySelector("#execution-proxy").value.trim()
    };
    const result = await executionRequest("/credentials", { method: "POST", body: JSON.stringify(payload) });
    if (alphaExecutionSnapshot) alphaExecutionSnapshot.credentials = result.credentials || [];
    document.querySelector("#execution-api-key").value = "";
    document.querySelector("#execution-api-secret").value = "";
    renderExecutionCredentials();
    showToast(`${payload.environment.toUpperCase()} / ${payload.market.toUpperCase()} Key 已加密保存，请执行连接校验`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function preflightExecutionCredential() {
  const button = document.querySelector("#test-execution-credential");
  button.disabled = true;
  if (executionCredentialState) executionCredentialState.innerHTML = "<i></i><span>正在校验签名、时间差、账户和交易权限…</span>";
  try {
    const selection = credentialSelection();
    const result = await executionRequest("/preflight", { method: "POST", body: JSON.stringify(selection) });
    showToast(`Binance ${selection.environment.toUpperCase()} 校验通过 · 可交易 ${result.result?.canTrade ? "YES" : "NO"}`);
    await hydrateAlphaExecution();
  } catch (error) {
    executionCredentialState?.classList.add("error");
    if (executionCredentialState) executionCredentialState.innerHTML = `<i></i><span>${escapeHtml(error.message)}</span>`;
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function deleteExecutionCredential() {
  const selection = credentialSelection();
  if (!window.confirm(`删除 ${selection.environment.toUpperCase()} / ${selection.market.toUpperCase()} Binance 凭据？对应执行权限会立即撤销。`)) return;
  try {
    const query = new URLSearchParams(selection);
    const result = await executionRequest(`/credentials?${query}`, { method: "DELETE" });
    if (alphaExecutionSnapshot) alphaExecutionSnapshot.credentials = result.credentials || [];
    renderExecutionCredentials();
    showToast("凭据已删除，对应执行权限已撤销");
  } catch (error) { showToast(error.message, true); }
}

async function reconcileAlphaExecution({ announce = true } = {}) {
  const button = document.querySelector("#execution-reconcile");
  button.disabled = true;
  setExecutionOperationState(executionReconcileState, "正在按客户端订单号核对 Binance 状态…", "warning");
  try {
    const result = await executionRequest("/reconcile", { method: "POST", body: "{}" });
    setExecutionOperationState(executionReconcileState, result.ok ? `对账健康 · ${result.reconciled} 笔` : `对账异常 · ${result.errors?.length || 0} 项`, result.ok ? "active" : "error");
    await hydrateAlphaExecution();
    if (announce) showToast(result.ok ? "订单与持仓对账完成" : "对账发现异常，实盘保持锁定", !result.ok);
  } catch (error) {
    setExecutionOperationState(executionReconcileState, error.message, "error");
    if (announce) showToast(error.message, true);
  } finally { button.disabled = false; }
}

function ensureLivePortfolioPullSchedule() {
  const enabled = alphaExecutionAuthorized && alphaExecutionConfig.activeMode === "live" && alphaExecutionHasActiveWork() && !document.hidden;
  if (!enabled) {
    window.clearTimeout(livePortfolioPullTimer);
    livePortfolioPullTimer = null;
    if (livePortfolioPullState && alphaExecutionConfig.activeMode === "live") livePortfolioPullState.textContent = "当前无活动订单或持仓 · 可手动回捞";
    return;
  }
  if (!livePortfolioPullTimer && !livePortfolioPulling) {
    livePortfolioPullTimer = window.setTimeout(() => {
      livePortfolioPullTimer = null;
      void pullLivePortfolioData();
    }, livePortfolioPullMs);
  }
}

async function pullLivePortfolioData({ announce = false } = {}) {
  if (livePortfolioPulling || alphaExecutionConfig.activeMode !== "live") return;
  livePortfolioPulling = true;
  window.clearTimeout(livePortfolioPullTimer);
  livePortfolioPullTimer = null;
  if (livePortfolioPullButton) livePortfolioPullButton.disabled = true;
  if (livePortfolioPullState) livePortfolioPullState.textContent = "正在核对 Binance…";
  try {
    const result = await executionRequest("/reconcile", { method: "POST", body: JSON.stringify({ environment: "live", market: alphaExecutionConfig.defaultMarket }) });
    await hydrateAlphaExecution();
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    if (livePortfolioPullState) livePortfolioPullState.textContent = `${time} · 账户全量已同步${alphaExecutionHasActiveWork() ? " · 30s" : " · 当前空闲"}`;
    if (announce) showToast(result.ok ? `实盘权益、风险、盈亏及订单已回捞 · ${result.reconciled} 笔订单` : `实盘回捞发现 ${result.errors?.length || 0} 项异常`, !result.ok);
  } catch (error) {
    if (livePortfolioPullState) livePortfolioPullState.textContent = "回捞失败 · 30s 后重试";
    if (announce) showToast(error.message, true);
  } finally {
    livePortfolioPulling = false;
    if (livePortfolioPullButton) livePortfolioPullButton.disabled = false;
    ensureLivePortfolioPullSchedule();
  }
}

async function connectAlphaExecutionStream() {
  if (alphaExecutionConfig.activeMode !== "live") return showToast("WebSocket 成交回报仅用于 LIVE", true);
  const button = document.querySelector("#execution-stream");
  button.disabled = true;
  try {
    if (alphaExecutionUserSocket) alphaExecutionUserSocket.close();
    const result = await executionRequest("/user-stream", { method: "POST", body: JSON.stringify({ environment: alphaExecutionConfig.activeMode, market: alphaExecutionConfig.defaultMarket }) });
    alphaExecutionUserSocket = new WebSocket(result.wsUrl);
    alphaExecutionUserSocket.addEventListener("open", () => setExecutionOperationState(executionStreamState, "成交回报已连接", "active"));
    alphaExecutionUserSocket.addEventListener("message", () => {
      setExecutionOperationState(executionStreamState, `收到回报 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`, "active");
      window.clearTimeout(alphaExecutionTimer);
      alphaExecutionTimer = window.setTimeout(() => reconcileAlphaExecution({ announce: false }), 500);
    });
    alphaExecutionUserSocket.addEventListener("close", () => setExecutionOperationState(executionStreamState, "成交回报已断开", "warning"));
    alphaExecutionUserSocket.addEventListener("error", () => setExecutionOperationState(executionStreamState, "WebSocket 连接异常", "error"));
  } catch (error) {
    setExecutionOperationState(executionStreamState, error.message, "error");
    showToast(error.message, true);
  } finally { button.disabled = false; }
}

function syncLiveUnlockAcknowledgements() {
  const button = document.querySelector("#unlock-live");
  if (button) button.disabled = button.dataset.pending === "true" || !document.querySelector("#live-ack-funds")?.checked || !document.querySelector("#live-ack-withdraw")?.checked;
}

function initializeLiveUnlockHelp() {
  const button = document.querySelector("#live-lock-help-toggle"), panel = document.querySelector("#live-lock-help");
  if (!button || !panel) return;
  const position = () => {
    const anchor = button.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
    const cardRight = button.closest(".execution-control-panel")?.getBoundingClientRect().right ?? window.innerWidth;
    panel.style.left = `${Math.max(12, Math.min(anchor.left, Math.min(window.innerWidth, cardRight) - bounds.width - 12))}px`;
    panel.style.top = `${Math.max(12, anchor.bottom + 8 + bounds.height <= window.innerHeight - 12 ? anchor.bottom + 8 : anchor.top - bounds.height - 8)}px`;
  };
  panel.addEventListener("toggle", (event) => { const open = event.newState === "open"; button.setAttribute("aria-expanded", String(open)); if (open) position(); });
  panel.querySelector("button").addEventListener("click", () => button.focus({ preventScroll: true }));
  window.addEventListener("resize", () => { if (panel.matches(":popover-open")) position(); });
}

async function unlockAlphaLive() {
  const fundsAcknowledgement = document.querySelector("#live-ack-funds");
  const withdrawalAcknowledgement = document.querySelector("#live-ack-withdraw");
  const unlockButton = document.querySelector("#unlock-live");
  if (unlockButton?.dataset.pending === "true") return;
  if (!fundsAcknowledgement?.checked || !withdrawalAcknowledgement?.checked) {
    showToast("解锁实盘前，请先勾选两项资金与 API 安全确认", true);
    return;
  }
  unlockButton.dataset.pending = "true";
  unlockButton.disabled = true;
  try {
    await executionRequest("/live-unlock", { method: "POST", body: JSON.stringify({
      acknowledgeRealFunds: fundsAcknowledgement.checked,
      acknowledgeNoWithdrawPermission: withdrawalAcknowledgement.checked
    }) });
    fundsAcknowledgement.checked = false;
    withdrawalAcknowledgement.checked = false;
    await hydrateAlphaExecution();
    showToast("生产实盘已由双重验证管理员显式解锁", true);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    delete unlockButton.dataset.pending;
    syncLiveUnlockAcknowledgements();
  }
}

async function relockAlphaLive() {
  if (!window.confirm("立即重新加锁生产实盘？执行模式会回退至 PAPER，自动执行同时关闭。")) return;
  try {
    await executionRequest("/live-unlock", { method: "DELETE", body: "{}" });
    await hydrateAlphaExecution();
    showToast("生产实盘已重新加锁，当前回退至 PAPER");
  } catch (error) { showToast(error.message, true); }
}

function setRiskPipeline(state = "CREATED", rejected = false) {
  const stages = ["CREATED", "RISK_CHECKED", "PLANNED", "SUBMITTED", "MONITORING", "RECONCILED", "KILLED", "AUDITED"];
  const aliases = {
    NORMALIZED: "CREATED",
    DEDUPE_CHECKED: "RISK_CHECKED",
    RISK_APPROVED: "RISK_CHECKED",
    RISK_REJECTED: "RISK_CHECKED",
    APPROVED: "RISK_CHECKED",
    AWAITING_CONFIRMATION: "PLANNED",
    EXECUTING: "SUBMITTED",
    PAPER_SUBMITTED: "SUBMITTED",
    PAPER_FILLED: "SUBMITTED",
    FILLED: "SUBMITTED",
    PARTIALLY_FILLED: "SUBMITTED",
    PROTECTION_ACTIVE: "MONITORING",
    PROTECTION_ATTACHED: "MONITORING",
    RECONCILING: "RECONCILED",
    CLOSED: "AUDITED",
    FAILED: "SUBMITTED",
    UNKNOWN: "SUBMITTED",
    REJECTED: "RISK_CHECKED"
  };
  const normalized = aliases[state] || state;
  const currentIndex = Math.max(0, stages.indexOf(normalized));
  document.querySelectorAll("#risk-pipeline [data-risk-stage]").forEach((item, index) => {
    item.classList.remove("active", "complete", "rejected", "killed");
    if (index < currentIndex) item.classList.add("complete");
    if (index === currentIndex) item.classList.add(rejected ? "rejected" : normalized === "KILLED" ? "killed" : "active");
    if ((alphaExecutionSnapshot?.audits?.length || paperRiskState.audits.length) && item.dataset.riskStage === "AUDITED" && currentIndex !== stages.length - 1) item.classList.add("complete");
  });
}

function riskResultItems(items, tone) {
  return (Array.isArray(items) ? items : []).map((item) => `
    <li class="${tone}"><i>${tone === "fail" ? "×" : tone === "warn" ? "!" : "✓"}</i><span>${escapeHtml(item.message || item.code || "已检查")}</span></li>
  `).join("");
}

function renderInitialRiskDecision() {
  if (!riskDecisionView) return;
  riskDecisionView.innerHTML = `
    <div class="risk-empty-decision">
      <span class="decision-orbit"><i></i></span>
      <strong>等待交易意图</strong>
      <p>风控审批后会在这里输出完整执行计划；不会直接输出“买入”或自动开仓。</p>
      <div><span>去重</span><span>风险预算</span><span>保护单</span><span>熔断</span></div>
    </div>`;
}

function renderRiskDecision(result) {
  if (!riskDecisionView || !result) return;
  const approved = result.decision === "APPROVED" && result.executionPlan;
  const intent = result.intent || {};
  const plan = result.executionPlan;
  setRiskPipeline(result.state, !approved);

  if (!approved) {
    riskDecisionView.innerHTML = `
      <header class="decision-result-head rejected"><i>×</i><div><strong>REJECTED · 风控拒绝</strong><span>${escapeHtml(intent.symbol || "UNKNOWN")} · ${escapeHtml(intent.side || "方向缺失")}</span></div><em>NO PLAN</em></header>
      <ul class="risk-check-results">${riskResultItems(result.violations, "fail")}${riskResultItems(result.warnings, "warn")}</ul>
      <div class="decision-actions"><span>该意图未生成执行计划，任何执行环境都不会收到订单。</span></div>`;
    return;
  }

  const risk = plan.risk;
  const stop = plan.protectionOrders.find((order) => order.type === "STOP_MARKET");
  const target = plan.protectionOrders.find((order) => order.type === "TAKE_PROFIT_MARKET");
  const checks = [
    { message: "同标的同方向去重检查已通过" },
    { message: `单笔风险 ${risk.riskPct.toFixed(3)}% · ${risk.riskAmount.toFixed(2)} USDT` },
    { message: "止损与止盈保护单已校验，均为 reduce-only" }
  ];
  riskDecisionView.innerHTML = `
    <header class="decision-result-head approved"><i>✓</i><div><strong>APPROVED · ${alphaExecutionConfig.requireManualConfirmation ? "等待人工确认" : "允许受控自动执行"}</strong><span>${escapeHtml(plan.symbol)} · ${escapeHtml(plan.side)} · ${escapeHtml(plan.planId)}</span></div><em>${escapeHtml(executionModeLabel(plan.mode?.toLowerCase?.() || alphaExecutionConfig.activeMode))}</em></header>
    <div class="execution-plan-grid">
      <div><span>主订单</span><strong>${escapeHtml(plan.mainOrder.type)} · ${escapeHtml(plan.mainOrder.side)}</strong></div>
      <div><span>数量</span><strong>${formatRiskPrice(plan.mainOrder.quantity)}</strong></div>
      <div><span>名义仓位</span><strong>${risk.notional.toFixed(2)} USDT</strong></div>
      <div><span>保证金 / 杠杆</span><strong>${risk.marginRequired.toFixed(2)} · ${risk.leverage}×</strong></div>
      <div><span>参考入场</span><strong>${formatRiskPrice(intent.entryPrice)}</strong></div>
      <div><span>止损距离</span><strong>${risk.stopDistancePct.toFixed(2)}%</strong></div>
      <div><span>风险回报</span><strong>1 : ${risk.riskRewardRatio.toFixed(2)}</strong></div>
      <div><span>计划有效期</span><strong>5 MIN</strong></div>
    </div>
    <div class="protection-plan">
      <article class="stop"><i>SL</i><span>STOP MARKET<small>MARK PRICE · REDUCE ONLY</small></span><strong>${formatRiskPrice(stop?.stopPrice)}</strong></article>
      <article class="target"><i>TP</i><span>TAKE PROFIT<small>MARK PRICE · REDUCE ONLY</small></span><strong>${formatRiskPrice(target?.stopPrice)}</strong></article>
    </div>
    <ul class="risk-check-results">${riskResultItems(checks, "pass")}${riskResultItems(result.warnings, "warn")}</ul>
    <div class="decision-actions"><span>${alphaExecutionConfig.activeMode === "paper" || alphaExecutionConfig.activeMode === "mock_exchange" ? "确认前会再次复核 Binance 实时价，随后由统一执行器模拟成交。" : "确认前会再次复核 Binance 实时价；通过后才向 Binance 提交订单。"}</span><div class="decision-action-buttons"><button class="cancel-execution-plan" id="cancel-execution-plan" type="button"><span>取消执行</span><em>不提交任何订单</em></button><button class="confirm-paper-plan" id="confirm-execution-plan" type="button"><span>确认执行 ${escapeHtml(executionModeLabel())}</span><em>实时价 · 保护单 · 幂等键复核</em></button></div></div>`;
  document.querySelector("#confirm-execution-plan")?.addEventListener("click", confirmUnifiedExecutionPlan);
  document.querySelector("#cancel-execution-plan")?.addEventListener("click", cancelPendingExecutionPlan);
}

async function cancelPendingExecutionPlan() {
  const plan = pendingExecutionPlan;
  if (!plan?.planId) return showToast("当前没有可取消的待确认计划", true);
  if (!window.confirm(`取消 ${plan.symbol || "该标的"} 的待确认执行计划？不会向交易所提交订单。`)) return;
  const buttons = [...document.querySelectorAll("#cancel-execution-plan, #confirm-execution-plan")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    await executionRequest("/plans/cancel", { method: "POST", body: JSON.stringify({ planId: plan.planId, confirmation: "CANCEL_PENDING_PLAN" }) });
    pendingExecutionPlan = null;
    paperRiskState.pendingDecision = null;
    savePaperRiskState();
    await hydrateAlphaExecution();
    setRiskPipeline("CANCELED", true);
    riskDecisionView.innerHTML = `<div class="risk-empty-decision"><span class="decision-orbit"><i></i></span><strong>${escapeHtml(plan.symbol || "执行计划")} 已取消</strong><p>计划在人工确认阶段终止，未向 Binance 或模拟执行器提交任何订单。</p><div><span>CANCELED</span><span>NO ORDER</span><span>AUDITED</span></div></div>`;
    showToast(`${plan.symbol || "执行计划"} 已取消执行`);
  } catch (error) {
    showToast(error.message, true);
    buttons.forEach((button) => { button.disabled = false; });
  }
}

async function confirmUnifiedExecutionPlan({ strongTradeIntent = false } = {}) {
  const plan = pendingExecutionPlan;
  if (!plan?.planId) return showToast("当前没有可执行的审批计划", true);
  if (alphaExecutionConfig.killSwitchActive) return showToast("Kill Switch 已触发，禁止执行新计划", true);
  const button = document.querySelector("#confirm-execution-plan");
  if (button) {
    button.disabled = true;
    button.querySelector("span").textContent = "复核 Binance 实时价…";
  }
  const cancelButton = document.querySelector("#cancel-execution-plan");
  if (cancelButton) cancelButton.disabled = true;
  setRiskPipeline("EXECUTING");
  try {
    const result = await executionRequest("/execute", { method: "POST", body: JSON.stringify({ planId: plan.planId, confirmation: "EXECUTE_APPROVED_PLAN" }) });
    const symbol = plan.symbol || alphaExecutionSnapshot?.plans?.find((item) => item.id === plan.planId)?.intent?.symbol || "订单";
    pendingExecutionPlan = null;
    paperRiskState.pendingDecision = null;
    savePaperRiskState();
    await hydrateAlphaExecution();
    setRiskPipeline("MONITORING");
    if (riskDecisionView) {
      riskDecisionView.innerHTML = `<div class="risk-empty-decision${strongTradeIntent ? " strong-intent-success" : ""}"><span class="decision-orbit"><i></i></span><strong>${strongTradeIntent ? '<mark class="strong-intent-tag">强交易意图</mark>' : ""}${escapeHtml(symbol)} 已交给统一执行器</strong><p>${result.simulated ? "订单已在模拟环境成交并进入持仓监控。" : "订单已使用唯一客户端订单号提交；成交、保护单与异常恢复由服务端状态机持续监控。"}</p><div><span>RISK APPROVED</span><span>PLAN LOCKED</span><span>${result.simulated ? "SIMULATED" : "BINANCE SUBMITTED"}</span><span>RECONCILIATION</span></div></div>`;
    }
    showToast(`${symbol} 已在 ${executionModeLabel()} 环境执行`);
  } catch (error) {
    setRiskPipeline(error.payload?.state || "UNKNOWN", true);
    if (error.payload?.actionRequired === "SIGN_TRADFI_PERPS_AGREEMENT") {
      const symbol = plan.symbol || "当前标的";
      const binanceUrl = `https://www.binance.com/zh-CN/futures/${encodeURIComponent(symbol)}`;
      pendingExecutionPlan = null;
      paperRiskState.pendingDecision = null;
      savePaperRiskState();
      await hydrateAlphaExecution().catch(() => undefined);
      if (riskDecisionView) {
        riskDecisionView.innerHTML = `
          <header class="decision-result-head rejected"><i>×</i><div><strong>TRADFI AGREEMENT REQUIRED</strong><span>${escapeHtml(symbol)} · Binance -4411</span></div><em>NO ORDER</em></header>
          <ul class="risk-check-results">
            <li class="fail"><i>×</i><span>Binance 已拒绝本次请求；入口订单未成交，系统不会自动重试。</span></li>
            <li class="warn"><i>!</i><span>该标的是 Binance TradFi 永续，普通合约 API 权限不能代替账户本人签署产品协议。</span></li>
            <li class="pass"><i>✓</i><span>请使用与当前 API Key 相同的 Binance UID 完成签署，再重新连接校验并创建新交易意图。</span></li>
          </ul>
          <div class="decision-actions tradfi-agreement-actions"><span>原计划已进入 FAILED 终态，不能重复执行，也不会产生重复订单。</span><div class="decision-action-buttons"><a class="tradfi-agreement-link" href="${binanceUrl}" target="_blank" rel="noopener noreferrer"><span>打开 Binance 签署协议</span><em>USDⓈ-M · TradFi · ${escapeHtml(symbol)}</em></a><a class="tradfi-preflight-link" href="#execution-control"><span>签署后连接校验</span><em>返回交易执行中心</em></a></div></div>`;
      }
      showToast(`${symbol} 未成交：请先在 Binance 签署 TradFi Perps 协议`, true);
      return;
    }
    showToast(error.message, true);
    if (button) {
      button.disabled = false;
      button.querySelector("span").textContent = `重新执行 ${executionModeLabel()}`;
    }
    if (cancelButton) cancelButton.disabled = false;
  }
}

function closePaperPosition(positionId, reason = "MANUAL_CLOSE", explicitPrice = null) {
  const position = paperRiskState.positions.find((candidate) => candidate.positionId === positionId && candidate.status === "MONITORING");
  if (!position) return;
  const closePrice = Number(explicitPrice) || Number(position.markPrice) || Number(position.entryPrice);
  const realizedPnl = paperPositionPnl(position, closePrice);
  position.status = "CLOSED";
  position.closePrice = closePrice;
  position.markPrice = closePrice;
  position.realizedPnl = realizedPnl;
  position.closeReason = reason;
  position.closedAt = new Date().toISOString();
  paperRiskState.realizedPnl += realizedPnl;
  appendClientAudit(reason === "KILL_SWITCH" ? "KILLED" : "CLOSED", reason === "STOP_LOSS" ? "WARNING" : "OK", `纸面持仓已${reason === "KILL_SWITCH" ? "熔断平仓" : reason === "STOP_LOSS" ? "触发止损" : reason === "TAKE_PROFIT" ? "触发止盈" : "人工平仓"}。`, { positionId, closePrice, realizedPnl }, position.intentId);
  savePaperRiskState();
}

function queuePaperRender() {
  if (paperRenderQueued) return;
  paperRenderQueued = true;
  window.requestAnimationFrame(() => {
    paperRenderQueued = false;
    renderPaperWorkspace();
  });
}

function updatePaperPositionsFromMarket(symbol, price) {
  if (!Number.isFinite(Number(price))) return;
  let changed = false;
  openPaperPositions().forEach((position) => {
    if (position.symbol !== symbol) return;
    position.markPrice = Number(price);
    changed = true;
    const stopHit = position.side === "LONG" ? price <= position.stopLoss : price >= position.stopLoss;
    const targetHit = position.side === "LONG" ? price >= position.takeProfit : price <= position.takeProfit;
    if (stopHit) closePaperPosition(position.positionId, "STOP_LOSS", price);
    else if (targetHit) closePaperPosition(position.positionId, "TAKE_PROFIT", price);
  });
  if (changed) {
    savePaperRiskState();
    queuePaperRender();
  }
}

function schedulePaperMonitor(delay = paperMonitorRefreshMs) {
  window.clearTimeout(paperMonitorTimer);
  if (document.hidden) return;
  paperMonitorTimer = window.setTimeout(hydratePaperPositionMarks, delay);
}

async function hydratePaperPositionMarks() {
  window.clearTimeout(paperMonitorTimer);
  const open = openPaperPositions();
  if (!open.length) {
    schedulePaperMonitor();
    return;
  }
  try {
    const response = await fetch("https://fapi.binance.com/fapi/v1/ticker/price", { cache: "no-store" });
    if (!response.ok) throw new Error(`Paper mark ${response.status}`);
    const tickers = await response.json();
    const openSymbols = new Set(open.map((position) => position.symbol));
    (Array.isArray(tickers) ? tickers : []).forEach((ticker) => {
      if (openSymbols.has(ticker.symbol)) updatePaperPositionsFromMarket(ticker.symbol, Number(ticker.price));
    });
  } catch {
    appendClientAudit("MONITORING", "WARNING", "Binance 标记价格暂时不可用，持仓监控将在 15 秒后重试。", null, null);
    savePaperRiskState();
    renderAuditLog();
  } finally {
    schedulePaperMonitor();
  }
}

function renderPositionMonitor() {
  const open = openPaperPositions();
  if (monitorCount) monitorCount.textContent = `${open.length} OPEN`;
  if (!positionMonitorList) return;
  if (!open.length) {
    positionMonitorList.innerHTML = '<div class="risk-list-empty"><strong>暂无纸面持仓</strong><span>执行计划经人工确认后才会进入监控</span></div>';
    return;
  }
  positionMonitorList.innerHTML = open.slice().reverse().map((position) => {
    const pnl = paperPositionPnl(position);
    const pnlPct = position.notional > 0 ? pnl / position.notional * 100 : 0;
    return `<article class="monitor-item">
      <i>${escapeHtml(position.symbol[0])}</i>
      <div><strong>${escapeHtml(position.symbol)} · ${escapeHtml(position.side)}${position.strongTradeIntent ? '<mark class="strong-intent-tag">强交易意图</mark>' : ""}</strong><span>MARK ${formatRiskPrice(position.markPrice)} · SL ${formatRiskPrice(position.stopLoss)} · TP ${formatRiskPrice(position.takeProfit)}</span></div>
      <div class="monitor-pnl"><strong class="${pnl >= 0 ? "up" : "down"}">${formatSignedMoney(pnl)}</strong><span>${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%</span></div>
      <button class="paper-close" type="button" data-close-position="${escapeHtml(position.positionId)}">人工平仓</button>
    </article>`;
  }).join("");
}

function renderAuditLog() {
  if (!riskAuditList) return;
  const audits = paperRiskState.audits.slice().reverse().slice(0, 80);
  if (!audits.length) {
    riskAuditList.innerHTML = '<div class="risk-list-empty"><strong>等待首条审计事件</strong><span>审批、确认、保护单、平仓和熔断都会留痕</span></div>';
    return;
  }
  riskAuditList.innerHTML = audits.map((audit) => {
    const tone = audit.status === "REJECTED" || audit.state === "REJECTED" ? "rejected" : audit.state === "KILLED" ? "killed" : audit.status === "WARNING" ? "warning" : "";
    const timestamp = new Date(audit.timestamp);
    const time = Number.isNaN(timestamp.getTime()) ? "—" : timestamp.toLocaleTimeString("zh-CN", { hour12: false });
    return `<article class="audit-item ${tone}"><i></i><div><strong>${escapeHtml(audit.state)} · ${escapeHtml(audit.status)}</strong><span title="${escapeHtml(audit.message)}">${escapeHtml(audit.message)}</span></div><time>${time}</time></article>`;
  }).join("");
}

function formatPaperOrderTime(value) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return { date: "历史订单", time: "—", full: "未记录创建时间", iso: "" };
  }
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23"
  }).formatToParts(timestamp);
  const part = (type) => parts.find((item) => item.type === type)?.value || "—";
  const date = `${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}:${part("second")}`;
  return {
    date,
    time,
    full: `${part("year")}-${date} ${time} · UTC+8`,
    iso: timestamp.toISOString()
  };
}

function buildPaperSessionArchive() {
  const archivedAt = new Date().toISOString();
  const sourcePositions = paperRiskState.positions.slice(-100);
  const positions = sourcePositions.map((position) => {
    const open = position.status === "MONITORING";
    return {
      ...clonePaperData(position),
      archivedPnl: open ? paperPositionPnl(position) : Number(position.realizedPnl) || 0,
      archivedMarkPrice: Number(open ? position.markPrice : position.closePrice) || Number(position.entryPrice) || 0,
      archivedStatus: open ? "ARCHIVED_OPEN" : position.status
    };
  });
  const open = sourcePositions.filter((position) => position.status === "MONITORING");
  const unrealizedPnl = open.reduce((sum, position) => sum + paperPositionPnl(position), 0);
  const realizedPnl = Number(paperRiskState.realizedPnl) || 0;
  const startingEquity = Number(paperRiskState.startingEquity) || 10_000;
  const finalEquity = startingEquity + realizedPnl + unrealizedPnl;
  const exposure = open.reduce((sum, position) => sum + (Number(position.notional) || 0), 0);
  const winCount = positions.filter((position) => Number(position.archivedPnl) > 0).length;
  return {
    archiveId: makeClientId("PAPER-HISTORY"),
    sessionStartedAt: paperRiskState.sessionStartedAt || inferPaperSessionStartedAt(paperRiskState),
    archivedAt,
    mode: "PAPER",
    summary: {
      startingEquity,
      finalEquity,
      realizedPnl,
      unrealizedPnl,
      totalPnl: realizedPnl + unrealizedPnl,
      exposure,
      exposurePct: startingEquity > 0 ? exposure / startingEquity * 100 : 0,
      tradeCount: positions.length,
      openCount: open.length,
      closedCount: positions.length - open.length,
      winCount,
      killSwitch: paperRiskState.killSwitch === true,
      intentCount: paperRiskState.intents.length,
      auditCount: paperRiskState.audits.length
    },
    policy: currentRiskPolicy(),
    pendingPlan: pendingExecutionPlan ? {
      planId: pendingExecutionPlan.planId,
      symbol: pendingExecutionPlan.symbol,
      side: pendingExecutionPlan.side,
      expiresAt: pendingExecutionPlan.expiresAt
    } : null,
    positions,
    intents: clonePaperData(paperRiskState.intents.slice(-60)),
    audits: clonePaperData(paperRiskState.audits.slice(-100))
  };
}

function formatPaperSessionDuration(startValue, endValue) {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "时长未知";
  const minutes = Math.max(1, Math.round((end - start) / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (hours < 24) return `${hours} 小时${remaining ? ` ${remaining} 分` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

function renderPaperHistoryPositions(archive) {
  const positions = Array.isArray(archive.positions) ? archive.positions.slice().reverse() : [];
  if (!positions.length) return '<div class="paper-history-no-orders"><strong>本期未产生纸面订单</strong><span>风控意图与审计摘要仍已保存。</span></div>';
  const rows = positions.map((position) => {
    const pnl = Number(position.archivedPnl) || 0;
    const pnlPct = Number(position.notional) > 0 ? pnl / Number(position.notional) * 100 : 0;
    const orderTime = formatPaperOrderTime(position.createdAt || position.openedAt);
    const snapshotOpen = position.archivedStatus === "ARCHIVED_OPEN";
    const status = snapshotOpen ? "期末持仓" : position.closeReason || position.status || "CLOSED";
    return `<tr>
      <td><span class="paper-symbol-title"><strong>${escapeHtml(position.symbol || "UNKNOWN")}</strong>${position.strongTradeIntent ? '<mark class="strong-intent-tag">强交易意图</mark>' : ""}</span><span>永续 · ${Number(position.leverage) || 1}× · PAPER</span></td>
      <td><time class="paper-order-time" datetime="${escapeHtml(orderTime.iso)}" title="${escapeHtml(orderTime.full)}"><strong>${escapeHtml(orderTime.date)}</strong><span>${escapeHtml(orderTime.time)}</span></time></td>
      <td><em class="${position.side === "SHORT" ? "short-tag" : "long-tag"}">${escapeHtml(position.side || "—")}</em></td>
      <td><strong>${formatRiskPrice(position.entryPrice)}</strong><span>${formatRiskPrice(position.archivedMarkPrice)}</span></td>
      <td>${(Number(position.notional) || 0).toFixed(2)} USDT</td>
      <td><span>${formatRiskPrice(position.stopLoss)} / ${formatRiskPrice(position.takeProfit)}</span></td>
      <td><strong class="${pnl >= 0 ? "up" : "down"}">${formatSignedMoney(pnl)}</strong><span>${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%</span></td>
      <td><span>${escapeHtml(position.source || "manual")}</span></td>
      <td><em class="paper-history-status ${snapshotOpen ? "snapshot" : "closed"}">${escapeHtml(status)}</em></td>
    </tr>`;
  }).join("");
  return `<div class="paper-table-wrap paper-history-table-wrap"><table class="paper-table paper-history-table"><thead><tr><th>标的</th><th>下单时间</th><th>方向</th><th>入场 / 期末</th><th>仓位</th><th>止损 / 止盈</th><th>本期盈亏</th><th>来源</th><th>结果</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderPaperHistory() {
  if (paperHistoryCount) paperHistoryCount.textContent = String(paperHistory.length);
  if (!paperHistoryList) return;
  if (!paperHistory.length) {
    paperHistoryList.innerHTML = '<div class="paper-history-empty"><i>↺</i><strong>暂无历史测试</strong><span>点击“一键还原”后，当前测试会先归档到这里。</span></div>';
    return;
  }
  paperHistoryList.innerHTML = paperHistory.map((archive, index) => {
    const summary = archive.summary || {};
    const archivedTime = formatPaperOrderTime(archive.archivedAt);
    const startedTime = formatPaperOrderTime(archive.sessionStartedAt);
    const totalPnl = Number(summary.totalPnl) || 0;
    const tradeCount = Number(summary.tradeCount) || 0;
    const winRate = tradeCount > 0 ? (Number(summary.winCount) || 0) / tradeCount * 100 : 0;
    const policy = archive.policy || {};
    return `<details class="paper-history-session"${index === 0 ? " open" : ""}>
      <summary>
        <span class="paper-history-sequence">#${String(paperHistory.length - index).padStart(2, "0")}</span>
        <span class="paper-history-title"><strong>${escapeHtml(archivedTime.full.replace(" · UTC+8", ""))}</strong><em>${formatPaperSessionDuration(archive.sessionStartedAt, archive.archivedAt)} · ${tradeCount} 笔订单</em></span>
        <span class="paper-history-summary-equity"><em>期末权益</em><strong>${(Number(summary.finalEquity) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
        <span class="paper-history-summary-pnl"><em>总盈亏</em><strong class="${totalPnl >= 0 ? "up" : "down"}">${formatSignedMoney(totalPnl)}</strong></span>
        <i class="paper-history-chevron">⌄</i>
      </summary>
      <div class="paper-history-session-body">
        <div class="paper-history-metrics">
          <span><em>起始权益</em><strong>${(Number(summary.startingEquity) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</strong></span>
          <span><em>已实现 / 浮动</em><strong>${formatSignedMoney(summary.realizedPnl)} / ${formatSignedMoney(summary.unrealizedPnl)}</strong></span>
          <span><em>期末持仓 / 已平仓</em><strong>${Number(summary.openCount) || 0} / ${Number(summary.closedCount) || 0}</strong></span>
          <span><em>盈利订单率</em><strong>${winRate.toFixed(1)}%</strong></span>
          <span><em>期末风险敞口</em><strong>${(Number(summary.exposurePct) || 0).toFixed(1)}%</strong></span>
        </div>
        <div class="paper-history-meta"><span>开始 ${escapeHtml(startedTime.full)}</span><span>意图 ${Number(summary.intentCount) || 0}</span><span>审计 ${Number(summary.auditCount) || 0}</span><span class="${summary.killSwitch ? "down" : "up"}">KILL SWITCH ${summary.killSwitch ? "ON" : "OFF"}</span>${archive.pendingPlan ? `<span class="pending">归档时存在待确认计划 ${escapeHtml(archive.pendingPlan.symbol || "")}</span>` : ""}</div>
        <div class="paper-history-policy"><span>单笔风险 ${Number(policy.riskPerTradePct) || 0}%</span><span>最大杠杆 ${Number(policy.maxLeverage) || 0}×</span><span>单日熔断 -${Number(policy.dailyLossLimitPct) || 0}%</span><span>去重 ${Number(policy.dedupeWindowMinutes) || 0} min</span></div>
        ${renderPaperHistoryPositions(archive)}
      </div>
    </details>`;
  }).join("");
}

function setPaperView(view) {
  activePaperView = view === "history" ? "history" : "current";
  if (paperCurrentView) paperCurrentView.hidden = activePaperView !== "current";
  if (paperHistoryView) paperHistoryView.hidden = activePaperView !== "history";
  if (paperResetButton) paperResetButton.hidden = activePaperView !== "current";
  paperViewTabs.forEach((tab) => {
    const active = tab.dataset.paperView === activePaperView;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  if (activePaperView === "history") renderPaperHistory();
}

function renderPaperTable() {
  if (!paperRows) return;
  if (alphaExecutionAuthorized && alphaExecutionConfig.activeMode !== "paper") {
    renderActiveExecutionPortfolio();
    return;
  }
  const positions = paperRiskState.positions.slice().reverse().slice(0, 30);
  if (!positions.length) {
    paperRows.innerHTML = '<tr class="paper-empty-row"><td colspan="9"><strong>暂无纸面交易</strong><span>从雷达候选创建交易意图，通过 Risk Engine 并人工确认后显示</span></td></tr>';
    return;
  }
  paperRows.innerHTML = positions.map((position) => {
    const open = position.status === "MONITORING";
    const pnl = open ? paperPositionPnl(position) : Number(position.realizedPnl) || 0;
    const pnlPct = position.notional > 0 ? pnl / position.notional * 100 : 0;
    const orderTime = formatPaperOrderTime(position.createdAt || position.openedAt);
    return `<tr>
      <td><span class="paper-symbol-title"><strong>${escapeHtml(position.symbol)}</strong>${position.strongTradeIntent ? '<mark class="strong-intent-tag">强交易意图</mark>' : ""}</span><span>永续 · ${position.leverage}× · PAPER</span></td>
      <td><time class="paper-order-time" datetime="${escapeHtml(orderTime.iso)}" title="${escapeHtml(orderTime.full)}"><strong>${escapeHtml(orderTime.date)}</strong><span>${escapeHtml(orderTime.time)}</span></time></td>
      <td><em class="${position.side === "LONG" ? "long-tag" : "short-tag"}">${escapeHtml(position.side)}</em></td>
      <td><strong>${formatRiskPrice(position.entryPrice)}</strong><span>${formatRiskPrice(open ? position.markPrice : position.closePrice)}</span></td>
      <td>${Number(position.notional).toFixed(2)} USDT</td>
      <td><span>${formatRiskPrice(position.stopLoss)} / ${formatRiskPrice(position.takeProfit)}</span></td>
      <td><strong class="${pnl >= 0 ? "up" : "down"}">${formatSignedMoney(pnl)}</strong><span>${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%</span></td>
      <td><span>${escapeHtml(position.source || "manual")}</span></td>
      <td><span class="paper-action-cell">${open ? '<em class="state-open">监控中</em>' : `<em class="state-closed">${escapeHtml(position.closeReason || "CLOSED")}</em>`}${open ? `<button class="paper-close" type="button" data-close-position="${escapeHtml(position.positionId)}">平仓</button>` : ""}</span></td>
    </tr>`;
  }).join("");
}

function renderActiveExecutionPortfolio() {
  if (!paperRows) return;
  const positions = activeExecutionPositions();
  const mode = alphaExecutionConfig.activeMode;
  if (!positions.length) {
    paperRows.innerHTML = `<tr class="paper-empty-row"><td colspan="9"><strong>暂无 ${escapeHtml(executionModeLabel())} 持仓</strong><span>通过 Risk Engine 生成当前环境执行计划并确认后，将在这里显示交易所持仓</span></td></tr>`;
    return;
  }
  paperRows.innerHTML = positions.map((position) => {
    const pnl = Number(position.unrealizedPnl) || 0;
    const entry = Number(position.entryPrice) || 0;
    const notional = Number(position.quantity || 0) * Number(position.markPrice || entry);
    const pnlPct = notional > 0 ? pnl / notional * 100 : 0;
    const orderTime = formatPaperOrderTime(position.openedAt || position.createdAt);
    const leverage = Number(position.plan?.intent?.leverage) || 1;
    const source = activePortfolioSource(position);
    return `<tr>
      <td><span class="paper-symbol-title"><strong>${escapeHtml(position.symbol)}</strong>${automationTradeBadge(position)}</span><span>${escapeHtml(executionMarketLabel(executionEnum(position.market)))} · ${leverage}× · ${escapeHtml(executionModeLabel(mode))}</span></td>
      <td><time class="paper-order-time" datetime="${escapeHtml(orderTime.iso)}" title="${escapeHtml(orderTime.full)}"><strong>${escapeHtml(orderTime.date)}</strong><span>${escapeHtml(orderTime.time)}</span></time></td>
      <td><em class="${position.side === "LONG" ? "long-tag" : "short-tag"}">${escapeHtml(position.side)}</em></td>
      <td><strong>${formatRiskPrice(entry)}</strong><span>${formatRiskPrice(position.markPrice)}</span></td>
      <td>${notional.toFixed(2)} USDT</td>
      <td><span>${formatRiskPrice(position.stopLoss)} / ${formatRiskPrice(position.takeProfit)}</span></td>
      <td><strong class="${pnl >= 0 ? "up" : "down"}">${formatSignedMoney(pnl)}</strong><span>${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%</span></td>
      <td><span>${escapeHtml(source)}</span></td>
      <td><span class="paper-action-cell"><em class="state-open">${escapeHtml(String(position.state || "MONITORING"))}</em>${mode === "live" ? `<span class="live-position-actions"><button type="button" data-live-protection="${escapeHtml(position.id)}">止盈 / 止损</button><button class="danger" type="button" data-live-close="${escapeHtml(position.id)}">平仓</button></span>` : ""}</span></td>
    </tr>`;
  }).join("");
}

async function closeActiveLivePosition(positionId, button) {
  const position = activeExecutionPositions().find((item) => item.id === positionId);
  if (!position) return showToast("当前实盘持仓已不存在，请先执行数据回捞", true);
  if (!window.confirm(`确认以市价平仓 ${position.symbol} ${position.side} 全部 ${formatRiskPrice(position.quantity)}？系统会先撤销保护单。`)) return;
  button.disabled = true;
  try {
    await executionRequest("/positions/action", { method: "POST", body: JSON.stringify({ positionId, action: "close", confirmation: "CLOSE_POSITION_NOW" }) });
    await pullLivePortfolioData({ announce: false });
    showToast(`${position.symbol} 实盘平仓指令已提交并进入对账`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function replaceActiveLiveProtection(positionId, button) {
  const position = activeExecutionPositions().find((item) => item.id === positionId);
  if (!position) return showToast("当前实盘持仓已不存在，请先执行数据回捞", true);
  const stopText = window.prompt(`${position.symbol} 新止损价格`, String(position.stopLoss));
  if (stopText == null) return;
  const targetText = window.prompt(`${position.symbol} 新止盈价格`, String(position.takeProfit));
  if (targetText == null) return;
  const stopLoss = Number(stopText);
  const takeProfit = Number(targetText);
  if (!(stopLoss > 0) || !(takeProfit > 0)) return showToast("止损和止盈必须是大于 0 的有效价格", true);
  if (!window.confirm(`确认替换 ${position.symbol} 的保护单？\n止损 ${formatRiskPrice(stopLoss)} · 止盈 ${formatRiskPrice(takeProfit)}\n失败时系统将触发紧急保护。`)) return;
  button.disabled = true;
  try {
    await executionRequest("/positions/action", { method: "POST", body: JSON.stringify({ positionId, action: "replace_protection", stopLoss, takeProfit, confirmation: "REPLACE_PROTECTION" }) });
    await pullLivePortfolioData({ announce: false });
    showToast(`${position.symbol} 实盘止损 / 止盈已替换`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function renderPaperWorkspace() {
  renderLiveSummaryMetrics();
  if (alphaExecutionAuthorized && alphaExecutionConfig.activeMode !== "paper") {
    const positions = activeExecutionPositions();
    const portfolioStats = activeExecutionPortfolioStats();
    const unrealized = Number.isFinite(Number(portfolioStats?.unrealizedPnl))
      ? Number(portfolioStats.unrealizedPnl)
      : positions.reduce((sum, position) => sum + (Number(position.unrealizedPnl) || 0), 0);
    const exposure = Number.isFinite(Number(portfolioStats?.riskExposureNotional))
      ? Number(portfolioStats.riskExposureNotional)
      : positions.reduce((sum, position) => sum + Number(position.quantity || 0) * Number(position.markPrice || position.entryPrice || 0), 0);
    const credential = activeExecutionCredential();
    const equity = Number(portfolioStats?.equity ?? credential?.permissionSummary?.equity);
    if (paperEquity) paperEquity.textContent = Number.isFinite(equity) ? `${equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : "对账后同步";
    if (portfolioEquityLabel) portfolioEquityLabel.textContent = alphaExecutionConfig.activeMode === "live" ? "Binance 权益" : "环境权益";
    if (paperPnl) {
      paperPnl.textContent = formatSignedMoney(unrealized);
      paperPnl.className = unrealized >= 0 ? "up" : "down";
    }
    if (paperExposure) paperExposure.textContent = Number.isFinite(equity) && equity > 0 ? `${(exposure / equity * 100).toFixed(1)}%` : `${exposure.toFixed(2)} USDT`;
    if (document.querySelector("#intent-equity")) document.querySelector("#intent-equity").textContent = Number.isFinite(equity) ? `${equity.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT` : "服务端实时读取";
    renderExecutionPositions();
    renderActiveExecutionPortfolio();
    renderExecutionAudits();
    return;
  }
  const open = openPaperPositions();
  const unrealized = open.reduce((sum, position) => sum + paperPositionPnl(position), 0);
  const equity = currentPaperEquity(true);
  const exposure = open.reduce((sum, position) => sum + (Number(position.notional) || 0), 0);
  if (paperEquity) paperEquity.textContent = `${equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  if (paperPnl) {
    paperPnl.textContent = formatSignedMoney(unrealized);
    paperPnl.className = unrealized >= 0 ? "up" : "down";
  }
  if (paperExposure) paperExposure.textContent = `${currentPaperEquity() > 0 ? (exposure / currentPaperEquity() * 100).toFixed(1) : "0.0"}%`;
  if (document.querySelector("#intent-equity")) document.querySelector("#intent-equity").textContent = `${currentPaperEquity().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

  const killActive = alphaExecutionAuthorized ? alphaExecutionConfig.killSwitchActive : paperRiskState.killSwitch;
  killSwitchButton?.classList.toggle("active", killActive);
  if (killSwitchButton) killSwitchButton.querySelector("em").textContent = killActive ? "已熔断" : "未触发";
  if (riskSubmit) riskSubmit.disabled = killActive || !alphaExecutionAuthorized;
  if (alphaExecutionAuthorized) renderExecutionPositions();
  else renderPositionMonitor();
  renderPaperTable();
  if (alphaExecutionAuthorized) renderExecutionAudits();
  else renderAuditLog();
}

async function submitTradeIntent(event) {
  event.preventDefault();
  if (!alphaExecutionAuthorized) {
    showToast("请先登录具备交易执行权限的账户", true);
    return;
  }
  if (alphaExecutionConfig.killSwitchActive) {
    showToast("Kill Switch 已触发，禁止创建新意图", true);
    return;
  }
  try {
    await flushExecutionConfig();
    riskSubmit.disabled = true;
    riskSubmit.querySelector("span").textContent = "同步 Binance 实时价…";
    await refreshIntentReferencePrice();
  } catch (error) {
    riskSubmit.disabled = false;
    riskSubmit.querySelector("span").textContent = "提交 Risk Engine 审批";
    showToast(error?.message || "风控参数或 Binance 实时价尚未成功同步，已阻止本次审批", true);
    return;
  }
  const policy = currentRiskPolicy();
  const formData = new FormData(tradeIntentForm);
  const intent = {
    mode: alphaExecutionConfig.activeMode,
    market: formData.get("market") || alphaExecutionConfig.defaultMarket,
    symbol: formData.get("symbol"),
    side: formData.get("side"),
    entryPrice: Number(formData.get("entryPrice")),
    stopLoss: Number(formData.get("stopLoss")),
    takeProfit: Number(formData.get("takeProfit")),
    leverage: (formData.get("market") || alphaExecutionConfig.defaultMarket) === "spot" ? 1 : Number(formData.get("leverage")),
    riskPct: policy.riskPerTradePct,
    source: formData.get("source"),
    alphaScore: Number(formData.get("alphaScore")),
    orderType: formData.get("orderType") || "MARKET",
    ...(alphaExecutionConfig.activeMode === "paper" || alphaExecutionConfig.activeMode === "mock_exchange"
      ? { equity: currentPaperEquity(), dailyPnl: todayPaperPnl() }
      : {})
  };

  riskSubmit.disabled = true;
  riskSubmit.querySelector("span").textContent = "Risk Engine 审批中…";
  setRiskPipeline("CREATED");
  try {
    const result = await executionRequest("/intents", { method: "POST", body: JSON.stringify(intent) });
    pendingExecutionPlan = result.ok ? result.executionPlan : null;
    paperRiskState.pendingDecision = result.ok ? result : null;
    savePaperRiskState();
    renderRiskDecision(result);
    await hydrateAlphaExecution();
    if (result.ok && alphaExecutionConfig.autoExecuteEnabled && !alphaExecutionConfig.requireManualConfirmation) {
      await confirmUnifiedExecutionPlan();
    } else {
      showToast(`${result.intent.symbol} 风控审批通过，等待${alphaExecutionConfig.requireManualConfirmation ? "人工确认" : "执行器放行"}`);
    }
  } catch (error) {
    if (error.payload?.decision) {
      renderRiskDecision(error.payload);
      await hydrateAlphaExecution();
      showToast(`${error.payload.intent?.symbol || "该意图"} 已被风控拒绝`, true);
      return;
    }
    pendingExecutionPlan = null;
    paperRiskState.pendingDecision = null;
    savePaperRiskState();
    setRiskPipeline("REJECTED", true);
    riskDecisionView.innerHTML = `<div class="risk-empty-decision"><strong>Risk Engine 未放行</strong><p>${escapeHtml(error.message)}。默认拒绝：服务异常时不会创建执行计划或订单。</p><div><span>FAIL CLOSED</span><span>NO ORDER</span></div></div>`;
    showToast(error.message, true);
  } finally {
    riskSubmit.disabled = alphaExecutionConfig.killSwitchActive || !alphaExecutionAuthorized;
    riskSubmit.querySelector("span").textContent = "提交 Risk Engine 审批";
  }
}

async function togglePaperKillSwitch() {
  if (!alphaExecutionAuthorized) return showToast("请先登录具备交易执行权限的账户", true);
  const active = alphaExecutionConfig.killSwitchActive;
  const prompt = active
    ? "解除统一 Kill Switch？只有最近一次对账健康且不存在 UNKNOWN 持仓时才会获准。"
    : `触发统一 Kill Switch？这会停止自动执行、撤销待执行计划，并处置 ${executionModeLabel()} 下的可识别持仓。`;
  if (!window.confirm(prompt)) return;
  killSwitchButton.disabled = true;
  try {
    await executionRequest("/kill-switch", { method: active ? "DELETE" : "POST", body: "{}" });
    pendingExecutionPlan = null;
    paperRiskState.pendingDecision = null;
    savePaperRiskState();
    await hydrateAlphaExecution();
    setRiskPipeline(active ? "RECONCILED" : "KILLED");
    showToast(active ? "统一 Kill Switch 已解除" : "统一 Kill Switch 已触发", !active);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    killSwitchButton.disabled = false;
  }
}

function resetPaperControlsToDefaults() {
  document.querySelectorAll(".risk-rules select").forEach((control) => {
    const defaultOption = [...control.options].find((option) => option.defaultSelected) || control.options[0];
    if (defaultOption) control.value = defaultOption.value;
    window.localStorage.removeItem(`alpha-radar-${control.id}`);
  });
  tradeIntentForm?.reset();
}

function resetPaperTradingSession() {
  const archive = buildPaperSessionArchive();
  const previousHistory = paperHistory.slice();
  paperHistory = [archive, ...paperHistory].slice(0, paperHistoryLimit);
  if (!savePaperHistory()) {
    paperHistory = previousHistory;
    showToast("历史快照保存失败，未执行一键还原", true);
    return;
  }

  window.clearTimeout(paperMonitorTimer);
  pendingExecutionPlan = null;
  paperRiskState = createInitialPaperRiskState();
  resetPaperControlsToDefaults();
  savePaperRiskState();
  renderInitialRiskDecision();
  setRiskPipeline("CREATED");
  renderPaperWorkspace();
  renderPaperHistory();
  setPaperView("history");
  schedulePaperMonitor(0);
  showToast(`当前纸面测试已归档，账户已还原为 10,000.00 USDT`);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function initializePaperRiskEngine() {
  loadPaperRiskState();
  loadPaperHistory();
  loadStrongTradeIntentSeen();
  paperRiskState.pendingDecision = null;
  pendingExecutionPlan = null;
  setRiskPipeline(openPaperPositions().length ? "MONITORING" : "CREATED");
  renderPaperWorkspace();
  renderPaperHistory();
  setPaperView(activePaperView);
  schedulePaperMonitor(0);
}

function canonicalIntentSymbol(value) {
  const base = normalizeRiskPoolSymbol(value);
  return base ? `${base}USDT` : "";
}

function validCandidateNumber(value) {
  const number = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function candidateDirection(value) {
  const normalized = String(value || "").toLowerCase();
  if (["long", "buy", "gain", "up", "多", "做多"].includes(normalized)) return "LONG";
  if (["short", "sell", "loss", "down", "空", "做空"].includes(normalized)) return "SHORT";
  return null;
}

function consensusCandidateDirection(values) {
  const directions = values.map(candidateDirection).filter(Boolean);
  const longCount = directions.filter((direction) => direction === "LONG").length;
  const shortCount = directions.filter((direction) => direction === "SHORT").length;
  if (!directions.length || longCount === shortCount) return null;
  return longCount > shortCount ? "LONG" : "SHORT";
}

async function resolveCandidateReferencePrice(symbol, hints = []) {
  const canonical = canonicalIntentSymbol(symbol);
  const cached = validCandidateNumber(lastMarketPrices.get(canonical));
  if (cached) return cached;

  const endpoints = [
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${encodeURIComponent(canonical)}`,
    `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(canonical)}`
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json();
      const price = validCandidateNumber(payload.price);
      if (price) {
        lastMarketPrices.set(canonical, price);
        return price;
      }
    } catch {
      // Try the next Binance market, then fall back to the candidate snapshot.
    }
  }

  for (const hint of hints) {
    const price = validCandidateNumber(hint);
    if (price) return price;
  }
  return null;
}

function populateCandidateIntent({ symbol, side, entryPrice, score, source, volatility = 0 }) {
  const stopPct = Math.min(8, Math.max(4, 4 + Math.abs(Number(volatility) || 0) * 0.05));
  const stopDistance = stopPct / 100;
  const rewardDistance = stopDistance * 2;
  const stopLoss = side === "LONG" ? entryPrice * (1 - stopDistance) : entryPrice * (1 + stopDistance);
  const takeProfit = side === "LONG" ? entryPrice * (1 + rewardDistance) : entryPrice * (1 - rewardDistance);

  document.querySelector("#intent-symbol").value = canonicalIntentSymbol(symbol);
  document.querySelector("#intent-side").value = side;
  document.querySelector("#intent-entry").value = formatRiskPrice(entryPrice).replaceAll(",", "");
  document.querySelector("#intent-stop").value = formatRiskPrice(stopLoss).replaceAll(",", "");
  document.querySelector("#intent-target").value = formatRiskPrice(takeProfit).replaceAll(",", "");
  document.querySelector("#intent-score").value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  document.querySelector("#intent-source").value = source;
}

function applyLiveIntentReferencePrice(nextPrice) {
  const entryField = document.querySelector("#intent-entry");
  const stopField = document.querySelector("#intent-stop");
  const targetField = document.querySelector("#intent-target");
  const side = document.querySelector("#intent-side")?.value || "LONG";
  const previousEntry = Number(entryField?.value);
  const previousStop = Number(stopField?.value);
  const previousTarget = Number(targetField?.value);
  const stopDistance = previousEntry > 0 && previousStop > 0 ? Math.abs(previousEntry - previousStop) / previousEntry : 0.04;
  const rewardDistance = previousEntry > 0 && previousTarget > 0 ? Math.abs(previousTarget - previousEntry) / previousEntry : stopDistance * 2;
  const inputPrice = (value) => Number(Number(value).toPrecision(14)).toString();
  entryField.value = inputPrice(nextPrice);
  stopField.value = inputPrice(side === "LONG" ? nextPrice * (1 - stopDistance) : nextPrice * (1 + stopDistance));
  targetField.value = inputPrice(side === "LONG" ? nextPrice * (1 + rewardDistance) : nextPrice * (1 - rewardDistance));
}

async function refreshIntentReferencePrice({ announce = false } = {}) {
  const symbol = canonicalIntentSymbol(document.querySelector("#intent-symbol")?.value);
  const market = document.querySelector("#intent-market")?.value || alphaExecutionConfig.defaultMarket;
  if (!symbol) throw new Error("请先输入有效的 USDT 标的");
  const query = new URLSearchParams({ symbol, market });
  const result = await executionRequest(`/price?${query}`);
  applyLiveIntentReferencePrice(Number(result.price));
  if (announce) showToast(`${symbol} Binance 实时价已同步 · ${formatRiskPrice(result.price)}`);
  return result;
}

function latestSignalCandidate() {
  const signal = latestTelegramSignals[0];
  if (!signal?.symbol) return null;
  return {
    symbol: signal.symbol,
    side: candidateDirection(signal.direction),
    score: Math.round(Math.max(0, Math.min(1, Number(signal.confidence) || 0)) * 100),
    volatility: Number(signal.price_change_pct) || 0,
    hints: [signal.price, findToken(normalizeRiskPoolSymbol(signal.symbol))?.price],
    source: "telegram"
  };
}

function latestRiskPoolCandidate() {
  const candidate = buildRiskPoolModel().candidates[0];
  if (!candidate) return null;
  const scanToken = candidate.scan?.token;
  const signal = candidate.signal?.signal;
  const momentum = candidate.momentum;
  const side = consensusCandidateDirection([scanToken?.bias, signal?.direction, momentum?.momentumTone]);
  const scanScore = Number(scanToken?.score);
  const signalScore = Math.round(Math.max(0, Math.min(1, Number(signal?.confidence) || 0)) * 100);
  const score = Number.isFinite(scanScore) ? scanScore : signal ? signalScore : 80;
  return {
    symbol: candidate.symbol,
    side,
    score,
    volatility: Number(scanToken?.change ?? momentum?.change24h ?? signal?.price_change_pct) || 0,
    hints: [scanToken?.price, momentum?.price, signal?.price],
    source: "risk-pool",
    sourceCount: candidate.sourceCount
  };
}

async function autoSubmitCandidate(kind) {
  const button = kind === "signal" ? loadSignalCandidateButton : loadPoolCandidateButton;
  if (!button || button.disabled) return;
  if (alphaExecutionConfig.killSwitchActive) {
    showToast("Kill Switch 已触发，禁止创建新交易意图", true);
    return;
  }

  button.disabled = true;
  button.classList.add("loading");
  const label = button.querySelector("span");
  const defaultLabel = label.textContent;
  label.textContent = kind === "signal" ? "读取最新信号…" : "读取风控候选…";
  try {
    if (kind === "signal" && !latestTelegramSignals.length) await hydrateRecentSignals({ force: true });
    const candidate = kind === "signal" ? latestSignalCandidate() : latestRiskPoolCandidate();
    if (!candidate) {
      showToast(kind === "signal" ? "信号流水暂无可用候选" : "雷达执行池暂无可用候选", true);
      return;
    }
    if (!candidate.side) {
      showToast(`${candidate.symbol} 的来源方向冲突或不明确，未自动送审`, true);
      return;
    }
    label.textContent = "同步 Binance 价格…";
    const entryPrice = await resolveCandidateReferencePrice(candidate.symbol, candidate.hints);
    if (!entryPrice) {
      showToast(`${candidate.symbol} 暂时无法取得 Binance 参考价，未提交审批`, true);
      return;
    }

    populateCandidateIntent({ ...candidate, entryPrice });
    document.querySelector("#risk")?.scrollIntoView({ behavior: "smooth", block: "start" });
    appendClientAudit("CREATED", "SOURCE_SELECTED", `${kind === "signal" ? "信号流水" : "雷达执行池"}最新候选 ${canonicalIntentSymbol(candidate.symbol)} 已自动创建交易意图。`, { sourceCount: candidate.sourceCount || 1, entryPrice }, null);
    savePaperRiskState();
    renderAuditLog();
    label.textContent = "提交 Risk Engine…";
    await submitTradeIntent({ preventDefault() {} });
  } finally {
    button.disabled = false;
    button.classList.remove("loading");
    label.textContent = defaultLabel;
  }
}

function queueTrade(token) {
  if (!token) return;
  const side = token.bias === "neutral"
    ? selectedNeutralDirection
    : token.bias === "long" ? "LONG" : "SHORT";
  if (!side) {
    showToast(`${token.symbol} 当前为中性信号，请先手动选择做多或做空`, true);
    return;
  }
  const entry = Number(String(token.price || "").replace(/[$,]/g, ""));
  if (!(entry > 0)) {
    showToast(`${token.symbol} 缺少有效参考价格`, true);
    return;
  }
  populateCandidateIntent({
    symbol: token.symbol,
    side,
    entryPrice: entry,
    score: token.score,
    source: token.intentSource || "alpha-radar",
    volatility: token.change
  });
  closeDrawer();
  document.querySelector("#risk")?.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast(`${token.symbol} ${side === "LONG" ? "做多" : "做空"}意图已载入，等待提交 Risk Engine 审批`);
}

rowsRoot.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-open]");
  const row = event.target.closest("tr[data-symbol]");
  const symbol = trigger?.dataset.open || row?.dataset.symbol;
  if (symbol) openDrawer(findToken(symbol));
});

rowsRoot.addEventListener("keydown", (event) => {
  const row = event.target.closest("tr[data-symbol]");
  if (row && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openDrawer(findToken(row.dataset.symbol));
  }
});

bubbleArea?.addEventListener("click", (event) => {
  const bubble = event.target.closest("[data-momentum-symbol]");
  if (!bubble) return;
  openDrawer(momentumDetailTokens.get(bubble.dataset.momentumSymbol));
});

rankingUniverseTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const nextUniverse = tab.dataset.rankingUniverse;
    if (!nextUniverse || nextUniverse === activeRankingUniverse) return;
    activeRankingUniverse = nextUniverse;
    activeRankingPage = 1;
    activeFilter = "all";
    directionTabs.forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
    renderRows();
    if (nextUniverse.startsWith("alpha-") && !alphaListsMeta) hydrateBinanceAlphaLists();
  });
});

directionTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeFilter = tab.dataset.filter;
    activeRankingPage = 1;
    directionTabs.forEach((button) => button.classList.toggle("active", button === tab));
    renderRows();
  });
});

searchInput.addEventListener("input", () => {
  activeRankingPage = 1;
  renderRows();
});
marketFilter.addEventListener("change", () => {
  activeRankingPage = 1;
  renderRows();
});
rankingPagination?.addEventListener("click", (event) => {
  const pageButton = event.target.closest("[data-ranking-page]");
  if (pageButton) setRankingPage(Number(pageButton.dataset.rankingPage));
});
rankingPrev?.addEventListener("click", () => setRankingPage(activeRankingPage - 1));
rankingNext?.addEventListener("click", () => setRankingPage(activeRankingPage + 1));
poolFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeRiskPoolFilter = button.dataset.poolFilter;
    poolFilterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderRiskPool();
  });
});
poolCandidateList?.addEventListener("click", (event) => {
  const candidate = event.target.closest("[data-pool-detail]");
  if (candidate) openRiskPoolCandidateDetail(candidate.dataset.poolDetail, candidate);
});
async function openSignalStreamDetail(target) {
  const item = target.closest?.("[data-signal-detail]");
  if (!item) return;
  const token = signalDetailTokens.get(item.dataset.signalDetail);
  if (!token) return;

  openDrawer(token);
  const priceNode = document.querySelector("#detail-price");
  if (priceNode) {
    priceNode.textContent = "同步中…";
    priceNode.title = "正在读取 Binance 最新实时价格";
  }
  item.setAttribute("aria-busy", "true");

  try {
    const query = new URLSearchParams({
      symbol: canonicalIntentSymbol(token.symbol),
      market: token.market === "spot" ? "spot" : "futures"
    });
    const response = await fetch(`/api/binance-price?${query}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !(Number(payload?.price) > 0)) {
      throw new Error(payload?.message || payload?.error || "Binance 未返回有效实时价格");
    }

    token.price = formatMomentumPrice(Number(payload.price));
    lastMarketPrices.set(canonicalIntentSymbol(token.symbol), Number(payload.price));
    if (activeToken === token && priceNode) {
      priceNode.textContent = token.price;
      priceNode.title = `Binance ${payload.market === "spot" ? "现货" : "永续"}实时价格 · ${payload.checkedAt || "刚刚更新"}`;
    }
  } catch (error) {
    if (activeToken === token && priceNode) {
      priceNode.textContent = "$—";
      priceNode.title = "Binance 实时价格暂不可用";
    }
    showToast(`${canonicalIntentSymbol(token.symbol)} 实时价格同步失败：${error.message}`, true);
  } finally {
    item.removeAttribute("aria-busy");
  }
}
signalStream?.addEventListener("click", (event) => { void openSignalStreamDetail(event.target); });
signalStream?.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  void openSignalStreamDetail(event.target);
});
surfFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeSurfFilter = button.dataset.surfFilter;
    surfFilterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderSurfPulse();
  });
});
surfSort?.addEventListener("change", renderSurfPulse);
refreshSurfPulse?.addEventListener("click", () => hydrateSurfPulse({ announce: true }));
document.querySelectorAll("[data-symbol]").forEach((button) => {
  if (!button.closest("#token-rows")) button.addEventListener("click", () => openDrawer(findToken(button.dataset.symbol)));
});
document.querySelector("#close-drawer").addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

document.querySelector("#watch-button").addEventListener("click", () => toggleWatch(activeToken));
document.querySelector("#detail-watch").addEventListener("click", () => toggleWatch(activeToken));
detailDirectionButtons.forEach((button) => {
  button.addEventListener("click", () => setNeutralDetailDirection(button.dataset.detailSide));
});
detailQueueButton.addEventListener("click", () => queueTrade(activeToken));
document.querySelector("#queue-trade").addEventListener("click", () => queueTrade(activeToken || tokenUniverse[0]));
loadSignalCandidateButton?.addEventListener("click", () => autoSubmitCandidate("signal"));
loadPoolCandidateButton?.addEventListener("click", () => autoSubmitCandidate("pool"));
tradeIntentForm?.addEventListener("submit", submitTradeIntent);
document.querySelector("#intent-symbol")?.addEventListener("blur", () => {
  if (alphaExecutionAuthorized) void refreshIntentReferencePrice().catch(() => undefined);
});
killSwitchButton?.addEventListener("click", togglePaperKillSwitch);
paperResetButton?.addEventListener("click", resetPaperTradingSession);
paperViewTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => setPaperView(tab.dataset.paperView));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = paperViewTabs[(index + direction + paperViewTabs.length) % paperViewTabs.length];
    setPaperView(nextTab.dataset.paperView);
    nextTab.focus();
  });
});
[positionMonitorList, paperRows].forEach((root) => root?.addEventListener("click", (event) => {
  const liveClose = event.target.closest("[data-live-close]");
  if (liveClose) {
    void closeActiveLivePosition(liveClose.dataset.liveClose, liveClose);
    return;
  }
  const liveProtection = event.target.closest("[data-live-protection]");
  if (liveProtection) {
    void replaceActiveLiveProtection(liveProtection.dataset.liveProtection, liveProtection);
    return;
  }
  const button = event.target.closest("[data-close-position]");
  if (!button) return;
  closePaperPosition(button.dataset.closePosition, "MANUAL_CLOSE");
  savePaperRiskState();
  renderPaperWorkspace();
  setRiskPipeline("CLOSED");
  showToast("纸面持仓已人工平仓");
}));

document.querySelector("#refresh-scan").addEventListener("click", () => hydrateAlphaScan({ announce: true }));
refreshAlphaLists?.addEventListener("click", () => hydrateBinanceAlphaLists({ force: true, announce: true }));
refreshTriggers?.addEventListener("click", () => hydrateRecentSignals({ announce: true, force: true }));

document.querySelector("#mode-toggle").addEventListener("click", () => {
  executionControl?.scrollIntoView({ behavior: "smooth", block: "start" });
});

executionModeButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const mode = button.dataset.executionMode;
    if (mode === alphaExecutionConfig.activeMode) return;
    if (mode === "live" && !alphaExecutionConfig.liveUnlocked) {
      document.querySelector("#execution-mode").value = alphaExecutionConfig.activeMode;
      showToast("生产实盘仍处于加锁状态；请先校验实盘 Key、完成对账并由双重验证管理员解锁", true);
      return;
    }
    const previousMode = alphaExecutionConfig.activeMode;
    document.querySelector("#execution-mode").value = mode;
    button.disabled = true;
    try {
      await persistExecutionConfig({ overrides: { activeMode: mode } });
      const credentialEnvironment = document.querySelector("#execution-credential-environment");
      if (credentialEnvironment && mode === "live") credentialEnvironment.value = mode;
      renderExecutionCredentials();
      showToast(`执行环境已切换为 ${executionModeLabel()}`);
    } catch {
      document.querySelector("#execution-mode").value = previousMode;
      renderExecutionControl();
    } finally {
      button.disabled = false;
    }
  });
});

executionConfigForm?.addEventListener("submit", saveExecutionConfig);
executionCredentialForm?.addEventListener("submit", saveExecutionCredential);
document.querySelector("#test-execution-credential")?.addEventListener("click", preflightExecutionCredential);
document.querySelector("#delete-execution-credential")?.addEventListener("click", deleteExecutionCredential);
document.querySelector("#execution-credential-environment")?.addEventListener("change", renderExecutionCredentials);
document.querySelector("#execution-credential-market")?.addEventListener("change", renderExecutionCredentials);
document.querySelector("#execution-reconcile")?.addEventListener("click", () => reconcileAlphaExecution());
livePortfolioPullButton?.addEventListener("click", () => pullLivePortfolioData({ announce: true }));
document.querySelector("#execution-stream")?.addEventListener("click", connectAlphaExecutionStream);
document.querySelector("#unlock-live")?.addEventListener("click", unlockAlphaLive);
document.querySelectorAll("#live-ack-funds, #live-ack-withdraw").forEach((input) => input.addEventListener("change", syncLiveUnlockAcknowledgements));
initializeLiveUnlockHelp();
document.querySelector("#live-unlock-phrase")?.addEventListener("input", (event) => event.currentTarget.removeAttribute("aria-invalid"));
document.querySelector("#relock-live")?.addEventListener("click", relockAlphaLive);
document.querySelector("#intent-market")?.addEventListener("change", (event) => {
  const spot = event.currentTarget.value === "spot";
  const side = document.querySelector("#intent-side");
  const leverage = document.querySelector("#intent-leverage");
  if (spot) {
    if (side.value === "SHORT") side.value = "LONG";
    leverage.value = "1";
  }
  document.querySelector("#intent-market-label").textContent = spot ? "SPOT" : "FUTURES";
  if (alphaExecutionAuthorized) void refreshIntentReferencePrice().catch(() => undefined);
});

const riskControls = document.querySelectorAll(".risk-rules select");
riskControls.forEach((control) => {
  const saved = window.localStorage.getItem(`alpha-radar-${control.id}`);
  if (saved) control.value = saved;
  control.addEventListener("change", () => {
    window.localStorage.setItem(`alpha-radar-${control.id}`, control.value);
    const value = parseControlNumber(control.id, 0);
    if (control.id === "risk-per-trade") alphaExecutionConfig.riskPerTradePct = value;
    if (control.id === "max-leverage") alphaExecutionConfig.maxLeverage = value;
    if (control.id === "daily-stop") alphaExecutionConfig.dailyLossLimitPct = Math.abs(value);
    if (control.id === "dedupe-window") alphaExecutionConfig.dedupeWindowMinutes = value;
    if (control.id === "max-leverage") {
      const leverage = document.querySelector("#intent-leverage");
      if (Number(leverage.value) > parseControlNumber("max-leverage", 3)) leverage.value = String(parseControlNumber("max-leverage", 3));
    }
    setRiskPolicySaveState("参数已修改 · 等待服务端保存", "saving");
    scheduleExecutionConfigSave();
    showToast(`${control.closest("label").querySelector("strong").textContent}已更新为 ${control.value}，正在同步服务端`);
  });
});

document.querySelector("#export-trades").addEventListener("click", () => {
  if (alphaExecutionAuthorized && alphaExecutionConfig.activeMode !== "paper") {
    const positions = activeExecutionPositions();
    downloadCsv(`alpha-radar-${alphaExecutionConfig.activeMode}-positions.csv`, [
      ["position_id", "plan_id", "environment", "market", "symbol", "side", "quantity", "entry", "mark", "stop_loss", "take_profit", "unrealized_pnl", "state", "opened_at"],
      ...positions.map((position) => [position.id, position.planId, position.environment, position.market, position.symbol, position.side, position.quantity, position.entryPrice, position.markPrice, position.stopLoss, position.takeProfit, position.unrealizedPnl, position.state, position.openedAt])
    ]);
    showToast(`${executionModeLabel()} 持仓记录已导出`);
    return;
  }
  downloadCsv("alpha-radar-paper-trades.csv", [
    ["position_id", "plan_id", "symbol", "side", "entry", "mark_or_close", "quantity", "notional_usdt", "stop_loss", "take_profit", "pnl", "source", "intent_strength", "status", "close_reason", "created_at", "opened_at", "closed_at", "mode"],
    ...paperRiskState.positions.map((position) => [position.positionId, position.planId, position.symbol, position.side, position.entryPrice, position.status === "MONITORING" ? position.markPrice : position.closePrice, position.quantity, position.notional, position.stopLoss, position.takeProfit, position.status === "MONITORING" ? paperPositionPnl(position) : position.realizedPnl, position.source, position.strongTradeIntent ? "STRONG_TRADE_INTENT" : "STANDARD", position.status, position.closeReason, position.createdAt || position.openedAt, position.openedAt, position.closedAt, "PAPER"])
  ]);
  showToast("纸面交易记录已导出");
});

document.querySelector("#export-audit")?.addEventListener("click", exportLiveAudit);

const mobileMenu = document.querySelector("#mobile-menu");
const sidebar = document.querySelector("#sidebar");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const layoutModeToggle = document.querySelector("#layout-mode-toggle");
const radarSkinToggle = document.querySelector("#radar-skin-toggle");
const appShell = document.querySelector(".app-shell");
const sidebarMedia = window.matchMedia("(max-width: 1440px)");
let platformLang = localStorage.getItem("welinkbtc-language") === "en" ? "en" : "zh";
let platformThemeMode = localStorage.getItem("welinkbtc-theme") || "dark";
let sidebarPreference = null;
let workspaceLayoutMode = "grid";
let radarSkinMode = "ink";
let activeWorkspaceSection = "radar";
try { sidebarPreference = localStorage.getItem("alpha-radar-sidebar"); } catch {}
try { workspaceLayoutMode = localStorage.getItem("alpha-radar-layout-mode") === "tabs" ? "tabs" : "grid"; } catch {}
try { radarSkinMode = localStorage.getItem("alpha-radar-color-skin") === "navy" ? "navy" : "ink"; } catch {}
const requestedSection = window.location.hash.replace(/^#/, "");
if (document.querySelector(`.side-nav a[data-section="${CSS.escape(requestedSection)}"]`)) activeWorkspaceSection = requestedSection;

function updateLayoutModeLabel() {
  if (!layoutModeToggle) return;
  const tabs = workspaceLayoutMode === "tabs";
  layoutModeToggle.setAttribute("aria-pressed", String(tabs));
  layoutModeToggle.setAttribute("aria-label", tabs ? radarText("切换为整体平铺", "Switch to full layout") : radarText("切换为分页浏览", "Switch to tab view"));
  layoutModeToggle.querySelector("span").textContent = tabs ? radarText("整体平铺", "Full layout") : radarText("分页浏览", "Tab view");
}

function updateRadarSkinLabel() {
  if (!radarSkinToggle) return;
  const navy = radarSkinMode === "navy";
  radarSkinToggle.setAttribute("aria-pressed", String(navy));
  radarSkinToggle.setAttribute("aria-label", navy
    ? radarText("切换为淡墨绿色", "Switch to ink green")
    : radarText("切换为深蓝色", "Switch to deep blue"));
  radarSkinToggle.querySelector("span").textContent = navy
    ? radarText("深蓝色", "Deep blue")
    : radarText("淡墨绿", "Ink green");
}

function applyRadarSkin(persist = false) {
  document.documentElement.dataset.radarSkin = radarSkinMode;
  document.body.dataset.radarSkin = radarSkinMode;
  appShell.dataset.radarSkin = radarSkinMode;
  updateRadarSkinLabel();
  if (persist) {
    try { localStorage.setItem("alpha-radar-color-skin", radarSkinMode); } catch {}
  }
  requestAnimationFrame(() => {
    hydrateBoxCharts();
    const symbol = boxChartDialog?.open ? boxChartDialog.dataset.symbol : "";
    const candidate = (boxBreakoutState?.crypto || []).find((item) => item.symbol === symbol);
    const cached = symbol ? boxChartCache.get(symbol) : null;
    if (candidate && cached && boxExpandedChart) drawBoxChart(boxExpandedChart, cached.bars, candidate.box, { expanded: true });
  });
}

function selectWorkspaceSection(section, { updateHash = false } = {}) {
  activeWorkspaceSection = section;
  document.querySelectorAll(".side-nav a").forEach((item) => item.classList.toggle("active", item.dataset.section === section));
  document.querySelectorAll(".alpha-main-column > section").forEach((item) => item.toggleAttribute("data-tab-active", item.id === section || (item.id === "execution-monitor" && section === "execution-control")));
  document.querySelector("#surf-pulse")?.toggleAttribute("data-tab-active", section === "signals");
  appShell.dataset.activeSection = section;
  if (updateHash) history.replaceState(null, "", `#${section}`);
}

function setWorkspaceLayout(mode, persist = false) {
  workspaceLayoutMode = mode === "tabs" ? "tabs" : "grid";
  appShell.dataset.workspaceLayout = workspaceLayoutMode;
  updateLayoutModeLabel();
  selectWorkspaceSection(activeWorkspaceSection);
  if (persist) {
    try { localStorage.setItem("alpha-radar-layout-mode", workspaceLayoutMode); } catch {}
  }
}
function setSidebarCollapsed(collapsed, persist = false) {
  document.querySelector(".app-shell").classList.toggle("sidebar-collapsed", collapsed);
  [sidebarToggle, mobileMenu].forEach((button) => {
    button?.setAttribute("aria-expanded", String(!collapsed));
    button?.setAttribute("aria-label", collapsed ? "展开导航" : "收起导航");
  });
  sidebarToggle.querySelector("span").textContent = collapsed ? "›" : "‹";
  if (persist) {
    sidebarPreference = collapsed ? "collapsed" : "expanded";
    try { localStorage.setItem("alpha-radar-sidebar", sidebarPreference); } catch {}
  }
}
const toggleSidebar = () => setSidebarCollapsed(!document.querySelector(".app-shell").classList.contains("sidebar-collapsed"), true);
sidebarToggle?.addEventListener("click", toggleSidebar);
mobileMenu?.addEventListener("click", toggleSidebar);
setSidebarCollapsed(sidebarPreference ? sidebarPreference === "collapsed" : sidebarMedia.matches);
sidebarMedia.addEventListener("change", (event) => {
  if (!sidebarPreference) setSidebarCollapsed(event.matches);
});
document.querySelectorAll(".side-nav a").forEach((link) => {
  link.setAttribute("aria-label", link.querySelector("strong").textContent);
  link.title = link.querySelector("strong").textContent;
  link.addEventListener("click", (event) => {
    const section = link.dataset.section;
    if (workspaceLayoutMode === "tabs") event.preventDefault();
    selectWorkspaceSection(section, { updateHash: workspaceLayoutMode === "tabs" });
    if (window.innerWidth <= 820) setSidebarCollapsed(true);
  });
});
layoutModeToggle?.addEventListener("click", () => setWorkspaceLayout(workspaceLayoutMode === "tabs" ? "grid" : "tabs", true));
radarSkinToggle?.addEventListener("click", () => {
  radarSkinMode = radarSkinMode === "ink" ? "navy" : "ink";
  applyRadarSkin(true);
});
setWorkspaceLayout(workspaceLayoutMode);
applyRadarSkin();

const platformMenuToggle = document.querySelector("#platform-menu-toggle");
const platformNav = document.querySelector("#platform-nav");
const platformLanguage = document.querySelector("#platform-language");
const platformTheme = document.querySelector("#platform-theme");
const radarUiTranslator = window.WelinkUiTranslator?.create({
  roots: [document.body],
  profile: "radar"
});

function applyPlatformTheme() {
  document.documentElement.dataset.theme = platformThemeMode;
  document.body.dataset.theme = platformThemeMode;
  const nextThemeLabel = platformThemeMode === "dark"
    ? (platformLang === "zh" ? "浅色" : "Light")
    : (platformLang === "zh" ? "深色" : "Dark");
  platformTheme.textContent = nextThemeLabel;
  platformTheme.setAttribute("aria-label", platformThemeMode === "dark"
    ? (platformLang === "zh" ? "切换为浅色界面" : "Switch to light theme")
    : (platformLang === "zh" ? "切换为深色界面" : "Switch to dark theme"));
}

function applyPlatformLanguage() {
  document.documentElement.lang = platformLang === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.radarLanguage = platformLang;
  document.querySelectorAll("[data-platform-zh]").forEach((item) => {
    item.textContent = item.dataset[`platform${platformLang === "zh" ? "Zh" : "En"}`];
  });
  document.querySelectorAll("[data-radar-zh]").forEach((item) => {
    item.textContent = item.dataset[`radar${platformLang === "zh" ? "Zh" : "En"}`];
  });
  document.querySelectorAll("[data-language-only]").forEach((item) => {
    item.hidden = item.dataset.languageOnly !== platformLang;
  });
  document.querySelectorAll("[data-placeholder-zh]").forEach((item) => {
    item.placeholder = item.dataset[`placeholder${platformLang === "zh" ? "Zh" : "En"}`];
  });
  platformLanguage.textContent = platformLang === "zh" ? "EN" : "ZH";
  platformLanguage.setAttribute("aria-label", platformLang === "zh" ? "Switch to English" : "切换到中文");
  radarUiTranslator?.setLanguage(platformLang);
  document.title = platformLang === "zh" ? "阿尔法雷达平台" : "Alpha Radar Trading Platform";
  updateLayoutModeLabel();
  updateRadarSkinLabel();
  renderSourceHealth();
  renderRows();
  if (boxBreakoutState) renderBoxBreakout();
  requestAnimationFrame(() => document.querySelectorAll(".side-nav a").forEach((link) => {
    link.setAttribute("aria-label", link.querySelector("strong")?.textContent || "");
    link.title = link.querySelector("strong")?.textContent || "";
  }));
  applyPlatformTheme();
}

platformMenuToggle.addEventListener("click", () => {
  const open = platformNav.classList.toggle("open");
  platformMenuToggle.setAttribute("aria-expanded", String(open));
});

platformNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    platformNav.classList.remove("open");
    platformMenuToggle.setAttribute("aria-expanded", "false");
  });
});

platformLanguage.addEventListener("click", () => {
  platformLang = platformLang === "zh" ? "en" : "zh";
  localStorage.setItem("welinkbtc-language", platformLang);
  applyPlatformLanguage();
  surfPulseItems = [];
  hydrateSurfPulse({ announce: true });
});

platformTheme.addEventListener("click", () => {
  platformThemeMode = platformThemeMode === "dark" ? "light" : "dark";
  localStorage.setItem("welinkbtc-theme", platformThemeMode);
  applyPlatformTheme();
});

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin || event.source !== window.parent) return;
  if (event.data?.type === "welinkbtc:preferences") {
    const nextLanguage = event.data.language === "en" ? "en" : "zh";
    const languageChanged = nextLanguage !== platformLang;
    platformLang = nextLanguage;
    platformThemeMode = event.data.theme === "light" ? "light" : "dark";
    applyPlatformLanguage();
    if (languageChanged && surfPulseItems.length) {
      surfPulseItems = [];
      hydrateSurfPulse();
    }
  }
  if (event.data?.type === "welinkbtc:navigate" && typeof event.data.hash === "string") {
    const section = event.data.hash.replace(/^#/, "");
    if (document.querySelector(`.side-nav a[data-section="${CSS.escape(section)}"]`)) selectWorkspaceSection(section, { updateHash: true });
  }
});

applyPlatformLanguage();

boxScanButtons.forEach((button) => button.addEventListener("click", () => startBoxBreakoutScan(button.dataset.boxScan)));
boxSearch?.addEventListener("input", renderBoxBreakout);
boxFilter?.addEventListener("change", renderBoxBreakout);
boxSort?.addEventListener("change", renderBoxBreakout);
boxResults?.addEventListener("click", (event) => {
  const detailTrigger = event.target.closest("[data-box-detail]");
  if (detailTrigger) {
    const candidate = (boxBreakoutState?.crypto || []).find((item) => item.symbol === detailTrigger.dataset.boxDetail);
    if (candidate) openDrawer(boxCandidateDetailToken(candidate));
    return;
  }
  const trigger = event.target.closest("[data-box-expand]");
  if (trigger) openBoxChart(trigger.dataset.boxExpand);
});
boxChartDialog?.addEventListener("click", (event) => {
  if (event.target === boxChartDialog) boxChartDialog.close();
});
window.addEventListener("resize", () => {
  if (!boxChartDialog?.open) return;
  const symbol = boxChartDialog.dataset.symbol;
  const candidate = (boxBreakoutState?.crypto || []).find((item) => item.symbol === symbol);
  const cached = boxChartCache.get(symbol);
  if (candidate && cached && boxExpandedChart) drawBoxChart(boxExpandedChart, cached.bars, candidate.box, { expanded: true });
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    window.clearTimeout(livePnlTimer);
    window.clearTimeout(marketReconnectTimer);
    window.clearTimeout(futuresReconnectTimer);
    window.clearTimeout(cryptoBubblesTimer);
    window.clearTimeout(alphaScanTimer);
    window.clearTimeout(alphaListsTimer);
    window.clearTimeout(telegramSignalTimer);
    window.clearTimeout(strongTradeIntentExpiryTimer);
    window.clearTimeout(surfPulseTimer);
    window.clearTimeout(paperMonitorTimer);
    window.clearTimeout(alphaExecutionTimer);
    window.clearTimeout(livePortfolioPullTimer);
    window.clearTimeout(boxBreakoutTimer);
    window.clearTimeout(boxQuoteTimer);
    livePortfolioPullTimer = null;
    if (marketSocket) marketSocket.close();
    if (futuresMarketSocket) futuresMarketSocket.close();
    if (alphaExecutionUserSocket) alphaExecutionUserSocket.close();
    return;
  }
  hydrateMarketSnapshot();
  connectMarketFeed();
  connectFuturesMarketFeed();
  hydrateCryptoBubbles();
  hydrateAlphaScan();
  hydrateBinanceAlphaLists();
  hydrateRecentSignals({ force: true });
  hydrateSurfPulse();
  hydrateBoxBreakout();
  hydrateAlphaExecution();
  ensureLivePortfolioPullSchedule();
  schedulePaperMonitor(0);
});

window.addEventListener("beforeunload", () => {
  window.clearTimeout(livePnlTimer);
  window.clearTimeout(marketReconnectTimer);
  window.clearTimeout(futuresReconnectTimer);
  window.clearTimeout(cryptoBubblesTimer);
  window.clearTimeout(alphaScanTimer);
  window.clearTimeout(alphaListsTimer);
  window.clearTimeout(telegramSignalTimer);
  window.clearTimeout(strongTradeIntentExpiryTimer);
  window.clearTimeout(surfPulseTimer);
  window.clearTimeout(paperMonitorTimer);
  window.clearTimeout(alphaExecutionTimer);
  window.clearTimeout(livePortfolioPullTimer);
  window.clearTimeout(boxBreakoutTimer);
  window.clearTimeout(boxQuoteTimer);
  if (marketSocket) marketSocket.close();
  if (futuresMarketSocket) futuresMarketSocket.close();
  if (alphaExecutionUserSocket) alphaExecutionUserSocket.close();
});

startMarketFeed();
window.setInterval(renderSourceHealth, 30_000);
hydrateCryptoBubbles();
hydrateAlphaScan();
hydrateBinanceAlphaLists();
hydrateRecentSignals({ force: true });
hydrateSurfPulse();
hydrateBoxBreakout();
initializePaperRiskEngine();
hydrateAlphaExecution();
