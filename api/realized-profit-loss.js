const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;

const FILE_BASE = "https://charts.bgeometrics.com/files";
const SOURCE_URLS = {
  ratio: `${FILE_BASE}/realized_profit_loss_ratio.json`,
  price: `${FILE_BASE}/realized_profit_loss_ratio_btc_price.json`,
  profit: `${FILE_BASE}/realized_profit.json`,
  loss: `${FILE_BASE}/realized_loss.json`
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
  const cache = globalThis.__welinkRealizedProfitLossCache;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildPayload();
    globalThis.__welinkRealizedProfitLossCache = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Public source refresh failed; serving the latest valid realized profit/loss series."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load BTC realized profit/loss history",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildPayload() {
  const [ratioRows, priceRows, profitRows, lossRows, livePrice] = await Promise.all([
    fetchPairSeries(SOURCE_URLS.ratio),
    fetchPairSeries(SOURCE_URLS.price),
    fetchPairSeries(SOURCE_URLS.profit, { allowNull: true }),
    fetchPairSeries(SOURCE_URLS.loss, { allowNull: true }),
    fetchLiveBtcPrice().catch(() => null)
  ]);

  const series = buildRealizedProfitLossSeries(ratioRows, priceRows, profitRows, lossRows);
  if (series.length < 365) throw new Error("Public sources returned too few aligned observations");

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    methodology: "daily_realized_profit_divided_by_absolute_realized_loss",
    snapshot: calculateRealizedProfitLossSnapshot(series, livePrice),
    series,
    sources: {
      ratio: "BGeometrics Realized Profit/Loss Ratio",
      price: livePrice?.source || "BGeometrics daily price",
      history: "BGeometrics public chart files",
      profitLoss: "BGeometrics realized profit/loss · 365D SMA"
    }
  };
}

async function fetchPairSeries(url, options = {}) {
  const payload = await fetchJson(url);
  return normalizePairSeries(payload, options);
}

function normalizePairSeries(payload, options = {}) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      if (!Array.isArray(row) || row.length < 2) return null;
      const timestamp = normalizeTimestamp(row[0]);
      const numeric = row[1] === null && options.allowNull ? null : Number(row[1]);
      if (!Number.isFinite(timestamp)) return null;
      if (numeric === null) return { timestamp, value: null };
      return Number.isFinite(numeric) ? { timestamp, value: numeric } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);
}

function buildRealizedProfitLossSeries(ratioRows, priceRows, profitRows, lossRows) {
  const priceByTime = new Map(priceRows.map((row) => [row.timestamp, row.value]));
  const profitByTime = new Map(profitRows.map((row) => [row.timestamp, row.value]));
  const lossByTime = new Map(lossRows.map((row) => [row.timestamp, row.value]));
  const rolling = [];
  let profitUsdSum = 0;
  let lossUsdSum = 0;
  let lastProfit365SmaUsd = null;
  let lastLoss365SmaUsd = null;
  let lastProfitLossTimestamp = null;

  return ratioRows
    .map((ratioRow) => {
      const price = priceByTime.get(ratioRow.timestamp);
      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(ratioRow.value) || ratioRow.value < 0) return null;

      const profitBtc = profitByTime.get(ratioRow.timestamp);
      const lossBtc = lossByTime.get(ratioRow.timestamp);
      let profit365SmaUsd = null;
      let loss365SmaUsd = null;
      if (Number.isFinite(profitBtc) && Number.isFinite(lossBtc)) {
        const profitUsd = Math.max(0, profitBtc) * price;
        const lossUsd = Math.abs(lossBtc) * price;
        rolling.push({ timestamp: ratioRow.timestamp, profitUsd, lossUsd });
        profitUsdSum += profitUsd;
        lossUsdSum += lossUsd;
        while (rolling.length && rolling[0].timestamp < ratioRow.timestamp - 364 * DAY_MS) {
          const removed = rolling.shift();
          profitUsdSum -= removed.profitUsd;
          lossUsdSum -= removed.lossUsd;
        }
        if (rolling.length >= 30) {
          profit365SmaUsd = profitUsdSum / rolling.length;
          loss365SmaUsd = lossUsdSum / rolling.length;
          lastProfit365SmaUsd = profit365SmaUsd;
          lastLoss365SmaUsd = loss365SmaUsd;
          lastProfitLossTimestamp = ratioRow.timestamp;
        }
      } else if (
        Number.isFinite(lastProfit365SmaUsd)
        && Number.isFinite(lastLoss365SmaUsd)
        && ratioRow.timestamp - lastProfitLossTimestamp <= 14 * DAY_MS
      ) {
        profit365SmaUsd = lastProfit365SmaUsd;
        loss365SmaUsd = lastLoss365SmaUsd;
      }

      return {
        date: new Date(ratioRow.timestamp).toISOString().slice(0, 10),
        price,
        ratio: ratioRow.value,
        profit365SmaUsd,
        loss365SmaUsd,
        profitLossAsOf: lastProfitLossTimestamp
          ? new Date(lastProfitLossTimestamp).toISOString().slice(0, 10)
          : null
      };
    })
    .filter(Boolean);
}

function calculateRealizedProfitLossSnapshot(series, livePrice) {
  const latest = series.at(-1);
  const validAmounts = series.filter((row) => Number.isFinite(row.profit365SmaUsd) && Number.isFinite(row.loss365SmaUsd));
  const latestAmounts = validAmounts.at(-1) || null;
  const average = (days) => {
    const window = series.slice(-days);
    return window.reduce((sum, row) => sum + row.ratio, 0) / Math.max(window.length, 1);
  };
  const trendWindow = series.slice(-7);
  const dailySlope = trendWindow.length > 1
    ? (trendWindow.at(-1).ratio - trendWindow[0].ratio) / (trendWindow.length - 1)
    : 0;
  const average7 = average(7);
  const average30 = average(30);
  const threshold = 2.2;
  let crossedThresholdOn = null;
  let runningRatio = 0;
  let previousAverage = null;
  for (let index = 0; index < series.length; index += 1) {
    runningRatio += series[index].ratio;
    if (index >= 30) runningRatio -= series[index - 30].ratio;
    const windowLength = Math.min(index + 1, 30);
    const rollingAverage = runningRatio / windowLength;
    if (previousAverage !== null && previousAverage >= threshold && rollingAverage < threshold) {
      crossedThresholdOn = series[index].date;
    }
    previousAverage = rollingAverage;
  }
  const daysSinceThreshold = crossedThresholdOn
    ? Math.max(0, Math.round((Date.parse(`${latest.date}T00:00:00Z`) - Date.parse(`${crossedThresholdOn}T00:00:00Z`)) / DAY_MS))
    : null;
  const current = latest.ratio;
  const trend = dailySlope > 0.002 ? "rising" : dailySlope < -0.002 ? "declining" : "flat";
  const zone = current < 1 ? "bottom" : current < threshold ? "capitulation" : current < 5 ? "cooling" : "expansion";

  return {
    current,
    average7,
    average30,
    dailySlope,
    distanceToOne: current - 1,
    threshold,
    thresholdMethod: "30d_average",
    crossedThresholdOn,
    daysSinceThreshold,
    trend,
    zone,
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    profit365SmaUsd: latestAmounts?.profit365SmaUsd ?? null,
    loss365SmaUsd: latestAmounts?.loss365SmaUsd ?? null,
    profitLossAsOf: latestAmounts?.profitLossAsOf ?? latestAmounts?.date ?? null
  };
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

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

export {
  buildRealizedProfitLossSeries,
  calculateRealizedProfitLossSnapshot,
  normalizePairSeries
};
