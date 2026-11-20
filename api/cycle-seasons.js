import { CYCLE_SEASONS_ARCHIVE } from "../data/bitcoin-cycle-weekly.js";

const DAY_MS = 86_400_000;
const CACHE_TTL_MS = 5 * 60_000;
const HISTORY_TTL_MS = 60 * 60_000;
const MAX_STALE_MS = 7 * DAY_MS;
const FIRST_YEAR = 2014;
const HISTORY_URL = "https://www.cryptodatadownload.com/cdd/Bitstamp_BTCUSD_d.csv";
const QUOTE_URLS = [
  "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT",
  "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT"
];

function validCandle(row) {
  return /^\d{4}-\d{2}-\d{2}$/.test(row?.date || "") && Number.isFinite(Date.parse(row.date))
    && [row.open, row.high, row.low, row.close].every(value => Number.isFinite(value) && value > 0)
    && row.high >= Math.max(row.open, row.close, row.low)
    && row.low <= Math.min(row.open, row.close, row.high);
}

function mergeCandles(...histories) {
  const rows = new Map();
  for (const history of histories) {
    for (const row of history || []) if (validCandle(row)) rows.set(row.date, { ...row });
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function parseDailyOhlcCsv(csv, now = Date.now()) {
  if (typeof csv !== "string" || csv.length > 2_000_000) throw new Error("Invalid public OHLC CSV");
  const lines = csv.trim().split(/\r?\n/);
  const headerIndex = lines.findIndex(line => /^unix,date,symbol,open,high,low,close(?:,|$)/i.test(line));
  if (headerIndex < 0) throw new Error("Public OHLC CSV header is missing");
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const fields = line.split(",");
    let timestamp = Number(fields[0]);
    if (timestamp > 100_000_000_000) timestamp /= 1000;
    const ms = timestamp * 1000;
    if (!Number.isFinite(ms) || ms < Date.UTC(FIRST_YEAR, 0, 1) || ms > now || fields[2] !== "BTC/USD") continue;
    const date = new Date(ms).toISOString().slice(0, 10);
    const row = { date, open: Number(fields[3]), high: Number(fields[4]), low: Number(fields[5]), close: Number(fields[6]) };
    if (validCandle(row)) rows.push(row);
  }
  return mergeCandles(rows);
}

function aggregateWeeklyCandles(dailyRows, now = Date.now()) {
  const weeks = new Map();
  for (const row of mergeCandles(dailyRows)) {
    const timestamp = Date.parse(row.date);
    if (timestamp > now) continue;
    const date = new Date(timestamp);
    const monday = timestamp - ((date.getUTCDay() + 6) % 7) * DAY_MS;
    if (monday < Date.UTC(FIRST_YEAR, 0, 1)) continue;
    const key = new Date(monday).toISOString().slice(0, 10);
    const week = weeks.get(key);
    if (week) {
      week.high = Math.max(week.high, row.high);
      week.low = Math.min(week.low, row.low);
      week.close = row.close;
    } else weeks.set(key, { date: key, open: row.open, high: row.high, low: row.low, close: row.close });
  }
  return [...weeks.values()];
}

async function readHistory(fetchImpl, now) {
  const cached = globalThis.__welinkCycleSeasonsHistoryV1;
  if (cached?.rows?.length && now - cached.savedAt < HISTORY_TTL_MS) return cached;
  try {
    const response = await fetchImpl(HISTORY_URL, {
      headers: { Accept: "text/csv", "User-Agent": "welinkBTC-cycle-dashboard/1.0" },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error(`Public OHLC CSV HTTP ${response.status}`);
    const daily = parseDailyOhlcCsv(await response.text(), now);
    if (daily.length < 365) throw new Error("Public OHLC history is incomplete");
    // The mirror starts on a Friday in 2014. Do not replace a complete archived
    // week with that mirror's opening partial week.
    const weekly = aggregateWeeklyCandles(daily, now).filter(row => row.date >= daily[0].date);
    const history = {
      rows: mergeCandles(CYCLE_SEASONS_ARCHIVE.candles, cached?.rows, weekly),
      asOf: daily.at(-1).date,
      savedAt: now,
      fallback: false
    };
    globalThis.__welinkCycleSeasonsHistoryV1 = history;
    return history;
  } catch {
    return {
      rows: mergeCandles(CYCLE_SEASONS_ARCHIVE.candles, cached?.rows),
      asOf: cached?.asOf || CYCLE_SEASONS_ARCHIVE.asOf,
      savedAt: cached?.savedAt || Date.parse(CYCLE_SEASONS_ARCHIVE.capturedAt),
      fallback: true
    };
  }
}

async function readLiveQuote(fetchImpl, now) {
  for (const url of QUOTE_URLS) {
    try {
      const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4500) });
      if (!response.ok) continue;
      const data = await response.json();
      const price = Number(data.lastPrice);
      const timestamp = Number(data.closeTime);
      if (!(price > 0) || !Number.isFinite(price) || !Number.isFinite(timestamp)
        || timestamp > now + 60_000 || now - timestamp > 15 * 60_000) continue;
      return { price, timestamp: new Date(timestamp).toISOString(), live: true, currency: "USDT", source: "Binance BTC/USDT" };
    } catch { /* A dated USD history close remains available if both public quote hosts fail. */ }
  }
  return null;
}

async function buildCycleSeasonsPayload({ fetchImpl = (...args) => fetch(...args), now = Date.now() } = {}) {
  const [history, liveQuote] = await Promise.all([readHistory(fetchImpl, now), readLiveQuote(fetchImpl, now)]);
  const today = new Date(now).toISOString().slice(0, 10);
  const candles = mergeCandles(history.rows).filter(row => row.date >= `${FIRST_YEAR}-01-01` && row.date <= today);
  if (!candles.length) throw new Error("No valid public BTC weekly OHLC observations");
  const currentYear = new Date(now).getUTCFullYear();
  const lastStartYear = FIRST_YEAR + Math.floor((currentYear - FIRST_YEAR) / 4) * 4;
  const rows = [];
  for (let startYear = FIRST_YEAR; startYear <= lastStartYear; startYear += 4) {
    rows.push({
      startYear,
      endYear: startYear + 3,
      candles: candles.filter(row => row.date >= `${startYear}-01-01` && row.date < `${startYear + 4}-01-01`)
    });
  }
  const last = candles.at(-1);
  const historyAge = now - Date.parse(`${history.asOf}T00:00:00.000Z`);
  return {
    ok: true,
    schema: 1,
    updatedAt: new Date(now).toISOString(),
    stale: historyAge > 3 * DAY_MS || !liveQuote,
    archiveFallback: history.fallback,
    source: "Bitstamp BTC/USD · Public OHLC",
    sourceUrl: "https://www.cryptodatadownload.com/data/bitstamp/",
    cadence: "daily-OHLC + 5-minute-live-quote",
    cacheSeconds: CACHE_TTL_MS / 1000,
    historyAsOf: history.asOf,
    quote: liveQuote || {
      price: last.close,
      timestamp: `${history.asOf}T00:00:00.000Z`,
      live: false,
      currency: "USD",
      source: "Dated Bitstamp daily OHLC close"
    },
    rows,
    coverage: { start: candles[0].date, end: last.date, observations: candles.length },
    sources: CYCLE_SEASONS_ARCHIVE.sources,
    methodology: "Actual BTC/USD daily OHLC aggregated into UTC Monday weeks. Four calendar-year columns repeat from 2014 for historical comparison only; labels do not classify the current market or predict future prices. Each row has its own log-price scale. Live BTC/USDT quote is separate and never modifies USD historical candles. Future calendar slots contain no price observations."
  };
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

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
  const cache = globalThis.__welinkCycleSeasonsV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) return sendPayload(response, cache.payload, "HIT");
  // Coalesce requests on warm instances so a visible widget does not stampede public data feeds.
  const pending = globalThis.__welinkCycleSeasonsPendingV1 || buildCycleSeasonsPayload({ now });
  globalThis.__welinkCycleSeasonsPendingV1 = pending;
  try {
    const payload = await pending;
    globalThis.__welinkCycleSeasonsV1 = { payload, savedAt: now };
    return sendPayload(response, payload, payload.stale ? "STALE" : "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      return sendPayload(response, { ...cache.payload, stale: true, quote: { ...cache.payload.quote, live: false } }, "STALE");
    }
    response.setHeader("Cache-Control", "no-store");
    return response.status(502).json({ ok: false, error: "Public BTC cycle history unavailable" });
  } finally {
    if (globalThis.__welinkCycleSeasonsPendingV1 === pending) delete globalThis.__welinkCycleSeasonsPendingV1;
  }
}

export { CACHE_TTL_MS, HISTORY_TTL_MS, MAX_STALE_MS, parseDailyOhlcCsv, aggregateWeeklyCandles, mergeCandles, buildCycleSeasonsPayload };
