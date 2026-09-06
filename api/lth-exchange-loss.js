const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

const FILE_BASE = "https://charts.bgeometrics.com/files";
const SOURCE_URLS = {
  lthProfit: `${FILE_BASE}/realized_profit_lth.json`,
  lthLoss: `${FILE_BASE}/realized_loss_lth.json`,
  sthProfit: `${FILE_BASE}/realized_profit_sth.json`,
  sthLoss: `${FILE_BASE}/realized_loss_sth.json`,
  price: `${FILE_BASE}/realized_profit_loss_ratio_btc_price.json`
};
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];
const RESEARCH_WINDOWS = [
  { label: "2015", start: "2014-01-01", end: "2016-12-31", referencePercent: 50 },
  { label: "2019", start: "2018-01-01", end: "2020-12-31", referencePercent: 55 },
  { label: "2022–23", start: "2022-01-01", end: "2023-12-31", referencePercent: 60 },
  { label: "2026", start: "2026-01-01", end: "2026-12-31", referencePercent: 70 }
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
  const cache = globalThis.__welinkLthExchangeLossCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildLthExchangeLossPayload();
    globalThis.__welinkLthExchangeLossCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Public LTH exchange-loss proxy refresh failed; serving the latest valid series."
      }, "STALE");
      return;
    }
    response.status(502).json({
      ok: false,
      error: "Unable to load the public LTH exchange-loss proxy",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildLthExchangeLossPayload() {
  const [lthProfitRows, lthLossRows, sthProfitRows, sthLossRows, priceRows, livePrice] = await Promise.all([
    fetchPairSeries(SOURCE_URLS.lthProfit),
    fetchPairSeries(SOURCE_URLS.lthLoss),
    fetchPairSeries(SOURCE_URLS.sthProfit),
    fetchPairSeries(SOURCE_URLS.sthLoss),
    fetchPairSeries(SOURCE_URLS.price),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const series = buildLthExchangeLossProxySeries(lthProfitRows, lthLossRows, sthProfitRows, sthLossRows, priceRows);
  if (series.length < 365) throw new Error("Public sources returned too few aligned observations");

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    dataMode: "public-proxy",
    exchangeLabelled: false,
    methodology: "30d_sma_of_lth_realized_loss_share_across_lth_sth_realized_profit_and_loss",
    snapshot: calculateLthExchangeLossSnapshot(series, livePrice),
    historicalPeaks: calculateHistoricalPeaks(series),
    researchWindows: RESEARCH_WINDOWS,
    series,
    sources: {
      price: livePrice?.source || "BGeometrics daily BTC price",
      history: "BGeometrics public LTH/STH realized profit and loss files",
      definition: "Glassnode Relative Long/Short-Term Holder Realized Profit/Loss to Exchanges",
      reference: "https://docs.glassnode.com/basic-api/endpoints/pit",
      disclosure: "This public proxy is not exchange-labelled. Exact exchange-transfer data requires proprietary address labels and entity clustering."
    }
  };
}

function buildLthExchangeLossProxySeries(lthProfitRows, lthLossRows, sthProfitRows, sthLossRows, priceRows) {
  const lthProfitByTime = new Map(lthProfitRows.map((row) => [row.timestamp, row.value]));
  const sthProfitByTime = new Map(sthProfitRows.map((row) => [row.timestamp, row.value]));
  const sthLossByTime = new Map(sthLossRows.map((row) => [row.timestamp, row.value]));
  const priceByTime = new Map(priceRows.map((row) => [row.timestamp, row.value]));
  const aligned = lthLossRows.map((row) => {
    const values = {
      lthProfit: lthProfitByTime.get(row.timestamp),
      lthLoss: row.value,
      sthProfit: sthProfitByTime.get(row.timestamp),
      sthLoss: sthLossByTime.get(row.timestamp),
      price: priceByTime.get(row.timestamp)
    };
    if (Object.values(values).some((value) => value === null || value === undefined || !Number.isFinite(Number(value)))) return null;
    const lthProfit = Math.abs(Number(values.lthProfit));
    const lthLoss = Math.abs(Number(values.lthLoss));
    const sthProfit = Math.abs(Number(values.sthProfit));
    const sthLoss = Math.abs(Number(values.sthLoss));
    const price = Number(values.price);
    const totalRealized = lthProfit + lthLoss + sthProfit + sthLoss;
    if (price <= 0 || totalRealized <= 0) return null;
    return {
      timestamp: row.timestamp,
      date: new Date(row.timestamp).toISOString().slice(0, 10),
      price,
      rawPercent: lthLoss / totalRealized * 100,
      lthLossUsd: lthLoss * price,
      lthProfitUsd: lthProfit * price,
      sthLossUsd: sthLoss * price,
      sthProfitUsd: sthProfit * price
    };
  }).filter(Boolean);

  const rolling30 = [];
  let rollingSum = 0;
  return aligned.map((row) => {
    rolling30.push(row.rawPercent);
    rollingSum += row.rawPercent;
    if (rolling30.length > 30) rollingSum -= rolling30.shift();
    return {
      ...row,
      percent: rollingSum / rolling30.length
    };
  }).filter((row) => Number.isFinite(row.percent));
}

function calculateLthExchangeLossSnapshot(series, livePrice = null) {
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
  const zone = latest.percent < 10 ? "quiet" : latest.percent < 25 ? "normal" : latest.percent < 45 ? "stress" : "capitulation";
  const recentYear = series.slice(-365);
  const peak365 = recentYear.reduce((peak, row) => row.percent > peak.percent ? row : peak, recentYear[0]);

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    percent: latest.percent,
    rawPercent: latest.rawPercent,
    average7,
    average30,
    sevenDayChange,
    trend,
    zone,
    peak365: peak365.percent,
    peak365Date: peak365.date,
    distanceToCapitulation: latest.percent - 50,
    lthLossUsd: latest.lthLossUsd,
    totalRealizedUsd: latest.lthLossUsd + latest.lthProfitUsd + latest.sthLossUsd + latest.sthProfitUsd
  };
}

function calculateHistoricalPeaks(series, windows = RESEARCH_WINDOWS) {
  return windows.map((window) => {
    const rows = series.filter((row) => row.date >= window.start && row.date <= window.end);
    const peak = rows.reduce((result, row) => !result || row.percent > result.percent ? row : result, null);
    return peak ? {
      label: window.label,
      date: peak.date,
      percent: peak.percent,
      price: peak.price,
      referencePercent: window.referencePercent
    } : null;
  }).filter(Boolean);
}

async function fetchPairSeries(url) {
  return normalizePairSeries(await fetchJson(url));
}

function normalizePairSeries(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map((row) => {
    if (
      !Array.isArray(row) ||
      row.length < 2 ||
      row[0] === null ||
      row[0] === undefined ||
      row[1] === null ||
      row[1] === undefined
    ) return null;
    const timestamp = normalizeTimestamp(row[0]);
    const value = Number(row[1]);
    return Number.isFinite(timestamp) && Number.isFinite(value) ? { timestamp, value } : null;
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

export {
  RESEARCH_WINDOWS,
  buildLthExchangeLossPayload,
  buildLthExchangeLossProxySeries,
  calculateHistoricalPeaks,
  calculateLthExchangeLossSnapshot,
  normalizePairSeries
};
