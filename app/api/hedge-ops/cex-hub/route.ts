import { getCexHubSnapshot } from "@/lib/cex-hub-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fixed public market sources only; no account, engine or caller-provided URL.
export async function GET() {
  try {
    const snapshot = await getCexHubSnapshot();
    const available = snapshot.exchanges.some(row => row.spotVolume24hUsd !== null || row.derivativesVolume24hUsd !== null || row.openInterestUsd !== null);
    return Response.json(snapshot, {
      status: available ? 200 : 503,
      headers: {
        "Cache-Control": available ? "public, max-age=0, s-maxage=30, stale-while-revalidate=30" : "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "中心化交易所公开数据暂时不可用，请稍后重试。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
