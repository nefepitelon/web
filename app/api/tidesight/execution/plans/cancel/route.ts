import { z } from "zod";
import { tideSightExecutionErrorResponse, requireTideSightOperator } from "@/lib/tidesight/execution/access";
import { cancelExecutionPlan } from "@/lib/tidesight/execution/service";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ planId: z.string().trim().min(4).max(80), confirmation: z.literal("CANCEL_PENDING_PLAN") });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireTideSightOperator();
    const input = schema.parse(await request.json());
    return Response.json(await cancelExecutionPlan(input.planId, viewer.id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}

