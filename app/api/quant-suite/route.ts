import { ZodError } from "zod";
import { getViewer } from "@/lib/membership";
import { checkRateLimit } from "@/lib/rate-limit";
import { quantCommandSchema } from "@/lib/quant-suite/validation";
import { QuantError } from "@/lib/quant-suite/gateway";
import { executeQuantCommand, getQuantSuite } from "@/lib/quant-suite/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const headers = {"Cache-Control": "private, no-store"};
function failure(error: unknown) {
  const status = error instanceof QuantError ? error.status : error instanceof ZodError ? 400 : 503;
  const message = error instanceof QuantError ? error.message : error instanceof ZodError ? "请检查配置字段、交易品种和操作编号。" : "量化服务暂时不可用，请稍后重试。";
  return Response.json({ok: false, error: message, message}, {status, headers});
}
export async function GET() {
  try { return Response.json(await getQuantSuite(await getViewer()), {headers}); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new QuantError("请从本系统页面提交操作。", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new QuantError("需要 JSON 请求。", 415);
    const viewer = await getViewer();
    if (!viewer) throw new QuantError("请先登录。", 401);
    const limit = await checkRateLimit(`quant-suite:${viewer.id}`, 30, 60000);
    if (!limit.allowed) throw new QuantError("操作过于频繁，请稍后重试。", 429);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16384) throw new QuantError("请求内容过大。", 413);
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new QuantError("JSON 格式不正确。"); }
    return Response.json(await executeQuantCommand(viewer, quantCommandSchema.parse(value)), {headers});
  } catch (error) { return failure(error); }
}
