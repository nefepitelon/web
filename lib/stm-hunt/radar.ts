import "server-only";
import { getCache } from "@vercel/functions";
import { isDatabaseConfigured } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeStmRoster, stmAsset, stmNumber, stmPublicUrl, stmTimestamp } from "./sources";
import type { StmHolding, StmRadarBoard, StmRadarPeriod, StmRadarTrader, StmRadarVenue, StmResearchActivity, StmSource, StmTraderResearch } from "./types";

type Obj = Record<string, any>;
const object = (v: unknown): Obj => v && typeof v === "object" && !Array.isArray(v) ? v as Obj : {};
const list = (v: unknown): Obj[] => Array.isArray(v) ? v.filter(v => v && typeof v === "object" && !Array.isArray(v)) : [];
const text = (v: unknown, fallback = "") => typeof v === "string" ? v.slice(0, 256) : fallback;
const nonnegative = (v: unknown) => { const n = stmNumber(v); return n !== null && n >= 0 ? n : null; };
const address = (v: unknown) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : null;
const solAddress = (v: unknown) => typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v) ? v : null;
const handle = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_]{1,64}$/.test(v) ? v : null;
const fomoUid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : null;
const wsmFomoReference = (v: string) => /^wsm:fomo:[A-Za-z0-9_-]{1,100}$/.test(v);
const periods: StmRadarPeriod[] = ["24h", "7d", "30d", "all"];
const MONITOR = "https://985monitor.xyz";
const LIGHTER = "https://mainnet.zklighter.elliot.ai/api/v1";
const HL_INFO = "https://api.hyperliquid.xyz/info";
const HL_BOARD = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
const WSM = "https://web3smartmoney.com";
const cache = getCache({ namespace: "welinkbtc-main:stm-radar:v2" });
type Entry<T> = { value: T; checkedAt: string; attemptedAt: string; error: string | null };
const memory = new Map<string, Entry<unknown>>(), flights = new Map<string, Promise<Entry<unknown>>>();
const failures = new Map<string, { at: number; error: string }>();
let budgetAt = 0, budgetCount = 0, active = 0;
function message(error: unknown) { return error instanceof Error && /^HTTP \d+$|^来源响应|^公开接口|^请求预算|^来源业务|^实时/.test(error.message) ? error.message : "公开接口暂时无法连接"; }
async function publicJson(url: string, body?: unknown, maxBytes = 12_000_000, ifNoneMatch?: string, timeoutMs = 10000, retryTransport = true): Promise<{ data: Obj; modifiedAt: string | null; etag?: string | null; notModified?: boolean }> {
  // All callers construct URLs on the fixed provider origins below. No arbitrary URL proxy.
  if (Date.now() - budgetAt > 60000) { budgetAt = Date.now(); budgetCount = 0; }
  if (++budgetCount > 100 || active >= 12) throw new Error("请求预算已用完，请稍后重试");
  active++;
  try {
    if (isDatabaseConfigured() && !(await checkRateLimit("stm:research:upstream", 180, 60000)).allowed) throw new Error("请求预算已用完，请稍后重试");
    let response: Response | undefined;
    const attempts = retryTransport && !body && new URL(url).origin === MONITOR ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        response = await fetch(url, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined,
          headers: { Accept: "application/json", "Cache-Control": "no-cache", Pragma: "no-cache", ...(body ? { "Content-Type": "application/json" } : {}), ...(ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}) },
          signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" });
        break;
      } catch (error) { if (attempt + 1 === attempts) throw error; }
    }
    if (!response) throw new Error("公开接口暂时无法连接");
    if (response.status === 304 && ifNoneMatch) return { data: {}, modifiedAt: null, etag: ifNoneMatch, notModified: true };
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes) { await response.body?.cancel(); throw new Error("来源响应过大"); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("来源响应为空");
    const decoder = new TextDecoder(); let content = "", size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error("来源响应过大"); }
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    const parsed: unknown = JSON.parse(content), data = Array.isArray(parsed) ? { __array: parsed } : object(parsed);
    // HTTP Date is delivery time, never the provider's data generation time.
    const modified = response.headers.get("last-modified");
    const modifiedAt = modified && Number.isFinite(Date.parse(modified)) ? new Date(Date.parse(modified)).toISOString() : null;
    const etag = response.headers.get("etag");
    return { data, modifiedAt, etag: etag && etag.length <= 256 ? etag : null };
  } finally { active--; }
}
async function cached<T>(key: string, refresh: boolean, work: (previous?: T) => Promise<T>, ttlMs = 30000, minimumRefreshMs = 15000): Promise<Entry<T>> {
  const valid = (v: Entry<T> | null | undefined) => v && Date.parse(v.attemptedAt) <= Date.now() && Date.now() - Date.parse(v.attemptedAt) < (refresh ? minimumRefreshMs : ttlMs);
  let prior = memory.get(key) as Entry<T> | undefined;
  if (valid(prior)) return prior!;
  const failed = failures.get(key);
  if (!prior && failed && Date.now() - failed.at < 15000) throw new Error(failed.error);
  if (flights.has(key)) return flights.get(key)! as Promise<Entry<T>>;
  const flight = (async () => {
    const shared = await cache.get(key).catch(() => null) as Entry<T> | null;
    if (valid(shared)) { memory.set(key, shared!); return shared!; }
    if (shared && (!prior || Date.parse(shared.checkedAt) > Date.parse(prior.checkedAt))) prior = shared;
    if (!prior) {
      const rejected = await cache.get(`failed:${key}`).catch(() => null) as { at: number; error: string } | null;
      if (rejected && rejected.at <= Date.now() && Date.now() - rejected.at < 15000) throw new Error(rejected.error);
    }
    const attemptedAt = new Date().toISOString(); let result: Entry<T>;
    try { result = { value: await work(prior?.value), checkedAt: attemptedAt, attemptedAt, error: null }; }
    catch (error) {
      if (!prior) {
        const failure = { at: Date.now(), error: message(error) };
        if (failures.size >= 250) failures.delete(failures.keys().next().value!);
        failures.set(key, failure); await cache.set(`failed:${key}`, failure, { ttl: 15 }).catch(() => undefined);
        throw error;
      }
      result = { ...prior, attemptedAt, error: message(error) };
    }
    if (memory.size >= 250) memory.delete(memory.keys().next().value!);
    memory.set(key, result); await cache.set(key, result, { ttl: 600 }).catch(() => undefined);
    if (!result.error) failures.delete(key);
    return result;
  })();
  flights.set(key, flight as Promise<Entry<unknown>>);
  try { return await flight; } finally { flights.delete(key); }
}
function source(id: string, name: string, url: string, checkedAt: string, updatedAt: string | null, count: number, detail: string, maxAgeMs = 6 * 3600000): StmSource {
  const age = updatedAt ? Date.now() - Date.parse(updatedAt) : null;
  return { id, name, url, checkedAt, fetchedAt: checkedAt, updatedAt, count, latencyMs: 0, semantics: "snapshot",
    status: age !== null && (age > maxAgeMs || age < -60000) ? "stale" : "ok", message: detail,
    sourceAgeSeconds: age === null ? null : Math.max(0, Math.floor(age / 1000)), checkIntervalSeconds: 30,
    timestampBasis: updatedAt ? "source" : "unknown" };
}
function baseTrader(id: string, venue: StmRadarVenue, name: string, checkedAt: string): StmRadarTrader {
  return { id, source: `research-${venue}`, venue, name, address: null, pnlUsd: null, roi: null, winRate: null,
    pnlWindow: "来源未说明", updatedAt: null, sourceUpdatedAt: null, fetchedAt: checkedAt, holdings: [], visibility: "empty", tags: ["公开研究"], qualified: false,
    socialLinks: [], wallets: [], chains: [], avatarUrl: null, handle: null, profileUrl: null, holdingsCount: null, totalValueUsd: null };
}
export function normalizeFomoBoards(raw: unknown, checkedAt: string): Record<StmRadarPeriod, StmRadarBoard> {
  const data = object(raw), updatedAt = stmTimestamp(data.updatedAt), boards = object(data.boards);
  if (!data.boards || !periods.every(period => Array.isArray(boards[period]))) throw new Error("来源响应缺少分周期榜单");
  return Object.fromEntries(periods.map(period => {
    const traders = list(boards[period]).slice(0, 100).flatMap(row => {
      const uid = text(row.uid), exactHandle = handle(row.handle); if (!uid || !exactHandle) return [];
      const twitter = handle(text(row.twitter).replace(/^@/, ""));
      return [{ ...baseTrader(`fomo:${uid}`, "fomo", text(row.name, exactHandle), checkedAt),
        source: "985-fomo", handle: exactHandle, fomoHandle: exactHandle, fomoUid: fomoUid(uid), detailReference: exactHandle, profileUrl: `https://fomo.family/profile/${encodeURIComponent(exactHandle)}`,
        avatarUrl: stmPublicUrl(row.avatar), rank: nonnegative(row.rank), pnlUsd: stmNumber(row.pnl), pnlWindow: period,
        followers: nonnegative(row.followers), tradeCount: nonnegative(row.numTrades), volumeUsd: nonnegative(row.volume), statsScope: "unknown" as const,
        sourceUpdatedAt: updatedAt, socialLinks: twitter ? [{ label: "X", url: `https://x.com/${twitter}` }] : [],
        fieldSources: { rank: { sourceId: "985-fomo", updatedAt }, pnl: { sourceId: "985-fomo", updatedAt }, profile: { sourceId: "985-fomo", updatedAt: null } } }];
    });
    const s = source("985-fomo", "985monitor FOMO 分周期快照", `${MONITOR}/fomo-leaderboards.json`, checkedAt, updatedAt, traders.length,
      `第三方公开快照；leaderboardSource=${text(data.leaderboardSource, "未说明")}；刷新检查不改变上游日期`);
    return [period, { venue: "fomo", period, traders, source: s, checkedAt, refreshAfterSeconds: 15, researchOnly: true,
      limitations: ["FOMO 官方榜单接口需要登录授权；此处保留第三方明确提供的分周期排名。", "粉丝、交易次数和成交量未声明统计窗口，不作为本周期指标。", "榜单不提供当前持仓；点击资料后仅通过确切钱包关联历史持仓。"] }];
  })) as Record<StmRadarPeriod, StmRadarBoard>;
}
export function normalizeHlBoards(raw: unknown, checkedAt: string, modifiedAt: string | null): Record<StmRadarPeriod, StmRadarBoard> {
  const data = object(raw), windows: Record<StmRadarPeriod, string> = { "24h": "day", "7d": "week", "30d": "month", all: "allTime" };
  if (!Array.isArray(data.leaderboardRows)) throw new Error("来源响应缺少公开榜单");
  return Object.fromEntries(periods.map(period => {
    // Rank lightweight references first: the official file contains tens of
    // thousands of accounts, but public responses retain only 100 per window.
    const ranked = list(data.leaderboardRows).flatMap(row => {
      const wallet = address(row.ethAddress); if (!wallet) return [];
      const performance = object(Array.isArray(row.windowPerformances) ? row.windowPerformances.find((pair: unknown) => Array.isArray(pair) && pair[0] === windows[period])?.[1] : null);
      const pnl = stmNumber(performance.pnl); if (pnl === null) return [];
      return [{ row, wallet, pnl, performance }];
    }).sort((a, b) => b.pnl - a.pnl).slice(0, 100);
    const traders = ranked.map(({ row, wallet, pnl, performance }, index) => {
      const roi = stmNumber(performance.roi);
      return { ...baseTrader(`hl:${wallet}`, "hl", text(row.displayName, wallet), checkedAt), address: wallet,
        source: "hl-public", pnlUsd: pnl, roi: roi === null ? null : roi * 100, pnlWindow: period, volumeUsd: nonnegative(performance.vlm), statsScope: "period" as const,
        totalValueUsd: nonnegative(row.accountValue), totalValueLabel: "榜单账户权益", valueBasis: "account-equity" as const,
        profileUrl: `https://app.hyperliquid.xyz/explorer/address/${wallet}`, wallets: [{ chain: "hyperliquid", address: wallet, explorerUrl: `https://app.hyperliquid.xyz/explorer/address/${wallet}` }], sourceUpdatedAt: modifiedAt, rank: index + 1 };
    });
    return [period, { venue: "hl", period, traders, checkedAt, source: source("hl-public", "Hyperliquid 官方公开榜单", HL_BOARD, checkedAt, modifiedAt, traders.length, "官方 windowPerformances；按所选窗口 PnL 排名；仓位按需查询"),
      refreshAfterSeconds: 15, researchOnly: true, limitations: ["仅覆盖官方公开榜单返回的账户，并非全市场钱包。", "榜单未携带数据生成时间时保留未知；HTTP 检查时间不等于仓位时间。", "点击账户读取当前永续仓位和最多 2000 条公开成交；与 S1–S5 成交证据隔离。"] }];
  })) as Record<StmRadarPeriod, StmRadarBoard>;
}
export function normalizeLighterBoard(raw: unknown, period: StmRadarPeriod, checkedAt: string): StmRadarBoard {
  const data = object(raw), updatedAt = stmTimestamp(data.updated_at);
  if (data.code !== 200 || !Array.isArray(data.entries)) throw new Error("来源业务响应无效");
  const traders: StmRadarTrader[] = list(data.entries).slice(0, 100).flatMap(row => {
    const wallet = address(row.l1_address); if (!wallet) return [];
    return [{ ...baseTrader(`lighter:${wallet}`, "lighter", wallet, checkedAt), source: "lighter-public", address: wallet, pnlUsd: stmNumber(row.pnl), roi: stmNumber(row.roi), pnlWindow: period,
      rank: nonnegative(row.rank), volumeUsd: nonnegative(row.volume), statsScope: "period", totalValueUsd: nonnegative(row.account_value), totalValueLabel: "榜单账户权益", valueBasis: "account-equity",
      sourceUpdatedAt: updatedAt, profileUrl: "https://app.lighter.xyz/", wallets: [{ chain: "lighter", address: wallet, explorerUrl: `https://etherscan.io/address/${wallet}` }] }];
  });
  return { venue: "lighter", period, traders, checkedAt, refreshAfterSeconds: 15, researchOnly: true,
    source: source("lighter-public", "Lighter 官方公开收益榜", `${LIGHTER}/pnlLeaderboard?time_window=${period}`, checkedAt, updatedAt, traders.length, "官方周期收益榜；账户持仓按需查询"),
    limitations: ["官方榜单按上游 updated_at 更新；手动刷新不能强制重算上游。", "榜单权益与详情账户价值可能因快照时间不同而不同，仓位价值为杠杆名义金额。"] };
}
export function normalizeBinanceWeb3Board(raw: unknown, period: "7d" | "30d", checkedAt: string): StmRadarBoard {
  const response = object(raw), data = object(response.data);
  if (response.code !== "000000" || !Array.isArray(data.data)) throw new Error("来源业务响应无效");
  const traders: StmRadarTrader[] = list(data.data).slice(0, 25).flatMap((row, index) => {
    const wallet = solAddress(row.address); if (!wallet) return [];
    return [{ ...baseTrader(`binance-web3:solana:${wallet}`, "binance", text(row.addressLabel, wallet), checkedAt),
      source: "binance-web3-public", address: wallet, pnlUsd: stmNumber(row.realizedPnl), roi: stmNumber(row.realizedPnlPercent), winRate: stmNumber(row.winRate),
      pnlWindow: `${period}，Solana DEX 已实现收益`, rank: index + 1, avatarUrl: stmPublicUrl(row.addressLogo, "https://bin.bnbstatic.com"),
      volumeUsd: nonnegative(row.totalVolume), tradeCount: nonnegative(row.totalTxCnt), statsScope: "period",
      tags: ["Binance Web3 · Solana 钱包", ...list(row.genericAddressTagList).map(tag => text(tag.tagName)).filter(Boolean)].slice(0, 12),
      wallets: [{ chain: "solana", address: wallet, explorerUrl: `https://solscan.io/account/${wallet}` }] }];
  });
  return { venue: "binance", period, traders, checkedAt, refreshAfterSeconds: 15, researchOnly: true,
    source: source("binance-web3-public", "Binance Web3 · Solana DEX 钱包榜", "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/market/leaderboard/query/ai", checkedAt, null, traders.length, "官方公开 Web3 钱包榜；独立于 Binance CEX 跟单账户"),
    limitations: ["此为 Binance Web3 的 Solana DEX 钱包榜，非 Binance CEX 跟单账户；最多显示公开第一页 25 个钱包。", "仅展示所选周期已实现收益；原生币余额不冒充 USD 总资产，topEarningTokens 不冒充当前持仓。", "上游未提供榜单生成时间；lastActivity 是最近交易时间，不作为仓位时间或数据刷新时间。"] };
}
function applyAttempt<T extends StmRadarBoard | StmTraderResearch>(value: T, entry: Entry<unknown>): T {
  if (!entry.error) return value;
  return { ...value, checkedAt: entry.attemptedAt, source: { ...value.source, checkedAt: entry.attemptedAt, status: "stale", message: `${entry.error}；保留上次成功结果；${value.source.message}` },
    limitations: [...value.limitations, "本次上游读取失败；当前内容为上次成功读取结果。"] };
}
function emptyBoard(venue: StmRadarVenue, period: StmRadarPeriod, error: unknown, restricted = false): StmRadarBoard {
  const checkedAt = new Date().toISOString(), msg = message(error);
  return { venue, period, traders: [], checkedAt, refreshAfterSeconds: 15, researchOnly: true,
    source: { ...source(`research-${venue}`, `${venue.toUpperCase()} 公开研究`, "", checkedAt, null, 0, msg), status: restricted ? "restricted" : "unavailable" }, limitations: [msg, "未用其他收益窗口或持仓变化替代缺失数据。"] };
}
async function legacyRoster(venue: StmRadarVenue, refresh: boolean) {
  return cached(`legacy:${venue}`, refresh, async () => {
    const [roster, holdings, version] = await Promise.all([publicJson(`${WSM}/${venue}/data/traders.json`),
      ["pump", "binance", "okx"].includes(venue) ? publicJson(`${WSM}/${venue}/data/holdings.json`).catch(() => ({ data: {}, modifiedAt: null })) : Promise.resolve({ data: {}, modifiedAt: null }),
      publicJson(`${WSM}/version.json`).catch(() => ({ data: {}, modifiedAt: null }))]);
    if (!Array.isArray(venue === "fomo" ? roster.data.data : roster.data.traders)) throw new Error("来源响应缺少公开榜单");
    const hint = stmTimestamp(object(object(version.data).sources)[venue]);
    const normalized: StmRadarTrader[] = normalizeStmRoster(venue, roster.data, holdings.data, hint);
    return venue !== "fomo" ? normalized : normalized.map(trader => ({ ...trader,
      // Only explicit official_rank is authoritative for the WSM total board.
      rank: nonnegative(list(roster.data.data).find(row => `wsm:fomo:${text(row.id)}` === trader.id)?.official_rank),
      detailReference: trader.id, sourceTraderIds: [trader.id], pnlWindow: "All time（WSM 来源快照）",
      profileUrl: trader.profileUrl ?? (trader.fomoHandle ? `https://fomo.family/profile/${encodeURIComponent(trader.fomoHandle)}` : null),
      holdings: trader.holdings.map(holding => ({ ...holding, sourceId: "wsm-fomo", sourceUpdatedAt: trader.updatedAt })),
      wallets: trader.wallets?.map(wallet => ({ ...wallet, sourceId: "wsm-fomo", sourceUpdatedAt: null })),
      fieldSources: { rank: { sourceId: "wsm-fomo", updatedAt: hint }, pnl: { sourceId: "wsm-fomo", updatedAt: hint },
        profile: { sourceId: "wsm-fomo", updatedAt: null }, wallets: { sourceId: "wsm-fomo", updatedAt: null },
        holdings: { sourceId: "wsm-fomo", updatedAt: trader.updatedAt }, assets: { sourceId: "wsm-fomo", updatedAt: trader.updatedAt }, chains: { sourceId: "wsm-fomo", updatedAt: trader.updatedAt } } }));
  }, 60000);
}

function walletKey(wallet: { chain: string; address: string }): string | null {
  const evm = address(wallet.address); if (evm) return `evm:${evm}`;
  const sol = wallet.chain === "solana" ? solAddress(wallet.address) : null;
  return sol ? `solana:${sol}` : null;
}
/** A provider handle, display name or X handle never proves identity. */
function uniqueFomoMatch(trader: StmRadarTrader, roster: StmRadarTrader[]): StmRadarTrader | undefined {
  const uid = fomoUid(trader.fomoUid) ?? fomoUid(trader.id.replace(/^fomo:/, ""));
  const wallets = new Set(trader.wallets?.map(walletKey).filter((v): v is string => !!v));
  const matches = roster.filter(row => {
    const otherUid = fomoUid(row.fomoUid);
    if (uid && otherUid) return uid === otherUid;
    return row.wallets?.some(wallet => { const key = walletKey(wallet); return key && wallets.has(key); });
  });
  return matches.length === 1 ? matches[0] : undefined;
}
function enrichFomoTrader(trader: StmRadarTrader, matched: StmRadarTrader): StmRadarTrader {
  const combinedWallets = [...(trader.wallets ?? []), ...(matched.wallets ?? [])];
  return { ...trader, sourceTraderIds: [matched.id],
    holdings: matched.holdings, holdingsCount: matched.holdingsCount, visibility: matched.visibility,
    totalValueUsd: matched.totalValueUsd, totalValueLabel: "WSM 历史钱包资产", valueBasis: "wallet", chains: matched.chains, chainsScope: matched.chainsScope,
    updatedAt: matched.updatedAt,
    wallets: combinedWallets.filter((wallet, i) => combinedWallets.findIndex(v => v.chain === wallet.chain && v.address === wallet.address) === i),
    socialLinks: [...(trader.socialLinks ?? []), ...(matched.socialLinks ?? [])].filter((link, i, all) => all.findIndex(v => v.url === link.url) === i),
    fieldSources: { ...trader.fieldSources, holdings: matched.fieldSources?.holdings, assets: matched.fieldSources?.assets, chains: matched.fieldSources?.chains,
      ...(trader.wallets?.length ? {} : { wallets: matched.fieldSources?.wallets }) } };
}
function wsmFomoBoard(entry: Entry<StmRadarTrader[]>): StmRadarBoard {
  const traders = [...entry.value].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.pnlUsd ?? -Infinity) - (a.pnlUsd ?? -Infinity));
  const updatedAt = traders.map(trader => trader.fieldSources?.rank?.updatedAt).find((v): v is string => !!v) ?? null;
  return applyAttempt({ venue: "fomo", period: "all", traders, checkedAt: entry.checkedAt, refreshAfterSeconds: 15, researchOnly: true,
    source: source("wsm-fomo", "Web3SmartMoney FOMO 总榜 · Top 100 来源快照", `${WSM}/fomo/data/traders.json`, entry.checkedAt, updatedAt, traders.length,
      "按 WSM 原始 official_rank 展示其总榜；资产、已披露持仓和链分布随榜单提供，不依赖逐人资料查询"),
    limitations: ["总榜采用 WSM 实际提供的全部记录及原始排名；不与 985 的 30 人分周期榜合并或重新编号。", "资产、持仓及链分布保留来源历史时间；top_tokens 仅为部分披露，未知数量、合约及更新时间保持未知。", "排名/收益与资产持仓的日期分别记录；成功检查接口不表示来源数据刚刚更新。"] }, entry);
}
export async function getStmRadarBoard(venue: StmRadarVenue, period: StmRadarPeriod, refresh = false): Promise<StmRadarBoard> {
  try {
    if (venue === "fomo") {
      if (period === "all") return wsmFomoBoard(await legacyRoster("fomo", refresh));
      const entry = await cached("fomo:boards", refresh, async () => normalizeFomoBoards((await publicJson(`${MONITOR}/fomo-leaderboards.json`)).data, new Date().toISOString()));
      const board = applyAttempt(entry.value[period], entry);
      if (!board.traders.some(trader => trader.fomoUid || trader.wallets?.some(walletKey))) return board;
      const prior = await legacyRoster("fomo", refresh).catch(() => null);
      if (!prior) return { ...board, limitations: [...board.limitations, "WSM 持仓来源暂时不可读；未用姓名或 handle 猜测持仓。"] };
      return { ...board, traders: board.traders.map(trader => { const matched = uniqueFomoMatch(trader, prior.value); return matched ? enrichFomoTrader(trader, matched) : trader; }),
        limitations: [...board.limitations, "关联的 WSM 资产/持仓仅依据唯一相同 FOMO UUID 或完整钱包；排名及本周期收益始终来自原分周期榜。", ...(prior.error ? [`WSM 读取失败，关联资料保留上次快照：${prior.error}`] : [])] };
    }
    if (venue === "hl") {
      type HlBoards = { boards: Record<StmRadarPeriod, StmRadarBoard>; etag: string | null };
      const entry = await cached<HlBoards>("hl:boards", refresh, async previous => {
        // The official complete board is ~38 MB. Download only when its ETag changes;
        // normalize down to the top 100 in each window before shared caching.
        const result = await publicJson(HL_BOARD, undefined, 48_000_000, previous?.etag ?? undefined, 20000), checkedAt = new Date().toISOString();
        const boards = result.notModified && previous ? Object.fromEntries(periods.map(p => [p, { ...previous.boards[p], checkedAt,
          source: { ...previous.boards[p].source, checkedAt, fetchedAt: checkedAt } }])) as HlBoards["boards"] : normalizeHlBoards(result.data, checkedAt, result.modifiedAt);
        for (const board of Object.values(boards)) { board.refreshAfterSeconds = 60; board.source.checkIntervalSeconds = 90; }
        return { boards, etag: result.etag ?? null };
      }, 90000, 60000);
      return applyAttempt(entry.value.boards[period], entry);
    }
    if (venue === "lighter") {
      const entry = await cached(`lighter:board:${period}`, refresh, async () => normalizeLighterBoard((await publicJson(`${LIGHTER}/pnlLeaderboard?time_window=${period}&sort_by=pnl&sort_dir=desc&limit=100`)).data, period, new Date().toISOString()));
      return applyAttempt(entry.value, entry);
    }
    if (venue === "binance" && (period === "7d" || period === "30d")) {
      const entry = await cached(`binance:web3:${period}`, refresh, async () => normalizeBinanceWeb3Board((await publicJson(`https://web3.binance.com/bapi/defi/v1/public/wallet-direct/market/leaderboard/query/ai?chainId=CT_501&period=${period}&tag=ALL&pageNo=1&pageSize=25`)).data, period, new Date().toISOString()));
      return applyAttempt(entry.value, entry);
    }
    if (period !== "all") return emptyBoard(venue, period, new Error("公开接口未提供此收益窗口；保留来源原始榜单口径"), true);
    const entry = await legacyRoster(venue, refresh), checkedAt = entry.checkedAt;
    const traders = entry.value as StmRadarTrader[], updatedAt = traders.map(t => t.sourceUpdatedAt).filter((v): v is string => !!v).sort().at(-1) ?? null;
    const limitations: Record<string, string> = { pump: "Pump 官方开发者接口需已批准组织的只读 API key；当前为 WSM 历史来源，收益口径自 2026-07-01 起。",
      binance: "当前为 WSM 的 Binance CEX 跟单账户历史榜单；Binance Web3 DEX 钱包榜单是另一数据集，不能互相替代。",
      okx: "OKX 官方链上榜单需 API key、签名及对应权限；当前为 WSM 历史 3M 榜单，非全时期收益。" };
    return applyAttempt({ venue, period, traders, checkedAt, refreshAfterSeconds: 15, researchOnly: true,
      source: source(`wsm-${venue}`, `Web3SmartMoney ${venue.toUpperCase()} 历史来源`, `${WSM}/${venue}/data/traders.json`, checkedAt, updatedAt, traders.length, limitations[venue], 6 * 3600000),
      limitations: [limitations[venue], "来源每行 pnlWindow 保留原始统计口径；检查成功不表示上游更新。"] }, entry);
  } catch (error) { return emptyBoard(venue, period, error); }
}
function chainName(networkId: unknown): string | null {
  const id = stmNumber(networkId); return id === 1399811149 || id === 501 ? "solana" : id === 56 ? "bsc" : id === 1 ? "ethereum" : id === 8453 ? "base" : id === 42161 ? "arbitrum" : null;
}
export function normalizeFomoDetail(raw: unknown, reference: string, checkedAt: string): StmTraderResearch {
  const data = object(raw), profile = object(data.profile), walletData = object(data.wallets), profit = object(data.profitSnapshot);
  if (data.ok !== true || !handle(profile.handle) || text(profile.handle).toLowerCase() !== reference.toLowerCase()) throw new Error("来源响应身份不匹配");
  const uid = text(profile.userId), exactHandle = text(profile.handle), wallets: NonNullable<StmRadarTrader["wallets"]> = [];
  for (const rawWallet of Array.isArray(walletData.evm) ? walletData.evm : []) { const wallet = address(rawWallet); if (wallet) wallets.push({ chain: "evm", address: wallet, explorerUrl: `https://etherscan.io/address/${wallet}`, sourceId: "985-fomo-profile", sourceUpdatedAt: stmTimestamp(walletData.updatedAt) }); }
  for (const rawWallet of Array.isArray(walletData.sol) ? walletData.sol : []) { const wallet = solAddress(rawWallet); if (wallet) wallets.push({ chain: "solana", address: wallet, explorerUrl: `https://solscan.io/account/${wallet}`, sourceId: "985-fomo-profile", sourceUpdatedAt: stmTimestamp(walletData.updatedAt) }); }
  const activities = list(data.trades).slice(0, 100).flatMap<StmResearchActivity>(row => {
    const action = row.side === "BUY" ? "buy" : row.side === "SELL" ? "sell" : null;
    if (!action) return [];
    const chain = chainName(row.networkId), contract = chain === "solana" ? solAddress(row.tokenAddress) : address(row.tokenAddress);
    return [{ id: text(row.key, text(row.txHash)), action, symbol: text(row.symbol), chain, address: contract, side: "spot", quantity: null,
      valueUsd: nonnegative(row.usd), priceUsd: nonnegative(row.priceUsd), occurredAt: stmTimestamp(row.createdAt) ?? stmTimestamp(row.ts),
      transactionHash: text(row.txHash) || null, transactionUrl: stmPublicUrl(row.txUrl), basis: "provider-trade", verified: false, sourceId: "985-fomo-profile" }];
  });
  const pnlPositions = list(profit.items).slice(0, 100).map(row => ({ symbol: text(row.symbol), name: text(row.name, text(row.symbol)), chain: chainName(row.networkId),
    address: chainName(row.networkId) === "solana" ? solAddress(row.tokenAddress) : address(row.tokenAddress), logoUrl: stmPublicUrl(row.image),
    pnlUsd: stmNumber(row.profitUsd), realizedPnlUsd: stmNumber(row.realizedPnlUsd), unrealizedPnlUsd: stmNumber(row.unrealizedPnlUsd), closedAt: stmTimestamp(row.closedAt) }));
  const twitter = handle(profile.twitter ?? profile.twitterHandle), activitiesAt = activities.map(row => row.occurredAt).filter((v): v is string => !!v).sort().at(-1) ?? null;
  const trader: StmRadarTrader = { ...baseTrader(uid ? `fomo:${uid}` : `fomo:handle:${exactHandle.toLowerCase()}`, "fomo", text(profile.name, exactHandle), checkedAt),
    source: "985-fomo-profile", handle: exactHandle, fomoHandle: exactHandle, fomoUid: fomoUid(uid), detailReference: exactHandle, avatarUrl: stmPublicUrl(profile.avatar), profileUrl: `https://fomo.family/profile/${encodeURIComponent(exactHandle)}`,
    followers: nonnegative(profile.followers), bio: typeof profile.desc === "string" ? profile.desc.slice(0, 1600) : null, wallets,
    socialLinks: twitter ? [{ label: "X", url: `https://x.com/${twitter}` }] : [],
    fieldSources: { profile: { sourceId: "985-fomo-profile", updatedAt: null }, wallets: { sourceId: "985-fomo-profile", updatedAt: stmTimestamp(walletData.updatedAt) } } };
  return { venue: "fomo", reference, trader, checkedAt, refreshAfterSeconds: 15, researchOnly: true, activities, pnlPositions,
    source: { ...source("985-fomo-profile", "985monitor FOMO 公开资料 / 成交转发", `${MONITOR}/api/fomo-watch/profile?handle=${encodeURIComponent(reference)}`, checkedAt, activitiesAt, activities.length,
      "来源转发的买卖记录未经本平台链上收据核验；各组成数据更新时间独立"), semantics: "events" },
    componentUpdatedAt: { profile: null, wallets: stmTimestamp(walletData.updatedAt), holdings: null, activities: activitiesAt, pnl: stmTimestamp(profit.updatedAt) },
    limitations: ["profile 未提供资料生成时间；historyUpdatedAt 仅表示本次历史查询，不是钱包或收益更新时间。", "买卖记录为第三方来源报告；不推断开仓、加仓、减仓或清仓，不进入 S1–S5。", "收益 spotlight 是历史收益仓位，可能已关闭，不是当前钱包余额。"] };
}
export function normalizeHlDetail(raw: unknown, fillsRaw: unknown, reference: string, checkedAt: string): StmTraderResearch {
  const data = object(raw), wallet = address(reference); if (!wallet || !Array.isArray(data.assetPositions)) throw new Error("来源响应无效");
  const updatedAt = stmTimestamp(data.time), holdings: StmHolding[] = list(data.assetPositions).flatMap(row => {
    const p = object(row.position), size = stmNumber(p.szi), symbol = text(p.coin); if (!symbol || size === null || size === 0) return [];
    return [{ asset: `cex:${symbol}`, symbol, chain: "hyperliquid", address: null, quantity: Math.abs(size), valueUsd: nonnegative(p.positionValue), side: size > 0 ? "long" : "short",
      pnlUsd: stmNumber(p.unrealizedPnl), priceUsd: null, sourceId: "hl-public-account", sourceUpdatedAt: updatedAt }];
  });
  const activities = (Array.isArray(fillsRaw) ? list(fillsRaw) : []).slice(0, 2000).flatMap<StmResearchActivity>(fill => {
    const dir = text(fill.dir), start = stmNumber(fill.startPosition), quantity = nonnegative(fill.sz), price = nonnegative(fill.px), symbol = text(fill.coin);
    const opening = /^(Open Long|Open Short)$/.test(dir), closing = /^(Close Long|Close Short)$/.test(dir);
    // Liquidations and crossing fills need split accounting; don't mislabel them as additions.
    if (!symbol || (!opening && !closing) || start === null || quantity === null || quantity <= 0) return [];
    const isLong = dir.endsWith("Long");
    if ((isLong && start < 0) || (!isLong && start > 0) || (closing && (start === 0 || quantity > Math.abs(start) + 1e-12))) return [];
    const action: StmResearchActivity["action"] = opening ? start === 0 ? "open" : "add" : Math.abs(start) <= quantity + 1e-12 ? "close" : "reduce";
    const hash = text(fill.hash);
    return [{ id: `hl:${text(String(fill.tid))}:${hash}`, action, symbol, chain: "hyperliquid", address: null, side: isLong ? "long" : "short", quantity,
      valueUsd: price === null ? null : quantity * price, priceUsd: price, occurredAt: stmTimestamp(fill.time), transactionHash: hash || null,
      transactionUrl: /^0x[0-9a-fA-F]{64}$/.test(hash) ? `https://app.hyperliquid.xyz/explorer/tx/${hash}` : null, basis: "provider-trade", verified: false, sourceId: "hl-public-fills" }];
  }).sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? "")).slice(0, 100);
  const trader = { ...baseTrader(`hl:${wallet}`, "hl", wallet, checkedAt), address: wallet, source: "hl-public-account", holdings, visibility: holdings.length ? "public" as const : "empty" as const,
    updatedAt, sourceUpdatedAt: updatedAt, holdingsCount: holdings.length, totalValueUsd: nonnegative(object(data.marginSummary).accountValue), totalValueLabel: "当前永续账户权益", valueBasis: "account-equity" as const,
    profileUrl: `https://app.hyperliquid.xyz/explorer/address/${wallet}`, wallets: [{ chain: "hyperliquid", address: wallet, explorerUrl: `https://app.hyperliquid.xyz/explorer/address/${wallet}` }] };
  return { venue: "hl", reference, trader, source: source("hl-public-account", "Hyperliquid 官方公开账户 / 成交", HL_INFO, checkedAt, updatedAt, holdings.length, "clearinghouseState + userFills；仅默认永续 DEX"),
    activities, pnlPositions: [], checkedAt, refreshAfterSeconds: 15, researchOnly: true,
    componentUpdatedAt: { profile: null, wallets: null, holdings: updatedAt, activities: activities[0]?.occurredAt ?? null, pnl: null },
    limitations: ["仅展示默认永续 DEX 的账户状态，不包括现货、Vault 或所有 HIP-3 DEX。", "最多读取近期 2000 条成交，展示最近 100 条可明确分类记录；跨越多空的成交不强行归类。", "真实官方成交仍为来源报告，未经本平台独立链上核验，且不进入 S1–S5。"] };
}
export function normalizeLighterDetail(raw: unknown, reference: string, checkedAt: string): StmTraderResearch {
  const data = object(raw), wallet = address(reference), account = list(data.accounts).find(row => address(row.l1_address) === wallet);
  if (data.code !== 200 || !wallet || !account) throw new Error("来源响应身份不匹配");
  const holdings: StmHolding[] = list(account.positions).flatMap(p => {
    const quantity = nonnegative(p.position), symbol = text(p.symbol); if (quantity === null || quantity === 0 || !symbol || ![1, -1].includes(Number(p.sign))) return [];
    return [{ asset: `cex:${symbol}`, symbol, chain: "lighter", address: null, quantity, valueUsd: nonnegative(p.position_value), side: Number(p.sign) === -1 ? "short" : "long",
      pnlUsd: stmNumber(p.unrealized_pnl), priceUsd: null, sourceId: "lighter-public-account", sourceUpdatedAt: null }];
  });
  const trader: StmRadarTrader = { ...baseTrader(`lighter:${wallet}`, "lighter", text(account.name, wallet), checkedAt), address: wallet, source: "lighter-public-account", holdings,
    visibility: holdings.length ? "public" : "empty", holdingsCount: holdings.length, totalValueUsd: stmNumber(account.total_asset_value), totalValueLabel: "来源账户资产价值", valueBasis: "account-equity",
    bio: text(account.description) || null, profileUrl: "https://app.lighter.xyz/", wallets: [{ chain: "lighter", address: wallet, explorerUrl: `https://etherscan.io/address/${wallet}` }] };
  return { venue: "lighter", reference, trader, checkedAt, refreshAfterSeconds: 15, researchOnly: true, activities: [], pnlPositions: [],
    source: source("lighter-public-account", "Lighter 官方公开账户", `${LIGHTER}/account?by=l1_address&value=${wallet}`, checkedAt, null, holdings.length, "account 持仓原始数量；数据生成时间未提供"),
    componentUpdatedAt: { profile: null, wallets: null, holdings: null, activities: null, pnl: null },
    limitations: ["账户接口没有仓位生成时间；查询时间与最近账户交易时间均不充当仓位时间。", "一个 L1 钱包可能有多个子账户；此处仅展示来源返回的首个匹配账户。", "未接入带账户权限的成交接口，不根据数量或 USD 市值变化伪造增减仓记录。"] };
}
async function officialFomoStatus(exactHandle: string): Promise<StmSource> {
  const entry = await cached(`official-fomo:${exactHandle.toLowerCase()}`, false, async () => {
    const checkedAt = new Date().toISOString(), url = `https://prod-api.fomo.family/v2/users/userHandle/${encodeURIComponent(exactHandle)}`;
    try {
      await publicJson(url, undefined, 1_000_000, undefined, 5000);
      return source("fomo-official-profile", "FOMO 官方资料接口 · 匿名访问检查", url, checkedAt, null, 0,
        "匿名资料请求可访问；尚未验证其余额/持仓字段及身份结构，因此不作为钱包资产或交易证据");
    } catch (error) {
      const status = /HTTP (401|403|431)$/.test(message(error)) ? "restricted" as const : "unavailable" as const;
      return { ...source("fomo-official-profile", "FOMO 官方资料接口 · 匿名访问检查", url, checkedAt, null, 0,
        `${message(error)}；未提供凭据、未绕过登录；保留其他来源已披露的真实快照`), status };
    }
  }, 300000, 300000);
  return entry.value;
}
export async function getStmTraderResearch(venue: StmRadarVenue, reference: string, refresh = false): Promise<StmTraderResearch> {
  if ((venue === "fomo" && !handle(reference) && !wsmFomoReference(reference)) || (["hl", "lighter"].includes(venue) && !address(reference)) || reference.length > 128) throw new Error("无效的公开账户标识");
  const cacheReference = (["hl", "lighter"].includes(venue) || (venue === "fomo" && !wsmFomoReference(reference))) ? reference.toLowerCase() : reference;
  const entry = await cached(`detail:${venue}:${cacheReference}`, refresh, async () => {
    const checkedAt = new Date().toISOString();
    if (venue === "fomo") {
      if (wsmFomoReference(reference)) {
        const prior = await legacyRoster("fomo", refresh), matches = prior.value.filter(row => row.id === reference);
        if (matches.length !== 1) throw new Error("公开接口没有此账户资料");
        const known = matches[0];
        const baseline: StmTraderResearch = { venue, reference, trader: known, checkedAt, refreshAfterSeconds: 15, researchOnly: true,
          source: { ...source("wsm-fomo", "Web3SmartMoney FOMO 已披露资料", `${WSM}/fomo/data/traders.json`, prior.checkedAt, known.updatedAt, 1,
            "保留总榜原始身份、资产、部分持仓及链分布；逐项来源时间独立记录"), checkedAt }, activities: [], pnlPositions: [],
          componentUpdatedAt: { profile: null, wallets: null, holdings: known.updatedAt, activities: null, pnl: known.fieldSources?.pnl?.updatedAt ?? null },
          limitations: ["已披露资产和持仓为 WSM 历史快照，不表示当前实时余额；部分持仓的未知数量或合约不推算。", "985 扩展资料仅在相同 FOMO UUID 或唯一完整钱包匹配后接入；不按名称、X 或相同 handle 关联。"] };
        if (!known.fomoHandle) return applyAttempt({ ...baseline, limitations: [...baseline.limitations, "来源未提供明确 FOMO API handle；未猜测资料地址或生成交易记录。"] }, prior);
        const official = officialFomoStatus(known.fomoHandle);
        try {
          // A source's handle can be stale. At most two source-supplied lookup hints
          // are allowed; neither hint proves identity without a unique UID/wallet.
          const candidates = [...new Set([known.fomoHandle, handle(known.handle)].filter((v): v is string => !!v))].slice(0, 2);
          const attempts: StmSource[] = []; let detail: StmTraderResearch | null = null, failure: string | null = null;
          for (const candidate of candidates) {
            try {
              const current = normalizeFomoDetail((await publicJson(`${MONITOR}/api/fomo-watch/profile?handle=${encodeURIComponent(candidate)}&limit=100`, undefined, 12_000_000, undefined, 5000, false)).data, candidate, checkedAt);
              if (current.trader && uniqueFomoMatch(current.trader, prior.value)?.id === known.id) { detail = current; break; }
              attempts.push({ ...source(`985-fomo-identity:${candidate.toLowerCase()}`, "985 公开资料 · 身份关联未证实", current.source.url, checkedAt, null, 0,
                "候选查询响应未通过与 WSM 原始账户的唯一 UUID/完整钱包关联；未采用其钱包、持仓、收益、成交或时间戳"), status: "unavailable" });
            } catch (error) { failure = message(error); }
          }
          if (!detail?.trader) return applyAttempt({ ...baseline, sources: [baseline.source, ...attempts, await official], limitations: [...baseline.limitations,
            "985 返回资料无法证明与此 WSM 账户为同一身份；保留原始资产与持仓，未混入其钱包、收益或成交。", ...(failure ? [`部分 985 查询未成功：${failure}`] : [])] }, prior);
          const enriched = enrichFomoTrader(detail.trader, known);
          const trader: StmRadarTrader = { ...known, id: known.id, detailReference: known.id, sourceTraderIds: [known.id],
            name: detail.trader.name || known.name, avatarUrl: detail.trader.avatarUrl ?? known.avatarUrl, bio: detail.trader.bio ?? known.bio,
            followers: detail.trader.followers, fomoUid: detail.trader.fomoUid ?? known.fomoUid, fomoHandle: detail.trader.fomoHandle,
            profileUrl: detail.trader.profileUrl ?? known.profileUrl,
            wallets: enriched.wallets, socialLinks: enriched.socialLinks, fieldSources: { ...known.fieldSources, profile: detail.trader.fieldSources?.profile } };
          return applyAttempt({ ...detail, reference, trader, sources: [baseline.source, detail.source, await official], componentUpdatedAt: { ...detail.componentUpdatedAt, holdings: known.updatedAt },
            limitations: [...detail.limitations, ...baseline.limitations, "WSM 原始记录 ID、总榜排名及 ALL-TIME 收益保持不变；近期成交与历史持仓分别标明时间。"] }, prior);
        } catch (error) {
          return applyAttempt({ ...baseline, sources: [baseline.source, await official], limitations: [...baseline.limitations, `985 扩展查询未成功：${message(error)}；当前完整保留 WSM 已知资料。`] }, prior);
        }
      }
      const detail = normalizeFomoDetail((await publicJson(`${MONITOR}/api/fomo-watch/profile?handle=${encodeURIComponent(reference)}&limit=100`)).data, reference, checkedAt);
      const prior = await legacyRoster("fomo", false).catch(() => null);
      const matched = detail.trader && prior ? uniqueFomoMatch(detail.trader, prior.value) : undefined;
      if (detail.trader && matched) {
        detail.trader = enrichFomoTrader(detail.trader, matched);
        detail.componentUpdatedAt.holdings = matched.updatedAt;
        detail.limitations.push("WSM 历史钱包及持仓通过确切钱包地址或同一 FOMO UUID 匹配；其时间独立于最近成交和本次刷新。");
      }
      if (prior?.error) detail.limitations.push(`WSM 本次读取失败，关联资料保留上次历史结果：${prior.error}`);
      if (!prior) detail.limitations.push("WSM 来源暂时不可读；未将缺少关联持仓解释为没有持仓。");
      return detail;
    }
    if (venue === "hl") {
      const [state, fills] = await Promise.all([publicJson(HL_INFO, { type: "clearinghouseState", user: reference.toLowerCase() }),
        // userFills returns an array, handled separately by an object envelope below.
        publicArray(HL_INFO, { type: "userFills", user: reference.toLowerCase() }).catch(() => null)]);
      const detail = normalizeHlDetail(state.data, fills, reference, checkedAt);
      if (!fills) detail.limitations.push("本次成交查询失败；当前只展示账户仓位，不表示没有成交。");
      return detail;
    }
    if (venue === "lighter") return normalizeLighterDetail((await publicJson(`${LIGHTER}/account?by=l1_address&value=${reference.toLowerCase()}`)).data, reference, checkedAt);
    const prior = await legacyRoster(venue, refresh), trader = prior.value.find(row => row.id === reference || row.address === reference);
    if (!trader) throw new Error("公开接口没有此账户资料");
    const detail: StmTraderResearch = { venue, reference, trader: { ...trader, sourceTraderIds: [trader.id] }, checkedAt: prior.checkedAt, refreshAfterSeconds: 15, researchOnly: true as const,
      source: source(`wsm-${venue}`, `Web3SmartMoney ${venue.toUpperCase()} 历史资料`, `${WSM}/${venue}/data/traders.json`, checkedAt, trader.sourceUpdatedAt ?? null, trader.holdings.length, "来源历史持仓，未接入实时增减仓"),
      activities: [], pnlPositions: [], componentUpdatedAt: { profile: null, wallets: null, holdings: trader.updatedAt, activities: null, pnl: trader.sourceUpdatedAt ?? null },
      limitations: ["官方实时账户接口不可公开匿名读取；保留来源真实历史时间。", "没有交易记录不等于没有交易，不根据持仓市值变化推断买卖。"] };
    return applyAttempt(detail, prior);
  });
  return applyAttempt(entry.value, entry);
}
async function publicArray(url: string, body: unknown): Promise<unknown[]> {
  // Same HTTP budget, timeout and streaming cap as object responses.
  const response = await publicJson(url, body);
  if (!Array.isArray(response.data.__array)) throw new Error("来源响应缺少公开成交数组");
  return response.data.__array;
}
