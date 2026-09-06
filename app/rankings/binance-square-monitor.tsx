"use client";

import Image from "next/image";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Gem,
  MessageSquare,
  Radio,
  RefreshCw,
  Search,
  Star,
  UsersRound,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SquareRadarCreator, SquareRadarSnapshot } from "@/lib/binance-square-radar-types";
import styles from "./binance-square-monitor.module.css";

type CreatorFilter = "all" | "followed" | "featured";
type SortKey = "name" | "liveStartAt" | "onlineNow" | "maxOnline" | "viewers" | "chatCount" | "subscribeCount" | "tipAmount";
type SortDirection = "asc" | "desc";

const FOLLOW_STORAGE_KEY = "welinkbtc:qilu:square-radar:follows:v1";
const PAGE_SIZE = 50;

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return String(Math.round(value * 10) / 10);
}

function durationLabel(startAt: number | null, fetchedAt: string) {
  if (!startAt) return "—";
  const elapsed = Math.max(0, Math.floor((new Date(fetchedAt).getTime() / 1_000 - startAt) / 60));
  const days = Math.floor(elapsed / 1_440);
  const hours = Math.floor((elapsed % 1_440) / 60);
  const minutes = elapsed % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function timeLabel(timestamp: number | null) {
  if (!timestamp) return "—";
  return new Date(timestamp * 1_000).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
}

function compareCreators(a: SquareRadarCreator, b: SquareRadarCreator, key: SortKey) {
  if (key === "name") return a.name.localeCompare(b.name, "zh-CN");
  const left = key === "liveStartAt" ? a.liveStartAt ?? 0 : a[key];
  const right = key === "liveStartAt" ? b.liveStartAt ?? 0 : b[key];
  return left - right;
}

function SortHeading({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      aria-label={`${label}，${active ? (direction === "desc" ? "降序" : "升序") : "点击排序"}`}
      className={active ? styles.activeSort : ""}
      onClick={() => onSort(sortKey)}
      type="button"
    >
      {label}<span aria-hidden="true">{active ? (direction === "desc" ? "↓" : "↑") : "↕"}</span>
    </button>
  );
}

function CreatorIdentity({ creator, followed, onToggle }: { creator: SquareRadarCreator; followed: boolean; onToggle: () => void }) {
  return (
    <div className={styles.creatorIdentity}>
      <button
        aria-label={`${followed ? "取消关注" : "关注"}${creator.name}`}
        className={`${styles.followButton} ${followed ? styles.followed : ""}`}
        onClick={onToggle}
        title="关注仅保存在当前浏览器"
        type="button"
      >
        <Star aria-hidden="true" />
      </button>
      {creator.avatar ? (
        <Image alt="" className={styles.avatar} height={40} loading="lazy" src={creator.avatar} unoptimized width={40} />
      ) : (
        <span className={styles.avatarFallback} aria-hidden="true">{creator.name.slice(0, 1)}</span>
      )}
      <div>
        <strong>{creator.name}{creator.featured ? <Gem aria-label="精选主播" /> : null}</strong>
        <p>{creator.liveTitle || "当前未开播"}</p>
        {creator.coins.length ? (
          <div className={styles.coinTags}>
            {creator.coins.slice(0, 3).map((coin, index) => {
              const content = <><b>{coin.coin}</b>{coin.change === null ? null : <span data-negative={coin.change < 0}>{coin.change >= 0 ? "+" : ""}{coin.change.toFixed(2)}%</span>}</>;
              return coin.webLink ? (
                <a href={coin.webLink} key={`${creator.id}-${coin.coin}-${index}`} rel="noopener noreferrer" target="_blank">{content}</a>
              ) : <span key={`${creator.id}-${coin.coin}-${index}`}>{content}</span>;
            })}
            {creator.coins.length > 3 ? <small>+{creator.coins.length - 3}</small> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BinanceSquareMonitor({ initialSnapshot }: { initialSnapshot: SquareRadarSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CreatorFilter>("all");
  const [categoryId, setCategoryId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("onlineNow");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [followedIds, setFollowedIds] = useState<Set<string>>(() => new Set());
  const [followsLoaded, setFollowsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FOLLOW_STORAGE_KEY) ?? "[]");
      if (Array.isArray(saved)) setFollowedIds(new Set(saved.filter((id): id is string => typeof id === "string").slice(0, 500)));
    } catch {
      window.localStorage.removeItem(FOLLOW_STORAGE_KEY);
    } finally {
      setFollowsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!followsLoaded) return;
    try {
      window.localStorage.setItem(FOLLOW_STORAGE_KEY, JSON.stringify([...followedIds].slice(0, 500)));
    } catch {
      // A local follow is optional; a storage failure must not break the live monitor.
    }
  }, [followedIds, followsLoaded]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/rankings/binance-square", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const nextSnapshot = await response.json() as SquareRadarSnapshot;
      if (!Array.isArray(nextSnapshot.creators)) throw new Error("Invalid response");
      setSnapshot(nextSnapshot);
    } catch {
      setRefreshError("刷新失败，已保留当前快照。稍后会自动重试。");
    } finally {
      window.clearTimeout(timeout);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  const visibleCreators = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return snapshot.creators
      .filter((creator) => {
        if (filter === "followed" && !followedIds.has(creator.id)) return false;
        if (filter === "featured" && !creator.featured && !creator.recommended) return false;
        if (categoryId && !creator.categoryIds.includes(categoryId)) return false;
        if (!normalizedQuery) return true;
        const coinNames = creator.coins.map((coin) => coin.coin).join(" ");
        return `${creator.name} ${creator.liveTitle} ${creator.tags.join(" ")} ${coinNames}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        const order = compareCreators(a, b, sortKey);
        return direction === "asc" ? order : -order;
      });
  }, [categoryId, direction, filter, followedIds, query, snapshot.creators, sortKey]);

  const pageCount = Math.max(1, Math.ceil(visibleCreators.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageCreators = visibleCreators.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const changeSort = (key: SortKey) => {
    setPage(1);
    if (sortKey === key) setDirection((current) => current === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setDirection(key === "name" ? "asc" : "desc");
    }
  };

  const toggleFollow = (id: string) => {
    setFollowedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={styles.monitor}>
      <section className={styles.liveSummary} aria-label="币安广场直播概览">
        <article><Radio aria-hidden="true" /><span><small>正在直播</small><strong>{snapshot.dashboard.liveCount}</strong></span></article>
        <article><UsersRound aria-hidden="true" /><span><small>当前在线</small><strong>{compact(snapshot.dashboard.totalOnline)}</strong></span></article>
        <article><Eye aria-hidden="true" /><span><small>累计观看</small><strong>{compact(snapshot.dashboard.totalView)}</strong></span></article>
        <article><MessageSquare aria-hidden="true" /><span><small>互动弹幕</small><strong>{compact(snapshot.dashboard.totalChat)}</strong></span></article>
        <article><Gem aria-hidden="true" /><span><small>新增关注</small><strong>{compact(snapshot.dashboard.totalSubscribe)}</strong></span></article>
      </section>

      <section className={styles.monitorControls}>
        <div className={styles.monitorTitle}>
          <div><span className={styles.liveDot} /> LIVE CREATOR MONITOR</div>
          <p>最近同步：{new Date(snapshot.fetchedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Shanghai" })}</p>
        </div>
        <div className={styles.searchBox}>
          <Search aria-hidden="true" />
          <label className={styles.visuallyHidden} htmlFor="square-creator-search">搜索主播昵称、直播标题或币种</label>
          <input id="square-creator-search" onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索主播昵称、直播标题或币种…" type="search" value={query} />
          <button aria-label="立即刷新实时数据" disabled={refreshing} onClick={() => void refresh()} type="button">
            <RefreshCw aria-hidden="true" className={refreshing ? styles.spinning : ""} />
            <span>{refreshing ? "同步中" : "刷新"}</span>
          </button>
        </div>
        <div className={styles.filterRow} aria-label="主播筛选">
          <button className={filter === "followed" ? styles.activeFilter : ""} onClick={() => { setFilter("followed"); setPage(1); }} type="button"><Star aria-hidden="true" />关注 <span>{followedIds.size}</span></button>
          <button className={filter === "featured" ? styles.activeFilter : ""} onClick={() => { setFilter("featured"); setPage(1); }} type="button"><Gem aria-hidden="true" />精选</button>
          <button className={filter === "all" && !categoryId ? styles.activeFilter : ""} onClick={() => { setFilter("all"); setCategoryId(""); setPage(1); }} type="button">全部 <span>{snapshot.creators.length}</span></button>
          {snapshot.categories.map((category) => (
            <button className={categoryId === category.id ? styles.activeFilter : ""} key={category.id} onClick={() => { setFilter("all"); setCategoryId(category.id); setPage(1); }} type="button">{category.name}</button>
          ))}
        </div>
        {snapshot.degraded || refreshError ? (
          <div className={styles.statusNotice} role="status"><WifiOff aria-hidden="true" />{refreshError || snapshot.notice}</div>
        ) : null}
      </section>

      <div className={styles.resultsHeader}>
        <p>共 <strong>{visibleCreators.length}</strong> 位主播 · 直播中优先显示</p>
        <small>本机关注不会上传服务器</small>
      </div>

      <div className={styles.tableViewport}>
        <table className={styles.creatorTable}>
          <caption className={styles.visuallyHidden}>币安广场主播实时监控榜</caption>
          <thead>
            <tr>
              <th><SortHeading activeKey={sortKey} direction={direction} label="主播" onSort={changeSort} sortKey="name" /></th>
              <th>状态</th>
              <th><SortHeading activeKey={sortKey} direction={direction} label="开播时长" onSort={changeSort} sortKey="liveStartAt" /></th>
              <th>开播时间</th>
              <th><SortHeading activeKey={sortKey} direction={direction} label="当前在线" onSort={changeSort} sortKey="onlineNow" /></th>
              <th><SortHeading activeKey={sortKey} direction={direction} label="最高在线" onSort={changeSort} sortKey="maxOnline" /></th>
              <th><SortHeading activeKey={sortKey} direction={direction} label="累计观看" onSort={changeSort} sortKey="viewers" /></th>
              <th><SortHeading activeKey={sortKey} direction={direction} label="弹幕" onSort={changeSort} sortKey="chatCount" /></th>
              <th><SortHeading activeKey={sortKey} direction={direction} label="新增关注" onSort={changeSort} sortKey="subscribeCount" /></th>
              <th><SortHeading activeKey={sortKey} direction={direction} label="打赏" onSort={changeSort} sortKey="tipAmount" /></th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {pageCreators.map((creator) => (
              <tr className={creator.isLive ? styles.liveRow : styles.offlineRow} key={creator.id}>
                <td><CreatorIdentity creator={creator} followed={followedIds.has(creator.id)} onToggle={() => toggleFollow(creator.id)} /></td>
                <td><span className={creator.isLive ? styles.liveBadge : styles.offlineBadge}><i />{creator.isLive ? (creator.isVideo ? "视频直播" : "直播中") : "未开播"}</span></td>
                <td className={styles.numeric}><Clock3 aria-hidden="true" />{creator.isLive ? durationLabel(creator.liveStartAt, snapshot.fetchedAt) : "—"}</td>
                <td className={styles.numeric}>{creator.isLive ? timeLabel(creator.liveStartAt) : "—"}</td>
                <td className={styles.numeric}>{compact(creator.onlineNow)}</td>
                <td className={styles.numeric}>{compact(creator.maxOnline)}</td>
                <td className={styles.numeric}>{compact(creator.viewers)}</td>
                <td className={styles.numeric}>{compact(creator.chatCount)}</td>
                <td className={styles.numeric}>{compact(creator.subscribeCount)}</td>
                <td className={styles.numeric}>{creator.tipAmount ? compact(creator.tipAmount) : "—"}</td>
                <td>
                  {creator.webLink || creator.profileUrl ? (
                    <a className={styles.visitLink} href={creator.webLink || creator.profileUrl} rel="noopener noreferrer" target="_blank">去币安查看<ArrowUpRight aria-hidden="true" /></a>
                  ) : <span className={styles.noLink}>暂无入口</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pageCreators.length ? <div className={styles.emptyState}><Search aria-hidden="true" /><strong>没有符合条件的主播</strong><p>请清空关键词或切换分类。</p></div> : null}
      </div>

      {pageCount > 1 ? (
        <nav className={styles.pagination} aria-label="主播榜分页">
          <button disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button"><ChevronLeft aria-hidden="true" />上一页</button>
          <span>第 <strong>{safePage}</strong> / {pageCount} 页 · 每页 {PAGE_SIZE} 位</span>
          <button disabled={safePage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">下一页<ChevronRight aria-hidden="true" /></button>
        </nav>
      ) : null}
    </div>
  );
}
