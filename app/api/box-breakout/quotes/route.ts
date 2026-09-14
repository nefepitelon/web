import { getQuotes, limitRequests } from "@/lib/box-breakout/service";
import { errorResponse, readSymbols } from "@/lib/box-breakout/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { market, symbols } = readSymbols(new URL(request.url).searchParams);
    await limitRequests(request, "quotes", 80);
    return Response.json(await getQuotes(symbols, market), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
