const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;
const THRESHOLD = 0.48;

const PUBLIC_SERIES = {
  price: {
    url: "https://bitcoin-data.com/api/v1/btc-price/csv",
    valueKey: "btcPrice"
  },
  lth: {
    url: "https://bitcoin-data.com/api/v1/realized-price-lth/csv",
    valueKey: "realizedPriceLth"
  },
  sth: {
    url: "https://bitcoin-data.com/api/v1/realized-price-sth/csv",
    valueKey: "realizedPriceSth"
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
  const cache = globalThis.__welinkLthSthRatioCache;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildLthSthPayload();
    globalThis.__welinkLthSthRatioCache = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "LTH/STH ratio refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load BTC LTH/STH cost-basis ratio",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildLthSthPayload() {
  const [priceRows, lthRows, sthRows, livePrice] = await Promise.all([
    fetchPublicCsv(PUBLIC_SERIES.price),
    fetchPublicCsv(PUBLIC_SERIES.lth),
    fetchPublicCsv(PUBLIC_SERIES.sth),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const series = mergeLthSthSeries(priceRows, lthRows, sthRows);
  if (series.length < 365) throw new Error("Public LTH/STH history returned too few aligned observations");

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    threshold: THRESHOLD,
    snapshot: calculateLthSthSnapshot(series, livePrice),
    series,
    sources: {
      price: livePrice?.source || "BGeometrics public BTC price",
      history: "BGeometrics public daily API",
      lth: PUBLIC_SERIES.lth.url,
      sth: PUBLIC_SERIES.sth.url,
      methodology: "LTH Realized Price / STH Realized Price"
    }
  };
}

async function fetchPublicCsv(source) {
  const response = await fetchWithTimeout(source.url, {
    headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/1.0" }
  });
  if (!response.ok) throw new Error(`${response.status} ${source.url}`);
  return parsePublicCsv(await response.text(), source.valueKey);
}

function parsePublicCsv(csv, valueKey) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const valueIndex = headers.indexOf(valueKey);
  if (valueIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const rawDate = dateIndex >= 0 ? values[dateIndex] : "";
    const rawTimestamp = timestampIndex >= 0 ? Number(values[timestampIndex]) : NaN;
    const timestamp = rawDate
      ? Date.parse(`${rawDate}T00:00:00Z`)
      : rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
    const value = Number(values[valueIndex]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(value) || value <= 0) return null;
    return { date: new Date(timestamp).toISOString().slice(0, 10), value };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function mergeLthSthSeries(priceRows, lthRows, sthRows) {
  const priceByDate = new Map(priceRows.map((row) => [row.date, row.value]));
  const lthByDate = new Map(lthRows.map((row) => [row.date, row.value]));
  const sthByDate = new Map(sthRows.map((row) => [row.date, row.value]));
  const dates = [...new Set([...priceByDate.keys(), ...lthByDate.keys(), ...sthByDate.keys()])].sort();

  return dates.map((date) => {
    const price = priceByDate.get(date);
    const lth = lthByDate.get(date);
    const sth = sthByDate.get(date);
    if (![price, lth, sth].every((value) => Number.isFinite(value) && value > 0)) return null;
    return { date, price, lth, sth, ratio: lth / sth };
  }).filter(Boolean);
}

function calculateLthSthSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.ratio, 0) / Math.max(rows.length, 1);
  };
  const average7 = average(7);
  const average30 = average(30);
  const sevenDayStart = series.at(-Math.min(8, series.length));
  const dailySlope = (latest.ratio - sevenDayStart.ratio) / Math.max(Math.min(7, series.length - 1), 1);
  const recentRows = series.slice(-365);
  const recentPeak = Math.max(...recentRows.map((row) => row.ratio));
  const upwardCrossings = [];
  for (let index = 1; index < series.length; index += 1) {
    if (series[index - 1].ratio < THRESHOLD && series[index].ratio >= THRESHOLD) upwardCrossings.push(series[index]);
  }
  const latestCross = upwardCrossings.at(-1) || null;
  const daysSinceCross = latestCross
    ? Math.max(0, Math.round((Date.parse(`${latest.date}T00:00:00Z`) - Date.parse(`${latestCross.date}T00:00:00Z`)) / DAY_MS))
    : null;
  const trend = dailySlope > 0.00015 ? "rising" : dailySlope < -0.00015 ? "falling" : "flat";
  const phase = latest.ratio < THRESHOLD
    ? "accumulation"
    : latest.ratio < 0.75
      ? "recovery"
      : latest.ratio < 1
        ? "convergence"
        : "reset";

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    lth: latest.lth,
    sth: latest.sth,
    ratio: latest.ratio,
    average7,
    average30,
    dailySlope,
    projected7d: latest.ratio + dailySlope * 7,
    trend,
    phase,
    threshold: THRESHOLD,
    distanceToThreshold: latest.ratio - THRESHOLD,
    recentPeak,
    latestCrossDate: latestCross?.date || null,
    daysSinceCross,
    costGapUsd: latest.sth - latest.lth,
    convergencePercent: (latest.lth / latest.sth) * 100
  };
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
  buildLthSthPayload,
  calculateLthSthSnapshot,
  mergeLthSthSeries,
  parsePublicCsv
};
