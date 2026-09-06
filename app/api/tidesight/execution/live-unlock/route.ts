import { z } from "zod";
import { AlphaExecutionMode, AlphaExecutionState } from "@prisma/client";
import { tideSightExecutionErrorResponse, requireTideSightOperator } from "@/lib/tidesight/execution/access";
import { getOrCreateTideSightExecutionConfig, writeTideSightAudit } from "@/lib/tidesight/execution/data";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({
  acknowledgeRealFunds: z.unknown()
    .refine((value) => value === true, { message: "请确认实盘会使用真实资金并接受风险额度限制" }),
  acknowledgeNoWithdrawPermission: z.unknown()
    .refine((value) => value === true, { message: "请确认 API Key 未开启提现权限" })
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireTideSightOperator({ live: true });
    schema.parse(await request.json());
    const config = await getOrCreateTideSightExecutionConfig(viewer.id);
    if (!config.reconciliationHealthy || config.killSwitchActive) throw new Error("必须先完成健康对账并解除 Kill Switch");
    if (!config.lastReconciledAt || Date.now() - config.lastReconciledAt.getTime() > 300_000) throw new Error("请先完成最近 5 分钟内的健康对账");
    const credential = await prisma.tideSightTradingCredential.findUnique({
      where: { userId_environment_market: { userId: viewer.id, environment: AlphaExecutionMode.LIVE, market: config.defaultMarket } }
    });
    if (!credential?.verifiedAt || !credential.enabled) throw new Error("当前实盘市场的 API Key 尚未通过连接和权限校验");
    const updated = await prisma.tideSightExecutionConfig.update({
      where: { userId: viewer.id },
      data: { activeMode: AlphaExecutionMode.LIVE, liveEnabled: true, liveUnlockedAt: new Date(), liveUnlockedBy: viewer.id }
    });
    await writeTideSightAudit({ userId: viewer.id, state: AlphaExecutionState.RISK_APPROVED, status: "SECURITY", message: `生产实盘已由双重验证管理员勾选真实资金及提现关闭协议后显式解锁；默认单笔上限 ${updated.perOrderNotionalLimit} USDT。`, metadata: { defaultMarket: updated.defaultMarket, acknowledgeRealFunds: true, acknowledgeNoWithdrawPermission: true } });
    return Response.json({ ok: true, liveUnlockedAt: updated.liveUnlockedAt?.toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireTideSightOperator({ live: true });
    await prisma.tideSightExecutionConfig.update({
      where: { userId: viewer.id },
      data: { liveEnabled: false, liveUnlockedAt: null, activeMode: AlphaExecutionMode.PAPER, autoExecuteEnabled: false, autoGeneration: null }
    });
    await writeTideSightAudit({ userId: viewer.id, state: AlphaExecutionState.CANCELED, status: "SECURITY", message: "生产实盘已重新加锁，执行模式回退至 PAPER。" });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return tideSightExecutionErrorResponse(caught);
  }
}
