import { getBinanceSquareSnapshot } from "@/lib/binance-square-radar";

export const runtime = "nodejs";

export async function GET() {
  const snapshot = await getBinanceSquareSnapshot();
  return Response.json(snapshot, {
    headers: {
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
      "X-Content-Type-Options": "nosniff",
      "X-Radar-Mode": snapshot.degraded ? "degraded" : "live",
    },
  });
}
