const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const DAY_MS = 86_400_000;
const BOLLINGER_WINDOW = 200;
const BOLLINGER_STDDEV = 2;
const MACRO_BREAKOUT_GAP_DAYS = 120;
const COIN_METRICS_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const DEFILLAMA_STABLECOIN_URL = "https://stablecoins.llama.fi/stablecoincharts/all";
const CORE_STABLECOINS = ["usdt", "usdc", "dai", "tusd", "pax", "gusd", "busd"];
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
  const cache = globalThis.__welinkStablecoinSupplyRatioCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildStablecoinSupplyRatioPayload();
    globalThis.__welinkStablecoinSupplyRatioCacheV1 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "SSR refresh failed; serving the latest valid public-data payload."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load the BTC Stablecoin Supply Ratio model",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

async function buildStablecoinSupplyRatioPayload(now = new Date()) {
  const endDate = now.toISOString().slice(0, 10);
  const [btcRows, coreStableRows, llamaResult, livePrice] = await Promise.all([
    fetchCoinMetricsRows("btc", "CapMrktCurUSD,PriceUSD", "2017-01-01", endDate),
    fetchCoinMetricsRows(CORE_STABLECOINS.join(","), "CapMrktCurUSD", "2017-01-01", endDate),
    fetchDefiLlamaStablecoinHistory().catch(() => []),
    fetchLiveBtcPrice().catch(() => null)
  ]);

  const btc = normalizeCoinMetricsBtcRows(btcRows);
  const coreStable = normalizeCoinMetricsStablecoinRows(coreStableRows);
  const stablecoinTotal = normalizeDefiLlamaStablecoinRows(llamaResult);
  const series = calculateSsrBollingerSeries(btc, coreStable, stablecoinTotal);
  if (series.length < 2_500) throw new Error("Public SSR history returned too few aligned daily observations");

  const breakouts = detectUpperBreakouts(series);
  const macroBreakouts = clusterMacroBreakouts(breakouts);
  const referenceBreakouts = buildReferenceBreakouts(series, macroBreakouts);
  const snapshot = calculateSsrSnapshot(series, macroBreakouts, referenceBreakouts, livePrice, now);

  return {
    ok: true,
    stale: false,
    generatedAt: now.toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily-history + live-spot",
    methodology: {
      formula: "BTC current market capitalization / total stablecoin market capitalization",
      bollingerWindow: BOLLINGER_WINDOW,
      bollingerStdDev: BOLLINGER_STDDEV,
      stablecoinComposite: "For each day use the larger of DefiLlama's all-stablecoin aggregate and Coin Metrics' audited core-stablecoin basket, preventing incomplete early aggregate history from understating supply.",
      coreStablecoins: CORE_STABLECOINS
    },
    snapshot,
    breakouts: breakouts.slice(-36),
    macroBreakouts: macroBreakouts.slice(-16),
    referenceBreakouts,
    series,
    sources: {
      btcMarketCap: "Coin Metrics Community API · CapMrktCurUSD",
      btcPrice: livePrice?.source || "Coin Metrics Community API · PriceUSD",
      stablecoinAggregate: "DefiLlama public stablecoin history",
      stablecoinFloor: `Coin Metrics Community API · ${CORE_STABLECOINS.map((asset) => asset.toUpperCase()).join(" / ")}`,
      primary: COIN_METRICS_URL,
      aggregate: DEFILLAMA_STABLECOIN_URL,
      methodology: "SSR and Bollinger Bands are calculated in this service from public daily USD market-cap observations. Upper/lower bands use a 200-day population standard deviation at ±2σ. An upper breakout is a daily upward crossing; repeated crossings inside 120 days are treated as one macro episode."
    }
  };
}

function normalizeCoinMetricsBtcRows(rows) {
  return dedupeRows((rows || []).map((row) => {
    const date = String(row?.time || "").slice(0, 10);
    const marketCap = Number(row?.CapMrktCurUSD);
    const price = Number(row?.PriceUSD);
    return validDate(date) && Number.isFinite(marketCap) && marketCap > 0 && Number.isFinite(price) && price > 0
      ? { date, marketCap, price }
      : null;
  }).filter(Boolean));
}

function normalizeCoinMetricsStablecoinRows(rows) {
  const totals = new Map();
  (rows || []).forEach((row) => {
    const date = String(row?.time || "").slice(0, 10);
    const marketCap = Number(row?.CapMrktCurUSD);
    if (!validDate(date) || !Number.isFinite(marketCap) || marketCap <= 0) return;
    totals.set(date, (totals.get(date) || 0) + marketCap);
  });
  return [...totals.entries()].map(([date, marketCap]) => ({ date, marketCap })).sort(sortByDate);
}

function normalizeDefiLlamaStablecoinRows(rows) {
  return dedupeRows((rows || []).map((row) => {
    const seconds = Number(row?.date);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const date = new Date(seconds * 1000).toISOString().slice(0, 10);
    const values = Object.values(row?.totalCirculatingUSD || {});
    const marketCap = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
    return validDate(date) && Number.isFinite(marketCap) && marketCap > 0 ? { date, marketCap } : null;
  }).filter(Boolean));
}

function calculateSsrBollingerSeries(btcRows, coreStableRows, aggregateStableRows, windowSize = BOLLINGER_WINDOW, standardDeviations = BOLLINGER_STDDEV) {
  const coreByDate = new Map((coreStableRows || []).map((row) => [row.date, Number(row.marketCap)]));
  const aggregateByDate = new Map((aggregateStableRows || []).map((row) => [row.date, Number(row.marketCap)]));
  const series = (btcRows || []).map((row) => {
    const coreMarketCap = coreByDate.get(row.date) || 0;
    const aggregateMarketCap = aggregateByDate.get(row.date) || 0;
    const stablecoinMarketCap = Math.max(coreMarketCap, aggregateMarketCap);
    if (!Number.isFinite(stablecoinMarketCap) || stablecoinMarketCap < 10_000_000) return null;
    return {
      date: row.date,
      price: row.price,
      btcMarketCap: row.marketCap,
      stablecoinMarketCap,
      stablecoinSource: aggregateMarketCap > coreMarketCap ? "defillama" : "coinmetrics-core",
      ssr: row.marketCap / stablecoinMarketCap,
      mean: null,
      upper: null,
      lower: null,
      aboveUpper: false,
      belowLower: false
    };
  }).filter(Boolean).sort(sortByDate);

  for (let index = windowSize - 1; index < series.length; index += 1) {
    const window = series.slice(index - windowSize + 1, index + 1).map((row) => row.ssr);
    const mean = window.reduce((sum, value) => sum + value, 0) / windowSize;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / windowSize;
    const standardDeviation = Math.sqrt(variance);
    series[index].mean = mean;
    series[index].upper = mean + standardDeviations * standardDeviation;
    series[index].lower = Math.max(0, mean - standardDeviations * standardDeviation);
    series[index].aboveUpper = series[index].ssr > series[index].upper;
    series[index].belowLower = series[index].ssr < series[index].lower;
  }
  return series;
}

function detectUpperBreakouts(series) {
  const events = [];
  for (let index = 1; index < (series || []).length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (!Number.isFinite(previous?.upper) || !Number.isFinite(current?.upper)) continue;
    if (previous.ssr <= previous.upper && current.ssr > current.upper) {
      events.push({
        date: current.date,
        price: current.price,
        ssr: current.ssr,
        upper: current.upper,
        lower: current.lower,
        distanceToUpperPct: (current.ssr / current.upper - 1) * 100
      });
    }
  }
  return events;
}

function clusterMacroBreakouts(events, gapDays = MACRO_BREAKOUT_GAP_DAYS) {
  const macro = [];
  (events || []).forEach((event) => {
    const previous = macro.at(-1);
    if (!previous || daysBetween(previous.date, event.date) > gapDays) macro.push({ ...event });
  });
  return macro;
}

function buildReferenceBreakouts(series, macroBreakouts) {
  const references = [
    { cycle: "2019", start: "2019-04-01", end: "2019-08-31" },
    { cycle: "2023", start: "2023-01-01", end: "2023-04-30" }
  ];
  return references.map((reference) => {
    const event = (macroBreakouts || []).find((item) => item.date >= reference.start && item.date <= reference.end);
    if (!event) return null;
    const startIndex = series.findIndex((row) => row.date === event.date);
    const forward = startIndex >= 0 ? series.slice(startIndex, startIndex + 366) : [];
    const peak = forward.reduce((best, row) => !best || row.price > best.price ? row : best, null);
    return {
      cycle: reference.cycle,
      date: event.date,
      price: event.price,
      ssr: event.ssr,
      upper: event.upper,
      maxPrice365: peak?.price || null,
      daysToMax365: peak ? daysBetween(event.date, peak.date) : null,
      maxReturn365Pct: peak ? (peak.price / event.price - 1) * 100 : null
    };
  }).filter(Boolean);
}

function calculateSsrSnapshot(series, macroBreakouts, referenceBreakouts, livePrice = null, now = new Date()) {
  const latest = [...(series || [])].reverse().find((row) => Number.isFinite(row.upper));
  if (!latest) return null;
  const liveValue = Number(livePrice?.value);
  const price = Number.isFinite(liveValue) && liveValue > 0 ? liveValue : latest.price;
  const liveBtcMarketCap = latest.btcMarketCap * price / latest.price;
  const ssr = liveBtcMarketCap / latest.stablecoinMarketCap;
  const latestBreakout = (macroBreakouts || []).at(-1) || null;
  let confirmedCloses = 0;
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const row = series[index];
    if (!Number.isFinite(row.upper) || row.ssr <= row.upper) break;
    confirmedCloses += 1;
  }
  const daysSinceBreakout = latestBreakout ? daysBetween(latestBreakout.date, latest.date) : null;
  const liveAboveUpper = ssr > latest.upper;
  const dailyAboveUpper = latest.ssr > latest.upper;
  const averageDaysToMax365 = referenceBreakouts.length
    ? referenceBreakouts.reduce((sum, item) => sum + Number(item.daysToMax365 || 0), 0) / referenceBreakouts.length
    : null;
  const projectedMomentumCheckpointDate = latestBreakout && Number.isFinite(averageDaysToMax365)
    ? addDays(latestBreakout.date, Math.round(averageDaysToMax365))
    : null;
  const zone = dailyAboveUpper
    ? confirmedCloses >= 2 ? "breakout-confirmed" : "breakout-watch"
    : latest.ssr < latest.lower ? "below-lower" : "inside-band";

  return {
    price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    btcMarketCap: liveBtcMarketCap,
    stablecoinMarketCap: latest.stablecoinMarketCap,
    stablecoinSource: latest.stablecoinSource,
    ssr,
    dailySsr: latest.ssr,
    mean: latest.mean,
    upper: latest.upper,
    lower: latest.lower,
    distanceToUpperPct: (ssr / latest.upper - 1) * 100,
    aboveUpper: dailyAboveUpper,
    liveAboveUpper,
    dailyDistanceToUpperPct: (latest.ssr / latest.upper - 1) * 100,
    confirmedCloses,
    latestBreakoutDate: latestBreakout?.date || null,
    daysSinceBreakout,
    elapsedHours: latestBreakout ? Math.max(0, (now.getTime() - Date.parse(`${latestBreakout.date}T00:00:00Z`)) / 3_600_000) : null,
    zone,
    averageDaysToMax365,
    projectedMomentumCheckpointDate,
    followThroughWindowStart: latestBreakout ? addDays(latestBreakout.date, 180) : null,
    followThroughWindowEnd: latestBreakout ? addDays(latestBreakout.date, 365) : null,
    completedReferenceCycles: referenceBreakouts.length
  };
}

async function fetchCoinMetricsRows(assets, metrics, startDate, endDate) {
  const url = new URL(COIN_METRICS_URL);
  url.searchParams.set("assets", assets);
  url.searchParams.set("metrics", metrics);
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", startDate);
  url.searchParams.set("end_time", endDate);
  url.searchParams.set("page_size", "10000");
  let nextUrl = url.toString();
  const rows = [];
  let pages = 0;
  while (nextUrl && pages < 12) {
    const response = await fetchWithTimeout(nextUrl, {
      headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
    });
    if (!response.ok) throw new Error(`Coin Metrics ${response.status}`);
    const payload = await response.json();
    rows.push(...(payload?.data || []));
    nextUrl = payload?.next_page_url || null;
    pages += 1;
  }
  if (nextUrl) throw new Error("Coin Metrics pagination exceeded the safety limit");
  return rows;
}

async function fetchDefiLlamaStablecoinHistory() {
  const response = await fetchWithTimeout(DEFILLAMA_STABLECOIN_URL, {
    headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!response.ok) throw new Error(`DefiLlama ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" },
        timeoutMs: 8_000
      });
      if (!response.ok) throw new Error(`Binance ${response.status}`);
      const payload = await response.json();
      const value = Number(payload?.price);
      if (!Number.isFinite(value) || value <= 0) throw new Error("Invalid Binance BTC price");
      return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to load live BTC price");
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

function dedupeRows(rows) {
  return [...new Map(rows.map((row) => [row.date, row])).values()].sort(sortByDate);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sortByDate(left, right) {
  return left.date.localeCompare(right.date);
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
  BOLLINGER_STDDEV,
  BOLLINGER_WINDOW,
  CORE_STABLECOINS,
  buildReferenceBreakouts,
  buildStablecoinSupplyRatioPayload,
  calculateSsrBollingerSeries,
  calculateSsrSnapshot,
  clusterMacroBreakouts,
  detectUpperBreakouts,
  normalizeCoinMetricsBtcRows,
  normalizeCoinMetricsStablecoinRows,
  normalizeDefiLlamaStablecoinRows
};
