import { canHedgeLiveOperate, hedgeErrorResponse, HedgeOpsError, requireHedgeLiveOperator, requireHedgeOperator, requireHedgeSameOrigin } from "@/lib/hedge-ops/access";
import { allowedHedgeEndpoint, parseHedgeEngine } from "@/lib/hedge-ops/protocol";
import { hedgeRuntime, hedgeServiceRequest } from "@/lib/hedge-ops/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
type Context = { params: Promise<{ engine: string; path: string[] }> };

async function handle(request: Request, context: Context) {
  try {
    const viewer = await requireHedgeOperator();
    const params = await context.params;
    const engine = parseHedgeEngine(params.engine);
    if (!allowedHedgeEndpoint(request.method, params.path)) throw new HedgeOpsError("未支持的对冲接口", 404);
    const write = request.method !== "GET";
    if (write) {
      requireHedgeSameOrigin(request);
      if (!(await hedgeRuntime(viewer.id, engine)).dryRun) requireHedgeLiveOperator(viewer);
    }
    const body = write ? await request.text() : undefined;
    if (body && body.length > 16_384) throw new HedgeOpsError("请求内容过长", 413);
    return await hedgeServiceRequest(viewer.id, engine, `api/${params.path.map(encodeURIComponent).join("/")}`, {
      method: request.method, body: body || undefined, query: new URL(request.url).search, liveAuthorized: canHedgeLiveOperate(viewer),
    });
  } catch (error) { return hedgeErrorResponse(error); }
}
export { handle as GET, handle as POST, handle as DELETE };
