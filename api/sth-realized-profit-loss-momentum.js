const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;

const FILE_BASE = "https://charts.bgeometrics.com/files";
const FULL_HISTORY_URLS = {
  profit: `${FILE_BASE}/realized_profit_sth.json`,
  loss: `${FILE_BASE}/realized_loss_sth.json`,
  price: `${FILE_BASE}/realized_profit_loss_ratio_btc_price.json`
};
const RECENT_API_BASE = "https://bitcoin-data.com/v1";
const PUBLIC_HISTORY_MIRROR = "https://ai.welinkbtc.xyz/api/lth-exchange-loss?schema=1";
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

const REFERENCE_CYCLES = [
  { cycle: "2015", startDate: "2015-07-14", peakDate: "2015-11-04", durationDays: 113 },
  { cycle: "2019", startDate: "2018-11-21", peakDate: "2019-04-09", durationDays: 139 },
  { cycle: "2022", startDate: "2022-10-16", peakDate: "2023-01-27", durationDays: 103 }
];
const REFERENCE_CURRENT_START_DATE = "2026-08-20";
const REFERENCE_CURRENT_AS_OF_DATE = "2026-09-16";
const REFERENCE_AVERAGE_DAYS = Math.round(
  REFERENCE_CYCLES.reduce((sum, row) => sum + row.durationDays, 0) / REFERENCE_CYCLES.length
);
const PUBLIC_PEAK_WINDOWS = [
  { cycle: "2015", start: "2015-01-01", end: "2016-12-31" },
  { cycle: "2019", start: "2018-01-01", end: "2020-12-31" },
  { cycle: "2022", start: "2022-01-01", end: "2023-12-31" }
];

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
  const cache = globalThis.__welinkSthRealizedProfitLossMomentumV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildSthMomentumPayload();
    globalThis.__welinkSthRealizedProfitLossMomentumV1 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "STH realized profit/loss momentum refresh failed; serving the latest valid public reconstruction."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load Bitcoin STH realized profit/loss momentum",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

async function buildSthMomentumPayload() {
  const [fullResult, recentResult, liveResult] = await Promise.allSettled([
    fetchFullHistory(),
    fetchRecentHistory(),
    fetchLiveBtcPrice()
  ]);

  let fullRows = fullResult.status === "fulfilled" ? fullResult.value : [];
  let fullHistorySource = "BGeometrics public full-history files";
  if (fullRows.length < 730) {
    fullRows = await fetchPublicHistoryMirror();
    fullHistorySource = "welinkBTC cached BGeometrics public-history mirror";
  }
  const recentRows = recentResult.status === "fulfilled" ? recentResult.value : [];
  const rawRows = mergeSourceRows(fullRows, recentRows);
  const series = buildSthMomentumSeries(rawRows);
  if (series.length < 365) throw new Error("Public STH realized profit/loss history returned too few aligned observations");

  const publicPeaks = calculatePublicPeaks(series);
  const projection = projectMomentumScenario(series, publicPeaks);
  const livePrice = liveResult.status === "fulfilled" ? liveResult.value : null;
  const snapshot = calculateSthMomentumSnapshot(series, publicPeaks, projection, livePrice);
  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cadence: "daily",
    cacheSeconds: CACHE_TTL_MS / 1000,
    completeHistory: rawRows[0]?.date <= "2013-01-01",
    entityAdjusted: false,
    methodology: "sma_7d_of_sth_realized_profit_loss_ratio_divided_by_sma_365d",
    referenceAverageDays: REFERENCE_AVERAGE_DAYS,
    referenceCurrentStartDate: REFERENCE_CURRENT_START_DATE,
    referenceCurrentAsOfDate: REFERENCE_CURRENT_AS_OF_DATE,
    snapshot,
    referenceCycles: REFERENCE_CYCLES,
    publicPeaks,
    series,
    projection,
    sources: {
      fullHistory: fullHistorySource,
      recent: recentRows.length ? "BGeometrics no-token API · latest four years" : "Full-history source only",
      livePrice: livePrice?.source || "BGeometrics daily BTC price",
      definition: "Glassnode STH Realized Profit/Loss Ratio Momentum",
      formula: "SMA7(STH realized profit / abs(STH realized loss)) / SMA365(STH realized profit / abs(STH realized loss))",
      disclosure: "The public series is a transparent UTXO-age STH proxy built from BGeometrics public realized-profit and realized-loss data. It does not reproduce Glassnode's proprietary entity-cluster adjustment. The 113/139/103-day spans and the 2026 reference start are supplied research anchors and remain separate from public-data peaks. The forward line is a timing scenario, not a price or return forecast."
    }
  };
}

async function fetchFullHistory() {
  const [profit, loss, price] = await Promise.all([
    fetchPairSeries(FULL_HISTORY_URLS.profit),
    fetchPairSeries(FULL_HISTORY_URLS.loss),
    fetchPairSeries(FULL_HISTORY_URLS.price)
  ]);
  return alignSourceSeries(profit, loss, price, "full-history");
}

async function fetchRecentHistory() {
  const [profit, loss, price] = await Promise.all([
    fetchJson(`${RECENT_API_BASE}/realized_profit_sth`),
    fetchJson(`${RECENT_API_BASE}/realized_loss_sth`),
    fetchJson(`${RECENT_API_BASE}/btc-price`)
  ]);
  const profitRows = normalizeObjectSeries(profit, "realizedProfitSth");
  const lossRows = normalizeObjectSeries(loss, "realizedLossSth");
  const priceRows = normalizeObjectSeries(price, "btcPrice");
  return alignSourceSeries(profitRows, lossRows, priceRows, "recent-api");
}

async function fetchPublicHistoryMirror() {
  const payload = await fetchJson(PUBLIC_HISTORY_MIRROR);
  return (payload?.series || []).map((row) => ({
    date: String(row.date || ""),
    timestamp: Date.parse(`${row.date}T00:00:00Z`),
    price: Number(row.price),
    profit: Math.abs(Number(row.sthProfitUsd)),
    loss: Math.abs(Number(row.sthLossUsd)),
    source: "public-mirror"
  })).filter(validRawRow);
}

function alignSourceSeries(profitRows, lossRows, priceRows, source) {
  const lossByTime = new Map(lossRows.map((row) => [row.timestamp, row.value]));
  const priceByTime = new Map(priceRows.map((row) => [row.timestamp, row.value]));
  return profitRows.map((row) => ({
    date: new Date(row.timestamp).toISOString().slice(0, 10),
    timestamp: row.timestamp,
    price: Number(priceByTime.get(row.timestamp)),
    profit: Math.abs(Number(row.value)),
    loss: Math.abs(Number(lossByTime.get(row.timestamp))),
    source
  })).filter(validRawRow);
}

function validRawRow(row) {
  return row?.date
    && Number.isFinite(row.timestamp)
    && Number.isFinite(row.price) && row.price > 0
    && Number.isFinite(row.profit) && row.profit >= 0
    && Number.isFinite(row.loss) && row.loss > 0;
}

function mergeSourceRows(...collections) {
  const byDate = new Map();
  collections.flat().filter(validRawRow).forEach((row) => byDate.set(row.date, row));
  return [...byDate.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function buildSthMomentumSeries(rows) {
  const raw = rows.map((row) => ({ ...row, rawRatio: row.profit / row.loss }))
    .filter((row) => Number.isFinite(row.rawRatio) && row.rawRatio >= 0);
  const rolling7 = [];
  const rolling365 = [];
  let sum7 = 0;
  let sum365 = 0;
  const result = [];
  raw.forEach((row) => {
    rolling7.push(row.rawRatio);
    rolling365.push(row.rawRatio);
    sum7 += row.rawRatio;
    sum365 += row.rawRatio;
    if (rolling7.length > 7) sum7 -= rolling7.shift();
    if (rolling365.length > 365) sum365 -= rolling365.shift();
    if (rolling365.length < 365) return;
    const ratio7 = sum7 / rolling7.length;
    const ratio365 = sum365 / rolling365.length;
    const momentum = ratio365 > 0 ? ratio7 / ratio365 : null;
    if (!Number.isFinite(momentum) || momentum < 0) return;
    result.push({
      date: row.date,
      timestamp: row.timestamp,
      price: row.price,
      rawRatio: row.rawRatio,
      ratio7,
      ratio365,
      momentum,
      source: row.source
    });
  });
  return result;
}

function calculatePublicPeaks(series, windows = PUBLIC_PEAK_WINDOWS) {
  return windows.map((window) => {
    const rows = series.filter((row) => row.date >= window.start && row.date <= window.end);
    const peak = rows.reduce((best, row) => !best || row.momentum > best.momentum ? row : best, null);
    return peak ? { cycle: window.cycle, date: peak.date, momentum: peak.momentum, price: peak.price } : null;
  }).filter(Boolean);
}

function classifyMomentum(momentum) {
  if (momentum < 0.5) return "depressed";
  if (momentum < 1) return "loss-dominant";
  if (momentum < 3) return "expansion";
  if (momentum < 8) return "accelerating";
  return "distribution";
}

function calculateSthMomentumSnapshot(series, publicPeaks, projection, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const prior7 = series.at(-8) || series[0];
  const recent180 = series.slice(-180);
  const recentTrough = recent180.reduce((best, row) => !best || row.momentum < best.momentum ? row : best, null);
  const recentPeak = recent180.reduce((best, row) => !best || row.momentum > best.momentum ? row : best, null);
  const referenceAsOfDate = latest.date > REFERENCE_CURRENT_AS_OF_DATE ? latest.date : REFERENCE_CURRENT_AS_OF_DATE;
  const referenceElapsedDays = Math.max(0, dayDifference(REFERENCE_CURRENT_START_DATE, referenceAsOfDate));
  const remainingDays = Math.max(0, REFERENCE_AVERAGE_DAYS - referenceElapsedDays);
  const targetDate = addDays(REFERENCE_CURRENT_START_DATE, REFERENCE_AVERAGE_DAYS);
  const trend = latest.momentum > prior7.momentum * 1.05 ? "rising"
    : latest.momentum < prior7.momentum * 0.95 ? "falling"
      : "flat";
  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    currentMomentum: latest.momentum,
    rawRatio: latest.rawRatio,
    ratio7: latest.ratio7,
    ratio365: latest.ratio365,
    sevenDayChange: latest.momentum - prior7.momentum,
    trend,
    zone: classifyMomentum(latest.momentum),
    recentTrough: recentTrough?.momentum ?? null,
    recentTroughDate: recentTrough?.date || null,
    recentPeak: recentPeak?.momentum ?? null,
    recentPeakDate: recentPeak?.date || null,
    drawdownFromRecentPeak: recentPeak?.momentum > 0 ? latest.momentum / recentPeak.momentum - 1 : null,
    referenceStartDate: REFERENCE_CURRENT_START_DATE,
    referenceAsOfDate,
    referenceElapsedDays,
    averageCycleDays: REFERENCE_AVERAGE_DAYS,
    remainingDays,
    targetDate,
    historicalPublicPeakAverage: publicPeaks.length
      ? publicPeaks.reduce((sum, row) => sum + row.momentum, 0) / publicPeaks.length
      : null,
    scenarioEndMomentum: projection.at(-1)?.momentum ?? latest.momentum
  };
}

function projectMomentumScenario(series, publicPeaks, minimumDays = 0) {
  if (!Array.isArray(series) || !series.length) return [];
  const latest = series.at(-1);
  const projectionStartDate = latest.date > REFERENCE_CURRENT_AS_OF_DATE ? latest.date : REFERENCE_CURRENT_AS_OF_DATE;
  const elapsed = Math.max(0, dayDifference(REFERENCE_CURRENT_START_DATE, projectionStartDate));
  const days = Math.max(minimumDays, REFERENCE_AVERAGE_DAYS - elapsed);
  if (days <= 0) return [];
  const target = publicPeaks.length
    ? publicPeaks.reduce((sum, row) => sum + row.momentum, 0) / publicPeaks.length
    : Math.max(3, latest.momentum * 2);
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const progress = day / days;
    const ease = progress * progress * (3 - 2 * progress);
    const ripple = Math.sin(progress * Math.PI * 5) * target * 0.045 * (1 - progress);
    return {
      date: addDays(projectionStartDate, day),
      momentum: Math.max(0.01, latest.momentum + (target - latest.momentum) * ease + ripple),
      referenceDay: elapsed + day
    };
  });
}

async function fetchPairSeries(url) {
  const payload = await fetchJson(url);
  if (!Array.isArray(payload)) return [];
  return payload.map((row) => {
    if (!Array.isArray(row) || row.length < 2) return null;
    const timestamp = normalizeTimestamp(row[0]);
    const value = Number(row[1]);
    return Number.isFinite(timestamp) && Number.isFinite(value) ? { timestamp, value } : null;
  }).filter(Boolean).sort((left, right) => left.timestamp - right.timestamp);
}

function normalizeObjectSeries(payload, key) {
  const embedded = payload?._embedded;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.content)
      ? payload.content
      : embedded && typeof embedded === "object"
        ? Object.values(embedded).find(Array.isArray) || []
        : payload && typeof payload === "object" && (payload.d || payload.date || payload.unixTs)
          ? [payload]
          : [];
  return rows.map((row) => {
    const rawDate = row?.d || row?.date;
    const timestamp = normalizeTimestamp(row?.unixTs ?? row?.timestamp ?? Date.parse(`${rawDate}T00:00:00Z`));
    const exactKey = Object.keys(row || {}).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    const fallbackKey = Object.keys(row || {}).find((candidate) => !["d", "date", "unixts", "timestamp", "id"].includes(candidate.toLowerCase()) && Number.isFinite(Number(row[candidate])));
    const value = Number(row?.[exactKey || fallbackKey]);
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

function dayDifference(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export {
  REFERENCE_CYCLES,
  REFERENCE_CURRENT_START_DATE,
  REFERENCE_CURRENT_AS_OF_DATE,
  REFERENCE_AVERAGE_DAYS,
  buildSthMomentumPayload,
  buildSthMomentumSeries,
  calculatePublicPeaks,
  calculateSthMomentumSnapshot,
  classifyMomentum,
  mergeSourceRows,
  projectMomentumScenario
};
