import { z } from "zod";
import { AlphaExecutionMode } from "@prisma/client";
import { tideSightExecutionErrorResponse, requireTideSightOperator } from "@/lib/tidesight/execution/access";
import { executePlan } from "@/lib/tidesight/execution/service";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";
import { start } from "workflow/api";
import { tideSightPositionWorkflow } from "@/lib/tidesight/workflow";

export const maxDuration = 300;

const schema = z.object({ planId: z.string().trim().min(4).max(80), confirmation: z.literal("EXECUTE_APPROVED_PLAN") });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireTideSightOperator();
    const input = schema.parse(await request.json());
    const plan = await prisma.tideSightExecutionPlan.findFirst({ where: { id: input.planId, userId: viewer.id }, select: { environment: true } });
    if (!plan) throw new Error("执行计划不存在");
    if (plan.environment === AlphaExecutionMode.LIVE) await requireTideSightOperator({ live: true });
    if (plan.environment === AlphaExecutionMode.LIVE) await start(tideSightPositionWorkflow, [viewer.id, input.planId]);
    const result = await executePlan(input.planId, viewer.id);
    console.info("[tidesight/execution/execute] completed", { userId: viewer.id, planId: input.planId, environment: plan.environment, simulated: Boolean(result.simulated) });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    console.error("[tidesight/execution/execute] failed", { message: caught instanceof Error ? caught.message : String(caught) });
    return tideSightExecutionErrorResponse(caught);
  }
}
