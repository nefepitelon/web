"use client";

import Link from "next/link";
import { Activity, ArrowUpRight, Bell, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3, Download, Expand, Layers3, LoaderCircle, Plus, Radar, RefreshCw, Search, Settings2, ShieldCheck, Square, Star, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Candidate, Command, CryptoScanMode, DashboardState, Market, Quote, ScanMode, Settings } from "@/lib/box-breakout/types";
import { BoxBreakoutChart, priceLabel } from "./box-breakout-chart";
import styles from "./box-breakout.module.css";

const defaults: Settings = { pool: [], sectors: [], auto: false, autoTimes: ["11:30", "15:00"], telegramEnabled: false, telegramChat: "", telegramConfigured: false };
const empty: DashboardState = { settings: defaults, job: null, stocks: [], crypto: [], topics: [], asOf: null, signedIn: false };
const stamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "尚未扫描";
const modeNames: Record<ScanMode, string> = { market: "全市场扫描", quick: "快速扫描 · 200", pool: "自选池扫描", crypto: "加密扫描 · TOP 30", "crypto-radar": "α-RadarTP · 异动排行榜", "crypto-mainstream": "α-RadarTP · 热门精选主流", "crypto-risk-pool": "Alpha 雷达 · 风控候选清单", "crypto-alpha-market-cap": "Binance Alpha · 小市值", "crypto-alpha-open-interest": "Binance Alpha · 持仓量" };
const cryptoScans: { mode: CryptoScanMode; source: string; label: string; accessibleLabel: string }[] = [
  { mode: "crypto-radar", source: "α-RadarTP", label: "扫描异动排行榜", accessibleLabel: "扫描α-RadarTP异动排行榜" },
  { mode: "crypto-mainstream", source: "α-RadarTP", label: "扫描热门精选主流", accessibleLabel: "扫描α-RadarTP热门精选主流" },
  { mode: "crypto", source: "BINANCE · USDT 永续", label: "扫描涨幅 TOP 30", accessibleLabel: "扫描涨幅 TOP 30" },
];
const cryptoPoolNames: Record<CryptoScanMode, string> = { crypto: "加密涨幅机会池", "crypto-radar": "α-RadarTP 异动机会池", "crypto-mainstream": "α-RadarTP 主流机会池", "crypto-risk-pool": "雷达执行池箱体机会", "crypto-alpha-market-cap": "Alpha 小市值箱体机会", "crypto-alpha-open-interest": "Alpha 持仓量箱体机会" };
const cryptoSourceDescriptions: Record<CryptoScanMode, string> = { crypto: "Binance USDT 永续 · 按 24h 涨幅", "crypto-radar": "α-RadarTP 异动排行榜 · 可用 USDT 永续", "crypto-mainstream": "α-RadarTP 热门精选主流 · 可用 USDT 永续", "crypto-risk-pool": "Alpha 雷达风控候选清单 · 可用 USDT 永续", "crypto-alpha-market-cap": "Binance Skills Hub Alpha · 市值从小到大", "crypto-alpha-open-interest": "Binance Skills Hub Alpha · 合约持仓量从高到低" };
const ACTIVE_STATE_POLL_MS = 10_000;
const IDLE_STATE_POLL_MS = 15 * 60_000;
const QUOTE_POLL_MS: Record<Market, number> = { ashare: 30_000, crypto: 15_000 };
const errorText = (error: unknown) => error instanceof Error ? error.message : "请求失败，请稍后重试。";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || value.message || "服务暂不可用，请稍后重试。");
  return value as T;
}

function Dialog({ title, children, close, wide = false }: { title: string; children: React.ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wideDialog : ""}`} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} aria-label={title}>
    <div className={styles.dialogHeading}><h2>{title}</h2><button aria-label="关闭" onClick={close}><X size={20} /></button></div>{children}
  </dialog>;
}

function CandidateCard({ candidate, quote, inPool, canOperate, addPool, expand }: { candidate: Candidate; quote?: Quote; inPool: boolean; canOperate: boolean; addPool: () => void; expand: () => void }) {
  const q = quote ?? candidate.quote;
  const recent = Date.now() - Date.parse(q.asOf) < 60_000;
  return <article className={`${styles.card} ${candidate.qualified ? styles.qualifiedCard : ""}`} aria-label={`${candidate.name} · 箱体突破评分 ${candidate.score}`} data-market={candidate.market}>
    <div className={styles.cardHeading}><div><span className={styles.code}>{candidate.symbol} <span>{candidate.market === "crypto" ? "USDT PERP" : "A-SHARE"}</span></span><h3>{candidate.name}</h3></div><div className={`${styles.score} ${candidate.qualified ? styles.qualifiedScore : ""}`}><strong>{candidate.score}</strong><span>/ 100</span></div></div>
    <div className={styles.priceRow}><strong>{candidate.market === "crypto" ? "$" : "¥"}{priceLabel(q.price)}</strong><span className={q.changePct >= 0 ? styles.up : styles.down}>{q.changePct >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%</span><span className={styles.statusTag}>{candidate.status}</span></div>
    <div className={styles.topicTags}>{(candidate.matchedTopics.length ? candidate.matchedTopics : candidate.concepts.slice(0, 2)).map(topic => <span key={topic}>{topic}</span>)}{!candidate.concepts.length && candidate.market === "crypto" && <span>Binance USDT 永续</span>}</div>
    <BoxBreakoutChart symbol={candidate.symbol} market={candidate.market} box={candidate.box} />
    <div className={styles.conditions} aria-label="评分项目">{candidate.conditions.map(condition => <div key={condition.key} title={condition.detail}><span><i className={condition.passed ? styles.passedDot : ""} />{condition.label}</span><strong>{condition.points}<small> / {condition.maximum}</small></strong><p>{condition.detail}</p></div>)}</div>
    <div className={styles.boxStats}><span>箱体位置 <b>{candidate.box ? `${candidate.box.positionPct.toFixed(1)}%` : "—"}</b></span><span>箱体振幅 <b>{candidate.box ? `${candidate.box.spanPct.toFixed(1)}%` : "—"}</b></span><span>连续倍量 <b>{candidate.volume.days} 日</b></span></div>
    {candidate.dataWarnings.length > 0 && <details className={styles.warnings}><summary>数据说明 · {candidate.dataWarnings.length}</summary>{candidate.dataWarnings.map((warning, index) => <p key={index}>{warning}</p>)}</details>}
    <footer className={styles.cardFooter}><span title={`${q.source} · ${stamp(q.asOf)} · 评分时间 ${stamp(candidate.scannedAt)}`}><i className={recent ? styles.liveDot : ""} />{recent ? "报价已更新" : "行情快照"} · {new Date(q.asOf).toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</span><div>{candidate.market === "ashare" && <button title={inPool ? "已在自选池" : "加入自选池"} aria-label={`${candidate.name}${inPool ? "已在自选池" : "加入自选池"}`} disabled={inPool || !canOperate} onClick={addPool}><Star size={15} fill={inPool ? "currentColor" : "none"} /></button>}<button onClick={expand}><Expand size={14} /> 展开图表</button></div></footer>
  </article>;
}

export function BoxBreakoutSurface({ signedIn, canOperate }: { signedIn: boolean; canOperate: boolean }) {
  const [state, setState] = useState<DashboardState>({ ...empty, signedIn });
  const [market, setMarket] = useState<Market>("ashare");
  const [mode, setMode] = useState<ScanMode>("market");
  const [topic, setTopic] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("score");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quoteError, setQuoteError] = useState("");
  const [message, setMessage] = useState("");
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [expanded, setExpanded] = useState<Candidate | null>(null);
  const running = state.job?.status === "running" || state.job?.status === "queued";
  const scanMessage = submittedJobId === state.job?.id && running ? "扫描已提交，在后台持续运行；关闭页面不会中断。" : "";
  const mounted = useRef(true);
  const revision = useRef(0);
  const pollPending = useRef(false);
  const pollSequence = useRef(0);
  const snapshotVersions = useRef<{ stockVersion: string | null; cryptoVersion: string | null }>({ stockVersion: null, cryptoVersion: null });
  const poll = useCallback(async (signal?: AbortSignal) => {
    if (pollPending.current) return;
    pollPending.current = true;
    const sequence = ++pollSequence.current;
    const current = revision.current;
    const versions = snapshotVersions.current;
    const search = new URLSearchParams({ stockVersion: versions.stockVersion ?? "", cryptoVersion: versions.cryptoVersion ?? "" });
    try { const next = await request<DashboardState>(`/api/box-breakout?${search}`, { signal }); if (mounted.current && !signal?.aborted && current === revision.current) {
      snapshotVersions.current = { stockVersion: next.stockVersion ?? null, cryptoVersion: next.cryptoVersion ?? null };
      setState(previous => ({ ...next, stocks: next.stockUnchanged ? previous.stocks : next.stocks, crypto: next.cryptoUnchanged ? previous.crypto : next.crypto }));
      setError(next.error || "");
    } }
    catch (caught) { if (mounted.current && !signal?.aborted && current === revision.current) setError(errorText(caught)); }
    finally { if (sequence === pollSequence.current) pollPending.current = false; if (mounted.current && !signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { mounted.current = true; const abort = new AbortController(); void poll(abort.signal); return () => { mounted.current = false; abort.abort(); pollPending.current = false; pollSequence.current += 1; }; }, [poll]);
  useEffect(() => {
    if (!signedIn) return;
    const abort = new AbortController();
    const refreshWhenVisible = () => { if (!document.hidden) void poll(abort.signal); };
    const interval = setInterval(refreshWhenVisible, running ? ACTIVE_STATE_POLL_MS : IDLE_STATE_POLL_MS);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
      abort.abort();
    };
  }, [poll, running, signedIn]);
  async function command(value: Command) {
    if (busy) return false;
    revision.current += 1;
    setBusy(true); setError(""); setMessage(""); setSubmittedJobId(null);
    try { const next = await request<DashboardState>("/api/box-breakout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }); revision.current += 1; snapshotVersions.current = { stockVersion: next.stockVersion ?? null, cryptoVersion: next.cryptoVersion ?? null }; setState(next); if (value.action === "scan") setSubmittedJobId(next.job?.id ?? null); else setMessage(value.action === "telegram-test" ? "测试通知已发送。" : value.action === "cancel" ? "扫描已停止。" : "已保存。"); return true; }
    catch (caught) { setError(errorText(caught)); return false; }
    finally { setBusy(false); }
  }
  const candidates = market === "ashare" ? state.stocks : state.crypto;
  const cryptoSourceMode = state.cryptoSourceMode ?? "crypto";
  const filtered = useMemo(() => candidates.filter(candidate => {
    const textMatch = `${candidate.symbol} ${candidate.name}`.toLowerCase().includes(search.trim().toLowerCase());
    const topicMatch = !topic || [...candidate.concepts, ...candidate.matchedTopics].some(value => value.includes(topic) || topic.includes(value));
    return textMatch && topicMatch && (filter === "all" || filter === "qualified" && candidate.qualified || filter === "watch" && candidate.score >= 70);
  }).sort((a, b) => sort === "change" ? b.quote.changePct - a.quote.changePct : sort === "volume" ? b.volume.ratio - a.volume.ratio : b.score - a.score), [candidates, search, topic, filter, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * 12, currentPage * 12 + 12);
  const symbolKey = visible.map(candidate => candidate.symbol).join(",");
  useEffect(() => { setPage(0); }, [market, filter, sort, topic, search]);
  useEffect(() => {
    if (!symbolKey) return;
    const abort = new AbortController(); let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return; pending = true;
      try { const data = await request<{ quotes: Quote[]; errors?: string[] }>(`/api/box-breakout/quotes?market=${market}&symbols=${encodeURIComponent(symbolKey)}`, { signal: abort.signal, cache: "default" }); if (!abort.signal.aborted) { setQuotes(previous => ({ ...previous, ...Object.fromEntries(data.quotes.map(quote => [`${market}:${quote.symbol}`, quote])) })); setQuoteError(data.errors?.length ? "部分报价刷新失败，继续显示上次行情及其时间。" : ""); } }
      catch { if (!abort.signal.aborted) setQuoteError("报价刷新暂不可用，当前保留上次行情快照。"); }
      finally { pending = false; }
    };
    void refresh(); const timer = setInterval(() => void refresh(), QUOTE_POLL_MS[market]);
    return () => { clearInterval(timer); abort.abort(); };
  }, [market, symbolKey]);
  function changeMarket(next: Market) { setMarket(next); setTopic(""); setFilter("all"); setSort(next === "crypto" ? "change" : "score"); setQuoteError(""); }
  function download() {
    const blob = new Blob([JSON.stringify({ market, ...(market === "crypto" ? { cryptoSourceMode } : {}), exportedAt: new Date().toISOString(), results: filtered }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `welinkbtc-box-${market}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <main className={styles.surface} data-native-i18n="react">
    <div className={styles.ribbon}><span><i className={styles.liveDot} /> WELINKBTC · MARKET INTELLIGENCE</span><span><ShieldCheck size={12} /> 只读研究 · 不自动交易</span></div>
    <div className={styles.content}>
      <div className={styles.controlPanel}>
        <div className={styles.panelHeader}>
          <h1 className={styles.panelTitle}>箱体突破看板</h1>
          <div className={styles.panelActions}><button onClick={() => setHelpOpen(true)}><CircleHelp size={16} /> 策略说明</button><button onClick={() => setSettingsOpen(true)}><Settings2 size={16} /> 看板设置</button></div>
        </div>
        <div className={styles.controlStatus}><span className={styles.autoState}><Clock3 size={13} /> 自动扫描 {state.settings.auto ? "已开启" : "未开启"}</span></div>
        <div className={styles.marketTabs} role="group" aria-label="选择市场"><button aria-pressed={market === "ashare"} onClick={() => changeMarket("ashare")}><span>A</span> A 股市场 <small>沪深全市场</small></button><button aria-pressed={market === "crypto"} onClick={() => changeMarket("crypto")}><span>₿</span> 加密市场 <small>USDT 永续</small></button></div>
        <div className={styles.scanControls}>{market === "ashare" ? <><select aria-label="扫描模式" value={mode} onChange={event => setMode(event.target.value as ScanMode)}><option value="market">全市场扫描</option><option value="quick">快速扫描 · 200</option><option value="pool">自选池扫描</option></select><button className={styles.primary} disabled={!canOperate || busy || running} onClick={() => void command({ action: "scan", mode })}>{running || busy ? <LoaderCircle size={16} className={styles.spin} /> : <Radar size={16} />}{running ? "扫描进行中" : "开始扫描"}</button></> : <span className={styles.scanSourceHint}>{running ? <LoaderCircle size={14} className={styles.spin} /> : <Layers3 size={14} />}{running ? "后台扫描进行中" : "选择下方扫描来源"}</span>}</div>
        {market === "crypto" && <div className={styles.cryptoScanActions} role="group" aria-label="加密市场扫描来源">
          {cryptoScans.map(scan => <button key={scan.mode} className={scan.mode === "crypto" ? styles.primary : ""}
            aria-label={scan.accessibleLabel} disabled={!canOperate || busy || running}
            onClick={() => void command({ action: "scan", mode: scan.mode })}>
            {running && state.job?.mode === scan.mode ? <LoaderCircle size={20} className={styles.spin} />
              : scan.mode === "crypto-mainstream" ? <Star size={20} /> : <Radar size={20} />}
            <span><small>{scan.source}</small><strong>{scan.label}</strong></span><ArrowUpRight size={16} />
          </button>)}
        </div>}
      </div>
      {!signedIn && <div className={styles.notice}><ShieldCheck size={17} /><span>登录后保存独立股票池、启动后台扫描与配置通知。页面不会在访问时自动启动全市场任务。</span><Link href="/login?next=%2Fbox-breakout">登录 / 注册 <ArrowUpRight size={14} /></Link></div>}
      {signedIn && !canOperate && <div className={styles.notice}>请完成二次验证并确认账号处于正常状态后操作。</div>}
      {error && <div className={styles.error} role="alert">{error}<button onClick={() => void poll()}><RefreshCw size={13} /> 重试</button></div>}
      {(message || scanMessage) && <div className={styles.feedback} role="status"><Check size={15} /> {message || scanMessage}<button onClick={() => { setMessage(""); setSubmittedJobId(null); }} aria-label="关闭提示"><X size={13} /></button></div>}
      {state.job?.status === "failed" && <div className={styles.error} role="alert"><span>{state.job.logs.at(-1) || "扫描失败，请重试。"}</span><button disabled={!canOperate || busy} onClick={() => void command({ action: "scan", mode: state.job!.mode })}><RefreshCw size={13} /> 重试本次扫描</button></div>}
      <section className={styles.metrics} aria-label="扫描概览"><div><span>SCAN UNIVERSE / 当前结果</span><strong>{loading ? "—" : candidates.length.toLocaleString()}<small>{market === "crypto" && cryptoSourceMode === "crypto" ? " / TOP 30" : " 个标的"}</small></strong><p>{market === "ashare" ? "沪深主板 · 创业板 · 科创板" : cryptoSourceDescriptions[cryptoSourceMode]}</p></div><div><span>QUALIFIED / 达标关注</span><strong className={styles.accent}>{candidates.filter(candidate => candidate.qualified).length}<small> 分数 ≥ 85</small></strong><p>按规则共振评分，不代表收益保证</p></div><div><span>WATCH / 突破观察</span><strong>{candidates.filter(candidate => candidate.score >= 70 && candidate.score < 85).length}<small> 70–84 分</small></strong><p>{market === "ashare" ? "热点 × 倍量 × 资金 × 箱顶试盘" : "连续倍量 × 箱顶试盘 × 24h 涨幅"}</p></div><div><span>LAST SNAPSHOT / 最近更新</span><strong className={styles.timeValue}>{stamp(state.asOf)}</strong><p>北京时间 CST · 报价按市场每 15–30 秒刷新</p></div></section>
      {state.job && <section className={styles.job} aria-label="后台扫描状态"><div><span><Activity size={14} /> {modeNames[state.job.mode]} <b>{({ queued: "排队中", running: "进行中", complete: "已完成", cancelled: "已取消", failed: "失败" })[state.job.status]}</b></span><span>{state.job.processed.toLocaleString()} / {state.job.total.toLocaleString()} · 达标 {state.job.qualified} · 失败 {state.job.errors}{running && <button disabled={busy} onClick={() => void command({ action: "cancel" })}><Square size={11} /> 停止</button>}</span></div><progress max={Math.max(state.job.total, 1)} value={state.job.processed} aria-label="扫描进度" /><details><summary>{state.job.logs.at(-1) || "正在准备行情源…"}</summary><ol>{state.job.logs.map((log, index) => <li key={index}>{log}</li>)}</ol></details></section>}
      {market === "ashare" && <section className={styles.topics}><div><span className={styles.eyebrow}>HOT THEMES <small>热门板块 TOP 10</small></span><button onClick={() => { setTopic(""); setFilter("all"); }} aria-pressed={!topic}>全部热点</button></div><div className={styles.topicList}>{state.topics.length ? state.topics.map((item, index) => <button key={item.name} aria-pressed={topic === item.name} onClick={() => { setTopic(topic === item.name ? "" : item.name); setFilter("all"); }}><span>{String(index + 1).padStart(2, "0")}</span>{item.name}<b className={item.changePct >= 0 ? styles.up : styles.down}>{item.changePct >= 0 ? "+" : ""}{item.changePct.toFixed(2)}%</b></button>) : <p>启动 A 股扫描后更新热门板块。数据不可用时会明确标记，不使用虚构热点。</p>}</div></section>}
      <section className={styles.results}><div className={styles.resultToolbar}><div><h2>{topic || (market === "ashare" ? "突破机会池" : cryptoPoolNames[cryptoSourceMode])}</h2><span>{filtered.length} 个结果</span></div><div className={styles.filters}><label className={styles.search}><Search size={14} /><input aria-label="搜索代码或名称" placeholder="搜索代码 / 名称" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="信号筛选" value={filter} onChange={event => setFilter(event.target.value)}><option value="qualified">达标关注 ≥85</option><option value="watch">关注 + 观察 ≥70</option><option value="all">全部扫描结果</option></select><select aria-label="排序方式" value={sort} onChange={event => setSort(event.target.value)}><option value="score">共振评分 ↓</option><option value="change">涨幅 ↓</option><option value="volume">量比 ↓</option></select><button disabled={!filtered.length} onClick={download} title="导出当前筛选结果 JSON" aria-label="导出当前筛选结果"><Download size={15} /></button></div></div>
        {quoteError && <p className={styles.quoteWarning}>{quoteError}</p>}
        {visible.length ? <div className={styles.cards}>{visible.map(candidate => <CandidateCard key={`${candidate.market}:${candidate.symbol}`} candidate={candidate} quote={quotes[`${market}:${candidate.symbol}`]} inPool={state.settings.pool.some(item => item.symbol === candidate.symbol)} canOperate={canOperate && !busy} addPool={() => void command({ action: "pool-add", symbol: candidate.symbol, name: candidate.name })} expand={() => setExpanded(candidate)} />)}</div> : <div className={styles.emptyState}><div className={styles.radarGraphic}><Radar size={44} strokeWidth={1} /></div><span className={styles.eyebrow}>{loading ? "CONNECTING" : "READY TO SCAN"}</span><h3>{loading ? "正在加载看板…" : candidates.length ? "当前条件下暂无匹配信号" : "让突破信号，从数据中浮现"}</h3><p>{candidates.length ? "调整分数、板块或搜索条件；没有达标标的也是有效的扫描结果。" : market === "ashare" ? "选择全市场、快速 200 或自选池扫描。后台逐批校验日 K、成交量与资金数据，完成后在这里呈现结果。" : "选择 α-RadarTP 异动排行榜、热门精选主流或涨幅 TOP 30，叠加连续倍量和箱顶试盘，寻找量价共振。"}</p>{candidates.length ? <button onClick={() => { setFilter("all"); setSearch(""); setTopic(""); }}>查看全部扫描结果 <ArrowUpRight size={14} /></button> : <div className={styles.emptySteps}><span><b>01</b> 选择市场</span><span><b>02</b> 运行扫描</span><span><b>03</b> 查看共振</span></div>}</div>}
        {pages > 1 && <div className={styles.pagination}><span>每页 12 个标的 · 按需加载日 K 图表</span><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="上一页"><ChevronLeft size={16} /></button><b>{currentPage + 1} / {pages}</b><button disabled={currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)} aria-label="下一页"><ChevronRight size={16} /></button></div>}
      </section>
      <footer className={styles.footnote}><span><ShieldCheck size={14} /> 研究工具，不构成投资建议。扫描评分与最新报价更新时间独立；A 股非交易时段为最近收盘数据。</span><button onClick={() => setHelpOpen(true)}>计算口径与来源 <ArrowUpRight size={13} /></button></footer>
    </div>
    {settingsOpen && <SettingsDialog settings={state.settings} canOperate={canOperate} busy={busy} command={command} close={() => setSettingsOpen(false)} />}
    {expanded && <Dialog title={`${expanded.name} · ${expanded.symbol} / 日 K 复盘`} wide close={() => setExpanded(null)}><BoxBreakoutChart expanded symbol={expanded.symbol} market={expanded.market} box={expanded.box} /><div className={styles.expandedNotes}><p>箱体 {expanded.box ? `${priceLabel(expanded.box.low)} – ${priceLabel(expanded.box.high)} · ${expanded.box.startDate} 至 ${expanded.box.endDate}` : "暂未形成可识别箱体"}</p><p>移动鼠标或使用左右方向键查看 OHLC 与成交量。金色圆点为箱顶试盘；评分快照：{stamp(expanded.scannedAt)}。</p></div></Dialog>}
    {helpOpen && <Dialog title="箱体突破 · 策略与数据说明" close={() => setHelpOpen(false)}><div className={styles.help}><p>箱体采用最近 60 根日 K；发现近 15 日首次有效突破时，回看突破前箱体。至少需要 40 根有效日 K。虚线为箱顶 / 箱底，圆点为箱顶试盘。</p><h3>A 股：四项条件，各 25 分</h3><ul><li>热点共振：所属概念匹配热门 TOP 10 或自定义关注板块。</li><li>连续倍量：近 10 日最长连续 ≥3 日量比 ≥1.8，且当前量比 ≥1.8。量比以此前 5 日均量计算。</li><li>资金控盘：近 5 日主力净额为正、至少 3 日流入，并结合股东户数变化与换手率衡量控盘。</li><li>箱顶试盘：贴近箱顶、出现有效上影线并通过成交量条件，至少 3 次。</li></ul><h3>加密：三项条件，满分 100 分</h3><p>连续倍量 34 分、箱顶试盘 33 分、24h 涨幅 ≥10% 为 33 分。部分满足条件按规则给予部分分数；≥85 分为达标关注，70–84 分为突破观察。</p><h3>扫描与刷新</h3><p>全市场逐只扫描沪深股票；快速扫描先筛选量比 / 换手活跃标的，最多 200 只并保留自选。加密支持三类扫描来源：α-RadarTP 异动排行榜、α-RadarTP 热门精选主流、Binance USDT 永续涨幅 TOP 30。雷达名单只决定扫描范围，仍按箱体突破规则独立评分，不替代为雷达分数；仅分析可验证的 USDT 永续合约，跳过项会写入日志。数据源失败时保留旧结果，不使用其他榜单冒充。全市场通常需要 10–30 分钟，取决于上游限流与网络。</p><p>加密报价每 15 秒、A 股报价每 30 秒刷新；日 K 图表在浏览器缓存 15 分钟，并由 CDN 复用。自动扫描为工作日北京时间指定时刻，不自动识别法定休市日；默认关闭，须在设置中开启。定时任务与通知均可随时关闭。</p><h3>来源与边界</h3><p>行情来自东方财富、腾讯 / 新浪与 Binance 公开接口。资金或股东披露有滞后，缺失项会显示数据说明；不会把无数据当作零值或真实信号。</p><p>参考 <a href="https://github.com/Theclues/TradeGenuis-box" target="_blank" rel="noreferrer">TradeGenuis-box 的功能与规则 ↗</a>，由本项目独立实现原生界面、计算和持久任务。未嵌入第三方页面，也不会自动下单。</p></div></Dialog>}
  </main>;
}

function SettingsDialog({ settings, canOperate, busy, command, close }: { settings: Settings; canOperate: boolean; busy: boolean; command: (value: Command) => Promise<boolean>; close: () => void }) {
  const [code, setCode] = useState("");
  const [sectors, setSectors] = useState(settings.sectors.join("，"));
  const [auto, setAuto] = useState(settings.auto);
  const [times, setTimes] = useState(settings.autoTimes.join(", "));
  const [telegramEnabled, setTelegramEnabled] = useState(settings.telegramEnabled);
  const [chat, setChat] = useState(settings.telegramChat);
  const [token, setToken] = useState("");
  const [feedback, setFeedback] = useState("");
  async function save() { const ok = await command({ action: "settings", sectors: sectors.split(/[,，\n]/).map(value => value.trim()).filter(Boolean), auto, autoTimes: times.split(/[,，\s]+/).filter(Boolean), telegramEnabled, telegramChat: chat.trim(), ...(token.trim() ? { telegramToken: token.trim() } : {}) }); setFeedback(ok ? "设置已保存。" : "保存失败，请关闭面板查看页面错误提示。 "); if (ok) setToken(""); }
  return <Dialog title="看板设置" close={close}><div className={styles.settings}>
    {!canOperate && <p className={styles.quoteWarning}>登录并完成账户验证后可保存设置。</p>}
    <section><h3><Star size={16} /> 我的 A 股自选池 <small>{settings.pool.length}</small></h3><form className={styles.poolForm} onSubmit={event => { event.preventDefault(); void command({ action: "pool-add", symbol: code.trim() }).then(ok => { if (ok) setCode(""); else setFeedback("添加失败，请关闭面板查看页面错误提示。"); }); }}><input aria-label="A股六位代码" placeholder="输入 6 位代码，如 600519" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} /><button type="submit" disabled={!canOperate || busy}><Plus size={15} /> 添加</button></form><div className={styles.poolList}>{settings.pool.map(stock => <span key={stock.symbol}><b>{stock.name}</b><small>{stock.symbol}</small><button aria-label={`移除 ${stock.name}`} disabled={!canOperate || busy} onClick={() => void command({ action: "pool-remove", symbol: stock.symbol })}><Trash2 size={13} /></button></span>)}{!settings.pool.length && <p>尚未添加自选。可通过代码添加，或在结果卡片点击星标。</p>}</div></section>
    <section><h3><Layers3 size={16} /> 关注板块</h3><label>用逗号分隔板块 / 概念名称<textarea value={sectors} onChange={event => setSectors(event.target.value)} placeholder="如：机器人，人工智能，半导体" rows={2} maxLength={600} /></label><p>与实时热门板块一起参与热点匹配，不改变其他评分条件。</p></section>
    <section><h3><Clock3 size={16} /> 自动扫描</h3><label className={styles.toggle}><input type="checkbox" checked={auto} onChange={event => setAuto(event.target.checked)} />工作日自动执行 A 股全市场扫描</label><label>北京时间（HH:mm，多个时间用逗号分隔）<input value={times} onChange={event => setTimes(event.target.value)} placeholder="11:30, 15:00" maxLength={60} /></label><p>仅周一至周五；后台持续运行，不依赖浏览器。开启后会产生扫描请求，关闭后不再创建新任务。</p></section>
    <section><h3><Bell size={16} /> Telegram 达标通知</h3><label className={styles.toggle}><input type="checkbox" checked={telegramEnabled} onChange={event => setTelegramEnabled(event.target.checked)} />扫描完成后发送达标结果</label><label>Bot Token {settings.telegramConfigured && <small>（已加密保存，留空不修改）</small>}<input type="password" autoComplete="new-password" value={token} onChange={event => setToken(event.target.value)} placeholder="123456789:…" maxLength={200} /></label><label>Chat ID<input value={chat} onChange={event => setChat(event.target.value)} placeholder="目标聊天 ID" maxLength={80} /></label><button disabled={!canOperate || busy || !settings.telegramConfigured} onClick={() => void command({ action: "telegram-test" }).then(ok => setFeedback(ok ? "测试通知已发送到已保存的 Chat ID。" : "发送失败，请关闭面板查看页面错误提示。"))}>发送测试通知</button><p>测试会向已保存的聊天发送一条消息；修改 Token 或 Chat ID 后请先保存。</p></section>
    {feedback && <p role="status" className={styles.quoteWarning}>{feedback}</p>}
    <div className={styles.settingsFooter}><button onClick={close}>关闭</button><button className={styles.primary} disabled={!canOperate || busy} onClick={() => void save()}>{busy ? <LoaderCircle className={styles.spin} size={15} /> : <Check size={15} />} 保存设置</button></div>
  </div></Dialog>;
}
