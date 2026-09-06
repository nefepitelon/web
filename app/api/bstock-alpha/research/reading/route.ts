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
  findLatestOwnedCompletedStudioJob,
  findOwnedCompletedStudioJobByRecordId,
  resolveResearchOwner
} from "@/lib/bstock-agent-studio";
import {
  ReportLocalizationError,
  localizedAgentStudioReport
} from "@/lib/bstock-agent-studio-localization";
import { BSTOCK_SYMBOL_PATTERN, fetchOfficialBstockMarket } from "@/lib/bstock-alpha-live";
import { browserWalletAddressSchema, requireBoundEvmBrowserWallet } from "@/lib/bstock-browser-wallet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const inputSchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(BSTOCK_SYMBOL_PATTERN),
  language: z.enum(["zh", "en"]),
  reportId: z.string().trim().min(10).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
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
  if (!isSameOrigin(request)) return json({ error: "研报阅读版仅允许从本站请求。" }, 403);
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
    if (!asset) return persistAgentSessionOrBrowser(json({ error: "bStock 注册表中未找到该标的。" }, 404), state);
    const job = input.reportId
      ? await findOwnedCompletedStudioJobByRecordId(owner, input.reportId, asset.ticker)
      : await findLatestOwnedCompletedStudioJob(owner, asset.ticker);
    if (!job?.reportMarkdown) {
      return persistAgentSessionOrBrowser(json({ error: `${asset.ticker} 暂无可切换语言的已完成研报。` }, 404), state);
    }
    const localized = await localizedAgentStudioReport({
      researchJobId: job.id,
      reportMarkdown: job.reportMarkdown,
      language: input.language
    });
    return persistAgentSessionOrBrowser(json({
      symbol: asset.symbol,
      ticker: asset.ticker,
      reportId: job.id,
      language: input.language,
      reportReading: localized.report,
      cached: localized.cached,
      completedAt: job.completedAt?.toISOString() ?? null
    }), state);
  } catch (error) {
    const walletError = error instanceof AgenticWalletRequestError;
    const localizationError = error instanceof ReportLocalizationError;
    const message = error instanceof z.ZodError
      ? "研报语言参数无效。"
      : error instanceof Error ? error.message : "研报语言切换失败。";
    const status = walletError ? error.status : localizationError ? error.status : 502;
    const code = walletError ? error.code : localizationError ? error.code : "REPORT_READING_FAILED";
    const response = json({ error: message, code }, status);
    if (walletError && error.terminal) response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    return state && !(walletError && error.terminal) ? persistAgentSession(response, state) : response;
  }
}
