import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { auditCsvResponse, auditQuerySchema, readAuditPage } from "@/lib/alpha-execution/audit-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const viewer = await requireAlphaOperator();
    const query = auditQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (query.format === "csv") return await auditCsvResponse(viewer.id, query);
    return Response.json({ ok: true, ...(await readAuditPage(viewer.id, query)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) { return alphaExecutionErrorResponse(caught); }
}
