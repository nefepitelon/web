(() => {
  "use strict";
  const root = document.getElementById("bstock-autotrade");
  if (!root) return;
  const byId = (id) => document.getElementById(`autotrade-${id}`);
  const endpoint = "/api/bstock-alpha/automation";
  const form = byId("settings");
  const defaults = { strategy: "adaptive", budgetUsd: 100, orderUsd: 20, maxPositions: 3, stopLossPct: 3, takeProfitPct: 6, maxDrawdownPct: 10, dailyLossPct: 5, intervalSeconds: 60 };
  const strings = {
    zh: {
      title: "自动交易", subtitle: "从 bStock 机会池筛选标的，按策略与预算持续执行。", strategyLabel: "当前策略", adaptive: "自适应策略", trend: "趋势跟随", mean_reversion: "均值回归",
      selectStep: "选标的", riskStep: "核对风控", executeStep: "执行与对账", budget: "资金预算", realized: "策略已实现 PnL", positions: "策略持仓", confirmedOnly: "仅确认成交 · 不含 Gas",
      idleSummary: "启用后由后台持续运行，关闭页面也会继续。", configure: "策略与预算", scan: "仅扫描机会", refresh: "刷新", collapse: "收起",
      ignoreAll: "全部忽略", ignoreOne: "已核对忽略", ignoreAllTitle: "忽略本批 {count} 条历史拦截", ignoreOneTitle: "忽略这条已核对的历史拦截", ignoreWarning: "忽略不会撤单、不会将订单标为成交，也不会删除原记录；原订单仍可能执行。此操作仅解除已选历史记录的启动拦截，不自动启用交易，新订单不受影响。", ignoreAcknowledgement: "我已自行核对钱包订单及链上记录，并理解原订单仍可能执行。", ignoreConfirm: "确认忽略", ignoreCancel: "取消", ignoring: "正在保存忽略记录…", ignoreChanged: "订单列表或状态已更新。请取消后重新选择要忽略的记录。", ignoreRefresh: "请刷新以获取当前记录版本。", ignoreDone: "已忽略 {count} 条历史记录的启动拦截。设置已保留；请重新确认授权后再开启自动交易。", ignoreAlready: "这些历史记录的拦截已被忽略。自动交易未开启，请重新确认授权后再操作。",
      ignoreEligible: "可核对忽略 {count} 条历史订单", ignoreQuoteWait: "报价不能忽略，仍需等待报价有效期结束后再核对。", ignoreBatchLimit: "待核对记录超过 1,000 条，批量忽略不可用；请逐条核对历史订单。", ignoreNotEligible: "此记录暂不能忽略，请先核对最新状态。",
      reconcile: "核对历史订单", reconciling: "正在核对历史订单…", checkingStart: "核对历史订单并检查授权…", blockersTitle: "待核对的手动订单", blockersDescription: "以下订单或有效报价仍会阻止开启自动交易。核对只查询历史与回执，不会下单或启动机器人。", blockerCount: "共 {count} 条", blockersMore: "仅展示前 10 条，其余记录会一并核对。", blockerCreated: "创建时间", quoteValidUntil: "报价有效至", quoteAwaitingCheck: "报价已过期，等待后台核对", blocker_SUBMITTED: "已提交，待核对", blocker_PENDING: "等待成交回执", blocker_SUBMITTING: "提交中", blocker_SUBMISSION_UNKNOWN: "提交结果未知", blocker_INTENT_CREATED: "报价待确认", blocker_UNKNOWN: "结果待核对", reconcileDone: "已核对 {reconciled} 条记录，仍有 {remaining} 条待处理。自动交易未开启。", reconcileLookupFailed: "部分历史或回执暂时无法读取，未知订单仍保留待核对状态。", noOrderId: "尚无钱包订单号",
      settingsTitle: "设置本次自动交易", settingsNote: "按实时价格使用 USDT 买入；预算仅用于本策略持仓，不自动卖出原有资产。", budgetUsd: "最大投入（USD）", orderUsd: "每笔买入（USD）", maxPositions: "最多持仓数", stopLossPct: "单笔止损（%）", takeProfitPct: "单笔止盈（%）", maxDrawdownPct: "回撤减仓暂停（%）", dailyLossPct: "日亏减仓暂停（%）", intervalSeconds: "扫描间隔（秒）",
      acknowledgement: "我授权机器人在以上预算和风控范围内，通过当前 Agentic Wallet 会话自动提交真实买卖订单。", start: "确认并开启", activeSettings: "运行中设置已锁定。关闭开关停止后，可调整预算并重新开启。",
      researchNote: "自动从已有有效研报的机会池标的中筛选；无合格信号时等待。",
      disclosure: "策略不保证盈利或资金翻倍。止损由后台定时检查，成交可能产生滑点；达到亏损上限后尝试退出策略持仓并暂停。手动关闭只停止后续自动下单，不自动清仓。每次授权最长 24 小时，钱包会话更早到期则提前暂停。风控权益计入 Gas，展示 PnL 不含 Gas。",
      traceTitle: "策略与订单追踪", traceNote: "导出包含完整事件历史与最近 1,000 笔订单；更早订单凭证保留在事件中。", export: "导出记录 ↓", empty: "暂无策略记录。开启或扫描后，将显示真实决策与执行结果。",
      syncing: "同步中", off: "未开启", running: "后台运行中", waiting: "等待合格信号", reducing: "风控退出中", paused: "已暂停", expired: "授权已到期", error: "需要处理", stopped: "已停止", connecting: "正在读取后台状态…", unavailable: "连接暂不可用", starting: "正在开启…", stopping: "正在停止…", scanning: "正在扫描…", exporting: "正在导出…",
      agentic: "Agentic Wallet 已连接。后台会在已授权预算内自动买卖，并记录每次决策。", browser: "当前为浏览器钱包：后台无法代替扩展钱包签名。请使用 Agentic Wallet 扫码登录开启自动交易；浏览器钱包仍可手动交易。", disconnected: "连接 Agentic Wallet 并完成扫码登录后，可开启后台自动交易。", noGuarantee: "尚无已确认的策略成交", toggleOn: "开启自动交易", toggleOff: "停止自动交易", perOrder: "每笔买入", lastScan: "最近检查", noScan: "等待首次检查", run: "运行批次", until: "授权到期", lastError: "后台提示", lastSelected: "最近标的", eventId: "事件编号", orderId: "订单号", transaction: "链上凭证", strategy: "策略", eventReason: "决策原因", noReason: "查看记录详情", sideBuy: "买入", sideSell: "卖出", scanDone: "机会扫描已完成，本次扫描不会下单。", startDone: "自动交易已开启。后台将持续筛选标的、检查风控并执行订单。", stopDone: "自动交易已停止，后续不会自动下单。已广播订单仍会对账；已有持仓不会自动清仓。", unknownAction: "请求结果尚未确认，正在重新读取后台状态。请勿连续重复操作。", requestFailed: "暂时无法读取自动交易状态，请刷新重试。", orderLimit: "每笔买入不能超过资金预算的 25%。", profitLimit: "止盈比例至少为止损比例的 1.5 倍。", exportFailed: "记录导出失败，请稍后重试。", moreEvents: "显示最近 {count} 条，完整记录可导出。",
      adaptiveHelp: "根据行情特征选择趋势跟随或均值回归。每次买入需通过机会池、研究、流动性和仓位检查；每笔投入不超过预算的 25%。", trendHelp: "在趋势与研究信号满足条件时参与上涨，按止盈、止损和退出信号管理仓位。", mean_reversionHelp: "在价格偏离近期均值并满足研究和流动性条件时分批参与，回归目标或触及止损后退出。",
      event_STARTED: "策略开启", event_STOPPED: "策略停止", event_SCAN: "机会扫描", event_DECISION: "策略决策", event_SKIPPED: "暂不交易", event_ORDER: "订单提交", event_CONFIRMED: "成交确认", event_RECONCILED: "订单对账", event_ERROR: "执行异常", event_PAUSED: "策略暂停", event_RISK: "风控检查", event_EXPIRED: "授权到期", event_QUOTE: "订单报价", event_SUBMITTED: "订单已广播", event_FILLED: "已确认成交", event_WAIT: "等待信号", event_UNKNOWN: "等待核对结果", event_ORDER_FAILED: "订单失败"
    },
    en: {
      title: "Auto Trading", subtitle: "Select bStock opportunities and trade within your strategy and budget.", strategyLabel: "Active strategy", adaptive: "Adaptive strategy", trend: "Trend following", mean_reversion: "Mean reversion",
      selectStep: "Select assets", riskStep: "Check risk", executeStep: "Execute & reconcile", budget: "Capital budget", realized: "Strategy realized PnL", positions: "Strategy positions", confirmedOnly: "Confirmed fills · gas excluded",
      idleSummary: "Once enabled, the bot keeps running in the background when you close this page.", configure: "Strategy & budget", scan: "Scan only", refresh: "Refresh", collapse: "Collapse",
      ignoreAll: "Ignore all", ignoreOne: "Reviewed · Ignore", ignoreAllTitle: "Ignore this batch of {count} historical blockers", ignoreOneTitle: "Ignore this reviewed historical blocker", ignoreWarning: "Ignoring does not cancel an order, mark it filled or delete its record. The original order may still execute. This only removes the selected historical records from the start gate; it does not enable trading or affect new orders.", ignoreAcknowledgement: "I have checked the wallet orders and on-chain records myself and understand the original orders may still execute.", ignoreConfirm: "Confirm ignore", ignoreCancel: "Cancel", ignoring: "Saving reviewed exclusions…", ignoreChanged: "The order list or status has changed. Cancel and select the records again.", ignoreRefresh: "Refresh to load the current record version.", ignoreDone: "Removed {count} historical records from the start gate. Settings are preserved; review and authorize again before enabling auto trading.", ignoreAlready: "These historical blockers were already ignored. Auto trading was not started; review and authorize again to proceed.",
      ignoreEligible: "{count} historical orders eligible for reviewed exclusion", ignoreQuoteWait: "Quotes cannot be ignored. Wait for the quote to expire, then reconcile again.", ignoreBatchLimit: "More than 1,000 records need review, so batch exclusion is unavailable. Review historical orders individually.", ignoreNotEligible: "This record cannot be ignored yet. Reconcile its current status first.",
      reconcile: "Reconcile past orders", reconciling: "Reconciling past orders…", checkingStart: "Checking order history and authorization…", blockersTitle: "Manual orders awaiting reconciliation", blockersDescription: "These orders or active quotes still block auto trading. Reconciliation only reads history and receipts; it does not trade or start the bot.", blockerCount: "{count} total", blockersMore: "Showing the first 10. All remaining records are included in reconciliation.", blockerCreated: "Created", quoteValidUntil: "Quote valid until", quoteAwaitingCheck: "Quote expired; awaiting verification", blocker_SUBMITTED: "Submitted; awaiting verification", blocker_PENDING: "Awaiting execution receipt", blocker_SUBMITTING: "Submitting", blocker_SUBMISSION_UNKNOWN: "Submission outcome unknown", blocker_INTENT_CREATED: "Quote awaiting confirmation", blocker_UNKNOWN: "Outcome awaiting verification", reconcileDone: "Reconciled {reconciled} records; {remaining} still need attention. Auto trading was not started.", reconcileLookupFailed: "Some history or receipts could not be read. Unknown orders remain pending verification.", noOrderId: "No wallet order ID yet",
      settingsTitle: "Configure this trading run", settingsNote: "Buys use USDT at its live price. The budget covers bot-owned positions; existing assets are not sold automatically.", budgetUsd: "Capital limit (USD)", orderUsd: "Buy size (USD)", maxPositions: "Max positions", stopLossPct: "Stop loss (%)", takeProfitPct: "Take profit (%)", maxDrawdownPct: "Drawdown exit (%)", dailyLossPct: "Daily loss exit (%)", intervalSeconds: "Scan interval (sec)",
      acknowledgement: "I authorize the bot to submit real buy and sell orders through my current Agentic Wallet session within this budget and these risk limits.", start: "Confirm & enable", activeSettings: "Settings are locked while running. Turn the switch off before editing and restarting.",
      researchNote: "Selects opportunity-pool assets with valid existing research reports. Waits when no signal qualifies.",
      disclosure: "No strategy guarantees profit or doubling your funds. Stops are checked on a schedule and fills may slip. Loss limits trigger attempted exits of bot positions, then a pause. Manually turning off stops future orders without closing positions. Authorization lasts up to 24 hours, or until the wallet session expires sooner. Risk equity includes gas; displayed PnL excludes gas.",
      traceTitle: "Strategy & order history", traceNote: "Exports include all events and the latest 1,000 orders. Earlier order evidence remains in the event history.", export: "Export history ↓", empty: "No strategy events yet. Enable trading or run a scan to see real decisions and execution results.",
      syncing: "Syncing", off: "Not enabled", running: "Running in background", waiting: "Awaiting eligible signals", reducing: "Exiting for risk limits", paused: "Paused", expired: "Authorization expired", error: "Needs attention", stopped: "Stopped", connecting: "Reading background status…", unavailable: "Connection unavailable", starting: "Enabling…", stopping: "Stopping…", scanning: "Scanning…", exporting: "Exporting…",
      agentic: "Agentic Wallet is connected. The bot can trade within your authorized budget and records every decision.", browser: "Browser wallets cannot sign unattended. Connect with Agentic Wallet QR login to enable background trading. Your browser wallet remains available for manual trades.", disconnected: "Connect and complete Agentic Wallet QR login to enable background trading.", noGuarantee: "No confirmed strategy fills yet", toggleOn: "Enable auto trading", toggleOff: "Stop auto trading", perOrder: "Per buy", lastScan: "Last check", noScan: "Awaiting first check", run: "Run", until: "Authorization expires", lastError: "Background status", lastSelected: "Latest asset", eventId: "Event ID", orderId: "Order ID", transaction: "On-chain receipt", strategy: "Strategy", eventReason: "Decision reason", noReason: "View event details", sideBuy: "Buy", sideSell: "Sell", scanDone: "Opportunity scan complete. This scan does not place orders.", startDone: "Auto trading is enabled. The bot will select assets, check risk limits and execute in the background.", stopDone: "Auto trading is stopped. Broadcast orders will still be reconciled; existing positions are not automatically closed.", unknownAction: "The request result is not yet confirmed. Refreshing background status; avoid repeating the action.", requestFailed: "Auto trading status is temporarily unavailable. Please refresh.", orderLimit: "Each buy must be no more than 25% of the capital budget.", profitLimit: "Take profit must be at least 1.5 times the stop loss.", exportFailed: "History export failed. Please try again later.", moreEvents: "Showing the latest {count} events. Export for the full record.",
      adaptiveHelp: "Selects trend following or mean reversion from market conditions. Every buy must pass asset eligibility, research, liquidity and position checks. Each buy is limited to 25% of the budget.", trendHelp: "Enters when trend and research signals meet the rules, with take-profit, stop-loss and exit-signal checks.", mean_reversionHelp: "Enters after a deviation from recent average prices when research and liquidity checks pass; exits on recovery targets or stop-loss conditions.",
      event_STARTED: "Strategy enabled", event_STOPPED: "Strategy stopped", event_SCAN: "Opportunity scan", event_DECISION: "Strategy decision", event_SKIPPED: "Trade skipped", event_ORDER: "Order submitted", event_CONFIRMED: "Fill confirmed", event_RECONCILED: "Order reconciled", event_ERROR: "Execution error", event_PAUSED: "Strategy paused", event_RISK: "Risk check", event_EXPIRED: "Authorization expired", event_QUOTE: "Order quote", event_SUBMITTED: "Order broadcast", event_FILLED: "Fill confirmed", event_WAIT: "Awaiting signal", event_UNKNOWN: "Awaiting reconciliation", event_ORDER_FAILED: "Order failed"
    }
  };
  let language = document.documentElement.dataset.language === "en" ? "en" : "zh";
  let snapshot = null;
  let loaded = false;
  let connectionFailed = false;
  let busy = "";
  let request = null;
  let requestId = 0;
  let eventKey = "";
  let message = null;
  let walletContextKey = "";
  let walletContextVersion = 0;
  let ignoreConfirmation = null;
  let manualBlockersKey = "";
  const t = (key) => strings[language][key] || key;
  const cleanText = (value, max = 500) => String(value ?? "").replace(/0x[a-fA-F0-9]{128,}/g, "[redacted]").slice(0, max);
  const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const money = (value) => finite(value) ? new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value)) : "—";
  const date = (value) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed) : "—";
  };
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = cleanText(value, 8192);
    return element;
  };
  const enabled = () => snapshot?.config?.enabled === true;
  function walletContext() {
    try { return window.BstockAutoWalletContext?.getState?.() || {}; } catch { return {}; }
  }
  function currentWalletKey() {
    const context = walletContext();
    return `${context.mode || ""}:${String(context.address || "").toLowerCase()}`;
  }
  function apiUrl(exporting = false) {
    const context = walletContext();
    const query = new URLSearchParams();
    query.set("provider", context.mode === "agent" || context.mode === "browser" ? context.mode : "disconnected");
    if (context.mode === "browser" && /^0x[a-fA-F0-9]{40}$/.test(String(context.address || ""))) query.set("address", context.address);
    if (exporting) query.set("export", "1");
    return `${endpoint}${query.size ? `?${query}` : ""}`;
  }
  function syncWalletContext() {
    const next = currentWalletKey();
    if (next === walletContextKey) return;
    walletContextKey = next;
    walletContextVersion += 1;
    snapshot = null;
    loaded = false;
    connectionFailed = false;
    message = null;
    ignoreConfirmation = null;
    byId("acknowledged").checked = false;
    closeSettings();
    render();
  }

  function showMessage(key, kind = "error", raw = "", values = null, detailKey = "") {
    message = key || raw ? { key, kind, raw, values, detailKey } : null;
    renderMessage();
  }
  function renderMessage() {
    const output = byId("message");
    output.hidden = !message;
    output.dataset.kind = message?.kind || "error";
    let text = message ? (message.raw ? cleanText(message.raw) : t(message.key)) : "";
    for (const [key, value] of Object.entries(message?.values || {})) text = text.replaceAll(`{${key}}`, cleanText(value, 20));
    if (message?.detailKey) text += ` ${t(message.detailKey)}`;
    output.textContent = text;
  }
  function statusKey() {
    if (connectionFailed) return "unavailable";
    if (!loaded) return "syncing";
    const status = String(snapshot?.config?.status || "").toLowerCase();
    const known = { starting: "starting", waiting: "waiting", risk_exiting: "reducing", risk_stopped: "paused", session_invalid: "expired", settings_invalid: "error", reconciliation_required: "error" };
    if (known[status]) return known[status];
    if (/expir/.test(status)) return "expired";
    if (/error|fail/.test(status)) return "error";
    if (/paus|halt|circuit/.test(status)) return "paused";
    if (enabled()) return "running";
    return snapshot?.config ? "stopped" : "off";
  }
  function renderControls() {
    const active = enabled();
    const toggle = byId("toggle");
    toggle.setAttribute("aria-checked", String(active));
    toggle.setAttribute("aria-label", t(active ? "toggleOff" : "toggleOn"));
    toggle.disabled = Boolean(busy) || !loaded || (connectionFailed && !active);
    const currentStatus = busy === "start" ? "starting" : busy === "stop" ? "stopping" : statusKey();
    byId("status").textContent = t(currentStatus);
    byId("status").dataset.state = currentStatus === "unavailable" ? "error" : currentStatus;
    byId("configure").disabled = Boolean(busy);
    byId("scan").disabled = Boolean(busy) || !loaded || connectionFailed || snapshot?.capability !== "agentic";
    byId("scan").textContent = t(busy === "scan" ? "scanning" : "scan");
    byId("reconcile").hidden = snapshot?.capability !== "agentic";
    byId("reconcile").disabled = Boolean(busy) || !loaded || connectionFailed || snapshot?.capability !== "agentic";
    byId("reconcile").textContent = t(busy === "reconcile" ? "reconciling" : "reconcile");
    byId("refresh").disabled = Boolean(busy);
    byId("export").disabled = Boolean(busy) || !loaded || !snapshot?.events?.length;
    byId("export").textContent = t(busy === "export" ? "exporting" : "export");
    for (const field of form.querySelectorAll("input[name], select[name]")) field.disabled = active || Boolean(busy);
    byId("acknowledged").disabled = active || Boolean(busy) || snapshot?.capability !== "agentic";
    byId("start").disabled = Boolean(busy) || Boolean(ignoreConfirmation) || active || !loaded || connectionFailed || snapshot?.capability !== "agentic" || !byId("acknowledged").checked;
    byId("start").textContent = t(busy === "start" ? "checkingStart" : "start");
    byId("active-note").hidden = !active;
    renderIgnoreControls();
  }
  function renderStrategyHelp() {
    byId("strategy-help").textContent = t(`${form.elements.strategy.value}Help`);
  }
  function mountManualReconciliation() {
    const button = node("button", "autotrade-button");
    button.id = "autotrade-reconcile";
    button.type = "button";
    button.hidden = true;
    button.disabled = true;
    button.addEventListener("click", () => { if (snapshot?.capability === "agentic") void perform("reconcile"); });
    byId("refresh").before(button);
    const card = node("section", "autotrade-blockers");
    card.id = "autotrade-blockers";
    card.hidden = true;
    card.setAttribute("aria-labelledby", "autotrade-blockers-title");
    form.before(card);
  }
  const validReviewVersion = (value) => typeof value === "string" && value.length > 0 && value.length <= 1024;
  const canIgnoreRecord = (item) => item?.canIgnore === true && String(item?.status || "").toUpperCase() !== "INTENT_CREATED";
  const ignoreCount = () => finite(snapshot?.manualIgnoreCount) ? Math.max(0, Math.floor(Number(snapshot.manualIgnoreCount))) : 0;
  const canIgnoreBatch = () => snapshot?.manualIgnoreAllAvailable === true && ignoreCount() > 0 && ignoreCount() <= 1000 && validReviewVersion(snapshot?.manualReviewVersion);
  function ignoreSelectionCurrent() {
    if (!ignoreConfirmation || ignoreConfirmation.walletKey !== currentWalletKey() || ignoreConfirmation.walletVersion !== walletContextVersion) return false;
    if (ignoreConfirmation.scope === "all") return canIgnoreBatch() && snapshot?.manualReviewVersion === ignoreConfirmation.reviewVersion && ignoreCount() === ignoreConfirmation.count;
    return snapshot?.manualBlockers?.some(item => canIgnoreRecord(item) && item.id === ignoreConfirmation.recordId && item.reviewVersion === ignoreConfirmation.reviewVersion) === true;
  }
  function renderIgnoreControls() {
    const allowed = snapshot?.capability === "agentic" && loaded && !connectionFailed && !busy;
    for (const button of root.querySelectorAll(".autotrade-ignore-action")) button.disabled = !allowed || Boolean(ignoreConfirmation) || button.dataset.reviewReady !== "true";
    const check = byId("ignore-acknowledged");
    const confirm = byId("ignore-confirm");
    const cancel = byId("ignore-cancel");
    if (check) check.disabled = !allowed || !ignoreSelectionCurrent();
    if (confirm) { confirm.disabled = !allowed || !ignoreConfirmation?.acknowledged || !ignoreSelectionCurrent(); confirm.textContent = t(busy === "ignore-manual" ? "ignoring" : "ignoreConfirm"); }
    if (cancel) cancel.disabled = Boolean(busy);
  }
  function openIgnoreConfirmation(scope, item = null) {
    if (busy || ignoreConfirmation || !loaded || connectionFailed || snapshot?.capability !== "agentic") return;
    const reviewVersion = scope === "all" ? snapshot.manualReviewVersion : item?.reviewVersion;
    if (!validReviewVersion(reviewVersion) || (scope === "all" ? !canIgnoreBatch() : !canIgnoreRecord(item) || !item?.id)) return;
    ignoreConfirmation = { scope, reviewVersion, recordId: item?.id || null, symbol: item?.symbol || "", orderId: item?.orderId || "",
      count: scope === "all" ? ignoreCount() : 1,
      walletKey: currentWalletKey(), walletVersion: walletContextVersion, acknowledged: false };
    renderManualBlockers();
    renderControls();
    byId("ignore-confirmation")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    byId("ignore-acknowledged")?.focus({ preventScroll: true });
  }
  function closeIgnoreConfirmation() {
    if (busy) return;
    ignoreConfirmation = null;
    renderManualBlockers();
    renderControls();
    byId("reconcile")?.focus({ preventScroll: true });
  }
  function createIgnoreConfirmation() {
    if (!ignoreConfirmation) return null;
    const selected = ignoreConfirmation;
    const panel = node("div", "autotrade-ignore-confirmation");
    panel.id = "autotrade-ignore-confirmation";
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-labelledby", "autotrade-ignore-title");
    panel.setAttribute("aria-describedby", "autotrade-ignore-warning");
    const title = node("h4", "", t(selected.scope === "all" ? "ignoreAllTitle" : "ignoreOneTitle").replace("{count}", String(selected.count)));
    title.id = "autotrade-ignore-title";
    const warning = node("p", "", t("ignoreWarning"));
    warning.id = "autotrade-ignore-warning";
    panel.append(title);
    if (selected.scope === "one") panel.append(node("p", "autotrade-ignore-target", [selected.symbol, selected.orderId || selected.recordId].filter(Boolean).join(" · ")));
    panel.append(warning);
    if (selected.scope === "all" && Number(snapshot?.manualBlockerCount) > selected.count) panel.append(node("p", "autotrade-ignore-quote-note", t("ignoreQuoteWait")));
    if (!ignoreSelectionCurrent()) panel.append(node("p", "autotrade-ignore-changed", t("ignoreChanged")));
    const label = node("label", "autotrade-ignore-acknowledgement");
    const checkbox = node("input");
    checkbox.id = "autotrade-ignore-acknowledged";
    checkbox.type = "checkbox";
    checkbox.checked = selected.acknowledged;
    checkbox.addEventListener("change", () => { if (ignoreConfirmation === selected) { selected.acknowledged = checkbox.checked; renderIgnoreControls(); } });
    label.append(checkbox, node("span", "", t("ignoreAcknowledgement")));
    const actions = node("div", "autotrade-ignore-confirm-actions");
    const cancel = node("button", "autotrade-button autotrade-button--quiet", t("ignoreCancel"));
    cancel.id = "autotrade-ignore-cancel";
    cancel.type = "button";
    cancel.addEventListener("click", closeIgnoreConfirmation);
    const confirm = node("button", "autotrade-button autotrade-button--reviewed", t("ignoreConfirm"));
    confirm.id = "autotrade-ignore-confirm";
    confirm.type = "button";
    confirm.addEventListener("click", () => {
      if (busy || !ignoreConfirmation?.acknowledged || !ignoreSelectionCurrent() || snapshot?.capability !== "agentic") return;
      const selection = ignoreConfirmation;
      void perform("ignore-manual", undefined, { scope: selection.scope, ...(selection.scope === "one" ? { recordId: selection.recordId } : {}), reviewVersion: selection.reviewVersion, acknowledged: true });
    });
    actions.append(cancel, confirm);
    panel.append(label, actions);
    panel.addEventListener("keydown", event => { if (event.key === "Escape" && !busy) { event.preventDefault(); closeIgnoreConfirmation(); } });
    return panel;
  }
  function renderManualBlockers() {
    const card = byId("blockers");
    const items = Array.isArray(snapshot?.manualBlockers) ? snapshot.manualBlockers.filter(item => item && typeof item === "object") : [];
    const total = finite(snapshot?.manualBlockerCount) ? Math.max(items.length, Math.floor(Number(snapshot.manualBlockerCount))) : items.length;
    card.hidden = total === 0 && !ignoreConfirmation;
    const key = JSON.stringify({ language, capability: snapshot?.capability, total, items, reviewVersion: snapshot?.manualReviewVersion, ignoreCount: ignoreCount(), ignoreAllAvailable: snapshot?.manualIgnoreAllAvailable, selection: ignoreConfirmation });
    if (key === manualBlockersKey) { renderIgnoreControls(); return; }
    manualBlockersKey = key;
    if (!total && !ignoreConfirmation) { card.replaceChildren(); return; }
    const header = node("div", "autotrade-blockers-heading");
    const title = node("h3", "", t("blockersTitle"));
    title.id = "autotrade-blockers-title";
    const headerActions = node("div", "autotrade-blockers-actions");
    headerActions.append(node("span", "autotrade-blockers-count", t("blockerCount").replace("{count}", String(total))));
    if (snapshot?.capability === "agentic" && total > 0) {
      const ignoreAll = node("button", "autotrade-button autotrade-ignore-action", t("ignoreAll"));
      ignoreAll.id = "autotrade-ignore-all";
      ignoreAll.type = "button";
      ignoreAll.dataset.reviewReady = String(canIgnoreBatch());
      if (!canIgnoreBatch()) ignoreAll.title = t(total > 1000 ? "ignoreBatchLimit" : !validReviewVersion(snapshot.manualReviewVersion) ? "ignoreRefresh" : "ignoreNotEligible");
      ignoreAll.addEventListener("click", () => openIgnoreConfirmation("all"));
      headerActions.append(ignoreAll);
    }
    header.append(title, headerActions);
    const list = node("ol", "autotrade-blocker-list");
    for (const item of items.slice(0, 10)) {
      const row = node("li", "autotrade-blocker");
      const identity = node("div", "autotrade-blocker-identity");
      const side = String(item.side || "").toLowerCase();
      const status = cleanText(item.status || "UNKNOWN", 60).toUpperCase();
      identity.append(node("strong", "", [item.symbol || "—", side === "buy" ? t("sideBuy") : side === "sell" ? t("sideSell") : ""].filter(Boolean).join(" · ")));
      identity.append(node("span", "autotrade-blocker-status", `${strings[language][`blocker_${status}`] || t("blocker_UNKNOWN")} · ${status}`));
      const meta = node("div", "autotrade-blocker-meta");
      meta.append(node("span", "", `${t("orderId")}: ${item.orderId ? cleanText(item.orderId, 180) : t("noOrderId")}`));
      meta.append(node("span", "", `${t("blockerCreated")}: ${date(item.createdAt)}`));
      if (item.id) meta.append(node("span", "autotrade-blocker-record", `ID: ${cleanText(item.id, 180)}`));
      row.append(identity, meta);
      if (snapshot?.capability === "agentic") {
        const ignore = node("button", "autotrade-button autotrade-ignore-action autotrade-ignore-one", t("ignoreOne"));
        ignore.type = "button";
        ignore.dataset.recordId = cleanText(item.id, 180);
        ignore.dataset.reviewReady = String(canIgnoreRecord(item) && Boolean(item.id) && validReviewVersion(item.reviewVersion));
        ignore.setAttribute("aria-label", `${t("ignoreOne")} · ${cleanText(item.symbol || item.id, 180)}`);
        if (!canIgnoreRecord(item)) ignore.title = t(status === "INTENT_CREATED" ? "ignoreQuoteWait" : "ignoreNotEligible");
        ignore.addEventListener("click", () => openIgnoreConfirmation("one", item));
        row.append(ignore);
        if (!canIgnoreRecord(item)) row.append(node("p", "autotrade-blocker-deadline", t(status === "INTENT_CREATED" ? "ignoreQuoteWait" : "ignoreNotEligible")));
      }
      const validUntil = new Date(item.quoteValidUntil || 0);
      if (item.quoteValidUntil && Number.isFinite(validUntil.getTime())) {
        const label = new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(validUntil);
        row.append(node("p", "autotrade-blocker-deadline", validUntil.getTime() > Date.now() ? `${t("quoteValidUntil")}: ${label}` : `${t("quoteAwaitingCheck")} · ${label}`));
      }
      list.append(row);
    }
    card.replaceChildren(header, node("p", "autotrade-blockers-description", t("blockersDescription")), list);
    if (snapshot?.capability === "agentic") card.append(node("p", "autotrade-blockers-more", t("ignoreEligible").replace("{count}", String(ignoreCount()))));
    if (total > 1000) card.append(node("p", "autotrade-blockers-more", t("ignoreBatchLimit")));
    if (total > 10) card.append(node("p", "autotrade-blockers-more", t("blockersMore")));
    const confirmation = createIgnoreConfirmation();
    if (confirmation) card.append(confirmation);
    renderIgnoreControls();
  }
  function safeMetadata(value, depth = 0) {
    if (depth > 4) return "…";
    if (typeof value === "string") return cleanText(value, 1600);
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.slice(0, 25).map((item) => safeMetadata(item, depth + 1));
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/secret|password|private.?key|signature|authorization|session|access.?token|refresh.?token|api.?key/i.test(key)).slice(0, 40).map(([key, item]) => [key, safeMetadata(item, depth + 1)]));
  }
  function renderEvents(force = false) {
    const events = Array.isArray(snapshot?.events) ? snapshot.events : [];
    const key = `${language}:${JSON.stringify(events)}`;
    if (!force && key === eventKey) return;
    eventKey = key;
    byId("event-count").textContent = String(events.length);
    const host = byId("events");
    const expanded = new Set(Array.from(host.querySelectorAll("details[open]"), (item) => item.dataset.eventId));
    const fragment = document.createDocumentFragment();
    if (!events.length) fragment.append(node("p", "autotrade-empty", t("empty")));
    for (const event of events.slice(0, 30)) {
      if (!event || typeof event !== "object") continue;
      const details = node("details", "autotrade-event");
      details.dataset.eventId = cleanText(event.id, 160);
      details.open = expanded.has(details.dataset.eventId);
      const summary = node("summary");
      const time = node("time", "", date(event.createdAt));
      if (event.createdAt && Number.isFinite(new Date(event.createdAt).getTime())) time.dateTime = new Date(event.createdAt).toISOString();
      const kind = cleanText(event.kind || "EVENT", 60).toUpperCase();
      const titleKey = `event_${kind}`;
      const title = strings[language][titleKey] || cleanText(event.kind, 60);
      const side = String(event.side || "").toLowerCase();
      summary.append(time, node("span", "autotrade-event-type", [title, event.symbol, side === "buy" ? t("sideBuy") : side === "sell" ? t("sideSell") : ""].filter(Boolean).join(" · ")), node("span", "autotrade-event-reason", event.reason || t("noReason")), node("span", "autotrade-event-badge", event.status || kind));
      const content = node("div", "autotrade-event-content");
      const list = node("dl");
      const values = [[t("eventId"), event.id], [t("strategy"), event.strategy ? t(event.strategy) : "—"], [t("orderId"), event.orderId || "—"]];
      for (const [label, value] of values) { const row = node("div"); row.append(node("dt", "", label), node("dd", "", value)); list.append(row); }
      const receipt = node("div");
      receipt.append(node("dt", "", t("transaction")));
      const receiptValue = node("dd");
      if (/^0x[a-fA-F0-9]{64}$/.test(String(event.txHash || ""))) {
        const link = node("a", "", event.txHash);
        link.href = `https://bscscan.com/tx/${event.txHash}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        receiptValue.append(link);
      } else receiptValue.textContent = "—";
      receipt.append(receiptValue);
      list.append(receipt);
      content.append(list);
      if (event.metadata && typeof event.metadata === "object") content.append(node("pre", "", JSON.stringify(safeMetadata(event.metadata), null, 2)));
      details.append(summary, content);
      fragment.append(details);
    }
    if (events.length > 30) fragment.append(node("p", "autotrade-empty", t("moreEvents").replace("{count}", "30")));
    host.replaceChildren(fragment);
  }
  function render() {
    for (const element of root.querySelectorAll("[data-auto-text]")) element.textContent = t(element.dataset.autoText);
    byId("title").textContent = t("title");
    const config = snapshot?.config;
    const stats = config?.stats;
    byId("strategy").textContent = t(config?.strategy || defaults.strategy);
    byId("capability").textContent = connectionFailed ? t("requestFailed") : !loaded ? t("connecting") : t(["agentic", "browser"].includes(snapshot?.capability) ? snapshot.capability : "disconnected");
    byId("budget").textContent = config ? money(config.budgetUsd) : "—";
    byId("order-size").textContent = config ? `${t("perOrder")} ${money(config.orderUsd)}` : "—";
    byId("realized").textContent = money(stats?.realizedPnlUsd);
    byId("realized").className = finite(stats?.realizedPnlUsd) ? Number(stats.realizedPnlUsd) >= 0 ? "positive" : "negative" : "";
    const positions = finite(stats?.openPositions) ? Number(stats.openPositions) : Array.isArray(snapshot?.positions) ? snapshot.positions.length : null;
    byId("positions").textContent = config && positions !== null ? `${positions} / ${config.maxPositions}` : "—";
    byId("last-scan").textContent = config?.heartbeatAt ? `${t("lastScan")} ${date(config.heartbeatAt)}` : t("noScan");
    const runSummary = [];
    if (config?.runId) runSummary.push(`${t("run")} ${cleanText(config.runId, 18)}`);
    if (config?.expiresAt) runSummary.push(`${t("until")} ${date(config.expiresAt)}`);
    const latestAsset = snapshot?.events?.find((event) => event?.symbol)?.symbol;
    if (latestAsset) runSummary.push(`${t("lastSelected")} ${cleanText(latestAsset, 35)}`);
    byId("run-summary").textContent = runSummary.join(" · ") || t("idleSummary");
    byId("run-summary").title = config?.runId ? cleanText(config.runId, 160) : "";
    if (!message && config?.lastError) showMessage("", "error", `${t("lastError")}: ${cleanText(config.lastError)}`);
    renderStrategyHelp();
    renderControls();
    renderManualBlockers();
    renderEvents();
    renderMessage();
  }
  function openSettings() {
    const config = snapshot?.config || defaults;
    for (const key of Object.keys(defaults)) { if (form.elements[key]) form.elements[key].value = config[key] ?? defaults[key]; }
    byId("acknowledged").checked = false;
    form.hidden = false;
    byId("configure").setAttribute("aria-expanded", "true");
    renderStrategyHelp();
    renderControls();
    form.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    if (!enabled()) form.elements.budgetUsd.focus({ preventScroll: true });
  }
  function closeSettings() { form.hidden = true; byId("configure").setAttribute("aria-expanded", "false"); }
  async function refresh() {
    if (busy) return;
    syncWalletContext();
    request?.abort();
    const controller = new AbortController();
    request = controller;
    const id = ++requestId;
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(apiUrl(), { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
      const data = await response.json();
      if (id !== requestId) return;
      if (!response.ok || !data?.ok) throw new Error(data?.error || t("requestFailed"));
      snapshot = data;
      loaded = true;
      connectionFailed = false;
      if (message?.key === "requestFailed") message = null;
      render();
    } catch (error) {
      if (id !== requestId || controller.signal.aborted && document.hidden) return;
      connectionFailed = true;
      showMessage("requestFailed");
      render();
    } finally { clearTimeout(timer); if (request === controller) request = null; }
  }
  async function perform(action, settings, payload) {
    if (busy) return;
    request?.abort();
    requestId += 1;
    busy = action;
    const operationWalletKey = currentWalletKey();
    const operationWalletVersion = walletContextVersion;
    const isCurrentWallet = () => operationWalletKey === currentWalletKey() && operationWalletVersion === walletContextVersion;
    showMessage(null);
    renderControls();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const response = await fetch(apiUrl(), { method: "POST", credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(settings ? { settings, acknowledged: true } : {}), ...(payload || {}) }), signal: controller.signal });
      const data = await response.json();
      if (!isCurrentWallet()) return;
      if (!response.ok || !data?.ok) {
        if (response.status === 409 && Array.isArray(data?.manualBlockers)) {
          snapshot = { ...(snapshot || {}), manualBlockers: data.manualBlockers, manualBlockerCount: data.manualBlockerCount ?? data.manualBlockers.length, manualReviewVersion: data.manualReviewVersion, manualIgnoreCount: data.manualIgnoreCount, manualIgnoreAllAvailable: data.manualIgnoreAllAvailable };
          renderManualBlockers();
        }
        throw new Error(data?.error || t("requestFailed"));
      }
      if (Array.isArray(data.manualBlockers)) snapshot = { ...(snapshot || {}), manualBlockers: data.manualBlockers, manualBlockerCount: data.manualBlockerCount ?? data.manualBlockers.length, manualReviewVersion: data.manualReviewVersion, manualIgnoreCount: data.manualIgnoreCount, manualIgnoreAllAvailable: data.manualIgnoreAllAvailable };
      if (action === "start") { byId("acknowledged").checked = false; closeSettings(); }
      if (action === "ignore-manual") {
        ignoreConfirmation = null;
        byId("acknowledged").checked = false;
        const count = finite(data.ignored?.count) ? Math.max(0, Math.floor(Number(data.ignored.count))) : 0;
        showMessage(data.ignored?.alreadyIgnored ? "ignoreAlready" : "ignoreDone", "success", "", { count });
        renderManualBlockers();
      } else if (action === "reconcile") {
        const result = data.reconciliation || {};
        const remaining = finite(result.remaining) ? Math.max(0, Math.floor(Number(result.remaining))) : snapshot?.manualBlockerCount || 0;
        const reconciled = finite(result.reconciled) ? Math.max(0, Math.floor(Number(result.reconciled))) : 0;
        showMessage("reconcileDone", remaining || result.lookupFailed ? "error" : "success", "", { remaining, reconciled }, result.lookupFailed ? "reconcileLookupFailed" : "");
      } else showMessage(`${action}Done`, "success");
    } catch (error) {
      if (!isCurrentWallet()) return;
      if (action === "start") byId("acknowledged").checked = false;
      if (action === "ignore-manual") { ignoreConfirmation = null; byId("acknowledged").checked = false; renderManualBlockers(); }
      showMessage(error?.name === "AbortError" ? "unknownAction" : "", "error", error?.name === "AbortError" ? "" : error?.message || t("requestFailed"));
    } finally {
      clearTimeout(timer);
      busy = "";
      await refresh();
      renderControls();
    }
  }
  mountManualReconciliation();
  byId("toggle").addEventListener("click", () => { if (enabled()) void perform("stop"); else openSettings(); });
  byId("configure").addEventListener("click", () => { if (form.hidden) openSettings(); else closeSettings(); });
  byId("hide-settings").addEventListener("click", closeSettings);
  byId("refresh").addEventListener("click", () => { showMessage(null); void refresh(); });
  byId("scan").addEventListener("click", () => void perform("scan"));
  byId("acknowledged").addEventListener("change", renderControls);
  form.elements.strategy.addEventListener("change", renderStrategyHelp);
  form.addEventListener("input", () => {
    form.elements.orderUsd.setCustomValidity("");
    form.elements.takeProfitPct.setCustomValidity("");
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || ignoreConfirmation || enabled() || snapshot?.capability !== "agentic" || !byId("acknowledged").checked) return;
    const settings = {};
    for (const key of Object.keys(defaults)) settings[key] = key === "strategy" ? form.elements[key].value : Number(form.elements[key].value);
    form.elements.orderUsd.setCustomValidity(settings.orderUsd > settings.budgetUsd / 4 ? t("orderLimit") : "");
    form.elements.takeProfitPct.setCustomValidity(settings.takeProfitPct < settings.stopLossPct * 1.5 ? t("profitLimit") : "");
    if (!form.reportValidity()) return;
    void perform("start", settings);
  });
  byId("export").addEventListener("click", async () => {
    if (busy) return;
    busy = "export";
    renderControls();
    try {
      const exportUrl = apiUrl(true);
      const cursors = new Set();
      const eventIds = new Set();
      const events = [];
      let payload = null;
      let cursor = null;
      do {
        if (exportUrl !== apiUrl(true)) throw new Error(t("exportFailed"));
        const url = new URL(exportUrl, location.origin);
        if (cursor) url.searchParams.set("cursor", cursor);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        let page;
        try {
          const response = await fetch(`${url.pathname}${url.search}`, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
          if (!response.ok) throw new Error(t("exportFailed"));
          page = await response.json();
          if (page?.ok !== true || !Array.isArray(page.events)) throw new Error(t("exportFailed"));
        } finally { clearTimeout(timer); }
        if (exportUrl !== apiUrl(true)) throw new Error(t("exportFailed"));
        if (!payload) payload = page;
        for (const event of page.events) {
          if (!event?.id || eventIds.has(event.id)) continue;
          eventIds.add(event.id);
          events.push(event);
        }
        cursor = page.nextCursor;
        if (cursor !== null && cursor !== undefined) {
          if (typeof cursor !== "string" || !cursor || cursor.length > 200 || cursors.has(cursor)) throw new Error(t("exportFailed"));
          cursors.add(cursor);
        }
      } while (cursor);
      payload = { ...payload, events, nextCursor: null, eventHistoryComplete: true, eventCount: events.length };
      // The on-screen inspector is intentionally bounded; exports preserve every
      // event and field while excluding credential material defensively.
      const exportText = JSON.stringify(payload, (key, value) => /secret|password|private.?key|signature|authorization|session|access.?token|refresh.?token|api.?key/i.test(key) ? undefined : value, 2);
      const blob = new Blob([exportText], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = node("a");
      link.href = url;
      link.download = `bstock-autotrade-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { showMessage("exportFailed"); }
    finally { busy = ""; renderControls(); }
  });
  new MutationObserver(() => {
    const next = document.documentElement.dataset.language === "en" ? "en" : "zh";
    if (next === language) return;
    language = next;
    render();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-language"] });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  window.addEventListener("bstock:wallet-context", () => { request?.abort(); requestId += 1; syncWalletContext(); void refresh(); });
  window.addEventListener("pagehide", () => { request?.abort(); requestId += 1; });
  window.addEventListener("pageshow", (event) => { if (event.persisted) void refresh(); });
  setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
  render();
  void refresh();
})();
