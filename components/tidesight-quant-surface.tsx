"use client";

import Link from "next/link";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Binary,
  BrainCircuit,
  Cable,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  CircleStop,
  Database,
  FlaskConical,
  Gauge,
  KeyRound,
  Layers3,
  LockKeyhole,
  Network,
  Play,
  Radar,
  RefreshCw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  TriangleAlert,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/components/tidesight-quant-surface.module.css";
import { TideSightAutoStrategies, TideSightAutoControl, TideSightRiskEditor } from "@/components/tidesight-controls";
import { TideSightMacdBoard } from "@/components/tidesight-macd-board";
import { TIDESIGHT_FEATURED_MARKETS } from "@/lib/tidesight/market-universe";

type Language = "zh" | "en";
type SurfaceTab = "overview" | "macd" | "research" | "strategies" | "allocator" | "risk" | "execution" | "backtest" | "audit";
type AlphaExecutionMode = "paper" | "live";
type TideSightMode = "paper" | "live";

type ExecutionConfig = {
  activeMode: AlphaExecutionMode;
  defaultMarket: "spot" | "futures";
  testnetEnabled: boolean;
  liveEnabled: boolean;
  autoExecuteEnabled: boolean;
  autoStopLossPct: number | null;
  autoTakeProfitPct: number | null;
  autoHeartbeatAt: string | null;
  autoError: string | null;
  killSwitchActive: boolean;
  requireManualConfirmation: boolean;
  requireProtectionOrders: true;
  riskPerTradePct: number;
  maxLeverage: number;
  dailyLossLimitPct: number;
  dedupeWindowMinutes: number;
  maxOpenPositions: number;
  maxPortfolioExposurePct: number;
  minTideSightScore: number;
  perOrderNotionalLimit: number;
  dailyNotionalLimit: number;
  liveUnlocked: boolean;
  liveUnlockedAt: string | null;
  lastReconciledAt: string | null;
  reconciliationHealthy: boolean;
};

type CredentialSummary = {
  id: string;
  environment: string;
  market: string;
  apiKeyHint: string;
  enabled: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  proxyConfigured: boolean;
  permissionSummary?: { accountMode?: "portfolio" | "classic"; accountType?: string; portfolioMargin?: { uniMMR: number; minUniMMR: number; collateralEquity: number; actualEquity: number; initialMargin: number; maintenanceMargin: number } } | null;
};

type ExecutionSnapshot = {
  config: ExecutionConfig;
  credentials: CredentialSummary[];
  plans: Array<{ id: string; state: string; environment: string; createdAt: string; intent?: { symbol?: string; side?: string; source?: string; tideSightScore?: number | null } }>;
  orders: Array<{ id: string; symbol: string; status: string; role: string; environment: string; createdAt: string }>;
  positions: Array<{ id: string; symbol: string; side: string; quantity: number; entryPrice: number; markPrice: number | null; unrealizedPnl: number; state: string; environment: string }>;
  audits: Array<{ id: string; state: string; status: string; message: string; createdAt: string }>;
  portfolioStats: Array<{ environment: string; market: string; equity: number | null; riskExposureNotional: number; riskExposurePct: number | null; unrealizedPnl: number; refreshedAt: string }>;
};

type MarketRow = {
  symbol: string;
  asset: string;
  markPrice: number;
  fundingRate: number;
  fundingAnnualizedPct: number;
  priceChange24hPct: number;
  quoteVolume24h: number;
};

type IntentResult = {
  ok: boolean;
  decision: string;
  state?: string;
  violations?: Array<{ code: string; message: string }>;
  warnings?: Array<{ code: string; message: string }>;
  executionPlan?: {
    planId: string;
    expiresAt: string;
    risk: { notional: number; riskAmount: number; riskRewardRatio: number; leverage: number; marginRequired: number };
    mainOrder: { quantity: number; side: string; type: string };
  } | null;
};

type Props = {
  signedIn: boolean;
  canOperate: boolean;
  canUnlockLive: boolean;
  operatorLabel: string | null;
  initialTab?: SurfaceTab;
};

const navItems: Array<{ id: SurfaceTab; zh: string; en: string; icon: typeof Activity; href?: string }> = [
  { id: "overview", zh: "总览", en: "Overview", icon: Activity, href: "/tidesight-quant" },
  { id: "macd", zh: "MACD 多周期", en: "MACD Monitor", icon: ChartNoAxesCombined, href: "/tidesight-quant/macd" },
  { id: "research", zh: "研究信号", en: "Research", icon: Radar },
  { id: "strategies", zh: "策略实验室", en: "Strategies", icon: BrainCircuit },
  { id: "allocator", zh: "组合分配", en: "Allocator", icon: Layers3 },
  { id: "risk", zh: "风险闸门", en: "Risk Engine", icon: ShieldCheck },
  { id: "execution", zh: "执行与接入", en: "Execution", icon: Route },
  { id: "backtest", zh: "成交级验证", en: "Backtest", icon: FlaskConical },
  { id: "audit", zh: "事实与审计", en: "Audit", icon: Database },
];

const pipeline = [
  { n: "01", zh: "WELINKBTC 信号", en: "WELINKBTC Signal", icon: Radar },
  { n: "02", zh: "Freqtrade / Jesse", en: "Freqtrade / Jesse", icon: BrainCircuit },
  { n: "03", zh: "目标仓位", en: "Target Position", icon: Layers3 },
  { n: "04", zh: "风险否决", en: "Risk Veto", icon: ShieldCheck },
  { n: "05", zh: "唯一执行", en: "Single Executor", icon: Route },
  { n: "06", zh: "交易所子账户", en: "Exchange Subaccount", icon: Network },
  { n: "07", zh: "对账与审计", en: "Reconcile & Audit", icon: Database },
];

const strategyRows = [
  { id: "trend", code: "TS-TREND-4H", zh: "低频趋势", en: "Low-frequency trend", engine: "Freqtrade", weight: 45, signal: "+0.62", risk: "0.50%" },
  { id: "carry", code: "TS-CARRY-8H", zh: "资金费率 Carry", en: "Funding carry", engine: "Jesse", weight: 30, signal: "+0.31", risk: "0.35%" },
  { id: "basis", code: "TS-BASIS-DELTA", zh: "现货 / 永续基差", en: "Spot / perp basis", engine: "Custom", weight: 20, signal: "+0.18", risk: "0.25%" },
  { id: "reserve", code: "TS-RESERVE", zh: "现金与保证金缓冲", en: "Cash & margin reserve", engine: "Allocator", weight: 5, signal: "FLAT", risk: "—" },
];

const defaultConfig: ExecutionConfig = {
  activeMode: "paper",
  defaultMarket: "futures",
  testnetEnabled: false,
  liveEnabled: false,
  autoExecuteEnabled: false,
  autoStopLossPct: null,
  autoTakeProfitPct: null,
  autoHeartbeatAt: null,
  autoError: null,
  killSwitchActive: false,
  requireManualConfirmation: true,
  requireProtectionOrders: true,
  riskPerTradePct: 1.5,
  maxLeverage: 25,
  dailyLossLimitPct: 2,
  dedupeWindowMinutes: 15,
  maxOpenPositions: 6,
  maxPortfolioExposurePct: 50,
  minTideSightScore: 75,
  perOrderNotionalLimit: 1000,
  dailyNotionalLimit: 5000,
  liveUnlocked: false,
  liveUnlockedAt: null,
  lastReconciledAt: null,
  reconciliationHealthy: false,
};

function formatMoney(value: number | null | undefined, currency = "USDT") {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: value < 10 ? 4 : 2 }).format(value)} ${currency}`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) : "—";
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { error?: string; message?: string }).error ?? (payload as { message?: string }).message ?? `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function TideChart({ language }: { language: Language }) {
  return (
    <div className={styles.chartWrap} aria-label={language === "zh" ? "低频趋势状态示意图" : "Low-frequency regime preview"}>
      <svg viewBox="0 0 760 250" role="img">
        <defs>
          <linearGradient id="tide-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ts-teal)" stopOpacity=".26" />
            <stop offset="1" stopColor="var(--ts-teal)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="tide-stroke" x1="0" x2="1">
            <stop offset="0" stopColor="var(--ts-blue)" />
            <stop offset=".6" stopColor="var(--ts-teal)" />
            <stop offset="1" stopColor="var(--ts-orange)" />
          </linearGradient>
        </defs>
        {[48, 96, 144, 192].map((y) => <line key={y} x1="0" y1={y} x2="760" y2={y} className={styles.chartGrid} />)}
        {[95, 190, 285, 380, 475, 570, 665].map((x) => <line key={x} x1={x} y1="0" x2={x} y2="220" className={styles.chartGrid} />)}
        <path d="M0,190 C55,196 76,166 122,170 C170,174 192,145 232,150 C278,154 302,118 345,122 C391,126 414,90 460,98 C514,107 539,69 585,75 C627,80 660,52 706,58 C730,61 744,47 760,42 L760,220 L0,220 Z" fill="url(#tide-fill)" />
        <path d="M0,190 C55,196 76,166 122,170 C170,174 192,145 232,150 C278,154 302,118 345,122 C391,126 414,90 460,98 C514,107 539,69 585,75 C627,80 660,52 706,58 C730,61 744,47 760,42" fill="none" stroke="url(#tide-stroke)" strokeWidth="3" className={styles.tidePath} />
        <path d="M0,158 C68,143 104,185 165,164 C218,146 261,177 318,155 C379,131 417,163 478,142 C535,123 584,148 643,122 C688,102 720,111 760,91" fill="none" stroke="var(--ts-gold)" strokeWidth="1.3" strokeDasharray="6 8" opacity=".72" />
        <circle cx="760" cy="42" r="5" fill="var(--ts-orange)" className={styles.chartPulse} />
      </svg>
      <div className={styles.chartLabels}><span>-30D</span><span>-14D</span><span>-7D</span><strong>{language === "zh" ? "当前" : "NOW"}</strong></div>
    </div>
  );
}

export function TideSightQuantSurface({ signedIn, canOperate, canUnlockLive, operatorLabel, initialTab = "overview" }: Props) {
  const [language, setLanguage] = useState<Language>("zh");
  const [activeTab, setActiveTab] = useState<SurfaceTab>(initialTab);
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null);
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [marketCheckedAt, setMarketCheckedAt] = useState<string | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [previewMode, setPreviewMode] = useState<TideSightMode>("paper");
  const [enabledStrategies, setEnabledStrategies] = useState<Record<string, boolean>>({ trend: true, carry: true, basis: true, reserve: true });
  const [dedicatedAccount, setDedicatedAccount] = useState(false);
  const [credential, setCredential] = useState({ environment: "live" as const, market: "futures" as "spot" | "futures", apiKey: "", apiSecret: "", proxy: "" });
  const [unlock, setUnlock] = useState({ realFunds: false, noWithdraw: false });
  const [intent, setIntent] = useState({ symbol: "BTCUSDT", side: "LONG" as "LONG" | "SHORT", leverage: 1, riskPct: 0.5, tideSightScore: 84 });
  const [intentResult, setIntentResult] = useState<IntentResult | null>(null);

  const config = snapshot?.config ?? defaultConfig;
  const actualMode: TideSightMode = canOperate && config.activeMode === "live" ? "live" : previewMode;
  const tr = useCallback((zh: string, en: string) => language === "zh" ? zh : en, [language]);

  const loadMarket = useCallback(async () => {
    try {
      const payload = await readJson<{ ok: true; checkedAt: string; markets: MarketRow[] }>(await fetch("/api/tidesight/market", { cache: "no-store" }));
      setMarkets(payload.markets);
      setMarketCheckedAt(payload.checkedAt);
      setMarketError(null);
    } catch (caught) {
      setMarketError(caught instanceof Error ? caught.message : "Market data unavailable");
    }
  }, []);

  const loadSnapshot = useCallback(async (silent = false) => {
    if (!canOperate) return;
    if (!silent) setBusy("snapshot");
    try {
      const payload = await readJson<{ ok: true } & ExecutionSnapshot>(await fetch("/api/tidesight/execution/status", { cache: "no-store" }));
      setSnapshot(payload);
      setPreviewMode(payload.config.activeMode === "live" ? "live" : "paper");
    } catch (caught) {
      if (!silent) setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "执行状态读取失败" });
    } finally {
      if (!silent) setBusy(null);
    }
  }, [canOperate]);

  useEffect(() => {
    const syncLanguage = () => setLanguage(document.documentElement.dataset.language === "en" ? "en" : "zh");
    syncLanguage();
    const listener = () => syncLanguage();
    window.addEventListener("welinkbtc:preferences", listener);
    const observer = new MutationObserver(syncLanguage);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-language"] });
    return () => { observer.disconnect(); window.removeEventListener("welinkbtc:preferences", listener); };
  }, []);

  useEffect(() => {
    if (activeTab === "overview") void loadMarket();
    void loadSnapshot();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (activeTab === "overview") void loadMarket();
      void loadSnapshot(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [activeTab, loadMarket, loadSnapshot]);

  const portfolio = useMemo(() => snapshot?.portfolioStats.find((item) => item.environment === actualMode && item.market === config.defaultMarket) ?? snapshot?.portfolioStats[0] ?? null, [actualMode, config.defaultMarket, snapshot]);
  const activePositions = snapshot?.positions.filter((position) => ["MONITORING", "PROTECTION_ACTIVE", "RECONCILING", "UNKNOWN"].includes(position.state)) ?? [];

  function configPayload(activeMode: TideSightMode): ExecutionConfig {
    return {
      ...config,
      activeMode,
      requireProtectionOrders: true,
      autoExecuteEnabled: false,
    };
  }

  async function selectMode(mode: TideSightMode) {
    setIntentResult(null);
    if (!canOperate) {
      if (mode === "live") {
        setActiveTab("execution");
        setNotice({ tone: "warn", text: tr("实盘始终保持加锁；请先登录 Max / 管理员账户完成凭据、2FA 与健康对账。", "Live stays locked. Sign in with an eligible operator account, verify credentials, pass 2FA, and reconcile first.") });
        return;
      }
      setPreviewMode(mode);
      setNotice({ tone: "ok", text: tr("已切换界面预览；不会写入订单或连接交易所。", "Preview changed. No order or exchange connection was created.") });
      return;
    }
    if (mode === "live") {
      setActiveTab("execution");
      setNotice({ tone: "warn", text: tr("生产实盘必须在执行页完成独立解锁。", "Production live must be unlocked independently in Execution.") });
      return;
    }
    setBusy("mode");
    try {
      const payload = await readJson<{ config: ExecutionConfig }>(await fetch("/api/tidesight/execution/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configPayload(mode)),
      }));
      setSnapshot((current) => current ? { ...current, config: payload.config } : current);
      setNotice({ tone: "ok", text: tr(`执行环境已切换为 ${mode.toUpperCase()}。`, `Execution mode changed to ${mode.toUpperCase()}.`) });
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Mode update failed" });
    } finally {
      setBusy(null);
    }
  }

  async function saveCredential(event: React.FormEvent) {
    event.preventDefault();
    setBusy("credential");
    try {
      await readJson(await fetch("/api/tidesight/execution/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credential, acknowledgeDedicatedAccount: dedicatedAccount }),
      }));
      setCredential((current) => ({ ...current, apiKey: "", apiSecret: "" }));
      setNotice({ tone: "ok", text: tr("凭据已在服务端加密保存；现在执行连接与权限预检。", "Credentials encrypted server-side. Run connection and permission preflight now.") });
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Credential save failed" });
    } finally {
      setBusy(null);
    }
  }

  async function preflight() {
    setBusy("preflight");
    try {
      const payload = await readJson<{ result: { canTrade?: boolean; accountType?: string; equity?: number } }>(await fetch("/api/tidesight/execution/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: credential.environment, market: credential.market }),
      }));
      setNotice({ tone: payload.result.canTrade ? "ok" : "warn", text: tr(`预检完成：${payload.result.accountType ?? "账户"} · ${payload.result.canTrade ? "交易权限通过" : "交易权限未通过"}。`, `Preflight complete: ${payload.result.accountType ?? "account"} · ${payload.result.canTrade ? "trading permission verified" : "trading permission not verified"}.`) });
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Preflight failed" });
    } finally {
      setBusy(null);
    }
  }

  async function reconcile() {
    setBusy("reconcile");
    try {
      const payload = await readJson<{ ok: boolean; reconciled?: number; errors?: string[] }>(await fetch("/api/tidesight/execution/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: credential.environment, market: credential.market }),
      }));
      setNotice({ tone: payload.ok ? "ok" : "warn", text: tr(`对账完成：${payload.reconciled ?? 0} 条记录，${payload.errors?.length ?? 0} 个异常。`, `Reconciliation finished: ${payload.reconciled ?? 0} records, ${payload.errors?.length ?? 0} exceptions.`) });
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Reconciliation failed" });
    } finally {
      setBusy(null);
    }
  }

  async function unlockLive() {
    setBusy("unlock");
    try {
      await readJson(await fetch("/api/tidesight/execution/live-unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledgeRealFunds: unlock.realFunds, acknowledgeNoWithdrawPermission: unlock.noWithdraw }),
      }));
      setUnlock({ realFunds: false, noWithdraw: false });
      setNotice({ tone: "warn", text: tr("生产实盘已解锁。每个计划仍需通过风控与人工确认。", "Production live unlocked. Every plan still requires risk approval and human confirmation.") });
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Live unlock failed" });
    } finally {
      setBusy(null);
    }
  }

  async function lockLive() {
    setBusy("lock-live");
    try {
      await readJson(await fetch("/api/tidesight/execution/live-unlock", { method: "DELETE" }));
      setNotice({ tone: "ok", text: tr("生产实盘已重新加锁并回退至 PAPER。", "Production live relocked and reverted to PAPER.") });
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Live lock failed" });
    } finally {
      setBusy(null);
    }
  }

  async function triggerKillSwitch() {
    if (!window.confirm(tr("确认触发 Kill Switch？系统将停止自动执行、撤销待执行计划并处置可识别持仓。", "Trigger Kill Switch? This stops automation, cancels pending plans, and handles recognized positions."))) return;
    setBusy("kill");
    try {
      const payload = await readJson<{ ok: boolean }>(await fetch("/api/tidesight/execution/kill-switch", { method: "POST" }));
      setNotice({ tone: payload.ok ? "ok" : "warn", text: tr("Kill Switch 已触发；请检查对账和审计结果。", "Kill Switch triggered. Review reconciliation and audit results.") });
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Kill Switch failed" });
    } finally {
      setBusy(null);
    }
  }

  async function createIntent(event: React.FormEvent) {
    event.preventDefault();
    setBusy("intent");
    setIntentResult(null);
    try {
      const priceEndpoint = canOperate
        ? `/api/tidesight/execution/price?symbol=${encodeURIComponent(intent.symbol)}&market=futures`
        : `/api/binance-price?symbol=${encodeURIComponent(intent.symbol)}&market=futures`;
      const pricePayload = await readJson<{ price: number }>(await fetch(priceEndpoint, { cache: "no-store" }));
      const entryPrice = Number(pricePayload.price);
      const isLong = intent.side === "LONG";
      const stopLoss = Number((entryPrice * (isLong ? 0.985 : 1.015)).toFixed(8));
      const takeProfit = Number((entryPrice * (isLong ? 1.03 : 0.97)).toFixed(8));

      if (!canOperate) {
        setIntentResult({
          ok: true,
          decision: "PREVIEW_APPROVED",
          state: "PAPER_PREVIEW",
          warnings: [{ code: "PREVIEW_ONLY", message: tr("公开预览不会写入数据库或提交订单。", "Public preview does not write to the database or submit an order.") }],
          executionPlan: {
            planId: "PREVIEW-NOT-PERSISTED",
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            risk: { notional: 500, riskAmount: 5, riskRewardRatio: 2, leverage: intent.leverage, marginRequired: 500 / intent.leverage },
            mainOrder: { quantity: 500 / entryPrice, side: isLong ? "BUY" : "SELL", type: "MARKET" },
          },
        });
        setNotice({ tone: "ok", text: tr("纸面预览计划已生成；登录 Max 后可进入真实风控与审计链路。", "Paper preview plan generated. Sign in with Max to enter the persisted risk and audit workflow.") });
        return;
      }

      const intentResponse = await fetch("/api/tidesight/execution/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: intent.symbol,
          side: intent.side,
          orderType: "MARKET",
          entryPrice,
          stopLoss,
          takeProfit,
          leverage: intent.leverage,
          riskPct: intent.riskPct,
          source: "tidesight-manual-control-plane",
          tideSightScore: intent.tideSightScore,
          mode: config.activeMode,
          market: "futures",
          equity: 10_000,
          dailyPnl: 0,
        }),
      });
      const result = await intentResponse.json().catch(() => ({})) as IntentResult & { error?: string; message?: string };
      if (!intentResponse.ok && intentResponse.status !== 422) {
        throw new Error(result.error ?? result.message ?? `HTTP ${intentResponse.status}`);
      }
      setIntentResult(result);
      setNotice({ tone: result.ok ? "ok" : "warn", text: result.ok ? tr("风险引擎已批准并生成待确认执行计划。", "Risk Engine approved a pending execution plan.") : tr("风险引擎已拒绝该意图。", "Risk Engine rejected this intent.") });
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Intent creation failed" });
    } finally {
      setBusy(null);
    }
  }

  async function executeApprovedPlan() {
    const planId = intentResult?.executionPlan?.planId;
    if (!planId || !canOperate) return;
    if (!window.confirm(tr(`确认执行已审批计划 ${planId}？`, `Execute approved plan ${planId}?`))) return;
    setBusy("execute");
    try {
      const payload = await readJson<{ simulated?: boolean }>(await fetch("/api/tidesight/execution/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, confirmation: "EXECUTE_APPROVED_PLAN" }),
      }));
      setNotice({ tone: "ok", text: payload.simulated ? tr("模拟主订单已成交，保护单、持仓监控与审计已启动。", "Simulated entry filled; protection, monitoring, and audit are active.") : tr("订单已提交唯一执行通道；请继续对账。", "Order submitted through the single execution channel. Continue with reconciliation.") });
      setIntentResult(null);
      await loadSnapshot(true);
    } catch (caught) {
      setNotice({ tone: "error", text: caught instanceof Error ? caught.message : "Execution failed" });
    } finally {
      setBusy(null);
    }
  }

  const renderOverview = () => (
    <>
      <div className={styles.overviewGrid}>
        <section className={`${styles.panel} ${styles.regimePanel}`}>
          <div className={styles.panelHead}>
            <div><span>{tr("长周期状态", "LONG-WAVE REGIME")}</span><h2>{tr("趋势正在形成，仍需风险确认", "Trend forming, risk confirmation required")}</h2></div>
            <div className={styles.regimeScore}><small>{tr("趋势分", "TREND SCORE")}</small><strong>62</strong><em>/ 100</em></div>
          </div>
          <TideChart language={language} />
          <div className={styles.signalStrip}>
            <span><i className={styles.dotTeal} />EMA / Donchian <strong>+0.71</strong></span>
            <span><i className={styles.dotGold} />Funding carry <strong>+0.24</strong></span>
            <span><i className={styles.dotOrange} />Event risk <strong>-0.18</strong></span>
          </div>
        </section>

        <section className={`${styles.panel} ${styles.posturePanel}`}>
          <div className={styles.panelHead}><div><span>{tr("组合姿态", "PORTFOLIO POSTURE")}</span><h2>{tr("克制参与", "Measured participation")}</h2></div><Gauge /></div>
          <div className={styles.postureMeter} style={{ "--posture": "42%" } as React.CSSProperties}><span><b>42%</b><small>{tr("风险预算使用", "RISK BUDGET USED")}</small></span></div>
          <dl className={styles.metricsList}>
            <div><dt>{tr("目标净敞口", "Target net exposure")}</dt><dd>+18%</dd></div>
            <div><dt>{tr("市场中性仓位", "Market-neutral book")}</dt><dd>24%</dd></div>
            <div><dt>{tr("现金 / 保证金", "Cash / margin")}</dt><dd>58%</dd></div>
            <div><dt>{tr("再平衡周期", "Rebalance cadence")}</dt><dd>4H</dd></div>
          </dl>
        </section>
      </div>

      <section className={styles.marketSection}>
        <div className={styles.sectionTitle}>
          <div><span>{tr("实时市场脉冲", "LIVE MARKET PULSE")}</span><h2>{tr("只把可验证数据标记为实时", "Only verifiable data is labeled live")}</h2></div>
          <div className={styles.sourceTag}><i />BINANCE FUTURES · {marketCheckedAt ? new Date(marketCheckedAt).toLocaleTimeString(language === "zh" ? "zh-CN" : "en-US") : tr("连接中", "CONNECTING")}</div>
        </div>
        <div className={styles.marketGrid}>
          {markets.length ? markets.map((market) => {
            const positive = market.priceChange24hPct >= 0;
            return (
              <article key={market.symbol} className={styles.marketCard}>
                <div><strong>{market.asset}</strong><span>PERP / USDT</span></div>
                <b>{formatMoney(market.markPrice, "")}</b>
                <p className={positive ? styles.positive : styles.negative}>{positive ? <ArrowUpRight /> : <ArrowDownRight />}{market.priceChange24hPct.toFixed(2)}%</p>
                <footer><span>{tr("资金费年化", "Funding ann.")} <em>{market.fundingAnnualizedPct.toFixed(2)}%</em></span><span>{tr("24H 成交额", "24H volume")} <em>{formatCompact(market.quoteVolume24h)}</em></span></footer>
              </article>
            );
          }) : TIDESIGHT_FEATURED_MARKETS.map(({ asset }) => <article className={`${styles.marketCard} ${styles.skeleton}`} key={asset}><div><strong>{asset}</strong><span>PERP / USDT</span></div><b>—</b><p>{marketError ?? tr("读取实时数据", "Loading live data")}</p></article>)}
        </div>
      </section>

      <section className={`${styles.panel} ${styles.pipelinePanel}`}>
        <div className={styles.sectionTitle}><div><span>CONTROL PLANE</span><h2>{tr("一个事实源，一条下单路径", "One source of truth, one order path")}</h2></div><span className={styles.guardLabel}><ShieldCheck />RISK VETO ACTIVE</span></div>
        <div className={styles.pipeline}>
          {pipeline.map((item, index) => {
            const Icon = item.icon;
            return <div className={styles.pipelineNode} key={item.n}><small>{item.n}</small><Icon /><strong>{item[language]}</strong>{index < pipeline.length - 1 ? <ChevronRight /> : null}</div>;
          })}
        </div>
      </section>

      <div className={styles.bottomGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><span>{tr("活动仓位", "ACTIVE POSITIONS")}</span><h2>{canOperate ? tr("账户事实", "Account facts") : tr("等待执行账户", "Awaiting execution account")}</h2></div><Database /></div>
          {activePositions.length ? <div className={styles.positionList}>{activePositions.slice(0, 4).map((position) => <div key={position.id}><span><b>{position.symbol}</b><small>{position.environment} · {position.state}</small></span><strong>{position.side} · {position.quantity}</strong><em className={position.unrealizedPnl >= 0 ? styles.positive : styles.negative}>{formatMoney(position.unrealizedPnl)}</em></div>)}</div> : <div className={styles.emptyState}><Waves /><strong>{tr("当前没有活动仓位", "No active positions")}</strong><p>{tr("空仓也是一种明确的目标仓位。", "Flat is also an explicit target position.")}</p></div>}
        </section>
        <section className={`${styles.panel} ${styles.safetyPanel}`}>
          <div className={styles.panelHead}><div><span>{tr("安全边界", "SAFETY BOUNDARY")}</span><h2>{tr("资金隔离优先于收益", "Capital isolation before return")}</h2></div><LockKeyhole /></div>
          <ul className={styles.checkList}>
            <li><Check />{tr("独立子账户与独立 API Key", "Dedicated subaccount and API key")}</li>
            <li><Check />{tr("提现与划转权限永久关闭", "Withdrawals and transfers permanently disabled")}</li>
            <li><Check />{tr("所有订单必须通过独立风控", "Every order must pass independent risk checks")}</li>
            <li><Check />{tr("先长期 PAPER 验证，再小额 LIVE", "Long PAPER validation before small LIVE capital")}</li>
          </ul>
        </section>
      </div>
    </>
  );

  const renderResearch = () => (
    <div className={styles.tabStack}>
      <section className={styles.introBand}><div><span>SIGNAL FABRIC</span><h2>{tr("研究只负责提高判断质量，不拥有下单权", "Research improves decisions; it never owns order permission")}</h2></div><p>{tr("预测市场与链上事件先经过来源可靠度、冲击、新鲜度和交叉确认评分，再作为趋势过滤器。", "Prediction-market and on-chain events are scored for source quality, impact, freshness, and corroboration before becoming trend filters.")}</p></section>
      <div className={styles.researchGrid}>
        {[
          { icon: Binary, code: "PREDICTION", title: tr("预测市场", "Prediction markets"), status: tr("等待数据源", "AWAITING PROVIDER"), body: tr("概率变化、流动性、结算时间与来源可信度。", "Probability delta, liquidity, resolution time, and source confidence.") },
          { icon: Network, code: "ON-CHAIN", title: tr("链上事件", "On-chain events"), status: tr("等待数据源", "AWAITING PROVIDER"), body: tr("交易所净流、稳定币供给、巨鲸、解锁、桥接与协议异常。", "Exchange flows, stablecoin supply, whales, unlocks, bridges, and protocol anomalies.") },
          { icon: ChartNoAxesCombined, code: "MARKET", title: tr("市场结构", "Market structure"), status: markets.length ? tr("实时", "LIVE") : tr("连接中", "CONNECTING"), body: tr("价格、波动率、资金费率、基差、深度与成交成本。", "Price, volatility, funding, basis, depth, and execution cost.") },
        ].map((item) => { const Icon = item.icon; return <article className={styles.researchCard} key={item.code}><div><Icon /><span>{item.code}</span><em>{item.status}</em></div><h3>{item.title}</h3><p>{item.body}</p><footer><span>source_reliability</span><strong>{item.code === "MARKET" && markets.length ? "0.94" : "—"}</strong></footer></article>; })}
      </div>
      <section className={styles.panel}>
        <div className={styles.sectionTitle}><div><span>EVENT NORMALIZATION</span><h2>{tr("从事件到仓位，要穿过三道门", "An event crosses three gates before it affects position")}</h2></div></div>
        <div className={styles.eventFlow}><div><small>01</small><strong>{tr("原始事件", "Raw event")}</strong><span>{tr("来源 + 时间戳", "source + timestamp")}</span></div><ChevronRight /><div><small>02</small><strong>{tr("置信度评分", "Confidence score")}</strong><span>{tr("可靠度 × 新鲜度", "reliability × freshness")}</span></div><ChevronRight /><div><small>03</small><strong>{tr("策略过滤器", "Strategy filter")}</strong><span>{tr("降仓 / 暂停 / 提高门槛", "reduce / pause / raise hurdle")}</span></div></div>
      </section>
    </div>
  );

  const renderStrategies = () => (
    <div className={styles.tabStack}>
      <section className={styles.introBand}><div><span>STRATEGY LAB</span><h2>{tr("策略只输出统一 Signal，不导入交易所权限", "Strategies output a normalized Signal and never import exchange permission")}</h2></div><p>Freqtrade / Jesse → Signal Contract → Portfolio Allocator</p></section>
      <section className={styles.panel}>
        <div className={styles.sectionTitle}><div><span>MANUAL STRATEGIES</span><h2>{tr("普通策略区", "Manual strategies")}</h2></div><span className={styles.engineBadge}>{tr("人工确认执行", "Manual confirmation")}</span></div>
        <p className={styles.controlNote}>{tr("研究配置展示，不自动下单。下方普通策略手动提交后，须通过独立风控并人工确认执行；保护参数为价格止损 1.5%、止盈 3%。", "Research configuration only; no automatic orders. Manual submissions require independent risk approval and explicit execution confirmation. Price stop-loss: 1.5%; take-profit: 3%.")}</p>
        <div className={styles.strategyTable}>
          <div className={styles.strategyHeader}><span>{tr("策略", "Strategy")}</span><span>{tr("研究引擎", "Research engine")}</span><span>{tr("目标权重", "Target weight")}</span><span>{tr("信号", "Signal")}</span><span>{tr("风险预算", "Risk budget")}</span><span>{tr("状态", "State")}</span></div>
          {strategyRows.map((strategy) => <div className={styles.strategyRow} key={strategy.id}><span><b>{strategy[language === "zh" ? "zh" : "en"]}</b><small>{strategy.code}</small></span><span><em className={styles.engineBadge}>{strategy.engine}</em></span><span><strong>{strategy.weight}%</strong></span><span className={strategy.signal.startsWith("+") ? styles.positive : ""}>{strategy.signal}</span><span>{strategy.risk}</span><span><button type="button" className={`${styles.switch} ${enabledStrategies[strategy.id] ? styles.switchOn : ""}`} onClick={() => setEnabledStrategies((current) => ({ ...current, [strategy.id]: !current[strategy.id] }))} aria-label={tr(`切换 ${strategy.zh} 研究预览`, `Toggle ${strategy.en} research preview`)} aria-pressed={enabledStrategies[strategy.id]}><i /></button></span></div>)}
        </div>
      </section>
      <section className={`${styles.panel} ${styles.intentPanel}`}>
        <div className={styles.sectionTitle}><div><span>ORDER INTENT</span><h2>{tr("把一次信号跑完整条控制链", "Run one signal through the entire control chain")}</h2></div><span className={styles.modeTag}>{canOperate ? actualMode.toUpperCase() : `PREVIEW · ${actualMode.toUpperCase()}`}</span></div>
        <form className={styles.intentForm} onSubmit={createIntent}>
          <label><span>{tr("交易对", "Symbol")}</span><select aria-label={tr("普通策略交易对", "Manual strategy pair")} value={intent.symbol} onChange={(event) => setIntent((current) => ({ ...current, symbol: event.target.value }))}>{TIDESIGHT_FEATURED_MARKETS.map((item) => <option key={item.symbol} value={item.symbol}>{item.asset} / USDT</option>)}</select></label>
          <label><span>{tr("方向", "Side")}</span><select value={intent.side} onChange={(event) => setIntent((current) => ({ ...current, side: event.target.value as "LONG" | "SHORT" }))}><option value="LONG">LONG</option><option value="SHORT">SHORT</option></select></label>
          <label><span>{tr("杠杆", "Leverage")}</span><input type="number" min="1" max={config.maxLeverage} value={intent.leverage} onChange={(event) => setIntent((current) => ({ ...current, leverage: Number(event.target.value) }))} /></label>
          <label><span>{tr("单笔风险", "Risk / trade")}</span><div className={styles.inputSuffix}><input type="number" min="0.1" max="1.5" step="0.05" value={intent.riskPct} onChange={(event) => setIntent((current) => ({ ...current, riskPct: Number(event.target.value) }))} /><i>%</i></div></label>
          <label><span>TideSight Score</span><input type="number" min="0" max="100" value={intent.tideSightScore} onChange={(event) => setIntent((current) => ({ ...current, tideSightScore: Number(event.target.value) }))} /></label>
          <button type="submit" disabled={busy === "intent"}><ShieldCheck />{busy === "intent" ? tr("风控计算中", "Evaluating") : tr("生成待确认计划", "Create pending plan")}</button>
        </form>
        {intentResult ? <div className={`${styles.intentResult} ${intentResult.ok ? styles.intentApproved : styles.intentRejected}`}><div><span>{intentResult.ok ? <Check /> : <TriangleAlert />}</span><div><small>RISK ENGINE DECISION</small><h3>{intentResult.decision}</h3></div></div>{intentResult.executionPlan ? <dl><div><dt>Plan ID</dt><dd>{intentResult.executionPlan.planId}</dd></div><div><dt>{tr("名义仓位", "Notional")}</dt><dd>{formatMoney(intentResult.executionPlan.risk.notional)}</dd></div><div><dt>{tr("风险金额", "Risk amount")}</dt><dd>{formatMoney(intentResult.executionPlan.risk.riskAmount)}</dd></div><div><dt>R / R</dt><dd>1 : {intentResult.executionPlan.risk.riskRewardRatio}</dd></div></dl> : null}{intentResult.violations?.length ? <ul>{intentResult.violations.map((item) => <li key={item.code}><b>{item.code}</b>{item.message}</li>)}</ul> : null}{intentResult.executionPlan && canOperate ? <button type="button" onClick={executeApprovedPlan} disabled={busy === "execute"}><Play />{busy === "execute" ? tr("提交中", "Submitting") : tr("人工确认并执行", "Confirm and execute")}</button> : null}</div> : null}
      </section>
      <TideSightAutoStrategies language={language} config={config} canConfigure={canUnlockLive} canOperate={canOperate} onChanged={() => loadSnapshot(true)} />
    </div>
  );

  const renderAllocator = () => (
    <div className={styles.tabStack}>
      <section className={styles.introBand}><div><span>PORTFOLIO ALLOCATOR</span><h2>{tr("先决定目标仓位，再决定订单", "Decide target positions before orders")}</h2></div><p>{tr("Allocator 合并策略评分，执行相关性、波动率和流动性约束，输出可解释的目标仓位。", "The Allocator combines strategy scores, then applies correlation, volatility, and liquidity constraints to produce explainable targets.")}</p></section>
      <div className={styles.allocatorGrid}>
        <section className={`${styles.panel} ${styles.allocationPanel}`}><div className={styles.panelHead}><div><span>TARGET BOOK</span><h2>{tr("目标风险分配", "Target risk allocation")}</h2></div><Layers3 /></div><div className={styles.allocationBars}>{strategyRows.map((row) => <div key={row.id}><span><b>{row[language === "zh" ? "zh" : "en"]}</b><em>{row.weight}%</em></span><i><b style={{ width: `${row.weight * 2}%` }} /></i></div>)}</div></section>
        <section className={styles.panel}><div className={styles.panelHead}><div><span>CONSTRAINTS</span><h2>{tr("组合约束", "Portfolio constraints")}</h2></div><SlidersHorizontal /></div><dl className={styles.constraintList}><div><dt>{tr("总敞口上限", "Gross exposure cap")}</dt><dd>{config.maxPortfolioExposurePct}%</dd></div><div><dt>{tr("最大活动仓位", "Max active positions")}</dt><dd>{config.maxOpenPositions}</dd></div><div><dt>{tr("相关性上限", "Correlation ceiling")}</dt><dd>0.72</dd></div><div><dt>{tr("现金缓冲下限", "Cash reserve floor")}</dt><dd>25%</dd></div><div><dt>{tr("再平衡门槛", "Rebalance threshold")}</dt><dd>3%</dd></div></dl></section>
      </div>
    </div>
  );

  const renderRisk = () => (
    <div className={styles.tabStack}>
      <section className={`${styles.introBand} ${styles.riskIntro}`}><div><span>FINAL VETO</span><h2>{tr("Risk Engine 对所有策略拥有最终否决权", "Risk Engine has final veto over every strategy")}</h2></div><ShieldCheck /></section>
      <TideSightRiskEditor language={language} key={snapshot ? "loaded" : "default"} config={config} canOperate={canOperate && Boolean(snapshot)} onChanged={() => loadSnapshot(true)} />
      <div className={styles.riskGrid}>
        {[
          [tr("单笔风险", "Risk per trade"), `${config.riskPerTradePct}%`, tr("硬上限 1.5%", "Hard cap 1.5%")],
          [tr("组合敞口", "Portfolio exposure"), `${config.maxPortfolioExposurePct}%`, tr("超过即拒绝增仓", "Reject new exposure above")],
          [tr("日损失熔断", "Daily loss breaker"), `-${config.dailyLossLimitPct}%`, tr("触发后只许减仓", "Reduce-only after trigger")],
          [tr("最大杠杆", "Max leverage"), `${config.maxLeverage}×`, tr("建议实盘 ≤ 1.5×", "Live recommendation ≤ 1.5×")],
          [tr("信号最低分", "Minimum signal score"), `${config.minTideSightScore}`, tr("低于阈值直接拒绝", "Reject below threshold")],
          [tr("去重窗口", "Dedupe window"), `${config.dedupeWindowMinutes}m`, tr("幂等 + 状态未知保护", "Idempotency + unknown-state guard")],
        ].map(([title, value, note]) => <article className={styles.riskCard} key={title}><span>{title}</span><strong>{value}</strong><p>{note}</p><i /></article>)}
      </div>
      <section className={styles.panel}><div className={styles.sectionTitle}><div><span>FAIL CLOSED</span><h2>{tr("任一事实不可确认，就停止新增风险", "If any fact is uncertain, stop adding risk")}</h2></div></div><div className={styles.failGrid}>{[tr("行情时间戳过期", "Stale market timestamp"), tr("余额读取失败", "Balance read failure"), tr("持仓无法对账", "Position mismatch"), tr("交易所状态异常", "Exchange degraded"), tr("保护单不完整", "Protection incomplete"), tr("订单状态未知", "Order state unknown")].map((item) => <div key={item}><CircleStop /><span>{item}</span><strong>VETO</strong></div>)}</div></section>
    </div>
  );

  const renderExecution = () => {
    const matchingCredential = snapshot?.credentials.find((item) => item.environment.toLowerCase() === credential.environment && item.market.toLowerCase() === credential.market);
    return (
      <div className={styles.tabStack}>
        <section className={styles.introBand}><div><span>SINGLE EXECUTION CHANNEL</span><h2>{tr("Hummingbot / CCXT 只能位于 Risk Engine 之后", "Hummingbot / CCXT belongs only after the Risk Engine")}</h2></div><p>{tr("TideSight 使用独立 Binance 执行器、凭据和审计，不读取或修改 Alpha Radar 配置。首次使用须单独配置专用子账户并解锁。", "TideSight owns isolated Binance credentials, execution policies and records. Configure a dedicated subaccount and unlock it separately.")}</p></section>
        {!canOperate ? <section className={`${styles.panel} ${styles.accessPanel}`}><LockKeyhole /><div><span>OPERATOR ACCESS</span><h2>{signedIn ? tr("当前账户未开放执行控制", "Execution control is not enabled for this account") : tr("登录后连接执行账户", "Sign in to connect an execution account")}</h2><p>{tr("公开页面可查看产品与运行 PAPER 预览；持久化计划与凭据仅向 Max / 管理员开放，LIVE 只允许通过 2FA 的管理员显式解锁。", "The public page supports PAPER exploration. Persisted plans and credentials require Max or admin access; LIVE requires explicit unlock by a 2FA admin.")}</p></div><Link href={signedIn ? "/account/subscription" : "/login?next=%2Ftidesight-quant"}>{signedIn ? tr("查看 Max 权限", "View Max access") : tr("登录 / 注册", "Sign in")}</Link></section> : <>
          <div className={styles.executionGrid}>
            <section className={styles.panel}>
              <div className={styles.panelHead}><div><span>EXCHANGE ADAPTER</span><h2>{tr("凭据与连接预检", "Credentials & preflight")}</h2></div><KeyRound /></div>
              <div className={styles.environmentToggle}><button type="button" className={styles.liveActive} disabled={!canUnlockLive}>PRODUCTION LIVE</button></div>
              <form className={styles.credentialForm} onSubmit={saveCredential} autoComplete="off">
                <label><span>MARKET / ACCOUNT ROUTING</span><select value={credential.market} onChange={(event) => setCredential((current) => ({ ...current, market: event.target.value as "spot" | "futures" }))}><option value="futures">USDⓈ-M · PAPI / FAPI AUTO</option></select></label>
                <label><span>API KEY</span><input type="password" value={credential.apiKey} onChange={(event) => setCredential((current) => ({ ...current, apiKey: event.target.value }))} placeholder={matchingCredential?.apiKeyHint ?? "••••••••••••"} minLength={8} required /></label>
                <label><span>API SECRET</span><input type="password" value={credential.apiSecret} onChange={(event) => setCredential((current) => ({ ...current, apiSecret: event.target.value }))} placeholder="••••••••••••" minLength={8} required /></label>
                <label><span>{tr("代理（可选）", "Proxy (optional)")}</span><input value={credential.proxy} onChange={(event) => setCredential((current) => ({ ...current, proxy: event.target.value }))} placeholder="http://127.0.0.1:7890" /></label>
                <label className={styles.checkControl}><input type="checkbox" required checked={dedicatedAccount} onChange={(event) => setDedicatedAccount(event.target.checked)} /><span>{tr("确认使用 TideSight 专用子账户；不共用 Alpha Radar 的资金及仓位", "I confirm this is a TideSight-only subaccount, with no funds or positions shared with Alpha Radar.")}</span></label>
                <button type="submit" disabled={busy === "credential" || !dedicatedAccount}><LockKeyhole />{busy === "credential" ? tr("加密保存中", "Encrypting") : tr("加密保存凭据", "Encrypt credentials")}</button>
              </form>
              <div className={styles.connectionStatus}><span><i className={matchingCredential?.verifiedAt ? styles.online : ""} />{matchingCredential?.verifiedAt ? tr("已验证", "VERIFIED") : matchingCredential ? tr("待预检", "PREFLIGHT REQUIRED") : tr("未配置", "NOT CONFIGURED")}</span>{matchingCredential?.lastError ? <p>{matchingCredential.lastError}</p> : null}</div>
              <p className={styles.liveRequirement}>{tr("统一账户自动识别 enablePortfolioMarginTrading，使用 PAPI；普通合约使用 FAPI。现货/杠杆权限不等于合约权限。", "Unified accounts use enablePortfolioMarginTrading and PAPI; classic futures use FAPI. Spot/margin permission is not futures permission.")}</p>
              {matchingCredential?.verifiedAt && matchingCredential.permissionSummary?.accountMode ? <div className={styles.connectionStatus} aria-label="Verified account routing"><span>{matchingCredential.permissionSummary.accountMode === "portfolio" ? tr("PAPI · 统一保证金 · 专用 USDT UM", "PAPI · Portfolio Margin · Dedicated USDT UM") : tr("FAPI · 普通合约 · 逐仓", "FAPI · Classic Futures · Isolated")}</span>{matchingCredential.permissionSummary.portfolioMargin ? <span>uniMMR {formatNumber(matchingCredential.permissionSummary.portfolioMargin.uniMMR)} / {tr("最低缓冲", "minimum buffer")} {matchingCredential.permissionSummary.portfolioMargin.minUniMMR} · {tr("折算权益", "Collateral equity")} {formatMoney(matchingCredential.permissionSummary.portfolioMargin.collateralEquity, "USD")}</span> : null}</div> : null}
              <p className={styles.liveRequirement}>{tr("PAPI 使用账户级共享保证金，不是逐仓。TideSight 不借币、不划转、不交易 COIN-M；发现混用仓位、借款或负余额时停止新增风险。平仓与保护单仍通过 PAPI 执行。", "PAPI uses account-wide shared collateral, not isolated margin. TideSight does not borrow, transfer funds or trade COIN-M. Mixed positions, debt or negative balances block new exposure; exits and protection remain on PAPI.")}</p>
              <div className={styles.actionRow}><button type="button" onClick={preflight} disabled={busy === "preflight" || !matchingCredential}><Cable />{tr("连接与权限预检", "Run preflight")}</button><button type="button" onClick={reconcile} disabled={busy === "reconcile" || !matchingCredential}><RefreshCw />{tr("健康对账", "Reconcile")}</button></div>
            </section>
            <section className={styles.panel}>
              <div className={styles.panelHead}><div><span>RUNTIME GATES</span><h2>{tr("生产门禁", "Production gates")}</h2></div><ShieldCheck /></div>
              <div className={styles.gateList}>
                <div className={matchingCredential?.verifiedAt ? styles.gateOk : ""}><span>{tr("凭据预检", "Credential preflight")}</span><strong>{matchingCredential?.verifiedAt ? "PASS" : "WAIT"}</strong></div>
                <div className={config.reconciliationHealthy ? styles.gateOk : styles.gateBad}><span>{tr("对账健康", "Reconciliation health")}</span><strong>{config.reconciliationHealthy ? "PASS" : "VETO"}</strong></div>
                <div className={config.requireProtectionOrders ? styles.gateOk : styles.gateBad}><span>{tr("保护单强制", "Protection required")}</span><strong>{config.requireProtectionOrders ? "PASS" : "VETO"}</strong></div>
                <div className={!config.killSwitchActive ? styles.gateOk : styles.gateBad}><span>KILL SWITCH</span><strong>{config.killSwitchActive ? "ACTIVE" : "READY"}</strong></div>
                <div className={canUnlockLive ? styles.gateOk : ""}><span>2FA ADMIN</span><strong>{canUnlockLive ? "PASS" : "WAIT"}</strong></div>
              </div>
              <div className={styles.killBox}><TriangleAlert /><div><strong>KILL SWITCH</strong><p>{tr("停止新增风险、撤销待执行计划，并处置可识别持仓。", "Stop new risk, cancel pending plans, and handle recognized positions.")}</p></div><button type="button" onClick={triggerKillSwitch} disabled={busy === "kill"}>TRIGGER</button></div>
            </section>
          </div>
          <section className={`${styles.panel} ${styles.livePanel}`}>
            <div className={styles.sectionTitle}><div><span>LIVE TRADING LOCK</span><h2>{config.liveUnlocked ? tr("生产实盘当前已解锁", "Production live is currently unlocked") : tr("生产实盘保持双重加锁", "Production live remains double-locked")}</h2></div><span className={config.liveUnlocked ? styles.liveUnlocked : styles.liveLocked}>{config.liveUnlocked ? "LIVE UNLOCKED" : "LIVE LOCKED"}</span></div>
            {config.liveUnlocked ? <button className={styles.lockButton} type="button" onClick={lockLive} disabled={busy === "lock-live"}><LockKeyhole />{tr("重新加锁并回退 PAPER", "Relock and return to PAPER")}</button> : canUnlockLive ? <div className={styles.unlockGrid} role="group" aria-label={tr("生产实盘协议确认", "Live trading agreements")}>
              <label className={styles.checkControl}><input type="checkbox" checked={unlock.realFunds} onChange={(event) => setUnlock((current) => ({ ...current, realFunds: event.target.checked }))} /><span>{tr("我确认这会使用真实资金，并接受风险额度限制", "I acknowledge real funds and risk limits")}</span></label>
              <label className={styles.checkControl}><input type="checkbox" checked={unlock.noWithdraw} onChange={(event) => setUnlock((current) => ({ ...current, noWithdraw: event.target.checked }))} /><span>{tr("我确认 API Key 未开启提现权限", "I confirm the API key has no withdrawal permission")}</span></label>
              <button type="button" onClick={unlockLive} disabled={busy === "unlock" || !unlock.realFunds || !unlock.noWithdraw}><KeyRound />{tr("显式解锁生产实盘", "Explicitly unlock live")}</button>
            </div> : <p className={styles.liveRequirement}>{tr("只有已启用并通过 2FA 的管理员会话可以解锁 LIVE。其他授权账户仅使用 PAPER。", "Only an admin session with verified 2FA can unlock LIVE. Other eligible accounts remain on PAPER.")}</p>}
            <p className={styles.liveRequirement}>{tr("TideSight 要求交易所确认提现关闭；IP 白名单建议启用，但不作为平台预检或解锁限制。交易所自身的权限要求仍需满足。", "TideSight requires exchange-confirmed withdrawals disabled. An IP allowlist is recommended, not required by TideSight preflight or unlock. Exchange permission requirements still apply.")}</p>
            {config.liveUnlocked || config.autoExecuteEnabled ? <TideSightAutoControl language={language} config={config} canStart={canUnlockLive} onChanged={() => loadSnapshot(true)} /> : null}
          </section>
        </>}
      </div>
    );
  };

  const renderBacktest = () => (
    <div className={styles.tabStack}>
      <section className={styles.introBand}><div><span>HFTBACKTEST VALIDATION</span><h2>{tr("不是只回测策略收益，而是重放成交现实", "Backtest execution reality, not only strategy return")}</h2></div><p>{tr("三条权益曲线分别回答：机会是否存在、真实成本后是否可做、极端状态下会不会失控。", "Three equity curves answer whether the edge exists, survives execution costs, and remains controlled under stress.")}</p></section>
      <div className={styles.validationGrid}>
        {[
          { n: "01", title: tr("理论曲线", "Theoretical curve"), badge: "VECTOR", dd: "-4.8%", note: tr("无摩擦机会筛查", "Frictionless edge screen") },
          { n: "02", title: tr("可执行曲线", "Executable curve"), badge: "L2 REPLAY", dd: "-8.6%", note: tr("费用、滑点、延迟、部分成交", "Fees, slippage, latency, partial fills") },
          { n: "03", title: tr("压力曲线", "Stress curve"), badge: "FAILURE INJECTION", dd: "-13.2%", note: tr("断线、单腿、基差扩张、费率反转", "Outage, naked leg, basis shock, funding flip") },
        ].map((item) => <article className={styles.validationCard} key={item.n}><small>{item.n}</small><span>{item.badge}</span><h3>{item.title}</h3><div><em>MAX DRAWDOWN</em><strong>{item.dd}</strong></div><p>{item.note}</p><button type="button" onClick={() => setNotice({ tone: "warn", text: tr("这是验证基线设计，不是未经数据支持的历史业绩声明。接入逐笔数据后才生成正式报告。", "This is a validation baseline, not an unsupported performance claim. Formal reports require trade-level data.") })}>{tr("查看验证口径", "View methodology")}<ChevronRight /></button></article>)}
      </div>
      <section className={styles.panel}><div className={styles.sectionTitle}><div><span>ACCEPTANCE GATES</span><h2>{tr("从研究走向小额实盘的硬门槛", "Hard gates from research to small live capital")}</h2></div></div><div className={styles.acceptanceGrid}>{["No look-ahead", "Walk-forward OOS", "L2 partial fills", "Margin model", "Failure injection", "Paper / live drift"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong><em>{index < 2 ? "PASS REQUIRED" : "EVIDENCE REQUIRED"}</em></div>)}</div></section>
    </div>
  );

  const renderAudit = () => {
    const auditRows = snapshot?.audits.slice(0, 12) ?? [];
    return <div className={styles.tabStack}><section className={styles.introBand}><div><span>POSTGRESQL FACT LEDGER</span><h2>{tr("每一笔订单都能回到原始信号和风控快照", "Every order traces back to its signal and risk snapshot")}</h2></div><p>Order → Risk Decision → Target Position → Signal → Strategy Version → Data Version</p></section><section className={styles.panel}><div className={styles.auditTimeline}>{auditRows.length ? auditRows.map((row) => <div key={row.id}><i className={row.status === "ERROR" ? styles.auditError : row.status === "WARNING" ? styles.auditWarn : ""} /><time>{new Date(row.createdAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US")}</time><span>{row.state}</span><strong>{row.message}</strong><em>{row.status}</em></div>) : <><div><i /><time>CONTROL PLANE</time><span>NORMALIZED</span><strong>{tr("统一信号契约已就绪", "Normalized signal contract is ready")}</strong><em>READY</em></div><div><i /><time>RISK ENGINE</time><span>FAIL CLOSED</span><strong>{tr("行情、余额、对账或保护状态不确定时拒绝增仓", "Reject exposure when market, balance, reconciliation, or protection state is uncertain")}</strong><em>ACTIVE</em></div><div><i /><time>EXECUTION</time><span>SINGLE WRITER</span><strong>{tr("策略层不拥有交易所下单权限", "Strategy layer does not own exchange order permission")}</strong><em>ENFORCED</em></div></>}</div></section><section className={styles.contractBand}><TerminalSquare /><div><span>STRATEGY WEBHOOK CONTRACT</span><code>POST /api/tidesight/signals</code><p>{tr("使用 WELINKBTC API Key 接入 Freqtrade / Jesse。外部 Key 永远不能创建 LIVE 意图。", "Connect Freqtrade / Jesse with a WELINKBTC API key. External keys can never create a LIVE intent.")}</p></div><a href="/api/tidesight/signals" target="_blank" rel="noreferrer">GET CONTRACT <ChevronRight /></a></section></div>;
  };

  const content = activeTab === "overview" ? renderOverview()
    : activeTab === "macd" ? <TideSightMacdBoard language={language} standalone />
    : activeTab === "research" ? renderResearch()
      : activeTab === "strategies" ? renderStrategies()
        : activeTab === "allocator" ? renderAllocator()
          : activeTab === "risk" ? renderRisk()
            : activeTab === "execution" ? renderExecution()
              : activeTab === "backtest" ? renderBacktest()
                : renderAudit();

  return (
    <main className={styles.page} data-native-i18n="react">
      <div className={styles.ambient} aria-hidden="true"><i /><i /><i /></div>
      <section className={styles.productHeader}>
        <div className={styles.brandBlock}>
          <div className={styles.tideMark} aria-hidden="true"><Waves /><i /><b /></div>
          <div><span>WELINKBTC · QUANT SYSTEMS</span><h1>{tr("观潮量化", "TideSight Quant")}<em>{language === "zh" ? " TideSight Quant" : ""}</em></h1><p>{tr("观市场之势，行系统之策。", "See the trend. Execute with discipline.")}</p></div>
        </div>
        <div className={styles.headerControls}>
          <div className={styles.operatorState}><i className={canOperate ? styles.online : ""} /><span>{canOperate ? operatorLabel ?? "OPERATOR" : tr("公开预览", "PUBLIC PREVIEW")}</span><small>{canOperate ? "CONTROL PLANE CONNECTED" : "PAPER UI · NO CREDENTIALS"}</small></div>
          <button type="button" className={styles.refreshButton} onClick={() => { if (activeTab === "overview") void loadMarket(); void loadSnapshot(); }} disabled={busy === "snapshot"} aria-label={tr("刷新状态", "Refresh status")}><RefreshCw className={busy === "snapshot" ? styles.spinning : ""} /></button>
        </div>
      </section>

      <section className={styles.modeBar} aria-label={tr("执行环境", "Execution environment")}>
        <div><span>{tr("执行环境", "EXECUTION ENVIRONMENT")}</span>{(["paper", "live"] as TideSightMode[]).map((mode) => <button type="button" key={mode} className={`${actualMode === mode ? styles.modeActive : ""} ${mode === "live" ? styles.modeLive : ""}`} onClick={() => void selectMode(mode)} disabled={busy === "mode"}>{mode.toUpperCase()}{mode === "live" && !config.liveUnlocked ? <LockKeyhole /> : null}</button>)}</div>
        <p><ShieldCheck />{tr("默认 PAPER · 实盘需管理员 2FA、提现关闭、健康对账与协议确认解锁 · IP 白名单建议启用，非必需", "PAPER by default · live requires admin 2FA, no withdrawals, healthy reconciliation and agreement confirmation · IP allowlist recommended, not required")}</p>
      </section>

      {notice ? <div className={`${styles.notice} ${styles[`notice_${notice.tone}`]}`} role="status"><span>{notice.tone === "ok" ? <Check /> : <TriangleAlert />}</span><p>{notice.text}</p><button type="button" aria-label={tr("关闭提示", "Dismiss notice")} onClick={() => setNotice(null)}>×</button></div> : null}

      <div className={styles.workspace}>
        <aside className={styles.sidebar}>
          <span className={styles.sidebarLabel}>{tr("控制平面", "CONTROL PLANE")}</span>
          <nav aria-label={tr("观潮量化模块", "TideSight modules")}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const contents = <><Icon /><span>{item[language]}</span><i /></>;
              return item.href
                ? <Link key={item.id} href={item.href} className={activeTab === item.id ? styles.navActive : ""} aria-current={activeTab === item.id ? "page" : undefined}>{contents}</Link>
                : <button type="button" key={item.id} className={activeTab === item.id ? styles.navActive : ""} aria-current={activeTab === item.id ? "page" : undefined} onClick={() => setActiveTab(item.id)}>{contents}</button>;
            })}
          </nav>
          <div className={styles.sidebarFoot}><span><i className={config.killSwitchActive ? styles.dangerDot : styles.online} />{config.killSwitchActive ? "KILL SWITCH ACTIVE" : "RISK ENGINE READY"}</span><small>TSQ CONTROL / V1.0</small></div>
        </aside>
        <div className={styles.content}>{content}</div>
      </div>
    </main>
  );
}
