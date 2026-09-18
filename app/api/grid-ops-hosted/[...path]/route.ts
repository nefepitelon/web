import { Prisma } from "@prisma/client";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import {
  decryptHostedGridOpsEnvironment,
  encryptHostedGridOpsEnvironment,
  hostedGridOpsEnvView,
  hostedGridOpsHasLive,
  hostedGridOpsSummary,
  normalizeHostedGridOpsProxy,
  updateHostedGridOpsEnvironment,
} from "@/lib/grid-ops-hosted/config";
import {
  enqueueHostedGridOpsCommand,
  ensureHostedGridOpsBot,
  ensureHostedGridOpsRun,
  hostedGridOpsBotSelect,
  hostedSnapshot,
} from "@/lib/grid-ops-hosted/service";
import { prisma } from "@/lib/prisma";
import { readHostedGridOpsView } from "@/lib/grid-ops-hosted/read-model";
import { assertSameOrigin } from "@/lib/request-security";
import { exchangeOnboardingTemplate, publicExchangeManifest } from "../../../../grid-ops/src/exchange/manifest.js";
import {
  buildExchangeInstanceManifest,
  enabledInstanceValue,
  instanceOwnedEnvKeys,
  nextExchangeInstance,
  removeExchangeInstance,
} from "../../../../grid-ops/src/exchange/instances.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
const noStore = { "Cache-Control": "private, no-store" };

function json(body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { ...init, headers: { ...noStore, ...(init.headers || {}) } });
}

async function bodyOf(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 100_000) throw new Error("请求内容不能超过 100KB");
  return request.json().catch(() => ({})) as Promise<Record<string, any>>;
}

function pathOf(parts: string[]) {
  return `/${parts.map((part) => decodeURIComponent(part)).join("/")}`;
}

function activeState(snapshot: Record<string, any>) {
  const running = Object.values(snapshot.bots || {}).some((item: any) => item?.running);
  return running || Boolean(snapshot.hedge?.active);
}

function overview(bot: Awaited<ReturnType<typeof ensureHostedGridOpsBot>>, environment: Record<string, string>) {
  const snapshot = hostedSnapshot(bot);
  const manifest = buildExchangeInstanceManifest(environment.EXCHANGE_INSTANCES || "");
  return Object.fromEntries(manifest.map((definition: any) => [definition.key, {
    ...(snapshot.views?.[definition.key] || { running: false, stats: {}, fills: [], alerts: [] }),
    mode: String(environment[definition.modeEnv] || "paper").toLowerCase() === "live" ? "live" : "paper",
  }]));
}

async function withBot(readOnly = false) {
  const viewer = await requireAlphaOperator();
  const bot = await ensureHostedGridOpsBot(viewer.id, { readOnly });
  const environment = decryptHostedGridOpsEnvironment(bot.configEncrypted);
  return { viewer, bot, environment, snapshot: hostedSnapshot(bot) };
}

async function requireLiveForAction(environment: Record<string, string>, target?: string | null) {
  if (!target) {
    if (hostedGridOpsHasLive(environment)) await requireAlphaOperator({ live: true });
    return;
  }
  const definition = buildExchangeInstanceManifest(environment.EXCHANGE_INSTANCES || "").find((item: any) => item.key === target);
  if (definition && String(environment[definition.modeEnv] || "paper").toLowerCase() === "live") {
    await requireAlphaOperator({ live: true });
  }
}

const gridAction: Record<string, string> = {
  start: "GRID_START", stop: "GRID_STOP", adjust: "GRID_ADJUST", reset: "GRID_RESET",
  "cancel-orders": "GRID_CANCEL", "start-recovery": "GRID_RECOVERY", reconnect: "GRID_RECONNECT",
  "close-position": "GRID_CLOSE_POSITION",
};

export async function GET(request: Request, context: Context) {
  try {
    const path = pathOf((await context.params).path);
    const { viewer, bot, environment } = await withBot(true);
    const manifest = buildExchangeInstanceManifest(environment.EXCHANGE_INSTANCES || "");

    if (path === "/poll") {
      const [views, hedge] = await Promise.all([
        readHostedGridOpsView(viewer.id, bot.id, "views"),
        readHostedGridOpsView(viewer.id, bot.id, "hedge"),
      ]);
      const snapshot = { views, hedge };
      return json({
        overview: overview({ ...bot, snapshot }, environment),
        hedge,
        active: Object.values(views).some((view: any) => view?.running) || Boolean(hedge.active) || ["STARTING", "RUNNING"].includes(bot.status),
        status: bot.status, error: bot.lastError, heartbeatAt: bot.heartbeatAt?.toISOString() || null,
        proxyConfig: { global: environment.GLOBAL_PROXY || "direct", ...Object.fromEntries(manifest.map((item: any) => [item.key, "direct"])), hosted: true, runtime: { mode: "server-direct" } },
      });
    }

    if (path === "/health") return json({
      ok: true, hosted: true, service: "welinkbtc-grid-ops-hosted", version: "2.3.3", consoleApiVersion: 8,
      status: bot.status, networkReady: bot.status !== "ERROR", exchanges: manifest.map((item: any) => item.key),
      heartbeatAt: bot.heartbeatAt?.toISOString() || null, error: bot.lastError,
    });
    if (path === "/version") return json({ schemaVersion: 1, service: "ai-grid-ops-hosted-engine", version: "2.3.3", buildId: "hosted-workflow-v1", builtAt: bot.updatedAt.toISOString() });
    if (path === "/exchanges") return json({ exchanges: publicExchangeManifest(manifest), maxInstances: 3 });
    if (path === "/exchanges/template") return json(exchangeOnboardingTemplate());
    if (path === "/overview" || path === "/overview/stream") {
      const views = await readHostedGridOpsView(viewer.id, bot.id, "views");
      return json(overview({ ...bot, snapshot: { views } }, environment));
    }
    if (path === "/env-config") return json(hostedGridOpsEnvView(environment));
    if (path === "/proxy-config") return json({ global: environment.GLOBAL_PROXY || "direct", ...Object.fromEntries(manifest.map((item: any) => [item.key, "direct"])), hosted: true, runtime: { mode: "server-direct" } });
    if (path === "/network-diagnostics" || path === "/proxy-check") return json({ ok: bot.status !== "ERROR", hosted: true, source: "server-direct", message: bot.lastError || "线上托管服务器使用官方交易所地址直连。" });
    if (path === "/ai/status") return json({ configured: false, hosted: true, running: false, message: "交易网格与对冲已托管；AI 辅助分析可在本地模式使用。" });
    if (path === "/hedge") return json(await readHostedGridOpsView(viewer.id, bot.id, "hedge"));
    if (path === "/hedge/options") {
      return json(await enqueueHostedGridOpsCommand({ bot, userId: viewer.id, type: "HEDGE_OPTIONS" }));
    }
    const commandMatch = path.match(/^\/commands\/([a-z0-9]+)$/i);
    if (commandMatch) {
      const command = await prisma.hostedGridOpsCommand.findFirst({
        where: { id: commandMatch[1], botId: bot.id, userId: viewer.id },
        select: { status: true, result: true, error: true },
      });
      if (!command) return json({ error: "托管分析任务不存在" }, { status: 404 });
      if (command.status === "FAILED") return json({ error: command.error || "托管分析失败", status: command.status }, { status: 400 });
      if (command.status === "SUCCEEDED") return json(command.result ?? { recommendations: [], scanned: 0, matched: 0, failed: 0 });
      return json({ ok: true, queued: true, commandId: commandMatch[1], status: command.status });
    }
    const match = path.match(/^\/([a-z0-9]+)\/(markets|state|trend|trend-recommendations|stream)$/i);
    if (match) {
      const [, target, action] = match;
      if (!manifest.some((item: any) => item.key === target)) return json({ error: "未知交易所账户" }, { status: 404 });
      if (action === "state" || action === "stream") {
        const view = await readHostedGridOpsView(viewer.id, bot.id, "views", target);
        return json(Object.keys(view).length ? view : { running: false, stats: {}, fills: [], alerts: [] });
      }
      if (action === "markets") {
        const cached = await readHostedGridOpsView(viewer.id, bot.id, "markets", target);
        if (Object.keys(cached).length) return json(cached);
        return json({ exchange: target, mode: "paper", dataSource: "initializing", markets: [] }, { status: 202 });
      }
      const url = new URL(request.url);
      return json(await enqueueHostedGridOpsCommand({
        bot, userId: viewer.id, type: action === "trend-recommendations" ? "TREND_RECOMMENDATIONS" : "TREND", target,
        payload: {
          marketId: url.searchParams.get("marketId"),
          intervalSec: url.searchParams.get("intervalSec"),
          strategy: url.searchParams.get("strategy"),
          minStrength: url.searchParams.get("minStrength"),
        },
      }));
    }
    return json({ error: `未知托管接口：${path}` }, { status: 404 });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const path = pathOf((await context.params).path);
    const { viewer, bot, environment, snapshot } = await withBot();
    const body = await bodyOf(request);

    if (path === "/env-config") {
      if (activeState(snapshot)) throw new Error("保存线上配置前，请先停止正在运行的网格与对冲轮次");
      const { merged } = updateHostedGridOpsEnvironment(environment, body.values);
      if (hostedGridOpsHasLive(merged)) {
        await requireAlphaOperator({ live: true });
        if (body.hostedLiveAcknowledged !== true) throw new Error("请先确认线上托管实盘风险与禁用提现权限");
        const lighter = buildExchangeInstanceManifest(merged.EXCHANGE_INSTANCES || "").find((item: any) => item.baseKey === "lr" && String(merged[item.modeEnv] || "paper").toLowerCase() === "live");
        if (lighter) throw new Error("RHC Lighter 的官方签名器依赖本机 Python；线上托管支持其 PAPER 模式，RHC 实盘请切换本地引擎。除 Entropy（仅 PAPER）外，其他十所可线上实盘。");
      }
      const updated = await prisma.hostedGridOpsBot.update({
        where: { id: bot.id },
        data: {
          configEncrypted: encryptHostedGridOpsEnvironment(merged),
          configSummary: hostedGridOpsSummary(merged) as Prisma.InputJsonValue,
          snapshot: Prisma.DbNull,
          marketCatalog: Prisma.DbNull,
          status: "STARTING", lastError: null,
        },
        select: hostedGridOpsBotSelect,
      });
      await prisma.hostedGridOpsCommand.create({ data: { botId: bot.id, userId: viewer.id, type: "WARMUP", payload: {} } });
      await ensureHostedGridOpsRun(updated);
      return json({ ok: true, restarting: true, hosted: true, message: "配置已加密保存，线上托管引擎正在重新载入。" });
    }

    if (path === "/env") {
      const key = String(body.key || "");
      if (key === "GLOBAL_PROXY" || key.endsWith("_PROXY")) {
        const proxy = normalizeHostedGridOpsProxy(body.value);
        if (proxy && proxy !== "direct") throw new Error("线上托管当前固定使用服务器直连；代理配置请在本地引擎模式使用");
        environment[key] = "direct";
      } else if (["AI_PROVIDER", "AI_API_KEY", "AI_BASE_URL", "AI_MODEL", "AI_MODEL_SMALL", "AI_SENTINEL_MINUTES", "AI_MARKET_MINUTES", "AI_REPORT_HOUR"].includes(key)) {
        environment[key] = String(body.value || "").trim();
      } else throw new Error(`不允许修改该字段：${key}`);
      await prisma.hostedGridOpsBot.update({ where: { id: bot.id }, data: { configEncrypted: encryptHostedGridOpsEnvironment(environment), configSummary: hostedGridOpsSummary(environment) as Prisma.InputJsonValue } });
      return json({ ok: true, hosted: true, message: "线上加密配置已保存。" });
    }

    if (path === "/exchanges/clone") {
      if (activeState(snapshot)) throw new Error("新增账号前请先停止网格与对冲轮次");
      const manifest = buildExchangeInstanceManifest(environment.EXCHANGE_INSTANCES || "");
      const next = nextExchangeInstance(String(body.baseKey || "").toLowerCase(), manifest);
      if (!next) throw new Error("该交易所已达到 3 个账号上限");
      environment.EXCHANGE_INSTANCES = enabledInstanceValue([...manifest, next]);
      environment[next.modeEnv] = "paper";
      environment[next.networkEnv] = next.defaultNetwork || "mainnet";
      const updated = await prisma.hostedGridOpsBot.update({
        where: { id: bot.id },
        data: {
          configEncrypted: encryptHostedGridOpsEnvironment(environment),
          configSummary: hostedGridOpsSummary(environment) as Prisma.InputJsonValue,
          snapshot: Prisma.DbNull,
          marketCatalog: Prisma.DbNull,
          status: "STARTING",
        },
        select: hostedGridOpsBotSelect,
      });
      await prisma.hostedGridOpsCommand.create({ data: { botId: bot.id, userId: viewer.id, type: "WARMUP", payload: {} } });
      await ensureHostedGridOpsRun(updated);
      return json({ ok: true, restarting: true, instance: publicExchangeManifest([next])[0], message: `${next.name} 已创建为独立 PAPER 托管账号。` });
    }

    if (path === "/exchanges/delete") {
      if (activeState(snapshot)) throw new Error("删除账号前请先停止网格与对冲轮次");
      const manifest = buildExchangeInstanceManifest(environment.EXCHANGE_INSTANCES || "");
      const removal = removeExchangeInstance(body.key, manifest);
      const state = snapshot.views?.[removal.target.key];
      if (state?.position || Number(state?.openOrders || 0) > 0) throw new Error("该账号仍有持仓或挂单，不能删除");
      for (const key of instanceOwnedEnvKeys(removal.target)) delete environment[key];
      environment.EXCHANGE_INSTANCES = enabledInstanceValue(removal.definitions);
      const updated = await prisma.hostedGridOpsBot.update({
        where: { id: bot.id },
        data: {
          configEncrypted: encryptHostedGridOpsEnvironment(environment),
          configSummary: hostedGridOpsSummary(environment) as Prisma.InputJsonValue,
          snapshot: Prisma.DbNull,
          marketCatalog: Prisma.DbNull,
          status: "STARTING",
        },
        select: hostedGridOpsBotSelect,
      });
      await prisma.hostedGridOpsCommand.create({ data: { botId: bot.id, userId: viewer.id, type: "WARMUP", payload: {} } });
      await ensureHostedGridOpsRun(updated);
      return json({ ok: true, restarting: true, removed: removal.target.key, message: `${removal.target.name} 已从线上托管账号中删除。` });
    }

    if (path.startsWith("/hedge/")) {
      const action = path.slice("/hedge/".length);
      const type = ({ start: "HEDGE_START", stop: "HEDGE_STOP", emergency: "HEDGE_EMERGENCY", reconcile: "HEDGE_RECONCILE" } as Record<string, string>)[action];
      if (!type) throw new Error("未知对冲操作");
      await requireLiveForAction(environment);
      return json(await enqueueHostedGridOpsCommand({ bot, userId: viewer.id, type, payload: body }));
    }

    if (path === "/refresh-live" || path === "/overview/refresh-live") {
      await requireLiveForAction(environment);
      return json(await enqueueHostedGridOpsCommand({ bot, userId: viewer.id, type: "REFRESH_LIVE", payload: body }));
    }
    if (path === "/emergency-stop" || path === "/overview/emergency-stop") {
      await requireLiveForAction(environment);
      if (request.headers.get("x-grid-emergency-confirm") !== "EMERGENCY_STOP_CANCEL_CLOSE_ALL") throw new Error("紧急操作确认无效");
      return json(await enqueueHostedGridOpsCommand({ bot, userId: viewer.id, type: "EMERGENCY_STOP", payload: body }));
    }
    if (path === "/proxy-check") return json({ ok: true, hosted: true, source: "server-direct", message: "线上托管服务器直连正常。" });
    if (path.startsWith("/ai/")) return json({ ok: false, hosted: true, error: "该托管版本先启用网格与对冲执行；AI 辅助分析请切换本地模式。" }, { status: 501 });

    const match = path.match(/^\/([a-z0-9]+)\/([a-z-]+)$/i);
    if (match && gridAction[match[2]]) {
      const [, target, action] = match;
      await requireLiveForAction(environment, target);
      return json(await enqueueHostedGridOpsCommand({ bot, userId: viewer.id, type: gridAction[action], target, payload: body }));
    }
    return json({ error: `未知托管接口：${path}` }, { status: 404 });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
