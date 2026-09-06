import { PERCENT_SUPPLY_PROFIT_SEED } from "../data/percent-supply-profit-seed.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const BOTTOM_THRESHOLD = 50;
const TOP_THRESHOLD = 95;

const WELINK_PUBLIC_CACHE_URL = "https://welinkbtc-main.vercel.app/api/supply-profit-loss-ratio?schema=1";

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
  }
};

const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

const RESEARCH_WINDOWS = [
  { label: "2015", start: "2014-01-01", end: "2016-12-31", referencePercent: 36 },
  { label: "2019", start: "2018-01-01", end: "2020-12-31", referencePercent: 39 },
  { label: "2022–23", start: "2022-01-01", end: "2023-12-31", referencePercent: 45 },
  { label: "Current", start: "2024-01-01", end: "2099-12-31", referencePercent: 46, referencePrice: 57_800 }
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
  const cache = globalThis.__welinkPercentSupplyProfitCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildPercentSupplyProfitPayload();
    globalThis.__welinkPercentSupplyProfitCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Percent Supply in Profit refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load BTC Percent Supply in Profit",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildPercentSupplyProfitPayload() {
  let series;
  let historySource;
  let warning;

  try {
    series = await fetchWelinkPublicCacheSeries();
    historySource = "welinkBTC cached BGeometrics public daily API";
  } catch (cacheError) {
    try {
      const priceRows = await fetchPublicSeries(PUBLIC_SERIES.price);
      const profitRows = await fetchPublicSeries(PUBLIC_SERIES.profit);
      const lossRows = await fetchPublicSeries(PUBLIC_SERIES.loss);
      series = mergePercentSupplyProfitSeries(priceRows, profitRows, lossRows);
      historySource = "BGeometrics public daily API";
    } catch (publicError) {
      series = buildSeedSeries();
      historySource = "welinkBTC public-data snapshot";
      warning = "The public provider is temporarily rate-limited; the latest verified daily history is being served.";
    }
  }

  if (series.length < 365) throw new Error("Public Percent Supply in Profit history returned too few aligned observations");
  const livePrice = await fetchLiveBtcPrice().catch(() => null);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    ...(warning ? { warning } : {}),
    thresholds: { bottom: BOTTOM_THRESHOLD, top: TOP_THRESHOLD },
    snapshot: calculatePercentSupplyProfitSnapshot(series, livePrice),
    historicalLows: calculateHistoricalLows(series),
    researchWindows: RESEARCH_WINDOWS,
    series,
    sources: {
      price: livePrice?.source || "BGeometrics public BTC price",
      history: historySource,
      profit: PUBLIC_SERIES.profit.urls[0],
      loss: PUBLIC_SERIES.loss.urls[0],
      definition: "https://docs.glassnode.com/guides-and-tutorials/metric-guides/profit-loss-supply/percent-supply-in-profit",
      methodology: "100 × public supply in profit / (public supply in profit + public supply in loss)"
    }
  };
}

async function fetchWelinkPublicCacheSeries() {
  const result = await fetchWithTimeout(WELINK_PUBLIC_CACHE_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "welinkBTC-onchain-dashboard/2.0"
    },
    timeoutMs: 12_000
  });
  if (!result.ok) throw new Error(`${result.status} ${WELINK_PUBLIC_CACHE_URL}`);
  const payload = await result.json();
  const rows = Array.isArray(payload?.series) ? payload.series : [];
  const series = rows.map((row) => {
    const date = String(row?.date || "");
    const price = Number(row?.price);
    const profitSupply = Number(row?.activeProfitSupply) + Number(row?.dormantOverSeven);
    const lossSupply = Number(row?.lossSupply);
    return createPercentSupplyProfitRow(date, price, profitSupply, lossSupply);
  }).filter(Boolean);
  if (series.length < 365) throw new Error("welinkBTC public cache returned too few observations");
  return series;
}

function buildSeedSeries() {
  return PERCENT_SUPPLY_PROFIT_SEED.map(([date, price, profitSupply, lossSupply]) => (
    createPercentSupplyProfitRow(date, price, profitSupply, lossSupply)
  )).filter(Boolean);
}

function createPercentSupplyProfitRow(date, price, profitSupply, lossSupply) {
  const totalSupply = profitSupply + lossSupply;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || ![price, profitSupply, lossSupply, totalSupply].every(Number.isFinite)
    || price <= 0
    || profitSupply < 0
    || lossSupply < 0
    || totalSupply <= 0) return null;
  return {
    date,
    price,
    percent: profitSupply / totalSupply * 100,
    profitSupply,
    lossSupply,
    totalSupply
  };
}

function mergePercentSupplyProfitSeries(priceRows, profitRows, lossRows) {
  const priceByDate = new Map(priceRows.map((row) => [row.date, row.value]));
  const lossByDate = new Map(lossRows.map((row) => [row.date, row.value]));

  return profitRows.map((row) => {
    const price = priceByDate.get(row.date);
    const lossSupply = lossByDate.get(row.date);
    return createPercentSupplyProfitRow(row.date, price, row.value, lossSupply);
  }).filter(Boolean);
}

function calculatePercentSupplyProfitSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.percent, 0) / Math.max(rows.length, 1);
  };
  const average7 = average(7);
  const average30 = average(30);
  const sevenDayStart = series.at(-Math.min(8, series.length));
  const sevenDayChange = latest.percent - sevenDayStart.percent;
  const trend = sevenDayChange > 0.4 ? "rising" : sevenDayChange < -0.4 ? "falling" : "flat";
  const zone = latest.percent < BOTTOM_THRESHOLD
    ? "flush"
    : latest.percent < 65
      ? "recovery"
      : latest.percent < TOP_THRESHOLD
        ? "balanced"
        : "overheated";

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    percent: latest.percent,
    average7,
    average30,
    sevenDayChange,
    trend,
    zone,
    bottomThreshold: BOTTOM_THRESHOLD,
    topThreshold: TOP_THRESHOLD,
    distanceToBottom: latest.percent - BOTTOM_THRESHOLD,
    distanceToTop: latest.percent - TOP_THRESHOLD,
    profitSupply: latest.profitSupply,
    lossSupply: latest.lossSupply,
    totalSupply: latest.totalSupply
  };
}

function calculateHistoricalLows(series, windows = RESEARCH_WINDOWS) {
  return windows.map((window) => {
    const rows = series.filter((row) => row.date >= window.start && row.date <= window.end);
    const low = rows.reduce((result, row) => !result || row.percent < result.percent ? row : result, null);
    return low ? {
      label: window.label,
      date: low.date,
      percent: low.percent,
      price: low.price,
      referencePercent: window.referencePercent,
      referencePrice: window.referencePrice || null
    } : null;
  }).filter(Boolean);
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

function findValueKey(headers, valueKeys) {
  return valueKeys.find((key) => headers.includes(key)) || null;
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
  buildPercentSupplyProfitPayload,
  buildSeedSeries,
  calculateHistoricalLows,
  calculatePercentSupplyProfitSnapshot,
  createPercentSupplyProfitRow,
  fetchWelinkPublicCacheSeries,
  mergePercentSupplyProfitSeries,
  parsePublicCsv,
  parsePublicJson
};
