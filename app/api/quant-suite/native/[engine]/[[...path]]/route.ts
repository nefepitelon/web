import { randomUUID } from "node:crypto";
import { getViewer } from "@/lib/membership";
import { checkRateLimit } from "@/lib/rate-limit";
import { isQuantEngineId } from "@/lib/quant-suite/catalog";
import { QuantError } from "@/lib/quant-suite/gateway";
import { hasQuantAccess } from "@/lib/quant-suite/validation";
import { executeQuantCommand } from "@/lib/quant-suite/service";
import { nativeRead, nativeReadPath, nativeService } from "@/lib/quant-suite/native";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const headers = {"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"};
type Context = {params: Promise<{engine: string; path?: string[]}>};
function failure(error: unknown) {
  const message = error instanceof QuantError ? error.message : "原版界面连接暂时不可用。";
  return Response.json({ok: false, error: message, detail: message, message}, {status: error instanceof QuantError ? error.status : 503, headers});
}

async function handle(request: Request, context: Context) {
  try {
    const {engine, path = []} = await context.params;
    if (!isQuantEngineId(engine)) throw new QuantError("未知量化引擎。", 404);
    if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) throw new QuantError("请从本站原版工作台提交操作。", 403);
    const viewer = await getViewer();
    if (!viewer) throw new QuantError("请先登录本站。", 401);
    if (!hasQuantAccess(viewer)) throw new QuantError("当前账户没有量化工作台操作权限。", 403);
    const limit = await checkRateLimit(`quant-native:${viewer.id}:${engine}`, 300, 60000);
    if (!limit.allowed) throw new QuantError("原版界面请求过于频繁。", 429);
    const service = nativeService(viewer.id, engine);
    if (!path.length && request.method === "GET") return Response.json({ok: true, engine, connected: Boolean(service?.apiUrl), configured: Boolean(service?.apiUrl), sessionAuthorized: true, uiUrl: service?.uiUrl ?? null, websocketUrl: null, message: service ? "已配置此账户的原版服务映射；数据以引擎实际响应为准。" : "原版前端已集成；此账户的原生执行服务尚未连接。"}, {headers});
    const route = path.join("/");
    // This marker is intentionally not an authorization credential. Every request
    // above is independently authenticated with the existing HttpOnly site session.
    if (engine === "freqtrade" && request.method === "POST" && ["api/v1/token/login", "api/v1/token/refresh"].includes(route)) {
      return Response.json({access_token: "welink-site-session", refresh_token: "welink-site-session", token_type: "bearer"}, {headers});
    }
    if (engine === "freqtrade" && request.method === "POST" && ["api/v1/start", "api/v1/stop"].includes(route)) {
      const requestId = request.headers.get("x-quant-request-id") || randomUUID();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new QuantError("操作编号无效。", 400);
      const result = await executeQuantCommand(viewer, {engine, action: route.endsWith("/start") ? "start" : "stop", requestId, confirmation: request.headers.get("x-quant-confirmation") ?? undefined}) as {ok: boolean; message?: string; queued?: boolean};
      return Response.json({...result, status: result.message ?? (result.ok ? "Command accepted" : "Command rejected")}, {status: result.ok ? 200 : 409, headers});
    }
    if (request.method !== "GET") throw new QuantError("此原版操作尚未接入权限、风控及审计，请使用本站“连接与执行”中已支持的操作。", 501);
    const safePath = nativeReadPath(engine, path);
    if (!service) throw new QuantError("尚未连接此账户的原版引擎 API。", 503);
    return Response.json(await nativeRead(service, safePath, new URL(request.url).searchParams), {headers});
  } catch (error) {return failure(error);}
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const PATCH = handle;
export const PUT = handle;
