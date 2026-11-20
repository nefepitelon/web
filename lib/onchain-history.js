import { brotliDecompressSync } from "node:zlib";
import { ONCHAIN_HISTORY_ARCHIVE_BR } from "../data/onchain-history-archive.js";

const FILES = {
  tmmp: "true_market_mean.json",
  price: "true_market_mean_btc_price.json",
  sth: "sth_realized_price_alfabitcoin.json",
  lth: "lth_realized_price.json",
  nupl: "lth_nupl.json"
};
const BASES = [
  "https://charts.bgeometrics.com/files/",
  "https://raw.githubusercontent.com/BGeometrics/bgeometrics.github.io/master/files/"
];
let archive;

export function archivedHistory(metric) {
  archive ??= JSON.parse(brotliDecompressSync(Buffer.from(ONCHAIN_HISTORY_ARCHIVE_BR, "base64")).toString("utf8"));
  if (!FILES[metric]) throw new Error("Unknown on-chain history metric");
  return archive[metric].map(([date, value]) => ({ date, value }));
}

export function mergeHistoryRows(...histories) {
  const byDate = new Map();
  for (const rows of histories) {
    for (const row of rows || []) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row?.date) || !Number.isFinite(Date.parse(row.date))
        || typeof row.value !== "number" || !Number.isFinite(row.value)) continue;
      byDate.set(row.date, { date: row.date, value: row.value });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function parseHistoryPairs(payload) {
  if (!Array.isArray(payload)) throw new Error("Invalid public history archive");
  return mergeHistoryRows(payload.flatMap(row => {
    if (!Array.isArray(row) || typeof row[0] !== "number" || !Number.isFinite(row[0])
      || typeof row[1] !== "number" || !Number.isFinite(row[1])) return [];
    const date = new Date(row[0]);
    return Number.isFinite(date.getTime()) ? [{ date: date.toISOString().slice(0, 10), value: row[1] }] : [];
  }));
}

// Public chart archives retain older cycles that the rolling API no longer
// includes. Merge by date rather than replacing the entire last-good history.
export async function fetchCompleteHistory(metric, { fetchImpl = (...args) => fetch(...args), now = Date.now() } = {}) {
  const seed = archivedHistory(metric);
  let rows = seed;
  let refreshed = false;
  for (const base of BASES) {
    try {
      const response = await fetchImpl(base + FILES[metric], {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`Public history HTTP ${response.status}`);
      const live = parseHistoryPairs(await response.json());
      if (live.length < 7) throw new Error("Public history has too few observations");
      rows = mergeHistoryRows(seed, live);
      refreshed = true;
      break;
    } catch { /* The independent mirror or the archived observations remain available. */ }
  }
  return {
    rows,
    fallback: !refreshed,
    stale: now - Date.parse(rows.at(-1).date) > 3 * 86400000,
    source: "BGeometrics public chart archive",
    from: rows[0].date,
    to: rows.at(-1).date
  };
}

export function completeHistoryCoverage(series) {
  return { from: series[0]?.date ?? null, to: series.at(-1)?.date ?? null, observations: series.length };
}
