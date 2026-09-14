import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
  agentWalletOwnerKey,
  agentWalletRequest,
  connectedAgentSession,
  persistAgentSession
} from "@/lib/bstock-agentic-wallet-client";
import { fetchAgentWalletData, walletSnapshotDto } from "@/lib/bstock-agentic-wallet-data";
import { normalizeAgenticWalletOrder } from "@/lib/bstock-agentic-wallet-order";
import { zodIssueSummary } from "@/lib/bstock-agentic-wallet-quote";
import {
  PAY_TOKEN_ADDRESSES,
  agentStudioRatingScore,
  compareDecimals,
  decodeTradeIntent,
  deterministicBstockScore,
  extractAgentStudioReportSummary,
  fetchCmcLiveSnapshot,
  fetchOfficialBstockMarket,
  realLiquidityScore,
  realPortfolioFitScore,
  resolveBstockSellRawAmount,
  safeNumber
} from "@/lib/bstock-alpha-live";
import { prisma } from "@/lib/prisma";
import { tradeIntentAuditHash } from "@/lib/bstock-trade-records";
import { autoSettingsSchema } from "@/lib/bstock-auto-strategy";
import { validateBstockAutoExecution } from "@/lib/bstock-auto-execution-guard";
import {
  BstockSubmissionClaimError,
  claimBstockTradeSubmission,
  type BstockTradingExecutionContext
} from "@/lib/bstock-trade-submission-claim";
import {
  BSTOCK_MAX_POSITION_PCT,
  bstockPositionLimitUsd,
  isBstockPositionWithinLimit
} from "@/lib/bstock-risk-policy";

const inputSchema = z.object({
  intent: z.string().min(20).max(12_000),
  confirmation: z.literal("确认实盘交易"),
  acknowledged: z.literal(true),
  eligibilityAcknowledged: z.boolean().default(false)
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
    const score = agentStudioRatingScore(extractAgentStudioReportSummary(report.reportMarkdown).rating);
    return score == null ? null : { score, completedAt: report.completedAt };
  } catch {
    return null;
  }
}

export async function handleBstockTradingExecute(request: NextRequest, context: BstockTradingExecutionContext = {}) {
  if (!isSameOrigin(request)) return json({ error: "实盘执行仅允许从本站请求。" }, 403);

  const inputResult = inputSchema.safeParse(await request.json().catch(() => null));
  if (!inputResult.success) {
    console.warn("[bstock:execute] invalid_request", { issues: zodIssueSummary(inputResult.error) });
    return json({ error: "实盘确认请求无效，请重新获取报价。", code: "INVALID_TRADE_EXECUTION_INPUT" }, 400);
  }

  const input = inputResult.data;
  let state: AgentSessionState | undefined;
  let claimedIntentHash: string | undefined;
  let submissionOutcomeRecorded = false;

  try {
    state = connectedAgentSession(request);
    let intent: ReturnType<typeof decodeTradeIntent>;
    try {
      intent = decodeTradeIntent(input.intent);
    } catch (error) {
      console.warn("[bstock:execute] invalid_intent", {
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof z.ZodError ? { issues: zodIssueSummary(error) } : {})
      });
      return json({ error: "报价意图无效或已损坏，请重新获取报价。", code: "INVALID_TRADE_INTENT" }, 400);
    }
    if (intent.agentKey !== agentSessionKey(state)) return json({ error: "该报价不属于当前 Agent 会话。" }, 403);
    if (intent.quoteExpiresAt <= Date.now()) return json({ error: "实盘报价已过期，请重新报价。" }, 410);

    const [market, cmcResult] = await Promise.all([
      fetchOfficialBstockMarket(),
      fetchCmcLiveSnapshot().then((value) => ({ value })).catch(() => ({ value: null }))
    ]);
    const cmc = cmcResult.value;
    const asset = market.assets.find((item) => item.symbol === intent.symbol);
    if (!asset || asset.contractAddress.toLowerCase() !== (intent.side === "buy" ? intent.toToken : intent.fromToken).toLowerCase()) {
      return json({ error: "bStock 合约与 Binance 官方 type=3 注册表不一致。" }, 409);
    }
    const wallet = await fetchAgentWalletData(state);
    state = wallet.state;
    const sessionKey = agentSessionKey(state);
    const ownerKey = agentWalletOwnerKey(wallet.address);
    const multipliers = new Map(market.assets.map((item) => [item.contractAddress.toLowerCase(), item.multiplier]));
    const walletDto = walletSnapshotDto(wallet.tokens, multipliers);
    const bnb = walletDto.paymentBalances.BNB;
    if (!bnb || bnb.balance < 0.0002) return json({ error: "BNB Gas 余额不足，实盘请求已阻止。" }, 409);

    const payEntry = Object.entries(PAY_TOKEN_ADDRESSES).find(([, address]) =>
      address.toLowerCase() === (intent.side === "buy" ? intent.fromToken : intent.toToken).toLowerCase()
    );
    if (!payEntry) return json({ error: "支付币不属于活动允许的 BNB / USDT / USDC / U / USD1。" }, 409);
    const paySymbol = payEntry[0] as keyof typeof PAY_TOKEN_ADDRESSES;
    const payBalance = walletDto.paymentBalances[paySymbol];
    const bstockBalance = walletDto.bstockBalances.find((item) => item.address.toLowerCase() === asset.contractAddress.toLowerCase());

    const studioSignal = await latestAgentStudioScore(ownerKey, sessionKey, asset.ticker);
    const studioScore = studioSignal?.score ?? null;
    const liquidityScore = realLiquidityScore(market.assets.map((item) => item.quoteVolume), asset.quoteVolume);
    const portfolioScore = realPortfolioFitScore(walletDto.totalWalletValueUsd, bstockBalance?.valueUsd || 0);
    const decision = cmc ? deterministicBstockScore(cmc.score, studioScore, liquidityScore, portfolioScore) : null;
    if (intent.side === "buy" && !cmc) {
      return json({ error: "提交前 CMC 实时宏观信号不可用，订单未广播。" }, 503);
    }
    if (intent.side === "buy" && studioScore == null) {
      return json({ error: "提交前无法验证当前 Agentic Wallet 的真实 Agent Studio 研报，订单未广播。" }, 409);
    }
    if (intent.side === "buy" && !decision) {
      return json({ error: "提交前实时流动性或组合适配数据不完整，订单未广播。" }, 409);
    }
    if (intent.side === "buy" && cmc?.regime === "RISK_OFF") {
      return json({ error: `提交前 CMC 宏观风险开关已变为 RISK_OFF（${cmc.score}/100），订单未广播。` }, 409);
    }
    if (intent.side === "buy" && decision && decision.score < 70) {
      return json({ error: `提交前实时确定性评分已降至 ${decision.score.toFixed(1)}，订单未广播。` }, 409);
    }
    if (intent.side === "buy" && (!payBalance || compareDecimals(intent.amount, payBalance.balanceExact) > 0)) {
      return json({ error: `${paySymbol} 余额在报价后发生变化，当前不足以成交。` }, 409);
    }
    if (intent.side === "sell" && (!bstockBalance || compareDecimals(intent.amount, bstockBalance.balanceExact) > 0)) {
      return json({ error: `${intent.symbol} 持仓在报价后发生变化，当前不足以成交。` }, 409);
    }

    const assetPrice = asset.price ?? bstockBalance?.price ?? 0;
    const payPrice = payBalance?.price || (paySymbol === "BNB" ? 0 : 1);
    const notionalUsd = intent.side === "buy"
      ? safeNumber(intent.amount) * payPrice
      : safeNumber(intent.amount) * assetPrice;
    const positionLimitUsd = bstockPositionLimitUsd(walletDto.totalWalletValueUsd);
    const orderLimitUsd = Math.min(2_000, positionLimitUsd);
    if (notionalUsd <= 0 || notionalUsd > orderLimitUsd + 0.000001) {
      return json({ error: "余额或价格变化后，订单已超过当前实盘风险上限；请重新报价。" }, 409);
    }
    if (intent.side === "buy" && !isBstockPositionWithinLimit((bstockBalance?.valueUsd || 0) + notionalUsd, walletDto.totalWalletValueUsd)) {
      return json({ error: `余额变化后，该标的成交仓位未严格低于组合 ${BSTOCK_MAX_POSITION_PCT}% 上限；请重新报价。` }, 409);
    }

    const rawBstockToken = intent.side === "sell"
      ? wallet.tokens.find((token) => token.contractAddress.toLowerCase() === asset.contractAddress.toLowerCase())
      : undefined;
    if (intent.side === "sell" && !rawBstockToken) {
      return json({ error: `${intent.symbol} 实盘原始余额不可用，订单未广播。` }, 409);
    }
    const rawTokenDecimals = Math.max(0, Math.min(36, Number(rawBstockToken?.decimals) || 18));
    const rawAmount = intent.side === "sell"
      ? resolveBstockSellRawAmount(intent.amount, asset.multiplier, rawBstockToken!.balance, rawTokenDecimals)
      : intent.amount;
    if (intent.side === "sell") {
      console.info("[bstock:execute] sell_amount_normalized", {
        symbol: intent.symbol,
        shareDecimals: intent.amount.split(".")[1]?.length || 0,
        rawDecimals: rawAmount.split(".")[1]?.length || 0,
        cappedToWalletBalance: compareDecimals(rawAmount, rawBstockToken!.balance) === 0
      });
    }
    const orderBody: Record<string, unknown> = {
      binanceChainId: "56",
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      amount: rawAmount,
      slippage: intent.slippageRatio,
      mev: true,
      gasLevel: "HIGH",
      tokenShare: intent.side === "sell" ? intent.amount : null,
      multiplier: intent.side === "sell" ? asset.multiplier : null
    };
    const intentHash = tradeIntentAuditHash(input.intent);
    try {
      if (context.automation) {
        const [config, autoOrder, cost] = await Promise.all([
          prisma.bstockAutoConfig.findUnique({ where: { ownerKey } }),
          prisma.bstockAutoOrder.findFirst({ where: { id: context.automation.orderId, ownerKey, generation: context.automation.generation } }),
          prisma.bstockAutoPosition.aggregate({ where: { ownerKey }, _sum: { costUsd: true } })
        ]);
        if (!config || !autoOrder) throw new BstockSubmissionClaimError("自动交易授权或订单不存在，订单未广播。", "AUTOMATION_QUOTE_MISMATCH");
        const decision = autoOrder.decision && typeof autoOrder.decision === "object" && !Array.isArray(autoOrder.decision) ? autoOrder.decision : {};
        const reviewedAsset = "asset" in decision && decision.asset && typeof decision.asset === "object" && !Array.isArray(decision.asset) ? decision.asset : {};
        const stats = config.stats && typeof config.stats === "object" && !Array.isArray(config.stats) ? config.stats : {};
        validateBstockAutoExecution({
          side: intent.side, market, asset, reviewedAsset, cmc,
          reportCompletedAt: studioSignal?.completedAt,
          settings: autoSettingsSchema.parse(config.settings), notionalUsd,
          totalWalletValueUsd: walletDto.totalWalletValueUsd,
          postTradeExposureUsd: (bstockBalance?.valueUsd || 0) + notionalUsd,
          robotCostUsd: Number(cost._sum.costUsd || 0),
          botEquityUsd: "botEquityUsd" in stats && stats.botEquityUsd != null ? Number(stats.botEquityUsd) : NaN,
          gasUsd: autoOrder.gasEstimateUsd != null ? Number(autoOrder.gasEstimateUsd) : NaN
        });
      }
      const claimed = await claimBstockTradeSubmission(prisma, {
        intentHash,
        ownerKey,
        agentKey: sessionKey
      }, context);
      if (!claimed) {
        return persistAgentSession(json({
          error: "该交易意图已经提交或不再可执行，请查询订单记录，切勿重复提交。",
          code: "TRADE_INTENT_ALREADY_SUBMITTED",
          retryable: false
        }, 409), state);
      }
      claimedIntentHash = intentHash;
    } catch (error) {
      if (error instanceof BstockSubmissionClaimError) {
        throw new AgenticWalletRequestError(error.message, { status: 409, code: error.code });
      }
      console.error("[bstock:execute] trade_audit_write_failed", {
        symbol: intent.symbol,
        side: intent.side,
        error: error instanceof Error ? error.message : "Unknown error"
      });
      throw new AgenticWalletRequestError("订单审计记录不可用，已在广播前安全停止；请重新获取报价。", {
        status: 503,
        code: "TRADE_AUDIT_UNAVAILABLE"
      });
    }
    const submitted = await agentWalletRequest<unknown>(
      state,
      "/bapi/defi/v1/public/wallet-direct/web-dex/agent/place-order",
      { body: orderBody, timeoutMs: 20_000 }
    );
    state = submitted.state;
    let order: ReturnType<typeof normalizeAgenticWalletOrder>;
    try {
      order = normalizeAgenticWalletOrder(submitted.data);
    } catch (error) {
      console.error("[bstock:execute] invalid_upstream_response", {
        issues: error instanceof z.ZodError ? zodIssueSummary(error) : undefined,
        responseKeys: submitted.data && typeof submitted.data === "object" ? Object.keys(submitted.data) : []
      });
      throw new AgenticWalletRequestError(
        "Agentic Wallet 已收到提交请求，但返回格式无法识别。订单状态未知；请先查看交易历史，切勿重复提交。",
        { code: "ORDER_SUBMISSION_STATUS_UNKNOWN" }
      );
    }
    if (order.code && order.code !== "000000") {
      await prisma.bstockTradeRecord.update({
        where: { intentHash },
        data: {
          status: "REJECTED",
          ...(order.orderId ? { orderId: String(order.orderId) } : {})
        }
      }).catch(() => undefined);
      submissionOutcomeRecorded = true;
      return persistAgentSession(json({
        error: order.message || "Agentic Wallet 拒绝了实盘订单。",
        code: order.code,
        orderId: order.orderId ? String(order.orderId) : null,
        orderExpireTime: order.orderExpireTime ?? null
      }, 409), state);
    }
    if (!order.orderId) {
      console.error("[bstock:execute] missing_order_id", {
        responseKeys: submitted.data && typeof submitted.data === "object" ? Object.keys(submitted.data) : [],
        upstreamCode: order.code
      });
      throw new AgenticWalletRequestError(
        "Agentic Wallet 已收到提交请求，但未返回订单号。订单状态未知；请先查看交易历史，切勿重复提交。",
        { code: "ORDER_SUBMISSION_STATUS_UNKNOWN" }
      );
    }

    console.info("[bstock:execute] submitted", {
      orderId: order.orderId,
      symbol: intent.symbol,
      side: intent.side
    });
    await prisma.bstockTradeRecord.update({
      where: { intentHash },
      data: {
        orderId: String(order.orderId),
        status: String(order.status || "SUBMITTED").toUpperCase(),
        submittedAt: new Date()
      }
    }).catch((error) => console.error("[bstock:execute] trade_audit_submit_sync_failed", {
      orderIdSuffix: String(order.orderId).slice(-8),
      error: error instanceof Error ? error.message : "Unknown error"
    }));
    submissionOutcomeRecorded = true;

    return persistAgentSession(json({
      status: order.status || "SUBMITTED",
      orderId: String(order.orderId),
      clientOrderId: order.clientOrderId ? String(order.clientOrderId) : null,
      symbol: intent.symbol,
      side: intent.side,
      fromToken: intent.fromToken,
      toToken: intent.toToken,
      fromSymbol: intent.side === "buy" ? paySymbol : intent.symbol,
      toSymbol: intent.side === "buy" ? intent.symbol : paySymbol,
      fromAmount: rawAmount,
      toAmount: intent.quoteOutput,
      message: "订单已提交给 Agentic Wallet；只有轮询到 FINISHED 才会计入持仓或已实现 PnL。"
    }, 202), state);
  } catch (error) {
    const known = error instanceof AgenticWalletRequestError;
    const submissionUnknown = Boolean(claimedIntentHash && !submissionOutcomeRecorded);
    if (submissionUnknown) {
      // A timeout or malformed response does not prove that the wallet rejected
      // the order. Keep the intent consumed and require reconciliation.
      await prisma.bstockTradeRecord.updateMany({
        where: { intentHash: claimedIntentHash, status: "SUBMITTING" },
        data: { status: "SUBMISSION_UNKNOWN" }
      }).catch(() => undefined);
    }
    const message = error instanceof z.ZodError
      ? "实盘执行依赖的实时数据格式发生变化，订单未继续处理。"
      : error instanceof Error ? error.message : "实盘执行失败。";
    const log = known && error.status < 500 ? console.warn : console.error;
    log("[bstock:execute] failed", {
      code: known ? error.code : "TRADE_EXECUTION_FAILED",
      status: known ? error.status : 502,
      error: message,
      ...(error instanceof z.ZodError ? { issues: zodIssueSummary(error) } : {})
    });
    const response = json({
      error: submissionUnknown
        ? "订单提交结果尚未确认，请先查询订单历史，切勿重复提交。"
        : known ? error.message : message,
      code: submissionUnknown ? "ORDER_SUBMISSION_STATUS_UNKNOWN" : known ? error.code : "TRADE_EXECUTION_FAILED",
      ...(submissionUnknown ? { submissionStatus: "UNKNOWN", retryable: false } : {})
    }, known ? error.status : 502);
    if (known && error.terminal) response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    return state && !(known && error.terminal) ? persistAgentSession(response, state) : response;
  }
}
