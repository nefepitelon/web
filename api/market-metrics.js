const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

const GLASSNODE_BASE = "https://studio.glassnode.com/charts/";

const GLASSNODE_METRICS = {
  balancedPrice: { path: "indicators.BalancedPriceUsd?a=BTC", unit: "usd", cadence: "daily" },
  mvrvZ: { path: "market.MvrvZScore?a=BTC", unit: "ratio", cadence: "daily" },
  nupl: { path: "indicators.NetUnrealizedProfitLoss?a=BTC", unit: "ratio", cadence: "daily" },
  sopr: { path: "indicators.Sopr?a=BTC", unit: "ratio", cadence: "daily" },
  puell: { path: "indicators.PuellMultiple?a=BTC", unit: "ratio", cadence: "daily" },
  profitSupply: { path: "supply.ProfitRelative?a=BTC", unit: "percent", cadence: "daily" },
  fundingFallback: { path: "derivatives.FuturesFundingRatePerpetual?a=BTC", unit: "percent", cadence: "daily" },
  openInterestFallback: { path: "derivatives.FuturesOpenInterestSum?a=BTC", unit: "usd", cadence: "daily" },
  optionsOiFallback: { path: "derivatives.OptionsOpenInterestSum?a=BTC", unit: "usd", cadence: "daily" },
  etfFlow: { path: "institutions.UsSpotEtfFlowsNet?a=BTC&c=usd", unit: "usd", cadence: "daily" },
  liquidationFallback: { path: "derivatives.FuturesLiquidatedTotalVolumeSum?a=BTC&c=usd", unit: "usd", cadence: "daily" }
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
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const now = Date.now();
  const warmCache = globalThis.__welinkMarketMetricsCache;
  if (warmCache?.payload && now - warmCache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, warmCache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildPayload(warmCache?.payload);
    globalThis.__welinkMarketMetricsCache = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (warmCache?.payload && now - warmCache.savedAt < MAX_STALE_MS) {
      const stalePayload = {
        ...warmCache.payload,
        stale: true,
        partial: true,
        generatedAt: new Date().toISOString(),
        warning: "Serving the most recent valid metric snapshot"
      };
      sendPayload(response, stalePayload, "STALE");
      return;
    }

    response.status(502).json({
      ok: false,
      error: "Unable to load extended BTC metrics",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

async function buildPayload(previousPayload) {
  const generatedAt = new Date().toISOString();
  const glassnodeEntries = await Promise.allSettled(
    Object.entries(GLASSNODE_METRICS).map(async ([key, config]) => [key, await fetchGlassnodeMetric(config)])
  );
  const glassnode = Object.fromEntries(
    glassnodeEntries
      .filter((entry) => entry.status === "fulfilled")
      .map((entry) => entry.value)
  );

  const [coinglassResult, binanceResult, deribitResult] = await Promise.allSettled([
    fetchCoinglassSnapshot(),
    fetchBinanceFuturesSnapshot(),
    fetchDeribitOptionsSnapshot()
  ]);

  const coinglass = fulfilledValue(coinglassResult);
  const binance = fulfilledValue(binanceResult);
  const deribit = fulfilledValue(deribitResult);
  const previousMetrics = previousPayload?.metrics || {};
  const metrics = {};

  for (const key of ["balancedPrice", "mvrvZ", "nupl", "sopr", "puell", "profitSupply"]) {
    assignMetric(metrics, key, glassnode[key], previousMetrics[key]);
  }

  assignMetric(
    metrics,
    "funding",
    coinglass?.funding || binance?.funding || glassnode.fundingFallback,
    previousMetrics.funding
  );
  assignMetric(
    metrics,
    "openInterest",
    coinglass?.openInterest || binance?.openInterest || glassnode.openInterestFallback,
    previousMetrics.openInterest
  );
  assignMetric(
    metrics,
    "optionsOi",
    coinglass?.optionsOi || deribit?.optionsOi || glassnode.optionsOiFallback,
    previousMetrics.optionsOi
  );
  assignMetric(metrics, "etfFlow", coinglass?.etfFlow || glassnode.etfFlow, previousMetrics.etfFlow);
  assignMetric(
    metrics,
    "liquidation",
    coinglass?.liquidation || glassnode.liquidationFallback,
    previousMetrics.liquidation
  );

  const required = [
    "balancedPrice",
    "mvrvZ",
    "nupl",
    "sopr",
    "puell",
    "profitSupply",
    "funding",
    "openInterest",
    "optionsOi",
    "etfFlow",
    "liquidation"
  ];
  const missing = required.filter((key) => !metrics[key]);
  if (missing.length === required.length) throw new Error("All extended metric sources failed");

  return {
    ok: true,
    partial: missing.length > 0,
    stale: Object.values(metrics).some((metric) => metric.stale),
    generatedAt,
    cacheSeconds: CACHE_TTL_MS / 1000,
    missing,
    metrics
  };
}

async function fetchGlassnodeMetric(config) {
  const { text, headers } = await fetchText(`${GLASSNODE_BASE}${config.path}`);
  const extracted = extractLatestValue(text);
  if (!Number.isFinite(extracted.value)) throw new Error(`Glassnode value unavailable: ${config.path}`);

  return {
    value: extracted.value,
    unit: config.unit,
    cadence: config.cadence,
    asOf: relativeLabelToIso(extracted.label, headers.get("last-modified")),
    source: "Glassnode Studio"
  };
}

async function fetchCoinglassSnapshot() {
  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) throw new Error("COINGLASS_API_KEY is not configured");

  const [marketPayload, optionsPayload, etfPayload] = await Promise.all([
    fetchJson("https://open-api-v4.coinglass.com/api/futures/coins-markets", {
      headers: { "CG-API-KEY": apiKey }
    }),
    fetchJson("https://open-api-v4.coinglass.com/api/option/info?symbol=BTC", {
      headers: { "CG-API-KEY": apiKey }
    }),
    fetchJson("https://open-api-v4.coinglass.com/api/bitcoin/etf/flow-history", {
      headers: { "CG-API-KEY": apiKey }
    }).catch(() => null)
  ]);

  const market = asArray(marketPayload?.data).find((item) => String(item?.symbol).toUpperCase() === "BTC");
  const options = asArray(optionsPayload?.data).find((item) => String(item?.exchange_name || item?.exchange).toLowerCase() === "all")
    || asArray(optionsPayload?.data)[0];
  const etfPoint = latestDatedItem(asArray(etfPayload?.data));
  const asOf = new Date().toISOString();
  const snapshot = {};

  addSnapshotMetric(snapshot, "funding", market?.avg_funding_rate_by_oi, "percent", "realtime", asOf, "CoinGlass");
  addSnapshotMetric(snapshot, "openInterest", market?.open_interest_usd, "usd", "realtime", asOf, "CoinGlass");
  addSnapshotMetric(snapshot, "optionsOi", options?.open_interest_usd, "usd", "realtime", asOf, "CoinGlass");
  addSnapshotMetric(
    snapshot,
    "liquidation",
    market?.liquidation_usd_24h ?? market?.liquidation_usd_24h_total,
    "usd",
    "rolling-24h",
    asOf,
    "CoinGlass"
  );
  addSnapshotMetric(
    snapshot,
    "etfFlow",
    firstFinite(etfPoint?.net_flow_usd, etfPoint?.netflow_usd, etfPoint?.net_flow, etfPoint?.flow_usd),
    "usd",
    "daily",
    normalizeDate(etfPoint?.time || etfPoint?.timestamp || etfPoint?.date) || asOf,
    "CoinGlass"
  );

  return snapshot;
}

async function fetchBinanceFuturesSnapshot() {
  const origins = ["https://fapi.binance.com", "https://fapi1.binance.com", "https://fapi2.binance.com"];
  let lastError;

  for (const origin of origins) {
    try {
      const [premium, interest] = await Promise.all([
        fetchJson(`${origin}/fapi/v1/premiumIndex?symbol=BTCUSDT`, { timeoutMs: 5_000 }),
        fetchJson(`${origin}/fapi/v1/openInterest?symbol=BTCUSDT`, { timeoutMs: 5_000 })
      ]);
      const markPrice = Number(premium?.markPrice);
      const openInterestBtc = Number(interest?.openInterest);
      const fundingRate = Number(premium?.lastFundingRate) * 100;
      const asOf = normalizeDate(premium?.time) || new Date().toISOString();
      const snapshot = {};

      addSnapshotMetric(snapshot, "funding", fundingRate, "percent", "realtime", asOf, "Binance Futures");
      addSnapshotMetric(snapshot, "openInterest", openInterestBtc * markPrice, "usd", "realtime", asOf, "Binance Futures");
      if (snapshot.funding || snapshot.openInterest) return snapshot;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Binance Futures unavailable");
}

async function fetchDeribitOptionsSnapshot() {
  const payload = await fetchJson("https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option");
  const rows = asArray(payload?.result);
  const value = rows.reduce((sum, item) => {
    const openInterest = Number(item?.open_interest);
    const underlyingPrice = Number(item?.underlying_price);
    return Number.isFinite(openInterest) && Number.isFinite(underlyingPrice)
      ? sum + openInterest * underlyingPrice
      : sum;
  }, 0);
  if (!(value > 0)) throw new Error("Deribit options OI unavailable");

  return {
    optionsOi: {
      value,
      unit: "usd",
      cadence: "realtime",
      asOf: new Date().toISOString(),
      source: "Deribit"
    }
  };
}

function extractLatestValue(html) {
  const marker = html.search(/Latest Values/i);
  const scope = marker >= 0 ? html.slice(marker, marker + 12_000) : html;
  const valueMatch = scope.match(/latestValueCard_rowValue[^>]*>([^<]+)<\/span>/i)
    || scope.match(/Latest value:\s*([^<(]+)/i);
  const labelMatch = scope.match(/latestValueCard_rowLabel[^>]*>([^<]+)<\/span>/i)
    || scope.match(/as of\s+([0-9A-Za-z ]+)/i);
  const raw = decodeEntities(valueMatch?.[1] || "").trim();
  return { value: parseDecoratedNumber(raw), raw, label: decodeEntities(labelMatch?.[1] || "").trim() };
}

function parseDecoratedNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^0-9+\-.]/g, "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function assignMetric(target, key, liveMetric, previousMetric) {
  if (liveMetric && Number.isFinite(Number(liveMetric.value))) {
    target[key] = { ...liveMetric, value: Number(liveMetric.value) };
    return;
  }
  if (previousMetric && Number.isFinite(Number(previousMetric.value))) {
    target[key] = { ...previousMetric, stale: true };
  }
}

function addSnapshotMetric(target, key, value, unit, cadence, asOf, source) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  target[key] = { value: numeric, unit, cadence, asOf, source };
}

function fulfilledValue(result) {
  return result.status === "fulfilled" ? result.value : null;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value).flatMap((item) => asArray(item));
  return [];
}

function latestDatedItem(items) {
  return items
    .filter((item) => item && typeof item === "object")
    .sort((left, right) => dateValue(right) - dateValue(left))[0];
}

function dateValue(item) {
  const raw = item?.time || item?.timestamp || item?.date || 0;
  const normalized = typeof raw === "number" && raw < 100_000_000_000 ? raw * 1000 : raw;
  return new Date(normalized).getTime() || 0;
}

function firstFinite(...values) {
  const match = values.map(Number).find(Number.isFinite);
  return match ?? null;
}

function normalizeDate(value) {
  if (value == null || value === "") return null;
  const normalized = typeof value === "number" && value < 100_000_000_000 ? value * 1000 : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function relativeLabelToIso(label, lastModified) {
  const lower = String(label || "").toLowerCase();
  const number = Number(lower.match(/([0-9]+(?:\.[0-9]+)?)/)?.[1]);
  if (Number.isFinite(number)) {
    if (lower.includes("minute")) return new Date(Date.now() - number * 60_000).toISOString();
    if (lower.includes("hour")) return new Date(Date.now() - number * 3_600_000).toISOString();
    if (lower.includes("day")) return new Date(Date.now() - number * 86_400_000).toISOString();
  }
  const parsedLabel = new Date(label);
  if (!Number.isNaN(parsedLabel.getTime())) return parsedLabel.toISOString();
  const parsedHeader = new Date(lastModified || "");
  if (!Number.isNaN(parsedHeader.getTime())) return parsedHeader.toISOString();
  return new Date().toISOString();
}

async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const payload = await response.json();
  if (payload?.code != null && String(payload.code) !== "0" && String(payload.code) !== "200") {
    throw new Error(payload.msg || payload.message || `Upstream code ${payload.code}`);
  }
  return payload;
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; welinkBTC-data/1.0)"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return { text: await response.text(), headers: response.headers };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Accept: "application/json", ...(options.headers || {}) },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function decodeEntities(value) {
  return String(value)
    .replace(/&minus;/g, "-")
    .replace(/&dollar;/g, "$")
    .replace(/&percnt;/g, "%")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&");
}

function sendPayload(response, payload, cacheStatus) {
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
  response.setHeader("X-welinkBTC-Cache", cacheStatus);
  response.status(200).json(payload);
}
