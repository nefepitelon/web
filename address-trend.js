(() => {
  "use strict";
  const panel = document.querySelector("#address-balance-flow");
  const mount = document.querySelector("#address-trend-mount");
  if (!panel || !mount) return;
  const viewSwitch = panel.querySelector(".address-flow-view-switch");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const DAY = 86400000;
  const REFRESH = 4 * 60 * 60 * 1000;
  const CACHE = "welinkbtc-address-trend-v1";
  const ids = ["under_1", "one_to_10", "ten_to_100", "over_100"];
  const cohorts = { under_1: "0.001–1 BTC", one_to_10: "1–10 BTC", ten_to_100: "10–100 BTC", over_100: "100+ BTC" };
  const state = { view: "pulse", bucket: "over_100", range: "4Y", data: null, points: [], start: 0, end: 0, selected: null, visible: false, switchVisible: false, loading: null, attempted: 0, frame: 0, dirty: true, suspended: false, browserCache: false };
  const zh = () => !document.documentElement.lang.toLowerCase().startsWith("en");
  const t = (cn, en) => zh() ? cn : en;
  const number = (value) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  const usd = (value) => Number.isFinite(value) ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 3 : 0 }).format(value) : "—";
  const compact = (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const dom = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const controls = dom("div", "address-trend-controls");
  const selectLabel = dom("label", "address-trend-cohort");
  const selectText = dom("span");
  const select = dom("select"); select.id = "address-trend-cohort";
  ids.forEach((id) => { const option = dom("option", "", cohorts[id]); option.value = id; select.append(option); });
  select.value = state.bucket; selectLabel.append(selectText, select);
  const periods = dom("div", "address-trend-periods"); periods.setAttribute("role", "group");
  ["1Y", "4Y", "ALL"].forEach((value) => { const button = dom("button", "", value); button.type = "button"; button.dataset.addressTrendRange = value; button.addEventListener("click", () => setRange(value)); periods.append(button); });
  controls.append(selectLabel, periods);
  const heading = dom("div", "address-trend-heading");
  const headingCopy = dom("div"); const title = dom("strong"); const timestamp = dom("small"); headingCopy.append(title, timestamp);
  const metrics = dom("div", "address-trend-metrics");
  const countMetric = dom("div"); const countLabel = dom("span"); const countValue = dom("b"); countValue.id = "address-trend-latest-count"; countMetric.append(countLabel, countValue);
  const priceMetric = dom("div", "address-trend-price"); const priceLabel = dom("span", "", "BTC / USD"); const priceValue = dom("b"); priceMetric.append(priceLabel, priceValue); metrics.append(countMetric, priceMetric); heading.append(headingCopy, metrics);
  const stage = dom("div", "address-trend-stage");
  const canvas = dom("canvas"); canvas.id = "address-trend-chart"; canvas.tabIndex = 0; canvas.setAttribute("role", "img"); stage.append(canvas);
  const readout = dom("div", "address-trend-readout"); readout.id = "address-trend-readout"; readout.setAttribute("aria-live", "polite");
  const legend = dom("div", "address-trend-legend"); const countLegend = dom("span"); const priceLegend = dom("span"); legend.append(countLegend, priceLegend);
  const nav = dom("div", "address-trend-navigator"); const overview = dom("canvas"); overview.id = "address-trend-overview"; overview.setAttribute("aria-hidden", "true"); const selection = dom("div", "address-trend-selection"); nav.append(overview, selection);
  const brush = dom("div", "address-trend-brush");
  const sliders = ["start", "end"].map((key) => { const label = dom("label"); const text = dom("span"); const input = dom("input"); input.type = "range"; input.id = `address-trend-${key}`; input.min = "0"; input.step = "1"; input.addEventListener("input", () => {
    if (!state.points.length) return;
    state.range = "CUSTOM";
    if (key === "start") state.start = Math.min(Number(input.value), state.end - 1);
    else state.end = Math.max(Number(input.value), state.start + 1);
    state.selected = null; sync(); queueDraw();
  }); label.append(text, input); brush.append(label); return { key, input, text }; });
  const bounds = dom("p", "address-trend-bounds");
  const note = dom("div", "address-trend-note");
  const source = dom("span"); const sourceLink = dom("a", "", "Bitview · Bitcoin Research Kit"); sourceLink.href = "https://bitview.space/api/"; sourceLink.target = "_blank"; sourceLink.rel = "noopener noreferrer";
  const sourceDetail = dom("span"); source.append(sourceLink, sourceDetail);
  const refresh = dom("button", "address-trend-refresh"); refresh.type = "button"; refresh.addEventListener("click", () => load(true)); note.append(source, refresh);
  const loading = dom("div", "address-trend-loading"); const loadingText = dom("span"); const retry = dom("button", "address-trend-refresh"); retry.type = "button"; retry.addEventListener("click", () => load(true)); loading.append(loadingText, retry);
  mount.classList.add("address-trend"); mount.append(controls, heading, stage, readout, legend, nav, brush, bounds, note, loading);

  function valid(payload) {
    if (payload?.ok !== true || !Array.isArray(payload.buckets) || payload.buckets.length !== 4 || !Array.isArray(payload.prices)) return false;
    const today = new Date().toISOString().slice(0, 10);
    if (!payload.buckets.every((bucket) => ids.includes(bucket.id) && Array.isArray(bucket.series) && bucket.series.length >= 2 && bucket.series.length <= 10000 && bucket.series.every((point, i, series) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && point.date <= today && Number.isSafeInteger(point.count) && point.count >= 0 && (i === 0 || point.date > series[i - 1].date)))) return false;
    return new Set(payload.buckets.map((bucket) => bucket.id)).size === 4 && payload.prices.every((point, i, series) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && point.date <= today && Number.isFinite(point.price) && point.price > 0 && (i === 0 || point.date > series[i - 1].date));
  }
  function setPoints() {
    if (!state.data) return;
    const prices = new Map(state.data.prices.map((point) => [point.date, point.price]));
    state.points = state.data.buckets.find((bucket) => bucket.id === state.bucket).series.map((point) => ({ ...point, price: prices.get(point.date) ?? null, time: Date.parse(`${point.date}T00:00:00Z`) }));
    setRange(state.range === "CUSTOM" ? "4Y" : state.range);
  }
  function setRange(range) {
    state.range = range; state.end = Math.max(0, state.points.length - 1); state.start = 0; state.selected = null;
    if (range !== "ALL" && state.points.length) {
      const after = state.points.at(-1).time - (range === "1Y" ? 365 : 1461) * DAY;
      state.start = Math.max(0, state.points.findIndex((point) => point.time >= after));
    }
    sync(); queueDraw();
  }
  function statusText() { return state.browserCache || state.data?.stale ? t("缓存快照", "CACHED SNAPSHOT") : state.data?.provisional ? t("当日暂定", "PROVISIONAL DAILY") : t("已确认日线", "CONFIRMED DAILY"); }
  function sync() {
    viewSwitch?.setAttribute("aria-label", t("地址层级展示方式", "Address cohort display mode"));
    panel.querySelectorAll("button[data-address-flow-view]").forEach((button) => {
      const isTrend = button.dataset.addressFlowView === "trend";
      button.textContent = isTrend ? t("地址趋势", "Address Trend") : t("资金脉冲", "Capital Pulse");
      button.setAttribute("aria-pressed", String(button.dataset.addressFlowView === state.view));
      button.classList.toggle("active", button.dataset.addressFlowView === state.view);
    });
    panel.dataset.addressFlowView = state.view;
    selectText.textContent = t("持仓层级", "Balance cohort"); select.setAttribute("aria-label", selectText.textContent);
    periods.setAttribute("aria-label", t("地址趋势时间范围", "Address trend period"));
    periods.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.addressTrendRange === state.range)));
    title.textContent = `${cohorts[state.bucket]} · ${t("持仓地址趋势", "Address Count Trend")}`;
    countLabel.textContent = t("最新地址总数", "LATEST ADDRESSES");
    timestamp.textContent = `${t("公开链上数据 · 日线", "PUBLIC ON-CHAIN · DAILY")} · ${state.data?.asOf || "—"} · ${statusText()}`;
    countLegend.textContent = t("持仓地址数 · 左轴", "Address count · left axis"); priceLegend.textContent = t("BTC 价格 · 右轴 USD 对数", "BTC price · right axis USD log");
    canvas.setAttribute("aria-label", `${title.textContent}. ${countLegend.textContent}. ${priceLegend.textContent}`);
    refresh.textContent = t("刷新数据 ↻", "Refresh ↻"); refresh.disabled = Boolean(state.loading);
    loadingText.textContent = state.failed ? t("公开数据暂不可用，请重试。", "Public data is temporarily unavailable. Please retry.") : t("正在同步完整公开地址历史…", "Syncing full public address history…");
    retry.textContent = t("重试", "Retry"); retry.hidden = !state.failed;
    loading.hidden = Boolean(state.data); [controls, heading, stage, readout, legend, nav, brush, bounds, note].forEach((el) => { el.hidden = !state.data; });
    sourceDetail.textContent = ` · ${state.data?.asOf || "—"} · ${t("4小时刷新 · CC BY 4.0", "4H refresh · CC BY 4.0")}`;
    const points = state.points;
    if (points.length) {
      countValue.textContent = number(points.at(-1).count); priceValue.textContent = usd(points.at(-1).price);
      sliders.forEach(({ key, input, text }) => { text.textContent = key === "start" ? t("起始", "From") : t("结束", "To"); input.setAttribute("aria-label", t("地址趋势", "Address trend") + " " + text.textContent); input.max = String(points.length - 1); input.value = String(state[key]); input.setAttribute("aria-valuetext", points[state[key]].date); });
      bounds.textContent = `${points[state.start].date} → ${points[state.end].date} · ${t("拖动下方滑块查看历史区间", "Drag the sliders to explore history")}`;
      selection.style.left = `${state.start / Math.max(1, points.length - 1) * 100}%`; selection.style.right = `${(1 - state.end / Math.max(1, points.length - 1)) * 100}%`;
      updateReadout(points[state.selected ?? state.end]);
      mount.dataset.observations = String(points.length); mount.dataset.historyFrom = points[0].date; mount.dataset.historyTo = points.at(-1).date; mount.dataset.cohort = state.bucket; mount.dataset.stale = String(state.browserCache || state.data.stale);
    }
  }
  function updateReadout(point) {
    if (!point) return;
    readout.replaceChildren(dom("strong", "", point.date), dom("span", "", `${cohorts[state.bucket]} `));
    readout.lastChild.append(dom("b", "", number(point.count)));
    readout.append(dom("span", "price", `BTC ${usd(point.price)}`));
    readout.dataset.date = point.date; readout.dataset.count = String(point.count); readout.dataset.price = point.price === null ? "" : String(point.price);
  }
  function frame(target, height) {
    const width = Math.max(1, target.getBoundingClientRect().width); const dpr = Math.min(2, window.devicePixelRatio || 1);
    target.width = Math.round(width * dpr); target.height = Math.round(height * dpr);
    const ctx = target.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); return { ctx, width, height };
  }
  function drawLine(ctx, points, x, y, key, color, lineWidth = 1.5) {
    ctx.beginPath(); let previous = null;
    points.forEach((point) => { if (!Number.isFinite(point[key])) { previous = null; return; } const px = x(point.time), py = y(point[key]); if (!previous || point.time - previous.time > 2 * DAY) ctx.moveTo(px, py); else ctx.lineTo(px, py); previous = point; });
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke();
  }
  function draw() {
    state.frame = 0;
    if (state.view !== "trend" || !state.visible || document.hidden || state.suspended || !state.points.length) return;
    state.dirty = false;
    const mobile = matchMedia("(max-width: 700px)").matches;
    const { ctx, width, height } = frame(canvas, mobile ? 330 : 390);
    const style = getComputedStyle(mount), bodyStyle = getComputedStyle(document.body);
    const gold = style.getPropertyValue("--trend-gold").trim() || "#e9c969", price = style.getPropertyValue("--trend-price").trim() || "#a8bac5";
    const ink = bodyStyle.getPropertyValue("--ink").trim() || "#eeeeee", muted = bodyStyle.getPropertyValue("--muted").trim() || "#8b949e", grid = bodyStyle.getPropertyValue("--line").trim() || "#263238";
    const points = state.points.slice(state.start, state.end + 1);
    const left = mobile ? 48 : 65, right = width - (mobile ? 49 : 65), top = 30, bottom = height - 32;
    const minTime = points[0].time, maxTime = points.at(-1).time;
    let minCount = Infinity, maxCount = -Infinity, minPrice = Infinity, maxPrice = 0;
    points.forEach((point) => { minCount = Math.min(minCount, point.count); maxCount = Math.max(maxCount, point.count); if (point.price > 0) { minPrice = Math.min(minPrice, point.price); maxPrice = Math.max(maxPrice, point.price); } });
    const margin = Math.max(1, (maxCount - minCount) * .09); minCount = Math.max(0, minCount - margin); maxCount += margin;
    const x = (time) => left + (time - minTime) / Math.max(DAY, maxTime - minTime) * (right - left);
    const y = (value) => bottom - (value - minCount) / Math.max(1, maxCount - minCount) * (bottom - top);
    const hasPrice = Number.isFinite(minPrice) && maxPrice > 0;
    const logMin = Math.log10(hasPrice ? minPrice : 1) - .05, logMax = Math.log10(hasPrice ? maxPrice : 10) + .05;
    const yp = (value) => bottom - (Math.log10(value) - logMin) / Math.max(.1, logMax - logMin) * (bottom - top);
    ctx.font = `${mobile ? 9 : 10}px "JetBrains Mono", monospace`; ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const fy = top + i / 4 * (bottom - top); ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, fy); ctx.lineTo(right, fy); ctx.stroke();
      ctx.fillStyle = gold; ctx.textAlign = "right"; ctx.fillText(compact(maxCount - i / 4 * (maxCount - minCount)), left - 8, fy);
      ctx.fillStyle = price; ctx.textAlign = "left"; ctx.fillText(hasPrice ? usd(10 ** (logMax - i / 4 * (logMax - logMin))) : "—", right + 7, fy);
    }
    ctx.fillStyle = muted; ctx.textAlign = "left"; ctx.fillText(t("地址数", "ADDRESSES"), left, 12); ctx.textAlign = "right"; ctx.fillText("BTC / USD · LOG", right, 12);
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
    const gradient = ctx.createLinearGradient(0, top, 0, bottom); gradient.addColorStop(0, gold + "30"); gradient.addColorStop(1, gold + "00");
    ctx.beginPath(); ctx.moveTo(x(points[0].time), bottom); points.forEach((point) => ctx.lineTo(x(point.time), y(point.count))); ctx.lineTo(x(points.at(-1).time), bottom); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    drawLine(ctx, points, x, yp, "price", price, mobile ? 1.2 : 1.5);
    drawLine(ctx, points, x, y, "count", gold, mobile ? 1.7 : 2);
    ["2012-11-28", "2016-07-09", "2020-05-11", "2024-04-20"].forEach((date) => {
      const time = Date.parse(`${date}T00:00:00Z`); if (time < minTime || time > maxTime) return;
      const hx = x(time); ctx.setLineDash([3, 5]); ctx.strokeStyle = "#edac6277"; ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx, bottom); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = muted; ctx.textAlign = hx > right - 85 ? "right" : "left"; ctx.fillText(`${date.slice(0, 4)} ${t("减半", "halving")}`, hx + (hx > right - 85 ? -5 : 5), top + 10);
    });
    ctx.save(); ctx.globalAlpha = .065; ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.font = `900 ${Math.max(24, Math.min(64, (right - left) / 6))}px sans-serif`; ctx.fillText("welinkBTC", (left + right) / 2, (top + bottom) / 2); ctx.restore();
    if (state.selected !== null && state.selected >= state.start && state.selected <= state.end) {
      const point = state.points[state.selected], px = x(point.time); ctx.setLineDash([3, 4]); ctx.strokeStyle = muted; ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, bottom); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(px, y(point.count), 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore(); ctx.font = `${mobile ? 9 : 10}px "JetBrains Mono", monospace`; ctx.fillStyle = muted;
    for (let i = 0; i <= (mobile ? 3 : 5); i++) { const fraction = i / (mobile ? 3 : 5); const date = new Date(minTime + fraction * (maxTime - minTime)).toISOString().slice(0, 7); ctx.textAlign = i === 0 ? "left" : i === (mobile ? 3 : 5) ? "right" : "center"; ctx.fillText(date, left + fraction * (right - left), height - 10); }
    state.geometry = { left, right, width, minTime, maxTime };
    canvas.dataset.start = points[0].date; canvas.dataset.end = points.at(-1).date; canvas.dataset.countMin = String(minCount); canvas.dataset.countMax = String(maxCount); canvas.dataset.priceScale = "log-usd";
    const small = frame(overview, 62), all = state.points; let lo = Infinity, hi = -Infinity;
    all.forEach((point) => { lo = Math.min(lo, point.count); hi = Math.max(hi, point.count); });
    const nx = (time) => (time - all[0].time) / Math.max(DAY, all.at(-1).time - all[0].time) * small.width;
    const ny = (value) => 50 - (value - lo) / Math.max(1, hi - lo) * 43;
    drawLine(small.ctx, all, nx, ny, "count", gold, 1.1);
    small.ctx.fillStyle = muted; small.ctx.font = "9px monospace"; small.ctx.fillText(all[0].date.slice(0, 4), 6, 59); small.ctx.textAlign = "right"; small.ctx.fillText(all.at(-1).date.slice(0, 4), small.width - 6, 59);
    mount.dataset.draws = String(Number(mount.dataset.draws || 0) + 1);
  }
  function queueDraw() { state.dirty = true; if (!state.frame && state.view === "trend" && state.visible && !document.hidden && !state.suspended) state.frame = requestAnimationFrame(draw); }
  function inspect(event) {
    if (!state.geometry || !state.points.length) return;
    const rect = canvas.getBoundingClientRect(), { left, right, minTime, maxTime } = state.geometry;
    const time = minTime + Math.max(0, Math.min(1, (event.clientX - rect.left - left) / (right - left))) * (maxTime - minTime);
    let low = state.start, high = state.end;
    while (low < high) { const mid = Math.floor((low + high) / 2); if (state.points[mid].time < time) low = mid + 1; else high = mid; }
    if (low > state.start && time - state.points[low - 1].time < state.points[low].time - time) low--;
    if (low === state.selected) return;
    state.selected = low; updateReadout(state.points[low]); queueDraw();
  }
  function setView(value) {
    state.view = value === "trend" ? "trend" : "pulse"; mount.hidden = state.view !== "trend";
    [panel.querySelector(".address-flow-chart-shell"), panel.querySelector("#address-flow-legend"), panel.querySelector("#address-flow-summary"), panel.querySelector("#address-flow-pulse-range"), panel.querySelector("#address-flow-status")].forEach((el) => { if (el) el.hidden = state.view === "trend"; });
    sync(); lifecycle();
    if (state.view === "pulse") window.dispatchEvent(new Event("resize"));
  }
  async function load(force = false) {
    if (state.loading || (!force && state.attempted && Date.now() - state.attempted < REFRESH)) return state.loading;
    state.attempted = Date.now(); state.failed = false;
    const task = (async () => {
      try {
        const response = await fetch(`${window.WELINKBTC_DATA_API_BASE || ""}/api/address-balance-history`, { signal: AbortSignal.timeout(25000), headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Address history request failed");
        const data = await response.json(); if (!valid(data)) throw new Error("Invalid absolute address history");
        state.data = data; state.browserCache = false; setPoints();
        try { localStorage.setItem(CACHE, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* A full archive is optional; preserve other dashboard caches. */ }
      } catch {
        if (state.data) state.browserCache = true;
        else { try { const cached = JSON.parse(localStorage.getItem(CACHE) || "null"); if (cached && Date.now() - cached.savedAt >= 0 && Date.now() - cached.savedAt < 7 * DAY && valid(cached.data)) { state.data = cached.data; state.browserCache = true; setPoints(); } } catch { /* Show an explicit unavailable state. */ } }
        if (!state.data) state.failed = true;
      } finally { state.loading = null; sync(); queueDraw(); }
    })();
    state.loading = task; sync(); return task;
  }
  function lifecycle() {
    updateSwitchMotion();
    mount.dataset.motion = state.view === "trend" && state.visible && !document.hidden && !state.suspended ? "running" : "paused";
    if (state.view === "trend" && state.visible && !document.hidden && !state.suspended) { load(); if (state.dirty) queueDraw(); }
    else if (state.frame) { cancelAnimationFrame(state.frame); state.frame = 0; }
  }
  function updateSwitchMotion() {
    if (viewSwitch) viewSwitch.dataset.motion = state.switchVisible && !document.hidden && !state.suspended && !reducedMotion.matches ? "running" : "paused";
  }
  select.addEventListener("change", () => { state.bucket = ids.includes(select.value) ? select.value : "over_100"; setPoints(); });
  panel.querySelectorAll("button[data-address-flow-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.addressFlowView)));
  canvas.addEventListener("pointermove", inspect); canvas.addEventListener("pointerdown", inspect);
  canvas.addEventListener("pointerleave", () => { state.selected = null; if (state.points.length) updateReadout(state.points[state.end]); queueDraw(); });
  canvas.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !state.points.length) return;
    event.preventDefault(); let index = state.selected ?? state.end;
    if (event.key === "Home") index = state.start; else if (event.key === "End") index = state.end; else index += event.key === "ArrowRight" ? 1 : -1;
    state.selected = Math.max(state.start, Math.min(state.end, index)); updateReadout(state.points[state.selected]); queueDraw();
  });
  const observer = "IntersectionObserver" in window ? new IntersectionObserver((entries) => { state.visible = entries.some((entry) => entry.isIntersecting); lifecycle(); }, { rootMargin: "150px 0px", threshold: 0 }) : null;
  if (observer) observer.observe(panel); else state.visible = true;
  const switchObserver = "IntersectionObserver" in window && viewSwitch ? new IntersectionObserver((entries) => {
    state.switchVisible = entries.some((entry) => entry.isIntersecting);
    updateSwitchMotion();
  }, { threshold: 0 }) : null;
  if (switchObserver) switchObserver.observe(viewSwitch); else state.switchVisible = true;
  reducedMotion.addEventListener?.("change", updateSwitchMotion);
  const resize = "ResizeObserver" in window ? new ResizeObserver(queueDraw) : null; resize?.observe(mount);
  new MutationObserver(() => { sync(); queueDraw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  new MutationObserver(queueDraw).observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
  document.addEventListener("visibilitychange", lifecycle);
  let timer = setInterval(lifecycle, 60000);
  window.addEventListener("pagehide", () => { state.suspended = true; clearInterval(timer); lifecycle(); });
  window.addEventListener("pageshow", (event) => { if (!event.persisted) return; state.suspended = false; clearInterval(timer); timer = setInterval(lifecycle, 60000); lifecycle(); });
  sync(); lifecycle();
})();
