"use client";

import { AlertTriangle, Pause, Play, RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

export const CLASSIC_GRID_VENUE_TABS = [
  { id: "extended", label: "Extended", color: "#58a6ff" },
  { id: "risex", label: "RISEx", color: "#3fb950" },
  { id: "decibel", label: "Decibel", color: "#d29922" },
  { id: "n1", label: "N1", color: "#39c5cf" },
  { id: "phoenix", label: "Phoenix", color: "#f78166" },
  { id: "phoenix2", label: "Phoenix2", color: "#ff9f6b" },
  { id: "nado", label: "Nado", color: "#a371f7" },
  { id: "popdex", label: "PopDEX", color: "#e85d75" }
] as const;

export type ClassicGridVenueId = (typeof CLASSIC_GRID_VENUE_TABS)[number]["id"];

type VenueOrder = { side: string; price: number };
type VenueRow = {
  venue: string;
  market: string;
  mid: number;
  anchorMid: number;
  lower: number;
  upper: number;
  spacing: number;
  sizeBase: number;
  gridCount: number;
  position: number;
  leverage?: number;
  openOrders: number;
  seeded: boolean;
  completedRungs: number;
  gridProfit: number;
  unrealizedPnl?: number;
  liquidationPrice?: number;
  equityUsd?: number;
  orders?: VenueOrder[];
  officialVolume?: number | null;
  officialFees?: number | null;
  officialRealizedPnl?: number | null;
  officialFills?: number | null;
  officialCloseFills?: number | null;
  officialSource?: "official" | "unavailable" | "local";
  lastError?: string;
  updatedAt: string;
};

type Snapshot = {
  updatedAt: string;
  dryRun: boolean;
  paused: boolean;
  venues: VenueRow[];
  welinkbtc?: {
    status?: string;
    heartbeatAt?: string | null;
    lastError?: string | null;
    enabledVenues?: string[];
  };
};

type VenueHealth = "disabled" | "waiting" | "seeding" | "healthy" | "error" | "paused";

const moneyFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return `$${moneyFormatter.format(number(value))}`;
}

function signedMoney(value: unknown) {
  const parsed = number(value);
  return `${parsed > 0 ? "+" : ""}${money(parsed)}`;
}

function price(value: unknown) {
  const parsed = number(value);
  if (!parsed) return "-";
  return parsed >= 1_000 ? parsed.toFixed(1) : numberFormatter.format(parsed);
}

function dateTime(value?: string | null) {
  if (!value) return "等待首轮数据";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "等待首轮数据" : date.toLocaleString("zh-CN", { hour12: false });
}

function sideLabel(position: number) {
  if (position > 1e-12) return "多";
  if (position < -1e-12) return "空";
  return "平";
}

function healthOf(row: VenueRow | undefined, enabled: boolean, paused: boolean): VenueHealth {
  if (!enabled) return "disabled";
  if (paused) return "paused";
  if (!row) return "waiting";
  if (row.lastError || !number(row.mid)) return "error";
  if (!row.seeded || number(row.openOrders) < Math.max(1, number(row.gridCount) * 0.5)) return "seeding";
  return "healthy";
}

const HEALTH_LABELS: Record<VenueHealth, string> = {
  disabled: "未启用",
  waiting: "等待数据",
  seeding: "铺单中",
  healthy: "正常运行",
  error: "运行异常",
  paused: "已暂停"
};

function GridLadder({ row, color }: { row: VenueRow; color: string }) {
  const ladder = useMemo(() => {
    const uniquePrices = [...new Set((row.orders || []).map((order) => number(order.price)).filter((value) => value > 0))]
      .sort((a, b) => a - b);
    let lower = number(row.lower);
    let upper = number(row.upper);
    if (!(lower > 0 && upper > lower)) {
      lower = uniquePrices[0] || number(row.mid) * 0.97;
      upper = uniquePrices.at(-1) || number(row.mid) * 1.03;
    }
    const span = Math.max(upper - lower, 1);
    const left = (value: number) => Math.max(0, Math.min(100, ((value - lower) / span) * 100));
    return { uniquePrices, lower, upper, left };
  }, [row]);

  if (!ladder.uniquePrices.length) {
    return <div className="classic-grid-console-empty">暂无活跃挂单档位；启动或完成首轮铺单后将在此显示。</div>;
  }

  return (
    <div className="classic-grid-console-ladder">
      <div className="classic-grid-console-rail" aria-label={`${row.venue} 挂单价格分布`}>
        {ladder.uniquePrices.map((orderPrice) => (
          <span
            className="classic-grid-console-tick"
            key={orderPrice}
            style={{ left: `${ladder.left(orderPrice)}%`, backgroundColor: color }}
            title={`挂单 ${price(orderPrice)}`}
          />
        ))}
        {number(row.anchorMid) > 0 ? <span className="classic-grid-console-anchor" style={{ left: `${ladder.left(number(row.anchorMid))}%` }} title={`铺单锚点 ${price(row.anchorMid)}`} /> : null}
        {number(row.mid) > 0 ? <span className="classic-grid-console-mid" style={{ left: `${ladder.left(number(row.mid))}%` }} title={`当前价 ${price(row.mid)}`} /> : null}
      </div>
      <div className="classic-grid-console-axis"><span>{price(ladder.lower)}</span><span>{price(ladder.upper)}</span></div>
      <div className="classic-grid-console-legend">
        <span><i className="is-orders" style={{ backgroundColor: color }} />挂单 {ladder.uniquePrices.length} 档</span>
        <span><i className="is-mid" />当前价 {price(row.mid)}</span>
        <span><i className="is-anchor" />锚点 {price(row.anchorMid)}</span>
        <span>期望档距 {price(row.spacing)}</span>
      </div>
    </div>
  );
}

type Props = {
  venueId: ClassicGridVenueId;
  configured: boolean;
  refreshToken: number;
  busy: boolean;
  onOpenEnvironment: () => void;
  onPauseChange: (paused: boolean) => Promise<void>;
};

export function ClassicGridVenueConsole({ venueId, configured, refreshToken, busy, onOpenEnvironment, onPauseChange }: Props) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const venue = CLASSIC_GRID_VENUE_TABS.find((item) => item.id === venueId) ?? CLASSIC_GRID_VENUE_TABS[0];

  const refresh = useCallback(async (showLoading = false) => {
    if (!showLoading && document.hidden) return;
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/classic-grid/snapshot", { cache: "no-store" });
      const result = await response.json() as Snapshot & { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || result.message || "读取交易所快照失败");
      setSnapshot(result);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取交易所快照失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(false), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshToken]);

  const row = snapshot?.venues.find((item) => item.venue === venueId);
  const enabled = configured || Boolean(snapshot?.welinkbtc?.enabledVenues?.includes(venueId));
  const health = healthOf(row, enabled, Boolean(snapshot?.paused));
  const orders = useMemo(() => [...(row?.orders || [])].sort((a, b) => number(b.price) - number(a.price)), [row?.orders]);
  const position = number(row?.position);
  const positionNotional = position * number(row?.mid);
  const pnl = row?.unrealizedPnl;

  return (
    <section className="classic-grid-venue-console" aria-live="polite" style={{ "--venue-color": venue.color } as CSSProperties}>
      <header className="classic-grid-venue-hero">
        <div className="classic-grid-venue-identity">
          <span className="classic-grid-venue-logo" aria-hidden="true">{venue.label.slice(0, 2)}</span>
          <div>
            <div className="classic-grid-venue-kicker">VENUE CONSOLE · {venueId.toUpperCase()}</div>
            <h1>{venue.label} 交易所控制台</h1>
            <p>{row?.market || "BTC"} 等差网格 · 数据来自服务器最新交易快照</p>
          </div>
        </div>
        <div className="classic-grid-venue-actions">
          <span className={`classic-grid-console-health is-${health}`}><i />{HEALTH_LABELS[health]}</span>
          <span className={`classic-grid-console-mode ${snapshot?.dryRun === false ? "is-live" : ""}`}>{snapshot?.dryRun === false ? "LIVE" : "PAPER"}</span>
          <button type="button" onClick={() => void refresh(true)} disabled={loading}><RefreshCw className={loading ? "grid-ops-spin" : ""} size={13} />刷新</button>
          <button type="button" onClick={onOpenEnvironment}><Settings2 size={13} />环境配置</button>
          {snapshot?.paused
            ? <button className="is-resume" type="button" onClick={() => void onPauseChange(false)} disabled={busy}><Play size={13} />恢复运行</button>
            : <button className="is-pause" type="button" onClick={() => void onPauseChange(true)} disabled={busy || !enabled}><Pause size={13} />紧急暂停</button>}
        </div>
      </header>

      {error ? <div className="classic-grid-console-alert is-error"><AlertTriangle size={15} />{error}</div> : null}
      {!enabled ? (
        <div className="classic-grid-console-alert"><AlertTriangle size={15} /><span>{venue.label} 尚未加入启用交易场所。请在环境配置的 VENUES 中勾选并重新保存启动。</span><button type="button" onClick={onOpenEnvironment}>打开环境配置</button></div>
      ) : null}
      {row?.lastError ? <div className="classic-grid-console-alert is-error"><AlertTriangle size={15} /><span><strong>{venue.label} 最新错误：</strong>{row.lastError}</span></div> : null}

      <div className="classic-grid-console-kpis">
        <article><span>账户权益</span><strong>{row?.equityUsd == null ? "-" : money(row.equityUsd)}</strong><small>交易所快照权益</small></article>
        <article><span>当前仓位</span><strong className={positionNotional > 0 ? "is-up" : positionNotional < 0 ? "is-down" : ""}>{sideLabel(position)}{number(row?.leverage) > 0 ? ` · ${number(row?.leverage)}x` : ""} · {money(Math.abs(positionNotional))}</strong><small>{numberFormatter.format(Math.abs(position))} BTC</small></article>
        <article><span>活跃挂单</span><strong>{row ? `${row.openOrders}/${row.gridCount}` : "-"}</strong><small>当前 / 期望档位</small></article>
        <article><span>完成格</span><strong>{row?.completedRungs ?? "-"}</strong><small>累计成交补单循环</small></article>
        <article><span>当前价格</span><strong>{price(row?.mid)}</strong><small>锚点 {price(row?.anchorMid)}</small></article>
        <article><span>官方浮盈亏</span><strong className={number(pnl) > 0 ? "is-up" : number(pnl) < 0 ? "is-down" : ""}>{pnl == null ? "-" : signedMoney(pnl)}</strong><small>最近更新 {dateTime(row?.updatedAt || snapshot?.updatedAt)}</small></article>
      </div>

      <div className="classic-grid-console-grid">
        <article className="classic-grid-console-panel">
          <header><div><span>GRID PARAMETERS</span><h2>网格运行参数</h2></div><span className={`classic-grid-console-health is-${health}`}><i />{HEALTH_LABELS[health]}</span></header>
          <dl className="classic-grid-console-metrics">
            <div><dt>交易市场</dt><dd>{row?.market || "BTC"}</dd></div>
            <div><dt>网格区间</dt><dd>{row ? `${price(row.lower)} — ${price(row.upper)}` : "-"}</dd></div>
            <div><dt>每档间距</dt><dd>{price(row?.spacing)}</dd></div>
            <div><dt>每档数量</dt><dd>{row ? numberFormatter.format(number(row.sizeBase)) : "-"}</dd></div>
            <div><dt>网格收益</dt><dd className={number(row?.gridProfit) > 0 ? "is-up" : ""}>{row ? signedMoney(row.gridProfit) : "-"}</dd></div>
            <div><dt>爆仓价格</dt><dd>{row?.liquidationPrice ? price(row.liquidationPrice) : "-"}</dd></div>
            <div><dt>今日成交量</dt><dd>{row?.officialVolume == null ? "-" : money(row.officialVolume)}</dd></div>
            <div><dt>今日手续费</dt><dd>{row?.officialFees == null ? "-" : money(row.officialFees)}</dd></div>
          </dl>
        </article>

        <article className="classic-grid-console-panel">
          <header><div><span>ORDER DISTRIBUTION</span><h2>挂单档位分布</h2></div><small>{orders.length} 个价格档</small></header>
          {row ? <GridLadder row={row} color={venue.color} /> : <div className="classic-grid-console-empty">正在等待 {venue.label} 首轮快照。</div>}
        </article>
      </div>

      <article className="classic-grid-console-panel classic-grid-console-orders">
        <header><div><span>ACTIVE ORDERS</span><h2>活跃挂单明细</h2></div><small>按价格从高到低 · 自动刷新</small></header>
        <div className="classic-grid-console-table-wrap">
          <table>
            <thead><tr><th>#</th><th>方向</th><th>价格</th><th>距当前价</th><th>状态</th></tr></thead>
            <tbody>
              {orders.map((order, index) => {
                const distance = number(row?.mid) ? ((number(order.price) - number(row?.mid)) / number(row?.mid)) * 100 : 0;
                return <tr key={`${order.side}-${order.price}-${index}`}><td>{index + 1}</td><td><span className={`classic-grid-order-side is-${order.side}`}>{order.side === "buy" ? "买入" : "卖出"}</span></td><td>{price(order.price)}</td><td className={distance > 0 ? "is-up" : distance < 0 ? "is-down" : ""}>{distance > 0 ? "+" : ""}{distance.toFixed(3)}%</td><td>挂单中</td></tr>;
              })}
              {!orders.length ? <tr><td colSpan={5}>暂无活跃挂单明细</td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
