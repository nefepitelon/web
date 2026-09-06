import { buildMacdChartSeries, type MacdChartCandle, type MacdChartPoint } from "@/lib/tidesight/macd";
import { TIDESIGHT_MACD_INTERVALS, TIDESIGHT_MACD_MARKETS } from "@/lib/tidesight/market-universe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

type BinanceKline = [number, string, string, string, string, string, number, string, ...unknown[]];

type ChartPayload = {
  ok: true;
  source: "BINANCE_FUTURES_KLINES";
  symbol: string;
  asset: string;
  interval: string;
  intervalZh: string;
  intervalEn: string;
  checkedAt: string;
  candleCount: number;
  availability: "READY" | "INSUFFICIENT_HISTORY";
  parameters: { fast: 12; slow: 26; signal: 9; closedCandlesOnly: true };
  series: MacdChartPoint[];
};

const cache = new Map<string, { expiresAt: number; payload: ChartPayload }>();
const pending = new Map<string, Promise<ChartPayload>>();

async function loadChart(symbol: string, asset: string, timeframe: (typeof TIDESIGHT_MACD_INTERVALS)[number]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe.interval}&limit=260`, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "WELINKBTC-TideSight-MACD-Chart/1.0" },
    });
    if (!response.ok) throw new Error(`Binance Futures ${response.status}`);
    const rows = await response.json() as BinanceKline[];
    const now = Date.now();
    const candles: MacdChartCandle[] = rows
      .filter((row) => Number(row[6]) < now)
      .map((row) => ({
        openTime: Number(row[0]),
        closeTime: Number(row[6]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }));
    const series = buildMacdChartSeries(candles, 120);
    return {
      ok: true,
      source: "BINANCE_FUTURES_KLINES",
      symbol,
      asset,
      interval: timeframe.interval,
      intervalZh: timeframe.zh,
      intervalEn: timeframe.en,
      checkedAt: new Date().toISOString(),
      candleCount: candles.length,
      availability: series.length >= 2 ? "READY" : "INSUFFICIENT_HISTORY",
      parameters: { fast: 12, slow: 26, signal: 9, closedCandlesOnly: true },
      series,
    } satisfies ChartPayload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const symbol = search.get("symbol")?.toUpperCase() ?? "BTCUSDT";
  const interval = search.get("interval") ?? "1d";
  const market = TIDESIGHT_MACD_MARKETS.find((item) => item.symbol === symbol);
  const timeframe = TIDESIGHT_MACD_INTERVALS.find((item) => item.interval === interval);
  if (!market || !timeframe) {
    return Response.json({ ok: false, error: "仅支持 TideSight 的 12 个交易标的与指定 MACD 周期" }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const key = `${market.symbol}:${timeframe.interval}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.payload, { headers: { "Cache-Control": "public, s-maxage=45, stale-while-revalidate=15" } });
  }

  let requestPromise = pending.get(key);
  if (!requestPromise) {
    requestPromise = loadChart(market.symbol, market.asset, timeframe).finally(() => pending.delete(key));
    pending.set(key, requestPromise);
  }
  try {
    const payload = await requestPromise;
    cache.set(key, { expiresAt: Date.now() + 55_000, payload });
    return Response.json(payload, { headers: { "Cache-Control": "public, s-maxage=45, stale-while-revalidate=15" } });
  } catch (caught) {
    const message = caught instanceof Error && caught.name === "AbortError"
      ? "Binance MACD 图表 K 线请求超时"
      : caught instanceof Error ? caught.message : "MACD 图表暂不可用";
    return Response.json({ ok: false, error: message, series: [] }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
