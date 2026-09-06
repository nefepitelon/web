import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  decodePaymentSignatureHeader,
  encodePaymentSignatureHeader
} from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import {
  isPermit2PaymentPayload,
  recoverEip3009Payer,
  recoverPermit2ExactPayer
} from "@bnb-chain/b402";
import { NextRequest, NextResponse } from "next/server";
import { getAddress } from "viem";
import { z } from "zod";
import { encryptTradingSecret } from "@/lib/alpha-execution/credentials";
import { isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import {
  browserWalletAddressSchema,
  decodeBrowserResearchIntent,
  requireBoundEvmBrowserWallet
} from "@/lib/bstock-browser-wallet";
import { fetchOfficialBstockMarket } from "@/lib/bstock-alpha-live";
import { evmNetworkLabel, getEvmPublicClient, isEvmCaip2Network, parseEvmCaip2Network } from "@/lib/bstock-evm";
import { sameX402Requirement } from "@/lib/bstock-x402";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const X402_REPLAY_TIMEOUT_MS = 40_000;
const BROWSER_X402_PROTOCOL_VERSION = "b402-x402-v2-20260902";

const inputSchema = z.object({
  address: browserWalletAddressSchema,
  intent: z.string().min(20).max(40_000),
  selectedIndex: z.number().int().positive(),
  paymentProtocolVersion: z.literal(BROWSER_X402_PROTOCOL_VERSION),
  paymentHeaderName: z.literal("PAYMENT-SIGNATURE"),
  paymentHeaderValue: z.string().min(20).max(40_000),
  approveTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).nullable().optional(),
  confirmation: z.literal("确认付费研究"),
  acknowledged: z.literal(true)
});

const studioSubmissionSchema = z.object({
  jobId: z.string().min(1).max(200),
  jobToken: z.string().min(1).max(10_000),
  status: z.string().optional(),
  expiresAt: z.union([z.string(), z.number()]).optional()
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

function isTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function usefulPaymentError(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, 500);
  if (!normalized || /^(payment required|payment_rejected)$/i.test(normalized)) return null;
  return normalized;
}

async function paymentRejectionDetail(response: Response, settlementReason: string | null) {
  const fromSettlement = usefulPaymentError(settlementReason);
  if (fromSettlement) return fromSettlement;
  const header = response.headers.get("payment-required");
  if (header) {
    try {
      const decoded = decodePaymentRequiredHeader(header) as unknown as Record<string, unknown>;
      const detail = usefulPaymentError(decoded.error);
      if (detail) return detail;
    } catch {
      // Fall through to the merchant's JSON body.
    }
  }
  const body = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
  return usefulPaymentError(body?.error) || usefulPaymentError(body?.description);
}

function merchantRequest(provider: "cmc" | "studio", asset: { symbol: string; ticker: string; contractAddress: string }, requestId: string) {
  const headers = {
    "X-BStock-Symbol": asset.symbol,
    "X-BStock-Ticker": asset.ticker,
    "X-BStock-Contract": asset.contractAddress
  };
  if (provider === "cmc") {
    return {
      url: "https://mcp.coinmarketcap.com/x402/mcp",
      body: { jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: "get_global_metrics_latest", arguments: {} } },
      accept: "application/json, text/event-stream",
      headers
    };
  }
  return {
    url: "https://stock-agent.bnbchain.org/x402/analyze/async",
    body: { symbols: [asset.ticker], analysis_type: "comprehensive" },
    accept: "application/json",
    headers
  };
}

function dateFromUnknown(value: string | number | undefined) {
  if (value == null) return null;
  const date = new Date(typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCmcSse(body: string) {
  const candidates = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
  for (const candidate of candidates.length ? candidates : [body.trim()]) {
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
  throw new Error("CMC AI 返回了无法识别的 MCP 数据；请勿直接重复付款。");
}

function payerFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const authorization = record.authorization as Record<string, unknown> | undefined;
  const permit2 = record.permit2Authorization as Record<string, unknown> | undefined;
  return String(authorization?.from || permit2?.from || "");
}

async function verifyBrowserPaymentSignature(
  paymentPayload: ReturnType<typeof decodePaymentSignatureHeader>,
  requirement: Record<string, unknown>,
  expectedAddress: `0x${string}`
) {
  const transferMethod = String((requirement.extra as Record<string, unknown> | undefined)?.assetTransferMethod || "eip3009").toLowerCase();
  const payload = paymentPayload.payload as Record<string, unknown>;
  const signature = String(payload.signature || "");
  const isEoaSignature = /^0x[0-9a-fA-F]{130}$/.test(signature);
  if (transferMethod === "permit2-exact") {
    const canonicalPaymentPayload = {
      ...paymentPayload,
      x402Version: 2 as const,
      accepted: requirement,
      payload: paymentPayload.payload
    };
    if (!isPermit2PaymentPayload(canonicalPaymentPayload)) {
      const hasLegacyAuthorization = Boolean(payload.authorization) && !payload.permit2Authorization;
      console.warn("bstock.browser-research.execute.permit2_shape_rejected", {
        network: String(requirement.network || ""),
        hasLegacyAuthorization,
        hasPermit2Authorization: Boolean(payload.permit2Authorization),
        signatureBytes: signature.startsWith("0x") ? (signature.length - 2) / 2 : 0,
        payloadKeys: Object.keys(payload).sort()
      });
      if (hasLegacyAuthorization) {
        throw new Error("当前页面仍在使用旧版 EIP-3009 签名桥，无法提交 Permit2 付款。请刷新页面并重新获取付款预览；旧凭据未发送。");
      }
      throw new Error("浏览器钱包生成的 Permit2 付款载荷格式无效，凭据未提交。");
    }
    const authorization = canonicalPaymentPayload.payload.permit2Authorization;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (BigInt(authorization.deadline) <= now + 5n || BigInt(authorization.witness.validAfter) > now) {
      throw new Error("浏览器钱包生成的 Permit2 付款签名已过期或尚未生效，请重新获取付款预览。");
    }
    if (isEoaSignature) {
      const recovered = await recoverPermit2ExactPayer(canonicalPaymentPayload);
      if (getAddress(recovered) !== expectedAddress) {
        throw new Error("浏览器钱包 Permit2 签名者与当前已验证地址不一致，凭据未提交。");
      }
    } else {
      const publicClient = getEvmPublicClient(String(requirement.network || ""));
      const code = publicClient ? await publicClient.getCode({ address: expectedAddress }).catch(() => undefined) : undefined;
      if (!code || code === "0x") {
        throw new Error("普通 EOA 钱包返回了非标准长度的 Permit2 签名，凭据未提交。");
      }
    }
    return { transferMethod, paymentPayload: canonicalPaymentPayload };
  }
  if (isEoaSignature) {
    const recovered = await recoverEip3009Payer(paymentPayload as unknown as Parameters<typeof recoverEip3009Payer>[0]);
    if (getAddress(recovered) !== expectedAddress) {
      throw new Error("浏览器钱包 EIP-3009 签名者与当前已验证地址不一致，凭据未提交。");
    }
  }
  return { transferMethod, paymentPayload };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "浏览器钱包付费执行仅允许从本站请求。" }, 403);
  let paymentWasSubmitted = false;
  try {
    const input = inputSchema.parse(await request.json());
    const identity = await requireBoundEvmBrowserWallet(input.address);
    const intent = decodeBrowserResearchIntent(input.intent);
    if (getAddress(intent.walletAddress) !== identity.address || intent.ownerKey !== identity.ownerKey) {
      return json({ error: "该付款预览不属于当前浏览器钱包。" }, 403);
    }
    if (Date.now() - intent.createdAt > 2 * 60_000) return json({ error: "付款预览已过期，请重新获取。" }, 410);
    const requirement = intent.requirements[input.selectedIndex - 1];
    if (!requirement) return json({ error: "所选付款方式无效。" }, 409);
    if (!isEvmCaip2Network(requirement.network)) {
      return json({ error: "付款网络不是有效的 EVM CAIP-2 网络，已阻止重放。" }, 409);
    }
    const paymentPayload = decodePaymentSignatureHeader(input.paymentHeaderValue);
    if (paymentPayload.x402Version !== 2
      || !sameX402Requirement(paymentPayload.accepted, requirement)) {
      return json({ error: "钱包签名与已审阅的付款网络、资产、金额或收款地址不一致。" }, 409);
    }
    const payer = payerFromPayload(paymentPayload.payload);
    if (!payer || getAddress(payer) !== identity.address) {
      return json({ error: "x402 付款签名的付款地址与当前浏览器钱包不一致。" }, 403);
    }
    const verifiedPayment = await verifyBrowserPaymentSignature(
      paymentPayload,
      requirement as unknown as Record<string, unknown>,
      identity.address
    );
    const transferMethod = verifiedPayment.transferMethod;
    const canonicalPaymentHeaderValue = encodePaymentSignatureHeader(verifiedPayment.paymentPayload as PaymentPayload);

    const market = await fetchOfficialBstockMarket();
    const asset = market.assets.find((entry) => entry.symbol === intent.symbol);
    if (!asset
      || asset.campaignEligibility !== "CONFIRMED"
      || asset.ticker !== intent.ticker
      || asset.contractAddress.toLowerCase() !== intent.contractAddress.toLowerCase()) {
      return json({ error: "所选 bStock 已无法通过 Binance 官方清单复核，付款已阻止。" }, 409);
    }
    const merchant = merchantRequest(intent.provider, asset, intent.requestId);
    const replayStartedAt = Date.now();
    console.info("bstock.browser-research.execute.replay_started", {
      provider: intent.provider,
      symbol: asset.symbol,
      requestId: intent.requestId,
      network: requirement.network,
      transferMethod,
      paymentHeaderName: input.paymentHeaderName,
      timeoutMs: X402_REPLAY_TIMEOUT_MS
    });
    let replay: Response;
    try {
      paymentWasSubmitted = true;
      replay = await fetch(merchant.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": merchant.accept,
          ...merchant.headers,
          "PAYMENT-SIGNATURE": canonicalPaymentHeaderValue
        },
        body: JSON.stringify(merchant.body),
        cache: "no-store",
        signal: AbortSignal.timeout(X402_REPLAY_TIMEOUT_MS)
      });
    } catch (error) {
      console.error("bstock.browser-research.execute.replay_failed", {
        provider: intent.provider,
        symbol: asset.symbol,
        requestId: intent.requestId,
        durationMs: Date.now() - replayStartedAt,
        errorName: error instanceof Error ? error.name : "UnknownError"
      });
      if (isTimeoutError(error)) {
        return json({
          error: "付款凭据已发送，但研究服务在 40 秒内未返回最终状态。请先检查钱包交易与既有研报任务，切勿重新签名或重复付款。",
          code: "X402_SETTLEMENT_STATUS_UNKNOWN",
          paymentStatus: "UNKNOWN",
          retryable: false
        }, 504);
      }
      throw error;
    }
    console.info("bstock.browser-research.execute.replay_received", {
      provider: intent.provider,
      symbol: asset.symbol,
      requestId: intent.requestId,
      durationMs: Date.now() - replayStartedAt,
      upstreamStatus: replay.status,
      hasPaymentResponse: Boolean(replay.headers.get("payment-response")),
      hasPaymentRequired: Boolean(replay.headers.get("payment-required"))
    });
    let paymentTxHash: string | null = null;
    let settlementSuccess: boolean | null = null;
    let settlementReason: string | null = null;
    const paymentResponse = replay.headers.get("payment-response");
    if (paymentResponse) {
      try {
        const settlement = decodePaymentResponseHeader(paymentResponse);
        settlementSuccess = "success" in settlement && typeof settlement.success === "boolean"
          ? settlement.success
          : null;
        settlementReason = "errorReason" in settlement && typeof settlement.errorReason === "string"
          ? settlement.errorReason
          : null;
        paymentTxHash = "transaction" in settlement && typeof settlement.transaction === "string"
          ? settlement.transaction || null
          : null;
      } catch {
        paymentTxHash = null;
      }
    }

    if (replay.status === 402) {
      const detail = await paymentRejectionDetail(replay, settlementReason);
      console.warn("bstock.browser-research.execute.payment_rejected", {
        provider: intent.provider,
        symbol: asset.symbol,
        requestId: intent.requestId,
        transferMethod,
        settlementSuccess,
        hasTransaction: Boolean(paymentTxHash),
        rejectionReason: detail || settlementReason || "payment_rejected"
      });
      if (settlementSuccess === true || paymentTxHash) {
        return json({
          error: `${intent.provider === "studio" ? "Agent Studio" : "CMC AI"} 返回了 402，但结算回执显示付款可能已经上链。请先核对钱包交易与既有研报任务，切勿重新签名或重复付款。`,
          code: "X402_SETTLEMENT_STATUS_UNKNOWN",
          paymentStatus: "UNKNOWN",
          paymentTxHash,
          retryable: false
        }, 502);
      }
      return json({
        error: `${intent.provider === "studio" ? "Agent Studio" : "CMC AI"} 拒绝了该付款凭据${detail ? `：${detail}` : ""}。旧签名不得重放；请重新获取付款预览后再签名。`,
        code: "X402_PAYMENT_REJECTED",
        paymentStatus: "REJECTED",
        requiresNewPreview: true,
        retryable: true
      }, 402);
    }

    if (intent.provider === "cmc") {
      const body = await replay.text();
      if (!replay.ok) {
        return json({
          error: `CMC AI 返回 HTTP ${replay.status}。付款结果未确认，请勿重放旧签名。`,
          code: "X402_UPSTREAM_FAILED",
          paymentStatus: paymentTxHash ? "SETTLED" : "UNKNOWN",
          retryable: false
        }, 502);
      }
      return json({
        status: "SUCCEEDED",
        provider: "cmc",
        walletMode: "browser",
        chainId: parseEvmCaip2Network(requirement.network),
        network: requirement.network,
        networkLabel: evmNetworkLabel(requirement.network),
        selectedAsset: { symbol: asset.symbol, ticker: asset.ticker, contractAddress: asset.contractAddress },
        countedTool: "get_global_metrics_latest",
        approveTxHash: input.approveTxHash ?? null,
        paymentTxHash,
        result: parseCmcSse(body)
      });
    }

    const raw = await replay.json().catch(() => null);
    if (replay.status !== 202) {
      const detail = raw && typeof raw === "object" && "error" in raw ? String((raw as { error?: unknown }).error) : `HTTP ${replay.status}`;
      return json({
        error: `Agent Studio 付款请求未受理：${detail}。付款结果未确认，请勿重放旧签名。`,
        code: "X402_UPSTREAM_FAILED",
        paymentStatus: paymentTxHash ? "SETTLED" : "UNKNOWN",
        retryable: false
      }, 502);
    }
    const submission = studioSubmissionSchema.parse(raw);
    await prisma.bstockResearchJob.upsert({
      where: { jobId: submission.jobId },
      create: {
        agentKey: identity.agentKey,
        ownerKey: identity.ownerKey,
        symbol: asset.ticker,
        jobId: submission.jobId,
        jobTokenEncrypted: encryptTradingSecret(submission.jobToken),
        status: (submission.status || "queued").toLowerCase(),
        paymentTxHash,
        expiresAt: dateFromUnknown(submission.expiresAt)
      },
      update: {
        agentKey: identity.agentKey,
        ownerKey: identity.ownerKey,
        symbol: asset.ticker,
        jobTokenEncrypted: encryptTradingSecret(submission.jobToken),
        status: (submission.status || "queued").toLowerCase(),
        paymentTxHash,
        expiresAt: dateFromUnknown(submission.expiresAt),
        errorMessage: null,
        upstreamErrorCode: null,
        retryable: false
      }
    });
    return json({
      status: "ACCEPTED",
      provider: "studio",
      walletMode: "browser",
      chainId: parseEvmCaip2Network(requirement.network),
      network: requirement.network,
      networkLabel: evmNetworkLabel(requirement.network),
      jobId: submission.jobId,
      symbol: asset.ticker,
      bstockSymbol: asset.symbol,
      paymentTxHash,
      approveTxHash: input.approveTxHash ?? null,
      message: `研报已由浏览器钱包在 ${evmNetworkLabel(requirement.network)} 完成付款并提交；页面将持续查询同一 jobId，不会重复付费。`
    }, 202);
  } catch (error) {
    if (paymentWasSubmitted) {
      console.error("bstock.browser-research.execute.post_submit_failure", {
        errorName: error instanceof Error ? error.name : "UnknownError"
      });
      return json({
        error: "付款凭据已发送，但服务端未能确认完整结果。请先检查钱包交易与既有研报任务，切勿重新签名或重复付款。",
        code: "X402_SETTLEMENT_STATUS_UNKNOWN",
        paymentStatus: "UNKNOWN",
        retryable: false
      }, 502);
    }
    const message = error instanceof z.ZodError
      ? error.issues.some((issue) => issue.path[0] === "paymentProtocolVersion")
        ? "浏览器钱包付款页面版本已过期。请刷新页面并重新获取付款预览；旧凭据未发送。"
        : "浏览器钱包付款确认参数无效。"
      : error instanceof Error ? error.message : "浏览器钱包付费研究失败。";
    return json({ error: message, code: "BROWSER_RESEARCH_EXECUTION_FAILED" }, 502);
  }
}
