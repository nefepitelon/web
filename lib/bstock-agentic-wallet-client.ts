import "server-only";

import { createHash } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AGENT_SESSION_COOKIE,
  BINANCE_AGENT_BASE,
  BINANCE_SUCCESS_CODE,
  type AgentSessionState,
  agentHeaders,
  agentSessionCookieOptions,
  decodeAgentSession,
  encodeAgentSession,
  extractAgentSessionId
} from "@/lib/bstock-agentic-wallet-auth";

const binanceEnvelopeSchema = z.object({
  code: z.coerce.string(),
  message: z.string().nullable().optional(),
  data: z.unknown().optional()
});

const terminalCodes = new Set(["351701", "100001005"]);

export class AgenticWalletRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly terminal: boolean;

  constructor(message: string, options: { status?: number; code?: string; terminal?: boolean } = {}) {
    super(message);
    this.name = "AgenticWalletRequestError";
    this.status = options.status ?? 502;
    this.code = options.code ?? "UPSTREAM_ERROR";
    this.terminal = options.terminal ?? false;
  }
}

export function connectedAgentSession(request: NextRequest) {
  const cookie = request.cookies.get(AGENT_SESSION_COOKIE)?.value;
  if (!cookie) {
    throw new AgenticWalletRequestError("请先扫码登录 Agentic Wallet。", {
      status: 401,
      code: "NO_AGENT_SESSION"
    });
  }

  let state: AgentSessionState;
  try {
    state = decodeAgentSession(cookie);
  } catch {
    throw new AgenticWalletRequestError("Agent 登录会话无效，请重新扫码。", {
      status: 401,
      code: "INVALID_AGENT_SESSION",
      terminal: true
    });
  }

  if (state.stage !== "connected" || !state.agentSessionId || state.sessionExpireAt <= Date.now()) {
    throw new AgenticWalletRequestError("Agentic Wallet 会话尚未就绪或已经过期。", {
      status: 401,
      code: "AGENT_SESSION_NOT_READY",
      terminal: state.sessionExpireAt <= Date.now()
    });
  }
  return state;
}

export function agentSessionKey(state: AgentSessionState) {
  return createHash("sha256").update(`bstock-alpha:${state.clientId}`).digest("hex");
}

export function normalizeBscWalletAddress(value: string | null | undefined) {
  const address = String(value || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address.toLowerCase() : "";
}

export function agentWalletOwnerKey(address: string) {
  const normalized = normalizeBscWalletAddress(address);
  if (!normalized) throw new AgenticWalletRequestError("Agentic Wallet 未返回有效的 BSC 钱包地址。", {
    status: 409,
    code: "BSC_WALLET_ADDRESS_UNAVAILABLE"
  });
  return createHash("sha256").update(`bstock-alpha-wallet:${normalized}`).digest("hex");
}

export function persistAgentSession(response: NextResponse, state: AgentSessionState) {
  response.cookies.set(AGENT_SESSION_COOKIE, encodeAgentSession(state), agentSessionCookieOptions(state));
  return response;
}

export async function agentWalletRequest<T = unknown>(
  state: AgentSessionState,
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
    timeoutMs?: number;
  } = {}
) {
  const response = await fetch(`${BINANCE_AGENT_BASE}${endpoint}`, {
    method: options.method ?? "POST",
    headers: agentHeaders(state, state.agentSessionId),
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000)
  });

  if (!response.ok) {
    throw new AgenticWalletRequestError(`Binance Agentic Wallet 返回 HTTP ${response.status}。`, {
      status: response.status === 401 || response.status === 403 ? 401 : 502,
      code: `HTTP_${response.status}`,
      terminal: response.status === 401 || response.status === 403
    });
  }

  const envelope = binanceEnvelopeSchema.safeParse(await response.json());
  if (!envelope.success) {
    throw new AgenticWalletRequestError("Binance Agentic Wallet 返回了无法识别的数据。", {
      code: "INVALID_BINANCE_RESPONSE"
    });
  }
  if (envelope.data.code !== BINANCE_SUCCESS_CODE) {
    throw new AgenticWalletRequestError(envelope.data.message || "Binance Agentic Wallet 拒绝了请求。", {
      status: terminalCodes.has(envelope.data.code) ? 401 : 502,
      code: envelope.data.code,
      terminal: terminalCodes.has(envelope.data.code)
    });
  }

  const rotatedSessionId = extractAgentSessionId(response.headers);
  return {
    data: envelope.data.data as T,
    state: rotatedSessionId ? { ...state, agentSessionId: rotatedSessionId } : state
  };
}
