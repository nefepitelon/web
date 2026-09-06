const SURF_FEED_URL = "https://api.asksurf.ai/muninn/v1/ai-news/feed";
const SURF_PULSE_URL = "https://asksurf.ai/pulse";
const RETENTION_DAYS = 15;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const UPSTREAM_PAGE_SIZE = 30;
const MAX_FEED_ITEMS = 90;
const MAX_UPSTREAM_PAGES = 5;

const EVENT_WEIGHTS = {
  "TGE / Listing": 86,
  "Institutional Adoption": 82,
  "Regulatory / Legal Event": 80,
  "New Product / Upgrade": 76,
  "Mainnet / Testnet": 74,
  "Token Unlock": 72,
  Fundraising: 70,
  Campaign: 58
};

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeUrl(value, fallback = SURF_PULSE_URL) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function scoreSurfItem(item, now = Date.now()) {
  const eventType = String(item?.event_type || "");
  const text = `${item?.title || ""} ${item?.summary || ""}`.toLowerCase();
  const publishedAt = validDate(item?.published_at);
  const ageHours = publishedAt ? Math.max(0, (now - publishedAt.getTime()) / 3_600_000) : 120;
  let score = EVENT_WEIGHTS[eventType] ?? 64;

  if (ageHours <= 6) score += 10;
  else if (ageHours <= 24) score += 7;
  else if (ageHours <= 48) score += 3;
  else score -= Math.floor(ageHours / 24) * 3;

  score += Math.min(9, Math.max(0, Number(item?.source_count || 1) - 1) * 3);
  if (item?.project?.is_listed) score += 2;
  if (/\b(binance|coinbase|upbit|okx|bybit|nasdaq|dtcc)\b/i.test(text)) score += 4;
  if (/\b(sec|etf|finra|regulat|lawsuit|approval|ban|hack|exploit|breach)\b/i.test(text)) score += 5;
  if (/\b(\$?\d+(?:\.\d+)?\s?(?:billion|million|bn|m)\b|acquisition|partnership|launch|listing|unlock)/i.test(text)) score += 3;

  return clamp(Math.round(score), 0, 100);
}

function freshnessFor(publishedAt, now = Date.now()) {
  const date = validDate(publishedAt);
  const ageMs = date ? Math.max(0, now - date.getTime()) : RETENTION_MS;
  const ageHours = ageMs / 3_600_000;
  const ageDay = Math.min(14, Math.floor(ageMs / 86_400_000));
  const batteryLevel = ageDay === 0 ? 5 : ageDay <= 3 ? 4 : ageDay <= 7 ? 3 : ageDay <= 11 ? 2 : 1;
  return {
    ageHours: Number(ageHours.toFixed(1)),
    ageDay,
    batteryLevel,
    batteryTone: ageDay === 0 ? "fresh" : ageDay <= 7 ? "aging" : "stale"
  };
}

function normalizeSurfItem(item, now = Date.now()) {
  const published = validDate(item?.published_at);
  if (!item?.id || !published || now - published.getTime() > RETENTION_MS) return null;
  const fallbackUrl = Array.isArray(item?.sub_events)
    ? item.sub_events.find((event) => event?.url)?.url
    : "";
  const freshness = freshnessFor(published, now);

  return {
    id: String(item.id),
    sourceType: String(item.source_type || "news"),
    sourceName: String(item.source_name || "Surf AI"),
    eventType: String(item.event_type || "Market Update"),
    url: safeUrl(item.primary_url || fallbackUrl),
    surfUrl: SURF_PULSE_URL,
    title: String(item.title || "Untitled market update"),
    summary: String(item.summary || ""),
    sourceCount: Math.max(1, Number(item.source_count || 1)),
    project: item?.project ? {
      id: String(item.project.id || ""),
      name: String(item.project.name || ""),
      slug: String(item.project.slug || ""),
      image: safeUrl(item.project.image, ""),
      isListed: Boolean(item.project.is_listed)
    } : null,
    publishedAt: published.toISOString(),
    score: scoreSurfItem(item, now),
    ...freshness
  };
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function collectSurfItems({ limit = MAX_FEED_ITEMS, lang = "zh", now = Date.now(), fetchImpl = fetch } = {}) {
  const targetLimit = clamp(Math.round(Number(limit) || MAX_FEED_ITEMS), 10, MAX_FEED_ITEMS);
  const items = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursor = null;
  let received = 0;
  let pagesFetched = 0;
  let hasMore = true;

  while (items.length < targetLimit && hasMore && pagesFetched < MAX_UPSTREAM_PAGES) {
    const upstreamUrl = new URL(SURF_FEED_URL);
    upstreamUrl.searchParams.set("limit", String(UPSTREAM_PAGE_SIZE));
    upstreamUrl.searchParams.set("lang", lang);
    if (cursor != null) upstreamUrl.searchParams.set("ts", String(cursor));

    const upstream = await fetchImpl(upstreamUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Alpha-Radar-Surf-Pulse/1.0",
        "x-device-id": process.env.SURF_DEVICE_ID || "alpha-radar-public-feed"
      },
      signal: AbortSignal.timeout(12_000)
    });

    if (!upstream.ok) throw new Error(`Surf Pulse responded with ${upstream.status}`);
    const payload = await upstream.json();
    const sourceItems = Array.isArray(payload?.data?.items) ? payload.data.items : [];
    pagesFetched += 1;
    received += sourceItems.length;
    hasMore = Boolean(payload?.data?.has_more);

    for (const sourceItem of sourceItems) {
      const normalized = normalizeSurfItem(sourceItem, now);
      if (!normalized || seenIds.has(normalized.id)) continue;
      seenIds.add(normalized.id);
      items.push(normalized);
      if (items.length >= targetLimit) break;
    }

    if (!hasMore || !sourceItems.length || items.length >= targetLimit) break;
    const oldestDate = validDate(sourceItems[sourceItems.length - 1]?.published_at);
    if (!oldestDate || now - oldestDate.getTime() > RETENTION_MS) break;
    const nextCursor = Math.floor(oldestDate.getTime() / 1000);
    if (seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    items: items
      .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt))
      .slice(0, targetLimit),
    received,
    pagesFetched,
    hasMore
  };
}

async function surfPulseHandler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    sendJson(response, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  const requestedLimit = Number(request.query?.limit || MAX_FEED_ITEMS);
  const limit = clamp(Number.isFinite(requestedLimit) ? Math.round(requestedLimit) : MAX_FEED_ITEMS, 10, MAX_FEED_ITEMS);
  const lang = ["zh", "en"].includes(String(request.query?.lang || "zh"))
    ? String(request.query?.lang || "zh")
    : "zh";

  try {
    const now = Date.now();
    const collection = await collectSurfItems({ limit, lang, now });

    response.setHeader("Cache-Control", "public, s-maxage=570, stale-while-revalidate=120");
    sendJson(response, 200, {
      ok: true,
      source: "Surf Pulse Real-time Feed",
      sourceUrl: SURF_PULSE_URL,
      fetchedAt: new Date(now).toISOString(),
      retentionDays: RETENTION_DAYS,
      syncIntervalMs: SYNC_INTERVAL_MS,
      hasMore: collection.hasMore,
      received: collection.received,
      pagesFetched: collection.pagesFetched,
      count: collection.items.length,
      items: collection.items
    });
  } catch (error) {
    response.setHeader("Cache-Control", "no-store");
    sendJson(response, 502, {
      ok: false,
      error: "Surf Pulse data is temporarily unavailable",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

module.exports = surfPulseHandler;
module.exports.scoreSurfItem = scoreSurfItem;
module.exports.freshnessFor = freshnessFor;
module.exports.normalizeSurfItem = normalizeSurfItem;
module.exports.collectSurfItems = collectSurfItems;
module.exports.RETENTION_MS = RETENTION_MS;
module.exports.SYNC_INTERVAL_MS = SYNC_INTERVAL_MS;
