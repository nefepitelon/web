import { z } from "zod";
import { AlphaExecutionMode } from "@prisma/client";
import { tideSightExecutionErrorResponse, requireTideSightOperator } from "@/lib/tidesight/execution/access";
import { marketFrom, modeFrom } from "@/lib/tidesight/execution/data";
import { preflightCredential } from "@/lib/tidesight/execution/service";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ environment: z.enum(["live"]), market: z.enum(["futures"]) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const environment = modeFrom(input.environment);
    const viewer = await requireTideSightOperator({ live: environment === AlphaExecutionMode.LIVE });
    const result = await preflightCredential(viewer.id, environment, marketFrom(input.market));
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}
