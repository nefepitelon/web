import { canHedgeLiveOperate, hedgeErrorResponse, HedgeOpsError, requireHedgeLiveOperator, requireHedgeOperator, requireHedgeSameOrigin } from "@/lib/hedge-ops/access";
import { HEDGE_PAIRS, parseHedgeEngine } from "@/lib/hedge-ops/protocol";
import { hedgeRuntime, hedgeServiceRequest } from "@/lib/hedge-ops/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const viewer = await requireHedgeOperator();
    const engine = parseHedgeEngine(new URL(request.url).searchParams.get("engine") || "lighter");
    try {
      return Response.json(await hedgeRuntime(viewer.id, engine), { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      if (!(error instanceof HedgeOpsError) || error.status !== 503) throw error;
      return Response.json({ available: false, running: false, engine, pair: HEDGE_PAIRS[engine], dryRun: true, configured: false, message: error.message }, { headers: { "Cache-Control": "private, no-store" } });
    }
  } catch (error) { return hedgeErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    requireHedgeSameOrigin(request);
    const viewer = await requireHedgeOperator();
    const body = await request.json();
    const engine = parseHedgeEngine(body.engine);
    if (!["start", "stop", "restart"].includes(body.action)) throw new HedgeOpsError("未知引擎操作");
    const state = await hedgeRuntime(viewer.id, engine);
    if (!state.dryRun) requireHedgeLiveOperator(viewer);
    return await hedgeServiceRequest(viewer.id, engine, "runtime", { method: "POST", body: JSON.stringify({ action: body.action, liveAcknowledged: body.liveAcknowledged === true }), liveAuthorized: canHedgeLiveOperate(viewer) });
  } catch (error) { return hedgeErrorResponse(error); }
}
