import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AGENT_SESSION_COOKIE, clearAgentSessionCookieOptions, isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import { AgenticWalletRequestError, agentSessionKey, connectedAgentSession, persistAgentSession } from "@/lib/bstock-agentic-wallet-client";
import { decodeResearchIntent } from "@/lib/bstock-alpha-live";
import { previewExternalResearch } from "@/lib/bstock-agent-x402-external";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const inputSchema = z.object({ intent: z.string().min(20).max(40_000), selectedIndex: z.number().int().positive() });
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: noStoreHeaders() });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "外部签名预览仅允许从本站请求。" }, 403);
  try {
    const input = inputSchema.parse(await request.json());
    const state = connectedAgentSession(request);
    const intent = decodeResearchIntent(input.intent);
    if (intent.agentKey !== agentSessionKey(state)) return json({ error: "该付款预览不属于当前钱包。" }, 403);
    if (Date.now() - intent.createdAt > 2 * 60_000) return json({ error: "付款预览已过期，请重新获取。" }, 410);
    const result = await previewExternalResearch(state, input.intent, intent, input.selectedIndex);
    return persistAgentSession(json(result.body), result.state);
  } catch (error) {
    const known = error instanceof AgenticWalletRequestError;
    const response = json({ error: error instanceof z.ZodError ? "外部预览数据无效，未授权、未签名、未付款。" : error instanceof Error ? error.message : "外部签名预览失败，未付款。",
      code: known ? error.code : "EXTERNAL_RESEARCH_PREVIEW_FAILED" }, known ? error.status : 409);
    if (known && error.terminal) response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
    return response;
  }
}
