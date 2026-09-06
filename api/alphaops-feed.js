const RSS_ENDPOINTS = [
  "https://rsshub.app/twitter/user/{handle}/exclude_rts_replies"
];

const X_RECENT_SEARCH_ENDPOINT = "https://api.x.com/2/tweets/search/recent";
const MAX_HANDLES = 55;
const X_HANDLES_PER_QUERY = 12;
const REQUEST_TIMEOUT_MS = 2200;
const X_REQUEST_TIMEOUT_MS = 5200;
const GLOBAL_TIMEOUT_MS = 9000;
const FEED_CACHE_SECONDS = 12 * 60 * 60;

function readBearerToken() {
  return process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || process.env.X_API_BEARER_TOKEN || "";
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripHtml(value = "") {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(match[1]).trim() : "";
}

function parseRss(xml, handle) {
  const channelTitle = stripHtml(readTag(xml, "title")).replace(/^@/, "").replace(/ \/ Twitter$/, "");
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 3);

  return items.map((match) => {
    const item = match[0];
    const title = stripHtml(readTag(item, "title"));
    const description = stripHtml(readTag(item, "description"));
    const link = readTag(item, "link") || `https://x.com/${handle}`;
    const pubDate = readTag(item, "pubDate");
    const timestamp = Number.isNaN(Date.parse(pubDate)) ? new Date().toISOString() : new Date(pubDate).toISOString();
    const text = description || title || `${channelTitle || handle} posted a new update.`;

    return {
      project: channelTitle || handle,
      handle,
      text,
      url: link.replace(/https?:\/\/[^/]+/, "https://x.com"),
      timestamp,
      avatar: (channelTitle || handle).slice(0, 2).toUpperCase()
    };
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      headers: {
        "accept": "application/rss+xml, application/xml, text/xml",
        "user-agent": "Mozilla/5.0 AlphaOpsFeed/1.0",
        ...(options.headers || {})
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, headers = {}) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "accept": "application/json",
      ...headers
    }
  }, X_REQUEST_TIMEOUT_MS);
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    const detail = payload.detail || payload.title || payload.errors?.[0]?.detail || payload.errors?.[0]?.title || response.statusText;
    throw new Error(`X API ${response.status}: ${detail}`);
  }

  return payload;
}

async function fetchHandle(handle) {
  for (const template of RSS_ENDPOINTS) {
    const url = template.replace("{handle}", encodeURIComponent(handle));
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) continue;
      const xml = await response.text();
      const items = parseRss(xml, handle);
      if (items.length) return items;
    } catch (error) {
      continue;
    }
  }
  return [];
}

function normalizeTweetText(tweet) {
  return stripHtml(tweet.note_tweet?.text || tweet.text || "");
}

function mapXTweets(payload) {
  const users = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
  return (payload.data || []).map((tweet) => {
    const user = users.get(tweet.author_id) || {};
    const username = user.username || "";
    const project = user.name || username || "X";

    return {
      id: tweet.id,
      project,
      handle: username,
      text: normalizeTweetText(tweet),
      url: username ? `https://x.com/${username}/status/${tweet.id}` : "https://x.com",
      timestamp: tweet.created_at || new Date().toISOString(),
      avatar: project.slice(0, 2).toUpperCase(),
      avatarUrl: user.profile_image_url || "",
      metrics: tweet.public_metrics || {},
      source: "x-api"
    };
  }).filter((item) => item.text && item.handle);
}

async function fetchXChunk(handles, token) {
  const query = `(${handles.map((handle) => `from:${handle}`).join(" OR ")}) -is:retweet -is:reply`;
  const params = new URLSearchParams({
    query,
    "tweet.fields": "created_at,author_id,public_metrics",
    expansions: "author_id",
    "user.fields": "name,username,profile_image_url",
    max_results: "100"
  });
  const payload = await fetchJsonWithTimeout(`${X_RECENT_SEARCH_ENDPOINT}?${params.toString()}`, {
    authorization: `Bearer ${token}`
  });
  return mapXTweets(payload);
}

async function fetchXRecentTweets(handles, token) {
  const chunks = chunkArray(handles, X_HANDLES_PER_QUERY);
  const errors = [];
  const results = await mapWithConcurrency(chunks, 2, async (chunk) => {
    try {
      return await fetchXChunk(chunk, token);
    } catch (error) {
      errors.push(error);
      return [];
    }
  });

  if (errors.length && errors.length === chunks.length) {
    throw errors[0];
  }

  return results.flat();
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.id || item.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchRssFallback(handles) {
  const batches = await Promise.race([
    mapWithConcurrency(handles, 8, fetchHandle),
    new Promise((resolve) => setTimeout(() => resolve([]), GLOBAL_TIMEOUT_MS))
  ]);
  return batches.flat();
}

module.exports = async function handler(req, res) {
  const rawHandles = String(req.query.handles || "");
  const handles = [...new Set(rawHandles
    .split(",")
    .map((handle) => handle.trim().replace(/^@/, ""))
    .filter((handle) => /^[A-Za-z0-9_]{1,20}$/.test(handle))
  )].slice(0, MAX_HANDLES);

  const token = readBearerToken();
  res.setHeader("Cache-Control", `s-maxage=${FEED_CACHE_SECONDS}, stale-while-revalidate=${FEED_CACHE_SECONDS}`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!handles.length) {
    res.status(200).json({ updatedAt: new Date().toISOString(), configured: Boolean(token), source: "empty", items: [] });
    return;
  }

  let source = "x-api";
  let message = "已接入 X API 最新推文。";
  let xApiError = "";
  let items = [];

  if (token) {
    try {
      items = await fetchXRecentTweets(handles, token);
    } catch (error) {
      xApiError = error.message;
      message = "X API 暂不可用，已切换到备用公开源。";
      source = "rsshub";
    }
  } else {
    message = "未配置 X_BEARER_TOKEN，当前使用备用公开源。";
    source = "rsshub";
  }

  if (!items.length) {
    const fallbackItems = await fetchRssFallback(handles);
    if (fallbackItems.length) {
      items = fallbackItems;
      source = source === "x-api" ? "rsshub" : source;
      if (token && !xApiError) message = "X API 暂无可展示推文，已切换到备用公开源。";
    } else if (token && !xApiError) {
      message = "X API 当前未返回项目池最近 7 天推文，请稍后刷新。";
    }
  }

  items = uniqueItems(items)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 80);

  res.status(200).json({
    updatedAt: new Date().toISOString(),
    configured: Boolean(token),
    source,
    message,
    xApiError,
    handles: handles.length,
    count: items.length,
    items
  });
};
