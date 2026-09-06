import "server-only";
import type {
  SquareRadarCategory,
  SquareRadarCoin,
  SquareRadarCreator,
  SquareRadarDashboard,
  SquareRadarSnapshot,
} from "./binance-square-radar-types";

const RADAR_ORIGIN = "https://binancesquareradar.qianyuwing.com";
const FETCH_TIMEOUT_MS = 8_000;
const REVALIDATE_SECONDS = 15;
const MAX_CREATORS = 500;
const MAX_COINS_PER_CREATOR = 8;
const AVATAR_HOSTS = new Set(["public.bnbstatic.com", "bin.bnbstatic.com", "public.nftstatic.com"]);
const BINANCE_HOSTS = new Set(["www.binance.com", "binance.com"]);

let lastGoodSnapshot: SquareRadarSnapshot | null = null;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function number(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function safeUrl(value: unknown, allowedHosts: ReadonlySet<string>): string {
  const candidate = text(value, 800);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && allowedHosts.has(parsed.hostname) ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function binanceUrl(value: unknown): string {
  return safeUrl(value, BINANCE_HOSTS);
}

function normalizeCoin(value: unknown): SquareRadarCoin | null {
  const item = record(value);
  const coin = text(item.coin, 24);
  if (!coin) return null;
  const rawChange = typeof item.change === "number" ? item.change : Number(item.change);
  return {
    coin,
    type: text(item.type, 24),
    webLink: binanceUrl(item.web_link),
    isPinned: boolean(item.is_pin),
    change: Number.isFinite(rawChange) ? rawChange : null,
    price: text(item.price, 40),
  };
}

function normalizeCreator(value: unknown): SquareRadarCreator | null {
  const item = record(value);
  const id = text(item.id, 96);
  const name = text(item.name, 96);
  if (!id || !name) return null;
  const categoryIds = Array.isArray(item.category_ids)
    ? item.category_ids.map((entry) => text(entry, 96)).filter(Boolean).slice(0, 12)
    : [];
  const fallbackCategory = text(item.category_id, 96);
  if (!categoryIds.length && fallbackCategory) categoryIds.push(fallbackCategory);

  return {
    id,
    name,
    avatar: safeUrl(item.avatar, AVATAR_HOSTS),
    squareUid: text(item.square_uid, 128),
    profileUrl: binanceUrl(item.profile_url),
    categoryIds,
    recommended: boolean(item.recommended),
    featured: boolean(item.featured),
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => text(tag, 40)).filter(Boolean).slice(0, 12) : [],
    isLive: boolean(item.is_live),
    liveId: text(item.live_id, 80),
    liveTitle: text(item.live_title, 220),
    webLink: binanceUrl(item.web_link),
    onlineNow: number(item.online_now),
    maxOnline: number(item.max_online),
    viewers: number(item.viewers),
    chatCount: number(item.chat_count),
    tipAmount: number(item.tip_amount),
    subscribeCount: number(item.subscribe_count),
    hasRedBox: boolean(item.has_red_box),
    isVideo: boolean(item.is_video),
    coins: Array.isArray(item.coins)
      ? item.coins.map(normalizeCoin).filter((coin): coin is SquareRadarCoin => Boolean(coin)).slice(0, MAX_COINS_PER_CREATOR)
      : [],
    liveStartAt: number(item.live_start_at) || null,
  };
}

function normalizeCategory(value: unknown): SquareRadarCategory | null {
  const item = record(value);
  const id = text(item.id, 96);
  const name = text(item.name, 48);
  return id && name ? { id, name, sort: number(item.sort) } : null;
}

function normalizeDashboard(value: unknown, creators: SquareRadarCreator[]): SquareRadarDashboard {
  const item = record(value);
  const liveCreators = creators.filter((creator) => creator.isLive);
  return {
    liveCount: number(item.live_count) || liveCreators.length,
    totalCreators: number(item.total_creators) || creators.length,
    totalOnline: number(item.total_online) || liveCreators.reduce((sum, creator) => sum + creator.onlineNow, 0),
    totalView: number(item.total_view) || creators.reduce((sum, creator) => sum + creator.viewers, 0),
    totalChat: number(item.total_chat) || creators.reduce((sum, creator) => sum + creator.chatCount, 0),
    totalSubscribe: number(item.total_subscribe) || creators.reduce((sum, creator) => sum + creator.subscribeCount, 0),
    totalTip: number(item.total_tip) || creators.reduce((sum, creator) => sum + creator.tipAmount, 0),
  };
}

async function fetchJson(pathname: "/api/creators" | "/api/dashboard" | "/api/categories"): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${RADAR_ORIGIN}${pathname}`, {
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function emptySnapshot(notice: string): SquareRadarSnapshot {
  return {
    creators: [],
    categories: [],
    dashboard: normalizeDashboard({}, []),
    fetchedAt: new Date().toISOString(),
    source: `${RADAR_ORIGIN}/#/creators`,
    degraded: true,
    notice,
  };
}

export async function getBinanceSquareSnapshot(): Promise<SquareRadarSnapshot> {
  const [creatorResult, dashboardResult, categoryResult] = await Promise.allSettled([
    fetchJson("/api/creators"),
    fetchJson("/api/dashboard"),
    fetchJson("/api/categories"),
  ]);

  const creators = creatorResult.status === "fulfilled" && Array.isArray(creatorResult.value)
    ? creatorResult.value.map(normalizeCreator).filter((creator): creator is SquareRadarCreator => Boolean(creator)).slice(0, MAX_CREATORS)
    : [];
  const categories = categoryResult.status === "fulfilled" && Array.isArray(categoryResult.value)
    ? categoryResult.value.map(normalizeCategory).filter((category): category is SquareRadarCategory => Boolean(category)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-CN"))
    : [];

  if (!creators.length) {
    if (lastGoodSnapshot) {
      return {
        ...lastGoodSnapshot,
        degraded: true,
        notice: "实时源暂时不可用，当前展示最近一次成功快照。",
      };
    }
    return emptySnapshot("实时源暂时不可用，请稍后刷新。");
  }

  const snapshot: SquareRadarSnapshot = {
    creators,
    categories,
    dashboard: normalizeDashboard(dashboardResult.status === "fulfilled" ? dashboardResult.value : {}, creators),
    fetchedAt: new Date().toISOString(),
    source: `${RADAR_ORIGIN}/#/creators`,
    degraded: dashboardResult.status === "rejected" || categoryResult.status === "rejected",
    notice: dashboardResult.status === "rejected" || categoryResult.status === "rejected"
      ? "部分汇总字段暂不可用，主播列表仍为实时数据。"
      : "",
  };
  lastGoodSnapshot = snapshot;
  return snapshot;
}
