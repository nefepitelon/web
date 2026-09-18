import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptHostedGridOpsEnvironment } from "@/lib/grid-ops-hosted/config";
import { getConfigFromEnvironment } from "../../grid-ops/src/config.js";
import { createRegisteredExchanges } from "../../grid-ops/src/exchange/registry.js";
import { GridBot } from "../../grid-ops/src/bot.js";
import { HedgeCycleManager } from "../../grid-ops/src/hedge/cycle.js";
import { analyzeTrendWithLivePrice } from "../../grid-ops/src/trend.js";
import { normalizeTrendIntervalSec, scanTrendRecommendations } from "../../grid-ops/src/trend-recommendations.js";

type JsonRecord = Record<string, any>;
type HostedSnapshot = {
  bots?: Record<string, JsonRecord>;
  views?: Record<string, JsonRecord>;
  markets?: Record<string, JsonRecord>;
  exchangeRuntime?: Record<string, JsonRecord>;
  hedge?: JsonRecord;
  hedgeDashboard?: JsonRecord;
  updatedAt?: string;
};

function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

function errorMessage(caught: unknown) {
  return (caught instanceof Error ? caught.message : String(caught || "托管交易引擎执行失败"))
    .replace(/0x[a-fA-F0-9]{48,}/g, "[已隐藏]")
    .replace(/(api[_ -]?key|private[_ -]?key|secret|token|passphrase)\s*[=:]\s*\S+/gi, "$1=[已隐藏]")
    .slice(0, 2_000);
}

function restoreExchangeRuntime(exchange: any, state: JsonRecord | undefined) {
  if (!state) return;
  for (const key of ["balance", "equity", "realizedPnl", "lastOkAt", "lastPrice"]) {
    if (state[key] != null && key in exchange) exchange[key] = state[key];
  }
  for (const key of ["positions", "prices", "realTarget"]) {
    if (Array.isArray(state[key]) && exchange[key] instanceof Map) exchange[key] = new Map(state[key]);
  }
  if (Number.isFinite(Number(state.sequence)) && "_seq" in exchange) exchange._seq = Number(state.sequence);
}

function captureExchangeRuntime(exchange: any) {
  const output: JsonRecord = {};
  for (const key of ["balance", "equity", "realizedPnl", "lastOkAt", "lastPrice"]) {
    if (typeof exchange[key] === "number" && Number.isFinite(exchange[key])) output[key] = exchange[key];
  }
  for (const key of ["positions", "prices", "realTarget"]) {
    if (exchange[key] instanceof Map) output[key] = [...exchange[key].entries()];
  }
  if (Number.isFinite(Number(exchange._seq))) output.sequence = Number(exchange._seq);
  return output;
}

async function disposeRuntime(runtime: JsonRecord) {
  runtime.hedge?.dispose?.();
  for (const bot of Object.values(runtime.bots || {}) as any[]) bot.dispose?.();
  for (const exchange of Object.values(runtime.exchanges || {}) as any[]) {
    try { exchange.stop?.(); } catch {}
    for (const key of Object.keys(exchange)) {
      if (!/(?:^|_)(?:timer|interval)|Timer$/i.test(key)) continue;
      const handle = exchange[key];
      if (handle) { try { clearInterval(handle); } catch {} }
      exchange[key] = null;
    }
    try { await exchange.signer?.stop?.(); } catch {}
    try { await exchange.dispatcher?.close?.(); } catch {}
    try { exchange.removeAllListeners?.(); } catch {}
  }
}

async function createRuntime(botRecord: { configEncrypted: string; snapshot: unknown }) {
  const environment = decryptHostedGridOpsEnvironment(botRecord.configEncrypted);
  const config = getConfigFromEnvironment(environment);
  const previous = botRecord.snapshot && typeof botRecord.snapshot === "object" ? botRecord.snapshot as HostedSnapshot : {};
  const registered = createRegisteredExchanges(config);
  const exchanges: Record<string, any> = {};
  const bots: Record<string, any> = {};
  const durableBots: Record<string, any> = { ...(previous.bots || {}) };

  for (const [key, item] of Object.entries(registered) as Array<[string, any]>) {
    exchanges[key] = item.exchange;
    restoreExchangeRuntime(item.exchange, previous.exchangeRuntime?.[key]);
    bots[key] = new GridBot(item.exchange, {
      exchangeName: item.definition.name,
      onChange: (state: unknown) => { durableBots[key] = jsonSafe(state); },
    });
    item.exchange.on?.("error", () => {});
  }

  await Promise.all(Object.entries(exchanges).map(async ([key, exchange]) => {
    try { await exchange.init?.(); }
    catch (error) {
      if (config.exchanges[key]?.mode === "live") throw new Error(`${key.toUpperCase()} 实盘连接失败：${errorMessage(error)}`);
    }
    restoreExchangeRuntime(exchange, previous.exchangeRuntime?.[key]);
  }));

  for (const definition of config.instanceManifest) {
    const key = definition.key;
    const snap = previous.bots?.[key];
    if (!snap) continue;
    if (snap.running && snap.config) await bots[key].resume(snap);
    else bots[key].restore(snap);
  }

  const hedge = new HedgeCycleManager({
    exchanges,
    definitions: config.instanceManifest,
    configs: config.exchanges,
    onChange: () => {},
  });
  hedge.restore(previous.hedge);
  for (const [accountKey, exchange] of Object.entries(exchanges) as Array<[string, any]>) {
    for (const type of ["fill", "partial_fill", "order_update", "position_closed", "tp_filled", "sl_filled", "liquidated", "abnormal_exit"]) {
      exchange.on?.(type, (event: JsonRecord = {}) => hedge.ingestEvent({ ...event, type, accountKey }));
    }
  }
  await hedge.resume();
  return { environment, config, exchanges, bots, durableBots, hedge };
}

function overview(runtime: JsonRecord) {
  return Object.fromEntries(runtime.config.instanceManifest.map((definition: any) => {
    const state = runtime.bots[definition.key].getState();
    return [definition.key, { ...state, mode: runtime.config.exchanges[definition.key].mode }];
  }));
}

async function captureSnapshot(runtime: JsonRecord): Promise<HostedSnapshot> {
  const bots = Object.fromEntries(Object.entries(runtime.bots).map(([key, bot]: [string, any]) => [key, bot.snapshot()]));
  const views = Object.fromEntries(Object.entries(runtime.bots).map(([key, bot]: [string, any]) => [key, bot.getState()]));
  const markets = Object.fromEntries(await Promise.all(runtime.config.instanceManifest.map(async (definition: any) => {
    const exchange = runtime.exchanges[definition.key];
    return [definition.key, {
      exchange: definition.name,
      mode: runtime.config.exchanges[definition.key].mode,
      dataSource: exchange.dataSource || (runtime.config.exchanges[definition.key].mode === "live" ? "real" : "synthetic"),
      network: exchange.network || runtime.config.exchanges[definition.key].network,
      apiUrl: exchange.apiUrl || runtime.config.exchanges[definition.key].apiUrl,
      markets: await exchange.getMarkets(),
    }];
  })));
  const exchangeRuntime = Object.fromEntries(Object.entries(runtime.exchanges).map(([key, exchange]) => [key, captureExchangeRuntime(exchange)]));
  const hedge = runtime.hedge.status();
  const hedgeDashboard = hedge.active ? await runtime.hedge.dashboard() : hedge;
  return jsonSafe({ bots, views, markets, exchangeRuntime, hedge, hedgeDashboard, updatedAt: new Date().toISOString() });
}

async function executeCommand(command: { type: string; target: string | null; payload: unknown }, runtime: JsonRecord) {
  const target = String(command.target || "");
  const payload = command.payload && typeof command.payload === "object" ? command.payload as JsonRecord : {};
  const bot = runtime.bots[target];
  const exchange = runtime.exchanges[target];
  switch (command.type) {
    case "WARMUP": return { ok: true, overview: overview(runtime) };
    case "TREND": {
      if (!exchange) throw new Error("未知交易所账户");
      const marketId = Number(payload.marketId || 1);
      const intervalSec = normalizeTrendIntervalSec(payload.intervalSec);
      let candles: any[] = [];
      try { candles = await exchange.getCandles(marketId, intervalSec, 200); } catch {}
      let price = null;
      try { price = await exchange.getPrice(marketId); } catch {}
      const analysis = candles.length >= 20 ? analyzeTrendWithLivePrice(candles, price) : {
        trend: "range", recommended: "neutral", strength: 0, atrPct: null, price,
        detail: "暂时拿不到足够K线数据，已默认中性网格。",
      };
      return { analysis, candles: candles.slice(-120) };
    }
    case "TREND_RECOMMENDATIONS": {
      if (!exchange) throw new Error("未知交易所账户");
      return scanTrendRecommendations({
        markets: await exchange.getMarkets(),
        intervalSec: normalizeTrendIntervalSec(payload.intervalSec),
        recommendation: payload.strategy,
        minStrength: payload.minStrength,
        getCandles: (marketId: number, seconds: number, count: number) => exchange.getCandles(marketId, seconds, count),
        getPrice: (marketId: number) => exchange.getPrice(marketId),
      });
    }
    case "GRID_START":
      if (!bot) throw new Error("未知交易所账户");
      if (runtime.hedge.status().active && Object.values(runtime.hedge.status().cycle?.legs || {}).some((leg: any) => leg.accountKey === target)) {
        throw new Error("该账户正在参与对冲轮次，不能同时启动网格");
      }
      return bot.start(payload);
    case "GRID_STOP": return bot.stop(payload);
    case "GRID_ADJUST": return bot.adjustRange(payload);
    case "GRID_RESET": return bot.resetStats();
    case "GRID_CANCEL": return bot.cancelAllOrders();
    case "GRID_RECOVERY": return bot.startRecovery(payload);
    case "GRID_CLOSE_POSITION": return bot.closePositionNow(payload.marketId);
    case "GRID_RECONNECT": {
      if (typeof exchange.reconnect === "function") await exchange.reconnect(); else await exchange.init?.();
      if (bot.running) await bot.reconcileOpenOrders().catch(() => {});
      return { ok: true, state: bot.getState() };
    }
    case "HEDGE_OPTIONS": return { accounts: await runtime.hedge.options(), states: {
      DRAFT: "DRAFT", VALIDATING: "VALIDATING", READY: "READY", OPENING: "OPENING", OPEN: "OPEN",
      EXIT_TRIGGERED: "EXIT_TRIGGERED", CLOSING: "CLOSING", COMPENSATING: "COMPENSATING",
      RECONCILING: "RECONCILING", CLOSED: "CLOSED", COOLDOWN: "COOLDOWN", COMPLETED: "COMPLETED",
      FAILED: "FAILED", EMERGENCY: "EMERGENCY",
    } };
    case "HEDGE_START": {
      for (const key of [payload.accountA, payload.accountB]) if (runtime.bots[key]?.running) throw new Error(`${key} 正在运行网格，不能参与对冲`);
      return runtime.hedge.start(payload);
    }
    case "HEDGE_STOP": return runtime.hedge.stop(payload.reason || "用户停止");
    case "HEDGE_EMERGENCY": {
      if (payload.confirmation !== "HEDGE_EMERGENCY_CANCEL_CLOSE") throw new Error("紧急操作确认无效");
      return runtime.hedge.emergency();
    }
    case "HEDGE_RECONCILE": return runtime.hedge.reconcile();
    case "REFRESH_LIVE": return {
      refreshedAt: Date.now(),
      results: Object.fromEntries(await Promise.all(runtime.config.instanceManifest
        .filter((definition: any) => runtime.config.exchanges[definition.key].mode === "live")
        .map(async (definition: any) => [definition.key, await runtime.bots[definition.key].refreshExchangeOpenOrders()]))),
      overview: overview(runtime),
    };
    case "EMERGENCY_STOP": {
      if (payload.confirmation !== "EMERGENCY_STOP_CANCEL_CLOSE_ALL") throw new Error("紧急操作确认无效");
      const results: JsonRecord = {};
      for (const definition of runtime.config.instanceManifest) {
        if (!runtime.bots[definition.key].running) continue;
        try { results[definition.key] = { ok: true, state: await runtime.bots[definition.key].stop({ closePosition: true, requireConfirmedClose: true }) }; }
        catch (error) { results[definition.key] = { ok: false, error: errorMessage(error) }; }
      }
      if (runtime.hedge.status().active) results.hedge = { ok: true, state: await runtime.hedge.emergency() };
      return { results, overview: overview(runtime) };
    }
    default: throw new Error(`未知托管命令：${command.type}`);
  }
}

async function persistRuntime(botId: string, runtime: JsonRecord, status = "RUNNING") {
  const snapshot = await captureSnapshot(runtime);
  const { markets = {}, ...runtimeSnapshot } = snapshot;
  await prisma.hostedGridOpsBot.update({
    where: { id: botId },
    data: {
      snapshot: runtimeSnapshot as Prisma.InputJsonValue,
      marketCatalog: markets as Prisma.InputJsonValue,
      status,
      heartbeatAt: new Date(),
      lastError: null,
    },
    select: { id: true },
  });
  return runtimeSnapshot;
}

export async function runHostedGridOpsSession(botId: string) {
  "use step";

  const [state, pending] = await Promise.all([
    prisma.hostedGridOpsBot.findUnique({ where: { id: botId }, select: { status: true } }),
    prisma.hostedGridOpsCommand.count({ where: { botId, status: "PENDING" } }),
  ]);
  if (!state || state.status === "STOPPED") return { stop: true, delayMs: 30_000 };
  if (!pending && state.status === "READY") return { stop: true, delayMs: 0 };

  const record = await prisma.hostedGridOpsBot.findUnique({
    where: { id: botId },
    select: { id: true, status: true, configEncrypted: true, snapshot: true },
  });
  if (!record || record.status === "STOPPED") return { stop: true, delayMs: 30_000 };

  let runtime: JsonRecord | null = null;
  try {
    runtime = await createRuntime(record);
    await prisma.hostedGridOpsBot.update({
      where: { id: botId },
      data: { status: "RUNNING", heartbeatAt: new Date(), lastError: null },
      select: { id: true },
    });
    const until = Date.now() + 25_000;
    let lastPersistedAt = Date.now();
    do {
      const next = await prisma.hostedGridOpsCommand.findFirst({ where: { botId, status: "PENDING" }, orderBy: { createdAt: "asc" } });
      if (next) {
        const claimed = await prisma.hostedGridOpsCommand.updateMany({
          where: { id: next.id, status: "PENDING" },
          data: { status: "RUNNING", startedAt: new Date() },
        });
        if (claimed.count) {
          try {
            const result = await executeCommand(next, runtime);
            await persistRuntime(botId, runtime);
            await prisma.hostedGridOpsCommand.update({
              where: { id: next.id },
              data: { status: "SUCCEEDED", result: jsonSafe(result) as Prisma.InputJsonValue, completedAt: new Date() },
              select: { id: true },
            });
          } catch (error) {
            await persistRuntime(botId, runtime, "ERROR").catch(() => {});
            await prisma.hostedGridOpsCommand.update({
              where: { id: next.id },
              data: { status: "FAILED", error: errorMessage(error), completedAt: new Date() },
              select: { id: true },
            });
          }
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      if (Date.now() - lastPersistedAt >= 10_000) {
        await persistRuntime(botId, runtime);
        lastPersistedAt = Date.now();
      }
    } while (Date.now() < until);
    const finalSnapshot = await persistRuntime(botId, runtime);
    const active = Object.values(finalSnapshot.bots || {}).some((item: any) => item?.running) || Boolean(finalSnapshot.hedge?.active);
    await prisma.hostedGridOpsBot.update({
      where: { id: botId },
      data: { status: active ? "RUNNING" : "READY" },
      select: { id: true },
    });
    return { stop: false, delayMs: active ? 1_000 : 10_000 };
  } catch (error) {
    await prisma.hostedGridOpsBot.update({
      where: { id: botId },
      data: { status: "ERROR", lastError: errorMessage(error), heartbeatAt: new Date() },
      select: { id: true },
    }).catch(() => {});
    return { stop: false, delayMs: 10_000 };
  } finally {
    if (runtime) await disposeRuntime(runtime);
  }
}

runHostedGridOpsSession.maxRetries = 0;
