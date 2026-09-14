import { randomUUID } from "node:crypto";
import { z } from "zod";
import { start } from "workflow/api";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { autoConfig, autoEvent, automationSnapshot, currentAutoGrant, saveAutomationSettings, stopAutomation, TERMINAL_AUTO_ORDER } from "@/lib/alpha-execution/automation-data";
import { alphaAutomationSettingsSchema } from "@/lib/alpha-execution/automation-strategy";
import { readSavedAutomationSettings, requiresAutomationStrategySelection } from "@/lib/alpha-execution/automation-settings";
import { previewAutomation } from "@/lib/alpha-execution/automation-runtime";
import { loadAutomationAccount } from "@/lib/alpha-execution/automation-account";
import { alphaAutomationWorkflow } from "@/lib/alpha-execution/automation-workflow";
import { recommendAutomationSettings } from "@/lib/alpha-execution/automation-recommendation";

export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), settings: alphaAutomationSettingsSchema }).strict(),
  z.object({ action: z.literal("preview"), settings: alphaAutomationSettingsSchema.optional() }).strict(),
  z.object({ action: z.literal("recommend"), settings: alphaAutomationSettingsSchema.optional() }).strict(),
  z.object({ action: z.literal("start"), version: z.string().min(1), confirmation: z.literal("START_LIVE_AUTOMATION"), acknowledged: z.literal(true) }).strict(),
  z.object({ action: z.literal("stop") }).strict(),
]);
const response = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  try { const viewer = await requireAlphaOperator(); return response(await automationSnapshot(viewer.id)); }
  catch (caught) { return alphaExecutionErrorResponse(caught); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const input = schema.parse(await request.json());
    if (input.action === "save") await saveAutomationSettings(viewer.id, input.settings);
    if (input.action === "stop") await stopAutomation(viewer.id);
    if (input.action === "recommend") {
      await requireAlphaOperator({ live: true });
      const config = await autoConfig(viewer.id);
      if (config.enabled || config.status === "STOPPING") throw new Error("请先停止自动开仓并完成持仓收尾，再载入推荐参数");
      const recommendation = await recommendAutomationSettings(viewer.id, input.settings ?? readSavedAutomationSettings(config.settings));
      return response({ ...await automationSnapshot(viewer.id), recommendation });
    }
    if (input.action === "preview") {
      await requireAlphaOperator({ live: true });
      const preview = await previewAutomation(viewer.id, input.settings);
      return response({ ...await automationSnapshot(viewer.id), preview });
    }
    if (input.action === "start") {
      await requireAlphaOperator({ live: true });
      const config = await autoConfig(viewer.id);
      if (requiresAutomationStrategySelection(config.settings)) throw new Error("策略已更新，请选择本轮执行策略并保存参数后再开启新交易");
      const settings = alphaAutomationSettingsSchema.parse(config.settings);
      const grant = await currentAutoGrant(viewer.id);
      // Read-only readiness check. No order, protection or exchange setting is changed here.
      const { account } = await loadAutomationAccount(viewer.id, { persistBaseline: true });
      if (!account.reconciliationHealthy || account.unresolvedOrders) throw new Error("请先完成订单对账并处理未决订单，再启动自动交易");
      const generation = randomUUID();
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`alpha-auto:${viewer.id}`}))::text`;
        const current = await tx.alphaAutomationConfig.findUniqueOrThrow({ where: { userId: viewer.id } });
        if (current.version !== input.version || current.version !== config.version) throw new Error("配置已被更新，请重新查看并确认");
        if (current.enabled || current.status === "STOPPING" || (current.leaseUntil && current.leaseUntil > now)
          || await tx.alphaAutomationOrder.count({ where: { userId: viewer.id, status: { notIn: TERMINAL_AUTO_ORDER } } }))
          throw new Error("已有运行会话、未决订单或尚未结束的自动持仓，请先处理");
        await tx.alphaAutomationConfig.update({ where: { userId: viewer.id }, data: { enabled: true, status: "RUNNING", generation,
          grantFingerprint: grant.fingerprint, market: "futures", startedAt: now, expiresAt: new Date(now.getTime() + settings.sessionDurationHours * 3_600_000),
          nextScanAt: now, lastError: null, runId: null, leaseToken: null, leaseUntil: null } });
      });
      try {
        await autoEvent(viewer.id, "START", `已确认启动 LIVE 自动交易，授权有效 ${settings.sessionDurationHours} 小时。`, { generation, settings, version: config.version });
        const run = await start(alphaAutomationWorkflow, [viewer.id, generation]);
        await prisma.alphaAutomationConfig.updateMany({ where: { userId: viewer.id, generation }, data: { runId: run.runId } });
      } catch {
        await prisma.alphaAutomationConfig.updateMany({ where: { userId: viewer.id, generation }, data: { enabled: false, status: "ERROR", lastError: "定时任务未能确认启动；已关闭新开仓，请检查任务状态" } });
        throw new Error("服务端定时任务未能确认启动，自动开仓已关闭");
      }
    }
    return response(await automationSnapshot(viewer.id));
  } catch (caught) { return alphaExecutionErrorResponse(caught); }
}
