(() => {
  if (window.WelinkAssetDailyReport) return;
  const BRAND = new URL('assets/welinkbtc-orbit-brand.webp', document.baseURI).href;
  const SITE = 'https://www.welinkbtc-onchainmain.xyz/dashboard';
  const state = { assetId: null, asset: null, data: null, origin: null, sequence: 0, controller: null, aiController: null, aiPending: false, exporting: false, timer: 0, previousOverflow: '', cache: new Map() };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const dialog = document.createElement('dialog');
  dialog.id = 'asset-daily-report'; dialog.className = 'asset-daily-report'; dialog.setAttribute('aria-labelledby', 'asset-daily-report-title');
  dialog.innerHTML = '<div class="adr-toolbar"><span class="adr-toolbar-title">welinkBTC · 资产研究日报</span><div class="adr-actions"><button type="button" class="adr-button" id="asset-daily-report-refresh">↻ 刷新</button><button type="button" class="adr-button adr-button-primary" id="asset-daily-report-save" disabled>保存图片</button><button type="button" class="adr-button" id="asset-daily-report-share" hidden>分享</button><button type="button" class="adr-button adr-close" id="asset-daily-report-close" aria-label="关闭完整日报">×</button></div></div><div class="adr-scroll" tabindex="0"></div><p class="adr-notice" role="status" aria-live="polite" hidden></p>';
  document.body.append(dialog);
  const scroll = dialog.querySelector('.adr-scroll'), notice = dialog.querySelector('.adr-notice');
  const closeButton = dialog.querySelector('#asset-daily-report-close'), saveButton = dialog.querySelector('#asset-daily-report-save'), shareButton = dialog.querySelector('#asset-daily-report-share'), refreshButton = dialog.querySelector('#asset-daily-report-refresh');
  const element = (tag, cls, parent, value) => { const node = document.createElement(tag); if (cls) node.className = cls; if (value !== undefined && value !== null) node.textContent = String(value); if (parent) parent.append(node); return node; };
  const array = value => Array.isArray(value) ? value : [];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const millis = value => typeof value === 'number' ? value < 1e11 ? value * 1000 : value : Date.parse(value);
  const date = (value, short = false) => { const time = millis(value); return Number.isFinite(time) ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...(short ? { month: '2-digit', day: '2-digit' } : { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) }).format(time) : '时间未提供'; };
  const money = (value, precise = false) => finite(value) ? new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 1 ? 5 : precise ? 2 : 1, notation: !precise && Math.abs(value) >= 1e5 ? 'compact' : 'standard' }).format(value) : '—';
  const pct = value => finite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
  const safeUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
  const link = (parent, label, url, cls = '') => { const href = safeUrl(url), node = element(href ? 'a' : 'span', cls, parent, label); if (href) { node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; } return node; };
  const groupName = group => ({ crypto: '加密资产', stocks: '股票参考合约', indices: '指数 / ETF 参考合约', commodities: '商品参考合约' })[group] || group || '市场资产';
  const metric = trend => {
    if (!finite(trend.current)) return '—';
    const unit = String(trend.unit || '');
    if (/usd|dollar|\$/i.test(unit)) return money(trend.current);
    if (/%|percent/i.test(unit)) return `${trend.current.toLocaleString('zh-CN', { maximumFractionDigits: 3 })}%`;
    return `${trend.current.toLocaleString('zh-CN', { notation: Math.abs(trend.current) >= 1e6 ? 'compact' : 'standard', maximumFractionDigits: 3 })}${unit && !/count|number/i.test(unit) ? ` ${unit}` : ''}`;
  };
  const points = (series, price = false) => array(series).map(row => ({ time: row.time ?? row.date ?? row.timestamp, value: price ? row.close ?? row.value : row.value ?? row.close })).filter(row => finite(row.value) && Number.isFinite(millis(row.time)));
  const evidenceStatus = (data, pending = false, error = false) => pending ? 'AI 生成中' : data.evidence?.status === 'ready' && /surf|ai/i.test(String(data.evidence?.method)) ? 'AI 已就绪' : error ? 'AI 暂不可用 · 规则研判' : '公开数据规则研判';
  const compactDate = value => date(value).replace(/^\d{4}\//, '');
  function syncMotion() { dialog.dataset.motion = dialog.open && !document.hidden && !reducedMotion.matches ? 'running' : 'paused'; }

  function setNotice(message) { notice.hidden = !message; notice.textContent = message || ''; }
  function controls() {
    const available = Boolean(state.data && dialog.open), busy = state.exporting || state.aiPending;
    saveButton.disabled = !available || busy; shareButton.disabled = !available || busy; refreshButton.disabled = state.exporting || dialog.dataset.state === 'loading';
    saveButton.textContent = state.exporting ? '生成图片中…' : state.aiPending ? '研判生成中…' : '保存图片';
    shareButton.hidden = typeof navigator.share !== 'function';
  }
  function section(parent, title, subtitle) { const node = element('section', 'adr-section', parent), head = element('div', 'adr-section-head', node); element('h3', '', head, title); if (subtitle) element('span', '', head, subtitle); return node; }
  function empty(parent, message) { return element('p', 'adr-empty', parent, message); }
  function badge(parent, label, tone) { const node = element('span', 'adr-badge', parent, label); if (tone) node.dataset.tone = tone; return node; }
  function spark(parent, observations, color, fill = true) {
    const values = observations.map(row => row.value), width = 600, height = 160, pad = 10;
    if (values.length < 2) return element('div', 'adr-chart-empty', parent, '有效历史观测不足');
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.classList.add('adr-spark'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${values.length} 条真实历史观测走势`);
    const lower = Math.min(...values), upper = Math.max(...values), range = upper - lower || Math.max(Math.abs(upper) * .02, 1), start = millis(observations[0].time), duration = millis(observations[observations.length - 1].time) - start || 1;
    const path = observations.map((point, index) => `${index ? 'L' : 'M'}${(pad + (millis(point.time) - start) / duration * (width - 2 * pad)).toFixed(2)},${(height - pad - (point.value - lower) / range * (height - 2 * pad)).toFixed(2)}`).join(' ');
    for (const fraction of [.2, .5, .8]) { const line = document.createElementNS(ns, 'path'); line.setAttribute('d', `M0 ${height * fraction}H${width}`); line.setAttribute('stroke', '#7593b526'); line.setAttribute('stroke-width', '1'); svg.append(line); }
    if (fill) { const area = document.createElementNS(ns, 'path'); area.setAttribute('d', `${path}L${width - pad},${height}L${pad},${height}Z`); area.setAttribute('fill', color); area.setAttribute('opacity', '.07'); svg.append(area); }
    const line = document.createElementNS(ns, 'path'); line.setAttribute('d', path); line.setAttribute('fill', 'none'); line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2.7'); line.setAttribute('vector-effect', 'non-scaling-stroke'); line.setAttribute('stroke-linejoin', 'round'); svg.append(line);
    const last = observations[observations.length - 1], circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', width - pad); circle.setAttribute('cy', height - pad - (last.value - lower) / range * (height - 2 * pad)); circle.setAttribute('r', '4'); circle.setAttribute('fill', '#fa6baa'); circle.setAttribute('stroke', '#fff'); circle.setAttribute('stroke-width', '1.5'); svg.append(circle); parent.append(svg);
  }
  function stream(parent, items) {
    const list = element('ol', 'adr-stream', parent);
    for (const item of items) {
      const row = element('li', '', list); row.dataset.kind = item.kind || 'news';
      row.dataset.eventKey = `${parent.querySelector('h3')?.textContent || 'events'}::${item.id || item.url || `${item.publishedAt || item.asOf || ''}::${item.title || ''}`}`;
      const details = element('details', '', row), summary = element('summary', '', details);
      const time = element('time', '', summary, compactDate(item.publishedAt || item.asOf)); if (Number.isFinite(millis(item.publishedAt || item.asOf))) time.dateTime = new Date(millis(item.publishedAt || item.asOf)).toISOString();
      element('h4', '', summary, item.title || '公开事件'); const toggle = element('span', 'adr-event-toggle', summary, '+'); toggle.setAttribute('aria-hidden', 'true');
      const body = element('div', 'adr-event-body', details);
      if (item.summary) element('p', '', body, item.summary);
      link(body, `${item.sourceName || '公开来源'} · 查看原文 ↗`, item.url);
    }
  }
  function render() {
    const data = state.data; if (!data) return;
    const previousScroll = scroll.scrollTop, previousEventsScroll = scroll.querySelector('.adr-events')?.scrollTop || 0, sameAsset = scroll.querySelector('.adr-sheet')?.dataset.asset === data.asset.id;
    const expanded = new Set(sameAsset ? [...scroll.querySelectorAll('.adr-stream details[open]')].map(node => node.parentElement.dataset.eventKey) : []), expandedSignals = new Set(sameAsset ? [...scroll.querySelectorAll('.adr-signal[open]')].map(node => node.dataset.signalKey) : []);
    const active = document.activeElement, focusedRow = sameAsset && scroll.contains(active) ? active.closest('.adr-stream > li') : null;
    const focusState = focusedRow ? { key: focusedRow.dataset.eventKey, selector: active.matches('summary') ? 'summary' : active.matches('a') ? '.adr-event-body a' : null } : null;
    const focusedSignal = sameAsset && scroll.contains(active) ? active.closest('.adr-signal') : null, signalFocusKey = focusedSignal && active.matches('summary') ? focusedSignal.dataset.signalKey : null, eventsFocused = sameAsset && active.matches('.adr-events');
    const sheet = element('article', 'adr-sheet'); sheet.dataset.asset = data.asset.id;
    const layout = element('div', 'adr-layout', sheet), main = element('div', 'adr-main', layout);
    const brandRow = element('div', 'adr-brand-row', main), brand = element('div', 'adr-brand', brandRow), img = element('img', '', brand); img.src = BRAND; img.alt = 'welinkBTC 品牌图标'; img.width = 58; img.height = 58;
    const brandCopy = element('div', '', brand); element('strong', '', brandCopy, 'welinkBTC'); element('small', '', brandCopy, '链上证据 · 市场情报 · 周期研究');
    const edition = element('div', 'adr-edition', brandRow, date(data.generatedAt)); element('span', '', edition, 'SHANGHAI · DAILY INTELLIGENCE');
    const hero = element('header', 'adr-hero', main);
    const title = element('h2', '', hero); title.id = 'asset-daily-report-title'; element('b', '', title, data.asset.symbol); element('span', '', title, '完整日报');
    const badges = element('div', 'adr-badges', hero);
    if (data.stale) badge(badges, '历史数据快照', 'warning');
    badge(badges, evidenceStatus(data, state.aiPending, state.aiError), 'purple');
    badge(badges, '公开永续合约');
    element('p', 'adr-subtitle', main, `${data.asset.name || data.asset.symbol} · ${groupName(data.asset.group)} · 市场趋势 / 证据研判 / 最新事件`);
    const overview = element('div', 'adr-overview', main), market = element('div', 'adr-market', overview);
    const quote = data.quote || {}, quoteBox = element('div', 'adr-quote', market);
    const priceCell = element('div', '', quoteBox); element('small', '', priceCell, '标记价格 · USD'); element('strong', 'adr-price', priceCell, money(quote.price, true)); element('em', finite(quote.change24hPct) ? quote.change24hPct >= 0 ? 'adr-up' : 'adr-down' : '', priceCell, `${pct(quote.change24hPct)} · 24H`);
    for (const [label, value] of [['24H 成交额', quote.volume24hUsd], ['持仓名义金额', quote.openInterestUsd]]) { const cell = element('div', '', quoteBox); element('small', '', cell, label); element('strong', '', cell, money(value)); }
    const fundingCell = element('div', 'adr-funding', quoteBox); element('small', '', fundingCell, '当前资金费率 · 每小时'); element('strong', '', fundingCell, finite(quote.fundingRate) ? `${(quote.fundingRate * 100).toFixed(4)}%` : '—');
    element('span', 'adr-quote-stamp', fundingCell, `行情采集 ${date(quote.asOf)} CST${quote.status === 'stale' ? ' · 历史快照' : ''}`);
    const pricePoints = points(data.priceSeries, true), priceSection = section(market, '市场价格趋势', pricePoints.length > 1 ? `${date(pricePoints[0].time, true)} — ${date(pricePoints[pricePoints.length - 1].time, true)}` : '公开历史观测');
    const chartCard = element('div', 'adr-card adr-price-chart', priceSection), chartHead = element('div', 'adr-chart-head', chartCard); element('strong', '', chartHead, `${data.asset.symbol} / USD`); element('small', '', chartHead, `公开合约日线收盘 · ${pricePoints.length} 条${array(data.priceSeries).some(point => point.provisional) ? ' · 当日未结' : ''}`);
    spark(element('div', 'adr-chart-wrap', chartCard), pricePoints, '#61e7ee'); const axis = element('div', 'adr-chart-axis', chartCard);
    if (pricePoints.length) { element('span', '', axis, date(pricePoints[0].time, true)); element('span', '', axis, date(pricePoints[pricePoints.length - 1].time, true)); }

    const evidence = data.evidence || {}, evSection = section(overview, 'AI 证据研判', evidenceStatus(data, state.aiPending, state.aiError)), evCard = element('div', 'adr-card', evSection); evSection.classList.add('adr-evidence');
    element('p', 'adr-evidence-summary', evCard, evidence.summary || '等待公开证据汇总。');
    const signals = element('div', 'adr-signals', evCard);
    for (const [index, item] of array(evidence.signals).entries()) {
      const signal = element('details', 'adr-signal', signals); signal.dataset.tone = item.tone || 'neutral'; signal.dataset.signalKey = String(item.id || index); signal.open = expandedSignals.has(signal.dataset.signalKey);
      const summary = element('summary', '', signal); element('h4', '', summary, item.title); const toggle = element('span', 'adr-signal-toggle', summary, '+'); toggle.setAttribute('aria-hidden', 'true'); element('p', '', signal, item.text);
    }

    const chain = section(main, '链上数据与基本面趋势', '24H / 7D / 30D'), trends = element('div', 'adr-trends', chain);
    if (!array(data.trends).length) empty(trends, '暂无公开链上时序');
    array(data.trends).forEach((trend, index) => {
      const card = element('div', 'adr-card adr-trend', trends), text = element('div', '', card); element('p', 'adr-trend-label', text, trend.label || trend.id); element('strong', 'adr-trend-value', text, metric(trend));
      const deltas = element('div', 'adr-trend-deltas', text);
      for (const [label, value] of [['24H', trend.change24hPct], ['7D', trend.change7dPct], ['30D', trend.change30dPct]]) element('span', finite(value) ? value >= 0 ? 'adr-up' : 'adr-down' : '', deltas, `${label} ${pct(value)}`);
      const observations = points(trend.series); spark(element('div', 'adr-trend-chart', card), observations, ['#61e7ee', '#b899ff', '#80edb8', '#f5bf86'][index % 4]);
    });
    const xItems = array(data.xMonitor?.items);
    if (xItems.length) stream(section(main, '中文 X 监控', `${xItems.length} 条公开记录`), xItems);
    const footer = element('footer', 'adr-footer', main); element('strong', '', footer, 'welinkBTC · 看见周期中的证据'); link(footer, 'welinkbtc-onchainmain.xyz ↗', SITE);
    const eventRail = element('aside', 'adr-events-rail', layout); eventRail.setAttribute('aria-label', '最新事件');
    const timeline = array(data.timeline).length ? array(data.timeline) : array(data.news?.items), timelineSection = section(eventRail, '最新事件时间线', `${timeline.length} 条 · 点击展开`); timelineSection.classList.add('adr-events'); timelineSection.tabIndex = 0; timelineSection.setAttribute('aria-label', '最新事件时间线，可独立滚动');
    if (timeline.length) stream(timelineSection, timeline); else empty(timelineSection, '暂无匹配事件');
    sheet.querySelectorAll('.adr-stream details').forEach(node => { node.open = expanded.has(node.parentElement.dataset.eventKey); });
    scroll.replaceChildren(sheet); scroll.scrollTop = previousScroll;
    if (sameAsset) timelineSection.scrollTop = previousEventsScroll;
    if (focusState?.selector) [...sheet.querySelectorAll('.adr-stream > li')].find(node => node.dataset.eventKey === focusState.key)?.querySelector(focusState.selector)?.focus({ preventScroll: true });
    else if (signalFocusKey !== null) [...sheet.querySelectorAll('.adr-signal')].find(node => node.dataset.signalKey === signalFocusKey)?.querySelector('summary')?.focus({ preventScroll: true });
    else if (eventsFocused) timelineSection.focus({ preventScroll: true });
    dialog.dataset.state = 'ready'; dialog.dataset.asset = data.asset.id; controls();
  }

  function loading(error) {
    const box = element('div', 'adr-loading'), image = element('img', '', box); image.src = BRAND; image.alt = 'welinkBTC';
    const title = element('h2', '', box, error ? '日报暂未完成' : '正在汇聚公开市场证据'); title.id = 'asset-daily-report-title';
    element('div', 'adr-loading-bar', box); element('p', '', box, error ? '公开数据源暂时未响应。请点击刷新重试；已确认的市场快照仍可在热力图中查看。' : `${state.asset?.symbol || state.assetId || ''} · 同步行情、链上趋势与最新事件，并核查来源时间。`);
    scroll.replaceChildren(box); dialog.dataset.state = error ? 'error' : 'loading'; controls();
  }
  function schedule() {
    clearTimeout(state.timer); if (!dialog.open || !state.data) return;
    const next = millis(state.data.nextRefreshAt), delay = Number.isFinite(next) ? Math.max(60000, next - Date.now()) : 300000;
    state.timer = setTimeout(() => { if (!document.hidden && dialog.open) void load(false); else schedule(); }, Math.min(delay, 300000));
  }
  async function analyze(sequence, report) {
    if (!dialog.open || sequence !== state.sequence) return;
    state.aiController?.abort(); const controller = new AbortController(); state.aiController = controller; state.aiPending = true; state.aiError = false; render();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${window.WELINKBTC_DATA_API_BASE || ''}/api/asset-daily-report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asset: report.asset.id }), signal: controller.signal, credentials: 'same-origin' });
      const data = await response.json();
      if (sequence !== state.sequence || !dialog.open || state.data !== report) return;
      if (!response.ok || !data.ok || data.assetId !== report.asset.id || !data.evidence || typeof data.evidence.summary !== 'string') throw Error('Evidence unavailable');
      if (data.evidence.status === 'ready') report.evidence = data.evidence;
      else state.aiError = true;
      state.cache.set(report.asset.id, report);
    } catch { if (sequence === state.sequence && dialog.open && state.data === report) state.aiError = true; }
    finally { clearTimeout(timeout); if (sequence === state.sequence && dialog.open && state.data === report) { state.aiPending = false; state.aiController = null; render(); controls(); } }
  }
  async function load(force = false, requestAi = false) {
    if (!dialog.open || !state.assetId) return;
    const sequence = ++state.sequence, id = state.assetId;
    state.controller?.abort(); state.aiController?.abort(); state.aiPending = false; state.aiError = false;
    const cached = state.cache.get(id), next = millis(cached?.nextRefreshAt);
    if (!force && cached && next > Date.now()) { state.data = cached; render(); schedule(); if (requestAi && /rules|rule|deterministic/i.test(String(cached.evidence?.method || ''))) void analyze(sequence, cached); return; }
    const controller = new AbortController(); state.controller = controller; const timeout = setTimeout(() => controller.abort(), 50000);
    if (!state.data) loading(); else { refreshButton.disabled = true; setNotice('正在重新核对公开数据…'); }
    try {
      const response = await fetch(`${window.WELINKBTC_DATA_API_BASE || ''}/api/asset-daily-report?asset=${encodeURIComponent(id)}`, { signal: controller.signal, credentials: 'same-origin', ...(force ? { cache: 'no-store' } : {}) });
      const data = await response.json();
      if (sequence !== state.sequence || !dialog.open) return;
      if (!response.ok || data?.ok !== true || data.asset?.id !== id || !data.generatedAt) throw Error('Report unavailable');
      state.data = data; state.cache.set(id, data); while (state.cache.size > 12) state.cache.delete(state.cache.keys().next().value);
      setNotice(''); render(); schedule(); if (requestAi) void analyze(sequence, data);
    } catch {
      if (sequence !== state.sequence || !dialog.open) return;
      if (state.data) { state.data.stale = true; render(); setNotice('更新暂未成功，当前展示上次已核实的数据及原始时间。'); } else loading(true);
    } finally { clearTimeout(timeout); if (sequence === state.sequence) { state.controller = null; controls(); } }
  }
  function close() {
    const origin = state.origin;
    ++state.sequence; state.controller?.abort(); state.aiController?.abort(); state.controller = null; state.aiController = null; clearTimeout(state.timer); state.aiPending = false;
    if (dialog.open) dialog.close(); document.documentElement.style.overflow = state.previousOverflow;
    syncMotion();
    state.assetId = null; state.data = null; state.origin = null; setNotice('');
    if (origin?.isConnected && !origin.closest('[hidden]')) origin.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('welink:asset-daily-report-close'));
  }
  function open(assetId, options = {}) {
    if (typeof assetId !== 'string' || !assetId || state.exporting) return;
    state.assetId = assetId; state.asset = options.asset || null; state.origin = options.origin || document.activeElement; state.data = null; state.aiError = false;
    if (!dialog.open) { state.previousOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; dialog.showModal(); }
    syncMotion();
    dialog.dataset.asset = assetId; scroll.scrollTop = 0; setNotice(''); loading(); closeButton.focus({ preventScroll: true }); void load(false, true);
  }

  const C = { ink: '#f4f8ff', muted: '#a9b8d0', cyan: '#61e7ee', purple: '#b899ff', pink: '#fa6baa', green: '#80edb8' };
  const FONT = '"Microsoft YaHei", "PingFang SC", Inter, sans-serif';
  function wrap(ctx, text, maxWidth) {
    const paragraphs = String(text ?? '').split('\n'), lines = [];
    for (const paragraph of paragraphs) {
      if (!paragraph) { lines.push(''); continue; }
      let row = '';
      for (const letter of Array.from(paragraph)) { if (row && ctx.measureText(row + letter).width > maxWidth) { lines.push(row); row = letter; } else row += letter; }
      lines.push(row);
    }
    return lines;
  }
  function roundRect(ctx, x, y, width, height, radius) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }
  function paintSpark(ctx, observations, x, y, width, height, color) {
    ctx.save(); ctx.strokeStyle = '#adc9f025'; ctx.lineWidth = 1;
    for (const fraction of [.2, .5, .8]) { ctx.beginPath(); ctx.moveTo(x, y + height * fraction); ctx.lineTo(x + width, y + height * fraction); ctx.stroke(); }
    if (observations.length < 2) { ctx.fillStyle = '#8fa5c0'; ctx.font = `20px ${FONT}`; ctx.fillText('有效历史观测不足', x + 12, y + height / 2); ctx.restore(); return; }
    const values = observations.map(row => row.value), lower = Math.min(...values), upper = Math.max(...values), range = upper - lower || Math.max(Math.abs(upper) * .02, 1), start = millis(observations[0].time), duration = millis(observations[observations.length - 1].time) - start || 1;
    const coordinate = point => [x + (millis(point.time) - start) / duration * width, y + height - 8 - (point.value - lower) / range * (height - 16)];
    ctx.beginPath(); observations.forEach((point, index) => { const [px, py] = coordinate(point); if (!index) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.lineTo(x + width, y + height); ctx.lineTo(x, y + height); ctx.closePath(); const fill = ctx.createLinearGradient(x, y, x, y + height); fill.addColorStop(0, color + '33'); fill.addColorStop(1, color + '00'); ctx.fillStyle = fill; ctx.fill();
    ctx.beginPath(); observations.forEach((point, index) => { const [px, py] = coordinate(point); if (!index) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.shadowBlur = 9; ctx.shadowColor = color + '60'; ctx.stroke(); ctx.shadowBlur = 0;
    const [px, py] = coordinate(observations[observations.length - 1]); ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fillStyle = C.pink; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  async function brandImage() {
    return new Promise(resolve => { const image = new Image(); const timeout = setTimeout(() => resolve(null), 6000); image.onload = () => { clearTimeout(timeout); resolve(image); }; image.onerror = () => { clearTimeout(timeout); resolve(null); }; image.src = BRAND; });
  }
  async function renderShareCanvas(input = state.data) {
  if (!input || input.ok !== true || !input.asset) throw Error('日报尚未加载完成');
  const data = JSON.parse(JSON.stringify(input)), image = await brandImage();
  if (document.fonts?.ready) await document.fonts.ready;
  const measure = document.createElement('canvas').getContext('2d'), commands = [], width = 1080, left = 42, content = width - left * 2, mainWidth = 646, railWidth = 330, railX = left + mainWidth + 20;
  let y = 34;
  const text = (value, x, top, maxWidth, size = 22, color = C.ink, weight = 400, lineHeight = size * 1.45) => {
    measure.font = `${weight} ${size}px ${FONT}`; const lines = wrap(measure, value, maxWidth);
    commands.push(ctx => { ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillStyle = color; ctx.textBaseline = 'top'; lines.forEach((line, index) => ctx.fillText(line, x, top + index * lineHeight)); });
    return lines.length * lineHeight;
  };
  const panel = (x, top, w, height, accent = C.cyan) => {
    commands.push(ctx => { const gradient = ctx.createLinearGradient(x, top, x + w, top + height); gradient.addColorStop(0, '#14233a'); gradient.addColorStop(1, '#101d31'); roundRect(ctx, x, top, w, height, 16); ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = accent + '3a'; ctx.lineWidth = 1; ctx.stroke(); });
  };
  const heading = (title, meta = '') => {
    y += 18; text(title, left, y, mainWidth, 24, C.ink, 800, 34);
    if (meta) text(meta, left + mainWidth - 240, y + 8, 240, 13, C.muted, 400, 20);
    y += 42;
  };
  const brandY = y;
  commands.push(ctx => { if (image) ctx.drawImage(image, left, brandY - 3, 62, 62); else { ctx.fillStyle = '#d8af59'; ctx.font = `800 34px ${FONT}`; ctx.fillText('₿', left + 15, brandY + 8); } });
  text('welinkBTC', left + 74, y, 430, 27, C.ink, 800);
  text('链上证据 · 市场情报 · 周期研究', left + 74, y + 37, 450, 15, C.cyan, 500);
  text(date(data.generatedAt), 758, y + 7, 280, 18, C.muted);
  text('SHANGHAI · DAILY INTELLIGENCE', 758, y + 36, 280, 10, '#829ab9', 700);
  y += 82;
  y += text(`${data.asset.symbol}  完整日报`, left, y, content, 51, C.ink, 800, 62) + 6;
  text(`${data.asset.name || data.asset.symbol} · ${groupName(data.asset.group)} · 公开永续合约`, left, y, content, 18, C.muted);
  y += 39;
  const contentStart = y, quote = data.quote || {}, priceObservations = points(data.priceSeries, true), quoteY = y;
  panel(left, y, mainWidth, 148);
  text('标记价格 · USD', left + 20, y + 17, 310, 15, C.muted);
  text(money(quote.price, true), left + 20, y + 46, 323, 34, C.ink, 800, 46);
  text(`${pct(quote.change24hPct)} · 24H`, left + 20, y + 111, 310, 17, finite(quote.change24hPct) && quote.change24hPct >= 0 ? C.green : C.pink, 700);
  text('24H 成交额', left + 358, y + 18, 266, 14, C.muted); text(money(quote.volume24hUsd), left + 358, y + 41, 266, 24, C.ink, 800);
  text('持仓名义金额', left + 358, y + 80, 266, 14, C.muted); text(money(quote.openInterestUsd), left + 358, y + 103, 266, 24, C.ink, 800);
  y = quoteY + 160;
  y += text(`资金费率 ${finite(quote.fundingRate) ? `${(quote.fundingRate * 100).toFixed(4)}% / 每小时` : '—'}`, left + 2, y, mainWidth - 4, 15, C.cyan, 500, 23);
  y += text(`行情 ${compactDate(quote.asOf)} CST${data.stale || quote.status === 'stale' ? ' · 历史快照' : ''}`, left + 2, y + 3, mainWidth - 4, 13, data.stale || quote.status === 'stale' ? '#ffc58a' : C.muted, 400, 20) + 13;
  const priceY = y;
  panel(left, y, mainWidth, 175);
  text('市场价格趋势', left + 20, y + 13, 360, 20, C.ink, 700);
  text(`日线收盘${array(data.priceSeries).some(point => point.provisional) ? ' · 当日未结' : ''}`, left + mainWidth - 185, y + 18, 170, 12, C.muted);
  commands.push(ctx => paintSpark(ctx, priceObservations, left + 22, priceY + 48, mainWidth - 44, 95, C.cyan));
  if (priceObservations.length) { text(date(priceObservations[0].time, true), left + 22, y + 150, 140, 12, C.muted); text(date(priceObservations[priceObservations.length - 1].time, true), left + mainWidth - 95, y + 150, 80, 12, C.muted); }
  y += 187;
  const evidence = data.evidence || {};
  heading('AI 证据研判', evidenceStatus(data, false, input === state.data && state.aiError));
  const evidenceStart = y, evidenceIndex = commands.length;
  y += 15;
  y += text(evidence.summary || '等待公开证据汇总。', left + 18, y, mainWidth - 36, 19, C.ink, 700, 29) + 11;
  for (const signal of array(evidence.signals)) {
    y += text(signal.title || '证据观察', left + 18, y, mainWidth - 36, 18, /negative|warning|bearish/.test(signal.tone) ? C.pink : C.cyan, 700, 27) + 3;
    y += text(signal.text || '', left + 18, y, mainWidth - 36, 17, C.muted, 400, 25) + 12;
  }
  y += 3; const evidenceHeight = y - evidenceStart;
  commands.splice(evidenceIndex, 0, ctx => { roundRect(ctx, left, evidenceStart, mainWidth, evidenceHeight, 16); ctx.fillStyle = '#122037'; ctx.fill(); ctx.strokeStyle = '#b899ff40'; ctx.stroke(); });
  heading('链上数据与基本面趋势', '24H / 7D / 30D');
  const trends = array(data.trends), columns = Math.min(2, Math.max(1, trends.length)), gap = 12, cardWidth = (mainWidth - (columns - 1) * gap) / columns;
  if (!trends.length) y += text('暂无公开链上时序', left, y, mainWidth, 18, C.muted) + 14;
  for (let index = 0; index < trends.length; index += columns) {
    const row = trends.slice(index, index + columns), top = y; let rowHeight = 180;
    const rowCommands = [];
    row.forEach((trend, column) => {
      const x = left + column * (cardWidth + gap), startIndex = commands.length;
      const labelHeight = text(trend.label || trend.id, x + 15, top + 14, cardWidth - 30, 17, '#b7c7df', 500, 25);
      let cursor = top + 18 + labelHeight;
      cursor += text(metric(trend), x + 15, cursor, cardWidth - 30, 26, C.ink, 800, 36) + 6;
      cursor += text(`24H ${pct(trend.change24hPct)}  7D ${pct(trend.change7dPct)}\n30D ${pct(trend.change30dPct)}`, x + 15, cursor, cardWidth - 30, 13, C.cyan, 500, 21) + 10;
      const chartY = cursor, observations = points(trend.series), color = [C.cyan, C.purple, C.green, '#f5bf86'][(index + column) & 3];
      commands.push(ctx => paintSpark(ctx, observations, x + 15, chartY, cardWidth - 30, 49, color));
      rowHeight = Math.max(rowHeight, chartY + 49 + 11 - top);
      rowCommands.push({ index: startIndex, x });
    });
    for (let p = rowCommands.length - 1; p >= 0; p--) {
      const item = rowCommands[p], height = rowHeight;
      commands.splice(item.index, 0, ctx => { roundRect(ctx, item.x, top, cardWidth, height, 14); ctx.fillStyle = '#132137'; ctx.fill(); ctx.strokeStyle = '#86a7d02f'; ctx.stroke(); });
    }
    y = top + rowHeight + gap;
  }
  const xItems = array(data.xMonitor?.items);
  if (xItems.length) {
    heading('中文 X 监控', `${xItems.length} 条公开记录`);
    for (const item of xItems) {
      const top = y, index = commands.length;
      y += 13; y += text(compactDate(item.publishedAt || item.asOf), left + 16, y, mainWidth - 32, 13, C.purple, 600, 20) + 5;
      y += text(item.title || '公开记录', left + 16, y, mainWidth - 32, 18, C.ink, 600, 27) + 6;
      if (item.summary) y += text(item.summary, left + 16, y, mainWidth - 32, 16, C.muted, 400, 24) + 6;
      y += 12; const height = y - top;
      commands.splice(index, 0, ctx => { roundRect(ctx, left, top, mainWidth, height, 13); ctx.fillStyle = '#17213a'; ctx.fill(); ctx.strokeStyle = '#b899ff36'; ctx.stroke(); }); y += 8;
    }
  }
  const timeline = array(data.timeline).length ? array(data.timeline) : array(data.news?.items);
  let railY = contentStart, railIndex = commands.length;
  text('最新事件时间线', railX + 16, railY + 17, railWidth - 32, 24, C.ink, 800, 34);
  text(`${timeline.length} 条 · 全文见站内日报`, railX + 16, railY + 58, railWidth - 32, 13, C.muted, 400, 20);
  railY += 92;
  if (!timeline.length) railY += text('暂无匹配事件', railX + 16, railY, railWidth - 32, 17, C.muted) + 18;
  for (const item of timeline) {
    const top = railY, index = commands.length;
    railY += 12; railY += text(compactDate(item.publishedAt || item.asOf), railX + 25, railY, railWidth - 50, 13, C.cyan, 600, 20) + 5;
    railY += text(item.title || '公开事件', railX + 25, railY, railWidth - 50, 17, C.ink, 600, 25) + 13;
    const height = railY - top;
    commands.splice(index, 0, ctx => { roundRect(ctx, railX + 11, top, railWidth - 22, height, 11); ctx.fillStyle = '#18283d'; ctx.fill(); ctx.strokeStyle = '#92b3db28'; ctx.stroke(); });
    railY += 8;
  }
  const railHeight = railY + 5 - contentStart;
  commands.splice(railIndex, 0, ctx => { const gradient = ctx.createLinearGradient(railX, contentStart, railX + railWidth, contentStart + railHeight); gradient.addColorStop(0, '#19263e'); gradient.addColorStop(1, '#111e30'); roundRect(ctx, railX, contentStart, railWidth, railHeight, 18); ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = '#8fafd746'; ctx.stroke(); ctx.fillStyle = '#78e4e9'; ctx.fillRect(railX + 17, contentStart + 1, railWidth - 34, 1); });
  y = Math.max(y, railY + 5) + 19;
  const footerY = y, footerHeight = 84;
  commands.push(ctx => { const gradient = ctx.createLinearGradient(left, footerY, width - left, footerY + footerHeight); gradient.addColorStop(0, '#16475b'); gradient.addColorStop(1, '#51295e'); roundRect(ctx, left, footerY, content, footerHeight, 16); ctx.fillStyle = gradient; ctx.fill(); });
  text('welinkBTC  |  看见周期中的证据', left + 20, y + 15, content - 40, 24, C.ink, 800);
  text('www.welinkbtc-onchainmain.xyz', left + 20, y + 51, content - 40, 16, '#a3d5eb', 500);
  y += footerHeight + 30;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.ceil(y); const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('当前浏览器暂不支持图片生成');
  ctx.fillStyle = '#09111f'; ctx.fillRect(0, 0, width, canvas.height); const glow = ctx.createRadialGradient(width, 0, 0, width, 0, 1000); glow.addColorStop(0, '#66227c50'); glow.addColorStop(1, '#09111f00'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, Math.min(canvas.height, 1100));
  for (const command of commands) command(ctx);
  canvas.dataset.asset = data.asset.id; canvas.dataset.generatedAt = data.generatedAt; return canvas;
}
  async function exportImage(share = false) {
    if (!state.data || state.exporting || state.aiPending || !dialog.open) return;
    const data = state.data, sequence = state.sequence; state.exporting = true; controls(); setNotice('正在排版完整日报图片…');
    try {
      const canvas = await renderShareCanvas(data), blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(Error('图片生成失败')), 'image/png'));
      if (sequence !== state.sequence || !dialog.open || state.data !== data) return;
      const safeSymbol = String(data.asset.symbol || 'asset').replace(/[^a-zA-Z0-9_-]/g, ''), file = new File([blob], `welinkBTC-${safeSymbol}-daily-${new Date(millis(data.generatedAt)).toISOString().slice(0, 10)}.png`, { type: 'image/png' });
      if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: `${data.asset.symbol} 完整日报 · welinkBTC` }); setNotice('日报图片已交给系统分享。'); }
        catch (error) { if (error.name === 'AbortError') setNotice(''); else { download(blob, file.name); setNotice('系统分享暂不可用，已保存完整日报图片。'); } }
      } else { download(blob, file.name); setNotice(share ? '当前浏览器不支持图片直分享，已保存完整日报图片。' : '完整日报图片已保存，包含品牌、行情、图表与事件。'); }
    } catch { if (sequence === state.sequence && dialog.open) setNotice('图片暂未生成成功，请再次点击保存图片。'); }
    finally { state.exporting = false; controls(); }
  }
  function download(blob, name) { const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  saveButton.addEventListener('click', () => { void exportImage(false); });
  shareButton.addEventListener('click', () => { void exportImage(true); });

  closeButton.addEventListener('click', close);
  refreshButton.addEventListener('click', () => { if (!state.exporting) void load(true, true); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target !== dialog) return; const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled):not([hidden]), a[href], summary, [tabindex="0"]')].filter(node => {
      if (!node.getClientRects().length) return false;
      for (let parent = node.parentElement; parent && parent !== dialog; parent = parent.parentElement) {
        if (!parent.matches('details:not([open])')) continue;
        const summary = [...parent.children].find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(node)) return false;
      }
      return true;
    });
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.addEventListener('visibilitychange', () => { syncMotion(); if (!document.hidden && dialog.open && state.data && millis(state.data.nextRefreshAt) <= Date.now()) void load(false); });
  reducedMotion.addEventListener('change', syncMotion);
  window.addEventListener('pagehide', () => { if (dialog.open) close(); });
  window.WelinkAssetDailyReport = { open, close, renderShareCanvas };
})();
