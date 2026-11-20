import { z } from "zod";
import { alphaExecutionErrorResponse, requireAlphaReadOperator } from "@/lib/alpha-execution/access";
import { getLivePnlSummary } from "@/lib/alpha-execution/pnl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const viewer = await requireAlphaReadOperator();
    const params = new URL(request.url).searchParams;
    const market = z.enum(["spot", "futures"]).parse(params.get("market") || "futures");
    const refresh = z.enum(["0", "1"]).parse(params.get("refresh") || "0") === "1";
    const summary = await getLivePnlSummary(viewer.id, market, { refresh });
    // Log aggregate coverage/error categories only. Never log credentials,
    // account identifiers, signed URLs, transaction rows, or financial amounts.
    console.info("[alpha:pnl]", { market, status: summary.status, coverageComplete: summary.coverageComplete,
      pagesRead: summary.pagesRead, requestsMade: summary.requestsMade, retries: summary.retries,
      readFailure: summary.readFailure, dataQuality: summary.dataQuality });
    return Response.json({ ok: true, ...summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { return alphaExecutionErrorResponse(caught); }
}
