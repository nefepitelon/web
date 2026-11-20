import archive from "../data/bitcoin-address-balance-history.js";

const DAY = 86_400_000;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const BITVIEW_BULK_URL = "https://bitview.space/api/series/bulk";
const INPUT_SERIES = [
  ["under_1", "balance_100k_to_1m_sats_address_count"],
  ["under_1", "balance_1m_to_10m_sats_address_count"],
  ["under_1", "balance_10m_to_100m_sats_address_count"],
  ["one_to_10", "balance_1_to_10_btc_address_count"],
  ["ten_to_100", "balance_10_to_100_btc_address_count"],
  ["over_100", "balance_100_to_1k_btc_address_count"],
  ["over_100", "balance_1k_to_10k_btc_address_count"],
  ["over_100", "balance_10k_to_100k_btc_address_count"],
  ["over_100", "balance_over_100k_btc_address_count"]
];
const BUCKETS = [
  { id: "under_1", label: "0.001–1 BTC" },
  { id: "one_to_10", label: "1–10 BTC" },
  { id: "ten_to_100", label: "10–100 BTC" },
  { id: "over_100", label: "100+ BTC" }
];
const NAMES = ["date", ...INPUT_SERIES.map(([, name]) => name), "price_close"];
const validDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const count = (value) => Number.isSafeInteger(value) && value >= 0 && value < 1_000_000_000;

// The date series and global day indexes are aligned explicitly. Never infer a
// date from an array's position or accumulate deltas into invented counts.
function normalizeBulk(payload, { now = Date.now() } = {}) {
  if (!Array.isArray(payload) || payload.length !== NAMES.length) throw new Error("Incomplete Bitview address history");
  const dateSeries = payload[0];
  if (!Array.isArray(dateSeries?.data) || dateSeries.type !== "Date" || dateSeries.index !== "day1" || !Number.isInteger(dateSeries.start)) throw new Error("Missing Bitview date index");
  const today = new Date(now).toISOString().slice(0, 10);
  const rows = [];
  dateSeries.data.forEach((date, offset) => {
    if (!validDate(date) || date > today) return;
    const index = dateSeries.start + offset;
    const values = payload.slice(1).map((series, position) => {
      if (series.index !== "day1" || !Number.isInteger(series.start) || !Array.isArray(series.data)) return null;
      if (position < INPUT_SERIES.length && series.type !== "Count") return null;
      if (position === INPUT_SERIES.length && series.type !== "Dollars") return null;
      return series.data[index - series.start] ?? null;
    });
    if (!values.slice(0, INPUT_SERIES.length).every(count)) return;
    const counts = BUCKETS.map((bucket) => INPUT_SERIES.reduce((sum, [id], i) => sum + (id === bucket.id ? values[i] : 0), 0));
    const price = values.at(-1);
    rows.push([date, ...counts, Number.isFinite(price) && price > 0 ? price : null]);
  });
  if (rows.length < 2) throw new Error("Bitview returned too few aligned absolute observations");
  return rows;
}

function assemblePayload({ rows, now = Date.now(), upstreamFailed = false, archiveAsOf = archive.asOf }) {
  const today = new Date(now).toISOString().slice(0, 10);
  const clean = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 6 || !validDate(row[0]) || row[0] > today || !row.slice(1, 5).every(count)) continue;
    clean.set(row[0], [...row.slice(0, 5), Number.isFinite(row[5]) && row[5] > 0 ? row[5] : null]);
  }
  const observations = [...clean.values()].sort((a, b) => a[0].localeCompare(b[0]));
  if (observations.length < 2) throw new Error("No valid address history is available");
  const asOf = observations.at(-1)[0];
  const lagMs = now - Date.parse(`${asOf}T00:00:00Z`);
  const stale = upstreamFailed || lagMs > 3 * DAY;
  return {
    ok: true, schema: 1, generatedAt: new Date(now).toISOString(), asOf,
    stale, archiveFallback: upstreamFailed, provisional: asOf === today,
    cadence: "daily", cacheSeconds: CACHE_TTL_MS / 1000,
    dates: observations.map(([date]) => date),
    buckets: BUCKETS.map((bucket, i) => ({ ...bucket, series: observations.map((row) => ({ date: row[0], count: row[i + 1] })) })),
    prices: observations.filter((row) => row[5] !== null).map((row) => ({ date: row[0], price: row[5] })),
    coverage: { start: observations[0][0], end: asOf, observations: observations.length, archiveAsOf },
    sources: {
      primary: "Bitview · Bitcoin Research Kit", url: "https://bitview.space/api/",
      price: "Bitview · BTC/USD daily close", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      methodology: "Actual daily balance-cohort address counts, aggregated from nine disjoint public series. Historical observations are archived with their UTC dates; recent observations replace overlapping archive dates. BTC/USD daily closes use a separate USD axis. Counts are addresses, not entities or net capital flow."
    }
  };
}

async function buildAddressHistoryPayload({ fetchImpl = globalThis.fetch, now = Date.now(), archiveData = archive } = {}) {
  const archiveRows = Array.isArray(archiveData?.rows) ? archiveData.rows : [];
  // Fetch the full gap if an older build remains deployed beyond 45 days.
  const lastArchive = archiveRows.at(-1)?.[0];
  const lookback = new Date(now - 45 * DAY).toISOString().slice(0, 10);
  const start = validDate(lastArchive) && lastArchive < lookback ? lastArchive : lookback;
  const query = new URLSearchParams({ series: NAMES.join(","), index: "day1", start, end: new Date(now + DAY).toISOString().slice(0, 10) });
  try {
    const response = await fetchImpl(`${BITVIEW_BULK_URL}?${query}`, {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000)
    });
    if (!response?.ok) throw new Error(`Bitview history HTTP ${response?.status || "unavailable"}`);
    const recent = normalizeBulk(await response.json(), { now });
    return assemblePayload({ rows: [...archiveRows, ...recent], now, archiveAsOf: archiveData.asOf });
  } catch (error) {
    if (archiveRows.length < 2) throw error;
    return assemblePayload({ rows: archiveRows, now, upstreamFailed: true, archiveAsOf: archiveData.asOf });
  }
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") { response.setHeader("Allow", "GET, OPTIONS"); return response.status(405).json({ ok: false, error: "Method not allowed" }); }
  const slot = globalThis.__welinkAddressBalanceHistoryV1 ||= {};
  const now = Date.now();
  try {
    const maxAge = slot.payload?.stale ? 5 * 60 * 1000 : CACHE_TTL_MS;
    if (!slot.payload || now - slot.savedAt >= maxAge) {
      if (!slot.pending) slot.pending = buildAddressHistoryPayload({ now }).then((payload) => {
        // An unavailable upstream must not replace newer valid observations
        // already held by this warm function with an older bundled archive.
        if (payload.archiveFallback && slot.payload?.asOf > payload.asOf) {
          payload = { ...slot.payload, stale: true, archiveFallback: true, generatedAt: new Date(now).toISOString() };
        }
        slot.payload = payload; slot.savedAt = Date.now(); return payload;
      }).finally(() => { slot.pending = null; });
      await slot.pending;
    }
    const payload = slot.payload;
    response.setHeader("Cache-Control", payload.stale ? "public, s-maxage=300, stale-while-revalidate=3600" : "public, s-maxage=14400, stale-while-revalidate=3600");
    return response.status(200).json(payload);
  } catch {
    return response.status(502).json({ ok: false, error: "Public Bitcoin address history is temporarily unavailable" });
  }
}

export { BITVIEW_BULK_URL, CACHE_TTL_MS, INPUT_SERIES, BUCKETS, NAMES, normalizeBulk, assemblePayload, buildAddressHistoryPayload };
