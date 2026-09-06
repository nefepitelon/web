import { TIDESIGHT_FEATURED_MARKETS } from "@/lib/tidesight/market-universe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;

type PremiumIndex = {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
};

type Ticker24h = {
  symbol: string;
  priceChangePercent: string;
  quoteVolume: string;
  lastPrice: string;
  closeTime: number;
};

async function binanceJson<T>(path: string, signal: AbortSignal) {
  const response = await fetch(`https://fapi.binance.com${path}`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json", "User-Agent": "WELINKBTC-TideSight/1.0" },
  });
  if (!response.ok) throw new Error(`Binance Futures ${response.status}`);
  return response.json() as Promise<T>;
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const [premiumRows, tickerRows] = await Promise.all([
      binanceJson<PremiumIndex[]>("/fapi/v1/premiumIndex", controller.signal),
      binanceJson<Ticker24h[]>("/fapi/v1/ticker/24hr", controller.signal),
    ]);
    const premiumBySymbol = new Map(premiumRows.map((row) => [row.symbol, row]));
    const tickerBySymbol = new Map(tickerRows.map((row) => [row.symbol, row]));
    const markets = TIDESIGHT_FEATURED_MARKETS.map(({ symbol, asset }) => {
      const premium = premiumBySymbol.get(symbol);
      const ticker = tickerBySymbol.get(symbol);
      if (!premium || !ticker) throw new Error(`Binance Futures 缺少 ${symbol} 行情`);
      return {
        symbol,
        asset,
        markPrice: Number(premium.markPrice),
        indexPrice: Number(premium.indexPrice),
        fundingRate: Number(premium.lastFundingRate),
        fundingAnnualizedPct: Number(premium.lastFundingRate) * 3 * 365 * 100,
        nextFundingTime: new Date(premium.nextFundingTime).toISOString(),
        priceChange24hPct: Number(ticker.priceChangePercent),
        quoteVolume24h: Number(ticker.quoteVolume),
      };
    });
    return Response.json({ ok: true, source: "BINANCE_FUTURES", universe: "TIDESIGHT_FEATURED_12", checkedAt: new Date().toISOString(), markets }, {
      headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
    });
  } catch (caught) {
    const message = caught instanceof Error && caught.name === "AbortError"
      ? "Binance 市场数据请求超时"
      : caught instanceof Error ? caught.message : "市场数据暂不可用";
    return Response.json({ ok: false, error: message, markets: [] }, {
      status: 502,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } finally {
    clearTimeout(timeout);
  }
}
