"use client";

import { Activity, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TIDESIGHT_MACD_INTERVALS, TIDESIGHT_MACD_MARKETS } from "@/lib/tidesight/market-universe";
import type { MacdChartPoint, MacdSignal } from "@/lib/tidesight/macd";
import styles from "@/components/tidesight-quant-surface.module.css";

type Language = "zh" | "en";

type ChartPayload = {
  ok: true;
  symbol: string;
  asset: string;
  interval: string;
  intervalZh: string;
  intervalEn: string;
  checkedAt: string;
  series: MacdChartPoint[];
};

const SIGNAL_COLORS: Record<MacdSignal, string> = {
  GOLDEN_CROSS: "var(--ts-gold)",
  REBIRTH_GOLDEN_CROSS: "var(--ts-orange)",
  DEATH_CROSS: "var(--ts-red)",
  NONE: "transparent",
};

function signalName(signal: MacdSignal, language: Language) {
  const labels: Record<MacdSignal, [string, string]> = {
    GOLDEN_CROSS: ["黄金十字交叉", "Golden cross"],
    REBIRTH_GOLDEN_CROSS: ["重生黄金十字交叉", "Rebirth golden cross"],
    DEATH_CROSS: ["死亡黄金十字交叉", "Death cross"],
    NONE: ["无新交叉", "No new cross"],
  };
  return labels[signal][language === "zh" ? 0 : 1];
}

function formatAxis(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 100_000) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  if (absolute >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (absolute >= 1) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 5 });
}

function linePath(points: MacdChartPoint[], x: (index: number) => number, y: (value: number) => number, field: "dif" | "dea") {
  return points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point[field]).toFixed(2)}`).join(" ");
}

function MacdSvg({ series, language }: { series: MacdChartPoint[]; language: Language }) {
  const width = 1200;
  const left = 48;
  const right = 1138;
  const priceTop = 34;
  const priceBottom = 330;
  const macdTop = 386;
  const macdBottom = 614;
  const plotWidth = right - left;
  const step = plotWidth / Math.max(series.length, 1);
  const candleWidth = Math.max(1.5, Math.min(7.5, step * 0.62));
  let priceMin = Infinity;
  let priceMax = -Infinity;
  let macdAbs = 0;
  let volumeMax = 0;
  for (const point of series) {
    priceMin = Math.min(priceMin, point.low);
    priceMax = Math.max(priceMax, point.high);
    macdAbs = Math.max(macdAbs, Math.abs(point.dif), Math.abs(point.dea), Math.abs(point.histogram));
    volumeMax = Math.max(volumeMax, point.volume);
  }
  const pricePadding = Math.max((priceMax - priceMin) * 0.08, priceMax * 0.002);
  priceMin -= pricePadding;
  priceMax += pricePadding;
  macdAbs = Math.max(macdAbs * 1.14, 0.000001);
  const x = (index: number) => left + (index + 0.5) * step;
  const priceY = (value: number) => priceTop + ((priceMax - value) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const macdY = (value: number) => macdTop + ((macdAbs - value) / (macdAbs * 2)) * (macdBottom - macdTop);
  const zeroY = macdY(0);
  const priceGrid = Array.from({ length: 6 }, (_, index) => priceMin + ((priceMax - priceMin) * index) / 5);
  const macdGrid = [-1, -0.5, 0, 0.5, 1].map((ratio) => macdAbs * ratio);
  const labelIndexes = Array.from(new Set([0, .2, .4, .6, .8, 1].map((ratio) => Math.min(series.length - 1, Math.round((series.length - 1) * ratio)))));

  return (
    <svg className={styles.macdRealtimeSvg} viewBox={`0 0 ${width} 650`} role="img" aria-label={language === "zh" ? "实时蜡烛图与 MACD 指标图" : "Live candlestick and MACD indicator chart"} data-testid="macd-realtime-chart">
      <defs>
        <linearGradient id="macd-chart-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--ts-panel-raised)" stopOpacity=".55" /><stop offset="1" stopColor="var(--ts-panel-solid)" stopOpacity=".2" /></linearGradient>
        <clipPath id="price-clip"><rect x={left} y={priceTop} width={plotWidth} height={priceBottom - priceTop} /></clipPath>
        <clipPath id="macd-clip"><rect x={left} y={macdTop} width={plotWidth} height={macdBottom - macdTop} /></clipPath>
      </defs>
      <rect x={left} y={priceTop} width={plotWidth} height={priceBottom - priceTop} fill="url(#macd-chart-bg)" />
      <rect x={left} y={macdTop} width={plotWidth} height={macdBottom - macdTop} fill="url(#macd-chart-bg)" />
      {priceGrid.map((value) => {
        const y = priceY(value);
        return <g key={`price-${value}`}><line x1={left} x2={right} y1={y} y2={y} className={styles.macdChartGridLine} /><text x={right + 8} y={y + 3} className={styles.macdChartAxis}>{formatAxis(value)}</text></g>;
      })}
      {macdGrid.map((value) => {
        const y = macdY(value);
        return <g key={`macd-${value}`}><line x1={left} x2={right} y1={y} y2={y} className={value === 0 ? styles.macdChartZero : styles.macdChartGridLine} /><text x={right + 8} y={y + 3} className={styles.macdChartAxis}>{formatAxis(value)}</text></g>;
      })}
      {labelIndexes.map((index) => {
        const point = series[index];
        const xValue = x(index);
        return <g key={`time-${point.closeTime}`}><line x1={xValue} x2={xValue} y1={priceTop} y2={macdBottom} className={styles.macdChartGridLine} /><text x={xValue} y="640" textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"} className={styles.macdChartAxis}>{new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", { month: "2-digit", day: "2-digit", year: series.length < 80 ? undefined : "2-digit" }).format(point.closeTime)}</text></g>;
      })}
      <g clipPath="url(#price-clip)">
        {series.map((point, index) => {
          const xValue = x(index);
          const rising = point.close >= point.open;
          const bodyTop = priceY(Math.max(point.open, point.close));
          const bodyHeight = Math.max(1.4, Math.abs(priceY(point.open) - priceY(point.close)));
          const volumeHeight = volumeMax ? (point.volume / volumeMax) * 26 : 0;
          const color = rising ? "var(--ts-chart-up)" : "var(--ts-chart-down)";
          return <g key={point.closeTime} data-candle="true"><rect x={xValue - candleWidth / 2} y={priceBottom - volumeHeight} width={candleWidth} height={volumeHeight} fill={color} opacity=".12" /><line x1={xValue} x2={xValue} y1={priceY(point.high)} y2={priceY(point.low)} stroke={color} strokeWidth="1" opacity=".82" /><rect x={xValue - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} rx=".5" /></g>;
        })}
      </g>
      <text x={left} y="22" className={styles.macdChartPanelLabel}>{language === "zh" ? "价格 / 成交量" : "PRICE / VOLUME"}</text>
      <text x={left} y="372" className={styles.macdChartPanelLabel}>MACD 12 / 26 / 9</text>
      <g clipPath="url(#macd-clip)">
        {series.map((point, index) => {
          const xValue = x(index);
          const yValue = macdY(point.histogram);
          const height = Math.max(1, Math.abs(zeroY - yValue));
          return <rect key={`bar-${point.closeTime}`} x={xValue - candleWidth / 2} y={Math.min(zeroY, yValue)} width={candleWidth} height={height} fill={point.histogram >= 0 ? "var(--ts-chart-up)" : "var(--ts-chart-down)"} opacity={.72} />;
        })}
        <path d={linePath(series, x, macdY, "dif")} fill="none" stroke="var(--ts-chart-dif)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        <path d={linePath(series, x, macdY, "dea")} fill="none" stroke="var(--ts-chart-dea)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        {series.map((point, index) => point.signal === "NONE" ? null : <g key={`signal-${point.closeTime}`}><circle cx={x(index)} cy={macdY(point.dif)} r="5" fill={SIGNAL_COLORS[point.signal]} stroke="var(--ts-panel-solid)" strokeWidth="2" /><line x1={x(index)} x2={x(index)} y1={macdY(point.dif) + 7} y2={zeroY} stroke={SIGNAL_COLORS[point.signal]} strokeWidth="1" strokeDasharray="3 4" opacity=".55" /></g>)}
      </g>
    </svg>
  );
}

export function TideSightMacdChart({ language }: { language: Language }) {
  const [symbol, setSymbol] = useState<(typeof TIDESIGHT_MACD_MARKETS)[number]["symbol"]>("BTCUSDT");
  const [interval, setInterval] = useState<(typeof TIDESIGHT_MACD_INTERVALS)[number]["interval"]>("1d");
  const [payload, setPayload] = useState<ChartPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const tr = useCallback((zh: string, en: string) => language === "zh" ? zh : en, [language]);

  const load = useCallback(async (manual = false) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (manual) setRefreshing(true);
    try {
      const response = await fetch(`/api/tidesight/macd/chart?symbol=${symbol}&interval=${interval}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => ({})) as ChartPayload & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setPayload(body);
      setError(null);
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "MACD chart unavailable");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (manual) setRefreshing(false);
      }
    }
  }, [interval, symbol]);

  useEffect(() => {
    setPayload(null);
    setRefreshing(false);
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => {
      window.clearInterval(timer);
      requestRef.current?.abort();
    };
  }, [load]);

  const latest = payload?.series.at(-1) ?? null;
  const previous = payload?.series.at(-2) ?? null;
  const priceChange = latest && previous ? ((latest.close - previous.close) / previous.close) * 100 : 0;
  const recentCrosses = useMemo(() => payload?.series.filter((point) => point.signal !== "NONE").slice(-4).reverse() ?? [], [payload]);

  return (
    <section className={styles.macdRealtime} aria-labelledby="macd-realtime-title">
      <header className={styles.macdRealtimeHeader}>
        <div><span>REAL-TIME MULTI-PERIOD CHART</span><h3 id="macd-realtime-title">{tr("多周期 MACD 实时图表", "Real-time multi-period MACD chart")}</h3><p>{tr("蜡烛价格、成交量、DIF / DEA 与双倍 MACD 柱共用同一闭合 K 线时间轴。", "Candles, volume, DIF / DEA, and doubled MACD histogram share one closed-candle timeline.")}</p></div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} aria-label={tr("刷新实时 MACD 图表", "Refresh live MACD chart")}><RefreshCw className={refreshing ? styles.spinning : ""} /></button>
      </header>

      <div className={styles.macdAssetSelector} role="group" aria-label={tr("选择代币", "Select asset")}>
        {TIDESIGHT_MACD_MARKETS.map((market) => <button type="button" key={market.symbol} className={symbol === market.symbol ? styles.macdSelectorActive : ""} aria-pressed={symbol === market.symbol} onClick={() => setSymbol(market.symbol)}><strong>{market.asset}</strong><span>/ USDT</span></button>)}
      </div>
      <div className={styles.macdPeriodSelector} role="group" aria-label={tr("选择 MACD 周期", "Select MACD interval")}>
        {TIDESIGHT_MACD_INTERVALS.map((timeframe) => <button type="button" key={timeframe.interval} className={interval === timeframe.interval ? styles.macdSelectorActive : ""} aria-pressed={interval === timeframe.interval} onClick={() => setInterval(timeframe.interval)}><span>{language === "zh" ? timeframe.zh : timeframe.en}</span><em>{timeframe.interval.toUpperCase()}</em></button>)}
      </div>

      <div className={styles.macdChartFrame}>
        <div className={styles.macdChartTicker}>
          <div><span>{payload?.asset ?? symbol.replace("USDT", "")} / USDT · {payload ? language === "zh" ? payload.intervalZh : payload.intervalEn : interval.toUpperCase()}</span><strong>{latest ? formatAxis(latest.close) : "—"}</strong><em className={priceChange >= 0 ? styles.positive : styles.negative}>{latest ? `${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(2)}%` : tr("读取中", "LOADING")}</em></div>
          <dl><div><dt>DIF</dt><dd>{latest ? formatAxis(latest.dif) : "—"}</dd></div><div><dt>DEA</dt><dd>{latest ? formatAxis(latest.dea) : "—"}</dd></div><div><dt>MACD</dt><dd className={latest && latest.histogram >= 0 ? styles.positive : styles.negative}>{latest ? formatAxis(latest.histogram) : "—"}</dd></div></dl>
          <div className={styles.macdChartLegend}><span><i className={styles.legendDif} />DIF</span><span><i className={styles.legendDea} />DEA</span><span><i className={styles.legendPositive} />MACD +</span><span><i className={styles.legendNegative} />MACD −</span></div>
        </div>
        {error ? <div className={styles.macdChartState}><TriangleAlert /><strong>{error}</strong><button type="button" onClick={() => void load(true)}>{tr("重试", "Retry")}</button></div>
          : payload?.series.length ? <MacdSvg series={payload.series} language={language} />
            : <div className={styles.macdChartState}><Activity /><strong>{payload ? tr("上市历史不足 35 根已收盘 K 线，暂不能计算 MACD；请选择更短周期。", "Fewer than 35 closed candles are available. Select a shorter interval.") : tr("正在读取闭合 K 线并计算 MACD", "Loading closed candles and calculating MACD")}</strong></div>}
      </div>

      <footer className={styles.macdChartFooter}>
        <div><span>{tr("最近交叉", "RECENT CROSSES")}</span>{recentCrosses.length ? recentCrosses.map((point) => <strong key={point.closeTime} style={{ color: SIGNAL_COLORS[point.signal] }}>{signalName(point.signal, language)} · {new Date(point.closeTime).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US")}</strong>) : <strong>{tr("当前图表窗口内无定义交叉", "No defined cross in this chart window")}</strong>}</div>
        <p><i />{tr("BINANCE 永续合约 · 仅已闭合 K 线 · 每 60 秒刷新", "BINANCE PERPETUALS · CLOSED CANDLES ONLY · REFRESHES EVERY 60S")}</p>
      </footer>
    </section>
  );
}
