import { z } from "zod";
import { AlphaExecutionMode, AlphaExecutionState } from "@prisma/client";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";
import { getOrCreateAlphaExecutionConfig, writeAlphaAudit } from "@/lib/alpha-execution/data";
import { prisma } from "@/lib/prisma";
import { assertSameOrigin } from "@/lib/request-security";

const schema = z.object({
  acknowledgeRealFunds: z.unknown()
    .refine((value) => value === true, { message: "请确认实盘会使用真实资金并接受风险额度限制" }),
  acknowledgeNoWithdrawPermission: z.unknown()
    .refine((value) => value === true, { message: "请确认 API Key 未开启提现权限并已绑定受控 IP" })
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator({ live: true });
    schema.parse(await request.json());
    const config = await getOrCreateAlphaExecutionConfig(viewer.id);
    if (!config.reconciliationHealthy || config.killSwitchActive) throw new Error("必须先完成健康对账并解除 Kill Switch");
    const credential = await prisma.alphaTradingCredential.findUnique({
      where: { userId_environment_market: { userId: viewer.id, environment: AlphaExecutionMode.LIVE, market: config.defaultMarket } }
    });
    if (!credential?.verifiedAt || !credential.enabled) throw new Error("当前实盘市场的 API Key 尚未通过连接和权限校验");
    const updated = await prisma.alphaExecutionConfig.update({
      where: { userId: viewer.id },
      data: { activeMode: AlphaExecutionMode.LIVE, liveEnabled: true, liveUnlockedAt: new Date(), liveUnlockedBy: viewer.id }
    });
    await writeAlphaAudit({ userId: viewer.id, state: AlphaExecutionState.RISK_APPROVED, status: "SECURITY", message: `生产实盘已由双重验证管理员勾选两项协议并显式解锁；默认单笔上限 ${updated.perOrderNotionalLimit} USDT。`, metadata: { defaultMarket: updated.defaultMarket, acknowledgeRealFunds: true, acknowledgeNoWithdrawPermission: true } });
    return Response.json({ ok: true, liveUnlockedAt: updated.liveUnlockedAt?.toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const viewer = await requireAlphaOperator({ live: true });
    await prisma.alphaExecutionConfig.update({
      where: { userId: viewer.id },
      data: { liveEnabled: false, liveUnlockedAt: null, activeMode: AlphaExecutionMode.PAPER, autoExecuteEnabled: false }
    });
    await writeAlphaAudit({ userId: viewer.id, state: AlphaExecutionState.CANCELED, status: "SECURITY", message: "生产实盘已重新加锁，执行模式回退至 PAPER。" });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
