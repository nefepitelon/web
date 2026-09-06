import { getRun } from "workflow/api";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 请求后台任务立即回捞八所账户快照与官方当日成交统计。 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const existing = await prisma.classicGridBot.findUnique({ where: { userId: viewer.id } });
    if (!existing) throw new Error("请先保存并启动 AIClassic 网格配置");
    if (!existing.runId || ["STOPPED", "STOPPING"].includes(existing.status)) {
      throw new Error("AIClassic 网格尚未运行，无法回捞实时数据");
    }

    const requestedAt = new Date().toISOString();
    const summary = existing.configSummary && typeof existing.configSummary === "object"
      ? existing.configSummary as Record<string, unknown>
      : {};
    await prisma.classicGridBot.update({
      where: { id: existing.id },
      data: {
        configSummary: { ...summary, statsRefreshRequestedAt: requestedAt },
        lastError: null,
      },
    });
    try {
      await getRun(existing.runId).wakeUp();
    } catch {
      // 即使唤醒信号失败，运行中的 15 秒轮询也会读取本次请求。
    }
    console.info("[classic-grid/refresh] requested", { botId: existing.id, requestedAt });
    return Response.json(
      { ok: true, requestedAt, message: "已请求后台实时回捞，请稍候" },
      { status: 202, headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
