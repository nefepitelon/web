(() => {
  const panel = document.querySelector('#cycle-seasons');
  const svg = panel?.querySelector('#cycle-seasons-chart');
  if (!panel || !svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const CACHE_KEY = 'welinkbtc-cycle-seasons-v1';
  const REFRESH_MS = 5 * 60 * 1000;
  const DAY = 86400000;
  // Historical mainnet subsidy boundaries: https://bitcoin.org/en/halving
  const HALVINGS = [
    { date: '2016-07-09', blockHeight: 420000 },
    { date: '2020-05-11', blockHeight: 630000 },
    { date: '2024-04-20', blockHeight: 840000 }
  ];
  const state = { payload: null, inFlight: null, visible: false, attemptedAt: 0, rows: [], events: [], halving: null, crosshair: null, selected: null, suspended: false };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const en = () => document.documentElement.lang.startsWith('en');
  const copy = (zh, english) => en() ? english : zh;
  const el = name => panel.querySelector('#cycle-seasons-' + name);
  const usd = value => new Intl.NumberFormat(en() ? 'en-US' : 'zh-CN', { style: 'currency', currency: 'USD', maximumFractionDigits: value < 10 ? 2 : 0 }).format(value);
  const labels = {
    title: ['四年周期对照', 'Four-year cycle atlas'],
    price: ['BTC / USD', 'BTC / USD'],
    credits: ['数据与授权', 'Data & credits'],
    earlyData: ['2014 年早期数据：', 'Early 2014 data: '],
    aggregation: ['；已汇总为周线。', '; aggregated into weekly OHLC.'],
    description: ['按日历年对齐，每轮独立对数刻度；未来年份留空，阶段名称仅作历史节奏参考。', 'Calendar-year alignment, independent log scales per row. Future years are empty; phase names are historical references.']
  };
  const phases = [
    { zh: '熊市年', en: 'Bear', color: 'var(--season-bear)' },
    { zh: '复苏年', en: 'Pre-Bull', color: 'var(--season-pre)' },
    { zh: '第一上涨年', en: '1st Bull', color: 'var(--season-first)' },
    { zh: '第二上涨年', en: '2nd Bull', color: 'var(--season-second)' }
  ];
  const node = (tag, attrs = {}, text) => {
    const item = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([name, value]) => item.setAttribute(name, String(value)));
    if (text !== undefined) item.textContent = text;
    return item;
  };

  // A future halving is a calendar estimate, never a future price observation.
  function validHalving(snapshot) {
    const now = Date.now(), estimated = Date.parse(snapshot?.estimatedAt), observed = Date.parse(snapshot?.observedAt);
    return snapshot?.schema === 1 && snapshot.stale === false &&
      Number.isInteger(snapshot.currentHeight) && snapshot.currentHeight >= 840000 &&
      Number.isInteger(snapshot.targetHeight) && snapshot.targetHeight % 210000 === 0 &&
      snapshot.targetHeight > snapshot.currentHeight && snapshot.targetHeight - snapshot.currentHeight <= 210000 &&
      snapshot.blocksRemaining === snapshot.targetHeight - snapshot.currentHeight && snapshot.estimateBlockSeconds === 600 &&
      Math.abs(estimated - observed - snapshot.blocksRemaining * 600000) < 1000 &&
      observed <= now && now - observed < DAY && estimated > now && estimated < now + 5 * 366 * DAY;
  }

  function eventName(event) {
    if (event.kind === 'halving') return copy('比特币减半', 'Bitcoin halving');
    if (event.kind === 'estimated-halving') return copy('预计减半', 'Estimated halving');
    if (event.kind === 'high') return event.toDate ? copy('截至目前最高', 'High to date') : copy('周期最高', 'Cycle high');
    return event.toDate ? copy('截至目前最低', 'Low to date') : copy('周期最低', 'Cycle low');
  }

  function renderLegend() {
    let legend = panel.querySelector('.cycle-seasons-legend');
    if (!legend) {
      legend = document.createElement('div'); legend.className = 'cycle-seasons-legend';
      panel.querySelector('.cycle-seasons-stage').after(legend);
    }
    legend.replaceChildren();
    for (const [kind, zh, english] of [['high', '最高', 'High'], ['low', '最低', 'Low'], ['halving', '减半 / 预计', 'Halving / estimate']]) {
      const item = document.createElement('span'), dot = document.createElement('i');
      dot.className = 'season-legend-dot'; dot.dataset.kind = kind; dot.setAttribute('aria-hidden', 'true');
      item.append(dot, copy(zh, english)); legend.append(item);
    }
  }

  // Validate observations before they reach path geometry or the browser cache.
  function valid(payload) {
    if (payload?.ok !== true || !Array.isArray(payload.rows) || !payload.rows.length || payload.rows.length > 12) return false;
    let count = 0, previousYear = 2010;
    for (const row of payload.rows) {
      if (!Number.isInteger(row.startYear) || row.startYear < 2014 || (row.startYear - 2014) % 4 || row.startYear <= previousYear || row.endYear !== row.startYear + 3 || !Array.isArray(row.candles) || row.candles.length > 212) return false;
      previousYear = row.startYear;
      let previousDate = '';
      for (const candle of row.candles) {
        const timestamp = Date.parse(candle.date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(candle.date) || !Number.isFinite(timestamp) || timestamp > Date.now() || candle.date <= previousDate || timestamp < Date.UTC(row.startYear, 0, 1) || timestamp >= Date.UTC(row.endYear + 1, 0, 1)) return false;
        if (![candle.open, candle.high, candle.low, candle.close].every(value => Number.isFinite(value) && value > 0) || candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close)) return false;
        previousDate = candle.date; count++;
      }
    }
    return count >= 52;
  }

  function updateLabels() {
    panel.querySelectorAll('[data-seasons-copy]').forEach(item => {
      const value = labels[item.dataset.seasonsCopy];
      if (value) item.textContent = value[en() ? 1 : 0];
    });
    el('refresh').title = el('refresh').ariaLabel = copy('刷新周期行情', 'Refresh cycle prices');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-description', copy('移动指针或使用方向键查看每周开高低收数据；聚焦或点击晕点查看周期高低点与减半日期。高低点日期为所在周的开始日期。', 'Move the pointer or use arrow keys for weekly OHLC. Focus or select halo markers for extrema and halving dates. Extrema dates identify the start of their weekly candle.'));
    if (!state.payload) {
      const failed = panel.dataset.status === 'error';
      el('state').textContent = failed ? copy('暂不可用', 'UNAVAILABLE') : copy('同步中', 'SYNCING');
      el('loading').textContent = failed ? copy('公开行情暂不可用，请点击下方刷新重试。', 'Public prices are unavailable. Use refresh below to retry.') : copy('正在连接公开周线行情…', 'Connecting to public weekly prices…');
    }
  }

  function status() {
    const data = state.payload;
    if (!data) return;
    const quote = data.quote;
    const quoteAge = Date.now() - Date.parse(quote?.timestamp);
    const live = !data.browserFallback && !data.stale && quote?.live !== false && Number.isFinite(quote?.price) && quoteAge >= 0 && quoteAge < 15 * 60 * 1000;
    panel.dataset.status = live ? 'live' : 'stale';
    el('state').textContent = live ? copy('实时同步', 'LIVE') : copy('历史快照', 'SNAPSHOT');
    const last = data.rows.flatMap(row => row.candles).at(-1);
    const usdt = quote?.currency === 'USDT' && Number.isFinite(quote?.price);
    panel.querySelector('[data-seasons-copy="price"]').textContent = usdt ? 'BTC / USDT' : 'BTC / USD';
    el('price').textContent = Number.isFinite(quote?.price) ? usdt ? `${new Intl.NumberFormat(en() ? 'en-US' : 'zh-CN', { maximumFractionDigits: 0 }).format(quote.price)} USDT` : usd(quote.price) : last ? usd(last.close) : '—';
    const asOf = quote?.timestamp || data.updatedAt;
    el('price').title = asOf ? `${quote?.source || 'PUBLIC PRICE'} · ${copy('报价时间', 'Quote time')}: ${asOf}` : '';
    el('source').textContent = `${data.source || 'PUBLIC OHLC'} · ${data.historyAsOf || data.coverage?.end || last?.date || ''}`;
  }

  function readout(candle, row, event = null) {
    const target = el('readout');
    target.replaceChildren();
    if (!candle && !event) {
      state.selected = null;
      const title = document.createElement('strong'); title.textContent = copy('未来日历区间 · 暂无行情', 'Future calendar slot · no observations');
      const hint = document.createElement('span'); hint.textContent = copy('新增真实周线后自动续绘', 'Extends automatically as real weekly data arrives');
      target.append(title, hint); return;
    }
    state.selected = { row, candle, event };
    const title = document.createElement('strong');
    if (event) {
      title.textContent = `${row.startYear}—${row.endYear} · ${eventName(event)}`;
      const details = document.createElement('span');
      if (event.kind === 'high' || event.kind === 'low') {
        const value = document.createElement('b'); value.textContent = usd(event.value);
        details.append(value, `${copy('周开始', 'Week of')} ${event.date}`);
      } else {
        details.append(`${event.date} · ${copy('区块', 'Block')} ${event.blockHeight.toLocaleString('en-US')}`);
        if (candle) details.append(`${copy('所在周收盘', 'Event-week close')} ${usd(candle.close)}`);
        else details.append(copy('按公开区块高度估算，时间随出块速度调整', 'Estimated from public block height; timing changes with block production'));
      }
      target.append(title, details); return;
    }
    title.textContent = `${candle.date} · ${row.startYear}—${row.endYear} · ${copy('周线', '1W')}`;
    const values = document.createElement('span');
    for (const [zh, english, key] of [['开', 'O', 'open'], ['高', 'H', 'high'], ['低', 'L', 'low'], ['收', 'C', 'close']]) {
      const item = document.createElement('span'), value = document.createElement('b');
      item.append(copy(zh, english) + ' '); value.textContent = usd(candle[key]); item.append(value); values.append(item);
    }
    target.append(title, values);
  }

  function render() {
    updateLabels(); status();
    const payload = state.payload;
    if (!payload) return;
    const previous = state.selected, focused = markerAt(document.activeElement);
    const rows = payload.rows, width = 440, left = 8, right = 432, top = 13, rowHeight = 92;
    const bottom = top + rows.length * rowHeight;
    svg.setAttribute('viewBox', `0 0 ${width} ${bottom + 39}`);
    el('chart').parentElement.style.aspectRatio = `${width} / ${bottom + 39}`;
    svg.replaceChildren(); state.rows = []; state.events = []; renderLegend();
    for (let phase = 0; phase < 4; phase++) {
      const x = left + (right - left) * phase / 4;
      svg.append(node('rect', { x, y: top, width: (right - left) / 4, height: bottom - top, fill: phases[phase].color, class: 'season-column' }));
      if (phase) svg.append(node('line', { x1: x, x2: x, y1: top, y2: bottom, class: 'season-grid' }));
      svg.append(node('text', { x: x + (right - left) / 8, y: bottom + 19, 'text-anchor': 'middle', fill: phases[phase].color, class: 'season-phase' }, phases[phase][en() ? 'en' : 'zh']));
    }
    svg.append(node('text', { x: 220, y: top + (bottom - top) / 2, 'text-anchor': 'middle', class: 'season-brand' }, 'welinkBTC'));
    const now = Date.now();
    rows.forEach((row, index) => {
      const yTop = top + index * rowHeight, plotTop = yTop + 23, plotBottom = yTop + rowHeight - 9;
      const start = Date.UTC(row.startYear, 0, 1), end = Date.UTC(row.endYear + 1, 0, 1);
      const xFor = timestamp => left + Math.max(0, Math.min(1, (timestamp - start) / (end - start))) * (right - left);
      const values = row.candles.flatMap(c => [c.low, c.high]);
      const low = values.length ? Math.log(Math.min(...values)) : 0, high = values.length ? Math.log(Math.max(...values)) : 1, span = Math.max(.01, high - low);
      const yFor = value => plotBottom - (Math.log(value) - low) / span * (plotBottom - plotTop);
      svg.append(node('line', { x1: left, x2: right, y1: yTop, y2: yTop, class: 'season-grid' }));
      for (let phase = 0; phase < 4; phase++) {
        const year = row.startYear + phase;
        svg.append(node('text', { x: left + (right - left) * (phase + .5) / 4, y: yTop + 13, 'text-anchor': 'middle', fill: phases[phase].color, class: 'season-year', opacity: Date.UTC(year, 0, 1) > now ? .45 : 1 }, year));
      }
      const paths = { up: { wicks: '', bodies: '' }, down: { wicks: '', bodies: '' } };
      const bodyWidth = Math.max(.7, (right - left) * 7 * DAY / (end - start) * .7);
      for (const candle of row.candles) {
        const x = xFor(Date.parse(candle.date)), open = yFor(candle.open), close = yFor(candle.close);
        const path = paths[candle.close >= candle.open ? 'up' : 'down'];
        path.wicks += `M${x.toFixed(2)},${yFor(candle.high).toFixed(2)}V${yFor(candle.low).toFixed(2)}`;
        path.bodies += `M${(x - bodyWidth / 2).toFixed(2)},${Math.min(open, close).toFixed(2)}h${bodyWidth.toFixed(2)}v${Math.max(.65, Math.abs(open - close)).toFixed(2)}h-${bodyWidth.toFixed(2)}Z`;
      }
      for (const direction of ['up', 'down']) {
        svg.append(node('path', { d: paths[direction].wicks, class: `season-candle-${direction} season-wicks` }));
        svg.append(node('path', { d: paths[direction].bodies, class: `season-candle-${direction} season-bodies` }));
      }
      if (row.candles.length) {
        // One geometry per observed close; CSS moves light along it without redraws.
        const d = row.candles.map((candle, i) => `${i ? 'L' : 'M'}${xFor(Date.parse(candle.date)).toFixed(2)},${yFor(candle.close).toFixed(2)}`).join('');
        const energy = node('g', { class: 'season-trend-energy-group', 'data-row-start': row.startYear, 'aria-hidden': 'true' });
        for (const layer of ['trace', 'glow', 'core']) energy.append(node('path', { d, pathLength: 100, class: `season-energy-${layer}` }));
        svg.append(energy);
        const toDate = now < end;
        for (const kind of ['high', 'low']) {
          const candle = row.candles.reduce((best, item) => kind === 'high' ? item.high > best.high ? item : best : item.low < best.low ? item : best);
          state.events.push({ kind, row, candle, date: candle.date, value: candle[kind], toDate, x: xFor(Date.parse(candle.date)), y: yFor(candle[kind]), plotTop, plotBottom });
        }
      }
      for (const halving of HALVINGS) {
        const timestamp = Date.parse(halving.date);
        if (timestamp < start || timestamp >= end || timestamp > now || !row.candles.length) continue;
        const candle = row.candles.findLast(item => Date.parse(item.date) <= timestamp);
        if (!candle || timestamp >= Date.parse(candle.date) + 7 * DAY) continue;
        const x = xFor(timestamp);
        svg.append(node('line', { x1: x, x2: x, y1: yTop + 18, y2: plotBottom + 3, class: 'season-halving-guide' }));
        state.events.push({ ...halving, kind: 'halving', row, candle, value: candle.close, x, y: yFor(candle.close), plotTop, plotBottom });
      }
      if (validHalving(state.halving)) {
        const timestamp = Date.parse(state.halving.estimatedAt);
        if (timestamp >= start && timestamp < end) {
          const x = xFor(timestamp);
          svg.append(node('line', { x1: x, x2: x, y1: yTop + 18, y2: plotBottom + 3, class: 'season-halving-guide' }));
          state.events.push({ kind: 'estimated-halving', row, candle: null, date: state.halving.estimatedAt.slice(0, 10), blockHeight: state.halving.targetHeight, x, y: plotTop + 5, plotTop, plotBottom });
        }
      }
      if (now >= start && now < end && row.candles.length) {
        const last = row.candles.at(-1), x = xFor(Date.parse(last.date)), y = yFor(last.close), nowX = xFor(now);
        svg.append(node('line', { x1: nowX, x2: nowX, y1: yTop + 18, y2: plotBottom + 3, class: 'season-now-line' }));
        svg.append(node('circle', { cx: x, cy: y, r: 4, class: 'season-live-halo' }));
        svg.append(node('circle', { cx: x, cy: y, r: 2.7, class: 'season-live-dot' }));
        if (right - nowX > 45) svg.append(node('text', { x: nowX + (right - nowX) / 2, y: plotTop + (plotBottom - plotTop) / 2, 'text-anchor': 'middle', class: 'season-future' }, copy('等待后续行情', 'NO FUTURE DATA')));
        panel.dataset.currentYear = String(new Date(now).getUTCFullYear());
      }
      state.rows.push({ row, yTop, plotBottom, xFor, start, end });
    });
    state.crosshair = node('line', { x1: left, x2: left, y1: 0, y2: 0, class: 'season-crosshair', visibility: 'hidden' });
    svg.append(state.crosshair, node('rect', { x: left, y: top, width: right - left, height: bottom - top, class: 'season-hit-target' }));
    // Markers sit above the candle inspection target so touch and keyboard work.
    for (const event of state.events) {
      const label = `${eventName(event)} · ${event.date}${event.value ? ` · ${event.kind === 'halving' ? copy('所在周收盘', 'Event-week close') + ' ' : ''}${usd(event.value)}` : ''}${event.kind === 'high' || event.kind === 'low' ? ` · ${copy('周开始', 'Week of')}` : ''}`;
      const marker = node('g', { class: 'season-event-marker', transform: `translate(${event.x.toFixed(2)} ${event.y.toFixed(2)})`, role: 'button', tabindex: 0, 'aria-label': label, 'aria-pressed': 'false', 'data-kind': event.kind, 'data-row-start': event.row.startYear, 'data-date': event.date, 'data-to-date': Boolean(event.toDate) });
      if (event.value) marker.dataset.value = String(event.value);
      if (event.blockHeight) marker.dataset.blockHeight = String(event.blockHeight);
      marker.append(node('title', {}, label), node('circle', { r: 10, fill: 'transparent', class: 'season-event-hit' }), node('circle', { r: 5, class: 'season-event-aura' }), node('circle', { r: 4.6, class: 'season-event-core' }), node('text', { x: 0, y: .2, class: 'season-event-glyph' }, event.kind === 'high' ? 'H' : event.kind === 'low' ? 'L' : '₿'));
      const anchor = event.x > 350 ? 'end' : 'start';
      marker.append(node('text', { x: anchor === 'end' ? -8 : 8, y: event.y < event.plotTop + 14 ? 13 : -9, 'text-anchor': anchor, class: 'season-event-label' }, eventName(event)));
      event.element = marker; svg.append(marker);
    }
    panel.dataset.candles = String(rows.reduce((sum, row) => sum + row.candles.length, 0));
    panel.dataset.historyFrom = payload.coverage?.start || rows[0].candles[0]?.date || '';
    panel.dataset.historyTo = payload.coverage?.end || rows.at(-1).candles.at(-1)?.date || '';
    const latest = [...rows].reverse().find(row => row.candles.length);
    const retainedEvent = previous?.event && state.events.find(item => item.kind === previous.event.kind && item.row.startYear === previous.row.startYear && item.date === previous.event.date);
    const retainedRow = previous?.candle && rows.find(row => row.startYear === previous.row.startYear);
    const retainedCandle = retainedRow?.candles.find(candle => candle.date === previous.candle.date);
    if (retainedEvent) {
      selectEvent(retainedEvent);
      if (focused) retainedEvent.element.focus({ preventScroll: true });
    } else if (retainedCandle) readout(retainedCandle, retainedRow);
    else if (latest) readout(latest.candles.at(-1), latest);
  }

  function inspect(event) {
    if (!state.rows.length) return;
    const marker = markerAt(event.target);
    if (marker) { selectEvent(marker); return; }
    clearEvent();
    const box = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
    const x = (event.clientX - box.left) / box.width * view.width, y = (event.clientY - box.top) / box.height * view.height;
    const plot = state.rows.find(item => y >= item.yTop && y < item.yTop + 92);
    if (!plot || x < 8 || x > 432) return;
    const timestamp = plot.start + (x - 8) / 424 * (plot.end - plot.start);
    // A pointer in unobserved future space must never snap back to a made-up quote.
    if (timestamp > Date.now() || !plot.row.candles.length) { readout(null, plot.row); state.crosshair.setAttribute('visibility', 'hidden'); return; }
    const candle = plot.row.candles.reduce((nearest, item) => Math.abs(Date.parse(item.date) - timestamp) < Math.abs(Date.parse(nearest.date) - timestamp) ? item : nearest);
    const candleX = plot.xFor(Date.parse(candle.date));
    for (const [name, value] of Object.entries({ x1: candleX, x2: candleX, y1: plot.yTop + 18, y2: plot.plotBottom + 3, visibility: 'visible' })) state.crosshair.setAttribute(name, value);
    readout(candle, plot.row);
  }

  function markerAt(target) {
    const element = target?.closest?.('.season-event-marker');
    return element && state.events.find(item => item.element === element);
  }

  function clearEvent() {
    state.events.forEach(item => { item.element.classList.remove('is-selected'); item.element.setAttribute('aria-pressed', 'false'); });
  }

  function selectEvent(event) {
    clearEvent();
    event.element.classList.add('is-selected'); event.element.setAttribute('aria-pressed', 'true');
    state.crosshair?.setAttribute('visibility', 'hidden');
    readout(event.candle, event.row, event);
  }

  function apply(payload, browserFallback = false) {
    if (!valid(payload)) return false;
    state.payload = { ...payload, browserFallback };
    el('loading').hidden = true;
    render(); return true;
  }

  async function load() {
    if (state.inFlight) return state.inFlight;
    state.attemptedAt = Date.now(); el('refresh').disabled = true;
    state.inFlight = (async () => {
      try {
        const response = await fetch(`${window.WELINKBTC_DATA_API_BASE || ''}/api/cycle-seasons`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error('Cycle data unavailable');
        const payload = await response.json();
        if (!apply(payload)) throw new Error('Invalid cycle observations');
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload })); } catch {}
        // Optional annotation: a failed explorer never blocks price history.
        try {
          const response = await fetch(`${window.WELINKBTC_DATA_API_BASE || ''}/api/halving`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
          const snapshot = response.ok ? await response.json() : null;
          state.halving = validHalving(snapshot) ? snapshot : null;
          render();
        } catch { if (state.halving) { state.halving = null; render(); } }
      } catch {
        if (state.payload) { state.payload = { ...state.payload, browserFallback: true }; status(); }
        else {
          panel.dataset.status = 'error'; el('state').textContent = copy('暂不可用', 'UNAVAILABLE');
          el('loading').hidden = false; el('loading').textContent = copy('公开行情暂不可用，请点击下方刷新重试。', 'Public prices are unavailable. Use refresh below to retry.');
        }
      } finally { state.inFlight = null; el('refresh').disabled = false; }
    })();
    return state.inFlight;
  }

  function lifecycle() {
    panel.dataset.motion = state.visible && !document.hidden && !state.suspended && !reduced.matches ? 'running' : 'paused';
    if (state.payload && state.visible && !document.hidden && !state.suspended) status();
    if (state.visible && !document.hidden && !state.suspended && Date.now() - state.attemptedAt >= REFRESH_MS) load();
  }
  svg.addEventListener('pointermove', inspect);
  svg.addEventListener('pointerdown', inspect);
  svg.addEventListener('click', event => { const marker = markerAt(event.target); if (marker) selectEvent(marker); });
  svg.addEventListener('focusin', event => { const marker = markerAt(event.target); if (marker) selectEvent(marker); });
  svg.setAttribute('tabindex', '0');
  svg.addEventListener('keydown', event => {
    const marker = markerAt(event.target);
    if (marker && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectEvent(marker); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !state.selected) return;
    event.preventDefault();
    const rows = state.payload.rows, selected = state.selected;
    let row = selected.row, index = Math.max(0, row.candles.indexOf(selected.candle));
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      row = rows[Math.max(0, Math.min(rows.length - 1, rows.indexOf(row) + (event.key === 'ArrowUp' ? -1 : 1)))];
    } else index += event.key === 'ArrowLeft' ? -1 : 1;
    if (row.candles.length) { clearEvent(); readout(row.candles[Math.max(0, Math.min(row.candles.length - 1, index))], row); }
  });
  svg.addEventListener('pointerleave', () => { state.crosshair?.setAttribute('visibility', 'hidden'); if (state.selected?.event) return; const row = state.payload?.rows.findLast(item => item.candles.length); if (row) readout(row.candles.at(-1), row); });
  el('refresh').addEventListener('click', load);
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  // All chart colors inherit CSS variables, so a theme change requires no path rebuild.
  document.addEventListener('visibilitychange', lifecycle);
  reduced.addEventListener('change', lifecycle);
  const observer = new IntersectionObserver(entries => { state.visible = entries[0].isIntersecting; lifecycle(); }, { threshold: 0 });
  observer.observe(panel);
  let timer = setInterval(lifecycle, 60000);
  window.addEventListener('pagehide', () => { state.suspended = true; panel.dataset.motion = 'paused'; clearInterval(timer); observer.disconnect(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { state.suspended = false; observer.observe(panel); timer = setInterval(lifecycle, 60000); lifecycle(); } });
  updateLabels();
  try { const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (cached && Date.now() - cached.savedAt < DAY) apply(cached.payload, true); } catch {}
})();
