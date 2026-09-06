import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AGENT_SESSION_COOKIE,
  clearAgentSessionCookieOptions,
  isSameOrigin,
  noStoreHeaders
} from "@/lib/bstock-agentic-wallet-auth";
import {
  AgenticWalletRequestError,
  agentSessionKey,
  agentWalletRequest,
  connectedAgentSession,
  persistAgentSession
} from "@/lib/bstock-agentic-wallet-client";
import type { AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import {
  matchAgenticWalletMarketOrder,
  normalizeAgenticWalletMarketOrders,
  normalizeAgenticWalletOrderStatus
} from "@/lib/bstock-agentic-wallet-order-status";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const inputSchema = z.object({
  orderId: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
  clientOrderId: z.string().max(128).nullable().optional(),
  fromToken: z.string().max(128).nullable().optional(),
  toToken: z.string().max(128).nullable().optional(),
  fromSymbol: z.string().max(32).nullable().optional(),
  toSymbol: z.string().max(32).nullable().optional(),
  fromAmount: z.string().max(100).nullable().optional(),
  toAmount: z.string().max(100).nullable().optional(),
  submittedAt: z.number().int().nonnegative().optional()
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "订单查询仅允许从本站请求。" }, 403);

  const inputResult = inputSchema.safeParse(await request.json().catch(() => null));
  if (!inputResult.success) return json({ error: "订单号无效。", code: "INVALID_ORDER_STATUS_INPUT" }, 400);
  const input = inputResult.data;
  let state: AgentSessionState | undefined;

  try {
    state = connectedAgentSession(request);
    const auditRecord = await prisma.bstockTradeRecord.findFirst({
      where: { orderId: input.orderId, agentKey: agentSessionKey(state) },
      select: {
        orderId: true,
        fromToken: true,
        toToken: true,
        fromSymbol: true,
        toSymbol: true,
        requestedAmount: true,
        quotedAmount: true,
        submittedAt: true
      }
    }).catch(() => null);
    const matchHint = {
      orderId: input.orderId,
      clientOrderId: input.clientOrderId,
      fromToken: auditRecord?.fromToken || input.fromToken,
      toToken: auditRecord?.toToken || input.toToken,
      fromSymbol: auditRecord?.fromSymbol || input.fromSymbol,
      toSymbol: auditRecord?.toSymbol || input.toSymbol,
      fromAmount: input.fromAmount || auditRecord?.requestedAmount,
      toAmount: input.toAmount || auditRecord?.quotedAmount,
      submittedAt: auditRecord?.submittedAt?.getTime() || input.submittedAt
    };
    const directResult = await agentWalletRequest<unknown>(
      state,
      "/bapi/defi/v1/public/wallet-direct/web-dex/agent/batch-query-market-orders",
      { body: { orderId: input.orderId, page: 1, pageSize: 1 }, timeoutMs: 15_000 }
    );
    state = directResult.state;
    const direct = normalizeAgenticWalletMarketOrders(directResult.data);
    let match = matchAgenticWalletMarketOrder(direct.rows, matchHint);
    let order = match.order;
    let fallbackShape: string | null = null;
    let fallbackRows = 0;
    let fallbackError: string | null = null;

    if (!normalizeAgenticWalletOrderStatus(order).final) {
      try {
        const historyResult = await agentWalletRequest<unknown>(
          state,
          "/bapi/defi/v1/public/wallet-direct/web-dex/agent/batch-query-market-orders",
          { body: { binanceChainId: "56", page: 1, pageSize: 50, sort: "DESC" }, timeoutMs: 15_000 }
        );
        state = historyResult.state;
        const history = normalizeAgenticWalletMarketOrders(historyResult.data);
        fallbackShape = history.responseShape;
        fallbackRows = history.rows.length;
        const historyMatch = matchAgenticWalletMarketOrder(history.rows, matchHint);
        if (historyMatch.order && (!order || normalizeAgenticWalletOrderStatus(historyMatch.order).final)) {
          order = historyMatch.order;
          match = historyMatch;
        }
      } catch (error) {
        if (error instanceof AgenticWalletRequestError && error.terminal) throw error;
        fallbackError = error instanceof AgenticWalletRequestError ? error.code : "ORDER_HISTORY_LOOKUP_FAILED";
      }
    }

    const normalized = normalizeAgenticWalletOrderStatus(order);
    if (order) {
      await prisma.bstockTradeRecord.updateMany({
        where: { orderId: input.orderId, agentKey: agentSessionKey(state) },
        data: {
          status: normalized.status,
          txHash: order.txHash || undefined,
          actualFromAmount: order.fromAmount || undefined,
          actualToAmount: order.toAmount || undefined,
          ...(normalized.final ? { completedAt: new Date() } : {})
        }
      }).catch((error) => console.error("[bstock:order-status] trade_audit_sync_failed", {
        orderIdSuffix: input.orderId.slice(-8),
        error: error instanceof Error ? error.message : "Unknown error"
      }));
    }
    console.info("[bstock:order-status] lookup", {
      orderIdSuffix: input.orderId.slice(-8),
      submittedAt: input.submittedAt ?? null,
      directShape: direct.responseShape,
      directRows: direct.rows.length,
      fallbackShape,
      fallbackRows,
      fallbackError,
      matched: Boolean(order),
      matchStrategy: match.strategy,
      matchedOrderIdSuffix: order?.orderId?.slice(-8) || null,
      upstreamStatus: normalized.upstreamStatus,
      normalizedStatus: normalized.status,
      settledByEvidence: normalized.settledByEvidence
    });

    if (!order) {
      return persistAgentSession(json({
        status: "PENDING",
        orderId: input.orderId,
        final: false,
        successful: false,
        reason: "ORDER_NOT_INDEXED",
        retryAfterMs: 3_000
      }), state);
    }

    return persistAgentSession(json({
      status: normalized.status,
      upstreamStatus: normalized.upstreamStatus,
      final: normalized.final,
      successful: normalized.successful,
      settledByEvidence: normalized.settledByEvidence,
      orderId: input.orderId,
      matchedOrderId: order.orderId || null,
      matchStrategy: match.strategy,
      fromSymbol: order.fromSymbol || null,
      toSymbol: order.toSymbol || null,
      fromAmount: order.fromAmount || null,
      toAmount: order.toAmount || null,
      txHash: order.txHash || null,
      createdAt: order.createdAt || null,
      updatedAt: order.updatedAt || null,
      reason: normalized.final ? null : "STATUS_NOT_FINAL",
      retryAfterMs: normalized.final ? null : 3_000
    }), state);
  } catch (error) {
    const known = error instanceof AgenticWalletRequestError;
    const message = error instanceof Error ? error.message : "订单状态查询失败。";
    const response = json({ error: known ? error.message : message, code: known ? error.code : "ORDER_STATUS_FAILED" }, known ? error.status : 502);
    if (known && error.terminal) response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    return state ? persistAgentSession(response, state) : response;
  }
}
