import { z } from "zod";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { closeLivePosition, replaceLivePositionProtection } from "@/lib/alpha-execution/service";
import { assertSameOrigin } from "@/lib/request-security";

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
    const viewer = await requireAlphaOperator({ live: true });
    const input = schema.parse(await request.json());
    const result = input.action === "close"
      ? await closeLivePosition(input.positionId, viewer.id)
      : await replaceLivePositionProtection(input.positionId, viewer.id, input.stopLoss, input.takeProfit);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
