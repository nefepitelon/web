const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const catalog = require('../lib/cex-hub-catalog.json');
const tick = () => new Promise(resolve => setImmediate(resolve));
function load(file, imports, extra = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, URL, Response, AbortController, setTimeout, clearTimeout, fetch, ...extra, require(name) { assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`); return imports[name]; } });
  return exports;
}
const serviceModule = load('lib/cex-hub-data.ts', { './cex-hub-catalog.json': catalog });
const iconLayouts = load('lib/cex-hub-icon-layouts.ts', {});
test('local logo transforms remove measured transparent padding without altering brand files', async () => {
  const sharp = require('sharp');
  for (const row of catalog) {
    const layout = iconLayouts.cexHubIconLayout(row.id);
    assert.ok(layout, row.id);
    const match = layout.transform.match(/^scale\(([\d.]+)\) translate\(([-\d.]+)%, ([-\d.]+)%\)$/);
    assert.ok(match, row.id);
    const [scale, x, y] = match.slice(1).map(Number);
    const { data, info } = await sharp(`public/cex-icons/${row.id}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width, top = info.height, right = -1, bottom = -1;
    for (let py = 0; py < info.height; py++) for (let px = 0; px < info.width; px++) if (data[(py * info.width + px) * info.channels + 3] > 0) {
      left = Math.min(left, px); top = Math.min(top, py); right = Math.max(right, px); bottom = Math.max(bottom, py);
    }
    const extent = Math.max(right - left + 1, bottom - top + 1);
    assert.ok(Math.abs(extent * scale - info.width) < 0.001, `${row.id}: logo must fill its image box`);
    assert.ok(Math.abs((left + (right - left + 1) / 2) + x / 100 * info.width - info.width / 2) < 0.001, `${row.id}: horizontal centering`);
    assert.ok(Math.abs((top + (bottom - top + 1) / 2) + y / 100 * info.height - info.height / 2) < 0.001, `${row.id}: vertical centering`);
  }
  assert.equal(iconLayouts.cexHubIconLayout('toString'), undefined);
  assert.equal(iconLayouts.cexHubIconLayout('not-a-venue'), undefined);
});
const baseTime = Date.UTC(2026, 10, 8, 1);
function fixture() {
  let clock = baseTime;
  const calls = [], failures = new Set();
  const spot = catalog.filter(row => row.spotId).map((row, index) => ({ id: row.spotId, trade_volume_24h_btc: index === 0 ? '0' : '2', trade_volume_24h_btc_normalized: 999999, trust_score: 9, trust_score_rank: index + 1, year_established: 2017, country: 'United States', image: 'https://coin-images.coingecko.com/markets/images/1/small/icon.png' }));
  const derivativeIds = [...new Set(catalog.flatMap(row => row.derivativesIds || []))];
  const split = Math.ceil(derivativeIds.length / 2);
  const derivatives = derivativeIds.map(id => ({ id, trade_volume_24h_btc: '3', open_interest_btc: '4', number_of_perpetual_pairs: 5, number_of_futures_pairs: 2, year_established: 2018, country: 'Seychelles' }));
  const paprika = [{ id: 'unmapped-exchange', type: ['cex'], active: true, api_status: true, markets_data_fetched: true, markets: 2, currencies: 2, last_updated: new Date(clock).toISOString(), quotes: { USD: { reported_volume_24h: 5 } } }];
  const nativeCoinbase = [{ id: 'BTC-USD', base_currency: 'BTC', quote_currency: 'USD', status: 'online', trading_disabled: false, cancel_only: false }];
  const bingx = { code: 0, data: { symbols: [{ symbol: 'BTC-USDT', status: 1 }] } };
  const bitunix = { code: '0', data: [{ symbol: 'btcusdt', base: 'BTC', quote: 'USDT', isOpen: 1 }] };
  const data = { spot, paprika, nativeCoinbase, bingx, bitunix, first: derivatives.slice(0, split), second: derivatives.slice(split), btc: { bitcoin: { usd: 100000, last_updated_at: clock / 1000 } } };
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    const u = new URL(url), key = u.hostname === 'api.exchange.coinbase.com' ? 'nativeCoinbase' : u.hostname === 'open-api.bingx.com' ? 'bingx' : u.hostname === 'openapi.bitunix.com' ? 'bitunix' : u.hostname === 'api.coinpaprika.com' ? 'paprika' : u.pathname.endsWith('/simple/price') ? 'btc' : u.pathname.endsWith('/derivatives/exchanges') ? u.searchParams.get('page') === '2' ? 'second' : 'first' : 'spot';
    if (failures.has(key)) return Response.json({ error: 'unavailable' }, { status: 503 });
    if (key === 'btc' && data.btc.bitcoin.last_updated_at === baseTime / 1000) data.btc.bitcoin.last_updated_at = clock / 1000;
    return Response.json(data[key]);
  };
  return { data, calls, failures, fetcher, now: () => clock, advance: ms => { clock += ms; } };
}
test('CEX directory uses exact centralized identities and keeps reported spot, derivatives and OI separate', async () => {
  const f = fixture();
  f.data.spot.push({ id: 'uniswap', trade_volume_24h_btc: 1e10 });
  const result = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  assert.equal(result.exchanges.length, catalog.length);
  assert.ok(catalog.length >= 150);
  assert.equal(new Set(catalog.map(row => row.id)).size, catalog.length);
  assert.ok(result.exchanges.every(row => row.centralized === true));
  assert.ok(!result.exchanges.some(row => ['uniswap', 'hyperliquid', 'dydx', 'pancakeswap', 'aster'].includes(row.id)));
  const first = result.exchanges.find(row => row.id === catalog[0].id);
  assert.equal(first.spotVolume24hUsd, 0, 'reported zero is valid; normalized field must not replace it');
  const binance = result.exchanges.find(row => row.id === 'binance');
  assert.equal(binance.spotVolume24hUsd, 200000);
  assert.equal(binance.derivativesVolume24hUsd, 300000);
  assert.equal(binance.openInterestUsd, 400000);
  assert.equal(binance.derivativesMarkets, 7);
  assert.equal(binance.spotMarkets, null); assert.equal(binance.coins, null);
  assert.equal(binance.trustScore, 9); assert.equal(binance.fieldSources.spotVolume24hUsd, 'coingecko-spot');
  assert.equal(result.refreshIntervalSeconds, 60);
  assert.equal(f.calls.length, Object.keys(serviceModule.CEX_SOURCES).length);
  for (const { url, init } of f.calls) {
    assert.ok(['https://api.coingecko.com', 'https://api.coinpaprika.com', 'https://api.exchange.coinbase.com', 'https://open-api.bingx.com', 'https://openapi.bitunix.com'].includes(new URL(url).origin));
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    assert.deepEqual(Object.keys(init.headers), ['accept']);
    assert.ok(!/account|wallet|private|order|api_key/i.test(url));
  }
  for (const row of catalog) {
    const url = new URL(row.url); assert.equal(url.protocol, 'https:'); assert.equal(url.search, '');
    assert.ok(!['spotVolume24hUsd', 'derivativesVolume24hUsd', 'openInterestUsd', 'trustScore', 'markets'].some(key => Object.hasOwn(row, key)));
  }
});
test('parallel readers share each fixed request and failure retention expires without changing observation times', async () => {
  const f = fixture(), service = serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now, cacheTtlMs: 1000, staleTtlMs: 5000 });
  const snapshots = await Promise.all(Array.from({ length: 6 }, () => service.getSnapshot()));
  assert.equal(f.calls.length, Object.keys(serviceModule.CEX_SOURCES).length);
  const before = snapshots[0].exchanges.find(row => row.id === 'binance');
  f.advance(1001); Object.keys(f.data).forEach(key => f.failures.add(key));
  const retained = await service.getSnapshot(), row = retained.exchanges.find(row => row.id === 'binance');
  assert.equal(row.spotVolume24hUsd, before.spotVolume24hUsd); assert.equal(row.updatedAt, before.updatedAt);
  assert.equal(row.status, 'stale'); assert.ok(retained.sources.every(source => source.status === 'stale'));
  f.advance(5000); const expired = await service.getSnapshot();
  assert.ok(expired.exchanges.every(row => row.spotVolume24hUsd === null && row.derivativesVolume24hUsd === null && row.openInterestUsd === null));
  assert.ok(expired.sources.every(source => source.status === 'unavailable'));
});
test('spot and derivative source failures are independent; old or future conversion quotes cannot manufacture USD amounts', async () => {
  const f = fixture(); f.failures.add('spot');
  const partial = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  const row = partial.exchanges.find(row => row.id === 'binance');
  assert.equal(row.spotVolume24hUsd, null); assert.equal(row.openInterestUsd, 400000); assert.equal(row.hasSpot, true);
  for (const timestamp of [baseTime - 1800001, baseTime + 300001]) {
    const invalid = fixture(); invalid.data.btc.bitcoin.last_updated_at = timestamp / 1000;
    const snapshot = await serviceModule.createCexHubService({ fetch: invalid.fetcher, now: invalid.now }).getSnapshot();
    assert.ok(snapshot.exchanges.every(row => row.spotVolume24hUsd === null && row.derivativesVolume24hUsd === null && row.openInterestUsd === null));
    assert.equal(snapshot.exchanges.find(row => row.id === 'binance').trustScore, 9);
    assert.equal(snapshot.exchanges.find(row => row.id === 'binance').derivativesMarkets, 7);
    assert.equal(snapshot.exchanges.find(row => row.id === 'binance').status, 'unavailable');
  }
  const retained = fixture(), service = serviceModule.createCexHubService({ fetch: retained.fetcher, now: retained.now, cacheTtlMs: 1000 });
  await service.getSnapshot(); retained.advance(1001); retained.failures.add('btc');
  const stale = await service.getSnapshot(), binance = stale.exchanges.find(row => row.id === 'binance');
  assert.equal(binance.fieldStatus.spotVolume24hUsd, 'stale'); assert.equal(binance.fieldStatus.trustScore, 'live'); assert.equal(binance.status, 'stale');
});
test('malformed records, duplicate identities, numeric overflow and placeholder markets remain unknown', async () => {
  for (const value of [null, undefined, '', ' ', false, true, -1, Infinity, 'NaN']) assert.equal(serviceModule.cexNumber(value), null);
  assert.equal(serviceModule.cexNumber('0'), 0);
  const f = fixture(); f.data.spot[0].trade_volume_24h_btc = 1e308; f.data.spot[0].trust_score = 11;
  f.data.first.push(f.data.first[0]);
  const snapshot = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  assert.equal(snapshot.exchanges[0].spotVolume24hUsd, null); assert.equal(snapshot.exchanges[0].trustScore, null);
  assert.equal(snapshot.sources.find(source => source.id === 'coingecko-derivatives').status, 'unavailable');
  const z = fixture(), bitmexId = catalog.find(row => row.id === 'bitmex').derivativesIds[0];
  const stub = [...z.data.first, ...z.data.second].find(row => row.id === bitmexId);
  stub.trade_volume_24h_btc = null; stub.open_interest_btc = null; stub.number_of_perpetual_pairs = 0; stub.number_of_futures_pairs = 0;
  let data = await serviceModule.createCexHubService({ fetch: z.fetcher, now: z.now }).getSnapshot();
  assert.equal(data.exchanges.find(row => row.id === 'bitmex').derivativesMarkets, null);
  stub.trade_volume_24h_btc = 0; stub.open_interest_btc = 0;
  z.failures.add('btc');
  data = await serviceModule.createCexHubService({ fetch: z.fetcher, now: z.now }).getSnapshot();
  assert.equal(data.exchanges.find(row => row.id === 'bitmex').derivativesMarkets, 0, 'explicit raw zero market observations do not depend on BTC conversion');
});
test('body decoding deadline releases the source and allows recovery on a later read', async () => {
  let clock = baseTime, stuck = true;
  const f = fixture();
  const service = serviceModule.createCexHubService({ now: () => clock, timeoutMs: 10, cacheTtlMs: 1, fetch: (...args) => stuck ? Promise.resolve({ ok: true, json: () => new Promise(() => {}) }) : f.fetcher(...args) });
  const result = await service.getSnapshot();
  assert.ok(result.sources.every(source => source.status === 'unavailable' && /超时/.test(source.error)));
  stuck = false; clock += 2;
  assert.ok((await service.getSnapshot()).sources.every(source => source.status === 'live'));
});
function paprikaRow(id, changes = {}) {
  return { id, type: ['cex'], active: true, api_status: true, markets_data_fetched: true, markets: 120, currencies: 83, last_updated: new Date(baseTime).toISOString(), quotes: { USD: { reported_volume_24h: 7654321, adjusted_volume_24h: 999999999 } }, ...changes };
}
test('public count enrichment uses exact spot identities and observation times; USD fallback does not require BTC', async () => {
  const f = fixture(), binanceId = catalog.find(row => row.id === 'binance').coinpaprikaId;
  assert.ok(binanceId);
  f.data.paprika = [paprikaRow(binanceId), paprikaRow('uniswap'), paprikaRow('binance-perpetual', { type: ['cex', 'perpetuals'], markets: 9999 })];
  let result = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  let row = result.exchanges.find(row => row.id === 'binance');
  assert.equal(row.spotMarkets, 120); assert.equal(row.coins, 83);
  assert.equal(row.spotVolume24hUsd, 200000, 'primary reported volume remains preferred');
  assert.equal(row.fieldSources.spotMarkets, 'coinpaprika-spot');
  assert.equal(row.fieldUpdatedAt.spotMarkets, new Date(baseTime).toISOString());
  assert.match(row.fieldNotes.spotMarkets, /CoinPaprika/);
  f.failures.add('btc');
  result = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  row = result.exchanges.find(row => row.id === 'binance');
  assert.equal(row.spotVolume24hUsd, 7654321); assert.equal(row.fieldSources.spotVolume24hUsd, 'coinpaprika-spot');
  assert.equal(row.openInterestUsd, null, 'spot fallback cannot synthesize derivatives');
  const coinbase = result.exchanges.find(row => row.id === 'coinbase');
  assert.equal(coinbase.derivativesVolume24hUsd, null); assert.equal(coinbase.openInterestUsd, null);
  assert.match(coinbase.fieldNotes.openInterestUsd, /Deribit/);
});
test('old, future, inactive, mixed derivative or malformed count observations cannot fill missing spot fields', async () => {
  const id = catalog.find(row => row.id === 'binance').coinpaprikaId;
  for (const changes of [{ last_updated: new Date(baseTime - 1800001).toISOString() }, { last_updated: new Date(baseTime + 300001).toISOString() }, { active: false }, { api_status: false }, { markets_data_fetched: false }, { type: ['cex', 'perpetuals'] }, { type: ['dex'] }, { markets: true, currencies: '' }, { markets: 1.5, currencies: -1 }]) {
    const f = fixture(); f.data.paprika = [paprikaRow(id, changes)];
    const row = (await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot()).exchanges.find(row => row.id === 'binance');
    assert.equal(row.spotMarkets, null, JSON.stringify(changes)); assert.equal(row.coins, null, JSON.stringify(changes));
  }
  const f = fixture(); f.data.paprika = [paprikaRow(id), paprikaRow(id)];
  const result = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  assert.equal(result.sources.find(source => source.id === 'coinpaprika-spot').status, 'unavailable');
  assert.equal(result.exchanges.find(row => row.id === 'binance').spotMarkets, null);
});
test('native public catalogs count only enabled markets and distinct base assets, with independent five-minute caching', async () => {
  const f = fixture();
  f.data.nativeCoinbase.push({ id: 'BTC-EUR', base_currency: 'BTC', status: 'online' }, { id: 'ETH-USD', base_currency: 'ETH', status: 'offline' }, { id: 'SOL-USD', base_currency: 'SOL', status: 'online', cancel_only: true });
  f.data.bingx.data.symbols.push({ symbol: 'BTC-USDC', status: 1 }, { symbol: 'ETH-USDT', status: 0 });
  f.data.bitunix.data.push({ symbol: 'btcusdc', base: 'BTC', isOpen: '1' }, { symbol: 'ethusdt', base: 'ETH', isOpen: 0 });
  const service = serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now });
  const snapshot = await service.getSnapshot();
  for (const [id, source] of [['coinbase', 'coinbase-products'], ['bingx', 'bingx-spot-symbols'], ['bitunix', 'bitunix-spot-pairs']]) {
    const row = snapshot.exchanges.find(row => row.id === id);
    assert.equal(row.spotMarkets, 2); assert.equal(row.coins, 1); assert.equal(row.fieldSources.coins, source);
  }
  const nativeCalls = () => f.calls.filter(call => !/coingecko|coinpaprika/.test(call.url)).length;
  assert.equal(nativeCalls(), 3);
  f.advance(60001); await service.getSnapshot(); assert.equal(nativeCalls(), 3);
  f.advance(240000); await service.getSnapshot(); assert.equal(nativeCalls(), 6);
});
test('native lifecycle schema failures retain prior counts rather than overwrite them with zero', async () => {
  const f = fixture(), service = serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now, cacheTtlMs: 1 });
  await service.getSnapshot();
  delete f.data.nativeCoinbase[0].status;
  delete f.data.bingx.data.symbols[0].status;
  delete f.data.bitunix.data[0].isOpen;
  f.advance(2);
  const retained = await service.getSnapshot();
  for (const id of ['coinbase', 'bingx', 'bitunix']) {
    const row = retained.exchanges.find(row => row.id === id);
    assert.equal(row.spotMarkets, 1, id); assert.equal(row.coins, 1, id);
    assert.equal(row.fieldStatus.spotMarkets, 'stale', id);
  }
  const initial = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  for (const id of ['coinbase', 'bingx', 'bitunix']) assert.equal(initial.exchanges.find(row => row.id === id).spotMarkets, null, id);
});
test('public CEX route exposes reads without credentials and reports a complete market outage as 503', async () => {
  let snapshot = { exchanges: [{ spotVolume24hUsd: 0, derivativesVolume24hUsd: null, openInterestUsd: null }] };
  const route = load('app/api/hedge-ops/cex-hub/route.ts', { '@/lib/cex-hub-data': { getCexHubSnapshot: async () => snapshot } });
  let response = await route.GET(); assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /s-maxage=30/);
  snapshot = { exchanges: [{ spotVolume24hUsd: null, derivativesVolume24hUsd: null, openInterestUsd: null }] };
  response = await route.GET(); assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(route.POST, undefined);
  const cookiePolicy = load('lib/supabase/cookie-options.ts', {}, { process: { env: { NODE_ENV: 'production' } } });
  const proxy = load('proxy.ts', { '@supabase/ssr': {}, 'next/server': {}, '@/lib/supabase/response': {}, '@/lib/supabase/cookie-options': cookiePolicy });
  assert.equal(proxy.bypassSupabaseAuth({ method: 'GET', nextUrl: { pathname: '/api/hedge-ops/cex-hub' } }), true);
  assert.equal(proxy.bypassSupabaseAuth({ method: 'POST', nextUrl: { pathname: '/api/hedge-ops/cex-hub' } }), false);
  assert.equal(proxy.bypassSupabaseAuth({ method: 'GET', nextUrl: { pathname: '/api/hedge-ops/runtime' } }), false);
});
function uiHarness(initial = null, fetchImpl) {
  let cursor = 0, refCursor = 0;
  const state = initial ? [initial] : [], refs = [], effects = [], calls = [], listeners = new Map();
  const jsx = (type, props) => ({ type, props });
  const react = { memo: fn => fn, useState(value) { const index = cursor++; if (!(index in state)) state[index] = typeof value === 'function' ? value() : value; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; }, useRef(value) { return refs[refCursor++] ?? (refs[refCursor - 1] = { current: value }); }, useMemo(fn) { return fn(); }, useEffect(fn) { effects.push(fn); } };
  const output = {}, document = { hidden: false, addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  const source = ts.transpileModule(fs.readFileSync('components/cex-hub.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source + '\nexports.Table=ExchangeTable; exports.Share=MarketShare; exports.Bubble=BubbleChart; exports.Sources=PublicSources;', { exports: output, URL, Date, Intl, AbortController, document, setTimeout, clearTimeout, clearInterval, window: { setTimeout, clearTimeout, setInterval: () => 1 }, fetch: (...args) => { calls.push(args); if (fetchImpl) return fetchImpl(...args); return new Promise((_, reject) => args[1].signal.addEventListener('abort', () => reject(Error('aborted')))); }, require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }; return new Proxy({}, { get: () => () => null }); } });
  return { calls, document, listeners, render(which, props) { cursor = 0; refCursor = 0; effects.length = 0; return output[which](props); }, runEffects() { return effects.splice(0).map(effect => effect()).filter(Boolean); } };
}
function elements(node, match) { if (!node || typeof node !== 'object') return []; if (typeof node.type === 'function') return elements(node.type(node.props), match); return [...(match(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => elements(child, match))]; }
function text(node) { if (typeof node === 'string' || typeof node === 'number') return String(node); if (!node || typeof node !== 'object') return ''; if (typeof node.type === 'function') return text(node.type(node.props)); return [node.props?.children].flat(Infinity).map(text).join(''); }
test('directory filters by confirmed products during missing data and sorts nulls last in both directions', async () => {
  const f = fixture(), snapshot = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  const rows = snapshot.exchanges.slice(0, 5).map((row, index) => ({ ...row, spotVolume24hUsd: index === 0 ? null : index * 100 }));
  const h = uiHarness(); let tree = h.render('Table', { rows });
  const body = () => elements(tree, node => node.type === 'tbody')[0];
  assert.ok(text(elements(body(), node => node.type === 'tr').at(-1)).includes(rows[0].name));
  elements(tree, node => node.type === 'button' && text(node) === '现货 24h 成交')[0].props.onClick(); tree = h.render('Table', { rows });
  assert.ok(text(elements(body(), node => node.type === 'tr').at(-1)).includes(rows[0].name));
  elements(tree, node => node.type === 'select')[0].props.onChange({ target: { value: 'derivatives' } }); tree = h.render('Table', { rows });
  assert.equal(elements(body(), node => node.type === 'tr').length, rows.filter(row => row.hasDerivatives).length);
  elements(tree, node => node.type === 'input')[0].props.onChange({ target: { value: 'no such exchange' } }); tree = h.render('Table', { rows }); assert.equal(elements(body(), node => node.type === 'tr').length, 0);
  elements(tree, node => node.type === 'button' && text(node) === '清除筛选')[0].props.onClick(); tree = h.render('Table', { rows }); assert.equal(elements(body(), node => node.type === 'tr').length, rows.length);
});
test('donut keyboard selections, grouped exchanges and metric changes stay consistent; bubble never mixes spot volume into derivatives', async () => {
  const f = fixture(), snapshot = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  const rows = snapshot.exchanges.slice(0, 10).map((row, index) => ({ ...row, spotVolume24hUsd: 1000 - index * 10, derivativesVolume24hUsd: index ? 50 + index : null, openInterestUsd: 100 + index }));
  const h = uiHarness(); let tree = h.render('Share', { rows });
  const path = elements(tree, node => node.type === 'path' && node.props.role === 'button')[0]; let prevented = false;
  path.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } }); tree = h.render('Share', { rows }); assert.ok(prevented); assert.match(text(elements(tree, node => node.props.className === 'pdb-share-detail')[0]), /\$1,000/);
  elements(tree, node => node.type === 'path' && node.props.role === 'button').at(-1).props.onClick(); tree = h.render('Share', { rows });
  assert.equal(elements(elements(tree, node => node.props.className === 'pdb-share-others')[0], node => node.type === 'button').length, 3);
  elements(tree, node => node.type === 'button' && text(node) === '合约持仓 OI')[0].props.onClick(); tree = h.render('Share', { rows }); assert.match(text(elements(tree, node => node.props.className === 'pdb-share-detail')[0]), /点击环形图/);
  const bubble = uiHarness().render('Bubble', { rows }); assert.equal(elements(bubble, node => node.type === 'circle' && node.props.role === 'button').length, 9);
  assert.ok(!text(bubble).includes('TVL'));
});
test('inactive CEX view makes no requests; hiding and unmounting abort its read', async () => {
  const hidden = uiHarness(); hidden.render('CexHub', { active: false }); hidden.runEffects(); assert.equal(hidden.calls.length, 0);
  const h = uiHarness(); h.render('CexHub', { active: true }); const cleanups = h.runEffects(); assert.equal(h.calls.length, 1);
  h.document.hidden = true; h.listeners.get('visibilitychange')(); await tick(); assert.equal(h.calls[0][1].signal.aborted, true);
  cleanups.forEach(fn => fn()); assert.equal(h.listeners.size, 0);
});
test('validated outage snapshots clear expired server values and offline client snapshots hide USD after one hour', async () => {
  const f = fixture(), snapshot = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  snapshot.generatedAt = new Date().toISOString();
  const outage = { ...snapshot, exchanges: snapshot.exchanges.map(row => ({ ...row, spotVolume24hUsd: null, derivativesVolume24hUsd: null, openInterestUsd: null, status: 'unavailable' })) };
  const h = uiHarness(snapshot, async () => Response.json(outage, { status: 503 }));
  h.render('CexHub', { active: true }); const cleanups = h.runEffects();
  await tick(); await tick();
  let tree = h.render('CexHub', { active: true });
  const panels = tree.props.children.flat().find(node => typeof node?.type === 'function' && node.type.name === 'MarketPanels');
  assert.ok(panels.props.rows.every(row => row.spotVolume24hUsd === null && row.openInterestUsd === null));
  assert.match(text(tree), /HTTP 503/);
  cleanups.forEach(fn => fn());
  const old = { ...snapshot, generatedAt: new Date(Date.now() - 3600001).toISOString() };
  tree = uiHarness(old).render('CexHub', { active: false });
  const expired = tree.props.children.flat().find(node => typeof node?.type === 'function' && node.type.name === 'MarketPanels');
  assert.ok(expired.props.rows.every(row => row.spotVolume24hUsd === null && row.derivativesVolume24hUsd === null && row.openInterestUsd === null));
  assert.equal(expired.props.rows.find(row => row.id === 'coinbase').spotMarkets, snapshot.exchanges.find(row => row.id === 'coinbase').spotMarkets);
  assert.match(text(tree), /已隐藏过期金额/);
});
test('CEX source marquee keeps accessible links without footer controls or notes', async () => {
  const f = fixture(), snapshot = await serviceModule.createCexHubService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  const h = uiHarness(); let tree = h.render('Sources', { sources: snapshot.sources }); assert.equal(tree.type, 'footer');
  const duplicate = elements(tree, node => node.props.className === 'pdb-source-group')[1]; assert.equal(duplicate.props['aria-hidden'], true); assert.ok(elements(duplicate, node => node.type === 'a').every(node => node.props.tabIndex === -1));
  assert.equal(elements(tree, node => node.type === 'button' || node.type === 'p').length, 0);
});
