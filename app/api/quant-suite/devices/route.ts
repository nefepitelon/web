import { ZodError } from "zod";
import { getViewer } from "@/lib/membership";
import { checkRateLimit } from "@/lib/rate-limit";
import { QuantError } from "@/lib/quant-suite/gateway";
import { listDevices, pairDevice, revokeDevice, pairDeviceSchema, revokeDeviceSchema } from "@/lib/quant-suite/devices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"};
function failure(error: unknown) {
  return Response.json({ok: false, message: error instanceof QuantError ? error.message : error instanceof ZodError ? "设备名称、引擎范围或设备编号无效。" : "设备管理暂时不可用。"}, {status: error instanceof QuantError ? error.status : error instanceof ZodError ? 400 : 503, headers});
}
async function input(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new QuantError("请从本系统页面管理设备。", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new QuantError("需要 JSON 请求。", 415);
  const viewer = await getViewer();
  if (!viewer) throw new QuantError("请先登录。", 401);
  if (!(await checkRateLimit(`quant-device:${viewer.id}`, 12, 60000)).allowed) throw new QuantError("设备操作过于频繁，请稍后重试。", 429);
  if (!request.body) throw new QuantError("请求为空。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    length += part.value.byteLength;
    if (length > 4096) {await reader.cancel(); throw new QuantError("设备请求内容过大。", 413);}
    chunks.push(part.value);
  }
  let body: unknown;
  try {body = JSON.parse(Buffer.concat(chunks).toString("utf8"));} catch {throw new QuantError("JSON 格式不正确。");}
  return {viewer, body};
}
export async function GET() {try {return Response.json(await listDevices(await getViewer()), {headers});} catch (error) {return failure(error);}}
export async function POST(request: Request) {try {const {viewer, body} = await input(request); return Response.json(await pairDevice(viewer, pairDeviceSchema.parse(body)), {status: 201, headers});} catch (error) {return failure(error);}}
export async function DELETE(request: Request) {try {const {viewer, body} = await input(request); return Response.json(await revokeDevice(viewer, revokeDeviceSchema.parse(body).deviceId), {headers});} catch (error) {return failure(error);}}
