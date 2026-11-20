import { canHedgeLiveOperate, hedgeErrorResponse, HedgeOpsError, requireHedgeLiveOperator, requireHedgeOperator, requireHedgeSameOrigin } from "@/lib/hedge-ops/access";
import { HEDGE_ENGINES } from "@/lib/hedge-ops/protocol";
import { hedgeRuntime, hedgeServiceRequest } from "@/lib/hedge-ops/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    requireHedgeSameOrigin(request);
    const viewer = await requireHedgeOperator();
    if ((await request.json()).acknowledged !== true) throw new HedgeOpsError("请确认全部运行程序停撤平");
    // Check all privileges before issuing any mutation. Account/owner isolation
    // follows the same runtime path as individual start/stop operations.
    const states = await Promise.allSettled(HEDGE_ENGINES.map(engine => hedgeRuntime(viewer.id, engine)));
    if (states.some(state => state.status === "rejected" || !state.value.dryRun)) requireHedgeLiveOperator(viewer);
    const results = await Promise.all(HEDGE_ENGINES.map(async engine => {
      try {
        const response = await hedgeServiceRequest(viewer.id, engine, "runtime", { method: "POST", body: JSON.stringify({ action: "emergency-prepare" }), liveAuthorized: canHedgeLiveOperate(viewer) });
        return { engine, ...(await response.json()) };
      } catch (error) { return { engine, phase: "unknown", message: error instanceof HedgeOpsError ? error.message : "停撤平请求未确认，请刷新核对" }; }
    }));
    return Response.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return hedgeErrorResponse(error); }
}
