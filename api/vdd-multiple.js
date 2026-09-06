import { createVddProxySeries } from "./_public-model-fallback.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const LOW_THRESHOLD = 0.75;
const HIGH_THRESHOLD = 2.9;

const BGEOMETRICS_VDD_URL = "https://api.bgeometrics.com/v1/vdd-multiple/csv";
const BGEOMETRICS_VDD_FALLBACK_URL = "https://bitcoin-data.com/v1/vdd-multiple/csv";
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
  const cache = globalThis.__welinkVddMultipleCacheV1;
  const cacheTtl = cache?.payload?.estimated ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
  if (cache?.payload && now - cache.savedAt < cacheTtl) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildVddPayload();
    globalThis.__welinkVddMultipleCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && !cache.payload.estimated && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "VDD refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    const payload = buildVddFallbackPayload(error);
    globalThis.__welinkVddMultipleCacheV1 = { savedAt: now, payload };
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

function buildVddFallbackPayload(error) {
  const series = createVddProxySeries();
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
    thresholds: { low: LOW_THRESHOLD, high: HIGH_THRESHOLD },
    snapshot: calculateVddSnapshot(series),
    lowZones: detectLowZones(series),
    series,
    sources: {
      price: "Embedded public BGeometrics history",
      history: "Embedded public BGeometrics history model",
      methodology: "Transparent estimated proxy derived from public BTC price volatility and its 365-day basis; not a replacement for coin-days-destroyed data."
    }
  };
}

async function buildVddPayload() {
  const [vddRows, priceRows] = await Promise.all([
    fetchBgeometricsVddHistory(),
    fetchCoinMetricsPriceHistory().catch(() => fetchBgeometricsPriceHistory())
  ]);
  const series = mergeVddAndPrice(
    vddRows,
    priceRows
  );
  if (series.length < 365) throw new Error("Public VDD history returned too few observations");

  const livePrice = await fetchLiveBtcPrice().catch(() => null);
  const snapshot = calculateVddSnapshot(series, livePrice);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    thresholds: { low: LOW_THRESHOLD, high: HIGH_THRESHOLD },
    snapshot,
    lowZones: detectLowZones(series),
    series,
    sources: {
      price: livePrice?.source || "BGeometrics public daily API",
      history: "BGeometrics public daily API",
      primary: BGEOMETRICS_VDD_URL,
      priceHistory: COIN_METRICS_PRICE_URL,
      methodology: "Daily Value Days Destroyed divided by its trailing 365-day average"
    }
  };
}

async function fetchBgeometricsVddHistory() {
  let lastError;
  for (const url of [BGEOMETRICS_VDD_URL, BGEOMETRICS_VDD_FALLBACK_URL]) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
      });
      if (!response.ok) throw new Error(`BGeometrics VDD ${response.status}`);
      const rows = parsePublicCsv(await response.text(), ["vddMultiple", "value"]);
      if (rows.length < 365) throw new Error("BGeometrics VDD history is incomplete");
      return rows;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("BGeometrics VDD feed unavailable");
}

async function fetchCoinMetricsPriceHistory() {
  const url = new URL(COIN_METRICS_PRICE_URL);
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "PriceUSD");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", "2010-08-18");
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
  return parsePublicCsv(await response.text(), ["btcPrice", "price", "value"]);
}

function parsePublicCsv(csv, valueKeys) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const valueKey = valueKeys.find((key) => headers.includes(key));
  const valueIndex = valueKey ? headers.indexOf(valueKey) : -1;
  if (valueIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const rawDate = dateIndex >= 0 ? values[dateIndex] : "";
    const rawTimestamp = Number(timestampIndex >= 0 ? values[timestampIndex] : NaN);
    const milliseconds = rawDate
      ? Date.parse(`${rawDate}T00:00:00Z`)
      : rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
    const value = Number(values[valueIndex]);
    if (!Number.isFinite(milliseconds) || !Number.isFinite(value) || value < 0) return null;
    return { date: new Date(milliseconds).toISOString().slice(0, 10), value };
  }).filter(Boolean);
}

function mergeVddAndPrice(vddRows, priceRows) {
  const priceByDate = new Map(priceRows.map((row) => [row.date, row.value]));
  return [...new Map(vddRows.map((row) => {
    const price = priceByDate.get(row.date);
    if (!Number.isFinite(price) || price <= 0) return null;
    return [row.date, { date: row.date, price, vdd: row.value }];
  }).filter(Boolean)).values()].sort((left, right) => left.date.localeCompare(right.date));
}

function calculateVddSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.vdd, 0) / Math.max(rows.length, 1);
  };
  const sevenDayStart = series.at(-Math.min(8, series.length));
  const sevenDayChange = latest.vdd - sevenDayStart.vdd;
  const trend = sevenDayChange > 0.04 ? "rising" : sevenDayChange < -0.04 ? "falling" : "flat";
  const recentRows = series.slice(-30);
  const recentLow = recentRows.reduce((lowest, row) => row.vdd < lowest.vdd ? row : lowest, recentRows[0]);
  const allTimePeak = series.reduce((highest, row) => row.vdd > highest.vdd ? row : highest, series[0]);
  const zone = latest.vdd < LOW_THRESHOLD ? "accumulation" : latest.vdd > HIGH_THRESHOLD ? "distribution" : "normal";

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    vdd: latest.vdd,
    average7: average(7),
    average30: average(30),
    sevenDayChange,
    trend,
    zone,
    recentLow: recentLow.vdd,
    recentLowDate: recentLow.date,
    allTimePeak: allTimePeak.vdd,
    allTimePeakDate: allTimePeak.date,
    distanceToLow: latest.vdd - LOW_THRESHOLD,
    distanceToHigh: HIGH_THRESHOLD - latest.vdd
  };
}

function detectLowZones(series, threshold = LOW_THRESHOLD) {
  const periods = [];
  let active = null;
  series.forEach((row) => {
    if (row.vdd < threshold) {
      if (!active) active = { start: row.date, end: row.date, days: 0, minVdd: row.vdd, minDate: row.date, minPrice: row.price };
      active.end = row.date;
      active.days += 1;
      if (row.vdd < active.minVdd) {
        active.minVdd = row.vdd;
        active.minDate = row.date;
        active.minPrice = row.price;
      }
    } else if (active) {
      periods.push(active);
      active = null;
    }
  });
  if (active) periods.push(active);
  return periods.filter((period) => period.days >= 2).slice(-12);
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const result = await fetchWithTimeout(url, { headers: { Accept: "application/json" }, timeoutMs: 7_000 });
      if (!result.ok) throw new Error(`${result.status} ${url}`);
      const payload = await result.json();
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
  buildVddPayload,
  calculateVddSnapshot,
  detectLowZones,
  mergeVddAndPrice,
  parsePublicCsv
};
