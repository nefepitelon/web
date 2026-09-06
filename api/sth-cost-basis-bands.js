import { buildPublicSeedPayload, buildSth200dmaPayload } from "./sth-200dma.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const FOUR_YEAR_DAYS = 365.25 * 4;
const MIN_WINDOW_OBSERVATIONS = 2;
const MACRO_BREAKOUT_GAP_DAYS = 120;
const PROJECTION_DAYS = 365;
const BAND_LEVELS = Object.freeze([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]);

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
  const cache = globalThis.__welinkSthCostBasisBandsCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildSthCostBasisBandsPayload(new Date(now));
    globalThis.__welinkSthCostBasisBandsCacheV1 = { savedAt: now, payload };
    return sendPayload(response, payload, payload.fallback ? "FALLBACK" : "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date(now).toISOString(),
        warning: "STH cost-basis bands refresh failed; serving the latest valid public-data payload."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load the BTC Short-Term Holder Cost Basis Bands model",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

async function buildSthCostBasisBandsPayload(now = new Date()) {
  let basePayload;
  try {
    basePayload = await buildSth200dmaPayload();
  } catch (error) {
    basePayload = await buildPublicSeedPayload(error);
  }

  const series = calculateSthCostBasisBandsSeries(basePayload.series);
  if (series.length < 365) throw new Error("Public STH cost-basis history returned too few observations");
  const breakouts = detectLine7Breakouts(series);
  const macroBreakouts = clusterMacroBreakouts(breakouts);
  const referenceBreakouts = buildReferenceBreakouts(series, macroBreakouts);
  const snapshot = calculateSthCostBasisBandsSnapshot(
    series,
    macroBreakouts,
    referenceBreakouts,
    basePayload.snapshot ? { value: Number(basePayload.snapshot.price), asOf: basePayload.snapshot.priceAsOf } : null,
    now
  );
  const projection = buildBandProjection(series, snapshot, PROJECTION_DAYS);

  return {
    ok: true,
    stale: Boolean(basePayload.stale),
    fallback: Boolean(basePayload.fallback),
    generatedAt: now.toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily-history + live-spot",
    methodology: {
      model: "Public-data proxy for the STH Cost Basis Model [4Y, 2011-]",
      basis: "Line5 is the public Short-Term Holder realized price (<155 days).",
      dispersion: "Population standard deviation of daily BTC price minus STH realized price over a trailing four-calendar-year window; the 2011 bootstrap uses the available expanding window until a complete four-year window exists.",
      lines: BAND_LEVELS.map((standardDeviations, index) => ({ line: index + 1, standardDeviations })),
      line7: "+1.0 standard deviation",
      projection: "A scenario extension, not a price forecast: Line5 uses a damped 180-observation linear trend and dispersion mean-reverts toward its trailing one-year average over 365 days."
    },
    levels: BAND_LEVELS,
    snapshot,
    breakouts: breakouts.slice(-48),
    macroBreakouts: macroBreakouts.slice(-16),
    referenceBreakouts,
    projection,
    series,
    warning: basePayload.warning || null,
    sources: {
      price: basePayload.sources?.price || "Binance Spot / public BTC daily history",
      history: basePayload.sources?.history || "BGeometrics public daily API + public long-history seed",
      sth: basePayload.sources?.sth || "https://bitcoin-data.com/api/v1/realized-price-sth/csv",
      methodology: "All nine rails are calculated by welinkBTC from the public BTC and STH daily series. This transparent proxy does not reproduce a proprietary CryptoChan dataset."
    }
  };
}

function calculateSthCostBasisBandsSeries(rows, windowDays = FOUR_YEAR_DAYS, minimumObservations = MIN_WINDOW_OBSERVATIONS) {
  const clean = (rows || []).map((row) => ({
    date: String(row?.date || "").slice(0, 10),
    price: Number(row?.price),
    sth: Number(row?.sth)
  })).filter((row) => validDate(row.date) && row.price > 0 && row.sth > 0)
    .sort((left, right) => left.date.localeCompare(right.date));

  const result = [];
  const window = [];
  let start = 0;
  let sum = 0;
  let squareSum = 0;

  clean.forEach((row) => {
    const timestamp = Date.parse(`${row.date}T00:00:00Z`);
    const residual = row.price - row.sth;
    window.push({ timestamp, residual });
    sum += residual;
    squareSum += residual ** 2;
    while (start < window.length && timestamp - window[start].timestamp > windowDays * DAY_MS) {
      sum -= window[start].residual;
      squareSum -= window[start].residual ** 2;
      start += 1;
    }
    const observations = window.length - start;
    if (observations < minimumObservations) return;
    const mean = sum / observations;
    const variance = Math.max(0, squareSum / observations - mean ** 2);
    const sigma = Math.sqrt(variance);
    if (!Number.isFinite(sigma) || sigma <= 0) return;
    const lines = BAND_LEVELS.map((level) => Math.max(1, row.sth + level * sigma));
    result.push({
      date: row.date,
      price: row.price,
      sth: row.sth,
      sigma,
      observations,
      line1: lines[0],
      line2: lines[1],
      line3: lines[2],
      line4: lines[3],
      line5: lines[4],
      line6: lines[5],
      line7: lines[6],
      line8: lines[7],
      line9: lines[8],
      aboveLine7: row.price >= lines[6]
    });
  });
  return result;
}

function detectLine7Breakouts(series) {
  const events = [];
  for (let index = 1; index < (series || []).length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (previous.price < previous.line7 && current.price >= current.line7) {
      events.push({
        date: current.date,
        price: current.price,
        line7: current.line7,
        distancePct: (current.price / current.line7 - 1) * 100
      });
    }
  }
  return events;
}

function clusterMacroBreakouts(events, gapDays = MACRO_BREAKOUT_GAP_DAYS) {
  const macro = [];
  (events || []).forEach((event) => {
    const previous = macro.at(-1);
    if (!previous || daysBetween(previous.date, event.date) >= gapDays) macro.push(event);
  });
  return macro;
}

function buildReferenceBreakouts(series, macroBreakouts) {
  const windows = [
    { cycle: "2019", start: "2019-01-01", end: "2019-08-31" },
    { cycle: "2023", start: "2022-11-01", end: "2023-05-31" }
  ];
  return windows.map((window) => {
    const event = (macroBreakouts || []).find((item) => item.date >= window.start && item.date <= window.end);
    if (!event) return null;
    const horizon = (series || []).filter((row) => row.date >= event.date && daysBetween(event.date, row.date) <= 365);
    const maximum = horizon.reduce((highest, row) => !highest || row.price > highest.price ? row : highest, null);
    return {
      cycle: window.cycle,
      breakoutDate: event.date,
      breakoutPrice: event.price,
      max365Date: maximum?.date || null,
      max365Price: maximum?.price || null,
      daysToMax365: maximum ? daysBetween(event.date, maximum.date) : null,
      returnToMax365Pct: maximum ? (maximum.price / event.price - 1) * 100 : null
    };
  }).filter(Boolean);
}

function calculateSthCostBasisBandsSnapshot(series, macroBreakouts, referenceBreakouts, livePrice = null, now = new Date()) {
  const latest = series?.at(-1);
  if (!latest) return null;
  const price = Number.isFinite(Number(livePrice?.value)) && Number(livePrice.value) > 0 ? Number(livePrice.value) : latest.price;
  const lineValues = BAND_LEVELS.map((_, index) => latest[`line${index + 1}`]);
  const latestBreakout = (macroBreakouts || []).at(-1) || null;
  let confirmedCloses = 0;
  for (let index = series.length - 1; index >= 0 && series[index].price >= series[index].line7; index -= 1) confirmedCloses += 1;
  const averageDaysToMax365 = referenceBreakouts?.length
    ? referenceBreakouts.reduce((sum, item) => sum + Number(item.daysToMax365 || 0), 0) / referenceBreakouts.length
    : 270;
  const zoneIndex = lineValues.findIndex((value) => price < value);
  const zone = zoneIndex < 0 ? "above-line9" : zoneIndex === 0 ? "below-line1" : `line${zoneIndex}-line${zoneIndex + 1}`;
  return {
    price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    sth: latest.sth,
    sigma: latest.sigma,
    observations: latest.observations,
    ...Object.fromEntries(lineValues.map((value, index) => [`line${index + 1}`, value])),
    distanceToLine7Pct: (price / latest.line7 - 1) * 100,
    liveAboveLine7: price >= latest.line7,
    dailyAboveLine7: latest.price >= latest.line7,
    confirmedCloses,
    latestBreakoutDate: latestBreakout?.date || null,
    daysSinceBreakout: latestBreakout ? daysBetween(latestBreakout.date, latest.date) : null,
    elapsedHours: latestBreakout ? Math.max(0, (now.getTime() - Date.parse(`${latestBreakout.date}T00:00:00Z`)) / 3_600_000) : null,
    zone,
    averageDaysToMax365,
    projectedMomentumDate: latestBreakout ? addDays(latestBreakout.date, Math.round(averageDaysToMax365)) : null,
    followThroughWindowStart: latestBreakout ? addDays(latestBreakout.date, 180) : null,
    followThroughWindowEnd: latestBreakout ? addDays(latestBreakout.date, 365) : null,
    completedReferenceCycles: referenceBreakouts?.length || 0
  };
}

function buildBandProjection(series, snapshot, projectionDays = PROJECTION_DAYS) {
  if (!series?.length || !snapshot) return [];
  const sample = series.slice(-180);
  const count = sample.length;
  const meanX = (count - 1) / 2;
  const meanBasis = sample.reduce((sum, row) => sum + row.line5, 0) / count;
  const slopeNumerator = sample.reduce((sum, row, index) => sum + (index - meanX) * (row.line5 - meanBasis), 0);
  const slopeDenominator = sample.reduce((sum, _, index) => sum + (index - meanX) ** 2, 0) || 1;
  const rawDailySlope = slopeNumerator / slopeDenominator;
  const maxDailySlope = snapshot.line5 * 0.0025;
  const dailySlope = Math.max(-maxDailySlope, Math.min(maxDailySlope, rawDailySlope));
  const sigmaTargetRows = series.slice(-365);
  const sigmaTarget = sigmaTargetRows.reduce((sum, row) => sum + row.sigma, 0) / sigmaTargetRows.length;
  const startDate = series.at(-1).date;
  const projected = [];
  for (let days = 7; days <= projectionDays; days += 7) {
    const damping = 1 - 0.55 * (days / projectionDays);
    const basis = Math.max(1, snapshot.line5 + dailySlope * days * damping);
    const sigma = Math.max(1, snapshot.sigma + (sigmaTarget - snapshot.sigma) * (days / projectionDays));
    const lines = BAND_LEVELS.map((level) => Math.max(1, basis + level * sigma));
    projected.push({
      date: addDays(startDate, days),
      scenario: true,
      sigma,
      ...Object.fromEntries(lines.map((value, index) => [`line${index + 1}`, value]))
    });
  }
  return projected;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysBetween(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export {
  BAND_LEVELS,
  FOUR_YEAR_DAYS,
  buildBandProjection,
  buildReferenceBreakouts,
  buildSthCostBasisBandsPayload,
  calculateSthCostBasisBandsSeries,
  calculateSthCostBasisBandsSnapshot,
  clusterMacroBreakouts,
  detectLine7Breakouts
};
