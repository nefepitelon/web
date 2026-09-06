import { buildPublicSeedPayload, buildSth200dmaPayload } from "./sth-200dma.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const PROJECTION_DAYS = 365;
const BREAKEVEN = 1;

const REFERENCE_CYCLES = Object.freeze([
  {
    cycle: "2019",
    start: "2018-08-01",
    end: "2020-02-29",
    first: { start: "2018-08-01", end: "2019-04-30" },
    second: { start: "2019-07-01", end: "2020-02-29" },
    note: "The March 2020 exogenous black-swan drawdown is excluded."
  },
  {
    cycle: "2023",
    start: "2023-05-01",
    end: "2023-10-31",
    first: { start: "2023-05-01", end: "2023-07-31" },
    second: { start: "2023-08-01", end: "2023-10-31" },
    note: "Recovery-phase first test, rebound and second test of the STH cost line."
  }
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
  const cache = globalThis.__welinkSthMvrvCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildSthMvrvPayload(new Date(now));
    globalThis.__welinkSthMvrvCacheV1 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date(now).toISOString(),
        warning: "STH-MVRV refresh failed; serving the latest valid public-data payload."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load BTC Short Term Holder MVRV",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

async function buildSthMvrvPayload(now = new Date()) {
  let base;
  try {
    base = await buildSth200dmaPayload();
  } catch (error) {
    base = await buildPublicSeedPayload(error);
  }
  const series = calculateSthMvrvSeries(base.series);
  if (series.length < 365) throw new Error("Public STH-MVRV history returned too few aligned observations");

  const referenceCycles = calculateReferenceCycles(series);
  const belowOneZones = extractBelowOneZones(series);
  const currentStructure = calculateCurrentStructure(series, belowOneZones);
  const snapshot = calculateSnapshot(series, base.snapshot, currentStructure);
  const projection = buildSthMvrvProjection(series, PROJECTION_DAYS);

  return {
    ok: true,
    stale: Boolean(base.stale),
    fallback: Boolean(base.fallback),
    generatedAt: now.toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily-history + live-spot",
    breakeven: BREAKEVEN,
    snapshot,
    referenceCycles,
    currentStructure,
    belowOneZones,
    projection,
    series,
    warning: base.warning || null,
    methodology: {
      model: "Transparent public-data proxy for Short Term Holder MVRV",
      formula: "Daily BTC market price divided by the realized price of coins held for less than 155 days.",
      breakeven: "1.0 is the aggregate short-term-holder cost basis; values below 1.0 indicate aggregate unrealized loss.",
      cycleLogic: "The 2019 and 2023 reference windows detect a first break below 1.0, a rebound and a second break. March 2020 is explicitly excluded.",
      projection: "A bounded 365-day scenario uses damped 30-day momentum and four-year median reversion; it is not a price forecast."
    },
    sources: {
      price: base.sources?.price || "Binance Spot",
      history: base.sources?.history || "BGeometrics public daily API + Bitbo public long-history seed",
      btc: base.sources?.btc || "https://bitcoin-data.com/api/v1/btc-price/csv",
      sth: base.sources?.sth || "https://bitcoin-data.com/api/v1/realized-price-sth/csv",
      methodology: "welinkBTC public price / STH realized-price ratio; no paid API or proprietary CryptoChan sequence is used."
    }
  };
}

function calculateSthMvrvSeries(rows) {
  return (rows || []).map((row) => {
    const date = String(row?.date || "").slice(0, 10);
    const price = Number(row?.price);
    const sth = Number(row?.sth);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![price, sth].every(Number.isFinite) || price <= 0 || sth <= 0) return null;
    const mvrv = price / sth;
    return { date, price, sth, mvrv, profitPercent: (mvrv - BREAKEVEN) * 100 };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function extractBelowOneZones(series, { maxGapDays = 7, maxGapMvrv = 1.03 } = {}) {
  const raw = [];
  let active = null;
  (series || []).forEach((row) => {
    if (row.mvrv < BREAKEVEN) {
      if (!active) active = { start: row.date, end: row.date, lowDate: row.date, lowMvrv: row.mvrv, rows: 0 };
      active.end = row.date;
      active.rows += 1;
      if (row.mvrv < active.lowMvrv) {
        active.lowMvrv = row.mvrv;
        active.lowDate = row.date;
      }
    } else if (active) {
      raw.push(active);
      active = null;
    }
  });
  if (active) raw.push(active);

  const merged = [];
  raw.forEach((zone) => {
    const previous = merged.at(-1);
    if (!previous) {
      merged.push({ ...zone });
      return;
    }
    const gapRows = series.filter((row) => row.date > previous.end && row.date < zone.start);
    const gapDays = daysBetween(previous.end, zone.start) - 1;
    const shallowGap = gapRows.length === 0 || Math.max(...gapRows.map((row) => row.mvrv)) <= maxGapMvrv;
    if (gapDays <= maxGapDays && shallowGap) {
      previous.end = zone.end;
      previous.rows += zone.rows;
      if (zone.lowMvrv < previous.lowMvrv) {
        previous.lowMvrv = zone.lowMvrv;
        previous.lowDate = zone.lowDate;
      }
    } else {
      merged.push({ ...zone });
    }
  });
  return merged.map((zone) => ({ ...zone, durationDays: daysBetween(zone.start, zone.end) + 1 }));
}

function findPhaseLow(series, window) {
  const rows = (series || []).filter((row) => row.date >= window.start && row.date <= window.end);
  if (!rows.length) return null;
  const low = rows.reduce((result, row) => !result || row.mvrv < result.mvrv ? row : result, null);
  const below = rows.filter((row) => row.mvrv < BREAKEVEN);
  return {
    start: below.at(0)?.date || null,
    end: below.at(-1)?.date || null,
    lowDate: low.date,
    lowMvrv: low.mvrv,
    priceAtLow: low.price,
    triggered: below.length > 0
  };
}

function calculateReferenceCycles(series, cycles = REFERENCE_CYCLES) {
  return cycles.map((cycle) => {
    const firstDip = findPhaseLow(series, cycle.first);
    const secondDip = findPhaseLow(series, cycle.second);
    if (!firstDip || !secondDip) return null;
    const reboundRows = series.filter((row) => row.date > firstDip.lowDate && row.date < secondDip.lowDate);
    const rebound = reboundRows.reduce((result, row) => !result || row.mvrv > result.mvrv ? row : result, null);
    return {
      cycle: cycle.cycle,
      start: cycle.start,
      end: cycle.end,
      note: cycle.note,
      firstDip,
      rebound: rebound ? { date: rebound.date, mvrv: rebound.mvrv, price: rebound.price } : null,
      secondDip,
      completed: Boolean(firstDip.triggered && secondDip.triggered && rebound?.mvrv > BREAKEVEN)
    };
  }).filter(Boolean);
}

function calculateCurrentStructure(series, zones = extractBelowOneZones(series)) {
  const latest = series?.at(-1);
  if (!latest) return null;
  const recentZones = zones.filter((zone) => zone.end >= "2025-01-01" && zone.lowMvrv <= 0.98 && zone.durationDays >= 3);
  let pair = null;
  for (let index = recentZones.length - 2; index >= 0; index -= 1) {
    const first = recentZones[index];
    const second = recentZones[index + 1];
    const reboundRows = series.filter((row) => row.date > first.end && row.date < second.start);
    const rebound = reboundRows.reduce((result, row) => !result || row.mvrv > result.mvrv ? row : result, null);
    if (rebound?.mvrv > BREAKEVEN) {
      pair = { first, second, rebound };
      break;
    }
  }
  if (!pair && recentZones.length) {
    const first = recentZones.at(-2) || recentZones.at(-1);
    const second = recentZones.at(-1);
    const reboundRows = series.filter((row) => row.date > first.end && row.date < second.start);
    pair = {
      first,
      second,
      rebound: reboundRows.reduce((result, row) => !result || row.mvrv > result.mvrv ? row : result, null)
    };
  }
  if (!pair) return {
    cycle: "CURRENT",
    firstDip: null,
    rebound: null,
    secondDip: null,
    completed: false,
    reclaimed: latest.mvrv >= BREAKEVEN,
    daysSinceReclaim: null
  };

  const afterSecond = series.filter((row) => row.date > pair.second.end);
  const reclaim = afterSecond.find((row) => row.mvrv >= BREAKEVEN) || null;
  return {
    cycle: "CURRENT",
    start: pair.first.start,
    end: latest.date,
    firstDip: { ...pair.first, priceAtLow: series.find((row) => row.date === pair.first.lowDate)?.price ?? null },
    rebound: pair.rebound ? { date: pair.rebound.date, mvrv: pair.rebound.mvrv, price: pair.rebound.price } : null,
    secondDip: { ...pair.second, priceAtLow: series.find((row) => row.date === pair.second.lowDate)?.price ?? null },
    completed: Boolean(pair.rebound?.mvrv > BREAKEVEN && latest.mvrv >= BREAKEVEN),
    reclaimed: latest.mvrv >= BREAKEVEN,
    reclaimDate: reclaim?.date || null,
    daysSinceReclaim: reclaim ? daysBetween(reclaim.date, latest.date) : null
  };
}

function calculateSnapshot(series, baseSnapshot = null, currentStructure = null) {
  const latest = series?.at(-1);
  if (!latest) return null;
  const previous7 = series.at(-Math.min(8, series.length));
  const previous30 = series.at(-Math.min(31, series.length));
  const change7 = latest.mvrv - previous7.mvrv;
  const change30 = latest.mvrv - previous30.mvrv;
  const state = latest.mvrv < 0.85 ? "capitulation"
    : latest.mvrv < BREAKEVEN ? "underwater"
      : currentStructure?.completed ? "double-bottom-reclaimed"
        : latest.mvrv < 1.15 ? "recovery"
          : latest.mvrv < 1.4 ? "profit" : "overheated";
  return {
    asOf: latest.date,
    price: Number(baseSnapshot?.price) || latest.price,
    priceAsOf: baseSnapshot?.priceAsOf || `${latest.date}T00:00:00.000Z`,
    sth: latest.sth,
    mvrv: latest.mvrv,
    profitPercent: latest.profitPercent,
    distanceToOnePct: latest.profitPercent,
    sevenDayChange: change7,
    thirtyDayChange: change30,
    trend: change7 > 0.015 ? "rising" : change7 < -0.015 ? "falling" : "flat",
    state,
    doubleBottomComplete: Boolean(currentStructure?.completed),
    reclaimDate: currentStructure?.reclaimDate || null,
    daysSinceReclaim: currentStructure?.daysSinceReclaim ?? null,
    firstDipDate: currentStructure?.firstDip?.lowDate || null,
    firstDipMvrv: currentStructure?.firstDip?.lowMvrv ?? null,
    secondDipDate: currentStructure?.secondDip?.lowDate || null,
    secondDipMvrv: currentStructure?.secondDip?.lowMvrv ?? null,
    reboundDate: currentStructure?.rebound?.date || null,
    reboundMvrv: currentStructure?.rebound?.mvrv ?? null
  };
}

function buildSthMvrvProjection(series, projectionDays = PROJECTION_DAYS) {
  if (!series?.length) return [];
  const latest = series.at(-1);
  const recent = series.slice(-30);
  const momentum = recent.length > 1 ? (recent.at(-1).mvrv - recent[0].mvrv) / (recent.length - 1) : 0;
  const fourYearRows = series.filter((row) => daysBetween(row.date, latest.date) <= 1461);
  const values = fourYearRows.map((row) => row.mvrv).sort((a, b) => a - b);
  const target = values[Math.floor(values.length / 2)] ?? 1.05;
  const projection = [];
  for (let days = 7; days <= projectionDays; days += 7) {
    const progress = days / projectionDays;
    const dampedMomentum = momentum * days * Math.max(0.08, 1 - 1.05 * progress);
    const meanReversion = (target - latest.mvrv) * 0.42 * progress;
    projection.push({
      date: addDays(latest.date, days),
      mvrv: Math.max(0.45, Math.min(2.2, latest.mvrv + dampedMomentum + meanReversion)),
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
  BREAKEVEN,
  REFERENCE_CYCLES,
  buildSthMvrvPayload,
  buildSthMvrvProjection,
  calculateCurrentStructure,
  calculateReferenceCycles,
  calculateSnapshot,
  calculateSthMvrvSeries,
  extractBelowOneZones
};
