import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AGENT_SESSION_COOKIE,
  BINANCE_AGENT_BASE,
  BINANCE_CONFIRM_ENDPOINT,
  BINANCE_QUERY_ENDPOINT,
  BINANCE_SUCCESS_CODE,
  type AgentSessionState,
  agentHeaders,
  agentSessionCookieOptions,
  clearAgentSessionCookieOptions,
  decodeAgentSession,
  encodeAgentSession,
  extractAgentSessionId,
  isSameOrigin,
  noStoreHeaders
} from "@/lib/bstock-agentic-wallet-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const envelopeSchema = z.object({
  code: z.coerce.string(),
  message: z.string().nullable().optional(),
  data: z.unknown().optional()
});

const confirmDataSchema = z.object({
  connectionStatus: z.enum(["UNCONNECTED", "CONNECTING", "CONNECTED"])
});

const queryDataSchema = z.object({
  connectionStatus: z.enum(["UNCONNECTED", "CONNECTING", "CONNECTED"]),
  walletCreateStatus: z.enum(["CREATING", "CREATED"]).optional()
});

const terminalBinanceCodes = new Set(["351701", "100001005"]);

function json(payload: Record<string, unknown>, init: { status?: number } = {}) {
  return NextResponse.json(payload, {
    status: init.status,
    headers: noStoreHeaders()
  });
}

function clearSession(payload: Record<string, unknown>, status: number) {
  const response = json(payload, { status });
  response.cookies.set(AGENT_SESSION_COOKIE, "", clearAgentSessionCookieOptions());
  return response;
}

function persistSession(response: NextResponse, state: AgentSessionState) {
  response.cookies.set(AGENT_SESSION_COOKIE, encodeAgentSession(state), agentSessionCookieOptions(state));
  return response;
}

async function callBinance(
  endpoint: string,
  method: "GET" | "POST",
  state: AgentSessionState,
  body?: Record<string, string>
) {
  const response = await fetch(`${BINANCE_AGENT_BASE}${endpoint}`, {
    method,
    headers: agentHeaders(state, state.agentSessionId),
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error(`Binance Agentic Wallet returned HTTP ${response.status}.`);
  const parsed = envelopeSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Binance Agentic Wallet returned an invalid response.");
  const rotatedSessionId = extractAgentSessionId(response.headers);
  return {
    payload: parsed.data,
    state: rotatedSessionId ? { ...state, agentSessionId: rotatedSessionId } : state
  };
}

function apiFailure(code: string, message?: string | null) {
  if (terminalBinanceCodes.has(code)) {
    return clearSession(
      { status: "EXPIRED", error: "登录授权已过期或被拒绝，请生成新的登录链接。" },
      410
    );
  }
  return json(
    { status: "RETRYING", error: message || "Binance Agentic Wallet 暂时无法完成验证。" },
    { status: 502 }
  );
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return json({ status: "FORBIDDEN", error: "Agent verification is only available from this site." }, { status: 403 });
  }

  const cookie = request.cookies.get(AGENT_SESSION_COOKIE)?.value;
  if (!cookie) {
    return json({ status: "NO_SESSION", error: "没有可验证的 Agent 登录会话。" }, { status: 401 });
  }

  let state: AgentSessionState;
  try {
    state = decodeAgentSession(cookie);
  } catch {
    return clearSession({ status: "NO_SESSION", error: "Agent 登录会话无效，请重新生成。" }, 401);
  }

  const now = Date.now();
  if (state.sessionExpireAt <= now || (state.stage === "pending" && state.qrExpireAt <= now)) {
    return clearSession({ status: "EXPIRED", error: "一次性登录链接已过期，请重新生成。" }, 410);
  }

  try {
    if (state.stage === "pending") {
      const confirmation = await callBinance(
        BINANCE_CONFIRM_ENDPOINT,
        "POST",
        state,
        { qrCodeId: state.qrCodeId }
      );
      state = confirmation.state;
      if (confirmation.payload.code !== BINANCE_SUCCESS_CODE) {
        return apiFailure(confirmation.payload.code, confirmation.payload.message);
      }

      const data = confirmDataSchema.safeParse(confirmation.payload.data);
      if (!data.success) throw new Error("Binance confirmation response is invalid.");
      if (data.data.connectionStatus === "UNCONNECTED") {
        return persistSession(json({ status: "WAITING_SCAN", expireAt: state.qrExpireAt }), state);
      }
      if (data.data.connectionStatus === "CONNECTING") {
        return persistSession(json({ status: "WAITING_CONFIRMATION", expireAt: state.qrExpireAt }), state);
      }
      state = {
        ...state,
        stage: "authorizing",
        sessionExpireAt: Math.max(state.sessionExpireAt, now + 10 * 60_000)
      };
    }

    const query = await callBinance(BINANCE_QUERY_ENDPOINT, "GET", state);
    state = query.state;
    if (query.payload.code !== BINANCE_SUCCESS_CODE) {
      return apiFailure(query.payload.code, query.payload.message);
    }

    const data = queryDataSchema.safeParse(query.payload.data);
    if (!data.success) throw new Error("Binance wallet status response is invalid.");
    if (data.data.connectionStatus === "UNCONNECTED") {
      return clearSession({ status: "EXPIRED", error: "Agent 会话已失效，请重新登录。" }, 410);
    }
    if (data.data.connectionStatus === "CONNECTED" && data.data.walletCreateStatus === "CREATED") {
      state = {
        ...state,
        stage: "connected",
        sessionExpireAt: now + 7 * 24 * 60 * 60_000
      };
      return persistSession(json({ status: "CONNECTED" }), state);
    }

    return persistSession(
      json({ status: "CREATING_WALLET", expireAt: state.sessionExpireAt }),
      { ...state, stage: "authorizing" }
    );
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return json(
      {
        status: "RETRYING",
        error: timeout ? "Binance Agentic Wallet 响应超时，正在自动重试。" : "Agent 验证暂时失败，正在自动重试。"
      },
      { status: 502 }
    );
  }
}
