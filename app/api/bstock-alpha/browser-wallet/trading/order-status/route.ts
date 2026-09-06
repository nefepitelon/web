import { NextRequest, NextResponse } from "next/server";
import { decodeEventLog, erc20Abi, formatUnits, getAddress } from "viem";
import { z } from "zod";
import { isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import {
  BSC_NATIVE_TOKEN,
  browserPublicClient,
  browserWalletAddressSchema,
  requireBoundEvmBrowserWallet
} from "@/lib/bstock-browser-wallet";
import { fetchOfficialBstockMarket, multiplyDecimals } from "@/lib/bstock-alpha-live";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const inputSchema = z.object({
  address: browserWalletAddressSchema,
  orderId: z.string().regex(/^0x[a-fA-F0-9]{64}$/)
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "浏览器钱包订单查询仅允许从本站请求。" }, 403);
  try {
    const input = inputSchema.parse(await request.json());
    const identity = await requireBoundEvmBrowserWallet(input.address);
    const orderId = input.orderId.toLowerCase();
    const record = await prisma.bstockTradeRecord.findFirst({
      where: { ownerKey: identity.ownerKey, OR: [{ orderId }, { txHash: orderId }] }
    });
    if (!record) return json({ error: "未找到属于当前浏览器钱包的订单。" }, 404);
    const receipt = await browserPublicClient.getTransactionReceipt({ hash: orderId as `0x${string}` }).catch(() => null);
    if (!receipt) {
      return json({ status: "PENDING", orderId, final: false, successful: false, reason: "RECEIPT_NOT_MINED", retryAfterMs: 3_000 });
    }
    if (receipt.status !== "success") {
      await prisma.bstockTradeRecord.update({
        where: { id: record.id },
        data: { status: "FAILED", completedAt: new Date() }
      }).catch(() => undefined);
      return json({ status: "FAILED", orderId, txHash: orderId, final: true, successful: false, reason: "BSC_TRANSACTION_REVERTED" });
    }
    const transaction = await browserPublicClient.getTransaction({ hash: orderId as `0x${string}` }).catch(() => null);
    if (!transaction || getAddress(transaction.from) !== identity.address) {
      return json({ error: "链上交易发起地址与当前浏览器钱包不一致。" }, 409);
    }

    let actualToAmount = record.quotedAmount || "";
    if (record.toToken.toLowerCase() !== BSC_NATIVE_TOKEN.toLowerCase()) {
      let rawReceived = 0n;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== record.toToken.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics });
          if (getAddress(decoded.args.to) === identity.address) rawReceived += decoded.args.value;
        } catch {
          continue;
        }
      }
      if (rawReceived > 0n) {
        const decimals = await browserPublicClient.readContract({
          address: getAddress(record.toToken),
          abi: erc20Abi,
          functionName: "decimals"
        }).catch(() => 18);
        actualToAmount = formatUnits(rawReceived, Number(decimals));
        if (record.side === "buy") {
          const market = await fetchOfficialBstockMarket();
          const asset = market.assets.find((item) => item.symbol === record.symbol);
          if (asset) actualToAmount = multiplyDecimals(actualToAmount, asset.multiplier);
        }
      }
    }
    await prisma.bstockTradeRecord.update({
      where: { id: record.id },
      data: {
        status: "FINISHED",
        txHash: orderId,
        actualFromAmount: record.requestedAmount,
        actualToAmount,
        completedAt: new Date()
      }
    });
    return json({
      status: "FINISHED",
      upstreamStatus: "success",
      final: true,
      successful: true,
      settledByEvidence: true,
      orderId,
      matchedOrderId: orderId,
      matchStrategy: "BNB_CHAIN_RECEIPT",
      fromSymbol: record.fromSymbol,
      toSymbol: record.toSymbol,
      fromAmount: record.requestedAmount,
      toAmount: actualToAmount,
      txHash: orderId,
      blockNumber: receipt.blockNumber.toString(),
      reason: null,
      retryAfterMs: null
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "浏览器钱包订单号无效。"
      : error instanceof Error ? error.message : "浏览器钱包订单状态查询失败。";
    return json({ error: message, code: "BROWSER_ORDER_STATUS_FAILED" }, 502);
  }
}
