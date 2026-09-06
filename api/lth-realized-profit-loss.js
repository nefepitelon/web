const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;

const FILE_BASE = "https://charts.bgeometrics.com/files";
const SOURCE_URLS = {
  profit: `${FILE_BASE}/realized_profit_lth.json`,
  loss: `${FILE_BASE}/realized_loss_lth.json`,
  price: `${FILE_BASE}/realized_profit_loss_ratio_btc_price.json`
};
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
  const cache = globalThis.__welinkLthRealizedProfitLossCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildPayload();
    globalThis.__welinkLthRealizedProfitLossCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Public refresh failed; serving the latest valid LTH realized profit/loss series."
      }, "STALE");
      return;
    }
    response.status(502).json({
      ok: false,
      error: "Unable to load the LTH realized profit/loss ratio",
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
  const [profitRows, lossRows, priceRows, livePrice] = await Promise.all([
    fetchPairSeries(SOURCE_URLS.profit),
    fetchPairSeries(SOURCE_URLS.loss),
    fetchPairSeries(SOURCE_URLS.price),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const series = buildLthRealizedProfitLossSeries(profitRows, lossRows, priceRows);
  if (series.length < 365) throw new Error("Public sources returned too few aligned observations");
  const underwaterZones = detectUnderwaterZones(series);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cadence: "daily",
    cacheSeconds: CACHE_TTL_MS / 1000,
    methodology: "7d_sma_of_lth_realized_profit_divided_by_absolute_lth_realized_loss",
    entityAdjusted: false,
    snapshot: calculateLthRealizedProfitLossSnapshot(series, livePrice, underwaterZones),
    underwaterZones,
    series,
    sources: {
      ratio: "BGeometrics public LTH realized profit/loss files",
      price: livePrice?.source || "BGeometrics daily price",
      history: "BGeometrics · UTXO-age LTH proxy",
      reference: "Glassnode Entity-Adjusted LTH Realized Profit/Loss Ratio",
      disclosure: "The public series is an over-155-day UTXO-age proxy. It does not reproduce Glassnode's proprietary entity-cluster adjustment."
    }
  };
}

function buildLthRealizedProfitLossSeries(profitRows, lossRows, priceRows) {
  const lossByTime = new Map(lossRows.map((row) => [row.timestamp, row.value]));
  const priceByTime = new Map(priceRows.map((row) => [row.timestamp, row.value]));
  const aligned = profitRows.map((row) => {
    const loss = Math.abs(Number(lossByTime.get(row.timestamp)));
    const price = Number(priceByTime.get(row.timestamp));
    const profit = Math.max(0, Number(row.value));
    if (!Number.isFinite(loss) || loss <= 0 || !Number.isFinite(price) || price <= 0 || !Number.isFinite(profit)) return null;
    return {
      timestamp: row.timestamp,
      date: new Date(row.timestamp).toISOString().slice(0, 10),
      price,
      profitBtc: profit,
      lossBtc: loss,
      rawRatio: profit / loss,
      profitUsd: profit * price,
      lossUsd: loss * price
    };
  }).filter(Boolean);

  const rolling7 = [];
  const rolling30 = [];
  let sum7 = 0;
  let sum30 = 0;
  return aligned.map((row) => {
    rolling7.push(row.rawRatio);
    rolling30.push(row.rawRatio);
    sum7 += row.rawRatio;
    sum30 += row.rawRatio;
    if (rolling7.length > 7) sum7 -= rolling7.shift();
    if (rolling30.length > 30) sum30 -= rolling30.shift();
    return {
      date: row.date,
      price: row.price,
      ratio: sum7 / rolling7.length,
      rawRatio: row.rawRatio,
      average7: sum7 / rolling7.length,
      average30: sum30 / rolling30.length,
      profitUsd: row.profitUsd,
      lossUsd: row.lossUsd
    };
  }).filter((row) => Number.isFinite(row.ratio) && row.ratio > 0);
}

function detectUnderwaterZones(series, minimumDays = 3) {
  const zones = [];
  let active = null;
  series.forEach((row, index) => {
    if (row.ratio < 1) {
      if (!active) active = { startIndex: index, start: row.date, minRatio: row.ratio, minDate: row.date, minPrice: row.price };
      if (row.ratio < active.minRatio) {
        active.minRatio = row.ratio;
        active.minDate = row.date;
        active.minPrice = row.price;
      }
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

function classifyLthRealizedProfitLoss(value) {
  if (value < 1) return "underwater";
  if (value < 1.5) return "pivot";
  if (value < 20) return "profit";
  return "distribution";
}

function calculateLthRealizedProfitLossSnapshot(series, livePrice, underwaterZones = detectUnderwaterZones(series)) {
  const latest = series.at(-1);
  const prior7 = series.at(-8) || series[0];
  const average7 = latest.average7;
  const average30 = latest.average30;
  const trend = average7 > average30 * 1.03 ? "rising" : average7 < average30 * 0.97 ? "falling" : "flat";
  const latestZone = underwaterZones.at(-1);
  const activeZone = latestZone?.active ? latestZone : null;
  return {
    current: latest.ratio,
    rawCurrent: latest.rawRatio,
    average7,
    average30,
    sevenDayChange: latest.ratio - prior7.ratio,
    distanceToOne: latest.ratio - 1,
    zone: classifyLthRealizedProfitLoss(latest.ratio),
    trend,
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    latestUnderwaterStart: activeZone?.start || null,
    underwaterDays: activeZone?.days || 0,
    profitUsd: latest.profitUsd,
    lossUsd: latest.lossUsd
  };
}

async function fetchPairSeries(url) {
  return normalizePairSeries(await fetchJson(url));
}

function normalizePairSeries(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map((row) => {
    if (!Array.isArray(row) || row.length < 2) return null;
    const timestamp = normalizeTimestamp(row[0]);
    const value = Number(row[1]);
    return Number.isFinite(timestamp) && Number.isFinite(value) ? { timestamp, value } : null;
  }).filter(Boolean).sort((left, right) => left.timestamp - right.timestamp);
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

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

export {
  buildLthRealizedProfitLossSeries,
  calculateLthRealizedProfitLossSnapshot,
  classifyLthRealizedProfitLoss,
  detectUnderwaterZones,
  normalizePairSeries
};
