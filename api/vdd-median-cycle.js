import { buildPayload as buildMedianRealizedPayload } from "./median-realized-price.js";
import { buildVddPayload } from "./vdd-multiple.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const BOTTOM_VDD_THRESHOLD = 0.9;
const BOTTOM_MEDIAN_RATIO = 1.25;
const TOP_VDD_THRESHOLD = 1.5;
const TOP_MEDIAN_RATIO = 1.5;
const MIN_BOTTOM_DAYS = 20;
const REFERENCE_WINDOWS = [
  { cycle: "2019", daysToTop: 687 },
  { cycle: "2023", daysToTop: 678 }
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
  const cache = globalThis.__welinkVddMedianCycleCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildVddMedianCyclePayload();
    globalThis.__welinkVddMedianCycleCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "VDD / median-price model refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load the BTC VDD / median-price cycle model",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildVddMedianCyclePayload() {
  const [vddPayload, medianPayload] = await Promise.all([
    buildVddPayload(),
    buildMedianRealizedPayload()
  ]);
  const series = mergeVddMedianSeries(vddPayload.series, medianPayload.series);
  if (series.length < 1_000) throw new Error("Public VDD / median-price history returned too few aligned observations");

  const bottomZones = detectBottomZones(series);
  const topZones = detectTopZones(series);
  const referenceCycles = buildReferenceCycles(series, bottomZones);
  const livePrice = Number(vddPayload?.snapshot?.price);
  const snapshot = calculateVddMedianCycleSnapshot(
    series,
    bottomZones,
    referenceCycles,
    Number.isFinite(livePrice) ? {
      value: livePrice,
      asOf: vddPayload.snapshot.priceAsOf,
      source: vddPayload.sources?.price
    } : null
  );

  return {
    ok: true,
    stale: Boolean(vddPayload.stale || medianPayload.stale),
    estimated: Boolean(vddPayload.estimated || medianPayload.estimatedHistory),
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    thresholds: {
      bottomVdd: BOTTOM_VDD_THRESHOLD,
      bottomMedianRatio: BOTTOM_MEDIAN_RATIO,
      topVdd: TOP_VDD_THRESHOLD,
      topMedianRatio: TOP_MEDIAN_RATIO
    },
    snapshot,
    bottomZones,
    topZones,
    referenceCycles,
    series,
    sources: {
      price: vddPayload.sources?.price || medianPayload.sources?.price || "Binance Spot",
      vdd: vddPayload.sources?.history || "BGeometrics public daily API",
      median: medianPayload.sources?.median || "BGeometrics public HODL reconstruction",
      vddMethodology: vddPayload.sources?.methodology,
      medianMethodology: medianPayload.sources?.methodology,
      methodology: "Bottom zone: VDD Multiple < 0.9 and BTC / Median Realized Price <= 1.25. Top-risk bar: VDD Multiple >= 1.5 and BTC / Median Realized Price >= 1.5. Historical reference windows are 687 and 678 days."
    }
  };
}

function mergeVddMedianSeries(vddRows, medianRows) {
  const medianByDate = new Map((medianRows || [])
    .filter((row) => Number.isFinite(Number(row?.median)) && Number(row.median) > 0)
    .map((row) => [row.date, row]));

  return (vddRows || []).map((row) => {
    const medianRow = medianByDate.get(row?.date);
    const price = Number(row?.price);
    const vdd = Number(row?.vdd);
    const median = Number(medianRow?.median);
    if (!medianRow || !Number.isFinite(price) || price <= 0 || !Number.isFinite(vdd) || vdd < 0 || !Number.isFinite(median) || median <= 0) return null;
    const medianRatio = price / median;
    const bottomSignal = vdd < BOTTOM_VDD_THRESHOLD && medianRatio <= BOTTOM_MEDIAN_RATIO;
    const topSignal = vdd >= TOP_VDD_THRESHOLD && medianRatio >= TOP_MEDIAN_RATIO;
    return {
      date: row.date,
      price,
      median,
      medianEstimated: Boolean(medianRow.medianEstimated),
      vdd,
      medianRatio,
      bottomSignal,
      topSignal,
      topScore: (vdd / TOP_VDD_THRESHOLD) * (medianRatio / TOP_MEDIAN_RATIO)
    };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function detectZones(series, key, minDays) {
  const zones = [];
  let active = null;
  series.forEach((row) => {
    if (row[key]) {
      if (!active) {
        active = {
          start: row.date,
          end: row.date,
          days: 0,
          minVdd: row.vdd,
          maxVdd: row.vdd,
          minMedianRatio: row.medianRatio,
          maxMedianRatio: row.medianRatio,
          minPrice: row.price,
          maxPrice: row.price
        };
      }
      active.end = row.date;
      active.days += 1;
      active.minVdd = Math.min(active.minVdd, row.vdd);
      active.maxVdd = Math.max(active.maxVdd, row.vdd);
      active.minMedianRatio = Math.min(active.minMedianRatio, row.medianRatio);
      active.maxMedianRatio = Math.max(active.maxMedianRatio, row.medianRatio);
      active.minPrice = Math.min(active.minPrice, row.price);
      active.maxPrice = Math.max(active.maxPrice, row.price);
    } else if (active) {
      if (active.days >= minDays) zones.push(active);
      active = null;
    }
  });
  if (active && active.days >= minDays) zones.push(active);
  return zones;
}

function detectBottomZones(series) {
  return detectZones(series, "bottomSignal", MIN_BOTTOM_DAYS).slice(-16);
}

function detectTopZones(series) {
  return detectZones(series, "topSignal", 1).slice(-24);
}

function nearestRow(series, targetTimestamp) {
  return series.reduce((best, row) => {
    const distance = Math.abs(Date.parse(`${row.date}T00:00:00Z`) - targetTimestamp);
    return !best || distance < best.distance ? { row, distance } : best;
  }, null)?.row || null;
}

function firstRowAfter(series, date) {
  return series.find((row) => row.date > date) || null;
}

function selectReferenceBottomZones(bottomZones) {
  return REFERENCE_WINDOWS.map(({ cycle }) => {
    const year = Number(cycle);
    return [...bottomZones]
      .filter((zone) => Number(zone.end.slice(0, 4)) === year)
      .sort((left, right) => right.days - left.days || right.end.localeCompare(left.end))[0] || null;
  });
}

function buildReferenceCycles(series, bottomZones) {
  const selectedZones = selectReferenceBottomZones(bottomZones);
  return REFERENCE_WINDOWS.map((reference, index) => {
    const zone = selectedZones[index];
    if (!zone) return null;
    const recovery = firstRowAfter(series, zone.end) || nearestRow(series, Date.parse(`${zone.end}T00:00:00Z`) + DAY_MS);
    if (!recovery) return null;
    const targetTimestamp = Date.parse(`${recovery.date}T00:00:00Z`) + reference.daysToTop * DAY_MS;
    const top = nearestRow(series, targetTimestamp);
    if (!top) return null;
    return {
      cycle: reference.cycle,
      bottomStart: zone.start,
      bottomEnd: recovery.date,
      topSignalDate: top.date,
      daysToTop: reference.daysToTop,
      monthsToTop: reference.daysToTop / 30.4375,
      bottomMinVdd: zone.minVdd,
      bottomMinMedianRatio: zone.minMedianRatio,
      topVdd: top.vdd,
      topMedianRatio: top.medianRatio,
      topPrice: top.price
    };
  }).filter(Boolean);
}

function findLatestCompletedBottom(bottomZones, series) {
  for (let index = bottomZones.length - 1; index >= 0; index -= 1) {
    const zone = bottomZones[index];
    const recovery = firstRowAfter(series, zone.end);
    if (recovery) return { zone, recovery };
  }
  return null;
}

function calculateVddMedianCycleSnapshot(series, bottomZones, referenceCycles, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const completedBottom = findLatestCompletedBottom(bottomZones, series);
  const averageDaysToTop = referenceCycles.length
    ? referenceCycles.reduce((sum, cycle) => sum + cycle.daysToTop, 0) / referenceCycles.length
    : 683;
  const recoveryTimestamp = completedBottom
    ? Date.parse(`${completedBottom.recovery.date}T00:00:00Z`)
    : NaN;
  const projectedTopTimestamp = Number.isFinite(recoveryTimestamp)
    ? recoveryTimestamp + averageDaysToTop * DAY_MS
    : NaN;
  const liveValue = Number(livePrice?.value);
  const price = Number.isFinite(liveValue) && liveValue > 0 ? liveValue : latest.price;
  const liveMedianRatio = price / latest.median;
  const bottomActive = latest.bottomSignal;
  const topRiskActive = latest.topSignal;
  const elapsedHours = Number.isFinite(recoveryTimestamp)
    ? Math.max(0, (Date.now() - recoveryTimestamp) / 3_600_000)
    : null;
  const elapsedDays = Number.isFinite(recoveryTimestamp)
    ? Math.max(0, Math.floor((Date.parse(`${latest.date}T00:00:00Z`) - recoveryTimestamp) / DAY_MS))
    : null;
  const projectedTopDate = Number.isFinite(projectedTopTimestamp)
    ? new Date(projectedTopTimestamp).toISOString().slice(0, 10)
    : null;

  return {
    price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    median: latest.median,
    medianEstimated: latest.medianEstimated,
    vdd: latest.vdd,
    medianRatio: liveMedianRatio,
    bottomSignalActive: bottomActive,
    topRiskActive,
    latestBottomStart: completedBottom?.zone.start || null,
    latestBottomEnd: completedBottom?.recovery.date || null,
    elapsedHours,
    elapsedDays,
    averageDaysToTop,
    averageMonthsToTop: averageDaysToTop / 30.4375,
    projectedTopDate,
    projectedRiskStart: Number.isFinite(projectedTopTimestamp)
      ? new Date(projectedTopTimestamp - 30 * DAY_MS).toISOString().slice(0, 10)
      : null,
    projectedRiskEnd: Number.isFinite(projectedTopTimestamp)
      ? new Date(projectedTopTimestamp + 30 * DAY_MS).toISOString().slice(0, 10)
      : null,
    daysUntilProjectedTop: Number.isFinite(projectedTopTimestamp)
      ? Math.ceil((projectedTopTimestamp - Date.now()) / DAY_MS)
      : null,
    zone: topRiskActive ? "top-risk" : bottomActive ? "bottom" : Number.isFinite(elapsedDays) && elapsedDays <= averageDaysToTop ? "early-cycle" : "neutral",
    completedReferenceCycles: referenceCycles.length
  };
}

export {
  BOTTOM_MEDIAN_RATIO,
  BOTTOM_VDD_THRESHOLD,
  TOP_MEDIAN_RATIO,
  TOP_VDD_THRESHOLD,
  buildReferenceCycles,
  buildVddMedianCyclePayload,
  calculateVddMedianCycleSnapshot,
  detectBottomZones,
  detectTopZones,
  mergeVddMedianSeries
};
