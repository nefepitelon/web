(() => {
  const root = document.querySelector("#alpha-auto-trading-root");
  if (!root) return;
  const endpoint = "/api/alpha-execution/automation";
  const groups = [
    ["运行节奏", [
      ["intervalMinutes", "扫描间隔", "分钟", 5, 240, 1],
      ["minOrderGapMinutes", "下单最小间隔", "分钟", 5, 1440, 1],
      ["maxHoldingMinutes", "最长持仓时间", "分钟", 15, 1440, 1],
      ["sessionDurationHours", "本轮授权时长", "小时", 1, 24, 1],
    ]],
    ["单笔预算", [
      ["orderNotional", "目标名义金额", "USDT", 5, 10000, 1],
      ["maxOrderNotional", "名义金额上限", "USDT", 5, 10000, 1],
      ["leverage", "杠杆上限", "倍", 1, 3, 1],
      ["riskPerTradePct", "单笔风险占权益", "%", .01, 1, .01],
    ]],
    ["组合限额", [
      ["maxPositions", "最多同时持仓", "个", 1, 12, 1],
      ["maxPortfolioNotional", "组合名义金额", "USDT", 5, 100000, 1],
      ["maxPortfolioEquityPct", "组合金额占权益", "%", 1, 50, 1],
      ["dailyLossLimitPct", "单日亏损停止线", "%", .25, 3, .05],
    ]],
    ["信号筛选", [
      ["minScore", "异动 Alpha 门槛", "分", 60, 95, 1],
      ["maxDataAgeMinutes", "信号有效时间", "分钟", 1, 10, 1],
      ["maxOrdersPerRun", "每轮最多新订单", "笔", 1, 3, 1],
    ]],
    ["止盈止损", [
      ["atrStopMultiplier", "ATR 止损倍数", "倍", 1, 3, .1],
      ["minStopLossPct", "最小止损距离", "%", .25, 2, .05],
      ["maxStopLossPct", "最大止损距离", "%", .5, 5, .1],
      ["minRiskRewardRatio", "最低盈亏比", "R", 2, 5, .1],
    ]],
    ["报价与流动性", [
      ["maxQuoteAgeSeconds", "报价最长有效时间", "秒", 5, 60, 1],
      ["minQuoteVolume24h", "24 小时最低成交额", "USDT", 1000000, 1000000000, 1000000],
      ["maxSpreadPct", "最大买卖价差", "%", .01, 1, .01],
      ["maxSlippagePct", "最大预计滑点", "%", .01, 1, .01],
    ]],
  ];
  const strategies = [
    ["p1_three_source", "P1 · 三来源共振", "P1 三来源共振执行池中的同向候选。"],
    ["p2_two_source", "P2 · 两来源共振", "P2 两来源共振执行池中的同向候选。"],
    ["strong_signal", "强信号", "最新 20 条中同币仅 1 条（无同币标记），候选信号 ≤10 分钟。"],
    ["same_coin_x2", "同币 ×2", "最新 20 条中同币恰好 2 条，候选信号 ≤10 分钟。"],
    ["anomaly", "异动榜", "Alpha >80、方向明确，七维价格动量与成交异动均 >89。"],
  ];
  const strategyNames = Object.fromEntries(strategies.map(([key, title]) => [key, title]));
  const validStrategies = (value) => Array.isArray(value) && value.length > 0 && value.every((key) => Object.hasOwn(strategyNames, key)) && new Set(value).size === value.length;
  const fields = groups.flatMap(([, rows]) => rows);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const number = (value, digits = 2) => value != null && Number.isFinite(Number(value)) ? Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits }) : "—";
  const time = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
  const integerFields = new Set(["intervalMinutes", "minOrderGapMinutes", "maxOrdersPerRun", "maxHoldingMinutes", "leverage", "maxPositions", "minScore", "maxDataAgeMinutes", "maxQuoteAgeSeconds"]);
  const helpCopy = {
    orderNotional: ["名义金额与保证金", "名义金额是订单总价值，不是保证金。例如 50 USDT 名义金额在 2 倍杠杆下保证金约 25 USDT，另须预留交易成本。系统采用金额、权益比例和风险预算允许的较小仓位；不满足交易所最小金额或数量时跳过，不放大下单。"],
    riskPerTradePct: ["单笔风险预算", "按止损距离及预计交易成本计算单笔风险，并与交易执行中心的限额取更严格值。实际成交可能受滑点影响，风险预算不保证最大亏损。"],
    dailyLossLimitPct: ["单日亏损停止线", "比较 UTC 当日净结算亏损与首次监控以来含浮盈变化的亏损，采用较差值；普通 USDT 资金划转独立剔除。阈值权益基数不超过首次监控权益和当前权益中的较小值。分页不完整、未知流水类型或币种、达到亏损限制时阻止新开仓。"],
    minScore: ["异动评分规则", "“异动 Alpha 门槛”仅作用于异动榜策略，实际 Alpha 分始终须严格大于 80，价格动量与成交异动均须严格大于 89；其余策略不使用这个共同评分门槛。信号仍须满足有效时间与对应策略的 10 分钟时限。"],
    maxStopLossPct: ["止损与盈亏比", "ATR 距离、止损上下限和交易所价格规则必须同时满足；计入预计交易成本后仍须达到最低盈亏比，否则跳过候选。止损触发价不保证成交价，参数建议未经盈利验证。"],
    stop: ["停止新开仓", "停止后不再创建新开仓订单；已有策略仓位的保护单和到期管理继续运行，直至仓位结束。策略参数变更需先停止，等待本轮管理结束后保存，再明确开启。已运行任务固定使用启动时的部署版本；更新发布后，需停止并等待收尾结束，再重新开启，才能使用新版。"],
  };
  const helpButton = (key) => `<button class="aat-help-toggle" type="button" popovertarget="aat-help-${key}" aria-controls="aat-help-${key}" aria-expanded="false" aria-label="查看${escape(helpCopy[key][0])}说明">?</button>`;
  const fieldHtml = ([key, title, unit, min, max]) => `<label><span><span class="aat-field-title">${title}${key === "minScore" ? '<small>同时须 >80</small>' : ""}</span>${helpCopy[key] ? helpButton(key) : ""}</span><div class="aat-input"><input name="${key}" type="number" min="${min}" max="${max}" step="${integerFields.has(key) ? 1 : "any"}" required disabled inputmode="decimal"${key === "minScore" ? ' aria-describedby="aat-anomaly-note"' : ""}><em>${unit}</em></div></label>`;
  root.innerHTML = `
    <div class="aat-command-bar">
      <div class="aat-status" id="aat-status" role="status"><strong id="aat-status-name">正在读取状态</strong><span id="aat-status-detail">自动交易由服务端独立调度</span></div>
      <div class="aat-actions"><button class="aat-recommend" id="aat-recommend" type="button" disabled>载入推荐参数</button><button class="aat-save" id="aat-save" type="submit" form="aat-form" disabled>保存参数</button><button id="aat-preview" type="button" disabled>预览当前候选</button><button class="aat-start" id="aat-start" type="button" disabled>检查并开启实盘自动交易</button><span class="aat-action-help"><button class="aat-stop" id="aat-stop" type="button" disabled>停止新开仓</button>${helpButton("stop")}</span></div>
      <p id="aat-save-state" role="status">等待配置</p>
    </div>
    <dl class="aat-times"><div><dt>上次扫描</dt><dd id="aat-last-scan">—</dd></div><div><dt>下次扫描</dt><dd id="aat-next-scan">—</dd></div><div><dt>上次下单</dt><dd id="aat-last-order">—</dd></div><div><dt>本轮授权到期</dt><dd id="aat-expiry">—</dd></div></dl>
    <section class="aat-recommendation" id="aat-recommendation" aria-label="推荐参数来源与理由" hidden></section>
    <form id="aat-form"><div class="aat-form-groups">${groups.map(([title, rows]) => `<fieldset><legend>${title}</legend><div class="aat-fields">${rows.map(fieldHtml).join("")}${title === "信号筛选" ? '<div class="aat-readonly"><span>所选策略</span><output id="aat-selected-strategy-count">等待配置</output></div>' : ""}</div></fieldset>`).join("")}</div><section class="aat-parameter-warnings" id="aat-parameter-warnings" aria-label="参数预检结果" role="status" hidden></section>
      <details class="aat-advanced" open><summary>高级筛选 · 策略选择</summary><p class="aat-strategy-note">可单选或多选，默认全选；至少选择一项。命中任一已选策略后，仍须通过账户、报价和风控检查。</p><div class="aat-strategies">${strategies.map(([key, title, description]) => `<label><input type="checkbox" name="selectedStrategies" value="${key}" checked disabled><span><strong>${title}</strong><small>${description}</small></span></label>`).join("")}</div><p id="aat-strategy-error" role="alert" hidden>至少选择一个策略后再保存或预览。</p></details>
      <p class="aat-form-error" id="aat-form-error" role="alert" hidden></p>
    </form>
    <div class="aat-results"><section><h3>本轮候选预览</h3><div id="aat-preview-result" class="aat-result-body">点击预览读取候选，不会下单。</div></section><section><h3>自动交易运行记录</h3><div id="aat-events" class="aat-result-body">等待服务端运行记录</div></section></div>
    <dialog id="aat-confirm-dialog" aria-labelledby="aat-confirm-title"><div class="aat-dialog-body"><h2 id="aat-confirm-title">确认开启实盘自动交易</h2><p>本次授权会允许服务端在设定时段内按下列参数自动提交真实订单。</p><div id="aat-review"></div><label class="aat-ack"><input type="checkbox" id="aat-ack"><span id="aat-ack-text">我已核对配置，并授权本轮使用真实资金自动交易。</span></label><p id="aat-confirm-error" role="alert"></p><div class="aat-dialog-actions"><button id="aat-cancel" type="button">返回检查</button><button class="aat-start" id="aat-confirm" type="button" disabled>确认开启实盘自动交易</button></div></div></dialog>`;

  root.insertAdjacentHTML("beforeend", Object.entries(helpCopy).map(([key, [title, text]]) => `<div class="aat-help-popover" id="aat-help-${key}" popover aria-label="${escape(title)}"><strong>${escape(title)}</strong><p${key === "minScore" ? ' id="aat-anomaly-note"' : ""}>${escape(text)}</p><button type="button" popovertarget="aat-help-${key}" popovertargetaction="hide" aria-label="关闭${escape(title)}说明">关闭</button></div>`).join(""));
  const el = (id) => root.querySelector(`#${id}`);
  function positionHelp(panel, button) {
    const anchor = button.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(12, Math.min(anchor.left, innerWidth - bounds.width - 12))}px`;
    const below = anchor.bottom + 8;
    panel.style.top = `${Math.max(12, below + bounds.height <= innerHeight - 12 ? below : anchor.top - bounds.height - 8)}px`;
  }
  root.querySelectorAll(".aat-help-toggle").forEach((button) => {
    const panel = el(button.getAttribute("popovertarget"));
    panel.addEventListener("toggle", (event) => { const open = event.newState === "open"; button.setAttribute("aria-expanded", String(open)); if (open) positionHelp(panel, button); });
    panel.querySelector("button").addEventListener("click", () => button.focus({ preventScroll: true }));
  });
  window.addEventListener("resize", () => root.querySelectorAll(".aat-help-toggle[aria-expanded=true]").forEach((button) => positionHelp(el(button.getAttribute("popovertarget")), button)));
  const form = el("aat-form");
  const dialog = el("aat-confirm-dialog");
  const strategyInputs = [...form.querySelectorAll('[name="selectedStrategies"]')];
  const selectedStrategies = () => strategyInputs.filter((input) => input.checked).map((input) => input.value);
  const applyStrategies = (selected) => strategyInputs.forEach((input) => { input.checked = Array.isArray(selected) && selected.includes(input.value); });
  let snapshot = null, dirty = false, busy = false, busyAction = null, stale = true, timer = null, reviewVersion = null, readGeneration = 0;
  const running = () => snapshot?.config?.enabled === true;
  const finishing = () => ["STOPPING", "STARTING"].includes(String(snapshot?.config?.status || "").toUpperCase());
  const statusNames = { running: "自动交易运行中", started: "自动交易运行中", active: "自动交易运行中", starting: "正在启动自动交易", stopping: "已停止新开仓，继续管理策略仓位", stopped: "已停止新开仓", disabled: "自动交易未开启", expired: "本轮授权已到期", paused: "自动交易已暂停", error: "运行需要处理", blocked: "条件未满足", idle: "自动交易未开启" };
  const reasonNames = { NO_ELIGIBLE_CANDIDATE: "本轮没有满足条件的候选", INSUFFICIENT_INDEPENDENT_CONSENSUS: "独立同向来源不足", SYMBOL_ALREADY_EXPOSED: "该币种已有仓位或待成交订单", DUPLICATE_SYMBOL_DIRECTION: "同向订单处于冷却期", MARKET_DATA_INVALID_OR_STALE: "行情数据不完整或已过期", DERIVATIVES_DATA_MISSING: "衍生品数据缺失", EXECUTION_FRICTION_TOO_HIGH: "价差或滑点超过上限", PRICE_OR_FUNDING_OVERHEATED: "价格、成交量或资金费率过热", MOMENTUM_NOT_CONFIRMED: "多周期动量未确认", ATR_STOP_EXCEEDS_LIMIT: "ATR 止损距离超过上限", ORDER_BELOW_EXCHANGE_MINIMUM: "金额或数量未达到交易所最小要求", ACCOUNT_NOT_READY: "账户或对账状态未就绪", INSUFFICIENT_QUOTE_VOLUME: "成交额不足", SIGNAL_DATA_INCOMPLETE: "信号数据不完整", SIGNAL_STALE: "信号已过期" };
  Object.assign(reasonNames, {
    INVALID_SETTINGS: "参数需要修正", AUTOMATION_DISABLED: "自动交易未开启", INVALID_CONTEXT: "执行环境未确认",
    ACCOUNT_DATA_UNAVAILABLE: "账户数据不完整或已过期", KILL_SWITCH_ACTIVE: "总开关已触发，禁止新开仓",
    RECONCILIATION_REQUIRED: "存在未决状态，请先完成对账", DAILY_LOSS_LIMIT: "日内亏损已达到停止线",
    EXPOSURE_DATA_UNAVAILABLE: "账户持仓或挂单数据不完整", EXPIRED_POSITION_REQUIRES_EXIT: "已有策略仓位待到期平仓",
    POSITION_LIMIT: "持仓与挂单总数已达上限", ORDER_HISTORY_UNAVAILABLE: "真实订单历史未完整同步",
    ORDER_COOLDOWN: "正在等待下单冷却间隔", MARKET_DATA_UNAVAILABLE: "行情来源未就绪", PORTFOLIO_LIMIT: "组合名义金额已达上限",
    OVERHEATED_SIGNAL: "信号已过热", CONFLICTING_DIRECTIONS: "多个来源方向相互冲突", NO_FRESH_DIRECTIONAL_EVIDENCE: "缺少新鲜的方向证据",
    MARKET_SNAPSHOT_MISSING_OR_AMBIGUOUS: "缺少唯一有效的行情快照", PROTECTION_FILTERS_INVALID: "止盈止损不满足交易所价格规则",
    PROTECTION_PRICE_RANGE_UNAVAILABLE: "允许价格范围内无法同时满足止损上下限",
    ACCOUNT_OR_EXECUTION_CAPS_UNAVAILABLE: "账户预算或执行限额无法核验", INSUFFICIENT_SAFE_BUDGET: "可用风险预算不足",
    ACCOUNT_RECONCILIATION_REQUIRED: "账户需完成对账或处理未决状态", PUBLIC_MARKET_UNAVAILABLE: "公开行情暂不可用",
    BELOW_CURRENT_EXCHANGE_MINIMUM: "当前预算未达到交易所最小要求", NO_VERIFIED_EXECUTABLE_MARKET: "尚无核验通过的可执行市场",
    NO_SELECTED: "未命中已选策略", NO_SELECTED_STRATEGY_MATCH: "该币种未命中已选策略", NO_ELIGIBLE: "本轮没有满足条件的候选",
    STOP_SLIPPAGE_RANGE_CONFLICT: "止损范围无法覆盖允许的价格变化",
  });
  const reason = (value) => String(value || "等待下一次扫描").replace(/\b[A-Z][A-Z0-9_]{3,}\b/g, (code) => reasonNames[code] || code);
  const fieldNames = Object.fromEntries(fields.map(([key, title]) => [key, title]));
  function strategyCheckHtml(check) {
    if (typeof check === "string") return `<li>${escape(reason(check))}</li>`;
    if (!check || typeof check !== "object") return "";
    const observations = Array.isArray(check.observations) ? check.observations : [];
    const message = reason(check.message || check.detail || strategyNames[check.strategy] || "策略核验");
    if (!observations.length) return `<li>${escape(message)}</li>`;
    return `<li><details><summary>${escape(message)}</summary>${observations.map((row) => {
      const side = { LONG: "做多", SHORT: "做空", NEUTRAL: "中性" }[row.side] || "方向未知";
      const facts = [`方向：${side}`, `${row.ageBasis === "event" ? "原始事件" : "源快照"}时效：${number(row.ageMinutes)} / ${number(row.maxAgeMinutes)} 分钟`, `源快照：${time(row.snapshotAt)}`];
      if (row.ageBasis === "event") facts.push(`原始事件：${time(row.observedAt)}`, `同币计数：${number(row.sameCoinCount, 0)}`);
      if (check.source === "risk_pool") facts.push(`当前池：${row.riskPoolPriority || "未知"}`);
      if (check.source === "anomaly") facts.push(`Alpha：${number(row.alphaScore)}`, `价格动量：${number(row.priceMomentumScore)}`, `成交异动：${number(row.volumeAnomalyScore)}`);
      return `<div class="aat-observation"><p>${facts.map(escape).join(" · ")}</p>${Array.isArray(row.issues) ? row.issues.map((issue) => `<p>${escape(reason(issue.message || issue.code))}</p>`).join("") : ""}</div>`;
    }).join("")}${check.truncated ? "<small>仅展开该策略最近的部分来源记录。</small>" : ""}</details></li>`;
  }
  function rejectionHtml(item) {
    if (!item || typeof item !== "object") return "";
    const explanation = typeof item.message === "string" && item.message ? item.message : reason(item.reason);
    const detail = typeof item.detail === "string" ? item.detail : "";
    const checks = Array.isArray(item.details?.strategyChecks) ? item.details.strategyChecks : [];
    return `<article class="aat-rejection"><p><strong>${escape(item.symbol || "候选")}</strong> · ${escape(reason(explanation))}</p>${detail ? `<p>${escape(reason(detail))}</p>` : ""}${checks.length ? `<ul>${checks.map(strategyCheckHtml).join("")}</ul>` : ""}</article>`;
  }
  function sourceStatusHtml(items) {
    if (!Array.isArray(items) || !items.length) return "";
    const names = { anomaly: "异动榜", momentum: "1 日动量榜", signal: "信号流水", risk_pool: "P1 / P2 执行池", market: "交易所行情" };
    return `<details class="aat-source-status"><summary>查看本轮 ${items.length} 项数据源状态</summary>${items.map((item) => `<p><strong>${escape(names[item.source] || item.source)}</strong> · ${item.ok === true ? "已读取" : "未就绪"}${Number.isFinite(item.count) ? ` · ${number(item.count, 0)} 项` : ""} · ${item.observedAt ? escape(time(item.observedAt)) : "时间未知"}${item.message ? `<small>${escape(reason(item.message))}</small>` : ""}</p>`).join("")}</details>`;
  }
  function parameterWarningsHtml(warnings) {
    return Array.isArray(warnings) && warnings.length ? `<strong>参数预检提示</strong>${warnings.map((warning) => `<p>${escape(reason(warning.message || warning.code))}</p>`).join("")}` : "";
  }
  function renderParameterWarnings(warnings) {
    const panel = el("aat-parameter-warnings");
    panel.innerHTML = parameterWarningsHtml(warnings); panel.hidden = !panel.innerHTML;
  }
  function eventSummaryHtml(summary) {
    if (!summary || typeof summary !== "object") return "";
    const counts = Array.isArray(summary.rejectionCounts) ? summary.rejectionCounts : [];
    const rejected = Array.isArray(summary.rejections) ? summary.rejections : [];
    return `<div class="aat-event-summary">${Number.isFinite(summary.candidateCount) ? `<p>通过筛选：${number(summary.candidateCount, 0)} 个候选</p>` : ""}${counts.length ? `<p class="aat-rejection-counts">${counts.map((item) => `${escape(reason(item.reason))}：${number(item.count, 0)}`).join("；")}</p>` : ""}${parameterWarningsHtml(summary.parameterWarnings)}${rejected.length ? `<details><summary>逐币查看未通过原因（${rejected.length}）</summary>${rejected.map(rejectionHtml).join("")}</details>` : ""}${sourceStatusHtml(summary.sourceStatus)}</div>`;
  }
  function showError(message) { el("aat-status-detail").textContent = message; el("aat-status").classList.add("error"); }
  function syncControls() {
    const selected = selectedStrategies(), hasStrategies = validStrategies(selected);
    strategyInputs[0].setCustomValidity(hasStrategies ? "" : "至少选择一个策略");
    el("aat-selected-strategy-count").textContent = `${selected.length} / ${strategies.length} 项 · 任一命中`;
    el("aat-strategy-error").hidden = hasStrategies;
    form.querySelectorAll("input").forEach((input) => { input.disabled = stale || busy || running() || finishing(); });
    el("aat-save").disabled = stale || busy || running() || finishing() || (!dirty && snapshot?.strategySelectionRequired !== true) || !hasStrategies;
    el("aat-recommend").disabled = stale || busy || running() || finishing() || !hasStrategies;
    el("aat-recommend").textContent = busyAction === "recommend" ? "正在生成推荐…" : "载入推荐参数";
    el("aat-preview").disabled = stale || busy || !hasStrategies;
    el("aat-start").disabled = stale || busy || running() || finishing() || dirty || !snapshot?.config?.version || !hasStrategies || snapshot?.strategySelectionRequired === true;
    el("aat-stop").disabled = busy || !running();
    el("aat-confirm").disabled = busy || !el("aat-ack").checked;
    el("aat-save-state").textContent = snapshot?.strategySelectionRequired === true ? "请选择策略并保存参数后开启新交易" : dirty ? "参数已修改，请先保存" : running() ? "运行中 · 停止后可修改参数" : finishing() ? "等待本轮任务和持仓管理结束" : snapshot ? "已载入服务端参数" : "等待配置";
    el("aat-save-state").classList.toggle("aat-selection-required", snapshot?.strategySelectionRequired === true);
  }
  function renderPreview(preview) {
    if (!preview) return;
    const candidates = Array.isArray(preview.candidates) ? preview.candidates : [];
    const rejections = Array.isArray(preview.rejections) ? preview.rejections : [];
    renderParameterWarnings(preview.parameterWarnings);
    el("aat-preview-result").innerHTML = `${preview.blockedReason ? `<p class="aat-blocked">${escape(reason(preview.blockedReason))}</p>` : ""}${candidates.map((candidate) => `<article class="aat-candidate"><header><strong>${escape(candidate.symbol)}</strong><span>${candidate.side === "SHORT" ? "做空" : candidate.side === "LONG" ? "做多" : "方向待确认"} · ${candidate.alphaScore != null && Number.isFinite(Number(candidate.alphaScore)) ? `${number(candidate.alphaScore, 0)} 分` : "未提供 Alpha 评分"}</span></header><p class="aat-matched-strategies">命中策略：${Array.isArray(candidate.matchedStrategies) && candidate.matchedStrategies.length ? candidate.matchedStrategies.map((key) => escape(strategyNames[key] || key)).join("、") : "未提供"}</p><p>名义 ${number(candidate.notional)} USDT · 保证金约 ${number(candidate.marginRequired)} USDT · ${number(candidate.leverage, 0)} 倍</p><p>入场 ${number(candidate.entryPrice, 7)} · 止损 ${number(candidate.stopLoss, 7)} · 止盈 ${number(candidate.takeProfit, 7)}</p><small>计入预计交易成本后的风险 ${number(candidate.estimatedLossWithCosts)} USDT · 最长持有 ${number(candidate.maxHoldingMinutes, 0)} 分钟</small></article>`).join("")}${!candidates.length ? "<p>当前没有可执行候选；预览不会创建订单。</p>" : ""}${rejections.length ? `<details><summary>查看 ${rejections.length} 项未通过原因</summary>${rejections.map(rejectionHtml).join("")}</details>` : ""}${sourceStatusHtml(preview.sourceStatus)}`;
  }
  function loadRecommendation(recommendation, preservedStrategies) {
    if (running() || finishing()) throw new Error("当前任务正在运行或收尾，未覆盖参数草稿");
    const settings = recommendation?.settings;
    if (!["ai", "rules"].includes(recommendation?.source) || !settings || !fields.every(([key, , , min, max]) =>
      typeof settings[key] === "number" && Number.isFinite(settings[key]) && settings[key] >= min && settings[key] <= max
      && (!integerFields.has(key) || Number.isInteger(settings[key])))) {
      throw new Error("推荐参数不完整或超出允许范围，当前草稿已保留");
    }
    if (settings.orderNotional > Math.min(settings.maxOrderNotional, settings.maxPortfolioNotional)
      || settings.minStopLossPct > settings.maxStopLossPct) {
      throw new Error("推荐参数之间存在冲突，当前草稿已保留");
    }
    fields.forEach(([key]) => { form.elements.namedItem(key).value = settings[key]; });
    applyStrategies(preservedStrategies);
    dirty = true;
    const source = recommendation.source === "ai" ? "AI 参与的参数建议" : "规则参数参考 · 非 AI 生成";
    const details = [recommendation.source === "ai" && recommendation.model ? `模型 ${recommendation.model}` : null, time(recommendation.generatedAt)].filter(Boolean).join(" · ");
    const fieldNames = Object.fromEntries(fields.map(([key, title]) => [key, title]));
    const evidenceNames = { account_budget: "账户预算", execution_caps: "执行限额", data_quality: "数据完整性", market_volatility: "市场波动", liquidity: "市场流动性" };
    const reasonItems = Array.isArray(recommendation.factorReasons) && recommendation.factorReasons.length ? recommendation.factorReasons : recommendation.reasons;
    const reasons = Array.isArray(reasonItems) ? reasonItems.map((item) => typeof item === "string" ? { reason: item }
      : item && typeof item.reason === "string" ? item : null).filter(Boolean).slice(0, 16) : [];
    const adjusted = Array.isArray(recommendation.aiAdjustedFields) ? recommendation.aiAdjustedFields.filter((key) => fieldNames[key]).map((key) => fieldNames[key]) : [];
    const scope = recommendation.source === "ai" ? `<p class="aat-provenance">AI 调整字段：${escape(adjusted.length ? adjusted.join("、") : "沿用当前保守参数（无额外数值调整）")}。止损、盈亏比及每轮订单数仍受服务端规则约束；所选策略保持不变。</p>` : "";
    const provenance = recommendation.provenance;
    const evidence = provenance && typeof provenance === "object"
      ? `<div class="aat-provenance"><span>账户预算：${provenance.accountAvailable === true ? `已核验 · ${escape(time(provenance.accountObservedAt))}` : "未核验"}</span><span>公开统计：${provenance.publicMarketAvailable === true ? `已读取 · ${escape(time(provenance.marketObservedAt))}` : "数据不足"}</span></div>` : "";
    const blocked = recommendation.blocked === true ? `<p class="aat-blocked">当前执行条件未满足，仅载入研究草稿。${Array.isArray(recommendation.blockedReasons) ? recommendation.blockedReasons.map((item) => escape(reason(item))).join("；") : ""}</p>` : "";
    const panel = el("aat-recommendation");
    panel.innerHTML = `<header><strong>${escape(source)}</strong><span>${escape(details)}</span></header><p>${escape(recommendation.summary || "请核对参数后再保存。")}</p>${scope}${evidence}${blocked}${reasons.length ? `<ul>${reasons.map((item) => `<li>${item.field || item.evidence ? `<span class="aat-reason-meta">${escape(fieldNames[item.field] || (item.field === "enabled" ? "交易开关" : item.field) || "参数")}${item.evidence ? ` · ${escape(evidenceNames[item.evidence] || item.evidence)}` : ""}</span>` : ""}${escape(item.reason)}</li>`).join("")}</ul>` : ""}<small id="aat-recommendation-state">推荐已载入未保存草稿，可继续修改；未保存、未开启交易。参数建议未经盈利验证。</small>`;
    panel.hidden = false;
    syncControls();
  }
  const eventDetails = new Map();
  const pendingDetails = new Map();
  const expandedEvents = new Set();
  function renderEvents(events) {
    const visible = events.slice(0, 30);
    const ids = new Set(visible.map((event) => event.id));
    for (const id of eventDetails.keys()) if (!ids.has(id)) eventDetails.delete(id);
    for (const id of expandedEvents) if (!ids.has(id)) expandedEvents.delete(id);
    el("aat-events").innerHTML = visible.length ? visible.map((event) => {
      const expanded = expandedEvents.has(event.id);
      const summary = eventDetails.get(event.id);
      const detail = event.detailAvailable && event.id ? `<button type="button" data-event-detail="${escape(event.id)}" aria-expanded="${expanded}">${expanded ? "收起筛选明细" : "查看筛选明细"}</button>${expanded ? `<div>${summary ? eventSummaryHtml(summary) : "<p>正在读取筛选明细…</p>"}</div>` : ""}` : eventSummaryHtml(event.summary);
      return `<article class="aat-event"><time>${escape(time(event.createdAt))}</time><strong>${escape(reason(event.message || event.status || event.kind))}</strong>${detail}</article>`;
    }).join("") : "<p>尚无自动交易运行记录</p>";
  }
  el("aat-events").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-event-detail]");
    if (!button) return;
    const id = button.dataset.eventDetail;
    if (expandedEvents.has(id)) expandedEvents.delete(id); else expandedEvents.add(id);
    renderEvents(snapshot?.events || []);
    if (!expandedEvents.has(id) || eventDetails.has(id) || pendingDetails.has(id)) return;
    const pending = (async () => {
      const response = await fetch(`${endpoint}/events/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || payload.id !== id || !payload.summary) throw new Error(payload?.message || "筛选明细读取失败，请稍后重试");
      if (snapshot?.events?.some((item) => item.id === id)) eventDetails.set(id, payload.summary);
    })();
    pendingDetails.set(id, pending);
    try { await pending; }
    catch (error) { expandedEvents.delete(id); showError(error.message); }
    finally { pendingDetails.delete(id); renderEvents(snapshot?.events || []); }
  });
  function render(next, updateForm = false) {
    snapshot = next;
    if ((updateForm || !dirty) && next.settings) {
      fields.forEach(([key]) => { form.elements.namedItem(key).value = next.settings[key] ?? ""; });
      applyStrategies(next.settings.selectedStrategies);
      dirty = false;
    }
    const config = next.config || {};
    const state = String(config.status || (config.enabled ? "running" : "disabled")).toLowerCase();
    el("aat-status-name").textContent = statusNames[state] || String(config.status || "状态待确认");
    el("aat-status").classList.toggle("running", config.enabled === true);
    el("aat-status").classList.toggle("error", Boolean(config.lastError));
    el("aat-status-detail").textContent = config.lastError ? reason(config.lastError) : (config.enabled ? `${String(config.market || "futures").toUpperCase()} · 服务端定时扫描与执行` : "自动交易默认关闭，保存参数不会启动交易");
    el("aat-last-scan").textContent = time(config.lastScanAt);
    el("aat-next-scan").textContent = time(config.nextScanAt);
    el("aat-last-order").textContent = time(config.lastOrderAt);
    el("aat-expiry").textContent = time(config.expiresAt);
    const events = Array.isArray(next.events) ? next.events : [];
    renderEvents(events);
    if (Array.isArray(next.parameterWarnings) && !dirty) renderParameterWarnings(next.parameterWarnings);
    renderPreview(next.preview);
    syncControls();
  }
  async function request(action, values = {}) {
    const response = await fetch(endpoint, action ? { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }), ...(action === "recommend" ? { signal: AbortSignal.timeout(90_000) } : {}) } : { cache: "no-store" });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok || payload?.ok === false) {
      const issues = Array.isArray(payload?.issues) ? payload.issues.map((issue) => `${fieldNames[Array.isArray(issue.path) ? issue.path.at(-1) : issue.path] || "参数"}：${reason(issue.message)}`) : [];
      const message = [reason(payload?.message || payload?.error || "自动交易服务暂时不可用"), typeof payload?.detail === "string" ? reason(payload.detail) : null, ...issues].filter(Boolean).join("；");
      throw new Error(message);
    }
    if (!payload?.config || !payload?.settings) throw new Error("服务端配置不完整，暂不能开启自动交易");
    if (!validStrategies(payload.settings.selectedStrategies)) throw new Error("服务端策略配置不完整，暂不能开启自动交易");
    return payload;
  }
  function readSettings() {
    if ([...form.querySelectorAll(".aat-advanced input")].some((input) => !input.checkValidity())) form.querySelector(".aat-advanced").open = true;
    if (!form.reportValidity()) return null;
    const settings = { enabled: false, selectedStrategies: selectedStrategies() };
    fields.forEach(([key]) => { settings[key] = Number(form.elements.namedItem(key).value); });
    const conflict = settings.orderNotional > settings.maxOrderNotional ? "目标名义金额不能超过名义金额上限" : settings.orderNotional > settings.maxPortfolioNotional ? "目标名义金额不能超过组合名义金额" : settings.minStopLossPct > settings.maxStopLossPct ? "最小止损距离不能超过最大止损距离" : null;
    if (conflict) { el("aat-form-error").textContent = conflict; el("aat-form-error").hidden = false; showError(conflict); return null; }
    el("aat-form-error").hidden = true;
    return settings;
  }
  function schedule() { window.clearTimeout(timer); if (!document.hidden) timer = window.setTimeout(refresh, stale ? 30_000 : running() || finishing() ? 15_000 : 15 * 60_000); }
  async function refresh() {
    if (document.hidden || busy || dialog.open) { schedule(); return; }
    const generation = ++readGeneration;
    try { const next = await request(); if (generation !== readGeneration) return; stale = false; render(next); }
    catch (error) { if (generation !== readGeneration) return; stale = true; el("aat-status-name").textContent = "服务状态未确认"; showError(error.message); syncControls(); }
    finally { if (generation === readGeneration) schedule(); }
  }
  async function act(action, values = {}) {
    // A status read started before this action must not replace its result or error.
    ++readGeneration; busy = true; busyAction = action; syncControls();
    try { const next = await request(action, values); stale = false; render(next, action === "save"); return next; }
    finally { ++readGeneration; busy = false; busyAction = null; syncControls(); schedule(); }
  }
  form.addEventListener("input", () => { dirty = true; el("aat-form-error").hidden = true; if (!el("aat-parameter-warnings").hidden) el("aat-parameter-warnings").innerHTML = "<p>参数已修改，请重新预览以核验当前配置。</p>"; if (el("aat-recommendation-state")) el("aat-recommendation-state").textContent = "推荐草稿已手动修改，请核对后保存；上方理由对应载入时的建议。"; syncControls(); });
  form.addEventListener("invalid", (event) => { const input = event.target; const title = fieldNames[input.name] || "策略选择"; el("aat-form-error").textContent = `${title}：${input.validationMessage}`; el("aat-form-error").hidden = false; }, true);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const settings = readSettings(); if (!settings) return;
    try { await act("save", { settings }); if (el("aat-recommendation-state")) el("aat-recommendation-state").textContent = "参数已保存；保存不会开启交易。上方保留载入时的推荐说明。"; } catch (error) { showError(error.message); }
  });
  el("aat-recommend").addEventListener("click", async () => {
    if (stale || busy || running() || finishing()) return;
    const settings = readSettings(); if (!settings) return;
    try { const next = await act("recommend", { settings }); loadRecommendation(next.recommendation, settings.selectedStrategies); }
    catch (error) { showError(error.name === "TimeoutError" ? "推荐服务响应超时，当前草稿已保留，请稍后重试" : error.message); }
  });
  el("aat-preview").addEventListener("click", async () => {
    const settings = readSettings(); if (!settings) return;
    try { await act("preview", { settings }); } catch (error) { showError(error.message); }
  });
  el("aat-start").addEventListener("click", async () => {
    if (dirty || stale || running() || finishing() || snapshot?.strategySelectionRequired === true) return;
    try {
      const next = await act("preview");
      reviewVersion = next.config.version;
      const settings = next.settings;
      el("aat-review").innerHTML = `<dl><div><dt>执行市场</dt><dd>LIVE · ${escape(String(next.config.market || "futures").toUpperCase())}</dd></div><div><dt>扫描 / 下单间隔</dt><dd>${number(settings.intervalMinutes, 0)} / ${number(settings.minOrderGapMinutes, 0)} 分钟</dd></div><div><dt>单笔目标 / 上限</dt><dd>${number(settings.orderNotional)} / ${number(settings.maxOrderNotional)} USDT 名义金额</dd></div><div><dt>杠杆 / 最多持仓</dt><dd>${number(settings.leverage, 0)} 倍 / ${number(settings.maxPositions, 0)} 个</dd></div><div><dt>组合限额</dt><dd>${number(settings.maxPortfolioNotional)} USDT 且不超过权益 ${number(settings.maxPortfolioEquityPct)}%</dd></div><div><dt>保护与持仓时间</dt><dd>ATR × ${number(settings.atrStopMultiplier)} · ${number(settings.minStopLossPct)}–${number(settings.maxStopLossPct)}% 止损 · 最少 ${number(settings.minRiskRewardRatio)}R · 最长 ${number(settings.maxHoldingMinutes, 0)} 分钟</dd></div><div><dt>授权时间</dt><dd>${number(settings.sessionDurationHours, 0)} 小时，最长 24 小时</dd></div></dl>`;
      el("aat-review").querySelector("dl").insertAdjacentHTML("afterbegin", `<div><dt>已选策略 · 任一命中</dt><dd>${settings.selectedStrategies.map((key) => escape(strategyNames[key])).join("、")}</dd></div>`);
      el("aat-ack-text").textContent = `我已核对配置及所选策略，授权本轮最长 ${number(settings.sessionDurationHours, 0)} 小时使用真实资金自动交易，并接受上述限额与保护规则。`;
      el("aat-ack").checked = false; el("aat-confirm-error").textContent = ""; syncControls(); dialog.showModal();
    } catch (error) { showError(error.message); }
  });
  el("aat-ack").addEventListener("change", syncControls);
  el("aat-cancel").addEventListener("click", () => dialog.close());
  el("aat-confirm").addEventListener("click", async () => {
    if (!el("aat-ack").checked || !reviewVersion || busy) return;
    try { await act("start", { version: reviewVersion, confirmation: "START_LIVE_AUTOMATION", acknowledged: true }); dialog.close(); }
    catch (error) { el("aat-confirm-error").textContent = error.message; }
  });
  el("aat-stop").addEventListener("click", async () => { try { await act("stop"); } catch (error) { showError(error.message); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) window.clearTimeout(timer); else void refresh(); });
  window.addEventListener("beforeunload", () => window.clearTimeout(timer));
  void refresh();
})();
