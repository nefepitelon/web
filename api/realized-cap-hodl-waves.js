import {
  fetchExactRealizedCapShares,
  fetchPublicBtcPriceHistory,
  fetchPublicRealizedCapHistory,
} from "./_bgeometrics-hodl-history.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const DEEP_LOCK_THRESHOLD = 0.84;
const ACCUMULATION_THRESHOLD = 0.75;
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];
const GLASSNODE_PUBLIC_CHART_URL = "https://studio.glassnode.com/charts/supply.RcapHodlWaves?a=BTC";

const BAND_KEYS = ["threeToSix", "sixToTwelve", "oneToTwo", "twoToThree", "threeToFour", "fourPlus"];

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
  const cache = globalThis.__welinkRealizedCapHodlWavesCacheV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildRealizedCapHodlWavesPayload();
    globalThis.__welinkRealizedCapHodlWavesCacheV1 = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Realized-cap HODL Waves refresh failed; serving the latest valid public payload."
      }, "STALE");
      return;
    }
    response.status(502).json({
      ok: false,
      error: "Unable to load Bitcoin Realized Cap HODL Waves",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildRealizedCapHodlWavesPayload() {
  const [realizedRows, publicExactRows, glassnodeLatest, priceRows, livePrice] = await Promise.all([
    fetchPublicRealizedCapHistory(),
    fetchExactRealizedCapShares().catch(() => []),
    fetchGlassnodeLatestRealizedCapShares().catch(() => null),
    fetchPublicBtcPriceHistory(),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const exactRows = publicExactRows.length
    ? publicExactRows.map((row) => ({ ...row, source: "bitcoin-data" }))
    : glassnodeLatest
      ? [buildGlassnodeFallbackRow(glassnodeLatest, realizedRows)]
      : [];
  const result = buildRealizedCapHodlWaveSeries(realizedRows, exactRows, priceRows);
  if (result.series.length < 1000) throw new Error("Public realized-cap HODL-wave sources returned too few aligned observations");
  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cadence: "daily",
    cacheSeconds: CACHE_TTL_MS / 1000,
    methodology: "realized_cap_weighted_hodl_waves_older_than_3_months",
    thresholds: { accumulation: ACCUMULATION_THRESHOLD, deepLock: DEEP_LOCK_THRESHOLD },
    bands: [
      { key: "threeToSix", label: "3M-6M" },
      { key: "sixToTwelve", label: "6M-1Y" },
      { key: "oneToTwo", label: "1Y-2Y" },
      { key: "twoToThree", label: "2Y-3Y" },
      { key: "threeToFour", label: "3Y-4Y" },
      { key: "fourPlus", label: "4Y+" }
    ],
    extension: result.extension,
    snapshot: calculateRealizedCapHodlSnapshot(result.series, livePrice),
    peaks: detectCyclePeaks(result.series),
    series: result.series,
    sources: {
      history: "BGeometrics public realized-cap HODL Waves",
      exactExtension: result.extension.source === "bitcoin-data"
        ? "Bitcoin Data public exact realized-cap HODL Waves"
        : result.extension.source === "glassnode-latest"
          ? "Glassnode public latest-values card"
          : null,
      price: livePrice?.source || "BGeometrics public daily BTC price",
      disclosure: "The complete history is grouped into six common public age bands. The exact public feed is preferred for the latest tail. When it is rate-limited, only the newest Glassnode public snapshot is appended; its combined 3y+ share is split using the last valid public long-band structure. No synthetic historical backfill is used."
    }
  };
}

function buildRealizedCapHodlWaveSeries(realizedRows, exactRows, priceRows) {
  const pricesByDate = new Map(priceRows.map((row) => [row.date, Number(row.price)]));
  const rowsByDate = new Map();
  realizedRows.forEach((row) => {
    const grouped = groupBgeometricsBands(row);
    if (grouped) rowsByDate.set(row.date, { date: row.date, ...grouped, source: "bgeometrics" });
  });
  const baselineThrough = [...rowsByDate.keys()].sort().at(-1) || null;
  let extensionStart = null;
  let extensionSource = null;
  exactRows.forEach((row) => {
    if (baselineThrough && row.date <= baselineThrough) return;
    const grouped = groupExactBands(row);
    if (!grouped) return;
    const source = row.source || "bitcoin-data";
    rowsByDate.set(row.date, { date: row.date, ...grouped, source });
    if (!extensionStart) {
      extensionStart = row.date;
      extensionSource = source;
    }
  });

  const rolling7 = [];
  const rolling30 = [];
  let sum7 = 0;
  let sum30 = 0;
  const series = [...rowsByDate.values()]
    .map((row) => ({ ...row, price: pricesByDate.get(row.date) }))
    .filter((row) => Number.isFinite(row.price) && row.price > 0)
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => {
      const overThreeMonths = BAND_KEYS.reduce((sum, key) => sum + row[key], 0);
      rolling7.push(overThreeMonths);
      rolling30.push(overThreeMonths);
      sum7 += overThreeMonths;
      sum30 += overThreeMonths;
      if (rolling7.length > 7) sum7 -= rolling7.shift();
      if (rolling30.length > 30) sum30 -= rolling30.shift();
      return {
        ...row,
        overThreeMonths,
        average7: sum7 / rolling7.length,
        average30: sum30 / rolling30.length
      };
    });
  return { series, extension: { baselineThrough, start: extensionStart, source: extensionSource } };
}

function groupBgeometricsBands(row) {
  return normalizeGroupedBands({
    threeToSix: row.age_3m_6m,
    sixToTwelve: row.age_6m_1y,
    oneToTwo: row.age_1y_2y,
    twoToThree: row.age_2y_3y,
    threeToFour: row.age_3y_4y,
    fourPlus: Number(row.age_4y_8y) + Number(row.age_8y_plus)
  });
}

function groupExactBands(row) {
  if (row.grouped) return normalizeGroupedBands(row.grouped);
  return normalizeGroupedBands({
    threeToSix: row.age_3m_6m,
    sixToTwelve: row.age_6m_1y,
    oneToTwo: row.age_1y_2y,
    twoToThree: row.age_2y_3y,
    threeToFour: row.age_3y_4y,
    fourPlus: Number(row.age_4y_5y) + Number(row.age_5y_7y) + Number(row.age_7y_10y) + Number(row.age_10y)
  });
}

async function fetchGlassnodeLatestRealizedCapShares() {
  const response = await fetch(GLASSNODE_PUBLIC_CHART_URL, {
    headers: { Accept: "text/html", "User-Agent": "welinkBTC-onchain-dashboard/1.0" }
  });
  if (!response.ok) throw new Error(`${response.status} ${GLASSNODE_PUBLIC_CHART_URL}`);
  return parseGlassnodeLatestRealizedCapShares(await response.text());
}

function parseGlassnodeLatestRealizedCapShares(html) {
  const dateMatch = html.match(/latestValueCard_multilineDate[^>]*>as of\s*(?:<!-- -->)?([^<]+)/i);
  const date = dateMatch ? new Date(`${dateMatch[1].trim()} UTC`) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const values = {};
  const rowPattern = /latestValueCard_multilineLabel[^>]*>([\s\S]*?)<\/span><span class="latestValueCard_multilineValue[^>]*>([\d.]+)%/gi;
  for (const match of html.matchAll(rowPattern)) {
    const label = match[1].replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim().toLowerCase();
    values[label] = Number(match[2]) / 100;
  }
  const required = ["3m-6m", "6m-12m", "1y-2y", "2y-3y", "3y-5y", "5y-7y", "7y-10y", ">10y"];
  if (!required.every((key) => Number.isFinite(values[key]))) return null;
  return { date: date.toISOString().slice(0, 10), values };
}

function buildGlassnodeFallbackRow(latest, realizedRows) {
  const reference = [...realizedRows].reverse().map(groupBgeometricsBands).find(Boolean);
  const longReference = reference ? reference.threeToFour + reference.fourPlus : 0;
  const threeToFourShare = longReference > 0 ? reference.threeToFour / longReference : 0.4;
  const longTotal = latest.values["3y-5y"] + latest.values["5y-7y"] + latest.values["7y-10y"] + latest.values[">10y"];
  return {
    date: latest.date,
    source: "glassnode-latest",
    grouped: {
      threeToSix: latest.values["3m-6m"],
      sixToTwelve: latest.values["6m-12m"],
      oneToTwo: latest.values["1y-2y"],
      twoToThree: latest.values["2y-3y"],
      threeToFour: longTotal * threeToFourShare,
      fourPlus: longTotal * (1 - threeToFourShare)
    }
  };
}

function normalizeGroupedBands(grouped) {
  if (!BAND_KEYS.every((key) => Number.isFinite(Number(grouped[key])) && Number(grouped[key]) >= 0)) return null;
  const total = BAND_KEYS.reduce((sum, key) => sum + Number(grouped[key]), 0);
  if (total <= 0) return null;
  const scale = total > 2 ? 0.01 : 1;
  const normalized = {};
  BAND_KEYS.forEach((key) => { normalized[key] = Number(grouped[key]) * scale; });
  return normalized;
}

function calculateRealizedCapHodlSnapshot(series, livePrice) {
  const latest = series.at(-1);
  const prior7 = series.at(-8) || series[0];
  const current = latest.overThreeMonths;
  const trend = current > latest.average30 + 0.003 ? "rising" : current < latest.average30 - 0.003 ? "falling" : "flat";
  const allTimePeak = series.reduce((best, row) => row.overThreeMonths > best.overThreeMonths ? row : best, series[0]);
  return {
    current,
    average7: latest.average7,
    average30: latest.average30,
    sevenDayChange: current - prior7.overThreeMonths,
    distanceToDeepLock: current - DEEP_LOCK_THRESHOLD,
    zone: classifyHodlLock(current),
    trend,
    allTimePeak: allTimePeak.overThreeMonths,
    allTimePeakDate: allTimePeak.date,
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    onchainAsOf: latest.date,
    source: latest.source
  };
}

function classifyHodlLock(value) {
  if (value >= DEEP_LOCK_THRESHOLD) return "deep-lock";
  if (value >= ACCUMULATION_THRESHOLD) return "accumulation";
  if (value >= 0.6) return "balanced";
  return "active";
}

function detectCyclePeaks(series) {
  const windows = [
    ["2014-01-01", "2016-12-31"],
    ["2017-01-01", "2020-12-31"],
    ["2021-01-01", "2024-12-31"],
    ["2025-01-01", "9999-12-31"]
  ];
  return windows.map(([start, end]) => series
    .filter((row) => row.date >= start && row.date <= end)
    .reduce((best, row) => !best || row.overThreeMonths > best.overThreeMonths ? row : best, null))
    .filter(Boolean)
    .map((row) => ({ date: row.date, value: row.overThreeMonths, price: row.price }));
}

async function fetchLiveBtcPrice() {
  let lastError;
  for (const url of BINANCE_TICKER_URLS) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(7_000) });
      if (!response.ok) throw new Error(`Binance ticker ${response.status}`);
      const payload = await response.json();
      const value = Number(payload?.price);
      if (Number.isFinite(value) && value > 0) return { value, asOf: new Date().toISOString(), source: "Binance Spot" };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Live BTC price unavailable");
}

export {
  buildRealizedCapHodlWaveSeries,
  buildGlassnodeFallbackRow,
  calculateRealizedCapHodlSnapshot,
  classifyHodlLock,
  detectCyclePeaks,
  fetchLiveBtcPrice,
  parseGlassnodeLatestRealizedCapShares,
  normalizeGroupedBands
};
