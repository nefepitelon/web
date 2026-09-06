import { randomUUID } from "node:crypto";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { NextRequest, NextResponse } from "next/server";
import { erc20Abi, formatUnits, getAddress, isAddress } from "viem";
import { z } from "zod";
import { isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import {
  browserWalletAddressSchema,
  encodeBrowserResearchIntent,
  requireBoundEvmBrowserWallet
} from "@/lib/bstock-browser-wallet";
import {
  evmNativeSymbol,
  evmNetworkLabel,
  getEvmPublicClient,
  isEvmCaip2Network,
  parseEvmCaip2Network
} from "@/lib/bstock-evm";
import {
  BSTOCK_SYMBOL_PATTERN,
  buildAgentStudioReadableReport,
  extractAgentStudioReportSummary,
  fetchOfficialBstockMarket
} from "@/lib/bstock-alpha-live";
import { STUDIO_REPORT_REUSE_MS } from "@/lib/bstock-agent-studio";
import { prisma } from "@/lib/prisma";
import { fetchUnpaidResearchChallenge, ResearchPreviewTimeoutError, ResearchPreviewTrace } from "@/lib/bstock-research-preview";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const inputSchema = z.object({
  provider: z.enum(["cmc", "studio"]),
  symbol: z.string().trim().toUpperCase().regex(BSTOCK_SYMBOL_PATTERN).default("NVDAB"),
  address: browserWalletAddressSchema
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

function merchantRequest(provider: "cmc" | "studio", asset: { symbol: string; ticker: string; contractAddress: string }, requestId: string) {
  const contextHeaders = {
    "X-BStock-Symbol": asset.symbol,
    "X-BStock-Ticker": asset.ticker,
    "X-BStock-Contract": asset.contractAddress
  };
  if (provider === "cmc") {
    return {
      url: "https://mcp.coinmarketcap.com/x402/mcp",
      body: { jsonrpc: "2.0", id: requestId, method: "tools/call", params: { name: "get_global_metrics_latest", arguments: {} } },
      accept: "application/json, text/event-stream",
      headers: contextHeaders,
      purpose: `CMC AI · get_global_metrics_latest · ${asset.symbol} 决策上下文`
    };
  }
  return {
    url: "https://stock-agent.bnbchain.org/x402/analyze/async",
    body: { symbols: [asset.ticker], analysis_type: "comprehensive" },
    accept: "application/json",
    headers: contextHeaders,
    purpose: `Agent Studio · ${asset.ticker}（${asset.symbol}）综合研报`
  };
}

function isV2EvmRequirement(requirement: PaymentRequirements) {
  return "amount" in requirement
    && requirement.scheme.toLowerCase() === "exact"
    && isEvmCaip2Network(requirement.network)
    && isAddress(requirement.asset)
    && isAddress(requirement.payTo)
    && /^\d+$/.test(requirement.amount)
    && BigInt(requirement.amount) > 0n;
}

async function optionDetails(requirement: PaymentRequirements, address: `0x${string}`, index: number) {
  if (!("amount" in requirement) || !isAddress(requirement.asset)) return null;
  const chainId = parseEvmCaip2Network(requirement.network);
  if (chainId == null) return null;
  const asset = getAddress(requirement.asset);
  const networkClient = getEvmPublicClient(requirement.network, { timeout: 5_000, retryCount: 0 });
  const transferMethod = String((requirement.extra as Record<string, unknown> | undefined)?.assetTransferMethod || "eip3009");
  if (!networkClient) {
    return {
      index,
      status: "READY_TO_SIGN",
      reasons: ["BALANCE_CHECK_IN_WALLET"],
      selectable: true,
      tokenSymbol: String((requirement.extra as Record<string, unknown> | undefined)?.name || "TOKEN"),
      tokenAddress: asset,
      amount: requirement.amount,
      amountRaw: requirement.amount,
      amountUsd: null,
      network: requirement.network.toLowerCase(),
      chainId,
      networkLabel: evmNetworkLabel(requirement.network),
      transferMethod,
      payTo: requirement.payTo,
      currentBalance: null,
      needApproveFirst: transferMethod.toLowerCase().startsWith("permit2")
    };
  }
  const [decimalsResult, symbolResult, balanceResult, nativeBalance] = await Promise.all([
    networkClient.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
    networkClient.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" }).catch(() => "TOKEN"),
    networkClient.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [address] }).catch(() => null),
    networkClient.getBalance({ address }).catch(() => null)
  ]);
  const decimals = Number(decimalsResult);
  const requiredRaw = BigInt(requirement.amount);
  const balanceRaw = balanceResult == null ? null : BigInt(balanceResult);
  const needsApproveFirst = transferMethod.toLowerCase().startsWith("permit2");
  const gasReady = !needsApproveFirst || (nativeBalance != null && nativeBalance > 0n);
  const selectable = balanceRaw != null && balanceRaw >= requiredRaw && gasReady;
  return {
    index,
    status: selectable ? "READY_TO_SIGN" : "NOT_SIGNABLE",
    reasons: [
      ...(balanceRaw == null ? ["BALANCE_CHECK_UNAVAILABLE"] : balanceRaw < requiredRaw ? ["INSUFFICIENT_TOKEN_BALANCE"] : []),
      ...(!gasReady ? [nativeBalance == null ? "GAS_CHECK_UNAVAILABLE" : `INSUFFICIENT_${evmNativeSymbol(chainId).toUpperCase()}_GAS`] : [])
    ],
    selectable,
    tokenSymbol: String(symbolResult),
    tokenAddress: asset,
    amount: formatUnits(requiredRaw, decimals),
    amountRaw: requirement.amount,
    amountUsd: null,
    network: requirement.network.toLowerCase(),
    chainId,
    networkLabel: evmNetworkLabel(requirement.network),
    transferMethod,
    payTo: requirement.payTo,
    currentBalance: balanceRaw == null ? null : formatUnits(balanceRaw, decimals),
    needApproveFirst: needsApproveFirst
  };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "浏览器钱包付费预览仅允许从本站请求。" }, 403);
  const requestId = randomUUID();
  const trace = new ResearchPreviewTrace({ walletMode: "browser", requestId });
  try {
    const input = inputSchema.parse(await request.json());
    const identity = await trace.run("wallet_owner", () => requireBoundEvmBrowserWallet(input.address), 25_000);
    const market = await trace.run("market", () => fetchOfficialBstockMarket(), 35_000);
    const asset = market.assets.find((entry) => entry.symbol === input.symbol);
    if (!asset || asset.campaignEligibility !== "CONFIRMED") {
      return json({ error: `${input.symbol} 当前无法由 Binance 官方本周清单确认，未创建付费请求。` }, 409);
    }

    if (input.provider === "studio") {
      const cutoff = new Date(Date.now() - STUDIO_REPORT_REUSE_MS);
      const recent = await trace.run("existing_studio_job", () => prisma.bstockResearchJob.findFirst({
        where: {
          ownerKey: identity.ownerKey,
          provider: "AGENT_STUDIO",
          symbol: asset.ticker,
          OR: [{ createdAt: { gte: cutoff } }, { completedAt: { gte: cutoff } }]
        },
        orderBy: { createdAt: "desc" }
      }), 15_000);
      if (recent?.status === "succeeded" && recent.reportMarkdown) {
        return json({
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
          message: "已复用该浏览器钱包最近 30 分钟内完成的研报，本次不会付款。"
        });
      }
      if (recent && ["settling", "queued", "running", "finalizing", "succeeded"].includes(recent.status.toLowerCase())) {
        return json({
          status: "RECOVERING",
          provider: "studio",
          jobId: recent.jobId,
          symbol: recent.symbol,
          bstockSymbol: asset.symbol,
          jobStatus: recent.status,
          retryable: recent.retryable,
          paymentTxHash: recent.paymentTxHash,
          message: "该浏览器钱包已有已付费任务，将继续回捞，不会重复付款。"
        }, 202);
      }
    }

    const merchant = merchantRequest(input.provider, asset, requestId);
    const header = await fetchUnpaidResearchChallenge(merchant, trace);
    const paymentRequired = decodePaymentRequiredHeader(header);
    if (paymentRequired.x402Version !== 2) {
      return json({ error: "该研究服务没有返回 x402 v2 付款方式，已阻止签名。", code: "X402_V2_UNAVAILABLE" }, 409);
    }
    const requirements = paymentRequired.accepts.filter(isV2EvmRequirement);
    if (!requirements.length) {
      return json({
        error: "上游当前未提供可验证的 EVM x402 exact 付款方式。",
        code: "EVM_X402_UNAVAILABLE",
        provider: input.provider
      }, 409);
    }
    const details = (await trace.run("browser_wallet_balances", () => Promise.all(requirements.map((requirement, index) => optionDetails(requirement, identity.address, index + 1))), 8_000))
      .filter((option): option is NonNullable<typeof option> => Boolean(option));
    const filteredPaymentRequired: PaymentRequired = { ...paymentRequired, accepts: requirements };
    const intent = encodeBrowserResearchIntent({
      version: 1,
      kind: "browser-research",
      walletAddress: identity.address,
      ownerKey: identity.ownerKey,
      provider: input.provider,
      symbol: asset.symbol,
      ticker: asset.ticker,
      contractAddress: asset.contractAddress,
      requestId,
      paymentRequired: filteredPaymentRequired as unknown as Record<string, unknown>,
      requirements: requirements as unknown as Array<Record<string, unknown>>,
      createdAt: Date.now()
    });
    return json({
      intent,
      provider: input.provider,
      walletMode: "browser",
      networks: Array.from(new Set(requirements.map((requirement) => requirement.network.toLowerCase()))),
      paymentRequired: filteredPaymentRequired,
      selectedAsset: { symbol: asset.symbol, ticker: asset.ticker, contractAddress: asset.contractAddress },
      purpose: merchant.purpose,
      expiresAt: Date.now() + 2 * 60_000,
      options: details
    });
  } catch (error) {
    trace.log("failed", { errorName: error instanceof Error ? error.name : "UnknownError" });
    if (error instanceof ResearchPreviewTimeoutError) {
      return json({
        error: error.message,
        code: error.code,
        stage: error.stage,
        requestId,
        retryable: true
      }, 504);
    }
    const message = error instanceof z.ZodError
      ? "浏览器钱包研究请求参数无效。"
      : error instanceof Error ? error.message : "浏览器钱包研究付款预览失败。";
    return json({ error: message, code: "BROWSER_RESEARCH_PREVIEW_FAILED" }, 502);
  } finally {
    trace.log("finished");
  }
}
