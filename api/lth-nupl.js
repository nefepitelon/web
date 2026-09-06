import { createLthNuplProxySeries } from "./_public-model-fallback.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;

const BGEOMETRICS_LTH_NUPL_URL = "https://api.bgeometrics.com/v1/nupl-lth/csv";
const BGEOMETRICS_LTH_NUPL_FALLBACK_URL = "https://bitcoin-data.com/v1/nupl-lth/csv";
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
  const cache = globalThis.__welinkLthNuplCacheV1;
  const cacheTtl = cache?.payload?.estimated ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
  if (cache?.payload && now - cache.savedAt < cacheTtl) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildLthNuplPayload();
    globalThis.__welinkLthNuplCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && !cache.payload.estimated && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "LTH-NUPL refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    const payload = buildLthNuplFallbackPayload(error);
    globalThis.__welinkLthNuplCacheV1 = { savedAt: now, payload };
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

function buildLthNuplFallbackPayload(error) {
  const series = createLthNuplProxySeries();
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
    thresholds: { capitulation: 0, fear: 0.25, hope: 0.5, optimism: 0.75 },
    snapshot: calculateLthNuplSnapshot(series),
    stressZones: detectStressZones(series),
    referencePattern: {
      historicalLeftDays: 62,
      historicalRightDays: 192,
      comparisonLeftDays: 63,
      projectedCompletion: "2026-09-17",
      classification: "research-hypothesis"
    },
    series,
    sources: {
      price: "Embedded public BGeometrics history",
      history: "Embedded public BGeometrics history model",
      methodology: "Transparent estimated proxy derived from public BTC price and a long-term cost basis; not a replacement for entity-adjusted LTH-NUPL."
    }
  };
}

async function buildLthNuplPayload() {
  const [nuplRows, priceRows] = await Promise.all([
    fetchBgeometricsLthNuplHistory(),
    fetchCoinMetricsPriceHistory().catch(() => fetchBgeometricsPriceHistory())
  ]);
  const series = mergeLthNuplAndPrice(nuplRows, priceRows);
  if (series.length < 365) throw new Error("Public LTH-NUPL history returned too few observations");

  const livePrice = await fetchLiveBtcPrice().catch(() => null);
  const snapshot = calculateLthNuplSnapshot(series, livePrice);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    thresholds: { capitulation: 0, fear: 0.25, hope: 0.5, optimism: 0.75 },
    snapshot,
    stressZones: detectStressZones(series),
    referencePattern: {
      historicalLeftDays: 62,
      historicalRightDays: 192,
      comparisonLeftDays: 63,
      projectedCompletion: "2026-09-17",
      classification: "research-hypothesis"
    },
    series,
    sources: {
      price: livePrice?.source || "Coin Metrics Community PriceUSD",
      history: "BGeometrics public daily LTH-NUPL",
      primary: BGEOMETRICS_LTH_NUPL_URL,
      priceHistory: COIN_METRICS_PRICE_URL,
      methodology: "Public UTXO-age LTH-NUPL proxy; not Glassnode entity-cluster-adjusted history",
      entityAdjustedReference: "Glassnode nupl_more_155_account_based"
    }
  };
}

async function fetchBgeometricsLthNuplHistory() {
  let lastError;
  for (const url of [BGEOMETRICS_LTH_NUPL_URL, BGEOMETRICS_LTH_NUPL_FALLBACK_URL]) {
    try {
      const result = await fetchWithTimeout(url, {
        headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
      });
      if (!result.ok) throw new Error(`BGeometrics LTH-NUPL ${result.status}`);
      const rows = parsePublicCsv(await result.text(), ["nuplLth", "value"]);
      if (rows.length < 365) throw new Error("BGeometrics LTH-NUPL history is incomplete");
      return rows;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("BGeometrics LTH-NUPL feed unavailable");
}

async function fetchCoinMetricsPriceHistory() {
  const url = new URL(COIN_METRICS_PRICE_URL);
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "PriceUSD");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", "2010-08-18");
  url.searchParams.set("end_time", new Date().toISOString().slice(0, 10));
  url.searchParams.set("page_size", "10000");
  const result = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!result.ok) throw new Error(`Coin Metrics PriceUSD ${result.status}`);
  const payload = await result.json();
  const rows = (payload?.data || []).map((row) => {
    const date = String(row?.time || "").slice(0, 10);
    const value = Number(row?.PriceUSD);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && value > 0 ? { date, value } : null;
  }).filter(Boolean);
  if (rows.length < 365) throw new Error("Coin Metrics price history is incomplete");
  return rows;
}

async function fetchBgeometricsPriceHistory() {
  const result = await fetchWithTimeout(BGEOMETRICS_PRICE_URL, {
    headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!result.ok) throw new Error(`BGeometrics PriceUSD ${result.status}`);
  return parsePublicCsv(await result.text(), ["btcPrice", "price", "value"]);
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
    if (!Number.isFinite(milliseconds) || !Number.isFinite(value)) return null;
    return { date: new Date(milliseconds).toISOString().slice(0, 10), value };
  }).filter(Boolean);
}

function mergeLthNuplAndPrice(nuplRows, priceRows) {
  const priceByDate = new Map(priceRows.map((row) => [row.date, row.value]));
  return [...new Map(nuplRows.map((row) => {
    const price = priceByDate.get(row.date);
    if (!Number.isFinite(price) || price <= 0) return null;
    return [row.date, { date: row.date, price, nupl: row.value }];
  }).filter(Boolean)).values()].sort((left, right) => left.date.localeCompare(right.date));
}

function classifyLthNupl(value) {
  if (value < 0) return "capitulation";
  if (value < 0.25) return "fear";
  if (value < 0.5) return "hope";
  if (value < 0.75) return "optimism";
  return "euphoria";
}

function calculateLthNuplSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.nupl, 0) / Math.max(rows.length, 1);
  };
  const compare = (days) => latest.nupl - series.at(-Math.min(days + 1, series.length)).nupl;
  const sevenDayChange = compare(7);
  const thirtyDayChange = compare(30);
  const trendFor = (change) => change > 0.005 ? "rising" : change < -0.005 ? "falling" : "flat";
  const recentRows = series.slice(-30);
  const recentLow = recentRows.reduce((lowest, row) => row.nupl < lowest.nupl ? row : lowest, recentRows[0]);
  const stressZones = detectStressZones(series);
  const currentStressZone = stressZones.at(-1)?.active ? stressZones.at(-1) : null;

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    nupl: latest.nupl,
    average7: average(7),
    average30: average(30),
    sevenDayChange,
    thirtyDayChange,
    trend7: trendFor(sevenDayChange),
    trend30: trendFor(thirtyDayChange),
    zone: classifyLthNupl(latest.nupl),
    recentLow: recentLow.nupl,
    recentLowDate: recentLow.date,
    currentStressDays: currentStressZone?.days || 0,
    distanceToHope: latest.nupl - 0.25
  };
}

function detectStressZones(series, threshold = 0.25) {
  const periods = [];
  let active = null;
  series.forEach((row, index) => {
    if (row.nupl < threshold) {
      if (!active) active = { start: row.date, end: row.date, days: 0, minNupl: row.nupl, minDate: row.date, minPrice: row.price, active: false };
      active.end = row.date;
      active.days += 1;
      active.active = index === series.length - 1;
      if (row.nupl < active.minNupl) {
        active.minNupl = row.nupl;
        active.minDate = row.date;
        active.minPrice = row.price;
      }
    } else if (active) {
      active.active = false;
      periods.push(active);
      active = null;
    }
  });
  if (active) periods.push(active);
  return periods.filter((period) => period.days >= 3).slice(-16);
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
  buildLthNuplPayload,
  calculateLthNuplSnapshot,
  classifyLthNupl,
  detectStressZones,
  mergeLthNuplAndPrice,
  parsePublicCsv
};
