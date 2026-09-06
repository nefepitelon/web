import { createSupplyProfitLossProxySeries } from "./_public-model-fallback.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const THRESHOLD = 1;

const PUBLIC_SERIES = {
  price: {
    urls: [
      "https://bitcoin-data.com/api/v1/btc-price/csv",
      "https://bitcoin-data.com/v1/btc-price?size=10000"
    ],
    valueKeys: ["btcPrice", "price", "value"]
  },
  profit: {
    urls: [
      "https://bitcoin-data.com/api/v1/supply-profit/csv",
      "https://bitcoin-data.com/v1/supply-profit?size=10000"
    ],
    valueKeys: ["supplyProfitBtc", "supplyProfit", "value"]
  },
  loss: {
    urls: [
      "https://bitcoin-data.com/api/v1/supply-loss/csv",
      "https://bitcoin-data.com/v1/supply-loss?size=10000"
    ],
    valueKeys: ["supplyLossBtc", "supplyLoss", "value"]
  },
  hodlWaves: {
    urls: [
      "https://bitcoin-data.com/api/v1/hodl-waves-supply/csv",
      "https://bitcoin-data.com/v1/hodl-waves-supply?size=10000"
    ]
  }
};

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
  const cache = globalThis.__welinkSupplyProfitLossRatioCacheV1;
  const cacheTtl = cache?.payload?.estimated ? FALLBACK_CACHE_TTL_MS : CACHE_TTL_MS;
  if (cache?.payload && now - cache.savedAt < cacheTtl) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildSupplyProfitLossPayload();
    globalThis.__welinkSupplyProfitLossRatioCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && !cache.payload.estimated && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Supply profit/loss refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    const payload = buildSupplyProfitLossFallbackPayload(error);
    globalThis.__welinkSupplyProfitLossRatioCacheV1 = { savedAt: now, payload };
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

function buildSupplyProfitLossFallbackPayload(error) {
  const series = createSupplyProfitLossProxySeries();
  return {
    ok: true,
    stale: true,
    estimated: true,
    dataMode: "public-model-fallback",
    generatedAt: new Date().toISOString(),
    cacheSeconds: FALLBACK_CACHE_TTL_MS / 1000,
    cadence: "daily",
    warning: "实时公开源暂时限流，当前展示内置公开历史数据；恢复后自动切回实时源。",
    fallbackReason: (error instanceof Error ? error.message : String(error)).slice(0, 180),
    threshold: THRESHOLD,
    snapshot: calculateSupplyProfitLossSnapshot(series),
    series,
    sources: {
      price: "Embedded public BGeometrics history",
      history: "Embedded public BGeometrics supply-in-profit history",
      methodology: "Seven-day average of public supply in profit divided by supply in loss; dormant-over-seven adjustment is unavailable in fallback mode and is shown transparently as zero."
    }
  };
}

async function buildSupplyProfitLossPayload() {
  const [priceRows, profitRows, lossRows, hodlRows, livePrice] = await Promise.all([
    fetchPublicSeries(PUBLIC_SERIES.price),
    fetchPublicSeries(PUBLIC_SERIES.profit),
    fetchPublicSeries(PUBLIC_SERIES.loss),
    fetchHodlWavesSeries(PUBLIC_SERIES.hodlWaves),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const series = mergeSupplyProfitLossSeries(priceRows, profitRows, lossRows, hodlRows);
  if (series.length < 365) throw new Error("Public supply profit/loss history returned too few aligned observations");

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    threshold: THRESHOLD,
    snapshot: calculateSupplyProfitLossSnapshot(series, livePrice),
    series,
    sources: {
      price: livePrice?.source || "BGeometrics public BTC price",
      history: "BGeometrics public daily API",
      profit: PUBLIC_SERIES.profit.urls[0],
      loss: PUBLIC_SERIES.loss.urls[0],
      hodlWaves: PUBLIC_SERIES.hodlWaves.urls[0],
      methodology: "Public proxy: seven-day average of (supply in profit minus supply dormant over seven years) divided by supply in loss"
    }
  };
}

async function fetchPublicSeries(source) {
  let lastError;
  for (const url of source.urls) {
    try {
      const result = await fetchWithTimeout(url, {
        headers: {
          Accept: url.includes("/csv") ? "text/csv" : "application/hal+json, application/json",
          "User-Agent": "welinkBTC-onchain-dashboard/2.0"
        }
      });
      if (!result.ok) throw new Error(`${result.status} ${url}`);
      const contentType = String(result.headers?.get?.("content-type") || "");
      const rows = contentType.includes("json") || !url.includes("/csv")
        ? parsePublicJson(await result.json(), source.valueKeys)
        : parsePublicCsv(await result.text(), source.valueKeys);
      if (rows.length) return rows;
      throw new Error(`No usable observations from ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Public BGeometrics series unavailable");
}

async function fetchHodlWavesSeries(source) {
  let lastError;
  for (const url of source.urls) {
    try {
      const result = await fetchWithTimeout(url, {
        headers: {
          Accept: url.includes("/csv") ? "text/csv" : "application/hal+json, application/json",
          "User-Agent": "welinkBTC-onchain-dashboard/2.0"
        }
      });
      if (!result.ok) throw new Error(`${result.status} ${url}`);
      const rows = url.includes("/csv")
        ? parseHodlWavesCsv(await result.text())
        : parseHodlWavesJson(await result.json());
      if (rows.length) return rows;
      throw new Error(`No usable HODL-wave observations from ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Public HODL waves unavailable");
}

function findValueKey(headers, valueKeys) {
  const normalizedKeys = Array.isArray(valueKeys) ? valueKeys : [valueKeys];
  return normalizedKeys.find((key) => headers.includes(key)) || null;
}

function parseDate(rawDate, rawTimestamp) {
  const numericTimestamp = Number(rawTimestamp);
  const timestamp = rawDate
    ? Date.parse(`${rawDate}T00:00:00Z`)
    : numericTimestamp < 10_000_000_000 ? numericTimestamp * 1000 : numericTimestamp;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function parsePublicCsv(csv, valueKeys) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const valueKey = findValueKey(headers, valueKeys);
  const valueIndex = valueKey ? headers.indexOf(valueKey) : -1;
  if (valueIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const date = parseDate(dateIndex >= 0 ? values[dateIndex] : "", timestampIndex >= 0 ? values[timestampIndex] : "");
    const value = Number(values[valueIndex]);
    if (!date || !Number.isFinite(value) || value < 0) return null;
    return { date, value };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function parsePublicJson(payload, valueKeys) {
  const embedded = payload?._embedded;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.content)
      ? payload.content
      : embedded && typeof embedded === "object"
        ? Object.values(embedded).find(Array.isArray) || []
        : payload && typeof payload === "object" && (payload.d || payload.unixTs)
          ? [payload]
          : [];
  if (!rows.length) return [];
  const valueKey = findValueKey(Object.keys(rows[0] || {}), valueKeys);
  if (!valueKey) return [];

  return rows.map((row) => {
    const date = parseDate(row.d, row.unixTs);
    const value = Number(row[valueKey]);
    if (!date || !Number.isFinite(value) || value < 0) return null;
    return { date, value };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function parseHodlWavesCsv(csv) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const sevenToTenIndex = headers.indexOf("age_7y_10y");
  const tenPlusIndex = headers.indexOf("age_10y");
  if (sevenToTenIndex < 0 || tenPlusIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const date = parseDate(dateIndex >= 0 ? values[dateIndex] : "", timestampIndex >= 0 ? values[timestampIndex] : "");
    const sevenToTen = Number(values[sevenToTenIndex]);
    const tenPlus = Number(values[tenPlusIndex]);
    if (!date || !Number.isFinite(sevenToTen) || !Number.isFinite(tenPlus) || sevenToTen < 0 || tenPlus < 0) return null;
    return { date, sevenToTen, tenPlus, dormantOverSeven: sevenToTen + tenPlus };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function parseHodlWavesJson(payload) {
  const embedded = payload?._embedded;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.content)
      ? payload.content
      : embedded && typeof embedded === "object"
        ? Object.values(embedded).find(Array.isArray) || []
        : payload && typeof payload === "object" && (payload.d || payload.unixTs)
          ? [payload]
          : [];
  return rows.map((row) => {
    const date = parseDate(row.d, row.unixTs);
    const sevenToTen = Number(row.age_7y_10y);
    const tenPlus = Number(row.age_10y);
    if (!date || !Number.isFinite(sevenToTen) || !Number.isFinite(tenPlus) || sevenToTen < 0 || tenPlus < 0) return null;
    return { date, sevenToTen, tenPlus, dormantOverSeven: sevenToTen + tenPlus };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function mergeSupplyProfitLossSeries(priceRows, profitRows, lossRows, hodlRows) {
  const priceByDate = new Map(priceRows.map((row) => [row.date, row.value]));
  const lossByDate = new Map(lossRows.map((row) => [row.date, row.value]));
  const hodlByDate = new Map(hodlRows.map((row) => [row.date, row]));
  const rawRows = profitRows.map((row) => {
    const price = priceByDate.get(row.date);
    const lossSupply = lossByDate.get(row.date);
    const hodl = hodlByDate.get(row.date);
    if (![price, row.value, lossSupply, hodl?.dormantOverSeven].every(Number.isFinite) || price <= 0 || lossSupply <= 0) return null;
    const activeProfitSupply = Math.max(0, row.value - hodl.dormantOverSeven);
    const activeSupply = activeProfitSupply + lossSupply;
    if (activeSupply <= 0) return null;
    return {
      date: row.date,
      price,
      ratioRaw: activeProfitSupply / lossSupply,
      activeProfitSupply,
      lossSupply,
      dormantOverSeven: hodl.dormantOverSeven,
      activeSupply
    };
  }).filter(Boolean);

  return rawRows.map((row, index) => {
    if (index < 6) return null;
    const window = rawRows.slice(index - 6, index + 1);
    const ratio = window.reduce((sum, point) => sum + point.ratioRaw, 0) / window.length;
    return { ...row, ratio };
  }).filter(Boolean);
}

function calculateSupplyProfitLossSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.ratio, 0) / Math.max(rows.length, 1);
  };
  const average7 = average(7);
  const average30 = average(30);
  const sevenDayStart = series.at(-Math.min(8, series.length));
  const dailyChange = (latest.ratio - sevenDayStart.ratio) / Math.max(Math.min(7, series.length - 1), 1);
  const trend = dailyChange > 0.01 ? "rising" : dailyChange < -0.01 ? "falling" : "flat";
  const phase = latest.ratio < THRESHOLD
    ? "bottom"
    : latest.ratio < 2
      ? "recovery"
      : latest.ratio < 4
        ? "balanced"
        : "healthy";
  const profitShare = latest.ratio / (1 + latest.ratio) * 100;
  const daysBelowOne = [...series].reverse().findIndex((row) => row.ratio >= THRESHOLD);

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    ratio: latest.ratio,
    rawRatio: latest.ratioRaw,
    average7,
    average30,
    dailyChange,
    trend,
    phase,
    threshold: THRESHOLD,
    distanceToThreshold: latest.ratio - THRESHOLD,
    profitShare,
    lossShare: 100 - profitShare,
    activeProfitSupply: latest.activeProfitSupply,
    lossSupply: latest.lossSupply,
    dormantOverSeven: latest.dormantOverSeven,
    daysBelowOne: daysBelowOne < 0 ? series.length : daysBelowOne
  };
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
  buildSupplyProfitLossPayload,
  calculateSupplyProfitLossSnapshot,
  mergeSupplyProfitLossSeries,
  parseHodlWavesCsv,
  parseHodlWavesJson,
  parsePublicCsv,
  parsePublicJson
};
