import { createRhodlProxySeries } from "./_public-model-fallback.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const ACCUMULATION_THRESHOLD = 350;
const ELEVATED_THRESHOLD = 10_000;
const OVERHEATED_THRESHOLD = 50_000;

const BGEOMETRICS_RHODL_URL = "https://api.bgeometrics.com/v1/rhodl-ratio/csv";
const BGEOMETRICS_RHODL_FALLBACK_URL = "https://bitcoin-data.com/v1/rhodl-ratio/csv";
const BGEOMETRICS_PRICE_URL = "https://bitcoin-data.com/v1/btc-price/csv";
const COIN_METRICS_PRICE_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

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
  const cache = globalThis.__welinkRhodlRatioCacheV1;
  const cacheTtl = cache?.payload?.estimated ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
  if (cache?.payload && now - cache.savedAt < cacheTtl) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildRhodlPayload();
    globalThis.__welinkRhodlRatioCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && !cache.payload.estimated && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "RHODL refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    const payload = buildRhodlFallbackPayload(error);
    globalThis.__welinkRhodlRatioCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MODEL");
  }
}

function sendPayload(response, payload, cacheState) {
  const cacheControl = payload.estimated
    ? "public, s-maxage=900, stale-while-revalidate=86400"
    : "public, s-maxage=43200, stale-while-revalidate=604800";
  response.setHeader("Cache-Control", cacheControl);
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

function buildRhodlFallbackPayload(error) {
  const series = createRhodlProxySeries();
  return {
    ok: true,
    stale: true,
    estimated: true,
    dataMode: "public-model-fallback",
    generatedAt: new Date().toISOString(),
    cacheSeconds: FALLBACK_CACHE_TTL_MS / 1000,
    cadence: "daily",
    warning: "实时公开源暂时限流，当前展示内置公开历史模型；恢复后自动切回实时源。",
    fallbackReason: (error instanceof Error ? error.message : String(error)).slice(0, 180),
    thresholds: {
      accumulation: ACCUMULATION_THRESHOLD,
      elevated: ELEVATED_THRESHOLD,
      overheated: OVERHEATED_THRESHOLD
    },
    snapshot: calculateRhodlSnapshot(series),
    cyclePeaks: detectCyclePeaks(series),
    series,
    sources: {
      price: "Embedded public BGeometrics history",
      history: "Embedded public BGeometrics history model",
      methodology: "Transparent estimated proxy derived from public BTC price history; not a replacement for entity-adjusted RHODL data."
    }
  };
}

async function buildRhodlPayload() {
  const [rhodlRows, priceRows] = await Promise.all([
    fetchRhodlHistory(),
    fetchCoinMetricsPriceHistory().catch(() => fetchBgeometricsPriceHistory())
  ]);
  const series = mergeRhodlAndPrice(rhodlRows, priceRows);
  if (series.length < 365) throw new Error("Public RHODL history returned too few observations");

  const livePrice = await fetchLiveBtcPrice().catch(() => null);
  const snapshot = calculateRhodlSnapshot(series, livePrice);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    thresholds: {
      accumulation: ACCUMULATION_THRESHOLD,
      elevated: ELEVATED_THRESHOLD,
      overheated: OVERHEATED_THRESHOLD
    },
    snapshot,
    cyclePeaks: detectCyclePeaks(series),
    series,
    sources: {
      price: livePrice?.source || "BGeometrics public daily API",
      history: "BGeometrics public daily API",
      primary: BGEOMETRICS_RHODL_URL,
      priceHistory: COIN_METRICS_PRICE_URL,
      methodology: "(1-week realized cap x days since genesis) / 1-to-2-year realized cap"
    }
  };
}

async function fetchRhodlHistory() {
  let lastError;
  for (const url of [BGEOMETRICS_RHODL_URL, BGEOMETRICS_RHODL_FALLBACK_URL]) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
      });
      if (!response.ok) throw new Error(`BGeometrics RHODL ${response.status}`);
      const rows = parseRhodlCsv(await response.text());
      if (rows.length < 365) throw new Error("BGeometrics RHODL history is incomplete");
      return rows;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("BGeometrics RHODL feed unavailable");
}

async function fetchCoinMetricsPriceHistory() {
  const url = new URL(COIN_METRICS_PRICE_URL);
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "PriceUSD");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", "2011-10-13");
  url.searchParams.set("end_time", new Date().toISOString().slice(0, 10));
  url.searchParams.set("page_size", "10000");
  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!response.ok) throw new Error(`Coin Metrics PriceUSD ${response.status}`);
  const payload = await response.json();
  const rows = (payload?.data || []).map((row) => {
    const date = String(row?.time || "").slice(0, 10);
    const value = Number(row?.PriceUSD);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && value > 0 ? { date, value } : null;
  }).filter(Boolean);
  if (rows.length < 365) throw new Error("Coin Metrics price history is incomplete");
  return rows;
}

async function fetchBgeometricsPriceHistory() {
  const response = await fetchWithTimeout(BGEOMETRICS_PRICE_URL, {
    headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!response.ok) throw new Error(`BGeometrics PriceUSD ${response.status}`);
  return parseSingleValueCsv(await response.text(), ["btcPrice", "price", "value"]);
}

function parseRhodlCsv(csv) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const ratioIndex = headers.findIndex((key) => ["rhodlRatio", "rhodl", "value"].includes(key));
  const averageIndex = headers.findIndex((key) => ["rhodl1m", "rhodl30d", "average30"].includes(key));
  if (ratioIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const date = parseCsvDate(values, dateIndex, timestampIndex);
    const rhodl = Number(values[ratioIndex]);
    const rhodl1m = Number(averageIndex >= 0 ? values[averageIndex] : NaN);
    if (!date || !Number.isFinite(rhodl) || rhodl <= 0) return null;
    return { date, rhodl, rhodl1m: Number.isFinite(rhodl1m) && rhodl1m > 0 ? rhodl1m : null };
  }).filter(Boolean);
}

function parseSingleValueCsv(csv, valueKeys) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const valueIndex = headers.findIndex((key) => valueKeys.includes(key));
  if (valueIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const date = parseCsvDate(values, dateIndex, timestampIndex);
    const value = Number(values[valueIndex]);
    return date && Number.isFinite(value) && value > 0 ? { date, value } : null;
  }).filter(Boolean);
}

function parseCsvDate(values, dateIndex, timestampIndex) {
  const rawDate = dateIndex >= 0 ? values[dateIndex] : "";
  const rawTimestamp = Number(timestampIndex >= 0 ? values[timestampIndex] : NaN);
  const milliseconds = rawDate
    ? Date.parse(`${rawDate}T00:00:00Z`)
    : rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString().slice(0, 10) : null;
}

function mergeRhodlAndPrice(rhodlRows, priceRows) {
  const priceByDate = new Map(priceRows.map((row) => [row.date, row.value]));
  return rhodlRows.map((row) => {
    const price = priceByDate.get(row.date);
    return Number.isFinite(price) && price > 0 ? { ...row, price } : null;
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function classifyRhodl(value) {
  if (value < ACCUMULATION_THRESHOLD) return "accumulation";
  if (value < ELEVATED_THRESHOLD) return "normal";
  if (value < OVERHEATED_THRESHOLD) return "elevated";
  return "overheated";
}

function calculateRhodlSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.rhodl, 0) / Math.max(rows.length, 1);
  };
  const average7 = average(7);
  const average30 = average(30);
  const trendRatio = average30 > 0 ? average7 / average30 : 1;
  const trend = trendRatio > 1.03 ? "rising" : trendRatio < 0.97 ? "falling" : "flat";
  const allTimePeak = series.reduce((highest, row) => row.rhodl > highest.rhodl ? row : highest, series[0]);

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    rhodl: latest.rhodl,
    rhodl1m: latest.rhodl1m || average30,
    average7,
    average30,
    trend,
    sevenDayChange: latest.rhodl - (series.at(-Math.min(8, series.length))?.rhodl || latest.rhodl),
    zone: classifyRhodl(latest.rhodl),
    allTimePeak: allTimePeak.rhodl,
    allTimePeakDate: allTimePeak.date
  };
}

function detectCyclePeaks(series, years = [2013, 2017, 2021, 2025]) {
  return years.map((year) => {
    const rows = series.filter((row) => row.date.startsWith(`${year}-`));
    if (!rows.length) return { year, value: null, date: null, price: null };
    const peak = rows.reduce((highest, row) => row.rhodl > highest.rhodl ? row : highest, rows[0]);
    return { year, value: peak.rhodl, date: peak.date, price: peak.price };
  });
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" }, timeoutMs: 7_000 });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const payload = await response.json();
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const { timeoutMs, ...fetchOptions } = options;
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export {
  buildRhodlPayload,
  calculateRhodlSnapshot,
  classifyRhodl,
  detectCyclePeaks,
  mergeRhodlAndPrice,
  parseRhodlCsv
};
