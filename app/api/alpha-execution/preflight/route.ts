import { z } from "zod";
import { AlphaExecutionMode } from "@prisma/client";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { marketFrom, modeFrom } from "@/lib/alpha-execution/data";
import { preflightCredential } from "@/lib/alpha-execution/service";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({ environment: z.enum(["testnet", "live"]), market: z.enum(["spot", "futures"]) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = schema.parse(await request.json());
    const environment = modeFrom(input.environment);
    const viewer = await requireAlphaOperator({ live: environment === AlphaExecutionMode.LIVE });
    const result = await preflightCredential(viewer.id, environment, marketFrom(input.market));
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
