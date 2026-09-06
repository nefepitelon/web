import { z } from "zod";
import { AlphaExecutionMode } from "@prisma/client";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { executePlan } from "@/lib/alpha-execution/service";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ planId: z.string().trim().min(4).max(80), confirmation: z.literal("EXECUTE_APPROVED_PLAN") });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const input = schema.parse(await request.json());
    const plan = await prisma.alphaExecutionPlan.findFirst({ where: { id: input.planId, userId: viewer.id }, select: { environment: true } });
    if (!plan) throw new Error("执行计划不存在");
    if (plan.environment === AlphaExecutionMode.LIVE) await requireAlphaOperator({ live: true });
    const result = await executePlan(input.planId, viewer.id);
    console.info("[alpha-execution/execute] completed", { userId: viewer.id, planId: input.planId, environment: plan.environment, simulated: Boolean(result.simulated) });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    console.error("[alpha-execution/execute] failed", { message: caught instanceof Error ? caught.message : String(caught) });
    return alphaExecutionErrorResponse(caught);
  }
}
