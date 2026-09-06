import { z } from "zod";
import { AlphaExecutionMode } from "@prisma/client";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { getOrCreateAlphaExecutionConfig, marketFrom, modeFrom, publicConfig, writeAlphaAudit } from "@/lib/alpha-execution/data";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({
  activeMode: z.enum(["paper", "mock_exchange", "testnet", "live"]),
  defaultMarket: z.enum(["spot", "futures"]),
  testnetEnabled: z.boolean(),
  autoExecuteEnabled: z.boolean(),
  requireManualConfirmation: z.boolean(),
  requireProtectionOrders: z.literal(true),
  riskPerTradePct: z.number().min(0.1).max(1.5),
  maxLeverage: z.number().int().min(1).max(20),
  dailyLossLimitPct: z.number().min(0.5).max(3.5),
  dedupeWindowMinutes: z.number().int().min(5).max(60),
  maxOpenPositions: z.number().int().min(1).max(12),
  maxPortfolioExposurePct: z.number().min(5).max(75),
  minAlphaScore: z.number().int().min(75).max(95),
  perOrderNotionalLimit: z.number().min(5).max(100000),
  dailyNotionalLimit: z.number().min(5).max(1000000)
});

export async function GET() {
  try {
    const viewer = await requireAlphaOperator();
    return Response.json({ ok: true, config: publicConfig(await getOrCreateAlphaExecutionConfig(viewer.id)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator();
    const input = schema.parse(await request.json());
    const existing = await getOrCreateAlphaExecutionConfig(viewer.id);
    const activeMode = modeFrom(input.activeMode);
    if (activeMode === AlphaExecutionMode.LIVE && !existing.liveEnabled) throw new Error("生产实盘尚未完成独立解锁");
    if (activeMode === AlphaExecutionMode.LIVE) await requireAlphaOperator({ live: true });
    const config = await prisma.alphaExecutionConfig.update({
      where: { userId: viewer.id },
      data: {
        activeMode,
        defaultMarket: marketFrom(input.defaultMarket),
        testnetEnabled: input.testnetEnabled,
        autoExecuteEnabled: input.autoExecuteEnabled,
        requireManualConfirmation: input.requireManualConfirmation,
        requireProtectionOrders: true,
        riskPerTradePct: input.riskPerTradePct,
        maxLeverage: input.maxLeverage,
        dailyLossLimitPct: input.dailyLossLimitPct,
        dedupeWindowMinutes: input.dedupeWindowMinutes,
        maxOpenPositions: input.maxOpenPositions,
        maxPortfolioExposurePct: input.maxPortfolioExposurePct,
        minAlphaScore: input.minAlphaScore,
        perOrderNotionalLimit: input.perOrderNotionalLimit,
        dailyNotionalLimit: Math.max(input.dailyNotionalLimit, input.perOrderNotionalLimit)
      }
    });
    await writeAlphaAudit({ userId: viewer.id, state: "NORMALIZED", status: "OK", message: `执行环境配置已更新为 ${config.activeMode}/${config.defaultMarket}；保护单仍为强制项。`, metadata: { autoExecuteEnabled: config.autoExecuteEnabled } });
    return Response.json({ ok: true, config: publicConfig(config) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
