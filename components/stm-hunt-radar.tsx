"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ArrowUpRight, Check, ChevronDown, ChevronRight, Clock3, Copy, ExternalLink, Eye, Layers3, LockKeyhole, Radar, RefreshCw, Search, SlidersHorizontal, Star, Users, Wallet, X } from "lucide-react";
import type { StmDashboard, StmHolding, StmRadarBoard, StmRadarPeriod, StmRadarTrader, StmTraderResearch } from "@/lib/stm-hunt/types";

type Venue = "fomo" | "hl" | "pump" | "binance" | "lighter" | "okx";
type RadarHolding = StmHolding & { name?: string | null; logoUrl?: string | null; priceUsd?: number | null; explorerUrl?: string | null };
type RadarTrader = StmRadarTrader;
export type StmRadarFocus = { venue?: Venue; period?: StmRadarPeriod; traderId?: string; query?: string; chain?: string };
export interface StmHuntRadarProps {
  data: StmDashboard;
  initialFocus?: StmRadarFocus;
  busy?: boolean | string | null;
  onWatch: (id: string, enabled: boolean) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  refreshing?: boolean;
  lastSyncedAt?: string | number | null;
  autoRefresh?: boolean;
}
const venues: Array<{ id: Venue; title: string; subtitle: string; asset: string; color: string }> = [
  { id: "fomo", title: "FOMO", subtitle: "多链钱包", asset: "/stm-hunt/fomo.svg", color: "#fa94ae" },
  { id: "hl", title: "Hyperliquid", subtitle: "永续交易员", asset: "/stm-hunt/hyperliquid.png", color: "#79e8c2" },
  { id: "pump", title: "Pump.fun", subtitle: "链上交易员", asset: "/stm-hunt/pump.png", color: "#c3e68a" },
  { id: "binance", title: "Binance", subtitle: "合约交易员", asset: "/stm-hunt/binance.png", color: "#f1ce69" },
  { id: "lighter", title: "Lighter", subtitle: "永续交易员", asset: "/stm-hunt/lighter.svg", color: "#afa8ff" },
  { id: "okx", title: "OKX", subtitle: "链上交易员", asset: "/stm-hunt/okx.png", color: "#d2dce8" }
];
const periods: Array<{id: StmRadarPeriod; label: string}> = [{id:"all",label:"总榜"},{id:"24h",label:"24小时"},{id:"7d",label:"7天"},{id:"30d",label:"30天"}];
const researchVenues: Venue[] = ["fomo", "hl", "lighter"];
const traderIdentities = (trader: RadarTrader) => [trader.id, ...(trader.sourceTraderIds ?? [])];
const chainNames: Record<string, string> = { solana: "Solana", bsc: "BNB", ethereum: "Ethereum", base: "Base", arbitrum: "Arbitrum", polygon: "Polygon", hood: "Robinhood", robinhood: "Robinhood", monad: "Monad", hyperliquid: "Hyperliquid", lighter: "Lighter" };
const chainColors: Record<string, string> = { solana: "#aa8af4", bsc: "#e8c65e", ethereum: "#849ada", base: "#5f95ef", arbitrum: "#68b5dd", polygon: "#a875d2", hood: "#7ad398", robinhood: "#7ad398", monad: "#d0b4f1", hyperliquid: "#79e8c2", lighter: "#afa8ff" };
const visibilityNames = { public: "公开持仓", truncated: "部分披露", private: "私密持仓", empty: "未提供持仓" };
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const count = new Intl.NumberFormat("zh-CN");
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const money = (value: number | null | undefined, compact = false) => finite(value) ? (compact ? compactUsd : usd).format(value) : "—";
const milliseconds = (value: string | number | null | undefined) => typeof value === "number" ? value : value ? Date.parse(value) : NaN;
const timestamp = (value: string | number | null | undefined, seconds = false) => Number.isFinite(milliseconds(value)) ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" as const } : {}), hour12: false }).format(milliseconds(value)) : "未提供";
const chainName = (chain: string) => chainNames[chain] ?? chain;
const short = (address: string) => address.length > 20 ? `${address.slice(0, 7)}…${address.slice(-5)}` : address;
function safeUrl(value?: string | null) { if (!value) return undefined; try { const url = new URL(value); return url.protocol === "https:" ? url.href : undefined; } catch { return undefined; } }
function ageLabel(value: string | null | undefined, now: number) {
  const delta = now - milliseconds(value);
  if (!Number.isFinite(delta) || delta < 0) return "时间待核验";
  const minutes = Math.floor(delta / 60_000);
  return minutes < 1 ? "刚刚" : minutes < 60 ? `${minutes} 分钟前` : minutes < 1440 ? `${Math.floor(minutes / 60)} 小时前` : `${Math.floor(minutes / 1440)} 天前`;
}
function Avatar({ src, name, small = false }: { src?: string | null; name: string; small?: boolean }) {
  const url = safeUrl(src);
  return <span className={`stm-radar-avatar${small ? " stm-radar-avatar-small" : ""}`}><span>{name.replace(/^@/, "").slice(0, 2).toUpperCase() || "?"}</span>{url ? <img src={url} alt="" width={small ? 30 : 42} height={small ? 30 : 42} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span>;
}
export function mergeRadarResearchTrader(board: RadarTrader, detail?: RadarTrader | null): RadarTrader {
  if (!detail || detail.id !== board.id || detail.venue !== board.venue) return board;
  const boardHasHoldings = board.holdings.length > 0;
  const boardHasChains = !!board.chains?.length;
  const boardHasTotal = finite(board.totalValueUsd);
  const wallets = [...(board.wallets ?? []), ...(detail.wallets ?? [])].filter((wallet, index, all) => {
    const identity = (value: typeof wallet) => `${value.chain}:${/^0x[0-9a-fA-F]{40}$/.test(value.address) ? value.address.toLowerCase() : value.address}`;
    return all.findIndex(value => identity(value) === identity(wallet)) === index;
  });
  // Ranking and period fields always stay on the board. Sparse profile responses cannot erase its disclosed snapshot.
  return {
    ...board,
    sourceTraderIds: [...new Set([...(board.sourceTraderIds ?? []), ...(detail.sourceTraderIds ?? [])])],
    avatarUrl: detail.avatarUrl || board.avatarUrl,
    profileUrl: detail.profileUrl || board.profileUrl,
    bio: detail.bio || board.bio,
    fomoHandle: detail.fomoHandle || board.fomoHandle,
    followers: finite(board.followers) ? board.followers : detail.followers,
    tradeCount: finite(board.tradeCount) ? board.tradeCount : detail.tradeCount,
    volumeUsd: finite(board.volumeUsd) ? board.volumeUsd : detail.volumeUsd,
    statsScope: finite(board.tradeCount) || finite(board.volumeUsd) ? board.statsScope : detail.statsScope ?? board.statsScope,
    socialLinks: [...(board.socialLinks ?? []), ...(detail.socialLinks ?? [])].filter((link, index, all) => all.findIndex(value => value.url === link.url) === index),
    wallets,
    holdings: boardHasHoldings ? board.holdings : detail.holdings,
    visibility: boardHasHoldings ? board.visibility : detail.holdings.length ? detail.visibility : board.visibility,
    holdingsCount: boardHasHoldings ? board.holdingsCount ?? board.holdings.length : detail.holdingsCount ?? board.holdingsCount,
    chains: boardHasChains ? board.chains : detail.chains,
    chainsScope: boardHasChains ? board.chainsScope : detail.chainsScope,
    totalValueUsd: boardHasTotal ? board.totalValueUsd : detail.totalValueUsd,
    totalValueLabel: boardHasTotal ? board.totalValueLabel : detail.totalValueLabel,
    valueBasis: boardHasTotal ? board.valueBasis : detail.valueBasis ?? board.valueBasis,
    updatedAt: boardHasHoldings ? board.updatedAt : detail.updatedAt ?? board.updatedAt,
    fieldSources: { ...board.fieldSources, profile: detail.fieldSources?.profile ?? board.fieldSources?.profile,
      holdings: boardHasHoldings ? board.fieldSources?.holdings : detail.fieldSources?.holdings,
      assets: boardHasTotal ? board.fieldSources?.assets : detail.fieldSources?.assets,
      chains: boardHasChains ? board.fieldSources?.chains : detail.fieldSources?.chains },
  };
}
function displayedValue(trader: RadarTrader) {
  if (finite(trader.totalValueUsd)) return { value: trader.totalValueUsd, label: trader.totalValueLabel || (trader.valueBasis === "account-equity" ? "账户权益" : trader.valueBasis === "notional" ? "名义敞口" : "链上持仓"), partial: false };
  const values = trader.holdings.filter(holding => finite(holding.valueUsd) && holding.valueUsd >= 0);
  return { value: values.length ? values.reduce((sum, holding) => sum + holding.valueUsd!, 0) : null, label: ["hl", "binance", "lighter"].includes(trader.venue) ? "已披露名义敞口" : "已披露持仓", partial: true };
}
function comparableValue(trader: RadarTrader) {
  return trader.valueBasis === "account-equity" ? (finite(trader.totalValueUsd) ? trader.totalValueUsd : null) : displayedValue(trader).value;
}
function disclosedChains(trader: RadarTrader) {
  if (trader.chains?.length) return trader.chains.filter(chain => finite(chain.valueUsd) && chain.valueUsd > 0).sort((a, b) => b.valueUsd! - a.valueUsd!);
  const chains = new Map<string, number>();
  for (const holding of trader.holdings) if (holding.chain && finite(holding.valueUsd) && holding.valueUsd > 0) chains.set(holding.chain, (chains.get(holding.chain) ?? 0) + holding.valueUsd);
  return [...chains].map(([chain, valueUsd]) => ({ chain, valueUsd, holdingsCount: 0 })).sort((a, b) => b.valueUsd - a.valueUsd);
}
function ChainDistribution({ trader }: { trader: RadarTrader }) {
  if (trader.visibility === "private") return <span className="stm-radar-quiet"><LockKeyhole size={12} />未公开</span>;
  const chains = disclosedChains(trader);
  const total = chains.reduce((sum, chain) => sum + (chain.valueUsd ?? 0), 0);
  if (!total) return <span className="stm-radar-quiet">未提供分布</span>;
  return <div className="stm-radar-distribution"><div className="stm-radar-chainbar" role="img" aria-label={chains.map(chain => `${chainName(chain.chain)} ${money(chain.valueUsd)}`).join("，")}>{chains.map(chain => <span key={chain.chain} style={{ width: `${chain.valueUsd! / total * 100}%`, background: chainColors[chain.chain] ?? "#8b96aa" }} title={`${chainName(chain.chain)} · ${money(chain.valueUsd)}${trader.chainsScope === "reported" ? "" : " · 已披露部分"}`} />)}</div><div>{chains.slice(0, 3).map(chain => <span key={chain.chain}><i style={{ background: chainColors[chain.chain] ?? "#8b96aa" }} />{chainName(chain.chain)} <b>{Math.round(chain.valueUsd! / total * 100)}%</b></span>)}</div><small title="占比仅在来源已提供的链金额之间计算，不代表完整钱包配置">{trader.chainsScope === "reported" ? "已提供链内占比" : "已披露部分分布"}</small></div>;
}
type SharedHolding = {
  asset: string; symbol: string; chain: string; address: string; logoUrl?: string | null;
  valueUsd: number | null; holders: number; partial: boolean; reported: boolean;
  holderIds?: string[]; sourceUpdatedAt?: string | null;
  socialLinks?: Array<{ label: string; url: string }>;
  holderDetails?: Array<{id:string; name:string|null; valueUsd:number|null; wallet:string|null}>;
};
function reportedSharedHolding(holding: StmHolding) {
  return holding.side === "spot" && !!holding.chain && !!holding.address && finite(holding.valueUsd) && holding.valueUsd >= 500 && (holding.quantity === null || (finite(holding.quantity) && holding.quantity > 0));
}
function sharedHoldings(traders: RadarTrader[]) {
  const assets = new Map<string, SharedHolding & { identities: Set<string> }>();
  for (const trader of traders) {
    if (!["public", "truncated"].includes(trader.visibility)) continue;
    const identity = trader.address ? (/^0x/.test(trader.address) ? trader.address.toLowerCase() : trader.address) : trader.id;
    for (const holding of trader.holdings as RadarHolding[]) {
      if (!reportedSharedHolding(holding) || !holding.chain || !holding.address || !finite(holding.valueUsd)) continue;
      const current = assets.get(holding.asset) ?? { asset: holding.asset, symbol: holding.symbol, chain: holding.chain, address: holding.address, logoUrl: holding.logoUrl, valueUsd: 0, holders: 0, partial: false, reported: false, identities: new Set<string>() };
      if (current.identities.has(identity)) continue;
      current.identities.add(identity); current.valueUsd = (current.valueUsd ?? 0) + holding.valueUsd; current.holders += 1; current.partial ||= trader.visibility === "truncated";
      assets.set(holding.asset, current);
    }
  }
  return [...assets.values()].filter(asset => asset.holders >= 2).sort((a, b) => b.holders - a.holders || (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}

function initialFomoBoard(data: StmDashboard): StmRadarBoard | null {
  const source = data.sources.find(item => item.id === "wsm-fomo");
  const traders = (data.traders as RadarTrader[]).filter(trader => trader.source === "wsm-fomo")
    .map((trader): RadarTrader => {
      const holdingsTime = Number.isFinite(milliseconds(trader.updatedAt)) ? trader.updatedAt : null;
      const missingLegacySnapshot = trader.totalValueUsd === 0 && !holdingsTime && !trader.holdings.length &&
        !trader.chains?.some(chain => finite(chain.valueUsd) && chain.valueUsd > 0);
      return { ...trader, detailReference: trader.id, sourceTraderIds: [...new Set([trader.id, ...(trader.sourceTraderIds ?? [])])],
        pnlWindow: "ALL-TIME", totalValueUsd: missingLegacySnapshot ? null : trader.totalValueUsd,
        holdingsCount: missingLegacySnapshot ? null : trader.holdingsCount,
        chains: missingLegacySnapshot ? [] : trader.chains,
        visibility: missingLegacySnapshot && trader.visibility !== "private" ? "empty" : trader.visibility,
        fieldSources: { ...trader.fieldSources, assets: { sourceId: "wsm-fomo", updatedAt: holdingsTime },
          holdings: { sourceId: "wsm-fomo", updatedAt: holdingsTime }, chains: { sourceId: "wsm-fomo", updatedAt: holdingsTime },
          profile: { sourceId: "wsm-fomo", updatedAt: null } } };
    })
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  if (!source || !traders.length) return null;
  return { venue: "fomo", period: "all", traders, source, checkedAt: source.checkedAt ?? source.fetchedAt,
    limitations: [], refreshAfterSeconds: 15, researchOnly: true };
}

export function retainRadarBoardOnFailure(prior: StmRadarBoard | undefined, result: StmRadarBoard): StmRadarBoard {
  if (prior?.venue === result.venue && prior.period === result.period && prior.traders.length && !result.traders.length && ["unavailable", "restricted"].includes(result.source.status)) {
    return { ...prior, checkedAt: result.checkedAt,
      source: { ...prior.source, status: "stale", checkedAt: result.source.checkedAt ?? result.checkedAt,
        message: `${result.source.message}；保留上次可用快照` }, limitations: result.limitations };
  }
  return result;
}

export function StmHuntRadar({ data, initialFocus, busy, onWatch, onRefresh, refreshing = false, lastSyncedAt, autoRefresh = true }: StmHuntRadarProps) {
  const [venue, setVenue] = useState<Venue>(initialFocus?.venue ?? "fomo");
  const [period, setPeriod] = useState<StmRadarPeriod>(initialFocus?.period ?? "all");
  const [boards, setBoards] = useState<Record<string, StmRadarBoard>>((): Record<string, StmRadarBoard> => {
    const seed = initialFomoBoard(data);
    return seed ? { "fomo:all": seed } : {};
  });
  const [researchDetails, setResearchDetails] = useState<Record<string, RadarTrader>>({});
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const consumedRefresh = useRef(0);
  const [query, setQuery] = useState(initialFocus?.query ?? "");
  const [visibility, setVisibility] = useState("all");
  const [chain, setChain] = useState(initialFocus?.chain ?? "all");
  const [sort, setSort] = useState("source");
  const [focusedTraderId, setFocusedTraderId] = useState<string | null>(initialFocus?.traderId ?? null);
  const [expanded, setExpanded] = useState<string | null>(initialFocus?.traderId ?? null);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const seed = initialFomoBoard(data);
    if (!seed) return;
    setBoards(previous => previous["fomo:all"] ? previous : { ...previous, "fomo:all": seed });
  }, [data]);
  const hasResearchBoard = researchVenues.includes(venue);
  const requestedPeriod = venue === "fomo" ? period : "all";
  const boardKey = `${venue}:${requestedPeriod}`;
  const researchBoard = boards[boardKey];
  useEffect(() => {
    if (!researchVenues.includes(venue)) { setBoardLoading(false); setBoardError(null); return; }
    let active = true, running = false;
    const controller = new AbortController();
    const manual = consumedRefresh.current !== refreshNonce;
    consumedRefresh.current = refreshNonce;
    const read = async (force: boolean) => {
      if (running) return;
      running = true; setBoardLoading(true); setBoardError(null);
      try {
        const query = new URLSearchParams({venue, period:requestedPeriod, ...(force ? {refresh:"1"} : {})});
        const response = await fetch(`/api/stm-hunt/radar?${query}`, {cache:"no-store", signal:AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)])});
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `榜单读取失败 (${response.status})`);
        if (result.venue !== venue || result.period !== requestedPeriod || !Array.isArray(result.traders) || !result.source) throw new Error("榜单响应不完整");
        if (active) setBoards(previous => {
          return { ...previous, [boardKey]: retainRadarBoardOnFailure(previous[boardKey], result as StmRadarBoard) };
        });
      } catch (error) {
        if (active && !controller.signal.aborted) setBoardError(error instanceof Error ? error.message : "榜单读取失败");
      } finally { running = false; if (active) setBoardLoading(false); }
    };
    void read(manual);
    const timer = autoRefresh ? window.setInterval(() => { if (document.visibilityState === "visible") void read(false); }, 15_000) : null;
    return () => { active = false; controller.abort(); if (timer !== null) window.clearInterval(timer); };
  }, [venue, requestedPeriod, boardKey, autoRefresh, refreshNonce]);
  const board = venues.find(item => item.id === venue)!;
  const venueTraders = useMemo(() => {
    const rows = hasResearchBoard ? researchBoard?.traders ?? [] : (data.traders as RadarTrader[]).filter(trader => trader.source === `wsm-${venue}`);
    return rows.map(row => mergeRadarResearchTrader(row, researchDetails[row.id]));
  }, [data.traders, venue, hasResearchBoard, researchBoard, researchDetails]);
  const sources = hasResearchBoard ? (researchBoard ? [researchBoard.source] : []) : data.sources.filter(source => source.id === `wsm-${venue}` || source.id === `holdings-${venue}`);
  const source = hasResearchBoard ? researchBoard?.source : sources.find(item => item.id === `wsm-${venue}`);
  const rosterKnown = !hasResearchBoard || (!!researchBoard && (researchBoard.traders.length > 0 || !["unavailable", "restricted"].includes(researchBoard.source.status)));
  const sourceTime = source?.updatedAt ?? null;
  const delayed = sources.some(feed => feed.status === "stale") || (Number.isFinite(milliseconds(sourceTime)) && now - milliseconds(sourceTime) > 3 * 3600_000);
  const shared = useMemo<SharedHolding[]>(() => {
    const reported = (data.sharedHoldings ?? []).filter(asset => asset.sourceId === `wsm-${venue}` && asset.reported && asset.address && asset.chain && asset.holdersCount >= 2);
    if (!reported.length) return sharedHoldings(venueTraders);
    return reported.map(asset => ({ asset: asset.id, symbol: asset.symbol, chain: asset.chain, address: asset.address, logoUrl: asset.logoUrl, valueUsd: asset.totalValueUsd, holders: asset.holdersCount, partial: false, reported: true, holderIds: asset.holderIds, holderDetails:asset.holders, sourceUpdatedAt: asset.sourceUpdatedAt, socialLinks: asset.socialLinks })).sort((a, b) => b.holders - a.holders || (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  }, [data.sharedHoldings, venueTraders, venue]);
  const activeAsset = shared.find(asset => asset.asset === activeAssetId) ?? null;
  const activeAssetRosterCount = activeAsset?.reported ? venueTraders.filter(trader => traderIdentities(trader).some(id => activeAsset.holderIds?.includes(id))).length : null;
  const reportedShared = shared.some(asset => asset.reported);
  const reportedAssetsByTrader = useMemo(() => {
    const assets = new Map<string, string[]>();
    for (const asset of shared) for (const id of asset.holderIds ?? []) assets.set(id, [...(assets.get(id) ?? []), asset.symbol, asset.address]);
    return assets;
  }, [shared]);
  const chainOptions = useMemo(() => [...new Set(venueTraders.flatMap(trader => [...trader.holdings.map(holding => holding.chain), ...(trader.chains?.map(item => item.chain) ?? [])]).filter((value): value is string => !!value))].sort(), [venueTraders]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = venueTraders.map((trader, index) => ({ trader, index })).filter(({ trader }) => {
      if (focusedTraderId && trader.id !== focusedTraderId) return false;
      const matchesText = !needle || [trader.name, trader.handle, trader.address, ...(trader.wallets?.map(wallet => wallet.address) ?? []), ...trader.holdings.flatMap(holding => [holding.symbol, holding.address]), ...traderIdentities(trader).flatMap(id => reportedAssetsByTrader.get(id) ?? [])].filter(Boolean).join(" ").toLowerCase().includes(needle);
      return matchesText && (visibility === "all" || (visibility === "known" ? ["public", "truncated"].includes(trader.visibility) && trader.holdings.length > 0 : trader.visibility === visibility)) && (chain === "all" || trader.holdings.some(holding => holding.chain === chain) || trader.chains?.some(item => item.chain === chain)) && (!activeAsset || (activeAsset.reported ? activeAssetRosterCount === 0 || traderIdentities(trader).some(id => activeAsset.holderIds?.includes(id)) : ["public", "truncated"].includes(trader.visibility) && trader.holdings.some(holding => holding.asset === activeAsset.asset && reportedSharedHolding(holding))));
    });
    return rows.sort((a, b) => {
      if (sort === "pnl") return (b.trader.pnlUsd ?? -Infinity) - (a.trader.pnlUsd ?? -Infinity) || a.index - b.index;
      if (sort === "value") return (comparableValue(b.trader) ?? -Infinity) - (comparableValue(a.trader) ?? -Infinity) || a.index - b.index;
      if (sort === "updated") return (milliseconds(b.trader.sourceUpdatedAt ?? b.trader.updatedAt) || 0) - (milliseconds(a.trader.sourceUpdatedAt ?? a.trader.updatedAt) || 0) || a.index - b.index;
      return (a.trader.rank ?? a.index + 1) - (b.trader.rank ?? b.index + 1);
    });
  }, [venueTraders, query, visibility, chain, activeAsset, activeAssetRosterCount, sort, reportedAssetsByTrader, focusedTraderId]);
  const known = venueTraders.filter(trader => ["public", "truncated"].includes(trader.visibility) && trader.holdings.length > 0).length;
  const equityBoard = ["hl", "binance", "lighter"].includes(venue);
  const officialAssets = venueTraders.filter(trader => finite(trader.totalValueUsd) && trader.valueBasis === (equityBoard ? "account-equity" : "wallet"));
  const officialTotal = officialAssets.length ? officialAssets.reduce((sum, trader) => sum + trader.totalValueUsd!, 0) : null;
  const applyResearch = useCallback((id:string, detail:RadarTrader) => {
    setResearchDetails(previous => previous[id] === detail ? previous : {...previous,[id]:detail});
  }, []);
  const refreshRadar = () => { setRefreshNonce(value => value + 1); void onRefresh(); };
  const selectVenue = (value: Venue) => { setVenue(value); setFocusedTraderId(null); setExpanded(null); setActiveAssetId(null); setChain("all"); setQuery(""); setVisibility("all"); setSort("source"); };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); setCopied(value); } catch { setCopied("failed"); } };
  const changedFilter = (update: () => void) => { update(); setFocusedTraderId(null); setExpanded(null); };
  return <section className="stm-radar" aria-labelledby="stm-radar-title">
    <header className="stm-radar-heading"><div><span className="stm-radar-eyebrow"><Radar size={13} /> SMART MONEY RADAR</span><h2 id="stm-radar-title">追踪聪明钱的<span>下一步</span></h2><p>六大平台 · 钱包、持仓与交易动态</p></div><div className="stm-radar-heading-actions"><span className="stm-radar-sync"><i className={autoRefresh ? "is-on" : ""} />{autoRefresh ? "自动同步中" : "自动同步已暂停"}</span><button type="button" className="stm-radar-refresh" onClick={refreshRadar} disabled={refreshing || boardLoading || !!busy}><RefreshCw size={14} className={refreshing || boardLoading ? "stm-radar-spin" : ""} />{refreshing || boardLoading ? "同步中" : "同步数据"}</button></div></header>
    <div className="stm-radar-venues" role="group" aria-label="交易员来源">{venues.map(item => { const cached = boards[`${item.id}:${item.id === "fomo" ? period : "all"}`]; const usesResearch = researchVenues.includes(item.id); const members = usesResearch ? cached?.traders : data.traders.filter(trader => trader.source === `wsm-${item.id}`); const feed = usesResearch ? cached?.source : data.sources.find(source => source.id === `wsm-${item.id}`); const membersKnown = !!members && (members.length > 0 || !usesResearch || (!!feed && !["unavailable", "restricted"].includes(feed.status))); return <button type="button" key={item.id} className={`stm-radar-venue${venue === item.id ? " is-active" : ""}`} aria-pressed={venue === item.id} onClick={() => selectVenue(item.id)} style={{ "--stm-radar-venue-color": item.color } as React.CSSProperties}><span className="stm-radar-venue-mark"><img src={item.asset} alt="" width={32} height={32} decoding="async"/></span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><span className="stm-radar-venue-count" title={membersKnown ? `${members!.length} 位来源交易员` : "榜单数量未知"}>{membersKnown ? count.format(members!.length) : "—"}<i className={`stm-radar-source-dot is-${feed?.status ?? "unread"}`} /></span></button>; })}</div>
    <div className={`stm-radar-feed-status${delayed ? " is-delayed" : ""}`}><div><Clock3 size={14} /><strong title={boardError ?? source?.message}>{boardError ? "榜单读取失败" : boardLoading && !source ? "正在读取榜单" : source?.status === "unavailable" ? "来源暂时不可用" : source?.status === "restricted" ? "来源需要授权" : delayed ? "来源快照更新滞后" : sourceTime ? "来源快照已接入" : "来源时间待核验"}</strong><span>{source?.timestampBasis === "version" ? "来源版本" : "源快照"} {timestamp(sourceTime)} <em>{ageLabel(sourceTime, now)}</em></span></div><div><span>服务端读取 {timestamp(source?.checkedAt ?? source?.fetchedAt)}</span><span>本页同步 {timestamp(hasResearchBoard ? researchBoard?.checkedAt : lastSyncedAt, true)}</span><small>UTC+8</small></div></div>
    <div className="stm-radar-summary"><div><span><Users size={14} />当前榜单</span><strong>{rosterKnown ? count.format(venueTraders.length) : "—"}<small>位交易员</small></strong><p>{board.title} · 平台内独立观察</p></div><div><span><Wallet size={14} />{equityBoard ? "来源报告账户权益" : "来源报告链上资产"}</span><strong>{money(officialTotal, true)}</strong><p>{officialAssets.length ? `${officialAssets.length}/${venueTraders.length} 位提供${equityBoard ? "账户权益" : "钱包总额"} · 按交易员汇总` : `未提供完整${equityBoard ? "账户权益" : "钱包总额"}，保留未知`}</p></div><div><span><Eye size={14} />榜单已披露持仓</span><strong>{rosterKnown ? known : "—"}<small>/ {rosterKnown ? venueTraders.length : "—"}</small></strong><p>仅统计当前榜单记录</p></div><div><span><Layers3 size={14} />已知共同持仓</span><strong>{shared.length}<small>种资产</small></strong><p>{reportedShared ? "来源报告的持有人交集" : "至少 2 位持有 · 单人 ≥ $500"}</p></div></div>
    <div className="stm-radar-layout"><div className="stm-radar-main"><section className="stm-radar-board"><div className="stm-radar-board-title"><div><h3>{board.title}<span>交易员榜单</span></h3></div>{safeUrl(source?.url) ? <a href={safeUrl(source?.url)} target="_blank" rel="noreferrer">查看来源 <ArrowUpRight size={13} /></a> : null}</div>{venue === "fomo" ? <div className="stm-radar-periods" role="group" aria-label="FOMO收益周期">{periods.map(item => <button type="button" key={item.id} aria-pressed={period === item.id} className={period === item.id ? "is-active" : ""} onClick={() => {setPeriod(item.id);setFocusedTraderId(null);setExpanded(null);setSort("source");}}>{item.label}</button>)}<span>{boardLoading ? "读取中…" : rosterKnown ? `${count.format(venueTraders.length)} 位交易员` : "数量未知"}</span></div> : null}<div className="stm-radar-toolbar"><label className="stm-radar-search"><Search size={15} /><input aria-label="搜索当前来源的交易员或持仓" placeholder="搜索交易员、@handle、钱包或代币" value={query} onChange={event => changedFilter(() => setQuery(event.target.value))} /></label><label className="stm-radar-select"><SlidersHorizontal size={13} /><select aria-label="持仓披露筛选" value={visibility} onChange={event => changedFilter(() => setVisibility(event.target.value))}><option value="all">全部持仓状态</option><option value="known">有已知持仓</option><option value="public">完整公开</option><option value="truncated">部分披露</option><option value="private">私密持仓</option><option value="empty">未提供持仓</option></select></label><label className="stm-radar-select stm-radar-chain-select"><Layers3 size={13} /><select aria-label="按链筛选" value={chain} onChange={event => changedFilter(() => setChain(event.target.value))}><option value="all">全部链</option>{chainOptions.map(value => <option key={value} value={value}>{chainName(value)}</option>)}</select></label><label className="stm-radar-select"><ArrowDownUp size={13} /><select aria-label="当前来源排序" value={sort} onChange={event => changedFilter(() => setSort(event.target.value))}><option value="source">来源顺序</option><option value="pnl">收益从高到低</option><option value="value">披露金额从高到低</option><option value="updated">来源更新时间</option></select></label></div>
      {activeAsset ? <div className="stm-radar-active-filter"><span>{activeAsset.reported && activeAssetRosterCount === 0 ? "来源共同持仓 " : "正在查看持有 "}<strong>{activeAsset.symbol}</strong>{activeAsset.reported && activeAssetRosterCount === 0 ? " · 本榜未提供身份映射" : " 的交易员"} <small>{chainName(activeAsset.chain)} · {short(activeAsset.address)}{activeAsset.reported ? ` · 来源报告 ${activeAsset.holders} 人，本榜映射 ${activeAssetRosterCount} 人` : " · 公开片段下界"}</small></span><button type="button" onClick={() => changedFilter(() => setActiveAssetId(null))} aria-label="清除共同持仓筛选"><X size={13} />清除筛选</button></div> : null}
      {focusedTraderId ? <div className="stm-radar-active-filter"><span>终端联动 · {venueTraders.find(trader => trader.id === focusedTraderId)?.name ?? "所选交易员"}</span><button type="button" onClick={() => { setFocusedTraderId(null); setExpanded(null); setQuery(""); setChain("all"); setVisibility("all"); }}>返回完整榜单 <X size={12} /></button></div> : null}
      <div className="stm-radar-table-wrap"><table className="stm-radar-table"><thead><tr><th scope="col">#</th><th scope="col">交易员</th><th scope="col">来源收益 <span>USD / 原始窗口</span></th><th scope="col">资产 / 仓位金额</th><th scope="col">交易概览</th><th scope="col">链分布</th><th scope="col">主要持仓</th><th scope="col"><span className="stm-radar-sr-only">收藏与详情</span></th></tr></thead><tbody>{filtered.map(({ trader, index }) => { const value = displayedValue(trader); const holdings = [...trader.holdings as RadarHolding[]].sort((a, b) => (b.valueUsd ?? -Infinity) - (a.valueUsd ?? -Infinity)); const watched = data.state.watchlist.includes(trader.id); const isExpanded = expanded === trader.id; return <TraderRows key={trader.id} trader={trader} rank={trader.rank ?? index + 1} value={value} holdings={holdings} watched={watched} expanded={isExpanded} busy={!!busy} copied={copied} onCopy={copy} refreshNonce={refreshNonce} autoRefresh={autoRefresh} onResearch={applyResearch} onWatch={() => void onWatch(trader.id, !watched)} onExpand={() => setExpanded(isExpanded ? null : trader.id)} />; })}</tbody></table></div>
      {!filtered.length ? <div className="stm-radar-empty"><Radar size={30} /><h4>{boardLoading && !venueTraders.length ? "正在读取榜单" : venueTraders.length ? "没有匹配的交易员" : "等待来源数据"}</h4><p>{venueTraders.length ? "调整关键词、链或持仓状态，重新查看当前来源。" : "来源恢复后将在这里展示真实榜单，不以演示数据填充。"}</p>{venueTraders.length ? <button type="button" onClick={() => { setFocusedTraderId(null); setQuery(""); setChain("all"); setVisibility("all"); setActiveAssetId(null); }}>清除筛选</button> : null}</div> : null}
      <div className="stm-radar-results-count">{rosterKnown ? <>显示 <strong>{count.format(filtered.length)}</strong> / {count.format(venueTraders.length)} 位交易员</> : "榜单数量未知"}</div></section>
      </div>
      <aside className="stm-radar-sidebar"><section className="stm-radar-shared"><header><span className="stm-radar-eyebrow"><Layers3 size={13} /> SHARED HOLDINGS</span><h3>公开已知共同持仓 <b>{shared.length}</b></h3><p>{reportedShared ? `WSM · ${timestamp(shared.find(asset=>asset.reported)?.sourceUpdatedAt)}` : "至少 2 位交易员 · 单人持有 ≥ $500"}</p></header>{activeAsset?.reported ? <div className="stm-radar-shared-selection"><div><strong>{activeAsset.symbol}</strong><button type="button" onClick={()=>setActiveAssetId(null)} aria-label="关闭共同持仓详情"><X size={12}/></button></div><p>{chainName(activeAsset.chain)} · {short(activeAsset.address)} <button type="button" onClick={()=>void copy(activeAsset.address)} aria-label="复制共同持仓合约">{copied===activeAsset.address?<Check size={11}/>:<Copy size={11}/>}</button></p><small>来源 {timestamp(activeAsset.sourceUpdatedAt)}</small><div className="stm-radar-shared-links">{activeAsset.socialLinks?.filter(link=>safeUrl(link.url)).slice(0,4).map(link=><a key={link.url} href={safeUrl(link.url)} target="_blank" rel="noreferrer">{link.label}<ArrowUpRight size={10}/></a>)}</div><ul>{activeAsset.holderDetails?.map(holder=><li key={holder.id}><span>{holder.name??holder.id.replace(/^wsm:fomo:/,'')}</span><b>{money(holder.valueUsd,true)}</b></li>)}</ul></div>:null}<div className="stm-radar-shared-list">{shared.length ? shared.map(asset => <button type="button" key={asset.asset} className={`stm-radar-shared-card${activeAsset?.asset === asset.asset ? " is-active" : ""}`} onClick={() => changedFilter(() => setActiveAssetId(activeAsset?.asset === asset.asset ? null : asset.asset))} aria-pressed={activeAsset?.asset === asset.asset}><div><Avatar src={asset.logoUrl} name={asset.symbol} small /><span><strong>{asset.symbol}</strong><small>{chainName(asset.chain)}</small></span><ChevronRight size={14} /></div><div><span><Users size={12} />{asset.reported ? "来源报告 " : "至少 "}{asset.holders} 人</span><strong>{money(asset.valueUsd, true)}</strong></div><code title={asset.address}>{short(asset.address)}</code></button>) : <div className="stm-radar-shared-empty"><Layers3 size={27} /><strong>等待公开交集</strong><p>当前来源尚无符合金额与身份条件的共同持仓。</p></div>}</div><footer>{reportedShared ? "来源报告的持有人；已核实身份的记录可联动本榜。" : "公开持仓片段的交集；人数与金额为已知下界。"}</footer></section></aside></div>
    <span className="stm-radar-sr-only" role="status" aria-live="polite">{copied === "failed" ? "复制失败，请展开详情选择完整地址" : copied ? "已复制完整地址" : ""}</span>
  </section>;
}

function TraderRows({ trader, rank, value, holdings, watched, expanded, busy, copied, onCopy, onWatch, onExpand, refreshNonce, autoRefresh, onResearch }: {
  trader:RadarTrader; rank:number; value:ReturnType<typeof displayedValue>; holdings:RadarHolding[];
  watched:boolean; expanded:boolean; busy:boolean; copied:string|null; onCopy:(address:string)=>void;
  onWatch:()=>void; onExpand:()=>void; refreshNonce:number; autoRefresh:boolean; onResearch:(id:string, detail:RadarTrader)=>void;
}) {
  const displayHandle = trader.fomoHandle ?? trader.handle;
  const handle = displayHandle ? '@'+displayHandle.replace(/^@/, '') : trader.address ? short(trader.address) : null;
  return <>
    <tr className={expanded ? 'is-expanded' : undefined}>
      <td className="stm-radar-rank">{rank}</td>
      <td><div className="stm-radar-identity"><Avatar src={trader.avatarUrl} name={trader.name}/><div>
        <button type="button" className="stm-radar-trader-name" onClick={onExpand} aria-expanded={expanded}>{trader.name}</button>
        <span className="stm-radar-handle">{handle ?? trader.venue.toUpperCase()+' 交易员'}</span>
        <div className="stm-radar-row-tags"><span className={'is-'+trader.visibility}>{visibilityNames[trader.visibility]}</span>{trader.tags.filter(Boolean).slice(0,1).map(tag=><span key={tag}>{tag}</span>)}</div>
      </div></div></td>
      <td><strong className={'stm-radar-pnl'+(finite(trader.pnlUsd) && trader.pnlUsd>0 ? ' is-positive' : finite(trader.pnlUsd) && trader.pnlUsd<0 ? ' is-negative' : '')}>{money(trader.pnlUsd,true)}</strong><span className="stm-radar-pnl-window" title={trader.pnlWindow}>{trader.pnlWindow}</span>{finite(trader.roi) ? <small className="stm-radar-roi">{trader.roi.toFixed(2)}%</small> : null}</td>
      <td><strong className="stm-radar-value" title={`${trader.totalValueLabel ?? "来源报告金额"} · ${timestamp(trader.fieldSources?.assets ? trader.fieldSources.assets.updatedAt : trader.updatedAt)}`}>{trader.visibility==='private' && value.value===null ? '未公开' : money(value.value,true)}</strong><span className="stm-radar-value-label">{value.label}{value.partial && value.value!==null ? ' · 已知部分' : ''}</span>{trader.holdingsCount!=null ? <small className="stm-radar-position-count">{trader.holdingsCount} 项来源记录</small> : null}</td>
      <td><div className="stm-radar-trader-stats"><span><Users size={11}/><b>{finite(trader.followers) ? count.format(trader.followers) : '—'}</b>关注者</span><span><b>{finite(trader.tradeCount) ? count.format(trader.tradeCount) : '—'}</b>笔成交</span><span>成交量 <b>{money(trader.volumeUsd,true)}</b></span><small>{trader.statsScope==='period' ? '当前周期' : trader.statsScope==='profile' ? '资料页统计' : '来源统计'}</small></div></td><td><ChainDistribution trader={trader}/></td>
      <td><div className="stm-radar-token-list">{trader.visibility==='private' ? <span className="stm-radar-quiet"><LockKeyhole size={13}/>持仓未公开</span> : holdings.length ? holdings.slice(0,3).map(holding=><button type="button" key={holding.asset+':'+holding.side} onClick={onExpand} title={holding.symbol+(holding.address ? ' · '+holding.address : '')+' · '+money(holding.valueUsd)+' · 来源 '+timestamp(holding.sourceUpdatedAt === undefined ? trader.updatedAt : holding.sourceUpdatedAt)}><Avatar src={holding.logoUrl} name={holding.symbol} small/><span>{holding.symbol}</span>{holding.side!=='spot' ? <i className={holding.side==='short' ? 'is-short' : 'is-long'}>{holding.side==='short' ? '空' : '多'}</i> : null}<small>{money(holding.valueUsd,true)}</small></button>) : <button type="button" className="stm-radar-load-detail" onClick={onExpand}>查看钱包与持仓 <ChevronRight size={11}/></button>}</div></td>
      <td><div className="stm-radar-row-actions"><button type="button" className={watched ? 'is-watched' : ''} onClick={onWatch} disabled={busy} aria-label={(watched ? '取消收藏' : '收藏')+'交易员 '+trader.name} aria-pressed={watched} title={watched ? '取消收藏交易员' : '收藏交易员'}><Star size={15} fill={watched ? 'currentColor' : 'none'}/></button><button type="button" className={expanded ? 'is-open' : ''} onClick={onExpand} aria-label={(expanded ? '收起' : '展开')+' '+trader.name+' 详情'} aria-expanded={expanded}><ChevronDown size={15}/></button></div></td>
    </tr>
    {expanded ? <tr className="stm-radar-detail-row"><td colSpan={8}><TraderResearchDetail trader={trader} copied={copied} onCopy={onCopy} refreshNonce={refreshNonce} autoRefresh={autoRefresh} onResearch={onResearch}/></td></tr> : null}
  </>;
}

function TraderResearchDetail({trader,copied,onCopy,refreshNonce,autoRefresh,onResearch}: {trader:RadarTrader;copied:string|null;onCopy:(value:string)=>void;refreshNonce:number;autoRefresh:boolean;onResearch:(id:string,detail:RadarTrader)=>void}) {
  const [research,setResearch]=useState<StmTraderResearch|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [retry,setRetry]=useState(0);
  const lastManual=useRef(refreshNonce);
  const lastRetry=useRef(0);
  const reference=trader.detailReference ?? (trader.venue==='fomo' ? trader.fomoHandle ?? trader.handle : trader.address);
  const venue=trader.venue;
  const canFetch=researchVenues.includes(venue as Venue) && !!reference;
  useEffect(()=>{
    if(!canFetch || !reference)return;
    let active=true,running=false;
    const controller=new AbortController();
    const manual=lastManual.current!==refreshNonce || lastRetry.current!==retry;
    lastManual.current=refreshNonce;lastRetry.current=retry;
    const read=async(force:boolean)=>{
      if(running)return;running=true;setLoading(true);setError(null);
      try {
        const query=new URLSearchParams({venue,reference,...(force?{refresh:'1'}:{})});
        const response=await fetch('/api/stm-hunt/trader?'+query,{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(40_000)])});
        const result=await response.json();
        if(!response.ok)throw Error(typeof result.error==='string'?result.error:'详情读取失败 ('+response.status+')');
        if(result.venue!==venue || !(venue!=='fomo' && /^0x[0-9a-fA-F]{40}$/.test(reference) ? typeof result.reference==='string' && result.reference.toLowerCase()===reference.toLowerCase() : result.reference===reference) || !result.source || !Array.isArray(result.activities))throw Error('详情响应不完整');
        if(result.trader && (result.trader.id!==trader.id || result.trader.venue!==venue))throw Error('资料身份与榜单不一致，未合并钱包或持仓');
        if(!result.componentUpdatedAt || !Array.isArray(result.pnlPositions) || !Array.isArray(result.limitations))throw Error('详情响应不完整');
        if(active)setResearch(result as StmTraderResearch);
      }catch(cause){if(active && !controller.signal.aborted)setError(cause instanceof Error?cause.message:'详情读取失败');}
      finally{running=false;if(active)setLoading(false);}
    };
    void read(manual);
    const timer=autoRefresh?window.setInterval(()=>{if(document.visibilityState==='visible')void read(false);},15_000):null;
    return()=>{active=false;controller.abort();if(timer!==null)window.clearInterval(timer);};
  },[venue,reference,trader.id,canFetch,autoRefresh,refreshNonce,retry]);
  useEffect(()=>{if(research?.trader)onResearch(trader.id,research.trader);},[research,onResearch,trader.id]);
  const detail=mergeRadarResearchTrader(trader,research?.trader);
  const profile=safeUrl(detail.profileUrl);
  const links=[...new Map((detail.socialLinks??[]).filter(link=>safeUrl(link.url)).map(link=>[link.url,link])).values()];
  const wallets: NonNullable<RadarTrader['wallets']>=detail.wallets?.length ? detail.wallets : detail.address ? [{address:detail.address,chain:'来源地址',explorerUrl:null}] : [];
  const holdings=[...detail.holdings].sort((a,b)=>(b.valueUsd??-Infinity)-(a.valueUsd??-Infinity));
  const holdingsUpdatedAt=detail.updatedAt ?? detail.holdings.find(holding=>holding.sourceUpdatedAt)?.sourceUpdatedAt ?? null;
  const activities=research?.activities??[];
  const actionNames={buy:'买入',sell:'卖出',open:'开仓',add:'加仓',reduce:'减仓',close:'平仓'};
  return <div className="stm-radar-trader-detail">
    <div className="stm-radar-detail-heading"><div><Avatar src={detail.avatarUrl} name={detail.name}/><span><h4>{detail.name}</h4><small>{detail.fomoHandle || detail.handle ? '@'+(detail.fomoHandle ?? detail.handle) : '交易员详情'} · {loading?'同步中…':'读取 '+timestamp(research?.checkedAt ?? detail.fetchedAt,true)}</small></span></div>{canFetch?<button type="button" onClick={()=>setRetry(value=>value+1)} disabled={loading}><RefreshCw size={12} className={loading?'stm-radar-spin':''}/>刷新详情</button>:null}</div>
    {error ? <p className="stm-radar-detail-error" role="status">{error.slice(0,180)}{research?' · 保留已读取资料':''}</p> : null}
    {research ? <details className={"stm-radar-research-source"+(research.source.status!=="ok"?" is-delayed":"")}><summary><span>{research.source.status==="ok"?"来源已接入":research.source.status==="stale"?"来源滞后 · 保留快照":research.source.status==="restricted"?"来源需要授权":"来源暂不可用"}</span><span>源时间 {timestamp(research.source.updatedAt)} <ChevronDown size={11}/></span></summary><div><p>{research.source.message}</p>{research.sources?.map(feed=><p key={feed.id}>{feed.name} · {feed.status === "ok" ? "已接入" : feed.status === "stale" ? "历史快照" : feed.status === "restricted" ? "需要授权" : "暂不可用"} · 来源 {timestamp(feed.updatedAt)}<span title={feed.message}> · {feed.id}</span></p>)}{research.limitations.map((note,index)=><p key={index}>{note}</p>)}</div></details> : null}
    <section className="stm-radar-detail-identity"><span className="stm-radar-eyebrow">PROFILE & WALLETS</span><p className="stm-radar-component-time">资料来源 {timestamp(research ? research.componentUpdatedAt.profile : detail.fieldSources?.profile?.updatedAt)}</p>
      <div className="stm-radar-profile-links">{profile?<a href={profile} target="_blank" rel="noreferrer">{venue==='fomo'?'FOMO主页':'平台主页'}<ExternalLink size={12}/></a>:null}{links.map(link=><a key={link.url} href={safeUrl(link.url)} target="_blank" rel="noreferrer">{link.label}<ArrowUpRight size={12}/></a>)}</div>
      {detail.bio?<p className="stm-radar-profile-bio">{detail.bio}</p>:null}
      <div className="stm-radar-detail-mini-stats"><span>关注者 <b>{finite(detail.followers)?count.format(detail.followers):'—'}</b></span><span>成交 <b>{finite(detail.tradeCount)?count.format(detail.tradeCount):'—'}</b></span><span>成交量 <b>{money(detail.volumeUsd,true)}</b></span></div>
      <h4 className="stm-radar-detail-subtitle">钱包地址</h4>
      {wallets.length?wallets.map(wallet=>{
        const sourceId=wallet.sourceId ?? detail.source;
        const sourceName=sourceId.startsWith('wsm-')?'WSM 历史':sourceId==='985-fomo-profile'?'985monitor':venues.find(item=>item.id===venue)?.title ?? '来源';
        const sourceTime=wallet.sourceUpdatedAt===undefined?research?.componentUpdatedAt.wallets:wallet.sourceUpdatedAt;
        return <div key={wallet.chain+':'+wallet.address}><div className="stm-radar-wallet-address"><span>{chainName(wallet.chain)}</span><code>{wallet.address}</code><button type="button" onClick={()=>onCopy(wallet.address)} aria-label={'复制完整地址 '+wallet.address}>{copied===wallet.address?<Check size={12}/>:<Copy size={12}/>}</button>{safeUrl(wallet.explorerUrl)?<a href={safeUrl(wallet.explorerUrl)} target="_blank" rel="noreferrer" aria-label="在区块浏览器查看地址"><ArrowUpRight size={12}/></a>:null}</div><p className="stm-radar-component-time">{sourceName} · 来源时间 {timestamp(sourceTime)}</p></div>;
      }):<p className="stm-radar-detail-muted">{loading?'正在读取钱包…':'来源未提供钱包地址'}</p>}
    </section>
    <section className="stm-radar-detail-holdings"><h4>持仓快照 <span>{holdings.length} 项{detail.visibility==='truncated'?' · 部分披露':detail.visibility==='private'?' · 私密':''}</span></h4><p className="stm-radar-component-time">来源 {timestamp(holdingsUpdatedAt)}</p>
      {holdings.length?holdings.map(holding=><div key={holding.asset+':'+holding.side}><span className="stm-radar-detail-token"><Avatar src={holding.logoUrl} name={holding.symbol} small/><span><strong>{holding.symbol}</strong><small>{holding.chain?chainName(holding.chain):'链未提供'}{holding.side!=='spot'?' · '+(holding.side==='short'?'空头':'多头'):''}</small>{holding.address?<code title={holding.address}>{short(holding.address)}</code>:null}</span></span><span><strong>{money(holding.valueUsd)}</strong><small>{finite(holding.quantity)?holding.quantity.toLocaleString('en-US',{maximumFractionDigits:6})+' '+holding.symbol:'数量未提供'}</small></span>{holding.address?<button type="button" onClick={()=>onCopy(holding.address!)} aria-label={'复制 '+holding.symbol+' 完整合约地址'}>{copied===holding.address?<Check size={12}/>:<Copy size={12}/>}</button>:null}</div>):<p className="stm-radar-detail-muted">{loading?'正在读取持仓…':detail.visibility==='private'?'持仓未公开':'来源未提供持仓快照'}</p>}
    </section>
    <section className="stm-radar-detail-activity"><header><div><h4>交易动态 <span>{activities.length}</span></h4><small>来源成交记录 · 非链上逐笔复核</small></div><span>来源 {timestamp(research?.componentUpdatedAt.activities)}</span></header>
      {activities.length?<div className="stm-radar-activity-list">{activities.map(activity=><article key={activity.id}><span className={'stm-radar-activity-action is-'+activity.action}>{actionNames[activity.action]}</span><div><strong>{activity.symbol}</strong><small>{activity.chain?chainName(activity.chain):'链未提供'}{activity.side!=='spot'?' · '+(activity.side==='short'?'空头':'多头'):''}{activity.address?' · '+short(activity.address):''}</small></div><div><strong>{money(activity.valueUsd)}</strong><small>{finite(activity.quantity)?activity.quantity.toLocaleString('en-US',{maximumFractionDigits:6})+' '+activity.symbol:'数量未提供'}</small></div><time>{timestamp(activity.occurredAt,true)}</time>{safeUrl(activity.transactionUrl)?<a href={safeUrl(activity.transactionUrl)} target="_blank" rel="noreferrer" aria-label={'查看 '+activity.symbol+' 交易'}><ArrowUpRight size={13}/></a>:activity.transactionHash?<button type="button" onClick={()=>onCopy(activity.transactionHash!)} aria-label="复制交易哈希">{copied===activity.transactionHash?<Check size={12}/>:<Copy size={12}/>}</button>:<span/>}</article>)}</div>:<p className="stm-radar-detail-muted">{loading?'正在读取交易动态…':'暂无来源成交记录'}</p>}
    </section>
    {research?.pnlPositions.length?<details className="stm-radar-pnl-history"><summary>历史盈亏记录 <span>{research.pnlPositions.length} 项 · {timestamp(research.componentUpdatedAt.pnl)}</span><ChevronDown size={13}/></summary><div>{research.pnlPositions.map((position,index)=><article key={(position.address??position.symbol)+':'+index}><span><strong>{position.symbol}</strong><small>{position.chain?chainName(position.chain):'链未提供'}{position.closedAt?' · '+timestamp(position.closedAt):''}</small></span><span><strong className={finite(position.pnlUsd)&&position.pnlUsd<0?'is-negative':'is-positive'}>{money(position.pnlUsd)}</strong><small>已实现 {money(position.realizedPnlUsd)} · 未实现 {money(position.unrealizedPnlUsd)}</small></span></article>)}</div></details>:null}
  </div>;
}
