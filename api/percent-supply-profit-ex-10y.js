import { fetchPublicSupplyHistory } from "./_bgeometrics-hodl-history.js";
import { buildPercentSupplyProfitPayload } from "./percent-supply-profit.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const PROJECTION_DAYS = 365;
const LEGACY_WASHOUT_THRESHOLD = 60;
const MODERN_WASHOUT_THRESHOLD = 55;

const REFERENCE_WINDOWS = Object.freeze([
  { cycle: "2012", start: "2012-01-01", end: "2012-12-31", threshold: LEGACY_WASHOUT_THRESHOLD },
  { cycle: "2016", start: "2016-01-01", end: "2016-12-31", threshold: LEGACY_WASHOUT_THRESHOLD },
  { cycle: "2019", start: "2019-06-01", end: "2020-02-29", threshold: MODERN_WASHOUT_THRESHOLD },
  { cycle: "2023", start: "2023-06-01", end: "2024-02-29", threshold: MODERN_WASHOUT_THRESHOLD }
]);

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
  const cache = globalThis.__welinkPercentSupplyProfitEx10yCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildPercentSupplyProfitEx10yPayload(new Date(now));
    globalThis.__welinkPercentSupplyProfitEx10yCacheV1 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date(now).toISOString(),
        warning: "Percent Supply in Profit [Ex >10y] refresh failed; serving the latest valid public-data payload."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load BTC Percent Supply in Profit [Ex >10y, 7DMA]",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

async function buildPercentSupplyProfitEx10yPayload(now = new Date()) {
  const [profitPayload, supplyHistory] = await Promise.all([
    buildPercentSupplyProfitPayload(),
    fetchPublicSupplyHistory()
  ]);
  const series = calculatePercentSupplyProfitEx10ySeries(profitPayload.series, supplyHistory);
  if (series.length < 1000) throw new Error("Public ex->10y profit history returned too few aligned observations");

  const referenceCycles = calculateReferenceCycles(series);
  const washoutZones = detectWashoutZones(series);
  const snapshot = calculateSnapshot(series, profitPayload.snapshot, referenceCycles);
  const projection = buildPercentProfitProjection(series, PROJECTION_DAYS);

  return {
    ok: true,
    stale: Boolean(profitPayload.stale),
    generatedAt: now.toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily-history + live-spot",
    thresholds: { legacy: LEGACY_WASHOUT_THRESHOLD, modern: MODERN_WASHOUT_THRESHOLD },
    snapshot,
    referenceCycles,
    washoutZones,
    projection,
    series,
    warning: profitPayload.warning || null,
    methodology: {
      model: "Transparent public-data proxy for Percent Supply in Profit [Ex >10y, 7DMA]",
      numerator: "Public supply in profit minus supply that has not moved for more than ten years.",
      denominator: "Public circulating supply minus supply that has not moved for more than ten years.",
      smoothing: "Seven-observation trailing arithmetic mean of the adjusted daily percentage.",
      assumption: "The >10y cohort is treated as profitable dormant supply and removed from both numerator and denominator.",
      projection: "A bounded 365-day scenario using damped recent momentum and mean reversion; it is not a price forecast."
    },
    sources: {
      price: profitPayload.sources?.price || "Binance Spot",
      profitLoss: profitPayload.sources?.history || "BGeometrics public daily API",
      dormantSupply: "https://charts.bgeometrics.com/files/hw_age_supply_10y_10.json",
      definition: profitPayload.sources?.definition || "https://docs.glassnode.com/guides-and-tutorials/metric-guides/profit-loss-supply/percent-supply-in-profit",
      methodology: "welinkBTC public-data proxy; this does not reproduce CryptoChan's proprietary entity-adjusted sequence."
    }
  };
}

function calculatePercentSupplyProfitEx10ySeries(profitRows, supplyRows) {
  const supplyByDate = new Map((supplyRows || []).map((row) => [String(row?.date || "").slice(0, 10), row]));
  const aligned = (profitRows || []).map((row) => {
    const date = String(row?.date || "").slice(0, 10);
    const supply = supplyByDate.get(date);
    const price = Number(row?.price);
    const totalSupply = Number(row?.totalSupply);
    const profitSupply = Number(row?.profitSupply);
    const lossSupply = Number(row?.lossSupply);
    const dormantOver10y = Number(supply?.age_10y);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || ![price, totalSupply, profitSupply, lossSupply, dormantOver10y].every(Number.isFinite)
      || price <= 0 || totalSupply <= 0 || dormantOver10y < 0 || dormantOver10y >= totalSupply) return null;
    const activeSupply = totalSupply - dormantOver10y;
    const activeProfitSupply = Math.max(0, profitSupply - dormantOver10y);
    const percentRaw = Math.max(0, Math.min(100, activeProfitSupply / activeSupply * 100));
    return {
      date,
      price,
      percentRaw,
      dormantOver10y,
      dormantShare: dormantOver10y / totalSupply * 100,
      activeSupply,
      activeProfitSupply,
      lossSupply,
      totalSupply
    };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));

  return aligned.map((row, index) => {
    const window = aligned.slice(Math.max(0, index - 6), index + 1);
    const percent7 = window.reduce((sum, item) => sum + item.percentRaw, 0) / window.length;
    return { ...row, percent7 };
  });
}

function calculateReferenceCycles(series, windows = REFERENCE_WINDOWS) {
  return windows.map((window) => {
    const rows = (series || []).filter((row) => row.date >= window.start && row.date <= window.end);
    const low = rows.reduce((result, row) => !result || row.percent7 < result.percent7 ? row : result, null);
    const below = rows.filter((row) => row.percent7 < window.threshold);
    if (!low) return null;
    return {
      ...window,
      lowDate: low.date,
      lowPercent: low.percent7,
      priceAtLow: low.price,
      signalStart: below.at(0)?.date || null,
      signalEnd: below.at(-1)?.date || null,
      triggered: below.length > 0
    };
  }).filter(Boolean);
}

function detectWashoutZones(series) {
  const zones = [];
  let active = null;
  (series || []).forEach((row) => {
    const threshold = row.date < "2018-01-01" ? LEGACY_WASHOUT_THRESHOLD : MODERN_WASHOUT_THRESHOLD;
    const below = row.percent7 < threshold;
    if (below && !active) active = { start: row.date, end: row.date, threshold, lowDate: row.date, lowPercent: row.percent7 };
    if (below && active) {
      active.end = row.date;
      if (row.percent7 < active.lowPercent) {
        active.lowPercent = row.percent7;
        active.lowDate = row.date;
      }
    }
    if (!below && active) {
      zones.push(active);
      active = null;
    }
  });
  if (active) zones.push(active);
  return zones;
}

function calculateSnapshot(series, baseSnapshot = null, referenceCycles = []) {
  const latest = series?.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.percent7, 0) / Math.max(rows.length, 1);
  };
  const previous7 = series.at(-Math.min(8, series.length));
  const change7 = latest.percent7 - previous7.percent7;
  const recentRows = series.slice(-365);
  const recentLow = recentRows.reduce((result, row) => !result || row.percent7 < result.percent7 ? row : result, null);
  const threshold = MODERN_WASHOUT_THRESHOLD;
  const zone = latest.percent7 <= threshold ? "washout"
    : latest.percent7 <= LEGACY_WASHOUT_THRESHOLD ? "deep-reset"
      : latest.percent7 < 75 ? "recovery"
        : latest.percent7 < 95 ? "expansion" : "overheated";
  return {
    asOf: latest.date,
    price: Number(baseSnapshot?.price) || latest.price,
    priceAsOf: baseSnapshot?.priceAsOf || `${latest.date}T00:00:00.000Z`,
    percentRaw: latest.percentRaw,
    percent7: latest.percent7,
    percent30: average(30),
    sevenDayChange: change7,
    trend: change7 > 0.4 ? "rising" : change7 < -0.4 ? "falling" : "flat",
    zone,
    dormantOver10y: latest.dormantOver10y,
    dormantShare: latest.dormantShare,
    activeSupply: latest.activeSupply,
    activeProfitSupply: latest.activeProfitSupply,
    lossSupply: latest.lossSupply,
    distanceTo55: latest.percent7 - MODERN_WASHOUT_THRESHOLD,
    distanceTo60: latest.percent7 - LEGACY_WASHOUT_THRESHOLD,
    recentLowDate: recentLow?.date || null,
    recentLowPercent: recentLow?.percent7 ?? null,
    washoutCompleted: Boolean(recentLow && recentLow.percent7 < threshold && latest.percent7 >= threshold),
    daysSinceRecentLow: recentLow ? daysBetween(recentLow.date, latest.date) : null,
    completedReferenceCycles: referenceCycles.filter((cycle) => cycle.triggered).length
  };
}

function buildPercentProfitProjection(series, projectionDays = PROJECTION_DAYS) {
  if (!series?.length) return [];
  const latest = series.at(-1);
  const momentumRows = series.slice(-30);
  const momentum = momentumRows.length > 1
    ? (momentumRows.at(-1).percent7 - momentumRows[0].percent7) / (momentumRows.length - 1)
    : 0;
  const fourYearRows = series.filter((row) => daysBetween(row.date, latest.date) <= 1461);
  const sorted = fourYearRows.map((row) => row.percent7).sort((a, b) => a - b);
  const target = sorted[Math.floor(sorted.length / 2)] ?? latest.percent7;
  const projection = [];
  for (let days = 7; days <= projectionDays; days += 7) {
    const progress = days / projectionDays;
    const dampedMomentum = momentum * days * (1 - 0.85 * progress);
    const meanReversion = (target - latest.percent7) * 0.35 * progress;
    projection.push({
      date: addDays(latest.date, days),
      percent7: Math.max(0, Math.min(100, latest.percent7 + dampedMomentum + meanReversion)),
      scenario: true
    });
  }
  return projection;
}

function daysBetween(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export {
  LEGACY_WASHOUT_THRESHOLD,
  MODERN_WASHOUT_THRESHOLD,
  REFERENCE_WINDOWS,
  buildPercentProfitProjection,
  buildPercentSupplyProfitEx10yPayload,
  calculatePercentSupplyProfitEx10ySeries,
  calculateReferenceCycles,
  calculateSnapshot,
  detectWashoutZones
};
