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
import { fetchAgentWalletData, walletSnapshotDto } from "@/lib/bstock-agentic-wallet-data";
import {
  normalizeAgenticWalletQuote,
  resolveBstockQuoteOutput,
  zodIssueSummary
} from "@/lib/bstock-agentic-wallet-quote";
import {
  BSTOCK_SYMBOL_PATTERN,
  PAY_TOKEN_ADDRESSES,
  agentStudioRatingScore,
  compareDecimals,
  deterministicBstockScore,
  encodeTradeIntent,
  extractAgentStudioReportSummary,
  fetchCmcLiveSnapshot,
  fetchOfficialBstockMarket,
  multiplyDecimals,
  realLiquidityScore,
  realPortfolioFitScore,
  resolveBstockSellRawAmount,
  safeNumber
} from "@/lib/bstock-alpha-live";
import { prisma } from "@/lib/prisma";
import { tradeIntentAuditHash } from "@/lib/bstock-trade-records";
import {
  BSTOCK_MAX_POSITION_PCT,
  bstockPositionLimitUsd,
  isBstockPositionWithinLimit
} from "@/lib/bstock-risk-policy";

const inputSchema = z.object({
  mode: z.literal("policy"),
  side: z.enum(["buy", "sell"]),
  symbol: z.string().trim().toUpperCase().regex(BSTOCK_SYMBOL_PATTERN),
  payToken: z.enum(["BNB", "USDT", "USDC", "U", "USD1"]),
  // Split-adjusted bStock balances can legitimately carry more than 18
  // decimal places even though the underlying ERC-20 amount is 18 decimals.
  amount: z.string().trim().min(1).max(100).regex(/^\d+(?:\.\d+)?$/),
  slippagePct: z.number().min(0.05).max(0.5)
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

async function latestAgentStudioScore(ownerKey: string, agentKey: string, ticker: string) {
  try {
    const report = await prisma.bstockResearchJob.findFirst({
      where: {
        symbol: ticker,
        status: "succeeded",
        reportMarkdown: { not: null },
        OR: [{ ownerKey }, { ownerKey: null, agentKey }]
      },
      orderBy: { completedAt: "desc" },
      select: { reportMarkdown: true, completedAt: true }
    });
    if (!report?.reportMarkdown) return null;
    const summary = extractAgentStudioReportSummary(report.reportMarkdown);
    const score = agentStudioRatingScore(summary.rating);
    return score == null ? null : { score, rating: summary.rating, completedAt: report.completedAt?.toISOString() ?? null };
  } catch {
    return null;
  }
}

export async function handleBstockTradingQuote(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "交易报价仅允许从本站请求。" }, 403);

  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await request.json());
  } catch (error) {
    console.warn("[bstock:quote] invalid_request", {
      issues: error instanceof z.ZodError ? zodIssueSummary(error) : [{ code: "invalid_json", path: "", message: "Invalid JSON body" }]
    });
    return json({ error: "交易报价参数无效，请检查模式、方向、标的、金额与滑点。", code: "INVALID_TRADE_QUOTE_INPUT" }, 400);
  }

  if (safeNumber(input.amount) <= 0) return json({ error: "交易数量必须大于 0。" }, 400);

  try {

    let state = connectedAgentSession(request);
    const [market, cmcResult] = await Promise.all([
      fetchOfficialBstockMarket(),
      fetchCmcLiveSnapshot().then((value) => ({ value })).catch(() => ({ value: null }))
    ]);
    const cmc = cmcResult.value;
    const asset = market.assets.find((item) => item.symbol === input.symbol);
    if (!asset) return json({ error: "Binance 官方 type=3 注册表中未找到该 bStock。" }, 409);

    const wallet = await fetchAgentWalletData(state);
    state = wallet.state;
    const sessionKey = agentSessionKey(state);
    const ownerKey = agentWalletOwnerKey(wallet.address);
    const multipliers = new Map(market.assets.map((item) => [item.contractAddress.toLowerCase(), item.multiplier]));
    const walletDto = walletSnapshotDto(wallet.tokens, multipliers);
    const payBalance = walletDto.paymentBalances[input.payToken];
    const bstockBalance = walletDto.bstockBalances.find((item) => item.address.toLowerCase() === asset.contractAddress.toLowerCase());
    const bnbBalance = walletDto.paymentBalances.BNB;
    if (!bnbBalance || bnbBalance.balance < 0.0002) return json({ error: "BNB Gas 余额不足，至少保留 0.0002 BNB。" }, 409);

    const studioSignal = await latestAgentStudioScore(ownerKey, sessionKey, asset.ticker);
    const liquidityScore = realLiquidityScore(market.assets.map((item) => item.quoteVolume), asset.quoteVolume);
    const portfolioScore = realPortfolioFitScore(walletDto.totalWalletValueUsd, bstockBalance?.valueUsd || 0);
    const decision = cmc
      ? deterministicBstockScore(cmc.score, studioSignal?.score ?? null, liquidityScore, portfolioScore)
      : null;
    if (input.side === "buy" && !cmc) {
      return json({ error: "CMC 实时宏观信号暂不可用；为避免用演示值代替，已阻止新开仓。" }, 503);
    }
    if (input.side === "buy" && !studioSignal) {
      return json({ error: `${input.symbol} 尚无当前 Agentic Wallet 的真实 Agent Studio 付费研报，已阻止新开仓。` }, 409);
    }
    if (input.side === "buy" && !decision) {
      return json({ error: "实时流动性或组合适配数据不完整，已阻止新开仓。" }, 409);
    }
    if (input.side === "buy" && cmc?.regime === "RISK_OFF") {
      return json({ error: `CMC 宏观风险开关为 RISK_OFF（${cmc.score}/100），已阻止新开仓。` }, 409);
    }
    if (input.side === "buy" && decision && decision.score < 70) {
      return json({ error: `${input.symbol} 实时确定性评分 ${decision.score.toFixed(1)} 未达到 70 分买入门槛。` }, 409);
    }

    const assetPrice = asset.price ?? bstockBalance?.price ?? 0;
    const payPrice = payBalance?.price || (input.payToken === "BNB" ? 0 : 1);
    const notionalUsd = input.side === "buy"
      ? safeNumber(input.amount) * payPrice
      : safeNumber(input.amount) * assetPrice;
    const positionLimitUsd = bstockPositionLimitUsd(walletDto.totalWalletValueUsd);
    const liveLimitUsd = Math.min(2_000, positionLimitUsd);
    if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return json({ error: "无法从实时余额计算交易名义金额。" }, 409);
    if (notionalUsd > liveLimitUsd + 0.000001) {
      return json({ error: `该订单约 $${notionalUsd.toFixed(2)}，超过当前 ${input.mode.toUpperCase()} 上限 $${liveLimitUsd.toFixed(2)}。` }, 409);
    }
    const postTradeExposureUsd = input.side === "buy" ? (bstockBalance?.valueUsd || 0) + notionalUsd : 0;
    if (input.side === "buy" && !isBstockPositionWithinLimit(postTradeExposureUsd, walletDto.totalWalletValueUsd)) {
      return json({ error: `${input.symbol} 成交后仓位约 $${postTradeExposureUsd.toFixed(2)}，未严格低于钱包组合 ${BSTOCK_MAX_POSITION_PCT}% 上限 $${positionLimitUsd.toFixed(2)}。` }, 409);
    }
    if (input.side === "buy" && (!payBalance || compareDecimals(input.amount, payBalance.balanceExact) > 0)) {
      return json({ error: `${input.payToken} 实盘余额不足。` }, 409);
    }
    if (input.side === "sell" && (!bstockBalance || compareDecimals(input.amount, bstockBalance.balanceExact) > 0)) {
      return json({ error: `${input.symbol} 实盘持仓不足。` }, 409);
    }

    const fromToken = input.side === "buy" ? PAY_TOKEN_ADDRESSES[input.payToken] : asset.contractAddress;
    const toToken = input.side === "buy" ? asset.contractAddress : PAY_TOKEN_ADDRESSES[input.payToken];
    const rawBstockToken = input.side === "sell"
      ? wallet.tokens.find((token) => token.contractAddress.toLowerCase() === asset.contractAddress.toLowerCase())
      : undefined;
    if (input.side === "sell" && !rawBstockToken) {
      return json({ error: `${input.symbol} 实盘原始余额不可用，报价已安全停止。` }, 409);
    }
    const rawTokenDecimals = Math.max(0, Math.min(36, Number(rawBstockToken?.decimals) || 18));
    const rawAmount = input.side === "sell"
      ? resolveBstockSellRawAmount(input.amount, asset.multiplier, rawBstockToken!.balance, rawTokenDecimals)
      : input.amount;
    if (input.side === "sell") {
      console.info("[bstock:quote] sell_amount_normalized", {
        symbol: input.symbol,
        shareDecimals: input.amount.split(".")[1]?.length || 0,
        rawDecimals: rawAmount.split(".")[1]?.length || 0,
        cappedToWalletBalance: compareDecimals(rawAmount, rawBstockToken!.balance) === 0
      });
    }
    const slippageRatio = (input.slippagePct / 100).toString();
    const quoteBody: Record<string, unknown> = {
      binanceChainId: "56",
      fromToken,
      toToken,
      amount: rawAmount,
      slippage: slippageRatio,
      fromTokenShare: input.side === "sell" ? input.amount : null,
      fromMultiplier: input.side === "sell" ? asset.multiplier : null
    };

    const quoted = await agentWalletRequest<unknown>(
      state,
      "/bapi/defi/v1/public/wallet-direct/web-dex/agent/quote",
      { body: quoteBody, timeoutMs: 15_000 }
    );
    state = quoted.state;
    let quote;
    try {
      quote = normalizeAgenticWalletQuote(quoted.data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("[bstock:quote] invalid_upstream_response", {
          symbol: input.symbol,
          side: input.side,
          issues: zodIssueSummary(error)
        });
        throw new AgenticWalletRequestError("Agentic Wallet 返回的报价格式暂不可识别，请重新获取报价。", {
          status: 502,
          code: "INVALID_AGENTIC_WALLET_QUOTE"
        });
      }
      throw error;
    }
    const output = resolveBstockQuoteOutput(quote, input.side, asset.multiplier, multiplyDecimals);
    if (!output || safeNumber(output) <= 0) return json({ error: "Agentic Wallet 未返回有效报价。" }, 502);
    const expiresAt = Date.now() + 60_000;
    const campaignEligibility = asset.campaignEligibility === "CONFIRMED" ? "CONFIRMED" : "UNVERIFIED";
    const intent = encodeTradeIntent({
      version: 1,
      kind: "trade",
      agentKey: agentSessionKey(state),
      mode: input.mode,
      side: input.side,
      symbol: input.symbol,
      ticker: asset.ticker,
      fromToken,
      toToken,
      amount: input.amount,
      slippageRatio,
      campaignEligibility,
      quoteOutput: output,
      quoteExpiresAt: expiresAt,
      createdAt: Date.now()
    });
    let tradeRecordId: string;
    try {
      const record = await prisma.bstockTradeRecord.upsert({
        where: { intentHash: tradeIntentAuditHash(intent) },
        create: {
          ownerKey,
          agentKey: agentSessionKey(state),
          intentHash: tradeIntentAuditHash(intent),
          mode: input.mode,
          side: input.side,
          symbol: input.symbol,
          ticker: asset.ticker,
          fromToken,
          toToken,
          fromSymbol: input.side === "buy" ? input.payToken : input.symbol,
          toSymbol: input.side === "buy" ? input.symbol : input.payToken,
          requestedAmount: input.amount,
          quotedAmount: output,
          slippageRatio,
          campaignEligibility,
          status: "INTENT_CREATED"
        },
        update: {},
        select: { id: true }
      });
      tradeRecordId = record.id;
    } catch (error) {
      console.error("[bstock:quote] trade_audit_write_failed", {
        symbol: input.symbol,
        side: input.side,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      throw new AgenticWalletRequestError("交易意图未能写入订单审计账本，已安全阻止提交；请稍后重试。", {
        status: 503,
        code: "TRADE_AUDIT_UNAVAILABLE"
      });
    }

    const response = json({
      intent,
      tradeRecordId,
      expiresAt,
      mode: input.mode,
      side: input.side,
      symbol: input.symbol,
      fromToken,
      toToken,
      fromAmount: input.amount,
      fromSymbol: input.side === "buy" ? input.payToken : input.symbol,
      toAmount: output,
      toSymbol: input.side === "buy" ? input.symbol : input.payToken,
      slippagePct: input.slippagePct,
      feeUsd: safeNumber(quote.feeDetail?.rateFiatValue),
      feeRatePct: safeNumber(quote.feeDetail?.ratePercent),
      gasUsd: safeNumber(quote.gasDetails?.gasFeeInUsd),
      gasMode: quote.gasDetails?.gasMode || null,
      notionalUsd,
      liveLimitUsd,
      positionLimitUsd,
      positionLimitPct: BSTOCK_MAX_POSITION_PCT,
      postTradeExposureUsd,
      postTradeExposurePct: walletDto.totalWalletValueUsd > 0
        ? postTradeExposureUsd / walletDto.totalWalletValueUsd * 100
        : null,
      campaignEligibility,
      decision: {
        finalScore: decision ? Number(decision.score.toFixed(2)) : null,
        cmcScore: cmc?.score ?? null,
        cmcRegime: cmc?.regime ?? null,
        equityScore: decision?.equityScore ?? null,
        liquidityScore,
        portfolioScore,
        equitySource: decision?.equitySource ?? null,
        agentStudioRating: studioSignal?.rating ?? null,
        agentStudioCompletedAt: studioSignal?.completedAt ?? null
      },
      eligibilityUrl: market.eligibilityUrl,
      warning: campaignEligibility === "UNVERIFIED"
        ? "官方每周合格清单当前受 WAF 保护，资格未能实时核验；可继续交易，但可能不计入活动 PnL。"
        : null
    });
    return persistAgentSession(response, state);
  } catch (error) {
    const known = error instanceof AgenticWalletRequestError;
    if (error instanceof z.ZodError) {
      console.error("[bstock:quote] live_data_contract_failed", {
        symbol: input.symbol,
        side: input.side,
        issues: zodIssueSummary(error)
      });
      return json({
        error: "实时行情或钱包数据格式发生变化，报价已安全停止。",
        code: "LIVE_DATA_CONTRACT_INVALID"
      }, 502);
    }
    const logFailure = known && error.status < 500 ? console.warn : console.error;
    logFailure("[bstock:quote] failed", {
      symbol: input.symbol,
      side: input.side,
      code: known ? error.code : "TRADE_QUOTE_FAILED",
      error: error instanceof Error ? error.message : "Unknown error"
    });
    const message = error instanceof Error ? error.message : "实盘报价失败。";
    const response = json({ error: known ? error.message : message, code: known ? error.code : "TRADE_QUOTE_FAILED" }, known ? error.status : 502);
    if (known && error.terminal) response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    return response;
  }
}
