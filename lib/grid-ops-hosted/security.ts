import type { Prisma } from "@prisma/client";

export const HOSTED_GRID_QUARANTINE_PREFIX = "SECURITY_QUARANTINE_";
// Preserved incident evidence: these IDs never came from the application's
// generated IDs. A marker accidentally cleared by an older worker must not
// make one of these forged records runnable again.
const INCIDENT_BOT_IDS = [
  "zz-i63635-canary-bot", "zz-i63676-bot-B-queued", "zz-i63676-bot-C-live",
  "zz-i63676-bot-D-dispatched", "zz-i63676-bot-E-metadata",
];

type BotSecurityState = { id?: string; lastError?: string | null; status?: string };

export function isHostedGridOpsQuarantined(bot: BotSecurityState | null | undefined) {
  return Boolean(bot && (INCIDENT_BOT_IDS.includes(bot.id ?? "") || bot.lastError?.startsWith(HOSTED_GRID_QUARANTINE_PREFIX)));
}

export function assertHostedGridOpsNotQuarantined(bot: BotSecurityState | null | undefined) {
  if (!bot || isHostedGridOpsQuarantined(bot)) throw new Error("托管机器人已被安全隔离，请联系管理员核验");
}

export function hostedGridOpsWorkerStopped(bot: BotSecurityState | null | undefined) {
  return !bot || bot.status === "STOPPED" || isHostedGridOpsQuarantined(bot);
}

/** Keep the predicate in every write so a stale request cannot clear a marker. */
export function hostedGridOpsNotQuarantinedWhere(id: string): Prisma.HostedGridOpsBotWhereUniqueInput {
  return {
    id,
    AND: [
      { id: { notIn: INCIDENT_BOT_IDS } },
      { OR: [{ lastError: null }, { NOT: { lastError: { startsWith: HOSTED_GRID_QUARANTINE_PREFIX } } }] },
    ],
  };
}

export function hostedGridOpsRunnableWhere(id: string): Prisma.HostedGridOpsBotWhereUniqueInput {
  return { ...hostedGridOpsNotQuarantinedWhere(id), status: { not: "STOPPED" } };
}
