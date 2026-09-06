import {
  fetchExactRealizedCapShares,
  fetchPublicRealizedCapHistory,
  fetchPublicSupplyHistory
} from "./_bgeometrics-hodl-history.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const BOTTOM_THRESHOLD = 0.05;
const ELEVATED_THRESHOLD = 1;
const OVERHEATED_THRESHOLD = 3;
const CALIBRATION_WINDOW_DAYS = 180;
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
  const cache = globalThis.__welinkSlrvRatioCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildSlrvPayload();
    globalThis.__welinkSlrvRatioCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "SLRV refresh failed; serving the latest valid public payload."
      }, "STALE");
      return;
    }
    response.status(502).json({
      ok: false,
      error: "Unable to load the Bitcoin SLRV ratio",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildSlrvPayload() {
  const [realizedRows, exactRows, priceRows, livePrice] = await Promise.all([
    fetchPublicRealizedCapHistory(),
    fetchExactRealizedCapShares().catch(() => []),
    fetchPublicSupplyHistory(),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const result = buildSlrvSeries(realizedRows, exactRows, priceRows);
  if (result.series.length < 1000) throw new Error("Public SLRV sources returned too few aligned observations");
  const lowZones = detectSlrvLowZones(result.series);
  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cadence: "daily",
    cacheSeconds: CACHE_TTL_MS / 1000,
    methodology: "7d_sma_of_24h_realized_hodl_wave_divided_by_6m_to_1y_realized_hodl_wave",
    thresholds: {
      bottom: BOTTOM_THRESHOLD,
      elevated: ELEVATED_THRESHOLD,
      overheated: OVERHEATED_THRESHOLD
    },
    calibration: result.calibration,
    snapshot: calculateSlrvSnapshot(result.series, livePrice),
    lowZones,
    series: result.series,
    sources: {
      history: "BGeometrics public realized-cap HODL Waves",
      exactExtension: result.calibration.extensionStart
        ? "Bitcoin Data public exact realized-cap HODL Waves"
        : null,
      price: livePrice?.source || "BGeometrics public daily BTC price",
      disclosure: "The recent exact public HODL-wave extension is robustly rescaled over the overlapping window to preserve the long-history BGeometrics SLRV scale. This does not reproduce a proprietary entity-adjusted feed."
    }
  };
}

function buildSlrvSeries(realizedRows, exactRows, priceRows) {
  const pricesByDate = new Map(priceRows.map((row) => [row.date, Number(row.price)]));
  const realizedByDate = new Map();
  realizedRows.forEach((row) => {
    const numerator = Number(row.age_0d_1d);
    const denominator = Number(row.age_6m_1y);
    if (Number.isFinite(numerator) && numerator >= 0 && Number.isFinite(denominator) && denominator > 0) {
      realizedByDate.set(row.date, numerator / denominator);
    }
  });

  const exactRatios = exactRows.map((row) => {
    const numerator = Number(row.age_0d_1d);
    const denominator = Number(row.age_6m_1y);
    if (!Number.isFinite(numerator) || numerator < 0 || !Number.isFinite(denominator) || denominator <= 0) return null;
    return { date: row.date, ratio: numerator / denominator };
  }).filter(Boolean);

  const overlapFactors = exactRatios
    .map((row) => {
      const baseline = realizedByDate.get(row.date);
      return Number.isFinite(baseline) && baseline > 0 && row.ratio > 0 ? baseline / row.ratio : null;
    })
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(-CALIBRATION_WINDOW_DAYS);
  const calibrationFactor = median(overlapFactors) || 1;
  const lastBaselineDate = [...realizedByDate.keys()].sort().at(-1) || null;
  let extensionStart = null;
  exactRatios.forEach((row) => {
    if (!lastBaselineDate || row.date <= lastBaselineDate || realizedByDate.has(row.date)) return;
    realizedByDate.set(row.date, row.ratio * calibrationFactor);
    if (!extensionStart) extensionStart = row.date;
  });

  const rawRows = [...realizedByDate.entries()]
    .map(([date, rawRatio]) => ({ date, rawRatio, price: pricesByDate.get(date) }))
    .filter((row) => Number.isFinite(row.rawRatio) && row.rawRatio > 0 && Number.isFinite(row.price) && row.price > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  const rolling7 = [];
  const rolling30 = [];
  let sum7 = 0;
  let sum30 = 0;
  const series = rawRows.map((row) => {
    rolling7.push(row.rawRatio);
    rolling30.push(row.rawRatio);
    sum7 += row.rawRatio;
    sum30 += row.rawRatio;
    if (rolling7.length > 7) sum7 -= rolling7.shift();
    if (rolling30.length > 30) sum30 -= rolling30.shift();
    return {
      ...row,
      slrv: sum7 / rolling7.length,
      average30: sum30 / rolling30.length,
      source: extensionStart && row.date >= extensionStart ? "exact-calibrated" : "bgeometrics"
    };
  });

  return {
    series,
    calibration: {
      factor: calibrationFactor,
      overlapDays: overlapFactors.length,
      baselineThrough: lastBaselineDate,
      extensionStart
    }
  };
}

function calculateSlrvSnapshot(series, livePrice) {
  const latest = series.at(-1);
  const prior7 = series.at(-8) || series[0];
  const current = latest.slrv;
  const trend = current > latest.average30 * 1.04
    ? "rising"
    : current < latest.average30 * 0.96 ? "falling" : "flat";
  return {
    current,
    rawCurrent: latest.rawRatio,
    average7: current,
    average30: latest.average30,
    sevenDayChange: current - prior7.slrv,
    distanceToBottom: current - BOTTOM_THRESHOLD,
    zone: classifySlrv(current),
    trend,
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    source: latest.source
  };
}

function classifySlrv(value) {
  if (value < BOTTOM_THRESHOLD) return "bottom";
  if (value < ELEVATED_THRESHOLD) return "normal";
  if (value < OVERHEATED_THRESHOLD) return "elevated";
  return "overheated";
}

function detectSlrvLowZones(series, minimumDays = 5) {
  const zones = [];
  let active = null;
  series.forEach((row, index) => {
    if (row.slrv < BOTTOM_THRESHOLD) {
      if (!active) active = { startIndex: index, start: row.date, min: row.slrv, minDate: row.date, minPrice: row.price };
      if (row.slrv < active.min) Object.assign(active, { min: row.slrv, minDate: row.date, minPrice: row.price });
      return;
    }
    if (!active) return;
    const endIndex = index - 1;
    const days = endIndex - active.startIndex + 1;
    if (days >= minimumDays) zones.push({ ...active, end: series[endIndex].date, days, active: false });
    active = null;
  });
  if (active) {
    const endIndex = series.length - 1;
    const days = endIndex - active.startIndex + 1;
    if (days >= minimumDays) zones.push({ ...active, end: series[endIndex].date, days, active: true });
  }
  return zones.map(({ startIndex, ...zone }) => zone);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7_000) });
      if (!response.ok) throw new Error(`Binance ticker ${response.status}`);
      const payload = await response.json();
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
}

export {
  buildSlrvSeries,
  calculateSlrvSnapshot,
  classifySlrv,
  detectSlrvLowZones,
  median
};
