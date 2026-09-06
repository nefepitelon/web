import { z } from "zod";
import { AlphaExecutionMode } from "@prisma/client";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { marketFrom, modeFrom } from "@/lib/alpha-execution/data";
import { reconcileExecution } from "@/lib/alpha-execution/service";
import { assertSameOrigin } from "@/lib/request-security";

export const maxDuration = 60;

const schema = z.object({
  environment: z.enum(["testnet", "live"]).optional(),
  market: z.enum(["spot", "futures"]).optional()
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  console.log(JSON.stringify({ level: "info", msg: "start", route: "/api/alpha-execution/reconcile", requestId }));
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const raw = await request.json().catch(() => ({}));
    const input = schema.parse(raw);
    const environment = input.environment ? modeFrom(input.environment) : undefined;
    if (environment === AlphaExecutionMode.LIVE) await requireAlphaOperator({ live: true });
    const result = await reconcileExecution(viewer.id, {
      environment,
      market: input.market ? marketFrom(input.market) : undefined
    });
    console.log(JSON.stringify({ level: "info", msg: "done", route: "/api/alpha-execution/reconcile", ok: result.ok, reconciled: result.reconciled, errors: result.errors.length, ms: Date.now() - startedAt, requestId }));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    console.error(JSON.stringify({ level: "error", msg: "failed", route: "/api/alpha-execution/reconcile", error: caught instanceof Error ? caught.message : String(caught), ms: Date.now() - startedAt, requestId }));
    return alphaExecutionErrorResponse(caught);
  }
}
