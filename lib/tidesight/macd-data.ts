import { calculateMacd, classifyMacdCross, findLatestMacdCross } from "@/lib/tidesight/macd";
import { TIDESIGHT_MACD_INTERVALS, TIDESIGHT_MACD_MARKETS } from "@/lib/tidesight/market-universe";


type BinanceKline = [number, string, string, string, string, string, number, ...unknown[]];

export type MacdMonitor = {
  symbol: string;
  asset: string;
  interval: string;
  intervalZh: string;
  intervalEn: string;
  closedAt: string;
  closePrice: number;
  dif: number;
  dea: number;
  histogram: number;
  relation: "BULLISH" | "BEARISH";
  signal: ReturnType<typeof classifyMacdCross>;
  lastCross: {
    signal: Exclude<ReturnType<typeof classifyMacdCross>, "NONE">;
    closedAt: string;
    barsAgo: number;
    dif: number;
    dea: number;
  } | null;
};

export type MacdPayload = {
  ok: true;
  source: "BINANCE_FUTURES_KLINES";
  checkedAt: string;
  parameters: { fast: 12; slow: 26; signal: 9; closedCandlesOnly: true };
  monitors: MacdMonitor[];
  failures: Array<{ symbol: string; interval: string; error: string }>;
};

let cached: { expiresAt: number; payload: MacdPayload } | null = null;
let pending: Promise<MacdPayload> | null = null;

async function loadMonitor(
  symbol: string,
  asset: string,
  timeframe: (typeof TIDESIGHT_MACD_INTERVALS)[number],
  signal: AbortSignal,
): Promise<MacdMonitor> {
  const response = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${timeframe.interval}&limit=260`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json", "User-Agent": "WELINKBTC-TideSight-MACD/1.0" },
  });
  if (!response.ok) throw new Error(`Binance Futures ${response.status}`);
  const rows = await response.json() as BinanceKline[];
  const now = Date.now();
  const closed = rows.filter((row) => Number(row[6]) < now);
  const points = calculateMacd(closed.map((row) => Number(row[4])));
  if (points.length < 2) throw new Error(`历史不足：仅 ${closed.length} 根已收盘 K 线，MACD 至少需要 35 根`);

  const current = points.at(-1)!;
  const previous = points.at(-2)!;
  const latestCross = findLatestMacdCross(points);
  const currentRow = closed[current.index];
  if (!currentRow) throw new Error("MACD 与 K 线时间索引不一致");

  return {
    symbol,
    asset,
    interval: timeframe.interval,
    intervalZh: timeframe.zh,
    intervalEn: timeframe.en,
    closedAt: new Date(Number(currentRow[6])).toISOString(),
    closePrice: Number(currentRow[4]),
    dif: current.dif,
    dea: current.dea,
    histogram: current.histogram,
    relation: current.dif >= current.dea ? "BULLISH" : "BEARISH",
    signal: classifyMacdCross(previous, current),
    lastCross: latestCross ? {
      signal: latestCross.signal,
      closedAt: new Date(Number(closed[latestCross.index][6])).toISOString(),
      barsAgo: current.index - latestCross.index,
      dif: latestCross.dif,
      dea: latestCross.dea,
    } : null,
  };
}

export async function loadMacdMonitors(timeframes: readonly (typeof TIDESIGHT_MACD_INTERVALS)[number][] = TIDESIGHT_MACD_INTERVALS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const requests = TIDESIGHT_MACD_MARKETS.flatMap(({ symbol, asset }) =>
      timeframes.map((timeframe) => ({ symbol, asset, timeframe })),
    );
    const results: PromiseSettledResult<MacdMonitor>[] = [];
    for (let index = 0; index < requests.length; index += 8) {
      results.push(...await Promise.allSettled(requests.slice(index, index + 8).map(({ symbol, asset, timeframe }) =>
        loadMonitor(symbol, asset, timeframe, controller.signal))));
    }
    const monitors: MacdMonitor[] = [];
    const failures: MacdPayload["failures"] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        monitors.push(result.value);
        return;
      }
      const request = requests[index];
      failures.push({
        symbol: request.symbol,
        interval: request.timeframe.interval,
        error: result.reason instanceof Error ? result.reason.message : "MACD 数据暂不可用",
      });
    });
    if (!monitors.length) throw new Error(failures[0]?.error ?? "MACD 数据暂不可用");
    return {
      ok: true,
      source: "BINANCE_FUTURES_KLINES",
      checkedAt: new Date().toISOString(),
      parameters: { fast: 12, slow: 26, signal: 9, closedCandlesOnly: true },
      monitors,
      failures,
    } satisfies MacdPayload;
  } finally {
    clearTimeout(timeout);
  }
}


export async function getMacdPayload() {
  if (cached && cached.expiresAt > Date.now()) return cached.payload;
  pending ??= loadMacdMonitors().finally(() => { pending = null; });
  const payload = await pending;
  cached = { expiresAt: Date.now() + 55_000, payload };
  return payload;
}
