import {
  fetchExactRealizedCapShares,
  fetchPublicBtcPriceHistory,
  fetchPublicRealizedCapHistory,
} from "./_bgeometrics-hodl-history.js";
import {
  buildRealizedCapHodlWaveSeries,
  fetchLiveBtcPrice,
} from "./realized-cap-hodl-waves.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const DEEP_BOTTOM = 0.15;
const BOTTOM_ZONE = 0.18;
const SPECULATION_ZONE = 0.6;

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
  const cache = globalThis.__welinkUnder3mRealizedCapHodlCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildUnder3mPayload();
    globalThis.__welinkUnder3mRealizedCapHodlCacheV1 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "<3m realized-cap HODL Waves refresh failed; serving the latest valid public payload."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load Bitcoin <3m Realized Cap HODL Waves",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildUnder3mPayload() {
  const [realizedRows, exactRows, priceRows, livePrice] = await Promise.all([
    fetchPublicRealizedCapHistory(),
    fetchExactRealizedCapShares().catch(() => []),
    fetchPublicBtcPriceHistory(),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const result = buildRealizedCapHodlWaveSeries(
    realizedRows,
    exactRows.map((row) => ({ ...row, source: "bitcoin-data" })),
    priceRows
  );
  const series = buildUnder3mSeries(result.series);
  if (series.length < 1000) throw new Error("Public HODL-wave sources returned too few aligned observations");
  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cadence: "daily",
    cacheSeconds: CACHE_TTL_MS / 1000,
    methodology: "under_3m_equals_one_minus_over_3m_realized_cap_share",
    thresholds: { deepBottom: DEEP_BOTTOM, bottom: BOTTOM_ZONE, speculation: SPECULATION_ZONE },
    extension: result.extension,
    snapshot: calculateUnder3mSnapshot(series, livePrice),
    lows: detectCycleLows(series),
    series,
    sources: {
      history: "BGeometrics public Realized Cap HODL Waves",
      exactExtension: result.extension.source === "bitcoin-data" ? "Bitcoin Data public exact Realized Cap HODL Waves" : null,
      price: livePrice?.source || "BGeometrics public daily BTC price",
      disclosure: "The under-three-month share is the exact complement of the public over-three-month realized-cap share: <3m = 100% - 3m+. No paid API or proprietary entity clustering is used."
    }
  };
}

function buildUnder3mSeries(overThreeMonthSeries) {
  const rolling7 = [];
  const rolling30 = [];
  let sum7 = 0;
  let sum30 = 0;
  return overThreeMonthSeries.map((row) => {
    const underThreeMonths = Math.min(1, Math.max(0, 1 - Number(row.overThreeMonths)));
    rolling7.push(underThreeMonths);
    rolling30.push(underThreeMonths);
    sum7 += underThreeMonths;
    sum30 += underThreeMonths;
    if (rolling7.length > 7) sum7 -= rolling7.shift();
    if (rolling30.length > 30) sum30 -= rolling30.shift();
    return {
      date: row.date,
      price: row.price,
      underThreeMonths,
      average7: sum7 / rolling7.length,
      average30: sum30 / rolling30.length,
      source: row.source
    };
  });
}

function calculateUnder3mSnapshot(series, livePrice) {
  const latest = series.at(-1);
  const prior7 = series.at(-8) || series[0];
  const recentWindow = series.slice(-180);
  const recentLow = recentWindow.reduce((best, row) => row.underThreeMonths < best.underThreeMonths ? row : best, recentWindow[0]);
  const current = latest.underThreeMonths;
  const trend = current > latest.average30 + 0.003 ? "rising" : current < latest.average30 - 0.003 ? "falling" : "flat";
  return {
    current,
    average7: latest.average7,
    average30: latest.average30,
    sevenDayChange: current - prior7.underThreeMonths,
    distanceToBottom: current - BOTTOM_ZONE,
    recentLow: recentLow.underThreeMonths,
    recentLowDate: recentLow.date,
    vTurn: current > recentLow.underThreeMonths + 0.002 && latest.average7 > latest.average30,
    zone: classifyUnder3mZone(current),
    trend,
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    source: latest.source
  };
}

function classifyUnder3mZone(value) {
  if (value <= DEEP_BOTTOM) return "deep-bottom";
  if (value <= BOTTOM_ZONE) return "bottom";
  if (value < 0.3) return "accumulation";
  if (value < SPECULATION_ZONE) return "balanced";
  return "speculation";
}

function detectCycleLows(series) {
  const windows = [
    ["2010-01-01", "2012-12-31"],
    ["2013-01-01", "2016-12-31"],
    ["2017-01-01", "2020-12-31"],
    ["2021-01-01", "2024-12-31"],
    ["2025-01-01", "9999-12-31"]
  ];
  return windows.map(([start, end]) => series
    .filter((row) => row.date >= start && row.date <= end)
    .reduce((best, row) => !best || row.underThreeMonths < best.underThreeMonths ? row : best, null))
    .filter(Boolean)
    .map((row) => ({ date: row.date, value: row.underThreeMonths, price: row.price }));
}

export {
  buildUnder3mSeries,
  calculateUnder3mSnapshot,
  classifyUnder3mZone,
  detectCycleLows
};
