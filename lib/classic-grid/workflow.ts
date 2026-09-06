import { sleep } from "workflow";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function classicGridWorkflow(botId: string) {
  "use workflow";

  while (true) {
    const result = await runClassicGridTick(botId);
    if (result.stop) return { status: "stopped" as const };
    await sleep(result.delayMs);
  }
}

async function runClassicGridTick(botId: string): Promise<{ stop: boolean; delayMs: number }> {
  "use step";

  const bot = await prisma.classicGridBot.findUnique({
    where: { id: botId },
    select: {
      id: true,
      configEncrypted: true,
      configSummary: true,
      dryRun: true,
      paused: true,
      status: true,
      snapshot: true,
    }
  });
  if (!bot || ["STOPPED", "STOPPING"].includes(bot.status)) {
    if (bot) {
      await prisma.classicGridBot.update({
        where: { id: bot.id },
        data: { status: "STOPPED", stoppedAt: new Date(), heartbeatAt: new Date() }
      });
    }
    return { stop: true, delayMs: 15_000 };
  }

  const delayMs = Math.max(5_000, Number((bot.configSummary as { tickMs?: number })?.tickMs || 15_000));
  const summary = bot.configSummary && typeof bot.configSummary === "object"
    ? bot.configSummary as Record<string, unknown>
    : {};
  const requestedAt = Date.parse(String(summary.statsRefreshRequestedAt || ""));
  const previousOfficialAt = Date.parse(String(
    bot.snapshot && typeof bot.snapshot === "object"
      ? (bot.snapshot as { official?: { updatedAt?: unknown } }).official?.updatedAt || ""
      : ""
  ));
  const forceStatsRefresh = Number.isFinite(requestedAt) && !(Number.isFinite(previousOfficialAt) && previousOfficialAt >= requestedAt);
  if (bot.paused && !forceStatsRefresh) {
    await prisma.classicGridBot.update({
      where: { id: bot.id },
      data: { status: "PAUSED", heartbeatAt: new Date(), lastError: null },
      select: { id: true }
    });
    return { stop: false, delayMs: Math.max(delayMs, 60_000) };
  }
  try {
    const snapshot = await executeClassicGridTick({
      configEncrypted: bot.configEncrypted,
      dryRun: bot.dryRun,
      paused: bot.paused,
      previousSnapshot: bot.snapshot,
      forceStatsRefresh,
    });
    const statsRefreshedAt = snapshot.official?.updatedAt;
    await prisma.classicGridBot.update({
      where: { id: bot.id },
      data: {
        snapshot,
        status: bot.paused ? "PAUSED" : "RUNNING",
        heartbeatAt: new Date(),
        lastError: null,
        configSummary: (
          forceStatsRefresh && statsRefreshedAt
            ? { ...summary, statsRefreshedAt }
            : summary
        ) as Prisma.InputJsonValue,
      },
      select: { id: true }
    });
  } catch (caught) {
    const message = sanitizeClassicGridError(caught);
    await prisma.classicGridBot.update({
      where: { id: bot.id },
      data: { status: "ERROR", heartbeatAt: new Date(), lastError: message },
      select: { id: true }
    });
  }
  return { stop: false, delayMs };
}

runClassicGridTick.maxRetries = 0;

type TickInput = {
  configEncrypted: string;
  dryRun: boolean;
  paused: boolean;
  previousSnapshot: unknown;
  forceStatsRefresh?: boolean;
};

const executionLockSymbol = Symbol.for("welinkbtc.classic-grid.execution-lock");
type ClassicGridGlobal = typeof globalThis & { [executionLockSymbol]?: Promise<void> };

async function withExecutionLock<T>(task: () => Promise<T>) {
  const shared = globalThis as ClassicGridGlobal;
  const previous = shared[executionLockSymbol] || Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  shared[executionLockSymbol] = previous.then(() => gate);
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

const OFFICIAL_VENUES = [
  "extended", "risex", "decibel", "n1", "phoenix", "phoenix2", "nado", "popdex",
] as const;

function shanghaiDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function previousOfficialBundle(previous: any) {
  if (previous?.official?.venues && previous.official.dayKey) return previous.official;
  const rows = Array.isArray(previous?.venues) ? previous.venues : [];
  const byId = new Map(rows.map((row: any) => [String(row?.venue || ""), row]));
  let known = 0;
  const venues = Object.fromEntries(OFFICIAL_VENUES.map((venue) => {
    const row: any = byId.get(venue);
    const hasOfficial = row && (
      row.officialSource === "official" ||
      row.officialVolume != null ||
      row.officialFees != null ||
      row.officialRealizedPnl != null
    );
    if (hasOfficial) known += 1;
    return [venue, hasOfficial ? {
      venue,
      ok: true,
      source: "official",
      volume: row.officialVolume ?? null,
      fees: row.officialFees ?? null,
      realizedPnl: row.officialRealizedPnl ?? null,
      fills: row.officialFills ?? null,
      closeFills: row.officialCloseFills ?? null,
      feeMaker: null,
      feeTaker: null,
      note: "从上一轮场所统计恢复",
      updatedAt: row.updatedAt || new Date(0).toISOString(),
    } : {
      venue,
      ok: false,
      source: "unavailable",
      volume: null,
      fees: null,
      realizedPnl: null,
      fills: null,
      closeFills: null,
      feeMaker: null,
      feeTaker: null,
      note: "尚未回捞",
      updatedAt: new Date(0).toISOString(),
    }];
  }));
  if (!known) return null;
  return {
    dayKey: previous?.ledger?.dayKey || shanghaiDayKey(),
    dayStartMs: Date.parse(`${previous?.ledger?.dayKey || shanghaiDayKey()}T00:00:00+08:00`),
    venues,
    // 兼容旧快照时强制尽快重新回捞，不能拿每轮更新的 venue.updatedAt 当统计时间。
    updatedAt: new Date(0).toISOString(),
  };
}

async function executeClassicGridTick(input: TickInput) {
  const [{ decryptTradingSecret }, configModule, fs, os, path, loopModule, dashboardModule, officialStatsModule, ledgerModule] = await Promise.all([
    import("@/lib/alpha-execution/credentials"),
    import("@/lib/classic-grid/config"),
    import("node:fs/promises"),
    import("node:os"),
    import("node:path"),
    import("../../classic-grid/src/loop"),
    import("../../classic-grid/src/dashboard"),
    import("../../classic-grid/src/officialStats"),
    import("../../classic-grid/src/ledger")
  ]);

  return withExecutionLock(async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "welinkbtc-classic-grid-"));
    const dataDir = path.join(tempRoot, "data");
    const secretDir = path.join(tempRoot, "secrets");
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(secretDir, { recursive: true });

    const config = JSON.parse(decryptTradingSecret(input.configEncrypted)) as Record<string, string>;
    if (config.N1_KEYPAIR_JSON) {
      await fs.writeFile(path.join(secretDir, "id.json"), config.N1_KEYPAIR_JSON, { encoding: "utf8", mode: 0o600 });
    }

    const previous = input.previousSnapshot && typeof input.previousSnapshot === "object"
      ? input.previousSnapshot as { ledger?: unknown; venues?: unknown; official?: unknown; runtimeState?: { ledger?: unknown } }
      : null;
    if (previous) await fs.writeFile(path.join(dataDir, "status.json"), JSON.stringify(previous), "utf8");
    const previousLedger = previous?.runtimeState?.ledger || previous?.ledger;
    if (previousLedger) await fs.writeFile(path.join(dataDir, "ledger.json"), JSON.stringify(previousLedger), "utf8");
    await fs.writeFile(path.join(dataDir, "bot-paused.json"), JSON.stringify({
      paused: input.paused,
      updatedAt: new Date().toISOString(),
      reason: input.paused ? "WELINKBTC console" : undefined
    }), "utf8");

    const runtime = configModule.runtimeEnvironment(config, input.dryRun, tempRoot);
    const savedCwd = process.cwd();
    const savedEnvironment = new Map<string, string | undefined>();
    for (const key of configModule.CLASSIC_GRID_RUNTIME_KEYS) savedEnvironment.set(key, process.env[key]);

    try {
      for (const key of configModule.CLASSIC_GRID_RUNTIME_KEYS) delete process.env[key];
      Object.assign(process.env, runtime);
      process.chdir(tempRoot);
      dashboardModule.resetDashboardSnapshot();
      await loopModule.runLoop({
        once: true,
        installSignalHandlers: false,
        exitOnStop: false,
        serveDashboard: false,
        refreshOfficialStats: false
      });
      const previousOfficial = previousOfficialBundle(previous);
      const previousOfficialAt = Date.parse(String(previousOfficial?.updatedAt || ""));
      const stale =
        !previousOfficial ||
        previousOfficial.dayKey !== shanghaiDayKey() ||
        !Number.isFinite(previousOfficialAt) ||
        Date.now() - previousOfficialAt >= 5 * 60_000;
      let official = previousOfficial;
      if (input.forceStatsRefresh || stale) {
        const enabledVenues = String(runtime.VENUES || "")
          .split(",")
          .map((value) => value.trim())
          .filter((value): value is (typeof OFFICIAL_VENUES)[number] =>
            (OFFICIAL_VENUES as readonly string[]).includes(value)
          );
        console.log(`[official] ${input.forceStatsRefresh ? "manual" : "scheduled"} refresh venues=${enabledVenues.join(",")}`);
        official = await officialStatsModule.refreshOfficialStats({
          force: true,
          minIntervalMs: 0,
          venues: enabledVenues,
          previous: previousOfficial,
        });
      }
      if (official) dashboardModule.setDashboardOfficial(official);
      const publicSnapshot = dashboardModule.getDashboardSnapshot();
      return JSON.parse(JSON.stringify({
        ...publicSnapshot,
        runtimeState: { ledger: ledgerModule.getLedgerStateForPersistence() },
      }));
    } finally {
      process.chdir(savedCwd);
      for (const key of configModule.CLASSIC_GRID_RUNTIME_KEYS) {
        const value = savedEnvironment.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
}

function sanitizeClassicGridError(caught: unknown) {
  const raw = caught instanceof Error ? caught.message : String(caught || "网格执行失败");
  return raw
    .replace(/0x[a-fA-F0-9]{32,}/g, "[已隐藏]")
    .replace(/[1-9A-HJ-NP-Za-km-z]{80,}/g, "[已隐藏]")
    .replace(/(api[_ -]?key|private[_ -]?key|secret|token)\s*[=:]\s*\S+/gi, "$1=[已隐藏]")
    .slice(0, 2_000);
}
