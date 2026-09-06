const REQUEST_TIMEOUT_MS = 18_000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

function normalizeUsername(value) {
  const input = String(value || "").trim();
  const match = input.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/i);
  return (match?.[1] || input.replace(/^@/, "")).replace(/[^A-Za-z0-9_]/g, "").slice(0, 15);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.detail || payload?.title || payload?.error?.message || `上游接口返回 ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function engagement(metrics = {}) {
  return Number(metrics.like_count || 0) + Number(metrics.retweet_count || 0) * 2 + Number(metrics.reply_count || 0) * 1.5 + Number(metrics.quote_count || 0) * 2;
}

function xMaterials(payloads, username, limit) {
  const allMedia = new Map();
  payloads.forEach((payload) => (payload.includes?.media || []).forEach((item) => allMedia.set(item.media_key, item)));
  return payloads.flatMap((payload) => payload.data || []).map((post) => {
    const media = (post.attachments?.media_keys || []).map((key) => allMedia.get(key)).filter(Boolean);
    return {
      id: `x-${post.id}`,
      platform: "x",
      account: `@${username}`,
      text: post.text,
      url: `https://x.com/${username}/status/${post.id}`,
      createdAt: post.created_at || null,
      metrics: post.public_metrics || {},
      score: engagement(post.public_metrics),
      image: media.find((item) => item.url || item.preview_image_url)?.url || media.find((item) => item.preview_image_url)?.preview_image_url || null,
      sourceType: "official-api"
    };
  }).sort((left, right) => right.score - left.score).slice(0, limit);
}

async function getXAccount(account, days, limit) {
  if (!process.env.X_BEARER_TOKEN) {
    const error = new Error("尚未配置 X_BEARER_TOKEN。配置后才能通过 X 官方 API 抓取账号热门帖子。");
    error.code = "X_TOKEN_REQUIRED";
    throw error;
  }
  const username = normalizeUsername(account);
  if (!username) throw new Error("请输入有效的 X 账号，例如 @wangchangfu88 或完整主页链接。");
  const headers = { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` };
  const user = await fetchJson(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`, { headers });
  if (!user.data?.id) throw new Error("X 没有返回该账号，请确认账号存在且为公开账号。");

  const startTime = new Date(Date.now() - days * 86_400_000).toISOString();
  const payloads = [];
  let token = "";
  let fetched = 0;
  for (let page = 0; page < 10 && fetched < 1000; page += 1) {
    const params = new URLSearchParams({
      max_results: "100",
      start_time: startTime,
      exclude: "retweets,replies",
      "tweet.fields": "created_at,public_metrics,attachments",
      expansions: "attachments.media_keys",
      "media.fields": "type,url,preview_image_url,width,height"
    });
    if (token) params.set("pagination_token", token);
    const payload = await fetchJson(`https://api.x.com/2/users/${user.data.id}/tweets?${params}`, { headers });
    payloads.push(payload);
    fetched += payload.data?.length || 0;
    token = payload.meta?.next_token || "";
    if (!token) break;
  }
  return { items: xMaterials(payloads, username, limit), meta: { account: `@${username}`, days, fetched, provider: "X API v2", complete: !token } };
}

async function getXHot(query, limit) {
  if (!process.env.X_BEARER_TOKEN) {
    const error = new Error("尚未配置 X_BEARER_TOKEN。配置后才能通过 X 官方 API 获取实时热门内容。");
    error.code = "X_TOKEN_REQUIRED";
    throw error;
  }
  const safeQuery = String(query || "BTC OR Bitcoin OR 人工智能 OR AI").trim().slice(0, 160);
  const params = new URLSearchParams({
    query: `(${safeQuery}) -is:retweet`,
    max_results: "100",
    "tweet.fields": "created_at,public_metrics,author_id,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "username,name",
    "media.fields": "type,url,preview_image_url"
  });
  const payload = await fetchJson(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } });
  const users = new Map((payload.includes?.users || []).map((user) => [user.id, user]));
  const materialPayload = { ...payload, data: (payload.data || []).map((post) => ({ ...post, _username: users.get(post.author_id)?.username || "i" })) };
  const items = (materialPayload.data || []).map((post) => {
    const username = post._username;
    return {
      id: `x-${post.id}`,
      platform: "x",
      account: `@${username}`,
      text: post.text,
      url: `https://x.com/${username}/status/${post.id}`,
      createdAt: post.created_at,
      metrics: post.public_metrics || {},
      score: engagement(post.public_metrics),
      sourceType: "official-api"
    };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
  return { items, meta: { query: safeQuery, fetched: payload.data?.length || 0, provider: "X API v2 recent search" } };
}

async function getWeiboHot(limit) {
  const payload = await fetchJson("https://weibo.com/ajax/side/hotSearch", {
    headers: { Accept: "application/json", Referer: "https://weibo.com/", "User-Agent": "Mozilla/5.0 welinkBTC-content-research/1.0" }
  });
  const rows = payload?.data?.realtime || [];
  const items = rows.filter((row) => row.word || row.note).slice(0, limit).map((row, index) => {
    const word = String(row.word || row.note).trim();
    return {
      id: `weibo-hot-${index}-${word.slice(0, 12)}`,
      platform: "weibo",
      account: "微博热搜",
      text: `${word}${row.word_scheme ? `\n${row.word_scheme}` : ""}`,
      title: word,
      url: `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${word}#`)}`,
      createdAt: new Date().toISOString(),
      metrics: { hot: Number(row.num || row.raw_hot || 0) },
      score: Number(row.num || row.raw_hot || rows.length - index),
      sourceType: "public-trending"
    };
  });
  return { items, meta: { fetched: rows.length, provider: "微博公开热搜" } };
}

function manualMaterial(body, limit) {
  const text = String(body.manualText || "").trim().slice(0, 12_000);
  if (!text) throw new Error("请粘贴要导入的公开素材正文。");
  const chunks = text.split(/\n\s*\n(?=\S)/).map((item) => item.trim()).filter(Boolean).slice(0, limit);
  return {
    items: chunks.map((item, index) => ({
      id: `manual-${Date.now()}-${index}`,
      platform: String(body.platform || "manual").slice(0, 30),
      account: String(body.account || "手动导入").slice(0, 80),
      text: item,
      url: String(body.url || "").slice(0, 500),
      createdAt: new Date().toISOString(),
      metrics: {},
      score: chunks.length - index,
      sourceType: "manual"
    })),
    meta: { fetched: chunks.length, provider: "手动导入" }
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "仅支持 POST 请求。" });
  const source = String(req.body?.source || "x-account");
  const days = clamp(req.body?.days || 90, 1, 90);
  const limit = clamp(req.body?.limit || 20, 1, 50);
  try {
    let result;
    if (source === "x-account") result = await getXAccount(req.body?.account, days, limit);
    else if (source === "x-hot") result = await getXHot(req.body?.query, limit);
    else if (source === "weibo-hot") result = await getWeiboHot(limit);
    else if (source === "manual") result = manualMaterial(req.body || {}, limit);
    else if (source === "binance-hot") {
      const error = new Error("币安官方目前没有稳定公开的广场热门内容读取接口。请切换为“手动导入”，粘贴公开内容或链接；系统不会调用未公开接口。");
      error.code = "MANUAL_ONLY";
      throw error;
    } else throw new Error("暂不支持该素材源。");
    return res.status(200).json({ ok: true, source, realtime: source !== "manual", ...result });
  } catch (error) {
    const status = error.code === "X_TOKEN_REQUIRED" || error.code === "MANUAL_ONLY" ? 409 : 502;
    return res.status(status).json({ ok: false, code: error.code || "SOURCE_ERROR", error: error.message });
  }
};
