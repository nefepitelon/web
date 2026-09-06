import { z } from "zod";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { approveTradeIntent } from "@/lib/alpha-execution/service";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({
  symbol: z.string().trim().min(2).max(30),
  side: z.enum(["LONG", "SHORT"]),
  orderType: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  leverage: z.number().int().min(1).max(20),
  riskPct: z.number().min(0.1).max(1.5),
  source: z.string().trim().min(2).max(80),
  alphaScore: z.number().min(0).max(100).nullable().optional(),
  mode: z.enum(["paper", "mock_exchange", "testnet", "live"]),
  market: z.enum(["spot", "futures"]),
  equity: z.number().positive().optional(),
  dailyPnl: z.number().optional()
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const input = schema.parse(await request.json());
    if (input.mode === "live") await requireAlphaOperator({ live: true });
    const result = await approveTradeIntent(input, viewer.id, viewer.twoFactorPassed);
    console.info("[alpha-execution/intents] evaluated", {
      userId: viewer.id,
      mode: input.mode,
      market: input.market,
      symbol: input.symbol,
      decision: result.decision,
      violationCodes: Array.isArray(result.violations) ? result.violations.map((item: { code?: string }) => item.code).filter(Boolean) : []
    });
    return Response.json(result, { status: result.ok ? 201 : 422, headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    console.error("[alpha-execution/intents] failed", { message: caught instanceof Error ? caught.message : String(caught) });
    return alphaExecutionErrorResponse(caught);
  }
}
