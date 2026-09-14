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
  agentWalletOwnerKey,
  agentWalletRequest,
  connectedAgentSession,
  persistAgentSession
} from "@/lib/bstock-agentic-wallet-client";
import type { AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import {
  matchAgenticWalletMarketOrder,
  normalizeAgenticWalletMarketOrders,
  normalizeAgenticWalletOrderStatus,
  type AgenticWalletMarketOrder
} from "@/lib/bstock-agentic-wallet-order-status";
import { prisma } from "@/lib/prisma";

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
const HASH = /^0x[a-fA-F0-9]{64}$/;
const NON_PENDING_AUDIT = new Set(["INTENT_CREATED", "FINISHED", "SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED",
  "FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"]);

export async function handleBstockTradingStatus(request: NextRequest, context: { automation?: boolean } = {}) {
  if (!isSameOrigin(request)) return json({ error: "订单查询仅允许从本站请求。" }, 403);

  const inputResult = inputSchema.safeParse(await request.json().catch(() => null));
  if (!inputResult.success) return json({ error: "订单号无效。", code: "INVALID_ORDER_STATUS_INPUT" }, 400);
  const input = inputResult.data;
  let state: AgentSessionState | undefined;

  try {
    state = connectedAgentSession(request);
    // The encrypted session binds the wallet address. Re-login may rotate the
    // client/session key, but must not strand this wallet's earlier audit rows.
    const ownership = state.walletAddress
      ? { ownerKey: agentWalletOwnerKey(state.walletAddress) }
      : { agentKey: agentSessionKey(state) };
    const auditRecord = await prisma.bstockTradeRecord.findFirst({
      where: { orderId: input.orderId, ...ownership },
      select: {
        id: true,
        status: true,
        orderId: true,
        txHash: true,
        fromToken: true,
        toToken: true,
        fromSymbol: true,
        toSymbol: true,
        requestedAmount: true,
        quotedAmount: true,
        submittedAt: true
      }
    }).catch(() => null);
    if (!auditRecord) return json({ error: "当前钱包没有对应的交易记录。", code: "ORDER_AUDIT_NOT_FOUND" }, 404);
    // Client hints are display conveniences, never evidence of order identity.
    // In particular, clientOrderId or a matching amount cannot finalize another
    // order of the same token pair after a re-login.
    const matchHint = {
      orderId: input.orderId,
      fromToken: auditRecord.fromToken,
      toToken: auditRecord.toToken,
      fromSymbol: auditRecord.fromSymbol,
      toSymbol: auditRecord.toSymbol,
      fromAmount: auditRecord.requestedAmount,
      toAmount: auditRecord.quotedAmount,
      submittedAt: auditRecord.submittedAt?.getTime()
    };
    const savedHash = auditRecord.txHash && HASH.test(auditRecord.txHash) ? auditRecord.txHash.toLowerCase() : null;
    const findMatch = (rows: AgenticWalletMarketOrder[]) => {
      const exact = rows.find(row => row.orderId === auditRecord.orderId);
      const byHash = savedHash ? rows.find(row => row.txHash?.toLowerCase() === savedHash) : undefined;
      const candidate = exact || byHash;
      if (candidate) {
        const directionMatches = (!candidate.fromToken || candidate.fromToken.toLowerCase() === auditRecord.fromToken.toLowerCase())
          && (!candidate.toToken || candidate.toToken.toLowerCase() === auditRecord.toToken.toLowerCase());
        const hashMatches = !savedHash || !candidate.txHash || candidate.txHash.toLowerCase() === savedHash;
        return { order: candidate, strategy: exact ? "ORDER_ID" : "TX_HASH", trusted: directionMatches && hashMatches };
      }
      return { ...matchAgenticWalletMarketOrder(rows, matchHint), trusted: false };
    };
    const directResult = await agentWalletRequest<unknown>(
      state,
      "/bapi/defi/v1/public/wallet-direct/web-dex/agent/batch-query-market-orders",
      { body: { orderId: input.orderId, page: 1, pageSize: 1 }, timeoutMs: 15_000 }
    );
    state = directResult.state;
    const direct = normalizeAgenticWalletMarketOrders(directResult.data);
    let match = findMatch(direct.rows);
    let order = match.order;
    let fallbackShape: string | null = null;
    let fallbackRows = 0;
    let fallbackError: string | null = null;

    if (!match.trusted || !normalizeAgenticWalletOrderStatus(order).final) {
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
        const historyMatch = findMatch(history.rows);
        if (historyMatch.order && (!order || (historyMatch.trusted && (!match.trusted
          || normalizeAgenticWalletOrderStatus(historyMatch.order).final)))) {
          order = historyMatch.order;
          match = historyMatch;
        }
      } catch (error) {
        if (error instanceof AgenticWalletRequestError && error.terminal) throw error;
        fallbackError = error instanceof AgenticWalletRequestError ? error.code : "ORDER_HISTORY_LOOKUP_FAILED";
      }
    }

    const upstream = normalizeAgenticWalletOrderStatus(order);
    // PROCESSING and other venue-specific intermediate states must stay in the
    // canonical pending set. Fuzzy history matches are diagnostic only, even if
    // the other order was rejected or has a completed transaction hash.
    const normalized = match.trusted && upstream.final ? upstream : {
      ...upstream, status: "PENDING", final: false, successful: false, settledByEvidence: false
    };
    const autoOrder = await prisma.bstockAutoOrder.findUnique({
      where: { tradeRecordId: auditRecord.id }, select: { status: true }
    });
    const awaitingProof = Boolean(autoOrder && autoOrder.status !== "FINISHED" && normalized.successful);
    // Only the receipt verifier may finish an automatic trade. A later status
    // poll must also not downgrade or overwrite its verified actual amounts.
    if (autoOrder?.status !== "FINISHED" && !NON_PENDING_AUDIT.has(auditRecord.status.toUpperCase())) {
      await prisma.bstockTradeRecord.updateMany({
        // Never downgrade an already terminal audit record after a delayed
        // upstream PENDING response or a later login-session change.
        where: { id: auditRecord.id, orderId: input.orderId, ...ownership,
          txHash: auditRecord.txHash,
          status: auditRecord.status },
        data: {
          // Manual terminal transitions belong exclusively to the strict
          // reconciliation helper. Automatic fills remain receipt-verifier
          // owned; only an exact upstream rejection may mark an auto failure.
          status: autoOrder && normalized.final && !normalized.successful ? "FAILED" : "PENDING",
          ...(match.trusted && order?.txHash && HASH.test(order.txHash) ? { txHash: order.txHash } : {}),
          ...(autoOrder && normalized.final && !normalized.successful ? { completedAt: new Date() } : {})
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
      identityVerified: match.trusted,
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
      status: awaitingProof && !context.automation ? "PENDING" : normalized.status,
      upstreamStatus: normalized.upstreamStatus,
      final: awaitingProof && !context.automation ? false : normalized.final,
      successful: awaitingProof && !context.automation ? false : normalized.successful,
      awaitingChainProof: awaitingProof,
      settledByEvidence: normalized.settledByEvidence,
      orderId: input.orderId,
      matchedOrderId: order.orderId || null,
      matchStrategy: match.strategy,
      identityVerified: match.trusted,
      fromSymbol: order.fromSymbol || null,
      toSymbol: order.toSymbol || null,
      fromAmount: order.fromAmount || null,
      toAmount: order.toAmount || null,
      txHash: match.trusted ? order.txHash || savedHash : null,
      createdAt: order.createdAt || null,
      updatedAt: order.updatedAt || null,
      reason: !match.trusted ? "ORDER_IDENTITY_UNVERIFIED" : normalized.final ? null : "STATUS_NOT_FINAL",
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
