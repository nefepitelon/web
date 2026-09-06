const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;
const DAY_MS = 86_400_000;

const COIN_METRICS_URL = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const BGEOMETRICS_PRICE_URL = "https://bitcoin-data.com/api/v1/btc-price/csv";
const MEMPOOL_TIP_HEIGHT_URL = "https://mempool.space/api/blocks/tip/height";
const BINANCE_TICKER_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
];

const CYCLE_DEFINITIONS = {
  "halving-top": {
    titleEn: "BTC: Halving to Bull Top Cycle",
    titleZh: "BTC：从减半到牛市顶峰周期",
    shortEn: "Halving → Top",
    shortZh: "减半 → 牛顶",
    startLabelEn: "Halving",
    startLabelZh: "减半",
    endLabelEn: "Bull Top",
    endLabelZh: "牛市顶部",
    projectionDays: 534,
    projectionStart: "2024-04-19",
    cycles: [
      { label: "2016–2017", start: "2016-07-09", end: "2017-12-17", days: 525 },
      { label: "2020–2021", start: "2020-05-11", end: "2021-11-10", days: 546 }
    ]
  },
  "bottom-top": {
    titleEn: "BTC: Bear Bottom to Bull Top Cycle",
    titleZh: "BTC：熊市底部到牛市顶部周期",
    shortEn: "Bottom → Top",
    shortZh: "熊底 → 牛顶",
    startLabelEn: "Bear Bottom",
    startLabelZh: "熊市底部",
    endLabelEn: "Bull Top",
    endLabelZh: "牛市顶部",
    projectionDays: 1050,
    projectionStart: "2022-11-21",
    cycles: [
      { label: "2015–2017", start: "2015-01-14", end: "2017-12-17", days: 1067 },
      { label: "2018–2021", start: "2018-12-15", end: "2021-11-10", days: 1059 }
    ]
  },
  "halving-bottom": {
    titleEn: "BTC: Halving to Next Bear Bottom Cycle",
    titleZh: "BTC：减半到下一次熊市底部周期",
    shortEn: "Halving → Bottom",
    shortZh: "减半 → 熊底",
    startLabelEn: "Halving",
    startLabelZh: "减半",
    endLabelEn: "Next Bear Bottom",
    endLabelZh: "下一次熊市底部",
    projectionDays: 863,
    projectionStart: "2024-04-20",
    cycles: [
      { label: "2012–2015", start: "2012-11-28", end: "2015-01-14", days: 777 },
      { label: "2016–2018", start: "2016-07-09", end: "2018-12-15", days: 889 },
      { label: "2020–2022", start: "2020-05-11", end: "2022-11-21", days: 924 }
    ]
  },
  "top-top": {
    titleEn: "BTC: Bull Top to Bull Top Cycle",
    titleZh: "BTC：牛市顶部到牛市顶部周期",
    shortEn: "Top → Top",
    shortZh: "牛顶 → 牛顶",
    startLabelEn: "Bull Top",
    startLabelZh: "牛市顶部",
    endLabelEn: "Next Bull Top",
    endLabelZh: "下一次牛市顶部",
    projectionDays: 1451,
    projectionStart: "2021-11-10",
    cycles: [
      { label: "2013–2017", start: "2013-11-30", end: "2017-12-17", days: 1478 },
      { label: "2017–2021", start: "2017-12-17", end: "2021-11-10", days: 1424 }
    ]
  },
  "bottom-bottom": {
    titleEn: "BTC: Bear Bottom to Bear Bottom Cycle",
    titleZh: "BTC：熊市底部到熊市底部周期",
    shortEn: "Bottom → Bottom",
    shortZh: "熊底 → 熊底",
    startLabelEn: "Bear Bottom",
    startLabelZh: "熊市底部",
    endLabelEn: "Next Bear Bottom",
    endLabelZh: "下一熊市底部",
    projectionDays: 1434,
    projectionStart: "2022-11-21",
    cycles: [
      { label: "2015–2018", start: "2015-01-14", end: "2018-12-15", days: 1431 },
      { label: "2018–2022", start: "2018-12-15", end: "2022-11-21", days: 1437 }
    ]
  }
};

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
  const cache = globalThis.__welinkCycleTimingCacheV2;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");

  try {
    const payload = await buildCycleTimingPayload();
    globalThis.__welinkCycleTimingCacheV2 = { savedAt: now, payload };
    return sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "Cycle timing refresh failed; serving the latest valid payload."
      }, "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load Bitcoin cycle timing data",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

async function buildCycleTimingPayload(now = new Date()) {
  let series;
  let historySource;
  try {
    series = await fetchCoinMetricsHistory(now);
    historySource = "Coin Metrics Community API";
  } catch (primaryError) {
    series = await fetchBGeometricsHistory();
    historySource = "BGeometrics public BTC price CSV";
    if (!series.length) throw primaryError;
  }
  if (series.length < 1000) throw new Error("Public BTC history returned too few observations");

  const live = await fetchLiveBtcPrice().catch(() => null);
  const halvingEstimate = await fetchNextHalvingEstimate(now).catch(() => buildNextHalvingEstimate(now));
  const modes = Object.fromEntries(Object.entries(CYCLE_DEFINITIONS).map(([id, definition]) => [
    id,
    buildCycleMode(id, definition, series, now)
  ]));

  return {
    ok: true,
    stale: false,
    generatedAt: now.toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily-history + live-spot",
    snapshot: {
      price: live?.value || series.at(-1)?.price || null,
      priceAsOf: live?.asOf || `${series.at(-1)?.date}T00:00:00.000Z`,
      defaultMode: "halving-top"
    },
    modes,
    futureCycle: buildFutureCycleForecast(halvingEstimate),
    series,
    sources: {
      price: live?.source || historySource,
      history: historySource,
      primary: COIN_METRICS_URL,
      fallback: BGEOMETRICS_PRICE_URL,
      blockHeight: halvingEstimate.source,
      protocol: "Bitcoin subsidy halves every 210,000 blocks",
      methodology: "Historical top/bottom dates are fixed research anchors. The next halving uses current block height and a 10-minute block interval; future bull-top and bear-bottom dates combine halving-based primary projections with top-to-top and bottom-to-bottom cross-check windows. They are scenarios, not confirmed market turning points."
    }
  };
}

function buildFutureCycleForecast(halvingEstimate) {
  const nextHalvingDate = halvingEstimate.projectedDate;
  const currentTopCrossCheck = addDays(
    CYCLE_DEFINITIONS["top-top"].projectionStart,
    CYCLE_DEFINITIONS["top-top"].projectionDays
  );
  const currentBottomCrossCheck = addDays(
    CYCLE_DEFINITIONS["bottom-bottom"].projectionStart,
    CYCLE_DEFINITIONS["bottom-bottom"].projectionDays
  );
  const bullTopPrimary = addDays(nextHalvingDate, CYCLE_DEFINITIONS["halving-top"].projectionDays);
  const bullTopCrossCheck = addDays(currentTopCrossCheck, CYCLE_DEFINITIONS["top-top"].projectionDays);
  const bearBottomPrimary = addDays(nextHalvingDate, CYCLE_DEFINITIONS["halving-bottom"].projectionDays);
  const bearBottomCrossCheck = addDays(currentBottomCrossCheck, CYCLE_DEFINITIONS["bottom-bottom"].projectionDays);

  return {
    generatedFromHeight: halvingEstimate.currentHeight,
    nextHalvingHeight: halvingEstimate.nextHalvingHeight,
    blocksRemaining: halvingEstimate.blocksRemaining,
    assumedBlockSeconds: 600,
    nodes: [
      {
        id: "next-halving",
        kind: "halving",
        labelEn: "Next Halving",
        labelZh: "下一次减半",
        date: nextHalvingDate,
        windowStart: nextHalvingDate,
        windowEnd: nextHalvingDate,
        basisEn: `${halvingEstimate.blocksRemaining.toLocaleString("en-US")} blocks to height ${halvingEstimate.nextHalvingHeight.toLocaleString("en-US")}`,
        basisZh: `距区块高度 ${halvingEstimate.nextHalvingHeight.toLocaleString("en-US")} 还有 ${halvingEstimate.blocksRemaining.toLocaleString("en-US")} 个区块`
      },
      {
        id: "next-bull-top",
        kind: "top",
        labelEn: "Next-Cycle Bull Top",
        labelZh: "下一轮牛市顶部",
        date: bullTopPrimary,
        alternateDate: bullTopCrossCheck,
        windowStart: [bullTopPrimary, bullTopCrossCheck].sort()[0],
        windowEnd: [bullTopPrimary, bullTopCrossCheck].sort()[1],
        basisEn: `Halving + ${CYCLE_DEFINITIONS["halving-top"].projectionDays}D; cross-check: top + ${CYCLE_DEFINITIONS["top-top"].projectionDays}D`,
        basisZh: `减半 + ${CYCLE_DEFINITIONS["halving-top"].projectionDays} 天；交叉验证：牛顶 + ${CYCLE_DEFINITIONS["top-top"].projectionDays} 天`
      },
      {
        id: "next-bear-bottom",
        kind: "bottom",
        labelEn: "Next-Cycle Bear Bottom",
        labelZh: "下一轮熊市底部",
        date: bearBottomPrimary,
        alternateDate: bearBottomCrossCheck,
        windowStart: [bearBottomPrimary, bearBottomCrossCheck].sort()[0],
        windowEnd: [bearBottomPrimary, bearBottomCrossCheck].sort()[1],
        basisEn: `Halving + ${CYCLE_DEFINITIONS["halving-bottom"].projectionDays}D; cross-check: bottom + ${CYCLE_DEFINITIONS["bottom-bottom"].projectionDays}D`,
        basisZh: `减半 + ${CYCLE_DEFINITIONS["halving-bottom"].projectionDays} 天；交叉验证：熊底 + ${CYCLE_DEFINITIONS["bottom-bottom"].projectionDays} 天`
      }
    ]
  };
}

async function fetchNextHalvingEstimate(now = new Date()) {
  const response = await fetchWithTimeout(MEMPOOL_TIP_HEIGHT_URL, {
    headers: { Accept: "text/plain", "User-Agent": "welinkBTC-onchain-dashboard/2.0" },
    timeoutMs: 7_000
  });
  if (!response.ok) throw new Error(`mempool.space ${response.status}`);
  const height = Number.parseInt((await response.text()).trim(), 10);
  if (!Number.isInteger(height) || height < 840_000) throw new Error("Invalid Bitcoin tip height");
  return buildNextHalvingEstimate(now, height, "mempool.space tip height");
}

function buildNextHalvingEstimate(now = new Date(), currentHeight, source = "Protocol schedule estimate") {
  const asOf = now.toISOString().slice(0, 10);
  const daysSinceFourthHalving = Math.max(0, dayDifference("2024-04-20", asOf));
  const estimatedHeight = 840_000 + Math.floor(daysSinceFourthHalving * 144);
  const normalizedHeight = Number.isInteger(currentHeight) && currentHeight >= 840_000 ? currentHeight : estimatedHeight;
  const nextHalvingHeight = Math.ceil((normalizedHeight + 1) / 210_000) * 210_000;
  const blocksRemaining = Math.max(0, nextHalvingHeight - normalizedHeight);
  const projectedAt = new Date(now.getTime() + blocksRemaining * 600_000);
  return {
    currentHeight: normalizedHeight,
    nextHalvingHeight,
    blocksRemaining,
    projectedDate: projectedAt.toISOString().slice(0, 10),
    source
  };
}

function buildCycleMode(id, definition, series, now = new Date()) {
  const cycles = definition.cycles.map((cycle) => ({
    ...cycle,
    startPrice: nearestPrice(series, cycle.start),
    endPrice: nearestPrice(series, cycle.end)
  }));
  const projectedDate = addDays(definition.projectionStart, definition.projectionDays);
  const elapsedDays = Math.max(0, dayDifference(definition.projectionStart, now.toISOString().slice(0, 10)));
  const signedRemainingDays = dayDifference(now.toISOString().slice(0, 10), projectedDate);
  return {
    id,
    titleEn: definition.titleEn,
    titleZh: definition.titleZh,
    shortEn: definition.shortEn,
    shortZh: definition.shortZh,
    startLabelEn: definition.startLabelEn,
    startLabelZh: definition.startLabelZh,
    endLabelEn: definition.endLabelEn,
    endLabelZh: definition.endLabelZh,
    cycles,
    projection: {
      start: definition.projectionStart,
      projectedDate,
      days: definition.projectionDays,
      elapsedDays,
      remainingDays: Math.max(0, signedRemainingDays),
      overdueDays: Math.max(0, -signedRemainingDays),
      progressPct: Math.min(100, Math.max(0, elapsedDays / definition.projectionDays * 100)),
      status: signedRemainingDays < 0 ? "passed" : signedRemainingDays <= 90 ? "approaching" : "tracking",
      startPrice: nearestPrice(series, definition.projectionStart),
      projectedPrice: nearestPrice(series, projectedDate)
    }
  };
}

async function fetchCoinMetricsHistory(now = new Date()) {
  const url = new URL(COIN_METRICS_URL);
  url.searchParams.set("assets", "btc");
  url.searchParams.set("metrics", "PriceUSD");
  url.searchParams.set("frequency", "1d");
  url.searchParams.set("start_time", "2012-11-28");
  url.searchParams.set("end_time", now.toISOString().slice(0, 10));
  url.searchParams.set("page_size", "10000");
  const result = await fetchWithTimeout(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!result.ok) throw new Error(`Coin Metrics ${result.status}`);
  const payload = await result.json();
  return dedupeSeries((payload?.data || []).map((row) => {
    const date = String(row?.time || "").slice(0, 10);
    const price = Number(row?.PriceUSD);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(price) && price > 0 ? { date, price } : null;
  }).filter(Boolean));
}

async function fetchBGeometricsHistory() {
  const response = await fetchWithTimeout(BGEOMETRICS_PRICE_URL, {
    headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/2.0" }
  });
  if (!response.ok) throw new Error(`BGeometrics ${response.status}`);
  return parsePriceCsv(await response.text());
}

function parsePriceCsv(csv) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const valueIndex = ["btcPrice", "price", "value"].map((key) => headers.indexOf(key)).find((index) => index >= 0);
  if (valueIndex == null || valueIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];
  return dedupeSeries(lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const rawDate = dateIndex >= 0 ? values[dateIndex] : "";
    const rawTimestamp = Number(timestampIndex >= 0 ? values[timestampIndex] : NaN);
    const milliseconds = rawDate ? Date.parse(`${rawDate}T00:00:00Z`) : rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
    const price = Number(values[valueIndex]);
    return Number.isFinite(milliseconds) && Number.isFinite(price) && price > 0
      ? { date: new Date(milliseconds).toISOString().slice(0, 10), price }
      : null;
  }).filter((row) => row && row.date >= "2012-11-28"));
}

function dedupeSeries(rows) {
  return [...new Map(rows.map((row) => [row.date, row])).values()].sort((left, right) => left.date.localeCompare(right.date));
}

function nearestPrice(series, date) {
  const target = Date.parse(`${date}T00:00:00Z`);
  return series.reduce((best, row) => {
    const distance = Math.abs(Date.parse(`${row.date}T00:00:00Z`) - target);
    return !best || distance < best.distance ? { price: row.price, date: row.date, distance } : best;
  }, null);
}

function dayDifference(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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
  CYCLE_DEFINITIONS,
  addDays,
  buildCycleMode,
  buildFutureCycleForecast,
  buildNextHalvingEstimate,
  buildCycleTimingPayload,
  dayDifference,
  parsePriceCsv
};
