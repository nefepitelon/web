import { z } from "zod";
import { tideSightExecutionErrorResponse, requireTideSightOperator } from "@/lib/tidesight/execution/access";
import { marketFrom } from "@/lib/tidesight/execution/data";
import { readLiveReferencePrice } from "@/lib/tidesight/execution/service";

const schema = z.object({
  symbol: z.string().trim().regex(/^[A-Z0-9]{2,30}$/i),
  market: z.enum(["spot", "futures"])
});

export async function GET(request: Request) {
  try {
    await requireTideSightOperator();
    const url = new URL(request.url);
    const input = schema.parse({ symbol: url.searchParams.get("symbol"), market: url.searchParams.get("market") });
    return Response.json(await readLiveReferencePrice(input.symbol, marketFrom(input.market)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}

