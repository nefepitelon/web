const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const DAY_MS = 86_400_000;

const THRESHOLD = 0.7539;
const COIN_METRICS_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const BGEOMETRICS_LATEST_URL = "https://bitcoin-data.com/v1/mvrv-zscore/last";
const BGEOMETRICS_HISTORY_URL = "https://bitcoin-data.com/v1/mvrv-zscore";
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

const REFERENCE_CYCLES = [
  { cycle: "2012", crossDate: "2012-07-16", peakDate: "2012-08-17", durationDays: 32, basis: "supplied-reference" },
  { cycle: "2016", crossDate: "2016-05-29", peakDate: "2016-07-17", durationDays: 49, basis: "supplied-reference" },
  { cycle: "2019", crossDate: "2019-05-13", peakDate: "2019-06-26", durationDays: 44, basis: "supplied-reference" },
  { cycle: "2022", crossDate: "2023-10-25", peakDate: "2024-03-13", durationDays: 140, basis: "public-reconstruction" }
];

const CLASSIC_REFERENCE_DAYS = Math.round(
  REFERENCE_CYCLES.slice(0, 3).reduce((sum, row) => sum + row.durationDays, 0) / 3
);
const EXPANDED_REFERENCE_DAYS = Math.round(
  REFERENCE_CYCLES.reduce((sum, row) => sum + row.durationDays, 0) / REFERENCE_CYCLES.length
);

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    return response.status(405).json({ error: "Method not allowed" });
  }

  const now = Date.now();
  const cache = globalThis.__welinkMvrvZscoreCycleV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildMvrvZscorePayload();
    globalThis.__welinkMvrvZscoreCycleV1 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "MVRV Z-Score refresh failed; serving the latest valid public reconstruction."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load Bitcoin MVRV Z-Score",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

async function buildMvrvZscorePayload() {
  const [historyResult, crosscheckResult, liveResult] = await Promise.allSettled([
    fetchCoinMetricsHistory(),
    fetchBgeometricsLatest(),
    fetchLiveBtcPrice()
  ]);

  let series = [];
  let completeHistory = false;
  let primarySource = "Coin Metrics Community API";
  if (historyResult.status === "fulfilled") {
    series = buildMvrvZscoreSeries(historyResult.value);
    completeHistory = series[0]?.date <= "2011-01-01";
  }

  if (series.length < 365) {
    const fallback = await fetchBgeometricsHistory();
    series = fallback;
    primarySource = "BGeometrics no-key API · latest four years";
    completeHistory = false;
  }
  if (series.length < 365) throw new Error("Public MVRV Z-Score history returned too few observations");

  const livePrice = liveResult.status === "fulfilled" ? liveResult.value : null;
  const externalLatest = crosscheckResult.status === "fulfilled" ? crosscheckResult.value : null;
  const crossings = detectThresholdCrossings(series, THRESHOLD);
  const snapshot = calculateMvrvZscoreSnapshot(series, crossings, livePrice, externalLatest);
  const projection = projectMvrvZscoreScenario(series, snapshot);
  snapshot.scenarioEndZScore = projection.at(-1)?.zScore ?? snapshot.currentZScore;

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cadence: "daily",
    cacheSeconds: CACHE_TTL_MS / 1000,
    completeHistory,
    methodology: "classic_mvrv_zscore_cumulative_market_cap_standard_deviation_7d_sma",
    threshold: THRESHOLD,
    classicReferenceDays: CLASSIC_REFERENCE_DAYS,
    expandedReferenceDays: EXPANDED_REFERENCE_DAYS,
    snapshot,
    referenceCycles: REFERENCE_CYCLES,
    crossings,
    series,
    projection,
    sources: {
      primary: primarySource,
      livePrice: livePrice?.source || "Coin Metrics daily PriceUSD",
      crosscheck: externalLatest ? "BGeometrics no-key latest endpoint" : "Unavailable during this refresh",
      definition: "Glassnode MVRV Z-Score metric guide",
      formula: "SMA7((market cap - realized cap) / cumulative population standard deviation of market cap); realized cap = market cap / MVRV",
      disclosure: "The historical line is a transparent public-data reconstruction of the classic formula using Coin Metrics Community market cap and MVRV. It is not Glassnode's proprietary entity-adjusted dataset. The 32/49/44-day spans are supplied research anchors; the 140-day 2022 span is measured from the public reconstruction. The forward line is a decaying-momentum timing scenario, not a BTC price forecast or a guaranteed top date."
    }
  };
}

async function fetchCoinMetricsHistory() {
  const endDate = new Date().toISOString().slice(0, 10);
  const query = new URLSearchParams({
    assets: "btc",
    metrics: "CapMrktCurUSD,CapMVRVCur,PriceUSD",
    frequency: "1d",
    start_time: "2010-07-18",
    end_time: endDate,
    page_size: "10000"
  });
  const payload = await fetchJson(`${COIN_METRICS_URL}?${query}`);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((row) => {
    const date = String(row.time || "").slice(0, 10);
    const marketCap = Number(row.CapMrktCurUSD);
    const mvrv = Number(row.CapMVRVCur);
    const price = Number(row.PriceUSD);
    return {
      date,
      timestamp: Date.parse(`${date}T00:00:00Z`),
      price,
      marketCap,
      mvrv,
      realizedCap: mvrv > 0 ? marketCap / mvrv : null,
      source: "coin-metrics-community"
    };
  }).filter(validMarketRow).sort((left, right) => left.timestamp - right.timestamp);
}

function validMarketRow(row) {
  return row?.date
    && Number.isFinite(row.timestamp)
    && Number.isFinite(row.price) && row.price > 0
    && Number.isFinite(row.marketCap) && row.marketCap > 0
    && Number.isFinite(row.mvrv) && row.mvrv > 0
    && Number.isFinite(row.realizedCap) && row.realizedCap > 0;
}

function buildMvrvZscoreSeries(rows, smoothingDays = 7) {
  const ordered = [...rows].filter(validMarketRow).sort((left, right) => left.timestamp - right.timestamp);
  let count = 0;
  let mean = 0;
  let m2 = 0;
  const rawWindow = [];
  let rawSum = 0;
  const result = [];

  ordered.forEach((row) => {
    count += 1;
    const delta = row.marketCap - mean;
    mean += delta / count;
    m2 += delta * (row.marketCap - mean);
    const standardDeviation = count > 1 ? Math.sqrt(m2 / count) : 0;
    if (!(standardDeviation > 0)) return;
    const rawZScore = (row.marketCap - row.realizedCap) / standardDeviation;
    if (!Number.isFinite(rawZScore)) return;
    rawWindow.push(rawZScore);
    rawSum += rawZScore;
    if (rawWindow.length > smoothingDays) rawSum -= rawWindow.shift();
    if (rawWindow.length < smoothingDays) return;
    result.push({
      date: row.date,
      timestamp: row.timestamp,
      price: row.price,
      marketCap: row.marketCap,
      realizedCap: row.realizedCap,
      mvrv: row.mvrv,
      rawZScore,
      zScore: rawSum / smoothingDays,
      source: row.source || "public-reconstruction"
    });
  });
  return result;
}

function detectThresholdCrossings(series, threshold = THRESHOLD) {
  const crossings = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (previous.zScore < threshold && current.zScore >= threshold) {
      crossings.push({ date: current.date, timestamp: current.timestamp, zScore: current.zScore, price: current.price });
    }
  }
  return crossings;
}

function calculateMvrvZscoreSnapshot(series, crossings, livePrice = null, externalLatest = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const prior7 = series.at(-8) || series[0];
  const currentCross = [...crossings].reverse().find((row) => row.date <= latest.date) || null;
  const referenceStartDate = currentCross?.date || latest.date;
  const elapsedDays = Math.max(0, dayDifference(referenceStartDate, latest.date));
  const recent180 = series.slice(-180);
  const recentPeak = recent180.reduce((best, row) => !best || row.zScore > best.zScore ? row : best, null);
  const classicTargetDate = addDays(referenceStartDate, CLASSIC_REFERENCE_DAYS);
  const expandedTargetDate = addDays(referenceStartDate, EXPANDED_REFERENCE_DAYS);
  const classicWindowStartDate = addDays(referenceStartDate, Math.min(...REFERENCE_CYCLES.slice(0, 3).map((row) => row.durationDays)));
  const classicWindowEndDate = addDays(referenceStartDate, Math.max(...REFERENCE_CYCLES.slice(0, 3).map((row) => row.durationDays)));
  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    currentZScore: latest.zScore,
    rawZScore: latest.rawZScore,
    currentMvrv: latest.mvrv ?? null,
    threshold: THRESHOLD,
    thresholdDistance: latest.zScore - THRESHOLD,
    sevenDayChange: latest.zScore - prior7.zScore,
    trend: latest.zScore > prior7.zScore + 0.03 ? "rising" : latest.zScore < prior7.zScore - 0.03 ? "falling" : "flat",
    zone: classifyMvrvZScore(latest.zScore),
    recentPeak: recentPeak?.zScore ?? null,
    recentPeakDate: recentPeak?.date || null,
    referenceStartDate,
    referenceElapsedDays: elapsedDays,
    classicReferenceDays: CLASSIC_REFERENCE_DAYS,
    classicRemainingDays: Math.max(0, CLASSIC_REFERENCE_DAYS - elapsedDays),
    classicTargetDate,
    classicWindowStartDate,
    classicWindowEndDate,
    expandedReferenceDays: EXPANDED_REFERENCE_DAYS,
    expandedRemainingDays: Math.max(0, EXPANDED_REFERENCE_DAYS - elapsedDays),
    expandedTargetDate,
    bgeometricsZScore: externalLatest?.zScore ?? null,
    bgeometricsAsOf: externalLatest?.date || null,
    bgeometricsDelayed: externalLatest?.delayed ?? null
  };
}

function classifyMvrvZScore(value) {
  if (value < 0) return "undervalued";
  if (value < THRESHOLD) return "recovery";
  if (value < 3) return "expansion";
  if (value < 7) return "heated";
  return "overheated";
}

function projectMvrvZscoreScenario(series, snapshot, minimumDays = 30) {
  if (!series.length || !snapshot) return [];
  const latest = series.at(-1);
  const lookback = series.at(-31) || series[0];
  const lookbackDays = Math.max(1, dayDifference(lookback.date, latest.date));
  const dailyMomentum = (latest.zScore - lookback.zScore) / lookbackDays;
  const horizon = Math.max(minimumDays, snapshot.expandedRemainingDays);
  const boundedMomentum = Math.max(-0.04, Math.min(0.04, dailyMomentum));
  return Array.from({ length: horizon }, (_, index) => {
    const day = index + 1;
    const decayDays = 18;
    const trendContribution = boundedMomentum * decayDays * (1 - Math.exp(-day / decayDays));
    const uncertaintyWave = Math.sin(day / 5) * 0.025 * Math.exp(-day / 45);
    return {
      date: addDays(latest.date, day),
      zScore: Math.max(-1, Math.min(10, latest.zScore + trendContribution + uncertaintyWave)),
      referenceDay: snapshot.referenceElapsedDays + day
    };
  });
}

async function fetchBgeometricsLatest() {
  const payload = await fetchJson(BGEOMETRICS_LATEST_URL, 12_000);
  const row = unwrapRows(payload).at(-1) || payload;
  const zScore = firstFinite(row?.mvrvZscore, row?.mvrv_zscore, row?.value);
  if (!Number.isFinite(zScore)) throw new Error("BGeometrics latest MVRV Z-Score was unavailable");
  return {
    date: String(row?.d || row?.date || ""),
    zScore,
    delayed: Boolean(row?.delayed)
  };
}

async function fetchBgeometricsHistory() {
  const payload = await fetchJson(BGEOMETRICS_HISTORY_URL);
  return unwrapRows(payload).map((row) => {
    const date = String(row?.d || row?.date || "").slice(0, 10);
    return {
      date,
      timestamp: Date.parse(`${date}T00:00:00Z`),
      price: firstFinite(row?.btcPrice, row?.price, row?.PriceUSD),
      marketCap: null,
      realizedCap: null,
      mvrv: firstFinite(row?.mvrv, row?.mvrvRatio),
      rawZScore: firstFinite(row?.mvrvZscore, row?.mvrv_zscore, row?.value),
      zScore: firstFinite(row?.mvrvZscore, row?.mvrv_zscore, row?.value),
      source: "bgeometrics-no-key"
    };
  }).filter((row) => row.date && Number.isFinite(row.timestamp) && Number.isFinite(row.price) && row.price > 0 && Number.isFinite(row.zScore))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (payload?._embedded && typeof payload._embedded === "object") {
    return Object.values(payload._embedded).find(Array.isArray) || [];
  }
  return [];
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

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function dayDifference(startDate, endDate) {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
}

export {
  THRESHOLD,
  REFERENCE_CYCLES,
  CLASSIC_REFERENCE_DAYS,
  EXPANDED_REFERENCE_DAYS,
  buildMvrvZscoreSeries,
  detectThresholdCrossings,
  calculateMvrvZscoreSnapshot,
  projectMvrvZscoreScenario,
  classifyMvrvZScore,
  addDays,
  dayDifference
};
