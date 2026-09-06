import { AGE_BANDS, fetchPublicSupplyHistory } from "./_bgeometrics-hodl-history.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;

const BTC_HISTORY_URL = "https://charts.bgeometrics.com/files/realized_profit_loss_ratio_btc_price.json";
const GLASSNODE_API_URL = "https://api.glassnode.com/v1/metrics/market/price_realized_median_usd";
const GLASSNODE_PUBLIC_URL = "https://studio.glassnode.com/charts/market.PriceRealizedMedianUsd?a=BTC";
const NEWHEDGE_API_URL = "https://newhedge.io/api/v2/metrics/cost-basis-distribution-btc/cost_basis_per_coin_pct50";
const SNAPSHOT_STORE_PATH = "onchain/median-realized-price-snapshots.json";
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

// Newhedge exposes these observations in its public API documentation. They
// provide an honest seed for public-snapshot mode while daily values accrue.
const PUBLIC_DOCUMENTED_SNAPSHOTS = [
  [1784851200000, 62456],
  [1784937600000, 62478],
  [1785024000000, 62488]
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
  const cache = globalThis.__welinkMedianRealizedPriceCache;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildPayload();
    globalThis.__welinkMedianRealizedPriceCache = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Median realized price refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load BTC median realized price",
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
  const [source, livePrice] = await Promise.all([
    fetchMedianHistory(),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const priceRows = source.priceRows || await fetchPairSeries(BTC_HISTORY_URL);
  if (priceRows.length < 365) throw new Error("Public BTC price history returned too few observations");

  const series = buildMedianRealizedSeries(priceRows, source.rows);
  if (!series.some((row) => Number.isFinite(row.median))) throw new Error("Median realized price source returned no observations");

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    sourceMode: source.mode,
    completeHistory: source.complete,
    estimatedHistory: Boolean(source.estimated),
    snapshot: calculateMedianRealizedSnapshot(series, livePrice),
    series,
    sources: {
      median: source.label,
      price: livePrice?.source || "BGeometrics daily BTC price",
      methodology: source.methodology || "50th percentile of the BTC-weighted on-chain cost-basis distribution"
    }
  };
}

async function fetchMedianHistory() {
  if (process.env.NEW_HEDGE_API_TOKEN) {
    const payload = await fetchJson(`${NEWHEDGE_API_URL}?api_token=${encodeURIComponent(process.env.NEW_HEDGE_API_TOKEN)}`);
    const rows = normalizePairSeries(payload);
    if (rows.length >= 30) return { rows, mode: "newhedge-history", complete: true, label: "Newhedge Cost Basis P50" };
  }

  if (process.env.GLASSNODE_API_KEY) {
    const url = `${GLASSNODE_API_URL}?a=BTC&i=24h&api_key=${encodeURIComponent(process.env.GLASSNODE_API_KEY)}`;
    const payload = await fetchJson(url);
    const rows = normalizeGlassnodeSeries(payload);
    if (rows.length >= 30) return { rows, mode: "glassnode-history", complete: true, label: "Glassnode Median Realized Price" };
  }

  const [latest, storedSnapshots, supplyRows] = await Promise.all([
    fetchGlassnodePublicLatest().catch(() => null),
    readStoredSnapshots().catch(() => []),
    fetchPublicSupplyHistory()
  ]);
  const verifiedRows = normalizePairSeries([...PUBLIC_DOCUMENTED_SNAPSHOTS, ...storedSnapshots]);
  if (latest) {
    const timestamp = Date.parse(`${latest.date}T00:00:00Z`);
    const existing = verifiedRows.find((row) => row.timestamp === timestamp);
    if (existing) existing.value = latest.value;
    else verifiedRows.push({ timestamp, value: latest.value });
  }
  verifiedRows.sort((left, right) => left.timestamp - right.timestamp);
  await persistStoredSnapshots(verifiedRows).catch(() => {});
  const rows = buildPublicMedianHistory(supplyRows, verifiedRows);
  const firstTimestamp = rows[0]?.timestamp || 0;
  const priceRows = supplyRows
    .filter((row) => row.timestamp >= firstTimestamp)
    .map((row) => ({ timestamp: row.timestamp, value: row.price }));
  return {
    rows,
    priceRows,
    mode: "public-hodl-reconstruction",
    complete: true,
    estimated: true,
    label: "BGeometrics public HODL Waves · Glassnode public median anchors",
    methodology: "Continuous public estimate reconstructed from HODL-wave supply and historical last-moved prices; verified public median observations calibrate and override matching dates"
  };
}

function buildPublicMedianHistory(supplyRows, verifiedRows = []) {
  const priceRows = supplyRows
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.price) && row.price > 0)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (priceRows.length < 1000) return [];
  const firstTimestamp = priceRows[0].timestamp;
  const rawRows = [];
  let smoothedValue = null;
  const smoothingAlpha = 2 / 15;

  for (const supply of priceRows) {
    if (supply.date < "2013-04-28") continue;
    const samples = [];
    for (const band of AGE_BANDS) {
      const weight = Number(supply[band.key]);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      const ageAvailable = Math.max(1, Math.floor((supply.timestamp - firstTimestamp) / DAY_MS));
      const maxDays = Math.max(band.minDays + 1, Math.min(band.maxDays, ageAvailable));
      const sampleCount = band.key === "age_10y" ? 8 : 6;
      for (let index = 0; index < sampleCount; index += 1) {
        const ageDays = band.minDays + ((maxDays - band.minDays) * (index + 0.5)) / sampleCount;
        const acquisitionPrice = findPriceAtOrBefore(priceRows, supply.timestamp - ageDays * DAY_MS);
        if (Number.isFinite(acquisitionPrice) && acquisitionPrice > 0) {
          samples.push({ value: acquisitionPrice, weight: weight / sampleCount });
        }
      }
    }
    const rawMedian = weightedMedian(samples);
    if (!Number.isFinite(rawMedian) || rawMedian <= 0) continue;
    smoothedValue = smoothedValue === null
      ? rawMedian
      : smoothedValue + smoothingAlpha * (rawMedian - smoothedValue);
    rawRows.push({ timestamp: supply.timestamp, value: smoothedValue, estimated: true });
  }

  const calibrationRatios = verifiedRows
    .map((verified) => {
      const nearest = findNearestPair(rawRows, verified.timestamp, 14 * DAY_MS);
      return nearest && nearest.value > 0 ? verified.value / nearest.value : null;
    })
    .filter((value) => Number.isFinite(value) && value >= 0.8 && value <= 1.25)
    .sort((left, right) => left - right);
  const calibration = calibrationRatios.length
    ? calibrationRatios[Math.floor(calibrationRatios.length / 2)]
    : 1;
  const merged = new Map(rawRows.map((row) => [row.timestamp, { timestamp: row.timestamp, value: row.value * calibration, estimated: true }]));
  verifiedRows.forEach((row) => merged.set(row.timestamp, { timestamp: row.timestamp, value: row.value, estimated: false }));
  return [...merged.values()].sort((left, right) => left.timestamp - right.timestamp);
}

function weightedMedian(samples) {
  if (!samples.length) return null;
  const sorted = [...samples].sort((left, right) => left.value - right.value);
  const totalWeight = sorted.reduce((sum, sample) => sum + sample.weight, 0);
  let cumulative = 0;
  for (const sample of sorted) {
    cumulative += sample.weight;
    if (cumulative >= totalWeight / 2) return sample.value;
  }
  return sorted.at(-1)?.value ?? null;
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

function findNearestPair(rows, timestamp, tolerance) {
  if (!rows.length) return null;
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].timestamp < timestamp) low = middle + 1;
    else high = middle;
  }
  const candidates = [rows[low], rows[low - 1]].filter(Boolean);
  const nearest = candidates.sort((left, right) => Math.abs(left.timestamp - timestamp) - Math.abs(right.timestamp - timestamp))[0];
  return nearest && Math.abs(nearest.timestamp - timestamp) <= tolerance ? nearest : null;
}

async function readStoredSnapshots() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: SNAPSHOT_STORE_PATH, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === SNAPSHOT_STORE_PATH);
  if (!blob) return [];
  const response = await fetchWithTimeout(blob.url, { headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

async function persistStoredSnapshots(rows) {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !rows.length) return;
  const { put } = await import("@vercel/blob");
  const compactRows = rows.slice(-5000).map((row) => [row.timestamp, row.value]);
  await put(SNAPSHOT_STORE_PATH, JSON.stringify(compactRows), {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json"
  });
}

async function fetchGlassnodePublicLatest() {
  const response = await fetchWithTimeout(GLASSNODE_PUBLIC_URL, {
    headers: { Accept: "text/html", "User-Agent": "welinkBTC-onchain-dashboard/1.0" }
  });
  if (!response.ok) throw new Error(`${response.status} ${GLASSNODE_PUBLIC_URL}`);
  const html = await response.text();
  const value = parseGlassnodeLatestValue(html);
  if (!Number.isFinite(value)) throw new Error("Glassnode public latest value was not found");
  return { date: new Date().toISOString().slice(0, 10), value };
}

function parseGlassnodeLatestValue(html) {
  const text = String(html || "");
  const latestCard = text.match(/latestValueCard_rowValue[^>]*>\s*\$?([\d,]+(?:\.\d+)?)/i);
  const labelled = text.match(/Latest Values[\s\S]{0,1200}?\$([\d,]+(?:\.\d+)?)/i);
  const match = latestCard || labelled;
  return match ? Number(match[1].replace(/,/g, "")) : NaN;
}

function normalizeGlassnodeSeries(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => ({ timestamp: normalizeTimestamp(row?.t), value: Number(row?.v) }))
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.value) && row.value > 0)
    .sort((left, right) => left.timestamp - right.timestamp);
}

async function fetchPairSeries(url) {
  const payload = await fetchJson(url);
  return normalizePairSeries(payload);
}

function normalizePairSeries(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      if (!Array.isArray(row) || row.length < 2) return null;
      const timestamp = normalizeTimestamp(row[0]);
      const value = Number(row[1]);
      return Number.isFinite(timestamp) && Number.isFinite(value) && value > 0 ? { timestamp, value } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);
}

function buildMedianRealizedSeries(priceRows, medianRows) {
  const medianByDay = new Map(medianRows.map((row) => [new Date(row.timestamp).toISOString().slice(0, 10), row]));
  const series = priceRows.map((row) => {
    const date = new Date(row.timestamp).toISOString().slice(0, 10);
    const medianRow = medianByDay.get(date);
    return {
      date,
      price: row.value,
      median: medianRow?.value ?? null,
      medianEstimated: Boolean(medianRow?.estimated)
    };
  });
  const existingDates = new Set(series.map((row) => row.date));
  medianRows.forEach((row) => {
    const date = new Date(row.timestamp).toISOString().slice(0, 10);
    if (existingDates.has(date)) return;
    const nearestPrice = priceRows.reduce((best, candidate) => {
      const distance = Math.abs(candidate.timestamp - row.timestamp);
      return !best || distance < best.distance ? { value: candidate.value, distance } : best;
    }, null)?.value;
    if (Number.isFinite(nearestPrice)) {
      series.push({ date, price: nearestPrice, median: row.value, medianEstimated: Boolean(row.estimated) });
    }
  });
  return series.sort((left, right) => left.date.localeCompare(right.date));
}

function calculateMedianRealizedSnapshot(series, livePrice) {
  const medianRows = series.filter((row) => Number.isFinite(row.median));
  const latestMedian = medianRows.at(-1);
  if (!latestMedian) return null;
  const latestPriceRow = series.at(-1);
  const price = livePrice?.value || latestPriceRow.price;
  const ratio = price / latestMedian.median;
  const nearest = (daysAgo, toleranceDays) => {
    const target = Date.parse(`${latestMedian.date}T00:00:00Z`) - daysAgo * DAY_MS;
    const match = medianRows.reduce((best, row) => {
      const distance = Math.abs(Date.parse(`${row.date}T00:00:00Z`) - target);
      return !best || distance < best.distance ? { row, distance } : best;
    }, null);
    return match && match.distance <= toleranceDays * DAY_MS ? match.row : null;
  };
  const monthAgo = nearest(30, 10);
  const yearAgo = nearest(365, 45);
  const fourYearsAgo = nearest(365 * 4, 90);
  const monthlyChange = monthAgo && monthAgo.date !== latestMedian.date ? latestMedian.median - monthAgo.median : null;
  const monthlyPercent = Number.isFinite(monthlyChange) ? (monthlyChange / monthAgo.median) * 100 : null;
  const yoyGrowth = yearAgo && yearAgo.date !== latestMedian.date ? ((latestMedian.median / yearAgo.median) - 1) * 100 : null;
  const fourYearGrowth = fourYearsAgo && fourYearsAgo.date !== latestMedian.date ? ((latestMedian.median / fourYearsAgo.median) - 1) * 100 : null;
  const zone = ratio < 0.95 ? "below" : ratio <= 1.15 ? "support" : ratio <= 1.8 ? "balanced" : "extended";

  return {
    price,
    priceAsOf: livePrice?.asOf || `${latestPriceRow.date}T00:00:00.000Z`,
    median: latestMedian.median,
    medianEstimated: Boolean(latestMedian.medianEstimated),
    medianAsOf: latestMedian.date,
    ratio,
    distanceUsd: price - latestMedian.median,
    distancePercent: (ratio - 1) * 100,
    monthlyChange,
    monthlyPercent,
    monthlyTrend: !Number.isFinite(monthlyPercent) ? "unavailable" : monthlyPercent > 1 ? "rising" : monthlyPercent < -1 ? "falling" : "flat",
    oneYearAgo: yearAgo && yearAgo.date !== latestMedian.date ? yearAgo.median : null,
    fourYearsAgo: fourYearsAgo && fourYearsAgo.date !== latestMedian.date ? fourYearsAgo.median : null,
    yoyGrowth,
    fourYearGrowth,
    zone
  };
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const payload = await fetchJson(url, { timeoutMs: 7_000 });
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
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

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

export {
  buildPayload,
  buildPublicMedianHistory,
  buildMedianRealizedSeries,
  calculateMedianRealizedSnapshot,
  normalizeGlassnodeSeries,
  normalizePairSeries,
  parseGlassnodeLatestValue
};
