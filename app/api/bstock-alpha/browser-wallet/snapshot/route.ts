import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import {
  browserWalletAddressSchema,
  fetchBrowserWalletSnapshot,
  requireBoundEvmBrowserWallet
} from "@/lib/bstock-browser-wallet";
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

const inputSchema = z.object({ address: browserWalletAddressSchema });

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "浏览器钱包数据仅允许从本站请求。" }, 403);
  try {
    const input = inputSchema.parse(await request.json());
    const identity = await requireBoundEvmBrowserWallet(input.address);
    const [market, cmcResult] = await Promise.all([
      fetchOfficialBstockMarket(),
      fetchCmcLiveSnapshot().then((value) => ({ value })).catch(() => ({ value: null }))
    ]);
    const wallet = await fetchBrowserWalletSnapshot(identity.address, market.assets);
    const [reports, pending, databaseRecords] = await Promise.all([
      prisma.bstockResearchJob.findMany({
        where: { ownerKey: identity.ownerKey, status: "succeeded", reportMarkdown: { not: null } },
        orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: { id: true, provider: true, symbol: true, reportMarkdown: true, completedAt: true, createdAt: true, paymentTxHash: true }
      }).catch(() => []),
      prisma.bstockResearchJob.findMany({
        where: { ownerKey: identity.ownerKey, reportMarkdown: null, status: { in: ["settling", "queued", "running", "finalizing", "succeeded", "failed"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { jobId: true, symbol: true, status: true, retryable: true, createdAt: true, paymentTxHash: true }
      }).catch(() => []),
      prisma.bstockTradeRecord.findMany({
        where: { ownerKey: identity.ownerKey },
        orderBy: { createdAt: "desc" },
        take: 100
      }).catch(() => [])
    ]);
    const studioReportHistory = reports.flatMap((report) => {
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
    const seen = new Set<string>();
    const studioReports = studioReportHistory.filter((report) => {
      if (!report.symbol || seen.has(report.symbol)) return false;
      seen.add(report.symbol);
      return true;
    });
    const tradingLedger = buildBstockTradingLedger({
      orders: [],
      totalOrders: null,
      assets: market.assets,
      walletPositions: wallet.bstockBalances,
      historyAvailable: false
    });
    tradingLedger.orders = mergeBstockOrderRecords([], databaseRecords);

    return json({
      live: true,
      ...(cmcResult.value ? { cmc: cmcResult.value } : {}),
      market,
      studioReports,
      studioReportHistory,
      pendingStudioJobs: pending.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString()
      })),
      tradingLedger,
      wallet: {
        address: wallet.address,
        paymentBalances: Object.values(wallet.paymentBalances),
        bstockBalances: wallet.bstockBalances,
        totalWalletValueUsd: wallet.totalWalletValueUsd,
        source: wallet.source
      },
      sources: {
        cmc: cmcResult.value ? { status: cmcResult.value.deliveryMode, source: cmcResult.value.source } : { status: "UNAVAILABLE" },
        market: { status: market.deliveryMode, source: "Binance bStock registry + Binance Spot" },
        wallet: { status: "LIVE", source: wallet.source, chainId: 56 },
        orders: { status: "LOCAL_LEDGER", source: "BNB Chain receipts + bStockAlpha audit ledger" }
      }
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "浏览器钱包快照参数无效。"
      : error instanceof Error ? error.message : "浏览器钱包快照失败。";
    return json({ error: message, code: "BROWSER_WALLET_SNAPSHOT_FAILED" }, 400);
  }
}
