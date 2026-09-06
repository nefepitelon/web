import { fetchPublicBtcPriceHistory, normalizePairSeries } from "./_bgeometrics-hodl-history.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;

const FILE_BASE = "https://charts.bgeometrics.com/files";
const SOURCE_URLS = {
  sopr: `${FILE_BASE}/lth_sopr.json`,
  price: `${FILE_BASE}/sopr_btc_price.json`
};
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

const RESEARCH_WINDOWS = [
  { cycle: "2014", start: "2014-09-13", end: "2015-01-14", days: 124, bottomPrice: null },
  { cycle: "2018", start: "2018-06-11", end: "2018-12-15", days: 188, bottomPrice: 3122 },
  { cycle: "2022", start: "2022-05-13", end: "2022-11-21", days: 193, bottomPrice: 15476 },
  { cycle: "2026", start: "2026-02-05", end: "2026-06-30", days: 146, bottomPrice: 57800 }
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
  const cache = globalThis.__welinkLthSpentPriceCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildPayload();
    globalThis.__welinkLthSpentPriceCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Public refresh failed; serving the latest valid LTH Spent Price series."
      }, "STALE");
      return;
    }
    response.status(502).json({
      ok: false,
      error: "Unable to load LTH Spent Price",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildPayload() {
  const [priceHistory, soprPayload, soprPricePayload, livePrice] = await Promise.all([
    fetchPublicBtcPriceHistory(),
    fetchJson(SOURCE_URLS.sopr),
    fetchJson(SOURCE_URLS.price),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const series = buildLthSpentPriceSeries(
    priceHistory,
    normalizePairSeries(soprPayload),
    normalizePairSeries(soprPricePayload)
  );
  if (series.length < 1000 || series.filter((row) => Number.isFinite(row.spentPrice)).length < 365) {
    throw new Error("Public sources returned too few LTH Spent Price observations");
  }
  const underwaterZones = detectUnderwaterZones(series);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cadence: "daily",
    cacheSeconds: CACHE_TTL_MS / 1000,
    methodology: "lth_spent_price_equals_daily_btc_price_divided_by_lth_sopr",
    exactHistoryStarts: series.find((row) => Number.isFinite(row.spentPrice))?.date || null,
    snapshot: calculateLthSpentPriceSnapshot(series, livePrice, underwaterZones),
    underwaterZones,
    researchWindows: RESEARCH_WINDOWS,
    series,
    sources: {
      priceHistory: "BGeometrics public BTC daily price history",
      lthSopr: "BGeometrics public LTH-SOPR daily series",
      livePrice: livePrice?.source || "BGeometrics daily BTC price",
      definition: "Glassnode: LTH Spent Price = spot price / LTH-SOPR for coins aged at least 155 days",
      disclosure: "The exact public LTH Spent Price line begins with the available public LTH-SOPR history. Earlier cycle windows are labeled research annotations and are not fabricated metric observations."
    }
  };
}

function buildLthSpentPriceSeries(priceHistory, soprRows, soprPriceRows) {
  const soprByDate = new Map(soprRows.map((row) => [dateKey(row.timestamp), row.value]));
  const metricPriceByDate = new Map(soprPriceRows.map((row) => [dateKey(row.timestamp), row.value]));
  const rolling7 = [];
  let sum7 = 0;

  return priceHistory.map((source) => {
    const date = source.date || dateKey(source.timestamp);
    const lthSopr = Number(soprByDate.get(date));
    const metricPrice = Number(metricPriceByDate.get(date));
    const price = Number.isFinite(metricPrice) && metricPrice > 0 ? metricPrice : Number(source.price ?? source.value);
    const spentPrice = Number.isFinite(lthSopr) && lthSopr > 0 && Number.isFinite(price) && price > 0
      ? price / lthSopr
      : null;
    if (Number.isFinite(spentPrice)) {
      rolling7.push(spentPrice);
      sum7 += spentPrice;
      if (rolling7.length > 7) sum7 -= rolling7.shift();
    }
    return {
      date,
      price,
      lthSopr: Number.isFinite(lthSopr) && lthSopr > 0 ? lthSopr : null,
      spentPrice,
      spentAverage7: Number.isFinite(spentPrice) ? sum7 / rolling7.length : null,
      underwater: Number.isFinite(spentPrice) ? price < spentPrice : null,
      source: Number.isFinite(spentPrice) ? "BGeometrics public LTH-SOPR" : "BGeometrics public BTC price"
    };
  }).filter((row) => Number.isFinite(row.price) && row.price > 0);
}

function detectUnderwaterZones(series, minimumDays = 3) {
  const exactRows = series.filter((row) => Number.isFinite(row.spentAverage7));
  const zones = [];
  let active = null;
  exactRows.forEach((row, index) => {
    const underwater = row.price < row.spentAverage7;
    if (underwater) {
      if (!active) active = { startIndex: index, start: row.date, minPrice: row.price, minDate: row.date };
      if (row.price < active.minPrice) {
        active.minPrice = row.price;
        active.minDate = row.date;
      }
      return;
    }
    if (!active) return;
    const endIndex = index - 1;
    const days = Math.max(1, Math.round((Date.parse(exactRows[endIndex].date) - Date.parse(active.start)) / DAY_MS) + 1);
    if (days >= minimumDays) zones.push({ ...active, end: exactRows[endIndex].date, days, active: false });
    active = null;
  });
  if (active) {
    const end = exactRows.at(-1).date;
    const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(active.start)) / DAY_MS) + 1);
    if (days >= minimumDays) zones.push({ ...active, end, days, active: true });
  }
  return zones.map(({ startIndex, ...zone }) => zone);
}

function classifyLthSpentPrice(price, spentPrice) {
  if (!Number.isFinite(price) || !Number.isFinite(spentPrice) || spentPrice <= 0) return "waiting";
  const ratio = price / spentPrice;
  if (ratio < 0.9) return "deep-underwater";
  if (ratio < 1) return "underwater";
  if (ratio < 1.08) return "reclaim-test";
  return "above-cost";
}

function calculateLthSpentPriceSnapshot(series, livePrice, underwaterZones = detectUnderwaterZones(series)) {
  const exactRows = series.filter((row) => Number.isFinite(row.spentPrice));
  const latest = exactRows.at(-1);
  const prior7 = exactRows.at(-8) || exactRows[0];
  if (!latest) throw new Error("LTH Spent Price series has no exact observations");
  const price = livePrice?.value || latest.price;
  const spentPrice = latest.spentPrice;
  const latestZone = underwaterZones.at(-1);
  const activeZone = latestZone?.active ? latestZone : null;
  return {
    current: spentPrice,
    average7: latest.spentAverage7,
    lthSopr: latest.lthSopr,
    sevenDayChange: spentPrice - prior7.spentPrice,
    price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    spread: price - spentPrice,
    priceToSpentRatio: price / spentPrice,
    underwater: price < spentPrice,
    zone: classifyLthSpentPrice(price, spentPrice),
    activeUnderwaterStart: activeZone?.start || null,
    underwaterDays: activeZone?.days || 0,
    latestPublicLow: Math.min(...exactRows.slice(-365).map((row) => row.price))
  };
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

function dateKey(timestamp) {
  const numeric = Number(timestamp);
  const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  return new Date(milliseconds).toISOString().slice(0, 10);
}

export {
  RESEARCH_WINDOWS,
  buildLthSpentPriceSeries,
  calculateLthSpentPriceSnapshot,
  classifyLthSpentPrice,
  detectUnderwaterZones
};
