"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Boxes, CircleHelp, Download, HardDrive, Play, RefreshCw, Server, Settings2, Square, X } from "lucide-react";
import { HedgeOpsConfigForm } from "@/components/hedge-ops-config-form";
import { PerpdexBox } from "@/components/perpdex-box";
import { CexHub } from "@/components/cex-hub";
import hedgeRelease from "@/hedge-ops/release.json";

const launcherName = `一键启动文件(${hedgeRelease.version}).bat`;
const launcherUrl = `/downloads/${encodeURIComponent(launcherName)}`;

function LocalLauncherDownload() {
  return <a className="hedge-ops-download" href={launcherUrl} download={launcherName}><Download size={16} aria-hidden="true" />{launcherName}</a>;
}

type Engine = "lighter" | "entropy" | "binance" | "binance_okx" | "binance_hyperliquid" | "hyperliquid_lighter" | "ondoperps_entropy" | "ondoperps_ondoperps";
type MarketService = "perpdex" | "cex";
const marketServices = [
  { id: "perpdex", name: "Perpdex Box", caption: "永续 DEX 数据" },
  { id: "cex", name: "Cex Hub", caption: "中心化交易所" },
] as const;

function MarketServiceButtons({ value, onChange, disabled = false }: { value: MarketService | null; onChange: (service: MarketService) => void; disabled?: boolean }) {
  return <nav className="hedge-ops-services" aria-label="公开市场服务">{marketServices.map(service => <button key={service.id} type="button" className="hedge-ops-service" aria-pressed={value === service.id} onClick={() => onChange(service.id)} disabled={disabled}><span>{service.name}</span><small>{service.caption}</small></button>)}</nav>;
}

function MarketServiceView({ service, onChange, onClose, returnLabel = "返回交易工作台" }: { service: MarketService; onChange: (service: MarketService) => void; onClose: () => void; returnLabel?: string }) {
  return <><div className="hedge-ops-toolbar"><strong>{service === "cex" ? "Cex Hub" : "Perpdex Box"}</strong><nav className="hedge-ops-market-tabs" aria-label="切换市场数据">{marketServices.map(item => <button key={item.id} type="button" aria-pressed={service === item.id} onClick={() => onChange(item.id)}>{item.name}</button>)}</nav><div className="hedge-ops-actions"><button type="button" onClick={onClose}><ArrowLeft size={13} aria-hidden="true" />{returnLabel}</button></div></div>{service === "cex" ? <CexHub active /> : <PerpdexBox active />}</>;
}

type RuntimeAction = "start" | "stop" | "emergency";
type RuntimeStatus = {
  available: boolean;
  running: boolean;
  processPresent?: boolean;
  engine: Engine;
  pair?: string;
  dryRun: boolean;
  configured: boolean;
  message?: string;
  hosted?: boolean;
  heartbeatAt?: string | null;
  status?: string;
  emergency?: { phase: string; message: string } | null;
};

const engines: Array<{ id: Engine; label: string }> = [
  { id: "lighter", label: "Arcus <> RHC Lighter" },
  { id: "entropy", label: "Entropy <> Arcus" },
  { id: "binance", label: "Binance <> Lighter" },
  { id: "binance_okx", label: "Binance <> OKX" },
  { id: "binance_hyperliquid", label: "Binance <> Hyperliquid" },
  { id: "hyperliquid_lighter", label: "Hyperliquid <> Lighter" },
  { id: "ondoperps_entropy", label: "Ondoperps <> Entropy" },
  { id: "ondoperps_ondoperps", label: "Ondoperps <> Ondoperps" },
];

async function readRuntimeResponse(response: Response): Promise<RuntimeStatus> {
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("引擎服务返回了无效状态，请刷新重试。");
  const body = data as Partial<RuntimeStatus> & { error?: string };
  if (!response.ok) throw new Error(body.error || body.message || `引擎请求失败（${response.status}）`);
  if (typeof body.available !== "boolean" || typeof body.running !== "boolean") {
    throw new Error("暂时无法确认引擎状态，请刷新重试。");
  }
  return body as RuntimeStatus;
}

export function HedgeOpsSurface({ storageScope }: { storageScope: string }) {
  const [mode, setMode] = useState<"local" | "hosted" | null>(null);
  const [boxOpen, setBoxOpen] = useState(false);
  const [marketService, setMarketService] = useState<MarketService>("perpdex");
  const key = `welinkbtc-hedge-ops-mode-v1:${storageScope}`;
  useEffect(() => { try { const value = localStorage.getItem(key); if (value === "local" || value === "hosted") setMode(value); } catch { /* Session-only fallback. */ } }, [key]);
  function choose(value: "local" | "hosted" | null) { setMode(value); try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* Session-only fallback. */ } }
  if (mode === "hosted") return <HostedHedgeOpsSurface storageScope={storageScope} onSwitchMode={() => choose(null)} />;
  if (mode === "local") return <LocalHedgeOpsSurface onSwitchMode={() => choose(null)} />;
  return <main className="hedge-ops-page"><div className="hedge-ops-workspace"><aside className="hedge-ops-sidebar" aria-label="平台服务"><MarketServiceButtons value={boxOpen ? marketService : null} onChange={service => { setMarketService(service); setBoxOpen(true); }} /><div className="hedge-ops-brand"><ArrowLeftRight size={18} aria-hidden="true" /><h1>套利对冲Ops</h1></div><p className="hedge-ops-sidebar-caption">服务与运行方式</p><button type="button" className="hedge-ops-workspace-return" aria-pressed={!boxOpen} onClick={() => setBoxOpen(false)}>选择运行方式</button></aside><div className="hedge-ops-workspace-content">
    {boxOpen ? <MarketServiceView service={marketService} onChange={setMarketService} onClose={() => setBoxOpen(false)} returnLabel="返回运行方式" /> : <section className="hedge-ops-choice">
    <span className="hedge-ops-eyebrow">HEDGE OPS · RUN MODE</span><h1>套利对冲Ops</h1><p>启动前选择运行方式。八套平台均使用平台内置的完整对冲引擎，默认从演练模式开始。</p>
    <div className="hedge-ops-mode-cards"><article><HardDrive size={30} aria-hidden="true" /><h2>本地服务模式</h2><p>API 密钥、环境配置、代理和运行记录保存到你的电脑。下载一键启动文件，自动安装 Python 和引擎依赖。</p><ul><li>环境与 IP 设置界面化，重新启动自动读取</li><li>保持本地电脑和服务运行</li></ul><LocalLauncherDownload /><button type="button" onClick={() => choose("local")}>使用本地服务 <HardDrive size={15} aria-hidden="true" /></button></article>
    <article><Server size={30} aria-hidden="true" /><h2>服务器模式</h2><p>使用平台自有的 Vercel Durable Workflow 托管引擎，无需下载。环境配置加密保存，关闭网页后继续运行。</p><ul><li>八套引擎独立保存账户与策略</li><li>任务、账本与运行检查点持续保存</li></ul><button type="button" onClick={() => choose("hosted")}>使用服务器 <Server size={15} aria-hidden="true" /></button></article></div>
    <p className="hedge-ops-choice-note">模式选择仅保存在当前浏览器。切换界面不会停止另一模式中的任务，请在原控制台管理运行状态。</p>
  </section>}</div></div></main>;
}

function LocalHedgeOpsSurface({ onSwitchMode }: { onSwitchMode: () => void }) {
  const [online, setOnline] = useState(false);
  const [connectedOnce, setConnectedOnce] = useState(false);
  const [checking, setChecking] = useState(true);
  const [revision, setRevision] = useState(0);
  const [consoleOrigin, setConsoleOrigin] = useState("http://127.0.0.1:8011");
  const [boxOpen, setBoxOpen] = useState(false);
  const [marketService, setMarketService] = useState<MarketService>("perpdex");
  const [boxFromSidebar, setBoxFromSidebar] = useState(false);
  const localFrame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== localFrame.current?.contentWindow || event.origin !== consoleOrigin) return;
      if (event.data?.type === "hedge-open-perpdex-box" || event.data?.type === "hedge-open-cex-hub") { setMarketService(event.data.type === "hedge-open-cex-hub" ? "cex" : "perpdex"); setBoxFromSidebar(true); setBoxOpen(true); }
      else if (event.data?.type === "hedge-close-perpdex-box") setBoxOpen(false);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [consoleOrigin]);
  function closeBox() {
    setBoxOpen(false);
    localFrame.current?.contentWindow?.postMessage({ type: "hedge-close-perpdex-box" }, consoleOrigin);
  }
  function openBox(service: MarketService = "perpdex") {
    setMarketService(service);
    setBoxFromSidebar(false);
    setBoxOpen(true);
    localFrame.current?.contentWindow?.postMessage({ type: "hedge-open-perpdex-box", service }, consoleOrigin);
  }
  function switchBox(service: MarketService) {
    setMarketService(service);
    localFrame.current?.contentWindow?.postMessage({ type: "hedge-open-perpdex-box", service }, consoleOrigin);
  }
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let inFlight = false;
    let healthOrigin = "http://127.0.0.1:8011";
    async function check() {
      if (inFlight) return;
      inFlight = true;
      try { const response = await fetch(`${healthOrigin}/health`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]) }); const result = await response.json(); if (!cancelled) { const healthy = response.ok && result.ok === true && result.service === "welinkbtc-hedge-local"; setOnline(healthy); if (healthy) { setConnectedOnce(true); healthOrigin = Number.isInteger(result.controlPort) && result.controlPort >= 1024 && result.controlPort <= 65535 ? `http://127.0.0.1:${result.controlPort}` : "http://127.0.0.1:8011"; setConsoleOrigin(healthOrigin); } } }
      catch { healthOrigin = "http://127.0.0.1:8011"; if (!cancelled) setOnline(false); }
      finally { inFlight = false; if (!cancelled) setChecking(false); }
    }
    void check(); const timer = setInterval(() => { if (!document.hidden) void check(); }, 4000);
    return () => { cancelled = true; controller.abort(); clearInterval(timer); };
  }, [revision]);
  return <main className="hedge-ops-page"><div className="hedge-ops-toolbar hedge-ops-local-toolbar"><div className="hedge-ops-brand"><HardDrive size={16} aria-hidden="true" /><h1>套利对冲Ops · 本地服务</h1></div><span role="status">{checking ? "检测本地服务…" : online ? "本地服务已连接" : connectedOnce ? "本地连接暂未确认 · 已保留控制台" : "等待本地服务启动"}</span><div className="hedge-ops-actions">{marketServices.map(service => <button key={service.id} type="button" onClick={() => openBox(service.id)} aria-pressed={boxOpen && marketService === service.id}><Boxes size={13} aria-hidden="true" />{service.name}</button>)}<button type="button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={13} aria-hidden="true" />重新连接</button><button type="button" onClick={onSwitchMode}>切换运行方式</button></div></div>
    <div className="hedge-ops-local-stage">{connectedOnce ? <iframe ref={localFrame} key={`${revision}:${consoleOrigin}`} inert={boxOpen && !boxFromSidebar} className="hedge-ops-console" src={`${consoleOrigin}/?embedded=1`} title="套利对冲Ops 本地环境与 IP 配置控制台" allow="local-network-access" /> : <section className="hedge-ops-local-guide"><HardDrive size={40} aria-hidden="true" /><h2>启动你的本地对冲引擎</h2><p>首次运行会自动安装 Python、创建独立环境并安装依赖。完成后自动打开本地控制台。</p><ol><li>下载并双击「{launcherName}」。</li><li>在「环境与 IP 设置」中填写账户及代理，点击「保存到本机」。</li><li>从左侧选择所需交易所组合，点击「启动」。保持服务运行窗口开启。</li></ol><LocalLauncherDownload /><p>如浏览器提示访问本地网络，请允许。也可<a href="http://127.0.0.1:8011/" target="_blank" rel="noreferrer">直接打开本地控制台</a>。</p><small>配置保存在 %LOCALAPPDATA%\welinkBTC\Hedge-Ops\data，不上传到服务器。</small></section>}
    {boxOpen ? <section className={`hedge-ops-local-service${boxFromSidebar && connectedOnce ? " has-sidebar" : ""}`} aria-label={marketService === "cex" ? "Cex Hub" : "Perpdex Box"}><MarketServiceView service={marketService} onChange={switchBox} onClose={closeBox} /></section> : null}</div>
  </main>;
}

function HostedHedgeOpsSurface({ storageScope, onSwitchMode }: { storageScope: string; onSwitchMode: () => void }) {
  const [engine, setEngine] = useState<Engine>("lighter");
  const [boxOpen, setBoxOpen] = useState(false);
  const [marketService, setMarketService] = useState<MarketService>("perpdex");
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [allStates, setAllStates] = useState<Partial<Record<Engine, RuntimeStatus>>>({});
  const [emergencyResult, setEmergencyResult] = useState('');
  const [checking, setChecking] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [action, setAction] = useState<RuntimeAction | null>(null);
  const [error, setError] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [frameVersions, setFrameVersions] = useState<Partial<Record<Engine, number>>>({});
  const [openedConsoles, setOpenedConsoles] = useState<Partial<Record<Engine, boolean>>>({});
  const workspaceContent = useRef<HTMLDivElement>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const storageKey = `welinkbtc-hedge-ops-engine-v1:${storageScope}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (engines.some(item => item.id === saved)) setEngine(saved as Engine);
    } catch {
      // The workspace remains usable when browser storage is unavailable.
    }
  }, [storageKey]);

  useEffect(() => {
    if (action) return;
    let cancelled = false;
    let controller: AbortController | null = null;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 12_000);
      setChecking(true);
      try {
        const results = await Promise.allSettled(engines.map(async item => {
          const response = await fetch(`/api/hedge-ops/runtime?engine=${item.id}`, { cache: "no-store", signal: controller!.signal });
          return [item.id, await readRuntimeResponse(response)] as const;
        }));
        if (!cancelled) {
          const states: Partial<Record<Engine, RuntimeStatus>> = {};
          for (const result of results) if (result.status === "fulfilled") states[result.value[0]] = result.value[1];
          const confirmed = Object.fromEntries(Object.entries(states).filter(([, value]) => value.available && (value.running || !value.processPresent)));
          setAllStates(previous => ({ ...previous, ...confirmed }));
          if (confirmed[engine]) setRuntime(confirmed[engine]);
          setRuntimeError(confirmed[engine] ? "" : "连接状态待确认 · 已保留控制台，请等待连接恢复。");
        }
      } catch (caught) {
        if (!cancelled) {
          setRuntimeError(caught instanceof Error && caught.name !== "AbortError" ? caught.message : "连接检查超时，请确认引擎服务已启动。");
        }
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        if (!cancelled) setChecking(false);
      }
    };

    void refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(interval);
    };
  }, [engine, refreshVersion, action]);

  useEffect(() => {
    setOpenedConsoles(previous => {
      const next = { ...previous };
      let changed = false;
      for (const item of engines) {
        const state = item.id === engine ? runtime : allStates[item.id];
        if (state?.running && (!state.hosted || state.heartbeatAt) && !next[item.id]) {
          next[item.id] = true;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [engine, runtime, allStates]);

  function syncConsoleVisibility() {
    workspaceContent.current?.querySelectorAll<HTMLIFrameElement>("iframe[data-console]").forEach(frame => {
      frame.contentWindow?.postMessage({ type: "hedge-console-visibility", engine: frame.dataset.console, active: !boxOpen && !frame.hidden }, window.location.origin);
    });
  }

  useEffect(syncConsoleVisibility, [engine, runtime, allStates, openedConsoles, boxOpen]);

  function selectEngine(next: Engine) {
    setBoxOpen(false);
    if (next === engine) return;
    setRuntime(allStates[next] || null);
    setError("");
    setRuntimeError("");
    setChecking(true);
    setEngine(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Switching engines does not depend on persistence.
    }
  }

  async function changeRuntime(next: RuntimeAction) {
    setAction(next);
    setError("");
    try {
      const response = await fetch("/api/hedge-ops/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine, action: next, liveAcknowledged: next === "start" && runtime?.dryRun === false }),
        signal: AbortSignal.timeout(60_000),
      });
      const updated = await readRuntimeResponse(response);
      setRuntime(updated);
      setAllStates(previous => ({ ...previous, [engine]: updated }));
      setFrameVersions(previous => ({ ...previous, [engine]: (previous[engine] || 0) + 1 }));
    } catch (caught) {
      setError(caught instanceof Error && caught.name !== "TimeoutError" ? caught.message : "运行请求超时，结果尚未确认。请刷新任务与持仓状态，勿重复提交。");
    } finally {
      setAction(null);
    }
  }

  async function stopAll() {
    if (!window.confirm("确认停撤平全部服务器程序？将锁定新开仓、撤销程序挂单、平掉任务仓位并停止。网络失败会保留待确认状态；本地模式独立。")) return;
    setAction("emergency");
    setEmergencyResult("正在提交全部停撤平…");
    try {
      const response = await fetch("/api/hedge-ops/emergency-stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acknowledged: true }), signal: AbortSignal.timeout(60_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.detail || "请求未确认");
      setEmergencyResult(data.results.map((r: { engine: Engine; message: string }) => `${engines.find(e => e.id === r.engine)?.label}：${r.message}`).join("；"));
    } catch (caught) { setEmergencyResult(caught instanceof Error ? caught.message : "结果待确认，请刷新各程序状态"); }
    finally { setAction(null); setRefreshVersion(v => v + 1); }
  }

  const available = runtime?.available === true;
  const running = runtime?.running === true;
  const statusLabel = action ? (action === "start" ? "启动中" : "停止中")
    : runtimeError ? "连接状态待确认"
    : !runtime && checking ? "检查连接中"
      : !runtime ? "状态待确认"
        : !available ? "引擎服务未连接"
          : running ? (runtime.dryRun ? "演练运行中" : "实盘运行中")
            : "已连接 · 待启动";
  const notice = error || runtimeError || (!available && !checking ? runtime?.message || "请先连接引擎服务；控制台可浏览，实时行情与运行操作将在连接后启用。" : "");

  function showSettings() {
    setSettingsOpen(true);
    settingsDialog.current?.showModal();
  }

  return (
    <main className="hedge-ops-page">
      <div className="hedge-ops-workspace">
      <aside className="hedge-ops-sidebar" aria-label="交易所控制台">
        <MarketServiceButtons value={boxOpen ? marketService : null} onChange={service => { setMarketService(service); setBoxOpen(true); }} disabled={Boolean(action)} />
        <div className="hedge-ops-brand"><ArrowLeftRight size={18} aria-hidden="true" /><h1>套利对冲Ops</h1></div>
        <p className="hedge-ops-sidebar-caption">八套交易所控制台</p>
        <nav className="hedge-ops-engines" aria-label="选择套利对冲引擎">
          {engines.map((item) => (
            <button key={item.id} type="button" aria-pressed={!boxOpen && engine === item.id} disabled={Boolean(action)} onClick={() => selectEngine(item.id)}><small className={`hedge-ops-run-label${allStates[item.id]?.running ? " is-running" : ""}`}>{allStates[item.id]?.emergency?.phase === "draining" ? "停撤平中" : allStates[item.id]?.running ? "● 已运行" : allStates[item.id]?.status === "REVIEW_REQUIRED" ? "需核对" : allStates[item.id]?.available ? "○ 未运行" : "状态待确认"}</small><span>{item.label}</span></button>
          ))}
        </nav>
      </aside>
      <div className="hedge-ops-workspace-content" ref={workspaceContent}>
      <div className="hedge-ops-toolbar" hidden={boxOpen}>
        <strong className="hedge-ops-selected-pair">{engines.find(item => item.id === engine)?.label}</strong>
        <div className="hedge-ops-runtime" role="status" aria-live="polite">
          <span className={`hedge-ops-status-dot${available ? " is-connected" : ""}${running ? " is-running" : ""}`} aria-hidden="true" />
          <span>{statusLabel}</span>
          {runtime?.pair ? <span className="hedge-ops-pair">{runtime.pair}</span> : null}
        </div>
        <div className="hedge-ops-actions">
          <span className="hedge-ops-mode"><Server size={12} aria-hidden="true" />服务器模式</span>
          <button type="button" className={running ? "hedge-ops-stop" : "hedge-ops-start"} disabled={!available || Boolean(runtimeError) || Boolean(action) || runtime?.emergency?.phase === "draining"} onClick={() => void changeRuntime(running ? "stop" : "start")}>
            {running ? <Square size={12} aria-hidden="true" /> : <Play size={12} aria-hidden="true" />}{running ? "停止" : runtime?.dryRun === false ? "启动实盘" : "启动"}
          </button>
          <button type="button" className="hedge-ops-stop-all" disabled={Boolean(action)} onClick={() => void stopAll()}>全部强制停止</button>
          <button type="button" disabled={checking || Boolean(action)} onClick={() => { setError(""); setRefreshVersion((value) => value + 1); }} title="刷新引擎状态"><RefreshCw size={13} className={checking ? "hedge-ops-spin" : ""} aria-hidden="true" /><span>刷新</span></button>
          <button type="button" onClick={showSettings}><Settings2 size={13} aria-hidden="true" /><span>环境与 IP 设置</span></button>
          <button type="button" disabled={Boolean(action)} onClick={onSwitchMode}>切换运行方式</button>
        </div>
      </div>
      {!boxOpen && (emergencyResult || engines.some(e => allStates[e.id]?.emergency)) ? <div className="hedge-ops-notice" role="status">{engines.some(e => allStates[e.id]?.emergency) ? engines.filter(e => allStates[e.id]?.emergency).map(e => `${e.label}：${allStates[e.id]?.emergency?.message}`).join("；") : emergencyResult}</div> : null}
      {!boxOpen && notice ? <div className="hedge-ops-notice" role={error || runtimeError ? "alert" : "status"}><CircleHelp size={14} aria-hidden="true" /><span>{notice}</span><button type="button" onClick={showSettings}>查看连接说明</button></div> : null}
      {engines.map(item => {
        const status = item.id === engine ? runtime : allStates[item.id];
        const ready = status?.running && (!status.hosted || status.heartbeatAt);
        return openedConsoles[item.id] ? <iframe
        key={`${item.id}:${frameVersions[item.id] || 0}`}
        data-console={item.id}
        hidden={boxOpen || item.id !== engine || !ready}
        className="hedge-ops-console"
        src={`/hedge-ops/console/${item.id}/`}
        title={`${item.label} 套利对冲完整控制台`}
        onLoad={syncConsoleVisibility}
      /> : null;
      })}
      {!boxOpen && !(running && (!runtime?.hosted || runtime.heartbeatAt)) ? <section className="hedge-ops-local-guide"><Server size={38} aria-hidden="true" /><h2>{running ? "正在加载云端行情…" : `服务器引擎${available ? "已就绪" : "连接检查中"}`}</h2><p>先保存环境与 IP 配置，再点击顶部「启动」。启动后会显示完整资金费总览、轮换任务和系统控制台。</p><button type="button" onClick={showSettings}><Settings2 size={15} aria-hidden="true" />环境与 IP 设置</button><p>默认使用演练模式；尚未配置交易凭据时可查看真实行情。</p></section> : null}
      {boxOpen ? <MarketServiceView service={marketService} onChange={setMarketService} onClose={() => setBoxOpen(false)} /> : null}
      </div>
      </div>
      <dialog ref={settingsDialog} className="hedge-ops-dialog" aria-labelledby="hedge-ops-settings-title" onClose={() => setSettingsOpen(false)} onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) settingsDialog.current?.close();
      }}>
        <div className="hedge-ops-dialog-heading"><div><span>ENGINE CONNECTION</span><h2 id="hedge-ops-settings-title">连接套利对冲引擎</h2></div><button type="button" aria-label="关闭连接设置" onClick={() => settingsDialog.current?.close()}><X size={18} aria-hidden="true" /></button></div>
        <p>服务器模式使用平台自有的 Vercel 托管引擎。选择的账户、API 密钥、网络与策略会加密保存，之后自动读取。</p>
        <HedgeOpsConfigForm key={engine} engine={engine} open={settingsOpen} onSaved={() => setRefreshVersion((value) => value + 1)} />
        <p className="hedge-ops-setup-note">本地服务与服务器配置各自独立。服务器默认直连；可在 IP 设置中保存 HTTP/HTTPS 代理并检测连通性。</p>
        <div className="hedge-ops-setup-note">初始配置使用演练模式。账户密钥通过平台服务端保存，读取时隐藏原值；启动前请核对交易对、仓位及执行参数。</div>
        <div className="hedge-ops-dialog-footer"><span>{statusLabel}</span><button type="button" disabled={checking || Boolean(action)} onClick={() => setRefreshVersion((value) => value + 1)}><RefreshCw size={14} aria-hidden="true" />重新检测连接</button></div>
      </dialog>
    </main>
  );
}
