import { buildUnder3mPayload } from "./under-3m-realized-cap-hodl-waves.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const CAUTION_THRESHOLD = 0.39;
const OVERHEAT_THRESHOLD = 0.45;
const REFERENCE_CURRENT = 0.317;
const DAY_MS = 86_400_000;

const REFERENCE_WINDOWS = [
  { cycle: "2016", start: "2016-01-01", end: "2016-12-31", referenceValue: 0.392 },
  { cycle: "2019", start: "2019-01-01", end: "2020-02-29", referenceValue: 0.437 },
  { cycle: "2024", start: "2024-01-01", end: "2024-12-31", referenceValue: 0.447 }
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
  const cache = globalThis.__welinkUnder3mRealizedCapCycleCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const base = await buildUnder3mPayload();
    const referenceCycles = calculateReferenceCycles(base.series);
    const projection = projectUnder3mCycle(base.series);
    const payload = {
      ...base,
      generatedAt: new Date().toISOString(),
      methodology: "public_under_3m_realized_cap_share_with_reference_peak_benchmarks_and_momentum_decay_scenario",
      thresholds: { caution: CAUTION_THRESHOLD, overheat: OVERHEAT_THRESHOLD },
      snapshot: base.snapshot,
      cycleSnapshot: buildCycleSnapshot(base.snapshot, projection),
      referenceCycles,
      projection,
      sources: {
        ...base.sources,
        reference: "CryptoChan reference figure supplied for this model",
        disclosure: "The live series is the transparent public-data complement <3m = 100% - 3m+. The 39.2%, 43.7%, 44.7% and 31.7% figures are separately labelled reference-model anchors and are never substituted for the live public observation. The forward path is a reproducible research scenario, not a price or return forecast."
      }
    };
    globalThis.__welinkUnder3mRealizedCapCycleCacheV1 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "<3m realized-cap cycle refresh failed; serving the latest valid public payload."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load Bitcoin <3m Realized Cap cycle model",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

function buildCycleSnapshot(snapshot, projection) {
  const current = Number(snapshot.current);
  return {
    ...snapshot,
    current,
    zone: classifyHeatZone(current),
    distanceToCaution: CAUTION_THRESHOLD - current,
    distanceToOverheat: OVERHEAT_THRESHOLD - current,
    referenceCurrent: REFERENCE_CURRENT,
    referenceDivergence: current - REFERENCE_CURRENT,
    referenceLabel: "reference-figure",
    scenarioEnd: projection.at(-1)?.value ?? current,
    scenarioEndDate: projection.at(-1)?.date ?? snapshot.onchainAsOf,
    scenarioMethod: "90d_momentum_decay_plus_four_year_median_reversion"
  };
}

function classifyHeatZone(value) {
  if (value >= OVERHEAT_THRESHOLD) return "overheated";
  if (value >= CAUTION_THRESHOLD) return "caution";
  if (value >= 0.3) return "expansion";
  return "cooldown";
}

function calculateReferenceCycles(series, windows = REFERENCE_WINDOWS) {
  return windows.map((window) => {
    const rows = series.filter((row) => row.date >= window.start && row.date <= window.end);
    const observed = rows.reduce((best, row) => !best || row.underThreeMonths > best.underThreeMonths ? row : best, null);
    return {
      ...window,
      observedDate: observed?.date || null,
      observedValue: observed?.underThreeMonths ?? null,
      observedPrice: observed?.price ?? null
    };
  });
}

function projectUnder3mCycle(series, days = 365) {
  if (!Array.isArray(series) || series.length < 91 || days < 1) return [];
  const latest = series.at(-1);
  const prior = series.at(-91);
  const recentMomentum = clamp((latest.average7 - prior.average7) / 90, -0.0015, 0.0015);
  const fourYearValues = series.slice(-1460).map((row) => Number(row.underThreeMonths)).filter(Number.isFinite).sort((a, b) => a - b);
  const median = fourYearValues.length
    ? fourYearValues[Math.floor(fourYearValues.length / 2)]
    : Number(latest.average30);
  const start = new Date(`${latest.date}T00:00:00.000Z`).getTime();
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    const momentumContribution = recentMomentum * 75 * (1 - Math.exp(-day / 75));
    const medianContribution = (median - latest.underThreeMonths) * 0.45 * (1 - Math.exp(-day / 365));
    return {
      date: new Date(start + day * DAY_MS).toISOString().slice(0, 10),
      value: clamp(latest.underThreeMonths + momentumContribution + medianContribution, 0, 1)
    };
  });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

export {
  CAUTION_THRESHOLD,
  OVERHEAT_THRESHOLD,
  REFERENCE_CURRENT,
  REFERENCE_WINDOWS,
  buildCycleSnapshot,
  calculateReferenceCycles,
  classifyHeatZone,
  projectUnder3mCycle
};
