import "server-only";
import { z } from "zod";
import type { QuantConfig } from "./validation";
import type { QuantEngineId } from "./catalog";

export class QuantError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const metricValue = z.union([z.number().finite(), z.string().max(160), z.null()]);
const row = z.record(z.string().max(60), metricValue);
export const runtimeSchema = z.object({
  state: z.enum(["unconfigured", "offline", "ready", "running", "error"]),
  version: z.string().max(120).optional(), message: z.string().max(1500).optional(),
  capabilities: z.array(z.string().max(40)).max(20).optional(),
  positions: z.array(row).max(500).optional(), orders: z.array(row).max(500).optional(),
  metrics: z.record(z.string().max(60), metricValue).optional(),
  job: z.object({requestId: z.string().max(100), action: z.string().max(40), state: z.enum(["pending", "running", "completed", "failed", "missing", "cancelled"]), exitCode: z.number().optional()}).optional(),
});
export type QuantRuntime = z.infer<typeof runtimeSchema>;
export const replySchema = z.object({
  ok: z.boolean(), runtime: runtimeSchema.optional(), message: z.string().max(2000).optional(),
  blockers: z.array(z.string().max(1500)).max(40).optional(),
  result: z.unknown().optional(),
});
export type GatewayReply = z.infer<typeof replySchema>;
export function gatewayConfigured() { return Boolean(process.env.QUANT_GATEWAY_URL && process.env.QUANT_GATEWAY_TOKEN); }
export function unavailableRuntime(configured = gatewayConfigured()): QuantRuntime {
  return { state: configured ? "offline" : "unconfigured", capabilities: [], message: configured ? "交易服务器暂时无法连接，请检查服务状态。" : "尚未连接交易服务器。配置已保存在本系统，连接引擎后可执行任务。" };
}

export async function gatewayCommand(input: {userId: string; engine: QuantEngineId; action: string; config: QuantConfig; requestId: string; targetAction?: string; controlSequence?: number}): Promise<GatewayReply> {
  if (!gatewayConfigured()) throw new QuantError("尚未配置交易服务器：需要 QUANT_GATEWAY_URL 与 QUANT_GATEWAY_TOKEN。", 503);
  const url = new URL(process.env.QUANT_GATEWAY_URL!);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.search || url.hash) throw new QuantError("交易服务器地址必须使用 HTTPS，且不能包含凭据或查询参数。", 503);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/command`;
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.QUANT_GATEWAY_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(input.action === "status" ? 5000 : input.action === "stop" ? 150000 : 20000) });
  } catch { throw new QuantError("交易服务器未返回确认；操作状态未知，请检查运行记录，勿重复启动。", 502); }
  if (!response.body) throw new QuantError("交易服务器返回空响应。", 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) { await reader.cancel(); throw new Error("limit"); }
      chunks.push(value);
    }
    const data = replySchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!response.ok && data.ok) throw new Error("inconsistent");
    return data;
  } catch { throw new QuantError("交易服务器响应不完整或格式不正确，请检查运行记录。", 502); }
}
