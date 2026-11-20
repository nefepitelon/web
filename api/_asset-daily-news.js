// Public, read-only evidence feeds. No search result is presented as an ingested X post.
const { createHash } = require('node:crypto');
const { load } = require('cheerio');
const { parseAicoinPreviewHtml } = require('../workers/aicoin_pulse_collector');

const SURF_URL = 'https://api.asksurf.ai/muninn/v1/ai-news/feed';
const PANEWS_URL = 'https://www.panewslab.com/rss.xml?lang=zh';
const AICOIN_URL = 'https://t.me/s/aicoin2021';
const GOOGLE_URL = 'https://news.google.com/rss/search';
const WINDOW_HOURS = 72;
const WINDOW_MS = WINDOW_HOURS * 3_600_000;
const MAX_BODY = 2_000_000;
const MAX_ITEMS = 12;
const X_URL = 'https://api.x.com/2/tweets/search/recent';
const X_TTL_MS = 10 * 60_000;
const X_RETRY_MS = 60_000;
const X_BUDGET_WINDOW_MS = 5 * 60_000;
const X_MAX_BATCHES = 12;
const readXKey = () => process.env.X_BEARER_TOKEN || '';
const officialReaders = new WeakMap();
const ALIASES = Object.freeze({
  BTC: ['比特币', 'Bitcoin'], ETH: ['以太坊', 'Ethereum'], SOL: ['Solana', '索拉纳'],
  HYPE: ['Hyperliquid'], XRP: ['瑞波币', 'Ripple'], BNB: ['币安币'], DOGE: ['狗狗币', 'Dogecoin'],
  ZEC: ['大零币', 'Zcash'], LINK: ['Chainlink'], AVAX: ['Avalanche'], ADA: ['Cardano', '艾达币'],
  LTC: ['莱特币', 'Litecoin'], BCH: ['比特币现金', 'Bitcoin Cash'], UNI: ['Uniswap'], DOT: ['Polkadot', '波卡'],
  NEAR: ['NEAR Protocol'], TAO: ['Bittensor'], TON: ['Toncoin', 'TON网络'], TRX: ['波场', 'Tron'],
  ENA: ['Ethena'], WLD: ['Worldcoin', 'World Network'], FET: ['Fetch.ai'],
  NVDA: ['英伟达', '輝達', 'NVIDIA'], TSLA: ['特斯拉', 'Tesla'], INTC: ['英特尔', 'Intel'],
  AMD: ['超微半导体', 'Advanced Micro Devices'], MSFT: ['微软', 'Microsoft'], AAPL: ['苹果公司', 'Apple Inc'],
  GOOGL: ['谷歌', 'Alphabet', 'Google'], AMZN: ['亚马逊', 'Amazon'], META: ['Meta Platforms', '脸书'],
  MU: ['美光', 'Micron'], SNDK: ['闪迪', 'SanDisk'], MSTR: ['微策略', 'MicroStrategy', 'Strategy Inc'],
  CRCL: ['Circle', 'Circle Internet'], COIN: ['Coinbase'], HOOD: ['Robinhood', '罗宾汉'],
  PLTR: ['Palantir', '帕兰提尔'], SKHX: ['SK海力士', 'SK hynix'], SKHY: ['SK海力士', 'SK hynix'],
  TSM: ['台积电', '台積電', 'TSMC'], BABA: ['阿里巴巴', 'Alibaba'], SMSN: ['三星电子', 'Samsung Electronics'],
  NFLX: ['Netflix', '奈飞'], ORCL: ['甲骨文', 'Oracle'], NBIS: ['Nebius'], CRWV: ['CoreWeave'],
  AVGO: ['博通', 'Broadcom'], UNITREE: ['宇树', 'Unitree'], SPCX: ['SpaceX', '太空探索技术'],
  GOLD: ['黄金', 'Gold price'], SILVER: ['白银', 'Silver price'], CL: ['WTI原油', 'WTI crude'],
  BRENTOIL: ['布伦特原油', 'Brent crude'], NATGAS: ['天然气', 'Natural gas'], COPPER: ['铜价', 'Copper price'],
  PLATINUM: ['铂金', 'Platinum'], PALLADIUM: ['钯金', 'Palladium'], DRAM: ['DRAM', '动态随机存取'],
  SP500: ['标普500', '标普 500', 'S&P 500'], XYZ100: ['纳斯达克100', '纳指100', 'Nasdaq 100'],
  JP225: ['日经225', '日经指数', 'Nikkei'], KR200: ['韩国综合指数', 'KOSPI'], NIFTY: ['Nifty 50'],
  EWY: ['韩国ETF', '韩国股市'], EWJ: ['日本ETF'], EWZ: ['巴西ETF'], EWT: ['台湾ETF'],
  SOXL: ['SOXL', '三倍做多半导体'], TLT: ['长期美国国债', '美国长债'], SMH: ['半导体ETF']
});
// Very short and ordinary English symbols require their proper asset name or a cashtag.
const AMBIGUOUS = new Set(['CL', 'HO', 'MU', 'BE', 'NOW', 'NET', 'ICE', 'LINK', 'NEAR', 'TON', 'HYPE', 'GOLD', 'SILVER', 'ARM', 'ANT', 'COST', 'SUI', 'UNI', 'META']);

function cleanText(value, limit = 160) {
  const text = load(`<div>${String(value ?? '').slice(0, MAX_BODY)}</div>`);
  text('script,style,iframe,object,noscript').remove();
  return text.root().text().replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function safeLink(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !url.hostname.includes('.')
      || /^(?:\d|localhost$)/i.test(url.hostname) || url.hostname.endsWith('.local')) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|ref$)/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return null; }
}

function assetTerms(asset) {
  const symbol = String(asset?.symbol || '').toUpperCase();
  if (!/^[A-Z0-9]{1,16}$/.test(symbol)) throw new Error('Invalid asset symbol');
  const terms = [...(ALIASES[symbol] || [])];
  const name = cleanText(asset?.name, 100).replace(/\s+(?:synthetic|index|ETF)?\s*perpetual$/i, '').trim();
  if (name.length >= 4 && !/^(?:Gold|Silver|Copper|Strategy|Apple|Ant|Arm|Circle|Now|Near)$/i.test(name)) terms.push(name);
  if (!AMBIGUOUS.has(symbol)) terms.push(symbol);
  return { symbol, terms: [...new Set(terms.filter(Boolean))] };
}

function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function relevantToAsset(value, asset) {
  const { symbol, terms } = assetTerms(asset);
  const text = String(value || '');
  if (new RegExp(`\\$${escapeRegex(symbol)}(?![a-z0-9])`, 'i').test(text)) return true;
  return terms.some(term => {
    if (/\p{Script=Han}/u.test(term)) return term === '比特币' ? /比特币(?!现金)/u.test(text) : text.includes(term);
    const suffix = term.toLowerCase() === 'bitcoin' ? '(?!\\s+cash)' : '';
    return new RegExp(`(?<![a-z0-9])${escapeRegex(term)}(?![a-z0-9])${suffix}`, 'i').test(text);
  });
}

function xPostUrl(value) {
  try {
    const url = new URL(value);
    if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname)) return false;
    return /^\/[a-zA-Z0-9_]{1,30}\/status\/\d+\/?$/.test(url.pathname);
  } catch { return false; }
}

function xDomain(value) {
  try { return ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(new URL(value).hostname); }
  catch { return false; }
}

function normalizeItem(item, asset, nowMs, source) {
  const title = cleanText(item.title, 120), summary = cleanText(item.summary, 160);
  const url = safeLink(item.url), time = Date.parse(item.publishedAt);
  if (!title || !url || !Number.isFinite(time) || time > nowMs || time < nowMs - WINDOW_MS
    || !relevantToAsset(`${title} ${summary}`, asset)) return null;
  const isX = xPostUrl(url);
  if (xDomain(url) && !isX) return null;
  // Only a Chinese-language item whose primary link is the original status can be X evidence.
  if (isX && !/\p{Script=Han}/u.test(`${title} ${summary}`)) return null;
  const id = `event-${createHash('sha256').update(url).digest('hex').slice(0, 20)}`;
  return { id, title, summary: summary === title ? '' : summary, url,
    publishedAt: new Date(time).toISOString(), sourceName: cleanText(item.sourceName || source.name, 80),
    kind: isX ? 'x' : 'news', sourceId: source.id,
    ...(source.id === 'x-official' ? { provenance: 'official-api', author: cleanText(item.author, 40), originalLanguage: 'zh' } : {}) };
}

async function resource(fetchImpl, url, signal, type, extraHeaders = {}) {
  const response = await fetchImpl(url, { method: 'GET', signal, redirect: 'error', cache: 'no-store',
    headers: { Accept: type === 'json' ? 'application/json' : 'application/rss+xml,application/xml,text/html',
      'User-Agent': 'welinkBTC-Public-Daily-Evidence/1.0', 'x-device-id': 'welinkbtc-public-daily-news', ...extraHeaders } });
  if (!response?.ok) throw Object.assign(new Error('Public evidence source unavailable'), { httpStatus: response?.status });
  if (Number(response.headers?.get?.('content-length') || 0) > MAX_BODY) throw new Error('Evidence response too large');
  let body = '';
  if (response.body?.getReader) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BODY) { await reader.cancel(); throw new Error('Evidence response too large'); }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
  } else body = await response.text();
  if (body.length > MAX_BODY) throw new Error('Evidence response too large');
  return type === 'json' ? JSON.parse(body) : body;
}

async function collectSurf(fetchImpl, signal, nowMs) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 2; page++) {
    const url = new URL(SURF_URL);
    url.searchParams.set('limit', '30'); url.searchParams.set('lang', 'zh');
    if (cursor !== null) url.searchParams.set('ts', String(cursor));
    const payload = await resource(fetchImpl, url.href, signal, 'json');
    if (payload?.success === false || !Array.isArray(payload?.data?.items)) throw new Error('Invalid public feed');
    const rows = payload.data.items.slice(0, 100);
    for (const row of rows) {
      const url = safeLink(row.primary_url) || (Array.isArray(row.sub_events) ? row.sub_events.map(entry => safeLink(entry?.url)).find(Boolean) : null);
      if (url) items.push({ title: row.title, summary: row.summary || row.content, url,
        publishedAt: row.published_at, sourceName: row.source_name || 'Surf Pulse' });
    }
    const oldest = Math.min(...rows.map(row => Date.parse(row?.published_at)).filter(Number.isFinite));
    if (!payload.data.has_more || !rows.length || !Number.isFinite(oldest) || oldest < nowMs - WINDOW_MS) break;
    const next = Math.floor(oldest / 1000);
    if (next === cursor) break;
    cursor = next;
  }
  return items;
}

function parseRss(body, name) {
  const $ = load(body, { xmlMode: true });
  if (!$('rss channel').length && !$('feed').length) throw new Error('Invalid RSS feed');
  return $('item,entry').slice(0, 150).map((_, element) => {
    const node = $(element);
    return { title: node.find('title').first().text(), summary: node.find('description,summary').first().text(),
      url: node.find('link').first().text() || node.find('link').first().attr('href'),
      publishedAt: node.find('pubDate,published,updated').first().text(), sourceName: node.find('source').first().text() || name };
  }).get();
}

function officialXQuery(asset) {
  const { symbol, terms } = assetTerms(asset);
  const names = [AMBIGUOUS.has(symbol) ? '$' + symbol : symbol, ...terms.slice(0, 3)]
    .map(value => `"${value.replace(/["\\]/g, ' ').trim()}"`);
  return `(${[...new Set(names)].join(' OR ')}) lang:zh -is:retweet`;
}

function parseOfficialX(payload, asset, clock) {
  if (!payload || (payload.data !== undefined && !Array.isArray(payload.data)) || !payload.meta) throw new Error('Invalid official X response');
  if (payload.errors?.length && !payload.data?.length) throw new Error('Official X evidence unavailable');
  const users = new Map((Array.isArray(payload.includes?.users) ? payload.includes.users : [])
    .filter(user => /^\d{1,25}$/.test(String(user?.id)) && /^[a-zA-Z0-9_]{1,15}$/.test(String(user?.username)))
    .map(user => [String(user.id), user.username]));
  const source = { id: 'x-official', name: 'X 官方 API · 中文原帖' };
  return (payload.data || []).slice(0, 10).map(post => {
    const username = users.get(String(post?.author_id));
    if (!username || !/^\d{1,25}$/.test(String(post?.id)) || post.lang !== 'zh' || !/\p{Script=Han}/u.test(String(post.text || ''))) return null;
    return normalizeItem({ title: cleanText(post.text, 100), summary: post.text,
      publishedAt: post.created_at, url: `https://x.com/${username}/status/${post.id}`,
      sourceName: `X · @${username}`, author: `@${username}` }, asset, clock, source);
  }).filter(Boolean);
}

function createOfficialXReader({ fetchImpl = fetch, getXKey = readXKey } = {}) {
  const cache = new Map(), pending = new Map(), attempts = [];
  let blockedUntil = 0;
  function view(value, clock) {
    const items = value.items.filter(item => Date.parse(item.publishedAt) <= clock && Date.parse(item.publishedAt) >= clock - WINDOW_MS);
    return { ...value, items, source: { ...value.source, count: items.length, asOf: items[0]?.publishedAt || null,
      status: value.source.status === 'available' || value.source.status === 'empty' ? items.length ? 'available' : 'empty' : value.source.status } };
  }
  return {
    async get(asset, { nowMs = Date.now(), timeoutMs = 6500 } = {}) {
      const key = String(asset.id || asset.symbol), token = getXKey();
      if (!token) return { configured: false, items: [], source: null };
      const prior = cache.get(key);
      if (prior && nowMs >= prior.at && nowMs - prior.at < (prior.value.source.status === 'unavailable' ? X_RETRY_MS : X_TTL_MS)) return view(prior.value, nowMs);
      if (pending.has(key)) return pending.get(key);
      const source = { id: 'x-official', name: 'X 官方 API · 中文原帖', url: 'https://docs.x.com/x-api/posts/search/introduction',
        asOf: null, fetchedAt: new Date(nowMs).toISOString(), status: 'unavailable', windowHours: WINDOW_HOURS, count: 0 };
      while (attempts.length && (attempts[0] < nowMs - X_BUDGET_WINDOW_MS || attempts[0] > nowMs)) attempts.shift();
      if (blockedUntil > nowMs || attempts.length >= X_MAX_BATCHES) return { configured: true, items: [], source: { ...source, reason: 'temporarily-limited' } };
      attempts.push(nowMs);
      const url = new URL(X_URL);
      url.searchParams.set('query', officialXQuery(asset));
      url.searchParams.set('start_time', new Date(nowMs - WINDOW_MS).toISOString());
      url.searchParams.set('max_results', '10'); url.searchParams.set('sort_order', 'recency');
      url.searchParams.set('tweet.fields', 'created_at,author_id,lang');
      url.searchParams.set('expansions', 'author_id'); url.searchParams.set('user.fields', 'username,name');
      const work = (async () => {
        const controller = new AbortController();
        let timer;
        try {
          const payload = await Promise.race([resource(fetchImpl, url.href, controller.signal, 'json', { Authorization: `Bearer ${token}` }),
            new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('X source timeout')); }, timeoutMs); })]);
          const items = parseOfficialX(payload, asset, nowMs).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
          return { configured: true, items, source: { ...source, asOf: items[0]?.publishedAt || null, status: items.length ? 'available' : 'empty', count: items.length,
            limitedSample: Boolean(payload.meta?.next_token) || Boolean(payload.errors?.length), maxResults: 10 } };
        } catch (failure) {
          if ([401, 402, 403, 429].includes(failure.httpStatus)) blockedUntil = nowMs + X_RETRY_MS;
          return { configured: true, items: [], source: { ...source, reason: controller.signal.aborted ? 'timeout' : 'access-unavailable' } };
        } finally { clearTimeout(timer); }
      })().then(value => {
        cache.delete(key); cache.set(key, { at: nowMs, value });
        while (cache.size > 96) cache.delete(cache.keys().next().value);
        return value;
      }).finally(() => pending.delete(key));
      pending.set(key, work);
      return work;
    }
  };
}

function officialReader(fetchImpl, getXKey) {
  let readers = officialReaders.get(fetchImpl);
  if (!readers) { readers = new WeakMap(); officialReaders.set(fetchImpl, readers); }
  let reader = readers.get(getXKey);
  if (!reader) { reader = createOfficialXReader({ fetchImpl, getXKey }); readers.set(getXKey, reader); }
  return reader;
}

async function collectSource(source, collect, timeoutMs, nowMs, asset) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Evidence source timed out')); }, timeoutMs); });
  try {
    const rows = await Promise.race([collect(controller.signal), timeout]);
    const items = rows.map(item => normalizeItem(item, asset, nowMs, source)).filter(Boolean);
    const latest = items.reduce((value, item) => item.publishedAt > (value || '') ? item.publishedAt : value, null);
    return { items, source: { ...source, asOf: latest, fetchedAt: new Date(nowMs).toISOString(),
      status: items.length ? 'available' : 'empty', windowHours: WINDOW_HOURS, count: items.length } };
  } catch {
    return { items: [], source: { ...source, asOf: null, fetchedAt: new Date(nowMs).toISOString(), status: 'unavailable', windowHours: WINDOW_HOURS, count: 0 } };
  } finally { clearTimeout(timer); }
}

async function getAssetNews(asset, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const nowMs = Number(typeof options.now === 'function' ? options.now() : options.now ?? Date.now());
  if (!Number.isFinite(nowMs)) throw new Error('Invalid evidence clock');
  const { symbol, terms } = assetTerms(asset);
  const timeoutMs = Math.min(6500, Math.max(20, Number(options.timeoutMs) || 6500));
  const google = new URL(GOOGLE_URL);
  google.searchParams.set('q', `(${[symbol, ...terms.slice(0, 2)].map(term => `"${term}"`).join(' OR ')}) when:3d`);
  google.searchParams.set('hl', 'zh-CN'); google.searchParams.set('gl', 'CN'); google.searchParams.set('ceid', 'CN:zh-Hans');
  const definitions = [
    { id: 'surf-public-news', name: 'Surf Pulse 中文公开资讯', url: 'https://asksurf.ai/pulse', read: signal => collectSurf(fetchImpl, signal, nowMs) },
    { id: 'panews-rss', name: 'PANews 中文 RSS', url: PANEWS_URL, read: async signal => parseRss(await resource(fetchImpl, PANEWS_URL, signal, 'text'), 'PANews') },
    { id: 'google-news-zh', name: 'Google News 中文公开 RSS', url: google.href, read: async signal => parseRss(await resource(fetchImpl, google.href, signal, 'text'), 'Google News') },
    { id: 'aicoin-public-news', name: 'AiCoin Telegram 公开快讯', url: 'https://t.me/aicoin2021', read: async signal => parseAicoinPreviewHtml(await resource(fetchImpl, AICOIN_URL, signal, 'text'), nowMs).items }
  ];
  const [results, official] = await Promise.all([
    Promise.all(definitions.map(({ read, ...source }) => collectSource(source, read, timeoutMs, nowMs, asset))),
    officialReader(fetchImpl, options.getXKey || readXKey).get(asset, { nowMs, timeoutMs })
  ]);
  if (official.source) results.push(official);
  const seenUrls = new Set(), seenTitles = new Set();
  const events = results.flatMap(result => result.items).sort((a, b) => Number(b.provenance === 'official-api') - Number(a.provenance === 'official-api')
    || b.publishedAt.localeCompare(a.publishedAt)).filter(item => {
    const fingerprint = item.title.normalize('NFKC').replace(/[\p{P}\p{S}\s]/gu, '').toLowerCase();
    if (seenUrls.has(item.url) || seenTitles.has(fingerprint)) return false;
    seenUrls.add(item.url); seenTitles.add(fingerprint); return true;
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const news = events.filter(item => item.kind === 'news').slice(0, MAX_ITEMS);
  const posts = events.filter(item => item.kind === 'x').slice(0, MAX_ITEMS);
  const originalCount = posts.filter(item => item.provenance === 'official-api').length;
  const checkedAt = new Date(nowMs).toISOString(), usable = results.some(result => result.source.status !== 'unavailable');
  return {
    news: { status: news.length ? 'available' : usable ? 'empty' : 'unavailable', asOf: news[0]?.publishedAt || null,
      checkedAt, windowHours: WINDOW_HOURS, items: news,
      note: '近72小时公开资讯检索，保留报道原时间与出处；仅覆盖公开源实际返回的内容，不代表全网完整抓取。' },
    xMonitor: { status: posts.length ? 'available' : official.source?.status === 'empty' ? 'empty' : 'unavailable', asOf: posts[0]?.publishedAt || null,
      checkedAt, windowHours: WINDOW_HOURS, items: posts,
      method: originalCount ? 'official-api' : posts.length ? 'public-secondary' : 'unavailable',
      searchUrl: `https://x.com/search?q=${encodeURIComponent(`${symbol} lang:zh`)}&f=live`,
      note: originalCount ? `已通过本站现有 X 官方接口取得 ${originalCount} 条近72小时中文原帖，保留作者与原始发布时间；单次最多10条、按需10分钟复查，不代表全量监控。${posts.length > originalCount ? '其余记录来自公开资讯二次收录，以各条来源为准。' : ''}`
        : posts.length ? '仅列出公开资讯源中带原始X状态链接的中文内容；为二次来源收录，未直接核验原帖正文，也不代表全量监控。'
          : official.source?.status === 'empty' ? '已查询本站现有 X 官方接口，近72小时检索样本暂无匹配中文原帖；不生成社交动态。'
            : '当前公开源或本站现有 X 官方接口未取得可核验的中文X帖子；下方仅为X中文实时搜索入口，未将搜索结果或普通新闻当作已监控帖子。' },
    timeline: events.slice(0, 18),
    sources: results.map(result => result.source)
  };
}

module.exports = { getAssetNews, relevantToAsset, normalizeItem, parseRss, safeLink, WINDOW_HOURS, createOfficialXReader, parseOfficialX, officialXQuery };
