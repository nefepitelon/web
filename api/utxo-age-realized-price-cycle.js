import {
  fetchPublicRealizedCapHistory,
  fetchPublicSupplyHistory
} from "./_bgeometrics-hodl-history.js";
import { reconstructHistoricalRealizedShares } from "./lth-realized-price.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const DAY_MS = 86_400_000;
const CONFIRMATION_DAYS = 14;
const REFERENCE_CURRENT_CROSS_DATE = "2026-07-15";
const REFERENCE_CYCLES = [
  { cycle: "2015", crossDate: "2015-02-06", topDate: "2017-12-17", durationDays: 1045 },
  { cycle: "2019", crossDate: "2019-01-17", topDate: "2021-11-10", durationDays: 1028 },
  { cycle: "2022", crossDate: "2022-11-09", topDate: "2025-10-07", durationDays: 1063 }
];
const REFERENCE_MEAN_DAYS = Math.round(
  REFERENCE_CYCLES.reduce((sum, row) => sum + row.durationDays, 0) / REFERENCE_CYCLES.length
);
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
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
  const cache = globalThis.__welinkUtxoAgeRealizedPriceCycleV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildUtxoAgeRealizedPricePayload();
    globalThis.__welinkUtxoAgeRealizedPriceCycleV1 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "UTXO age-band refresh failed; serving the latest valid public reconstruction."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load Bitcoin UTXO age-band realized-price cycle",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

async function buildUtxoAgeRealizedPricePayload() {
  const [supplyRows, realizedRows, livePrice] = await Promise.all([
    fetchPublicSupplyHistory(),
    fetchPublicRealizedCapHistory(),
    fetchLiveBtcPrice()
  ]);
  const built = buildAgeBandSeries(supplyRows, realizedRows);
  if (built.series.length < 2500) throw new Error("Public UTXO age-band reconstruction returned too few observations");
  const publicCrosses = detectDeathCrosses(built.series);
  const projection = projectAgeBandCosts(built.series);
  const snapshot = buildSnapshot(built.series, publicCrosses, projection, livePrice, built.publishedThrough);
  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cadence: "daily",
    cacheSeconds: CACHE_TTL_MS / 1000,
    methodology: "public_realized_cap_divided_by_hodl_supply_with_calibrated_12m_18m_vintage_reconstruction",
    completeHistory: true,
    reconstructedHistory: true,
    publishedThrough: built.publishedThrough,
    confirmationDays: CONFIRMATION_DAYS,
    referenceMeanDays: REFERENCE_MEAN_DAYS,
    snapshot,
    referenceCycles: REFERENCE_CYCLES,
    publicCrosses,
    series: built.series,
    projection,
    sources: {
      price: livePrice.source,
      dailyPrice: "BGeometrics public BTC daily price history",
      supply: "BGeometrics public HODL Waves supply",
      realizedCap: "BGeometrics public Realized-Cap HODL Waves",
      reference: "CryptoChan reference figure supplied for this model",
      disclosure: "6m-12m is reconstructed from public cohort realized cap divided by cohort supply. The public source publishes 1y-2y as one cohort, so 12m-18m is a transparent price-vintage sub-band calibrated back to that public aggregate. Values after the publisher baseline are marked estimated. The 1045/1028/1063-day cycles and the 2026 59-day marker remain separately labelled reference anchors; the forward path is a research scenario, not a price forecast."
    }
  };
}

function buildAgeBandSeries(supplyRows, realizedRows) {
  const realizedByDate = new Map(realizedRows.map((row) => [row.date, row]));
  const publishedRows = realizedRows.filter((row) => Number(row.age_6m_1y) > 0 && Number(row.age_1y_2y) > 0);
  const publishedLatest = publishedRows.at(-1);
  if (!publishedLatest) return { series: [], publishedThrough: null };

  const priceRows = supplyRows.filter((row) => Number.isFinite(row.timestamp) && Number(row.price) > 0);
  const anchorSupply = supplyRows.find((row) => row.date === publishedLatest.date);
  const anchorExact = anchorSupply ? calculatePublishedBands(anchorSupply, publishedLatest, priceRows) : null;
  const anchorModeled = anchorSupply ? calculateModeledBands(anchorSupply, priceRows) : null;

  const series = supplyRows
    .filter((row) => row.date >= "2014-01-01")
    .map((supply) => {
      const realized = realizedByDate.get(supply.date);
      const modeled = calculateModeledBands(supply, priceRows);
      if (!modeled) return null;
      let sixToTwelve;
      let twelveToEighteen;
      let oneToTwoYears;
      let estimated = false;

      if (realized && supply.date <= publishedLatest.date) {
        const published = calculatePublishedBands(supply, realized, priceRows);
        if (!published) return null;
        ({ sixToTwelve, twelveToEighteen, oneToTwoYears } = published);
      } else {
        if (!anchorExact || !anchorModeled) return null;
        estimated = true;
        sixToTwelve = extendFromAnchor(anchorExact.sixToTwelve, anchorModeled.sixToTwelve, modeled.sixToTwelve);
        twelveToEighteen = extendFromAnchor(anchorExact.twelveToEighteen, anchorModeled.twelveToEighteen, modeled.twelveToEighteen);
        oneToTwoYears = extendFromAnchor(anchorExact.oneToTwoYears, anchorModeled.oneToTwoYears, modeled.oneToTwoYears);
      }

      if (![supply.price, sixToTwelve, twelveToEighteen, oneToTwoYears].every((value) => Number.isFinite(value) && value > 0)) return null;
      return {
        date: supply.date,
        timestamp: supply.timestamp,
        price: supply.price,
        sixToTwelve,
        twelveToEighteen,
        oneToTwoYears,
        spread: sixToTwelve - twelveToEighteen,
        spreadPercent: ((sixToTwelve / twelveToEighteen) - 1) * 100,
        estimated
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));

  return { series, publishedThrough: publishedLatest.date };
}

function calculatePublishedBands(supply, realized, priceRows) {
  const shares = reconstructHistoricalRealizedShares(supply, realized);
  if (!shares) return null;
  const sixToTwelve = realizedPriceForBand(supply, shares, realized.realizedCap, "age_6m_1y");
  const oneToTwoYears = realizedPriceForBand(supply, shares, realized.realizedCap, "age_1y_2y");
  const modeled = calculateModeledBands(supply, priceRows);
  if (![sixToTwelve, oneToTwoYears, modeled?.twelveToEighteen, modeled?.eighteenToTwentyFour].every((value) => Number.isFinite(value) && value > 0)) return null;
  const modeledAggregate = (modeled.twelveToEighteen + modeled.eighteenToTwentyFour) / 2;
  const calibration = clamp(oneToTwoYears / modeledAggregate, 0.35, 2.85);
  return {
    sixToTwelve,
    twelveToEighteen: modeled.twelveToEighteen * calibration,
    oneToTwoYears
  };
}

function calculateModeledBands(supply, priceRows) {
  const sixToTwelve = estimateVintageCost(priceRows, supply.timestamp, 180, 365);
  const twelveToEighteen = estimateVintageCost(priceRows, supply.timestamp, 365, 548);
  const eighteenToTwentyFour = estimateVintageCost(priceRows, supply.timestamp, 548, 730);
  if (![sixToTwelve, twelveToEighteen, eighteenToTwentyFour].every((value) => Number.isFinite(value) && value > 0)) return null;
  return {
    sixToTwelve,
    twelveToEighteen,
    eighteenToTwentyFour,
    oneToTwoYears: (twelveToEighteen + eighteenToTwentyFour) / 2
  };
}

function realizedPriceForBand(supply, shares, totalRealizedCap, key) {
  const cohortSupply = Number(supply[key]);
  const share = Number(shares[key]);
  return cohortSupply > 0 && share > 0 && Number(totalRealizedCap) > 0
    ? (share * Number(totalRealizedCap)) / cohortSupply
    : null;
}

function estimateVintageCost(priceRows, timestamp, minimumDays, maximumDays, samples = 28) {
  let weighted = 0;
  let weightTotal = 0;
  for (let index = 0; index < samples; index += 1) {
    const ratio = (index + 0.5) / samples;
    const ageDays = minimumDays + (maximumDays - minimumDays) * ratio;
    const price = findPriceAtOrBefore(priceRows, timestamp - ageDays * DAY_MS);
    if (!Number.isFinite(price) || price <= 0) continue;
    const weight = 1 + (1 - ratio) * 0.35;
    weighted += price * weight;
    weightTotal += weight;
  }
  return weightTotal ? weighted / weightTotal : null;
}

function findPriceAtOrBefore(rows, timestamp) {
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (rows[middle].timestamp <= timestamp) low = middle;
    else high = middle - 1;
  }
  return rows[low]?.price ?? null;
}

function extendFromAnchor(anchorActual, anchorModeled, currentModeled) {
  const ratio = clamp(currentModeled / anchorModeled, 0.5, 1.85);
  return anchorActual * ratio;
}

function detectDeathCrosses(series, confirmationDays = CONFIRMATION_DAYS) {
  const crosses = [];
  for (let index = 1; index < series.length - confirmationDays; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (previous.spread < 0 || current.spread >= 0) continue;
    const confirmed = series.slice(index, index + confirmationDays).every((row) => row.spread < 0);
    if (!confirmed) continue;
    if (crosses.length && dayDifference(crosses.at(-1).date, current.date) < 300) continue;
    crosses.push({
      date: current.date,
      price: current.price,
      sixToTwelve: current.sixToTwelve,
      twelveToEighteen: current.twelveToEighteen,
      spreadPercent: current.spreadPercent,
      confirmedDays: confirmationDays,
      estimated: current.estimated
    });
  }
  return crosses;
}

function buildSnapshot(series, publicCrosses, projection, livePrice, publishedThrough) {
  const latest = series.at(-1);
  const latestPublicCross = latest.spread < 0
    ? [...publicCrosses].reverse().find((row) => row.date >= "2025-01-01") || null
    : null;
  const activeCrossDate = latestPublicCross?.date || REFERENCE_CURRENT_CROSS_DATE;
  const crossSource = latestPublicCross ? "public-model" : "reference-anchor";
  const elapsedDays = Math.max(0, dayDifference(activeCrossDate, latest.date));
  const targetDate = addDays(activeCrossDate, REFERENCE_MEAN_DAYS);
  return {
    price: livePrice.value,
    priceAsOf: livePrice.asOf,
    onchainAsOf: latest.date,
    publishedThrough,
    estimated: latest.estimated,
    sixToTwelve: latest.sixToTwelve,
    twelveToEighteen: latest.twelveToEighteen,
    oneToTwoYears: latest.oneToTwoYears,
    spread: latest.spread,
    spreadPercent: latest.spreadPercent,
    deathCrossActive: latest.spread < 0,
    activeCrossDate,
    crossSource,
    elapsedDays,
    referenceElapsedDays: Math.max(0, dayDifference(REFERENCE_CURRENT_CROSS_DATE, latest.date)),
    averageCycleDays: REFERENCE_MEAN_DAYS,
    remainingDays: Math.max(0, REFERENCE_MEAN_DAYS - elapsedDays),
    targetDate,
    scenarioEndDate: projection.at(-1)?.date || latest.date,
    scenarioSixToTwelve: projection.at(-1)?.sixToTwelve || latest.sixToTwelve,
    scenarioTwelveToEighteen: projection.at(-1)?.twelveToEighteen || latest.twelveToEighteen
  };
}

function projectAgeBandCosts(series, minimumDays = 365) {
  if (!Array.isArray(series) || series.length < 730) return [];
  const latest = series.at(-1);
  const activeReferenceElapsed = Math.max(0, dayDifference(REFERENCE_CURRENT_CROSS_DATE, latest.date));
  const days = Math.max(minimumDays, REFERENCE_MEAN_DAYS - activeReferenceElapsed);
  const oneYear = series[Math.max(0, series.length - 366)];
  const recent = series[Math.max(0, series.length - 91)];
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    return {
      date: addDays(latest.date, day),
      sixToTwelve: projectedCost(latest.sixToTwelve, recent.sixToTwelve, oneYear.sixToTwelve, day),
      twelveToEighteen: projectedCost(latest.twelveToEighteen, recent.twelveToEighteen, oneYear.twelveToEighteen, day)
    };
  });
}

function projectedCost(latest, recent, oneYear, day) {
  const recentDaily = clamp(Math.log(latest / recent) / 90, -0.003, 0.003);
  const annualDaily = clamp(Math.log(latest / oneYear) / 365, -0.001, 0.001);
  const momentum = recentDaily * 150 * (1 - Math.exp(-day / 150));
  const structural = annualDaily * day * 0.28;
  return latest * Math.exp(momentum + structural);
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const payload = await response.json();
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
}

function dayDifference(start, end) {
  return Math.round((new Date(`${end}T00:00:00.000Z`) - new Date(`${start}T00:00:00.000Z`)) / DAY_MS);
}

function addDays(date, days) {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

export {
  CONFIRMATION_DAYS,
  REFERENCE_CYCLES,
  REFERENCE_CURRENT_CROSS_DATE,
  REFERENCE_MEAN_DAYS,
  addDays,
  buildAgeBandSeries,
  buildSnapshot,
  buildUtxoAgeRealizedPricePayload,
  calculateModeledBands,
  detectDeathCrosses,
  estimateVintageCost,
  projectAgeBandCosts
};
