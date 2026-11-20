const test = require('node:test');
const assert = require('node:assert/strict');
const { getAssetNews: fetchAssetNews, relevantToAsset, normalizeItem, safeLink, createOfficialXReader } = require('../api/_asset-daily-news');
const getAssetNews = (asset, options) => fetchAssetNews(asset, { getXKey: () => '', ...options });

const now = Date.parse('2026-11-16T10:30:00Z');
const btc = { id: 'BTC', symbol: 'BTC', name: 'Bitcoin', group: 'crypto' };
const source = { id: 'test-news', name: 'Public Test News' };
const iso = ageHours => new Date(now - ageHours * 3_600_000).toISOString();
const item = overrides => ({ title: 'BTC 链上活动变化', summary: '公开报道比特币网络活动。', url: 'https://example.com/article/1', publishedAt: iso(1), ...overrides });
const rss = rows => `<?xml version="1.0"?><rss><channel>${rows.map(row => `<item><title><![CDATA[${row.title}]]></title><link>${row.url}</link><pubDate>${row.publishedAt}</pubDate><description><![CDATA[${row.summary || ''}]]></description><source>${row.sourceName || '公开来源'}</source></item>`).join('')}</channel></rss>`;
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
function feeds({ surf = [], panews = [], google = [], telegram = '' } = {}) {
  const calls = [];
  const fetchImpl = async value => {
    const url = new URL(value); calls.push(url);
    if (url.hostname === 'api.asksurf.ai') return json({ success: true, data: { items: surf, has_more: false } });
    if (url.hostname === 'www.panewslab.com') return new Response(rss(panews));
    if (url.hostname === 'news.google.com') return new Response(rss(google));
    if (url.hostname === 't.me') return new Response(telegram);
    throw new Error('Unexpected upstream');
  };
  return { fetchImpl, calls };
}

test('evidence excludes future, expired, unrelated, malformed, unsafe and absent-source events', () => {
  for (const change of [{ publishedAt: iso(-0.01) }, { publishedAt: iso(72.01) }, { publishedAt: '' },
    { title: 'Ethereum 最新进展', summary: 'ETH 公告' }, { url: 'javascript:alert(1)' },
    { url: 'https://127.0.0.1/news' }, { url: '' }, { url: 'https://name:password@example.com/news' }]) {
    assert.equal(normalizeItem(item(change), btc, now, source), null);
  }
  assert.equal(normalizeItem(item({ publishedAt: iso(72) }), btc, now, source).publishedAt, iso(72));
  assert.equal(safeLink('https://example.com/news?utm_source=feed&x=1#anchor'), 'https://example.com/news?x=1');
});

test('relevance matches actual asset names and whole symbols without substring or ordinary-word pollution', () => {
  assert.equal(relevantToAsset('WBTC 流动性变化', btc), false);
  assert.equal(relevantToAsset('BCH Bitcoin Cash 比特币现金 生态更新', btc), false);
  assert.equal(relevantToAsset('Bitcoin network update', btc), true);
  assert.equal(relevantToAsset('比特币网络活动变化', btc), true);
  assert.equal(relevantToAsset('温度升高请 NOW 查看链接 link', { symbol: 'LINK', name: 'Chainlink' }), false);
  assert.equal(relevantToAsset('Chainlink 合作发布', { symbol: 'LINK', name: 'Chainlink' }), true);
  assert.equal(relevantToAsset('$MU 财报', { symbol: 'MU', name: 'Micron' }), true);
  assert.equal(relevantToAsset('美光财报发布', { symbol: 'MU', name: 'Micron' }), true);
  assert.equal(relevantToAsset('原油 WTICL 跌幅', { symbol: 'CL', name: 'WTI crude oil' }), false);
});

test('public Chinese sources preserve original dates and links, sanitize prose and deduplicate', async () => {
  const fixture = feeds({ surf: [{ id: 's1', title: '<b>BTC 链上活动变化</b>', summary: '<script>bad()</script><i>真实公开摘要</i>' + '长'.repeat(190),
    primary_url: 'https://example.com/news/1?utm_source=surf', published_at: iso(1), source_name: '公开新闻源', source_type: 'news' },
    { id: 'unsafe', title: 'BTC消息', summary: '无独立来源', primary_url: '', published_at: iso(1) }],
    panews: [item({ title: 'BTC 链上活动变化', url: 'https://example.com/news/1', publishedAt: iso(1) }),
      item({ title: '比特币第二条新闻', url: 'https://example.com/news/2', publishedAt: iso(2) })] });
  const result = await getAssetNews(btc, { ...fixture, now: () => now });
  assert.equal(result.news.status, 'available'); assert.equal(result.news.items.length, 2);
  assert.equal(result.news.asOf, iso(1)); assert.equal(result.news.windowHours, 72);
  assert.equal(result.news.items[0].url, 'https://example.com/news/1');
  assert.equal(result.news.items[0].sourceName, '公开新闻源');
  assert.equal(result.news.items[0].summary.includes('<'), false);
  assert.equal(result.news.items[0].summary.includes('bad'), false);
  assert.ok(result.news.items[0].summary.length <= 160);
  assert.equal(result.timeline.length, 2); assert.equal(result.sources.length, 4);
  assert.equal(result.xMonitor.status, 'unavailable'); assert.deepEqual(result.xMonitor.items, []);
  assert.match(result.xMonitor.note, /仅为X中文实时搜索入口/);
  for (const call of fixture.calls) assert.ok(['api.asksurf.ai', 'www.panewslab.com', 'news.google.com', 't.me'].includes(call.hostname));
});

test('only original Chinese X status URLs qualify; generic news and search/profile pages never become X posts', async () => {
  const fixture = feeds({ surf: [
    { title: 'BTC 中文原帖：观察链上活动', primary_url: 'https://x.com/public_user/status/123456789', published_at: iso(1), source_type: 'twitter' },
    { title: 'BTC English-only update', primary_url: 'https://x.com/public_user/status/123456790', published_at: iso(2), source_type: 'twitter' },
    { title: 'BTC 资讯转载', primary_url: 'https://example.com/article', published_at: iso(3), source_type: 'twitter' },
    { title: 'BTC 中文搜索结果', primary_url: 'https://x.com/search?q=BTC', published_at: iso(4), source_type: 'twitter' }
  ] });
  const result = await getAssetNews(btc, { ...fixture, now });
  assert.equal(result.xMonitor.status, 'available'); assert.equal(result.xMonitor.items.length, 1);
  assert.equal(result.xMonitor.items[0].url, 'https://x.com/public_user/status/123456789');
  assert.ok(result.news.items.every(row => row.kind === 'news'));
  assert.equal(result.news.items.length, 1);
  assert.equal(result.timeline.filter(row => row.kind === 'x').length, 1);
  assert.match(result.xMonitor.note, /二次来源收录/);
});

test('one unavailable source does not discard other sources; no fresh result remains explicitly empty', async () => {
  const fixture = feeds({ panews: [item({ publishedAt: iso(90) })] });
  const fetchImpl = (url, opts) => String(url).includes('api.asksurf.ai') ? Promise.reject(new Error('offline')) : fixture.fetchImpl(url, opts);
  const result = await getAssetNews(btc, { fetchImpl, now });
  assert.equal(result.news.status, 'empty'); assert.equal(result.news.asOf, null);
  assert.equal(result.news.items.length, 0); assert.equal(result.sources[0].status, 'unavailable');
  assert.ok(result.sources.slice(1).every(row => row.status === 'empty'));
});

test('unresponsive public sources obey a single bounded parallel deadline and remain unavailable', async () => {
  const started = Date.now(), signals = [];
  const result = await getAssetNews(btc, { now, timeoutMs: 25, fetchImpl: (_url, options) => {
    signals.push(options.signal); return new Promise(() => {});
  } });
  assert.ok(Date.now() - started < 500);
  assert.equal(result.news.status, 'unavailable'); assert.equal(result.sources.length, 4);
  assert.ok(signals.every(signal => signal.aborted));
  assert.ok(result.sources.every(row => row.status === 'unavailable'));
});

test('short stock symbols use precise Chinese/company aliases and Google source names remain attributed', async () => {
  const fixture = feeds({ google: [item({ title: '英伟达发布新产品 - 公开财经来源', summary: 'NVDA 公告',
    url: 'https://news.google.com/rss/articles/original-story', sourceName: '公开财经来源' }),
    item({ title: 'AMD发布新产品', summary: 'AMD 公告', url: 'https://example.com/amd' })] });
  const result = await getAssetNews({ symbol: 'NVDA', name: 'NVIDIA', group: 'stocks' }, { ...fixture, now });
  assert.equal(result.news.items.length, 1); assert.equal(result.news.items[0].sourceName, '公开财经来源');
  const query = fixture.calls.find(url => url.hostname === 'news.google.com').searchParams.get('q');
  assert.match(query, /英伟达/); assert.match(query, /when:3d/);
});

test('RSS streams are byte bounded without trusting Content-Length, and no arbitrary URL is fetched', async () => {
  const fixture = feeds();
  let cancelled = false;
  const fetchImpl = (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
    if (String(url).includes('panewslab')) return Promise.resolve(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(2_000_001)); }, cancel() { cancelled = true; }
    })));
    return fixture.fetchImpl(url, options);
  };
  const result = await getAssetNews(btc, { fetchImpl, now });
  assert.equal(result.sources.find(row => row.id === 'panews-rss').status, 'unavailable');
  assert.equal(cancelled, true);
  assert.equal(result.news.items.length, 0);
});

const xPayload = (rows = [{ id: '1234567890123456789', text: 'BTC 比特币网络活动更新，公开原帖。', created_at: iso(1), author_id: '42', lang: 'zh' }]) => ({
  data: rows, meta: { result_count: rows.length }, includes: { users: [{ id: '42', username: 'public_user' }] }
});

test('existing server-only X token enables bounded official Chinese recent search with original provenance', async () => {
  const fixture = feeds(); let officialCalls = 0;
  const fetchImpl = async (value, options) => {
    const url = new URL(value);
    if (url.hostname !== 'api.x.com') { assert.equal(options.headers.Authorization, undefined); return fixture.fetchImpl(value, options); }
    officialCalls++;
    assert.equal(url.pathname, '/2/tweets/search/recent');
    assert.match(url.searchParams.get('query'), /lang:zh -is:retweet/);
    assert.equal(url.searchParams.get('max_results'), '10');
    assert.equal(url.searchParams.get('start_time'), iso(72));
    assert.equal(url.searchParams.get('tweet.fields'), 'created_at,author_id,lang');
    assert.equal(options.headers.Authorization, 'Bearer test-server-only'); assert.equal(options.redirect, 'error');
    return json(xPayload());
  };
  const report = await getAssetNews(btc, { fetchImpl, now, getXKey: () => 'test-server-only' });
  assert.equal(officialCalls, 1); assert.equal(report.xMonitor.status, 'available');
  assert.equal(report.xMonitor.method, 'official-api'); assert.equal(report.xMonitor.items.length, 1);
  const post = report.xMonitor.items[0];
  assert.equal(post.url, 'https://x.com/public_user/status/1234567890123456789');
  assert.equal(post.author, '@public_user'); assert.equal(post.provenance, 'official-api');
  assert.equal(post.originalLanguage, 'zh'); assert.equal(post.publishedAt, iso(1));
  assert.ok(!JSON.stringify(report).includes('test-server-only'));
  assert.equal(report.sources.find(row => row.id === 'x-official').count, 1);
});

test('official X requires valid author, language, original ID, publication window and asset relevance', async () => {
  const base = xPayload().data[0];
  const payload = xPayload([base,
    { ...base, id: '2', lang: 'en' }, { ...base, id: '3', text: 'BTC Bitcoin network' },
    { ...base, id: '4', text: 'ETH 以太坊升级' }, { ...base, id: '5', created_at: iso(80) },
    { ...base, id: '6', created_at: iso(-1) }, { ...base, id: 'javascript:alert(1)' },
    { ...base, id: '7', author_id: 'unknown' }]);
  const reader = createOfficialXReader({ getXKey: () => 'test', fetchImpl: async () => json(payload) });
  const result = await reader.get(btc, { nowMs: now });
  assert.equal(result.items.length, 1); assert.equal(result.items[0].url, 'https://x.com/public_user/status/1234567890123456789');
});

test('official X has no-key zero calls, in-flight deduplication, ten-minute caching and explicit denial', async () => {
  let calls = 0;
  const empty = createOfficialXReader({ getXKey: () => '', fetchImpl: async () => { calls++; } });
  assert.equal((await empty.get(btc, { nowMs: now })).configured, false); assert.equal(calls, 0);
  const reader = createOfficialXReader({ getXKey: () => 'test', fetchImpl: async () => { calls++; return json(xPayload()); } });
  const results = await Promise.all([reader.get(btc, { nowMs: now }), reader.get(btc, { nowMs: now })]);
  assert.equal(calls, 1); assert.deepEqual(results[0], results[1]);
  const cached = await reader.get(btc, { nowMs: now + 9 * 60_000 });
  assert.equal(calls, 1); assert.equal(cached.source.fetchedAt, new Date(now).toISOString());
  await reader.get(btc, { nowMs: now + 10 * 60_000 }); assert.equal(calls, 2);
  let deniedCalls = 0;
  const denied = createOfficialXReader({ getXKey: () => 'secret-never-return', fetchImpl: async () => { deniedCalls++; return new Response('denied', { status: 403 }); } });
  const failure = await denied.get(btc, { nowMs: now });
  assert.equal(failure.source.status, 'unavailable'); assert.equal(failure.items.length, 0);
  assert.ok(!JSON.stringify(failure).includes('secret-never-return'));
  await denied.get({ symbol: 'SOL' }, { nowMs: now + 1000 }); assert.equal(deniedCalls, 1);
});

test('official X bounds read spend by batch budget and reports genuine successful zero-result searches as empty', async () => {
  let calls = 0;
  const reader = createOfficialXReader({ getXKey: () => 'test', fetchImpl: async () => { calls++; return json({ meta: { result_count: 0 } }); } });
  const rows = await Promise.all(Array.from({ length: 13 }, (_, index) => reader.get({ symbol: 'TOK' + index }, { nowMs: now })));
  assert.equal(calls, 12); assert.equal(rows[0].source.status, 'empty');
  assert.equal(rows[12].source.status, 'unavailable'); assert.equal(rows[12].source.reason, 'temporarily-limited');
});

test('official original takes precedence over a later secondary ingest date for the same X URL', async () => {
  const fixture = feeds({ surf: [{ title: 'BTC 中文转载', primary_url: 'https://x.com/public_user/status/1234567890123456789',
    published_at: iso(0.5), source_type: 'twitter' }] });
  const fetchImpl = (url, options) => new URL(url).hostname === 'api.x.com' ? Promise.resolve(json(xPayload())) : fixture.fetchImpl(url, options);
  const result = await getAssetNews(btc, { fetchImpl, now, getXKey: () => 'test' });
  assert.equal(result.xMonitor.items.length, 1); assert.equal(result.xMonitor.items[0].provenance, 'official-api');
  assert.equal(result.xMonitor.items[0].publishedAt, iso(1));
});

test('official JSON error payload is never misrepresented as a successful empty search', async () => {
  const reader = createOfficialXReader({ getXKey: () => 'test', fetchImpl: async () => json({ meta: { result_count: 0 }, errors: [{ detail: 'denied' }] }) });
  const result = await reader.get(btc, { nowMs: now });
  assert.equal(result.source.status, 'unavailable'); assert.deepEqual(result.items, []);
});
