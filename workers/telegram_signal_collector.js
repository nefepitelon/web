const { createHash } = require("node:crypto");

const DEFAULT_CHANNEL_USERNAME = "BWE_OI_Price_monitor";
const SIGNAL_COLLECTION = "telegram_signals";
const SIGNAL_FEED_COLLECTION = "telegram_signal_feed";
const RECENT_SIGNAL_LIMIT = 20;
const PUBLIC_PREVIEW_SOURCE_MODE = "public_preview";

function asNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeChannelUsername(value) {
  return String(value || "").trim().replace(/^@/, "").toLowerCase();
}

function cleanSymbol(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.endsWith("USDT") ? compact.slice(0, -4) : compact;
}

function extractSymbol(text) {
  const patterns = [
    /\[\s*([A-Z0-9]{2,20})(?:[\/_-]?USDT)?\s*\]/i,
    /(?:symbol|pair|币种|交易对)\s*[:：]?\s*[#$]?([A-Z0-9]{2,20})(?:[\/_-]?USDT)?\b/i,
    /\b([A-Z0-9]{2,20})[\/_-]USDT\b/i,
    /\b([A-Z0-9]{2,20})USDT\b/i,
    /[$#]([A-Z][A-Z0-9]{1,19})\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return cleanSymbol(match[1]);
  }
  return null;
}

function extractSignedPercent(text, patterns) {
  for (const { pattern, signFromWord } of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    let value = asNumber(match[match.length - 1]);
    if (value == null) continue;
    if (signFromWord) {
      const directionWord = String(match[1] || "").toLowerCase();
      if (/下跌|跌|减少|降低|decreas|down|drop|fell/.test(directionWord)) value = -Math.abs(value);
      if (/上涨|涨|增加|提高|increas|up|rise|rose/.test(directionWord)) value = Math.abs(value);
    }
    return value;
  }
  return null;
}

function extractPriceChange(text) {
  return extractSignedPercent(text, [
    { pattern: /价格\s*(上涨|下跌)\s*([+-]?\d+(?:\.\d+)?)\s*%/i, signFromWord: true },
    { pattern: /\bprice\s*(increased?|decreased?|up|down|rose|fell)\s*([+-]?\d+(?:\.\d+)?)\s*%/i, signFromWord: true },
    { pattern: /\bprice\s*(increased?|decreased?|up|down)?\s*([+-]\d+(?:\.\d+)?)\s*%/i, signFromWord: false },
    { pattern: /(?:price\s*change|价格(?:变化|变动|涨跌幅)|涨跌幅)\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)\s*%/i, signFromWord: false },
    { pattern: /(涨幅|跌幅)\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)\s*%/i, signFromWord: true }
  ]);
}

function extractOiChange(text) {
  return extractSignedPercent(text, [
    { pattern: /(?:未平仓合约量|持仓量|OI)\s*(上涨|下跌|增加|减少)\s*([+-]?\d+(?:\.\d+)?)\s*%/i, signFromWord: true },
    { pattern: /(?:open\s*interest|openinterest|OI)\s*(increased?|decreased?|up|down|rose|fell)\s*([+-]?\d+(?:\.\d+)?)\s*%/i, signFromWord: true },
    { pattern: /(?:未平仓合约量|持仓量)\s*(?:变化|变动)?\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)\s*%/i, signFromWord: false },
    { pattern: /(?:open\s*interest|openinterest|OI)(?:\s*(?:change|delta|变化|变动))?\s*[:：]?\s*([+-]?\d+(?:\.\d+)?)\s*%/i, signFromWord: false }
  ]);
}

function extractPrice(text) {
  const patterns = [
    /(?:entry\s*price|mark\s*price|current\s*price|价格|入场价|现价)\s*[:：=@]\s*\$?\s*([0-9][\d,]*(?:\.\d+)?)/i,
    /\bprice\s*[:：=@]\s*\$?\s*([0-9][\d,]*(?:\.\d+)?)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return asNumber(match[1]);
  }
  return null;
}

function extractDirection(text, priceChange) {
  const explicit = text.match(/(?:direction|side|方向)\s*[:：]?\s*(long|short|buy|sell|做多|做空|多头|空头|多|空)/i);
  const value = explicit?.[1]?.toLowerCase();
  if (value && /long|buy|做多|多头|^多$/.test(value)) return "long";
  if (value && /short|sell|做空|空头|^空$/.test(value)) return "short";
  if (/\b(?:LONG|BUY)\b/i.test(text)) return "long";
  if (/\b(?:SHORT|SELL)\b/i.test(text)) return "short";
  if (/🟢|看涨|多头信号|long\s*(?:signal|setup)/i.test(text)) return "long";
  if (/🔻|🔴|看跌|空头信号|short\s*(?:signal|setup)/i.test(text)) return "short";
  if (priceChange != null && priceChange > 0) return "long";
  if (priceChange != null && priceChange < 0) return "short";
  return "unknown";
}

function normalizeTrigger(value) {
  const trigger = String(value || "").trim().toLowerCase();
  if (!trigger) return null;
  if (/liquidation|爆仓|强平/.test(trigger)) return "liquidation";
  if (/breakout|突破/.test(trigger)) return "oi_breakout";
  if (/volume|成交|放量/.test(trigger)) return "volume_spike";
  if (/funding|资金费率/.test(trigger)) return "funding_extreme";
  return trigger.replace(/[^a-z0-9\u4e00-\u9fff]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || null;
}

function extractTriggerType(text, oiChange, priceChange) {
  const explicit = text.match(/(?:trigger(?:\s*type)?|触发(?:类型)?)\s*[:：]?\s*([^,，;；\n]{2,60})/i);
  const normalized = normalizeTrigger(explicit?.[1]);
  if (normalized) return normalized;
  if (oiChange == null || priceChange == null) return "unknown";
  const oiDirection = oiChange >= 0 ? "oi_up" : "oi_down";
  const priceDirection = priceChange >= 0 ? "price_up" : "price_down";
  return `${oiDirection}_${priceDirection}`;
}

function extractSignalTime(text, suppliedTime) {
  if (suppliedTime != null) {
    const supplied = typeof suppliedTime === "number" && suppliedTime < 10_000_000_000
      ? new Date(suppliedTime * 1000)
      : new Date(suppliedTime);
    if (!Number.isNaN(supplied.getTime())) return supplied.toISOString();
  }
  const match = text.match(/(?:time|timestamp|时间)\s*[:：]\s*([^\n,，]+)/i)
    || text.match(/\b(20\d{2}-\d{1,2}-\d{1,2}[T\s]\d{1,2}:\d{2}(?::\d{2})?(?:Z|\s*[+-]\d{2}:?\d{2})?)\b/);
  if (match) {
    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function makeDedupeHash({ channelId, channelUsername, messageId, rawText }) {
  const channelKey = normalizeChannelUsername(channelUsername) || channelId || "unknown-channel";
  const messageKey = messageId != null && messageId !== "" ? String(messageId) : normalizeText(rawText).toLowerCase();
  return createHash("sha256").update(`${channelKey}|${messageKey}`).digest("hex");
}

function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"'
  };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, key) => {
    if (key[0] === "#") {
      const hexadecimal = key[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (Number.isFinite(codePoint)) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return entity;
        }
      }
    }
    return namedEntities[key.toLowerCase()] ?? entity;
  });
}

function telegramHtmlToText(value) {
  return decodeHtmlEntities(String(value || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function publicPreviewMessagesFromHtml(html, env = process.env) {
  const channelUsername = env.TELEGRAM_TARGET_CHANNEL || DEFAULT_CHANNEL_USERNAME;
  const expectedUsername = normalizeChannelUsername(channelUsername);
  const source = String(html || "");
  const markers = [...source.matchAll(/<div class="tgme_widget_message_wrap\b/g)];

  return markers.map((marker, index) => {
    const block = source.slice(marker.index, markers[index + 1]?.index ?? source.length);
    const identity = block.match(/data-post="([^"/]+)\/(\d+)"/i);
    if (!identity || normalizeChannelUsername(identity[1]) !== expectedUsername) return null;
    const messageText = block.match(/<div class="tgme_widget_message_text\b[^>]*>([\s\S]*?)<\/div>/i);
    const timestamp = block.match(/<time\s+datetime="([^"]+)"/i);
    const rawText = telegramHtmlToText(messageText?.[1]);
    if (!rawText) return null;

    return {
      rawText,
      options: {
        channelUsername,
        messageId: identity[2],
        signalTime: timestamp?.[1],
        sourceMode: PUBLIC_PREVIEW_SOURCE_MODE
      }
    };
  }).filter(Boolean).slice(-RECENT_SIGNAL_LIMIT);
}

function publicPreviewMessagesFromMarkdown(markdown, env = process.env) {
  const channelUsername = env.TELEGRAM_TARGET_CHANNEL || DEFAULT_CHANNEL_USERNAME;
  const escapedChannel = channelUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = String(markdown || "");
  const markers = [...source.matchAll(new RegExp(`^\\[\\]\\(https:\\/\\/t\\.me\\/${escapedChannel}\\/(\\d+)\\)\\s*$`, "gmi"))];
  const collectedAt = Date.now();

  return markers.map((marker, index) => {
    const block = source.slice(marker.index + marker[0].length, markers[index + 1]?.index ?? source.length);
    const signalLines = block.split(/\r?\n/).map((line) => line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/[_*`]/g, "")
      .replace(/\\([_\[\]])/g, "$1")
      .trim())
      .filter((line) => /\[[A-Z0-9]+USDT\]/i.test(line));
    const rawText = signalLines.slice(0, 2).join("\n").trim();
    if (!rawText) return null;
    const orderOffset = Math.max(0, markers.length - index - 1) * 1000;
    return {
      rawText,
      options: {
        channelUsername,
        messageId: marker[1],
        signalTime: new Date(collectedAt - orderOffset).toISOString(),
        sourceMode: PUBLIC_PREVIEW_SOURCE_MODE
      }
    };
  }).filter(Boolean).slice(-RECENT_SIGNAL_LIMIT);
}

function calculateConfidence(fields) {
  let score = 0.08;
  if (fields.symbol) score += 0.3;
  if (fields.direction !== "unknown") score += 0.15;
  if (fields.price != null || fields.priceChangePct != null) score += 0.2;
  if (fields.oiChangePct != null) score += 0.2;
  if (fields.triggerType !== "unknown") score += 0.05;
  if (fields.signalTime) score += 0.02;
  return Math.min(1, Number(score.toFixed(2)));
}

function parseTelegramSignal(rawText, options = {}) {
  const preservedRawText = String(rawText || "").replace(/\r\n?/g, "\n").trim();
  const text = normalizeText(preservedRawText);
  const symbol = extractSymbol(text);
  const priceChangePct = extractPriceChange(text);
  const oiChangePct = extractOiChange(text);
  const price = extractPrice(text);
  const direction = extractDirection(text, priceChangePct);
  const triggerType = extractTriggerType(text, oiChangePct, priceChangePct);
  const signalTime = extractSignalTime(text, options.signalTime);
  const confidence = calculateConfidence({ symbol, direction, price, priceChangePct, oiChangePct, triggerType, signalTime });
  const requiredCount = [symbol, direction !== "unknown", price != null || priceChangePct != null, oiChangePct != null].filter(Boolean).length;
  const parseStatus = requiredCount === 4 ? "parsed" : requiredCount >= 2 ? "partial" : "unparsed";
  const channelUsername = options.channelUsername || DEFAULT_CHANNEL_USERNAME;

  return {
    dedupe_hash: makeDedupeHash({
      channelId: options.channelId,
      channelUsername,
      messageId: options.messageId,
      rawText: text
    }),
    telegram_chat_id: options.channelId == null ? null : String(options.channelId),
    telegram_message_id: options.messageId == null ? null : String(options.messageId),
    channel_username: normalizeChannelUsername(channelUsername),
    symbol,
    pair: symbol ? `${symbol}USDT` : null,
    direction,
    price,
    price_change_pct: priceChangePct,
    oi_change_pct: oiChangePct,
    trigger_type: triggerType,
    signal_time: signalTime,
    confidence: parseStatus === "unparsed" ? Math.min(confidence, 0.25) : confidence,
    parse_status: parseStatus,
    raw_text: preservedRawText,
    source_mode: options.sourceMode || "mock",
    source_message_url: options.messageId == null ? null : `https://t.me/${channelUsername}/${options.messageId}`,
    received_at: new Date().toISOString()
  };
}

class MemorySignalStore {
  constructor(initialSignals = []) {
    this.name = "memory";
    this.records = new Map(initialSignals.map((signal) => [signal.dedupe_hash, signal]));
  }

  async upsertMany(signals) {
    let inserted = 0;
    let duplicates = 0;
    for (const signal of signals) {
      if (this.records.has(signal.dedupe_hash)) duplicates += 1;
      else inserted += 1;
      this.records.set(signal.dedupe_hash, signal);
    }
    return { inserted, duplicates };
  }

  async listRecent(limit = RECENT_SIGNAL_LIMIT) {
    return [...this.records.values()]
      .sort((left, right) => new Date(right.signal_time) - new Date(left.signal_time))
      .slice(0, limit);
  }
}

class BlobSignalStore {
  constructor(blobClient) {
    this.name = "vercel-blob";
    this.blobClient = blobClient;
  }

  async readFeedSnapshot(limit = RECENT_SIGNAL_LIMIT) {
    try {
      const pathname = `${SIGNAL_FEED_COLLECTION}/latest.json`;
      const listing = await this.blobClient.list({ prefix: pathname, limit: 1 });
      const blob = listing.blobs.find((item) => item.pathname === pathname);
      if (!blob) return [];
      const response = await fetch(blob.url, { cache: "no-store" });
      if (!response.ok) return [];
      const payload = await response.json();
      return (Array.isArray(payload) ? payload : [])
        .sort((left, right) => new Date(right.signal_time) - new Date(left.signal_time))
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  async upsertMany(signals) {
    const [listing, currentFeed] = await Promise.all([
      this.blobClient.list({ prefix: `${SIGNAL_COLLECTION}/`, limit: 1000 }),
      this.readFeedSnapshot(RECENT_SIGNAL_LIMIT)
    ]);
    const existing = new Set(listing.blobs.map((blob) => blob.pathname));
    let inserted = 0;
    let duplicates = 0;
    await Promise.all(signals.map(async (signal) => {
      const pathname = `${SIGNAL_COLLECTION}/${signal.dedupe_hash}.json`;
      if (existing.has(pathname)) duplicates += 1;
      else inserted += 1;
      await this.blobClient.put(pathname, JSON.stringify(signal), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json"
      });
    }));

    const merged = new Map(currentFeed.map((signal) => [signal.dedupe_hash, signal]));
    signals.forEach((signal) => merged.set(signal.dedupe_hash, signal));
    const latestFeed = [...merged.values()]
      .sort((left, right) => new Date(right.signal_time) - new Date(left.signal_time))
      .slice(0, RECENT_SIGNAL_LIMIT);
    await this.blobClient.put(`${SIGNAL_FEED_COLLECTION}/latest.json`, JSON.stringify(latestFeed), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
    return { inserted, duplicates };
  }

  async listRecent(limit = RECENT_SIGNAL_LIMIT) {
    const feedSnapshot = await this.readFeedSnapshot(limit);
    if (feedSnapshot.length) return feedSnapshot;

    const listing = await this.blobClient.list({ prefix: `${SIGNAL_COLLECTION}/`, limit: 1000 });
    const records = await Promise.all(listing.blobs.map(async (blob) => {
      try {
        const response = await fetch(blob.url, { cache: "no-store" });
        return response.ok ? response.json() : null;
      } catch {
        return null;
      }
    }));
    return records.filter(Boolean)
      .sort((left, right) => new Date(right.signal_time) - new Date(left.signal_time))
      .slice(0, limit);
  }
}

class SupabaseSignalStore {
  constructor({ url, serviceRoleKey }) {
    this.name = "supabase";
    this.baseUrl = url.replace(/\/$/, "");
    this.headers = {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json"
    };
  }

  async upsertMany(signals) {
    if (!signals.length) return { inserted: 0, duplicates: 0 };
    const response = await fetch(`${this.baseUrl}/rest/v1/telegram_signals?on_conflict=dedupe_hash`, {
      method: "POST",
      headers: { ...this.headers, prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(signals)
    });
    if (!response.ok) throw new Error(`telegram_signals upsert failed (${response.status}): ${await response.text()}`);
    return { inserted: signals.length, duplicates: 0 };
  }

  async listRecent(limit = RECENT_SIGNAL_LIMIT) {
    const query = new URLSearchParams({
      select: "*",
      order: "signal_time.desc",
      limit: String(limit)
    });
    const response = await fetch(`${this.baseUrl}/rest/v1/telegram_signals?${query}`, { headers: this.headers });
    if (!response.ok) throw new Error(`telegram_signals query failed (${response.status}): ${await response.text()}`);
    return response.json();
  }
}

function createStoreFromEnv(env = process.env) {
  const supabaseUrl = env.TELEGRAM_SIGNALS_SUPABASE_URL || env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) return new SupabaseSignalStore({ url: supabaseUrl, serviceRoleKey: supabaseKey });
  if (env.BLOB_READ_WRITE_TOKEN) return new BlobSignalStore(require("@vercel/blob"));
  return new MemorySignalStore();
}

function matchesTargetChannel(message, env = process.env) {
  const chat = message?.chat || {};
  const expectedUsername = normalizeChannelUsername(env.TELEGRAM_TARGET_CHANNEL || DEFAULT_CHANNEL_USERNAME);
  const expectedChatId = String(env.TELEGRAM_TARGET_CHAT_ID || "");
  const usernameMatches = normalizeChannelUsername(chat.username) === expectedUsername;
  const idMatches = expectedChatId && String(chat.id) === expectedChatId;
  return Boolean(usernameMatches || idMatches);
}

function telegramMessagesFromUpdate(update, env = process.env) {
  const updates = Array.isArray(update?.updates) ? update.updates : [update];
  return updates.flatMap((item) => {
    const message = item?.channel_post || item?.edited_channel_post;
    if (!message || !matchesTargetChannel(message, env)) return [];
    const rawText = message.text || message.caption || "";
    if (!rawText) return [];
    return [{
      rawText,
      options: {
        channelId: message.chat?.id,
        channelUsername: message.chat?.username || env.TELEGRAM_TARGET_CHANNEL || DEFAULT_CHANNEL_USERNAME,
        messageId: message.message_id,
        signalTime: message.date,
        sourceMode: "webhook"
      }
    }];
  }).slice(-RECENT_SIGNAL_LIMIT);
}

function mockMessagesFromBody(body, env = process.env) {
  const rawItems = Array.isArray(body?.texts) ? body.texts : body?.text != null ? [body.text] : [];
  return rawItems.slice(-RECENT_SIGNAL_LIMIT).map((item, index) => {
    const source = typeof item === "string" ? { text: item } : item || {};
    return {
      rawText: source.text || source.raw_text || "",
      options: {
        channelId: source.channel_id || "mock-channel",
        channelUsername: source.channel_username || env.TELEGRAM_TARGET_CHANNEL || DEFAULT_CHANNEL_USERNAME,
        messageId: source.message_id,
        signalTime: source.time || source.timestamp,
        sourceMode: "mock",
        mockIndex: index
      }
    };
  }).filter((item) => normalizeText(item.rawText));
}

async function collectTelegramSignals({ mode, payload, store = createStoreFromEnv(), env = process.env }) {
  const inputs = mode === "webhook"
    ? telegramMessagesFromUpdate(payload, env)
    : mockMessagesFromBody(payload, env);
  const signals = inputs.map((input) => parseTelegramSignal(input.rawText, input.options));
  const writeResult = await store.upsertMany(signals);
  const recent = await store.listRecent(RECENT_SIGNAL_LIMIT);
  return {
    mode,
    target_channel: normalizeChannelUsername(env.TELEGRAM_TARGET_CHANNEL || DEFAULT_CHANNEL_USERNAME),
    received: inputs.length,
    parsed: signals.filter((signal) => signal.parse_status === "parsed").length,
    low_confidence: signals.filter((signal) => signal.confidence < 0.5).length,
    stored: writeResult.inserted,
    duplicates: writeResult.duplicates,
    storage: store.name,
    signals,
    latest: recent
  };
}

async function collectPublicPreviewSignals({
  store = createStoreFromEnv(),
  env = process.env,
  fetchImpl = fetch
} = {}) {
  const channelUsername = env.TELEGRAM_TARGET_CHANNEL || DEFAULT_CHANNEL_USERNAME;
  const sourceUrl = `https://t.me/s/${encodeURIComponent(channelUsername)}`;
  const previewSources = [
    { name: "telegram_public_preview", url: sourceUrl, format: "html", timeout: 10_000 },
    {
      name: "jina_fresh_reader",
      url: `https://r.jina.ai/${sourceUrl}`,
      format: "markdown",
      timeout: 25_000,
      headers: {
        accept: "text/plain",
        "x-cache-tolerance": "0",
        "x-engine": "browser",
        "x-no-cache": "true"
      }
    },
    {
      name: "telegram_alternate_preview",
      url: `https://telegram.me/s/${encodeURIComponent(channelUsername)}`,
      format: "html",
      timeout: 8_000
    }
  ];
  let inputs = [];
  let lastError = null;
  let selectedSource = null;
  const attempts = [];
  for (const previewSource of previewSources) {
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(previewSource.url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Mozilla/5.0 (compatible; AlphaRadar/1.0; +https://welinkbtc-onchainmain.xyz)",
          ...previewSource.headers
        },
        signal: AbortSignal.timeout(previewSource.timeout)
      });
      if (!response.ok) throw new Error(`Telegram public preview failed (${response.status})`);
      const body = await response.text();
      if (body.length > 2_000_000) throw new Error("Telegram public preview response is too large");
      inputs = previewSource.format === "markdown"
        ? publicPreviewMessagesFromMarkdown(body, env)
        : publicPreviewMessagesFromHtml(body, env);
      if (inputs.length) {
        selectedSource = previewSource;
        attempts.push({ source: previewSource.name, ok: true, duration_ms: Date.now() - startedAt, messages: inputs.length });
        break;
      }
      lastError = new Error("Telegram public preview returned no parseable messages");
      attempts.push({ source: previewSource.name, ok: false, duration_ms: Date.now() - startedAt, error: lastError.message });
    } catch (error) {
      lastError = error;
      attempts.push({
        source: previewSource.name,
        ok: false,
        duration_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  if (!inputs.length) {
    const error = lastError || new Error("Telegram public preview returned no parseable messages");
    error.attempts = attempts;
    throw error;
  }
  const signals = inputs.map((input) => parseTelegramSignal(input.rawText, input.options));
  let writeResult = { inserted: 0, duplicates: 0 };
  let storageError = null;
  let recent = [...signals]
    .sort((left, right) => new Date(right.signal_time) - new Date(left.signal_time))
    .slice(0, RECENT_SIGNAL_LIMIT);
  try {
    writeResult = await store.upsertMany(signals);
    const storedRecent = await store.listRecent(RECENT_SIGNAL_LIMIT);
    if (storedRecent.length) recent = storedRecent;
  } catch (error) {
    storageError = error instanceof Error ? error.message : String(error);
  }

  return {
    mode: PUBLIC_PREVIEW_SOURCE_MODE,
    source_url: selectedSource?.url || sourceUrl,
    source_kind: selectedSource?.name || "unknown",
    canonical_source_url: sourceUrl,
    attempts,
    target_channel: normalizeChannelUsername(channelUsername),
    received: inputs.length,
    parsed: signals.filter((signal) => signal.parse_status === "parsed").length,
    low_confidence: signals.filter((signal) => signal.confidence < 0.5).length,
    stored: writeResult.inserted,
    duplicates: writeResult.duplicates,
    storage: store.name,
    storage_degraded: Boolean(storageError),
    storage_error: storageError,
    signals,
    latest: recent
  };
}

module.exports = {
  DEFAULT_CHANNEL_USERNAME,
  PUBLIC_PREVIEW_SOURCE_MODE,
  RECENT_SIGNAL_LIMIT,
  SIGNAL_COLLECTION,
  SIGNAL_FEED_COLLECTION,
  BlobSignalStore,
  MemorySignalStore,
  SupabaseSignalStore,
  collectTelegramSignals,
  collectPublicPreviewSignals,
  createStoreFromEnv,
  makeDedupeHash,
  matchesTargetChannel,
  mockMessagesFromBody,
  normalizeText,
  parseTelegramSignal,
  publicPreviewMessagesFromHtml,
  publicPreviewMessagesFromMarkdown,
  telegramHtmlToText,
  telegramMessagesFromUpdate
};
