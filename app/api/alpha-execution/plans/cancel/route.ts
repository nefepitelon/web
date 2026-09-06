import { z } from "zod";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { cancelExecutionPlan } from "@/lib/alpha-execution/service";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ planId: z.string().trim().min(4).max(80), confirmation: z.literal("CANCEL_PENDING_PLAN") });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const input = schema.parse(await request.json());
    return Response.json(await cancelExecutionPlan(input.planId, viewer.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
