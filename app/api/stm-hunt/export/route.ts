import { alphaExecutionErrorResponse, requireAlphaReadOperator } from "@/lib/alpha-execution/access";
import { getStmDashboard } from "@/lib/stm-hunt/service";
import { stmDashboardCsv } from "@/lib/stm-hunt/export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const viewer = await requireAlphaReadOperator();
    const data = await getStmDashboard(viewer.id);
    const format = new URL(request.url).searchParams.get("format") || "json";
    if (!["json", "csv"].includes(format)) return Response.json({ error: "仅支持 JSON 或 CSV" }, { status: 400 });
    const filename = `STM-hunt-${new Date().toISOString().slice(0, 10)}.${format}`;
    const headers = { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="${filename}"`, "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8" };
    return new Response(format === "csv" ? stmDashboardCsv(data) : JSON.stringify({ version: "1.2.0", exportedAt: new Date().toISOString(), ...data }, null, 2), { headers });
  } catch (error) { return alphaExecutionErrorResponse(error); }
}
