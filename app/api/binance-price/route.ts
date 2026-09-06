import { z } from "zod";
import { getLiveBinanceReferencePrice } from "@/lib/alpha-execution/binance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  symbol: z.string().trim().regex(/^[A-Z0-9]{2,30}$/i),
  market: z.enum(["spot", "futures"]).default("futures")
});

function noStoreJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache"
    }
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = schema.parse({
      symbol: url.searchParams.get("symbol"),
      market: url.searchParams.get("market") || "futures"
    });
    const symbol = input.symbol.toUpperCase().endsWith("USDT")
      ? input.symbol.toUpperCase()
      : `${input.symbol.toUpperCase()}USDT`;
    const markets = input.market === "futures"
      ? (["futures", "spot"] as const)
      : (["spot", "futures"] as const);

    let lastError: unknown = null;
    for (const market of markets) {
      try {
        const price = await getLiveBinanceReferencePrice(market, symbol);
        return noStoreJson({
          ok: true,
          symbol,
          market,
          price,
          source: "BINANCE_LIVE",
          checkedAt: new Date().toISOString()
        });
      } catch (caught) {
        lastError = caught;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`Binance 未返回 ${symbol} 的有效实时价格`);
  } catch (caught) {
    const message = caught instanceof z.ZodError
      ? (caught.issues[0]?.message || "币种参数无效")
      : caught instanceof Error
        ? caught.message
        : "Binance 实时价格读取失败";
    return noStoreJson({ ok: false, error: message, message }, 400);
  }
}
