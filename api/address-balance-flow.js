const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;
const HISTORY_LOOKBACK_DAYS = 45;
const DISPLAY_DAYS = 30;
const DAY_MS = 86_400_000;
const BITVIEW_BULK_URL = "https://bitview.space/api/series/bulk";

const INPUT_SERIES = [
  { bucketId: "under_1", name: "balance_100k_to_1m_sats_address_count_delta_24h" },
  { bucketId: "under_1", name: "balance_1m_to_10m_sats_address_count_delta_24h" },
  { bucketId: "under_1", name: "balance_10m_to_100m_sats_address_count_delta_24h" },
  { bucketId: "one_to_10", name: "balance_1_to_10_btc_address_count_delta_24h" },
  { bucketId: "ten_to_100", name: "balance_10_to_100_btc_address_count_delta_24h" },
  { bucketId: "over_100", name: "balance_100_to_1k_btc_address_count_delta_24h" },
  { bucketId: "over_100", name: "balance_1k_to_10k_btc_address_count_delta_24h" },
  { bucketId: "over_100", name: "balance_10k_to_100k_btc_address_count_delta_24h" },
  { bucketId: "over_100", name: "balance_over_100k_btc_address_count_delta_24h" }
];

const OUTPUT_BUCKETS = [
  { id: "under_1", label: "0.001–1 BTC" },
  { id: "one_to_10", label: "1–10 BTC" },
  { id: "ten_to_100", label: "10–100 BTC" },
  { id: "over_100", label: "100+ BTC" }
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
  const requestedDays = normalizeRequestedDays(request?.query?.days);
  const cache = globalThis.__welinkAddressBalanceFlowV1;
  if (cache?.payload && now - cache.savedAt < CACHE_TTL_MS) {
    return sendPayload(response, selectPayloadDays(cache.payload, requestedDays), "HIT");
  }

  try {
    const payload = await buildAddressBalanceFlowPayload({ now });
    globalThis.__welinkAddressBalanceFlowV1 = { savedAt: now, payload };
    return sendPayload(response, selectPayloadDays(payload, requestedDays), "MISS");
  } catch (error) {
    if (cache?.payload && now - cache.savedAt < MAX_STALE_MS) {
      const stalePayload = {
        ...cache.payload,
        stale: true,
        generatedAt: new Date(now).toISOString(),
        warning: "Address-cohort refresh failed; serving the latest valid Bitview snapshot."
      };
      return sendPayload(response, selectPayloadDays(stalePayload, requestedDays), "STALE");
    }
    return response.status(502).json({
      ok: false,
      error: "Unable to load Bitcoin address balance flows",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function sendPayload(response, payload, cacheState) {
  response.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
  response.setHeader("X-Welink-Cache", cacheState);
  return response.status(200).json(payload);
}

function normalizeRequestedDays(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(candidate ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= DISPLAY_DAYS ? parsed : DISPLAY_DAYS;
}

function selectPayloadDays(payload, days = DISPLAY_DAYS) {
  const requestedDays = normalizeRequestedDays(days);
  return {
    ...payload,
    requestedDays,
    dates: Array.isArray(payload?.dates) ? payload.dates.slice(-requestedDays) : [],
    buckets: Array.isArray(payload?.buckets) ? payload.buckets.map((bucket) => ({
      ...bucket,
      series: Array.isArray(bucket?.series) ? bucket.series.slice(-requestedDays) : []
    })) : []
  };
}

async function buildAddressBalanceFlowPayload({
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  displayDays = DISPLAY_DAYS
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch implementation is unavailable");
  const endDate = new Date(now + DAY_MS).toISOString().slice(0, 10);
  const startDate = new Date(now - HISTORY_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    series: INPUT_SERIES.map((entry) => entry.name).join(","),
    index: "day1",
    start: startDate,
    end: endDate
  });
  const payload = await fetchJsonWithRetry(`${BITVIEW_BULK_URL}?${query}`, fetchImpl);
  const seriesByName = normalizeBulkSeries(payload, INPUT_SERIES.map((entry) => entry.name), startDate);
  const alignedDates = intersectDates(INPUT_SERIES.map((entry) => seriesByName[entry.name]));
  if (alignedDates.length < displayDays) {
    throw new Error(`Bitview returned only ${alignedDates.length} aligned daily observations`);
  }

  const dailyRows = alignedDates.slice(-displayDays).map((date) => ({
    date,
    changes: Object.fromEntries(OUTPUT_BUCKETS.map((bucket) => [
      bucket.id,
      INPUT_SERIES.filter((entry) => entry.bucketId === bucket.id)
        .reduce((sum, entry) => sum + seriesByName[entry.name].get(date), 0)
    ]))
  }));
  const latest = dailyRows.at(-1);

  return {
    ok: true,
    stale: false,
    generatedAt: new Date(now).toISOString(),
    cadence: "daily",
    asOf: latest.date,
    provisional: latest.date === new Date(now).toISOString().slice(0, 10),
    dates: dailyRows.map((row) => row.date),
    buckets: OUTPUT_BUCKETS.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      latestCount: null,
      latestChange: latest.changes[bucket.id],
      series: dailyRows.map((row) => ({ date: row.date, count: null, change: row.changes[bucket.id] }))
    })),
    sources: {
      primary: "Bitview · Bitcoin Research Kit",
      url: "https://bitview.space/api",
      methodology: "Daily address-count deltas from one public Bitview bulk query. The 0.001–1 BTC and 100+ BTC groups sum their constituent balance cohorts.",
      disclosure: "The public series count addresses, not unique people or entities. Address splitting, consolidation and exchange custody can change cohort totals without equivalent investor inflows or outflows."
    }
  };
}

function normalizeBulkSeries(payload, names, startDate) {
  const result = Object.fromEntries(names.map((name) => [name, new Map()]));
  const root = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const namedRoot = root?.series && !Array.isArray(root.series) ? root.series : root;

  if (namedRoot && !Array.isArray(namedRoot) && typeof namedRoot === "object") {
    names.forEach((name) => {
      const candidate = namedRoot[name];
      if (candidate !== undefined) result[name] = normalizeSeriesValues(candidate, startDate, name);
    });
  }

  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.series)
        ? payload.series
        : [];
  if (list.length) {
    const looksLikeRecords = list.some((row) => row && typeof row === "object"
      && !Array.isArray(row) && dateFrom(row) && names.some((name) => row[name] !== undefined));
    if (looksLikeRecords) {
      names.forEach((name) => {
        result[name] = new Map(list.map((row) => [dateFrom(row), finiteNumber(row?.[name])])
          .filter(([date, value]) => date && Number.isFinite(value)));
      });
    } else {
      list.forEach((candidate, index) => {
        const explicitName = candidate?.series || candidate?.name || candidate?.id;
        const name = names.includes(explicitName) ? explicitName : names[index];
        if (name) result[name] = normalizeSeriesValues(candidate, startDate, name);
      });
    }
  }

  names.forEach((name) => {
    if (!(result[name] instanceof Map) || result[name].size === 0) {
      throw new Error(`Bitview bulk response omitted ${name}`);
    }
  });
  return result;
}

function normalizeSeriesValues(candidate, startDate, seriesName) {
  const values = Array.isArray(candidate)
    ? candidate
    : Array.isArray(candidate?.data)
      ? candidate.data
      : Array.isArray(candidate?.values)
        ? candidate.values
        : [];
  const rows = values.map((value, index) => {
    if (Array.isArray(value)) return [normalDate(value[0], startDate, index), finiteNumber(value[1])];
    if (value && typeof value === "object") {
      return [dateFrom(value) || addDays(startDate, index), finiteNumber(
        value.value ?? value.v ?? value.data ?? value[seriesName]
      )];
    }
    return [addDays(startDate, index), finiteNumber(value)];
  }).filter(([date, value]) => date && Number.isFinite(value));
  return new Map(rows);
}

function dateFrom(row) {
  return normalDate(row?.date ?? row?.d ?? row?.day ?? row?.timestamp ?? row?.time);
}

function normalDate(value, fallbackStart, fallbackIndex = 0) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (Number.isFinite(Number(value)) && Number(value) > 100_000_000) {
    const milliseconds = Number(value) > 10_000_000_000 ? Number(value) : Number(value) * 1000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  return fallbackStart ? addDays(fallbackStart, fallbackIndex) : "";
}

function intersectDates(maps) {
  const [first, ...rest] = maps;
  if (!(first instanceof Map)) return [];
  return [...first.keys()].filter((date) => rest.every((map) => map instanceof Map && map.has(date))).sort();
}

async function fetchJsonWithRetry(url, fetchImpl, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response?.ok) throw new Error(`${response?.status || "Network error"} ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error(`Unable to load ${url}`);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export {
  BITVIEW_BULK_URL,
  CACHE_TTL_MS,
  MAX_STALE_MS,
  DISPLAY_DAYS,
  INPUT_SERIES,
  OUTPUT_BUCKETS,
  buildAddressBalanceFlowPayload,
  normalizeRequestedDays,
  selectPayloadDays,
  normalizeBulkSeries,
  normalizeSeriesValues,
  intersectDates,
  fetchJsonWithRetry
};
