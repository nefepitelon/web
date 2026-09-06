import { CurrencyAmount, Native, Percent, Token, TradeType, ChainId } from "@pancakeswap/sdk";
import { SMART_ROUTER_ADDRESSES, SmartRouter, SwapRouter } from "@pancakeswap/smart-router";
import { NextRequest, NextResponse } from "next/server";
import { hexToBigInt, parseUnits } from "viem";
import { z } from "zod";
import { isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import {
  PANCAKE_SMART_ROUTER,
  browserPublicClient,
  browserWalletAddressSchema,
  encodeBrowserTradeIntent,
  fetchBrowserWalletSnapshot,
  requireBoundEvmBrowserWallet
} from "@/lib/bstock-browser-wallet";
import {
  BSTOCK_SYMBOL_PATTERN,
  PAY_TOKEN_ADDRESSES,
  agentStudioRatingScore,
  compareDecimals,
  deterministicBstockScore,
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

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const inputSchema = z.object({
  address: browserWalletAddressSchema,
  mode: z.literal("policy"),
  side: z.enum(["buy", "sell"]),
  symbol: z.string().trim().toUpperCase().regex(BSTOCK_SYMBOL_PATTERN),
  payToken: z.enum(["BNB", "USDT", "USDC", "U", "USD1"]),
  amount: z.string().trim().min(1).max(100).regex(/^\d+(?:\.\d+)?$/),
  slippagePct: z.number().min(0.05).max(0.5)
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

async function latestStudioScore(ownerKey: string, ticker: string) {
  const report = await prisma.bstockResearchJob.findFirst({
    where: { ownerKey, symbol: ticker, status: "succeeded", reportMarkdown: { not: null } },
    orderBy: { completedAt: "desc" },
    select: { reportMarkdown: true, completedAt: true }
  }).catch(() => null);
  if (!report?.reportMarkdown) return null;
  const summary = extractAgentStudioReportSummary(report.reportMarkdown);
  const score = agentStudioRatingScore(summary.rating);
  return score == null ? null : { score, rating: summary.rating, completedAt: report.completedAt?.toISOString() ?? null };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "浏览器钱包交易报价仅允许从本站请求。" }, 403);
  try {
    const input = inputSchema.parse(await request.json());
    if (safeNumber(input.amount) <= 0) return json({ error: "交易数量必须大于 0。" }, 400);
    const identity = await requireBoundEvmBrowserWallet(input.address);
    const [market, cmcResult] = await Promise.all([
      fetchOfficialBstockMarket(),
      fetchCmcLiveSnapshot().then((value) => ({ value })).catch(() => ({ value: null }))
    ]);
    const cmc = cmcResult.value;
    const asset = market.assets.find((item) => item.symbol === input.symbol);
    if (!asset || asset.campaignEligibility !== "CONFIRMED") {
      return json({ error: "该 bStock 无法通过 Binance 官方 BNB Chain 清单核验，已阻止报价。" }, 409);
    }
    const wallet = await fetchBrowserWalletSnapshot(identity.address, market.assets);
    const payBalance = wallet.paymentBalances[input.payToken];
    const bstockBalance = wallet.bstockBalances.find((item) => item.address.toLowerCase() === asset.contractAddress.toLowerCase());
    if (wallet.paymentBalances.BNB.balance < 0.0002) return json({ error: "BNB Gas 余额不足，至少保留 0.0002 BNB。" }, 409);

    const studioSignal = await latestStudioScore(identity.ownerKey, asset.ticker);
    const liquidityScore = realLiquidityScore(market.assets.map((item) => item.quoteVolume), asset.quoteVolume);
    const portfolioScore = realPortfolioFitScore(wallet.totalWalletValueUsd, bstockBalance?.valueUsd || 0);
    const decision = cmc ? deterministicBstockScore(cmc.score, studioSignal?.score ?? null, liquidityScore, portfolioScore) : null;
    if (input.side === "buy" && !cmc) return json({ error: "CMC 实时宏观信号不可用，已阻止新开仓。" }, 503);
    if (input.side === "buy" && !studioSignal) return json({ error: `${input.symbol} 尚无该浏览器钱包的真实 Agent Studio 付费研报，已阻止新开仓。` }, 409);
    if (input.side === "buy" && (!decision || cmc?.regime === "RISK_OFF" || decision.score < 70)) {
      return json({ error: "双 AI 信号或确定性评分未通过 POLICY 新开仓门槛。" }, 409);
    }

    const assetPrice = asset.price ?? bstockBalance?.price ?? 0;
    const notionalUsd = input.side === "buy"
      ? safeNumber(input.amount) * payBalance.price
      : safeNumber(input.amount) * assetPrice;
    const positionLimitUsd = bstockPositionLimitUsd(wallet.totalWalletValueUsd);
    const liveLimitUsd = Math.min(2_000, positionLimitUsd);
    if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return json({ error: "无法从实时余额计算交易名义金额。" }, 409);
    if (notionalUsd > liveLimitUsd + 0.000001) {
      return json({ error: `该订单约 $${notionalUsd.toFixed(2)}，超过 POLICY 上限 $${liveLimitUsd.toFixed(2)}。` }, 409);
    }
    const postTradeExposureUsd = input.side === "buy" ? (bstockBalance?.valueUsd || 0) + notionalUsd : 0;
    if (input.side === "buy" && !isBstockPositionWithinLimit(postTradeExposureUsd, wallet.totalWalletValueUsd)) {
      return json({ error: `${input.symbol} 成交后仓位未严格低于钱包组合 ${BSTOCK_MAX_POSITION_PCT}% 上限。` }, 409);
    }
    if (input.side === "buy" && compareDecimals(input.amount, payBalance.balanceExact) > 0) {
      return json({ error: `${input.payToken} 浏览器钱包余额不足。` }, 409);
    }
    if (input.side === "sell" && (!bstockBalance || compareDecimals(input.amount, bstockBalance.balanceExact) > 0)) {
      return json({ error: `${input.symbol} 浏览器钱包持仓不足。` }, 409);
    }

    const fromTokenAddress = input.side === "buy" ? PAY_TOKEN_ADDRESSES[input.payToken] : asset.contractAddress;
    const toTokenAddress = input.side === "buy" ? asset.contractAddress : PAY_TOKEN_ADDRESSES[input.payToken];
    const rawSellAmount = input.side === "sell"
      ? resolveBstockSellRawAmount(input.amount, asset.multiplier, wallet.tokenMeta.get(asset.contractAddress.toLowerCase())?.exact || "0", wallet.tokenMeta.get(asset.contractAddress.toLowerCase())?.decimals || 18)
      : input.amount;
    const fromMeta = fromTokenAddress.toLowerCase() === PAY_TOKEN_ADDRESSES.BNB.toLowerCase()
      ? { decimals: 18 }
      : wallet.tokenMeta.get(fromTokenAddress.toLowerCase());
    const toMeta = toTokenAddress.toLowerCase() === PAY_TOKEN_ADDRESSES.BNB.toLowerCase()
      ? { decimals: 18 }
      : wallet.tokenMeta.get(toTokenAddress.toLowerCase());
    const fromDecimals = fromMeta?.decimals ?? 18;
    const toDecimals = toMeta?.decimals ?? 18;
    const fromSymbol = input.side === "buy" ? input.payToken : input.symbol;
    const toSymbol = input.side === "buy" ? input.symbol : input.payToken;
    const currencyIn = fromTokenAddress.toLowerCase() === PAY_TOKEN_ADDRESSES.BNB.toLowerCase()
      ? Native.onChain(ChainId.BSC)
      : new Token(ChainId.BSC, fromTokenAddress as `0x${string}`, fromDecimals, fromSymbol);
    const currencyOut = toTokenAddress.toLowerCase() === PAY_TOKEN_ADDRESSES.BNB.toLowerCase()
      ? Native.onChain(ChainId.BSC)
      : new Token(ChainId.BSC, toTokenAddress as `0x${string}`, toDecimals, toSymbol);
    const rawAmount = parseUnits(rawSellAmount, fromDecimals);
    const amount = CurrencyAmount.fromRawAmount(currencyIn, rawAmount);
    const quoteProvider = SmartRouter.createQuoteProvider({ onChainProvider: () => browserPublicClient as never });
    const v2Pools = await SmartRouter.getV2CandidatePools({
      onChainProvider: () => browserPublicClient as never,
      currencyA: currencyIn,
      currencyB: currencyOut
    });
    let trade = await SmartRouter.getBestTrade(amount, currencyOut, TradeType.EXACT_INPUT, {
      gasPriceWei: () => browserPublicClient.getGasPrice(),
      maxHops: 3,
      maxSplits: 2,
      poolProvider: SmartRouter.createStaticPoolProvider(v2Pools),
      quoteProvider,
      quoterOptimization: true
    });
    if (!trade) {
      const v3Pools = await SmartRouter.getV3CandidatePools({
        onChainProvider: () => browserPublicClient as never,
        currencyA: currencyIn,
        currencyB: currencyOut,
        subgraphFallback: true,
        staticFallback: true
      });
      trade = await SmartRouter.getBestTrade(amount, currencyOut, TradeType.EXACT_INPUT, {
        gasPriceWei: () => browserPublicClient.getGasPrice(),
        maxHops: 3,
        maxSplits: 2,
        poolProvider: SmartRouter.createStaticPoolProvider([...v2Pools, ...v3Pools]),
        quoteProvider,
        quoterOptimization: true
      });
    }
    if (!trade) return json({ error: "PancakeSwap 在 BNB Chain 上未找到可执行流动性路径。" }, 409);

    const slippageTolerance = new Percent(Math.round(input.slippagePct * 100), 10_000);
    const { value, calldata } = SwapRouter.swapCallParameters(trade, {
      recipient: identity.address,
      slippageTolerance
    });
    const router = SMART_ROUTER_ADDRESSES[ChainId.BSC] || PANCAKE_SMART_ROUTER;
    if (router.toLowerCase() !== PANCAKE_SMART_ROUTER.toLowerCase()) {
      throw new Error("PancakeSwap BNB Chain 路由地址与安全配置不一致，已停止报价。 ");
    }
    const rawQuoteOutput = trade.outputAmount.toExact();
    const quoteOutput = input.side === "buy" ? multiplyDecimals(rawQuoteOutput, asset.multiplier) : rawQuoteOutput;
    const expiresAt = Date.now() + 60_000;
    const intent = encodeBrowserTradeIntent({
      version: 1,
      kind: "browser-trade",
      walletAddress: identity.address,
      ownerKey: identity.ownerKey,
      mode: "policy",
      side: input.side,
      symbol: input.symbol,
      ticker: asset.ticker,
      fromToken: fromTokenAddress,
      toToken: toTokenAddress,
      fromSymbol,
      toSymbol,
      amount: input.amount,
      quoteOutput,
      slippageRatio: (input.slippagePct / 100).toString(),
      router,
      calldata,
      value: hexToBigInt(value).toString(),
      quoteExpiresAt: expiresAt,
      createdAt: Date.now()
    });
    const intentHash = tradeIntentAuditHash(intent);
    const record = await prisma.bstockTradeRecord.upsert({
      where: { intentHash },
      create: {
        ownerKey: identity.ownerKey,
        agentKey: identity.agentKey,
        intentHash,
        mode: "policy",
        side: input.side,
        symbol: input.symbol,
        ticker: asset.ticker,
        fromToken: fromTokenAddress,
        toToken: toTokenAddress,
        fromSymbol,
        toSymbol,
        requestedAmount: input.amount,
        quotedAmount: quoteOutput,
        slippageRatio: (input.slippagePct / 100).toString(),
        campaignEligibility: "CONFIRMED",
        status: "INTENT_CREATED"
      },
      update: { quotedAmount: quoteOutput, status: "INTENT_CREATED" },
      select: { id: true }
    });
    const approval = fromTokenAddress.toLowerCase() === PAY_TOKEN_ADDRESSES.BNB.toLowerCase()
      ? null
      : { token: fromTokenAddress, spender: router, amount: rawAmount.toString() };
    let gas = null;
    try {
      gas = (await browserPublicClient.estimateGas({
        account: identity.address,
        to: router,
        data: calldata as `0x${string}`,
        value: hexToBigInt(value)
      })).toString();
    } catch {
      gas = null;
    }
    return json({
      intent,
      tradeRecordId: record.id,
      expiresAt,
      walletMode: "browser",
      chainId: 56,
      mode: "policy",
      side: input.side,
      symbol: input.symbol,
      fromToken: fromTokenAddress,
      toToken: toTokenAddress,
      fromAmount: input.amount,
      fromSymbol,
      toAmount: quoteOutput,
      toSymbol,
      slippagePct: input.slippagePct,
      feeUsd: 0,
      feeRatePct: 0,
      gasUsd: null,
      gasMode: "BROWSER_WALLET",
      notionalUsd,
      liveLimitUsd,
      positionLimitUsd,
      positionLimitPct: BSTOCK_MAX_POSITION_PCT,
      postTradeExposureUsd,
      postTradeExposurePct: wallet.totalWalletValueUsd > 0 ? postTradeExposureUsd / wallet.totalWalletValueUsd * 100 : null,
      campaignEligibility: "CONFIRMED",
      approval,
      transaction: { to: router, data: calldata, value: hexToBigInt(value).toString(), gas },
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
      warning: "浏览器钱包将在 BNB Chain 上显示授权（如需）及 PancakeSwap 交易确认；只有链上回执成功才计入账本。"
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "浏览器钱包交易报价参数无效。"
      : error instanceof Error ? error.message : "浏览器钱包实盘报价失败。";
    console.error("[bstock:browser-quote] failed", { error: message });
    return json({ error: message, code: "BROWSER_TRADE_QUOTE_FAILED" }, 502);
  }
}
