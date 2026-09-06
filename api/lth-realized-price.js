import {
  AGE_BANDS,
  fetchPublicRealizedCapHistory,
  fetchPublicSupplyHistory
} from "./_bgeometrics-hodl-history.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;

const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

const BANDS_TO_10Y = [
  "range_0d_1d",
  "range_1d_1w",
  "range_1w_1m",
  "range_1m_3m",
  "range_3m_6m",
  "range_6m_12m",
  "range_12m_18m",
  "range_18m_2y",
  "range_2y_3y",
  "range_3y_5y",
  "range_5y_7y",
  "range_7y_10y"
];
const BANDS_6M_TO_5Y = [
  "range_6m_12m",
  "range_12m_18m",
  "range_18m_2y",
  "range_2y_3y",
  "range_3y_5y"
];
const BANDS_6M_TO_7Y = [...BANDS_6M_TO_5Y, "range_5y_7y"];
const BANDS_6M_TO_10Y = [...BANDS_6M_TO_7Y, "range_7y_10y"];

const PUBLIC_GROUPS = {
  rp0to10y: ["age_0d_1d", "age_1d_1w", "age_1w_1m", "age_1m_3m", "age_3m_6m", "age_6m_1y", "age_1y_2y", "age_2y_3y", "age_3y_4y", "age_4y_5y", "age_5y_7y", "age_7y_10y"],
  rp6m5y: ["age_6m_1y", "age_1y_2y", "age_2y_3y", "age_3y_4y", "age_4y_5y"],
  rp6m7y: ["age_6m_1y", "age_1y_2y", "age_2y_3y", "age_3y_4y", "age_4y_5y", "age_5y_7y"],
  rp6m10y: ["age_6m_1y", "age_1y_2y", "age_2y_3y", "age_3y_4y", "age_4y_5y", "age_5y_7y", "age_7y_10y"]
};

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
  const cache = globalThis.__welinkLthRealizedPriceCache;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildLthPayload(cache?.payload);
    globalThis.__welinkLthRealizedPriceCache = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Upstream refresh failed; serving the latest valid LTH realized-price series."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load BTC LTH realized-price history",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  const maxAge = payload?.unavailable ? 900 : 21600;
  response.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=604800`);
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildLthPayload(previousPayload) {
  const [supplyResult, realizedCapResult, tickerResult] = await Promise.allSettled([
    fetchPublicSupplyHistory(),
    fetchPublicRealizedCapHistory(),
    fetchLiveBtcPrice()
  ]);

  const supplyRows = fulfilledValue(supplyResult);
  const realizedCapRows = fulfilledValue(realizedCapResult);
  const livePrice = fulfilledValue(tickerResult);
  const freshSeries = supplyRows?.length && realizedCapRows?.length
    ? buildPublicLthSeries(supplyRows, realizedCapRows)
    : [];
  const previousSeries = previousPayload?.series || [];
  const freshLatest = freshSeries.at(-1)?.date || "";
  const previousLatest = previousSeries.at(-1)?.date || "";
  const series = freshSeries.length >= 100 && freshLatest >= previousLatest ? freshSeries : previousSeries;

  if (series.length < 100) {
    throw new Error("Public HODL-wave sources did not return enough aligned daily observations");
  }

  const snapshot = calculateLthSnapshot(series, livePrice);
  const stale = freshSeries.length < 100 || series === previousSeries;
  const publishedThrough = realizedCapRows
    ?.filter((row) => row.age_3y_4y > 0 || row.age_4y_8y > 0 || row.age_8y_plus > 0)
    .at(-1)?.date || null;
  return {
    ok: true,
    stale,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    methodology: "public_hodl_wave_realized_cap_divided_by_supply",
    completeHistory: true,
    reconstructedHistory: true,
    publishedThrough,
    snapshot,
    series,
    sources: {
      price: livePrice?.source || "BGeometrics daily close",
      dailyPrice: "BGeometrics public daily price",
      supply: "BGeometrics public HODL Waves",
      realizedCap: "BGeometrics public Realized-Cap HODL Waves",
      methodology: `Published realized-cap cohorts${publishedThrough ? ` through ${publishedThrough}` : ""}; later daily values are slow-moving cohort-cost extensions anchored to the latest published observation`
    }
  };
}

function normalizeCryptoQuantRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result?.data)
      ? payload.result.data
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  return rows
    .map((row) => ({ ...row, date: normalizeDate(row.date ?? row.datetime ?? row.timestamp) }))
    .filter((row) => row.date)
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const payload = await fetchJson(url, { timeoutMs: 7_000 });
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) {
        return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
}

function buildPublicLthSeries(supplyRows, realizedCapRows) {
  const realizedByDate = new Map(realizedCapRows.map((row) => [row.date, row]));
  const broadRows = realizedCapRows.filter((row) => row.age_3y_4y > 0 || row.age_4y_8y > 0 || row.age_8y_plus > 0);
  const publishedLatest = broadRows.at(-1);
  if (!publishedLatest) return [];
  const supplyByDate = new Map(supplyRows.map((row) => [row.date, row]));
  const anchorSupply = supplyByDate.get(publishedLatest.date);
  const anchorShares = anchorSupply ? reconstructHistoricalRealizedShares(anchorSupply, publishedLatest) : null;
  const anchorActualGroups = anchorSupply && anchorShares
    ? buildActualGroupPrices(anchorSupply, anchorShares, publishedLatest.realizedCap)
    : null;
  const anchorModeledGroups = anchorSupply ? buildModeledGroupPrices(supplyRows, anchorSupply) : null;
  return supplyRows
    .filter((supply) => supply.date >= "2013-04-28")
    .map((supply) => {
      const realized = realizedByDate.get(supply.date);
      if (!realized || !Number.isFinite(realized.realizedCap) || realized.realizedCap <= 0) return null;
      const row = { date: supply.date, price: supply.price, estimated: supply.date > publishedLatest.date };
      if (supply.date <= publishedLatest.date) {
        const shares = reconstructHistoricalRealizedShares(supply, realized);
        if (!shares) return null;
        Object.entries(PUBLIC_GROUPS).forEach(([field, keys]) => {
          row[field] = publicGroupRealizedPrice(supply, shares, realized.realizedCap, keys);
        });
      } else {
        if (!anchorActualGroups || !anchorModeledGroups) return null;
        const modeledGroups = buildModeledGroupPrices(supplyRows, supply);
        const elapsedDays = Math.max(0, Math.round((supply.timestamp - anchorSupply.timestamp) / 86_400_000));
        const adaptationWeight = Math.min(0.35, (elapsedDays / 365) * 0.35);
        Object.keys(PUBLIC_GROUPS).forEach((field) => {
          const anchorActual = anchorActualGroups[field];
          const anchorModeled = anchorModeledGroups[field];
          const currentModeled = modeledGroups[field];
          if (![anchorActual, anchorModeled, currentModeled].every((value) => Number.isFinite(value) && value > 0)) {
            row[field] = null;
            return;
          }
          const modeledChange = clamp((currentModeled / anchorModeled) - 1, -0.35, 0.35);
          row[field] = anchorActual * (1 + modeledChange * adaptationWeight);
        });
      }
      return [row.price, row.rp0to10y, row.rp6m5y, row.rp6m7y, row.rp6m10y]
        .every((value) => Number.isFinite(value) && value > 0) ? row : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function reconstructHistoricalRealizedShares(supply, realized) {
  const directKeys = ["age_0d_1d", "age_1d_1w", "age_1w_1m", "age_1m_3m", "age_3m_6m", "age_6m_1y", "age_1y_2y", "age_2y_3y", "age_3y_4y"];
  if (!directKeys.every((key) => Number.isFinite(realized[key]))) return null;
  const supply7to8 = supply.age_7y_10y / 3;
  const supply8to10 = supply.age_7y_10y - supply7to8;
  const denominator4to8 = supply.age_4y_5y + supply.age_5y_7y + supply7to8;
  const denominator8plus = supply8to10 + supply.age_10y;
  const shares = Object.fromEntries(directKeys.map((key) => [key, realized[key] / 100]));
  shares.age_4y_5y = denominator4to8 > 0 ? (realized.age_4y_8y / 100) * (supply.age_4y_5y / denominator4to8) : 0;
  shares.age_5y_7y = denominator4to8 > 0 ? (realized.age_4y_8y / 100) * (supply.age_5y_7y / denominator4to8) : 0;
  shares.age_7y_10y = (denominator4to8 > 0 ? (realized.age_4y_8y / 100) * (supply7to8 / denominator4to8) : 0)
    + (denominator8plus > 0 ? (realized.age_8y_plus / 100) * (supply8to10 / denominator8plus) : 0);
  shares.age_10y = denominator8plus > 0 ? (realized.age_8y_plus / 100) * (supply.age_10y / denominator8plus) : 0;
  return shares;
}

function buildActualGroupPrices(supply, shares, totalRealizedCap) {
  return Object.fromEntries(Object.entries(PUBLIC_GROUPS).map(([field, keys]) => [
    field,
    publicGroupRealizedPrice(supply, shares, totalRealizedCap, keys)
  ]));
}

function buildModeledGroupPrices(priceRows, supply) {
  const bandPrices = Object.fromEntries(AGE_BANDS.map((band) => [
    band.key,
    estimateBandCost(priceRows, supply, band)
  ]));
  return Object.fromEntries(Object.entries(PUBLIC_GROUPS).map(([field, keys]) => [
    field,
    aggregateBandPrices(supply, bandPrices, keys)
  ]));
}

function estimateBandCost(priceRows, row, band) {
  const sampleCount = band.key === "age_10y" ? 10 : 8;
  let total = 0;
  let count = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const ageDays = band.minDays + ((band.maxDays - band.minDays) * (index + 0.5)) / sampleCount;
    const price = findPriceAtOrBefore(priceRows, row.timestamp - ageDays * 86_400_000);
    if (Number.isFinite(price) && price > 0) {
      total += price;
      count += 1;
    }
  }
  return count ? total / count : null;
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

function aggregateBandPrices(supply, bandPrices, keys) {
  const totalSupply = keys.reduce((sum, key) => sum + finiteOrZero(supply[key]), 0);
  const weightedCost = keys.reduce((sum, key) => sum + finiteOrZero(supply[key]) * finiteOrZero(bandPrices[key]), 0);
  return totalSupply > 0 && weightedCost > 0 ? weightedCost / totalSupply : null;
}

function publicGroupRealizedPrice(supply, shares, totalRealizedCap, keys) {
  const groupSupply = keys.reduce((sum, key) => sum + finiteOrZero(supply[key]), 0);
  const realizedShare = keys.reduce((sum, key) => sum + finiteOrZero(shares[key]), 0);
  return groupSupply > 0 && realizedShare > 0 ? (realizedShare * totalRealizedCap) / groupSupply : null;
}

function buildLthSeries(supplyRows, realizedCapRows, priceRows) {
  const supplyByDate = new Map(supplyRows.map((row) => [row.date, row]));
  const realizedByDate = new Map(realizedCapRows.map((row) => [row.date, row]));
  return priceRows
    .map((priceRow) => {
      const supply = supplyByDate.get(priceRow.date);
      const realized = realizedByDate.get(priceRow.date);
      if (!supply || !realized) return null;
      return {
        date: priceRow.date,
        price: priceRow.price,
        rp0to10y: aggregateRealizedPrice(supply, realized, BANDS_TO_10Y),
        rp6m5y: aggregateRealizedPrice(supply, realized, BANDS_6M_TO_5Y),
        rp6m7y: aggregateRealizedPrice(supply, realized, BANDS_6M_TO_7Y),
        rp6m10y: aggregateRealizedPrice(supply, realized, BANDS_6M_TO_10Y)
      };
    })
    .filter((row) => row && [row.price, row.rp0to10y, row.rp6m5y, row.rp6m7y, row.rp6m10y].every((value) => Number.isFinite(value) && value > 0))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function aggregateRealizedPrice(supplyRow, realizedCapRow, bands) {
  const supply = bands.reduce((sum, band) => sum + finiteOrZero(supplyRow[band]), 0);
  const realizedCap = bands.reduce((sum, band) => sum + finiteOrZero(realizedCapRow[`${band}_usd`]), 0);
  return supply > 0 && realizedCap > 0 ? realizedCap / supply : null;
}

function calculateLthSnapshot(series, livePrice) {
  const latest = series.at(-1);
  const price = livePrice?.value || latest.price;
  const crossStates = {
    below6m5y: latest.rp0to10y < latest.rp6m5y,
    below6m7y: latest.rp0to10y < latest.rp6m7y,
    below6m10y: latest.rp0to10y < latest.rp6m10y
  };
  const completedCrosses = Object.values(crossStates).filter(Boolean).length;
  const aboveCount = [latest.rp0to10y, latest.rp6m5y, latest.rp6m7y, latest.rp6m10y]
    .filter((basis) => price > basis).length;

  return {
    price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    rp0to10y: latest.rp0to10y,
    rp6m5y: latest.rp6m5y,
    rp6m7y: latest.rp6m7y,
    rp6m10y: latest.rp6m10y,
    estimated: Boolean(latest.estimated),
    premiums: {
      rp0to10y: ((price / latest.rp0to10y) - 1) * 100,
      rp6m5y: ((price / latest.rp6m5y) - 1) * 100,
      rp6m7y: ((price / latest.rp6m7y) - 1) * 100,
      rp6m10y: ((price / latest.rp6m10y) - 1) * 100
    },
    crossStates,
    completedCrosses,
    risk: aboveCount === 4 ? "high" : aboveCount >= 2 ? "elevated" : "washout"
  };
}

function parseCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function finiteOrZero(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function fulfilledValue(result) {
  return result?.status === "fulfilled" ? result.value : null;
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, {
    ...options,
    headers: { Accept: "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export {
  aggregateRealizedPrice,
  buildPublicLthSeries,
  buildLthSeries,
  calculateLthSnapshot,
  normalizeCryptoQuantRows,
  reconstructHistoricalRealizedShares
};
