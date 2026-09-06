import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { agentX402RequirementSchema } from "@/lib/bstock-agentic-wallet-x402";
import { sameX402Requirement } from "@/lib/bstock-x402";
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
import {
  BSTOCK_SYMBOL_PATTERN,
  buildAgentStudioReadableReport,
  encodeResearchIntent,
  extractAgentStudioReportSummary,
  fetchOfficialBstockMarket
} from "@/lib/bstock-alpha-live";
import {
  findRecentOwnedStudioJob,
  isStudioJobPending,
  isStudioJobTerminalFailure,
  isStudioReportComplete,
  reclaimLegacyStudioJob,
  resolveResearchOwner,
  STUDIO_REPORT_REUSE_MS
} from "@/lib/bstock-agent-studio";
import {
  agentStudioErrorMessage,
  resolveAgentStudioTerminalErrorCode
} from "@/lib/bstock-agent-studio-status";
import { evmNetworkLabel } from "@/lib/bstock-evm";
import { fetchUnpaidResearchChallenge, ResearchPreviewTimeoutError, ResearchPreviewTrace } from "@/lib/bstock-research-preview";

export const dynamic = "force-dynamic";
// Includes cold market/session reads, unpaid merchant retry and wallet preview.
export const maxDuration = 120;

const inputSchema = z.object({
  provider: z.enum(["cmc", "studio"]),
  symbol: z.string().trim().toUpperCase().regex(BSTOCK_SYMBOL_PATTERN).default("NVDAB")
});

const previewSchema = z.object({
  paymentId: z.string().min(1).max(200),
  options: z.array(z.object({
    index: z.number().int().positive(),
    status: z.enum(["READY_TO_SIGN", "ACTION_REQUIRED", "NOT_SIGNABLE"]),
    reasons: z.array(z.string()).default([]),
    scheme: z.string().optional(),
    assetTransferMethod: z.string().nullable().optional(),
    binanceChainId: z.string().nullable().optional(),
    tokenAddress: z.string().nullable().optional(),
    tokenSymbol: z.string().nullable().optional(),
    amount: z.string().nullable().optional(),
    amountUsd: z.string().nullable().optional(),
    payTo: z.string().nullable().optional(),
    userWalletAddress: z.string().nullable().optional(),
    currentBalance: z.string().nullable().optional(),
    currentBalanceUsd: z.string().nullable().optional(),
    needApproveFirst: z.boolean().optional(),
    originalAccept: z.record(z.string(), z.unknown()).optional()
  })).max(20)
});

function isSelectable(option: z.infer<typeof previewSchema>["options"][number]) {
  if (!option.binanceChainId || !/^\d+$/.test(option.binanceChainId)) return false;
  if (option.status === "READY_TO_SIGN") return true;
  if (option.status !== "ACTION_REQUIRED" || !option.needApproveFirst) return false;
  return !option.reasons.some((reason) => /INSUFFICIENT|NOT_SUPPORTED|INVALID|BLOCKED/i.test(reason));
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

function merchantRequest(provider: "cmc" | "studio", asset: {
  symbol: string;
  ticker: string;
  contractAddress: string;
}, requestId: string) {
  const contextHeaders = {
    "X-BStock-Symbol": asset.symbol,
    "X-BStock-Ticker": asset.ticker,
    "X-BStock-Contract": asset.contractAddress
  };
  if (provider === "cmc") {
    return {
      url: "https://mcp.coinmarketcap.com/x402/mcp",
      body: {
        jsonrpc: "2.0",
        id: requestId,
        method: "tools/call",
        params: { name: "get_global_metrics_latest", arguments: {} }
      },
      accept: "application/json, text/event-stream",
      headers: contextHeaders,
      purpose: `CMC AI · get_global_metrics_latest · ${asset.symbol} 决策上下文（活动有效调用）`
    };
  }
  return {
    url: "https://stock-agent.bnbchain.org/x402/analyze/async",
    body: { symbols: [asset.ticker], analysis_type: "comprehensive" },
    accept: "application/json",
    headers: contextHeaders,
    purpose: `BNB Chain Agent Studio · ${asset.ticker}（${asset.symbol}）综合研报`
  };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "付费研究预览仅允许从本站请求。" }, 403);
  const requestId = randomUUID();
  const trace = new ResearchPreviewTrace({ walletMode: "agent", requestId });
  try {
    const input = inputSchema.parse(await request.json());
    let state = connectedAgentSession(request);
    let previousStudioFailure: Record<string, unknown> | null = null;
    const market = await trace.run("market", () => fetchOfficialBstockMarket(), 35_000);
    const asset = market.assets.find((entry) => entry.symbol === input.symbol);
    if (!asset || asset.campaignEligibility !== "CONFIRMED") {
      return json({ error: `${input.symbol} 当前无法由 Binance 官方本周清单确认，未创建付费请求。` }, 409);
    }
    if (input.provider === "studio") {
      const owner = await trace.run("wallet_owner", () => resolveResearchOwner(state), 25_000);
      state = owner.state;
      const recent = await trace.run("existing_studio_job", async () =>
        await findRecentOwnedStudioJob(owner, asset.ticker)
        || await reclaimLegacyStudioJob(owner, { ticker: asset.ticker, lookbackMs: STUDIO_REPORT_REUSE_MS }), 15_000);
      if (recent && isStudioReportComplete(recent) && recent.reportMarkdown) {
        return persistAgentSession(json({
          status: "REUSED",
          provider: "studio",
          jobId: recent.jobId,
          symbol: recent.symbol,
          bstockSymbol: asset.symbol,
          selectedAsset: { symbol: asset.symbol, ticker: asset.ticker, contractAddress: asset.contractAddress },
          summary: extractAgentStudioReportSummary(recent.reportMarkdown),
          reportReading: buildAgentStudioReadableReport(recent.reportMarkdown),
          reportMarkdown: recent.reportMarkdown,
          paymentTxHash: recent.paymentTxHash,
          completedAt: recent.completedAt?.toISOString() ?? null,
          message: "已复用同一标的最近 30 分钟内完成的 Agent Studio 研报，本次未创建付款请求。"
        }), state);
      }
      if (recent && (isStudioJobPending(recent) || recent.retryable)) {
        return persistAgentSession(json({
          status: "RECOVERING",
          provider: "studio",
          jobId: recent.jobId,
          symbol: recent.symbol,
          bstockSymbol: asset.symbol,
          jobStatus: recent.status,
          retryable: recent.retryable,
          paymentTxHash: recent.paymentTxHash,
          message: "同一标的最近 30 分钟内已有已付费任务，继续回捞该任务，本次不会再次签名或付款。"
        }, 202), state);
      }
      if (recent && isStudioJobTerminalFailure(recent)) {
        const errorCode = resolveAgentStudioTerminalErrorCode(recent.upstreamErrorCode, recent.resumeCount);
        previousStudioFailure = {
          jobId: recent.jobId,
          errorCode,
          message: agentStudioErrorMessage(errorCode, false),
          requiresNewPayment: true
        };
      }
    }
    const merchant = merchantRequest(input.provider, asset, requestId);
    const paymentRequirements = await fetchUnpaidResearchChallenge(merchant, trace);

    const previewResponse = await trace.run("agent_wallet_preview", () => agentWalletRequest<unknown>(
      state,
      "/bapi/defi/v1/public/wallet-direct/agent-wallet/x402-payment/preview",
      { body: { paymentRequirements }, timeoutMs: 30_000 }
    ), 31_000);
    state = previewResponse.state;
    const preview = previewSchema.parse(previewResponse.data);
    const merchantChallenge = decodePaymentRequiredHeader(paymentRequirements);
    const merchantRequirements = merchantChallenge.accepts;
    // CMC uses a tool resource identifier, not the HTTP replay URL.
    const resourceUrl = z.string().min(1).max(2_048).parse(merchantChallenge.resource?.url);
    // Binance sorts its preview options. Match originalAccept, never array position.
    const allowedOptions = preview.options.filter(isSelectable).flatMap((option) => {
      const original = merchantRequirements.find((requirement) => sameX402Requirement(requirement, option.originalAccept));
      const parsed = agentX402RequirementSchema.safeParse(original);
      if (!parsed.success || parsed.data.network !== `eip155:${option.binanceChainId}`) return [];
      return [{ index: option.index, binanceChainId: option.binanceChainId!, requirement: parsed.data }];
    });
    const allowedIndices = allowedOptions.map((option) => option.index);
    if (!allowedIndices.length) {
      return persistAgentSession(json({
        error: "上游当前未提供 Agentic Wallet 可签名的 x402 付款方式。",
        code: "X402_PAYMENT_UNAVAILABLE",
        provider: input.provider
      }, 409), state);
    }
    const intent = encodeResearchIntent({
      version: 2,
      kind: "research",
      agentKey: agentSessionKey(state),
      provider: input.provider,
      symbol: asset.symbol,
      ticker: asset.ticker,
      contractAddress: asset.contractAddress,
      requestId,
      paymentId: preview.paymentId,
      resourceUrl,
      allowedIndices,
      allowedOptions,
      createdAt: Date.now()
    });

    const response = json({
      intent,
      provider: input.provider,
      selectedAsset: {
        symbol: asset.symbol,
        ticker: asset.ticker,
        contractAddress: asset.contractAddress
      },
      purpose: previousStudioFailure
        ? `${merchant.purpose} · 上一任务已永久失败，本次将新建任务并再次付费`
        : merchant.purpose,
      previousStudioFailure,
      expiresAt: Date.now() + 2 * 60_000,
      options: preview.options.map((option) => ({
        index: option.index,
        status: option.needApproveFirst && option.status === "READY_TO_SIGN" ? "ACTION_REQUIRED" : option.status,
        reasons: [
          ...option.reasons,
          ...(option.needApproveFirst ? ["PERMIT2_APPROVAL_REQUIRED"] : [])
        ],
        selectable: allowedIndices.includes(option.index),
        tokenSymbol: option.tokenSymbol,
        tokenAddress: option.tokenAddress,
        amount: option.amount,
        amountUsd: option.amountUsd,
        network: option.binanceChainId,
        networkLabel: option.binanceChainId ? evmNetworkLabel(`eip155:${option.binanceChainId}`) : "未知网络",
        transferMethod: option.assetTransferMethod,
        payTo: option.payTo,
        currentBalance: option.currentBalance,
        currentBalanceUsd: option.currentBalanceUsd,
        needApproveFirst: Boolean(option.needApproveFirst)
      }))
    });
    return persistAgentSession(response, state);
  } catch (error) {
    trace.log("failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    if (error instanceof ResearchPreviewTimeoutError) {
      return json({ error: error.message, code: error.code, stage: error.stage, requestId, retryable: true }, 504);
    }
    const known = error instanceof AgenticWalletRequestError;
    const message = error instanceof z.ZodError
      ? "研究请求参数无效。"
      : error instanceof Error ? error.message : "研究付款预览失败。";
    const response = json({ error: known ? error.message : message, code: known ? error.code : "RESEARCH_PREVIEW_FAILED" }, known ? error.status : 502);
    if (known && error.terminal) response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    return response;
  } finally {
    trace.log("finished");
  }
}
