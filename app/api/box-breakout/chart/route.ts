import { getChart, limitRequests } from "@/lib/box-breakout/service";
import { errorResponse, readMarket, validateSymbol } from "@/lib/box-breakout/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, market = readMarket(params);
    const symbol = validateSymbol(params.get("symbol") ?? "", market);
    await limitRequests(request, "chart", 20, undefined, { persistent: false });
    return Response.json(await getChart(symbol, market), { headers: { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400" } });
  } catch (error) { return errorResponse(error); }
}
