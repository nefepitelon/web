const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 25_000;

const FILES_BASE_URL = "https://charts.bgeometrics.com/files";
const FILES_MIRROR_BASE_URL = "https://raw.githubusercontent.com/BGeometrics/bgeometrics.github.io/master/files";
const EXACT_REALIZED_CAP_URL = "https://bitcoin-data.com/v1/realized-cap-hodl-waves";

const AGE_BANDS = [
  { key: "age_0d_1d", file: "hw_age_supply_0d_1d_10.json", minDays: 0, maxDays: 1 },
  { key: "age_1d_1w", file: "hw_age_supply_1d_1w_10.json", minDays: 1, maxDays: 7 },
  { key: "age_1w_1m", file: "hw_age_supply_1w_1m_10.json", minDays: 7, maxDays: 30 },
  { key: "age_1m_3m", file: "hw_age_supply_1m_3m_10.json", minDays: 30, maxDays: 90 },
  { key: "age_3m_6m", file: "hw_age_supply_3m_6m_10.json", minDays: 90, maxDays: 180 },
  { key: "age_6m_1y", file: "hw_age_supply_6m_1y_10.json", minDays: 180, maxDays: 365 },
  { key: "age_1y_2y", file: "hw_age_supply_1y_2y_10.json", minDays: 365, maxDays: 730 },
  { key: "age_2y_3y", file: "hw_age_supply_2y_3y_10.json", minDays: 730, maxDays: 1095 },
  { key: "age_3y_4y", file: "hw_age_supply_3y_4y_10.json", minDays: 1095, maxDays: 1460 },
  { key: "age_4y_5y", file: "hw_age_supply_4y_5y_10.json", minDays: 1460, maxDays: 1825 },
  { key: "age_5y_7y", file: "hw_age_supply_5y_7y_10.json", minDays: 1825, maxDays: 2555 },
  { key: "age_7y_10y", file: "hw_age_supply_7y_10y_10.json", minDays: 2555, maxDays: 3650 },
  { key: "age_10y", file: "hw_age_supply_10y_10.json", minDays: 3650, maxDays: 5840 }
];

const REALIZED_CAP_BANDS = [
  { key: "age_0d_1d", file: "hw_rc_age_0d_1d.json" },
  { key: "age_1d_1w", file: "hw_rc_age_1d_1w.json" },
  { key: "age_1w_1m", file: "hw_rc_age_1w_1m.json" },
  { key: "age_1m_3m", file: "hw_rc_age_1m_3m.json" },
  { key: "age_3m_6m", file: "hw_rc_age_3m_6m.json" },
  { key: "age_6m_1y", file: "hw_rc_age_6m_1y.json" },
  { key: "age_1y_2y", file: "hw_rc_age_1y_2y.json" },
  { key: "age_2y_3y", file: "hw_rc_age_2y_3y.json" },
  { key: "age_3y_4y", file: "hw_rc_age_3y_4y.json" },
  { key: "age_4y_8y", file: "hw_rc_age_4y_8y.json" },
  { key: "age_8y_plus", file: "hw_rc_age_8y_.json" }
];

async function fetchPublicSupplyHistory() {
  const now = Date.now();
  const cached = globalThis.__welinkBgeometricsSupplyHistoryCache;
  if (cached?.rows && now - cached.savedAt < CACHE_TTL_MS) return cached.rows;

  const [priceRows, ...supplyPayloads] = await Promise.all([
    fetchPublicBtcPriceHistory(),
    ...AGE_BANDS.map((band) => fetchJson(`${FILES_BASE_URL}/${band.file}`))
  ]);
  const supplyMaps = supplyPayloads.map((payload) => new Map(normalizePairSeries(payload).map((row) => [row.timestamp, row.value])));
  const rows = priceRows
    .map((priceRow) => {
      const row = {
        timestamp: priceRow.timestamp,
        date: new Date(priceRow.timestamp).toISOString().slice(0, 10),
        price: priceRow.value
      };
      AGE_BANDS.forEach((band, index) => {
        row[band.key] = supplyMaps[index].get(priceRow.timestamp) ?? null;
      });
      const complete = AGE_BANDS.every((band) => Number.isFinite(row[band.key]) && row[band.key] >= 0);
      if (!complete) return null;
      row.totalSupply = AGE_BANDS.reduce((sum, band) => sum + row[band.key], 0);
      return row;
    })
    .filter(Boolean);
  if (rows.length < 1000) throw new Error("BGeometrics HODL supply history returned too few aligned rows");
  globalThis.__welinkBgeometricsSupplyHistoryCache = { savedAt: now, rows };
  return rows;
}

async function fetchPublicBtcPriceHistory() {
  const now = Date.now();
  const cached = globalThis.__welinkBgeometricsBtcPriceHistoryCache;
  if (cached?.rows && now - cached.savedAt < CACHE_TTL_MS) return cached.rows;
  const payload = await fetchJson(`${FILES_BASE_URL}/hodl_waves_supply_btc_price.json`);
  const rows = normalizePairSeries(payload).map((row) => ({
    ...row,
    date: new Date(row.timestamp).toISOString().slice(0, 10),
    price: row.value
  }));
  if (rows.length < 1000) throw new Error("BGeometrics BTC price history returned too few rows");
  globalThis.__welinkBgeometricsBtcPriceHistoryCache = { savedAt: now, rows };
  return rows;
}

async function fetchPublicRealizedCapHistory() {
  const now = Date.now();
  const cached = globalThis.__welinkBgeometricsRealizedHistoryCache;
  if (cached?.rows && now - cached.savedAt < CACHE_TTL_MS) return cached.rows;

  const [totalPayload, ...bandPayloads] = await Promise.all([
    fetchJson(`${FILES_BASE_URL}/realized_cap.json`),
    ...REALIZED_CAP_BANDS.map((band) => fetchJson(`${FILES_BASE_URL}/${band.file}`))
  ]);
  const totalRows = normalizePairSeries(totalPayload);
  const bandMaps = bandPayloads.map((payload) => new Map(normalizePairSeries(payload).map((row) => [row.timestamp, row.value])));
  const rows = totalRows
    .map((totalRow) => {
      const row = {
        timestamp: totalRow.timestamp,
        date: new Date(totalRow.timestamp).toISOString().slice(0, 10),
        realizedCap: totalRow.value
      };
      REALIZED_CAP_BANDS.forEach((band, index) => {
        row[band.key] = bandMaps[index].get(totalRow.timestamp) ?? 0;
      });
      return row;
    })
    .filter(Boolean);
  if (rows.length < 1000) throw new Error("BGeometrics realized-cap HODL history returned too few aligned rows");
  globalThis.__welinkBgeometricsRealizedHistoryCache = { savedAt: now, rows };
  return rows;
}

async function fetchExactRealizedCapShares() {
  const now = Date.now();
  const cached = globalThis.__welinkBgeometricsExactRealizedCache;
  if (cached?.rows && now - cached.savedAt < CACHE_TTL_MS) return cached.rows;
  const payload = await fetchJson(EXACT_REALIZED_CAP_URL);
  const sourceRows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const rows = sourceRows
    .map((source) => {
      const date = normalizeDate(source.d ?? source.date ?? source.unixTs ?? source.timestamp);
      if (!date) return null;
      const row = { date };
      AGE_BANDS.forEach((band) => {
        row[band.key] = finiteNumber(source[band.key]);
      });
      return AGE_BANDS.every((band) => Number.isFinite(row[band.key]) && row[band.key] >= 0) ? row : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (rows.length < 365) throw new Error("BGeometrics exact realized-cap HODL waves returned too few rows");
  globalThis.__welinkBgeometricsExactRealizedCache = { savedAt: now, rows };
  return rows;
}

function normalizePairSeries(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => {
      if (!Array.isArray(row) || row.length < 2) return null;
      const timestamp = normalizeTimestamp(row[0]);
      const value = finiteNumber(row[1]);
      return Number.isFinite(timestamp) && Number.isFinite(value) ? { timestamp, value } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp);
}

async function fetchJson(url) {
  const candidates = url.startsWith(`${FILES_BASE_URL}/`)
    ? [url, `${FILES_MIRROR_BASE_URL}/${url.slice(FILES_BASE_URL.length + 1)}`]
    : [url];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      return await fetchJsonCandidate(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Unable to load ${url}`);
}

async function fetchJsonCandidate(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "welinkBTC-onchain-dashboard/1.0" }
    });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function finiteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export {
  AGE_BANDS,
  FILES_BASE_URL,
  FILES_MIRROR_BASE_URL,
  fetchExactRealizedCapShares,
  fetchPublicBtcPriceHistory,
  fetchPublicRealizedCapHistory,
  fetchPublicSupplyHistory,
  normalizePairSeries
};
