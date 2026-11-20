const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const catalog = require('../lib/perpdex-box-catalog.json');

function load(file, imports, extra = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(source, { exports, Response, AbortController, setTimeout, clearTimeout, fetch, ...extra,
    require(name) { assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`); return imports[name]; },
  });
  return exports;
}
const serviceModule = load('lib/perpdex-box-data.ts', { './perpdex-box-catalog.json': catalog });
const baseTime = Date.UTC(2026, 10, 7, 10);
const sourceCount = 5 + new Set(catalog.flatMap(row => row.hyperliquidDex ? [row.hyperliquidDex] : [])).size;

function fixture() {
  let clock = baseTime, fail = false, invalid = false, oldPrice = false;
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (fail) return Response.json({ error: 'provider unavailable' }, { status: 503 });
    if (invalid) return Response.json({ unexpected: true });
    const u = new URL(url);
    if (u.pathname.endsWith('/derivatives/exchanges')) return Response.json(catalog.flatMap(row => (row.coingeckoIds || []).map(id => ({
      id, open_interest_btc: id === 'hyperliquid' ? 2 : 1,
      trade_volume_24h_btc: id === 'hyperliquid' ? '3' : '2', number_of_perpetual_pairs: 5,
    }))));
    if (u.pathname.endsWith('/simple/price')) return Response.json({ bitcoin: { usd: 100000, last_updated_at: (oldPrice ? clock - 3600000 : clock) / 1000 } });
    if (u.pathname.includes('/overview/open-interest')) return Response.json({ protocols: catalog.filter(row => row.llamaOiSlug).map(row => ({ slug: row.llamaOiSlug, total24h: 500 })) });
    if (u.pathname === '/protocols') return Response.json([...new Set(catalog.flatMap(row => row.llamaTvlSlugs || []))].map(slug => ({ slug, tvl: 10000 })));
    if (u.origin === 'https://perpdexlist.com') return Response.json({ generated_at: new Date(clock).toISOString(), venues: catalog.filter(row => row.referenceId).map(row => ({ exchange: row.referenceId, volume_24h: 700, open_interest: 800, observed_at: new Date(clock - 120000).toISOString(), error: null, pending: false, ...(row.allowSynthetic ? { synthetic: true } : {}) })) });
    assert.equal(u.origin, 'https://api.hyperliquid.xyz');
    const body = JSON.parse(init.body);
    assert.equal(body.type, 'metaAndAssetCtxs');
    return Response.json([{ universe: [{ name: `${body.dex}:ACTIVE`, maxLeverage: 25 }, { name: `${body.dex}:OLD`, maxLeverage: 100, isDelisted: true }] }, [
      { openInterest: '3', markPx: '200', dayNtlVlm: '900' },
      { openInterest: '999999', markPx: '999999', dayNtlVlm: '999999' },
    ]]);
  };
  return { calls, fetcher, now: () => clock, advance: ms => { clock += ms; }, fail: () => { fail = true; }, invalid: () => { invalid = true; }, oldPrice: () => { oldPrice = true; } };
}

test('public market sources convert BTC units and separate HIP-3 children without trading calls', async () => {
  const f = fixture();
  const snapshot = await serviceModule.createPerpdexBoxService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  assert.equal(snapshot.exchanges.length, catalog.length);
  assert.ok(snapshot.exchanges.length > 32);
  assert.equal(snapshot.exchanges.filter(row => row.category === 'hip3').length, catalog.filter(row => row.category === 'hip3').length);
  assert.equal(snapshot.exchanges.filter(row => row.category === 'cex').length, 1);
  const parent = snapshot.exchanges.find(row => row.id === 'hyperliquid');
  assert.equal(parent.oiUsd, 200000);
  assert.equal(parent.volume24hUsd, 300000);
  assert.equal(parent.oiIncludesChildren, true);
  for (const row of snapshot.exchanges.filter(row => row.category === 'hip3')) {
    assert.equal(row.parentId, 'hyperliquid');
    assert.equal(row.oiUsd, 600);
    assert.equal(row.volume24hUsd, 900);
    assert.equal(row.markets, 1);
    assert.equal(row.maxLeverage, 25);
  }
  const jupiter = snapshot.exchanges.find(row => row.id === 'jupiter');
  assert.equal(jupiter.oiUsd, 500);
  assert.equal(jupiter.volume24hUsd, null);
  assert.equal(snapshot.refreshIntervalSeconds, 60);
  assert.ok(snapshot.warnings.some(w => w.includes('2026-10-19')));
  assert.equal(f.calls.length, sourceCount);
  for (const { url, init } of f.calls) {
    assert.ok(!/account|api_keys|order|private|wallet/.test(url));
    assert.deepEqual(Object.keys(init.headers).sort(), url.includes('hyperliquid') ? ['accept', 'content-type'] : ['accept']);
    assert.equal(init.redirect, 'error');
  }
});

test('overlapping refreshes share source reads; failed refreshes retain timestamps then expire', async () => {
  const f = fixture();
  const service = serviceModule.createPerpdexBoxService({ fetch: f.fetcher, now: f.now, cacheTtlMs: 1000, staleTtlMs: 5000 });
  const snapshots = await Promise.all(Array.from({ length: 8 }, () => service.getSnapshot()));
  assert.equal(f.calls.length, sourceCount);
  const observed = snapshots[0].exchanges.find(row => row.id === 'hyperliquid');
  f.advance(1001); f.fail();
  const stale = await service.getSnapshot();
  const retained = stale.exchanges.find(row => row.id === 'hyperliquid');
  assert.equal(retained.oiUsd, observed.oiUsd);
  assert.equal(retained.updatedAt, observed.updatedAt);
  assert.equal(retained.status, 'stale');
  assert.ok(stale.sources.every(source => source.status === 'stale'));
  f.advance(5000);
  const expired = await service.getSnapshot();
  assert.ok(expired.sources.every(source => source.status === 'unavailable'));
  assert.ok(expired.exchanges.every(row => row.oiUsd === null && row.volume24hUsd === null && row.tvlUsd === null));
});

test('invalid provider structures and old USD prices never become valid zero balances', async () => {
  const f = fixture(); f.invalid();
  const bad = await serviceModule.createPerpdexBoxService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  assert.ok(bad.exchanges.every(row => row.oiUsd === null && row.volume24hUsd === null && row.tvlUsd === null));
  assert.ok(bad.sources.every(source => source.status === 'unavailable'));
  const p = fixture(); p.oldPrice();
  const old = await serviceModule.createPerpdexBoxService({ fetch: p.fetcher, now: p.now }).getSnapshot();
  const cg = old.exchanges.find(row => row.id === 'hyperliquid');
  assert.equal(cg.oiUsd, 800); // Independent USD venue data remains valid without a BTC conversion quote.
  assert.equal(cg.volume24hUsd, 700);
  assert.equal(cg.fieldSources.oiUsd, 'perpdex-list');
  assert.equal(old.exchanges.find(row => row.id === 'entropy').oiUsd, 600);
  for (const value of [null, undefined, '', '  ', false, true, -1, Infinity, 'NaN']) assert.equal(serviceModule.perpdexNumber(value), null);
  assert.equal(serviceModule.perpdexNumber('0'), 0);
});

test('reference rows retain their own observation age and reject errors, pending and stale generations', async () => {
  async function snapshotWith(changeRow, changeEnvelope = () => {}) {
    const f = fixture();
    return serviceModule.createPerpdexBoxService({ now: f.now, fetch: async (url, init) => {
      const response = await f.fetcher(url, init);
      if (!url.startsWith('https://perpdexlist.com/')) return response;
      const data = await response.json();
      changeRow(data.venues.find(row => row.exchange === 'hello'));
      changeEnvelope(data);
      return Response.json(data);
    } }).getSnapshot();
  }
  for (const change of [row => { row.error = 'upstream unavailable'; }, row => { row.pending = true; }, row => { row.synthetic = true; }, row => { row.observed_at = new Date(baseTime - 3600001).toISOString(); }, row => { row.observed_at = new Date(baseTime + 300001).toISOString(); }, row => { row.observed_at = 'bad time'; }]) {
    const data = await snapshotWith(change);
    const row = data.exchanges.find(row => row.id === 'hello');
    assert.equal(row.oiUsd, null); assert.equal(row.volume24hUsd, null);
    assert.equal(data.exchanges.find(row => row.id === 'hyperliquid').oiUsd, 200000);
  }
  const aged = await snapshotWith(row => { row.observed_at = new Date(baseTime - 660000).toISOString(); });
  const retained = aged.exchanges.find(row => row.id === 'hello');
  assert.equal(retained.oiUsd, 800); assert.equal(retained.status, 'stale');
  assert.equal(retained.observedAt, new Date(baseTime - 660000).toISOString());
  assert.equal(retained.updatedAt, new Date(baseTime).toISOString());
  const oldGeneration = await snapshotWith(() => {}, data => { data.generated_at = new Date(baseTime - 1800001).toISOString(); });
  assert.equal(oldGeneration.exchanges.find(row => row.id === 'hello').oiUsd, null);
  assert.equal(oldGeneration.sources.find(row => row.id === 'perpdex-list').status, 'unavailable');
  const duplicate = await snapshotWith(() => {}, data => { data.venues.push(data.venues[0]); });
  assert.equal(duplicate.sources.find(row => row.id === 'perpdex-list').status, 'unavailable');
});

test('genuine synthetic perps are explicitly mapped and closed HIP-3 markets report zero active positions', async () => {
  const f = fixture();
  const snapshot = await serviceModule.createPerpdexBoxService({ now: f.now, fetch: async (url, init) => {
    if (url.includes('hyperliquid') && JSON.parse(init.body).dex === 'hyna') return Response.json([{ universe: [{ name: 'hyna:OLD', isDelisted: true, maxLeverage: 20 }] }, [{ openInterest: '4', markPx: '100', dayNtlVlm: '300' }]]);
    return f.fetcher(url, init);
  } }).getSnapshot();
  const synthetic = snapshot.exchanges.find(row => row.id === 'papertrade');
  assert.equal(synthetic.oiUsd, 800); assert.equal(synthetic.volume24hUsd, 700);
  assert.equal(synthetic.productLabel, '合成永续');
  const closed = snapshot.exchanges.find(row => row.id === 'hyena');
  assert.equal(closed.markets, 0); assert.equal(closed.oiUsd, 0); assert.equal(closed.volume24hUsd, 0);
  assert.equal(closed.parentId, 'hyperliquid');
  assert.equal(closed.maxLeverage, null);
});

test('reference outage leaves existing independent sources intact and catalog covers every reference venue', async () => {
  const f = fixture();
  const data = await serviceModule.createPerpdexBoxService({ now: f.now, fetch: (url, init) => url.startsWith('https://perpdexlist.com/') ? Response.json({ error: 'down' }, { status: 503 }) : f.fetcher(url, init) }).getSnapshot();
  assert.equal(data.exchanges.find(row => row.id === 'hyperliquid').oiUsd, 200000);
  assert.equal(data.exchanges.find(row => row.id === 'hello').oiUsd, null);
  const reference = require('./fixtures/perpdex-reference-venues.json');
  assert.equal(new Set(catalog.map(row => row.id)).size, catalog.length);
  assert.equal(new Set(catalog.filter(row => row.referenceId).map(row => row.referenceId)).size, reference.venues.length);
  for (const id of reference.venues) assert.ok(catalog.some(item => item.referenceId === id), `Unmapped ${id}`);
  for (const row of catalog) assert.ok(!['oiUsd', 'volume24hUsd', 'tvlUsd', 'markets'].some(key => Object.hasOwn(row, key)), `Static market metric ${row.id}`);
});

test('public route is read-only and reports total data outage honestly', async () => {
  let snapshot = { exchanges: [{ oiUsd: 0, volume24hUsd: null, tvlUsd: null }] };
  const route = load('app/api/hedge-ops/perpdex-box/route.ts', { '@/lib/perpdex-box-data': { getPerpdexBoxSnapshot: async () => snapshot } });
  let response = await route.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /s-maxage=30/);
  snapshot = { exchanges: [{ oiUsd: null, volume24hUsd: null, tvlUsd: null }] };
  response = await route.GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal(route[method], undefined);
});

test('a stalled response body is bounded and does not block a later read', async () => {
  const never = async () => ({ ok: true, json: () => new Promise(() => {}) });
  const service = serviceModule.createPerpdexBoxService({ fetch: never, timeoutMs: 10 });
  const result = await service.getSnapshot();
  assert.ok(result.sources.every(source => source.status === 'unavailable'));
  assert.ok(result.sources.every(source => /超时/.test(source.error)));
});

function uiHarness(initialSnapshot = null) {
  let cursor = 0;
  const state = initialSnapshot ? [initialSnapshot] : [], effects = [], calls = [];
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next; }]; },
    useRef(initial) { return { current: initial }; },
    useMemo(fn) { return fn(); },
    useEffect(fn) { effects.push(fn); },
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('components/perpdex-box.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source + '\nexports.Table=ExchangeTable; exports.Share=MarketShare; exports.Sources=PublicSources;', {
    exports, URL, AbortController, Date, Intl, fetch: async (...args) => { calls.push(args); throw Error('unexpected request'); },
    require(name) { if (name === 'react') return react; if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }; if (name.endsWith('.css')) return {}; return new Proxy({}, { get: () => () => null }); },
  });
  return { calls, render(which, props) { cursor = 0; effects.length = 0; return exports[which](props); }, runEffects() { effects.splice(0).forEach(effect => effect()); } };
}
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (typeof node.type === 'function') return elements(node.type(node.props), predicate);
  return [...(predicate(node) ? [node] : []), ...[node.props?.children].flat(Infinity).flatMap(child => elements(child, predicate))];
}
function textOf(node) { if (typeof node === 'string' || typeof node === 'number') return String(node); if (!node || typeof node !== 'object') return ''; if (typeof node.type === 'function') return textOf(node.type(node.props)); return [node.props?.children].flat(Infinity).map(textOf).join(''); }

test('dashboard totals exclude HIP-3 children and inactive views issue no requests', async () => {
  const f = fixture();
  const snapshot = await serviceModule.createPerpdexBoxService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  const h = uiHarness(snapshot);
  const tree = h.render('PerpdexBox', { active: false }); h.runEffects();
  assert.equal(h.calls.length, 0);
  const totals = elements(tree, node => node.type === 'div' && node.props.className === 'pdb-summary')[0];
  const oi = elements(totals, node => node.type === 'article')[0];
  const expected = snapshot.exchanges.filter(row => row.category !== 'hip3').reduce((sum, row) => sum + (row.oiUsd || 0), 0);
  const expectedText = `$${(expected / 1000000).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  assert.ok(textOf(oi).includes(expectedText));
  assert.ok(textOf(totals).includes(String(catalog.filter(row => row.category !== 'hip3').length)));
  assert.match(textOf(totals), new RegExp(`${catalog.filter(row => row.category === 'hip3').length}.*HIP-3`));
});

test('table sorting keeps missing metrics last and search filters rendered rows', async () => {
  const f = fixture();
  const snapshot = await serviceModule.createPerpdexBoxService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  const rows = snapshot.exchanges.filter(row => ['hyperliquid', 'tradexyz', 'jupiter', 'kalshi'].includes(row.id));
  const h = uiHarness();
  let tree = h.render('Table', { rows, totalOi: 200500 });
  const bodies = () => elements(tree, node => node.type === 'tbody')[0];
  assert.match(textOf(elements(bodies(), node => node.type === 'tr')[0]), /Hyperliquid/);
  const volume = elements(tree, node => node.type === 'button' && textOf(node).startsWith('24h 成交量'))[0];
  volume.props.onClick(); tree = h.render('Table', { rows, totalOi: 200500 });
  const ordered = elements(bodies(), node => node.type === 'tr');
  assert.match(textOf(ordered.at(-1)), /Jupiter/);
  const input = elements(tree, node => node.type === 'input' && node.props.type === 'search')[0];
  input.props.onChange({ target: { value: 'trade.xyz' } });
  tree = h.render('Table', { rows, totalOi: 200500 });
  assert.equal(elements(bodies(), node => node.type === 'tr').length, 1);
  assert.match(textOf(bodies()), /trade.xyz/);
  assert.ok(!textOf(tree).includes('数据状态'));
  assert.equal(elements(tree, node => node.type === 'a' && /pdb-(rules|source)-link/.test(node.props.className || '')).length, 0);
  const headerCells = elements(tree, node => node.type === 'thead').flatMap(head => elements(head, node => node.type === 'th'));
  const rowCells = elements(bodies(), node => node.type === 'tr').flatMap(row => elements(row, node => ['td', 'th'].includes(node.type)));
  assert.equal(rowCells.length, headerCells.length);
  elements(tree, node => node.type === 'button' && textOf(node) === '清除筛选')[0].props.onClick();
  tree = h.render('Table', { rows, totalOi: 200500 });
  assert.equal(elements(bodies(), node => node.type === 'tr').length, rows.length);
  elements(tree, node => node.type === 'select')[0].props.onChange({ target: { value: 'cex' } });
  tree = h.render('Table', { rows, totalOi: 200500 });
  assert.equal(elements(bodies(), node => node.type === 'tr').length, 1);
  assert.match(textOf(bodies()), /Kalshi/);
});

test('fresh source envelopes do not hide stale individual venue observations', async () => {
  const f = fixture();
  const snapshot = await serviceModule.createPerpdexBoxService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  assert.ok(snapshot.sources.every(source => source.status === 'live'));
  snapshot.exchanges.find(row => row.id === 'hello').status = 'stale';
  const h = uiHarness(snapshot);
  const tree = h.render('PerpdexBox', { active: false });
  assert.equal(elements(tree, node => node.props.className === 'pdb-live-pill is-stale').length, 1);
});

test('donut clicks, keyboard selection and metric changes report the corresponding platform', async () => {
  const f = fixture();
  const snapshot = await serviceModule.createPerpdexBoxService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  const rows = snapshot.exchanges.filter(row => row.category === 'dex').slice(0, 10).map((row, i) => ({ ...row, oiUsd: 10000 - i * 100, volume24hUsd: 100 + i, tvlUsd: i === 0 ? null : i * 20 }));
  const h = uiHarness();
  let tree = h.render('Share', { rows });
  const paths = elements(tree, node => node.type === 'path' && node.props.role === 'button');
  assert.equal(paths.length, 8);
  paths[0].props.onClick();
  tree = h.render('Share', { rows });
  let detail = elements(tree, node => node.props.className === 'pdb-share-detail')[0];
  assert.ok(textOf(detail).includes(rows[0].name));
  assert.ok(textOf(detail).includes('$10,000'));
  const second = elements(tree, node => node.type === 'path' && node.props.role === 'button')[1];
  let prevented = false;
  second.props.onKeyDown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.ok(prevented);
  tree = h.render('Share', { rows });
  detail = elements(tree, node => node.props.className === 'pdb-share-detail')[0];
  assert.ok(textOf(detail).includes(rows[1].name));
  const other = elements(tree, node => node.type === 'path' && node.props.role === 'button').at(-1);
  other.props.onClick(); tree = h.render('Share', { rows });
  const grouped = elements(tree, node => node.props.className === 'pdb-share-others')[0];
  assert.equal(elements(grouped, node => node.type === 'button').length, 3);
  elements(grouped, node => node.type === 'button')[1].props.onClick();
  tree = h.render('Share', { rows });
  detail = elements(tree, node => node.props.className === 'pdb-share-detail')[0];
  assert.ok(textOf(detail).includes(rows[8].name));
  const volumeSwitch = elements(tree, node => node.type === 'button' && textOf(node) === '24h 成交量')[0];
  volumeSwitch.props.onClick(); tree = h.render('Share', { rows });
  assert.match(textOf(elements(tree, node => node.props.className === 'pdb-share-detail')[0]), /点击环形图/);
  const volumePath = elements(tree, node => node.type === 'path' && node.props.role === 'button')[0];
  volumePath.props.onClick(); tree = h.render('Share', { rows });
  detail = elements(tree, node => node.props.className === 'pdb-share-detail')[0];
  assert.ok(textOf(detail).includes(rows[9].name));
  assert.ok(textOf(detail).includes('$109'));
  tree = h.render('Share', { rows: rows.slice(0, 2) });
  assert.ok(elements(tree, node => node.type === 'path' && node.props.role === 'button').every(node => node.props.strokeOpacity === 1));
  assert.match(textOf(elements(tree, node => node.props.className === 'pdb-share-detail')[0]), /点击环形图/);
  const single = uiHarness().render('Share', { rows: [rows[0]] });
  const fullCircle = elements(single, node => node.type === 'path' && node.props.role === 'button')[0];
  assert.equal((fullCircle.props.d.match(/A 88 88/g) || []).length, 2);
});

test('source marquee omits footer controls and notes without duplicating accessible links', async () => {
  const f = fixture();
  const { sources } = await serviceModule.createPerpdexBoxService({ fetch: f.fetcher, now: f.now }).getSnapshot();
  const h = uiHarness();
  let tree = h.render('Sources', { sources });
  assert.equal(tree.type, 'footer');
  const groups = elements(tree, node => node.props.className === 'pdb-source-group');
  assert.equal(groups.length, 2);
  assert.equal(groups[0].props['aria-hidden'], undefined);
  assert.equal(groups[1].props['aria-hidden'], true);
  assert.ok(elements(groups[1], node => node.type === 'a').every(node => node.props.tabIndex === -1));
  assert.equal(elements(tree, node => node.type === 'button' || node.type === 'p').length, 0);
});
