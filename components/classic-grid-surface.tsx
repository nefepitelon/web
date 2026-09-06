"use client";

import { AlertTriangle, BookOpen, LayoutDashboard, Pause, Play, RefreshCw, Server, Settings2, ShieldCheck, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ClassicGridEnvironmentDialog } from "@/components/classic-grid-environment-dialog";
import { ClassicGridGuideDialog } from "@/components/classic-grid-guide-dialog";
import {
  CLASSIC_GRID_VENUE_TABS,
  ClassicGridVenueConsole,
  type ClassicGridVenueId
} from "@/components/classic-grid-venue-console";
import {
  defaultClassicGridEnvironment,
  serializeClassicGridEnvironment,
  type ClassicGridMode
} from "@/components/classic-grid-environment-schema";
import {
  clearClassicGridEnvironmentLocally,
  loadClassicGridEnvironmentLocally,
  saveClassicGridEnvironmentLocally
} from "@/components/classic-grid-environment-store";

type Bot = {
  id: string;
  dryRun: boolean;
  paused: boolean;
  status: string;
  summary: { venues?: string[]; markets?: string[]; tickMs?: number; leverage?: number };
  lastError: string | null;
  heartbeatAt: string | null;
  updatedAt: string;
};

const CLASSIC_GRID_VENUE_LABELS: Record<string, string> = {
  extended: "Extended", risex: "RISEx", decibel: "Decibel", n1: "N1",
  phoenix: "Phoenix", phoenix2: "Phoenix2", nado: "Nado", popdex: "PopDEX"
};
const CLASSIC_GRID_VENUE_COUNT = 8;
type ClassicGridView = "overview" | ClassicGridVenueId;

function statusLabel(bot: Bot | null, loading: boolean) {
  if (loading) return "正在读取服务器状态";
  if (!bot) return "尚未配置";
  const labels: Record<string, string> = {
    STARTING: "服务器正在启动", RUNNING: "服务器运行中", PAUSED: "已紧急暂停",
    ERROR: "运行异常，正在自动重试", STOPPED: "已停止", STOPPING: "正在停止"
  };
  return labels[bot.status] || bot.status;
}

export function ClassicGridSurface({ storageScope }: { storageScope: string }) {
  const [bot, setBot] = useState<Bot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [storageLoading, setStorageLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeView, setActiveView] = useState<ClassicGridView>("overview");
  const [frameVersion, setFrameVersion] = useState(0);
  const [mode, setMode] = useState<ClassicGridMode>("paper");
  const [environment, setEnvironment] = useState<Record<string, string>>(() => defaultClassicGridEnvironment());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledgeFunds, setAcknowledgeFunds] = useState(false);
  const [acknowledgeNoWithdrawals, setAcknowledgeNoWithdrawals] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (silent = false) => {
    if (silent && document.hidden) return;
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/classic-grid/config", { cache: "no-store" });
      const result = await response.json() as { ok?: boolean; bot?: Bot | null; error?: string; message?: string };
      if (!response.ok || result.ok === false) throw new Error(result.error || result.message || "读取失败");
      setBot(result.bot || null);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "读取服务器状态失败");
    } finally {
      setLoading(false);
    }
  }, []);
  const closeGuide = useCallback(() => setGuideOpen(false), []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    setStorageLoading(true);
    void loadClassicGridEnvironmentLocally(storageScope)
      .then((saved) => {
        if (!active || !saved) return;
        setEnvironment(saved.values);
        setSavedAt(saved.updatedAt);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "读取本地环境失败");
      })
      .finally(() => {
        if (active) setStorageLoading(false);
      });
    return () => { active = false; };
  }, [storageScope]);

  async function saveEnvironmentLocally(showNotice = true) {
    setLocalBusy(true);
    setError("");
    try {
      const updatedAt = await saveClassicGridEnvironmentLocally(storageScope, environment);
      setSavedAt(updatedAt);
      if (showNotice) setNotice("环境信息已加密保存在当前浏览器，没有上传服务器。");
      return updatedAt;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "保存本地环境失败";
      setError(message);
      throw caught;
    } finally {
      setLocalBusy(false);
    }
  }

  async function saveAndStart() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await saveEnvironmentLocally(false);
      const latest = await loadClassicGridEnvironmentLocally(storageScope);
      if (!latest) throw new Error("没有读取到最新的本地环境，请先保存后重试");
      setSavedAt(latest.updatedAt);
      const configText = serializeClassicGridEnvironment(latest.values);
      const response = await fetch("/api/classic-grid/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, configText, confirmation, acknowledgeFunds, acknowledgeNoWithdrawals })
      });
      const result = await response.json() as { ok?: boolean; bot?: Bot; error?: string; message?: string };
      if (!response.ok || result.ok === false) throw new Error(result.error || result.message || "启动失败");
      setBot(result.bot || null);
      setPanelOpen(false);
      setFrameVersion((value) => value + 1);
      window.setTimeout(() => void refresh(true), 1_500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "启动失败");
    } finally {
      setBusy(false);
    }
  }

  async function resetEnvironment() {
    if (!window.confirm("确认清除当前浏览器保存的 AIClassic 环境并恢复默认值？此操作无法撤销。")) return;
    setLocalBusy(true);
    setError("");
    try {
      await clearClassicGridEnvironmentLocally(storageScope);
      setEnvironment(defaultClassicGridEnvironment());
      setSavedAt(null);
      setMode("paper");
      setConfirmation("");
      setAcknowledgeFunds(false);
      setAcknowledgeNoWithdrawals(false);
      setNotice("本地环境已清除并恢复为默认值；如需保留默认值，请点击“仅保存环境”。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "清除本地环境失败");
    } finally {
      setLocalBusy(false);
    }
  }

  async function stop() {
    if (!window.confirm("确认停止服务器任务？现有挂单和仓位不会自动撤销或平仓。")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/classic-grid/config", { method: "DELETE" });
      const result = await response.json() as { ok?: boolean; bot?: Bot; error?: string };
      if (!response.ok || result.ok === false) throw new Error(result.error || "停止失败");
      setBot(result.bot || null);
      setFrameVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "停止失败");
    } finally {
      setBusy(false);
    }
  }

  async function changePause(paused: boolean) {
    if (paused && !window.confirm("确认紧急暂停全部已启用交易所？机器人将停止下单、撤单和补单，但不会自动撤销现有挂单或平仓。")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/classic-grid/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused })
      });
      const result = await response.json() as { ok?: boolean; paused?: boolean; error?: string; message?: string };
      if (!response.ok || result.ok === false) throw new Error(result.error || result.message || "切换运行状态失败");
      setBot((current) => current ? { ...current, paused: Boolean(result.paused), status: result.paused ? "PAUSED" : "RUNNING", lastError: null } : current);
      setFrameVersion((value) => value + 1);
      window.setTimeout(() => void refresh(true), 800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "切换运行状态失败");
    } finally {
      setBusy(false);
    }
  }

  const active = Boolean(bot && ["STARTING", "RUNNING", "PAUSED", "ERROR"].includes(bot.status));
  const healthy = bot?.status === "RUNNING";
  const enabledVenueLabels = (bot?.summary?.venues || []).map(
    (venue) => CLASSIC_GRID_VENUE_LABELS[venue] || venue
  );
  const selectedVenue = CLASSIC_GRID_VENUE_TABS.find((venue) => venue.id === activeView);

  return (
    <main className="classic-grid-page">
      <div className="classic-grid-ribbon">
        <div>
          <span className={`grid-ops-status-dot ${healthy ? "grid-ops-status-dot--online" : loading || bot?.status === "STARTING" ? "grid-ops-status-dot--checking" : ""}`} aria-hidden="true" />
          <strong>AIClassic网格</strong>
          <span>
            {statusLabel(bot, loading)} · {bot
              ? `已启用 ${enabledVenueLabels.length}/${CLASSIC_GRID_VENUE_COUNT}：${enabledVenueLabels.join(" / ") || "无"}`
              : `支持 ${CLASSIC_GRID_VENUE_COUNT} 所交易场所`}
          </span>
        </div>
        <div className="classic-grid-toolbar">
          <button type="button" onClick={() => setFrameVersion((value) => value + 1)}><RefreshCw size={12} />刷新</button>
          {active ? <button className="classic-grid-stop" type="button" onClick={() => void stop()} disabled={busy}><Square size={11} />停止</button> : null}
        </div>
      </div>

      <div className="classic-grid-workspace-head">
        <div>
          <span className="classic-grid-workspace-dot" aria-hidden="true" />
          <strong>{activeView === "overview" ? "八所网格总看板" : `${selectedVenue?.label || activeView} 交易所控制台`}</strong>
          <span className={`classic-grid-workspace-mode ${bot?.dryRun === false ? "is-live" : ""}`}>{bot?.dryRun === false ? "LIVE" : "PAPER"}</span>
          <span className="classic-grid-workspace-count">已启用 {enabledVenueLabels.length}/{CLASSIC_GRID_VENUE_COUNT}</span>
        </div>
        {active ? (
          bot?.paused
            ? <button className="classic-grid-resume" type="button" onClick={() => void changePause(false)} disabled={busy}><Play size={13} />恢复运行</button>
            : <button className="classic-grid-pause" type="button" onClick={() => void changePause(true)} disabled={busy}><Pause size={13} />紧急暂停</button>
        ) : null}
      </div>

      <nav className="classic-grid-console-tabs" aria-label="AIClassic 网格控制台导航">
        <button className={activeView === "overview" ? "is-active" : ""} type="button" onClick={() => setActiveView("overview")} aria-current={activeView === "overview" ? "page" : undefined}>
          <LayoutDashboard size={13} />总览
        </button>
        {CLASSIC_GRID_VENUE_TABS.map((venue) => {
          const configured = Boolean(bot?.summary?.venues?.includes(venue.id));
          return (
            <button className={`${activeView === venue.id ? "is-active" : ""} ${configured ? "is-configured" : "is-disabled"}`} type="button" key={venue.id} onClick={() => setActiveView(venue.id)} aria-current={activeView === venue.id ? "page" : undefined}>
              <i style={{ backgroundColor: venue.color }} aria-hidden="true" />{venue.label}
            </button>
          );
        })}
        <span className="classic-grid-console-tabs-spacer" aria-hidden="true" />
        <button type="button" onClick={() => setGuideOpen(true)}><BookOpen size={13} />配置说明</button>
        <button type="button" onClick={() => setPanelOpen(true)}><Settings2 size={13} />环境配置</button>
      </nav>

      {activeView !== "overview" ? (
        <ClassicGridVenueConsole
          venueId={activeView}
          configured={Boolean(bot?.summary?.venues?.includes(activeView))}
          refreshToken={frameVersion}
          busy={busy}
          onOpenEnvironment={() => setPanelOpen(true)}
          onPauseChange={changePause}
        />
      ) : active ? (
        <iframe key={frameVersion} className="classic-grid-frame" src={`/classic-grid-console?embedded=1&reload=${frameVersion}`} title="AIClassic 八所网格总看板" />
      ) : (
        <section className="classic-grid-welcome" aria-live="polite">
          <div className="classic-grid-welcome-card">
            <div className="classic-grid-server-icon"><Server size={30} /></div>
            <span className="classic-grid-server-pill">WELINKBTC 服务器执行</span>
            <h1>AIClassic 网格已集成</h1>
            <p>原版八所网格引擎和总看板已经放入本站。环境信息加密保存在当前浏览器，启动前读取最新本地版本，再由服务器持续执行。</p>
            {error ? <div className="classic-grid-error"><AlertTriangle size={16} />{error}</div> : null}
            <button className="classic-grid-primary" type="button" onClick={() => setPanelOpen(true)} disabled={loading}>配置并启动模拟盘</button>
            <div className="classic-grid-security"><ShieldCheck size={16} />本地保险库和服务器运行副本均使用 AES-256-GCM；模拟盘默认开启；实盘受到双重验证和二次确认保护。</div>
          </div>
        </section>
      )}

      {panelOpen ? (
        <ClassicGridEnvironmentDialog
          mode={mode}
          values={environment}
          storageLoading={storageLoading}
          busy={busy || localBusy}
          savedAt={savedAt}
          notice={notice}
          error={error}
          confirmation={confirmation}
          acknowledgeFunds={acknowledgeFunds}
          acknowledgeNoWithdrawals={acknowledgeNoWithdrawals}
          onModeChange={(value) => { setMode(value); setNotice(""); setError(""); }}
          onFieldChange={(key, value) => { setEnvironment((current) => ({ ...current, [key]: value })); setNotice(""); }}
          onConfirmationChange={setConfirmation}
          onAcknowledgeFundsChange={setAcknowledgeFunds}
          onAcknowledgeNoWithdrawalsChange={setAcknowledgeNoWithdrawals}
          onSaveLocal={async () => {
            try {
              await saveEnvironmentLocally(true);
            } catch {
              // The helper already exposes a user-facing error inside the dialog.
            }
          }}
          onStart={saveAndStart}
          onReset={resetEnvironment}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
      {guideOpen ? <ClassicGridGuideDialog onClose={closeGuide} /> : null}
    </main>
  );
}
