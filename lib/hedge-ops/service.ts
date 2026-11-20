import "server-only";
import { redactSecretData, redactSecretText } from "@/lib/secret-redaction";
import fs from "node:fs/promises";
import path from "node:path";
import { HedgeOpsError } from "./access";
import { hedgeOwnerId, safeHedgeServiceUrl, type HedgeEngine } from "./protocol";
import { hostedHedgeRequest } from "./hosted";

export type HedgeRuntime = { available: boolean; running: boolean; engine: HedgeEngine; pair: string; dryRun: boolean; configured: boolean; message?: string };

async function readDevelopmentToken(filename: string) {
  // Resolve only at runtime: the build must never trace a local credential as
  // an application asset (including before production dead-code elimination).
  return fs.readFile(path.resolve(filename), "utf8").then(value => value.trim()).catch(() => "");
}

async function connection() {
  const configuredUrl = process.env.HEDGE_OPS_SERVICE_URL;
  const base = safeHedgeServiceUrl(configuredUrl || "http://127.0.0.1:8010");
  let token = process.env.HEDGE_OPS_SERVICE_TOKEN?.trim();
  // Production must use server environment credentials. Next replaces NODE_ENV
  // at build time, removing this development-only read from production traces.
  if (process.env.NODE_ENV === "development" && !token && !configuredUrl && process.env.VERCEL !== "1") {
    token = await readDevelopmentToken(".runtime/hedge-ops/service-token");
  }
  if (!token || token.length < 32) throw new HedgeOpsError("对冲服务尚未连接。开发环境请运行 npm run hedge:setup 和 npm run hedge:start；生产环境需配置 HEDGE_OPS_SERVICE_TOKEN，并按部署位置配置 HEDGE_OPS_SERVICE_URL。", 503);
  return { base, token };
}

export async function hedgeServiceRequest(userId: string, engine: HedgeEngine, endpoint: string, init: { method?: string; body?: string; query?: string; liveAuthorized?: boolean } = {}) {
  // The platform's Vercel engine is the default. An explicitly configured
  // external gateway remains supported for existing dedicated installations.
  if (!process.env.HEDGE_OPS_SERVICE_URL) return hostedHedgeRequest(userId, engine, endpoint, init);
  const { base, token } = await connection();
  let response: Response;
  try {
    response = await fetch(`${base}/v1/${hedgeOwnerId(userId)}/${engine}/${endpoint}${init.query || ""}`, {
      method: init.method || "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Hedge-Live-Authorized": init.liveAuthorized === true ? "true" : "false" },
      body: init.body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(endpoint === "runtime" ? 45_000 : !["lighter","entropy"].includes(engine) && ["api/cycle", "api/preflight"].includes(endpoint) ? 285_000 : 120_000),
    });
  } catch {
    // Never retry an order-bearing request: a timeout is an unknown outcome.
    throw new HedgeOpsError(init.method && init.method !== "GET"
      ? "对冲服务连接中断，操作结果未知。请刷新任务与持仓确认状态，勿重复提交。"
      : "无法连接对冲引擎服务，请检查服务进程和连接配置。", 503);
  }
  const body = await response.text();
  if (!response.ok) {
    let message = "对冲服务请求失败";
    try { const data = JSON.parse(body); message = String(data.detail || data.message || data.error || message); } catch { /* Don't expose backend pages or credentials. */ }
    throw new HedgeOpsError(redactSecretText(message, [token]), response.status >= 400 && response.status < 600 ? response.status : 502);
  }
  let payload: unknown;
  try { payload = redactSecretData(JSON.parse(body), [token]); }
  catch { throw new HedgeOpsError("对冲服务返回了无法识别的数据", 502); }
  return Response.json(payload, { status: response.status, headers: { "Cache-Control": "private, no-store" } });
}

export async function hedgeRuntime(userId: string, engine: HedgeEngine): Promise<HedgeRuntime> {
  return (await hedgeServiceRequest(userId, engine, "runtime")).json();
}
