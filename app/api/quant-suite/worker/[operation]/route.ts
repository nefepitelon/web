import { ZodError } from "zod";
import { QuantError } from "@/lib/quant-suite/gateway";
import { authorizeWorker } from "@/lib/quant-suite/dispatch-auth";
import { dispatchEnabled, claimSchema, beginSchema, heartbeatSchema, completeSchema, claimDispatch, beginDispatch, heartbeatDispatch, completeDispatch } from "@/lib/quant-suite/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"};

async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new QuantError("需要 JSON 请求。", 415);
  if (!request.body) throw new QuantError("请求内容为空。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 262144) { await reader.cancel(); throw new QuantError("执行器请求超过大小限制。", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new QuantError("JSON 格式不正确。"); }
}

export async function POST(request: Request, context: {params: Promise<{operation: string}>}) {
  try {
    if (!dispatchEnabled()) throw new QuantError("Supabase 执行器调度未开启。", 503);
    const binding = await authorizeWorker(request);
    const {operation} = await context.params;
    const body = await readBody(request);
    let result: unknown;
    if (operation === "claim") { claimSchema.parse(body); result = await claimDispatch(binding); }
    else if (operation === "begin") result = await beginDispatch(binding, beginSchema.parse(body));
    else if (operation === "heartbeat") result = await heartbeatDispatch(binding, heartbeatSchema.parse(body));
    else if (operation === "complete") result = await completeDispatch(binding, completeSchema.parse(body));
    else throw new QuantError("执行器操作不存在。", 404);
    return Response.json(result, {headers});
  } catch (error) {
    const status = error instanceof QuantError ? error.status : error instanceof ZodError ? 400 : 503;
    const message = error instanceof QuantError ? error.message : error instanceof ZodError ? "执行器协议字段无效。" : "执行器调度服务暂时不可用。";
    return Response.json({ok: false, message}, {status, headers});
  }
}
