import { brotliDecompressSync } from "node:zlib";
import { RPLRM_PUBLIC_SEED_BR } from "../data/rplrm-public-seed.js";
import { parseDailyPairs, mergeDailyRows, calculateRplrmSeries, identifyRplrmPhases, projectRplrm, rplrmSnapshot, REFERENCE_SPANS } from "../lib/rplrm-model.js";

const FILES = { ratio: "realized_profit_loss_ratio.json", price: "realized_profit_loss_ratio_btc_price.json" };
const BASES = ["https://charts.bgeometrics.com/files/", "https://raw.githubusercontent.com/BGeometrics/bgeometrics.github.io/master/files/"];
const TTL = 60 * 60 * 1000;
let seed;
function seedRows(key) {
  seed ??= JSON.parse(brotliDecompressSync(Buffer.from(RPLRM_PUBLIC_SEED_BR, "base64")).toString("utf8"));
  return parseDailyPairs(seed[key], { positive: key === "price" });
}
async function readHistory(key, fetchImpl) {
  for (const base of BASES) {
    try {
      const response = await fetchImpl(base + FILES[key], { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Public archive HTTP ${response.status}`);
      const rows = parseDailyPairs(await response.json(), { positive: key === "price" });
      if (rows.length < 7) throw new Error("Empty public history");
      return { rows: mergeDailyRows(seedRows(key), rows), fallback: false, source: base + FILES[key] };
    } catch { /* Independent public mirror, then dated bundled observations. */ }
  }
  return { rows: seedRows(key), fallback: true, source: "bundled-public-archive-2026-11-08" };
}
async function readSpot(fetchImpl) {
  for (const base of ["https://data-api.binance.vision", "https://api.binance.com"]) {
    try {
      const response = await fetchImpl(`${base}/api/v3/ticker/price?symbol=BTCUSDT`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) continue;
      const value = Number((await response.json()).price);
      if (value > 0 && Number.isFinite(value)) return { value, asOf: new Date().toISOString() };
    } catch { /* A live quote is optional; dated daily closes remain visible. */ }
  }
  return null;
}

export async function buildRplrmPayload({ fetchImpl = (...args) => fetch(...args), now = Date.now() } = {}) {
  const [ratio, price, spot] = await Promise.all([readHistory("ratio", fetchImpl), readHistory("price", fetchImpl), readSpot(fetchImpl)]);
  const series = calculateRplrmSeries(ratio.rows, price.rows);
  if (series.length < 365) throw new Error("RPLR-M needs a complete annual baseline and sufficient aligned observations");
  const phases = identifyRplrmPhases(series);
  const last = series.at(-1).date;
  const ageDays = Math.max(0, (now - Date.parse(last)) / 86400000);
  return {
    ok: true, schema: 1, entityAdjusted: false, estimated: false,
    dataMode: "public-utxo-reconstruction", generatedAt: new Date(now).toISOString(),
    stale: ageDays > 3, archiveFallback: ratio.fallback || price.fallback, cacheSeconds: TTL / 1000,
    cadence: "daily-onchain + live-spot", snapshot: { ...rplrmSnapshot(series, phases, spot), liveSpot: Boolean(spot) }, series, phases,
    projection: projectRplrm(series, phases), referenceSpans: REFERENCE_SPANS,
    historyCoverage: { rawFrom: ratio.rows[0].date, from: series[0].date, to: last, observations: series.length,
      warmupDays: 365, annualCoverage: series.at(-1).coverage365, ageDays: Math.floor(ageDays) },
    methodology: {
      ratio: "Public daily realized profit / absolute realized loss (all UTXO ages).",
      momentum: "M = trailing 7-calendar-day mean(RPLR) / trailing 365-calendar-day mean(RPLR). Minimum coverage: 5/7 and 330/365 actual observations, after 365-day warm-up; missing days are not interpolated.",
      curves: "Green = max(M - 1, 0); red = min(1 - 1/M, 0). These are asymmetric transforms of one relative ratio, not separate USD profit and loss amounts. Independent green/red axes.",
      state: "S = (M - 1) / (M + 1), bounded -1 to +1. Above 0 is a repair candidate, not a permanent price bottom.",
      phases: "A/B: negative/positive 90-calendar-day mean(log M), confirmed for 30 observations. Confirmation dates are not backdated. More than 7 missing days interrupts phase tracking.",
      projection: "365-day conditional scenarios blend damped recent log-momentum with past, already-completed same-phase analogues. Shaded bounds are illustrative sensitivity ranges, not confidence intervals. No future BTC price is forecast.",
      references: "14/13/11 months are supplied illustration labels, separate from computed public-data phases and current elapsed time.",
      disclosure: "Public UTXO data do not apply proprietary address clustering. This is an explicit reconstruction, not the original Glassnode entity-adjusted RPLR-M formula."
    },
    sources: { ratio: ratio.source, price: price.source, spot: spot ? "Binance Spot" : "Dated public daily BTC close", archive: "data/rplrm-provenance.json" }
  };
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") { response.setHeader("Allow", "GET, OPTIONS"); return response.status(405).json({ error: "Method not allowed" }); }
  const now = Date.now(), cache = globalThis.__welinkRplrmV1;
  try {
    let payload;
    const cacheHit = cache?.payload && now - cache.savedAt < TTL && request.query?.refresh !== "1";
    if (cacheHit) {
      const spot = await readSpot((...args) => fetch(...args));
      payload = { ...cache.payload, snapshot: { ...cache.payload.snapshot,
        price: spot?.value || cache.payload.snapshot.price,
        priceAsOf: spot?.asOf || cache.payload.snapshot.priceAsOf, liveSpot: Boolean(spot) } };
    } else payload = await buildRplrmPayload({ now });
    globalThis.__welinkRplrmV1 = { savedAt: cacheHit ? cache.savedAt : now, payload };
    const stale = now - Date.parse(payload.snapshot.onchainAsOf) > 3 * 86400000;
    response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    return response.status(200).json({ ...payload, stale });
  } catch (error) {
    response.setHeader("Cache-Control", "no-store");
    return response.status(502).json({ ok: false, error: "RPLRM_UNAVAILABLE", detail: error instanceof Error ? error.message : "Public history unavailable" });
  }
}
