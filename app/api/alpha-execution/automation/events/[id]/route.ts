import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { automationEventDetails } from "@/lib/alpha-execution/automation-event-details";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = await requireAlphaOperator();
    const { id } = await context.params;
    const event = /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? await automationEventDetails(viewer.id, id) : null;
    return Response.json(event ? { ok: true, ...event } : { ok: false, message: "记录不存在" }, {
      status: event ? 200 : 404, headers: { "Cache-Control": "private, no-store" },
    });
  } catch (caught) { return alphaExecutionErrorResponse(caught); }
}
