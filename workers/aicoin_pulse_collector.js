const { createHash, timingSafeEqual } = require("node:crypto");
const { load } = require("cheerio");
const { telegramHtmlToText } = require("./telegram_signal_collector");

const AICOIN_CHANNEL = "aicoin2021";
const AICOIN_SOURCE_URL = `https://t.me/${AICOIN_CHANNEL}`;
const AICOIN_PREVIEW_URL = `https://t.me/s/${AICOIN_CHANNEL}`;
const AICOIN_SNAPSHOT_PATH = "aicoin-pulse/latest.json";
const SNAPSHOT_SCHEMA_VERSION = 2;
const RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const MAX_SNAPSHOT_ITEMS = 180;

const EVENT_WEIGHTS = {
  "Security Incident": 88,
  "TGE / Listing": 86,
  "Regulatory / Legal Event": 82,
  "Institutional Adoption": 80,
  "Macroeconomics": 78,
  "Market Movement": 76,
  "New Product / Upgrade": 75,
  "Mainnet / Testnet": 74,
  "Token Unlock": 73,
  Fundraising: 72,
  "Market Update": 66
};

const PROMOTIONAL_LINE_PATTERNS = [
  /(?:PC\s*&\s*App|App)\s*下载/i,
  /注册\s*(?:OKX|币安|Binance|交易所).*?(?:返|减免|优惠)/i,
  /手续费\s*(?:返|减免|优惠)/i,
  /(?:邀请码|返佣|推广合作|商务合作|加入.*群|联系客服|限时优惠|立即领取)/i,
  /(?:上|升级|开通)\s*PRO\b/i,
  /AiCoin\s*PRO[「“\s]/i,
  /点击(?:这里|链接)?.{0,12}(?:下载|注册|购买|领取)/i
];

const PROMOTIONAL_TITLE_PATTERNS = [
  /(?:PC\s*&\s*App|App)\s*下载/i,
  /注册\s*(?:OKX|币安|Binance|交易所)/i,
  /手续费\s*(?:返|减免|优惠)/i,
  /(?:邀请码|返佣|推广合作|商务合作|限时优惠|立即领取)/i,
  /(?:上|升级|开通)\s*PRO\b/i
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleFingerprint(value) {
  return normalizeText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "")
    .slice(0, 180);
}

function stableFingerprint(value) {
  return createHash("sha256").update(titleFingerprint(value)).digest("hex");
}

function stripPromotionalLines(value) {
  return normalizeText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !PROMOTIONAL_LINE_PATTERNS.some((pattern) => pattern.test(line)))
    .join("\n")
    .trim();
}

function isAdvertisement({ title, text }) {
  const normalizedTitle = normalizeText(title);
  const normalizedText = normalizeText(text);
  if (!normalizedText || titleFingerprint(normalizedText).length < 8) return true;
  if (PROMOTIONAL_TITLE_PATTERNS.some((pattern) => pattern.test(normalizedTitle))) return true;

  const lines = normalizedText.split("\n").filter(Boolean);
  const promotionalLines = lines.filter((line) => PROMOTIONAL_LINE_PATTERNS.some((pattern) => pattern.test(line)));
  return lines.length > 0 && promotionalLines.length === lines.length;
}

function extractTitle(value) {
  const text = normalizeText(value);
  const bracketed = text.match(/^[〖【\[]\s*([^〗】\]]{4,160})\s*[〗】\]]/);
  if (bracketed) return bracketed[1].trim();
  const firstLine = text.split("\n")[0] || "";
  const firstSentence = firstLine.split(/[。！？!?]/)[0] || firstLine;
  return firstSentence.trim().slice(0, 100);
}

function summarize(value, title) {
  let text = stripPromotionalLines(value);
  text = text.replace(/^[〖【\[]\s*[^〗】\]]{4,160}\s*[〗】\]]\s*/, "").trim();
  if (text === title) return "";
  if (text.length <= 280) return text;
  return `${text.slice(0, 277).trimEnd()}…`;
}

function restoreChinesePunctuation(value) {
  const text = normalizeText(value);
  if (!/\p{Script=Han}/u.test(text)) return text;
  return text.replace(/([\p{Script=Han}]),(?=\S)/gu, "$1，");
}

function classifyAicoinItem(value) {
  const text = normalizeText(value).toLowerCase();
  if (/(黑客|攻击|被盗|漏洞|exploit|hack|breach|phishing|钓鱼)/i.test(text)) return "Security Incident";
  if (/(上线|上市|新增交易|交易对|list(?:ed|ing)|\btge\b|launchpad)/i.test(text)) return "TGE / Listing";
  if (/(解锁|unlock|vesting|释放代币)/i.test(text)) return "Token Unlock";
  if (/(sec\b|cftc\b|监管|立法|法案|法院|诉讼|征税|合规|clarity\s+act|crypto\s+act|regulat|lawsuit|court)/i.test(text)) return "Regulatory / Legal Event";
  if (/(美联储|利率|降息|加息|通胀|cpi\b|ppi\b|非农|央行|federal reserve|macro)/i.test(text)) return "Macroeconomics";
  if (/(etf\b|银行|机构|储备|托管|结算|支付|stablecoin|稳定币|institution|custody)/i.test(text)) return "Institutional Adoption";
  if (/(融资|募资|投资|收购|并购|fundrais|financ|acqui)/i.test(text)) return "Fundraising";
  if (/(主网|测试网|mainnet|testnet)/i.test(text)) return "Mainnet / Testnet";
  if (/(发布|推出|升级|产品|协议|合作|launch|upgrade|partnership)/i.test(text)) return "New Product / Upgrade";
  if (/(涨|跌|突破|价格|成交量|资金费率|爆仓|强平|持仓|巨鲸|多单|空单|行情|波动)/i.test(text)) return "Market Movement";
  return "Market Update";
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

function scoreAicoinItem(item, now = Date.now()) {
  const publishedAt = validDate(item?.publishedAt || item?.published_at);
  const ageHours = publishedAt ? Math.max(0, (now - publishedAt.getTime()) / 3_600_000) : 120;
  const text = `${item?.title || ""} ${item?.summary || ""}`;
  let score = EVENT_WEIGHTS[item?.eventType] ?? EVENT_WEIGHTS["Market Update"];

  if (ageHours <= 2) score += 10;
  else if (ageHours <= 6) score += 8;
  else if (ageHours <= 24) score += 5;
  else if (ageHours <= 72) score += 2;
  else score -= Math.floor(ageHours / 24) * 2;

  if (/(Binance|Coinbase|OKX|Upbit|SEC|CFTC|ETF|美联储|央行|交易所)/i.test(text)) score += 4;
  if (/(\$|美元|亿|万|%|倍|基点)/i.test(text)) score += 3;
  if (/(确认|通过|批准|正式|上线|攻击|被盗|突破|解锁)/i.test(text)) score += 3;
  return clamp(Math.round(score), 0, 100);
}

function normalizeAicoinMessage(message, now = Date.now()) {
  const publishedAt = validDate(message?.publishedAt);
  if (!message?.messageId || !publishedAt || now - publishedAt.getTime() > RETENTION_MS) return null;
  const cleanedText = stripPromotionalLines(message.text);
  const title = extractTitle(cleanedText);
  if (!title || isAdvertisement({ title, text: message.text })) return null;
  const summary = summarize(cleanedText, title);
  const eventType = classifyAicoinItem(`${title}\n${summary}`);
  const url = `https://t.me/${AICOIN_CHANNEL}/${message.messageId}`;
  const normalized = {
    id: `${AICOIN_CHANNEL}-${message.messageId}`,
    externalId: String(message.messageId),
    dedupeKey: stableFingerprint(title),
    sourceType: "telegram",
    sourceName: "AiCoin Telegram",
    eventType,
    url,
    surfUrl: AICOIN_SOURCE_URL,
    sourceHubUrl: AICOIN_SOURCE_URL,
    sourceHubName: "Telegram",
    title,
    summary,
    sourceCount: 1,
    project: {
      id: "aicoin",
      name: "AiCoin",
      slug: "aicoin",
      image: "",
      isListed: false
    },
    publishedAt: publishedAt.toISOString(),
    ...freshnessFor(publishedAt, now)
  };
  normalized.score = scoreAicoinItem(normalized, now);
  return normalized;
}

function upgradeCachedAicoinItem(item, now = Date.now()) {
  const title = restoreChinesePunctuation(item?.title);
  const summary = restoreChinesePunctuation(item?.summary);
  const publishedAt = validDate(item?.publishedAt);
  if (!item?.id || !title || !publishedAt || now - publishedAt.getTime() > RETENTION_MS) return null;
  const upgraded = {
    ...item,
    title,
    summary,
    dedupeKey: stableFingerprint(title),
    eventType: classifyAicoinItem(`${title}\n${summary}`),
    ...freshnessFor(publishedAt, now)
  };
  upgraded.score = scoreAicoinItem(upgraded, now);
  return upgraded;
}

function parseAicoinPreviewHtml(html, now = Date.now()) {
  const $ = load(String(html || ""));
  const messages = [];
  $(".tgme_widget_message").each((_, element) => {
    const node = $(element);
    const identity = String(node.attr("data-post") || "").match(/^([^/]+)\/(\d+)$/);
    if (!identity || identity[1].toLowerCase() !== AICOIN_CHANNEL) return;
    const textNode = node.find(".tgme_widget_message_text").first();
    const timeNode = node.find("time[datetime]").first();
    const text = telegramHtmlToText(textNode.html() || textNode.text());
    if (!text) return;
    messages.push({
      messageId: identity[2],
      publishedAt: timeNode.attr("datetime"),
      text
    });
  });

  const filtered = [];
  let filteredAds = 0;
  for (const message of messages) {
    const normalized = normalizeAicoinMessage(message, now);
    if (!normalized) {
      filteredAds += 1;
      continue;
    }
    filtered.push(normalized);
  }
  return { received: messages.length, filteredAds, items: filtered };
}

function mergeAicoinItems(...collections) {
  const byId = new Map();
  const byTitle = new Map();
  const all = collections.flat().filter(Boolean)
    .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
  for (const item of all) {
    const id = String(item.id || "");
    const fingerprint = item.dedupeKey || stableFingerprint(item.title);
    if (!id || byId.has(id) || byTitle.has(fingerprint)) continue;
    byId.set(id, item);
    byTitle.set(fingerprint, item);
  }
  return [...byId.values()];
}

class MemoryAicoinPulseStore {
  constructor(snapshot = null) {
    this.name = "memory";
    this.snapshot = snapshot;
  }

  async readSnapshot() {
    return this.snapshot;
  }

  async writeSnapshot(snapshot) {
    this.snapshot = snapshot;
    return snapshot;
  }
}

class BlobAicoinPulseStore {
  constructor(blobClient) {
    this.name = "vercel-blob";
    this.blobClient = blobClient;
  }

  async readSnapshot() {
    try {
      const listing = await this.blobClient.list({ prefix: AICOIN_SNAPSHOT_PATH, limit: 1 });
      const blob = listing.blobs.find((entry) => entry.pathname === AICOIN_SNAPSHOT_PATH);
      if (!blob) return null;
      const response = await fetch(blob.url, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  async writeSnapshot(snapshot) {
    await this.blobClient.put(AICOIN_SNAPSHOT_PATH, JSON.stringify(snapshot), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
    return snapshot;
  }
}

function createAicoinPulseStore(env = process.env) {
  if (env.BLOB_READ_WRITE_TOKEN) return new BlobAicoinPulseStore(require("@vercel/blob"));
  return new MemoryAicoinPulseStore();
}

async function fetchAicoinPreview({ fetchImpl = fetch } = {}) {
  const attempts = [];
  const sources = [
    AICOIN_PREVIEW_URL,
    `https://telegram.me/s/${AICOIN_CHANNEL}`
  ];
  let lastError = null;
  for (const url of sources) {
    const startedAt = Date.now();
    try {
      const response = await fetchImpl(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Mozilla/5.0 (compatible; AlphaRadar-AiCoin/1.0; +https://welinkbtc-onchainmain.xyz)"
        },
        signal: AbortSignal.timeout(12_000)
      });
      if (!response.ok) throw new Error(`AiCoin Telegram preview failed (${response.status})`);
      const html = await response.text();
      if (html.length > 2_000_000) throw new Error("AiCoin Telegram preview response is too large");
      attempts.push({ url, ok: true, durationMs: Date.now() - startedAt });
      return { html, sourceUrl: url, attempts };
    } catch (error) {
      lastError = error;
      attempts.push({
        url,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const error = lastError || new Error("AiCoin Telegram preview is unavailable");
  error.attempts = attempts;
  throw error;
}

async function syncAicoinPulse({
  store = createAicoinPulseStore(),
  fetchImpl = fetch,
  now = Date.now()
} = {}) {
  const [cached, preview] = await Promise.all([
    store.readSnapshot(),
    fetchAicoinPreview({ fetchImpl })
  ]);
  const parsed = parseAicoinPreviewHtml(preview.html, now);
  const retainedCached = (Array.isArray(cached?.items) ? cached.items : [])
    .map((item) => upgradeCachedAicoinItem(item, now))
    .filter(Boolean);
  const merged = mergeAicoinItems(parsed.items, retainedCached).slice(0, MAX_SNAPSHOT_ITEMS);
  const snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    source: "AiCoin Telegram",
    sourceUrl: AICOIN_SOURCE_URL,
    fetchedAt: new Date(now).toISOString(),
    syncIntervalMs: SYNC_INTERVAL_MS,
    retentionDays: Math.round(RETENTION_MS / 86_400_000),
    received: parsed.received,
    filteredAds: parsed.filteredAds,
    added: mergeAicoinItems(parsed.items).filter((item) => !retainedCached.some((cachedItem) => cachedItem.id === item.id)).length,
    count: merged.length,
    items: merged
  };
  await store.writeSnapshot(snapshot);
  return { ...snapshot, storage: store.name, attempts: preview.attempts };
}

async function getAicoinPulseSnapshot({
  store = createAicoinPulseStore(),
  fetchImpl = fetch,
  now = Date.now(),
  refreshIfStale = true
} = {}) {
  const cached = await store.readSnapshot();
  const fetchedAt = validDate(cached?.fetchedAt);
  const fresh = fetchedAt && now - fetchedAt.getTime() < SYNC_INTERVAL_MS;
  const currentSchema = Number(cached?.schemaVersion) === SNAPSHOT_SCHEMA_VERSION;
  if (cached?.items?.length && currentSchema && (fresh || !refreshIfStale)) {
    return { ...cached, storage: store.name, stale: !fresh };
  }
  try {
    return await syncAicoinPulse({ store, fetchImpl, now });
  } catch (error) {
    if (cached?.items?.length) {
      return {
        ...cached,
        storage: store.name,
        stale: true,
        refreshError: error instanceof Error ? error.message : String(error)
      };
    }
    throw error;
  }
}

function authorizedCronRequest(request, env = process.env) {
  const expected = String(env.CRON_SECRET || "");
  const provided = String(request?.headers?.authorization || request?.headers?.Authorization || "");
  if (!expected || !provided.startsWith("Bearer ")) return false;
  const expectedBuffer = Buffer.from(`Bearer ${expected}`);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

module.exports = {
  AICOIN_CHANNEL,
  AICOIN_PREVIEW_URL,
  AICOIN_SNAPSHOT_PATH,
  AICOIN_SOURCE_URL,
  MAX_SNAPSHOT_ITEMS,
  RETENTION_MS,
  SNAPSHOT_SCHEMA_VERSION,
  SYNC_INTERVAL_MS,
  BlobAicoinPulseStore,
  MemoryAicoinPulseStore,
  authorizedCronRequest,
  classifyAicoinItem,
  createAicoinPulseStore,
  extractTitle,
  fetchAicoinPreview,
  freshnessFor,
  getAicoinPulseSnapshot,
  isAdvertisement,
  mergeAicoinItems,
  normalizeAicoinMessage,
  parseAicoinPreviewHtml,
  scoreAicoinItem,
  stableFingerprint,
  stripPromotionalLines,
  syncAicoinPulse,
  titleFingerprint,
  upgradeCachedAicoinItem
};
