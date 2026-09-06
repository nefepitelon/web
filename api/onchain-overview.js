const CACHE_TTL_MS = 60_000;
const UPSTREAM_TIMEOUT_MS = 7_000;
const BINANCE_ORIGINS = [
  "https://data-api.binance.vision",
  "https://api.binance.com"
];

const memoryCache = globalThis.__welinkOnchainOverviewCache || {
  payload: null,
  expiresAt: 0
};
globalThis.__welinkOnchainOverviewCache = memoryCache;

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const now = Date.now();
  if (memoryCache.payload && memoryCache.expiresAt > now) {
    setSuccessHeaders(response, "memory");
    response.status(200).json(memoryCache.payload);
    return;
  }

  try {
    const payload = await buildOverviewPayload(memoryCache.payload);
    memoryCache.payload = payload;
    memoryCache.expiresAt = now + CACHE_TTL_MS;
    setSuccessHeaders(response, "upstream");
    response.status(200).json(payload);
  } catch (error) {
    if (memoryCache.payload) {
      const stalePayload = {
        ...memoryCache.payload,
        stale: true,
        warning: "Upstream refresh failed; serving the latest successful snapshot."
      };
      response.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=3600");
      response.setHeader("X-Welink-Cache", "stale-memory");
      response.status(200).json(stalePayload);
      return;
    }

    response.setHeader("Cache-Control", "no-store");
    response.status(502).json({
      ok: false,
      error: "Unable to load BTC overview metrics",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function setSuccessHeaders(response, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=1800");
  response.setHeader("X-Welink-Cache", cacheState);
}

async function buildOverviewPayload(previousPayload) {
  const generatedAt = new Date().toISOString();
  const tasks = await Promise.allSettled([
    fetchTicker(),
    fetchDailyCloses(),
    fetchWeeklyCloses(),
    fetchFearGreed(),
    fetchMvrv()
  ]);

  const [tickerResult, dailyResult, weeklyResult, fearGreedResult, mvrvResult] = tasks;
  const ticker = fulfilledValue(tickerResult);
  const daily = fulfilledValue(dailyResult);
  const weekly = fulfilledValue(weeklyResult);
  const fearGreed = fulfilledValue(fearGreedResult);
  const mvrv = fulfilledValue(mvrvResult);
  const previousMetrics = previousPayload?.metrics || {};
  const metrics = {};
  const sources = {};

  if (ticker) {
    metrics.price = {
      value: ticker.price,
      change24h: ticker.change24h,
      asOf: ticker.asOf,
      source: ticker.source,
      freshness: "realtime"
    };
    sources.price = ticker.source;
  } else if (previousMetrics.price) {
    metrics.price = { ...previousMetrics.price, stale: true };
    sources.price = previousMetrics.price.source;
  }

  if (ticker && daily?.points?.length >= 200) {
    const last200 = daily.points.slice(-200).map((point) => point.value).filter((value) => value > 0);
    const geometricMean200 = geometricMean(last200);
    const ageDays = Math.max((Date.now() - Date.parse("2009-01-03T00:00:00Z")) / 86_400_000, 1);
    const fittedPrice = 10 ** (5.84 * Math.log10(ageDays) - 17.01);
    const value = (ticker.price / geometricMean200) * (ticker.price / fittedPrice);
    metrics.ahr999 = {
      value,
      zone: ahrZone(value),
      asOf: generatedAt,
      source: `${daily.source} + AHR999 classic model`,
      freshness: "realtime-model",
      inputs: {
        geometricMean200,
        fittedPrice,
        sampleDays: last200.length
      }
    };
    sources.ahr999 = metrics.ahr999.source;
  } else if (previousMetrics.ahr999) {
    metrics.ahr999 = { ...previousMetrics.ahr999, stale: true };
    sources.ahr999 = previousMetrics.ahr999.source;
  }

  if (ticker && weekly?.points?.length >= 200) {
    const last200 = weekly.points.slice(-200).map((point) => point.value).filter(Number.isFinite);
    const value = arithmeticMean(last200);
    const ratio = ticker.price / value;
    metrics.wma200 = {
      value,
      ratio,
      distancePercent: (ratio - 1) * 100,
      asOf: generatedAt,
      source: `${weekly.source} · 1W × 200`,
      freshness: "realtime-model",
      sampleWeeks: last200.length
    };
    sources.wma200 = metrics.wma200.source;
  } else if (previousMetrics.wma200) {
    metrics.wma200 = { ...previousMetrics.wma200, stale: true };
    sources.wma200 = previousMetrics.wma200.source;
  }

  if (fearGreed) {
    metrics.fearGreed = {
      value: fearGreed.value,
      classification: fearGreed.classification,
      asOf: fearGreed.asOf,
      source: fearGreed.source,
      freshness: "daily"
    };
    sources.fearGreed = fearGreed.source;
  } else if (previousMetrics.fearGreed) {
    metrics.fearGreed = { ...previousMetrics.fearGreed, stale: true };
    sources.fearGreed = previousMetrics.fearGreed.source;
  }

  if (mvrv) {
    metrics.mvrv = {
      value: mvrv.value,
      zone: mvrvZone(mvrv.value),
      asOf: mvrv.asOf,
      source: mvrv.source,
      freshness: "daily"
    };
    sources.mvrv = mvrv.source;
  } else if (previousMetrics.mvrv) {
    metrics.mvrv = { ...previousMetrics.mvrv, stale: true };
    sources.mvrv = previousMetrics.mvrv.source;
  }

  const requiredMetrics = ["price", "fearGreed", "ahr999", "mvrv", "wma200"];
  const missing = requiredMetrics.filter((key) => !metrics[key]);
  if (missing.length === requiredMetrics.length) {
    const reasons = tasks
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || String(result.reason));
    throw new Error(reasons.join(" | ") || "All overview sources failed");
  }

  return {
    ok: missing.length === 0,
    partial: missing.length > 0,
    stale: Object.values(metrics).some((metric) => metric.stale),
    generatedAt,
    cacheSeconds: 60,
    missing,
    metrics,
    series: {
      price: daily?.points?.slice(-500) || previousPayload?.series?.price || [],
      fearGreed: fearGreed?.series || previousPayload?.series?.fearGreed || []
    },
    sources
  };
}

async function fetchTicker() {
  for (const origin of BINANCE_ORIGINS) {
    try {
      const payload = await fetchJson(`${origin}/api/v3/ticker/24hr?symbol=BTCUSDT`);
      const price = Number(payload.lastPrice);
      const change24h = Number(payload.priceChangePercent);
      if (Number.isFinite(price) && Number.isFinite(change24h)) {
        return {
          price,
          change24h,
          asOf: new Date(Number(payload.closeTime) || Date.now()).toISOString(),
          source: origin.includes("binance.vision") ? "Binance Market Data" : "Binance Spot"
        };
      }
    } catch (error) {
      // Continue to the next public Binance market-data origin.
    }
  }

  const payload = await fetchJson("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true");
  const bitcoin = payload.bitcoin;
  const price = Number(bitcoin?.usd);
  const change24h = Number(bitcoin?.usd_24h_change);
  if (!Number.isFinite(price) || !Number.isFinite(change24h)) throw new Error("No valid BTC ticker response");
  return {
    price,
    change24h,
    asOf: new Date(Number(bitcoin.last_updated_at) * 1000 || Date.now()).toISOString(),
    source: "CoinGecko"
  };
}

async function fetchDailyCloses() {
  const binance = await fetchBinanceKlines("1d", 500).catch(() => null);
  if (binance?.length >= 200) return { points: binance, source: "Binance Market Data" };

  const history = await fetchCoinMetricsPriceHistory();
  if (history.length < 200) throw new Error("Insufficient daily BTC history");
  return { points: history, source: "Coin Metrics Community" };
}

async function fetchWeeklyCloses() {
  const binance = await fetchBinanceKlines("1w", 200).catch(() => null);
  if (binance?.length >= 200) return { points: binance, source: "Binance Market Data" };

  const history = await fetchCoinMetricsPriceHistory();
  const weekly = [];
  for (let index = history.length - 1; index >= 0; index -= 7) {
    weekly.unshift(history[index]);
    if (weekly.length >= 200) break;
  }
  if (weekly.length < 200) throw new Error("Insufficient weekly BTC history");
  return { points: weekly, source: "Coin Metrics Community" };
}

async function fetchBinanceKlines(interval, limit) {
  for (const origin of BINANCE_ORIGINS) {
    try {
      const payload = await fetchJson(`${origin}/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`);
      const points = payload
        .map((item) => ({ date: new Date(Number(item[0])).toISOString(), value: Number(item[4]) }))
        .filter((point) => Number.isFinite(point.value) && point.value > 0);
      if (points.length) return points;
    } catch (error) {
      // Continue to the next market-data origin.
    }
  }
  throw new Error(`Binance ${interval} klines unavailable`);
}

async function fetchCoinMetricsPriceHistory() {
  const startTime = isoDate(new Date(Date.now() - 1_520 * 86_400_000));
  const endTime = isoDate(new Date());
  const url = new URL("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics");
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "PriceUSD");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", startTime);
  url.searchParams.set("end_time", endTime);
  url.searchParams.set("page_size", "2000");
  const payload = await fetchJson(url);
  return (payload.data || [])
    .map((item) => ({ date: normalizeIsoTime(item.time), value: Number(item.PriceUSD) }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0);
}

async function fetchFearGreed() {
  const payload = await fetchJson("https://api.alternative.me/fng/?limit=90&format=json");
  const latest = payload.data?.[0];
  const value = Number(latest?.value);
  if (!Number.isFinite(value)) throw new Error("Fear and Greed payload is invalid");
  return {
    value,
    classification: latest.value_classification,
    asOf: new Date(Number(latest.timestamp) * 1000).toISOString(),
    source: "Alternative.me",
    series: payload.data
      .slice()
      .reverse()
      .map((item) => ({ date: new Date(Number(item.timestamp) * 1000).toISOString(), value: Number(item.value) }))
      .filter((point) => Number.isFinite(point.value))
  };
}

async function fetchMvrv() {
  const coinMetrics = await fetchCoinMetricsMvrv().catch(() => null);
  if (coinMetrics) return coinMetrics;

  const cryptoQuant = await fetchCryptoQuantMvrv().catch(() => null);
  if (cryptoQuant) return cryptoQuant;
  throw new Error("MVRV sources are unavailable");
}

async function fetchCoinMetricsMvrv() {
  const startTime = isoDate(new Date(Date.now() - 14 * 86_400_000));
  const endTime = isoDate(new Date());
  const url = new URL("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics");
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "CapMVRVCur");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", startTime);
  url.searchParams.set("end_time", endTime);
  url.searchParams.set("page_size", "100");
  const payload = await fetchJson(url);
  const latest = (payload.data || []).filter((item) => Number.isFinite(Number(item.CapMVRVCur))).at(-1);
  if (!latest) throw new Error("Coin Metrics MVRV is empty");
  return {
    value: Number(latest.CapMVRVCur),
    asOf: normalizeIsoTime(latest.time),
    source: "Coin Metrics · CapMVRVCur"
  };
}

async function fetchCryptoQuantMvrv() {
  const apiKey = process.env.CRYPTOQUANT_API_KEY;
  if (!apiKey) throw new Error("CryptoQuant key is not configured");
  const payload = await fetchJson("https://api.cryptoquant.com/v1/btc/market-indicator/mvrv?window=day&limit=1", {
    Authorization: `Bearer ${apiKey}`
  });
  const value = findLatestNumericByKey(payload, "mvrv");
  if (!Number.isFinite(value)) throw new Error("CryptoQuant MVRV is invalid");
  return {
    value,
    asOf: new Date().toISOString(),
    source: "CryptoQuant"
  };
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${response.status} ${String(url)}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function findLatestNumericByKey(payload, keyFragment) {
  const matches = [];
  const visit = (value, key = "") => {
    if (typeof value === "number" && Number.isFinite(value) && key.toLowerCase().includes(keyFragment)) matches.push(value);
    else if (Array.isArray(value)) value.forEach((item) => visit(item, key));
    else if (value && typeof value === "object") Object.entries(value).forEach(([childKey, childValue]) => visit(childValue, childKey));
  };
  visit(payload);
  return matches.at(-1);
}

function fulfilledValue(result) {
  return result.status === "fulfilled" ? result.value : null;
}

function geometricMean(values) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function arithmeticMean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ahrZone(value) {
  if (value < 0.45) return "bottom";
  if (value <= 1.2) return "accumulation";
  if (value < 5) return "wait";
  return "overheated";
}

function mvrvZone(value) {
  if (value < 1) return "deep-value";
  if (value > 3.5) return "overheated";
  if (value > 2.5) return "warm";
  return "neutral";
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalizeIsoTime(value) {
  return String(value).replace(/\.(\d{3})\d+Z$/, ".$1Z");
}
