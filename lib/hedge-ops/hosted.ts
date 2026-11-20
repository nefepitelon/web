import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import { start } from "workflow/api";
import { prisma } from "@/lib/prisma";
import { redactSecretData, redactSecretText } from "@/lib/secret-redaction";
import { decryptTradingSecret, encryptTradingSecret, normalizeTradingProxy } from "@/lib/alpha-execution/credentials";
import { HedgeOpsError } from "./access";
import { configuredEnvironment, defaultEnvironment, environmentView, updateEnvironment, sharedHedgeResources, type Environment } from "./environment";
import { HEDGE_PAIRS, type HedgeEngine } from "./protocol";
import { hostedHedgeWorkflow } from "./workflow";

type Init = { method?: string; body?: string; query?: string; liveAuthorized?: boolean };
type RecordRow = Awaited<ReturnType<typeof ensureRuntime>>;
export async function ensureRuntime(userId: string, engine: HedgeEngine) {
  const current = await prisma.hedgeOpsRuntime.findUnique({ where: { userId_engine: { userId, engine } } });
  if (current) return current;
  return prisma.hedgeOpsRuntime.upsert({ where: { userId_engine: { userId, engine } }, update: {},
    create: { userId, engine, configEncrypted: encryptTradingSecret(JSON.stringify(defaultEnvironment(engine))) } });
}
function valuesOf(row: RecordRow): Environment { return JSON.parse(decryptTradingSecret(row.configEncrypted)); }
const json = (value: unknown) => Response.json(redactSecretData(value), { headers: { "Cache-Control": "private, no-store" } });
export function hostedRuntimeView(row: RecordRow) {
  const values = valuesOf(row);
  const message = row.lastError ? redactSecretText(row.lastError, Object.entries(values).filter(([name]) => /PRIVATE_KEY|_PROXY$|_API_KEY$|_API_SECRET$|_API_PASSPHRASE$|_API_KEY_ID$/.test(name)).map(([, value]) => value)) : null;
  return { available: true, hosted: true, running: row.status === "RUNNING" || row.status === "DRAINING", engine: row.engine, pair: HEDGE_PAIRS[row.engine as HedgeEngine],
    emergency: row.status === "DRAINING" ? { phase: "draining", message: message || "已锁定开仓，正在撤单平仓" } : null,
    dryRun: values.DRY_RUN !== "false", configured: configuredEnvironment(values, row.engine as HedgeEngine),
    busy: Boolean(row.operationId), heartbeatAt: row.heartbeatAt, status: row.status,
    message: message || (row.status === "RUNNING" ? "Vercel 托管运行中" : "Vercel 引擎已就绪，配置后可启动"),
  };
}

async function invokeWorker(row: RecordRow, input: Record<string, unknown>) {
  const key = process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY;
  if (!key || key.length < 32) throw new HedgeOpsError("服务器加密配置尚未就绪", 503);
  const operationId = randomUUID();
  const claimed = await prisma.hedgeOpsRuntime.updateMany({ where: { id: row.id, operationId: null, status: row.status, generation: row.generation },
    data: { operationId, operationStartedAt: new Date(), workerStartedAt: null } });
  if (!claimed.count) throw new HedgeOpsError("引擎正在处理上一项操作，请稍后刷新确认。", 409);
  // Use the platform's public custom domain. Deployment protection stays on;
  // worker access is independently authenticated by a short-lived body HMAC.
  const base = process.env.VERCEL === "1" ? "https://www.welinkbtc-onchainmain.xyz" : process.env.HEDGE_OPS_WORKER_DEV_URL || "http://127.0.0.1:8012";
  const body = JSON.stringify({ id: row.id, operationId, engine: row.engine, ...input });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", key).update(`hedge-worker-v1:${timestamp}:${body}`).digest("hex");
  try {
    const response = await fetch(`${base}/api/hedge_${row.engine}`, { method: "POST", body, redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Hedge-Timestamp": timestamp, "X-Hedge-Signature": signature },
      signal: AbortSignal.timeout(285_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "云端引擎执行失败");
    // Worker commits the SQLite snapshot and clears its claim before replying.
    return result;
  } catch {
    // A lost response may follow a filled order. Persist the failure and retain
    // the claim: neither the workflow nor another request may repeat that order.
    const mayHaveOrdered = valuesOf(row).DRY_RUN === "false" && (["cycle", "emergency-drain"].includes(String(input.action)) || input.action === "request" && input.path === "cycle");
    await prisma.hedgeOpsRuntime.updateMany({ where: { id: row.id, operationId }, data: mayHaveOrdered ? {
      status: "REVIEW_REQUIRED", lastError: "执行响应未确认，已暂停自动下单。请核对交易所持仓和运行记录后联系管理员恢复。",
    } : { operationId: null, operationStartedAt: null, workerStartedAt: null, lastError: "云端连接暂不可用，请检查网络后重试。" } });
    throw new HedgeOpsError("云端执行结果待确认，请刷新持仓和日志；系统已阻止重复提交。", 503);
  }
}

export async function hostedHedgeRequest(userId: string, engine: HedgeEngine, endpoint: string, init: Init = {}) {
  let row = await ensureRuntime(userId, engine);
  const values = valuesOf(row);
  const method = init.method || "GET";
  const payload = init.body ? JSON.parse(init.body) : {};
  if (method !== "GET" && values.DRY_RUN === "false" && !init.liveAuthorized) throw new HedgeOpsError("实盘需要管理员与双重验证授权", 403);
  if (endpoint === "runtime" && method === "GET") return json(hostedRuntimeView(row));
  if (endpoint === "runtime" && method === "POST" && payload.action === "emergency-prepare") {
    if (row.status === "STOPPED" && !row.operationId) return json({ engine, phase: "stopped", message: "未运行" });
    if (row.status === "DRAINING" && row.runId) return json({ engine, phase: "draining", message: row.lastError || "撤单平仓中" });
    const generation = randomUUID();
    const claimed = await prisma.hedgeOpsRuntime.updateMany({ where: { id: row.id, status: row.status, generation: row.generation },
      data: { status: "DRAINING", generation, lastError: "已请求全部停撤平；等待当前执行完成后核对撤单和平仓" } });
    if (!claimed.count) throw new HedgeOpsError("状态正在变化，请刷新停撤平结果", 409);
    // Preserve any existing execution claim. A possibly submitted order may
    // never be retried by clearing the claim or cancelling its worker.
    try {
      const run = await start(hostedHedgeWorkflow, [row.id, generation]);
      await prisma.hedgeOpsRuntime.updateMany({ where: { id: row.id, generation }, data: { runId: run.runId } });
    } catch {
      await prisma.hedgeOpsRuntime.updateMany({ where: { id: row.id, generation }, data: { lastError: "停撤平已锁定开仓，调度未确认，请再次点击全部强制停止以恢复调度", runId: null } });
      throw new HedgeOpsError("停撤平调度未确认；开仓已锁定，请刷新结果", 503);
    }
    return json({ engine, phase: "draining", message: "已禁止开仓，后台逐步撤单、平仓并停止" });
  }
  if (endpoint === "config") {
    if (method === "PUT") {
      if (row.status !== "STOPPED" || row.operationId) throw new HedgeOpsError("请先停用任务、确认空仓并停止引擎，再修改配置", 409);
      let merged: Environment;
      try {
        merged = updateEnvironment(engine, values, payload);
        for (const key of Object.keys(merged).filter(key => key.endsWith("_PROXY"))) {
          const proxy = merged[key];
          merged[key] = proxy && proxy !== "direct" ? normalizeTradingProxy(proxy) : "";
          if (merged[key]) {
            const url = new URL(merged[key]);
            if (url.pathname !== "/" || url.search || url.hash || url.hostname.startsWith("[")) throw new Error("代理仅支持公网 HTTP/HTTPS 主机与端口");
          }
        }
      } catch (error) { throw new HedgeOpsError(error instanceof Error ? error.message : "配置无效"); }
      if (merged.DRY_RUN === "false" && (!init.liveAuthorized || payload.liveAcknowledged !== true || !configuredEnvironment(merged, engine))) throw new HedgeOpsError("实盘需要完整交易凭据及明确授权", 403);
      const updated = await prisma.hedgeOpsRuntime.updateMany({ where: { id: row.id, status: "STOPPED", operationId: null, updatedAt: row.updatedAt },
        data: { configEncrypted: encryptTradingSecret(JSON.stringify(merged)), lastError: null } });
      if (!updated.count) throw new HedgeOpsError("配置状态已变化，请重新读取", 409);
      row = await ensureRuntime(userId, engine);
    }
    return json(environmentView(engine, valuesOf(row), row.status !== "STOPPED" || Boolean(row.operationId)));
  }
  if (row.status === "REVIEW_REQUIRED" && method !== "GET") throw new HedgeOpsError(row.lastError || "运行状态需要人工核对", 409);
  if (row.status === "DRAINING" && method !== "GET") throw new HedgeOpsError(row.lastError || "全部停撤平处理中，禁止启动或修改任务", 409);
  if (endpoint === "runtime" && method === "POST") {
    if (payload.action === "stop" || payload.action === "restart") {
      const result = await invokeWorker(row, { action: "safe-stop" });
      if (result.status >= 400) throw new HedgeOpsError(result.data?.detail || "暂时不能停止", result.status);
      row = await ensureRuntime(userId, engine);
      if (payload.action === "stop") return json(hostedRuntimeView(row));
    }
    if (row.status === "RUNNING") return json(hostedRuntimeView(row));
    if (values.DRY_RUN === "false" && payload.liveAcknowledged !== true) throw new HedgeOpsError("启动实盘前请确认真实下单提示");
    const released = await invokeWorker(row, { action: "release-emergency" });
    if (released.status >= 400) throw new HedgeOpsError("停撤平锁定尚未解除，请刷新核对", 409);
    row = await ensureRuntime(userId, engine);
    const generation = randomUUID();
    const claimed = await prisma.$transaction(async tx => {
      if (values.DRY_RUN === "false") {
        const own = sharedHedgeResources(engine,values);
        const active = await tx.hedgeOpsRuntime.findMany({where:{userId,engine:{not:engine},status:{not:"STOPPED"}}});
        for (const other of active) {
          if (![engine,other.engine].some(e => ["binance_okx","binance_hyperliquid","hyperliquid_lighter","ondoperps_entropy","ondoperps_ondoperps"].includes(e))) continue;
          const config: Environment = JSON.parse(decryptTradingSecret(other.configEncrypted));
          if (config.DRY_RUN === "false" && sharedHedgeResources(other.engine,config).some(r => own.includes(r))) throw new HedgeOpsError("另一个控制台正在使用此资金账户或签名凭据；请使用独立子账户和专用 API agent",409);
        }
      }
      return tx.hedgeOpsRuntime.updateMany({ where: { id: row.id, status: "STOPPED", operationId: null }, data: { status: "RUNNING", generation, lastError: null } });
    },{isolationLevel:"Serializable"});
    if (!claimed.count) throw new HedgeOpsError("状态已变化，请刷新确认", 409);
    try {
      const run = await start(hostedHedgeWorkflow, [row.id, generation]);
      await prisma.hedgeOpsRuntime.updateMany({ where: { id: row.id, generation }, data: { runId: run.runId } });
    } catch {
      await prisma.hedgeOpsRuntime.updateMany({ where: { id: row.id, generation, operationId: null }, data: { status: "STOPPED", generation: null, lastError: "托管任务启动失败，请重试" } });
      throw new HedgeOpsError("托管任务启动失败，请刷新后重试", 503);
    }
    return json(hostedRuntimeView(await ensureRuntime(userId, engine)));
  }
  if (endpoint === "network") {
    const result = await invokeWorker(row, { action: "network" });
    if (result.status >= 400) throw new HedgeOpsError(result.data?.detail || "网络检测失败", result.status);
    return json(result.data);
  }
  const path = endpoint.replace(/^api\//, "");
  const cached = row.views && typeof row.views === "object" ? (row.views as Record<string, unknown>)[path] : undefined;
  if (method === "GET" && cached && !new URLSearchParams(init.query).has("refresh")) return json(cached);
  if (method !== "GET" && path === "cycle" && row.status !== "RUNNING") throw new HedgeOpsError("请先启动引擎");
  const result = await invokeWorker(row, { action: "request", path, method, query: init.query || "", payload });
  if (result.status >= 400) throw new HedgeOpsError(result.data?.detail || "操作失败", result.status);
  return json(result.data);
}

export async function hostedHedgeTick(id: string, generation: string) {
  const row = await prisma.hedgeOpsRuntime.findUnique({ where: { id } });
  if (!row || !["RUNNING", "DRAINING"].includes(row.status) || row.generation !== generation) return { stop: true, delay: 20_000 };
  if (row.operationId) {
    if (row.operationStartedAt && Date.now() - row.operationStartedAt.getTime() > 310_000) {
      await prisma.hedgeOpsRuntime.updateMany({ where: { id, operationId: row.operationId }, data: { status: "REVIEW_REQUIRED", lastError: "上一轮运行未正常结束，请核对交易所持仓后恢复。" } });
      return { stop: true, delay: 20_000 };
    }
    return { stop: false, delay: 5_000 };
  }
  try { await invokeWorker(row, { action: row.status === "DRAINING" ? "emergency-drain" : "cycle" }); } catch { /* Persistent status prevents blind retries. */ }
  return { stop: false, delay: Math.max(5, Number(valuesOf(row).ENGINE_CYCLE_SECONDS) || 20) * 1000 };
}

export async function rotateHostedHedgeRun(id: string, generation: string) {
  const row = await prisma.hedgeOpsRuntime.findUnique({ where: { id } });
  if (!row || !["RUNNING", "DRAINING"].includes(row.status) || row.generation !== generation) return;
  const next = await start(hostedHedgeWorkflow, [id, generation]);
  await prisma.hedgeOpsRuntime.updateMany({ where: { id, generation, status: { in: ["RUNNING", "DRAINING"] } }, data: { runId: next.runId } });
}
