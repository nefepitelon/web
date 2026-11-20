// Read-only public observations. Never infer missing chain metrics, social posts or OI history.
import { parseMarketResponse, finiteNonnegative } from "../../api/market-heatmap.js";
import { getAssetNews } from "../../api/_asset-daily-news.js";
import { getAssetEvidence } from "../../api/_asset-daily-evidence.js";

const INFO_URL = "https://api.hyperliquid.xyz/info";
const INFO_DOCS = "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint";
const LLAMA_URL = "https://api.llama.fi";
const MEMPOOL_URL = "https://mempool.space";
const DAY = 86_400_000;
const QUOTE_TTL_MS = 60_000;
const REPORT_TTL_MS = 5 * 60_000;
const RETRY_MS = 30_000;
const MAX_STALE_MS = 6 * 60 * 60_000;
const QUOTE_MAX_STALE_MS = 15 * 60_000;
const MAX_BODY_BYTES = 5_000_000;
const TIMEOUT_MS = 6_500;
const CHAIN_NAMES = Object.freeze({ BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BSC",
  HYPE: "Hyperliquid L1", SUI: "Sui", AVAX: "Avalanche", ADA: "Cardano", NEAR: "Near",
  DOT: "Polkadot", TON: "TON", TRX: "Tron" });
const PROTOCOL_NAMES = Object.freeze({ AAVE: "aave", UNI: "uniswap", ENA: "ethena" });

const iso = value => new Date(value).toISOString();
function number(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 1e18 ? parsed : null;
}
function error(code, message) { return Object.assign(new Error(message), { code }); }

function resolveAsset(id) {
  if (typeof id !== "string" || !/^(?:xyz:)?[A-Z0-9]{1,16}$/.test(id)) return null;
  const dex = id.startsWith("xyz:") ? "xyz" : "";
  try {
    // Reuse the heatmap's strict known-symbol classifier. Placeholder numbers are used
    // only to resolve metadata; no placeholder quote is ever returned to a client.
    const row = parseMarketResponse([{ universe: [{ name: id }] }, [{ markPx: "1", prevDayPx: "1" }]], dex)[0];
    return { id: row.id, symbol: row.symbol, name: row.name, group: row.group, market: "perpetual", dex };
  } catch { return null; }
}

async function readBoundedJson(response) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error("Public body too large");
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "", bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BODY_BYTES) throw new Error("Public body too large");
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return JSON.parse(text);
    } catch (failure) { await reader.cancel().catch(() => {}); throw failure; }
  }
  if (typeof response.text === "function") {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error("Public body too large");
    return JSON.parse(text);
  }
  const payload = await response.json();
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_BODY_BYTES) throw new Error("Public body too large");
  return payload;
}

async function requestJson(fetchImpl, url, { body, timeoutMs = TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { method: body ? "POST" : "GET",
          headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal, cache: "no-store", redirect: "error" });
        if (!response.ok) throw new Error(`Public source HTTP ${response.status}`);
        return readBoundedJson(response);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Public source timeout")); }, timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

function parseQuotes(payload, dex, clock) {
  const rows = parseMarketResponse(payload, dex);
  const contexts = new Map(payload[0].universe.map((meta, index) => [meta.name, payload[1][index]]));
  return rows.map(row => ({ ...row, fundingRate: number(contexts.get(row.id)?.funding), asOf: iso(clock), sourceUrl: INFO_URL,
    sourceName: "Hyperliquid / trade[XYZ] public perpetual", sourceId: "quote", status: "fresh" }));
}

function parseCandles(payload, asset, clock) {
  if (!Array.isArray(payload) || payload.length > 1000) throw new Error("Invalid public candle response");
  const points = new Map();
  for (const candle of payload) {
    if (candle?.s !== asset.id || candle.i !== "1d") continue;
    const start = number(candle.t), end = number(candle.T), close = finiteNonnegative(candle.c);
    if (start === null || end === null || start < clock - 47 * DAY || start > clock || end < start || end - start > DAY
      || !Number.isInteger(start) || !Number.isInteger(end) || !(close > 0)) continue;
    // For an open daily candle its latest trade is observed now, never at tomorrow's close.
    const time = Math.min(end, clock);
    points.set(start, { time: iso(time), close, volumeUsd: null, volumeBase: finiteNonnegative(candle.v),
      intervalStart: iso(start), provisional: end > clock });
  }
  const rows = [...points.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => point).slice(-46);
  if (rows.length < 2) throw new Error("No valid public price history");
  return rows;
}

function parseSeries(payload, kind, clock) {
  const raw = kind === "tvl" ? payload : payload?.totalDataChart;
  if (!Array.isArray(raw) || raw.length > 30_000) throw new Error("Invalid public chain response");
  const points = new Map();
  for (const row of raw) {
    const timestamp = number(kind === "tvl" ? row?.date : row?.[0]);
    const value = finiteNonnegative(kind === "tvl" ? row?.tvl : row?.[1]);
    if (timestamp === null || !Number.isInteger(timestamp) || timestamp < 1_200_000_000 || timestamp * 1000 > clock
      || timestamp * 1000 < clock - 47 * DAY || value === null) continue;
    points.set(timestamp, { time: iso(timestamp * 1000), value });
  }
  const series = [...points.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => point).slice(-46);
  if (!series.length) throw new Error("No recent public chain points");
  return series;
}

function changeAt(series, days) {
  if (!series.length) return null;
  const last = series.at(-1), target = Date.parse(last.time) - days * DAY;
  const targetDay = Math.floor(target / DAY);
  const base = series.filter(point => Math.floor(Date.parse(point.time) / DAY) === targetDay).at(-1);
  return base && base.value > 0 ? (last.value / base.value - 1) * 100 : null;
}
function trendFromSeries(id, label, unit, series, sourceUrl, clock, extra = {}) {
  const latest = series.at(-1);
  return { id, label, unit, current: latest?.value ?? null,
    change24hPct: changeAt(series, 1), change7dPct: changeAt(series, 7), change30dPct: changeAt(series, 30),
    asOf: latest?.time ?? null, sourceName: "DefiLlama public data", sourceUrl, series,
    status: !latest ? "unavailable" : clock - Date.parse(latest.time) > 3 * DAY ? "stale" : "fresh", ...extra };
}
function missingTrend(id, label, status, note) {
  return { id, label, unit: "USD", current: null, change24hPct: null, change7dPct: null, change30dPct: null,
    asOf: null, sourceName: null, sourceUrl: null, series: [], status, note };
}

function rulesEvidence(report, clock) {
  const quote = report.quote;
  const direction = quote.change24hPct > 0 ? "上涨" : quote.change24hPct < 0 ? "回落" : "持平";
  const signals = [{ title: "最新盘面", text: `公开永续标记价格24小时${direction} ${Math.abs(quote.change24hPct).toFixed(2)}%；该报价不是证券交易所现货价格。`,
    tone: quote.change24hPct > 0 ? "positive" : quote.change24hPct < 0 ? "negative" : "neutral", evidenceIds: ["quote"] }];
  const available = report.trends.filter(trend => trend.current !== null && trend.status === "fresh");
  if (available.length) {
    const observed = available.filter(trend => trend.change7dPct !== null);
    signals.push({ title: "链上趋势", text: observed.length
      ? observed.map(trend => `${trend.label}近7日${trend.change7dPct >= 0 ? "+" : ""}${trend.change7dPct.toFixed(2)}%`).join("；") + "。指标覆盖与更新时间各自独立。"
      : "已获取公开链上观测；可比较的历史窗口不足，保留实际数据，不推算缺失变化。",
    tone: "neutral", evidenceIds: available.map(trend => trend.id) });
  }
  if (report.news.items.length) signals.push({ title: "事件证据", text: `近72小时检索到 ${report.news.items.length} 条带原始链接的相关公开报道；按发布时间展示，报道内容不等同于链上证实。`,
    tone: "neutral", evidenceIds: report.news.items.slice(0, 3).map(item => item.id) });
  return { status: "available", method: "rules", summary: "公开数据摘要已就绪；AI证据研判可单独加载，并只使用本日报列出的证据。",
    signals, asOf: iso(clock) };
}

function createAssetDailyReportService({ fetchImpl = (...args) => fetch(...args), now = Date.now,
  timeoutMs = TIMEOUT_MS, getNewsImpl = getAssetNews, getEvidenceImpl = getAssetEvidence } = {}) {
  const entries = new Map(), pending = new Map();
  let activeBuilds = 0;

  async function cached(key, loader, ttl = REPORT_TTL_MS, maxStale = MAX_STALE_MS) {
    const clock = now(), entry = entries.get(key) || {};
    const age = entry.asOf === undefined ? Infinity : clock - entry.asOf;
    if (entry.value !== undefined && age >= 0 && age < ttl) return { value: entry.value, asOf: entry.asOf, stale: false };
    if (pending.has(key)) return pending.get(key);
    if (entry.attemptedAt !== undefined && clock - entry.attemptedAt < RETRY_MS) {
      if (entry.value !== undefined && age >= 0 && age < maxStale) return { value: entry.value, asOf: entry.asOf, stale: true };
      throw error("UNAVAILABLE", "Public source temporarily unavailable");
    }
    const work = (async () => {
      entry.attemptedAt = now(); entries.set(key, entry);
      try { entry.value = await loader(); entry.asOf = now(); return { value: entry.value, asOf: entry.asOf, stale: false }; }
      catch (failure) {
        const retainedAge = entry.asOf === undefined ? Infinity : now() - entry.asOf;
        if (entry.value !== undefined && retainedAge >= 0 && retainedAge < maxStale) return { value: entry.value, asOf: entry.asOf, stale: true };
        throw failure;
      }
    })().finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  }

  async function quoteFor(asset) {
    const entry = await cached(`quotes:${asset.dex}`, async () => parseQuotes(await requestJson(fetchImpl, INFO_URL,
      { body: { type: "metaAndAssetCtxs", dex: asset.dex }, timeoutMs }), asset.dex, now()), QUOTE_TTL_MS, QUOTE_MAX_STALE_MS);
    const value = entry.value.find(row => row.id === asset.id);
    if (!value) throw error("UNAVAILABLE", "This market has no valid public quote");
    return { price: value.price, change24hPct: value.change24hPct, volume24hUsd: value.volume24hUsd,
      openInterestUsd: value.openInterestUsd, fundingRate: value.fundingRate, asOf: value.asOf,
      sourceUrl: INFO_URL, sourceName: value.sourceName, sourceId: "quote", status: entry.stale ? "stale" : "fresh" };
  }

  async function chainTrends(asset) {
    if (asset.group !== "crypto") return [missingTrend("chain-coverage", "链上数据趋势", "not-applicable", "此标的是公开永续衍生品，证券、指数与商品不适用原生链上费用/TVL。")];
    const chain = CHAIN_NAMES[asset.symbol], protocol = PROTOCOL_NAMES[asset.symbol];
    if (!chain && !protocol) return [missingTrend("chain-coverage", "链上数据趋势", "unavailable", "尚无已核实、可归属于此标的的免费链上历史源；不以其他链或虚构指标代替。")];
    const scope = chain || protocol;
    const endpoints = [
      { id: "chain-tvl", label: chain ? `${chain} 生态TVL` : `${asset.name} 协议TVL`, kind: "tvl",
        url: chain ? `${LLAMA_URL}/v2/historicalChainTvl/${encodeURIComponent(chain)}` : `${LLAMA_URL}/protocol/${protocol}` },
      ...["dailyFees", "dailyRevenue"].map(kind => ({ id: kind === "dailyFees" ? "chain-fees" : "chain-revenue",
        label: `${scope} ${chain ? "生态协议" : "协议"}${kind === "dailyFees" ? "费用" : "收入"}`,
        kind, url: `${LLAMA_URL}/${chain ? "overview" : "summary"}/fees/${encodeURIComponent(scope)}?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true&dataType=${kind}` }))
    ];
    const trends = await Promise.all(endpoints.map(async definition => {
      try {
        const entry = await cached(`chain:${definition.url}`, async () => {
          const payload = await requestJson(fetchImpl, definition.url, { timeoutMs });
          return parseSeries(!chain && definition.kind === "tvl"
            ? payload?.tvl?.map(point => ({ date: point.date, tvl: point.totalLiquidityUSD })) : payload, definition.kind, now());
        });
        const result = trendFromSeries(definition.id, definition.label, "USD", entry.value, definition.url, now(), {
          note: definition.kind === "tvl" ? "DeFi锁仓价值；不是代币估值或资金净流入。" : "公开覆盖协议的自然日合计；最新一天可能尚未结束，不等同于原生网络全部费用。",
          provisional: Date.parse(entry.value.at(-1).time) + DAY > now()
        });
        if (entry.stale) result.status = "stale";
        return result;
      } catch { return { ...missingTrend(definition.id, definition.label, "unavailable", "公开源暂不可用，未补写历史或数值。"), sourceName: "DefiLlama public data", sourceUrl: definition.url }; }
    }));
    if (asset.symbol === "BTC") {
      const extra = await Promise.all([
        (async () => {
          const url = `${MEMPOOL_URL}/api/v1/mining/hashrate/1m`;
          try {
            const entry = await cached("btc:hashrate", async () => {
              const payload = await requestJson(fetchImpl, url, { timeoutMs });
              if (!Array.isArray(payload?.hashrates) || payload.hashrates.length > 2000) throw new Error("Invalid network data");
              return parseSeries(payload.hashrates.map(row => {
                const hashrate = typeof row.avgHashrate === "number" || typeof row.avgHashrate === "string" ? Number(row.avgHashrate) : NaN;
                return { date: row.timestamp, tvl: Number.isFinite(hashrate) && hashrate >= 0 && hashrate <= 1e30 ? hashrate / 1e18 : null };
              }), "tvl", now());
            });
            const row = trendFromSeries("btc-hashrate", "BTC全网算力", "EH/s", entry.value, url, now(), { sourceName: "mempool.space public mining data" });
            if (entry.stale) row.status = "stale";
            return row;
          } catch { return { ...missingTrend("btc-hashrate", "BTC全网算力", "unavailable", "公开网络数据暂不可用。"), unit: "EH/s", sourceName: "mempool.space", sourceUrl: url }; }
        })(),
        (async () => {
          const url = `${MEMPOOL_URL}/api/v1/fees/recommended`;
          try {
            const entry = await cached("btc:fees", async () => {
              const payload = await requestJson(fetchImpl, url, { timeoutMs });
              const value = finiteNonnegative(payload?.fastestFee);
              if (value === null) throw new Error("Invalid network fee");
              return value;
            });
            return { id: "btc-priority-fee", label: "BTC优先确认建议费率", unit: "sat/vB", current: entry.value,
              change24hPct: null, change7dPct: null, change30dPct: null, asOf: iso(entry.asOf),
              sourceName: "mempool.space", sourceUrl: url, series: [], status: entry.stale ? "stale" : "fresh",
              note: "当前建议费率快照；不构造不存在的历史趋势。" };
          } catch { return { ...missingTrend("btc-priority-fee", "BTC优先确认建议费率", "unavailable", "公开网络数据暂不可用。"), unit: "sat/vB", sourceName: "mempool.space", sourceUrl: url }; }
        })()
      ]);
      trends.push(...extra);
    }
    return trends;
  }

  async function reportParts(asset) {
    return cached(`report:${asset.id}`, async () => {
      if (activeBuilds >= 6) throw error("BUSY", "Report refresh capacity reached");
      activeBuilds += 1;
      try {
        const results = await Promise.allSettled([
          cached(`candles:${asset.id}`, async () => parseCandles(await requestJson(fetchImpl, INFO_URL,
            { body: { type: "candleSnapshot", req: { coin: asset.id, interval: "1d", startTime: now() - 46 * DAY, endTime: now() } }, timeoutMs }), asset, now())),
          chainTrends(asset), getNewsImpl(asset, { fetchImpl, now, timeoutMs })
        ]);
        const priceResult = results[0].status === "fulfilled" ? results[0].value : null;
        const trends = results[1].status === "fulfilled" ? results[1].value : [missingTrend("chain-coverage", "链上数据趋势", "unavailable", "公开源暂不可用。")];
        const newsBundle = results[2].status === "fulfilled" ? results[2].value : {
          news: { status: "unavailable", asOf: iso(now()), items: [] },
          xMonitor: { status: "unavailable", asOf: iso(now()), items: [], searchUrl: `https://x.com/search?q=${encodeURIComponent(`${asset.symbol} lang:zh`)}&f=live`, note: "公开X内容暂无法核验；不把新闻摘要当作监控结果。" }, sources: []
        };
        return { generatedAt: iso(now()), priceSeries: priceResult?.value || [], priceStale: !priceResult || priceResult.stale,
          trends, news: newsBundle.news, xMonitor: newsBundle.xMonitor, newsSources: newsBundle.sources || [] };
      } finally { activeBuilds -= 1; }
    });
  }

  async function getReport(id) {
    const asset = resolveAsset(id);
    if (!asset) throw error("INVALID_ASSET", "Unknown market asset");
    const [quote, parts] = await Promise.all([quoteFor(asset), reportParts(asset)]);
    const value = parts.value, clock = now();
    const priceStale = value.priceStale || (value.priceSeries.length > 0
      && clock - Date.parse(value.priceSeries.at(-1).time) > 3 * DAY);
    const trends = value.trends.map(trend => ({ ...trend, series: trend.series.map(point => ({ ...point })) }));
    const withinWindow = item => Number.isFinite(Date.parse(item.publishedAt))
      && Date.parse(item.publishedAt) <= clock && Date.parse(item.publishedAt) >= clock - 3 * DAY;
    const news = { ...value.news, items: [...(value.news?.items || [])].filter(withinWindow), stale: parts.stale };
    const xMonitor = { ...value.xMonitor, items: [...(value.xMonitor?.items || [])].filter(withinWindow), stale: parts.stale };
    if (!news.items.length && news.status === "available") news.status = "empty";
    if (!xMonitor.items.length && xMonitor.status === "available") xMonitor.status = "unavailable";
    const sources = [{ id: "quote", name: quote.sourceName, url: INFO_URL, asOf: quote.asOf, status: quote.status },
      { id: "price-history", name: "Hyperliquid public daily trade candles", url: INFO_DOCS,
        asOf: value.priceSeries.at(-1)?.time || null, status: !value.priceSeries.length ? "unavailable" : priceStale ? "stale" : "fresh" },
      ...trends.filter(trend => trend.sourceUrl).map(trend => ({ id: trend.id, name: trend.sourceName, url: trend.sourceUrl, asOf: trend.asOf, status: trend.status })),
      ...value.newsSources];
    const stale = parts.stale || quote.status !== "fresh" || (value.priceSeries.length > 0 && priceStale)
      || trends.some(trend => trend.status === "stale");
    const report = { ok: true, schema: 1, asset, generatedAt: value.generatedAt,
      nextRefreshAt: iso(quote.status !== "fresh" ? clock + RETRY_MS
        : Math.max(clock + 1_000, Math.min(Date.parse(quote.asOf) + QUOTE_TTL_MS, parts.asOf + REPORT_TTL_MS))),
      quote, priceSeries: value.priceSeries.map(point => ({ ...point })), trends, news, xMonitor, sources, stale,
      partial: !value.priceSeries.length || trends.some(trend => trend.status === "unavailable") || !["available", "fresh", "empty"].includes(news.status) || xMonitor.status === "unavailable",
      coverage: { quote: quote.status, priceHistory: !value.priceSeries.length ? "unavailable" : priceStale ? "stale" : "fresh",
        chain: asset.group !== "crypto" ? "not-applicable" : trends.every(trend => trend.status === "unavailable") ? "unavailable" : trends.some(trend => trend.status === "unavailable") ? "partial" : "available",
        news: news.status, x: xMonitor.status, evidence: "rules", market: "public-perpetual-not-exchange-spot",
        note: "报价按需最多60秒缓存；日报与链上/新闻源最多5分钟重查，各来源保留实际观测时间。X仅展示可核验公开内容；无覆盖、缺失与不适用均明确标注。未生成OI历史。" } };
    report.evidence = rulesEvidence(report, clock);
    report.timeline = [
      { id: "market-observation", title: `${asset.symbol} 最新公开行情快照`, summary: `24H ${quote.change24hPct >= 0 ? "+" : ""}${quote.change24hPct.toFixed(2)}%，来源为公开永续市场。`,
        publishedAt: quote.asOf, sourceName: quote.sourceName, url: INFO_DOCS, kind: "market", evidenceIds: ["quote"] },
      ...news.items.map(item => ({ ...item, evidenceIds: [item.id] })),
      ...xMonitor.items.filter(item => !news.items.some(newsItem => newsItem.id === item.id)).map(item => ({ ...item, evidenceIds: [item.id] }))
    ].filter(item => Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt) <= clock).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 18);
    return report;
  }
  return { getReport, async getEvidence(id) { const report = await getReport(id); return { ok: true, assetId: report.asset.id,
    evidence: await getEvidenceImpl(report, { fetchImpl, now, timeoutMs: 45_000 }), generatedAt: report.generatedAt }; } };
}

function defaultService() { return globalThis.__welinkAssetDailyReportV1 ||= createAssetDailyReportService(); }
function createAssetDailyReportHandler(service = defaultService()) {
  return async function handler(request, response) {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") return response.status(204).end();
    if (!["GET", "POST"].includes(request.method)) { response.setHeader("Allow", "GET, POST, OPTIONS"); return response.status(405).json({ ok: false, error: "Method not allowed" }); }
    response.setHeader("Cache-Control", "no-store");
    try {
      let id;
      if (request.method === "POST") {
        const raw = request.body;
        if (typeof raw === "string" && Buffer.byteLength(raw, "utf8") > 1024) return response.status(413).json({ ok: false, error: "Request too large" });
        let body;
        try { body = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { body = null; }
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "asset")) return response.status(400).json({ ok: false, error: "Expected asset only" });
        id = body.asset;
      } else {
        id = request.query?.asset;
        if (id === undefined) { try { id = new URL(request.url, "https://welink.invalid").searchParams.get("asset"); } catch {} }
      }
      if (!resolveAsset(id)) return response.status(400).json({ ok: false, error: "Unknown market asset" });
      const payload = request.method === "POST" ? await service.getEvidence(id) : await service.getReport(id);
      response.setHeader("X-Welink-Cache", payload.stale ? "STALE" : "FRESH");
      return response.status(200).json(payload);
    } catch (failure) {
      return response.status(failure?.code === "BUSY" ? 429 : 502).json({ ok: false,
        error: failure?.code === "BUSY" ? "Report refresh busy; please retry shortly" : "Public asset report temporarily unavailable" });
    }
  };
}

export default async function handler(request, response) { return createAssetDailyReportHandler()(request, response); }
export { INFO_URL, QUOTE_TTL_MS, REPORT_TTL_MS, MAX_STALE_MS, QUOTE_MAX_STALE_MS, TIMEOUT_MS,
  resolveAsset, parseCandles, parseSeries, changeAt, requestJson, createAssetDailyReportService, createAssetDailyReportHandler };
