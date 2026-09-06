let tokenUniverse = [
  {
    symbol: "POPCAT", name: "Popcat", type: "MEME", market: "perp", price: "$0.6412", change: 38.6,
    volume: 4.2, funding: -0.018, oi: 31.8, score: 91, bias: "long", watched: true,
    dimensions: [96, 94, 82, 86, 89, 93, 88],
    reason: "价格、OI 与量能同向扩张，资金费率逆向，存在空头回补动能。",
    heat: 164, kols: ["@lookonchain", "@0xSun", "@defioasis"],
    risks: ["24H 涨幅过高", "MEME 高波动", "追价保护 -40% 仓位"],
    headlines: ["POPCAT 永续成交额跃居 Binance MEME 板块前三", "Solana MEME 板块出现同步资金轮动"]
  },
  {
    symbol: "ORDI", name: "ORDI", type: "BRC-20", market: "both", price: "$36.76", change: -18.2,
    volume: 3.8, funding: 0.041, oi: 22.4, score: 88, bias: "short", watched: true,
    dimensions: [90, 86, 72, 81, 94, 63, 68],
    reason: "OI 在价格走弱时持续增加，正资金费率显示多头仍拥挤，空头共振占优。",
    heat: 83, kols: ["@ordinalsdata", "@BTCeco", "@chainfeeds"],
    risks: ["短时跌幅过大", "空头回补风险", "BTC 波动联动"],
    headlines: ["BRC-20 板块成交量放大，ORDI 跌破关键支撑", "永续未平仓量逆势上升引发多头风险"]
  },
  {
    symbol: "WIF", name: "dogwifhat", type: "MEME", market: "both", price: "$2.284", change: 24.1,
    volume: 3.4, funding: -0.006, oi: 19.6, score: 84, bias: "long", watched: false,
    dimensions: [88, 86, 77, 79, 73, 90, 84],
    reason: "价格突破日内高点，量能和社交热度共振，负资金费率降低多头拥挤担忧。",
    heat: 127, kols: ["@solanafloor", "@moonoverlord", "@blocmates"],
    risks: ["MEME 板块集中", "日内波动偏高"],
    headlines: ["WIF 重回 Solana MEME 交易热度首位", "现货与永续成交同步放大"]
  },
  {
    symbol: "ENA", name: "Ethena", type: "DEFI", market: "both", price: "$0.4418", change: -14.7,
    volume: 3.1, funding: 0.058, oi: 17.9, score: 82, bias: "short", watched: false,
    dimensions: [84, 80, 91, 78, 88, 55, 71],
    reason: "价格跌破结构位、资金费率偏高且多头爆仓增强，反弹抛压仍需消化。",
    heat: 61, kols: ["@ethena_labs", "@defillama", "@WuBlockchain"],
    risks: ["协议消息敏感", "下跌尾部流动性"],
    headlines: ["ENA 多头清算量升至日内高位", "Ethena 生态资金流出现短时回落"]
  },
  {
    symbol: "TURBO", name: "Turbo", type: "AI MEME", market: "perp", price: "$0.00684", change: 18.4,
    volume: 2.9, funding: 0.072, oi: 15.6, score: 79, bias: "neutral", watched: false,
    dimensions: [82, 78, 61, 68, 67, 94, 86],
    reason: "媒体与社交热度领先，但资金费率和量价背离正在升温，等待二次确认。",
    heat: 194, kols: ["@turbotoadtoken", "@coinbureau", "@WhaleChart"],
    risks: ["社交过热", "资金费率偏高", "量价背离"],
    headlines: ["AI MEME 叙事再度升温，TURBO 搜索量激增", "高资金费率令追多性价比下降"]
  },
  {
    symbol: "PEOPLE", name: "ConstitutionDAO", type: "DAO", market: "perp", price: "$0.0821", change: 14.8,
    volume: 2.7, funding: 0.012, oi: 12.8, score: 78, bias: "long", watched: false,
    dimensions: [81, 76, 74, 72, 69, 85, 80],
    reason: "量价同向上行，社交与媒体提及同步抬升，但 OI 强度尚未达到强信号阈值。",
    heat: 112, kols: ["@DAOResearch", "@cointelegraph", "@cryptokoryo"],
    risks: ["叙事驱动", "盘口深度一般"],
    headlines: ["PEOPLE 日内成交量放大至 30 日分位高位", "DAO 板块轮动获得交易者关注"]
  },
  {
    symbol: "NEIRO", name: "Neiro", type: "MEME", market: "both", price: "$0.00172", change: 12.7,
    volume: 2.5, funding: -0.003, oi: 9.8, score: 75, bias: "long", watched: false,
    dimensions: [76, 73, 78, 70, 62, 82, 74],
    reason: "价格与量能温和共振，负资金费率提供反指支撑，清算强度仍不足。",
    heat: 89, kols: ["@neiro", "@MemeCoinDAO", "@CoinMarketCap"],
    risks: ["流动性分散", "MEME 高波动"],
    headlines: ["NEIRO 在亚洲时段出现持续买盘", "永续资金费率维持小幅负值"]
  },
  {
    symbol: "1000SATS", name: "SATS", type: "BRC-20", market: "perp", price: "$0.000221", change: -12.1,
    volume: 2.4, funding: 0.027, oi: 11.3, score: 74, bias: "short", watched: false,
    dimensions: [78, 72, 82, 70, 73, 47, 59],
    reason: "下跌过程中 OI 增加且资金费率维持正值，短线多头承压。",
    heat: 52, kols: ["@ord_io", "@brc20_news", "@BTCMagazine"],
    risks: ["低价高弹性", "BTC 联动强"],
    headlines: ["BRC-20 代币普遍回落，SATS 成交放大", "多头未平仓合约仍处于高位"]
  },
  {
    symbol: "PENDLE", name: "Pendle", type: "DEFI", market: "both", price: "$4.118", change: -9.4,
    volume: 1.9, funding: -0.014, oi: -3.2, score: 68, bias: "neutral", watched: false,
    dimensions: [61, 58, 75, 64, 55, 66, 72],
    reason: "价格与 OI 同步回落更接近多头平仓而非主动做空，暂不追空。",
    heat: 48, kols: ["@pendle_fi", "@DefiIgnas", "@thedefiedge"],
    risks: ["趋势未确认", "临近支撑区"],
    headlines: ["PENDLE 随 DeFi 板块回调，未平仓量下降", "收益率交易板块基本面仍获关注"]
  },
  {
    symbol: "NOT", name: "Notcoin", type: "GAMEFI", market: "both", price: "$0.0092", change: -8.7,
    volume: 1.8, funding: -0.021, oi: -6.4, score: 66, bias: "neutral", watched: false,
    dimensions: [58, 55, 79, 61, 52, 69, 63],
    reason: "负资金费率与 OI 回落削弱继续追空逻辑，等待新的成交放大。",
    heat: 57, kols: ["@thenotcoin", "@ton_blockchain", "@Coin98Analytics"],
    risks: ["趋势动能不足", "低流动性时段"],
    headlines: ["NOT 回落但永续杠杆同步出清", "TON 生态热度保持平稳"]
  },
  {
    symbol: "DOGE", name: "Dogecoin", type: "MEME", market: "both", price: "$0.1428", change: 7.6,
    volume: 1.7, funding: 0.021, oi: 7.8, score: 64, bias: "neutral", watched: false,
    dimensions: [62, 59, 67, 66, 51, 72, 70],
    reason: "大盘跟随属性较强，七维信号尚未形成独立共振。",
    heat: 73, kols: ["@dogecoin", "@BillyM2k", "@santimentfeed"],
    risks: ["大盘相关性高", "信号独立性不足"],
    headlines: ["DOGE 跟随市场反弹，独立催化有限", "社交提及温和抬升"]
  },
  {
    symbol: "PEPE", name: "Pepe", type: "MEME", market: "both", price: "$0.0000128", change: 6.9,
    volume: 1.6, funding: 0.016, oi: 5.1, score: 62, bias: "neutral", watched: false,
    dimensions: [60, 57, 65, 63, 49, 75, 68],
    reason: "社交热度领先于价格和 OI，当前更像观察信号而非执行信号。",
    heat: 81, kols: ["@pepecoineth", "@lunarcrush", "@WhaleStats"],
    risks: ["社交领先未确认", "MEME 板块拥挤"],
    headlines: ["PEPE 社交提及回升，价格反应相对温和", "链上大额转账数量增加"]
  }
];

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
const livePortfolioPullMs = 30_000;
const strongTradeIntentWindowMs = 3 * 60_000;
const liveUnlockPhrase = "ENABLE LIVE TRADING";
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
    const watched = new Set([...tokenUniverse, ...mainstreamUniverse].filter((token) => token.watched).map((token) => token.symbol));
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
  riskPoolState.textContent = allReady ? "三路实时 · 已去重" : `已连接 ${readyCount} / 3 路`;

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

function applyMarketTicker(ticker) {
  const symbol = ticker.s || ticker.symbol;
  if (!trackedMarketSymbols.includes(symbol)) return;
  const price = Number(ticker.c ?? ticker.lastPrice);
  const change = Number(ticker.P ?? ticker.priceChangePercent);
  if (!Number.isFinite(price) || !Number.isFinite(change)) return;

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
  const baseScore = Math.max(58, 72 - index);
  const dimensions = [64, 58, 52, 50, 48, 55, 52].map((value, dimensionIndex) => Math.max(35, value - index % 4 + dimensionIndex % 2));
  return {
    symbol,
    name: meta.name,
    type: "中性观察",
    market: meta.market,
    price: "$—",
    change: 0,
    volume: 1,
    funding: 0,
    fundingAvailable: meta.market !== "spot",
    oi: null,
    score: baseScore,
    bias: "neutral",
    signalType: "中性观察",
    watched: false,
    dimensions,
    dimensionAvailability: [true, true, meta.market !== "spot", meta.market !== "spot", meta.market !== "spot", false, false],
    reason: `${symbol} 属于顶部实时行情的热门精选主流标的；等待当前两小时七维快照完成后再判断共振方向。`,
    heat: 50,
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
  return activeRankingUniverse === "mainstream" ? mainstreamUniverse : tokenUniverse;
}

function renderRankingModeMeta() {
  const mainstream = activeRankingUniverse === "mainstream";
  if (scannerModeKicker) scannerModeKicker.textContent = mainstream ? "REAL-TIME · BINANCE FEATURED 13" : "2H LIVE SCAN · BINANCE USDT";
  if (scannerModeTitle) scannerModeTitle.textContent = mainstream ? "热门精选主流" : "异动排行榜";
  if (rankingMethodTitle) rankingMethodTitle.textContent = mainstream ? "热门主流 ≠ 自动交易" : "异常强度 ≠ 买入信号";
  if (rankingMethodCopy) rankingMethodCopy.textContent = mainstream
    ? "固定覆盖顶部 BTC、ETH、BNB、SOL、DOGE、ZEC、TAO、ENA、ONDO、UNI、XRP、SUI、HYPE；沿用同一套七维评分、详情与风控送审链路。"
    : "价格、成交、资金费率、多空比、爆仓代理、社交趋势与媒体资讯分别评分，再判断共振或反指过热。";
  if (scanCycleLabel && mainstream) scanCycleLabel.innerHTML = "<i></i>顶部 13 个行情币种 · Binance 实时价格";
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
    const fundingCell = token.fundingAvailable === false
      ? '<td class="dim">—</td>'
      : `<td class="${token.funding < 0 ? "up" : token.funding > 0.04 ? "down" : ""}">${token.funding > 0 ? "+" : ""}${token.funding.toFixed(3)}%</td>`;
    const oiCell = token.oi == null
      ? '<td class="dim">—</td>'
      : `<td class="${oiClass}">${token.oi > 0 ? "+" : ""}${token.oi.toFixed(1)}%</td>`;
    return `
      <tr tabindex="0" data-symbol="${escapeHtml(token.symbol)}" aria-label="查看 ${escapeHtml(token.symbol)} 七维信号明细">
        <td><div class="token-cell"><span class="token-rank">${String(rank).padStart(2, "0")}</span><span class="token-avatar ${avatarClass(token.symbol)}">${escapeHtml(token.symbol[0])}</span><span><strong>${escapeHtml(token.symbol)}</strong><small>${marketMeta}<b class="token-meta-separator">·</b><i class="token-meta-signal ${token.bias}">${escapeHtml(token.type)}</i></small></span></div></td>
        <td class="${deltaClass}" data-ranking-change="${escapeHtml(token.symbol)}">${token.change > 0 ? "+" : ""}${token.change.toFixed(1)}%</td>
        <td><span class="volume-cell"><i style="--volume:${Math.min(100, token.volume * 22)}%"></i>${token.volume.toFixed(1)}×</span></td>
        ${fundingCell}
        ${oiCell}
        <td><span class="score-cell" style="--score:${token.score};--score-color:${scoreColor(token.score)}"><i><strong>${token.score}</strong></i></span></td>
        <td><span class="bias-tag ${token.bias}">${biasLabel(token.bias)}</span></td>
        <td><button class="row-open" type="button" data-open="${escapeHtml(token.symbol)}" aria-label="打开 ${escapeHtml(token.symbol)} 详情">›</button></td>
      </tr>`;
  }).join("");

  emptyState.hidden = visible.length > 0;
  renderRankingPagination(visible.length, totalPages);
  watchCount.textContent = rankingTokens.filter((token) => token.watched).length;
  document.querySelector("#strong-count").textContent = tokenUniverse.filter((token) => token.score >= 80).length;
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
    || mainstreamUniverse.find((token) => token.symbol === symbol);
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
  change.textContent = `${token.change > 0 ? "+" : ""}${token.change.toFixed(1)}%`;
  change.className = token.change >= 0 ? "up" : "down";
  document.querySelector("#detail-score").textContent = token.score;
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
  document.querySelector("#heat-label").textContent = token.heatLabel || (momentumOnly ? `价格 / 成交量覆盖 ${token.heat}/100` : `公开趋势热度 ${token.heat}/100`);
  document.querySelector("#detail-headline-title").textContent = token.headlineTitle || (momentumDetail ? "动量数据摘要" : "媒体头条");
  document.querySelector("#detail-headline-window").textContent = token.headlineWindow || (momentumDetail ? "当前 1D 快照" : "近 6 小时");
  document.querySelector("#dimension-list").innerHTML = dimensionNames.map((name, index) => `
    <div class="dimension-item ${token.dimensionAvailability?.[index] === false ? "pending" : ""}"><span>${name}</span><i style="--dimension:${token.dimensions[index]}%"></i><strong>${token.dimensionAvailability?.[index] === false ? "—" : token.dimensions[index]}</strong></div>
  `).join("");
  document.querySelector("#kol-row").innerHTML = `<span>${token.kolLabel || (momentumOnly ? "数据来源" : "社交趋势")}</span>${token.kols.map((kol) => `<i>${escapeHtml(kol)}</i>`).join("")}<em>${token.kolMetric || (momentumOnly ? "1D" : `${token.heat}/100`)}</em>`;
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
    drawRadar(token.dimensions, token.bias);
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
  values.forEach((value, index) => {
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
  const width = canvas.width;
  const height = canvas.height;
  const base = token.heat / 10;
  const values = [18, 20, 19, 24, 22, 28, 31, 29, 36, 42, 39, 51, 49, 62, 67, 58, 73, 79, 76, 91, 86, 101, 112, 105].map((value, index) => value + base * Math.sin(index * 1.7));
  const max = Math.max(...values);
  const pad = 12;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#222a2e";
  ctx.lineWidth = 1;
  for (let line = 1; line <= 3; line += 1) {
    const y = pad + ((height - pad * 2) * line) / 4;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
  }
  const gradient = ctx.createLinearGradient(0, pad, 0, height);
  gradient.addColorStop(0, "rgba(71,231,163,.28)");
  gradient.addColorStop(1, "rgba(71,231,163,0)");
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = pad + (index * (width - pad * 2)) / (values.length - 1);
    const y = height - pad - (value / max) * (height - pad * 2);
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(width - pad, height - pad);
  ctx.lineTo(pad, height - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = pad + (index * (width - pad * 2)) / (values.length - 1);
    const y = height - pad - (value / max) * (height - pad * 2);
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#47e7a3";
  ctx.lineWidth = 1.7;
  ctx.stroke();
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
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
          <span><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">原文 ↗</a> · <a href="${escapeHtml(item.surfUrl || "https://asksurf.ai/pulse")}" target="_blank" rel="noopener noreferrer">Surf</a></span>
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
  setSurfLiveState("loading", surfPulseItems.length ? "刷新中" : "同步中");
  surfPulseFeed.setAttribute("aria-busy", "true");

  try {
    const refreshParam = announce ? `&refresh=${Date.now()}` : "";
    const response = await fetch(`/api/surf-pulse?limit=90&lang=zh${refreshParam}`, { cache: "no-store" });
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
    const time = Number.isNaN(fetchedAt.getTime()) ? "实时" : fetchedAt.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setSurfLiveState("live", `实时 · ${time}`);
    if (announce) showToast(`Surf Pulse 已更新 ${incoming.length} 条 15 日内信息`);
  } catch (error) {
    if (!surfPulseItems.length) {
      surfPulseFeed.innerHTML = `<div class="surf-feed-state"><strong>Surf Pulse 暂时不可用</strong><span>系统将在 10 分钟后自动重试</span></div>`;
    }
    setSurfLiveState("error", "重试中");
    if (announce) showToast("Surf Pulse 暂时不可用，正在自动重试", true);
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
  return ({ paper: "PAPER", mock_exchange: "MOCK EXCHANGE", testnet: "BINANCE TESTNET", live: "PRODUCTION LIVE" })[mode] || "PAPER";
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
    environment: document.querySelector("#execution-credential-environment")?.value || "testnet",
    market: document.querySelector("#execution-credential-market")?.value || "futures"
  };
}

function selectedCredential() {
  const selected = credentialSelection();
  return (alphaExecutionSnapshot?.credentials || []).find((credential) => executionEnum(credential.environment) === selected.environment && executionEnum(credential.market) === selected.market) || null;
}

function renderExecutionCredentials() {
  const credentials = alphaExecutionSnapshot?.credentials || [];
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
    executionCredentialList.innerHTML = "<span>尚无凭据 · Paper / Mock 可直接使用</span>";
    return;
  }
  executionCredentialList.innerHTML = credentials.map((credential) => {
    const environment = executionEnum(credential.environment);
    const market = executionEnum(credential.market);
    return `<article><strong>${escapeHtml(environment.toUpperCase())} · ${escapeHtml(market.toUpperCase())}</strong><span>${escapeHtml(credential.apiKeyHint || "***")}${credential.proxyConfigured ? " · PROXY" : ""}</span><em>${credential.verifiedAt ? "VERIFIED" : credential.lastError ? "ERROR" : "PENDING"}</em></article>`;
  }).join("");
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
      <span><strong>${escapeHtml(order.symbol)} · ${escapeHtml(order.role)}</strong><em>${escapeHtml(order.clientOrderId || "NO CLIENT ID")}</em></span>
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
  if (mode === "testnet") return { title: "Testnet 测试组合", kicker: "BINANCE TESTNET PORTFOLIO", nav: "Testnet 组合", navSub: "Testnet Portfolio", monitor: "Testnet 持仓监控", foot: "Testnet 订单使用 Binance 测试资金；状态由测试网回报与对账同步", exportLabel: "导出测试网记录" };
  if (mode === "mock_exchange") return { title: "Mock Exchange 组合", kicker: "MOCK EXCHANGE PORTFOLIO", nav: "Mock 交易", navSub: "Mock Portfolio", monitor: "Mock 持仓监控", foot: "Mock Exchange 不访问 Binance，用于状态机与异常场景测试", exportLabel: "导出 Mock 记录" };
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
    "execution-testnet-enabled": config.testnetEnabled,
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
}

function scheduleAlphaExecutionRefresh(delay = alphaExecutionRefreshMs) {
  window.clearTimeout(alphaExecutionTimer);
  if (document.hidden || !alphaExecutionAuthorized) return;
  alphaExecutionTimer = window.setTimeout(() => hydrateAlphaExecution(), delay);
}

async function hydrateAlphaExecution({ announce = false } = {}) {
  if (alphaExecutionLoading) return;
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
    if (executionHealth) {
      executionHealth.classList.remove("healthy");
      executionHealth.classList.add("danger");
      executionHealth.innerHTML = `<i></i><span>${escapeHtml(error.status === 401 ? "请登录后使用交易执行中心" : error.status === 403 ? "当前账户没有交易执行权限" : error.message)}</span><strong>NO EXECUTION ACCESS</strong>`;
    }
    if (riskSubmit) riskSubmit.disabled = true;
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
    testnetEnabled: document.querySelector("#execution-testnet-enabled").checked,
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
  const enabled = alphaExecutionAuthorized && alphaExecutionConfig.activeMode === "live" && !document.hidden;
  if (!enabled) {
    window.clearTimeout(livePortfolioPullTimer);
    livePortfolioPullTimer = null;
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
    if (livePortfolioPullState) livePortfolioPullState.textContent = `${time} · 账户全量已同步 · 30s`;
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
  if (!["testnet", "live"].includes(alphaExecutionConfig.activeMode)) return showToast("WebSocket 成交回报仅用于 Testnet / Live", true);
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

async function unlockAlphaLive() {
  const phraseInput = document.querySelector("#live-unlock-phrase");
  const fundsAcknowledgement = document.querySelector("#live-ack-funds");
  const withdrawalAcknowledgement = document.querySelector("#live-ack-withdraw");
  const unlockButton = document.querySelector("#unlock-live");
  const phrase = String(phraseInput?.value || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (phrase !== liveUnlockPhrase) {
    phraseInput?.setAttribute("aria-invalid", "true");
    phraseInput?.focus();
    showToast(`请输入完整的实盘解锁确认短语：${liveUnlockPhrase}`, true);
    return;
  }
  if (!fundsAcknowledgement?.checked || !withdrawalAcknowledgement?.checked) {
    showToast("解锁实盘前，请先勾选两项资金与 API 安全确认", true);
    return;
  }
  unlockButton.disabled = true;
  try {
    await executionRequest("/live-unlock", { method: "POST", body: JSON.stringify({
      phrase,
      acknowledgeRealFunds: fundsAcknowledgement.checked,
      acknowledgeNoWithdrawPermission: withdrawalAcknowledgement.checked
    }) });
    phraseInput.value = "";
    phraseInput.removeAttribute("aria-invalid");
    fundsAcknowledgement.checked = false;
    withdrawalAcknowledgement.checked = false;
    await hydrateAlphaExecution();
    document.querySelector("#execution-mode").value = "live";
    await persistExecutionConfig({ overrides: { activeMode: "live" } });
    await hydrateAlphaExecution();
    showToast("生产实盘已由双重验证管理员显式解锁", true);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    unlockButton.disabled = false;
  }
}

function fillLiveUnlockPhrase() {
  const phraseInput = document.querySelector("#live-unlock-phrase");
  if (!phraseInput) return;
  phraseInput.value = liveUnlockPhrase;
  phraseInput.removeAttribute("aria-invalid");
  phraseInput.focus();
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
    const source = position.plan?.intent?.source || "execution-engine";
    return `<tr>
      <td><span class="paper-symbol-title"><strong>${escapeHtml(position.symbol)}</strong></span><span>${escapeHtml(executionMarketLabel(executionEnum(position.market)))} · ${leverage}× · ${escapeHtml(executionModeLabel(mode))}</span></td>
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
    if (portfolioRealizedPnl) {
      const realized = Number(portfolioStats?.historicalRealizedPnl) || 0;
      portfolioRealizedPnl.textContent = formatSignedMoney(realized);
      portfolioRealizedPnl.className = realized >= 0 ? "up" : "down";
    }
    if (portfolioRealizedCount) portfolioRealizedCount.textContent = `${Number(portfolioStats?.closedTradeCount) || 0} 笔已完结`;
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
  if (portfolioRealizedPnl) portfolioRealizedPnl.textContent = formatSignedMoney(paperRiskState.realizedPnl);
  if (portfolioRealizedCount) portfolioRealizedCount.textContent = `${paperRiskState.positions.filter((position) => position.status === "CLOSED").length} 笔已完结`;
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

function parseSignal() {
  const input = document.querySelector("#signal-text").value.trim();
  const result = document.querySelector("#parse-result");
  if (!input) {
    showToast("请先粘贴 Telegram 信号文本", true);
    return;
  }
  result.classList.add("parsing");
  window.setTimeout(() => {
    const symbolMatch = input.toUpperCase().match(/#?([A-Z0-9]{2,12})(?:USDT)?/);
    const symbol = symbolMatch ? symbolMatch[1].replace(/USDT$/, "") : "UNKNOWN";
    const known = findToken(symbol);
    const oiMatch = input.match(/OI[^+\-\d]*([+\-]?\d+(?:\.\d+)?)%/i);
    const priceMatch = input.match(/(?:PRICE|价格)[^+\-\d]*([+\-]?\d+(?:\.\d+)?)%/i);
    const fundingMatch = input.match(/(?:FUNDING|资金费率)[^+\-\d]*([+\-]?\d+(?:\.\d+)?)%/i);
    const oi = oiMatch ? Number(oiMatch[1]) : known?.oi || 0;
    const priceMove = priceMatch ? Number(priceMatch[1]) : known?.change || 0;
    const funding = fundingMatch ? Number(fundingMatch[1]) : known?.funding || 0;
    const bias = priceMove > 0 && oi > 0 ? (funding < 0 ? "偏多共振" : "多头动量") : priceMove < 0 && oi > 0 ? "偏空共振" : "中性观察";
    const toneClass = bias.includes("偏空") ? "short-text" : bias.includes("中性") ? "neutral-text" : "long-text";
    const confidence = Math.max(55, Math.min(96, Math.round(66 + Math.abs(oi) * 0.45 + Math.abs(priceMove) * 0.5)));
    const safeSymbol = escapeHtml(symbol);
    result.innerHTML = `
      <div class="parse-top"><span class="token-avatar ${avatarClass(symbol)}">${safeSymbol[0] || "?"}</span><div><strong>${safeSymbol} / USDT</strong><em>已提取 OI、价格与资金费率因子</em></div><span class="confidence">${confidence}% 置信</span></div>
      <div class="factor-chips"><span><em>价格</em>${priceMove > 0 ? "+" : ""}${priceMove.toFixed(1)}%</span><span><em>OI</em>${oi > 0 ? "+" : ""}${oi.toFixed(1)}%</span><span><em>资金费率</em>${funding > 0 ? "+" : ""}${funding.toFixed(3)}%</span><span><em>触发源</em>Telegram</span></div>
      <div class="explain-callout"><div class="callout-icon">↗</div><div><span class="${toneClass}">模型结论 · ${bias}</span><p>${bias === "偏多共振" ? "价格与 OI 同步增长，且资金费率为负，可能存在空头拥挤后的回补动能。" : bias === "偏空共振" ? "价格下跌但 OI 增长，显示新空头进入或多头被动承压，需结合清算强度确认。" : "关键因子尚未形成同向共振，仅保留为观察信号，不进入执行队列。"} 外部消息不会直接触发下单。</p></div></div>`;
    result.classList.remove("parsing");
  }, 420);
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
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") parseSignal();
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
document.querySelector("#parse-signal").addEventListener("click", parseSignal);
document.querySelector("#clear-signal").addEventListener("click", () => {
  document.querySelector("#signal-text").value = "";
  document.querySelector("#signal-text").focus();
});

document.querySelector("#refresh-scan").addEventListener("click", () => hydrateAlphaScan({ announce: true }));
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
      if (credentialEnvironment && ["testnet", "live"].includes(mode)) credentialEnvironment.value = mode;
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
document.querySelector("#fill-live-phrase")?.addEventListener("click", fillLiveUnlockPhrase);
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

document.querySelector("#show-roadmap").addEventListener("click", () => document.querySelector("#roadmap-dialog").showModal());
document.querySelector("#expand-universe").addEventListener("click", () => document.querySelector("#roadmap-dialog").showModal());

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

document.querySelector("#export-audit")?.addEventListener("click", () => {
  downloadCsv("alpha-radar-risk-audit.csv", [
    ["audit_id", "intent_id", "state", "status", "message", "timestamp"],
    ...paperRiskState.audits.map((audit) => [audit.auditId, audit.intentId, audit.state, audit.status, audit.message, audit.timestamp])
  ]);
  showToast("风控审计日志已导出");
});

const mobileMenu = document.querySelector("#mobile-menu");
const sidebar = document.querySelector("#sidebar");
mobileMenu.addEventListener("click", () => {
  const open = sidebar.classList.toggle("open");
  mobileMenu.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll(".side-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".side-nav a").forEach((item) => item.classList.toggle("active", item === link));
    sidebar.classList.remove("open");
    mobileMenu.setAttribute("aria-expanded", "false");
  });
});

const platformMenuToggle = document.querySelector("#platform-menu-toggle");
const platformNav = document.querySelector("#platform-nav");
const platformLanguage = document.querySelector("#platform-language");
const platformTheme = document.querySelector("#platform-theme");
let platformLang = localStorage.getItem("welinkbtc-language") || "zh";
let platformThemeMode = localStorage.getItem("welinkbtc-theme") || "dark";
const radarUiTranslator = window.WelinkUiTranslator?.create({
  roots: [
    document.querySelector(".app-shell"),
    ...document.querySelectorAll("dialog"),
    document.querySelector(".toast")
  ],
  profile: "radar",
  exclude: ".surf-pulse-feed .surf-card-title, .surf-pulse-feed .surf-card-summary"
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
  document.querySelectorAll("[data-platform-zh]").forEach((item) => {
    item.textContent = item.dataset[`platform${platformLang === "zh" ? "Zh" : "En"}`];
  });
  platformLanguage.textContent = platformLang === "zh" ? "EN" : "中";
  platformLanguage.setAttribute("aria-label", platformLang === "zh" ? "Switch to English" : "切换到中文");
  radarUiTranslator?.setLanguage(platformLang);
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
});

platformTheme.addEventListener("click", () => {
  platformThemeMode = platformThemeMode === "dark" ? "light" : "dark";
  localStorage.setItem("welinkbtc-theme", platformThemeMode);
  applyPlatformTheme();
});

applyPlatformLanguage();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    window.clearTimeout(marketReconnectTimer);
    window.clearTimeout(futuresReconnectTimer);
    window.clearTimeout(cryptoBubblesTimer);
    window.clearTimeout(alphaScanTimer);
    window.clearTimeout(telegramSignalTimer);
    window.clearTimeout(strongTradeIntentExpiryTimer);
    window.clearTimeout(surfPulseTimer);
    window.clearTimeout(paperMonitorTimer);
    window.clearTimeout(alphaExecutionTimer);
    window.clearTimeout(livePortfolioPullTimer);
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
  hydrateRecentSignals({ force: true });
  hydrateSurfPulse();
  hydrateAlphaExecution();
  ensureLivePortfolioPullSchedule();
  schedulePaperMonitor(0);
});

window.addEventListener("beforeunload", () => {
  window.clearTimeout(marketReconnectTimer);
  window.clearTimeout(futuresReconnectTimer);
  window.clearTimeout(cryptoBubblesTimer);
  window.clearTimeout(alphaScanTimer);
  window.clearTimeout(telegramSignalTimer);
  window.clearTimeout(strongTradeIntentExpiryTimer);
  window.clearTimeout(surfPulseTimer);
  window.clearTimeout(paperMonitorTimer);
  window.clearTimeout(alphaExecutionTimer);
  window.clearTimeout(livePortfolioPullTimer);
  if (marketSocket) marketSocket.close();
  if (futuresMarketSocket) futuresMarketSocket.close();
  if (alphaExecutionUserSocket) alphaExecutionUserSocket.close();
});

startMarketFeed();
hydrateCryptoBubbles();
hydrateAlphaScan();
hydrateRecentSignals({ force: true });
hydrateSurfPulse();
initializePaperRiskEngine();
hydrateAlphaExecution();
