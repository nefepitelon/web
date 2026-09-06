export const AUTH_NEXT_COOKIE = "welinkbtc_auth_next";
export const AUTH_UI_ERROR_PARAM = "auth_error";

const SAFE_LOCAL_ORIGIN = "https://welinkbtc.local";
const DISALLOWED_AUTH_NEXT_PATHS = ["/login", "/auth/callback", "/api/auth"];

export function safeAuthNext(value: string | null | undefined, fallback = "/account") {
  if (!value?.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const resolved = new URL(value, SAFE_LOCAL_ORIGIN);
    const isAuthLoopTarget = DISALLOWED_AUTH_NEXT_PATHS.some(
      (path) => resolved.pathname === path || resolved.pathname.startsWith(`${path}/`)
    );
    if (resolved.origin !== SAFE_LOCAL_ORIGIN || isAuthLoopTarget) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

export function authLoginErrorUrl(requestUrl: string, error: string, next?: string) {
  const origin = new URL(requestUrl).origin;
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set(AUTH_UI_ERROR_PARAM, error);
  if (next) loginUrl.searchParams.set("next", safeAuthNext(next));
  return loginUrl;
}

export function authCallbackUrl(requestUrl: string) {
  const requestOrigin = new URL(requestUrl).origin;
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : requestOrigin;
  return new URL("/auth/callback", configuredOrigin);
}
