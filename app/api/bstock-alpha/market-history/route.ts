import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import { BSTOCK_SYMBOL_PATTERN, fetchBstockMarketHistory } from "@/lib/bstock-alpha-live";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const inputSchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(BSTOCK_SYMBOL_PATTERN),
  interval: z.enum(["1h", "4h", "1d", "1w"]).default("4h")
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "行情历史仅允许从本站请求。" }, 403);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "行情历史参数无效。", code: "MARKET_HISTORY_INPUT_INVALID" }, 400);
  }
  const startedAt = Date.now();
  try {
    const history = await fetchBstockMarketHistory(parsed.data.symbol, parsed.data.interval);
    console.info("[bstock:market-history] completed", {
      symbol: parsed.data.symbol,
      interval: parsed.data.interval,
      durationMs: Date.now() - startedAt,
      deliveryMode: history.deliveryMode,
      points: history.points.length
    });
    return json(history);
  } catch (error) {
    console.warn("[bstock:market-history] unavailable", {
      symbol: parsed.data.symbol,
      interval: parsed.data.interval,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    });
    return json({
      error: "真实历史行情暂不可用。",
      code: "MARKET_HISTORY_UNAVAILABLE"
    }, 502);
  }
}
