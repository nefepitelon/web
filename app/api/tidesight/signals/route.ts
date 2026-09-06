import { z } from "zod";
import { approveTradeIntent } from "@/lib/tidesight/execution/service";
import { requireTideSightApiKey, tideSightApiError } from "@/lib/tidesight/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const signalSchema = z.object({
  provider: z.enum(["freqtrade", "jesse", "welinkbtc", "custom"]),
  strategyId: z.string().trim().min(2).max(48),
  signalId: z.string().trim().min(2).max(80),
  symbol: z.string().trim().min(2).max(30),
  side: z.enum(["LONG", "SHORT"]),
  timeframe: z.enum(["1h", "4h", "1d"]),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive(),
  takeProfit: z.number().positive(),
  leverage: z.number().int().min(1).max(25).default(1),
  riskPct: z.number().min(0.1).max(1.5).default(0.5),
  alphaScore: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  mode: z.literal("paper").default("paper"),
  market: z.enum(["spot", "futures"]).default("futures"),
  equity: z.number().positive().max(1_000_000_000).optional(),
  dailyPnl: z.number().optional(),
});

export async function GET() {
  return Response.json({
    ok: true,
    name: "TideSight Quant normalized signal contract",
    version: "2026-08-30",
    flow: ["signal", "target-position", "risk-engine", "execution-plan", "human-confirmation", "order-manager", "reconciliation"],
    acceptedProviders: ["freqtrade", "jesse", "welinkbtc", "custom"],
    acceptedModes: ["paper"],
    livePolicy: "External strategy keys can never create a live intent. Live execution requires an authenticated 2FA admin session and explicit plan confirmation.",
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}

export async function POST(request: Request) {
  try {
    const access = await requireTideSightApiKey(request);
    const input = signalSchema.parse(await request.json());
    const result = await approveTradeIntent({
      symbol: input.symbol,
      side: input.side,
      orderType: "MARKET",
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss,
      takeProfit: input.takeProfit,
      leverage: input.leverage,
      riskPct: input.riskPct,
      source: `tidesight:${input.provider}:${input.strategyId}`,
      tideSightScore: input.alphaScore,
      mode: input.mode,
      market: input.market,
      equity: input.equity,
      dailyPnl: input.dailyPnl,
      metadata: {
        externalSignalId: input.signalId,
        timeframe: input.timeframe,
        confidence: input.confidence,
      },
    }, access.userId, false);

    return Response.json({
      ...result,
      normalizedBy: "TIDESIGHT_CONTROL_PLANE",
      externalSignalId: input.signalId,
      executionRequiresAuthenticatedConfirmation: true,
    }, {
      status: result.ok ? 201 : 422,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (caught) {
    return tideSightApiError(caught);
  }
}
