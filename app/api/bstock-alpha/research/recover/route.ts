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
  connectedAgentSession,
  persistAgentSession
} from "@/lib/bstock-agentic-wallet-client";
import {
  STUDIO_RECOVERY_LOOKBACK_MS,
  findRecentOwnedStudioJob,
  isStudioJobTerminalFailure,
  isStudioReportComplete,
  reclaimLegacyStudioJob,
  resolveResearchOwner
} from "@/lib/bstock-agent-studio";
import {
  BSTOCK_SYMBOL_PATTERN,
  buildAgentStudioReadableReport,
  extractAgentStudioReportSummary,
  fetchOfficialBstockMarket
} from "@/lib/bstock-alpha-live";
import {
  agentStudioErrorMessage,
  resolveAgentStudioTerminalErrorCode
} from "@/lib/bstock-agent-studio-status";
import { browserWalletAddressSchema, requireBoundEvmBrowserWallet } from "@/lib/bstock-browser-wallet";

export const dynamic = "force-dynamic";
export const maxDuration = 25;

const inputSchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(BSTOCK_SYMBOL_PATTERN),
  walletMode: z.enum(["agent", "browser"]).default("agent"),
  address: browserWalletAddressSchema.optional()
}).superRefine((value, context) => {
  if (value.walletMode === "browser" && !value.address) context.addIssue({ code: "custom", path: ["address"], message: "浏览器钱包地址缺失。" });
});

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

function persistAgentSessionOrBrowser(response: NextResponse, state?: AgentSessionState) {
  return state ? persistAgentSession(response, state) : response;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "研报回捞仅允许从本站请求。" }, 403);
  let state: AgentSessionState | undefined;

  try {
    const input = inputSchema.parse(await request.json());
    const [market, owner] = await Promise.all([
      fetchOfficialBstockMarket(),
      input.walletMode === "browser"
        ? requireBoundEvmBrowserWallet(input.address!).then((identity) => ({ state: undefined as never, ...identity, walletAddress: identity.address }))
        : resolveResearchOwner(connectedAgentSession(request))
    ]);
    state = input.walletMode === "agent" ? owner.state : undefined;
    const asset = market.assets.find((entry) => entry.symbol === input.symbol);
    if (!asset) return persistAgentSessionOrBrowser(json({ error: "当前官方 bStock 清单中未找到该标的。" }, 404), state);

    const record = await findRecentOwnedStudioJob(owner, asset.ticker, STUDIO_RECOVERY_LOOKBACK_MS)
      || await reclaimLegacyStudioJob(owner, { ticker: asset.ticker });
    if (!record) {
      return persistAgentSessionOrBrowser(json({
        error: `${asset.ticker} 最近 24 小时没有可由当前 Agentic Wallet 验证的研报任务。`,
        code: "STUDIO_RECOVERY_NOT_FOUND"
      }, 404), state);
    }

    if (isStudioReportComplete(record) && record.reportMarkdown) {
      return persistAgentSessionOrBrowser(json({
        status: "REUSED",
        provider: "studio",
        jobId: record.jobId,
        symbol: record.symbol,
        bstockSymbol: asset.symbol,
        summary: extractAgentStudioReportSummary(record.reportMarkdown),
        reportReading: buildAgentStudioReadableReport(record.reportMarkdown),
        reportMarkdown: record.reportMarkdown,
        paymentTxHash: record.paymentTxHash,
        completedAt: record.completedAt?.toISOString() ?? null,
        message: "已从服务器回捞最近完成的研报，本次未创建付款请求。"
      }), state);
    }

    if (isStudioJobTerminalFailure(record)) {
      const errorCode = resolveAgentStudioTerminalErrorCode(record.upstreamErrorCode, record.resumeCount);
      const error = agentStudioErrorMessage(errorCode, false);
      return persistAgentSessionOrBrowser(json({
        status: "FAILED",
        provider: "studio",
        jobId: record.jobId,
        symbol: record.symbol,
        bstockSymbol: asset.symbol,
        error,
        errorCode,
        retryable: false,
        recoverable: false,
        terminal: true,
        canCreateNew: true,
        paymentTxHash: record.paymentTxHash,
        message: "原付款任务已被 Agent Studio 官方终止。回捞不会再次扣费，但也不能重启永久失败的任务；可返回后重新预览并明确确认新的付费请求。"
      }, 409), state);
    }

    return persistAgentSessionOrBrowser(json({
      status: "RECOVERING",
      provider: "studio",
      jobId: record.jobId,
      symbol: record.symbol,
      bstockSymbol: asset.symbol,
      jobStatus: record.status,
      retryable: record.retryable,
      resumeCount: record.resumeCount,
      paymentTxHash: record.paymentTxHash,
      message: record.retryable
        ? "已找到可恢复任务，将调用 Agent Studio 官方恢复接口；沿用原付款。"
        : "已找到原付费任务，将继续查询同一 jobId；不会再次付款。"
    }, 202), state);
  } catch (error) {
    const known = error instanceof AgenticWalletRequestError;
    const message = error instanceof z.ZodError
      ? "研报回捞参数无效。"
      : error instanceof Error ? error.message : "研报回捞失败。";
    const response = json({ error: known ? error.message : message, code: known ? error.code : "STUDIO_RECOVERY_FAILED" }, known ? error.status : 502);
    if (known && error.terminal) response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    return state && !(known && error.terminal) ? persistAgentSession(response, state) : response;
  }
}
