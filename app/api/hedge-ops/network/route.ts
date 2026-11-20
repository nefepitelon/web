import { canHedgeLiveOperate, hedgeErrorResponse, requireHedgeOperator, requireHedgeSameOrigin } from "@/lib/hedge-ops/access";
import { parseHedgeEngine } from "@/lib/hedge-ops/protocol";
import { hedgeServiceRequest } from "@/lib/hedge-ops/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    requireHedgeSameOrigin(request);
    const viewer = await requireHedgeOperator();
    const engine = parseHedgeEngine(new URL(request.url).searchParams.get("engine"));
    return await hedgeServiceRequest(viewer.id, engine, "network", { method: "POST", body: "{}", liveAuthorized: canHedgeLiveOperate(viewer) });
  } catch (error) { return hedgeErrorResponse(error); }
}
