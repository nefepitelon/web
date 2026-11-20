import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
async function load(path, mocks = {}) {
  const code = ts.transpileModule(await read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const requestSecurity = await load("lib/request-security.ts", { "next/headers": { headers: async () => new Headers() } });
const protectedRequest = (body, extra = {}) => new Request("https://example.test/api/auth/password", {
  method: "POST", headers: { origin: "https://example.test", "content-type": "application/json", ...extra }, body: JSON.stringify(body)
});

test("cookie mutations reject cross-site, hostile sibling, null and missing origin", () => {
  const valid = { origin: "https://example.test" };
  assert.doesNotThrow(() => requestSecurity.assertSameOrigin(protectedRequest({}, valid)));
  for (const headers of [
    { origin: "https://evil.test" }, { origin: "null" },
    { origin: "https://example.test", "sec-fetch-site": "same-site" },
    { "sec-fetch-site": "cross-site" }, {}
  ]) {
    const request = new Request("https://example.test/api/account", { method: "POST", headers });
    assert.throws(() => requestSecurity.assertSameOrigin(request));
  }
  for (const headers of [{ "sec-fetch-site": "same-origin" }, { referer: "https://example.test/account" }]) {
    assert.doesNotThrow(() => requestSecurity.assertSameOrigin(new Request("https://example.test/api/account", { method: "POST", headers })));
  }
});

test("forwarding addresses are trusted only behind the configured edge", () => {
  const previousVercel = process.env.VERCEL, previousProxy = process.env.TRUST_PROXY_HEADERS;
  try {
    delete process.env.VERCEL; delete process.env.TRUST_PROXY_HEADERS;
    const headers = new Headers({ "x-forwarded-for": "198.51.100.5", "x-vercel-forwarded-for": "203.0.113.7" });
    assert.equal(requestSecurity.trustedRequestIp(headers), null);
    process.env.VERCEL = "1";
    assert.equal(requestSecurity.trustedRequestIp(headers), "203.0.113.7");
    assert.equal(requestSecurity.trustedRequestIp(new Headers({ "x-vercel-forwarded-for": "attacker-value" })), null);
  } finally {
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    if (previousProxy === undefined) delete process.env.TRUST_PROXY_HEADERS; else process.env.TRUST_PROXY_HEADERS = previousProxy;
  }
});

async function authHarness({ database = true } = {}) {
  const buckets = new Map();
  const calls = [];
  const protect = await load("lib/auth-protection.ts", {
    "@/lib/prisma": { isDatabaseConfigured: () => database },
    "@/lib/request-security": { requestContext: async (request) => ({ ipAddress: request.headers.get("x-test-ip") ?? "203.0.113.2" }) },
    "@/lib/rate-limit": { checkRateLimit: async (key, maximum) => {
      const count = (buckets.get(key) ?? 0) + 1; buckets.set(key, count);
      return { allowed: count <= maximum, retryAfterSeconds: 60 };
    } }
  });
  const fakeAuth = {
    signUp: async (value) => { calls.push({ intent: "signup", value }); return { data: { session: null, user: null }, error: null }; },
    signInWithPassword: async (value) => { calls.push({ intent: "signin", value }); return { error: { code: "invalid_credentials" } }; },
    signInWithOtp: async (value) => { calls.push({ intent: "magic", value }); return { error: null }; }
  };
  const mocks = {
    "@supabase/ssr": { createServerClient: () => ({ auth: fakeAuth }) },
    "@/lib/auth-protection": protect,
    "@/lib/prisma": { isDatabaseConfigured: () => database },
    "@/lib/request-security": requestSecurity,
    "@/lib/access-codes": { PENDING_ACCESS_CODE_COOKIE: "pending", validateAccessCode: async () => null },
    "@/lib/audit": { writeAudit: async () => {} },
    "@/lib/auth-redirect": await load("lib/auth-redirect.ts"),
    "@/lib/membership": { syncAuthenticatedUser: async () => {} },
    "@/lib/supabase/response": await load("lib/supabase/response.ts"),
    "@/lib/supabase/cookie-options": await load("lib/supabase/cookie-options.ts"),
    "@/lib/supabase/server": { createServerSupabaseClient: async () => ({ auth: fakeAuth }) }
  };
  return { protect, calls, password: await load("app/api/auth/password/route.ts", mocks), email: await load("app/api/auth/email/route.ts", mocks) };
}

test("rotating email addresses cannot bypass signup IP limits; keys contain no raw email", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public-auth.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-anon-key";
  const harness = await authHarness();
  const previous = process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY;
  delete process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY;
  try {
    for (let index = 0; index < 5; index++) {
      const result = await harness.password.POST(protectedRequest({ intent: "signup", email: `new-${index}@example.test`, password: "Strong-pass123" }));
      assert.equal(result.status, 200);
    }
    const result = await harness.password.POST(protectedRequest({ intent: "signup", email: "another-new@example.test", password: "Strong-pass123" }));
    assert.equal(result.status, 429); assert.equal(result.headers.get("retry-after"), "60");
    assert.equal(harness.calls.length, 5);
    assert.ok(harness.protect.authRatePolicies("signup", "test@example.test", "203.0.113.2").every((item) => !item.key.includes("@") && !item.key.includes("203.0.113.2")));
  } finally { if (previous !== undefined) process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY = previous; }
});

test("rotating IP addresses cannot bypass a password identity limit", async () => {
  const harness = await authHarness();
  for (let index = 0; index < 12; index++) {
    const response = await harness.password.POST(protectedRequest({ intent: "signin", email: "same@example.test", password: "Wrong-pass123" }, { "x-test-ip": `203.0.113.${index + 1}` }));
    assert.equal(response.status, 401);
  }
  const blocked = await harness.password.POST(protectedRequest({ intent: "signin", email: "same@example.test", password: "Wrong-pass123" }, { "x-test-ip": "198.51.100.10" }));
  assert.equal(blocked.status, 429); assert.equal(harness.calls.length, 12);
});

test("limiter outages fail closed without calling Supabase signup", async () => {
  const harness = await authHarness({ database: false });
  const response = await harness.password.POST(protectedRequest({ intent: "signup", email: "test@example.test", password: "Strong-pass123" }));
  assert.equal(response.status, 503); assert.equal(harness.calls.length, 0);
});

test("magic links never implicitly register accounts; CAPTCHA reaches Supabase for verification", async () => {
  const harness = await authHarness();
  const previous = process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY;
  process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY = "public-test-site-key";
  try {
    const rejected = await harness.email.POST(protectedRequest({ email: "test@example.test" }));
    assert.equal(rejected.status, 400); assert.equal(harness.calls.length, 0);
    const response = await harness.email.POST(protectedRequest({ email: "test@example.test", captchaToken: "opaque-provider-token" }));
    assert.equal(response.status, 200);
    assert.equal(harness.calls[0].value.options.shouldCreateUser, false);
    assert.equal(harness.calls[0].value.options.captchaToken, "opaque-provider-token");
    assert.match(response.headers.get("cache-control"), /no-store/);
  } finally { if (previous === undefined) delete process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY; else process.env.NEXT_PUBLIC_AUTH_CAPTCHA_SITE_KEY = previous; }
});

test("auth JSON bodies are capped before parsing and unsupported content types rejected", async () => {
  const { protect } = await authHarness();
  await assert.rejects(() => protect.readAuthJson(new Request("https://example.test", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" })), (error) => error.status === 415);
  await assert.rejects(() => protect.readAuthJson(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(20_000) }) })), (error) => error.status === 413);
});

test("MFA recovery proofs reject other users, new sessions, changed factors and legacy cookies", async () => {
  const security = await load("lib/security.ts");
  const { SignJWT } = await import("jose");
  const previous = process.env.TWO_FACTOR_SIGNING_KEY;
  process.env.TWO_FACTOR_SIGNING_KEY = "unit-test-mfa-key-not-a-production-key-123456";
  try {
    const binding = security.twoFactorBindingFromClaims({ sub: "user-1", session_id: "session-1" }, "user-1", "factor-1", new Date("2026-11-19T00:00:00Z"));
    const token = await security.createTwoFactorPass("user-1", binding);
    assert.equal(await security.verifyTwoFactorPass(token, "user-1", binding), true);
    assert.equal(await security.verifyTwoFactorPass(token, "user-2", binding), false);
    for (const changed of [null, { ...binding, sessionId: "session-2" }, { ...binding, factorId: "factor-2" }, { ...binding, enabledAt: "2026-11-19T01:00:00Z" }]) {
      assert.equal(await security.verifyTwoFactorPass(token, "user-1", changed), false);
    }
    const legacy = await new SignJWT({ purpose: "welinkbtc-2fa" }).setProtectedHeader({ alg: "HS256" }).setSubject("user-1").setIssuedAt().setExpirationTime("12h").sign(new TextEncoder().encode(process.env.TWO_FACTOR_SIGNING_KEY));
    assert.equal(await security.verifyTwoFactorPass(legacy, "user-1", binding), false);
    assert.equal(security.twoFactorBindingFromClaims({ sub: "other-user", session_id: "session-1" }, "user-1", "factor-1", new Date()), null);
    assert.equal(security.twoFactorBindingFromClaims({ sub: "user-1" }, "user-1", "factor-1", new Date()), null);
  } finally { if (previous === undefined) delete process.env.TWO_FACTOR_SIGNING_KEY; else process.env.TWO_FACTOR_SIGNING_KEY = previous; }
});

test("authentication destinations cannot escape origin through backslashes or auth loops", async () => {
  const { safeAuthNext } = await load("lib/auth-redirect.ts");
  for (const value of ["//evil.test", "/\\evil.test", "/auth/callback?next=/admin", "/api/auth/google", "/login"]) assert.equal(safeAuthNext(value), "/account");
  assert.equal(safeAuthNext("/dashboard?view=market"), "/dashboard?view=market");
});
