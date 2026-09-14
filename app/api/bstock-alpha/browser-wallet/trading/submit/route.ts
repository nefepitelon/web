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

class RegistrationError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
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
    const txHash = input.txHash.toLowerCase();
    const registration = await prisma.$transaction(async (tx) => {
      // This records an already-broadcast wallet transaction, not permission to
      // broadcast. Do not reject it merely because automation is now running.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.ownerKey}))::text`;
      const record = await tx.bstockTradeRecord.findFirst({
        where: { intentHash, ownerKey: identity.ownerKey },
        select: { id: true, status: true, orderId: true, txHash: true, automationIgnoredAt: true }
      });
      if (!record) throw new RegistrationError("交易意图审计记录不存在，订单状态无法关联。", "BROWSER_TRADE_AUDIT_NOT_FOUND");
      const savedIds = [record.orderId, record.txHash].filter((value): value is string => Boolean(value));
      if (savedIds.length && savedIds.every(value => value.toLowerCase() === txHash)) {
        // Same-hash retries must not reset a final status, timestamps, actual
        // amounts or the user's historical-order override.
        return { status: record.status, alreadyRegistered: true };
      }
      if (record.status !== "INTENT_CREATED" || record.orderId !== null || record.txHash !== null || record.automationIgnoredAt !== null) {
        throw new RegistrationError("该交易意图已有提交记录，不能绑定其他交易哈希。请保留原订单并核对钱包交易记录。", "BROWSER_TRADE_HASH_CONFLICT");
      }
      const updated = await tx.bstockTradeRecord.updateMany({
        where: { id: record.id, intentHash, ownerKey: identity.ownerKey, status: "INTENT_CREATED",
          orderId: null, txHash: null, automationIgnoredAt: null },
        data: { orderId: txHash, txHash, status: "SUBMITTED", submittedAt: new Date() }
      });
      if (updated.count !== 1) throw new RegistrationError("交易记录已变化，请刷新核对；不要重复广播。", "BROWSER_TRADE_REGISTRATION_CHANGED");
      return { status: "SUBMITTED", alreadyRegistered: false };
    }, { maxWait: 5_000, timeout: 10_000 });
    return json({
      ...registration,
      orderId: txHash,
      txHash,
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
    if (error instanceof RegistrationError) return json({ error: error.message, code: error.code }, 409);
    const message = error instanceof z.ZodError
      ? "浏览器钱包订单提交参数无效。"
      : error instanceof Error ? error.message : "浏览器钱包订单提交失败。";
    return json({ error: message, code: "BROWSER_TRADE_SUBMIT_FAILED" }, 502);
  }
}
