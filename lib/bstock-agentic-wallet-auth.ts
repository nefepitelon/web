import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { platform, release, type } from "node:os";
import { z } from "zod";
import { decryptTradingSecret, encryptTradingSecret } from "@/lib/alpha-execution/credentials";

export const AGENT_SESSION_COOKIE = "bstock_agentic_wallet_session";
export const AGENTIC_WALLET_VERSION = "1.8.0";
export const BINANCE_AGENT_BASE = "https://www.binance.com";
export const BINANCE_LOGIN_ENDPOINT = "/bapi/defi/v1/public/wallet-direct/agent-wallet/login";
export const BINANCE_CONFIRM_ENDPOINT = `${BINANCE_LOGIN_ENDPOINT}/confirm`;
export const BINANCE_QUERY_ENDPOINT = `${BINANCE_LOGIN_ENDPOINT}/query`;
export const BINANCE_SUCCESS_CODE = "000000";

const agentSessionStateSchema = z.object({
  version: z.literal(1),
  stage: z.enum(["pending", "authorizing", "connected"]),
  agentSessionId: z.string().max(4096),
  clientId: z.string().uuid(),
  clientMac: z.string().regex(/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i),
  clientSystem: z.string().min(1).max(128),
  deviceName: z.string().min(1).max(128),
  qrCodeId: z.string().min(1).max(512),
  qrExpireAt: z.number().int().positive(),
  sessionExpireAt: z.number().int().positive(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional()
});

export type AgentSessionState = z.infer<typeof agentSessionStateSchema>;

export function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache"
  };
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function operatingSystemName() {
  if (platform() === "darwin") return "macOS";
  if (platform() === "win32") return "Windows";
  return "Linux";
}

function randomMacAddress() {
  const bytes = randomBytes(6);
  bytes[0] = (bytes[0] | 0x02) & 0xfe;
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join(":");
}

export function createAgentIdentity() {
  const clientId = randomUUID();
  return {
    clientId,
    clientMac: randomMacAddress(),
    clientSystem: `${operatingSystemName()} ${release()}`,
    deviceName: `bstock-alpha-${clientId.slice(0, 8)}`
  };
}

type AgentIdentity = Pick<AgentSessionState, "clientId" | "clientMac" | "clientSystem" | "deviceName">;

export function agentHeaders(identity: AgentIdentity, agentSessionId?: string) {
  return {
    "Content-Type": "application/json",
    "agentClientId": identity.clientId,
    "agentClientSystem": identity.clientSystem,
    "agentClientMac": identity.clientMac,
    "bnc-uuid": identity.clientId,
    "x-trace-id": randomBytes(16).toString("hex"),
    "device_name": identity.deviceName,
    "system_lang": "zh-CN",
    "timezone": "Asia/Shanghai",
    "system_version": `${type()} ${platform()} ${release()}`,
    "version_code": AGENTIC_WALLET_VERSION,
    "clientVersion": AGENTIC_WALLET_VERSION,
    "agentClientType": "AGENT_CLI",
    "agentClientVersion": AGENTIC_WALLET_VERSION,
    ...(agentSessionId ? { "Cookie": `agentSessionId=${agentSessionId}` } : {})
  };
}

export function extractAgentSessionId(headers: Headers) {
  const cookie = headers.get("set-cookie");
  const value = cookie?.match(/(?:^|[,;]\s*)agentSessionId=([^;,]+)/i)?.[1];
  return value ? decodeURIComponent(value) : "";
}

export function encodeAgentSession(state: AgentSessionState) {
  return encryptTradingSecret(JSON.stringify(agentSessionStateSchema.parse(state)));
}

export function decodeAgentSession(value: string) {
  return agentSessionStateSchema.parse(JSON.parse(decryptTradingSecret(value)));
}

export function agentSessionCookieOptions(state: AgentSessionState) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    priority: "high" as const,
    maxAge: Math.max(1, Math.ceil((state.sessionExpireAt - Date.now()) / 1000))
  };
}

export function clearAgentSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    priority: "high" as const,
    maxAge: 0
  };
}
