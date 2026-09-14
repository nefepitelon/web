import type { Bar, Candidate, Market, Quote, Stock, Topic } from "./types";
import { computeBox, computeControl, computeFlow, computeVolume, matchThemes, scoreConditions } from "./engine";

type ObjectValue = Record<string, unknown>;
type Snapshot = { quote: Quote; amount: number };
type MarketProgress = (message: string) => Promise<void>;
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const stockSnapshots = new Map<string, Snapshot>();
const universeProgressSubscribers = new Set<MarketProgress>();
const jsonObject = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const rowsOf = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const numeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null;
};
const text = (value: unknown) => typeof value === "string" ? value : "";
const now = () => new Date().toISOString();
const DAY = 86_400_000;
const EM = "https://push2.eastmoney.com";
const SINA = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/";
const FUTURES = ["https://fapi.binance.com", "https://fapi1.binance.com", "https://fapi2.binance.com"];

async function memo<T>(key: string, ttl: number, loader: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing && existing.until > Date.now()) return existing.value as T;
  const running = pending.get(key); if (running) return running as Promise<T>;
  const task = loader().then(value => {
    if (cache.size > 24_000) { for (const [k, v] of cache) if (v.until < Date.now()) cache.delete(k); }
    cache.set(key, { value, until: Date.now() + ttl }); return value;
  }).finally(() => pending.delete(key));
  pending.set(key, task); return task;
}

async function request(url: string, encoding?: string): Promise<unknown> {
  // URLs are constructed exclusively from fixed provider origins and validated symbols.
  const host = new URL(url).hostname;
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5_000), headers: {
      "User-Agent": "Mozilla/5.0", Accept: "application/json,text/plain,*/*", Referer: "https://finance.sina.com.cn/",
    } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = encoding ? new TextDecoder(encoding).decode(await response.arrayBuffer()) : await response.text();
    if (body.length > 10_000_000) throw new Error("响应过大");
    return encoding ? body : JSON.parse(body);
  } catch (error) {
    // Only expose the fixed provider host and a controlled reason, never response bodies or URLs.
    const message = error instanceof Error ? error.message : "";
    const reason = /^(HTTP \d{3}|响应过大)$/.test(message) ? message : error instanceof SyntaxError ? "非 JSON 响应" : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "请求超时" : "连接失败";
    throw new Error(`${host} ${reason}`);
  }
}

async function fallback<T>(loaders: (() => Promise<T>)[], label: string): Promise<T> {
  const failures: string[] = [];
  for (const load of loaders) { try { return await load(); } catch (error) { failures.push(error instanceof Error ? error.message : "数据校验失败"); } }
  throw new Error(`${label}暂不可用，所有公开数据源请求失败，请稍后重试（${[...new Set(failures)].join("；").slice(0, 360)}）`);
}

function validate(symbol: string, market: Market) {
  if (market !== "ashare" && market !== "crypto") throw new Error("不支持的市场");
  if (!(market === "ashare" ? /^(?:[036]\d{5})$/ : /^[A-Z0-9]{2,24}USDT$/).test(symbol)) throw new Error("无效市场代码");
}
const exchangeSymbol = (symbol: string) => `${symbol.startsWith("6") ? "sh" : "sz"}${symbol}`;
const securityId = (symbol: string) => `${symbol.startsWith("6") ? "1" : "0"}.${symbol}`;

function saveSnapshot(quote: Quote, amount = 0) {
  stockSnapshots.set(quote.symbol, { quote, amount });
  cache.set(`quote:ashare:${quote.symbol}`, { value: quote, until: Date.now() + 2_500 });
}

function parseTencentQuote(raw: string, symbol: string, requireTimestamp = false): Quote {
  const fields = raw.split("~");
  const price = numeric(fields[3]); const changePct = numeric(fields[32]);
  if (!price || price <= 0 || changePct === null || fields[2] !== symbol || fields.length < 40) throw new Error("腾讯报价缺失");
  const timestamp = fields[30];
  const dated = /^\d{14}$/.test(timestamp || "") ? new Date(`${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}T${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}+08:00`) : null;
  if (requireTimestamp && (!dated || !Number.isFinite(dated.getTime()))) throw new Error("腾讯行情时间无效");
  return { symbol, name: fields[1] || symbol, price, changePct, turnoverPct: numeric(fields[38]) ?? undefined, volumeRatio: numeric(fields[49]) ?? undefined, source: "腾讯财经", asOf: dated && Number.isFinite(dated.getTime()) ? dated.toISOString() : now() };
}
async function tencentQuote(symbol: string): Promise<Quote> {
  return parseTencentQuote(String(await request(`https://qt.gtimg.cn/q=${exchangeSymbol(symbol)}`, "gb18030")), symbol);
}
async function eastmoneyQuote(symbol: string): Promise<Quote> {
  const data = jsonObject(jsonObject(await request(`${EM}/api/qt/stock/get?secid=${securityId(symbol)}&fields=f43,f57,f58,f50,f168,f170`)).data);
  const price = numeric(data.f43); const change = numeric(data.f170);
  if (!price || price <= 0 || change === null) throw new Error("东财报价缺失");
  return { symbol, name: text(data.f58) || symbol, price: price / 100, changePct: change / 100, turnoverPct: numeric(data.f168) === null ? undefined : Number(data.f168) / 100, volumeRatio: numeric(data.f50) === null ? undefined : Number(data.f50) / 100, source: "东方财富", asOf: now() };
}

export async function fetchQuote(symbol: string, market: Market): Promise<Quote> {
  validate(symbol, market);
  return memo(`quote:${market}:${symbol}`, 2_500, async () => {
    if (market === "ashare") return fallback([() => tencentQuote(symbol), () => eastmoneyQuote(symbol)], "A 股报价");
    return fallback(FUTURES.map(origin => async () => cryptoQuote(await request(`${origin}/fapi/v1/ticker/24hr?symbol=${symbol}`))), "Binance USDT 永续报价");
  });
}

function validBars(values: Bar[]): Bar[] {
  const dedup = new Map<string, Bar>();
  for (const bar of values) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.date) || ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) || bar.low <= 0 || bar.volume < 0 || bar.high < Math.max(bar.open, bar.close, bar.low) || bar.low > Math.min(bar.open, bar.close)) continue;
    dedup.set(bar.date, bar);
  }
  const bars = [...dedup.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length < 40) throw new Error("可用日 K 少于 40 根，不能识别箱体");
  return bars;
}

export async function fetchBars(symbol: string, market: Market): Promise<Bar[]> {
  validate(symbol, market);
  return memo(`bars:${market}:${symbol}`, 60_000, async () => {
    if (market === "crypto") return fallback(FUTURES.map(origin => async () => {
      const result = rowsOf(await request(`${origin}/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=200`));
      return validBars(result.map(row => { const b = rowsOf(row); return { date: new Date(Number(b[0])).toISOString().slice(0, 10), open: Number(b[1]), high: Number(b[2]), low: Number(b[3]), close: Number(b[4]), volume: Number(b[5]) }; }));
    }), "Binance USDT 永续日 K");
    return fallback([
      async () => {
        const sym = exchangeSymbol(symbol);
        const raw = jsonObject(jsonObject(jsonObject(await request(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},day,,,160,qfq`)).data)[sym]);
        const list = rowsOf(raw.qfqday ?? raw.day);
        return validBars(list.map(row => { const b = rowsOf(row); return { date: text(b[0]).slice(0, 10), open: Number(b[1]), close: Number(b[2]), high: Number(b[3]), low: Number(b[4]), volume: Number(b[5]) }; }));
      },
      async () => {
        const raw = jsonObject(jsonObject(await request(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${securityId(symbol)}&klt=101&fqt=1&lmt=160&end=20500101&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56`)).data);
        return validBars(rowsOf(raw.klines).map(row => { const b = String(row).split(","); return { date: b[0], open: Number(b[1]), close: Number(b[2]), high: Number(b[3]), low: Number(b[4]), volume: Number(b[5]) }; }));
      },
      async () => {
        const raw = rowsOf(await request(`https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${exchangeSymbol(symbol)}&scale=240&ma=no&datalen=160`));
        return validBars(raw.map(row => { const b = jsonObject(row); return { date: text(b.day).slice(0, 10), open: Number(b.open), close: Number(b.close), high: Number(b.high), low: Number(b.low), volume: Number(b.volume) / 100 }; }));
      },
    ], "A 股日 K");
  });
}

async function batches<T>(indexes: number[], size: number, load: (index: number) => Promise<T>): Promise<T[]> {
  const result: T[] = [];
  for (let i = 0; i < indexes.length; i += size) result.push(...await Promise.all(indexes.slice(i, i + size).map(load)));
  return result;
}

async function cninfoTencentUniverse(onProgress?: MarketProgress): Promise<Stock[]> {
  await onProgress?.("正在读取巨潮资讯沪深 A 股清单，并校验腾讯实时行情…");
  const catalog = await fallback([0, 1].map(() => async () => {
    const raw = jsonObject(await request("https://www.cninfo.com.cn/new/data/szse_stock.json"));
    const stocks = new Map<string, Stock>();
    for (const entry of rowsOf(raw.stockList)) {
      const row = jsonObject(entry), symbol = text(row.code), name = text(row.zwjc);
      if (row.category === "A股" && /^[036]\d{5}$/.test(symbol) && name && !/退市|退$/.test(name)) stocks.set(symbol, { symbol, name });
    }
    const values = [...stocks.values()];
    // This CNINFO file contains BOTH exchanges despite its historical "szse" filename.
    if (values.length < 3_000 || values.length > 8_000 || values.filter(stock => stock.symbol.startsWith("6")).length < 1_000 || values.filter(stock => !stock.symbol.startsWith("6")).length < 1_000) throw new Error("巨潮沪深股票清单不完整");
    return values;
  }), "巨潮沪深股票清单");
  const snapshots = new Map<string, Snapshot>();
  // A batch has at most 200 symbols (~1.8 KB URL), four requests in flight, two attempts.
  // Do not serially fetch thousands of single-stock quotes during the prepare step.
  for (let offset = 0; offset < catalog.length; offset += 800) {
    const pages = await Promise.all([0, 200, 400, 600].map(async delta => {
      const stocks = catalog.slice(offset + delta, offset + delta + 200);
      if (!stocks.length) return [];
      const requested = new Set(stocks.map(stock => stock.symbol));
      const endpoint = `https://qt.gtimg.cn/q=${stocks.map(stock => exchangeSymbol(stock.symbol)).join(",")}`;
      return fallback([0, 1].map(() => async () => {
        const raw = String(await request(endpoint, "gb18030"));
        const found = new Map<string, Snapshot>();
        for (const line of raw.split(";")) {
          // Parse the public assignment response as data; never eval remote JavaScript.
          const match = /^\s*v_(?:sh|sz)(\d{6})="([^"]*)"\s*$/.exec(line);
          if (!match || !requested.has(match[1])) continue;
          try {
            const fields = match[2].split("~");
            if (!/^\d{14}$/.test(fields[30] ?? "")) continue;
            const quote = parseTencentQuote(match[2], match[1], true);
            const age = Date.now() - Date.parse(quote.asOf);
            if (age < -DAY || age > 31 * DAY || /退市|退$/.test(quote.name)) continue;
            found.set(quote.symbol, { quote, amount: (numeric(fields[37]) ?? 0) * 10_000 });
          } catch { /* Delisted/pre-listing or malformed records are not scan candidates. */ }
        }
        if (found.size < stocks.length * .9) throw new Error(`腾讯批量行情不完整（${found.size}/${stocks.length}）`);
        return [...found.values()];
      }), "腾讯沪深行情分页");
    }));
    for (const snapshot of pages.flat()) snapshots.set(snapshot.quote.symbol, snapshot);
    await onProgress?.(`已校验沪深行情 ${Math.min(offset + 800, catalog.length)}/${catalog.length} · 腾讯财经`);
  }
  // Require nearly complete coverage; do not silently call a tiny fallback subset "全市场".
  if (snapshots.size < catalog.length * .95) throw new Error(`腾讯沪深行情覆盖不足（${snapshots.size}/${catalog.length}）`);
  for (const snapshot of snapshots.values()) saveSnapshot(snapshot.quote, snapshot.amount);
  return [...snapshots.values()].map(({ quote }) => ({ symbol: quote.symbol, name: quote.name }));
}

async function eastmoneyUniverse(onProgress?: MarketProgress): Promise<Stock[]> {
  await onProgress?.("巨潮 / 腾讯清单暂不可用，正在尝试东方财富全市场备用源…");
  const page = async (number: number) => {
    const endpoint = `${EM}/api/qt/clist/get?pn=${number}&pz=100&po=0&np=1&fltt=2&invt=2&fid=f12&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f2,f3,f8,f10,f12,f14,f6`;
    return fallback([async () => jsonObject(jsonObject(await request(endpoint)).data), async () => jsonObject(jsonObject(await request(endpoint)).data)], "A 股清单分页");
  };
  const first = await page(1); const total = numeric(first.total) ?? 0;
  if (total < 3_000 || total > 12_000 || !rowsOf(first.diff).length) throw new Error("不完整股票清单");
  const pages = await batches(Array.from({ length: Math.ceil(total / 100) - 1 }, (_, i) => i + 2), 6, page);
  const raw = [first, ...pages].flatMap(p => rowsOf(p.diff));
  const stocks = new Map<string, Stock>();
  for (const item of raw) {
    const r = jsonObject(item); const symbol = text(r.f12); const name = text(r.f14);
    if (!/^[036]\d{5}$/.test(symbol) || !name) continue;
    stocks.set(symbol, { symbol, name });
    const price = numeric(r.f2); const changePct = numeric(r.f3);
    if (price && price > 0 && changePct !== null) saveSnapshot({ symbol, name, price, changePct, turnoverPct: numeric(r.f8) ?? undefined, volumeRatio: numeric(r.f10) ?? undefined, source: "东方财富全市场快照", asOf: now() }, numeric(r.f6) ?? 0);
  }
  if (stocks.size < total * .98) throw new Error("股票清单分页缺失");
  return [...stocks.values()];
}

async function sinaUniverse(onProgress?: MarketProgress): Promise<Stock[]> {
  await onProgress?.("正在尝试新浪财经全市场备用源…");
  const page = async (pageIndex: number) => fallback([0, 1].map(() => async () => {
    const result = await request(`${SINA}Market_Center.getHQNodeData?page=${pageIndex}&num=100&sort=symbol&asc=1&node=hs_a&symbol=`);
    if (!Array.isArray(result)) throw new Error("新浪股票清单分页无效");
    return result;
  }), "新浪股票清单分页");
  const stocks = new Map<string, Stock>();
  let exhausted = false;
  for (let start = 1; start <= 100 && !exhausted; start += 6) {
    const pages = await batches(Array.from({ length: 6 }, (_, i) => start + i), 6, page);
    for (const entries of pages) {
      if (entries.length < 100) exhausted = true;
      for (const entry of entries) {
        const r = jsonObject(entry); const full = text(r.symbol); const symbol = text(r.code); const name = text(r.name);
        if (!/^(sh6|sz[03])/.test(full) || !/^[036]\d{5}$/.test(symbol) || !name) continue;
        stocks.set(symbol, { symbol, name });
        const price = numeric(r.trade); const changePct = numeric(r.changepercent);
        if (price && price > 0 && changePct !== null) saveSnapshot({ symbol, name, price, changePct, turnoverPct: numeric(r.turnoverratio) ?? undefined, source: "新浪财经全市场快照", asOf: now() }, numeric(r.amount) ?? 0);
      }
    }
    await onProgress?.(`已读取新浪沪深清单 ${stocks.size} 项，正在核对完整分页…`);
  }
  if (!exhausted || stocks.size < 3_000) throw new Error("新浪完整股票清单不可用");
  return [...stocks.values()];
}

async function broadcastUniverseProgress(message: string) {
  // Market loads are shared across users; one cancelled job must never reject the shared load.
  await Promise.all([...universeProgressSubscribers].map(async subscriber => {
    try { await subscriber(message); }
    catch { universeProgressSubscribers.delete(subscriber); }
  }));
}

export async function fetchUniverse(onProgress?: MarketProgress): Promise<Stock[]> {
  if (onProgress) universeProgressSubscribers.add(onProgress);
  try {
    return await memo("universe:ashare", 15 * 60_000, () => fallback([() => cninfoTencentUniverse(broadcastUniverseProgress), () => eastmoneyUniverse(broadcastUniverseProgress), () => sinaUniverse(broadcastUniverseProgress)], "沪深全市场清单"));
  } finally {
    if (onProgress) universeProgressSubscribers.delete(onProgress);
  }
}

function cryptoQuote(raw: unknown): Quote {
  const r = jsonObject(raw); const symbol = text(r.symbol); const price = numeric(r.lastPrice); const changePct = numeric(r.priceChangePercent);
  if (!/^[A-Z0-9]{2,24}USDT$/.test(symbol) || !price || price <= 0 || changePct === null) throw new Error("永续报价不完整");
  const timestamp = numeric(r.closeTime);
  return { symbol, name: symbol.replace(/USDT$/, " / USDT"), price, changePct, source: "Binance USDT 永续", asOf: timestamp && Number.isFinite(new Date(timestamp).getTime()) ? new Date(timestamp).toISOString() : now() };
}

export async function fetchCryptoUniverse(): Promise<Stock[]> {
  return memo("universe:crypto", 30_000, async () => {
    const [tickers, symbols] = await Promise.all([
      fallback(FUTURES.map(origin => async () => { const result = rowsOf(await request(`${origin}/fapi/v1/ticker/24hr`)); if (!result.length) throw new Error("永续报价为空"); return result; }), "Binance 永续市场"),
      memo("crypto:contracts", 3_600_000, () => fallback(FUTURES.map(origin => async () => {
        const entries = rowsOf(jsonObject(await request(`${origin}/fapi/v1/exchangeInfo`)).symbols);
        const list = entries.map(jsonObject).filter(r => r.status === "TRADING" && r.contractType === "PERPETUAL" && r.quoteAsset === "USDT").map(r => text(r.symbol));
        if (!list.length) throw new Error("永续合约清单为空"); return list;
      }), "Binance 永续合约清单")),
    ]);
    const supported = new Set(symbols); const quotes: Quote[] = [];
    for (const ticker of tickers) {
      if (!supported.has(text(jsonObject(ticker).symbol))) continue;
      try { quotes.push(cryptoQuote(ticker)); } catch { /* Skip malformed market entries. */ }
    }
    if (!quotes.length) throw new Error("Binance 没有可验证的 USDT 永续行情");
    quotes.sort((a, b) => b.changePct - a.changePct);
    for (const quote of quotes) cache.set(`quote:crypto:${quote.symbol}`, { value: quote, until: Date.now() + 30_000 });
    return quotes.map(({ symbol, name }) => ({ symbol, name }));
  });
}

const irrelevantTopic = /昨日|涨停|连板|炸板|破板|一字|新高|热股|强势|活跃|微盘|低价|高价|百元|重仓|预盈|预亏|ST|摘帽|转债|富时|MSCI|标普|罗素|沪股通|深股通|融资融券|高送转|破净|B股|AB股|中证|沪深300|深成|上证|基金|社保|险资|QFII|信托/;
export async function fetchTopics(): Promise<Topic[]> {
  return memo("topics", 5 * 60_000, async () => {
    const load = async () => jsonObject(jsonObject(await request(`${EM}/api/qt/clist/get?pn=1&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3+f:!50&fields=f3,f14,f104,f105`)).data);
    const data = await fallback([load, load], "热门概念板块");
    const topics = rowsOf(data.diff).map(jsonObject).filter(r => text(r.f14) && !irrelevantTopic.test(text(r.f14)) && (numeric(r.f104) ?? 0) + (numeric(r.f105) ?? 0) >= 5 && numeric(r.f3) !== null)
      .map(r => ({ name: text(r.f14), changePct: Number(r.f3), source: "东方财富概念板块" })).sort((a, b) => b.changePct - a.changePct).slice(0, 10);
    if (!topics.length) throw new Error("热门板块暂不可用");
    return topics;
  });
}

export async function selectQuickUniverse(universe: Stock[], pool: Stock[], onProgress?: MarketProgress): Promise<Stock[]> {
  if (!stockSnapshots.size) await fetchUniverse(onProgress);
  const activity = universe.map(stock => ({ stock, snapshot: stockSnapshots.get(stock.symbol) })).filter(item => item.snapshot !== undefined);
  if (activity.length < universe.length * .9) throw new Error(`快速扫描行情快照覆盖不足（${activity.length}/${universe.length}），请稍后重试`);
  await onProgress?.(`正在从 ${activity.length} 个真实沪深行情快照中筛选快速扫描标的…`);
  const hasVolumeRatios = activity.filter(item => (item.snapshot!.quote.volumeRatio ?? 0) > .05).length > 500;
  const selected = activity.filter(({ snapshot }) => {
    const q = snapshot!.quote;
    return q.changePct > 0 && q.changePct < 9.8 && q.price > 2 && (hasVolumeRatios ? (q.volumeRatio ?? 0) >= 1.2 : (q.turnoverPct ?? 0) >= 1.5 && (q.turnoverPct ?? 0) <= 30);
  }).sort((a, b) => {
    const aq = a.snapshot!.quote, bq = b.snapshot!.quote;
    return hasVolumeRatios ? (bq.volumeRatio ?? 0) - (aq.volumeRatio ?? 0) || bq.changePct - aq.changePct : (bq.changePct + Math.min(bq.turnoverPct ?? 0, 20) * .12) - (aq.changePct + Math.min(aq.turnoverPct ?? 0, 20) * .12) || b.snapshot!.amount - a.snapshot!.amount;
  }).slice(0, 200).map(item => item.stock);
  for (const stock of pool) if (!selected.some(item => item.symbol === stock.symbol)) selected.push(stock);
  return selected;
}

async function conceptsFor(symbol: string): Promise<string[]> {
  return memo(`concepts:${symbol}`, DAY, async () => {
    const prefix = symbol.startsWith("6") ? "SH" : "SZ";
    const raw = jsonObject(await request(`https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/PageAjax?code=${prefix}${symbol}`));
    if (!Array.isArray(raw.ssbk)) throw new Error("个股概念不可用");
    return [...new Set(rowsOf(raw.ssbk).map(row => text(jsonObject(row).BOARD_NAME)).filter(Boolean))];
  });
}
async function holderFor(symbol: string): Promise<{ ratio: number; date: string }> {
  return memo(`holder:${symbol}`, DAY, async () => {
    const filter = encodeURIComponent(`(SECURITY_CODE="${symbol}")`);
    const raw = jsonObject(jsonObject(await request(`https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_HOLDERNUM_DET&columns=SECURITY_CODE,END_DATE,HOLDER_NUM_RATIO&filter=${filter}&pageNumber=1&pageSize=1&sortTypes=-1&sortColumns=END_DATE`)).result);
    const latest = jsonObject(rowsOf(raw.data)[0]); const ratio = numeric(latest.HOLDER_NUM_RATIO); const date = text(latest.END_DATE).slice(0, 10);
    if (ratio === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("股东户数未披露");
    return { ratio, date };
  });
}

function validateFlow(raw: { date: string; net: number }[]) {
  const values = raw.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.net)).sort((a, b) => a.date.localeCompare(b.date));
  const latest = values.at(-1); const age = latest ? Date.now() - Date.parse(`${latest.date}T00:00:00+08:00`) : Infinity;
  if (!latest || age < -DAY || age > 20 * DAY) throw new Error("资金流缺失或已过期");
  return values.slice(-5);
}
async function flowsFor(symbol: string) {
  return memo(`flow:${symbol}`, 5 * 60_000, () => fallback([
    async () => {
      const raw = jsonObject(jsonObject(await request(`https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt=11&klt=101&secid=${securityId(symbol)}&fields1=f1,f2,f3,f7&fields2=f51,f52&ut=b2884a393a59ad64002292a3e90d46a5`)).data);
      return validateFlow(rowsOf(raw.klines).map(row => { const fields = String(row).split(","); return { date: fields[0], net: Number(fields[1]) }; }));
    },
    async () => {
      const raw = rowsOf(await request(`${SINA}MoneyFlow.ssl_qsfx_zjlrqs?daima=${exchangeSymbol(symbol)}`));
      return validateFlow(raw.map(row => { const r = jsonObject(row); const a = numeric(r.r0_net), b = numeric(r.r1_net); return { date: text(r.opendate).slice(0, 10), net: a === null || b === null ? NaN : a + b }; }));
    },
  ], "近五日主力资金流"));
}

export async function analyzeSymbol(stock: Stock, market: Market, topics: Topic[], sectors: string[]): Promise<Candidate> {
  validate(stock.symbol, market);
  const warnings: string[] = [];
  const optional = async <T>(load: () => Promise<T>, warning: string): Promise<T | null> => { try { return await load(); } catch { warnings.push(warning); return null; } };
  const [quote, bars, flowRows, holder, concepts] = await Promise.all([
    fetchQuote(stock.symbol, market), fetchBars(stock.symbol, market),
    market === "ashare" ? optional(() => flowsFor(stock.symbol), "主力资金流暂不可用，此项不计分") : Promise.resolve(null),
    market === "ashare" ? optional(() => holderFor(stock.symbol), "股东户数暂不可用，不能确认高控盘") : Promise.resolve(null),
    market === "ashare" ? optional(() => conceptsFor(stock.symbol), "个股概念暂不可用，热点项不计分") : Promise.resolve(null),
  ]);
  const volume = computeVolume(bars);
  if (market === "ashare") volume.ratio = Math.max(volume.ratio, quote.volumeRatio ?? 0);
  const box = computeBox(bars);
  const flow = market === "ashare" ? computeFlow(flowRows ?? []) : null;
  const control = computeControl(quote.turnoverPct, holder);
  const matchedTopics = matchThemes(concepts ?? [], [...topics.map(topic => topic.name), ...sectors]);
  if (market === "ashare" && !topics.length) warnings.push("热门板块源不可用，仅匹配自定义关注板块");
  if (holder && Date.now() - Date.parse(holder.date) > 120 * DAY) warnings.push(`股东户数披露较早（${holder.date}），控盘仅作滞后参考`);
  if (Date.now() - Date.parse(bars.at(-1)!.date) > 14 * DAY) warnings.push(`日 K 最新日期 ${bars.at(-1)!.date}，可能停牌或数据延迟`);
  if (flowRows && flowRows.length < 5) warnings.push(`资金流仅有 ${flowRows.length} 日，尚不足完整五日观察窗`);
  const scoring = scoreConditions({ market, volume, box, changePct: quote.changePct, themeMatched: matchedTopics.length > 0, flow, control });
  return { symbol: stock.symbol, name: quote.name || stock.name, market, quote, box, volume, flow, control, concepts: concepts ?? [], matchedTopics, ...scoring, dataWarnings: warnings, scannedAt: now() };
}
