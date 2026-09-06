import { NextRequest, NextResponse } from "next/server";
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
import { normalizeAgenticWalletMarketOrders } from "@/lib/bstock-agentic-wallet-order-status";
import {
  agentStudioRatingScore,
  extractAgentStudioReportSummary,
  fetchCmcLiveSnapshot,
  fetchOfficialBstockMarket
} from "@/lib/bstock-alpha-live";
import { buildBstockTradingLedger } from "@/lib/bstock-trade-ledger";
import { mergeBstockOrderRecords } from "@/lib/bstock-trade-records";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "实时数据仅允许从本站请求。" }, 403);

  const startedAt = Date.now();
  try {
    const state = connectedAgentSession(request);
    const [cmcResult, marketResult, walletResult] = await Promise.allSettled([
      fetchCmcLiveSnapshot(),
      fetchOfficialBstockMarket(),
      fetchAgentWalletData(state)
    ]);
    if (walletResult.status === "rejected" && walletResult.reason instanceof AgenticWalletRequestError && walletResult.reason.terminal) {
      throw walletResult.reason;
    }
    if (cmcResult.status === "rejected") {
      console.warn("[bstock:live-snapshot] cmc_unavailable", { error: cmcResult.reason instanceof Error ? cmcResult.reason.message : String(cmcResult.reason) });
    }
    if (marketResult.status === "rejected") {
      console.warn("[bstock:live-snapshot] market_unavailable", { error: marketResult.reason instanceof Error ? marketResult.reason.message : String(marketResult.reason) });
    }
    if (walletResult.status === "rejected") {
      console.warn("[bstock:live-snapshot] wallet_unavailable", {
        code: walletResult.reason instanceof AgenticWalletRequestError ? walletResult.reason.code : "WALLET_LOOKUP_FAILED",
        error: walletResult.reason instanceof Error ? walletResult.reason.message : String(walletResult.reason)
      });
    }
    let studioReports: Array<Record<string, unknown>> = [];
    let studioReportHistory: Array<Record<string, unknown>> = [];
    let pendingStudioJobs: Array<Record<string, unknown>> = [];
    try {
      const sessionKey = agentSessionKey(state);
      const ownerKey = walletResult.status === "fulfilled" && walletResult.value.address
        ? agentWalletOwnerKey(walletResult.value.address)
        : "";
      if (ownerKey) {
        await prisma.bstockResearchJob.updateMany({
          where: { ownerKey: null, agentKey: sessionKey },
          data: { ownerKey }
        });
      }
      const ownership = ownerKey
        ? { OR: [{ ownerKey }, { ownerKey: null, agentKey: sessionKey }] }
        : { agentKey: sessionKey };
      const completedWhere = { ...ownership, status: "succeeded", reportMarkdown: { not: null } };
      const completedOrder = [{ completedAt: { sort: "desc" as const, nulls: "last" as const } }, { createdAt: "desc" as const }];
      const [reports, historyRecords, pending] = await Promise.all([
        prisma.bstockResearchJob.findMany({
          where: completedWhere,
          orderBy: completedOrder,
          take: 20,
          select: { id: true, provider: true, symbol: true, reportMarkdown: true, completedAt: true, createdAt: true, paymentTxHash: true }
        }),
        prisma.bstockResearchJob.findMany({
          where: completedWhere,
          orderBy: completedOrder,
          take: 100,
          select: { id: true, provider: true, symbol: true, completedAt: true, createdAt: true, paymentTxHash: true }
        }),
        prisma.bstockResearchJob.findMany({
          where: { ...ownership, reportMarkdown: null, status: { in: ["settling", "queued", "running", "finalizing", "succeeded", "failed"] } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { jobId: true, symbol: true, status: true, retryable: true, createdAt: true, paymentTxHash: true }
        })
      ]);
      const recentSummaries = reports.flatMap((report) => {
        if (!report.reportMarkdown) return [];
        const summary = extractAgentStudioReportSummary(report.reportMarkdown);
        return [{
          reportId: report.id,
          provider: report.provider,
          symbol: report.symbol,
          score: agentStudioRatingScore(summary.rating),
          ...summary,
          paymentTxHash: report.paymentTxHash,
          completedAt: (report.completedAt || report.createdAt).toISOString()
        }];
      });
      const summaryById = new Map(recentSummaries.map((report) => [String(report.reportId), report]));
      studioReportHistory = historyRecords.map((report) => ({
        reportId: report.id,
        provider: report.provider,
        symbol: report.symbol,
        paymentTxHash: report.paymentTxHash,
        completedAt: (report.completedAt || report.createdAt).toISOString(),
        ...(summaryById.get(report.id) || {})
      }));
      const seen = new Set<string>();
      studioReports = recentSummaries.filter((report) => {
        const symbol = String(report.symbol || "");
        if (!symbol || seen.has(symbol)) return false;
        seen.add(symbol);
        return true;
      });
      pendingStudioJobs = pending.map((job) => ({
        jobId: job.jobId,
        symbol: job.symbol,
        status: job.status,
        retryable: job.retryable,
        createdAt: job.createdAt.toISOString(),
        paymentTxHash: job.paymentTxHash
      }));
    } catch (error) {
      // Live balances and CMC data remain available if optional research persistence is offline.
      console.warn("[bstock:live-snapshot] research_persistence_unavailable", { error: error instanceof Error ? error.message : String(error) });
    }
    const market = marketResult.status === "fulfilled" ? marketResult.value : null;
    const cmc = cmcResult.status === "fulfilled" ? cmcResult.value : null;
    const multipliers = new Map((market?.assets ?? []).map((asset) => [asset.contractAddress.toLowerCase(), asset.multiplier]));
    const walletDto = walletResult.status === "fulfilled"
      ? walletSnapshotDto(walletResult.value.tokens, multipliers)
      : null;
    let responseState = walletResult.status === "fulfilled" ? walletResult.value.state : state;
    let tradingLedger: ReturnType<typeof buildBstockTradingLedger> | null = null;
    let orderSource: Record<string, unknown> = { status: "UNAVAILABLE", code: "ORDER_HISTORY_UNAVAILABLE" };
    if (market && walletDto && walletResult.status === "fulfilled" && walletResult.value.address) {
      const ownerKey = agentWalletOwnerKey(walletResult.value.address);
      const databaseRecords = await prisma.bstockTradeRecord.findMany({
        where: { ownerKey },
        orderBy: { createdAt: "desc" },
        take: 100
      }).catch(() => []);
      try {
        const historyResult = await agentWalletRequest<unknown>(
          responseState,
          "/bapi/defi/v1/public/wallet-direct/web-dex/agent/batch-query-market-orders",
          { body: { binanceChainId: "56", page: 1, pageSize: 100, sort: "DESC" }, timeoutMs: 15_000 }
        );
        responseState = historyResult.state;
        const history = normalizeAgenticWalletMarketOrders(historyResult.data);
        const totalOrders = history.total ?? (history.rows.length < 100 ? history.rows.length : 101);
        tradingLedger = buildBstockTradingLedger({
          orders: history.rows,
          totalOrders,
          assets: market.assets,
          walletPositions: walletDto.bstockBalances,
          historyAvailable: true
        });
        tradingLedger.orders = mergeBstockOrderRecords(tradingLedger.orders, databaseRecords);
        orderSource = {
          status: tradingLedger.historyComplete ? "LIVE" : "PARTIAL",
          source: tradingLedger.source,
          fetchedOrders: history.rows.length,
          totalOrders
        };
      } catch (error) {
        if (error instanceof AgenticWalletRequestError && error.terminal) throw error;
        tradingLedger = buildBstockTradingLedger({
          orders: [],
          totalOrders: null,
          assets: market.assets,
          walletPositions: walletDto.bstockBalances,
          historyAvailable: false
        });
        tradingLedger.orders = mergeBstockOrderRecords([], databaseRecords);
        orderSource = {
          status: "UNAVAILABLE",
          code: error instanceof AgenticWalletRequestError ? error.code : "ORDER_HISTORY_LOOKUP_FAILED"
        };
      }
    }
    console.info("[bstock:live-snapshot] completed", {
      durationMs: Date.now() - startedAt,
      cmcMode: cmc?.deliveryMode ?? "UNAVAILABLE",
      marketMode: market?.deliveryMode ?? "UNAVAILABLE",
      marketAssets: market?.assets.length ?? 0,
      walletAvailable: Boolean(walletDto),
      bstockPositions: walletDto?.bstockBalances.length ?? 0,
      orderSource: orderSource.status
    });
    const response = json({
      live: Boolean(walletDto || cmc || market),
      ...(cmc ? { cmc } : {}),
      ...(market ? { market } : {}),
      studioReports,
      studioReportHistory,
      pendingStudioJobs,
      ...(tradingLedger ? { tradingLedger } : {}),
      ...(walletDto && walletResult.status === "fulfilled" ? { wallet: {
        address: walletResult.value.address,
        paymentBalances: Object.values(walletDto.paymentBalances),
        bstockBalances: walletDto.bstockBalances,
        totalWalletValueUsd: walletDto.totalWalletValueUsd,
        source: "Binance Agentic Wallet"
      } } : {}),
      sources: {
        cmc: cmc ? { status: cmc.deliveryMode, source: cmc.source, fetchedAt: cmc.fetchedAt, persistedAt: cmc.persistedAt } : { status: "UNAVAILABLE" },
        market: market ? { status: market.deliveryMode, source: "Binance bStock registry + Binance Spot", fetchedAt: market.fetchedAt, persistedAt: market.persistedAt } : { status: "UNAVAILABLE" },
        wallet: walletDto ? { status: "LIVE", source: "Binance Agentic Wallet" } : {
          status: "UNAVAILABLE",
          code: walletResult.status === "rejected" && walletResult.reason instanceof AgenticWalletRequestError
            ? walletResult.reason.code
            : "WALLET_DATA_INVALID"
        },
        orders: orderSource
      }
    });
    return persistAgentSession(response, responseState);
  } catch (error) {
    const known = error instanceof AgenticWalletRequestError;
    const response = json({
      error: known ? error.message : "实时数据暂时不可用，请稍后重试。",
      code: known ? error.code : "LIVE_SNAPSHOT_FAILED"
    }, known ? error.status : 502);
    if (known && error.terminal) {
      response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    }
    return response;
  }
}
