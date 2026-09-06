const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;
const PERIOD_MS = 14 * DAY_MS;
const PERIOD_ORIGIN = Date.UTC(2011, 0, 3);

const PRICE_HISTORY_URL = "https://charts.bgeometrics.com/files/realized_profit_loss_ratio_btc_price.json";
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];
const BOTTOM_WINDOWS = [
  { label: "2015", start: "2014-08-01", end: "2015-08-31", reference: "Macro bottom" },
  { label: "2019", start: "2018-08-01", end: "2019-06-30", reference: "Macro bottom" },
  { label: "2022–23", start: "2022-04-01", end: "2023-06-30", reference: "Macro bottom" },
  { label: "2026", start: "2025-11-01", end: "2026-12-31", reference: "Current cycle" }
];
const TOP_WINDOWS = [
  { start: "2012-01-01", end: "2013-12-31" },
  { start: "2016-01-01", end: "2018-03-31" },
  { start: "2020-01-01", end: "2021-12-31" },
  { start: "2024-01-01", end: "2025-12-31" }
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
  const cache = globalThis.__welinkTwoWeekRsiCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildTwoWeekRsiPayload();
    globalThis.__welinkTwoWeekRsiCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Public BTC history refresh failed; serving the latest valid 2-week RSI series."
      }, "STALE");
      return;
    }
    response.status(502).json({
      ok: false,
      error: "Unable to calculate the public 2-week RSI model",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildTwoWeekRsiPayload() {
  const [historyPayload, livePrice] = await Promise.all([
    fetchJson(PRICE_HISTORY_URL),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const dailyPrice = normalizePairSeries(historyPayload);
  if (dailyPrice.length < 2_000) throw new Error("Public BTC price history contains too few observations");

  const biweekly = buildBiweeklyCloses(dailyPrice, livePrice);
  const rsiRows = calculateWilderRsi(biweekly, 14);
  if (rsiRows.length < 200) throw new Error("Calculated 2-week RSI history contains too few observations");

  const { series, lowerAnchors, upperAnchors } = attachLongTermChannels(rsiRows);
  const historicalLows = calculateHistoricalLows(series);
  const snapshot = calculateTwoWeekRsiSnapshot(series, livePrice);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "biweekly",
    methodology: "14_period_wilder_rsi_on_14_day_btc_closes_with_extreme_point_channel_regression",
    snapshot,
    historicalLows,
    channelAnchors: { lower: lowerAnchors, upper: upperAnchors },
    series,
    sources: {
      price: livePrice?.source || "BGeometrics public daily BTC price",
      history: "BGeometrics public daily BTC price file",
      calculation: "welinkBTC · 14-day closes · Wilder RSI(14)",
      channel: "Linear regression of cycle RSI extrema; derived technical model, not an exchange or on-chain source field",
      reference: PRICE_HISTORY_URL
    }
  };
}

function buildBiweeklyCloses(dailyRows, livePrice = null) {
  const buckets = new Map();
  dailyRows.forEach((row) => {
    const bucket = Math.floor((row.timestamp - PERIOD_ORIGIN) / PERIOD_MS);
    if (bucket < 0) return;
    const current = buckets.get(bucket);
    if (!current || row.timestamp >= current.timestamp) buckets.set(bucket, row);
  });

  if (livePrice?.value && livePrice?.asOf) {
    const timestamp = new Date(livePrice.asOf).getTime();
    if (Number.isFinite(timestamp)) {
      const bucket = Math.floor((timestamp - PERIOD_ORIGIN) / PERIOD_MS);
      const current = buckets.get(bucket);
      if (!current || timestamp >= current.timestamp) buckets.set(bucket, { timestamp, value: Number(livePrice.value) });
    }
  }

  return [...buckets.entries()].sort((left, right) => left[0] - right[0]).map(([bucket, row]) => ({
    timestamp: PERIOD_ORIGIN + (bucket + 1) * PERIOD_MS - 1,
    observedAt: row.timestamp,
    date: new Date(row.timestamp).toISOString().slice(0, 10),
    price: row.value
  }));
}

function calculateWilderRsi(rows, period = 14) {
  if (!Array.isArray(rows) || rows.length <= period) return [];
  const result = [];
  let averageGain = 0;
  let averageLoss = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = rows[index].price - rows[index - 1].price;
    averageGain += Math.max(change, 0);
    averageLoss += Math.max(-change, 0);
  }
  averageGain /= period;
  averageLoss /= period;

  for (let index = period; index < rows.length; index += 1) {
    if (index > period) {
      const change = rows[index].price - rows[index - 1].price;
      averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
      averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    }
    const rsi = averageLoss === 0 ? 100 : averageGain === 0 ? 0 : 100 - 100 / (1 + averageGain / averageLoss);
    result.push({ ...rows[index], rsi });
  }
  return result;
}

function attachLongTermChannels(rows) {
  const lowerAnchors = findWindowExtremes(rows, BOTTOM_WINDOWS, "min");
  const upperAnchors = findWindowExtremes(rows, TOP_WINDOWS, "max");
  const lowerFit = linearRegression(lowerAnchors.map((row) => [decimalYear(row.timestamp), row.rsi]));
  const upperFit = linearRegression(upperAnchors.map((row) => [decimalYear(row.timestamp), row.rsi]));

  const series = rows.map((row) => {
    const year = decimalYear(row.timestamp);
    let lower = lowerFit ? lowerFit.intercept + lowerFit.slope * year : 44 - 0.58 * (year - 2012);
    let upper = upperFit ? upperFit.intercept + upperFit.slope * year : 98 - 0.72 * (year - 2012);
    lower = clamp(lower, 18, 52);
    upper = clamp(upper, 72, 100);
    if (upper < lower + 28) upper = Math.min(100, lower + 28);
    return { ...row, lower, upper };
  });

  return {
    series,
    lowerAnchors: lowerAnchors.map(serializeAnchor),
    upperAnchors: upperAnchors.map(serializeAnchor)
  };
}

function findWindowExtremes(rows, windows, mode) {
  return windows.map((window) => {
    const candidates = rows.filter((row) => row.date >= window.start && row.date <= window.end);
    return candidates.reduce((selected, row) => {
      if (!selected) return row;
      return mode === "min" ? (row.rsi < selected.rsi ? row : selected) : (row.rsi > selected.rsi ? row : selected);
    }, null);
  }).filter(Boolean);
}

function calculateHistoricalLows(series, windows = BOTTOM_WINDOWS) {
  return windows.map((window) => {
    const rows = series.filter((row) => row.date >= window.start && row.date <= window.end);
    const low = rows.reduce((selected, row) => !selected || row.rsi < selected.rsi ? row : selected, null);
    return low ? {
      label: window.label,
      date: low.date,
      rsi: low.rsi,
      price: low.price,
      lower: low.lower,
      distanceToLower: low.rsi - low.lower,
      reference: window.reference
    } : null;
  }).filter(Boolean);
}

function calculateTwoWeekRsiSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const previous = series.at(-2) || latest;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.rsi, 0) / Math.max(rows.length, 1);
  };
  const change = latest.rsi - previous.rsi;
  const distanceToLower = latest.rsi - latest.lower;
  const zone = latest.rsi <= latest.lower + 2 ? "lower-touch" : latest.rsi < 40 ? "oversold" : latest.rsi < 70 ? "neutral" : "overheated";
  const trend = change > 1 ? "rising" : change < -1 ? "falling" : "flat";
  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    rsi: latest.rsi,
    previousRsi: previous.rsi,
    change,
    average6w: average(3),
    average12w: average(6),
    lower: latest.lower,
    upper: latest.upper,
    distanceToLower,
    trend,
    zone
  };
}

function linearRegression(points) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const denominator = points.reduce((sum, point) => sum + (point[0] - meanX) ** 2, 0);
  if (denominator === 0) return null;
  const slope = points.reduce((sum, point) => sum + (point[0] - meanX) * (point[1] - meanY), 0) / denominator;
  return { slope, intercept: meanY - slope * meanX };
}

function serializeAnchor(row) {
  return { date: row.date, timestamp: row.timestamp, rsi: row.rsi, price: row.price };
}

function decimalYear(timestamp) {
  const date = new Date(timestamp);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const end = Date.UTC(date.getUTCFullYear() + 1, 0, 1);
  return date.getUTCFullYear() + (timestamp - start) / (end - start);
}

function normalizePairSeries(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map((row) => {
    if (!Array.isArray(row) || row.length < 2 || row[0] === null || row[1] === null) return null;
    const timestamp = normalizeTimestamp(row[0]);
    const value = Number(row[1]);
    return Number.isFinite(timestamp) && Number.isFinite(value) && value > 0 ? { timestamp, value } : null;
  }).filter(Boolean).sort((left, right) => left.timestamp - right.timestamp);
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const payload = await fetchJson(url, 7_000);
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export {
  BOTTOM_WINDOWS,
  TOP_WINDOWS,
  attachLongTermChannels,
  buildBiweeklyCloses,
  buildTwoWeekRsiPayload,
  calculateHistoricalLows,
  calculateTwoWeekRsiSnapshot,
  calculateWilderRsi,
  linearRegression,
  normalizePairSeries
};
