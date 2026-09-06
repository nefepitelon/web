const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

const BGEOMETRICS_BASE = "https://bitcoin-data.com/api/v1";
const COINGLASS_STH_URL = "https://open-api-v4.coinglass.com/api/index/bitcoin-sth-realized-price";
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
  const cache = globalThis.__welinkCostBasisCache;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    const payload = cache.payload.ratioSnapshot
      ? cache.payload
      : { ...cache.payload, ratioSnapshot: calculateRatioSnapshot(cache.payload.series || []) };
    globalThis.__welinkCostBasisCache = { ...cache, payload };
    sendPayload(response, payload, "HIT");
    return;
  }

  try {
    const payload = await buildCostBasisPayload(cache?.payload);
    globalThis.__welinkCostBasisCache = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Upstream refresh failed; serving the latest valid cost-basis series."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load BTC cost-basis history",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildCostBasisPayload(previousPayload) {
  const [tmmpResult, coinglassResult, tickerResult] = await Promise.allSettled([
    fetchBgeometricsCsv("true-market-mean", ["trueMarketMean", "true_market_mean", "tmmp"]),
    fetchCoinglassSthHistory(),
    fetchLiveBtcPrice()
  ]);

  const tmmpRows = fulfilledValue(tmmpResult);
  let sthBundle = fulfilledValue(coinglassResult);
  let sourceMode = "CoinGlass + BGeometrics";

  if (!sthBundle) {
    const [sthResult, priceResult] = await Promise.allSettled([
      fetchBgeometricsCsv("realized-price-sth", ["realizedPriceSth", "realized_price_sth", "sth_realized_price"]),
      fetchBgeometricsCsv("btc-price", ["btcPrice", "price", "btc_price", "close"])
    ]);
    const sthRows = fulfilledValue(sthResult);
    const priceRows = fulfilledValue(priceResult);
    if (sthRows?.length && priceRows?.length) {
      sthBundle = { sthRows, priceRows, source: "BGeometrics" };
      sourceMode = "BGeometrics";
    }
  }

  const fallbackSeries = previousPayload?.series || [];
  const series = tmmpRows?.length && sthBundle?.sthRows?.length
    ? mergeCostBasisSeries(sthBundle, tmmpRows)
    : fallbackSeries;

  if (series.length < 7) {
    throw new Error("Cost-basis sources did not return enough aligned daily observations");
  }

  const livePrice = fulfilledValue(tickerResult);
  const snapshot = calculateSnapshot(series, livePrice);
  const ratioSnapshot = calculateRatioSnapshot(series);
  const stale = !(tmmpRows?.length && sthBundle?.sthRows?.length);

  return {
    ok: true,
    stale,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    snapshot,
    ratioSnapshot,
    series,
    historicalWindows: [
      { cycle: "2014", bottomDate: "2015-01-14", days: 182 },
      { cycle: "2018", bottomDate: "2018-12-15", days: 128 },
      { cycle: "2022", bottomDate: "2022-11-21", days: 160 }
    ],
    sources: {
      price: livePrice?.source || `${sthBundle?.source || sourceMode} daily close`,
      sth: sthBundle?.source || sourceMode,
      tmmp: "BGeometrics",
      methodology: "Glassnode Cointime Economics definitions"
    }
  };
}

async function fetchCoinglassSthHistory() {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) throw new Error("COINGLASS_API_KEY is not configured");
  const payload = await fetchJson(COINGLASS_STH_URL, {
    headers: { "CG-API-KEY": apiKey }
  });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const normalized = rows
    .map((row) => ({
      date: normalizeDate(row.timestamp ?? row.time ?? row.date),
      sth: firstFinite(row.sth_realized_price, row.realized_price_sth, row.sthRealizedPrice),
      price: firstFinite(row.price, row.close)
    }))
    .filter((row) => row.date && Number.isFinite(row.sth));
  if (normalized.length < 7) throw new Error("CoinGlass STH history unavailable for this API plan");
  return {
    sthRows: normalized.map((row) => ({ date: row.date, value: row.sth })),
    priceRows: normalized.filter((row) => Number.isFinite(row.price)).map((row) => ({ date: row.date, value: row.price })),
    source: "CoinGlass"
  };
}

async function fetchBgeometricsCsv(metric, preferredFields) {
  const response = await fetchWithTimeout(`${BGEOMETRICS_BASE}/${metric}/csv`, {
    headers: { Accept: "text/csv" }
  });
  if (!response.ok) throw new Error(`BGeometrics ${metric} ${response.status}`);
  const text = await response.text();
  const records = parseCsv(text);
  if (!records.length) throw new Error(`BGeometrics ${metric} returned no rows`);

  return records
    .map((record) => {
      const date = normalizeDate(record.d ?? record.date ?? record.unixTs ?? record.timestamp);
      const preferredValue = firstFinite(...preferredFields.map((field) => record[field]));
      const fallbackValue = Object.entries(record)
        .filter(([key]) => !["d", "date", "unixTs", "timestamp"].includes(key))
        .map(([, value]) => Number(value))
        .find(Number.isFinite);
      return { date, value: Number.isFinite(preferredValue) ? preferredValue : fallbackValue };
    })
    .filter((row) => row.date && Number.isFinite(row.value) && row.value > 0);
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const payload = await fetchJson(url, { timeoutMs: 7_000 });
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) {
        return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
}

function mergeCostBasisSeries(sthBundle, tmmpRows) {
  const tmmpByDate = new Map(tmmpRows.map((row) => [row.date, row.value]));
  const priceByDate = new Map((sthBundle.priceRows || []).map((row) => [row.date, row.value]));
  return sthBundle.sthRows
    .map((row) => ({
      date: row.date,
      price: priceByDate.get(row.date),
      sth: row.value,
      tmmp: tmmpByDate.get(row.date)
    }))
    .filter((row) => Number.isFinite(row.price) && Number.isFinite(row.sth) && Number.isFinite(row.tmmp))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function calculateSnapshot(series, livePrice) {
  const latest = series.at(-1);
  const priorWindow = series.slice(-15);
  const gaps = priorWindow.map((row) => row.sth - row.tmmp);
  const dailyConvergence = gaps.length > 1
    ? gaps.slice(1).reduce((sum, gap, index) => sum + (Math.abs(gaps[index]) - Math.abs(gap)), 0) / (gaps.length - 1)
    : null;
  const crosses = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (previous.sth >= previous.tmmp && current.sth < current.tmmp) crosses.push(current.date);
  }
  const lastCrossDate = crosses.at(-1) || null;
  const deathCrossActive = latest.sth < latest.tmmp;
  const daysSinceCross = deathCrossActive && lastCrossDate
    ? Math.max(0, Math.round((Date.parse(latest.date) - Date.parse(lastCrossDate)) / 86_400_000))
    : null;
  const daysToAverageBottom = Number.isFinite(daysSinceCross) ? Math.max(157 - daysSinceCross, 0) : null;

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    dailyPrice: latest.price,
    sth: latest.sth,
    tmmp: latest.tmmp,
    onchainAsOf: latest.date,
    gap: latest.sth - latest.tmmp,
    gapPercent: ((latest.sth / latest.tmmp) - 1) * 100,
    deathCrossActive,
    lastCrossDate,
    daysSinceCross,
    dailyConvergence: Number.isFinite(dailyConvergence) ? dailyConvergence : null,
    daysToAverageBottom,
    projectedConvergenceDays: dailyConvergence > 0 ? Math.round(Math.abs(latest.sth - latest.tmmp) / dailyConvergence) : null,
    averageHistoricalBottomDays: 157
  };
}

function calculateRatioSnapshot(series, threshold = 0.75) {
  const ratios = series
    .filter((row) => Number.isFinite(row.sth) && Number.isFinite(row.tmmp) && row.tmmp > 0)
    .map((row) => ({
      date: row.date,
      ratio: row.sth / row.tmmp,
      price: row.price,
      sth: row.sth,
      tmmp: row.tmmp
    }));
  if (!ratios.length) return null;

  const latest = ratios.at(-1);
  const average = (days) => {
    const window = ratios.slice(-days);
    return window.reduce((sum, row) => sum + row.ratio, 0) / window.length;
  };
  const trendWindow = ratios.slice(-7);
  const dailySlope = trendWindow.length > 1
    ? (trendWindow.at(-1).ratio - trendWindow[0].ratio) / (trendWindow.length - 1)
    : 0;
  const average7 = average(7);
  const average30 = average(30);
  const hasFullThirtyDayWindow = ratios.length >= 30;
  const trend = latest.ratio < average7 && dailySlope < 0 && (!hasFullThirtyDayWindow || average7 < average30)
    ? "declining"
    : latest.ratio > average7 && dailySlope > 0 && (!hasFullThirtyDayWindow || average7 > average30)
      ? "rising"
      : "neutral";

  return {
    current: latest.ratio,
    average7,
    average30,
    dailySlope,
    projected7d: Math.max(0, latest.ratio + dailySlope * 7),
    threshold,
    distanceToThreshold: latest.ratio - threshold,
    distancePercent: ((latest.ratio / threshold) - 1) * 100,
    trend,
    priceBelowSth: Number.isFinite(latest.price) ? latest.price < latest.sth : null,
    priceBelowTmmp: Number.isFinite(latest.price) ? latest.price < latest.tmmp : null,
    onchainAsOf: latest.date
  };
}

function parseCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function fulfilledValue(result) {
  return result?.status === "fulfilled" ? result.value : null;
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export { calculateRatioSnapshot, calculateSnapshot, mergeCostBasisSeries, parseCsv };
