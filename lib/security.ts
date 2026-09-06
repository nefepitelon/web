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

export async function createTwoFactorPass(userId: string) {
  return new SignJWT({ purpose: "welinkbtc-2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(securityKey("TWO_FACTOR_SIGNING_KEY"));
}

export async function verifyTwoFactorPass(token: string | undefined, userId: string) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, securityKey("TWO_FACTOR_SIGNING_KEY"));
    return payload.sub === userId && payload.purpose === "welinkbtc-2fa";
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
  const { payload } = await jwtVerify(token, securityKey("OAUTH_STATE_SIGNING_KEY"));
  if (payload.sub !== userId || payload.purpose !== "social-link") {
    throw new Error("Invalid OAuth state");
  }
  return {
    provider: payload.provider as "twitter" | "discord"
  };
}
