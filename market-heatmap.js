(() => {
  const panel = document.getElementById('market-heatmap');
  if (!panel) return;
  const el = id => document.getElementById('market-heatmap-' + id);
  const REFRESH_MS = 4 * 60 * 60 * 1000, CACHE_MS = 24 * 60 * 60 * 1000;
  const CACHE_KEY = 'welinkbtc-market-heatmap-v1';
  const GROUPS = ['crypto', 'stocks', 'indices', 'commodities'];
  const state = { data: null, mode: 'volume', filter: 'all', selected: null, popupId: null, popupAnchor: null, popupFrame: 0, pending: null, visible: false, suspended: false, attemptedAt: 0, timer: null, frame: 0 };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const english = () => document.documentElement.lang.startsWith('en');
  const copy = (zh, en) => english() ? en : zh;
  const labels = {
    title: ['全球市场热力图', 'Global market heatmap'], intro: ['穿透市场温度，观察不同资产的涨跌与资金活跃度。', 'A vivid view of price changes and activity across global markets.'],
    volume: ['成交额', 'Volume'], oi: ['持仓量', 'Open interest'], all: ['全部市场', 'All markets'], crypto: ['加密资产', 'Crypto'], stocks: ['股票', 'Stocks'], indices: ['指数 / ETF', 'Indices / ETFs'], commodities: ['商品', 'Commodities'],
    loading: ['正在载入多资产市场快照…', 'Loading a public multi-asset snapshot…'], inspect: ['悬停、点击或聚焦色块，查看资产详情。', 'Hover, select or focus a tile to inspect the asset.'], refresh: ['刷新快照', 'Refresh snapshot'],
    unavailable: ['公开行情暂不可用，请点击下方刷新重试。', 'Public data is unavailable. Refresh below to retry.'],
    method: ['各分类内面积代表24小时成交额或持仓名义金额，颜色代表24小时涨跌。公开永续合约行情，非股票现货报价；每4小时自动刷新。', 'Within each category, area shows 24h volume or open-interest notional; color shows 24h change. Public perpetuals, not stock spot quotes. Refreshes every 4 hours.']
  };
  const formatMoney = value => Number.isFinite(value) ? new Intl.NumberFormat(english() ? 'en-US' : 'zh-CN', { style: 'currency', currency: 'USD', notation: value >= 100000 ? 'compact' : 'standard', maximumFractionDigits: value < 1 ? 5 : value < 100 ? 2 : 1 }).format(value) : '—';
  const formatChange = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '—';
  const dateTime = value => new Intl.DateTimeFormat(english() ? 'en-GB' : 'zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  const weight = asset => state.mode === 'oi' ? asset.openInterestUsd : asset.volume24hUsd;
  const popup = document.createElement('aside');
  popup.id = 'market-heatmap-popover'; popup.className = 'market-heatmap-popover'; popup.hidden = true;
  popup.setAttribute('popover', 'manual'); popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-labelledby', 'market-heatmap-popover-title');
  const part = (tag, className, parent) => { const node = document.createElement(tag); node.className = className; parent.append(node); return node; };
  const popupHead = part('div', 'market-heatmap-popover-head', popup);
  const popupIcon = part('span', 'market-heatmap-popover-icon', popupHead); popupIcon.setAttribute('aria-hidden', 'true');
  const popupIdentity = part('div', 'market-heatmap-popover-identity', popupHead);
  const popupTitle = part('h3', '', popupIdentity); popupTitle.id = 'market-heatmap-popover-title';
  const popupCategory = part('p', '', popupIdentity);
  const popupClose = part('button', 'market-heatmap-popover-close', popupHead); popupClose.id = 'market-heatmap-popover-close'; popupClose.type = 'button'; popupClose.textContent = '×';
  const popupPriceLabel = part('p', 'market-heatmap-popover-price-label', popup);
  const popupQuote = part('div', 'market-heatmap-popover-quote', popup);
  const popupPrice = part('strong', '', popupQuote), popupChange = part('span', '', popupQuote);
  const popupMetrics = part('dl', 'market-heatmap-popover-metrics', popup);
  const popupFields = ['volume', 'oi'].map(key => { const cell = part('div', '', popupMetrics); return { key, label: part('dt', '', cell), value: part('dd', '', cell) }; });
  const popupStamp = part('p', 'market-heatmap-popover-stamp', popup);
  const popupSource = part('p', 'market-heatmap-popover-source', popup);
  const popupReport = part('button', 'market-heatmap-popover-report', popup);
  popupReport.type = 'button'; popupReport.id = 'market-heatmap-popover-report';
  popupReport.setAttribute('aria-haspopup', 'dialog');
  popupReport.addEventListener('click', () => {
    const assetId = state.popupId, origin = popupTile();
    if (!assetId || !window.WelinkAssetDailyReport?.open) return;
    closePopup();
    window.WelinkAssetDailyReport.open(assetId, { origin });
  });
  document.body.append(popup);

  function popupTile() {
    return [...panel.querySelectorAll('.market-heatmap-tile')].find(item => item.dataset.asset === state.popupId && !item.closest('[hidden]'));
  }

  function closePopup(restoreFocus = false) {
    const origin = popupTile();
    state.popupId = null; state.popupAnchor = null;
    if (typeof popup.hidePopover === 'function' && popup.matches(':popover-open')) popup.hidePopover();
    popup.hidden = true; delete popup.dataset.asset;
    panel.querySelectorAll('.market-heatmap-tile[aria-expanded="true"]').forEach(item => item.setAttribute('aria-expanded', 'false'));
    cancelAnimationFrame(state.popupFrame); state.popupFrame = 0;
    if (restoreFocus) origin?.focus({ preventScroll: true });
  }

  function positionPopup() {
    state.popupFrame = 0;
    if (!state.popupId || popup.hidden) return;
    const origin = popupTile(); if (!origin) return closePopup();
    const rect = origin.getBoundingClientRect(), viewport = window.visualViewport;
    const left = (viewport?.offsetLeft || 0) + 12, top = (viewport?.offsetTop || 0) + 12;
    const right = left + (viewport?.width || innerWidth) - 24, bottom = top + (viewport?.height || innerHeight) - 24;
    const nav = document.querySelector('.dashboard-subnav')?.getBoundingClientRect();
    const safeTop = nav && nav.top <= top && nav.bottom > top ? Math.min(bottom, nav.bottom + 8) : top;
    if (rect.bottom < safeTop || rect.top > bottom || rect.right < left || rect.left > right) return closePopup();
    popup.style.maxHeight = `${Math.max(0, bottom - safeTop)}px`; popup.style.maxWidth = `${Math.max(0, right - left)}px`;
    const box = popup.getBoundingClientRect(), anchor = state.popupAnchor || { x: .5, y: .5 };
    const x = Math.max(left, Math.min(right, rect.left + rect.width * anchor.x));
    const y = Math.max(safeTop, Math.min(bottom, rect.top + rect.height * anchor.y));
    const targetX = x + 16 + box.width <= right ? x + 16 : x - box.width - 16;
    const targetY = y + 16 + box.height <= bottom ? y + 16 : y - box.height - 16;
    popup.style.left = `${Math.max(left, Math.min(right - box.width, targetX))}px`;
    popup.style.top = `${Math.max(safeTop, Math.min(bottom - box.height, targetY))}px`;
  }

  function queuePopupPosition() { if (state.popupId && !state.popupFrame) state.popupFrame = requestAnimationFrame(positionPopup); }

  function updatePopup() {
    if (!state.popupId) return;
    const group = state.data?.groups.find(group => group.assets.some(asset => asset.id === state.popupId));
    const asset = group?.assets.find(asset => asset.id === state.popupId);
    if (!asset || !popupTile()) return closePopup();
    popup.dataset.asset = asset.id;
    popupIcon.textContent = assetIcon(asset.symbol); popupTitle.textContent = asset.name || asset.symbol;
    popupCategory.textContent = `${asset.symbol} · ${labels[group.id][english() ? 1 : 0]}`;
    popupClose.setAttribute('aria-label', copy('关闭资产详情', 'Close asset details'));
    popupPriceLabel.textContent = copy('标记价格 · USD', 'Mark price · USD');
    popupPrice.textContent = new Intl.NumberFormat(english() ? 'en-US' : 'zh-CN', { style: 'currency', currency: 'USD', maximumFractionDigits: asset.price < 1 ? 5 : 2 }).format(asset.price);
    popupChange.textContent = formatChange(asset.change24hPct); popupChange.className = asset.change24hPct >= 0 ? 'market-heatmap-up' : 'market-heatmap-down';
    for (const field of popupFields) {
      field.label.textContent = field.key === 'volume' ? copy('24H 成交额', '24h volume') : copy('持仓名义金额', 'Open interest');
      field.value.textContent = formatMoney(field.key === 'volume' ? asset.volume24hUsd : asset.openInterestUsd);
    }
    const observed = Date.parse(asset.asOf), stale = asset.stale || state.data.stale || Number.isFinite(observed) && Date.now() - observed >= REFRESH_MS;
    popupStamp.textContent = Number.isFinite(observed) ? `${stale ? copy('历史快照', 'Dated snapshot') : copy('采集时间', 'Collected')} · ${dateTime(observed)} CST` : copy('采集时间暂不可用', 'Collection time unavailable');
    popupStamp.dataset.stale = String(Boolean(stale));
    popupSource.textContent = copy('Hyperliquid · 公开永续合约行情', 'Hyperliquid · Public perpetual market');
    popupReport.textContent = copy('完整日报 · 证据研判与分享', 'Daily report · Evidence & share');
    popupReport.setAttribute('aria-label', copy(`查看 ${asset.symbol} 完整日报`, `Open ${asset.symbol} daily report`));
    queuePopupPosition();
  }

  function togglePopup(assetId, origin, event) {
    if (state.popupId === assetId) return closePopup();
    inspect(assetId); state.popupId = assetId;
    const rect = origin.getBoundingClientRect();
    state.popupAnchor = event.detail > 0 && rect.width && rect.height ? { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) } : { x: .5, y: .5 };
    panel.querySelectorAll('.market-heatmap-tile').forEach(item => item.setAttribute('aria-expanded', String(item === origin)));
    popup.hidden = false;
    if (typeof popup.showPopover === 'function' && !popup.matches(':popover-open')) popup.showPopover();
    updatePopup(); cancelAnimationFrame(state.popupFrame); positionPopup();
    if (event.detail === 0) popupClose.focus({ preventScroll: true });
  }

  function valid(data) {
    if (data?.ok !== true || data.schema !== 1 || !Array.isArray(data.groups) || data.groups.length > 4) return false;
    const timestamp = Date.parse(data.asOf);
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60000 || Date.now() - timestamp > CACHE_MS) return false;
    const groupIds = new Set(), assets = new Set();
    for (const group of data.groups) {
      if (!GROUPS.includes(group.id) || groupIds.has(group.id) || !Array.isArray(group.assets) || group.assets.length > 100) return false;
      groupIds.add(group.id);
      for (const asset of group.assets) {
        if (typeof asset.id !== 'string' || assets.has(asset.id) || typeof asset.symbol !== 'string' || asset.symbol.length > 30 || !Number.isFinite(asset.price) || asset.price <= 0 || !Number.isFinite(asset.change24hPct)) return false;
        if (![asset.volume24hUsd, asset.openInterestUsd].every(value => value === null || Number.isFinite(value) && value >= 0)) return false;
        assets.add(asset.id);
      }
    }
    return assets.size > 0;
  }

  // Balanced binary treemap: every tile preserves its actual share of category notional.
  function partition(items, x, y, width, height) {
    if (!items.length) return [];
    if (items.length === 1) return [{ asset: items[0], x, y, width, height }];
    const sum = items.reduce((total, item) => total + weight(item), 0);
    let index = 1, subtotal = weight(items[0]);
    while (index < items.length - 1 && Math.abs(subtotal + weight(items[index]) - sum / 2) < Math.abs(subtotal - sum / 2)) subtotal += weight(items[index++]);
    const ratio = subtotal / sum;
    return width >= height
      ? [...partition(items.slice(0, index), x, y, width * ratio, height), ...partition(items.slice(index), x + width * ratio, y, width * (1 - ratio), height)]
      : [...partition(items.slice(0, index), x, y, width, height * ratio), ...partition(items.slice(index), x, y + height * ratio, width, height * (1 - ratio))];
  }

  function relabel() {
    panel.querySelectorAll('[data-heatmap-copy]').forEach(item => { const pair = labels[item.dataset.heatmapCopy]; if (pair) item.textContent = pair[english() ? 1 : 0]; });
    panel.querySelector('.market-heatmap-modes').setAttribute('aria-label', copy('面积指标', 'Tile area metric'));
    panel.querySelector('.market-heatmap-filters').setAttribute('aria-label', copy('市场分类', 'Market category'));
    updateStatus();
  }

  function updateStatus() {
    if (!state.data) {
      el('status').textContent = panel.dataset.status === 'error' ? copy('行情暂不可用', 'DATA UNAVAILABLE') : copy('正在连接公开行情…', 'CONNECTING…'); return;
    }
    const timestamp = Date.parse(state.data.asOf);
    const stale = state.data.stale || Date.now() - timestamp >= REFRESH_MS;
    panel.dataset.status = stale ? 'stale' : 'ready';
    el('status').textContent = `${state.data.partial ? copy('部分行情缺失', 'PARTIAL SNAPSHOT') : stale ? copy('历史快照', 'DATED SNAPSHOT') : copy('公开行情快照', 'PUBLIC SNAPSHOT')} · ${copy('4小时更新', '4H REFRESH')}`;
    const next = Date.parse(state.data.nextRefreshAt) || timestamp + REFRESH_MS;
    el('asof').textContent = `${copy('快照', 'As of')} ${dateTime(timestamp)} CST · ${next > Date.now() ? copy('下次', 'Next') + ' ' + dateTime(next) : copy('等待更新', 'Update due')}`;
  }

  function assetIcon(symbol) {
    return ({ BTC: '₿', ETH: 'Ξ', SOL: '◎', HYPE: 'H', GOLD: 'Au', SILVER: 'Ag', CL: '◈', XYZ100: '100', SP500: '500' })[symbol] || symbol.slice(0, 2);
  }

  function tile(asset) {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'market-heatmap-tile';
    item.dataset.asset = asset.id; item.dataset.symbol = asset.symbol; item.dataset.change = String(asset.change24hPct); item.dataset.weight = String(weight(asset));
    const magnitude = Math.min(1, Math.abs(asset.change24hPct) / 5), positive = asset.change24hPct >= 0;
    item.style.setProperty('--tile-hue', magnitude < .015 ? '200' : positive ? String(165 + magnitude * 9) : String(344 + magnitude * 6));
    item.style.setProperty('--tile-saturation', `${magnitude < .015 ? 8 : 48 + magnitude * 32}%`);
    item.style.setProperty('--tile-light', `${magnitude < .015 ? 29 : 25 + magnitude * 9}%`);
    const icon = document.createElement('span'); icon.className = 'market-heatmap-tile-icon'; icon.textContent = assetIcon(asset.symbol); icon.setAttribute('aria-hidden', 'true');
    const symbol = document.createElement('strong'); symbol.textContent = asset.symbol;
    const change = document.createElement('small'); change.textContent = formatChange(asset.change24hPct);
    item.append(icon, symbol, change);
    item.setAttribute('aria-label', `${asset.symbol} · ${formatChange(asset.change24hPct)} · ${copy('价格', 'Price')} ${formatMoney(asset.price)} · ${labels[state.mode][english() ? 1 : 0]} ${formatMoney(weight(asset))}`);
    item.setAttribute('aria-pressed', String(state.selected === asset.id)); item.classList.toggle('is-selected', state.selected === asset.id);
    item.setAttribute('aria-haspopup', 'dialog'); item.setAttribute('aria-controls', popup.id); item.setAttribute('aria-expanded', String(state.popupId === asset.id));
    item.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch' && !state.popupId) inspect(asset.id); });
    item.addEventListener('focus', () => { if (!state.popupId) inspect(asset.id); });
    item.addEventListener('click', event => togglePopup(asset.id, item, event));
    return item;
  }

  function visibleAssets(group) {
    return group.assets.filter(asset => Number.isFinite(weight(asset)) && weight(asset) > 0).sort((a, b) => weight(b) - weight(a)).slice(0, group.id === 'crypto' ? 18 : group.id === 'stocks' ? 20 : 12);
  }

  function render() {
    relabel(); if (!state.data) return;
    const focusedId = document.activeElement?.closest('.market-heatmap-tile')?.dataset.asset;
    const grid = el('grid'); grid.replaceChildren(); grid.dataset.filter = state.filter; grid.setAttribute('aria-busy', 'false');
    for (const id of GROUPS) {
      const group = state.data.groups.find(item => item.id === id) || { id, assets: [] };
      const section = document.createElement('section'); section.className = 'market-heatmap-group'; section.dataset.group = id; section.hidden = state.filter !== 'all' && state.filter !== id;
      const header = document.createElement('div'); header.className = 'market-heatmap-group-head';
      const heading = document.createElement('h3'); heading.textContent = labels[id][english() ? 1 : 0];
      const assets = visibleAssets(group), total = assets.reduce((sum, asset) => sum + weight(asset), 0);
      const weightedChange = total ? assets.reduce((sum, asset) => sum + asset.change24hPct * weight(asset) / total, 0) : null;
      const change = document.createElement('span'); change.textContent = formatChange(weightedChange); change.className = weightedChange >= 0 ? 'market-heatmap-up' : 'market-heatmap-down';
      change.title = copy('当前展示资产按所选指标加权的24小时涨跌', '24h change weighted by the selected metric across displayed assets');
      header.append(heading, change);
      const map = document.createElement('div'); map.className = 'market-heatmap-treemap'; map.dataset.group = id;
      if (!assets.length) { const empty = document.createElement('span'); empty.className = 'market-heatmap-group-empty'; empty.textContent = copy('该分类暂未返回可用行情', 'No available public data for this category'); map.append(empty); }
      else assets.forEach(asset => map.append(tile(asset)));
      section.append(header, map); grid.append(section);
    }
    if (state.selected && ![...grid.querySelectorAll('.market-heatmap-tile')].some(item => item.dataset.asset === state.selected && !item.closest('[hidden]'))) state.selected = null;
    layout(); inspect(state.selected, false); updatePopup();
    if (focusedId) [...grid.querySelectorAll('.market-heatmap-tile')].find(item => item.dataset.asset === focusedId)?.focus({ preventScroll: true });
  }

  function layout() {
    state.frame = 0; if (!state.data) return;
    panel.querySelectorAll('.market-heatmap-treemap').forEach(map => {
      if (map.closest('[hidden]')) return;
      const group = state.data.groups.find(item => item.id === map.dataset.group); if (!group) return;
      const rect = map.getBoundingClientRect(); if (!rect.width || !rect.height) return;
      const tiles = [...map.querySelectorAll('.market-heatmap-tile')];
      for (const cell of partition(visibleAssets(group), 0, 0, rect.width, rect.height)) {
        const item = tiles.find(tile => tile.dataset.asset === cell.asset.id); if (!item) continue;
        item.style.left = `${cell.x / rect.width * 100}%`; item.style.top = `${cell.y / rect.height * 100}%`; item.style.width = `${cell.width / rect.width * 100}%`; item.style.height = `${cell.height / rect.height * 100}%`;
        const edge = Math.min(cell.width, cell.height);
        item.dataset.size = edge < 29 ? 'tiny' : edge < 68 ? 'small' : edge > 150 ? 'large' : 'medium';
        item.style.setProperty('--tile-font', `${Math.max(10, Math.min(42, cell.width / (cell.asset.symbol.length * .65), edge * .23))}px`);
        item.style.setProperty('--tile-change-font', `${Math.max(9, Math.min(20, edge * .115))}px`);
      }
    });
    queuePopupPosition();
  }

  function inspect(id, select = true) {
    const asset = state.data?.groups.flatMap(group => group.assets).find(asset => asset.id === id);
    if (select && asset) {
      state.selected = id;
      panel.querySelectorAll('.market-heatmap-tile').forEach(item => { const active = item.dataset.asset === id; item.classList.toggle('is-selected', active); item.setAttribute('aria-pressed', String(active)); });
    }
    const detail = el('detail'); detail.replaceChildren();
    if (!asset) { const hint = document.createElement('span'); hint.textContent = labels.inspect[english() ? 1 : 0]; detail.append(hint); return; }
    const name = document.createElement('strong'); name.textContent = `${asset.symbol} · ${asset.name || asset.symbol}`; detail.append(name);
    for (const [label, value] of [[copy('标记价格', 'Mark price'), formatMoney(asset.price)], ['24H', formatChange(asset.change24hPct)], [copy('24H 成交额', '24h volume'), formatMoney(asset.volume24hUsd)], [copy('持仓名义金额', 'OI notional'), formatMoney(asset.openInterestUsd)]]) {
      const item = document.createElement('span'), number = document.createElement('b'); number.textContent = value; item.append(label + ' ', number); detail.append(item);
    }
    const observed = Date.parse(asset.asOf);
    if (Number.isFinite(observed)) { const stamp = document.createElement('span'); stamp.textContent = `${asset.stale ? copy('历史快照', 'Dated snapshot') : copy('采集时间', 'Collected')} ${dateTime(observed)} CST`; detail.append(stamp); }
  }

  async function load() {
    if (state.pending) return state.pending;
    state.attemptedAt = Date.now(); el('refresh').disabled = true; el('grid').setAttribute('aria-busy', 'true');
    state.pending = (async () => {
      try {
        const response = await fetch(`${window.WELINKBTC_DATA_API_BASE || ''}/api/market-heatmap`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw Error('Public market data unavailable');
        const data = await response.json(); if (!valid(data)) throw Error('Invalid market observations');
        state.data = data; render();
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      } catch {
        if (state.data && !valid(state.data)) state.data = null;
        if (state.data) { state.data = { ...state.data, stale: true }; updateStatus(); updatePopup(); }
        else {
          closePopup(); state.selected = null; inspect(null, false);
          panel.dataset.status = 'error'; el('grid').replaceChildren();
          const message = document.createElement('p'); message.className = 'market-heatmap-loading'; message.dataset.heatmapCopy = 'unavailable'; message.textContent = labels.unavailable[english() ? 1 : 0]; el('grid').append(message); updateStatus();
        }
      } finally { state.pending = null; el('refresh').disabled = false; el('grid').setAttribute('aria-busy', 'false'); schedule(); }
    })(); return state.pending;
  }

  function dueAt() {
    if (!state.data) return state.attemptedAt + 60000;
    return Math.max(state.attemptedAt + 60000, Date.parse(state.data.nextRefreshAt) || Date.parse(state.data.asOf) + REFRESH_MS);
  }
  function schedule() {
    clearTimeout(state.timer);
    if (state.visible && !document.hidden && !state.suspended) state.timer = setTimeout(lifecycle, Math.max(1000, dueAt() - Date.now()));
  }
  function lifecycle() {
    const active = state.visible && !document.hidden && !state.suspended;
    panel.dataset.motion = active && !reduced.matches ? 'running' : 'paused';
    if (document.hidden || state.suspended) closePopup();
    updateStatus(); if (active && Date.now() >= dueAt()) void load(); else schedule();
  }
  panel.querySelectorAll('[data-heatmap-mode]').forEach(button => button.addEventListener('click', () => {
    state.mode = button.dataset.heatmapMode;
    panel.querySelectorAll('[data-heatmap-mode]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); }); render();
  }));
  panel.querySelectorAll('[data-heatmap-filter]').forEach(button => button.addEventListener('click', () => {
    closePopup(); state.filter = button.dataset.heatmapFilter; state.selected = null;
    panel.querySelectorAll('[data-heatmap-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); }); render();
  }));
  el('refresh').addEventListener('click', load);
  popupClose.addEventListener('click', () => closePopup(true));
  document.addEventListener('pointerdown', event => { if (state.popupId && !popup.contains(event.target) && !event.target.closest('.market-heatmap-tile')) closePopup(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && state.popupId) { event.preventDefault(); closePopup(true); } });
  document.addEventListener('scroll', queuePopupPosition, { passive: true, capture: true });
  addEventListener('resize', queuePopupPosition, { passive: true });
  window.visualViewport?.addEventListener('resize', queuePopupPosition, { passive: true });
  window.visualViewport?.addEventListener('scroll', queuePopupPosition, { passive: true });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  const resize = new ResizeObserver(() => { if (!state.frame && state.visible) state.frame = requestAnimationFrame(layout); }); resize.observe(el('grid'));
  const observer = new IntersectionObserver(entries => { state.visible = entries[0].isIntersecting; if (state.visible) layout(); lifecycle(); }, { rootMargin: '200px 0px' }); observer.observe(panel);
  document.addEventListener('visibilitychange', lifecycle); reduced.addEventListener('change', lifecycle);
  addEventListener('pagehide', () => { closePopup(); state.suspended = true; panel.dataset.motion = 'paused'; clearTimeout(state.timer); cancelAnimationFrame(state.frame); state.frame = 0; observer.disconnect(); resize.disconnect(); });
  addEventListener('pageshow', event => { if (event.persisted) { state.suspended = false; observer.observe(panel); resize.observe(el('grid')); lifecycle(); } });
  try { const data = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (valid(data)) { state.data = { ...data, stale: data.stale || Date.now() - Date.parse(data.asOf) >= REFRESH_MS }; render(); } } catch {}
  relabel();
})();
