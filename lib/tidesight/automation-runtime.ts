import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadMacdMonitors, type MacdMonitor } from "./macd-data";
import { TIDESIGHT_MACD_INTERVALS } from "./market-universe";
import { automaticIntent, isFreshAutomaticSignal, TIDESIGHT_AUTO_STRATEGIES } from "./automatic-strategies";
import { approveTradeIntent, executePlan, readLiveReferencePrice, reconcileExecution } from "./execution/service";

export async function authorizedAutomation(userId: string, generation: string) {
  const config = await prisma.tideSightExecutionConfig.findUnique({ where: { userId } });
  if (!config?.autoExecuteEnabled || config.autoGeneration !== generation) return null;
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } }, twoFactor: true } });
  if (!user || user.status !== "ACTIVE" || !user.roles.some((item) => item.role.key === "admin") || !user.twoFactor?.enabledAt) throw new Error("管理员或 2FA 权限已撤销，自动交易停止");
  if (config.activeMode !== "LIVE" || !config.liveEnabled || !config.liveUnlockedAt || config.killSwitchActive) throw new Error("LIVE 执行门禁已关闭");
  if (!config.autoStartedAt || config.autoStopLossPct == null || config.autoTakeProfitPct == null) throw new Error("自动交易保护参数未确认");
  if (!config.autoHeartbeatAt || Date.now() - config.autoHeartbeatAt.getTime() > 180_000) throw new Error("自动服务心跳中断超过 3 分钟，请检查后重新启动");
  return config;
}

export async function stopAutomationOnError(userId: string, generation: string, caught: unknown) {
  const message = (caught instanceof Error ? caught.message : "自动执行异常").slice(0, 1900);
  await prisma.tideSightExecutionConfig.updateMany({ where: { userId, autoGeneration: generation }, data: { autoExecuteEnabled: false, autoError: message } });
  return message;
}

export async function scanAutomation(userId: string, generation: string) {
  const current = await prisma.tideSightExecutionConfig.findUnique({ where: { userId } });
  // A newer run owns reconciliation. A stopped run keeps existing positions reconciled.
  if (!current || (current.autoGeneration && current.autoGeneration !== generation)) return { stop: true, signals: [] as MacdMonitor[] };
  try {
    const health = await reconcileExecution(userId, { environment: "LIVE", market: "FUTURES" });
    if (!health.ok) throw new Error("健康对账未通过，禁止自动新增仓位");
    const config = await authorizedAutomation(userId, generation);
    if (!config) {
      const [active, pending] = await Promise.all([
        prisma.tideSightTradingPosition.count({ where: { userId, environment: "LIVE", closedAt: null } }),
        prisma.tideSightTradingOrder.count({ where: { userId, environment: "LIVE", role: { in: ["ENTRY", "CLOSE"] }, status: { notIn: ["FILLED", "CANCELED", "REJECTED", "EXPIRED"] } } }),
      ]);
      return { stop: active === 0 && pending === 0, signals: [] as MacdMonitor[] };
    }
    const payload = await loadMacdMonitors(TIDESIGHT_MACD_INTERVALS.filter((item) => ["15m", "1h", "1d"].includes(item.interval)));
    await prisma.tideSightExecutionConfig.updateMany({ where: { userId, autoGeneration: generation, autoExecuteEnabled: true }, data: { autoHeartbeatAt: new Date(), autoError: payload.failures.length ? `${payload.failures.length} 个周期数据不可用，已跳过` : null } });
    return { stop: false, signals: payload.monitors.filter((item) => isFreshAutomaticSignal(item.closedAt, config.autoStartedAt!) && TIDESIGHT_AUTO_STRATEGIES.some((rule) => rule.interval === item.interval && rule.signal === item.signal)) };
  } catch (caught) {
    // Contention skips this tick; database/exchange failures never create exposure.
    if (!(caught instanceof Error && caught.message.includes("执行/对账正在进行"))) await stopAutomationOnError(userId, generation, caught);
    return { stop: false, signals: [] as MacdMonitor[] };
  }
}

export async function executeAutomaticSignal(userId: string, generation: string, signal: MacdMonitor) {
  const config = await authorizedAutomation(userId, generation);
  if (!config || !isFreshAutomaticSignal(signal.closedAt, config.autoStartedAt!)) return;
  const rule = TIDESIGHT_AUTO_STRATEGIES.find((item) => item.interval === signal.interval && item.signal === signal.signal);
  if (!rule) return;
  const eventKey = createHash("sha256").update(`${userId}|${rule.id}|${signal.symbol}|${signal.closedAt}`).digest("hex");
  let event;
  try {
    event = await prisma.tideSightAutoEvent.create({ data: { userId, eventKey, strategyId: rule.id, symbol: signal.symbol, interval: signal.interval, closedAt: new Date(signal.closedAt) } });
  } catch (caught) {
    if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002") return;
    throw caught;
  }
  let planId: string | undefined;
  try {
    const price = await readLiveReferencePrice(signal.symbol, "FUTURES");
    const input = automaticIntent(rule, signal.symbol, price.price, config.autoStopLossPct!, config.autoTakeProfitPct!);
    const approval = await approveTradeIntent(input, userId, true, generation);
    if (!approval.ok || !approval.executionPlan) throw new Error(approval.violations?.map((item: { message: string }) => item.message).join("；") || "独立风控拒绝");
    planId = String(approval.executionPlan.planId);
    const risk = approval.executionPlan.risk as { exposureCapped?: boolean; targetNotional?: number; notional?: number };
    const sizingMessage = risk.exposureCapped
      ? `目标名义仓位 ${Number(risk.targetNotional).toFixed(2)} USDT，已按实时净值风险与剩余额度安全下调为 ${Number(risk.notional).toFixed(2)} USDT。`
      : `执行计划名义仓位 ${Number(risk.notional).toFixed(2)} USDT。`;
    await prisma.tideSightAutoEvent.update({ where: { id: event.id }, data: { planId, status: "APPROVED", message: sizingMessage } });
    if (!isFreshAutomaticSignal(signal.closedAt, config.autoStartedAt!) || !await authorizedAutomation(userId, generation)) throw new Error("信号已过期或自动交易已停止");
    const execution = await executePlan(planId, userId, generation);
    await prisma.tideSightAutoEvent.update({ where: { id: event.id }, data: { status: "SUBMITTED", message: execution.idempotent ? `${sizingMessage}已有执行记录，未重复下单。` : `${sizingMessage}已提交唯一执行通道；成交及保护状态以事实与审计为准。` } });
  } catch (caught) {
    const plan = planId ? await prisma.tideSightExecutionPlan.findUnique({ where: { id: planId }, select: { state: true } }) : null;
    const uncertain = plan && ["EXECUTING", "UNKNOWN", "SUBMITTED", "PARTIALLY_FILLED", "FILLED", "KILLED"].includes(plan.state);
    if (planId) await prisma.tideSightExecutionPlan.updateMany({ where: { id: planId, state: { in: ["AWAITING_CONFIRMATION", "PLANNED"] } }, data: { state: "CANCELED" } });
    await prisma.tideSightAutoEvent.update({ where: { id: event.id }, data: { status: uncertain ? "RECONCILE_REQUIRED" : "REJECTED", message: (caught instanceof Error ? caught.message : "执行异常").slice(0, 1900) } });
    if (uncertain) await stopAutomationOnError(userId, generation, caught);
  }
}
