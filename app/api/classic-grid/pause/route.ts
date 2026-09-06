import { getRun } from "workflow/api";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const body = await request.json().catch(() => ({})) as { paused?: unknown };
    const paused = body.paused !== false;
    const existing = await prisma.classicGridBot.findUnique({
      where: { userId: viewer.id },
      select: { id: true, runId: true }
    });
    if (!existing) throw new Error("请先保存并启动 AIClassic 网格配置");
    const bot = await prisma.classicGridBot.update({
      where: { id: existing.id },
      data: { paused, status: paused ? "PAUSED" : "RUNNING", lastError: null },
      select: { runId: true, paused: true, updatedAt: true }
    });
    if (bot.runId) {
      try { await getRun(bot.runId).wakeUp(); } catch { /* the next start will resume it */ }
    }
    return Response.json({ ok: true, paused: bot.paused, updatedAt: bot.updatedAt.toISOString() }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
