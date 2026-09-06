import { getRun, start } from "workflow/api";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { encryptTradingSecret } from "@/lib/alpha-execution/credentials";
import { parseClassicGridConfig } from "@/lib/classic-grid/config";
import { classicGridWorkflow } from "@/lib/classic-grid/workflow";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ACTIVE_RUN_HEARTBEAT_GRACE_MS = 2 * 60_000;

function publicBot(bot: Awaited<ReturnType<typeof findBot>>) {
  if (!bot) return null;
  return {
    id: bot.id,
    dryRun: bot.dryRun,
    paused: bot.paused,
    status: bot.status,
    summary: bot.configSummary,
    lastError: bot.lastError,
    heartbeatAt: bot.heartbeatAt?.toISOString() ?? null,
    startedAt: bot.startedAt?.toISOString() ?? null,
    stoppedAt: bot.stoppedAt?.toISOString() ?? null,
    updatedAt: bot.updatedAt.toISOString()
  };
}

function findBot(userId: string) {
  return prisma.classicGridBot.findUnique({
    where: { userId },
    select: {
      id: true,
      dryRun: true,
      paused: true,
      status: true,
      runId: true,
      configSummary: true,
      lastError: true,
      heartbeatAt: true,
      startedAt: true,
      stoppedAt: true,
      updatedAt: true,
    }
  });
}

async function activeRun(runId: string | null) {
  if (!runId) return null;
  try {
    const run = getRun(runId);
    if (!(await run.exists)) return null;
    const status = await run.status;
    return ["completed", "failed", "cancelled"].includes(status) ? null : run;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const viewer = await requireAlphaOperator();
    return Response.json({ ok: true, bot: publicBot(await findBot(viewer.id)) }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 70_000) throw new Error("配置请求不能超过 70KB");
    const viewer = await requireAlphaOperator();
    const body = await request.json() as Record<string, unknown>;
    const dryRun = body.mode !== "live";
    if (!dryRun) {
      await requireAlphaOperator({ live: true });
      if (body.confirmation !== "ENABLE CLASSIC GRID LIVE" || body.acknowledgeFunds !== true || body.acknowledgeNoWithdrawals !== true) {
        throw new Error("实盘确认不完整；请确认资金风险、禁用提现权限并输入指定短语");
      }
    }
    const parsed = parseClassicGridConfig(String(body.configText || ""), dryRun);
    const encrypted = encryptTradingSecret(JSON.stringify(parsed.env));
    let bot = await prisma.classicGridBot.upsert({
      where: { userId: viewer.id },
      update: {
        configEncrypted: encrypted,
        configSummary: parsed.summary,
        dryRun,
        paused: false,
        status: "STARTING",
        lastError: null,
        stoppedAt: null
      },
      create: {
        userId: viewer.id,
        configEncrypted: encrypted,
        configSummary: parsed.summary,
        dryRun,
        status: "STARTING"
      }
    });

    const existingRun = await activeRun(bot.runId);
    if (existingRun) {
      await existingRun.wakeUp();
    } else if (!(bot.runId && bot.heartbeatAt && Date.now() - bot.heartbeatAt.getTime() < ACTIVE_RUN_HEARTBEAT_GRACE_MS)) {
      const run = await start(classicGridWorkflow, [bot.id]);
      bot = await prisma.classicGridBot.update({
        where: { id: bot.id },
        data: { runId: run.runId, startedAt: new Date() }
      });
    }
    return Response.json({ ok: true, bot: publicBot(bot) }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const bot = await findBot(viewer.id);
    if (!bot) return Response.json({ ok: true, bot: null }, { headers: { "Cache-Control": "private, no-store" } });
    const run = await activeRun(bot.runId);
    if (run) await run.cancel();
    const stopped = await prisma.classicGridBot.update({
      where: { id: bot.id },
      data: {
        configEncrypted: encryptTradingSecret("{}"),
        configSummary: {},
        status: "STOPPED",
        paused: true,
        stoppedAt: new Date(),
        heartbeatAt: new Date()
      }
    });
    return Response.json({ ok: true, bot: publicBot(stopped) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
