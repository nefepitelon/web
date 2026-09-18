"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Bar, Box, Market } from "@/lib/box-breakout/types";
import styles from "./box-breakout.module.css";

const cache = new Map<string, { at: number; bars: Bar[]; source: string }>();
const CHART_CACHE_MS = 15 * 60_000;
export function priceLabel(value: number) {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 2 : value >= 1 ? 3 : 8 });
}

export function BoxBreakoutChart({ symbol, market, box, expanded = false }: { symbol: string; market: Market; box: Box | null; expanded?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<Bar[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let started = false;
    setError("");
    const load = async () => {
      if (started) return;
      started = true;
      const key = `${market}:${symbol}`;
      const saved = cache.get(key);
      if (saved && Date.now() - saved.at < CHART_CACHE_MS) { setBars(saved.bars); setSource(saved.source); return; }
      try {
        const response = await fetch(`/api/box-breakout/chart?market=${market}&symbol=${encodeURIComponent(symbol)}`, { signal: abort.signal });
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.bars) || !result.bars.length) throw new Error(result.error || "日 K 数据暂不可用");
        const entry = { at: Date.now(), bars: result.bars as Bar[], source: result.source || "公开行情 · 日 K" };
        if (cache.size > 80) cache.clear();
        cache.set(key, entry); setBars(entry.bars); setSource(entry.source);
      } catch (caught) { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : "图表加载失败"); }
    };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load(); }, { rootMargin: "120px" });
    if (host.current) observer.observe(host.current);
    return () => { observer.disconnect(); abort.abort(); };
  }, [symbol, market, retry]);
  const shown = useMemo(() => bars.slice(expanded ? -160 : -80), [bars, expanded]);
  const width = 720, height = expanded ? 380 : 250, left = 12, right = 66, top = 32, bottom = height - 62;
  const range = useMemo(() => {
    const values = shown.flatMap(bar => [bar.low, bar.high]);
    if (box) values.push(box.low, box.high);
    const min = Math.min(...values), max = Math.max(...values);
    const pad = (max - min || max * 0.05 || 1) * .14;
    return { min: min - pad, max: max + pad, volume: Math.max(1, ...shown.map(bar => bar.volume)) };
  }, [shown, box]);
  const plotWidth = width - left - right;
  const step = plotWidth / Math.max(shown.length, 1);
  const x = (index: number) => left + step * (index + .5);
  const y = (value: number) => top + (range.max - value) / (range.max - range.min) * (bottom - top);
  const focused = shown[active ?? shown.length - 1];
  return <div ref={host} className={`${styles.chart} ${expanded ? styles.expandedChart : ""}`}>
    {!shown.length ? <div className={styles.chartEmpty}>{error ? <><span>{error}</span><button onClick={() => setRetry(value => value + 1)}>重试图表</button></> : <span className={styles.pulse}>正在读取日 K 数据…</span>}</div> : <>
      <div className={styles.ohlc} aria-live="off"><span>{focused?.date}</span><span>开 {priceLabel(focused.open)}</span><span>高 {priceLabel(focused.high)}</span><span>低 {priceLabel(focused.low)}</span><span>收 {priceLabel(focused.close)}</span><span>量 {Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(focused.volume)}</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${symbol} 日K与成交量，箱体 ${box ? `${priceLabel(box.low)} 至 ${priceLabel(box.high)}` : "尚未形成"}`} tabIndex={0}
        onPointerMove={event => { const bounds = event.currentTarget.getBoundingClientRect(); setActive(Math.max(0, Math.min(shown.length - 1, Math.floor(((event.clientX - bounds.left) / bounds.width * width - left) / step)))); }}
        onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)}
        onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setActive(index => Math.max(0, Math.min(shown.length - 1, (index ?? shown.length - 1) + (event.key === "ArrowLeft" ? -1 : 1)))); } }}>
        {[0, .25, .5, .75, 1].map(ratio => { const value = range.min + (range.max - range.min) * ratio; return <g key={ratio}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className={styles.gridLine} /><text x={width - right + 9} y={y(value) + 4} className={styles.axis}>{priceLabel(value)}</text></g>; })}
        {box && <g><rect x={left} y={y(box.high)} width={plotWidth} height={Math.max(0, y(box.low) - y(box.high))} className={styles.boxFill} /><line x1={left} x2={width - right} y1={y(box.high)} y2={y(box.high)} className={styles.boxLine} /><line x1={left} x2={width - right} y1={y(box.low)} y2={y(box.low)} className={styles.boxLine} /><text x={left + 5} y={y(box.high) - 5} className={styles.boxText}>箱顶 {priceLabel(box.high)}</text><text x={left + 5} y={y(box.low) + 13} className={styles.boxText}>箱底 {priceLabel(box.low)}</text></g>}
        {shown.map((bar, index) => { const color = bar.close >= bar.open ? "var(--box-up)" : "var(--box-down)"; return <g key={bar.date}><line x1={x(index)} x2={x(index)} y1={y(bar.high)} y2={y(bar.low)} stroke={color} strokeWidth="1" /><rect x={x(index) - step * .32} y={Math.min(y(bar.open), y(bar.close))} width={Math.max(1, step * .64)} height={Math.max(1, Math.abs(y(bar.open) - y(bar.close)))} fill={color} /><rect x={x(index) - step * .32} y={height - 23 - bar.volume / range.volume * 28} width={Math.max(1, step * .64)} height={bar.volume / range.volume * 28} fill={color} opacity=".45" />{box?.testDates.includes(bar.date) && <circle cx={x(index)} cy={y(bar.high) - 7} r="2.5" fill="var(--box-gold)" />}</g>; })}
        {active !== null && <g><line x1={x(active)} x2={x(active)} y1={top} y2={height - 23} className={styles.crosshair} /><line x1={left} x2={width - right} y1={y(focused.close)} y2={y(focused.close)} className={styles.crosshair} /><circle cx={x(active)} cy={y(focused.close)} r="3" fill="var(--box-accent)" /></g>}
        {[0, Math.floor(shown.length / 2), shown.length - 1].map(index => <text key={index} x={x(index)} y={height - 7} textAnchor={index === 0 ? "start" : index === shown.length - 1 ? "end" : "middle"} className={styles.axis}>{shown[index].date.slice(5)}</text>)}
      </svg><div className={styles.chartLegend}><span><i /> 日 K / 成交量</span><span><i className={styles.goldDot} /> 箱顶试盘</span><span title={source}>{source}</span></div>
    </>}
  </div>;
}
