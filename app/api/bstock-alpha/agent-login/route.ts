import { createECDH } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AGENT_SESSION_COOKIE,
  BINANCE_AGENT_BASE,
  BINANCE_LOGIN_ENDPOINT,
  BINANCE_SUCCESS_CODE,
  agentHeaders,
  agentSessionCookieOptions,
  createAgentIdentity,
  encodeAgentSession,
  extractAgentSessionId,
  isSameOrigin,
  noStoreHeaders,
  operatingSystemName
} from "@/lib/bstock-agentic-wallet-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

const allowedLoginHosts = new Set(["app.binance.com", "web3.binance.com"]);

const loginResponseSchema = z.object({
  code: z.string(),
  message: z.string().nullable().optional(),
  data: z.object({
    connectionStatus: z.string(),
    qrInfo: z.object({
      qrCodeUrl: z.string().url(),
      qrCodeId: z.string().min(1),
      expireAt: z.union([z.string(), z.number()])
    }).optional()
  })
});

function approvedLoginUrl(value: string) {
  const url = new URL(value);
  return url.protocol === "https:"
    && allowedLoginHosts.has(url.hostname)
    && !url.username
    && !url.password;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Login link generation is only available from this site." },
      { status: 403, headers: noStoreHeaders() }
    );
  }

  try {
    const keyPair = createECDH("secp256k1");
    keyPair.generateKeys();
    const publicKey = keyPair.getPublicKey("hex", "compressed").slice(2);
    const pairingCode = `${publicKey.slice(0, 3)}${publicKey.slice(-3)}`;
    const identity = createAgentIdentity();

    const response = await fetch(`${BINANCE_AGENT_BASE}${BINANCE_LOGIN_ENDPOINT}`, {
      method: "POST",
      headers: agentHeaders(identity),
      body: JSON.stringify({
        isFirstLogin: true,
        os: operatingSystemName(),
        publicKeyHex: publicKey
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Binance login service returned HTTP ${response.status}.` },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    const parsed = loginResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Binance login service returned an invalid response." },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    if (parsed.data.code !== BINANCE_SUCCESS_CODE) {
      return NextResponse.json(
        { error: parsed.data.message || "Binance login service rejected the request." },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    const qrInfo = parsed.data.data.qrInfo;
    if (!qrInfo || !approvedLoginUrl(qrInfo.qrCodeUrl)) {
      return NextResponse.json(
        { error: "Binance login service did not return an approved login link." },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    const expireAt = Number(qrInfo.expireAt);
    if (!Number.isFinite(expireAt) || expireAt <= Date.now()) {
      return NextResponse.json(
        { error: "Binance login service returned an expired login link." },
        { status: 502, headers: noStoreHeaders() }
      );
    }

    const agentSessionId = extractAgentSessionId(response.headers);
    const state = {
      version: 1 as const,
      stage: "pending" as const,
      agentSessionId,
      ...identity,
      qrCodeId: qrInfo.qrCodeId,
      qrExpireAt: expireAt,
      sessionExpireAt: expireAt
    };
    const result = NextResponse.json(
      {
        urlForWeb: qrInfo.qrCodeUrl,
        pairingCode,
        expireAt
      },
      { headers: noStoreHeaders() }
    );
    result.cookies.set(AGENT_SESSION_COOKIE, encodeAgentSession(state), agentSessionCookieOptions(state));
    return result;
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Binance login service timed out."
      : "Unable to generate a Binance Agentic Wallet login link.";
    return NextResponse.json({ error: message }, { status: 502, headers: noStoreHeaders() });
  }
}
