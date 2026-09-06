"use client";

import { useEffect, useState } from "react";
import { Play, ShieldCheck, Square, TriangleAlert } from "lucide-react";
import { TIDESIGHT_AUTO_STRATEGIES } from "@/lib/tidesight/automatic-strategies";
import styles from "./tidesight-quant-surface.module.css";

type Language = "zh" | "en";
type LocalizedMessage = { zh: string; en: string } | string;
const translate = (language: Language) => (zh: string, en: string) => language === "zh" ? zh : en;
const messageText = (message: LocalizedMessage, language: Language) => typeof message === "string" ? message : message[language];
const dateText = (value: string, language: Language) => new Date(value).toLocaleString(language === "zh" ? "zh-CN" : "en-US");
export type AutomationConfig = {
  autoExecuteEnabled: boolean;
  autoStopLossPct: number | null;
  autoTakeProfitPct: number | null;
  autoHeartbeatAt: string | null;
  autoError: string | null;
  liveUnlocked: boolean;
};
type AutoEvent = { id: string; symbol: string; strategyId: string; interval: string; closedAt: string; status: string; message: string | null };
async function request(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

export function TideSightAutoStrategies({ canConfigure, canOperate, config, onChanged, language = "zh" }: { canConfigure: boolean; canOperate: boolean; config: AutomationConfig; onChanged: () => Promise<void>; language?: Language }) {
  const tr = translate(language);
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<LocalizedMessage>("");
  const [events, setEvents] = useState<AutoEvent[]>([]);
  useEffect(() => {
    if (!canOperate) return;
    let disposed = false;
    const load = async () => {
      try { const data = await request("/api/tidesight/automation", "GET"); if (!disposed) setEvents(data.events); }
      catch (error) { if (!disposed) setMessage(error instanceof Error ? error.message : { zh: "读取失败", en: "Could not load execution history." }); }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [canOperate]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await request("/api/tidesight/automation", "PATCH", { stopLossPct: Number(stop), takeProfitPct: Number(target), acknowledgeProtection: confirmed });
      await onChanged(); setConfirmed(false);
      setMessage({ zh: "保护参数已保存。自动开仓保持关闭，请到执行与接入页显式启动。", en: "Protection saved. Automatic entries remain off; explicitly start them on the Execution page." });
    } catch (error) { setMessage(error instanceof Error ? error.message : { zh: "保存失败", en: "Could not save settings." }); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel} aria-label={tr("自成交策略区", "Automatic strategies")}>
    <div className={styles.sectionTitle}><div><span>MACD AUTOMATIC STRATEGIES</span><h2>{tr("自成交策略区", "Automatic strategies")}</h2></div><span className={styles.engineBadge}>{config.autoExecuteEnabled ? tr("运行中", "RUNNING") : tr("OFF · 默认关闭", "OFF · Disabled by default")}</span></div>
    <p className={styles.controlNote}>{tr("这里的“自成交”指信号驱动自动交易，不是自买自卖。12 个标的共用以下六套规则；仅已收盘 K 线的新交叉触发，普通黄金交叉不触发。", "Automatic execution means signal-driven trading, not self-trading. These six rules cover 12 assets and trigger only on new closed-candle crosses. Ordinary golden crosses do not trigger orders.")}</p>
    <div className={styles.autoStrategyGrid}>{TIDESIGHT_AUTO_STRATEGIES.map((rule, index) => <article className={styles.autoStrategyCard} key={rule.id}>
      <small>0{index + 1} · {rule.id}</small>
      <h3>{tr(rule.timeframe, { "1d": "Daily", "1h": "1 Hour", "15m": "15 Minutes" }[rule.interval])} · {rule.side === "SHORT" ? tr("死亡黄金十字交叉", "Death cross") : tr("重生黄金十字交叉", "Rebirth golden cross")}</h3>
      <div><strong className={rule.side === "LONG" ? styles.positive : styles.negative}>{rule.side}</strong><b>{rule.leverage}×</b></div>
      <dl><div><dt>{tr("交易对", "Pair")}</dt><dd>{tr("当前信号标的 / USDT", "Signal asset / USDT")}</dd></div><div><dt>{tr("单笔净值风险上限", "Equity risk / trade")}</dt><dd>{rule.riskPct}%</dd></div><div><dt>{tr("目标名义仓位上限", "Target notional cap")}</dt><dd>{rule.notional} USDT</dd></div></dl>
    </article>)}</div>
    <div className={styles.autoProtection}>
      <h3>{tr("自动策略保护单 · 必须先确认", "Order protection · Confirmation required")}</h3>
      <p className={styles.controlNote}>{tr("当前配置：价格止损", "Current price stop-loss:")} {config.autoStopLossPct == null ? tr("未设置", "Not set") : `${config.autoStopLossPct}%`} / {tr("止盈", "Take-profit:")} {config.autoTakeProfitPct == null ? tr("未设置", "Not set") : `${config.autoTakeProfitPct}%`}。</p>
      <p className={styles.controlNote}>{tr("风险百分比是账户净值风险上限，不是价格止损距离。规则名义仓位是目标上限；自动信号会按单笔风险、单笔/单日/组合剩余额度与可用保证金取最小值，只会安全下调、不会放大。下调后不足交易所最小名义仓位仍会拒绝；数量按交易所精度向下取整。", "The risk percentage caps account equity at risk; it is not the price stop distance. Rule notional is a target cap. Automatic signals use the minimum of trade risk, per-order/daily/portfolio headroom and available margin, so size may be reduced but never increased. The signal is still rejected below exchange minimum notional, and quantity is rounded down to exchange precision.")}</p>
      {canConfigure ? <form onSubmit={save} className={styles.controlForm}>
        <label><span>{tr("价格止损距离 %", "Price stop-loss distance %")}</span><input aria-label={tr("自动策略价格止损距离", "Automatic strategy stop-loss distance")} required type="number" min="0.25" max="3.19" step="0.01" value={stop} onChange={(event) => setStop(event.target.value)} placeholder={tr("需明确设置", "Set explicitly")} /></label>
        <label><span>{tr("价格止盈距离 %", "Price take-profit distance %")}</span><input aria-label={tr("自动策略价格止盈距离", "Automatic strategy take-profit distance")} required type="number" min="0.375" max="50" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} placeholder={tr("至少为止损的 1.5 倍", "At least 1.5 × stop-loss")} /></label>
        <label className={styles.checkControl}><input type="checkbox" required checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{tr("我确认六套自动策略采用上述保护参数；保存会停止自动开仓", "I confirm these protection settings for all six strategies. Saving stops automatic entries.")}</span></label>
        <button type="submit" disabled={busy || !confirmed}><ShieldCheck />{busy ? tr("保存中…", "Saving…") : tr("确认并保存保护参数", "Confirm and save protection")}</button>
      </form> : <p className={styles.controlNote}>{tr("保护参数由已通过 2FA 的管理员独立设置。", "Protection must be configured by an administrator with verified 2FA.")}</p>}
    </div>
    <p className={styles.controlNote}>{tr("服务端每轮结束后约 30 秒再检查；正常情况下在收盘后约一分钟内识别，不是逐笔实时交易。停机、延迟或超过 120 秒的新信号会跳过，不补追历史仓位。25× 杠杆风险很高，止损也不能保证成交价格或限定最终损失。", "The server checks again about 30 seconds after each cycle, normally identifying crosses within a minute of candle close. This is not tick-by-tick execution. Signals older than 120 seconds are skipped, with no historical catch-up. 25× leverage is high risk; stop-loss orders cannot guarantee execution prices or cap final losses.")}</p>
    {message ? <p role="status" className={styles.controlMessage}>{messageText(message, language)}</p> : null}
    {canOperate ? <div className={styles.autoEvents}><h3>{tr("自动信号执行记录", "Automatic execution history")}</h3>{events.length ? events.map((event) => <article key={event.id}><strong>{event.symbol} · {event.interval}</strong><span>{event.status}</span><time>{dateText(event.closedAt, language)}</time><p>{event.message ? <>{tr("原始执行记录：", "Original execution message: ")}{event.message}</> : tr("已持久化认领；等待处理或对账，不重复下单", "Persistently claimed; awaiting processing or reconciliation without duplicate orders.")}</p></article>) : <p className={styles.controlNote}>{tr("暂无记录。启动不会追单历史信号；拒绝、提交和待对账结果均在此保留。", "No records yet. Starting does not replay historical signals. Rejections, submissions and pending reconciliation appear here.")}</p>}</div> : null}
  </section>;
}

export function TideSightAutoControl({ config, canStart, onChanged, language = "zh" }: { config: AutomationConfig; canStart: boolean; onChanged: () => Promise<void>; language?: Language }) {
  const tr = translate(language);
  const [open, setOpen] = useState(false);
  const [funds, setFunds] = useState(false), [dedicated, setDedicated] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<LocalizedMessage>("");
  const configured = config.autoStopLossPct != null && config.autoTakeProfitPct != null;
  const eligible = canStart && config.liveUnlocked && configured && !config.autoExecuteEnabled;
  const stale = config.autoExecuteEnabled && (!config.autoHeartbeatAt || Date.now() - Date.parse(config.autoHeartbeatAt) > 180_000);
  function resetConsent() { setOpen(false); setFunds(false); setDedicated(false); }
  useEffect(() => {
    if (!eligible) { setOpen(false); setFunds(false); setDedicated(false); }
  }, [eligible]);
  async function change(enable: boolean) {
    if (busy || (enable && (!eligible || !funds || !dedicated))) return;
    setBusy(true); setMessage("");
    try {
      await request("/api/tidesight/automation", enable ? "POST" : "DELETE", enable ? { acknowledgeRealFunds: funds, acknowledgeDedicatedAccount: dedicated } : undefined);
      resetConsent(); await onChanged();
      setMessage(enable
        ? { zh: "服务端自动监控已启动，只消费启动后的新信号。", en: "Server monitoring started. Only new signals after activation are consumed." }
        : { zh: "已停止自动开仓；已发送订单不撤回，原有止损/止盈继续生效。", en: "Automatic entries stopped. Submitted orders are not recalled; existing stop-loss and take-profit orders remain active." });
    } catch (error) { setMessage(error instanceof Error ? error.message : { zh: "操作失败", en: "Operation failed." }); }
    finally { setBusy(false); }
  }
  return <section className={styles.autoProtection} aria-label={tr("自成交启动控制", "Automatic execution control")}>
    <div className={styles.sectionTitle}><div><span>AUTOMATIC EXECUTION</span><h3>{tr("自成交启动控制", "Automatic execution control")}</h3></div><span className={styles.engineBadge}>{stale ? tr("心跳过期 · 禁止新仓", "Heartbeat stale · Entries blocked") : config.autoExecuteEnabled ? tr("运行中", "RUNNING") : "OFF"}</span></div>
    <p className={styles.controlNote}>{tr("与普通策略的人工确认分离。启动授权六套 MACD 规则自动开仓，仍须通过独立风险闸门。请使用仅供 TideSight 的交易所子账户；共用资金账户无法做到资金隔离。", "Separate from manual strategy confirmation. Starting authorizes all six MACD rules to open positions, subject to the independent Risk Engine. Use a TideSight-only exchange subaccount; shared funding accounts cannot provide capital isolation.")}</p>
    {config.autoExecuteEnabled ? <button type="button" className={styles.lockButton} disabled={busy} onClick={() => void change(false)}><Square />{tr("停止自成交", "Stop automatic entries")}</button> : <button type="button" className={styles.primaryControl} disabled={!eligible || busy} aria-expanded={open} onClick={() => { resetConsent(); setOpen(!open); }}><Play />{tr("自成交启动按钮", "Start automatic execution")}</button>}
    {!configured ? <p className={styles.controlNote}>{tr("尚未确认止损/止盈，请先到策略实验室设置。", "Confirm stop-loss and take-profit settings in the Strategy Lab first.")}</p> : null}
    {open ? <div className={styles.controlForm} role="group" aria-label={tr("自动交易协议确认", "Automatic trading agreements")}>
      <label className={styles.checkControl}><input type="checkbox" checked={funds} disabled={busy} onChange={(event) => setFunds(event.target.checked)} /><span>{tr("我授权六套策略使用真实资金自动执行，理解最高 25× 杠杆风险", "I authorize all six strategies to trade real funds automatically and understand the risks of up to 25× leverage.")}</span></label>
      <label className={styles.checkControl}><input type="checkbox" checked={dedicated} disabled={busy} onChange={(event) => setDedicated(event.target.checked)} /><span>{tr("这是 TideSight 专用子账户，不与 Alpha Radar 或其他机器人共用仓位", "This is a TideSight-only subaccount, with no positions shared with Alpha Radar or other bots.")}</span></label>
      <div className={styles.confirmActions}><button type="button" disabled={busy} onClick={resetConsent}>{tr("取消", "Cancel")}</button><button type="button" disabled={busy || !eligible || !funds || !dedicated} onClick={() => void change(true)}><TriangleAlert />{busy ? tr("启动中…", "Starting…") : tr("确认授权并启动", "Confirm authorization and start")}</button></div>
    </div> : null}
    <p className={styles.controlNote}>{tr("最近服务心跳：", "Latest service heartbeat: ")}{config.autoHeartbeatAt ? dateText(config.autoHeartbeatAt, language) : tr("尚未启动", "Not started")}</p>
    {config.autoError ? <p role="status" className={styles.controlMessage}>{tr("服务端消息：", "Server message: ")}{config.autoError}</p> : null}
    {message ? <p role="status" className={styles.controlMessage}>{messageText(message, language)}</p> : null}
  </section>;
}

const riskFields = [
  ["riskPerTradePct", "单笔净值风险上限 %", "Equity risk per trade %", 0.1, 1.5, 0.1],
  ["maxLeverage", "最大杠杆 ×", "Maximum leverage ×", 1, 25, 1],
  ["dailyLossLimitPct", "日损失熔断 %", "Daily loss circuit breaker %", 0.5, 3.5, 0.1],
  ["maxPortfolioExposurePct", "组合名义敞口上限 %", "Portfolio notional exposure %", 5, 75, 1],
  ["maxOpenPositions", "最多持仓数", "Maximum open positions", 1, 12, 1],
  ["dedupeWindowMinutes", "同向去重窗口 / 分钟", "Same-direction dedupe / minutes", 5, 60, 1],
  ["minTideSightScore", "普通信号最低评分", "Minimum manual signal score", 75, 95, 1],
  ["perOrderNotionalLimit", "单笔名义额度 / USDT", "Notional per order / USDT", 5, 100000, 1],
  ["dailyNotionalLimit", "每日名义额度 / USDT", "Daily notional limit / USDT", 5, 1000000, 1],
] as const;
type RiskValues = Record<(typeof riskFields)[number][0], number>;
export function TideSightRiskEditor({ config, canOperate, onChanged, language = "zh" }: { config: RiskValues & { activeMode: string }; canOperate: boolean; onChanged: () => Promise<void>; language?: Language }) {
  const tr = translate(language);
  const [draft, setDraft] = useState(config);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<LocalizedMessage>("");
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await request("/api/tidesight/execution/config", "PATCH", { ...draft, activeMode: config.activeMode, defaultMarket: "futures", testnetEnabled: false, autoExecuteEnabled: false, requireManualConfirmation: true, requireProtectionOrders: true });
      await onChanged(); setMessage({ zh: "TideSight 独立风控已保存，Alpha Radar 未修改。自动开仓已停止，需重新启动。", en: "TideSight risk policy saved; Alpha Radar is unchanged. Automatic entries stopped and must be restarted explicitly." });
    } catch (error) { setMessage(error instanceof Error ? error.message : { zh: "保存失败", en: "Could not save policy." }); }
    finally { setBusy(false); }
  }
  return <section className={styles.panel}><div className={styles.sectionTitle}><div><span>TIDESIGHT ONLY · INDEPENDENT POLICY</span><h2>{tr("独立风险策略设置", "Independent risk policy")}</h2></div><ShieldCheck /></div>
    <p className={styles.controlNote}>{tr("仅影响 TideSight 的普通策略及自动策略。配置、凭据、开关、订单与审计均独立于 Alpha Radar；不会继承其解锁状态。自动 MACD 以确定性交叉规则触发，不伪造 Alpha 评分。", "Applies only to TideSight manual and automatic strategies. Settings, credentials, switches, orders and audit records are independent of Alpha Radar, including unlock state. Automatic MACD uses deterministic cross rules, not fabricated Alpha scores.")}</p>
    <form className={styles.riskEditor} onSubmit={save}>{riskFields.map(([key, zh, en, min, max, step]) => <label key={key}><span>{tr(zh, en)}</span><input aria-label={tr(zh, en)} type="number" required disabled={!canOperate || busy} min={min} max={max} step={step} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>)}
      <button type="submit" disabled={!canOperate || busy}><ShieldCheck />{busy ? tr("保存中…", "Saving…") : tr("保存 TideSight 独立策略", "Save TideSight risk policy")}</button>
    </form><p className={styles.controlNote}>{tr("日损益口径：UTC 当日已实现损益、资金费和手续费，加当前浮动盈亏。参数变更会停止自动开仓，已存在的保护单不受影响。", "Daily P&L includes UTC-day realized P&L, funding and fees, plus current unrealized P&L. Changing settings stops automatic entries; existing protection orders remain unaffected.")}</p>
    {message ? <p role="status" className={styles.controlMessage}>{messageText(message, language)}</p> : null}
  </section>;
}
