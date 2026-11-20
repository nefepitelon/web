import { getPerpdexBoxSnapshot } from "@/lib/perpdex-box-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Public market observations only. This route never reads a trading account or
// forwards caller-supplied URLs, credentials, engine names or order parameters.
export async function GET() {
  try {
    const snapshot = await getPerpdexBoxSnapshot();
    const available = snapshot.exchanges.some(row =>
      row.oiUsd !== null || row.volume24hUsd !== null || row.tvlUsd !== null);
    return Response.json(snapshot, {
      status: available ? 200 : 503,
      headers: {
        "Cache-Control": available
          ? "public, max-age=0, s-maxage=30, stale-while-revalidate=30"
          : "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "公开市场数据暂时不可用，请稍后重试。" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
