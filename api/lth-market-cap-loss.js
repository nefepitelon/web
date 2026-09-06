const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const THRESHOLD = 27;

const PUBLIC_SERIES = {
  price: {
    urls: [
      "https://bitcoin-data.com/api/v1/btc-price/csv",
      "https://bitcoin-data.com/v1/btc-price?size=10000"
    ],
    valueKeys: ["btcPrice", "price", "value"]
  },
  lossMarketCap: {
    urls: [
      "https://bitcoin-data.com/api/v1/supply-loss-lth-usd/csv",
      "https://bitcoin-data.com/v1/supply-loss-lth-usd?size=2000",
      "https://bitcoin-data.com/api/supplyLossLthUsds?size=10000&sort=unixTs,asc"
    ],
    valueKeys: ["supplyLossLthUsd", "supplyLossLTHUsd", "lthSupplyLossUsd", "value"],
    mergeLatest: true
  },
  lthSupply: {
    urls: [
      "https://bitcoin-data.com/api/v1/long-term-hodler-supply-btc/csv",
      "https://bitcoin-data.com/v1/long-term-hodler-supply-btc?size=2000",
      "https://bitcoin-data.com/api/longTermHodlerSupplyBtcs?size=10000&sort=unixTs,asc"
    ],
    valueKeys: ["longTermHodlerSupplyBtc", "longTermHolderSupplyBtc", "lthSupplyBtc", "longTermHodlerSupply", "value"],
    mergeLatest: true
  },
  ancientSupply: {
    urls: [
      "https://bitcoin-data.com/api/v1/ancient-supply/csv",
      "https://bitcoin-data.com/v1/hodl-waves-supply?size=2000",
      "https://bitcoin-data.com/api/ancientSupplies?size=10000&sort=unixTs,asc"
    ],
    valueKeys: ["ancientSupply", "ancientSupplyBtc", "age_10y", "supply10y", "supply10Y", "value"],
    mergeLatest: true
  }
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
  const cache = globalThis.__welinkLthMarketCapLossCacheV6;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildLthMarketCapLossPayload();
    globalThis.__welinkLthMarketCapLossCacheV6 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "LTH market-cap-in-loss refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load BTC LTH market cap in loss",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildLthMarketCapLossPayload() {
  const [priceRows, lossMarketCapRows, lthSupplyRows, ancientSupplyRows, livePrice] = await Promise.all([
    fetchPublicSeries(PUBLIC_SERIES.price),
    fetchPublicSeries(PUBLIC_SERIES.lossMarketCap),
    fetchPublicSeries(PUBLIC_SERIES.lthSupply),
    fetchPublicSeries(PUBLIC_SERIES.ancientSupply),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const series = mergeLthMarketCapLossSeries(
    priceRows,
    lossMarketCapRows,
    lthSupplyRows,
    ancientSupplyRows
  );
  if (series.length < 365) throw new Error("Public LTH market-cap-in-loss history returned too few aligned observations");

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    threshold: THRESHOLD,
    snapshot: calculateLthMarketCapLossSnapshot(series, livePrice),
    series,
    sources: {
      price: livePrice?.source || "BGeometrics public BTC price",
      history: "BGeometrics public daily API",
      lossMarketCap: PUBLIC_SERIES.lossMarketCap.urls[0],
      lthSupply: PUBLIC_SERIES.lthSupply.urls[0],
      ancientSupply: PUBLIC_SERIES.ancientSupply.urls[1],
      methodology: "Public proxy: current-value LTH supply in loss / current-value LTH supply held 155 days to ten years"
    }
  };
}

async function fetchPublicSeries(source) {
  let lastError;
  const mergedRows = new Map();
  for (let index = 0; index < source.urls.length; index += 1) {
    const url = source.urls[index];
    if (index > 1 && mergedRows.size) break;
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          Accept: url.includes("/csv") ? "text/csv" : "application/hal+json, application/json",
          "User-Agent": "welinkBTC-onchain-dashboard/2.0"
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const contentType = String(response.headers?.get?.("content-type") || "");
      const rows = contentType.includes("json") || !url.includes("/csv")
        ? parsePublicJson(await response.json(), source.valueKeys)
        : parsePublicCsv(await response.text(), source.valueKeys);
      if (rows.length) {
        rows.forEach((row) => mergedRows.set(row.date, row));
        if (!source.mergeLatest) break;
        continue;
      }
      throw new Error(`No usable observations from ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  if (mergedRows.size) return [...mergedRows.values()].sort((left, right) => left.date.localeCompare(right.date));
  throw lastError || new Error("Public BGeometrics series unavailable");
}

function normalizePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return Number.NaN;
  return numeric <= 1.5 ? numeric * 100 : numeric;
}

function findValueKey(headers, valueKeys) {
  const normalizedKeys = Array.isArray(valueKeys) ? valueKeys : [valueKeys];
  return normalizedKeys.find((key) => headers.includes(key)) || null;
}

function parsePublicCsv(csv, valueKeys) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const valueKey = findValueKey(headers, valueKeys);
  const valueIndex = valueKey ? headers.indexOf(valueKey) : -1;
  if (valueIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const rawDate = dateIndex >= 0 ? values[dateIndex] : "";
    const rawTimestamp = timestampIndex >= 0 ? Number(values[timestampIndex]) : Number.NaN;
    const timestamp = rawDate
      ? Date.parse(`${rawDate}T00:00:00Z`)
      : rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
    const value = Number(values[valueIndex]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(value) || value < 0) return null;
    return { date: new Date(timestamp).toISOString().slice(0, 10), value };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function parsePublicJson(payload, valueKeys) {
  const embedded = payload?._embedded;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.content)
      ? payload.content
      : embedded && typeof embedded === "object"
        ? Object.values(embedded).find(Array.isArray) || []
        : payload && typeof payload === "object" && (payload.d || payload.unixTs)
          ? [payload]
          : [];
  if (!rows.length) return [];
  const keys = Object.keys(rows[0] || {});
  const valueKey = findValueKey(keys, valueKeys);
  if (!valueKey) return [];

  return rows.map((row) => {
    const rawTimestamp = Number(row.unixTs);
    const timestamp = row.d
      ? Date.parse(`${row.d}T00:00:00Z`)
      : rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
    const value = Number(row[valueKey]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(value) || value < 0) return null;
    return { date: new Date(timestamp).toISOString().slice(0, 10), value };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function mergeLthMarketCapLossSeries(priceRows, lossMarketCapRows, lthSupplyRows, ancientSupplyRows) {
  const priceByDate = new Map(priceRows.map((row) => [row.date, row.value]));
  const lthSupplyByDate = new Map(lthSupplyRows.map((row) => [row.date, row.value]));
  const ancientSupplyByDate = new Map(ancientSupplyRows.map((row) => [row.date, row.value]));
  return lossMarketCapRows.map((row) => {
    const price = priceByDate.get(row.date);
    const lthSupply = lthSupplyByDate.get(row.date);
    const ancientSupply = ancientSupplyByDate.get(row.date);
    if (![price, row.value, lthSupply, ancientSupply].every(Number.isFinite) || price <= 0 || lthSupply <= ancientSupply) return null;
    const activeLthMarketCap = (lthSupply - ancientSupply) * price;
    if (!Number.isFinite(activeLthMarketCap) || activeLthMarketCap <= 0 || row.value > activeLthMarketCap * 1.5) return null;
    return {
      date: row.date,
      price,
      ratio: row.value / activeLthMarketCap * 100,
      lossMarketCap: row.value,
      lthSupply,
      ancientSupply,
      activeLthMarketCap
    };
  }).filter(Boolean);
}

function calculateLthMarketCapLossSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const average = (count) => {
    const rows = series.slice(-count);
    return rows.reduce((sum, row) => sum + row.ratio, 0) / Math.max(rows.length, 1);
  };
  const average7 = average(7);
  const average30 = average(30);
  const sevenDayStart = series.at(-Math.min(8, series.length));
  const dailyChange = (latest.ratio - sevenDayStart.ratio) / Math.max(Math.min(7, series.length - 1), 1);
  const trend = dailyChange > 0.02 ? "rising" : dailyChange < -0.02 ? "falling" : "flat";
  const phase = latest.ratio >= THRESHOLD
    ? "capitulation"
    : latest.ratio >= 15
      ? "stressed"
      : latest.ratio >= 8
        ? "elevated"
        : "normal";

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    ratio: latest.ratio,
    average7,
    average30,
    dailyChange,
    trend,
    phase,
    threshold: THRESHOLD,
    distanceToThreshold: latest.ratio - THRESHOLD,
    historicalPeak: Math.max(...series.map((row) => row.ratio)),
    projected7d: Math.max(0, latest.ratio + dailyChange * 7)
  };
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" }, timeoutMs: 7_000 });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const payload = await response.json();
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const { timeoutMs, ...fetchOptions } = options;
    return await fetch(url, { ...fetchOptions, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export {
  buildLthMarketCapLossPayload,
  calculateLthMarketCapLossSnapshot,
  mergeLthMarketCapLossSeries,
  normalizePercent,
  parsePublicCsv,
  parsePublicJson
};
