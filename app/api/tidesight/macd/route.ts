import { getMacdPayload } from "@/lib/tidesight/macd-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    return Response.json(await getMacdPayload(), { headers: { "Cache-Control": "public, s-maxage=45, stale-while-revalidate=15" } });
  } catch (caught) {
    return Response.json({ ok: false, error: caught instanceof Error ? caught.message : "MACD 数据暂不可用", monitors: [], failures: [] }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
