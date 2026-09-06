import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { executionSnapshot } from "@/lib/alpha-execution/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await requireAlphaOperator();
    return Response.json({ ok: true, ...(await executionSnapshot(viewer.id)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
