const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;

const MODEL_SLOPE = 2.53;
const MODEL_INTERCEPT = 0.46;
const MODEL_SIGMA = 0.6;
const EXPECTED_BLOCKS_PER_DAY = 144;
const DAYS_PER_YEAR = 365;

const COIN_METRICS_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const BLOCKCHAIN_SUPPLY_URL = "https://api.blockchain.info/charts/total-bitcoins?timespan=all&format=json&sampled=true";
const BGEOMETRICS_PRICE_URL = "https://bitcoin-data.com/api/v1/btc-price/csv";
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

const HALVINGS = [
  { date: "2012-11-28", epoch: 1, subsidy: 25, name: "1st Halving" },
  { date: "2016-07-09", epoch: 2, subsidy: 12.5, name: "2nd Halving" },
  { date: "2020-05-11", epoch: 3, subsidy: 6.25, name: "3rd Halving" },
  { date: "2024-04-20", epoch: 4, subsidy: 3.125, name: "4th Halving" }
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
  const cache = globalThis.__welinkStockToFlowCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildStockToFlowPayload();
    globalThis.__welinkStockToFlowCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "S2F refresh failed; serving the latest valid payload."
      }, "STALE");
      return;
    }
    response.status(502).json({
      ok: false,
      error: "Unable to load the Bitcoin Stock-to-Flow model",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildStockToFlowPayload() {
  let history;
  let historySource;
  try {
    history = await fetchCoinMetricsHistory();
    historySource = "Coin Metrics Community API";
  } catch (primaryError) {
    history = await fetchPublicFallbackHistory();
    historySource = "Blockchain.com supply + BGeometrics price";
    if (!history.length) throw primaryError;
  }
  if (history.length < 365) throw new Error("Public S2F inputs returned too few observations");

  const series = calculateStockToFlowSeries(history);
  const livePrice = await fetchLiveBtcPrice().catch(() => null);
  const snapshot = calculateStockToFlowSnapshot(series, livePrice);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    formula: { slope: MODEL_SLOPE, intercept: MODEL_INTERCEPT, sigma: MODEL_SIGMA },
    snapshot,
    halvings: buildHalvingComparisons(series),
    series,
    sources: {
      price: livePrice?.source || historySource,
      history: historySource,
      primary: COIN_METRICS_URL,
      supplyFallback: BLOCKCHAIN_SUPPLY_URL,
      priceFallback: BGEOMETRICS_PRICE_URL,
      methodology: "S2F = current on-chain supply / (block subsidy x 144 expected blocks/day x 365 days); ln(model price) = 2.53 x ln(S2F) + 0.46; logarithmic residual sigma = 0.6"
    }
  };
}

async function fetchCoinMetricsHistory() {
  const url = new URL(COIN_METRICS_URL);
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "PriceUSD,SplyCur");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", "2012-11-28");
  url.searchParams.set("end_time", new Date().toISOString().slice(0, 10));
  url.searchParams.set("page_size", "10000");
  const result = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!result.ok) throw new Error(`Coin Metrics ${result.status}`);
  const payload = await result.json();
  return dedupeSeries((payload?.data || []).map((row) => {
    const date = String(row?.time || "").slice(0, 10);
    const price = Number(row?.PriceUSD);
    const supply = Number(row?.SplyCur);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(supply) || supply <= 0) return null;
    return { date, price, supply };
  }).filter(Boolean));
}

async function fetchPublicFallbackHistory() {
  const [supplyResponse, priceResponse] = await Promise.all([
    fetchWithTimeout(BLOCKCHAIN_SUPPLY_URL, { headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" } }),
    fetchWithTimeout(BGEOMETRICS_PRICE_URL, { headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" } })
  ]);
  if (!supplyResponse.ok || !priceResponse.ok) throw new Error("Public S2F fallback inputs unavailable");
  const supplyPayload = await supplyResponse.json();
  const supplies = (supplyPayload?.values || []).map((row) => ({
    date: new Date(Number(row?.x) * 1000).toISOString().slice(0, 10),
    value: Number(row?.y)
  })).filter((row) => Number.isFinite(row.value) && row.value > 0);
  const prices = parsePublicCsv(await priceResponse.text(), ["btcPrice", "price", "value"]);
  return interpolateSupply(prices, supplies);
}

function parsePublicCsv(csv, valueKeys) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const valueKey = valueKeys.find((key) => headers.includes(key));
  const valueIndex = valueKey ? headers.indexOf(valueKey) : -1;
  if (valueIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const rawDate = dateIndex >= 0 ? values[dateIndex] : "";
    const rawTimestamp = Number(timestampIndex >= 0 ? values[timestampIndex] : NaN);
    const milliseconds = rawDate ? Date.parse(`${rawDate}T00:00:00Z`) : rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
    const value = Number(values[valueIndex]);
    if (!Number.isFinite(milliseconds) || !Number.isFinite(value) || value <= 0) return null;
    return { date: new Date(milliseconds).toISOString().slice(0, 10), value };
  }).filter(Boolean);
}

function interpolateSupply(priceRows, supplyRows) {
  const supplies = [...supplyRows].sort((left, right) => left.date.localeCompare(right.date));
  let cursor = 0;
  return priceRows.map((row) => {
    while (cursor < supplies.length - 2 && supplies[cursor + 1].date <= row.date) cursor += 1;
    const left = supplies[cursor];
    const right = supplies[Math.min(cursor + 1, supplies.length - 1)];
    if (!left || row.date < left.date) return null;
    const start = Date.parse(`${left.date}T00:00:00Z`);
    const end = Date.parse(`${right.date}T00:00:00Z`);
    const time = Date.parse(`${row.date}T00:00:00Z`);
    const progress = end > start ? Math.max(0, Math.min(1, (time - start) / (end - start))) : 0;
    const supply = left.value + (right.value - left.value) * progress;
    return row.date >= "2012-11-28" && Number.isFinite(supply) ? { date: row.date, price: row.value, supply } : null;
  }).filter(Boolean);
}

function dedupeSeries(rows) {
  return [...new Map(rows.map((row) => [row.date, row])).values()].sort((left, right) => left.date.localeCompare(right.date));
}

function subsidyForDate(date) {
  let subsidy = 50;
  for (const halving of HALVINGS) {
    if (date >= halving.date) subsidy = halving.subsidy;
  }
  return subsidy;
}

function calculateStockToFlowSeries(history) {
  return history.map((row) => {
    const subsidy = subsidyForDate(row.date);
    const annualFlow = subsidy * EXPECTED_BLOCKS_PER_DAY * DAYS_PER_YEAR;
    const stockToFlow = row.supply / annualFlow;
    const modelPrice = Math.exp(MODEL_SLOPE * Math.log(stockToFlow) + MODEL_INTERCEPT);
    const logDeviation = Math.log(row.price / modelPrice);
    return {
      ...row,
      subsidy,
      annualFlow,
      stockToFlow,
      modelPrice,
      minusTwo: modelPrice * Math.exp(-2 * MODEL_SIGMA),
      minusOne: modelPrice * Math.exp(-MODEL_SIGMA),
      plusOne: modelPrice * Math.exp(MODEL_SIGMA),
      plusTwo: modelPrice * Math.exp(2 * MODEL_SIGMA),
      logDeviation,
      sigmaDeviation: logDeviation / MODEL_SIGMA
    };
  });
}

function classifyDeviation(sigmaDeviation) {
  if (sigmaDeviation < -2) return "below-minus-two";
  if (sigmaDeviation < -1) return "below-minus-one";
  if (sigmaDeviation <= 1) return "model-range";
  if (sigmaDeviation <= 2) return "above-plus-one";
  return "above-plus-two";
}

function calculateStockToFlowSnapshot(series, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const currentPrice = livePrice?.value || latest.price;
  const logDeviation = Math.log(currentPrice / latest.modelPrice);
  const sigmaDeviation = logDeviation / MODEL_SIGMA;
  const weekStart = series.at(-Math.min(8, series.length));
  const priorDeviation = weekStart ? Math.log(weekStart.price / weekStart.modelPrice) : logDeviation;
  const sevenDayChange = logDeviation - priorDeviation;
  const trend = sevenDayChange > 0.03 ? "converging" : sevenDayChange < -0.03 ? "diverging" : "flat";
  const forwardTargets = [90, 180, 365].map((days) => {
    const projectedSupply = latest.supply + latest.subsidy * EXPECTED_BLOCKS_PER_DAY * days;
    const projectedS2f = projectedSupply / latest.annualFlow;
    const projectedModel = Math.exp(MODEL_SLOPE * Math.log(projectedS2f) + MODEL_INTERCEPT);
    return {
      days,
      modelPrice: projectedModel,
      minusOne: projectedModel * Math.exp(-MODEL_SIGMA),
      plusOne: projectedModel * Math.exp(MODEL_SIGMA)
    };
  });
  return {
    price: currentPrice,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    supply: latest.supply,
    subsidy: latest.subsidy,
    annualFlow: latest.annualFlow,
    stockToFlow: latest.stockToFlow,
    modelPrice: latest.modelPrice,
    minusTwo: latest.minusTwo,
    minusOne: latest.minusOne,
    plusOne: latest.plusOne,
    plusTwo: latest.plusTwo,
    logDeviation,
    deviationPct: logDeviation * 100,
    spotDiscountPct: (currentPrice / latest.modelPrice - 1) * 100,
    sigmaDeviation,
    zone: classifyDeviation(sigmaDeviation),
    sevenDayChange,
    trend,
    forwardTargets
  };
}

function nearestRow(series, date) {
  const target = Date.parse(`${date}T00:00:00Z`);
  return series.reduce((nearest, row) => {
    const distance = Math.abs(Date.parse(`${row.date}T00:00:00Z`) - target);
    return !nearest || distance < nearest.distance ? { row, distance } : nearest;
  }, null)?.row || null;
}

function buildHalvingComparisons(series) {
  return HALVINGS.map((halving) => {
    const row = nearestRow(series, halving.date);
    if (!row) return null;
    return {
      ...halving,
      actualPrice: row.price,
      modelPrice: row.modelPrice,
      deviationPct: (row.price / row.modelPrice - 1) * 100,
      logDeviationPct: row.logDeviation * 100
    };
  }).filter(Boolean);
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const result = await fetchWithTimeout(url, { headers: { Accept: "application/json" }, timeoutMs: 7_000 });
      if (!result.ok) throw new Error(`${result.status} ${url}`);
      const payload = await result.json();
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
  buildHalvingComparisons,
  buildStockToFlowPayload,
  calculateStockToFlowSeries,
  calculateStockToFlowSnapshot,
  classifyDeviation,
  interpolateSupply,
  parsePublicCsv,
  subsidyForDate
};
