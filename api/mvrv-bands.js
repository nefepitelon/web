const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const ROLLING_WINDOW_DAYS = 4 * 365;

const COIN_METRICS_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const BGEOMETRICS_MVRV_URL = "https://bitcoin-data.com/api/v1/mvrv/csv";
const BGEOMETRICS_PRICE_URL = "https://bitcoin-data.com/api/v1/btc-price/csv";
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
  const cache = globalThis.__welinkMvrvBandsCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildMvrvBandsPayload();
    globalThis.__welinkMvrvBandsCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "MVRV band refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load BTC standard-adjusted MVRV bands",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildMvrvBandsPayload() {
  let history;
  let historySource;
  try {
    history = await fetchCoinMetricsHistory();
    historySource = "Coin Metrics Community API";
  } catch (primaryError) {
    history = await fetchBgeometricsHistory();
    historySource = "BGeometrics public daily API";
    if (!history.length) throw primaryError;
  }

  if (history.length < ROLLING_WINDOW_DAYS + 30) {
    throw new Error("Public MVRV history returned too few observations for a four-year window");
  }

  const series = calculateRollingBands(history, ROLLING_WINDOW_DAYS);
  const livePrice = await fetchLiveBtcPrice().catch(() => null);
  const snapshot = calculateMvrvBandsSnapshot(series, livePrice);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    rollingWindowDays: ROLLING_WINDOW_DAYS,
    snapshot,
    breaches: detectMinusOneSigmaBreaches(series),
    series,
    sources: {
      price: livePrice?.source || historySource,
      history: historySource,
      primary: COIN_METRICS_URL,
      fallback: BGEOMETRICS_MVRV_URL,
      methodology: "MVRV normalized with a trailing 1,460-observation arithmetic mean and population standard deviation",
      priceBandMethodology: "Realized Price (PriceUSD / CapMVRVCur) multiplied by rolling MVRV levels at -1, -0.5, 0, +1 and +2 sigma"
    }
  };
}

async function fetchCoinMetricsHistory() {
  const endDate = new Date().toISOString().slice(0, 10);
  const url = new URL(COIN_METRICS_URL);
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "CapMVRVCur,PriceUSD");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", "2013-04-28");
  url.searchParams.set("end_time", endDate);
  url.searchParams.set("page_size", "10000");

  const result = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!result.ok) throw new Error(`Coin Metrics ${result.status}`);
  const payload = await result.json();
  const rows = (payload?.data || []).map((row) => {
    const date = String(row?.time || "").slice(0, 10);
    const price = Number(row?.PriceUSD);
    const mvrv = Number(row?.CapMVRVCur);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(mvrv) || mvrv <= 0) return null;
    return { date, price, mvrv };
  }).filter(Boolean);
  return dedupeSeries(rows);
}

async function fetchBgeometricsHistory() {
  const [mvrvResponse, priceResponse] = await Promise.all([
    fetchWithTimeout(BGEOMETRICS_MVRV_URL, { headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" } }),
    fetchWithTimeout(BGEOMETRICS_PRICE_URL, { headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" } })
  ]);
  if (!mvrvResponse.ok || !priceResponse.ok) throw new Error("BGeometrics MVRV fallback unavailable");
  return mergeMvrvAndPrice(
    parsePublicCsv(await mvrvResponse.text(), ["mvrv", "value"]),
    parsePublicCsv(await priceResponse.text(), ["btcPrice", "price", "value"])
  );
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
    if (!Number.isFinite(milliseconds) || !Number.isFinite(value) || value <= 0) return null;
    return { date: new Date(milliseconds).toISOString().slice(0, 10), value };
  }).filter(Boolean);
}

function mergeMvrvAndPrice(mvrvRows, priceRows) {
  const priceByDate = new Map(priceRows.map((row) => [row.date, row.value]));
  return dedupeSeries(mvrvRows.map((row) => {
    const price = priceByDate.get(row.date);
    return Number.isFinite(price) && price > 0 ? { date: row.date, price, mvrv: row.value } : null;
  }).filter(Boolean));
}

function dedupeSeries(rows) {
  return [...new Map(rows.map((row) => [row.date, row])).values()]
    .sort((left, right) => left.date.localeCompare(right.date));
}

function calculateRollingBands(history, windowSize = ROLLING_WINDOW_DAYS) {
  const queue = [];
  let sum = 0;
  let sumSquares = 0;

  return history.map((row) => {
    queue.push(row.mvrv);
    sum += row.mvrv;
    sumSquares += row.mvrv * row.mvrv;
    if (queue.length > windowSize) {
      const removed = queue.shift();
      sum -= removed;
      sumSquares -= removed * removed;
    }

    if (queue.length < windowSize) {
      return {
        ...row,
        realizedPrice: row.price / row.mvrv,
        mean: null,
        std: null,
        minusOne: null,
        minusHalf: null,
        plusHalf: null,
        plusOne: null,
        plusTwo: null,
        priceMinusOne: null,
        priceMinusHalf: null,
        priceMean: null,
        pricePlusOne: null,
        pricePlusTwo: null,
        zscore: null
      };
    }

    const mean = sum / windowSize;
    const variance = Math.max(0, sumSquares / windowSize - mean * mean);
    const std = Math.sqrt(variance);
    const realizedPrice = row.price / row.mvrv;
    const minusOne = mean - std;
    const minusHalf = mean - std * 0.5;
    const plusHalf = mean + std * 0.5;
    const plusOne = mean + std;
    const plusTwo = mean + std * 2;
    return {
      ...row,
      realizedPrice,
      mean,
      std,
      minusOne,
      minusHalf,
      plusHalf,
      plusOne,
      plusTwo,
      priceMinusOne: realizedPrice * minusOne,
      priceMinusHalf: realizedPrice * minusHalf,
      priceMean: realizedPrice * mean,
      pricePlusOne: realizedPrice * plusOne,
      pricePlusTwo: realizedPrice * plusTwo,
      zscore: std > 0 ? (row.mvrv - mean) / std : 0
    };
  });
}

function calculateMvrvBandsSnapshot(series, livePrice = null) {
  const valid = series.filter((row) => Number.isFinite(row.mean) && Number.isFinite(row.std));
  const latest = valid.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = valid.slice(-count);
    return rows.reduce((sum, row) => sum + row.mvrv, 0) / Math.max(rows.length, 1);
  };
  const sevenDayStart = valid.at(-Math.min(8, valid.length));
  const sevenDayChange = latest.mvrv - sevenDayStart.mvrv;
  const trend = sevenDayChange > 0.015 ? "rising" : sevenDayChange < -0.015 ? "falling" : "flat";
  const currentPrice = livePrice?.value || latest.price;
  const currentMvrv = currentPrice / latest.realizedPrice;
  const priceBands = {
    minusOne: latest.priceMinusOne,
    minusHalf: latest.priceMinusHalf,
    mean: latest.priceMean,
    plusOne: latest.pricePlusOne,
    plusTwo: latest.pricePlusTwo
  };
  const priceZone = currentPrice < priceBands.minusOne
    ? "bear-bottom"
    : currentPrice < priceBands.minusHalf
      ? "deep-value"
      : currentPrice < priceBands.mean
        ? "accumulation"
        : currentPrice < priceBands.plusOne
          ? "fair-value"
          : currentPrice < priceBands.plusTwo
            ? "elevated"
            : "cycle-top";
  const phase = latest.zscore < -1
    ? "capitulation"
    : latest.zscore < -0.5
      ? "undervalued"
      : latest.zscore <= 1
        ? "normal"
        : latest.zscore <= 2
          ? "elevated"
          : "overheated";

  return {
    price: currentPrice,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    mvrv: latest.mvrv,
    currentMvrv,
    realizedPrice: latest.realizedPrice,
    zscore: latest.zscore,
    mean: latest.mean,
    std: latest.std,
    minusOne: latest.minusOne,
    minusHalf: latest.minusHalf,
    plusHalf: latest.plusHalf,
    plusOne: latest.plusOne,
    plusTwo: latest.plusTwo,
    priceBands,
    priceZone,
    distanceFromMinusOnePct: (currentPrice / priceBands.minusOne - 1) * 100,
    distanceToMeanPct: (currentPrice / priceBands.mean - 1) * 100,
    distanceToPlusTwoPct: (currentPrice / priceBands.plusTwo - 1) * 100,
    average7: average(7),
    average30: average(30),
    sevenDayChange,
    trend,
    phase,
    rollingWindowDays: ROLLING_WINDOW_DAYS
  };
}

function detectMinusOneSigmaBreaches(series) {
  const valid = series.filter((row) => Number.isFinite(row.minusOne));
  const periods = [];
  let active = null;
  valid.forEach((row) => {
    if (row.mvrv < row.minusOne) {
      if (!active) active = { start: row.date, end: row.date, days: 0, minMvrv: row.mvrv, minPrice: row.price, minDate: row.date };
      active.end = row.date;
      active.days += 1;
      if (row.mvrv < active.minMvrv) {
        active.minMvrv = row.mvrv;
        active.minPrice = row.price;
        active.minDate = row.date;
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
  buildMvrvBandsPayload,
  calculateMvrvBandsSnapshot,
  calculateRollingBands,
  detectMinusOneSigmaBreaches,
  mergeMvrvAndPrice,
  parsePublicCsv
};
