import "server-only";
import type { Prisma } from "@prisma/client";
import { getRun, start } from "workflow/api";
import { prisma } from "@/lib/prisma";
import {
  defaultHostedGridOpsEnvironment,
  encryptHostedGridOpsEnvironment,
  hostedGridOpsSummary,
} from "@/lib/grid-ops-hosted/config";
import { hostedGridOpsWorkflow } from "@/lib/grid-ops-hosted/workflow";

const ACTIVE_RUN_HEARTBEAT_GRACE_MS = 60_000;

export const hostedGridOpsBotSelect = {
  id: true,
  userId: true,
  configEncrypted: true,
  configSummary: true,
  status: true,
  runId: true,
  snapshot: true,
  lastError: true,
  heartbeatAt: true,
  startedAt: true,
  stoppedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.HostedGridOpsBotSelect;

export type HostedGridOpsBotRecord = Prisma.HostedGridOpsBotGetPayload<{
  select: typeof hostedGridOpsBotSelect;
}>;

export function publicHostedGridOpsBot(bot: HostedGridOpsBotRecord) {
  return {
    id: bot.id,
    status: bot.status,
    summary: bot.configSummary,
    lastError: bot.lastError,
    heartbeatAt: bot.heartbeatAt?.toISOString() ?? null,
    startedAt: bot.startedAt?.toISOString() ?? null,
    stoppedAt: bot.stoppedAt?.toISOString() ?? null,
    updatedAt: bot.updatedAt.toISOString(),
  };
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

export async function ensureHostedGridOpsRun(bot: HostedGridOpsBotRecord) {
  const existing = await activeRun(bot.runId);
  if (existing) {
    await existing.wakeUp().catch(() => {});
    return bot;
  }
  // Workflow handles are deployment-versioned. Immediately after a deploy an
  // older run can still be healthy even when this deployment cannot resolve
  // its handle. The database heartbeat is the cross-deployment lease that
  // prevents a second runner from being created for the same account.
  const heartbeatIsFresh = Boolean(
    bot.runId &&
    bot.heartbeatAt &&
    Date.now() - bot.heartbeatAt.getTime() < ACTIVE_RUN_HEARTBEAT_GRACE_MS
  );
  if (heartbeatIsFresh && ["STARTING", "RUNNING", "ERROR"].includes(bot.status)) {
    return bot;
  }
  const run = await start(hostedGridOpsWorkflow, [bot.id]);
  return prisma.hostedGridOpsBot.update({
    where: { id: bot.id },
    data: { runId: run.runId, status: bot.status === "STOPPED" ? "STARTING" : bot.status, startedAt: bot.startedAt || new Date(), stoppedAt: null },
    select: hostedGridOpsBotSelect,
  });
}

export async function ensureHostedGridOpsBot(userId: string) {
  let bot = await prisma.hostedGridOpsBot.findUnique({ where: { userId }, select: hostedGridOpsBotSelect });
  let created = false;
  if (!bot) {
    const environment = defaultHostedGridOpsEnvironment();
    bot = await prisma.hostedGridOpsBot.create({
      data: {
        userId,
        configEncrypted: encryptHostedGridOpsEnvironment(environment),
        configSummary: hostedGridOpsSummary(environment) as Prisma.InputJsonValue,
        status: "STARTING",
      },
      select: hostedGridOpsBotSelect,
    });
    await prisma.hostedGridOpsCommand.create({
      data: { botId: bot.id, userId, type: "WARMUP", payload: {} },
    });
    created = true;
  }

  // A READY bot has no active grid or hedge cycle. Merely opening or polling
  // the console must not create an endless workflow that reads its large JSON
  // snapshot every few seconds. Commands explicitly restart and wake the run.
  if (created || !["READY", "STOPPED"].includes(bot.status)) {
    return ensureHostedGridOpsRun(bot);
  }
  if (bot.status === "READY") {
    const pending = await prisma.hostedGridOpsCommand.findFirst({
      where: { botId: bot.id, status: "PENDING" },
      select: { id: true },
    });
    if (pending) return ensureHostedGridOpsRun(bot);
  }
  return bot;
}

export async function enqueueHostedGridOpsCommand(input: {
  bot: HostedGridOpsBotRecord;
  userId: string;
  type: string;
  target?: string | null;
  payload?: unknown;
  waitMs?: number;
}) {
  const command = await prisma.hostedGridOpsCommand.create({
    data: {
      botId: input.bot.id,
      userId: input.userId,
      type: input.type,
      target: input.target || null,
      payload: (input.payload || {}) as Prisma.InputJsonValue,
    },
  });
  const bot = await ensureHostedGridOpsRun(input.bot);
  const run = await activeRun(bot.runId);
  if (run) await run.wakeUp().catch(() => {});

  const deadline = Date.now() + (input.waitMs ?? 20_000);
  while (Date.now() < deadline) {
    const current = await prisma.hostedGridOpsCommand.findUnique({ where: { id: command.id } });
    if (!current) throw new Error("托管命令记录不存在");
    if (current.status === "SUCCEEDED") return current.result ?? { ok: true };
    if (current.status === "FAILED") throw new Error(current.error || "托管交易命令执行失败");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return { ok: true, queued: true, commandId: command.id, message: "命令已进入线上托管队列，执行结果将自动同步到控制台。" };
}

export function hostedSnapshot(bot: HostedGridOpsBotRecord) {
  return bot.snapshot && typeof bot.snapshot === "object" ? bot.snapshot as Record<string, any> : {};
}
