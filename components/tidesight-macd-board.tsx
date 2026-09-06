"use client";

import { Activity, BellRing, Check, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TideSightMacdChart } from "@/components/tidesight-macd-chart";
import { TIDESIGHT_MACD_INTERVALS, TIDESIGHT_MACD_MARKETS } from "@/lib/tidesight/market-universe";
import styles from "@/components/tidesight-quant-surface.module.css";

type Language = "zh" | "en";
type MacdSignal = "GOLDEN_CROSS" | "REBIRTH_GOLDEN_CROSS" | "DEATH_CROSS" | "NONE";

type MacdMonitor = {
  symbol: string;
  asset: string;
  interval: string;
  intervalZh: string;
  intervalEn: string;
  closedAt: string;
  closePrice: number;
  dif: number;
  dea: number;
  histogram: number;
  relation: "BULLISH" | "BEARISH";
  signal: MacdSignal;
  lastCross: { signal: Exclude<MacdSignal, "NONE">; closedAt: string; barsAgo: number; dif: number; dea: number } | null;
};

type MacdPayload = {
  ok: true;
  checkedAt: string;
  monitors: MacdMonitor[];
  failures: Array<{ symbol: string; interval: string; error: string }>;
};

const signalClass: Record<MacdSignal, string> = {
  GOLDEN_CROSS: styles.macdGolden,
  REBIRTH_GOLDEN_CROSS: styles.macdRebirth,
  DEATH_CROSS: styles.macdDeath,
  NONE: styles.macdNeutral,
};

function signalLabel(signal: MacdSignal, language: Language) {
  const labels: Record<MacdSignal, [string, string]> = {
    GOLDEN_CROSS: ["黄金十字交叉", "Golden cross"],
    REBIRTH_GOLDEN_CROSS: ["重生黄金十字交叉", "Rebirth golden cross"],
    DEATH_CROSS: ["死亡黄金十字交叉", "Death cross"],
    NONE: ["暂无新交叉", "No new cross"],
  };
  return labels[signal][language === "zh" ? 0 : 1];
}

function signalIcon(signal: MacdSignal) {
  if (signal === "GOLDEN_CROSS") return "✦";
  if (signal === "REBIRTH_GOLDEN_CROSS") return "🔥";
  if (signal === "DEATH_CROSS") return "◈";
  return "—";
}

function formatMacd(value: number) {
  const absolute = Math.abs(value);
  const digits = absolute >= 100 ? 2 : absolute >= 1 ? 3 : absolute >= 0.01 ? 5 : 7;
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) });
}

function shortDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function TideSightMacdBoard({ language, standalone = false }: { language: Language; standalone?: boolean }) {
  const [payload, setPayload] = useState<MacdPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const tr = useCallback((zh: string, en: string) => language === "zh" ? zh : en, [language]);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/tidesight/macd", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as MacdPayload & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setPayload(body);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "MACD data unavailable");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const currentSignals = useMemo(() => payload?.monitors.filter((item) => item.signal !== "NONE") ?? [], [payload]);
  const byKey = useMemo(() => new Map(payload?.monitors.map((item) => [`${item.symbol}:${item.interval}`, item]) ?? []), [payload]);

  return (
    <section className={`${styles.macdSection} ${standalone ? styles.macdStandalone : ""}`} aria-labelledby="tidesight-macd-title">
      <div className={styles.sectionTitle}>
        <div><span>MACD MULTI-TIMEFRAME MONITOR</span><h2 id="tidesight-macd-title">{tr("MACD 多周期监控信号", "MACD multi-timeframe signals")}</h2></div>
        <div className={styles.macdSource}>
          <span><i />BINANCE CLOSED KLINES · MACD 12/26/9</span>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} aria-label={tr("刷新 MACD", "Refresh MACD")}><RefreshCw className={refreshing ? styles.spinning : ""} /></button>
        </div>
      </div>

      <div className={`${styles.macdAlert} ${currentSignals.length ? styles.macdAlertActive : ""}`} role="status">
        {currentSignals.length ? <BellRing /> : <Activity />}
        <div>
          <strong>{currentSignals.length ? tr(`发现 ${currentSignals.length} 个已确认交叉信号`, `${currentSignals.length} confirmed cross signal(s)`) : tr("当前无新交叉，监控持续运行", "No new cross; monitoring remains active")}</strong>
          <span>{payload?.checkedAt ? `${tr("更新时间", "Updated")} ${new Date(payload.checkedAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US")}` : tr("正在读取 72 个已收盘 K 线面板", "Loading 72 closed-candle panels")}</span>
        </div>
        {currentSignals.length ? <div className={styles.macdAlertSignals}>{currentSignals.map((item) => <span className={signalClass[item.signal]} key={`${item.symbol}:${item.interval}`}>{item.asset} · {language === "zh" ? item.intervalZh : item.intervalEn} · {signalLabel(item.signal, language)}</span>)}</div> : null}
      </div>

      <div className={styles.macdDefinitions}>
        <article><span className={styles.macdGolden}>✦</span><div><strong>{tr("黄金十字交叉", "Golden cross")}</strong><p>{tr("DIF 从下向上穿越 DEA。", "DIF crosses above DEA.")}</p></div></article>
        <article><span className={styles.macdRebirth}>🔥</span><div><strong>{tr("重生黄金十字交叉", "Rebirth golden cross")}</strong><p>{tr("DIF 与 DEA 均在零轴下方，DIF 上升穿越 DEA。", "Below zero, rising DIF crosses above DEA.")}</p></div></article>
        <article><span className={styles.macdDeath}>◈</span><div><strong>{tr("死亡黄金十字交叉", "Death cross")}</strong><p>{tr("DIF 与 DEA 均在零轴上方，DIF 下降穿越 DEA。", "Above zero, falling DIF crosses below DEA.")}</p></div></article>
      </div>

      <TideSightMacdChart language={language} />

      {error ? <div className={styles.macdError}><TriangleAlert /><span>{error}</span><button type="button" onClick={() => void load(true)}>{tr("重试", "Retry")}</button></div> : null}

      <div className={styles.macdAssets}>
        {TIDESIGHT_MACD_MARKETS.map(({ symbol, asset }) => {
          const assetRows = TIDESIGHT_MACD_INTERVALS.map((timeframe) => byKey.get(`${symbol}:${timeframe.interval}`)).filter(Boolean) as MacdMonitor[];
          const assetSignals = assetRows.filter((item) => item.signal !== "NONE").length;
          return (
            <section className={styles.macdAsset} key={symbol} aria-label={`${asset} MACD`}>
              <header><div><strong>{asset}</strong><span>USDT PERPETUAL</span></div><em className={assetSignals ? styles.macdSignalCount : ""}>{assetSignals ? tr(`${assetSignals} 个新信号`, `${assetSignals} NEW`) : tr("监控中", "MONITORING")}</em></header>
              <div className={styles.macdGrid}>
                {TIDESIGHT_MACD_INTERVALS.map((timeframe) => {
                  const item = byKey.get(`${symbol}:${timeframe.interval}`);
                  const failure = payload?.failures.find((entry) => entry.symbol === symbol && entry.interval === timeframe.interval);
                  if (!item) return <article className={`${styles.macdCard} ${styles.macdCardLoading}`} key={timeframe.interval}><span>{language === "zh" ? timeframe.zh : timeframe.en}</span><strong>—</strong><p>{failure?.error ?? (error ? tr("数据暂不可用", "Data unavailable") : tr("读取已收盘 K 线", "Loading closed candles"))}</p></article>;
                  const newestSignal = item.signal !== "NONE";
                  const displayedSignal = newestSignal ? item.signal : item.lastCross?.signal ?? "NONE";
                  return (
                    <article className={`${styles.macdCard} ${newestSignal ? styles.macdCardSignal : ""}`} key={item.interval}>
                      <div><span>{language === "zh" ? item.intervalZh : item.intervalEn}</span><em>{item.interval.toUpperCase()}</em></div>
                      <strong className={newestSignal ? signalClass[item.signal] : item.relation === "BULLISH" ? styles.macdBullish : styles.macdBearish}>{newestSignal ? `${signalIcon(item.signal)} ${signalLabel(item.signal, language)}` : item.relation === "BULLISH" ? tr("DIF 位于 DEA 上方", "DIF above DEA") : tr("DIF 位于 DEA 下方", "DIF below DEA")}</strong>
                      <dl><div><dt>DIF</dt><dd>{formatMacd(item.dif)}</dd></div><div><dt>DEA</dt><dd>{formatMacd(item.dea)}</dd></div><div><dt>MACD</dt><dd className={item.histogram >= 0 ? styles.positive : styles.negative}>{formatMacd(item.histogram)}</dd></div></dl>
                      <footer><span>{item.lastCross ? `${tr("最近", "Last")}: ${signalLabel(displayedSignal, language)} · ${item.lastCross.barsAgo}${tr(" 根前", " bars ago")}` : tr("历史窗口内无定义交叉", "No defined cross in window")}</span><time dateTime={item.closedAt}>{shortDate(item.closedAt, language)}</time></footer>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <footer className={styles.macdMethod}><Check /><span>{tr("信号只使用已收盘 K 线确认；当前月、周、日或分钟 K 线未收盘前不会触发交叉提示。此看板是技术指标监控，不构成交易建议。", "Signals use closed candles only. No cross alert fires before the current candle closes. This technical monitor is not trading advice.")}</span>{payload?.failures.length ? <em>{tr(`${payload.failures.length} 个面板暂不可用`, `${payload.failures.length} panel(s) unavailable`)}</em> : null}</footer>
    </section>
  );
}
