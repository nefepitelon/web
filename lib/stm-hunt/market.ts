import "server-only";

// Display-only public spot data. This adapter is deliberately independent from
// strategy evidence and order execution; the last 1m candle may still be open.
export interface StmMarketLevel { price: number; quantity: number }
export interface StmMarketCandle {
  /** Binance candle open time, Unix milliseconds. */
  time: number; open: number; high: number; low: number; close: number; volume: number; closed: boolean;
}
export interface StmMarketSnapshot {
  symbol: string; asOf: string; price: number | null; change24h: number | null;
  volumeUsd: number | null; high24h: number | null; low24h: number | null;
  bids: StmMarketLevel[]; asks: StmMarketLevel[]; candles: StmMarketCandle[];
  source: string; status: "ok" | "partial" | "unavailable"; message: string;
}

const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"] as const;
const CACHE_MS = 2_500;
const DEADLINE_MS = 4_500;
const ATTEMPT_MS = 1_800;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_CACHE_SYMBOLS = 40;
const MAX_BODY_CHARS = 256_000;
const cache = new Map<string, { until: number; snapshot: StmMarketSnapshot }>();
const flights = new Map<string, Promise<StmMarketSnapshot>>();
let activeRequests = 0;
let budgetStart = 0;
let budgetRequests = 0;

export function isStmMarketSymbol(value: unknown): value is string {
  return typeof value === "string" && value.length <= 24 && /^[A-Z0-9]{2,20}USDT$/.test(value);
}
function number(value: unknown, positive = false): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && (!value.trim() || !/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && (!positive || parsed > 0) ? parsed : null;
}
function nonnegative(value: unknown): number | null {
  const parsed = number(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function levels(raw: unknown, descending: boolean): { values: StmMarketLevel[]; valid: boolean } {
  if (!Array.isArray(raw) || !raw.length) return { values: [], valid: false };
  const values: StmMarketLevel[] = [];
  for (const row of raw.slice(0, 20)) {
    if (!Array.isArray(row)) return { values: [], valid: false };
    const price = number(row[0], true), quantity = number(row[1], true);
    if (price === null || quantity === null) return { values: [], valid: false };
    const previous = values.at(-1)?.price;
    if (previous !== undefined && (descending ? price >= previous : price <= previous)) return { values: [], valid: false };
    values.push({ price, quantity });
  }
  return { values, valid: true };
}

export function normalizeStmMarket(
  symbol: string, payloads: { depth?: unknown; klines?: unknown; ticker?: unknown }, now = Date.now(),
): StmMarketSnapshot {
  const depth = object(payloads.depth), ticker = object(payloads.ticker);
  const bid = levels(depth.bids, true), ask = levels(depth.asks, false);
  let bids = bid.values, asks = ask.values;
  let depthValid = bid.valid && ask.valid;
  if (bids.length && asks.length && bids[0].price >= asks[0].price) { bids = []; asks = []; depthValid = false; }

  const candles: StmMarketCandle[] = [];
  let candleValid = Array.isArray(payloads.klines) && payloads.klines.length > 0;
  if (Array.isArray(payloads.klines)) {
    for (const row of payloads.klines.slice(-60)) {
      if (!Array.isArray(row)) { candleValid = false; continue; }
      const time = number(row[0]), closeTime = number(row[6]);
      const open = number(row[1], true), high = number(row[2], true), low = number(row[3], true), close = number(row[4], true), volume = nonnegative(row[5]);
      if (time === null || closeTime === null || !Number.isSafeInteger(time) || !Number.isSafeInteger(closeTime)
        || time <= 0 || time > now || closeTime < time || closeTime - time >= 60_000
        || (candles.length > 0 && time <= candles[candles.length - 1].time)
        || open === null || high === null || low === null || close === null || volume === null
        || high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
        candleValid = false; continue;
      }
      candles.push({ time, open, high, low, close, volume, closed: closeTime < now });
    }
  }
  if (!candles.length) candleValid = false;

  const tickerMatches = ticker.symbol === symbol;
  let price = tickerMatches ? number(ticker.lastPrice, true) : null;
  const change24h = tickerMatches ? number(ticker.priceChangePercent) : null;
  const volumeUsd = tickerMatches ? nonnegative(ticker.quoteVolume) : null;
  let high24h = tickerMatches ? number(ticker.highPrice, true) : null;
  let low24h = tickerMatches ? number(ticker.lowPrice, true) : null;
  if (high24h !== null && low24h !== null && high24h < low24h) { high24h = null; low24h = null; price = null; }
  if (price !== null && ((high24h !== null && price > high24h) || (low24h !== null && price < low24h))) price = null;
  const tickerValid = price !== null && change24h !== null && volumeUsd !== null && high24h !== null && low24h !== null;
  const any = price !== null || change24h !== null || volumeUsd !== null || high24h !== null || low24h !== null || candles.length > 0 || bids.length > 0 || asks.length > 0;
  const status = depthValid && candleValid && tickerValid ? "ok" : any ? "partial" : "unavailable";
  const missing = [!depthValid && "盘口", !candleValid && "1 分钟 K 线", !tickerValid && "24h 行情"].filter(Boolean);
  return {
    symbol, asOf: new Date(now).toISOString(), price, change24h, volumeUsd, high24h, low24h,
    bids, asks, candles, source: "Binance Spot · public REST",
    status, message: status === "ok"
      ? "公开行情快照；最后一根 1m K 线可能未收盘。仅用于图表展示，不作为策略或下单证据。"
      : `${missing.join("、")}暂不可用或校验未通过；保留已验证的数据，未知字段为 null。仅用于图表展示。`,
  };
}

class PublicMarketError extends Error {
  constructor(message: string, readonly stopFallback = false) { super(message); }
}
async function endpoint(path: string, symbol: string, query: string, deadline: number): Promise<unknown> {
  for (const host of HOSTS) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new PublicMarketError("行情读取超时");
    if (activeRequests >= MAX_CONCURRENT_REQUESTS) throw new PublicMarketError("行情读取繁忙");
    const now = Date.now();
    if (now - budgetStart >= 60_000) { budgetStart = now; budgetRequests = 0; }
    if (budgetRequests >= 120) throw new PublicMarketError("行情读取预算已满");
    activeRequests += 1; budgetRequests += 1;
    try {
      const response = await fetch(`${host}/api/v3/${path}?symbol=${symbol}${query}`, {
        headers: { Accept: "application/json" }, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(Math.max(1, Math.min(ATTEMPT_MS, remaining))),
      });
      if (!response.ok) throw new PublicMarketError(`公开行情 HTTP ${response.status}`, [400, 418, 429].includes(response.status));
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > MAX_BODY_CHARS) throw new PublicMarketError("行情响应过大", true);
      const text = await response.text();
      if (text.length > MAX_BODY_CHARS) throw new PublicMarketError("行情响应过大", true);
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof PublicMarketError && error.stopFallback) throw error;
      if (host === HOSTS[HOSTS.length - 1]) throw new PublicMarketError("公开行情源暂不可用");
    } finally { activeRequests -= 1; }
  }
  throw new PublicMarketError("公开行情源暂不可用");
}

async function capture(symbol: string): Promise<StmMarketSnapshot> {
  const deadline = Date.now() + DEADLINE_MS;
  const [depth, klines, ticker] = await Promise.allSettled([
    endpoint("depth", symbol, "&limit=20", deadline),
    endpoint("klines", symbol, "&interval=1m&limit=60", deadline),
    endpoint("ticker/24hr", symbol, "", deadline),
  ]);
  const snapshot = normalizeStmMarket(symbol, {
    depth: depth.status === "fulfilled" ? depth.value : undefined,
    klines: klines.status === "fulfilled" ? klines.value : undefined,
    ticker: ticker.status === "fulfilled" ? ticker.value : undefined,
  });
  const warnings = [depth, klines, ticker].flatMap(result => result.status === "rejected" && result.reason instanceof PublicMarketError ? [result.reason.message] : []);
  if (warnings.length) snapshot.message += ` ${[...new Set(warnings)].join("；")}。`;
  return snapshot;
}

export async function getStmMarketSnapshot(symbol = "BTCUSDT"): Promise<StmMarketSnapshot> {
  if (!isStmMarketSymbol(symbol)) throw new Error("仅接受完整的大写 USDT 交易对，例如 BTCUSDT");
  const existing = cache.get(symbol);
  if (existing && existing.until > Date.now()) return existing.snapshot;
  const flight = flights.get(symbol);
  if (flight) return flight;
  if (flights.size >= 16) {
    const snapshot = normalizeStmMarket(symbol, {});
    snapshot.message = "公开行情读取繁忙，请稍后重试；未生成替代图表或价格。";
    return snapshot;
  }
  const promise = capture(symbol).then(snapshot => {
    if (cache.size >= MAX_CACHE_SYMBOLS && !cache.has(symbol)) cache.delete(cache.keys().next().value!);
    cache.set(symbol, { until: Date.now() + CACHE_MS, snapshot });
    return snapshot;
  }).finally(() => { flights.delete(symbol); });
  flights.set(symbol, promise);
  return promise;
}
