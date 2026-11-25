"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, ArrowUpRight, Bell, ChevronRight, Crosshair, Fingerprint, Focus, Maximize2, Pause, Play, Radar, Search, ShieldCheck, Wallet } from "lucide-react";
import type { StmCandidate, StmDashboard, StmRadarBoard, StmRadarPeriod, StmRadarVenue, StmSignal, StmTrader } from "@/lib/stm-hunt/types";
import type { StmMarketSnapshot } from "@/lib/stm-hunt/market";
import { buildStmTerminalHoldings, buildStmTerminalModel, filterStmTerminalTraders, stmTerminalAssetKey, type StmTerminalModel } from "@/lib/stm-hunt/terminal-model";

const colors = ["#71a9ef", "#f17496", "#78d7df", "#b19aea", "#e4d56a", "#dc9d65"];
const boards = ["fomo", "hl", "pump", "binance", "lighter", "okx"];
const names = ["FOMO", "HYPERLIQUID", "PUMP", "BINANCE", "LIGHTER", "OKX"];
const usd = (v: number | null | undefined, digits = 2) => v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits }).format(v);
const num = (v: number | null | undefined, digits = 1) => v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v);
const small = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const clock = (v: string | number | null | undefined) => v && Number.isFinite(new Date(v).getTime()) ? new Date(v).toLocaleTimeString("zh-CN", { hour12: false }) : "—";
const signalText = (signal?: StmSignal) => !signal ? "等待证据" : signal.status === "ready" ? "READY" : signal.status === "risk" ? "RISK" : signal.status === "blocked" ? "PENDING" : "WATCH";
const safePrice = (v: number | null | undefined) => usd(v, v != null && v < 1 ? 7 : 2);
const stamp = (v: string | null | undefined) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "时间未提供";
const shortAddress = (v: string) => v.length > 20 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
const sourceState = (v?: string) => v === "ok" ? "来源可用" : v === "stale" ? "历史快照" : v === "restricted" ? "访问受限" : v === "unavailable" ? "暂不可用" : "尚未读取";

function Header({ title, meta, children }: { title: string; meta?: string; children?: React.ReactNode }) {
  return <div className="stm-orbit-heading"><h2><span>◆</span> {title}</h2>{meta ? <span>{meta}</span> : null}{children}</div>;
}

function Plot({ values, color = "#78d7df", fill = false }: { values: number[]; color?: string; fill?: boolean }) {
  const id = useId().replace(/:/g, "");
  if (values.length < 2) return <div className="stm-orbit-no-chart">等待可比数据</div>;
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || Math.max(1, hi * .01);
  const points = values.map((v, i) => `${(i / (values.length - 1) * 300).toFixed(1)},${(62 - (v - lo) / span * 52).toFixed(1)}`).join(" ");
  return <svg viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>{fill ? <polygon points={`0,70 ${points} 300,70`} fill={`url(#${id})`} /> : null}<polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

function IdentitySphere({ traders, selectedId, linkedIds, assetLabel, running, onSelect }: { traders: StmTrader[]; selectedId: string | null; linkedIds: readonly string[]; assetLabel: string; running: boolean; onSelect: (id: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projection = useRef<Float32Array>(new Float32Array(0));
  const hoverIndex = useRef(-1);
  const redraw = useRef<() => void>(() => {});
  const rotation = useRef(.28);
  const [hovered, setHovered] = useState<StmTrader | null>(null);
  const selectorId = useId();
  const descriptionId = useId();
  const inspected = traders.find(trader => trader.id === selectedId) ?? null;
  const displayTrader = hovered ?? inspected;
  const displayedCount = Math.min(traders.length, 1000);
  const identityOptions = useMemo(() => traders.map((trader, index) => <option key={trader.id} value={trader.id}>{trader.name} · {trader.venue.toUpperCase()}{index >= 1000 ? " · 未绘制" : ""}</option>), [traders]);
  const linked = useMemo(() => { const ids = new Set(linkedIds); return traders.map(trader => ids.has(trader.id)); }, [traders, linkedIds]);
  const disclosed = useMemo(() => traders.map(trader => trader.visibility !== "private" && trader.holdings.length > 0), [traders]);
  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const count = Math.min(traders.length, 1000), base = new Float32Array(count * 3), projected = new Float32Array(count * 4);
    projection.current = projected;
    for (let i = 0; i < count; i++) {
      const y = 1 - 2 * (i + .5) / count, r = Math.sqrt(1 - y * y), angle = i * Math.PI * (3 - Math.sqrt(5));
      base[i * 3] = Math.cos(angle) * r; base[i * 3 + 1] = y; base[i * 3 + 2] = Math.sin(angle) * r;
    }
    let width = 0, height = 0, frame = 0, lastTime = 0, angle = rotation.current, visible = true, disposed = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    function render(time: number, animate = false) {
      if (disposed || !canvas || !ctx) return;
        const delta = lastTime ? Math.min(64, time - lastTime) : 0;
        if (animate) { lastTime = time; angle += delta * .00009; rotation.current = angle; }
        ctx.clearRect(0, 0, width, height);
        const cx = width * .52, cy = height * .5, radius = Math.min(width * .435, height * .44), sin = Math.sin(angle), cos = Math.cos(angle);
        for (let i = 0; i < count; i++) {
          const p = i * 3, j = i * 4, x = base[p] * cos + base[p + 2] * sin, z = base[p + 2] * cos - base[p] * sin;
          const y = base[p + 1] * .97 - z * .17, depth = z * .97 + base[p + 1] * .17, perspective = 1 + depth * .14;
          projected[j] = cx + x * radius * perspective; projected[j + 1] = cy + y * radius * perspective; projected[j + 2] = depth;
          projected[j + 3] = disclosed[i] ? 1 : 0;
        }
        for (let depth = 0; depth < 3; depth++) {
          for (let group = 0; group < 2; group++) {
            ctx.strokeStyle = group ? `rgba(225,213,103,${.18 + depth * .16})` : `rgba(156,183,195,${.10 + depth * .085})`;
            ctx.lineWidth = group ? .7 : .5;
            ctx.beginPath();
            for (let i = 0; i < count; i++) {
              const j = i * 4; if (Math.min(2, Math.floor((projected[j + 2] + 1) * 1.49)) !== depth || projected[j + 3] !== group) continue;
              const x = projected[j] - cx, y = projected[j + 1] - cy, inner = .12 + (i % 11) * .027;
              ctx.moveTo(cx + x * inner, cy + y * inner); ctx.lineTo(projected[j], projected[j + 1]);
            }
            ctx.stroke();
            ctx.fillStyle = group ? `rgba(240,230,128,${.4 + depth * .26})` : `rgba(175,198,209,${.23 + depth * .23})`;
            ctx.beginPath();
            for (let i = 0; i < count; i++) {
              const j = i * 4; if (Math.min(2, Math.floor((projected[j + 2] + 1) * 1.49)) !== depth || projected[j + 3] !== group) continue;
              ctx.moveTo(projected[j] + 1.3, projected[j + 1]); ctx.arc(projected[j], projected[j + 1], group ? 1.9 : 1.15, 0, Math.PI * 2);
            }
            ctx.fill();
          }
        }
        for (let lane = 0; lane < 6; lane++) {
          let destination = -1;
          for (let i = 0; i < count; i++) if (traders[i]?.source === `wsm-${boards[lane]}` && disclosed[i] && projected[i * 4 + 2] > -.1) { destination = i; break; }
          if (destination < 0) continue;
          const j = destination * 4, startY = height * (.12 + lane * .145), endX = projected[j], endY = projected[j + 1];
          ctx.strokeStyle = colors[lane]; ctx.globalAlpha = .55; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, startY); ctx.bezierCurveTo(width * .1, startY, width * .08, endY, endX, endY); ctx.stroke(); ctx.globalAlpha = 1;
          if (animate) {
            const t = ((time * .00018 + lane * .14) % 1), u = 1 - t;
            const x = 3 * u * u * t * width * .1 + 3 * u * t * t * width * .08 + t * t * t * endX;
            const y = u * u * u * startY + 3 * u * u * t * startY + 3 * u * t * t * endY + t * t * t * endY;
            ctx.fillStyle = colors[lane]; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.fillStyle = "#75e0d2"; ctx.strokeStyle = "#75e0d2"; ctx.lineWidth = 1;
        for (let i = 0; i < count; i++) if (linked[i]) { const j = i * 4; ctx.beginPath(); ctx.arc(projected[j], projected[j + 1], 4, 0, Math.PI * 2); ctx.stroke(); }
        if (hoverIndex.current >= 0 && hoverIndex.current < count) {
          const j = hoverIndex.current * 4; ctx.strokeStyle = "#eadd7b"; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(projected[j], projected[j + 1], 6, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(projected[j], projected[j + 1]); ctx.lineTo(width, height * .25); ctx.stroke();
        }
    }
    const canAnimate = () => running && !reduced.matches && visible && document.visibilityState === "visible";
    function tick(time: number) {
      frame = 0;
      if (disposed || !canAnimate()) return;
      if (!lastTime || time - lastTime >= 32) render(time, true);
      frame = window.requestAnimationFrame(tick);
    }
    function update() {
      window.cancelAnimationFrame(frame); frame = 0; lastTime = 0;
      // A static frame must exist even in a background tab or before intersection.
      render(performance.now());
      if (!disposed && canAnimate()) frame = window.requestAnimationFrame(tick);
    }
    function size(widthValue: number, heightValue: number) {
      if (!canvas || !ctx || widthValue <= 0 || heightValue <= 0) return;
      width = widthValue; height = heightValue;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      update();
    }
    redraw.current = () => render(performance.now());
    const resize = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect; if (!rect) return;
      size(rect.width, rect.height);
    });
    resize.observe(canvas);
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; update(); });
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);
    const initial = canvas.getBoundingClientRect();
    size(initial.width || canvas.clientWidth || 1, initial.height || canvas.clientHeight || 1);
    return () => { disposed = true; window.cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", update); reduced.removeEventListener("change", update); projection.current = new Float32Array(0); redraw.current = () => {}; };
  }, [traders, disclosed, linked, running]);
  useEffect(() => { const index = traders.findIndex(trader => trader.id === selectedId); hoverIndex.current = index >= 0 && index < displayedCount ? index : -1; setHovered(null); redraw.current(); }, [selectedId, traders, displayedCount]);
  return <figure className="stm-orbit-visual"><div className="stm-orbit-visual-heading"><span><b>{displayedCount}/{traders.length}</b> IDENTITIES <small>{traders.length > displayedCount ? "按来源顺序绘制前 1,000 个身份" : "每个节点对应一个来源身份"}</small></span><span><i />{linked.filter(Boolean).length} KNOWN HOLDERS</span></div><canvas ref={canvasRef} className="stm-orbit-canvas" role="img" aria-describedby={descriptionId} aria-label={`展示 ${displayedCount} / ${traders.length} 个来源身份，全部身份中 ${linked.filter(Boolean).length} 个已披露所选资产持仓。`} onPointerMove={event => {
    const rect = event.currentTarget.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top, points = projection.current;
    let nearest = -1, distance = 90;
    for (let i = 0; i < points.length / 4; i++) { const dx = points[i * 4] - x, dy = points[i * 4 + 1] - y, d = dx * dx + dy * dy; if (d < distance) { distance = d; nearest = i; } }
    if (hoverIndex.current !== nearest) { hoverIndex.current = nearest; setHovered(nearest >= 0 ? traders[nearest] : null); redraw.current(); }
  }} onClick={event => {
    const rect = event.currentTarget.getBoundingClientRect(), points = projection.current, x = event.clientX - rect.left, y = event.clientY - rect.top;
    let nearest = -1, distance = 144;
    for (let i = 0; i < points.length / 4; i++) { const dx = points[i * 4] - x, dy = points[i * 4 + 1] - y, d = dx * dx + dy * dy; if (d < distance) { distance = d; nearest = i; } }
    if (nearest >= 0) onSelect(traders[nearest].id);
  }} onPointerLeave={() => { const index = traders.findIndex(trader => trader.id === selectedId); hoverIndex.current = index >= 0 && index < displayedCount ? index : -1; setHovered(null); redraw.current(); }} /><div className="stm-orbit-axis stm-orbit-axis-x" aria-hidden="true" /><div className="stm-orbit-axis stm-orbit-axis-y" aria-hidden="true" /><div className="stm-orbit-crosshair" aria-hidden="true"><Focus size={24} /></div><div className="stm-orbit-identity-select"><label htmlFor={selectorId}>查看来源身份</label><select id={selectorId} value={inspected?.id ?? ""} onChange={event => { if (event.target.value) onSelect(event.target.value); }}><option value="">选择身份 · 支持键盘 / 触屏</option>{identityOptions}</select></div><div className="stm-orbit-node-info" aria-live="polite">{displayTrader ? <><Fingerprint size={14} /><span><strong>{displayTrader.name}</strong><small>{displayTrader.venue.toUpperCase()} · {displayTrader.holdings.length} 条已披露仓位</small></span><b>{hovered ? "HOVER" : "FOCUS"}</b></> : <><Crosshair size={16} /><span><strong>{assetLabel || "选择来源身份"}</strong><small>点击节点或使用身份选择器联动下方档案</small></span></>}</div><figcaption id={descriptionId}><span><i />已披露持仓身份</span><span><i />私密 / 未披露身份</span><span className="stm-orbit-linked-legend">○ 当前资产的已知持有人</span><small>布局为身份投影，不表示资金关联或实时成交。</small></figcaption></figure>;
}

function useMarket(symbol: string, enabled: boolean) {
  const [market, setMarket] = useState<StmMarketSnapshot | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false, timer = 0, inFlight = false;
    const controller = new AbortController();
    setMarket(previous => previous?.symbol === symbol ? previous : null); setFailure(null);
    async function refresh() {
      if (inFlight || disposed || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const response = await fetch(`/api/stm-hunt/market?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("行情暂不可用");
        const value = await response.json() as StmMarketSnapshot;
        if (!disposed && value.symbol === symbol) {
          if (value.status !== "unavailable") setMarket(value);
          setFailure(value.status === "ok" ? null : `${value.message} · ${value.status === "partial" ? "本次缺失数据留空，不沿用旧数据" : "仅保留同一交易对上次数据，时间见右侧"}`);
        }
      } catch { if (!disposed && !controller.signal.aborted) setFailure("行情连接中断，保留上次数据"); }
      finally { inFlight = false; }
    }
    void refresh();
    if (enabled) timer = window.setInterval(() => void refresh(), 5_000);
    const resume = () => { if (enabled) void refresh(); };
    document.addEventListener("visibilitychange", resume);
    return () => { disposed = true; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", resume); };
  }, [symbol, enabled]);
  return { market: market?.symbol === symbol ? market : null, failure };
}

export function MarketChart({ market }: { market: StmMarketSnapshot | null }) {
  const id = useId().replace(/:/g, "");
  if (!market?.candles.length) return <div className="stm-orbit-chart-empty"><Activity size={23} /><span>等待交易所行情</span><small>真实 1m K 线 · 不生成示例价格</small></div>;
  const candles = market.candles, low = Math.min(...candles.map(c => c.low)), high = Math.max(...candles.map(c => c.high)), range = high - low || high * .01;
  const y = (value: number) => 137 - (value - low) / range * 110;
  const xAt = (index: number) => candles.length === 1 ? 280 : index / (candles.length - 1) * 560;
  const line = candles.map((c, i) => `${xAt(i)},${y(c.close)}`).join(" ");
  const volume = Math.max(...candles.map(c => c.volume), 1);
  return <svg viewBox="0 0 630 184" className="stm-orbit-price-chart" role="img" aria-label={`${market.symbol} 最近 ${candles.length} 根真实一分钟 K 线`}><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dacc74" stopOpacity=".16" /><stop offset="1" stopColor="#dacc74" stopOpacity="0" /></linearGradient></defs>{[0, 1, 2, 3, 4].map(i => <g key={i}><path d={`M0 ${20 + i * 30} H565`} stroke="#24363e" strokeWidth=".6" strokeDasharray="2 5" /><text x="574" y={24 + i * 30} fill="#738b98" fontSize="9">{num(high - range * i / 4, high < 1 ? 5 : 2)}</text></g>)}{candles.map((c, i) => { const x = xAt(i), color = c.close >= c.open ? "#5b9a84" : "#af6978"; return <g key={c.time} opacity={c.closed ? .7 : .4}><rect x={x - 2} y={164 - c.volume / volume * 30} width="4" height={c.volume / volume * 30} fill={color} /><path d={`M${x} ${y(c.high)}V${y(c.low)}`} stroke={color} strokeWidth=".7" /><rect x={x - 2} y={Math.min(y(c.open), y(c.close))} width="4" height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} fill={color} /></g>; })}<polygon points={`0,140 ${line} 560,140`} fill={`url(#${id})`} /><polyline points={line} fill="none" stroke="#e4dda0" strokeWidth="1.8" strokeLinejoin="round" /><text x="0" y="181" fill="#6d8995" fontSize="9">{clock(candles[0].time)}</text><text x="500" y="181" fill="#6d8995" fontSize="9">{clock(candles.at(-1)?.time)}</text></svg>;
}

export type StmTerminalFocus = { kind: "trader" | "wallet" | "holding" | "shared" | "candidate"; id: string; traderId?: string };
export type StmTerminalWatchView = "traders" | "wallets" | "shared" | "majors";
const periods: Array<{ id: StmRadarPeriod; label: string }> = [{ id: "all", label: "总榜" }, { id: "24h", label: "24H" }, { id: "7d", label: "7D" }, { id: "30d", label: "30D" }];

/** Selection never joins a symbol label to an unrelated market or strategy. */
export function resolveStmTerminalFocus(model: StmTerminalModel, focus: StmTerminalFocus | null, candidates: readonly StmCandidate[]) {
  const wallet = focus?.kind === "wallet" ? model.wallets.find(row => row.key === focus.id) ?? null : null;
  const shared = focus?.kind === "shared" ? model.sharedHoldings.find(row => row.id === focus.id) ?? null : null;
  const ownerId = focus?.kind === "trader" ? focus.id : focus?.kind === "holding" ? focus.traderId : wallet ? focus?.traderId && wallet.matchedTraderIds.includes(focus.traderId) ? focus.traderId : wallet.matchedTraderIds.length === 1 ? wallet.matchedTraderIds[0] : null : null;
  const trader = ownerId ? model.traders.find(row => row.id === ownerId) ?? null : !focus ? model.traders[0] ?? null : null;
  const holdings = trader ? buildStmTerminalHoldings(trader, candidates) : [];
  const holding = focus?.kind === "holding" ? holdings.find(row => row.key === focus.id) ?? null : null;
  const candidate = focus?.kind === "candidate" ? candidates.find(row => row.id === focus.id) ?? null : holding?.candidate ?? shared?.candidate ?? null;
  const assetKey = holding?.assetKey ?? shared?.assetKey ?? (candidate?.market === "onchain" ? stmTerminalAssetKey(candidate.chain, candidate.address) : null);
  const linkedIds = shared ? shared.matchedTraderIds : assetKey ? model.traders.filter(row => row.visibility !== "private" && row.holdings.some(asset => stmTerminalAssetKey(asset.chain, asset.address) === assetKey && asset.quantity !== 0 && asset.valueUsd !== 0)).map(row => row.id) : wallet?.matchedTraderIds ?? [];
  const title = holding?.holding.symbol ?? shared?.symbol ?? candidate?.symbol ?? (wallet ? shortAddress(wallet.address) : trader?.name ?? "选择研究对象");
  return { trader, wallet, shared, holding, holdings, candidate, assetKey, linkedIds, title };
}

export function buildStmTerminalRadarFocus(current: ReturnType<typeof resolveStmTerminalFocus>, venue: StmRadarVenue, period: StmRadarPeriod) {
  if (current.trader) return { venue, period, traderId: current.trader.id };
  if (current.wallet) return { venue, period, query: current.wallet.address, chain: current.wallet.chain };
  if (current.assetKey) {
    const separator = current.assetKey.lastIndexOf(":");
    return { venue, period, query: current.assetKey.slice(separator + 1), chain: current.assetKey.slice(0, separator) };
  }
  return { venue, period };
}

function useTerminalBoard(venue: StmRadarVenue, period: StmRadarPeriod, enabled: boolean, revision: string) {
  const [cache, setCache] = useState<Record<string, StmRadarBoard>>({});
  const [state, setState] = useState<{ key: string; loading: boolean; error: string | null }>({ key: "", loading: false, error: null });
  const [nonce, setNonce] = useState(0), consumed = useRef(0), key = `${venue}:${period}`;
  useEffect(() => {
    const controller = new AbortController(); let disposed = false, inFlight = false;
    const manual = consumed.current !== nonce; consumed.current = nonce;
    async function read(force = false) {
      if (disposed || inFlight || document.visibilityState !== "visible") return;
      inFlight = true; setState({ key, loading: true, error: null });
      try {
        const query = new URLSearchParams({ venue, period, ...(force ? { refresh: "1" } : {}) });
        const response = await fetch(`/api/stm-hunt/radar?${query}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
        const result = await response.json() as StmRadarBoard & { error?: string };
        if (!response.ok) throw new Error(result.error || "榜单连接中断");
        if (result.venue !== venue || result.period !== period || !Array.isArray(result.traders)) throw new Error("榜单身份或周期不一致");
        if (!disposed) {
          setCache(previous => {
            const prior = previous[key];
            if (prior?.traders.length && !result.traders.length && ["unavailable", "restricted"].includes(result.source.status)) return { ...previous, [key]: { ...prior, source: { ...prior.source, status: "stale", message: result.source.message }, checkedAt: result.checkedAt } };
            return { ...previous, [key]: result };
          });
          setState({ key, loading: false, error: ["unavailable", "restricted"].includes(result.source.status) ? result.source.message : null });
        }
      } catch (error) { if (!disposed && !controller.signal.aborted) setState({ key, loading: false, error: error instanceof Error ? error.message : "读取失败" }); }
      finally { inFlight = false; }
    }
    void read(manual);
    const interval = enabled ? window.setInterval(() => void read(), 30_000) : null;
    const resume = () => { if (enabled) void read(); };
    document.addEventListener("visibilitychange", resume);
    return () => { disposed = true; controller.abort(); if (interval !== null) window.clearInterval(interval); document.removeEventListener("visibilitychange", resume); };
  }, [venue, period, enabled, nonce, key, revision]);
  return { board: cache[key] ?? null, loading: state.key === key && state.loading, error: state.key === key ? state.error : null, refresh: () => setNonce(value => value + 1) };
}

export function TerminalWatchList({ model, view, query, focus, onFocus }: { model: StmTerminalModel; view: StmTerminalWatchView; query: string; focus: StmTerminalFocus | null; onFocus: (focus: StmTerminalFocus) => void }) {
  const q = query.trim().toLowerCase();
  const matches = (values: Array<string | null | undefined>) => !q || values.some(value => value?.toLowerCase().includes(q));
  const traders = filterStmTerminalTraders(model.traders, { query }).sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const wallets = model.wallets.filter(row => matches([row.chain, row.address, ...row.matchedTraderIds.map(id => model.traders.find(trader => trader.id === id)?.name)]));
  const shared = model.sharedHoldings.filter(row => matches([row.symbol, row.name, row.chain, row.address]));
  const holdings = view === "majors" ? model.traders.flatMap(row => buildStmTerminalHoldings(row)).filter(row => matches([row.holding.symbol, row.holding.name, row.holding.chain, row.holding.address, model.traders.find(trader => trader.id === row.traderId)?.name])).sort((a, b) => (b.holding.valueUsd ?? -Infinity) - (a.holding.valueUsd ?? -Infinity)) : [];
  const count = view === "traders" ? traders.length : view === "wallets" ? wallets.length : view === "shared" ? shared.length : holdings.length;
  return <div className="stm-orbit-watch-results" role="region" aria-label="观察池结果" tabIndex={0}>
    <div className="stm-orbit-watch-columns"><span>{view === "traders" ? "IDENTITY / SOURCE RANK" : view === "wallets" ? "WALLET / CHAIN" : "ASSET / CONTEXT"}</span><span>{view === "traders" ? "资产快照" : view === "wallets" ? "关联身份" : "金额 / 价格"}</span></div>
    {view === "traders" ? traders.map(row => <button type="button" className={`stm-orbit-watch-row ${focus?.kind === "trader" && focus.id === row.id || !focus && model.traders[0]?.id === row.id ? "is-selected" : ""}`} aria-pressed={focus?.kind === "trader" && focus.id === row.id || !focus && model.traders[0]?.id === row.id} key={row.id} onClick={() => onFocus({ kind: "trader", id: row.id })}><span><b><i>#{row.rank ?? "—"}</i>{row.name}</b><small>{row.venue.toUpperCase()} · {row.pnlWindow || "来源窗口未提供"}</small></span><span><strong>{row.visibility === "private" ? "未公开" : usd(row.totalValueUsd, 0)}</strong><small>{stamp(row.fieldSources?.assets ? row.fieldSources.assets.updatedAt : row.updatedAt)}</small></span></button>) : null}
    {view === "wallets" ? wallets.map(row => <button type="button" className={`stm-orbit-watch-row ${focus?.kind === "wallet" && focus.id === row.key ? "is-selected" : ""}`} aria-pressed={focus?.kind === "wallet" && focus.id === row.key} key={row.key} onClick={() => onFocus({ kind: "wallet", id: row.key })}><span><b title={row.address}>{shortAddress(row.address)}</b><small>{row.chain.toUpperCase()} · {row.sourceIds.join(" / ")}</small></span><span><strong>{row.matchedTraderIds.length} 位</strong><small>{stamp(row.sourceUpdatedAt)}</small></span></button>) : null}
    {view === "shared" ? shared.map(row => <button type="button" className={`stm-orbit-watch-row ${focus?.kind === "shared" && focus.id === row.id ? "is-selected" : ""}`} aria-pressed={focus?.kind === "shared" && focus.id === row.id} key={row.id} onClick={() => onFocus({ kind: "shared", id: row.id })}><span><b>{row.symbol}<i>{row.chain.toUpperCase()}</i></b><small>来源报告 {row.holdersCount} 人 · 本榜匹配 {row.matchedTraderIds.length}</small></span><span><strong>{usd(row.totalValueUsd, 0)}</strong><small>{stamp(row.sourceUpdatedAt)}</small></span></button>) : null}
    {view === "majors" ? <>{holdings.length ? <div className="stm-orbit-watch-divider">全部已披露持仓 · 按来源估值排序</div> : null}{holdings.map(row => <button type="button" className={`stm-orbit-watch-row ${focus?.kind === "holding" && focus.id === row.key ? "is-selected" : ""}`} aria-pressed={focus?.kind === "holding" && focus.id === row.key} key={row.key} onClick={() => onFocus({ kind: "holding", id: row.key, traderId: row.traderId })}><span><b>{row.holding.symbol}<i>{row.holding.chain?.toUpperCase() || "链未披露"}</i></b><small>{model.traders.find(trader => trader.id === row.traderId)?.name} · {row.holding.side.toUpperCase()}</small><small>{row.sourceId}</small></span><span><strong>{usd(row.holding.valueUsd, 0)}</strong><small>数量 {num(row.holding.quantity, 4)}</small><small>{stamp(row.sourceUpdatedAt)}</small></span></button>)}</> : null}
    {!count ? <p className="stm-orbit-compact-empty">{query ? "没有匹配的记录" : "该来源未提供此类数据"}</p> : null}
  </div>;
}

function Provenance({ source, time, label = "快照" }: { source?: string; time?: string | null; label?: string }) { return <span className="stm-orbit-provenance" title={`${source || "来源未提供"} · ${time || "时间未提供"}`}>{label} {stamp(time)} <b>{source || "来源未知"}</b></span>; }

export function StmHuntTerminal({ data, selected: _selected, busy, autoRefresh, onSelect, onWatch, onExecute, onStrategies, onSources, onSimulate, onRefresh }: {
  data: StmDashboard; selected: StmCandidate | null; busy: boolean; autoRefresh: boolean;
  onSelect: (id: string) => void; onWatch: (id: string, enabled: boolean) => void; onExecute: () => void; onStrategies: () => void;
  onSources: (focus?: { venue?: StmRadarVenue; period?: StmRadarPeriod; traderId?: string; query?: string; chain?: string }) => void;
  onSimulate?: () => void; onRefresh: () => void;
}) {
  const [running, setRunning] = useState(true), [wide, setWide] = useState(false);
  const [venue, setVenue] = useState<StmRadarVenue>("fomo"), [period, setPeriod] = useState<StmRadarPeriod>("all");
  const [view, setView] = useState<StmTerminalWatchView>("traders"), [watchQuery, setWatchQuery] = useState("");
  const [focus, setFocus] = useState<StmTerminalFocus | null>(null);
  const [assetQuery, setAssetQuery] = useState(""), [assetFilter, setAssetFilter] = useState("all");
  const [marketSymbol, setMarketSymbol] = useState("BTCUSDT");
  const research = useTerminalBoard(venue, period, autoRefresh, data.asOf);
  const model = useMemo(() => { const result = buildStmTerminalModel({ board: research.board, dashboardTraders: data.traders, candidates: data.candidates, sharedHoldings: (data.sharedHoldings ?? []).filter(row => row.sourceId === `wsm-${venue}`), venue, period }); result.traders.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)); return result; }, [research.board, data.traders, data.candidates, data.sharedHoldings, venue, period]);
  const current = useMemo(() => resolveStmTerminalFocus(model, focus, data.candidates), [model, focus, data.candidates]);
  const { market, failure } = useMarket(marketSymbol, autoRefresh);
  const candidate = current.candidate;
  const selectedSignals = data.signals.filter(row => row.candidateId === candidate?.id);
  const sourceBase = research.board?.source ?? (period === "all" ? data.sources.find(row => row.id === `wsm-${venue}`) : undefined);
  const source = sourceBase && research.error && model.traders.length ? { ...sourceBase, status: "stale" as const } : sourceBase;
  const isSeed = !research.board && period === "all" && model.traders.length > 0;
  const focusAsset = current.holding?.holding ?? current.shared;
  const holdingSource = current.holding?.sourceId ?? current.shared?.sourceId;
  const holdingTime = current.holding ? current.holding.sourceUpdatedAt : current.shared?.sourceUpdatedAt;
  const related = model.traders.filter(row => current.linkedIds.includes(row.id));
  const paperClosed = [...data.state.paper].filter(row => row.status === "closed" && row.pnlUsd != null).sort((a, b) => Date.parse(a.closedAt || "") - Date.parse(b.closedAt || ""));
  let cumulative = 0; const equity = [0, ...paperClosed.map(row => (cumulative += row.pnlUsd ?? 0))];
  const candidates = data.candidates.filter(row => (!assetQuery || `${row.symbol} ${row.name} ${row.address ?? ""}`.toLowerCase().includes(assetQuery.toLowerCase())) && (assetFilter === "all" || row.market === assetFilter || assetFilter === "watched" && data.state.watchlist.includes(row.id)));
  const marketOptions = [...new Set(["BTCUSDT", ...model.majorTokens.map(row => `${row.symbol.toUpperCase()}USDT`), ...data.candidates.filter(row => row.market === "cex").map(row => `${row.symbol.toUpperCase()}USDT`)])].filter(row => /^[A-Z0-9]{2,20}USDT$/.test(row));
  const marketBound = candidate?.market === "cex" && `${candidate.symbol.toUpperCase()}USDT` === marketSymbol;
  const changeBoard = (next: StmRadarVenue) => { setVenue(next); setFocus(null); setWatchQuery(""); };
  const chooseFocus = (next: StmTerminalFocus) => {
    setFocus(next);
    const resolved = resolveStmTerminalFocus(model, next, data.candidates);
    if (resolved.candidate) { onSelect(resolved.candidate.id); if (next.kind === "candidate" && resolved.candidate.market === "cex") setMarketSymbol(`${resolved.candidate.symbol.toUpperCase()}USDT`); }
  };
  const chooseCandidate = (id: string) => chooseFocus({ kind: "candidate", id });
  const openRadar = () => onSources(buildStmTerminalRadarFocus(current, venue, period));
  const logs = data.state.journal.length ? data.state.journal.slice(0, 3).map(row => ({ key: row.id, time: row.createdAt, label: row.action, message: row.message })) : [
    { key: "capture", time: data.asOf, label: "SCAN", message: `${data.metrics.traders} 个来源身份 · ${data.metrics.candidates} 个候选资产` },
    { key: "source", time: source?.updatedAt, label: "SOURCE", message: `${names[boards.indexOf(venue)]} / ${sourceState(source?.status)} · ${model.coverage.withHoldings}/${model.coverage.traders} 披露持仓` },
    { key: "gate", time: data.asOf, label: "GATE", message: `${data.metrics.ready} 条就绪证据 · 交易须独立确认` },
  ];
  return <div className={`stm-orbit-terminal stm-orbit-terminal-v16 ${wide ? "is-wide" : ""}`}>
    <div className="stm-orbit-ticker"><span><i /> SYSTEM / <b>STM ORBIT</b></span><span>{model.coverage.traders} IDENTITIES <em>·</em> {model.coverage.wallets} WALLETS <em>·</em> {model.coverage.withHoldings} HOLDING SNAPSHOTS</span><button type="button" onClick={() => { research.refresh(); onRefresh(); }} disabled={busy || research.loading}><Radar size={12} />{busy || research.loading ? "CHECKING" : "重新扫描"}</button></div>
    <div className="stm-orbit-top">
      <section className="stm-orbit-panel stm-orbit-watch"><Header title="LIVE WATCH" meta={`${model.coverage.traders} 来源身份`} /><div className="stm-orbit-watch-switch" aria-label="观察池视图">{([{ id: "traders", label: "交易员" }, { id: "wallets", label: "钱包" }, { id: "shared", label: "共同持仓" }, { id: "majors", label: "主要持仓" }] as const).map(row => <button type="button" key={row.id} aria-pressed={view === row.id} onClick={() => setView(row.id)}>{row.label}</button>)}</div><div className="stm-orbit-watch-filters"><label><Search size={12} /><input aria-label="搜索观察池交易员钱包或持仓" placeholder="身份 / 地址 / 代币" value={watchQuery} onChange={event => setWatchQuery(event.target.value)} /></label><select value={venue} aria-label="观察池来源平台" onChange={event => changeBoard(event.target.value as StmRadarVenue)}>{boards.map((id, index) => <option key={id} value={id}>{names[index]}</option>)}</select></div><div className="stm-orbit-watch-periods" aria-label="观察池收益窗口">{periods.map(row => <button type="button" key={row.id} aria-pressed={period === row.id} onClick={() => { setPeriod(row.id); setFocus(null); }}>{row.label}</button>)}<span>{research.loading ? "读取中" : sourceState(source?.status)}</span></div><TerminalWatchList model={model} view={view} query={watchQuery} focus={focus} onFocus={chooseFocus} /><div className="stm-orbit-panel-foot"><span>{isSeed ? "已采集快照" : sourceState(source?.status)}</span><time title={source?.updatedAt ?? undefined}>{stamp(source?.updatedAt)}</time></div>{research.error ? <p className="stm-orbit-inline-warning" role="status">{research.error} · 保留的快照仍按原时间展示</p> : null}</section>
      <section className="stm-orbit-panel stm-orbit-market"><Header title="MARKET TRACE" meta="BINANCE · 1 MIN"><select aria-label="市场图表交易对" value={marketSymbol} onChange={event => setMarketSymbol(event.target.value)}>{marketOptions.map(symbol => <option key={symbol} value={symbol}>{symbol}</option>)}</select></Header><div className="stm-orbit-market-context"><span>{marketBound ? "所选 CEX 候选市场" : "独立行情参考"}</span><b>{marketSymbol}</b>{!marketBound ? <small>不代表 {focusAsset?.symbol ?? current.trader?.name ?? "当前研究对象"} 的持仓价格</small> : null}</div><div className="stm-orbit-market-quote"><strong>{safePrice(market?.price)}</strong><span className={market?.change24h == null ? "" : market.change24h < 0 ? "is-negative" : "is-positive"}>{market?.change24h == null ? "—" : `${market.change24h > 0 ? "+" : ""}${num(market.change24h)}%`}</span><small>24H VOL <b>{small(market?.volumeUsd)}</b></small><span className="stm-orbit-stream"><i className={failure || !market ? "is-warning" : ""} />{failure ? "DEGRADED" : !market ? "WAITING" : !autoRefresh ? "PAUSED" : "5s SYNC"}</span></div><MarketChart market={market} /><div className="stm-orbit-market-status"><span>{failure || "公开行情 · 最新 1m K 线可能尚未收盘"}</span><time title={market?.asOf}>采集 {stamp(market?.asOf)}</time></div><div className="stm-orbit-market-log"><Header title="LIFE OF A SCAN" meta="采集 / 操作日志" />{logs.map(log => <div key={log.key}><time>{clock(log.time)}</time><b>[{log.label}]</b><span>{log.message}</span></div>)}</div></section>
      <section className="stm-orbit-panel stm-orbit-circuit"><Header title="EVIDENCE CIRCUIT" meta={candidate?.symbol ?? "未绑定候选"} /><div className="stm-orbit-circuit-tree"><span className="stm-orbit-circuit-root"><ShieldCheck size={19} /><small>RISK<br />GATE</small></span><div>{data.strategies.map(strategy => { const signal = selectedSignals.find(row => row.strategy === strategy.id); return <button type="button" key={strategy.id} className={`stm-orbit-circuit-node ${signal?.status === "ready" ? "is-pass" : signal?.status === "risk" ? "is-risk" : ""}`} onClick={onStrategies}><span>{strategy.id} / {strategy.name}</span><b>{signalText(signal)}</b></button>; })}</div></div><div className="stm-orbit-circuit-bars">{selectedSignals.map((signal, index) => <div key={signal.id}><span>{signal.strategy}</span><i><b style={{ width: `${Math.max(0, Math.min(100, signal.score))}%`, background: colors[index % colors.length] }} /></i><span>{signal.entities} ENTITIES</span></div>)}</div><p className="stm-orbit-circuit-note"><Fingerprint size={12} />{candidate ? "当前候选的实际证据 · 仍需交易确认" : "持仓按链和完整合约匹配，不按同名代币绑定"}</p><button type="button" className="stm-orbit-text-action" onClick={onStrategies}>查看策略配置 <ArrowRight size={12} /></button></section>
    </div>
    <section className="stm-orbit-panel stm-orbit-scanner"><Header title="THE SCANNER" meta={`${names[boards.indexOf(venue)]} / ${period.toUpperCase()}`}><div className="stm-orbit-controls"><button type="button" aria-pressed={!running} onClick={() => setRunning(value => !value)} title={running ? "暂停球体动效" : "播放球体动效"}>{running ? <Pause size={12} /> : <Play size={12} />}{running ? "MOTION ON" : "PAUSED"}</button><button type="button" onClick={() => setWide(value => !value)} aria-pressed={wide} aria-label="切换图谱宽屏"><Maximize2 size={12} /></button></div></Header><div className="stm-orbit-current-focus" aria-live="polite"><Crosshair size={12} /><span>当前焦点 <b>{current.title}</b></span><span>{current.wallet ? `${current.wallet.chain.toUpperCase()} / 钱包` : focusAsset ? `${focusAsset.chain?.toUpperCase() || "链未提供"} / 持仓快照` : candidate ? `${candidate.market.toUpperCase()} / 候选资产` : "来源身份档案"}</span><button type="button" onClick={openRadar}>在聪明钱雷达查看 <ArrowUpRight size={12} /></button></div><div className="stm-orbit-scanner-grid">
      <aside className="stm-orbit-sensors"><div className="stm-orbit-section-label">SIX PLATFORMS<small>切换同源身份 / 资产</small></div>{boards.map((id, index) => { const active = venue === id; const knownSource = active ? source : data.sources.find(row => row.id === `wsm-${id}`); const knownRows = active ? model.traders : data.traders.filter(row => row.venue === id); return <button type="button" key={id} className={active ? "is-selected" : ""} aria-pressed={active} style={{ "--sensor-color": colors[index] } as React.CSSProperties} onClick={() => changeBoard(id as StmRadarVenue)}><div><strong>{names[index]}</strong><b>{active || !["fomo", "hl", "lighter"].includes(id) ? knownRows.length : "—"}</b></div><small>{active ? sourceState(knownSource?.status) : ["fomo", "hl", "lighter"].includes(id) ? "点击读取榜单" : sourceState(knownSource?.status)}</small><span>{active ? `${model.coverage.withHoldings} 份持仓 / ${model.coverage.wallets} 个钱包` : "独立来源 · 非共同资金池"}</span></button>; })}</aside>
      <IdentitySphere traders={model.traders} selectedId={current.trader?.id ?? null} linkedIds={current.linkedIds} assetLabel={focusAsset?.symbol ?? candidate?.symbol ?? ""} running={running} onSelect={id => chooseFocus({ kind: "trader", id })} />
      <aside className="stm-orbit-verdicts"><div className="stm-orbit-section-label">VERDICT REGISTERS<small>{candidate?.symbol ?? "等待资产精确匹配"} / 实际策略评估</small></div>{selectedSignals.length ? selectedSignals.map((signal, index) => <button type="button" key={signal.id} className={`stm-orbit-verdict ${signal.status === "ready" ? "is-ready" : signal.status === "risk" ? "is-risk" : ""}`} onClick={onStrategies}><div><small>R0{index + 1} / {signal.strategy}</small><span>{signalText(signal)}</span></div><strong>{signal.symbol}<b>{num(signal.score, 0)}<small>/100</small></b></strong><div className="stm-orbit-score"><i style={{ width: `${Math.min(100, Math.max(0, signal.score))}%` }} /></div><p>{signal.missing[0] || signal.reasons[0] || "等待完整证据"}</p><small>{signal.entities} ENTITIES · V{signal.strategyVersion}</small></button>) : <div className="stm-orbit-verdict-empty"><ShieldCheck size={23} /><strong>UNBOUND / RESEARCH</strong><p>选择已收录候选，或有精确链与合约的持仓，才显示对应策略证据。</p><span>身份、资产金额与收益榜不构成可执行买入信号。</span></div>}<div className="stm-orbit-execution-gate"><ShieldCheck size={15} /><span>{selectedSignals.some(row => row.actionable) ? "REQUIRES CONFIRMATION" : "NO CONFIRMED ENTRY"}<small>完整证据 → 风控 → 用户确认</small></span></div></aside>
    </div></section>
    <div className="stm-orbit-research-grid">
      <section className="stm-orbit-panel stm-orbit-dossier"><Header title="IDENTITY DOSSIER" meta={current.trader ? `#${current.trader.rank ?? "—"} / ${current.trader.venue.toUpperCase()}` : "精确身份"} />{current.trader ? <><div className="stm-orbit-dossier-title"><span><Fingerprint size={21} /></span><div><h3>{current.trader.name}</h3><p>{current.trader.fomoHandle ? `FOMO @${current.trader.fomoHandle}` : current.trader.handle ? `X @${current.trader.handle}` : "来源身份"}</p></div><button type="button" aria-label={`${data.state.watchlist.includes(current.trader.id) ? "取消关注" : "关注"}${current.trader.name}`} aria-pressed={data.state.watchlist.includes(current.trader.id)} disabled={busy} onClick={() => onWatch(current.trader!.id, !data.state.watchlist.includes(current.trader!.id))}><Bell size={14} /></button></div><dl className="stm-orbit-facts"><div><dt>{current.trader.totalValueLabel || "来源资产金额"}</dt><dd>{current.trader.visibility === "private" ? "未公开" : usd(current.trader.totalValueUsd)}</dd></div><div><dt>来源收益 / {period.toUpperCase()}</dt><dd className={current.trader.pnlUsd == null ? "" : current.trader.pnlUsd < 0 ? "is-negative" : "is-positive"}>{usd(current.trader.pnlUsd)}</dd></div><div><dt>已披露持仓 / 链</dt><dd>{current.holdings.length} / {current.trader.chains?.length ?? 0}</dd></div><div><dt>交易数 / 胜率</dt><dd>{num(current.trader.tradeCount, 0)} / {current.trader.winRate == null ? "—" : `${num(current.trader.winRate)}%`}</dd></div></dl><Provenance source={current.trader.fieldSources?.assets?.sourceId ?? current.trader.source} time={current.trader.fieldSources?.assets ? current.trader.fieldSources.assets.updatedAt : current.trader.updatedAt} label="资产" /><Provenance source={current.trader.fieldSources?.pnl?.sourceId ?? current.trader.source} time={current.trader.fieldSources?.pnl ? current.trader.fieldSources.pnl.updatedAt : current.trader.sourceUpdatedAt} label="收益" /><div className="stm-orbit-wallet-list">{model.wallets.filter(row => row.matchedTraderIds.includes(current.trader!.id)).map(row => <button type="button" key={row.key} className={current.wallet?.key === row.key ? "is-selected" : ""} onClick={() => chooseFocus({ kind: "wallet", id: row.key, traderId: current.trader!.id })}><Wallet size={12} /><span><b>{row.chain.toUpperCase()}</b><code title={row.address}>{shortAddress(row.address)}</code><small>{row.sourceIds.join(" / ")} · {stamp(row.sourceUpdatedAt)}</small></span><ChevronRight size={12} /></button>)}{!model.wallets.some(row => row.matchedTraderIds.includes(current.trader!.id)) ? <p className="stm-orbit-compact-empty">来源未披露完整钱包地址</p> : null}</div></> : <div className="stm-orbit-unbound"><Fingerprint size={24} /><strong>{current.wallet ? "钱包关联多个来源身份" : "选择交易员查看资产档案"}</strong><p>{current.wallet ? "从关联身份列表选择，不自动归属到某一位交易员。" : "球体节点、观察池和共同持仓可联动身份。"}</p></div>}<div className="stm-orbit-panel-actions"><button type="button" onClick={openRadar}>完整雷达详情 <ArrowUpRight size={12} /></button></div></section>

      <section className="stm-orbit-panel stm-orbit-portfolio"><Header title="PORTFOLIO LENS" meta={current.trader ? `${current.holdings.length} DISCLOSED` : "SOURCE SNAPSHOT"} />{current.trader ? <><div className="stm-orbit-chain-allocation" aria-label="来源链分布">{current.trader.chains?.length ? current.trader.chains.map((chain, index) => { const total = current.trader!.chains!.reduce((sum, row) => sum + (row.valueUsd != null && row.valueUsd > 0 ? row.valueUsd : 0), 0); return <div key={chain.chain}><span><b>{chain.chain.toUpperCase()}</b><small>{chain.holdingsCount} 仓位</small><strong>{usd(chain.valueUsd, 0)}</strong></span><i><em style={{ width: chain.valueUsd != null && total > 0 ? `${Math.max(0, chain.valueUsd) / total * 100}%` : "0%", background: colors[index % colors.length] }} /></i></div>; }) : <p className="stm-orbit-compact-empty">链分布未披露</p>}<small>{current.trader.chainsScope === "reported" ? "来源报告链金额" : "仅已披露仓位范围"} · 资产估值非账户可用余额</small></div><div className="stm-orbit-holding-list" role="region" aria-label="所选身份的持仓快照" tabIndex={0}>{current.holdings.map(row => <button type="button" key={row.key} className={current.holding?.key === row.key ? "is-selected" : ""} onClick={() => chooseFocus({ kind: "holding", id: row.key, traderId: row.traderId })}><span><b>{row.holding.symbol}</b><small>{row.holding.chain?.toUpperCase() || "链未披露"} · {row.holding.side.toUpperCase()}</small></span><span><strong>{usd(row.holding.valueUsd)}</strong><small>数量 {num(row.holding.quantity, 5)}</small></span><ChevronRight size={12} /></button>)}{!current.holdings.length ? <p className="stm-orbit-compact-empty">{current.trader.visibility === "private" ? "持仓未公开" : "来源未提供持仓快照"}</p> : null}</div><Provenance source={current.trader.fieldSources?.holdings?.sourceId ?? current.trader.source} time={current.trader.fieldSources?.holdings ? current.trader.fieldSources.holdings.updatedAt : current.trader.updatedAt} label="持仓" /></> : <div className="stm-orbit-unbound"><Wallet size={24} /><strong>等待身份选择</strong><p>完整持仓和链分布按同一来源身份展示。</p></div>}</section>

      <section className="stm-orbit-panel stm-orbit-intersection"><Header title="HOLDING INTERSECTION" meta={`${current.linkedIds.length} MAPPED IDENTITIES`} />{focusAsset ? <><div className="stm-orbit-focus-asset"><span>{focusAsset.chain?.toUpperCase() || "链未披露"} / {current.shared ? "来源共同持仓" : "身份持仓"}</span><h3>{focusAsset.symbol}<small>{focusAsset.name}</small></h3><strong>{usd(current.shared?.totalValueUsd ?? current.holding?.holding.valueUsd)}</strong><small>{current.shared ? "来源汇总金额" : "来源持仓金额"}</small><code>{focusAsset.address || "完整合约未提供 · 不建立跨身份代币关联"}</code><Provenance source={holdingSource} time={holdingTime} /></div>{current.shared ? <div className="stm-orbit-intersection-counts"><span>来源报告 <b>{current.shared.holdersCount}</b></span><span>本榜精确映射 <b>{current.shared.matchedTraderIds.length}</b></span><span>未映射身份 <b>{current.shared.unmatchedHolderIds.length}</b></span></div> : null}</> : current.wallet ? <div className="stm-orbit-focus-asset"><span>{current.wallet.chain.toUpperCase()} / WALLET</span><h3>钱包关联</h3><code>{current.wallet.address}</code><Provenance source={current.wallet.sourceIds.join(" / ")} time={current.wallet.sourceUpdatedAt} /><p>关联来自完整地址与链；不代表这些身份之间存在资金转移。</p></div> : <p className="stm-orbit-compact-empty">选择持仓、共同持仓或钱包，查看可证实的交集。</p>}<div className="stm-orbit-related-list">{related.map(row => <button type="button" key={row.id} onClick={() => chooseFocus({ kind: "trader", id: row.id })}><Fingerprint size={12} /><span>{row.name}<small>#{row.rank ?? "—"} · {row.venue.toUpperCase()}</small></span><ChevronRight size={12} /></button>)}{(focusAsset || current.wallet) && !related.length ? <p className="stm-orbit-compact-empty">本榜没有可用完整标识确认的关联身份</p> : null}</div><div className="stm-orbit-binding-note"><ShieldCheck size={13} /><span>{candidate ? `已精确绑定候选 ${candidate.symbol} · ${candidate.chain ?? candidate.market}` : "尚未绑定策略候选"}<small>{candidate ? "研究关联不会自动生成订单" : "缺少链 / 完整合约，或候选库尚未收录"}</small></span></div></section>
    </div>

    <div className="stm-orbit-research-grid stm-orbit-secondary-grid">
      <section className="stm-orbit-panel stm-orbit-depth"><Header title="MARKET DEPTH" meta={marketSymbol} /><p className="stm-orbit-panel-context">{marketBound ? "当前 CEX 候选" : "独立市场参考，与持仓快照分开"} · 数量单位为基础币</p><div className="stm-orbit-depth-columns">{([{ key: "bids", label: "BID / 买盘" }, { key: "asks", label: "ASK / 卖盘" }] as const).map(side => <div key={side.key}><h3>{side.label}<span>PRICE / QTY</span></h3>{market?.[side.key].slice(0, 6).map((level, index) => <div key={`${level.price}:${index}`} className={side.key === "bids" ? "is-positive" : "is-negative"}><span>{safePrice(level.price)}</span><b>{num(level.quantity, 5)}</b></div>)}{!market?.[side.key].length ? <p className="stm-orbit-compact-empty">盘口未提供</p> : null}</div>)}</div><Provenance source={market?.source ?? "Binance public spot"} time={market?.asOf} label="采集" /></section>
      <section className="stm-orbit-panel stm-orbit-evidence-detail"><Header title="EVIDENCE & NEXT STEP" meta={candidate?.symbol ?? "NO CANDIDATE BINDING"} /><div className="stm-orbit-evidence-summary"><span>候选风险 <b>{candidate?.risk === "pass" ? "检查通过" : candidate?.risk === "blocked" ? "阻断" : "未知"}</b></span><span>流动性 <b>{usd(candidate?.liquidityUsd, 0)}</b></span><span>可执行证据 <b>{selectedSignals.filter(row => row.actionable).length} / {selectedSignals.length}</b></span></div>{selectedSignals.map(signal => <details key={signal.id}><summary><b>{signal.strategy}</b><span>{signalText(signal)} · {signal.entities} ENTITIES</span><ChevronRight size={12} /></summary><p>{[...signal.reasons, ...signal.missing].join("；") || "等待完整证据"}</p><Provenance source={`Strategy v${signal.strategyVersion}`} time={signal.asOf} label="评估" /></details>)}{!candidate ? <p className="stm-orbit-compact-empty">研究快照不替代安全检查、实时事件与账户风控。先选择已收录候选。</p> : <p className="stm-orbit-compact-empty">{candidate.reason}</p>}<div className="stm-orbit-workflow-actions"><button type="button" onClick={onStrategies}>策略配置 <ArrowRight size={12} /></button><button type="button" onClick={() => { if (candidate) onSelect(candidate.id); onSimulate?.(); }} disabled={!candidate || !onSimulate} title={!candidate ? "请先绑定候选资产" : "进入现有模拟复盘工作台"}>模拟复盘 <ArrowRight size={12} /></button><button type="button" onClick={() => { if (candidate) onSelect(candidate.id); onExecute(); }} disabled={!candidate} title={!candidate ? "请先绑定候选资产" : "只打开交易预览，仍需独立确认"}>交易预览 <ArrowUpRight size={12} /></button></div></section>
      <section className="stm-orbit-panel stm-orbit-equity"><Header title="EQUITY TRACE" meta="PAPER ONLY" /><div className="stm-orbit-equity-value"><strong className={data.metrics.paperPnlUsd < 0 ? "is-negative" : "is-positive"}>{usd(data.metrics.paperPnlUsd)}</strong><span>模拟已实现 · 含费用</span></div>{paperClosed.length ? <Plot values={equity} color={data.metrics.paperPnlUsd < 0 ? "#f17496" : "#78d7df"} fill /> : <div className="stm-orbit-equity-empty"><Activity size={20} /><span>首笔模拟平仓后生成收益曲线</span></div>}<div className="stm-orbit-holder-summary"><span>模拟持仓 <b>{data.state.paper.filter(row => row.status === "open").length}</b></span><span>已平仓 <b>{paperClosed.length}</b></span><span>归档快照 <b>{data.metrics.snapshots}</b></span></div>{onSimulate ? <button type="button" className="stm-orbit-text-action" onClick={onSimulate}>进入模拟复盘 <ArrowRight size={12} /></button> : null}</section>
    </div>
    <section className="stm-panel stm-orbit-assets"><Header title="OPPORTUNITY RADAR" meta={`${candidates.length} ASSETS`} /><div className="stm-table-tools"><label className="stm-search"><Search size={14} /><input aria-label="搜索候选币种或合约" value={assetQuery} onChange={event => setAssetQuery(event.target.value)} placeholder="搜索代币、名称或合约地址" /></label><select aria-label="候选资产筛选" value={assetFilter} onChange={event => setAssetFilter(event.target.value)}><option value="all">全部资产</option><option value="cex">CEX 市场</option><option value="onchain">链上资产</option><option value="watched">我的关注</option></select></div><div className="stm-orbit-asset-layout"><div className="stm-table-scroll"><table className="stm-table"><thead><tr><th scope="col">资产 / 市场</th><th scope="col">价格 / 24H</th><th scope="col">策略证据</th><th scope="col">来源</th><th scope="col">关注</th></tr></thead><tbody>{candidates.map(row => { const signal = data.signals.find(item => item.candidateId === row.id && item.actionable) ?? data.signals.find(item => item.candidateId === row.id); return <tr key={row.id} className={row.id === candidate?.id ? "is-selected" : ""}><td><button className="stm-asset-button" type="button" onClick={() => chooseCandidate(row.id)} aria-pressed={row.id === candidate?.id}><span className="stm-token-icon">{row.symbol.slice(0, 2)}</span><span><strong>{row.symbol}</strong><small>{row.chain?.toUpperCase() || "BINANCE"}</small></span></button></td><td><strong className="stm-mono">{safePrice(row.price)}</strong><small className={row.change24h == null ? "" : row.change24h < 0 ? "stm-pink" : "stm-green"}>{row.change24h == null ? "—" : `${num(row.change24h)}%`}</small></td><td><span className={`stm-badge stm-tone-${signal?.actionable ? "green" : "yellow"}`}>{signal?.strategy ?? "—"} · {signalText(signal)}</span><small>{signal?.missing.length ?? "—"} 项待核验</small></td><td><div className="stm-source-tags">{row.sources.map(id => <span key={id}>{id}</span>)}</div></td><td><button type="button" className={`stm-icon-button ${data.state.watchlist.includes(row.id) ? "is-active" : ""}`} disabled={busy} aria-label={`${data.state.watchlist.includes(row.id) ? "取消关注" : "关注"}${row.symbol}`} onClick={() => onWatch(row.id, !data.state.watchlist.includes(row.id))}><Bell size={14} /></button></td></tr>; })}</tbody></table>{!candidates.length ? <p className="stm-orbit-empty">没有匹配的候选资产</p> : null}</div><aside className="stm-orbit-asset-detail"><span>ASSET INTELLIGENCE</span><h3>{candidate?.symbol || "选择候选资产"}<small>{candidate?.chain?.toUpperCase() || candidate?.market.toUpperCase()}</small></h3><strong>{safePrice(candidate?.price)}</strong><p>{candidate?.reason || "持仓按链和完整合约绑定；也可直接选择左侧候选。"}</p>{candidate?.address ? <code>{candidate.address}</code> : null}<dl><div><dt>24H 成交量</dt><dd>{usd(candidate?.volumeUsd, 0)}</dd></div><div><dt>池流动性</dt><dd>{usd(candidate?.liquidityUsd, 0)}</dd></div><div><dt>风险状态</dt><dd>{candidate?.risk === "pass" ? "检查通过" : candidate?.risk === "blocked" ? "阻断" : "待验证"}</dd></div></dl><Provenance source={candidate?.sources.join(" / ")} time={candidate?.updatedAt} /><button type="button" className="stm-button stm-button-primary" disabled={!candidate} onClick={() => { if (candidate) onSelect(candidate.id); onExecute(); }}>交易预览 <ArrowUpRight size={14} /></button></aside></div></section>
    <div className="stm-orbit-bottom-ticker"><span><i /> DATA ≠ EXECUTION</span><p>公开持仓与榜单用于研究。链上成交、安全检查与账户风控齐备后，进入用户确认流程。</p><span>STM / OBSERVE · VERIFY · EXECUTE</span></div>
  </div>;
}
