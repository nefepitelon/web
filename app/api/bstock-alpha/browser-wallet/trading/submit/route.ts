import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { z } from "zod";
import { isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import {
  browserWalletAddressSchema,
  decodeBrowserTradeIntent,
  requireBoundEvmBrowserWallet
} from "@/lib/bstock-browser-wallet";
import { prisma } from "@/lib/prisma";
import { tradeIntentAuditHash } from "@/lib/bstock-trade-records";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  address: browserWalletAddressSchema,
  intent: z.string().min(20).max(40_000),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  approvalTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).nullable().optional(),
  confirmation: z.literal("确认实盘交易"),
  acknowledged: z.literal(true)
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "浏览器钱包订单提交仅允许从本站请求。" }, 403);
  try {
    const input = inputSchema.parse(await request.json());
    const identity = await requireBoundEvmBrowserWallet(input.address);
    const intent = decodeBrowserTradeIntent(input.intent);
    if (getAddress(intent.walletAddress) !== identity.address || intent.ownerKey !== identity.ownerKey) {
      return json({ error: "该交易意图不属于当前浏览器钱包。" }, 403);
    }
    if (intent.mode !== "policy") return json({ error: "平台仅允许 POLICY 生产模式。" }, 409);
    const intentHash = tradeIntentAuditHash(input.intent);
    const updated = await prisma.bstockTradeRecord.updateMany({
      where: { intentHash, ownerKey: identity.ownerKey },
      data: {
        orderId: input.txHash.toLowerCase(),
        txHash: input.txHash.toLowerCase(),
        status: "SUBMITTED",
        submittedAt: new Date()
      }
    });
    if (!updated.count) return json({ error: "交易意图审计记录不存在，订单状态无法关联。" }, 409);
    return json({
      status: "SUBMITTED",
      orderId: input.txHash.toLowerCase(),
      txHash: input.txHash.toLowerCase(),
      approvalTxHash: input.approvalTxHash ?? null,
      walletMode: "browser",
      chainId: 56,
      symbol: intent.symbol,
      side: intent.side,
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      fromSymbol: intent.fromSymbol,
      toSymbol: intent.toSymbol,
      fromAmount: intent.amount,
      toAmount: intent.quoteOutput,
      message: "交易已由浏览器钱包广播到 BNB Chain；只有链上回执成功后才会计入持仓或 PnL。"
    }, 202);
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "浏览器钱包订单提交参数无效。"
      : error instanceof Error ? error.message : "浏览器钱包订单提交失败。";
    return json({ error: message, code: "BROWSER_TRADE_SUBMIT_FAILED" }, 502);
  }
}
