(() => {
  const assets = {
    NVDAB: { symbol: "NVDAB", name: "NVIDIA Tokenized Stock", nameZh: "英伟达", avatar: "N", avatarClass: "nvda", kind: "stock" },
    AAPLB: { symbol: "AAPLB", name: "Apple Tokenized Stock", nameZh: "苹果", avatar: "A", avatarClass: "aapl", kind: "stock" },
    MSFTB: { symbol: "MSFTB", name: "Microsoft Tokenized Stock", nameZh: "微软", avatar: "M", avatarClass: "msft", kind: "stock" },
    TSLAB: { symbol: "TSLAB", name: "Tesla Tokenized Stock", nameZh: "特斯拉", avatar: "T", avatarClass: "tsla", kind: "stock" },
    COINB: { symbol: "COINB", name: "Coinbase Tokenized Stock", nameZh: "Coinbase全球", avatar: "C", avatarClass: "coin", kind: "stock" },
    QQQB: { symbol: "QQQB", name: "Nasdaq 100 Tokenized ETF", nameZh: "景顺纳斯达克100 ETF", avatar: "Q", avatarClass: "qqq", kind: "etf" },
    SPYB: { symbol: "SPYB", name: "S&P 500 Tokenized ETF", nameZh: "SPDR标普500 ETF", avatar: "S", avatarClass: "spy", kind: "etf" }
  };
  Object.values(assets).forEach((asset) => Object.assign(asset, {
    price: null, change: null, changeUsd: null, volume: null, liquidity: null, portfolio: null,
    contractAddress: null, campaignEligibility: "UNVERIFIED"
  }));
  const tickerByBstock = { NVDAB: "NVDA", AAPLB: "AAPL", MSFTB: "MSFT", TSLAB: "TSLA", COINB: "COIN", QQQB: "QQQ", SPYB: "SPY" };
  const bstockByTicker = Object.fromEntries(Object.entries(tickerByBstock).map(([bstock, ticker]) => [ticker, bstock]));
  const MAX_POSITION_PCT = 50;

  const selectors = (value, root = document) => [...root.querySelectorAll(value)];
  const byId = (id) => document.getElementById(id);
  const uiTranslator = window.WelinkUiTranslator?.create({
    roots: document.body,
    profile: "bstock",
    exclude: "#surf-assistant, #bstock-autotrade, script, style"
  });
  let selected = assets.NVDAB;
  let executionMode = "policy";
  let tradeSide = "buy";
  let walletAddress = "";
  let agentSessionReady = false;
  let walletConnectionMode = "";
  let browserWalletVerified = false;
  window.BstockAutoWalletContext = {
    getState: () => ({ mode: walletConnectionMode, address: walletAddress })
  };
  let walletContextVersion = 0;
  let walletLoginVersion = 0;
  let walletActionInFlight = false;
  let researchRequestVersion = 0;
  let agentQrObjectUrl = "";
  let agentLoginExpiresAt = 0;
  let agentLoginTimer;
  let agentLoginRequest;
  let agentLoginPollTimer;
  let agentLoginVerifyRequest;
  let agentLoginVerifying = false;
  let agentLoginPhase = "IDLE";
  let liveSnapshot = null;
  let liveSnapshotRequest;
  let marketSnapshotRequest;
  let marketHistoryRequest;
  let chartInterval = "4h";
  let tradeQuoteIntent = "";
  let tradeQuote = null;
  let orderPollTimer;
  let activePendingOrderId = "";
  let buyDraftAmount = "10";
  const sellDraftAmounts = new Map();
  let researchPreview = null;
  let researchPreviewRequest;
  let researchPreviewRetry = null;
  const studioReports = {};
  let studioJobPollTimer;
  let activeStudioJobId = "";
  let pendingReportReaderSymbol = "";
  let activeReportReader = null;
  let reportReaderLanguage = localStorage.getItem("bstock-alpha-report-language") === "en" ? "en" : "zh";
  let reportReaderRequest;
  let toastTimer;
  let eligibilityMeta = null;
  let localizationRequest;
  const watchlist = new Set();
  const hiddenWeeklyOpportunities = new Set();
  const bstockStorage = window.BstockAlphaStorage;
  const publicDataCacheKey = bstockStorage.publicDataCacheKey;

  function brandIconUrl(symbol) {
    return `/api/bstock-alpha/brand-icon?symbol=${encodeURIComponent(String(symbol || "").toUpperCase())}`;
  }
  try {
    const stored = JSON.parse(localStorage.getItem("bstock-alpha-watchlist") || "[]");
    if (Array.isArray(stored)) stored.filter((symbol) => typeof symbol === "string").forEach((symbol) => watchlist.add(symbol));
  } catch {
    localStorage.removeItem("bstock-alpha-watchlist");
  }
  try {
    const stored = JSON.parse(localStorage.getItem("bstock-alpha-hidden-weekly-opportunities") || "[]");
    if (Array.isArray(stored)) stored
      .filter((symbol) => typeof symbol === "string" && /^[A-Z][A-Z0-9]{1,11}B$/.test(symbol))
      .forEach((symbol) => hiddenWeeklyOpportunities.add(symbol));
  } catch {
    localStorage.removeItem("bstock-alpha-hidden-weekly-opportunities");
  }

  function readPublicDataCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(publicDataCacheKey) || "null");
      if (!cached) return null;
      const marketSavedAt = Date.parse(cached.market?.savedAt || "");
      const cmcSavedAt = Date.parse(cached.cmc?.savedAt || "");
      const market = Number.isFinite(marketSavedAt)
        && Array.isArray(cached.market?.data?.assets)
        && cached.market.data.assets.length
        ? structuredClone(cached.market.data)
        : null;
      if (market && Date.now() - marketSavedAt > 24 * 60 * 60_000) {
        market.assets.forEach((asset) => Object.assign(asset, {
          price: null,
          priceChange: null,
          priceChangePercent: null,
          quoteVolume: null,
          marketUpdatedAt: null
        }));
        market.deliveryMode = "BROWSER_CATALOG";
      }
      if (market?.eligibilityEffectiveUntil && Date.now() > Date.parse(market.eligibilityEffectiveUntil)) {
        market.assets.forEach((asset) => { asset.campaignEligibility = "UNVERIFIED"; });
        market.eligibleCount = 0;
        market.eligibilitySourceAvailable = false;
        market.eligibilitySourceMode = "CACHED_EXPIRED_ELIGIBILITY";
      }
      const cmc = Number.isFinite(cmcSavedAt) && Date.now() - cmcSavedAt <= 30 * 60_000
        ? cached.cmc.data
        : null;
      return {
        live: Boolean(cmc || market),
        ...(cmc ? { cmc } : {}),
        ...(market ? { market } : {}),
        sources: {
          cache: {
            status: "BROWSER_CACHE",
            marketSavedAt: Number.isFinite(marketSavedAt) ? cached.market.savedAt : null,
            cmcSavedAt: Number.isFinite(cmcSavedAt) ? cached.cmc.savedAt : null
          }
        }
      };
    } catch {
      localStorage.removeItem(publicDataCacheKey);
      return null;
    }
  }

  function writePublicDataCache(payload) {
    bstockStorage.writePublicDataCache(payload);
  }

  async function loadBstockLocalization() {
    if (localizationRequest) return localizationRequest;
    localizationRequest = fetch("/legacy/data/bstock-localization.json", {
      headers: { Accept: "application/json" },
      cache: "force-cache"
    })
      .then((response) => {
        if (!response.ok) throw new Error("bStock localization unavailable");
        return response.json();
      })
      .then((payload) => {
        Object.entries(payload?.names || {}).forEach(([symbol, nameZh]) => {
          if (assets[symbol] && typeof nameZh === "string" && nameZh.trim()) assets[symbol].nameZh = nameZh.trim();
        });
        renderUniverse();
        if (selected) setAsset(selected);
        if (liveSnapshot?.wallet) {
          renderWalletPositions(liveSnapshot.wallet, liveSnapshot.tradingLedger);
          renderOrderRecords(liveSnapshot.tradingLedger);
          renderRealizedLedger(liveSnapshot.tradingLedger);
        }
      })
      .catch(() => undefined)
      .finally(() => { localizationRequest = undefined; });
    return localizationRequest;
  }

  const provider = () => window.ethereum || (window.parent !== window ? window.parent.ethereum : undefined);
  const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
  const compactUsd = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
  const shortAddress = (value) => `${value.slice(0, 6)}…${value.slice(-4)}`;
  const escapeCsv = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const browserWalletReady = () => walletConnectionMode === "browser" && browserWalletVerified && Boolean(walletAddress);
  const walletOperational = () => agentSessionReady || browserWalletReady();
  const walletRequestContext = () => browserWalletReady()
    ? { walletMode: "browser", address: walletAddress }
    : { walletMode: "agent" };

  function assertWalletContext(version) {
    if (version !== walletContextVersion || !walletOperational()) {
      throw new Error("钱包连接方式或账户已改变，请重新获取付款预览或交易报价。");
    }
  }

  function resetWalletContext() {
    walletContextVersion += 1;
    researchRequestVersion += 1;
    researchPreview = null;
    researchPreviewRequest?.abort();
    researchPreviewRequest = undefined;
    researchPreviewRetry = null;
    byId("retry-research-preview").hidden = true;
    resetTradeQuote();
    liveSnapshotRequest?.abort();
    clearTimeout(orderPollTimer);
    clearTimeout(studioJobPollTimer);
    activePendingOrderId = "";
    activeStudioJobId = "";
    reportReaderRequest?.abort();
    activeReportReader = null;
    pendingReportReaderSymbol = "";
    Object.keys(studioReports).forEach((symbol) => { delete studioReports[symbol]; });
    if (liveSnapshot) liveSnapshot = { ...liveSnapshot, wallet: null, tradingLedger: null, studioReports: [], studioReportHistory: [], pendingStudioJobs: [] };
    renderWalletPositions(null, null);
    renderOrderRecords(null);
    renderRealizedLedger(null);
    renderReportHistory([]);
    renderPerformanceMetrics(null, null);
    for (const id of ["research-dialog", "trade-dialog", "report-reader-dialog"]) {
      if (byId(id).open) byId(id).close();
    }
    byId("confirm-paid-research").disabled = true;
    byId("confirm-intent").disabled = true;
    setAsset(selected);
  }

  function decimalRatio(value, percent) {
    const text = String(value ?? "").trim();
    if (!/^\d+(?:\.\d+)?$/.test(text)) return "";
    if (percent === 100) return text.replace(/^0+(?=\d)/, "").replace(/\.0+$/, "") || "0";
    const [whole, fraction = ""] = text.split(".");
    const scale = 10n ** BigInt(fraction.length);
    const units = BigInt(whole || "0") * scale + BigInt(fraction || "0");
    const result = units * BigInt(percent) / 100n;
    const resultWhole = result / scale;
    const resultFraction = String(result % scale).padStart(fraction.length, "0").replace(/0+$/, "");
    return `${resultWhole}${resultFraction ? `.${resultFraction}` : ""}`;
  }

  function exactHeldAmount() {
    const held = bstockBalance();
    return String(held?.balanceExact ?? held?.balance ?? "");
  }

  function rememberTradeAmount() {
    const value = byId("order-amount")?.value || "";
    if (tradeSide === "buy") buyDraftAmount = value;
    else if (selected?.symbol) sellDraftAmounts.set(selected.symbol, value);
  }

  function syncTradeAmountControls({ initialize = false } = {}) {
    const input = byId("order-amount");
    const payToken = byId("pay-token");
    const isSell = tradeSide === "sell";
    byId("order-amount-label").textContent = isSell ? "卖出 bStock 数量" : "支付金额";
    byId("order-input-unit").textContent = isSell ? selected.symbol : payToken.value;
    byId("pay-token-role").textContent = isSell ? "到账币种" : "支付币种";
    input.setAttribute("aria-label", isSell ? `卖出 ${selected.symbol} 数量` : "支付金额");
    input.step = isSell ? "any" : "0.01";
    input.placeholder = isSell ? "输入持仓数量" : "输入支付金额";
    payToken.setAttribute("aria-label", isSell ? "卖出后到账币种" : "买入支付币种");
    document.querySelector(".order-panel")?.setAttribute("data-trade-side", tradeSide);
    selectors("[data-buy-amount]").forEach((button) => {
      button.textContent = isSell ? (button.dataset.sellRatio === "100" ? "全部" : `${button.dataset.sellRatio}%`) : `$${button.dataset.buyAmount}`;
    });
    if (initialize) {
      if (isSell) {
        const saved = sellDraftAmounts.get(selected.symbol);
        const defaultAmount = decimalRatio(exactHeldAmount(), 25);
        input.value = saved && Number(saved) > 0 ? saved : defaultAmount;
      } else {
        input.value = buyDraftAmount || "10";
      }
    }
    selectors("[data-buy-amount]").forEach((button) => {
      const expected = isSell
        ? decimalRatio(exactHeldAmount(), Number(button.dataset.sellRatio))
        : button.dataset.buyAmount;
      button.classList.toggle("active", Boolean(expected) && input.value === expected);
    });
  }

  function avatarClassFor(symbol) {
    return `asset-${[...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 7}`;
  }

  function isRecommended(asset) {
    const score = currentDecisionScore(asset);
    return Number.isFinite(score) && score >= 70;
  }

  function persistWatchlist() {
    localStorage.setItem("bstock-alpha-watchlist", JSON.stringify([...watchlist]));
  }

  function persistHiddenWeeklyOpportunities() {
    localStorage.setItem(
      "bstock-alpha-hidden-weekly-opportunities",
      JSON.stringify([...hiddenWeeklyOpportunities])
    );
  }

  function updateUniverseCounts() {
    const tradable = Object.values(assets).filter((asset) => asset.contractAddress);
    const confirmed = tradable.filter((asset) => asset.campaignEligibility === "CONFIRMED");
    const hiddenConfirmed = confirmed.filter((asset) => hiddenWeeklyOpportunities.has(asset.symbol));
    const visibleConfirmed = confirmed.filter((asset) => !hiddenWeeklyOpportunities.has(asset.symbol));
    const counts = {
      all: tradable.length,
      weekly: visibleConfirmed.length,
      stock: tradable.filter((asset) => asset.kind === "stock").length,
      etf: tradable.filter((asset) => asset.kind === "etf").length,
      recommended: tradable.filter(isRecommended).length,
      watchlist: tradable.filter((asset) => watchlist.has(asset.symbol)).length
    };
    selectors("[data-universe-filter]").forEach((button) => {
      const count = button.querySelector("em");
      if (count) count.textContent = String(counts[button.dataset.universeFilter] ?? 0);
    });
    const restore = byId("restore-weekly-opportunities");
    if (restore) {
      restore.hidden = hiddenConfirmed.length === 0;
      restore.textContent = hiddenConfirmed.length ? `恢复已移除 ${hiddenConfirmed.length}` : "恢复已移除";
    }
    const footer = byId("eligibility-week");
    if (footer && tradable.length) {
      footer.textContent = hiddenConfirmed.length
        ? `${tradable.length} 个固定 · 周机会 ${visibleConfirmed.length}/${confirmed.length} · 长期保留`
        : `${tradable.length} 个固定 · 周机会 ${confirmed.length} · 长期保留`;
    }
  }

  function createUniverseRow(asset) {
    const row = document.createElement("div");
    row.className = `token-row${asset === selected ? " active" : ""}`;
    row.dataset.symbol = asset.symbol;
    row.dataset.kind = asset.kind;
    row.dataset.recommended = isRecommended(asset) ? "true" : "false";
    row.dataset.weekly = asset.campaignEligibility === "CONFIRMED"
      && !hiddenWeeklyOpportunities.has(asset.symbol) ? "true" : "false";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-label", `选择 ${asset.symbol} ${asset.nameZh || ""} ${asset.name}`.replace(/\s+/g, " ").trim());

    const avatar = document.createElement("span");
    updateAvatar(avatar, asset, false);
    const name = document.createElement("span");
    name.className = "token-name";
    const symbolLine = document.createElement("span");
    symbolLine.className = "token-symbol-line";
    const symbol = document.createElement("strong");
    symbol.textContent = asset.symbol;
    symbol.title = asset.campaignEligibility === "CONFIRMED"
      ? "Binance 官方清单与 type=3 合约双重核验；已长期保留在周机会目录"
      : "Binance type=3 注册表已核验；当前活动周资格等待官方清单更新";
    const chineseName = document.createElement("em");
    chineseName.className = "token-name-zh";
    chineseName.textContent = asset.nameZh || "中文名待核验";
    symbolLine.append(symbol, chineseName);
    const detail = document.createElement("small");
    detail.textContent = `${asset.name} · ${asset.kind === "etf" ? "ETF" : "bStock"}${asset.leveragedOrInverse ? " · 高风险杠杆/反向" : ""}`;
    name.append(symbolLine, detail);
    const quote = document.createElement("span");
    quote.className = "token-quote";
    const price = document.createElement("strong");
    price.textContent = Number.isFinite(asset.price) ? money(asset.price) : "—";
    const change = document.createElement("em");
    change.textContent = Number.isFinite(asset.change) ? `${asset.change >= 0 ? "+" : "−"}${Math.abs(asset.change).toFixed(2)}%` : "—";
    change.className = Number.isFinite(asset.change) ? (asset.change >= 0 ? "up" : "down") : "";
    quote.append(price, change);
    const score = document.createElement("span");
    score.className = `score-pill${isRecommended(asset) ? " recommended" : ""}`;
    const decisionScore = currentDecisionScore(asset);
    score.textContent = Number.isFinite(decisionScore) ? String(Math.round(decisionScore)) : "—";
    score.title = isRecommended(asset) ? "确定性策略评分 ≥ 70，已自动加入推荐" : "确定性策略评分";
    const watch = document.createElement("button");
    watch.type = "button";
    watch.className = `watch-toggle${watchlist.has(asset.symbol) ? " active" : ""}`;
    watch.textContent = watchlist.has(asset.symbol) ? "★" : "☆";
    watch.setAttribute("aria-label", `${watchlist.has(asset.symbol) ? "移除" : "加入"}自选 ${asset.symbol}`);
    watch.addEventListener("click", (event) => {
      event.stopPropagation();
      if (watchlist.has(asset.symbol)) watchlist.delete(asset.symbol); else watchlist.add(asset.symbol);
      persistWatchlist();
      renderUniverse();
      showToast(`${asset.symbol} 已${watchlist.has(asset.symbol) ? "加入" : "移出"}自选。`);
    });
    const removeWeekly = document.createElement("button");
    removeWeekly.type = "button";
    removeWeekly.className = "weekly-remove";
    removeWeekly.textContent = "×";
    removeWeekly.hidden = asset.campaignEligibility !== "CONFIRMED";
    removeWeekly.setAttribute("aria-label", `从周机会移除 ${asset.symbol}`);
    removeWeekly.title = "从周机会移除；标的仍保留在全部列表并可交易";
    removeWeekly.addEventListener("click", (event) => {
      event.stopPropagation();
      hiddenWeeklyOpportunities.add(asset.symbol);
      persistHiddenWeeklyOpportunities();
      renderUniverse();
      showToast(`${asset.symbol} 已从周机会移除，仍保留在全部列表。`);
    });
    const rowActions = document.createElement("span");
    rowActions.className = "token-actions";
    rowActions.append(watch, removeWeekly);
    const choose = () => setAsset(asset);
    row.addEventListener("click", choose);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(); }
    });
    row.append(avatar, name, quote, score, rowActions);
    return row;
  }

  function renderUniverse() {
    const list = byId("token-list");
    if (!list) return;
    const tradableAssets = Object.values(assets)
      .filter((asset) => asset.contractAddress)
      .sort((left, right) => left.ticker.localeCompare(right.ticker));
    list.replaceChildren();
    if (!tradableAssets.length) {
      const empty = document.createElement("div");
      empty.className = "universe-empty";
      empty.textContent = "持久化 bStock 注册表当前不可用；不会使用演示标的。";
      list.append(empty);
    } else {
      tradableAssets.forEach((asset) => list.append(createUniverseRow(asset)));
      const filterEmpty = document.createElement("div");
      filterEmpty.className = "universe-empty universe-filter-empty";
      filterEmpty.hidden = true;
      list.append(filterEmpty);
    }
    updateUniverseCounts();
    filterUniverse();
  }

  function paymentBalance(symbol = byId("pay-token")?.value) {
    return liveSnapshot?.wallet?.paymentBalances?.find((entry) => entry.symbol === symbol) || null;
  }

  function bstockBalance(symbol = selected.symbol) {
    return liveSnapshot?.wallet?.bstockBalances?.find((entry) => entry.symbol === symbol) || null;
  }

  function resetTradeQuote() {
    tradeQuoteIntent = "";
    tradeQuote = null;
  }

  function updateQualification() {
    const cmcReady = Boolean(liveSnapshot?.cmc);
    const studioReady = Object.keys(studioReports).length > 0;
    const pnlReady = Boolean(liveSnapshot?.tradingLedger?.historyAvailable && liveSnapshot?.tradingLedger?.historyComplete);
    const walletReady = Boolean(walletOperational() && liveSnapshot?.wallet);
    byId("qualification-cmc").classList.toggle("done", cmcReady);
    byId("qualification-cmc").textContent = cmcReady ? "CMC LIVE ✓" : "CMC LIVE 等待";
    byId("qualification-studio").classList.toggle("done", studioReady);
    byId("qualification-studio").textContent = studioReady ? "STUDIO PAID ✓" : "STUDIO PAID 等待";
    byId("qualification-pnl").classList.toggle("done", pnlReady);
    byId("qualification-pnl").textContent = pnlReady ? "PNL RECONCILED ✓" : "PNL 对账待接入";
    byId("qualification-wallet").classList.toggle("done", walletReady);
    byId("qualification-wallet").textContent = walletReady ? "WALLET LIVE ✓" : "WALLET";
    const count = Number(cmcReady) + Number(studioReady) + Number(pnlReady) + Number(walletReady);
    document.querySelector(".metric-card--qualification .metric-head em").textContent = `${count} / 4`;
    document.querySelector(".metric-card--qualification .progress i").style.width = `${count * 25}%`;
  }

  function showToast(message, kind = "success") {
    const toast = byId("toast");
    if (!toast) return;
    toast.classList.toggle("error", kind === "error");
    toast.querySelector("span").textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function updateAvatar(element, asset, eager = true) {
    if (!element) return;
    element.replaceChildren();
    element.className = `token-avatar ${asset.avatarClass}`;
    element.setAttribute("aria-hidden", "true");
    const fallback = document.createElement("span");
    fallback.className = "token-avatar-fallback";
    fallback.textContent = asset.avatar;
    element.append(fallback);
    if (!asset.contractAddress) return;
    const image = document.createElement("img");
    image.className = "token-brand-icon";
    image.alt = "";
    image.loading = eager ? "eager" : "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("load", () => element.classList.add("has-brand-icon"), { once: true });
    image.addEventListener("error", () => {
      image.remove();
      element.classList.remove("has-brand-icon");
    }, { once: true });
    image.src = asset.brandIconUrl || brandIconUrl(asset.symbol);
    element.append(image);
  }

  function decisionMeta(score) {
    if (!Number.isFinite(score)) return { action: "WAIT", copy: "等待全部真实信号", allowed: false };
    if (score >= 78) return { action: "BUY", copy: "信号共振，允许标准仓位", allowed: true };
    if (score >= 70) return { action: "BUY SMALL", copy: "信号合格，仅允许半仓试单", allowed: true };
    if (score >= 55) return { action: "HOLD", copy: "赔率不足，保持观察", allowed: false };
    return { action: "BLOCK", copy: "低于门槛，禁止新开仓", allowed: false };
  }

  function currentLiquidityScore(asset = selected) {
    const values = Object.values(assets).map((item) => item.volume).filter((value) => Number.isFinite(value) && value > 0);
    if (!Number.isFinite(asset.volume) || asset.volume <= 0 || values.length < 2) return null;
    const logs = values.map((value) => Math.log10(value));
    const min = Math.min(...logs);
    const max = Math.max(...logs);
    return max === min ? 75 : Math.round(50 + (Math.log10(asset.volume) - min) / (max - min) * 50);
  }

  function currentPortfolioScore(asset = selected) {
    const total = liveSnapshot?.wallet?.totalWalletValueUsd;
    if (!Number.isFinite(total) || total <= 0) return null;
    const exposure = bstockBalance(asset.symbol)?.valueUsd || 0;
    return Math.round(Math.max(0, Math.min(100, 100 - (exposure / total * 100) / 8 * 100)));
  }

  function currentDecisionScore(asset = selected) {
    const crypto = liveSnapshot?.cmc?.score;
    const equity = studioReports[asset.symbol]?.score;
    const liquidity = currentLiquidityScore(asset);
    const portfolio = currentPortfolioScore(asset);
    if (![crypto, equity, liquidity, portfolio].every(Number.isFinite)) return null;
    return crypto * .3 + equity * .45 + liquidity * .15 + portfolio * .1;
  }

  function setAsset(asset) {
    const previousSymbol = selected?.symbol;
    if (tradeSide === "sell" && selected?.symbol) rememberTradeAmount();
    selected = asset;
    // Live balance/market refreshes re-render the currently selected asset.
    // They must not erase a still-valid, server-issued Agentic Wallet quote.
    // Only an actual symbol change invalidates the quote intent.
    if (previousSymbol !== asset.symbol) resetTradeQuote();
    selectors(".token-row").forEach((row) => row.classList.toggle("active", row.dataset.symbol === asset.symbol));
    byId("asset-symbol").textContent = asset.symbol;
    byId("asset-name").textContent = `${asset.nameZh ? `${asset.nameZh} · ` : ""}${asset.name} · BSC`;
    const eligibilityLabel = asset.campaignEligibility === "CONFIRMED" ? "ELIGIBLE" : asset.campaignEligibility === "NOT_LISTED" ? "NOT LISTED" : "UNVERIFIED";
    byId("asset-eligibility").textContent = eligibilityLabel;
    byId("order-eligibility").textContent = eligibilityLabel;
    byId("asset-price").textContent = Number.isFinite(asset.price) ? money(asset.price) : "—";
    const change = byId("asset-change");
    change.textContent = Number.isFinite(asset.change) && Number.isFinite(asset.changeUsd)
      ? `${asset.change >= 0 ? "+" : "−"}${money(Math.abs(asset.changeUsd))} · ${asset.change >= 0 ? "+" : "−"}${Math.abs(asset.change).toFixed(2)}%`
      : "等待 Binance 实时行情";
    change.className = Number.isFinite(asset.change) ? (asset.change >= 0 ? "up" : "down") : "";
    byId("asset-volume").textContent = Number.isFinite(asset.volume) ? compactUsd(asset.volume) : "—";
    const liquidityScore = currentLiquidityScore(asset);
    byId("asset-liquidity-label").textContent = Number.isFinite(liquidityScore) ? `${liquidityScore}/100` : "—";
    byId("crypto-score").textContent = Number.isFinite(liveSnapshot?.cmc?.score) ? liveSnapshot.cmc.score : "—";
    const studioReport = studioReports[asset.symbol];
    byId("equity-score").textContent = Number.isFinite(studioReport?.score) ? studioReport.score : "—";
    byId("equity-rating").textContent = studioReport?.rating || "等待研报";
    const target = studioReport?.targetPrice;
    byId("target-price").textContent = Number.isFinite(target) ? money(target) : "—";
    byId("target-upside").textContent = Number.isFinite(target) && Number.isFinite(asset.price) && asset.price > 0
      ? `${((target / asset.price - 1) * 100).toFixed(1)}% UPSIDE`
      : "—";
    byId("equity-thesis").textContent = studioReport?.risks || "生成并完成 Agent Studio 真实付费研报后显示；不会使用本地基线替代。";
    byId("studio-source-label").textContent = studioReport ? "Agent Studio 真实付费研报" : "尚无真实付费研报";
    byId("studio-live-state").textContent = studioReport ? "VERIFIED" : "EMPTY";
    const appreciationButton = byId("studio-report-appreciation");
    appreciationButton.disabled = !studioReport;
    appreciationButton.title = studioReport ? `查看 ${asset.symbol} 最新 Agent Studio 研报赏析` : "请先生成或回捞 Agent Studio 研报";
    updateQualification();
    const finalScore = currentDecisionScore(asset);
    byId("final-score").textContent = Number.isFinite(finalScore) ? finalScore.toFixed(1) : "—";
    const cryptoScore = liveSnapshot?.cmc?.score;
    const equityScore = studioReport?.score;
    const portfolioScore = currentPortfolioScore(asset);
    [["crypto", cryptoScore, .3], ["equity", equityScore, .45], ["liquidity", liquidityScore, .15], ["portfolio", portfolioScore, .1]].forEach(([key, value, weight]) => {
      byId(`bar-${key}`).style.width = `${Number.isFinite(value) ? value : 0}%`;
      byId(`weight-${key}`).textContent = Number.isFinite(value) ? (value * weight).toFixed(1) : "—";
    });
    const decision = decisionMeta(finalScore);
    byId("decision-badge").textContent = decision.action;
    byId("decision-badge").classList.toggle("hold", !decision.allowed);
    byId("decision-copy").textContent = decision.copy;
    byId("chart-price-label").textContent = Number.isFinite(asset.price) ? asset.price.toFixed(2) : "—";
    byId("order-symbol").textContent = asset.symbol;
    const universeRow = document.querySelector(`.token-row[data-symbol="${asset.symbol}"]`);
    if (universeRow) {
      universeRow.dataset.recommended = isRecommended(asset) ? "true" : "false";
      const score = universeRow.querySelector(".score-pill");
      if (score) {
        score.textContent = Number.isFinite(finalScore) ? String(Math.round(finalScore)) : "—";
        score.classList.toggle("recommended", isRecommended(asset));
      }
    }
    updateUniverseCounts();
    updateAvatar(byId("asset-avatar"), asset);
    updateAvatar(byId("order-avatar"), asset);
    if (tradeSide === "sell") syncTradeAmountControls({ initialize: true });
    else syncTradeAmountControls();
    updateEstimate();
    updateRiskState();
    refreshMarketHistory(asset.symbol, chartInterval);
  }

  function updateEstimate() {
    const amount = Math.max(0, Number(byId("order-amount").value) || 0);
    const payPrice = paymentBalance()?.price || (byId("pay-token").value === "BNB" ? 0 : 1);
    if (!Number.isFinite(selected.price) || selected.price <= 0 || payPrice <= 0) {
      byId("estimated-output").textContent = "—";
      return;
    }
    const output = tradeSide === "buy" ? amount * payPrice / selected.price : amount * selected.price / payPrice;
    byId("estimated-output").textContent = `≈ ${output.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${tradeSide === "buy" ? selected.symbol : byId("pay-token").value}`;
  }

  function updateRiskState() {
    const amount = Math.max(0, Number(byId("order-amount").value) || 0);
    const slippage = Math.max(0, Number(byId("slippage").value) || 0);
    const pay = paymentBalance();
    const payPrice = pay?.price || (byId("pay-token").value === "BNB" ? 0 : 1);
    const notionalUsd = tradeSide === "buy" ? amount * payPrice : amount * (selected.price || 0);
    const portfolioValue = liveSnapshot?.wallet?.totalWalletValueUsd || 0;
    const currentPositionValue = bstockBalance()?.valueUsd || 0;
    const postTradePositionValue = tradeSide === "buy" ? currentPositionValue + notionalUsd : Math.max(0, currentPositionValue - notionalUsd);
    const positionPct = portfolioValue > 0 ? postTradePositionValue / portfolioValue * 100 : null;
    const positionPass = Number.isFinite(positionPct) && positionPct < MAX_POSITION_PCT;
    const slippagePass = slippage <= .5;
    const decisionScore = currentDecisionScore();
    const scorePass = tradeSide === "sell" || decisionMeta(decisionScore).allowed;
    const dualAiReady = Boolean(liveSnapshot?.cmc && studioReports[selected.symbol]);
    const eligibilityConfirmed = selected.campaignEligibility === "CONFIRMED";
    const exitHoldingReady = tradeSide === "sell" && Boolean(bstockBalance() && Number(exactHeldAmount()) > 0);
    const eligibilityPass = eligibilityConfirmed || exitHoldingReady;
    const eligibilityRisk = byId("eligibility-risk");
    eligibilityRisk.className = eligibilityPass ? "pass" : selected.campaignEligibility === "NOT_LISTED" ? "fail" : "pending";
    eligibilityRisk.querySelector("strong").textContent = exitHoldingReady && !eligibilityConfirmed ? "EXIT ALLOWED" : eligibilityConfirmed ? "PASS" : selected.campaignEligibility === "NOT_LISTED" ? "BLOCK" : "资格未核验";
    const gasPass = Boolean(liveSnapshot?.wallet?.paymentBalances?.find((entry) => entry.symbol === "BNB" && entry.balance >= .0002));
    const balancePass = tradeSide === "buy"
      ? Boolean(pay && pay.balance >= amount)
      : Boolean(bstockBalance() && bstockBalance().balance >= amount);
    const walletPass = Boolean(walletOperational() && liveSnapshot?.wallet && gasPass && balancePass);
    byId("position-check").textContent = Number.isFinite(positionPct) ? `${positionPct.toFixed(1)}%` : "—";
    byId("slippage-check").textContent = `${slippage.toFixed(2)}%`;
    const positionItem = byId("position-check").closest("li");
    const slippageItem = byId("slippage-check").closest("li");
    positionItem.className = positionPass ? "pass" : "fail";
    slippageItem.className = slippagePass ? "pass" : "fail";
    byId("position-check").textContent = positionPass ? `${positionPct.toFixed(1)}%` : (Number.isFinite(positionPct) ? `≥ ${MAX_POSITION_PCT}%` : "等待真实余额");
    byId("slippage-check").textContent = slippagePass ? `${slippage.toFixed(2)}%` : "超上限";
    const walletRisk = byId("wallet-risk");
    walletRisk.className = walletPass ? "pass" : "pending";
    walletRisk.querySelector("strong").textContent = !liveSnapshot?.wallet ? "读取真实余额" : !gasPass ? "BNB GAS 不足" : !balancePass ? "余额不足" : "LIVE READY";
    const dualAiRisk = byId("dual-ai-risk");
    dualAiRisk.className = tradeSide === "sell" || dualAiReady ? "pass" : "pending";
    dualAiRisk.querySelector("strong").textContent = tradeSide === "sell" ? "EXIT 不要求" : dualAiReady ? "PASS" : "等待真实信号";
    const hardChecks = [eligibilityPass, tradeSide === "sell" || dualAiReady, positionPass, slippagePass, walletPass, scorePass];
    const passed = hardChecks.filter(Boolean).length;
    byId("risk-count").textContent = `${passed} / ${hardChecks.length} HARD GATES · PNL INFO`;
    const reviewButton = byId("review-order");
    const executionReady = hardChecks.every(Boolean);
    reviewButton.disabled = !amount || !selected;
    reviewButton.dataset.preflightReady = executionReady ? "true" : "false";
    reviewButton.title = executionReady
      ? "风控硬门槛已通过，可审阅并获取真实报价"
      : "允许审阅；未通过的硬门槛仍会在报价或提交阶段阻止实盘";
    const available = byId("available-balance");
    if (liveSnapshot?.wallet) {
      const held = tradeSide === "buy" ? pay : bstockBalance();
      available.textContent = held
        ? `真实可用 ${Number(held.balance).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${tradeSide === "buy" ? byId("pay-token").value : selected.symbol}`
        : "真实余额 0";
    } else {
      available.textContent = walletOperational() ? "正在读取真实余额" : "连接后读取真实余额";
    }
  }

  function setMode(mode) {
    executionMode = "policy";
    resetTradeQuote();
    selectors("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === "policy"));
    const notice = byId("execution-notice");
    const title = notice.querySelector("strong");
    const copy = notice.querySelector("span");
    title.textContent = "Policy Live";
    copy.textContent = `仅提交通过白名单、${MAX_POSITION_PCT}% 仓位、双 AI 与实时余额复核的逐笔订单。`;
    if (mode && mode !== "policy") showToast("生产环境仅保留 POLICY 模式。", "error");
    if (walletOperational()) refreshLiveSnapshot();
    updateRiskState();
  }

  function setTradeSide(side) {
    if (side !== "buy" && side !== "sell") return;
    rememberTradeAmount();
    tradeSide = side;
    resetTradeQuote();
    selectors("[data-side]").forEach((button) => button.classList.toggle("active", button.dataset.side === side));
    syncTradeAmountControls({ initialize: true });
    updateEstimate();
    updateRiskState();
  }

  function addLiveAudit(title, detail, category = "DATA", kind = "success") {
    const grid = byId("live-audit-grid");
    if (!grid) return;
    if (grid.querySelector("strong")?.textContent === "等待真实事件") grid.replaceChildren();
    const article = document.createElement("article");
    const time = document.createElement("span");
    time.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    const dot = document.createElement("i");
    dot.className = kind;
    const body = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = detail;
    const tag = document.createElement("em");
    tag.textContent = category;
    body.append(heading, copy);
    article.append(time, dot, body, tag);
    grid.prepend(article);
  }

  function renderWalletPositions(wallet, ledger) {
    const tbody = byId("positions-body");
    if (!tbody) return;
    tbody.replaceChildren();
    const positions = wallet?.bstockBalances?.filter((entry) => Number(entry.balance) > 0) || [];
    const costBySymbol = new Map((ledger?.positions || []).map((entry) => [entry.symbol, entry]));
    if (!positions.length) {
      const row = document.createElement("tr");
      row.id = "positions-empty";
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.textContent = wallet ? "Agentic Wallet 当前未返回 bStock 持仓。" : "连接 Agentic Wallet 后显示真实链上 bStock 余额。";
      row.append(cell);
      tbody.append(row);
    } else {
      positions.forEach((position) => {
        const row = document.createElement("tr");
        const cost = costBySymbol.get(position.symbol);
        const hasCost = typeof cost?.averageCostUsd === "number" && Number.isFinite(cost.averageCostUsd);
        const hasPnl = typeof cost?.unrealizedPnlUsd === "number" && Number.isFinite(cost.unrealizedPnlUsd);
        appendLocalizedAssetCell(row, position.symbol || "bStock");
        const values = [
          Number(position.balance).toLocaleString("en-US", { maximumFractionDigits: 8 }),
          hasCost ? money(cost.averageCostUsd) : "—",
          Number(position.price) > 0 ? money(position.price) : "—",
          money(position.valueUsd || 0),
          hasPnl ? `${cost.unrealizedPnlUsd >= 0 ? "+" : ""}${money(cost.unrealizedPnlUsd)}` : "—",
          wallet.totalWalletValueUsd > 0 ? `${(position.valueUsd / wallet.totalWalletValueUsd * 100).toFixed(2)}%` : "—",
          "可在交易面板卖出"
        ];
        values.forEach((value, index) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          if ((index === 1 || index === 4) && !hasCost && cost?.costBasisReason) cell.title = cost.costBasisReason;
          if (index === 4 && hasPnl) cell.className = cost.unrealizedPnlUsd >= 0 ? "up" : "down";
          row.append(cell);
        });
        tbody.append(row);
      });
    }
  }

  function appendTextCell(row, value, className = "") {
    const cell = document.createElement("td");
    cell.textContent = value;
    if (className) cell.className = className;
    row.append(cell);
    return cell;
  }

  function localizedAsset(symbol) {
    const normalized = String(symbol || "").trim().toUpperCase();
    if (!normalized) return { symbol: "—", nameZh: "" };
    const asset = assets[normalized] || assets[bstockByTicker[normalized]];
    return {
      symbol: asset?.symbol || normalized,
      nameZh: typeof asset?.nameZh === "string" ? asset.nameZh.trim() : ""
    };
  }

  function appendLocalizedAssetCell(row, symbol) {
    const cell = document.createElement("td");
    const identity = document.createElement("span");
    identity.className = "ledger-asset-identity";
    const localized = localizedAsset(symbol);
    const code = document.createElement("strong");
    code.textContent = localized.symbol;
    identity.append(code);
    if (localized.nameZh) {
      const chineseName = document.createElement("small");
      chineseName.textContent = localized.nameZh;
      identity.append(chineseName);
      cell.title = `${localized.symbol} · ${localized.nameZh}`;
    }
    cell.append(identity);
    row.append(cell);
    return cell;
  }

  function statusLabel(status) {
    const value = String(status || "PENDING").toUpperCase();
    return ({ INTENT_CREATED: "意图已创建", SUBMITTING: "提交中", SUBMITTED: "已提交", PENDING: "处理中", FINISHED: "已成交", REJECTED: "已拒绝", FAILED: "失败", CANCELED: "已取消", CANCELLED: "已取消", EXPIRED: "已过期" })[value] || value;
  }

  function appendChainProof(row, txHash) {
    const cell = document.createElement("td");
    if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      const link = document.createElement("a");
      link.className = "chain-proof";
      link.href = `https://bscscan.com/tx/${txHash}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = txHash;
      link.textContent = `${txHash.slice(0, 8)}…${txHash.slice(-6)} ↗`;
      cell.append(link);
    } else {
      cell.textContent = "—";
    }
    row.append(cell);
  }

  function renderOrderRecords(ledger) {
    const tbody = byId("order-records-body");
    if (!tbody) return;
    tbody.replaceChildren();
    const orders = Array.isArray(ledger?.orders) ? ledger.orders : [];
    const note = byId("orders-source-note");
    if (note) note.textContent = ledger?.historyAvailable
      ? `真实订单源：Binance Agentic Wallet · 已读取 ${ledger.fetchedOrders}${ledger.totalOrders == null ? "" : ` / ${ledger.totalOrders}`} 条${ledger.historyComplete ? "，成交历史完整。" : "；历史未完整，成本不会推测。"}`
      : "Agentic Wallet 成交历史暂不可用；仅显示已写入 bStockAlpha 审计账本的交易意图，成交数据不作推测。";
    if (!orders.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 9;
      cell.textContent = ledger ? "当前钱包尚无 bStockAlpha 买卖意图或 Agentic Wallet 市价单。" : "连接 Agentic Wallet 后显示真实订单记录。";
      row.append(cell);
      tbody.append(row);
      return;
    }
    orders.forEach((order) => {
      const row = document.createElement("tr");
      appendTextCell(row, order.createdAt ? new Date(order.createdAt).toLocaleString("zh-CN", { hour12: false }) : "—");
      appendLocalizedAssetCell(row, order.symbol);
      appendTextCell(row, order.side === "sell" ? "卖出" : "买入", order.side === "sell" ? "trade-side-sell" : "trade-side-buy");
      appendTextCell(row, order.source === "BSTOCK_ALPHA" ? `平台意图 · ${String(order.mode || "live").toUpperCase()}` : "Agentic Wallet 历史");
      appendTextCell(row, `${order.fromAmount || "—"} ${order.fromSymbol || ""}`.trim());
      appendTextCell(row, `${order.toAmount || "—"} ${order.toSymbol || ""}`.trim());
      const status = appendTextCell(row, "");
      const statusBadge = document.createElement("span");
      statusBadge.textContent = statusLabel(order.status);
      statusBadge.className = `trade-status ${order.successful ? "is-success" : order.final ? "is-failed" : "is-pending"}`;
      status.append(statusBadge);
      const orderId = String(order.orderId || "");
      const orderCell = appendTextCell(row, orderId ? `${orderId.slice(0, 8)}${orderId.length > 14 ? `…${orderId.slice(-6)}` : ""}` : "尚未提交");
      if (orderId) orderCell.title = orderId;
      appendChainProof(row, order.txHash);
      tbody.append(row);
    });
  }

  function renderRealizedLedger(ledger) {
    const tbody = byId("realized-body");
    if (!tbody) return;
    tbody.replaceChildren();
    const rows = Array.isArray(ledger?.realized) ? ledger.realized : [];
    const summary = ledger?.summary || {};
    byId("ledger-realized-pnl").textContent = typeof summary.realizedPnlUsd === "number" ? money(summary.realizedPnlUsd) : "—";
    byId("ledger-sale-proceeds").textContent = typeof summary.saleProceedsUsd === "number" ? money(summary.saleProceedsUsd) : "—";
    byId("ledger-fifo-cost").textContent = typeof summary.fifoCostUsd === "number" ? money(summary.fifoCostUsd) : "—";
    if (!rows.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.textContent = ledger?.historyAvailable ? "当前真实成交历史中没有已完成的 bStock 卖出订单。" : "成交历史暂不可用，已实现账本保持留空。";
      row.append(cell);
      tbody.append(row);
      return;
    }
    rows.forEach((entry) => {
      const row = document.createElement("tr");
      appendTextCell(row, entry.completedAt ? new Date(entry.completedAt).toLocaleString("zh-CN", { hour12: false }) : "—");
      appendLocalizedAssetCell(row, entry.symbol);
      appendTextCell(row, Number(entry.quantity).toLocaleString("en-US", { maximumFractionDigits: 8 }));
      appendTextCell(row, typeof entry.fifoCostUsd === "number" ? money(entry.fifoCostUsd) : "—");
      appendTextCell(row, "Gas 账外");
      const pnl = appendTextCell(row, typeof entry.realizedPnlUsd === "number" ? `${entry.realizedPnlUsd >= 0 ? "+" : ""}${money(entry.realizedPnlUsd)}` : "—");
      if (typeof entry.realizedPnlUsd === "number") pnl.className = entry.realizedPnlUsd >= 0 ? "up" : "down";
      appendTextCell(row, statusLabel(entry.status));
      appendChainProof(row, entry.txHash);
      tbody.append(row);
    });
  }

  function setPerformanceMetric(id, value, available) {
    const element = byId(id);
    element.textContent = available ? value : "—";
    element.className = available
      ? `metric-value ${String(value).startsWith("-") ? "down" : "up"}`
      : "metric-value";
  }

  function renderRealizedSparkline(rows) {
    const path = byId("realized-sparkline");
    const chronological = (Array.isArray(rows) ? rows : [])
      .slice()
      .reverse()
      .filter((entry) => typeof entry.realizedPnlUsd === "number" && Number.isFinite(entry.realizedPnlUsd));
    if (!chronological.length) {
      path.setAttribute("d", "");
      return;
    }
    let cumulative = 0;
    const values = [0, ...chronological.map((entry) => (cumulative += entry.realizedPnlUsd))];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const d = values.map((value, index) => {
      const x = index / Math.max(1, values.length - 1) * 180;
      const y = 36 - (value - min) / span * 32;
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
    path.setAttribute("d", d);
  }

  function renderPerformanceMetrics(ledger, wallet) {
    const summary = ledger?.summary || {};
    const historyReady = Boolean(ledger?.historyAvailable && ledger?.historyComplete);
    const realizedPnl = summary.realizedPnlUsd;
    const unrealizedPnl = summary.unrealizedPnlUsd;
    const realizedAvailable = typeof realizedPnl === "number" && Number.isFinite(realizedPnl);
    const unrealizedAvailable = typeof unrealizedPnl === "number" && Number.isFinite(unrealizedPnl);
    const realizedCount = typeof summary.realizedTradeCount === "number" ? summary.realizedTradeCount : null;
    const wins = typeof summary.winningTradeCount === "number" ? summary.winningTradeCount : null;
    const losses = typeof summary.losingTradeCount === "number" ? summary.losingTradeCount : null;
    const winRate = summary.winRatePct;
    const profitFactor = summary.profitFactor;
    const grossProfit = summary.grossProfitUsd;
    const grossLoss = summary.grossLossUsd;

    setPerformanceMetric("realized-pnl", realizedAvailable ? `${realizedPnl > 0 ? "+" : ""}${money(realizedPnl)}` : "—", realizedAvailable);
    byId("realized-source").textContent = historyReady
      ? `完整成交历史 · ${realizedCount || 0} 笔`
      : ledger?.historyAvailable ? "订单历史不完整" : "等待真实成交历史";
    byId("realized-return").textContent = typeof summary.realizedReturnPct === "number"
      ? `${summary.realizedReturnPct >= 0 ? "+" : ""}${summary.realizedReturnPct.toFixed(2)}%`
      : historyReady && realizedCount === 0 ? "暂无已平仓" : "—";

    setPerformanceMetric("unrealized-pnl", unrealizedAvailable ? `${unrealizedPnl > 0 ? "+" : ""}${money(unrealizedPnl)}` : "—", unrealizedAvailable);
    const openPositions = Array.isArray(wallet?.bstockBalances)
      ? wallet.bstockBalances.filter((position) => Number(position.balance) > 0)
      : [];
    byId("open-position-count").textContent = wallet ? `真实持仓 ${openPositions.length}` : "等待真实持仓";
    const costBySymbol = new Map((ledger?.positions || []).map((position) => [position.symbol, position.averageCostUsd]));
    const aggregateCost = openPositions.reduce((sum, position) => {
      const averageCost = costBySymbol.get(position.symbol);
      return typeof averageCost === "number" && Number.isFinite(averageCost)
        ? sum + averageCost * Number(position.balance || 0)
        : sum;
    }, 0);
    byId("unrealized-return").textContent = unrealizedAvailable && aggregateCost > 0
      ? `${unrealizedPnl >= 0 ? "+" : ""}${(unrealizedPnl / aggregateCost * 100).toFixed(2)}%`
      : historyReady && openPositions.length === 0 ? "暂无持仓" : "成本待完整重建";

    const winRateAvailable = typeof winRate === "number" && Number.isFinite(winRate);
    setPerformanceMetric("win-rate", winRateAvailable ? `${winRate.toFixed(1)}%` : "—", winRateAvailable);
    byId("closed-trade-count").textContent = realizedCount == null ? "等待成交历史" : `已平仓 ${realizedCount} 笔`;
    byId("win-loss-count").textContent = wins == null || losses == null ? "—" : `${wins} 胜 / ${losses} 负`;

    const factorInfinite = summary.profitFactorInfinite === true;
    const factorAvailable = factorInfinite || (typeof profitFactor === "number" && Number.isFinite(profitFactor));
    setPerformanceMetric("profit-factor", factorInfinite ? "∞" : factorAvailable ? profitFactor.toFixed(2) : "—", factorAvailable);
    if (wins != null && losses != null && realizedCount) {
      const averageWin = wins > 0 && typeof grossProfit === "number" ? grossProfit / wins : 0;
      const averageLoss = losses > 0 && typeof grossLoss === "number" ? grossLoss / losses : 0;
      byId("average-payoff").textContent = losses > 0
        ? `均盈 ${money(averageWin)} / 均亏 ${money(averageLoss)}`
        : wins > 0 ? "当前无亏损订单" : "当前无盈利订单";
    } else {
      byId("average-payoff").textContent = historyReady ? "暂无已平仓" : "—";
    }
    renderRealizedSparkline(ledger?.realized);
  }

  function renderReportHistory(history) {
    const tbody = byId("report-history-body");
    if (!tbody) return;
    tbody.replaceChildren();
    const reports = Array.isArray(history) ? history : [];
    const note = byId("report-history-source-note");
    if (note) note.textContent = reports.length
      ? `已持久化 ${reports.length} 份 Agent Studio 研报；按生成时间倒序，可按 bStock 标的回看。`
      : "当前 Agentic Wallet 尚无已完成研报；新生成的研报会按标的与完成时间自动保存在此。";
    if (!reports.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.textContent = walletOperational() ? "当前钱包尚无已完成研报。" : "连接钱包后显示已持久化的研报历史。";
      row.append(cell);
      tbody.append(row);
      return;
    }
    reports.forEach((report) => {
      const row = document.createElement("tr");
      appendTextCell(row, report.completedAt ? new Date(report.completedAt).toLocaleString("zh-CN", { hour12: false }) : "—");
      appendLocalizedAssetCell(row, report.symbol);
      const source = appendTextCell(row, "");
      const status = document.createElement("span");
      status.className = "trade-status is-success";
      status.textContent = `${report.provider === "AGENT_STUDIO" ? "Agent Studio" : report.provider || "研报"} · 已完成`;
      source.append(status);
      appendTextCell(row, report.rating || "—");
      appendTextCell(row, Number.isFinite(report.score) ? `${Math.round(report.score)} / 100` : "—", Number.isFinite(report.score) ? "report-history-score" : "");
      appendTextCell(row, Number.isFinite(report.targetPrice) ? money(report.targetPrice) : "—");
      appendChainProof(row, report.paymentTxHash);
      const actionCell = document.createElement("td");
      const action = document.createElement("button");
      action.type = "button";
      action.className = "row-action report-history-action";
      action.textContent = "查看研报";
      action.addEventListener("click", () => openHistoricalStudioReport(report, action));
      actionCell.append(action);
      row.append(actionCell);
      tbody.append(row);
    });
  }

  function applyLiveSnapshot(payload) {
    const prior = liveSnapshot || {};
    const next = { ...payload };
    for (const key of ["cmc", "wallet", "tradingLedger"]) {
      if (next[key] == null) delete next[key];
    }
    if (next.market && (!Array.isArray(next.market.assets) || !next.market.assets.length) && prior.market?.assets?.length) {
      delete next.market;
    }
    liveSnapshot = {
      ...prior,
      ...next,
      sources: { ...(prior.sources || {}), ...(payload.sources || {}) }
    };

    const cmc = liveSnapshot.cmc;
    if (cmc) {
      byId("live-market-regime-label").textContent = cmc.regimeLabel;
      byId("live-btc-price").textContent = money(cmc.btcPrice);
      byId("live-market-change").textContent = `${cmc.marketCapChange24h >= 0 ? "+" : ""}${cmc.marketCapChange24h.toFixed(2)}%`;
      byId("live-market-change").className = cmc.marketCapChange24h >= 0 ? "up" : "down";
      byId("live-cmc-sentiment").textContent = cmc.score;
      byId("live-cmc-regime").textContent = cmc.regime.replace("_", "-");
      byId("live-btc-dominance").textContent = `${cmc.btcDominance.toFixed(2)}%`;
      byId("live-btc-dominance-change").textContent = `${cmc.btcDominanceChange24h >= 0 ? "+" : ""}${cmc.btcDominanceChange24h.toFixed(2)}%`;
      byId("live-market-cap").textContent = compactUsd(cmc.totalMarketCapUsd);
      byId("live-market-volume").textContent = compactUsd(cmc.totalVolume24hUsd);
      byId("live-volume-change").textContent = `${cmc.volumeChange24h >= 0 ? "+" : ""}${cmc.volumeChange24h.toFixed(1)}%`;
      byId("live-snapshot-time").textContent = new Date(cmc.fetchedAt).toLocaleString("zh-CN", { hour12: false });
      byId("cmc-live-state").textContent = "CMC LIVE";
      byId("cmc-source-label").textContent = "CoinMarketCap 官方实时数据";
      byId("crypto-regime-label").textContent = cmc.regimeLabel;
      byId("crypto-score").textContent = cmc.score;
      byId("cmc-sentiment-score").textContent = cmc.score;
      byId("cmc-bar-sentiment").style.width = `${cmc.score}%`;
      const marketScore = Math.max(0, Math.min(100, Math.round(50 + cmc.marketCapChange24h * 10)));
      byId("cmc-market-score").textContent = marketScore;
      byId("cmc-bar-market").style.width = `${marketScore}%`;
      byId("cmc-risk-score").textContent = cmc.macroRisk;
      byId("cmc-bar-risk").style.width = `${cmc.macroRisk}%`;
      byId("cmc-live-thesis").textContent = `CMC 恐惧贪婪 ${cmc.score}（${cmc.classification}）；总市值 24h ${cmc.marketCapChange24h >= 0 ? "+" : ""}${cmc.marketCapChange24h.toFixed(2)}%，BTC 占比 ${cmc.btcDominance.toFixed(2)}%。`;
      byId("research-age").innerHTML = `<i></i>${new Date(cmc.fetchedAt).toLocaleTimeString("zh-CN", { hour12: false })} 更新`;
    } else if (payload.sources?.cmc?.status === "UNAVAILABLE") {
      byId("cmc-live-state").textContent = "UNAVAILABLE";
      byId("cmc-source-label").textContent = "CMC 实时源暂不可用";
      byId("cmc-live-thesis").textContent = "实时源不可用，已保持留空；不会回退到演示情绪分。";
    }

    if (Array.isArray(payload.market?.assets) && payload.market.assets.length) {
      const marketCached = payload.market.deliveryMode && payload.market.deliveryMode !== "LIVE";
      byId("public-data-state").innerHTML = `<i class="state-dot is-online"></i>${marketCached ? "DATA CACHE" : "DATA LIVE"}`;
      payload.market.assets.forEach((live) => {
        const asset = assets[live.symbol] || {};
        Object.assign(asset, {
          symbol: live.symbol,
          ticker: live.ticker,
          name: live.name || live.ticker,
          nameZh: live.nameZh || asset.nameZh || null,
          brandIconUrl: live.brandIconUrl || asset.brandIconUrl || brandIconUrl(live.symbol),
          avatar: (live.ticker || live.symbol).slice(0, 1),
          avatarClass: asset.avatarClass || avatarClassFor(live.symbol),
          kind: String(live.assetType).toLowerCase(),
          leveragedOrInverse: Boolean(live.leveragedOrInverse),
          price: live.price,
          change: live.priceChangePercent,
          changeUsd: live.priceChange,
          volume: live.quoteVolume,
          liquidity: null,
          portfolio: null,
          contractAddress: live.contractAddress,
          campaignEligibility: live.campaignEligibility
        });
        assets[live.symbol] = asset;
        tickerByBstock[live.symbol] = live.ticker;
        bstockByTicker[live.ticker] = live.symbol;
      });
      eligibilityMeta = payload.market;
      selected = assets[selected?.symbol] || assets.NVDAB || Object.values(assets)[0] || selected;
    } else if (Object.prototype.hasOwnProperty.call(payload, "market")) {
      byId("eligibility-week").textContent = "实时源暂不可用 · 保留最近成功快照";
    }

    (payload.studioReports || []).forEach((report) => {
      const bstockSymbol = bstockByTicker[report.symbol];
      if (!bstockSymbol) return;
      const existing = studioReports[bstockSymbol];
      const sameReport = Boolean(existing && (
        (report.reportId && existing.reportId === report.reportId)
        || (!report.reportId && report.completedAt && existing.completedAt === report.completedAt)
      ));
      studioReports[bstockSymbol] = {
        ...(sameReport ? existing : {}),
        ...report,
        score: Number.isFinite(report.score) ? report.score : null
      };
    });
    renderReportHistory(liveSnapshot.studioReportHistory || []);
    const recoverableJob = (payload.pendingStudioJobs || []).find((job) => job.jobId && (job.status !== "failed" || job.retryable));
    if (recoverableJob && recoverableJob.jobId !== activeStudioJobId) {
      bstockStorage.persistStudioJob({
        jobId: recoverableJob.jobId,
        symbol: recoverableJob.symbol,
        walletMode: walletConnectionMode,
        walletAddress,
        createdAt: new Date(recoverableJob.createdAt).getTime()
      });
      pollStudioJob(recoverableJob.jobId, 0, Boolean(recoverableJob.retryable));
    }

    if (payload.wallet) {
      const wallet = payload.wallet;
      renderWalletPositions(wallet, liveSnapshot.tradingLedger);
      renderOrderRecords(liveSnapshot.tradingLedger);
      renderRealizedLedger(liveSnapshot.tradingLedger);
      renderPerformanceMetrics(liveSnapshot.tradingLedger, wallet);
      if (wallet) {
        walletAddress = wallet.address || "";
        byId("connect-wallet").classList.add("is-connected");
        byId("wallet-button-label").textContent = walletConnectionMode === "browser"
          ? shortAddress(walletAddress)
          : walletAddress ? `Agent ${shortAddress(walletAddress)}` : "Agent 实盘已连接";
        byId("execution-state").innerHTML = '<i class="state-dot is-online"></i>LIVE BALANCE';
        addLiveAudit(walletConnectionMode === "browser" ? "浏览器钱包余额已同步" : "Agentic Wallet 余额已同步", walletAddress ? shortAddress(walletAddress) : "BSC 钱包", "WALLET");
      } else {
        byId("execution-state").innerHTML = '<i class="state-dot is-waiting"></i>BALANCE UNAVAILABLE';
        byId("wallet-risk").querySelector("strong").textContent = `余额不可用${payload.sources?.wallet?.code ? ` · ${payload.sources.wallet.code}` : ""}`;
      }
    }
    renderUniverse();
    if (selected) setAsset(selected);
    updateRiskState();
    updateQualification();
    resumePendingOrderFromLedger();
  }

  async function refreshMarketSnapshot({ silent = true } = {}) {
    marketSnapshotRequest?.abort();
    marketSnapshotRequest = new AbortController();
    try {
      const response = await fetch("/api/bstock-alpha/market-snapshot", { method: "POST", headers: { "Accept": "application/json" }, signal: marketSnapshotRequest.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && !payload.live) throw new Error(payload.error || "公开实时数据不可用");
      applyLiveSnapshot(payload);
      writePublicDataCache(payload);
      addLiveAudit("公开实时数据已同步", "CoinMarketCap + Binance bStock", "DATA");
      if (!silent) showToast("CMC 与 Binance bStock 真实行情已刷新。 ");
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && !silent) showToast(error instanceof Error ? error.message : "公开实时数据不可用", "error");
      return false;
    } finally { marketSnapshotRequest = undefined; }
  }

  async function refreshMarketHistory(symbol, interval) {
    marketHistoryRequest?.abort();
    marketHistoryRequest = new AbortController();
    try {
      const response = await fetch("/api/bstock-alpha/market-history", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ symbol, interval }), signal: marketHistoryRequest.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.points?.length) throw new Error(payload.error || "历史行情不可用");
      if (selected.symbol !== symbol || chartInterval !== interval) return;
      const closes = payload.points.map((point) => Number(point.close)).filter(Number.isFinite);
      const min = Math.min(...closes); const max = Math.max(...closes); const span = max - min || 1;
      const path = closes.map((value, index) => `${index ? "L" : "M"}${(index / Math.max(1, closes.length - 1) * 760).toFixed(1)} ${(190 - (value - min) / span * 160).toFixed(1)}`).join(" ");
      byId("chart-line").setAttribute("d", path);
      byId("chart-area").setAttribute("d", `${path} L760 210 L0 210Z`);
      byId("chart-line").dataset.deliveryMode = payload.deliveryMode || "LIVE";
      const axes = selectors(".chart-axis span");
      axes.forEach((axis, index) => {
        const point = payload.points[Math.round(index / Math.max(1, axes.length - 1) * (payload.points.length - 1))];
        axis.textContent = new Date(point.closeTime).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) byId("chart-price-label").textContent = Number.isFinite(selected.price) ? selected.price.toFixed(2) : "—";
    } finally { marketHistoryRequest = undefined; }
  }

  async function refreshLiveSnapshot({ silent = false } = {}) {
    if (!walletOperational()) return false;
    liveSnapshotRequest?.abort();
    const requestController = new AbortController();
    liveSnapshotRequest = requestController;
    const contextVersion = walletContextVersion;
    byId("wallet-risk").querySelector("strong").textContent = "同步真实余额";
    try {
      const browserMode = browserWalletReady();
      const response = await fetch(browserMode ? "/api/bstock-alpha/browser-wallet/snapshot" : "/api/bstock-alpha/live-snapshot", {
        method: "POST",
        headers: browserMode ? { "Content-Type": "application/json", "Accept": "application/json" } : { "Accept": "application/json" },
        ...(browserMode ? { body: JSON.stringify({ address: walletAddress }) } : {}),
        signal: requestController.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion || requestController.signal.aborted) return false;
      if (!response.ok) throw new Error(payload.error || "钱包数据同步失败");
      applyLiveSnapshot(payload);
      writePublicDataCache(payload);
      if (!liveSnapshot?.wallet) throw new Error(`钱包余额暂不可用${payload.sources?.wallet?.code ? `（${payload.sources.wallet.code}）` : ""}`);
      if (!silent) showToast(`${browserMode ? "浏览器钱包" : "Agentic Wallet"}真实余额已同步。 `);
      return true;
    } catch (error) {
      if (contextVersion !== walletContextVersion) return false;
      if (error instanceof DOMException && error.name === "AbortError") return false;
      byId("wallet-risk").className = "pending";
      byId("wallet-risk").querySelector("strong").textContent = "真实余额同步失败";
      if (!silent) showToast(error instanceof Error ? error.message : "钱包数据同步失败", "error");
      return false;
    } finally { if (liveSnapshotRequest === requestController) liveSnapshotRequest = undefined; }
  }

  function selectWalletMethod(method) {
    selectors("[data-wallet-method]").forEach((button) => {
      const active = button.dataset.walletMethod === method;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    selectors("[data-wallet-panel]").forEach((panel) => {
      const active = panel.dataset.walletPanel === method;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  function openWalletDialog() {
    const agentFlowActive = !["IDLE", "EXPIRED"].includes(agentLoginPhase);
    selectWalletMethod(agentSessionReady || agentFlowActive ? "agent" : "injected");
    byId("wallet-dialog").showModal();
  }

  function approvedAgentLoginUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["app.binance.com", "web3.binance.com"].includes(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  function updateAgentConfirmState() {
    const checks = selectors(".agent-safety-check");
    const qrReady = !byId("agent-qr-output").hidden && agentLoginExpiresAt > Date.now();
    const terminal = agentLoginPhase === "CONNECTED" || agentLoginPhase === "EXPIRED";
    byId("confirm-agent-login").disabled = terminal || !qrReady || checks.some((check) => !check.checked);
  }

  function setAgentLoginStatus(state, message, countdown) {
    const status = byId("agent-login-status");
    status.dataset.state = state;
    status.querySelector("span").textContent = message;
    byId("agent-login-countdown").textContent = countdown;
  }

  function clearAgentLoginTimer() {
    clearInterval(agentLoginTimer);
    agentLoginTimer = undefined;
  }

  function clearAgentLoginPolling() {
    clearTimeout(agentLoginPollTimer);
    agentLoginPollTimer = undefined;
    agentLoginVerifyRequest?.abort();
    agentLoginVerifyRequest = undefined;
    agentLoginVerifying = false;
  }

  function scheduleAgentLoginPoll(delay = 2000) {
    clearTimeout(agentLoginPollTimer);
    if (["CONNECTED", "EXPIRED", "IDLE"].includes(agentLoginPhase)) return;
    agentLoginPollTimer = setTimeout(() => verifyAgentLogin(), delay);
  }

  function resetAgentLoginDisplay() {
    clearAgentLoginTimer();
    clearAgentLoginPolling();
    agentLoginPhase = "IDLE";
    agentLoginExpiresAt = 0;
    byId("agent-login-url").value = "";
    byId("agent-pairing-code").value = "";
    byId("agent-pairing-display").textContent = "—";
    byId("agent-qr-output").hidden = true;
    byId("agent-qr-output").classList.remove("expired");
    selectors(".agent-safety-check").forEach((check) => { check.checked = false; });
    if (agentQrObjectUrl) URL.revokeObjectURL(agentQrObjectUrl);
    agentQrObjectUrl = "";
    byId("agent-qr-image").removeAttribute("src");
    byId("open-agent-login").removeAttribute("href");
    byId("confirm-agent-login").textContent = "立即检查 Agent 验证状态";
    updateAgentConfirmState();
  }

  function renderDisconnectedAgentSession() {
    resetWalletContext();
    agentSessionReady = false;
    walletConnectionMode = "";
    browserWalletVerified = false;
    walletAddress = "";
    window.dispatchEvent(new Event("bstock:wallet-context"));
    if (liveSnapshot) liveSnapshot = { ...liveSnapshot, wallet: null };
    resetTradeQuote();
    liveSnapshotRequest?.abort();
    const button = byId("connect-wallet");
    button.classList.remove("is-connected");
    byId("wallet-button-label").textContent = "连接 Agentic Wallet";
    button.setAttribute("aria-label", "连接 Agentic Wallet");
    byId("execution-state").innerHTML = '<i class="state-dot is-waiting"></i>WALLET OFFLINE';
    const walletRisk = byId("wallet-risk");
    walletRisk.className = "pending";
    walletRisk.querySelector("strong").textContent = "待连接";
    renderWalletPositions(null, null);
    renderOrderRecords(null);
    renderRealizedLedger(null);
    updateQualification();
    byId("available-balance").textContent = "连接后读取真实余额";
    updateRiskState();
  }

  function startAgentLoginCountdown(expireAt) {
    agentLoginExpiresAt = expireAt;
    agentLoginPhase = "WAITING_SCAN";
    clearAgentLoginTimer();
    const tick = () => {
      const remaining = Math.max(0, agentLoginExpiresAt - Date.now());
      if (!remaining) {
        clearAgentLoginTimer();
        clearAgentLoginPolling();
        agentLoginPhase = "EXPIRED";
        byId("agent-qr-output").classList.add("expired");
        byId("agent-login-expiry").textContent = "该登录链接已过期，请重新生成";
        byId("request-agent-login").textContent = "重新生成登录链接";
        setAgentLoginStatus("expired", "一次性登录链接已过期，旧链接不会被复用。", "已过期");
        updateAgentConfirmState();
        return;
      }
      const totalSeconds = Math.ceil(remaining / 1000);
      const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      const countdown = `${minutes}:${seconds}`;
      byId("agent-login-expiry").textContent = `登录链接将在 ${countdown} 后失效`;
      byId("agent-login-countdown").textContent = countdown;
    };
    setAgentLoginStatus("ready", "等待 Binance App 扫码；后台会自动完成 Agent 验证。", "等待扫码");
    tick();
    agentLoginTimer = setInterval(tick, 1000);
  }

  async function requestAgentLogin() {
    if (walletActionInFlight) return showToast("正在处理已确认的钱包请求，请完成后再切换登录方式。", "error");
    const loginVersion = ++walletLoginVersion;
    agentLoginRequest?.abort();
    agentLoginRequest = new AbortController();
    resetAgentLoginDisplay();

    const button = byId("request-agent-login");
    button.disabled = true;
    button.textContent = "正在请求 Binance…";
    setAgentLoginStatus("loading", "后台正在创建新的临时登录会话…", "生成中");
    try {
      const loginResponse = await fetch("/api/bstock-alpha/agent-login", {
        method: "POST",
        headers: { "Accept": "application/json" },
        signal: agentLoginRequest.signal
      });
      const loginPayload = await loginResponse.json().catch(() => ({}));
      if (loginVersion !== walletLoginVersion) return;
      if (!loginResponse.ok) {
        throw new Error(loginPayload.error || "登录链接生成失败，请稍后重试。");
      }

      const loginUrl = String(loginPayload.urlForWeb || "");
      const pairingCode = String(loginPayload.pairingCode || "");
      const expireAt = Number(loginPayload.expireAt);
      if (!approvedAgentLoginUrl(loginUrl) || !/^[a-z0-9]{6,12}$/i.test(pairingCode) || !Number.isFinite(expireAt) || expireAt <= Date.now()) {
        throw new Error("后台返回的登录会话无效，请重新生成。");
      }
      renderDisconnectedAgentSession();

      const qrResponse = await fetch("/api/bstock-alpha/agent-login-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: loginUrl }),
        signal: agentLoginRequest.signal
      });
      if (!qrResponse.ok) throw new Error("二维码生成失败，请重新生成登录链接。");
      const blob = await qrResponse.blob();
      if (loginVersion !== walletLoginVersion) return;
      if (agentQrObjectUrl) URL.revokeObjectURL(agentQrObjectUrl);
      agentQrObjectUrl = URL.createObjectURL(blob);
      byId("agent-login-url").value = loginUrl;
      byId("agent-pairing-code").value = pairingCode;
      byId("agent-qr-image").src = agentQrObjectUrl;
      byId("agent-pairing-display").textContent = pairingCode;
      byId("open-agent-login").href = loginUrl;
      byId("agent-qr-output").hidden = false;
      selectors(".agent-safety-check").forEach((check) => { check.checked = false; });
      startAgentLoginCountdown(expireAt);
      scheduleAgentLoginPoll(0);
      updateAgentConfirmState();
      button.textContent = "重新生成登录链接";
      showToast("一次性登录链接已自动生成，请核对配对码后扫码。 ");
    } catch (error) {
      if (loginVersion !== walletLoginVersion) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "登录链接生成失败";
      setAgentLoginStatus("error", message, "生成失败");
      button.textContent = "重试生成登录链接";
      showToast(message, "error");
    } finally {
      if (loginVersion === walletLoginVersion) button.disabled = false;
    }
  }

  function renderConnectedAgentSession() {
    resetWalletContext();
    clearAgentLoginPolling();
    clearAgentLoginTimer();
    agentLoginPhase = "CONNECTED";
    agentSessionReady = true;
    walletConnectionMode = "agent";
    browserWalletVerified = false;
    walletAddress = "";
    window.dispatchEvent(new Event("bstock:wallet-context"));
    const button = byId("connect-wallet");
    button.classList.add("is-connected");
    byId("wallet-button-label").textContent = "Agent 扫码已确认";
    button.setAttribute("aria-label", "Agent 扫码已确认，打开连接选项");
    byId("execution-state").innerHTML = '<i class="state-dot is-online"></i>AGENT SESSION';
    const walletRisk = byId("wallet-risk");
    walletRisk.className = "pass";
    walletRisk.querySelector("strong").textContent = "AGENT READY";
    updateQualification();
    setAgentLoginStatus("connected", "Agent 端验证完成，Agentic Wallet 已连接。", "已连接");
    byId("confirm-agent-login").textContent = "Agentic Wallet 已连接";
    byId("confirm-agent-login").disabled = true;
    byId("request-agent-login").textContent = "重新登录";
    updateRiskState();
    showToast("Binance 已确认 Agent 会话，Agentic Wallet 连接成功。 ");
    refreshLiveSnapshot({ silent: true });
    restorePendingOrder();
    restoreStudioJob();
  }

  function expireAgentLogin(message) {
    clearAgentLoginPolling();
    clearAgentLoginTimer();
    agentLoginPhase = "EXPIRED";
    agentLoginExpiresAt = 0;
    byId("agent-qr-output").classList.add("expired");
    byId("agent-login-expiry").textContent = "该登录会话已失效，请重新生成";
    byId("request-agent-login").textContent = "重新生成登录链接";
    setAgentLoginStatus("expired", message, "已失效");
    updateAgentConfirmState();
  }

  async function verifyAgentLogin({ manual = false } = {}) {
    if (agentLoginVerifying || ["CONNECTED", "EXPIRED", "IDLE"].includes(agentLoginPhase)) return;
    if (agentLoginExpiresAt <= Date.now()) {
      expireAgentLogin("一次性登录链接已过期，请重新生成。");
      return;
    }

    agentLoginVerifying = true;
    const loginVersion = walletLoginVersion;
    const request = new AbortController();
    agentLoginVerifyRequest = request;
    if (manual) setAgentLoginStatus("verifying", "正在立即检查 Agent 端验证结果…", "验证中");
    try {
      const response = await fetch("/api/bstock-alpha/agent-login/verify", {
        method: "POST",
        headers: { "Accept": "application/json" },
        signal: request.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (loginVersion !== walletLoginVersion) return;
      if (!response.ok) {
        if (["EXPIRED", "NO_SESSION"].includes(payload.status) || [401, 410].includes(response.status)) {
          expireAgentLogin(payload.error || "Agent 登录会话已失效，请重新生成。");
          showToast(payload.error || "Agent 登录会话已失效。", "error");
          return;
        }
        setAgentLoginStatus("verifying", payload.error || "Agent 验证暂时失败，正在自动重试。", "自动重试");
        return;
      }

      if (payload.status === "CONNECTED") {
        renderConnectedAgentSession();
        return;
      }
      if (payload.status === "WAITING_CONFIRMATION") {
        agentLoginPhase = "WAITING_CONFIRMATION";
        setAgentLoginStatus("verifying", "等待在 Binance App 扫码并确认；Agent 将自动完成验证。", "等待 App");
      } else if (payload.status === "CREATING_WALLET") {
        agentLoginPhase = "CREATING_WALLET";
        const serverExpireAt = Number(payload.expireAt);
        if (Number.isFinite(serverExpireAt) && serverExpireAt > agentLoginExpiresAt) agentLoginExpiresAt = serverExpireAt;
        setAgentLoginStatus("verifying", "App 已确认，Agent 正在完成验证与钱包会话创建…", "Agent 验证中");
      } else {
        agentLoginPhase = "WAITING_SCAN";
        setAgentLoginStatus("ready", "等待 Binance App 扫码；后台会自动完成 Agent 验证。", "等待扫码");
      }
    } catch (error) {
      if (loginVersion !== walletLoginVersion) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAgentLoginStatus("verifying", "网络暂时不可用，Agent 将自动重试验证。", "自动重试");
    } finally {
      if (agentLoginVerifyRequest === request) {
        agentLoginVerifying = false;
        agentLoginVerifyRequest = undefined;
      }
      if (loginVersion === walletLoginVersion) scheduleAgentLoginPoll();
    }
  }

  async function restoreAgentSession() {
    const loginVersion = walletLoginVersion;
    try {
      const response = await fetch("/api/bstock-alpha/agent-login/verify", {
        method: "POST",
        headers: { "Accept": "application/json" }
      });
      const payload = await response.json().catch(() => ({}));
      if (loginVersion !== walletLoginVersion || walletConnectionMode === "browser") return;
      if (response.ok && payload.status === "CONNECTED") {
        renderConnectedAgentSession();
      } else if (response.ok && payload.status === "CREATING_WALLET") {
        agentLoginPhase = "CREATING_WALLET";
        agentLoginExpiresAt = Number(payload.expireAt) || Date.now() + 10 * 60_000;
        setAgentLoginStatus("verifying", "Agent 正在恢复并完成钱包会话…", "Agent 验证中");
        scheduleAgentLoginPoll();
      } else if (response.ok && ["WAITING_SCAN", "WAITING_CONFIRMATION"].includes(payload.status)) {
        agentLoginPhase = payload.status;
        agentLoginExpiresAt = Number(payload.expireAt) || Date.now() + 5 * 60_000;
        setAgentLoginStatus("verifying", "检测到未完成的扫码会话，Agent 正在继续等待 App 授权。", "等待 App");
        scheduleAgentLoginPoll();
      }
    } catch {
      // A missing or temporarily unavailable session should not block the dashboard.
    }
  }

  async function switchToBsc(ethereum) {
    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x38" }] });
    } catch (error) {
      if (error && error.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x38", chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
            rpcUrls: ["https://bsc-dataseed.binance.org/"], blockExplorerUrls: ["https://bscscan.com"]
          }]
        });
      } else {
        throw error;
      }
    }
  }

  async function ensureBrowserWalletContext(requireTradingChain = false) {
    if (!browserWalletReady()) throw new Error("浏览器钱包尚未完成本站所有权签名验证。");
    const ethereum = provider();
    if (!ethereum?.request) throw new Error("浏览器钱包扩展不可用。");
    if (requireTradingChain) {
      await switchToBsc(ethereum);
      const chainId = String(await ethereum.request({ method: "eth_chainId" })).toLowerCase();
      if (chainId !== "0x38") throw new Error("bStock 交易需要 BNB Chain（chainId 56），钱包未完成切换。");
    }
    const accounts = await ethereum.request({ method: "eth_accounts" });
    const matches = Array.isArray(accounts) && accounts.some((account) => String(account).toLowerCase() === walletAddress.toLowerCase());
    if (!matches) throw new Error("当前浏览器钱包账户与已验证地址不一致。");
    return ethereum;
  }

  function waitForWalletBridge(message, timeoutMs = 150_000) {
    return new Promise((resolve, reject) => {
      const onMessage = (event) => {
        if (event.origin !== window.location.origin
          || event.data?.type !== "welinkbtc:bstock:x402-result"
          || event.data?.id !== message.id) return;
        window.removeEventListener("message", onMessage);
        clearTimeout(timer);
        if (event.data.ok) resolve(event.data);
        else reject(new Error(event.data.error || "浏览器钱包 x402 签名失败。"));
      };
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("浏览器钱包签名等待超时；未向研究服务重放请求。"));
      }, timeoutMs);
      window.addEventListener("message", onMessage);
      window.parent.postMessage(message, window.location.origin);
    });
  }

  async function signBrowserX402(paymentRequired, selectedIndex, contextVersion = walletContextVersion) {
    await ensureBrowserWalletContext();
    assertWalletContext(contextVersion);
    const requirement = paymentRequired?.accepts?.[selectedIndex - 1];
    if (!requirement || !/^eip155:\d+$/.test(String(requirement.network).toLowerCase())) {
      throw new Error("所选付款方式不是有效的 EVM x402 网络，已阻止签名。 ");
    }
    const id = crypto.randomUUID();
    return waitForWalletBridge({
      type: "welinkbtc:bstock:x402-sign",
      id,
      address: walletAddress,
      paymentRequired: { ...paymentRequired, accepts: [requirement] }
    });
  }

  function hexWord(value) {
    return BigInt(value).toString(16).padStart(64, "0");
  }

  function addressWord(value) {
    return String(value).toLowerCase().replace(/^0x/, "").padStart(64, "0");
  }

  async function waitForBrowserReceipt(ethereum, txHash, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const receipt = await ethereum.request({ method: "eth_getTransactionReceipt", params: [txHash] });
      if (receipt?.status === "0x1") return receipt;
      if (receipt?.status === "0x0") throw new Error(`BNB Chain 交易失败：${txHash}`);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    throw new Error(`交易已广播但尚未确认：${txHash}。请勿重复提交。`);
  }

  async function submitBrowserWalletTransaction(quote, contextVersion) {
    assertWalletContext(contextVersion);
    const ethereum = await ensureBrowserWalletContext(true);
    assertWalletContext(contextVersion);
    let approvalTxHash = null;
    if (quote.approval) {
      const allowanceData = `0xdd62ed3e${addressWord(walletAddress)}${addressWord(quote.approval.spender)}`;
      const allowanceHex = await ethereum.request({
        method: "eth_call",
        params: [{ to: quote.approval.token, data: allowanceData }, "latest"]
      }).catch(() => "0x0");
      assertWalletContext(contextVersion);
      if (BigInt(allowanceHex || "0x0") < BigInt(quote.approval.amount)) {
        const approveData = `0x095ea7b3${addressWord(quote.approval.spender)}${hexWord(quote.approval.amount)}`;
        approvalTxHash = await ethereum.request({
          method: "eth_sendTransaction",
          params: [{ from: walletAddress, to: quote.approval.token, data: approveData, value: "0x0" }]
        });
        await waitForBrowserReceipt(ethereum, approvalTxHash);
      }
    }
    await ensureBrowserWalletContext(true);
    assertWalletContext(contextVersion);
    const txHash = await ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: walletAddress,
        to: quote.transaction.to,
        data: quote.transaction.data,
        value: `0x${BigInt(quote.transaction.value || "0").toString(16)}`,
        ...(quote.transaction.gas ? { gas: `0x${BigInt(quote.transaction.gas).toString(16)}` } : {})
      }]
    });
    return { txHash, approvalTxHash };
  }

  async function bindWallet(address, ethereum) {
    try {
      const challengeResponse = await fetch("/api/wallets/challenge", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chain: "EVM", address })
      });
      const challenge = await challengeResponse.json();
      if (!challengeResponse.ok || !challenge.message) return false;
      const signature = await ethereum.request({ method: "personal_sign", params: [challenge.message, address] });
      const verifyResponse = await fetch("/api/wallets/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId: challenge.id, signature })
      });
      return verifyResponse.ok;
    } catch (error) {
      console.warn("Wallet ownership binding skipped", error);
      return false;
    }
  }

  function renderWallet(address, verified) {
    clearAgentLoginPolling();
    clearAgentLoginTimer();
    resetWalletContext();
    walletAddress = address;
    agentSessionReady = false;
    walletConnectionMode = "browser";
    browserWalletVerified = Boolean(verified);
    window.dispatchEvent(new Event("bstock:wallet-context"));
    const button = byId("connect-wallet");
    button.classList.add("is-connected");
    byId("wallet-button-label").textContent = shortAddress(address);
    button.setAttribute("aria-label", `已连接 ${shortAddress(address)}，打开连接选项`);
    byId("execution-state").innerHTML = '<i class="state-dot is-online"></i>WALLET READY';
    const walletRisk = byId("wallet-risk");
    walletRisk.className = verified ? "pass" : "pending";
    walletRisk.querySelector("strong").textContent = verified ? "EVM VERIFIED" : "待登录绑定";
    updateQualification();
    updateRiskState();
    showToast(verified ? "浏览器钱包已完成所有权签名验证；x402 将按付款选项切换网络，bStock 交易提交时自动切换 BNB Chain。" : "钱包已连接，但未完成本站账户绑定；付费研究和实盘交易保持禁用。", verified ? "success" : "error");
    if (verified) {
      refreshLiveSnapshot({ silent: true });
      restorePendingOrder();
      restoreStudioJob();
    }
  }

  async function connectInjectedWallet() {
    if (walletActionInFlight) return showToast("正在处理已确认的钱包请求，请完成后再切换登录方式。", "error");
    const loginVersion = ++walletLoginVersion;
    clearAgentLoginPolling();
    clearAgentLoginTimer();
    agentLoginRequest?.abort();
    const ethereum = provider();
    if (!ethereum?.request) {
      showToast("未检测到 EVM 钱包。请先安装并启用 Binance Wallet / Agentic Wallet。", "error");
      return;
    }
    const button = byId("connect-injected-wallet");
    button.disabled = true;
    button.textContent = "等待钱包确认…";
    try {
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      if (loginVersion !== walletLoginVersion) return;
      const address = Array.isArray(accounts) ? accounts[0] : "";
      if (!address) throw new Error("钱包没有返回地址");
      const verified = await bindWallet(address, ethereum);
      if (loginVersion !== walletLoginVersion) return;
      renderWallet(address, verified);
      byId("wallet-dialog").close();
    } catch (error) {
      if (loginVersion !== walletLoginVersion) return;
      showToast(error instanceof Error ? error.message : "钱包连接失败", "error");
    } finally {
      button.disabled = false;
      button.textContent = "连接浏览器钱包";
    }
  }

  async function openReviewDialog() {
    if (walletActionInFlight) return;
    const contextVersion = walletContextVersion;
    if (!walletOperational()) {
      showToast("请先连接并验证 Agent 或浏览器钱包。", "error");
      openWalletDialog();
      return;
    }
    const amount = Math.max(0, Number(byId("order-amount").value) || 0);
    const slippage = Math.max(0, Number(byId("slippage").value) || 0);
    const payPrice = paymentBalance()?.price || (byId("pay-token").value === "BNB" ? 0 : 1);
    const output = tradeSide === "buy" ? amount * payPrice / selected.price : amount * selected.price / payPrice;
    const portfolioValue = liveSnapshot?.wallet?.totalWalletValueUsd || 0;
    const notional = tradeSide === "buy" ? amount * payPrice : amount * selected.price;
    const currentPositionValue = bstockBalance()?.valueUsd || 0;
    const positionPct = portfolioValue > 0 ? (tradeSide === "buy" ? currentPositionValue + notional : Math.max(0, currentPositionValue - notional)) / portfolioValue * 100 : null;
    const score = currentDecisionScore();
    const dialog = byId("trade-dialog");
    byId("dialog-title").textContent = `审阅 ${selected.symbol} ${tradeSide === "buy" ? "买入" : "卖出"}意图`;
    byId("dialog-decision").textContent = tradeSide === "sell"
      ? `EXIT · 主动减仓${Number.isFinite(score) ? ` · 当前评分 ${score.toFixed(1)}` : ""}`
      : Number.isFinite(score) ? `${decisionMeta(score).action} · ${score.toFixed(1)}` : "WAIT · 真实信号不完整";
    byId("dialog-mode").textContent = executionMode.toUpperCase();
    byId("dialog-pay").textContent = tradeSide === "buy" ? `${amount.toFixed(2)} ${byId("pay-token").value}` : `${byId("order-amount").value} ${selected.symbol}`;
    byId("dialog-output").textContent = `≈ ${Number(output).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${tradeSide === "buy" ? selected.symbol : byId("pay-token").value}`;
    byId("dialog-slippage").textContent = `${slippage.toFixed(2)}%`;
    byId("dialog-position").textContent = Number.isFinite(positionPct) ? `${positionPct.toFixed(1)}% / < ${MAX_POSITION_PCT.toFixed(1)}%` : `— / < ${MAX_POSITION_PCT.toFixed(1)}%`;
    byId("dialog-costs").textContent = "正在获取真实报价…";
    byId("dialog-contract").textContent = "正在核验 BNB Chain 合约…";
    byId("eligibility-approval-row").hidden = true;
    byId("eligibility-approval-check").checked = false;
    const progress = byId("trade-execution-progress");
    progress.hidden = true;
    progress.className = "execution-progress";
    byId("dialog-warning-title").textContent = browserWalletReady() ? "等待浏览器钱包逐笔确认" : "等待 Agentic Wallet 授权";
    byId("dialog-warning-copy").textContent = browserWalletReady()
      ? "先读取 BNB Chain 真实余额与 PancakeSwap 报价；确认后由浏览器钱包广播并核验链上回执。"
      : "先读取真实余额与官方报价；确认后提交到 Agentic Wallet，并持续轮询至 FINISHED / FAILED。";
    byId("confirm-intent").textContent = "正在获取真实报价…";
    byId("approval-check").checked = false;
    byId("confirm-intent").disabled = true;
    dialog.showModal();

    resetTradeQuote();
    const synced = liveSnapshot?.wallet || await refreshLiveSnapshot({ silent: true });
    if (contextVersion !== walletContextVersion) return;
    if (!synced && !liveSnapshot?.wallet) {
      byId("dialog-warning-title").textContent = "实时余额不可用";
      byId("dialog-warning-copy").textContent = "未能读取真实余额，实盘报价与提交均已禁用。";
      byId("confirm-intent").textContent = "无法提交";
      return;
    }
    try {
      const browserMode = browserWalletReady();
      const response = await fetch(browserMode ? "/api/bstock-alpha/browser-wallet/trading/quote" : "/api/bstock-alpha/trading/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          mode: executionMode,
          side: tradeSide,
          symbol: selected.symbol,
          payToken: byId("pay-token").value,
          amount: byId("order-amount").value,
          slippagePct: slippage,
          ...(browserMode ? { address: walletAddress } : {})
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion) return;
      if (!response.ok) throw new Error(payload.error || "钱包实时报价失败");
      tradeQuoteIntent = payload.intent;
      tradeQuote = { ...payload, walletMode: browserMode ? "browser" : "agent", walletAddress, contextVersion };
      if (tradeSide === "sell") {
        const liveScore = Number(payload.decision?.finalScore);
        byId("dialog-decision").textContent = `EXIT · 主动减仓${Number.isFinite(liveScore) ? ` · 当前评分 ${liveScore.toFixed(1)}` : ""}`;
      } else if (payload.decision) {
        byId("dialog-decision").textContent = `${decisionMeta(payload.decision.finalScore).action} · ${Number(payload.decision.finalScore).toFixed(1)}`;
      }
      byId("dialog-pay").textContent = `${payload.fromAmount} ${payload.fromSymbol}`;
      byId("dialog-output").textContent = `≈ ${Number(payload.toAmount).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${payload.toSymbol}`;
      byId("dialog-costs").textContent = `Fee ${money(payload.feeUsd)} · Gas ${money(payload.gasUsd)}`;
      byId("dialog-contract").textContent = `${payload.toToken.slice(0, 8)}…${payload.toToken.slice(-6)}`;
      const quotedPositionPct = Number(payload.postTradeExposurePct);
      const quotedPositionLimitPct = Number(payload.positionLimitPct) || MAX_POSITION_PCT;
      byId("dialog-position").textContent = `${Number.isFinite(quotedPositionPct) ? quotedPositionPct.toFixed(2) : "—"}% / < ${quotedPositionLimitPct.toFixed(1)}%`;
      byId("dialog-warning-title").textContent = payload.campaignEligibility === "CONFIRMED" ? "真实报价已锁定 60 秒" : "活动周资格暂未核验";
      byId("dialog-warning-copy").textContent = payload.warning || "确认后会提交真实订单；SUBMITTED 不等于成交，页面只在 FINISHED 后报告成功。";
      byId("eligibility-approval-row").hidden = payload.campaignEligibility === "CONFIRMED";
      byId("confirm-intent").textContent = browserMode ? "确认并用浏览器钱包提交" : "确认并提交 Agentic Wallet";
      updateTradeApprovalButton();
      refreshLiveSnapshot({ silent: true });
    } catch (error) {
      if (contextVersion !== walletContextVersion) return;
      byId("dialog-warning-title").textContent = "真实报价失败";
      byId("dialog-warning-copy").textContent = error instanceof Error ? error.message : "真实报价失败";
      byId("confirm-intent").textContent = "无法提交";
      showToast(error instanceof Error ? error.message : "真实报价失败", "error");
    }
  }

  function updateTradeApprovalButton() {
    const eligibilityRequired = !byId("eligibility-approval-row").hidden;
    byId("confirm-intent").disabled = !byId("approval-check").checked
      || (eligibilityRequired && !byId("eligibility-approval-check").checked)
      || !tradeQuoteIntent;
  }

  async function confirmIntent() {
    const dialog = byId("trade-dialog");
    if (!tradeQuoteIntent || !tradeQuote || walletActionInFlight || !byId("approval-check").checked) return;
    const quote = tradeQuote;
    const intent = tradeQuoteIntent;
    const contextVersion = quote.contextVersion;
    const button = byId("confirm-intent");
    const progress = byId("trade-execution-progress");
    button.disabled = true;
    button.textContent = "正在提交真实订单…";
    progress.hidden = false;
    progress.className = "execution-progress";
    progress.querySelector("span").textContent = browserWalletReady()
      ? "浏览器钱包正在复核 BNB Chain、必要授权与交易参数…"
      : "Agentic Wallet 正在复核余额、风控与 App 授权策略…";
    let browserBroadcastHash = "";
    walletActionInFlight = true;
    try {
      assertWalletContext(contextVersion);
      const browserMode = quote.walletMode === "browser";
      let browserSubmission = null;
      if (browserMode) {
        browserSubmission = await submitBrowserWalletTransaction(quote, contextVersion);
        browserBroadcastHash = browserSubmission.txHash;
        progress.querySelector("span").textContent = `交易 ${browserSubmission.txHash} 已广播，正在写入审计账本…`;
      }
      const response = await fetch(browserMode ? "/api/bstock-alpha/browser-wallet/trading/submit" : "/api/bstock-alpha/trading/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          ...(browserMode ? {
            address: quote.walletAddress,
            txHash: browserSubmission.txHash,
            approvalTxHash: browserSubmission.approvalTxHash
          } : {}),
          intent,
          confirmation: "确认实盘交易",
          acknowledged: true,
          eligibilityAcknowledged: byId("eligibility-approval-check").checked
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const submissionError = new Error(payload.error || "真实订单提交失败");
        submissionError.code = payload.code || "TRADE_EXECUTION_FAILED";
        throw submissionError;
      }
      progress.querySelector("span").textContent = `订单 ${payload.orderId} 已提交，正在等待${browserMode ? " BNB Chain 回执" : " Binance App / 链上最终状态"}…`;
      const submittedAt = Date.now();
      const pendingOrder = {
        orderId: payload.orderId,
        clientOrderId: payload.clientOrderId || null,
        symbol: payload.symbol,
        side: payload.side,
        fromToken: payload.fromToken || null,
        toToken: payload.toToken || null,
        fromSymbol: payload.fromSymbol || null,
        toSymbol: payload.toSymbol || null,
        fromAmount: payload.fromAmount || null,
        toAmount: payload.toAmount || null,
        walletMode: browserMode ? "browser" : "agent",
        walletAddress: browserMode ? quote.walletAddress : null,
        createdAt: submittedAt
      };
      const pendingPersistence = bstockStorage.persistPendingOrder(pendingOrder);
      if (contextVersion !== walletContextVersion) return;
      tradeQuoteIntent = "";
      showToast(pendingPersistence.durable
        ? "真实订单已提交；正在轮询，只有 FINISHED 才会报告成功。 "
        : "真实订单已提交；本页继续轮询，刷新后将从服务器审计账本恢复状态。 ");
      refreshLiveSnapshot({ silent: true });
      pollOrderStatus(payload.orderId, 0, submittedAt, pendingOrder);
    } catch (error) {
      progress.className = "execution-progress error";
      progress.querySelector("span").textContent = error instanceof Error ? error.message : "真实订单提交失败";
      if (error?.code === "ORDER_SUBMISSION_STATUS_UNKNOWN" || browserBroadcastHash) {
        button.textContent = "状态待核验，请勿重试";
        button.disabled = true;
        tradeQuoteIntent = "";
        if (browserBroadcastHash) progress.querySelector("span").textContent = `交易已广播：${browserBroadcastHash}。审计同步失败，请勿重复提交；可在 BscScan 核验。`;
      } else {
        button.textContent = "重新获取报价";
        resetTradeQuote();
      }
      showToast(error instanceof Error ? error.message : "真实订单提交失败", "error");
    } finally {
      walletActionInFlight = false;
    }
  }

  async function pollOrderStatus(orderId, attempt = 0, submittedAt, matchHint = {}) {
    const contextVersion = walletContextVersion;
    if (!walletOperational() || (matchHint.walletMode && matchHint.walletMode !== walletConnectionMode)) return;
    clearTimeout(orderPollTimer);
    activePendingOrderId = String(orderId || "");
    const submittedAgeMs = Number.isFinite(submittedAt) ? Date.now() - submittedAt : 0;
    if (submittedAgeMs >= 15 * 60_000) {
      const progress = byId("trade-execution-progress");
      progress.hidden = false;
      progress.querySelector("span").textContent = "订单尚未获得最终状态；自动回查已暂停，刷新页面或重新进入后可继续核对，不会重复提交。";
      return;
    }
    if (document.hidden) {
      orderPollTimer = setTimeout(() => pollOrderStatus(orderId, attempt, submittedAt, matchHint), 30_000);
      return;
    }
    let retryAfterMs = 3_000;
    try {
      const browserMode = matchHint.walletMode === "browser" || (browserWalletReady() && !matchHint.walletMode);
      if (browserMode && (!browserWalletReady() || (matchHint.walletAddress && matchHint.walletAddress.toLowerCase() !== walletAddress.toLowerCase()))) {
        throw new Error("请重新连接提交该订单的浏览器钱包后继续查询。");
      }
      const response = await fetch(browserMode ? "/api/bstock-alpha/browser-wallet/trading/order-status" : "/api/bstock-alpha/trading/order-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          orderId,
          ...(browserMode ? { address: walletAddress } : {}),
          ...(Number.isFinite(submittedAt) ? { submittedAt } : {}),
          ...["clientOrderId", "fromToken", "toToken", "fromSymbol", "toSymbol", "fromAmount", "toAmount"].reduce((result, key) => {
            if (matchHint?.[key] != null) result[key] = String(matchHint[key]);
            return result;
          }, {})
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion) return;
      if (!response.ok) throw new Error(payload.error || "订单状态查询失败");
      retryAfterMs = Math.max(2_000, Math.min(10_000, Number(payload.retryAfterMs) || 3_000));
      const progress = byId("trade-execution-progress");
      const successful = payload.successful === true || ["FINISHED", "SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED"].includes(payload.status);
      const failed = (payload.final === true && !successful) || ["FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"].includes(payload.status);
      if (successful) {
        bstockStorage.clearPendingOrder();
        activePendingOrderId = "";
        addLiveAudit(browserMode ? "浏览器钱包订单已完成" : "Agentic Wallet 订单已完成", `${orderId}${payload.txHash ? ` · ${payload.txHash}` : ""}`, "TRADE");
        progress.hidden = false;
        progress.className = "execution-progress success";
        progress.querySelector("span").textContent = `FINISHED · 实际成交 ${payload.fromAmount || "—"} ${payload.fromSymbol || ""} → ${payload.toAmount || "—"} ${payload.toSymbol || ""}${payload.settledByEvidence ? " · 已按链上成交凭证确认" : ""}`;
        byId("confirm-intent").textContent = "订单已成交";
        showToast(`${browserMode ? "浏览器钱包" : "Agentic Wallet"}订单已 FINISHED；现在可以进入持仓 / Realized PnL 对账。 `);
        refreshLiveSnapshot({ silent: true });
        return;
      }
      if (failed) {
        bstockStorage.clearPendingOrder();
        activePendingOrderId = "";
        progress.hidden = false;
        progress.className = "execution-progress error";
        progress.querySelector("span").textContent = "FAILED · 订单未成交，不会进入 PnL 账本。";
        byId("confirm-intent").textContent = "订单失败";
        showToast(`${browserMode ? "浏览器钱包" : "Agentic Wallet"}订单最终失败，未计入持仓。`, "error");
        refreshLiveSnapshot({ silent: true });
        return;
      }
      progress.hidden = false;
      progress.querySelector("span").textContent = payload.reason === "ORDER_NOT_INDEXED"
        ? `PENDING · ${browserMode ? "BNB Chain" : "Agentic Wallet"} 已受理，正在同步订单历史…`
        : `${payload.status || "PENDING"} · 正在等待${browserMode ? " BNB Chain 回执" : " Binance App 确认或链上成交"}…`;
    } catch (error) {
      if (contextVersion !== walletContextVersion) return;
      if (attempt > 5) {
        showToast("订单仍未获得最终状态，请稍后继续查询；不会重复提交。", "error");
      }
    }
    if (attempt < 120) {
      const backoffMs = attempt < 10 ? retryAfterMs : attempt < 40 ? Math.max(retryAfterMs, 10_000) : 30_000;
      orderPollTimer = setTimeout(() => pollOrderStatus(orderId, attempt + 1, submittedAt, matchHint), backoffMs);
    } else {
      const progress = byId("trade-execution-progress");
      progress.hidden = false;
      progress.querySelector("span").textContent = "订单仍在回查；不会重复提交。刷新页面后会自动继续核对 Agentic Wallet 历史。";
    }
  }

  function restorePendingOrder() {
    const pending = bstockStorage.readPendingOrder();
    if (pending?.orderId && Date.now() - pending.createdAt < 24 * 60 * 60_000) {
      pollOrderStatus(pending.orderId, 0, pending.createdAt, pending);
    } else if (pending) {
      bstockStorage.clearPendingOrder();
    }
  }

  function resumePendingOrderFromLedger() {
    if (activePendingOrderId) return;
    const pending = (liveSnapshot?.tradingLedger?.orders || []).find((order) => {
      const createdAt = Date.parse(order?.createdAt || order?.updatedAt || "");
      return order?.orderId && order.final === false && Number.isFinite(createdAt)
        && Date.now() - createdAt < 24 * 60 * 60_000;
    });
    if (!pending) return;
    const createdAt = Date.parse(pending.createdAt || pending.updatedAt);
    const hint = {
      orderId: pending.orderId,
      symbol: pending.symbol,
      side: pending.side,
      fromSymbol: pending.fromSymbol,
      toSymbol: pending.toSymbol,
      fromAmount: pending.fromAmount,
      toAmount: pending.toAmount,
      walletMode: walletConnectionMode,
      walletAddress,
      createdAt
    };
    bstockStorage.persistPendingOrder(hint);
    pollOrderStatus(pending.orderId, 0, createdAt, hint);
  }

  function agentStudioScore(rating) {
    const normalized = String(rating || "").trim().toLowerCase();
    if (/strong\s*sell|强烈卖出|强力卖出/.test(normalized)) return 20;
    if (/(?:^|\b)sell(?:\b|$)|卖出|减持/.test(normalized)) return 35;
    if (/strong\s*buy|conviction\s*buy|强烈买入|强力买入/.test(normalized)) return 88;
    if (/(?:^|\b)buy(?:\b|$)|outperform|overweight|买入|增持/.test(normalized)) return 82;
    if (/hold|neutral|market\s*perform|中性|持有/.test(normalized)) return 60;
    return null;
  }

  function setResearchStatus(kind, message) {
    const status = byId("research-payment-status");
    status.className = `research-payment-status${kind ? ` ${kind}` : ""}`;
    status.querySelector("span").textContent = message;
  }

  function updateResearchApproval() {
    const selectedIndex = Number(document.querySelector('input[name="research-payment"]:checked')?.value || 0);
    if (researchPreview) researchPreview.selectedIndex = selectedIndex;
    byId("confirm-paid-research").disabled = !researchPreview?.intent
      || walletActionInFlight
      || researchPreview.contextVersion !== walletContextVersion
      || !selectedIndex
      || !byId("research-approval-check").checked;
  }

  function renderPaymentOptions(options) {
    const container = byId("research-payment-options");
    container.replaceChildren();
    let selectedFirst = false;
    options.forEach((option) => {
      const ready = Boolean(option.selectable);
      const label = document.createElement("label");
      label.className = `payment-option${ready ? "" : " disabled"}`;
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "research-payment";
      input.value = String(option.index);
      input.disabled = !ready;
      if (ready && !selectedFirst) {
        input.checked = true;
        selectedFirst = true;
      }
      input.addEventListener("change", updateResearchApproval);
      const detail = document.createElement("p");
      const title = document.createElement("strong");
      title.textContent = `${option.tokenSymbol || "TOKEN"} · ${option.networkLabel || option.network || "EVM"}`;
      const meta = document.createElement("small");
      const payTo = option.payTo ? `${option.payTo.slice(0, 8)}…${option.payTo.slice(-6)}` : "收款地址待返回";
      meta.textContent = ready
        ? `${option.needApproveFirst ? `需一次性 Permit2 授权 · ${option.networkLabel || option.network || "EVM"}` : option.currentBalance == null ? "签名时由钱包复核余额" : `余额 ${option.currentBalance}`} · 收款 ${payTo}`
        : `${option.reasons?.join(" / ") || "余额不足或当前不受支持"}`;
      detail.append(title, meta);
      const amount = document.createElement("em");
      amount.textContent = option.amountUsd ? `$${option.amountUsd}` : `${option.amount || "—"} ${option.tokenSymbol || ""}`;
      label.append(input, detail, amount);
      container.append(label);
    });
  }

  function hydrateCompletedStudioReport(payload) {
    bstockStorage.clearStudioJob();
    activeStudioJobId = "";
    const payloadTicker = String(payload.symbol || "").toUpperCase();
    const bstockSymbol = payload.bstockSymbol
      || bstockByTicker[payloadTicker]
      || ((selected.ticker || tickerByBstock[selected.symbol]) === payloadTicker ? selected.symbol : "");
    const score = agentStudioScore(payload.summary?.rating);
    if (bstockSymbol) {
      const existingReport = studioReports[bstockSymbol];
      const reportReadings = { ...(existingReport?.reportReadings || {}) };
      if (payload.reportReading && ["zh", "en"].includes(payload.reportReading.language)) {
        reportReadings[payload.reportReading.language] = payload.reportReading;
      }
      studioReports[bstockSymbol] = {
        ...payload.summary,
        score: Number.isFinite(score) ? score : null,
        reportId: payload.reportId || existingReport?.reportId || null,
        reportMarkdown: payload.reportMarkdown,
        reportReading: payload.reportReading || null,
        reportReadings,
        paymentTxHash: payload.paymentTxHash || null,
        completedAt: payload.completedAt
      };
    }
    if (bstockSymbol === selected.symbol) setAsset(selected);
    return { bstockSymbol, payloadTicker, score, report: bstockSymbol ? studioReports[bstockSymbol] : null };
  }

  function appendReportParagraphs(container, paragraphs, fallback = "") {
    container.replaceChildren();
    const values = Array.isArray(paragraphs) && paragraphs.length ? paragraphs : fallback ? [fallback] : [];
    values.forEach((paragraph) => {
      const node = document.createElement("p");
      node.textContent = String(paragraph || "").trim();
      if (node.textContent) container.append(node);
    });
  }

  const reportIndicatorLabels = new Set(["指标", "项目", "metric", "indicator", "item"]);
  const reportKnownMetricLabels = new Set([
    ...reportIndicatorLabels,
    "数值", "数据", "读数", "水平", "信号", "状态", "趋势", "判断", "评估", "结论", "说明", "期限",
    "value", "data", "reading", "level", "signal", "status", "trend", "assessment", "conclusion", "note", "period", "horizon",
    "代码", "标的", "公司", "评级", "目标价", "当前价格", "参考价格", "潜在空间", "上涨/下跌空间", "风险", "风险等级",
    "市值", "滚动市盈率", "预期市盈率", "peg比率", "营收增长", "毛利率", "贝塔", "波动率", "胜率", "盈亏比",
    "symbol", "ticker", "company", "rating", "price target", "target price", "current price", "reference price", "potential upside",
    "upside/downside", "upside / downside", "risk", "risk level", "market cap", "trailing p/e", "forward p/e", "peg ratio",
    "revenue growth", "gross margin", "beta", "volatility", "win rate", "profit factor",
    "rsi", "rsi-14", "macd", "adx", "obv", "ma-50", "ma-200", "vix", "cpi", "失业率", "fed rate", "treasury yield"
  ]);

  function normalizeReportMetricLabel(value) {
    return String(value || "").toLowerCase().replace(/&nbsp;|\u00a0/gi, " ").replace(/[\s_-]+/g, " ").replace(/[：:]+$/g, "").trim();
  }

  function cleanReportMetricText(value) {
    return String(value || "")
      .replace(/&nbsp;|&#160;|\u00a0/gi, " ")
      .replace(/&#124;/gi, "|")
      .replace(/&amp;/gi, "&")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/\\n/g, " ")
      .replace(/[\*_`~]/g, "")
      .replace(/^\s*(?:[-•]|\d+[.)])\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseReportMetricFields(value) {
    const clean = cleanReportMetricText(value).replace(/^[-—–]{3,}$/, "").replace(/\s+\|\s+/g, "；");
    if (!clean) return null;
    const fields = clean.split(/[；;]+/).flatMap((segment) => {
      const part = segment.trim();
      const separator = part.search(/[：:]/);
      if (separator < 1 || separator > 48) return [];
      const label = cleanReportMetricText(part.slice(0, separator));
      const fieldValue = cleanReportMetricText(part.slice(separator + 1)).replace(/^[◆◇●▪]+\s*/, "");
      const normalized = normalizeReportMetricLabel(label);
      return label && fieldValue && normalized ? [{ label, normalized, value: fieldValue }] : [];
    });
    if (fields.length < 2) return null;
    const recognized = fields.filter((field) => reportKnownMetricLabels.has(field.normalized)).length;
    const hasIndicator = fields.some((field) => reportIndicatorLabels.has(field.normalized));
    return hasIndicator || recognized >= 2 ? fields.slice(0, 10) : null;
  }

  function reportMetricTableCopy(language) {
    return language === "en"
      ? { metrics: "Key metrics", matrix: "Data comparison", facts: "Data overview", item: "Item", value: "Value" }
      : { metrics: "关键指标", matrix: "数据对比", facts: "数据概览", item: "项目", value: "数据" };
  }

  function partitionReportMetricContent(values, language) {
    const parsed = [];
    const remaining = [];
    (Array.isArray(values) ? values : []).forEach((value, sourceIndex) => {
      const clean = cleanReportMetricText(value);
      if (!clean || /^[-—–]{3,}$/.test(clean)) return;
      const fields = parseReportMetricFields(clean);
      if (fields) parsed.push({ fields, sourceIndex });
      else remaining.push(clean);
    });
    if (!parsed.length) return { remaining, tables: [] };
    const copy = reportMetricTableCopy(language);
    const metricEntries = parsed.filter((entry) => entry.fields.some((field) => reportIndicatorLabels.has(field.normalized)));
    const generalEntries = parsed.filter((entry) => !metricEntries.includes(entry));
    const tables = [];
    const uniqueColumns = (entries) => {
      const seen = new Set();
      return entries.flatMap((entry) => entry.fields.flatMap((field) => {
        if (seen.has(field.normalized)) return [];
        seen.add(field.normalized);
        return [field.label];
      })).slice(0, 8);
    };
    const valueForColumn = (entry, column) => entry.fields.find((field) => field.normalized === normalizeReportMetricLabel(column))?.value || "—";

    if (metricEntries.length) {
      const columns = uniqueColumns(metricEntries);
      tables.push({ id: "metrics", kind: "metrics", title: copy.metrics, columns, rows: metricEntries.slice(0, 24).map((entry) => columns.map((column) => valueForColumn(entry, column))) });
    }

    const groups = new Map();
    generalEntries.forEach((entry) => {
      const signature = entry.fields.map((field) => field.normalized).join("|");
      groups.set(signature, [...(groups.get(signature) || []), entry]);
    });
    const facts = [];
    let matrixIndex = 0;
    groups.forEach((entries) => {
      if (entries.length < 2) {
        facts.push(...entries);
        return;
      }
      const columns = entries[0].fields.map((field) => field.label).slice(0, 8);
      tables.push({ id: `matrix-${matrixIndex += 1}`, kind: "matrix", title: copy.matrix, columns, rows: entries.slice(0, 24).map((entry) => columns.map((column) => valueForColumn(entry, column))) });
    });
    if (facts.length) {
      tables.push({ id: "facts", kind: "facts", title: copy.facts, columns: [copy.item, copy.value], rows: facts.flatMap((entry) => entry.fields.map((field) => [field.label, field.value])).slice(0, 30) });
    }
    return { remaining, tables: tables.slice(0, 5) };
  }

  function appendReportMetricTables(container, tables) {
    if (!Array.isArray(tables) || !tables.length) return;
    const collection = document.createElement("div");
    collection.className = "report-reader-data-tables";
    tables.forEach((tableData) => {
      const wrap = document.createElement("div");
      wrap.className = `report-reader-data-table-wrap ${tableData.kind}`;
      wrap.tabIndex = 0;
      wrap.setAttribute("role", "region");
      wrap.setAttribute("aria-label", tableData.title);
      const table = document.createElement("table");
      table.className = "report-reader-data-table";
      const caption = document.createElement("caption");
      caption.textContent = tableData.title;
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      tableData.columns.forEach((column) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = column;
        headRow.append(cell);
      });
      head.append(headRow);
      const body = document.createElement("tbody");
      tableData.rows.forEach((row) => {
        const rowNode = document.createElement("tr");
        row.forEach((value, index) => {
          const cell = document.createElement(tableData.kind === "facts" && index === 0 ? "th" : "td");
          if (cell.tagName === "TH") cell.scope = "row";
          cell.textContent = value;
          rowNode.append(cell);
        });
        body.append(rowNode);
      });
      table.append(caption, head, body);
      wrap.append(table);
      collection.append(wrap);
    });
    container.append(collection);
  }

  function reportReaderCopy(language) {
    return language === "en" ? {
      sourceStructured: "Structured JSON report",
      sourceMarkdown: "Markdown report",
      language: "English edition",
      completed: "Completed",
      latest: "Latest recovered report",
      summary: "Executive summary",
      summaryFallback: "The source report does not contain a standalone executive summary. Read the analysis modules below together.",
      sectionFallback: "Analysis",
      conclusion: "Conclusion",
      conclusionFallback: "The report does not contain a standalone conclusion. Review the summary, valuation and risk sections before deciding.",
      disclaimer: "For research assistance only. This report is not investment advice.",
      raw: "View source report",
      rawFallback: "The source report was not returned with this result."
    } : {
      sourceStructured: "结构化 JSON 研报",
      sourceMarkdown: "Markdown 研报",
      language: "中文阅读版",
      completed: "完成于",
      latest: "最新回捞结果",
      summary: "核心摘要",
      summaryFallback: "原始研报未单列执行摘要，请结合下方各分析模块阅读。",
      sectionFallback: "内容分析",
      conclusion: "综合结论",
      conclusionFallback: "本次研报未给出独立结论，请结合核心摘要、估值与风险模块审慎判断。",
      disclaimer: "本赏析仅用于研究辅助，不构成投资建议。",
      raw: "查看原始研报",
      rawFallback: "原始研报正文未随本次结果返回。"
    };
  }

  function setReportReaderLanguageState(language, loading = false) {
    selectors("[data-report-language]").forEach((button) => {
      const active = button.dataset.reportLanguage === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = loading;
    });
    const switcher = document.querySelector(".report-reader-language-switch");
    if (switcher) switcher.classList.toggle("loading", loading);
  }

  function renderStudioReportReader(report, asset = selected) {
    const requestedLanguage = arguments[2] || reportReaderLanguage;
    const requestedReading = report?.reportReadings?.[requestedLanguage];
    const reading = requestedReading || report?.reportReading;
    if (!reading || !Array.isArray(reading.sections)) {
      showToast("最新研报尚未完成结构化解析，请先回捞最近研报。", "error");
      return;
    }
    const displayedLanguage = reading.language === "en" ? "en" : "zh";
    const copy = reportReaderCopy(displayedLanguage);
    activeReportReader = { report, asset, language: displayedLanguage };
    reportReaderLanguage = requestedLanguage;
    setReportReaderLanguageState(displayedLanguage);
    const dialog = byId("report-reader-dialog");
    const ticker = asset.ticker || tickerByBstock[asset.symbol] || asset.symbol.replace(/B$/, "");
    byId("report-reader-title").textContent = `${ticker}（${asset.symbol}）· ${reading.title || "AI 研报赏析"}`;
    byId("report-reader-subtitle").textContent = reading.subtitle || `${asset.nameZh ? `${asset.nameZh} · ` : ""}${asset.name || "Agent Studio 最新研报"}`;
    byId("report-reader-source").textContent = reading.sourceFormat === "structured-json" ? copy.sourceStructured : copy.sourceMarkdown;
    byId("report-reader-language").textContent = copy.language;
    const completedAt = report.completedAt ? new Date(report.completedAt) : null;
    byId("report-reader-completed").textContent = completedAt && !Number.isNaN(completedAt.getTime())
      ? `${copy.completed} ${completedAt.toLocaleString(displayedLanguage === "en" ? "en-US" : "zh-CN", { hour12: false })}`
      : copy.latest;
    byId("report-reader-summary-title").textContent = copy.summary;
    byId("report-reader-conclusion-title").textContent = copy.conclusion;
    document.querySelector(".report-reader-raw-panel summary").textContent = copy.raw;

    const highlights = byId("report-reader-highlights");
    highlights.replaceChildren();
    (reading.highlights || []).forEach((item) => {
      const card = document.createElement("div");
      card.className = "report-reader-highlight";
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = String(item?.label || "要点");
      value.textContent = String(item?.value || "—");
      card.append(label, value);
      highlights.append(card);
    });
    highlights.hidden = !highlights.childElementCount;

    const summaryContent = partitionReportMetricContent(reading.executiveSummary, displayedLanguage);
    const summary = byId("report-reader-summary");
    appendReportParagraphs(summary, summaryContent.remaining, summaryContent.tables.length ? "" : copy.summaryFallback);
    appendReportMetricTables(summary, summaryContent.tables);

    const sections = byId("report-reader-sections");
    sections.replaceChildren();
    (reading.sections || []).forEach((section) => {
      const article = document.createElement("section");
      article.className = "report-reader-section";
      const heading = document.createElement("h3");
      heading.textContent = String(section?.title || copy.sectionFallback);
      article.append(heading);
      const paragraphContent = partitionReportMetricContent(section?.paragraphs || [], displayedLanguage);
      const bulletContent = partitionReportMetricContent(section?.bullets || [], displayedLanguage);
      paragraphContent.remaining.forEach((paragraph) => {
        const node = document.createElement("p");
        node.textContent = String(paragraph || "").trim();
        if (node.textContent) article.append(node);
      });
      appendReportMetricTables(article, [...paragraphContent.tables, ...bulletContent.tables]);
      const bullets = bulletContent.remaining.filter(Boolean);
      if (bullets.length) {
        const list = document.createElement("ul");
        bullets.forEach((bullet) => {
          const item = document.createElement("li");
          item.textContent = String(bullet);
          list.append(item);
        });
        article.append(list);
      }
      sections.append(article);
    });

    const conclusionContent = partitionReportMetricContent(reading.conclusion, displayedLanguage);
    const conclusion = byId("report-reader-conclusion");
    appendReportParagraphs(conclusion, conclusionContent.remaining, conclusionContent.tables.length ? "" : copy.conclusionFallback);
    appendReportMetricTables(conclusion, conclusionContent.tables);
    byId("report-reader-disclaimer").textContent = reading.disclaimer || copy.disclaimer;
    byId("report-reader-raw").textContent = report.reportMarkdown || copy.rawFallback;
    if (dialog.open) dialog.close();
    dialog.showModal();
  }

  async function loadStudioReportLanguage(language) {
    if (!activeReportReader || !["zh", "en"].includes(language)) return;
    const contextVersion = walletContextVersion;
    const { report, asset } = activeReportReader;
    if (report.reportReadings?.[language]) {
      reportReaderLanguage = language;
      localStorage.setItem("bstock-alpha-report-language", language);
      renderStudioReportReader(report, asset, language);
      return;
    }
    if (!walletOperational()) {
      showToast("研报语言转换需要已验证的钱包连接。", "error");
      return;
    }
    reportReaderRequest?.abort();
    const request = new AbortController();
    reportReaderRequest = request;
    setReportReaderLanguageState(language, true);
    const shareButton = byId("share-studio-report");
    shareButton.disabled = true;
    try {
      const response = await fetch("/api/bstock-alpha/research/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ symbol: asset.symbol, language, ...(report.reportId ? { reportId: report.reportId } : {}), ...walletRequestContext() }),
        signal: request.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion || request.signal.aborted) return;
      if (!response.ok) throw new Error(payload.error || "研报语言版本生成失败");
      if (!payload.reportReading || payload.reportReading.language !== language) throw new Error("研报语言版本返回无效。");
      report.reportReadings = { ...(report.reportReadings || {}), [language]: payload.reportReading };
      reportReaderLanguage = language;
      localStorage.setItem("bstock-alpha-report-language", language);
      renderStudioReportReader(report, asset, language);
      showToast(language === "en" ? "English report edition is ready." : "中文研报阅读版已生成。 ");
    } catch (error) {
      if (contextVersion !== walletContextVersion || request.signal.aborted) return;
      if (error?.name !== "AbortError") showToast(error instanceof Error ? error.message : "研报语言版本生成失败", "error");
      setReportReaderLanguageState(activeReportReader?.language || "zh");
    } finally {
      if (reportReaderRequest === request) {
        reportReaderRequest = undefined;
        shareButton.disabled = false;
      }
    }
  }

  function openLocalizedStudioReportReader(report, asset = selected) {
    const preferred = reportReaderLanguage;
    renderStudioReportReader(report, asset, preferred);
    if (!report.reportReadings?.[preferred] && report.reportReading?.language !== preferred) {
      loadStudioReportLanguage(preferred);
    }
  }

  async function createStudioReportShare() {
    if (!activeReportReader) return;
    const contextVersion = walletContextVersion;
    if (!walletOperational()) {
      showToast("请先连接并验证钱包，再生成研报分享页。", "error");
      return;
    }
    const { report, asset, language } = activeReportReader;
    const button = byId("share-studio-report");
    const label = button.querySelector("span");
    const shareWindow = window.open("about:blank", "_blank");
    button.disabled = true;
    label.textContent = "正在生成安全快照…";
    try {
      const response = await fetch("/api/bstock-alpha/research/share", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ symbol: asset.symbol, language, ...(report.reportId ? { reportId: report.reportId } : {}), ...walletRequestContext() })
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion) { shareWindow?.close(); return; }
      if (!response.ok || !payload.shareUrl) throw new Error(payload.error || "品牌分享页生成失败");
      if (shareWindow) shareWindow.location.replace(payload.shareUrl);
      else {
        await navigator.clipboard.writeText(payload.shareUrl);
        showToast("浏览器阻止了新窗口，分享链接已复制。 ");
      }
    } catch (error) {
      shareWindow?.close();
      if (contextVersion !== walletContextVersion) return;
      showToast(error instanceof Error ? error.message : "品牌分享页生成失败", "error");
    } finally {
      button.disabled = false;
      label.textContent = "生成品牌分享页";
    }
  }

  function renderCompletedStudioReport(payload, reused = false) {
    const { bstockSymbol, payloadTicker, score, report } = hydrateCompletedStudioReport(payload);
    console.info("[bstock:studio] report_hydrated", {
      symbol: bstockSymbol || payloadTicker,
      rating: payload.summary?.rating || null,
      score: Number.isFinite(score) ? score : null,
      reused
    });
    const result = byId("research-result");
    result.hidden = false;
    result.textContent = [
      reused ? "最近 30 分钟研报已复用，本次未再次付费。" : "Agent Studio 真实付费研报已完成。",
      `评级: ${payload.summary?.rating || "未识别"}`,
      `目标价: ${payload.summary?.targetPrice ? money(payload.summary.targetPrice) : "未识别"}`,
      payload.paymentTxHash ? `付款 TX: ${payload.paymentTxHash}` : "",
      "",
      payload.reportMarkdown || payload.summary?.risks || "研报已完成，但正文为空。"
    ].filter((line) => line !== "").join("\n");
    setResearchStatus("ready", `${payload.symbol} Agent Studio 研报已返回并纳入确定性评分。`);
    byId("confirm-paid-research").textContent = reused ? "已复用最近研报" : "研报已完成";
    showToast(`${payload.symbol} Agent Studio 研报已${reused ? "复用" : "完成"}并进入策略评分。`);
    refreshLiveSnapshot({ silent: true });
    if (pendingReportReaderSymbol && pendingReportReaderSymbol === bstockSymbol && report?.reportReading) {
      pendingReportReaderSymbol = "";
      const researchDialog = byId("research-dialog");
      if (researchDialog.open) researchDialog.close();
      openLocalizedStudioReportReader(report, assets[bstockSymbol] || selected);
    }
  }

  function startStudioRecovery(payload, recover = false) {
    let createdAt = Date.now();
    const stored = bstockStorage.readStudioJob();
    if (stored?.jobId === payload.jobId && Number.isFinite(stored.createdAt)) createdAt = stored.createdAt;
    const pending = { jobId: payload.jobId, symbol: payload.symbol, createdAt, walletMode: walletConnectionMode, walletAddress };
    activeStudioJobId = payload.jobId;
    bstockStorage.persistStudioJob(pending);
    const result = byId("research-result");
    result.hidden = false;
    result.textContent = `${payload.message || "正在回捞原研报任务。"}\njobId: ${payload.jobId}${payload.paymentTxHash ? `\nTX: ${payload.paymentTxHash}` : ""}`;
    setResearchStatus("ready", "正在查询同一已付费任务；不会重新签名或付款。");
    byId("confirm-paid-research").textContent = "研报回捞中";
    pollStudioJob(payload.jobId, 0, recover);
  }

  function handleStudioExistingTask(payload, recover = false) {
    if (payload.provider !== "studio") return false;
    if (payload.status === "REUSED") {
      renderCompletedStudioReport(payload, true);
      return true;
    }
    if (payload.status === "RECOVERING") {
      startStudioRecovery(payload, recover || Boolean(payload.retryable));
      return true;
    }
    return false;
  }

  async function openPaidResearch(providerName, asset = selected) {
    if (walletActionInFlight || researchPreviewRequest) return;
    if (!walletOperational()) {
      showToast("请先连接并验证 Agent 或浏览器钱包，再预览真实付费请求。", "error");
      openWalletDialog();
      return;
    }
    const dialog = byId("research-dialog");
    const ticker = asset.ticker || tickerByBstock[asset.symbol];
    const contextVersion = walletContextVersion;
    const requestVersion = ++researchRequestVersion;
    const request = new AbortController();
    researchPreviewRequest = request;
    researchPreviewRetry = null;
    byId("retry-research-preview").hidden = true;
    researchPreview = null;
    byId("research-dialog-title").textContent = providerName === "cmc"
      ? `${asset.symbol} · CMC AI x402 付费调用`
      : `${ticker}（${asset.symbol}）Agent Studio 付费研报`;
    byId("research-purpose").textContent = "正在读取商户付款要求…";
    byId("research-payment-options").replaceChildren();
    byId("research-result").hidden = true;
    byId("research-result").textContent = "";
    byId("research-approval-check").checked = false;
    byId("confirm-paid-research").disabled = true;
    byId("confirm-paid-research").textContent = "确认签名并付费";
    byId("confirm-paid-research").hidden = false;
    setResearchStatus("", "正在获取实时付款要求；此步骤不会签名或扣费。");
    dialog.showModal();
    const slowTimer = setTimeout(() => {
      if (contextVersion !== walletContextVersion || requestVersion !== researchRequestVersion) return;
      setResearchStatus("", "首次加载或上游响应较慢，正在准备付款预览（最长约两分钟）；尚未签名、未付款，请勿重复点击。");
    }, 10_000);
    // Longer than the server's bounded 110s preview and 120s function limit.
    const timeoutTimer = setTimeout(() => request.abort(new DOMException("Preview timed out", "TimeoutError")), 125_000);
    try {
      const browserMode = browserWalletReady();
      const response = await fetch(browserMode ? "/api/bstock-alpha/browser-wallet/research/preview" : "/api/bstock-alpha/research/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ provider: providerName, symbol: asset.symbol, ...(browserMode ? { address: walletAddress } : {}) }),
        signal: request.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion || requestVersion !== researchRequestVersion) return;
      if (!response.ok) throw new Error(payload.error || "x402 付款预览失败");
      if (providerName === "studio" && handleStudioExistingTask(payload, true)) {
        byId("research-purpose").textContent = "Agent Studio · 最近任务回捞 / 30 分钟复用";
        byId("research-payment-options").replaceChildren();
        byId("research-approval-check").checked = false;
        byId("confirm-paid-research").disabled = true;
        return;
      }
      researchPreview = { ...payload, selectedIndex: 0, walletMode: browserMode ? "browser" : "agent", walletAddress, contextVersion };
      byId("research-purpose").textContent = payload.purpose;
      renderPaymentOptions(payload.options || []);
      updateResearchApproval();
      const readyCount = (payload.options || []).filter((option) => option.selectable).length;
      const approvalCount = (payload.options || []).filter((option) => option.selectable && option.needApproveFirst).length;
      setResearchStatus(readyCount ? "ready" : "error", readyCount
        ? payload.previousStudioFailure
          ? `上一任务 ${payload.previousStudioFailure.jobId} 已永久失败（${payload.previousStudioFailure.errorCode || "analysis_failed"}）。已找到 ${readyCount} 个可用付款方式；继续确认会创建新任务并再次付费。`
          : `已找到 ${readyCount} 个可用真实付款方式${approvalCount ? `，其中 ${approvalCount} 个会在确认后完成一次性 Permit2 授权` : ""}。`
        : "当前付款方式余额不足或不受支持；未执行签名、授权或扣费。");
    } catch (error) {
      if (contextVersion !== walletContextVersion || requestVersion !== researchRequestVersion) return;
      const message = error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "付款预览暂时超时。本次尚未签名、未付款，可安全重新获取付款预览。"
        : error instanceof Error ? error.message : "x402 付款预览失败";
      researchPreviewRetry = { providerName, asset: { ...asset }, contextVersion };
      byId("retry-research-preview").hidden = false;
      byId("confirm-paid-research").hidden = true;
      byId("research-purpose").textContent = "付款预览未完成；尚未签名、未付款。";
      setResearchStatus("error", message);
      showToast(message, "error");
    } finally {
      clearTimeout(slowTimer);
      clearTimeout(timeoutTimer);
      if (researchPreviewRequest === request) researchPreviewRequest = undefined;
    }
  }

  function retryPaidResearchPreview() {
    const retry = researchPreviewRetry;
    if (!retry || retry.contextVersion !== walletContextVersion || walletActionInFlight) return;
    // This button is only exposed by a failed unsigned preview, never execution.
    return openPaidResearch(retry.providerName, retry.asset);
  }

  async function executePaidResearch() {
    if (!researchPreview?.intent || !researchPreview.selectedIndex || walletActionInFlight || !byId("research-approval-check").checked) return;
    const preview = { ...researchPreview };
    const contextVersion = preview.contextVersion;
    researchPreview.intent = "";
    walletActionInFlight = true;
    const button = byId("confirm-paid-research");
    const result = byId("research-result");
    button.disabled = true;
    button.textContent = "正在签名 / 必要时授权…";
    result.hidden = false;
    result.textContent = preview.walletMode === "browser"
      ? "浏览器钱包会切换到已审阅付款选项的 EVM 网络，并逐笔弹出必要授权与 x402 签名；确认后才会重放原始请求。"
      : "Agentic Wallet 正在签名；若所选代币需要 Permit2，将自动提交一次性授权、等待确认，再重放原始请求。";
    setResearchStatus("", "真实付费请求处理中；每个付款预览只使用一次，请勿重复点击。");
    try {
      assertWalletContext(contextVersion);
      const browserMode = preview.walletMode === "browser";
      const browserSignature = browserMode
        ? await signBrowserX402(preview.paymentRequired, preview.selectedIndex, contextVersion)
        : null;
      assertWalletContext(contextVersion);
      const response = await fetch(browserMode ? "/api/bstock-alpha/browser-wallet/research/execute" : "/api/bstock-alpha/research/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
          ...(browserMode ? {
            address: preview.walletAddress,
            paymentProtocolVersion: browserSignature.paymentProtocolVersion,
            paymentHeaderName: browserSignature.paymentHeaderName,
            paymentHeaderValue: browserSignature.paymentHeaderValue,
            approveTxHash: browserSignature.approveTxHash || null
          } : {}),
          intent: preview.intent,
          selectedIndex: preview.selectedIndex,
          confirmation: "确认付费研究",
          acknowledged: true
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion) return;
      if (!response.ok) throw new Error(payload.error || "真实付费研究请求失败");
      if (handleStudioExistingTask(payload, true)) return;
      if (payload.provider === "cmc" && payload.status === "SUCCEEDED") {
        const ticker = selected.ticker || tickerByBstock[selected.symbol];
        setResearchStatus("ready", "CMC AI x402 请求已成功结算并返回结果。");
        result.textContent = `${payload.selectedAsset?.symbol || selected.symbol} / ${payload.selectedAsset?.ticker || ticker}\n${payload.countedTool || "CMC AI"}\n${payload.paymentTxHash ? `TX ${payload.paymentTxHash}\n` : ""}${payload.result?.text || JSON.stringify(payload.result, null, 2)}`.slice(0, 12_000);
        button.textContent = "调用已完成";
        byId("cmc-live-state").textContent = "X402 PAID";
        addLiveAudit("CMC x402 付费调用成功", payload.paymentTxHash || payload.approveTxHash || payload.countedTool, "X402");
        showToast("CMC AI 真实付费调用已完成。 ");
        refreshLiveSnapshot({ silent: true });
        return;
      }
      if (payload.provider === "studio" && payload.status === "ACCEPTED") {
        const pending = { jobId: payload.jobId, symbol: payload.symbol, createdAt: Date.now(), walletMode: preview.walletMode, walletAddress: preview.walletAddress };
        activeStudioJobId = payload.jobId;
        bstockStorage.persistStudioJob(pending);
        setResearchStatus("ready", "Agent Studio 已受理同一研报任务，正在后台轮询；不会重复付款。");
        result.textContent = `${payload.message || "研报正在生成。"}\njobId: ${payload.jobId}${payload.paymentTxHash ? `\nTX: ${payload.paymentTxHash}` : ""}`;
        button.textContent = "研报生成中";
        showToast("Agent Studio 研报已付款受理，页面将继续查询同一 jobId。 ");
        addLiveAudit("Agent Studio 研报已受理", payload.jobId, "RESEARCH");
        pollStudioJob(payload.jobId, 0, false);
      }
    } catch (error) {
      if (contextVersion !== walletContextVersion) return;
      setResearchStatus("error", error instanceof Error ? error.message : "真实付费研究请求失败");
      result.textContent = `${error instanceof Error ? error.message : "真实付费研究请求失败"}\n如付款签名可能已经发送，请先核对钱包记录，不要直接重复支付。`;
      button.textContent = "请重新预览后操作";
      showToast(error instanceof Error ? error.message : "真实付费研究请求失败", "error");
    } finally {
      walletActionInFlight = false;
    }
  }

  async function pollStudioJob(jobId, attempt = 0, recover = false) {
    clearTimeout(studioJobPollTimer);
    if (!walletOperational()) return;
    const contextVersion = walletContextVersion;
    activeStudioJobId = jobId;
    let nextRecover = recover;
    let retryAfterMs = 15_000;
    try {
      const response = await fetch("/api/bstock-alpha/research/job", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ jobId, recover, ...walletRequestContext() })
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion) return;
      if (!response.ok) throw new Error(payload.error || "Agent Studio 任务查询失败");
      retryAfterMs = Math.min(60_000, Math.max(5_000, Number(payload.retryAfterMs) || 15_000));
      nextRecover = false;
      if (payload.status === "succeeded") {
        if (!payload.reportMarkdown) throw new Error("Agent Studio 已完成分析，但研报文件尚未返回；将继续查询同一 jobId。");
        renderCompletedStudioReport(payload, Boolean(payload.reused));
        return;
      }
      if (["failed", "cancelled", "expired"].includes(payload.status)) {
        if (payload.retryable || payload.recoverable) {
          setResearchStatus("error", `${payload.error || "Agent Studio 任务暂时失败。"} 可点击“回捞最近研报”沿用原付款恢复。`);
          showToast("研报任务可恢复，已保留私密任务凭据；不会重复付费。", "error");
          return;
        }
        bstockStorage.clearStudioJob();
        activeStudioJobId = "";
        const failure = payload.error || `Agent Studio 任务 ${payload.status}。`;
        const result = byId("research-result");
        result.hidden = false;
        result.textContent = `${failure}\njobId: ${jobId}\n该任务已不可回捞。如需继续，请重新预览并明确确认新的付费请求。`;
        setResearchStatus("error", failure);
        byId("confirm-paid-research").textContent = "需重新预览并付费";
        showToast(failure, "error");
        return;
      }
      setResearchStatus("ready", `Agent Studio ${String(payload.upstreamStatus || payload.status || "queued").toUpperCase()} · 正在查询同一 jobId，不会重复付费。`);
    } catch (error) {
      if (contextVersion !== walletContextVersion) return;
      if (attempt >= 120) {
        setResearchStatus("error", "持续 30 分钟仍未获得最终状态；任务凭据已保留，可使用“回捞最近研报”继续查询。 ");
        return;
      }
    }
    if (contextVersion === walletContextVersion) studioJobPollTimer = setTimeout(() => pollStudioJob(jobId, attempt + 1, nextRecover), retryAfterMs);
  }

  async function recoverStudioReport() {
    if (walletActionInFlight) return showToast("正在处理已确认的钱包请求，请稍候。", "error");
    const contextVersion = walletContextVersion;
    const requestVersion = ++researchRequestVersion;
    if (!walletOperational()) {
      showToast("请先连接并验证 Agent 或浏览器钱包。", "error");
      openWalletDialog();
      return;
    }
    const button = byId("studio-recover-research");
    const dialog = byId("research-dialog");
    const ticker = selected.ticker || tickerByBstock[selected.symbol];
    button.disabled = true;
    button.textContent = "正在回捞…";
    researchPreview = null;
    byId("research-dialog-title").textContent = `${ticker}（${selected.symbol}）Agent Studio 研报回捞`;
    byId("research-purpose").textContent = "查询当前已验证钱包最近 24 小时的同标的任务";
    byId("research-payment-options").replaceChildren();
    byId("research-approval-check").checked = false;
    byId("confirm-paid-research").disabled = true;
    byId("confirm-paid-research").textContent = "无需再次付费";
    const result = byId("research-result");
    result.hidden = false;
    result.textContent = "正在查找原 jobId 与私密任务凭据；不会生成新的付款签名。";
    setResearchStatus("", "正在回捞当前钱包的最近研报任务。");
    if (!dialog.open) dialog.showModal();
    try {
      const response = await fetch("/api/bstock-alpha/research/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ symbol: selected.symbol, ...walletRequestContext() })
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion || requestVersion !== researchRequestVersion) return;
      if (!response.ok) {
        if (payload.terminal) {
          bstockStorage.clearStudioJob();
          activeStudioJobId = "";
          byId("confirm-paid-research").textContent = "需重新预览并付费";
          result.textContent = `${payload.error || "原付款任务已被 Agent Studio 终止。"}\njobId: ${payload.jobId || "—"}\n回捞未再次扣费；如需继续，请关闭窗口后重新预览并明确确认新的付费请求。`;
        }
        throw new Error(payload.error || "未找到可回捞研报");
      }
      if (!handleStudioExistingTask(payload, true)) throw new Error("研报回捞返回了无法识别的状态。");
      showToast(payload.status === "REUSED" ? "已回捞完成研报。" : "已找到原任务，正在继续回捞。 ");
    } catch (error) {
      if (contextVersion !== walletContextVersion || requestVersion !== researchRequestVersion) return;
      const message = error instanceof Error ? error.message : "研报回捞失败";
      setResearchStatus("error", message);
      if (!result.textContent.includes("jobId:")) result.textContent = message;
      showToast(message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "回捞最近研报";
    }
  }

  async function openHistoricalStudioReport(historyEntry, button) {
    const contextVersion = walletContextVersion;
    if (!walletOperational()) {
      showToast("请先连接并验证钱包，再查看研报历史。", "error");
      openWalletDialog();
      return;
    }
    const sourceSymbol = String(historyEntry?.symbol || "").toUpperCase();
    const bstockSymbol = assets[sourceSymbol] ? sourceSymbol : bstockByTicker[sourceSymbol];
    const asset = assets[bstockSymbol];
    if (!asset || !historyEntry?.reportId) {
      showToast("该历史研报缺少可验证的标的或记录编号。", "error");
      return;
    }
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "正在读取…";
    try {
      const response = await fetch("/api/bstock-alpha/research/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ symbol: asset.symbol, language: reportReaderLanguage, reportId: historyEntry.reportId, ...walletRequestContext() })
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion) return;
      if (!response.ok || !payload.reportReading) throw new Error(payload.error || "历史研报读取失败");
      const report = {
        ...historyEntry,
        reportId: payload.reportId || historyEntry.reportId,
        completedAt: payload.completedAt || historyEntry.completedAt,
        reportReading: payload.reportReading,
        reportReadings: { [payload.reportReading.language]: payload.reportReading }
      };
      openLocalizedStudioReportReader(report, asset);
      addLiveAudit("历史研报已打开", `${asset.symbol} · ${new Date(report.completedAt).toLocaleString("zh-CN", { hour12: false })}`, "RESEARCH");
    } catch (error) {
      if (contextVersion !== walletContextVersion) return;
      showToast(error instanceof Error ? error.message : "历史研报读取失败", "error");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }

  async function openStudioReportAppreciation() {
    if (walletActionInFlight) return showToast("正在处理已确认的钱包请求，请稍候。", "error");
    const contextVersion = walletContextVersion;
    const asset = selected;
    const cachedReport = studioReports[asset.symbol];
    if (cachedReport?.reportReading) {
      openLocalizedStudioReportReader(cachedReport, asset);
      return;
    }
    if (!walletOperational()) {
      showToast("请先连接并验证钱包，再回捞最新研报。", "error");
      openWalletDialog();
      return;
    }
    const button = byId("studio-report-appreciation");
    button.disabled = true;
    button.textContent = "正在解析最新研报…";
    try {
      const response = await fetch("/api/bstock-alpha/research/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ symbol: asset.symbol, ...walletRequestContext() })
      });
      const payload = await response.json().catch(() => ({}));
      if (contextVersion !== walletContextVersion) return;
      if (!response.ok) throw new Error(payload.error || "未找到可赏析的最新研报");
      if (payload.status === "REUSED") {
        const hydrated = hydrateCompletedStudioReport(payload);
        if (!hydrated.report?.reportReading) throw new Error("最新研报已回捞，但结构化解析结果为空。");
        openLocalizedStudioReportReader(hydrated.report, assets[hydrated.bstockSymbol] || asset);
        showToast(`${payload.symbol || asset.symbol} 最新研报已解析为阅读版。`);
        return;
      }
      if (payload.status === "RECOVERING") {
        pendingReportReaderSymbol = asset.symbol;
        const dialog = byId("research-dialog");
        const ticker = asset.ticker || tickerByBstock[asset.symbol];
        researchPreview = null;
        byId("research-dialog-title").textContent = `${ticker}（${asset.symbol}）Agent Studio 研报回捞`;
        byId("research-purpose").textContent = "沿用原付款任务，完成后自动打开 AI 研报赏析";
        byId("research-payment-options").replaceChildren();
        byId("research-approval-check").checked = false;
        byId("confirm-paid-research").disabled = true;
        byId("confirm-paid-research").textContent = "研报回捞中";
        if (!dialog.open) dialog.showModal();
        startStudioRecovery(payload, true);
        showToast("原研报仍在生成，完成回捞后将自动打开赏析。 ");
        return;
      }
      throw new Error("研报回捞返回了无法识别的状态。");
    } catch (error) {
      if (contextVersion !== walletContextVersion) return;
      const message = error instanceof Error ? error.message : "AI 研报赏析加载失败";
      showToast(message, "error");
    } finally {
      if (selected.symbol === asset.symbol) {
        button.textContent = "AI 研报赏析";
        button.disabled = !studioReports[asset.symbol];
      }
    }
  }

  function restoreStudioJob() {
    const pending = bstockStorage.readStudioJob();
    if (pending?.walletMode && pending.walletMode !== walletConnectionMode) return;
    if (pending?.walletAddress && walletAddress && pending.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) return;
    if (pending?.jobId && Date.now() - pending.createdAt < 24 * 60 * 60_000) pollStudioJob(pending.jobId, 0, false);
    else if (pending) bstockStorage.clearStudioJob();
  }

  function filterUniverse() {
    const query = byId("token-search").value.trim().toUpperCase();
    const activeFilter = document.querySelector("[data-universe-filter].active")?.dataset.universeFilter || "all";
    document.querySelector(".universe-panel")?.setAttribute("data-active-filter", activeFilter);
    byId("token-list")?.setAttribute("data-active-filter", activeFilter);
    selectors(".token-row").forEach((row) => {
      const symbol = row.dataset.symbol || "";
      const matchesQuery = !query || symbol.includes(query) || row.innerText.toUpperCase().includes(query);
      const matchesFilter = activeFilter === "all"
        || row.dataset.kind === activeFilter
        || (activeFilter === "weekly" && row.dataset.weekly === "true")
        || (activeFilter === "recommended" && row.dataset.recommended === "true")
        || (activeFilter === "watchlist" && watchlist.has(symbol));
      row.hidden = !(matchesQuery && matchesFilter);
    });
    const visibleCount = selectors(".token-row").filter((row) => !row.hidden).length;
    const empty = document.querySelector(".universe-filter-empty");
    if (empty) {
      empty.hidden = visibleCount > 0;
      empty.textContent = query
        ? "没有匹配的 bStock 标的。"
        : activeFilter === "weekly"
          ? (hiddenWeeklyOpportunities.size
            ? "周机会标的已被手动移除，可在列表底部恢复。"
            : "Binance 官方周机会目录当前没有可展示标的。")
          : "当前筛选项没有标的。";
    }
  }

  function exportLedger() {
    const realized = liveSnapshot?.tradingLedger?.realized || [];
    const rows = [["time", "symbol", "sold_quantity", "actual_sell_proceeds_usd", "fifo_actual_buy_cost_usd", "realized_pnl_usd", "status", "tx_hash"]];
    realized.forEach((entry) => rows.push([entry.completedAt || "", entry.symbol || "", entry.quantity ?? "", entry.saleProceedsUsd ?? "", entry.fifoCostUsd ?? "", entry.realizedPnlUsd ?? "", entry.status || "", entry.txHash || ""]));
    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bstock-alpha-realized-pnl.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    showToast(realized.length ? `已导出 ${realized.length} 条真实 FIFO PnL 明细。` : "当前没有可验证的真实 FIFO PnL 明细；已导出空表头。 ");
  }

  function readDisplayPreference(key, fallback) {
    try {
      return localStorage.getItem(key) || fallback;
    } catch {
      return fallback;
    }
  }

  function persistDisplayPreference(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Embedded and privacy-restricted browsers may deny storage. The current
      // session still updates immediately, so display controls remain usable.
    }
  }

  function renderPreferenceControls(theme, language) {
    const english = language === "en";
    const themeButton = document.querySelector(".theme-toggle");
    const languageButton = document.querySelector(".lang-toggle");
    const currentTheme = theme === "light"
      ? (english ? "Light" : "浅色")
      : (english ? "Dark" : "深色");
    const nextTheme = theme === "light"
      ? (english ? "Dark" : "深色")
      : (english ? "Light" : "浅色");

    if (themeButton) {
      themeButton.dataset.current = theme;
      const label = themeButton.querySelector(".preference-label");
      if (label) label.textContent = currentTheme;
      const action = english
        ? `Currently ${currentTheme}; switch to ${nextTheme} mode`
        : `当前${currentTheme}，切换为${nextTheme}模式`;
      themeButton.setAttribute("aria-label", action);
      themeButton.title = action;
    }

    if (languageButton) {
      languageButton.dataset.current = language;
      const label = languageButton.querySelector(".preference-label");
      if (label) label.textContent = english ? "EN" : "中文";
      const action = english ? "Currently English; switch to 中文" : "当前中文，切换为 English";
      languageButton.setAttribute("aria-label", action);
      languageButton.title = action;
    }
  }

  function initializePreferences() {
    const savedTheme = readDisplayPreference("welinkbtc-theme", "dark") === "light" ? "light" : "dark";
    const savedLanguage = readDisplayPreference("welinkbtc-language", "zh") === "en" ? "en" : "zh";
    document.body.dataset.theme = savedTheme;
    document.documentElement.dataset.theme = savedTheme;
    document.documentElement.style.colorScheme = savedTheme;
    document.documentElement.lang = savedLanguage === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.language = savedLanguage;
    byId("connect-wallet").setAttribute("aria-label", "连接 Agentic Wallet");
    uiTranslator?.setLanguage(savedLanguage);
    renderPreferenceControls(savedTheme, savedLanguage);
  }

  selectors("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  selectors("[data-side]").forEach((button) => button.addEventListener("click", () => setTradeSide(button.dataset.side)));
  selectors("[data-buy-amount]").forEach((button) => button.addEventListener("click", () => {
    if (tradeSide === "sell") {
      const amount = decimalRatio(exactHeldAmount(), Number(button.dataset.sellRatio));
      if (!amount || Number(amount) <= 0) {
        showToast(`${selected.symbol} 没有可卖出的真实持仓。`, "error");
        return;
      }
      byId("order-amount").value = amount;
    } else {
      byId("order-amount").value = button.dataset.buyAmount;
    }
    rememberTradeAmount();
    selectors("[data-buy-amount]").forEach((item) => item.classList.toggle("active", item === button));
    resetTradeQuote();
    updateEstimate();
    updateRiskState();
  }));
  selectors(".chart-periods button").forEach((button) => button.addEventListener("click", () => {
    selectors(".chart-periods button").forEach((item) => item.classList.toggle("active", item === button));
    chartInterval = ({ "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w" })[button.textContent] || "4h";
    refreshMarketHistory(selected.symbol, chartInterval);
  }));
  selectors("[data-universe-filter]").forEach((button) => button.addEventListener("click", () => {
    selectors("[data-universe-filter]").forEach((item) => item.classList.toggle("active", item === button));
    filterUniverse();
  }));
  byId("restore-weekly-opportunities")?.addEventListener("click", () => {
    hiddenWeeklyOpportunities.clear();
    persistHiddenWeeklyOpportunities();
    renderUniverse();
    showToast("已恢复全部周机会标的。");
  });
  selectors("[data-ledger-tab]").forEach((button) => button.addEventListener("click", () => {
    selectors("[data-ledger-tab]").forEach((item) => item.classList.toggle("active", item === button));
    selectors("[data-ledger-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.ledgerPanel === button.dataset.ledgerTab));
  }));
  selectors("[data-close-symbol]").forEach((button) => button.addEventListener("click", () => {
    setAsset(assets[button.dataset.closeSymbol]);
    setTradeSide("sell");
    byId("order-amount").value = exactHeldAmount();
    rememberTradeAmount();
    syncTradeAmountControls();
    resetTradeQuote();
    updateEstimate();
    updateRiskState();
    document.querySelector(".order-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`${button.dataset.closeSymbol} 退出计划已载入交易执行面板。`);
  }));

  byId("order-amount").addEventListener("input", () => { rememberTradeAmount(); syncTradeAmountControls(); resetTradeQuote(); updateEstimate(); updateRiskState(); });
  byId("slippage").addEventListener("input", () => { resetTradeQuote(); updateRiskState(); });
  byId("pay-token").addEventListener("change", () => { syncTradeAmountControls(); resetTradeQuote(); updateEstimate(); updateRiskState(); });
  byId("token-search").addEventListener("input", filterUniverse);
  byId("connect-wallet").addEventListener("click", openWalletDialog);
  byId("connect-injected-wallet").addEventListener("click", connectInjectedWallet);
  const injectedProvider = provider();
  if (injectedProvider?.on) {
    injectedProvider.on("accountsChanged", (accounts) => {
      if (walletConnectionMode !== "browser") return;
      const stillSelected = Array.isArray(accounts) && accounts.some((account) => String(account).toLowerCase() === walletAddress.toLowerCase());
      if (!stillSelected) {
        renderDisconnectedAgentSession();
        showToast("浏览器钱包账户已切换；请重新连接并验证所有权。", "error");
      }
    });
    injectedProvider.on("chainChanged", (chainId) => {
      if (walletConnectionMode !== "browser") return;
      resetTradeQuote();
      byId("execution-state").innerHTML = '<i class="state-dot is-online"></i>WALLET READY';
      byId("wallet-risk").className = browserWalletVerified ? "pass" : "pending";
      byId("wallet-risk").querySelector("strong").textContent = browserWalletVerified ? "EVM VERIFIED" : "待登录绑定";
      updateRiskState();
      showToast(`钱包已切换至 chainId ${Number.parseInt(String(chainId), 16)}；研究付款按所选网络执行，bStock 交易提交时自动切回 BNB Chain。`);
    });
  }
  selectors("[data-wallet-method]").forEach((button) => button.addEventListener("click", () => selectWalletMethod(button.dataset.walletMethod)));
  byId("request-agent-login").addEventListener("click", requestAgentLogin);
  selectors(".agent-safety-check").forEach((check) => check.addEventListener("change", updateAgentConfirmState));
  byId("confirm-agent-login").addEventListener("click", () => verifyAgentLogin({ manual: true }));
  byId("review-order").addEventListener("click", openReviewDialog);
  byId("approval-check").addEventListener("change", updateTradeApprovalButton);
  byId("eligibility-approval-check").addEventListener("change", updateTradeApprovalButton);
  byId("confirm-intent").addEventListener("click", confirmIntent);
  byId("cmc-paid-research").addEventListener("click", () => openPaidResearch("cmc"));
  byId("studio-paid-research").addEventListener("click", () => openPaidResearch("studio"));
  byId("studio-recover-research").addEventListener("click", recoverStudioReport);
  byId("studio-report-appreciation").addEventListener("click", openStudioReportAppreciation);
  selectors("[data-report-language]").forEach((button) => button.addEventListener("click", () => loadStudioReportLanguage(button.dataset.reportLanguage)));
  byId("share-studio-report").addEventListener("click", createStudioReportShare);
  byId("research-approval-check").addEventListener("change", updateResearchApproval);
  byId("confirm-paid-research").addEventListener("click", executePaidResearch);
  byId("retry-research-preview").addEventListener("click", retryPaidResearchPreview);
  byId("research-dialog").addEventListener("close", () => {
    researchRequestVersion += 1;
    researchPreviewRequest?.abort();
    researchPreviewRequest = undefined;
    researchPreviewRetry = null;
    byId("retry-research-preview").hidden = true;
  });
  byId("show-eligibility").addEventListener("click", () => byId("info-dialog").showModal());
  byId("inspect-decision").addEventListener("click", () => byId("info-dialog").showModal());
  byId("export-ledger").addEventListener("click", exportLedger);
  byId("refresh-universe").addEventListener("click", async (event) => {
    event.currentTarget.classList.add("loading");
    await refreshMarketSnapshot({ silent: false });
    if (walletOperational()) await refreshLiveSnapshot({ silent: true });
    event.currentTarget.classList.remove("loading");
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !byId("review-order").disabled) openReviewDialog();
  });
  document.querySelector(".theme-toggle").addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    document.body.dataset.theme = next;
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    persistDisplayPreference("welinkbtc-theme", next);
    const currentLanguage = document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "zh";
    renderPreferenceControls(next, currentLanguage);
  });
  document.querySelector(".lang-toggle").addEventListener("click", () => {
    const next = document.documentElement.lang.toLowerCase().startsWith("en") ? "zh" : "en";
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.language = next;
    persistDisplayPreference("welinkbtc-language", next);
    uiTranslator?.setLanguage(next);
    const currentTheme = document.body.dataset.theme === "light" ? "light" : "dark";
    renderPreferenceControls(currentTheme, next);
    showToast(next === "en" ? "The bStockAlpha workspace is now displayed in English." : "界面语言已切换为中文。 ");
  });

  initializePreferences();
  loadBstockLocalization();
  const cachedPublicData = readPublicDataCache();
  if (cachedPublicData) applyLiveSnapshot(cachedPublicData);
  else setAsset(selected);
  refreshMarketSnapshot();
  restoreAgentSession();
})();
