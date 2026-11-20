import { createHash } from "node:crypto";
import { isDatabaseConfigured } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request-security";

export type AuthIntent = "signin" | "signup" | "magic" | "oauth";

export class AuthProtectionError extends Error {
  constructor(message: string, public status: number, public retryAfterSeconds?: number) {
    super(message);
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

export function authRatePolicies(intent: AuthIntent, email: string | null, ipAddress: string | null) {
  const ip = digest(ipAddress ?? "unknown");
  const policies = [{ key: `auth:v2:all:ip:${ip}`, maximum: 40, windowMs: 10 * 60_000 }];
  if (intent === "signup" || intent === "magic") {
    policies.push({ key: `auth:v2:email-send:ip:${ip}`, maximum: 8, windowMs: 60 * 60_000 });
  }
  if (intent === "signup") {
    policies.push({ key: `auth:v2:signup:ip:${ip}`, maximum: 5, windowMs: 60 * 60_000 });
  }
  if (email) {
    const identity = digest(email.trim().toLowerCase());
    policies.push({
      key: `auth:v2:${intent === "signin" ? "password" : "email-send"}:identity:${identity}`,
      maximum: intent === "signin" ? 12 : 5,
      windowMs: 10 * 60_000
    });
  }
  return policies;
}

export async function protectAuthRequest(request: Request, intent: AuthIntent, email: string | null = null) {
  // Skipping a persistent limiter during a DB outage would make the exact
  // period of degraded service an unlimited registration/password endpoint.
  if (!isDatabaseConfigured()) {
    throw new AuthProtectionError("认证保护服务暂不可用，请稍后重试。", 503);
  }
  const { ipAddress } = await requestContext(request);
  for (const policy of authRatePolicies(intent, email, ipAddress)) {
    let rate;
    try {
      rate = await checkRateLimit(policy.key, policy.maximum, policy.windowMs);
    } catch {
      throw new AuthProtectionError("认证保护服务暂不可用，请稍后重试。", 503);
    }
    if (!rate.allowed) {
      throw new AuthProtectionError("认证请求过于频繁，请稍后重试。", 429, rate.retryAfterSeconds);
    }
  }
}

export function requireCaptchaToken(token: string | undefined) {
  // Supabase Auth must ALSO enable CAPTCHA so direct /auth/v1 calls cannot
  // bypass the application. Tokens are passed to Auth for provider verification.
  if (process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY && !token) {
    throw new AuthProtectionError("请先完成安全验证。", 400);
  }
}

export async function readAuthJson(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (length > 16_384) throw new AuthProtectionError("认证请求内容过大。", 413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AuthProtectionError("认证请求需使用 JSON 格式。", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthProtectionError("认证请求无效。", 400);
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16_384) {
      await reader.cancel();
      throw new AuthProtectionError("认证请求内容过大。", 413);
    }
    parts.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw new AuthProtectionError("认证请求无效。", 400);
  }
}
