import { z } from "zod";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { getLivePnlSummary } from "@/lib/alpha-execution/pnl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const viewer = await requireAlphaOperator();
    const market = z.enum(["spot", "futures"]).parse(new URL(request.url).searchParams.get("market") || "futures");
    return Response.json({ ok: true, ...(await getLivePnlSummary(viewer.id, market)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { return alphaExecutionErrorResponse(caught); }
}
