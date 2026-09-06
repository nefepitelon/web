import { randomUUID } from "node:crypto";
import { z } from "zod";
import { start } from "workflow/api";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { requireTideSightOperator, tideSightExecutionErrorResponse } from "@/lib/tidesight/execution/access";
import { getOrCreateTideSightExecutionConfig, publicConfig, writeTideSightAudit } from "@/lib/tidesight/execution/data";
import { withExecutionLease } from "@/lib/tidesight/execution/lease";
import { automaticIntent, TIDESIGHT_AUTO_STRATEGIES } from "@/lib/tidesight/automatic-strategies";
import { tideSightAutomationWorkflow } from "@/lib/tidesight/workflow";

export const runtime = "nodejs";
export const maxDuration = 300;
const protection = z.object({ stopLossPct: z.number().min(0.25).max(3.19), takeProfitPct: z.number().min(0.375).max(50), acknowledgeProtection: z.literal(true) });
const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const user = await requireTideSightOperator();
    const [config, events] = await Promise.all([getOrCreateTideSightExecutionConfig(user.id), prisma.tideSightAutoEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40 })]);
    return Response.json({ ok: true, config: publicConfig(config), events }, { headers });
  } catch (caught) { return tideSightExecutionErrorResponse(caught); }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireTideSightOperator({ live: true });
    const input = protection.parse(await request.json());
    for (const rule of TIDESIGHT_AUTO_STRATEGIES) automaticIntent(rule, "BTCUSDT", 100, input.stopLossPct, input.takeProfitPct);
    await withExecutionLease(user.id, async () => {
      await prisma.tideSightExecutionConfig.update({ where: { userId: user.id }, data: { autoStopLossPct: input.stopLossPct, autoTakeProfitPct: input.takeProfitPct, autoExecuteEnabled: false, autoGeneration: null } });
      await writeTideSightAudit({ userId: user.id, state: "NORMALIZED", status: "SECURITY", message: `自动策略保护参数已确认：价格止损 ${input.stopLossPct}% / 止盈 ${input.takeProfitPct}%；自动执行已关闭，需重新启动。` });
    });
    return Response.json({ ok: true }, { headers });
  } catch (caught) { return tideSightExecutionErrorResponse(caught); }
}
export async function POST(request: Request) {
  let generation: string | undefined, userId: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireTideSightOperator({ live: true });
    userId = user.id;
    const consent = z.object({ acknowledgeRealFunds: z.literal(true), acknowledgeDedicatedAccount: z.literal(true) }).parse(await request.json());
    generation = randomUUID();
    await withExecutionLease(user.id, async () => {
      const config = await getOrCreateTideSightExecutionConfig(user.id);
      if (config.autoExecuteEnabled) throw new Error("自动交易已启动，请勿重复启动");
      if (config.activeMode !== "LIVE" || !config.liveEnabled || !config.liveUnlockedAt || config.killSwitchActive || !config.reconciliationHealthy || !config.lastReconciledAt || Date.now() - config.lastReconciledAt.getTime() > 300_000) throw new Error("请先完成独立 LIVE 解锁及 5 分钟内健康对账");
      if (config.autoStopLossPct == null || config.autoTakeProfitPct == null) throw new Error("请先在自成交策略区确认止损和止盈");
      for (const rule of TIDESIGHT_AUTO_STRATEGIES) automaticIntent(rule, "BTCUSDT", 100, config.autoStopLossPct, config.autoTakeProfitPct);
      if (config.maxLeverage < 25 || config.riskPerTradePct < 1.5) throw new Error("独立风险闸门无法容纳六套策略，请先检查杠杆和单笔风险上限");
      await prisma.tideSightExecutionConfig.update({ where: { userId: user.id }, data: { autoExecuteEnabled: true, autoGeneration: generation, autoStartedAt: new Date(), autoHeartbeatAt: new Date(), autoError: null, autoRunId: null } });
    });
    const run = await start(tideSightAutomationWorkflow, [user.id, generation]);
    await prisma.tideSightExecutionConfig.updateMany({ where: { userId: user.id, autoGeneration: generation }, data: { autoRunId: run.runId } });
    await writeTideSightAudit({ userId: user.id, state: "MONITORING", status: "SECURITY", message: "管理员勾选两项协议并显式启动六套 MACD 自动策略；只消费启动后新收盘信号，仍接受独立风控最终否决。", metadata: { ...consent, confirmationMethod: "agreements" } });
    return Response.json({ ok: true, runId: run.runId }, { headers });
  } catch (caught) {
    if (generation && userId) await prisma.tideSightExecutionConfig.updateMany({ where: { userId, autoGeneration: generation }, data: { autoExecuteEnabled: false, autoError: caught instanceof Error ? caught.message.slice(0, 1900) : "启动失败" } }).catch(() => undefined);
    return tideSightExecutionErrorResponse(caught);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireTideSightOperator();
    await prisma.tideSightExecutionConfig.updateMany({ where: { userId: user.id }, data: { autoExecuteEnabled: false } });
    await writeTideSightAudit({ userId: user.id, state: "CANCELED", status: "SECURITY", message: "自动开仓已停止；已发送的订单不撤回，交易所原生止损/止盈继续生效。" });
    return Response.json({ ok: true }, { headers });
  } catch (caught) { return tideSightExecutionErrorResponse(caught); }
}
