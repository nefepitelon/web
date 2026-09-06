import { z } from "zod";
import { tideSightExecutionErrorResponse, requireTideSightOperator } from "@/lib/tidesight/execution/access";
import { closeLivePosition, replaceLivePositionProtection } from "@/lib/tidesight/execution/service";
import { assertSameOrigin } from "@/lib/request-security";
import { withExecutionLease } from "@/lib/tidesight/execution/lease";

export const maxDuration = 300;

const closeSchema = z.object({
  positionId: z.string().trim().min(4).max(80),
  action: z.literal("close"),
  confirmation: z.literal("CLOSE_POSITION_NOW")
});
const protectionSchema = z.object({
  positionId: z.string().trim().min(4).max(80),
  action: z.literal("replace_protection"),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  confirmation: z.literal("REPLACE_PROTECTION")
});
const schema = z.discriminatedUnion("action", [closeSchema, protectionSchema]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireTideSightOperator({ live: true });
    const input = schema.parse(await request.json());
    const result = await withExecutionLease(viewer.id, async () => input.action === "close"
      ? await closeLivePosition(input.positionId, viewer.id)
      : await replaceLivePositionProtection(input.positionId, viewer.id, input.stopLoss, input.takeProfit));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}
