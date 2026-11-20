import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const encoder = new TextEncoder();

function securityKey(name: "TWO_FACTOR_SIGNING_KEY" | "OAUTH_STATE_SIGNING_KEY") {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} must be configured with at least 32 characters`);
  }
  return encoder.encode(value);
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function generateBackupCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashBackupCode(code: string) {
  const key = process.env.TWO_FACTOR_SIGNING_KEY;
  if (!key) throw new Error("TWO_FACTOR_SIGNING_KEY is not configured");
  return createHmac("sha256", key)
    .update(code.trim().toUpperCase())
    .digest("hex");
}

export function safeEqualText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type TwoFactorSessionBinding = {
  sessionId: string;
  factorId: string;
  enabledAt: string;
};

export function twoFactorBindingFromClaims(
  claims: { sub?: unknown; session_id?: unknown } | null | undefined,
  userId: string,
  factorId: string | null | undefined,
  enabledAt: Date | string | null | undefined
): TwoFactorSessionBinding | null {
  if (claims?.sub !== userId || typeof claims.session_id !== "string" || !claims.session_id || !factorId || !enabledAt) return null;
  const date = new Date(enabledAt);
  if (!Number.isFinite(date.getTime())) return null;
  return { sessionId: claims.session_id, factorId, enabledAt: date.toISOString() };
}

function bindingDigest(binding: TwoFactorSessionBinding) {
  return createHmac("sha256", securityKey("TWO_FACTOR_SIGNING_KEY"))
    .update(JSON.stringify([binding.sessionId, binding.factorId, binding.enabledAt]))
    .digest("hex");
}

export async function createTwoFactorPass(userId: string, binding: TwoFactorSessionBinding) {
  if (!binding?.sessionId || !binding.factorId || !binding.enabledAt) throw new Error("A verified MFA session binding is required");
  return new SignJWT({ purpose: "welinkbtc-2fa", binding: bindingDigest(binding) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("welinkbtc")
    .setAudience("two-factor-session")
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(securityKey("TWO_FACTOR_SIGNING_KEY"));
}

export async function verifyTwoFactorPass(token: string | undefined, userId: string, binding: TwoFactorSessionBinding | null = null) {
  if (!token || !binding?.sessionId || !binding.factorId || !binding.enabledAt) return false;
  try {
    const { payload } = await jwtVerify(token, securityKey("TWO_FACTOR_SIGNING_KEY"), {
      algorithms: ["HS256"], issuer: "welinkbtc", audience: "two-factor-session", maxTokenAge: "12h"
    });
    return payload.sub === userId && payload.purpose === "welinkbtc-2fa"
      && typeof payload.binding === "string" && safeEqualText(payload.binding, bindingDigest(binding));
  } catch {
    return false;
  }
}

export async function createOAuthState(
  userId: string,
  provider: "twitter" | "discord"
) {
  return new SignJWT({ purpose: "social-link", provider })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(securityKey("OAUTH_STATE_SIGNING_KEY"));
}

export async function verifyOAuthState(token: string, userId: string) {
  const { payload } = await jwtVerify(token, securityKey("OAUTH_STATE_SIGNING_KEY"), { algorithms: ["HS256"], maxTokenAge: "10m" });
  if (payload.sub !== userId || payload.purpose !== "social-link") {
    throw new Error("Invalid OAuth state");
  }
  return {
    provider: payload.provider as "twitter" | "discord"
  };
}
