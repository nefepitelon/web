import { canHedgeLiveOperate, hedgeErrorResponse, HedgeOpsError, requireHedgeLiveOperator, requireHedgeOperator, requireHedgeSameOrigin } from "@/lib/hedge-ops/access";
import { parseHedgeEngine } from "@/lib/hedge-ops/protocol";
import { hedgeRuntime, hedgeServiceRequest } from "@/lib/hedge-ops/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const viewer = await requireHedgeOperator();
    const engine = parseHedgeEngine(new URL(request.url).searchParams.get("engine"));
    return await hedgeServiceRequest(viewer.id, engine, "config");
  } catch (error) { return hedgeErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    requireHedgeSameOrigin(request);
    const viewer = await requireHedgeOperator();
    const engine = parseHedgeEngine(new URL(request.url).searchParams.get("engine"));
    const raw = await request.text();
    if (raw.length > 32_768) throw new HedgeOpsError("配置内容过长", 413);
    const body = JSON.parse(raw);
    if (!body.values || typeof body.values !== "object" || Array.isArray(body.values)) throw new HedgeOpsError("配置格式无效");
    const live = ["false", "0", "no"].includes(String(body.values.DRY_RUN).toLowerCase());
    if (live || !(await hedgeRuntime(viewer.id, engine)).dryRun) requireHedgeLiveOperator(viewer);
    if (live && body.liveAcknowledged !== true) throw new HedgeOpsError("启用实盘前请确认真实下单提示");
    return await hedgeServiceRequest(viewer.id, engine, "config", { method: "PUT", body: JSON.stringify({ values: body.values, clear: body.clear || [], liveAcknowledged: body.liveAcknowledged === true }), liveAuthorized: canHedgeLiveOperate(viewer) });
  } catch (error) { return hedgeErrorResponse(error); }
}
