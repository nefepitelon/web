import { getStmMarketSnapshot, isStmMarketSymbol } from "@/lib/stm-hunt/market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const symbol = query.has("symbol") ? query.get("symbol") : "BTCUSDT";
  if ([...query.keys()].some(key => key !== "symbol") || query.getAll("symbol").length > 1 || !isStmMarketSymbol(symbol)) {
    return Response.json({ error: "仅接受一个大写 USDT 交易对，例如 ?symbol=BTCUSDT" }, { status: 400, headers });
  }
  return Response.json(await getStmMarketSnapshot(symbol), { headers });
}
