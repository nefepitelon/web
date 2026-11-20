(() => {
  const panel = document.querySelector('#rplrm-panel');
  const canvas = panel?.querySelector('#rplrm-chart');
  if (!panel || !canvas) return;
  const cacheKey = 'welinkbtc-rplrm-v1';
  const DAY = 86400000;
  const state = { payload: null, range: 'all', projection: true, inFlight: null, plot: null, inspected: -1 };
  const el = id => panel.querySelector('#rplrm-' + id);
  const en = () => document.documentElement.lang.startsWith('en');
  const copy = (zh, english) => en() ? english : zh;
  const fmt = value => Number.isFinite(value) ? value.toFixed(2) : '—';
  const usd = value => Number.isFinite(value) ? new Intl.NumberFormat(en() ? 'en-US' : 'zh-CN', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 10 ? 2 : 0 }).format(value) : '—';
  const set = (id, text) => { const node = el(id); if (node) node.textContent = text; };
  const text = {
    subtitle: ['全周期观察盈利与亏损的相对动量，区分修复候选与持续趋势确认。', 'Track relative realized P/L momentum across cycles, separating repair candidates from sustained confirmation.'],
    price: ['BTC 实时价格', 'BTC live price'], curves: ['盈利 / 亏损相对动量', 'Profit / loss relative momentum'],
    axes: ['独立纵轴 · 非美元金额', 'Independent axes · not USD amounts'], phase: ['已确认的宏观阶段', 'Confirmed macro phase'],
    scenarioOn: ['365D 情景 · 开', '365D scenario · ON'], scenarioOff: ['365D 情景 · 关', '365D scenario · OFF'],
    loading: ['正在同步完整公开历史，计算 365 日基准与后续情景…', 'Loading public history, annual baseline and conditional scenarios…'],
    signalLabel: ['盈亏动量与周期确认', 'P/L momentum and cycle confirmation'], state: ['综合状态 S', 'Composite state S'],
    positive: ['近 30 日正动量', 'Positive observations / 30D'], easing: ['亏损压力边际变化', 'Marginal loss pressure'], chainDate: ['链上观测日期', 'On-chain observation'],
    explainTitle: ['观察亏损衰减、动量翻正与价格结构能否共同确认。', 'Look for confluence between fading loss pressure, positive momentum and price structure.'],
    formula: ['公开重建公式：M = RPLR 的 7 日均值 ÷ 365 日均值；绿线 = max(M−1, 0)，红线 = min(1−1/M, 0)；底部 S = (M−1)/(M+1)。两条彩线是同一相对比率的非对称变换，采用独立刻度，不能用高度比较实际盈利、亏损金额。', 'Public reconstruction: M = SMA7(RPLR) / SMA365(RPLR). Green = max(M−1, 0); red = min(1−1/M, 0); S = (M−1)/(M+1). The colored lines are asymmetric transforms of one relative ratio on independent scales. Their heights do not compare USD profit and loss.'],
    phaseRule: ['A／B 背景按 log(M) 的 90 日均值方向、连续 30 次观测确认，切换以确认日为准，不回填历史起点。短暂翻红不自动构成新熊市，翻绿也不是永久价格底部保证。', 'A/B uses the sign of the 90-day mean of log(M), confirmed over 30 observations without backdating. A short negative turn is not automatically a new bear market; a positive turn does not guarantee a permanent price floor.'],
    interpretation: ['红色谷值收窄只说明相对亏损压力减弱，也可能来自链上活跃度下降。绿色峰值回落既可能是正常降温，也可能是背离，需要结合实际金额、现货成交、资金流及价格结构核验。', 'Shallower red troughs indicate weaker relative loss pressure, potentially also lower activity. Smaller green peaks may reflect cooling or divergence; cross-check realized amounts, spot volume, flows and price structure.'],
    projectionCopy: ['虚线从最新观测延伸 365 天，结合全历史已完成同阶段样本与近 30 日动量衰减。阴影是情景敏感区间，不是置信区间；推演不生成未来 BTC 价格，也不承诺周期结束日期。新增日线后自动重算。', 'Dashed scenarios extend 365 days using completed historical same-phase analogues and damped recent momentum. Shading shows sensitivity, not a confidence interval. There is no future BTC price or guaranteed cycle end date. New observations trigger recalculation.'],
    disclosure: ['数据优先使用 BGeometrics 公开全历史与独立镜像，保留带日期的本地归档；现价来自 Binance。公开 UTXO 数据未进行 Glassnode 专有地址聚类，因此本模型不等同于原图实体调整序列，不能复刻其未公开公式或强行复现历史分区。', 'BGeometrics public history and an independent mirror are backed by a dated local archive; spot price comes from Binance. Public UTXO observations lack proprietary Glassnode clustering. This reconstruction does not claim the original entity-adjusted formula or identical historical partitions.']
  };

  function labels() {
    panel.querySelectorAll('[data-rplrm-copy]').forEach(node => { const value = text[node.dataset.rplrmCopy]; if (value) node.textContent = value[en() ? 1 : 0]; });
    el('projection').textContent = text[state.projection ? 'scenarioOn' : 'scenarioOff'][en() ? 1 : 0];
  }
  function valid(payload) {
    return payload?.ok && payload.schema === 1 && payload.entityAdjusted === false && payload.snapshot
      && Array.isArray(payload.series) && payload.series.length >= 365
      && payload.series.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && [row.price, row.momentum, row.state].every(Number.isFinite))
      && payload.series.at(-1).date === payload.snapshot.onchainAsOf;
  }
  function apply(payload, fallback = false) {
    if (!valid(payload)) return false;
    state.payload = { ...payload, browserFallback: fallback };
    el('loading').hidden = true;
    const surf = panel.querySelector('[data-surf-model]'); if (surf) surf.disabled = false;
    summarize(); draw(); return true;
  }
  function summarize() {
    labels();
    const data = state.payload;
    if (!data) return;
    const s = data.snapshot, coverage = data.historyCoverage;
    panel.querySelector('[data-rplrm-copy="price"]').textContent = s.liveSpot ? copy('BTC 实时价格', 'BTC live price') : copy('BTC 最近可用价格', 'Last available BTC price');
    const stale = data.stale || Date.now() - Date.parse(s.onchainAsOf) > 3 * DAY;
    set('price', usd(s.price));
    set('price-date', `${data.sources.spot} · ${s.priceAsOf.replace('T', ' ').slice(0, 19)} UTC`);
    set('momentum', fmt(s.momentum) + '×');
    set('direction', s.state > 0 ? copy('正动量 · 修复候选', 'Positive · repair candidate') : copy('负动量 · 继续观察', 'Negative · confirmation pending'));
    set('curves', `+${fmt(s.profitMomentum)} / ${fmt(s.lossMomentum)}`);
    set('phase', `${s.phase} · ${fmt(s.phaseMonths)} ${copy('个月', 'months')}`);
    set('phase-date', `${s.phaseStart || '—'} · ${s.phaseDays}D`);
    set('state', fmt(s.state)); set('positive', `${s.positiveDays30} / 30`);
    set('easing', s.negativePressureEasing ? copy('后半窗谷值收窄', 'Later troughs are shallower') : copy('尚未确认衰减', 'Easing not confirmed'));
    set('chain-date', s.onchainAsOf);
    set('status', `${copy('公开重建', 'PUBLIC RECONSTRUCTION')} · ${coverage.from} → ${coverage.to} · ${coverage.observations} ${copy('个观测', 'observations')}${stale ? copy(' · 数据滞后', ' · STALE') : ''}`);
    set('source', `${data.archiveFallback || data.browserFallback ? 'DATED ARCHIVE · ' : ''}PUBLIC UTXO · DAILY · ${s.onchainAsOf}`);
    set('signal-title', s.state > 0 ? copy('动量转正是修复候选，仍需持续确认', 'Positive momentum is a repair candidate, not a guarantee') : copy('亏损相对动量仍占优，观察修复能否延续', 'Relative loss momentum still dominates'));
    set('signal-copy', copy(
      `截至 ${s.onchainAsOf}，M 为 ${fmt(s.momentum)}，综合状态 ${fmt(s.state)}；近 30 日有 ${s.positiveDays30} 个正动量观测。已确认 ${s.phase} 阶段从 ${s.phaseStart} 起持续 ${s.phaseDays} 天。实时 BTC 现价与链上日线日期分开显示，参考图的 11 个月不会覆盖实时计算结果。`,
      `As of ${s.onchainAsOf}, M is ${fmt(s.momentum)} and S is ${fmt(s.state)}, with ${s.positiveDays30} positive observations in 30 days. Confirmed phase ${s.phase} has lasted ${s.phaseDays} days since ${s.phaseStart}. Live spot and daily on-chain dates are separate; the supplied eleven-month illustration does not override measured data.`));
    set('sample-summary', copy(`完整历史中，已完成且不少于 90 天的 A 区样本 ${s.closedASamples} 个，中位时长 ${s.medianADays ? Math.round(s.medianADays) : '—'} 天。样本量有限，不据此计算确定的底部概率。`, `${s.closedASamples} completed A phases lasted at least 90 days; median ${s.medianADays ? Math.round(s.medianADays) : '—'} days. The limited sample does not establish a guaranteed floor probability.`));
    const history = el('history'); history.replaceChildren();
    for (const ref of data.referenceSpans || []) {
      const card = document.createElement('div');
      const title = document.createElement('span'), value = document.createElement('strong');
      title.textContent = ref.cycle; value.textContent = `${ref.months} ${copy('个月', 'months')}`;
      card.append(title, value); history.append(card);
    }
  }

  function visibleRows() {
    const rows = state.payload?.series || [];
    if (state.range === 'all' || !rows.length) return rows;
    const start = Date.parse(rows.at(-1).date) - (Number(state.range) - 1) * DAY;
    return rows.filter(row => Date.parse(row.date) >= start);
  }
  function draw() {
    if (window.WelinkDashboardChartScheduler?.request('#rplrm-chart', draw)) return;
    const rows = visibleRows(); if (!rows.length) return;
    const context = canvas.getContext('2d'); if (!context) return;
    const rect = canvas.getBoundingClientRect(), width = Math.max(280, rect.width), height = Math.max(480, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); context.scale(dpr, dpr);
    const dark = document.body.dataset.theme !== 'light', compact = width < 600;
    const fg = dark ? '#a6b6b0' : '#50635b', grid = dark ? 'rgba(151,183,165,.13)' : 'rgba(72,103,84,.15)';
    context.fillStyle = dark ? '#0e1412' : '#f7faf7'; context.fillRect(0, 0, width, height);
    const left = compact ? 54 : 76, right = width - (compact ? 68 : 116), top = 42;
    const bottom = height - 151, zero = top + (bottom - top) * .57, bandTop = bottom + 23, bandBottom = height - 40;
    const projection = state.projection ? state.payload.projection || [] : [];
    const start = Date.parse(rows[0].date), last = Date.parse(rows.at(-1).date);
    // A short historical range gets a proportionate forward window, retaining readability.
    const horizon = state.range === 'all' ? 365 : Math.max(7, Math.min(365, Number(state.range)));
    const forecast = projection.filter(row => Date.parse(row.date) <= last + horizon * DAY);
    const end = forecast.at(-1) ? Date.parse(forecast.at(-1).date) : last;
    const x = date => left + (Date.parse(date) - start) / Math.max(DAY, end - start) * (right - left);
    const greenMax = Math.max(1, ...rows.map(row => row.profitMomentum), ...forecast.map(row => row.profitMomentum)) * 1.08;
    const redMax = Math.max(1, ...rows.map(row => Math.abs(row.lossMomentum || 0)), ...forecast.map(row => Math.abs(row.lossMomentum || 0))) * 1.08;
    const prices = rows.map(row => Math.log(row.price)), low = Math.min(...prices) - .12, high = Math.max(...prices) + .12;
    const yp = price => bottom - (Math.log(price) - low) / Math.max(.1, high - low) * (bottom - top);
    const yg = value => zero - value / greenMax * (zero - top);
    const yr = value => zero + -value / redMax * (bottom - zero);
    const ys = value => bandBottom - (value + 1) / 2 * (bandBottom - bandTop);
    state.plot = { x, rows, forecast, left, right, width, height };

    // Confirmed macro phases are data-driven, rather than copied date spans.
    for (const phase of state.payload.phases || []) {
      const a = Math.max(start, Date.parse(phase.startDate)), b = Math.min(last, Date.parse(phase.endDate) + DAY);
      if (a >= b) continue;
      const xa = x(new Date(a).toISOString().slice(0, 10)), xb = x(new Date(b).toISOString().slice(0, 10));
      context.fillStyle = phase.phase === 'A' ? 'rgba(240,106,104,.075)' : 'rgba(70,210,143,.065)'; context.fillRect(xa, top, xb - xa, bottom - top);
      if (xb - xa > 60) {
        context.fillStyle = phase.phase === 'A' ? '#e98694' : '#58cba0'; context.font = `700 ${compact ? 11 : 13}px monospace`;
        context.textAlign = 'center'; context.fillText(`${phase.phase} · ${phase.months.toFixed(1)}M`, (xa + xb) / 2, top + 18);
      }
    }
    context.font = `${compact ? 9 : 11}px monospace`; context.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = top + (bottom - top) * i / 5;
      context.strokeStyle = grid; context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke();
      context.fillStyle = fg; context.fillText(usd(Math.exp(high - (high - low) * i / 5)), left - 8, y + 4);
    }
    context.textAlign = 'left'; context.fillStyle = '#62d8a0'; context.fillText('PROFIT', right + 5, 18);
    context.fillStyle = '#ef8c87'; context.fillText('LOSS', right + (compact ? 34 : 65), 32);
    for (let i = 0; i <= 3; i++) {
      const g = greenMax * i / 3, r = -redMax * i / 3;
      context.fillStyle = '#62d8a0'; context.fillText(g.toFixed(1), right + 5, yg(g) + 4);
      context.fillStyle = '#ef8c87'; context.fillText(r.toFixed(1), right + (compact ? 34 : 65), yr(r) + 4);
    }
    context.strokeStyle = grid; context.setLineDash([3, 4]); context.beginPath(); context.moveTo(left, zero); context.lineTo(right, zero); context.stroke(); context.setLineDash([]);
    function line(data, key, yFor, color, dashed = false, weight = 1.5) {
      context.strokeStyle = color; context.lineWidth = weight; context.setLineDash(dashed ? [5, 5] : []); context.beginPath();
      let previous = null;
      for (const row of data) {
        const v = row[key]; if (!Number.isFinite(v)) { previous = null; continue; }
        const px = x(row.date), py = yFor(v);
        if (!previous || Date.parse(row.date) - Date.parse(previous.date) > (dashed ? 10 : 3) * DAY) context.moveTo(px, py); else context.lineTo(px, py);
        previous = row;
      }
      context.stroke(); context.setLineDash([]);
    }
    context.save(); context.beginPath(); context.rect(left, top, right - left, bottom - top); context.clip();
    line(rows, 'price', yp, dark ? '#a7aca8' : '#545b57', false, 1.55);
    line(rows, 'profitMomentum', yg, '#31c68c', false, 1.7); line(rows, 'lossMomentum', yr, '#ee7978', false, 1.6);
    line(forecast, 'profitMomentum', yg, '#31c68c', true); line(forecast, 'lossMomentum', yr, '#ee7978', true);
    context.restore();
    // The shared watermark applies its own opacity; keep its text color opaque.
    context.save(); context.fillStyle = dark ? '#b8d1bf' : '#2d503c';
    context.textAlign = 'center'; context.font = `800 ${Math.max(30, Math.min(92, width * .085, height * .16))}px Inter`;
    if (window.WelinkChartBrandWatermark) window.WelinkChartBrandWatermark(context, (left + right) / 2, (top + bottom) / 2 + 30);
    else {
      context.globalAlpha = .065;
      context.fillText('welinkBTC', (left + right) / 2, (top + bottom) / 2 + 30);
    }
    context.restore();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], next = rows[i + 1];
      const a = x(row.date), b = next ? Math.min(x(next.date), a + Math.max(2, (right - left) / rows.length * 3)) : a + 1;
      context.fillStyle = row.state >= 0 ? 'rgba(47,199,141,.24)' : 'rgba(239,115,114,.23)'; context.fillRect(a, Math.min(ys(0), ys(row.state)), Math.max(1, b - a), Math.abs(ys(row.state) - ys(0)));
    }
    if (forecast.length > 1) {
      context.fillStyle = 'rgba(140,157,195,.13)'; context.beginPath();
      forecast.forEach((row, i) => i ? context.lineTo(x(row.date), ys(row.highState)) : context.moveTo(x(row.date), ys(row.highState)));
      [...forecast].reverse().forEach(row => context.lineTo(x(row.date), ys(row.lowState))); context.closePath(); context.fill();
    }
    context.strokeStyle = grid; context.beginPath(); context.moveTo(left, ys(0)); context.lineTo(right, ys(0)); context.stroke();
    line(rows, 'state', ys, dark ? '#d7e2dc' : '#243c30', false, 1.4); line(forecast, 'state', ys, '#b39ce8', true, 1.8);
    context.fillStyle = fg; context.font = `${compact ? 9 : 11}px monospace`; context.textAlign = 'right';
    context.fillText('+1', left - 8, bandTop + 6); context.fillText('0', left - 8, ys(0) + 3); context.fillText('−1', left - 8, bandBottom + 3);
    context.textAlign = 'left'; context.fillText('S · COMPOSITE', left + 4, bandTop - 6);
    if (forecast.length > 1) {
      context.strokeStyle = '#9990ba'; context.setLineDash([3, 4]); context.beginPath(); context.moveTo(x(rows.at(-1).date), top); context.lineTo(x(rows.at(-1).date), bandBottom); context.stroke(); context.setLineDash([]);
      context.fillStyle = '#b4a5d0'; context.textAlign = 'right'; context.fillText(copy('条件情景 →', 'SCENARIO →'), right - 4, bandTop - 6);
    }
    const ticks = compact ? 3 : 6;
    for (let i = 0; i < ticks; i++) {
      const time = start + (end - start) * i / (ticks - 1), date = new Date(time).toISOString().slice(0, 10);
      context.fillStyle = fg; context.textAlign = i === 0 ? 'left' : i === ticks - 1 ? 'right' : 'center';
      context.fillText(state.range === 'all' || state.range === '365' ? date.slice(0, 7) : date.slice(5), x(date), height - 13);
    }
    canvas.dataset.historyFrom = rows[0].date; canvas.dataset.historyTo = rows.at(-1).date;
    canvas.dataset.observations = String(rows.length); canvas.dataset.scenario = String(state.projection);
  }

  function inspect(index, clientX = null, clientY = null) {
    const plot = state.plot; if (!plot) return;
    const all = [...plot.rows, ...plot.forecast.filter(row => row.date > plot.rows.at(-1).date)];
    const row = all[Math.max(0, Math.min(all.length - 1, index))]; if (!row) return;
    state.inspected = index;
    const tooltip = el('tooltip');
    tooltip.textContent = `${row.date}${row.scenario ? copy(' · 条件情景', ' · SCENARIO') : ''}\n${row.price ? `BTC ${usd(row.price)}\n` : ''}M ${fmt(row.momentum)}×\n${copy('盈利动量', 'Profit')} +${fmt(row.profitMomentum)}\n${copy('亏损动量', 'Loss')} ${fmt(row.lossMomentum)}\nS ${fmt(row.state)}`;
    const rect = canvas.getBoundingClientRect(), x = clientX === null ? plot.x(row.date) : clientX - rect.left, y = clientY === null ? 70 : clientY - rect.top;
    tooltip.hidden = false; tooltip.style.left = `${Math.max(8, Math.min(plot.width - 204, x + 12))}px`; tooltip.style.top = `${Math.max(8, Math.min(plot.height - 160, y - 40))}px`;
  }
  canvas.addEventListener('pointermove', event => {
    const plot = state.plot; if (!plot) return;
    const x = event.clientX - canvas.getBoundingClientRect().left;
    const all = [...plot.rows, ...plot.forecast.filter(row => row.date > plot.rows.at(-1).date)];
    let index = 0, distance = Infinity;
    all.forEach((row, i) => { const d = Math.abs(plot.x(row.date) - x); if (d < distance) { index = i; distance = d; } });
    inspect(index, event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerleave', () => { el('tooltip').hidden = true; });
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape') { el('tooltip').hidden = true; return; }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); inspect(Math.max(0, state.inspected + (event.key === 'ArrowRight' ? 1 : -1)));
  });

  async function load(force = false) {
    if (state.inFlight) return state.inFlight;
    state.inFlight = (async () => {
      el('refresh').disabled = true;
      if (!state.payload) {
        try { const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (cached && Date.now() - Date.parse(cached.snapshot?.onchainAsOf) < 7 * DAY) apply(cached, true); } catch { /* Optional browser cache. */ }
      }
      try {
        const base = window.WELINKBTC_DATA_API_BASE || '';
        const response = await fetch(`${base}/api/rplr-m${force ? '?refresh=1' : ''}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(28000), cache: 'no-store' });
        if (!response.ok) throw new Error(`RPLR-M HTTP ${response.status}`);
        const payload = await response.json(); if (!apply(payload)) throw new Error('Invalid RPLR-M payload');
        try { localStorage.setItem(cacheKey, JSON.stringify(payload)); } catch { /* Storage cannot prevent rendering. */ }
      } catch (error) {
        if (state.payload) { state.payload.browserFallback = true; summarize(); set('status', el('status').textContent + copy(' · 刷新失败，保留观测', ' · REFRESH FAILED; DATED DATA RETAINED')); }
        else { el('loading').hidden = false; el('loading').textContent = copy('数据暂不可用，点击重试', 'Data unavailable. Click to retry.'); }
      } finally { el('refresh').disabled = false; }
    })();
    try { return await state.inFlight; } finally { state.inFlight = null; }
  }
  const save = (blob, filename) => { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  el('download').addEventListener('click', () => {
    if (!state.payload) return;
    const keys = ['date', 'price', 'ratio', 'ratio7', 'ratio365', 'momentum', 'profitMomentum', 'lossMomentum', 'state', 'macroPhase', 'coverage7', 'coverage365'];
    const rows = state.payload.series.map(row => keys.map(key => row[key] ?? '').join(','));
    save(new Blob(['\uFEFF' + [keys.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), 'welinkbtc-rplrm-full-history.csv');
  });
  el('snapshot').addEventListener('click', () => {
    if (!state.payload) return;
    window.WelinkDashboardChartScheduler?.flush('#rplrm-chart');
    canvas.toBlob(blob => { if (blob) save(blob, 'welinkbtc-rplrm-' + state.range + '.png'); });
  });
  el('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement === panel) await document.exitFullscreen(); else await panel.requestFullscreen(); } catch { /* Fullscreen is browser-controlled. */ } draw(); });
  panel.querySelectorAll('[data-chart-tabs="rplrm"] button').forEach(button => button.addEventListener('click', () => {
    state.range = button.dataset.range;
    panel.querySelectorAll('[data-chart-tabs="rplrm"] button').forEach(node => { node.classList.toggle('active', node === button); node.setAttribute('aria-pressed', String(node === button)); });
    el('tooltip').hidden = true; draw();
  }));
  el('projection').addEventListener('click', () => { state.projection = !state.projection; el('projection').setAttribute('aria-pressed', String(state.projection)); labels(); draw(); });
  el('refresh').addEventListener('click', () => load(true)); el('loading').addEventListener('click', () => load(true));
  document.querySelector('#refresh-data')?.addEventListener('click', () => { if (state.payload) void load(true); });
  let drawFrame = null;
  const scheduleDraw = () => { if (drawFrame !== null) cancelAnimationFrame(drawFrame); drawFrame = requestAnimationFrame(() => { drawFrame = null; summarize(); draw(); }); };
  new ResizeObserver(scheduleDraw).observe(canvas.parentElement);
  new MutationObserver(scheduleDraw).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  new MutationObserver(scheduleDraw).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('fullscreenchange', scheduleDraw);
  let lastRefresh = 0;
  const refreshIfDue = () => { if (state.payload && !document.hidden && Date.now() - lastRefresh > 10 * 60000) { lastRefresh = Date.now(); void load(); } };
  document.addEventListener('visibilitychange', refreshIfDue);
  setInterval(refreshIfDue, 60000);
  const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting) && !state.payload) { observer.disconnect(); void load(); } }, { rootMargin: '500px' });
  observer.observe(panel);
  const surf = panel.querySelector('[data-surf-model]'); if (surf) surf.disabled = true;
  window.WelinkRplrm = {
    load, draw, visibleRows,
    snapshot: () => state.payload ? { ...state.payload.snapshot, entityAdjusted: false,
      model: state.payload.methodology.momentum, curves: state.payload.methodology.curves,
      projection: state.payload.methodology.projection,
      measuredPhases: state.payload.phases.slice(-5).map(phase => `${phase.phase}:${phase.startDate}/${phase.endDate}:${phase.days}d`).join('; '),
      suppliedReferenceMonths: '14/13/11; not measured current durations',
      source: 'BGeometrics public UTXO; proprietary Glassnode adjustment unavailable' } : null
  };
  labels();
})();
