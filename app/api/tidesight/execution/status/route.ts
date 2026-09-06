import { tideSightExecutionErrorResponse, requireTideSightOperator } from "@/lib/tidesight/execution/access";
import { executionSnapshot } from "@/lib/tidesight/execution/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await requireTideSightOperator();
    return Response.json({ ok: true, ...(await executionSnapshot(viewer.id)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}

