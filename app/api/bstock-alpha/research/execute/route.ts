import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encryptTradingSecret } from "@/lib/alpha-execution/credentials";
import {
  AGENT_SESSION_COOKIE,
  type AgentSessionState,
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
  buildAgentStudioReadableReport,
  decodeResearchIntent,
  extractAgentStudioReportSummary,
  fetchOfficialBstockMarket
} from "@/lib/bstock-alpha-live";
import {
  findRecentOwnedStudioJob,
  isStudioJobPending,
  isStudioJobTerminalFailure,
  isStudioReportComplete,
  resolveResearchOwner
} from "@/lib/bstock-agent-studio";
import { prisma } from "@/lib/prisma";
import { evmNetworkLabel, getEvmPublicClientByChainId } from "@/lib/bstock-evm";
import { AgentX402ValidationError, validateAgentX402Signature } from "@/lib/bstock-agentic-wallet-x402";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const inputSchema = z.object({
  intent: z.string().min(20).max(40_000),
  selectedIndex: z.number().int().positive(),
  confirmation: z.literal("确认付费研究"),
  acknowledged: z.literal(true)
});

const signSchema = z.object({
  paymentHeaderName: z.string(),
  paymentHeaderValue: z.string().min(20).max(40_000),
  approveTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).nullable().optional(),
  binanceChainId: z.string().nullable().optional(),
  signatureExpiresAt: z.coerce.number().finite().positive()
});

const studioSubmissionSchema = z.object({
  jobId: z.string().min(1).max(200),
  jobToken: z.string().min(1).max(10_000),
  status: z.string().optional(),
  expiresAt: z.union([z.string(), z.number()]).optional()
});

function dateFromUnknown(value: string | number | undefined) {
  if (value == null) return null;
  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
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
      headers: contextHeaders
    };
  }
  return {
    url: "https://stock-agent.bnbchain.org/x402/analyze/async",
    body: { symbols: [asset.ticker], analysis_type: "comprehensive" },
    accept: "application/json",
    headers: contextHeaders
  };
}

function decodePaymentResponse(value: string | null) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const txHash = Object.values(decoded).find((item) => typeof item === "string" && /^0x[a-fA-F0-9]{64}$/.test(item));
    return { txHash: typeof txHash === "string" ? txHash : null };
  } catch {
    return null;
  }
}

function parseCmcSse(body: string) {
  const dataLines = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
  const candidates = dataLines.length ? dataLines : [body.trim()];
  for (const candidate of candidates) {
    try {
      const message = JSON.parse(candidate) as { result?: { content?: Array<{ text?: string }> } };
      const text = message.result?.content?.find((item) => typeof item.text === "string")?.text;
      if (!text) continue;
      try {
        return { text: text.slice(0, 20_000), data: JSON.parse(text) as unknown };
      } catch {
        return { text: text.slice(0, 20_000), data: null };
      }
    } catch {
      continue;
    }
  }
  throw new Error("CMC AI 返回了无法识别的 MCP 数据。付款可能已结算，请勿直接重复签名。 ");
}

async function waitForEvmApproval(txHash: string, expiresAtSeconds: number, chainId: number) {
  const publicClient = getEvmPublicClientByChainId(chainId);
  if (!publicClient) return "UNSUPPORTED_NETWORK" as const;
  const deadline = Math.min(Date.now() + 25_000, expiresAtSeconds * 1000 - 3_000);
  while (Date.now() < deadline) {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
    if (receipt?.status === "success") return "CONFIRMED" as const;
    if (receipt?.status === "reverted") return "FAILED" as const;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return "PENDING" as const;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "付费研究执行仅允许从本站请求。" }, 403);
  let state: AgentSessionState | undefined;
  let phase = "validate_intent";

  try {
    const input = inputSchema.parse(await request.json());
    state = connectedAgentSession(request);
    const intent = decodeResearchIntent(input.intent);
    if (intent.agentKey !== agentSessionKey(state)) return json({ error: "该付款预览不属于当前 Agent 会话。" }, 403);
    if (Date.now() - intent.createdAt > 2 * 60_000) return json({ error: "付款预览已过期，请重新获取实时价格。" }, 410);
    if (!intent.allowedIndices.includes(input.selectedIndex)) return json({ error: "所选付款方式当前余额不足或不受支持。" }, 409);
    const reviewedOption = intent.allowedOptions.find((option) => option.index === input.selectedIndex);
    if (!reviewedOption) return json({ error: "所选付款网络不属于已审阅的 x402 付款意图。" }, 409);
    const market = await fetchOfficialBstockMarket();
    const asset = market.assets.find((entry) => entry.symbol === intent.symbol);
    if (!asset
      || asset.campaignEligibility !== "CONFIRMED"
      || asset.ticker !== intent.ticker
      || asset.contractAddress.toLowerCase() !== intent.contractAddress.toLowerCase()) {
      return json({ error: "所选 bStock 已无法通过当前官方周清单与合约地址复核，付款已阻止。" }, 409);
    }

    let studioOwner: Awaited<ReturnType<typeof resolveResearchOwner>> | null = null;
    if (intent.provider === "studio") {
      studioOwner = await resolveResearchOwner(state);
      state = studioOwner.state;
      const recent = await findRecentOwnedStudioJob(studioOwner, asset.ticker);
      if (recent && isStudioReportComplete(recent) && recent.reportMarkdown) {
        return persistAgentSession(json({
          status: "REUSED",
          provider: "studio",
          jobId: recent.jobId,
          symbol: recent.symbol,
          bstockSymbol: asset.symbol,
          summary: extractAgentStudioReportSummary(recent.reportMarkdown),
          reportReading: buildAgentStudioReadableReport(recent.reportMarkdown),
          reportMarkdown: recent.reportMarkdown,
          paymentTxHash: recent.paymentTxHash,
          completedAt: recent.completedAt?.toISOString() ?? null,
          message: "并发校验发现同一标的最近 30 分钟已有研报，已直接复用；本次未签名、未付款。"
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
          message: "并发校验发现同一标的已有已付费任务，继续回捞；本次未签名、未付款。"
        }, 202), state);
      }
      if (recent && isStudioJobTerminalFailure(recent)) {
        console.info("[bstock:studio]", JSON.stringify({
          event: "new_job_after_terminal_failure",
          previousJobId: recent.jobId,
          symbol: recent.symbol,
          errorCode: recent.upstreamErrorCode
        }));
      } else if (recent) {
        return persistAgentSession(json({
          error: "同一标的 30 分钟冷却期内已有不可自动恢复的任务，已阻止重复付款。",
          code: "STUDIO_RECENT_JOB_COOLDOWN",
          jobId: recent.jobId
        }, 409), state);
      }
    }

    phase = "sign";
    const signed = await agentWalletRequest<unknown>(
      state,
      "/bapi/defi/v1/public/wallet-direct/agent-wallet/x402-payment/sign",
      { body: { paymentId: intent.paymentId, selectedIndex: input.selectedIndex }, timeoutMs: 15_000 }
    );
    state = signed.state;
    const signature = signSchema.parse(signed.data);
    phase = "validate_signature";
    const merchant = merchantRequest(intent.provider, asset, intent.requestId);
    const { paymentHeaderName } = validateAgentX402Signature(signature, reviewedOption, intent.resourceUrl);
    console.info("[bstock:agent-x402]", JSON.stringify({
      event: "signature_validated", provider: intent.provider, network: reviewedOption.requirement.network,
      hasApprovalTransaction: Boolean(signature.approveTxHash), approvalChainId: signature.binanceChainId ?? null
    }));
    let approvalStatus: "NOT_REQUIRED" | "CONFIRMED" = "NOT_REQUIRED";
    if (signature.approveTxHash) {
      phase = "wait_approval";
      const result = await waitForEvmApproval(signature.approveTxHash, Number(signature.signatureExpiresAt), Number(reviewedOption.binanceChainId));
      if (result !== "CONFIRMED") {
        return persistAgentSession(json({
          error: result === "FAILED"
            ? "Permit2 一次性授权交易失败，研究服务未扣费；请重新预览付款方式。"
            : result === "UNSUPPORTED_NETWORK"
              ? "该付款网络的授权回执暂时无法由平台核验，研究服务未重放、未扣费。"
              : "Permit2 一次性授权已提交但尚未在签名有效期内确认，研究服务未重放、未扣费。授权确认后重新预览即可。",
          code: result === "FAILED" ? "APPROVAL_FAILED" : result === "UNSUPPORTED_NETWORK" ? "APPROVAL_NETWORK_UNSUPPORTED" : "APPROVAL_PENDING",
          approveTxHash: signature.approveTxHash,
          approvalStatus: result
        }, 409), state);
      }
      approvalStatus = "CONFIRMED";
    }
    if (Number(signature.signatureExpiresAt) * 1000 <= Date.now() + 2_000) {
      throw new Error("付款签名已接近过期，未向研究服务重放。请重新预览。 ");
    }

    phase = "merchant_replay";
    const replay = await fetch(merchant.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": merchant.accept,
        ...merchant.headers,
        [paymentHeaderName]: signature.paymentHeaderValue
      },
      body: JSON.stringify(merchant.body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });
    const settlement = decodePaymentResponse(replay.headers.get("payment-response"));
    console.info("[bstock:agent-x402]", JSON.stringify({ event: "merchant_response", provider: intent.provider, status: replay.status }));

    if (intent.provider === "cmc") {
      const responseBody = await replay.text();
      if (!replay.ok) {
        throw new Error(`CMC AI 付款重放返回 HTTP ${replay.status}。请勿重新签名；先重新查询状态。`);
      }
      const result = parseCmcSse(responseBody);
      return persistAgentSession(json({
        status: "SUCCEEDED",
        provider: "cmc",
        selectedAsset: { symbol: asset.symbol, ticker: asset.ticker, contractAddress: asset.contractAddress },
        countedTool: "get_global_metrics_latest",
        chainId: reviewedOption.binanceChainId,
        network: `eip155:${reviewedOption.binanceChainId}`,
        networkLabel: evmNetworkLabel(`eip155:${reviewedOption.binanceChainId}`),
        approvalStatus,
        approveTxHash: signature.approveTxHash ?? null,
        paymentTxHash: settlement?.txHash ?? null,
        result
      }), state);
    }

    const submissionRaw = await replay.json().catch(() => null);
    if (replay.status !== 202) {
      const detail = submissionRaw && typeof submissionRaw === "object" && "error" in submissionRaw
        ? String((submissionRaw as { error?: unknown }).error)
        : `HTTP ${replay.status}`;
      throw new Error(`Agent Studio 付款重放未受理：${detail}。请勿重新签名，以免重复扣费。`);
    }
    const submission = studioSubmissionSchema.parse(submissionRaw);
    if (!studioOwner) throw new Error("Agent Studio 任务缺少稳定的钱包归属，已停止保存任务。 ");
    try {
      await prisma.bstockResearchJob.upsert({
        where: { jobId: submission.jobId },
        create: {
          agentKey: agentSessionKey(state),
          ownerKey: studioOwner.ownerKey,
          symbol: asset.ticker,
          jobId: submission.jobId,
          jobTokenEncrypted: encryptTradingSecret(submission.jobToken),
          status: (submission.status || "queued").toLowerCase(),
          paymentTxHash: settlement?.txHash ?? null,
          expiresAt: dateFromUnknown(submission.expiresAt)
        },
        update: {
          agentKey: agentSessionKey(state),
          ownerKey: studioOwner.ownerKey,
          symbol: asset.ticker,
          jobTokenEncrypted: encryptTradingSecret(submission.jobToken),
          status: (submission.status || "queued").toLowerCase(),
          paymentTxHash: settlement?.txHash ?? null,
          expiresAt: dateFromUnknown(submission.expiresAt),
          errorMessage: null,
          upstreamErrorCode: null,
          retryable: false,
          resumeCount: 0,
          lastResumedAt: null
        }
      });
    } catch (persistenceError) {
      console.error("[bstock:studio]", JSON.stringify({
        event: "job_persistence_failed",
        jobId: submission.jobId,
        symbol: asset.ticker,
        error: persistenceError instanceof Error ? persistenceError.name : "unknown"
      }));
      return persistAgentSession(json({
        error: "研报已付款并被 Agent Studio 受理，但服务器暂时无法保存私密任务凭据。为防重复扣费，请勿再次付款，并联系管理员按 jobId 恢复。",
        code: "STUDIO_JOB_PERSISTENCE_FAILED",
        jobId: submission.jobId,
        paymentTxHash: settlement?.txHash ?? null,
        approvalStatus,
        approveTxHash: signature.approveTxHash ?? null
      }, 503), state);
    }

    console.info("[bstock:studio]", JSON.stringify({ event: "job_accepted", jobId: submission.jobId, symbol: asset.ticker }));

    return persistAgentSession(json({
      status: "ACCEPTED",
      provider: "studio",
      jobId: submission.jobId,
      symbol: asset.ticker,
      bstockSymbol: asset.symbol,
      chainId: reviewedOption.binanceChainId,
      network: `eip155:${reviewedOption.binanceChainId}`,
      networkLabel: evmNetworkLabel(`eip155:${reviewedOption.binanceChainId}`),
      paymentTxHash: settlement?.txHash ?? null,
      approvalStatus,
      approveTxHash: signature.approveTxHash ?? null,
      message: "研报已提交，通常需要 5–15 分钟完成；页面会在后台轮询同一 jobId，不会重复付费。"
    }, 202), state);
  } catch (error) {
    const known = error instanceof AgenticWalletRequestError;
    const validationError = error instanceof AgentX402ValidationError;
    console.error("[bstock:agent-x402]", JSON.stringify({
      event: "execution_failed", phase,
      code: known || validationError ? error.code : "RESEARCH_EXECUTION_FAILED",
      error: error instanceof Error ? error.name : "UnknownError"
    }));
    const message = error instanceof z.ZodError
      ? "付款确认参数无效。"
      : error instanceof Error ? error.message : "付费研究请求失败。";
    const response = json({ error: known ? error.message : message, code: known || validationError ? error.code : "RESEARCH_EXECUTION_FAILED" }, known ? error.status : 502);
    if (known && error.terminal) {
      response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
      return response;
    }
    return state ? persistAgentSession(response, state) : response;
  }
}
