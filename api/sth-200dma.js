import { brotliDecompressSync } from "node:zlib";

import { STH_200DMA_PUBLIC_SEED_BR } from "../data/sth-200dma-public-seed.js";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const DAY_MS = 86_400_000;
const DMA_DAYS = 200;
const MIN_CONFIRMATION_CLOSES = 2;
const PUBLIC_HISTORY_JOIN_DATE = "2016-01-01";

const PUBLIC_SERIES = {
  price: {
    url: "https://bitcoin-data.com/api/v1/btc-price/csv",
    valueKey: "btcPrice"
  },
  sth: {
    url: "https://bitcoin-data.com/api/v1/realized-price-sth/csv",
    valueKey: "realizedPriceSth"
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
  const cache = globalThis.__welinkSth200dmaCache;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    sendPayload(response, cache.payload, "HIT");
    return;
  }

  try {
    const payload = await buildSth200dmaPayload();
    globalThis.__welinkSth200dmaCache = { savedAt: now, payload };
    sendPayload(response, payload, "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      sendPayload(response, {
        ...cache.payload,
        stale: true,
        generatedAt: new Date().toISOString(),
        warning: "STH / 200DMA refresh failed; serving the latest valid public-data payload."
      }, "STALE");
      return;
    }
    try {
      const fallbackPayload = await buildPublicSeedPayload(error);
      globalThis.__welinkSth200dmaCache = { savedAt: now, payload: fallbackPayload };
      sendPayload(response, fallbackPayload, "FALLBACK");
    } catch (fallbackError) {
      response.status(502).json({
        ok: false,
        error: "Unable to load BTC STH realized price / 200DMA model",
        detail: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
    }
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=604800");
  response.setHeader("X-Welink-Cache", cacheState);
  response.status(200).json(payload);
}

async function buildSth200dmaPayload() {
  const [priceRows, sthRows, livePrice] = await Promise.all([
    fetchPublicCsv(PUBLIC_SERIES.price),
    fetchPublicCsv(PUBLIC_SERIES.sth),
    fetchLiveBtcPrice().catch(() => null)
  ]);
  const primarySeries = buildSth200dmaSeries(priceRows, sthRows);
  if (primarySeries.length < 365) throw new Error("Public STH / 200DMA history returned too few aligned observations");
  const primaryCrosses = detectGoldenCrosses(primarySeries);
  const primaryMacroCrosses = detectMacroGoldenCrosses(primarySeries, primaryCrosses);
  const primaryHistoricalCycles = buildHistoricalCycles(primarySeries, primaryMacroCrosses);
  const { series, crosses, macroCrosses, historicalCycles, seededHistory } = mergePrimaryWithPublicSeed({
    series: primarySeries,
    crosses: primaryCrosses,
    macroCrosses: primaryMacroCrosses,
    historicalCycles: primaryHistoricalCycles
  });

  return {
    ok: true,
    stale: false,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    snapshot: calculateSth200dmaSnapshot(series, macroCrosses, historicalCycles, livePrice),
    series,
    crosses,
    macroCrosses,
    historicalCycles,
    sources: {
      price: livePrice?.source || "BGeometrics public BTC price",
      history: seededHistory ? "BGeometrics daily API + Bitbo public long-history seed" : "BGeometrics public daily API",
      btc: PUBLIC_SERIES.price.url,
      sth: PUBLIC_SERIES.sth.url,
      methodology: "STH realized price (<155d) versus a transparent 200-day SMA of daily BTC price"
    }
  };
}

function mergePrimaryWithPublicSeed(primary) {
  const seed = decodePublicSeed();
  const prefixSeries = seed.series.filter((row) => row.date < PUBLIC_HISTORY_JOIN_DATE);
  const primarySeries = primary.series.filter((row) => row.date >= PUBLIC_HISTORY_JOIN_DATE);
  const prefixCrosses = seed.crosses.filter((cross) => cross.date < PUBLIC_HISTORY_JOIN_DATE);
  const primaryCrosses = primary.crosses.filter((cross) => cross.date >= PUBLIC_HISTORY_JOIN_DATE);
  const prefixMacroCrosses = seed.macroCrosses.filter((cross) => cross.date < PUBLIC_HISTORY_JOIN_DATE);
  const primaryMacroCrosses = primary.macroCrosses.filter((cross) => cross.date >= PUBLIC_HISTORY_JOIN_DATE);
  const prefixCycles = seed.historicalCycles.filter((cycle) => cycle.crossDate < PUBLIC_HISTORY_JOIN_DATE);
  const primaryCycles = primary.historicalCycles.filter((cycle) => cycle.crossDate >= PUBLIC_HISTORY_JOIN_DATE);
  return {
    series: [...prefixSeries, ...primarySeries],
    crosses: [...prefixCrosses, ...primaryCrosses],
    macroCrosses: [...prefixMacroCrosses, ...primaryMacroCrosses],
    historicalCycles: [...prefixCycles, ...primaryCycles],
    seededHistory: prefixSeries.length > 0
  };
}

let decodedPublicSeed;

function decodePublicSeed() {
  if (decodedPublicSeed) return decodedPublicSeed;
  const packed = JSON.parse(brotliDecompressSync(Buffer.from(STH_200DMA_PUBLIC_SEED_BR, "base64")).toString("utf8"));
  const expandSeriesRow = ([date, price, sth, dma200]) => ({
    date,
    price,
    sth,
    dma200,
    spread: sth - dma200,
    spreadPercent: (sth / dma200 - 1) * 100
  });
  const expandCross = ([date, price, sth, dma200, confirmedCloses, confirmed]) => ({
    date,
    price,
    sth,
    dma200,
    confirmedCloses,
    confirmed: Boolean(confirmed)
  });
  decodedPublicSeed = {
    asOf: packed.a,
    series: packed.s.map(expandSeriesRow),
    crosses: packed.c.map(expandCross),
    macroCrosses: packed.m.map(expandCross),
    historicalCycles: packed.h.map(([crossDate, peakDate, peakPrice, daysToPeak, monthsToPeak]) => ({
      crossDate,
      peakDate,
      peakPrice,
      daysToPeak,
      monthsToPeak
    }))
  };
  return decodedPublicSeed;
}

async function buildPublicSeedPayload(primaryError) {
  const seed = decodePublicSeed();
  if (!seed.series.length) throw new Error("Bundled public STH / 200DMA seed is empty");
  const livePrice = await fetchLiveBtcPrice().catch(() => null);
  const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(`${seed.asOf}T00:00:00Z`)) / DAY_MS));
  return {
    ok: true,
    stale: ageDays > 3,
    fallback: true,
    generatedAt: new Date().toISOString(),
    cacheSeconds: CACHE_TTL_MS / 1000,
    cadence: "daily",
    snapshot: calculateSth200dmaSnapshot(seed.series, seed.macroCrosses, seed.historicalCycles, livePrice),
    series: seed.series,
    crosses: seed.crosses,
    macroCrosses: seed.macroCrosses,
    historicalCycles: seed.historicalCycles,
    warning: `Primary free API unavailable (${primaryError instanceof Error ? primaryError.message : String(primaryError)}); serving the latest public Bitbo daily snapshot with Binance spot price.`,
    sources: {
      price: livePrice?.source || "Bitbo public BTC daily chart",
      history: "Bitbo public STH chart snapshot",
      btc: "https://charts.bitbo.io/sth-realized-price/",
      sth: "https://charts.bitbo.io/sth-realized-price/",
      methodology: "STH realized price (<155d) versus a transparent 200-day SMA of daily BTC price"
    }
  };
}

async function fetchPublicCsv(source) {
  const response = await fetchWithTimeout(source.url, {
    headers: { Accept: "text/csv", "User-Agent": "welinkBTC-onchain-dashboard/1.0" }
  });
  if (!response.ok) throw new Error(`${response.status} ${source.url}`);
  return parsePublicCsv(await response.text(), source.valueKey);
}

function parsePublicCsv(csv, valueKey) {
  const lines = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((value) => value.trim());
  const dateIndex = headers.indexOf("d");
  const timestampIndex = headers.indexOf("unixTs");
  const valueIndex = headers.indexOf(valueKey);
  if (valueIndex < 0 || (dateIndex < 0 && timestampIndex < 0)) return [];

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const rawDate = dateIndex >= 0 ? values[dateIndex] : "";
    const rawTimestamp = timestampIndex >= 0 ? Number(values[timestampIndex]) : NaN;
    const timestamp = rawDate
      ? Date.parse(`${rawDate}T00:00:00Z`)
      : rawTimestamp < 10_000_000_000 ? rawTimestamp * 1000 : rawTimestamp;
    const value = Number(values[valueIndex]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(value) || value <= 0) return null;
    return { date: new Date(timestamp).toISOString().slice(0, 10), value };
  }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function buildSth200dmaSeries(priceRows, sthRows) {
  const sthByDate = new Map(sthRows.map((row) => [row.date, row.value]));
  const window = [];
  let rollingSum = 0;
  const rows = [];

  priceRows.forEach((priceRow) => {
    if (!Number.isFinite(priceRow.value) || priceRow.value <= 0) return;
    window.push(priceRow.value);
    rollingSum += priceRow.value;
    if (window.length > DMA_DAYS) rollingSum -= window.shift();
    if (window.length !== DMA_DAYS) return;
    const sth = sthByDate.get(priceRow.date);
    if (!Number.isFinite(sth) || sth <= 0) return;
    const dma200 = rollingSum / DMA_DAYS;
    rows.push({
      date: priceRow.date,
      price: priceRow.value,
      sth,
      dma200,
      spread: sth - dma200,
      spreadPercent: (sth / dma200 - 1) * 100
    });
  });
  return rows;
}

function consecutiveAbove(series, startIndex) {
  let closes = 0;
  for (let index = startIndex; index < series.length; index += 1) {
    if (series[index].sth <= series[index].dma200) break;
    closes += 1;
  }
  return closes;
}

function detectGoldenCrosses(series) {
  const crosses = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    if (previous.sth <= previous.dma200 && current.sth > current.dma200) {
      const confirmedCloses = consecutiveAbove(series, index);
      crosses.push({
        date: current.date,
        price: current.price,
        sth: current.sth,
        dma200: current.dma200,
        confirmedCloses,
        confirmed: confirmedCloses >= MIN_CONFIRMATION_CLOSES
      });
    }
  }
  return crosses;
}

function longestBelowRun(rows) {
  let longest = 0;
  let current = 0;
  rows.forEach((row) => {
    current = row.sth <= row.dma200 ? current + 1 : 0;
    longest = Math.max(longest, current);
  });
  return longest;
}

function detectMacroGoldenCrosses(series, crosses = detectGoldenCrosses(series)) {
  const indexByDate = new Map(series.map((row, index) => [row.date, index]));
  return crosses.filter((cross) => {
    if (!cross.confirmed) return false;
    const index = indexByDate.get(cross.date);
    if (!Number.isInteger(index) || index < 90) return false;
    const prior = series.slice(Math.max(0, index - 180), index);
    const belowCount = prior.filter((row) => row.sth <= row.dma200).length;
    return belowCount / prior.length >= 0.78 && longestBelowRun(prior) >= 90;
  });
}

function buildHistoricalCycles(series, macroCrosses) {
  return macroCrosses.slice(0, -1).map((cross, index) => {
    const nextCross = macroCrosses[index + 1];
    const rows = series.filter((row) => row.date >= cross.date && row.date < nextCross.date);
    const peak = rows.reduce((highest, row) => row.price > highest.price ? row : highest, rows[0]);
    const daysToPeak = Math.round((Date.parse(`${peak.date}T00:00:00Z`) - Date.parse(`${cross.date}T00:00:00Z`)) / DAY_MS);
    return {
      crossDate: cross.date,
      peakDate: peak.date,
      peakPrice: peak.price,
      daysToPeak,
      monthsToPeak: daysToPeak / 30.4375
    };
  });
}

function calculateSth200dmaSnapshot(series, macroCrosses, historicalCycles, livePrice = null) {
  const latest = series.at(-1);
  if (!latest) return null;
  const latestCross = macroCrosses.at(-1) || null;
  const averageDaysToPeak = historicalCycles.length
    ? historicalCycles.reduce((sum, cycle) => sum + cycle.daysToPeak, 0) / historicalCycles.length
    : 913;
  const crossTimestamp = latestCross ? Date.parse(`${latestCross.date}T00:00:00Z`) : NaN;
  const projectedPeakTimestamp = Number.isFinite(crossTimestamp) ? crossTimestamp + averageDaysToPeak * DAY_MS : NaN;
  const recent = series.slice(-7);
  const aboveCloses = latestCross?.confirmedCloses || 0;

  return {
    price: livePrice?.value || latest.price,
    priceAsOf: livePrice?.asOf || `${latest.date}T00:00:00.000Z`,
    asOf: latest.date,
    sth: latest.sth,
    dma200: latest.dma200,
    spread: latest.spread,
    spreadPercent: latest.spreadPercent,
    sevenDaySpreadChange: latest.spreadPercent - (recent[0]?.spreadPercent || latest.spreadPercent),
    goldenCrossActive: latest.sth > latest.dma200,
    latestCrossDate: latestCross?.date || null,
    confirmed: Boolean(latestCross?.confirmed && latest.sth > latest.dma200),
    confirmedCloses: aboveCloses,
    elapsedHours: Number.isFinite(crossTimestamp) ? Math.max(0, (Date.now() - crossTimestamp) / 3_600_000) : null,
    dataDaysSinceCross: Number.isFinite(crossTimestamp)
      ? Math.max(0, Math.round((Date.parse(`${latest.date}T00:00:00Z`) - crossTimestamp) / DAY_MS))
      : null,
    averageDaysToPeak,
    averageMonthsToPeak: averageDaysToPeak / 30.4375,
    projectedPeakDate: Number.isFinite(projectedPeakTimestamp)
      ? new Date(projectedPeakTimestamp).toISOString().slice(0, 10)
      : null,
    completedCycleCount: historicalCycles.length
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
  buildHistoricalCycles,
  buildPublicSeedPayload,
  buildSth200dmaPayload,
  buildSth200dmaSeries,
  calculateSth200dmaSnapshot,
  decodePublicSeed,
  detectGoldenCrosses,
  detectMacroGoldenCrosses,
  mergePrimaryWithPublicSeed,
  parsePublicCsv
};
