import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Google OAuth starts on the server with an exact callback URL", async () => {
  const [form, route] = await Promise.all([
    read("components/login-form.tsx"),
    read("app/api/auth/google/route.ts")
  ]);
  assert.match(form, /new URLSearchParams\(\{ next \}\)/);
  assert.match(form, /\/api\/auth\/google\?\$\{params\.toString\(\)\}/);
  assert.doesNotMatch(form, /signInWithOAuth/);
  assert.match(route, /redirectTo: authCallbackUrl\(request\.url\)\.toString\(\)/);
  assert.match(route, /skipBrowserRedirect: true/);
});

test("OAuth callback writes session cookies to the redirect response", async () => {
  const callback = await read("app/auth/callback/route.ts");
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /response\.cookies\.set\(name, value, options\)/);
  assert.match(callback, /setAll\(cookiesToSet, headers\)/);
  assert.match(callback, /applyAuthResponseHeaders\(response, headers\)/);
  assert.match(callback, /AUTH_NEXT_COOKIE/);
});

test("root OAuth responses are recovered and magic-link failures are localized", async () => {
  const [proxy, callback, login, email] = await Promise.all([
    read("proxy.ts"),
    read("app/auth/callback/route.ts"),
    read("app/login/page.tsx"),
    read("app/api/auth/email/route.ts")
  ]);
  assert.match(proxy, /callbackUrl\.pathname = "\/auth\/callback"/);
  assert.match(proxy, /searchParams\.has\("error_code"\)/);
  assert.match(proxy, /searchParams\.has\("error_description"\)/);
  assert.doesNotMatch(proxy, /authParamNames\.some/);
  assert.match(callback, /providerErrorCode === "otp_expired" \? "link_expired"/);
  assert.match(callback, /authFailureResponse\(url, "callback_failed", next\)/);
  assert.match(login, /登录链接已过期或已经使用/);
  assert.match(email, /over_email_send_rate_limit/);
  assert.match(email, /email_address_not_authorized/);
  assert.match(email, /Supabase 邮件服务暂时无法发送登录链接/);
});

test("post-auth destinations cannot point back to authentication routes", async () => {
  const authRedirect = await read("lib/auth-redirect.ts");
  assert.match(authRedirect, /DISALLOWED_AUTH_NEXT_PATHS/);
  assert.match(authRedirect, /"\/login", "\/auth\/callback", "\/api\/auth"/);
  assert.match(authRedirect, /resolved\.origin !== SAFE_LOCAL_ORIGIN \|\| isAuthLoopTarget/);
  assert.match(authRedirect, /AUTH_UI_ERROR_PARAM = "auth_error"/);
});

test("production custom-domain traffic is canonicalized before auth refresh", async () => {
  const proxy = await read("proxy.ts");
  assert.match(proxy, /redirectToCanonicalHost\(request\)/);
  assert.match(proxy, /requestedHost\.replace\(\/\^www\\\.\//);
  assert.match(proxy, /NextResponse\.redirect\(target, 308\)/);
  assert.match(proxy, /if \(canonicalRedirect\) return canonicalRedirect/);
});

test("session refresh responses are never cached and use verified claims", async () => {
  const [proxy, responseHelper, packageJson] = await Promise.all([
    read("proxy.ts"),
    read("lib/supabase/response.ts"),
    read("package.json")
  ]);
  assert.match(proxy, /setAll\(cookiesToSet, headers\)/);
  assert.match(proxy, /supabase\.auth\.getClaims\(\)/);
  assert.match(proxy, /applyAuthResponseHeaders\(response\)/);
  assert.match(responseHelper, /private, no-cache, no-store, must-revalidate/);
  assert.match(packageJson, /"@supabase\/ssr": "0\.10\.0"/);
});

test("identity-sensitive navigation does not prefetch stale guest pages", async () => {
  const [header, accountSidebar, adminSidebar] = await Promise.all([
    read("components/platform-header.tsx"),
    read("components/account-sidebar.tsx"),
    read("components/admin-sidebar.tsx")
  ]);
  assert.match(header, /href="\/account" prefetch=\{false\}/);
  assert.match(header, /key=\{item\.href\}[\s\S]*?prefetch=\{false\}/);
  assert.match(accountSidebar, /key=\{href\} prefetch=\{false\}/);
  assert.match(adminSidebar, /key=\{href\} prefetch=\{false\}/);
});

test("X account linking reuses the configured Supabase OAuth 2.0 provider", async () => {
  const [start, connections, sync, callback, authCallback] = await Promise.all([
    read("app/api/connections/[provider]/start/route.ts"),
    read("app/account/connections/page.tsx"),
    read("lib/social-connections.ts"),
    read("app/api/connections/[provider]/callback/route.ts"),
    read("app/auth/callback/route.ts")
  ]);
  assert.match(start, /auth\.linkIdentity\(\{/);
  assert.match(start, /provider: "x"/);
  assert.match(start, /redirectTo: authCallbackUrl\(request\.url\)\.toString\(\)/);
  assert.match(start, /Manual Linking/);
  assert.doesNotMatch(start, /TWITTER_CLIENT_ID|TWITTER_CLIENT_SECRET/);
  assert.match(connections, /getUserIdentities\(\)/);
  assert.match(connections, /syncSupabaseXIdentity/);
  assert.match(connections, /Repaired local X account projection/);
  assert.match(sync, /item\.provider === "x" \|\| item\.provider === "twitter"/);
  assert.match(sync, /provider: "twitter"/);
  assert.match(authCallback, /X identity synchronized/);
  assert.match(authCallback, /syncSupabaseXIdentity/);
  assert.doesNotMatch(callback, /api\.x\.com\/2\/oauth2\/token/);
});
