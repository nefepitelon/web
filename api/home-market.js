const BINANCE_ORIGINS = ["https://data-api.binance.vision", "https://api.binance.com"];
const HASHRATE_URL = "https://mempool.space/api/v1/mining/hashrate/1w";
const MINUTE = 60_000;
const DEFINITIONS = {
  price: { ttl: 30_000, maxAge: 5 * MINUTE, load: fetchPrice },
  spread: { ttl: 30_000, maxAge: 5 * MINUTE, load: fetchSpread },
  hashrate: { ttl: 5 * MINUTE, maxAge: 60 * MINUTE, load: fetchHashrate }
};
const cache = new Map();
let refreshPromise;

function numeric(value) {
  if (value == null || value === "" || typeof value === "boolean") return NaN;
  return Number(value);
}

export function normalizeTicker(payload, observedAt = Date.now()) {
  const value = numeric(payload?.lastPrice);
  const change24h = numeric(payload?.priceChangePercent);
  const sourceTime = numeric(payload?.closeTime);
  if (payload?.symbol !== "BTCUSDT" || !(value > 0) || !Number.isFinite(value)
    || !Number.isFinite(change24h) || !(sourceTime > 0) || sourceTime > observedAt + MINUTE) {
    throw new Error("Invalid BTC ticker");
  }
  return {
    value, change24h, unit: "USDT", symbol: "BTCUSDT", source: "Binance Spot",
    sourceUrl: "https://www.binance.com/en/trade/BTC_USDT",
    asOf: new Date(sourceTime).toISOString(), fetchedAt: new Date(observedAt).toISOString()
  };
}

export function normalizeBook(payload, observedAt = Date.now()) {
  const bid = numeric(payload?.bidPrice);
  const ask = numeric(payload?.askPrice);
  if (payload?.symbol !== "BTCUSDT" || !(bid > 0) || !(ask >= bid)
    || !Number.isFinite(bid) || !Number.isFinite(ask)) throw new Error("Invalid BTC order book");
  // Basis points of the midpoint; this is a spot quote, not an OTC quote.
  const value = (ask - bid) / ((ask + bid) / 2) * 10_000;
  return {
    value, bid, ask, unit: "bps", symbol: "BTCUSDT", source: "Binance Spot",
    sourceUrl: "https://www.binance.com/en/trade/BTC_USDT",
    asOf: new Date(observedAt).toISOString(), fetchedAt: new Date(observedAt).toISOString(),
    asOfKind: "retrieved"
  };
}

export function normalizeHashrate(payload, observedAt = Date.now()) {
  const hashesPerSecond = numeric(payload?.currentHashrate);
  if (!(hashesPerSecond > 0) || !Number.isFinite(hashesPerSecond)) throw new Error("Invalid Bitcoin hashrate");
  return {
    value: hashesPerSecond / 1e18, unit: "EH/s", window: "7d", estimated: true,
    source: "mempool.space", sourceUrl: "https://mempool.space/mining",
    asOf: new Date(observedAt).toISOString(), fetchedAt: new Date(observedAt).toISOString(),
    asOfKind: "retrieved"
  };
}

export function resolveMetric(key, metric, now = Date.now(), failed = false) {
  const definition = DEFINITIONS[key];
  const asOf = Date.parse(metric?.asOf || "");
  const age = now - asOf;
  if (!metric || !Number.isFinite(metric.value) || !Number.isFinite(asOf)
    || age > definition.maxAge || age < -MINUTE) {
    return { value: null, status: "unavailable", asOf: null, source: key === "hashrate" ? "mempool.space" : "Binance Spot" };
  }
  return {
    ...metric,
    status: failed || age > definition.ttl * 2 ? "stale" : "live",
    staleAt: new Date(asOf + definition.ttl * 2).toISOString(),
    expiresAt: new Date(asOf + definition.maxAge).toISOString()
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinance(path, normalize) {
  for (const origin of BINANCE_ORIGINS) {
    try { return normalize(await fetchJson(`${origin}${path}`)); } catch { /* Try the other public market-data origin. */ }
  }
  throw new Error("Binance public market data unavailable");
}

function fetchPrice() {
  return fetchBinance("/api/v3/ticker/24hr?symbol=BTCUSDT", normalizeTicker);
}

function fetchSpread() {
  return fetchBinance("/api/v3/ticker/bookTicker?symbol=BTCUSDT", normalizeBook);
}

async function fetchHashrate() {
  return normalizeHashrate(await fetchJson(HASHRATE_URL));
}

async function refreshMetrics() {
  await Promise.all(Object.entries(DEFINITIONS).map(async ([key, definition]) => {
    const previous = cache.get(key);
    if (previous?.retryAt > Date.now()) return;
    try {
      const metric = await definition.load();
      cache.set(key, { metric, retryAt: Date.now() + definition.ttl, failed: false });
    } catch {
      cache.set(key, { metric: previous?.metric, retryAt: Date.now() + 15_000, failed: true });
    }
  }));
}

export async function getHomeMarketPayload() {
  if (!refreshPromise) refreshPromise = refreshMetrics().finally(() => { refreshPromise = undefined; });
  await refreshPromise;
  const now = Date.now();
  const metrics = Object.fromEntries(Object.keys(DEFINITIONS).map((key) => {
    const entry = cache.get(key);
    return [key, resolveMetric(key, entry?.metric, now, entry?.failed)];
  }));
  const states = Object.values(metrics).map((metric) => metric.status);
  return {
    ok: states.some((state) => state !== "unavailable"),
    partial: states.some((state) => state !== "live"),
    generatedAt: new Date(now).toISOString(), refreshSeconds: 30, metrics
  };
}
