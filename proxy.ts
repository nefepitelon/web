import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

function redirectToCanonicalHost(request: NextRequest) {
  if (process.env.NODE_ENV !== "production" || !process.env.NEXT_PUBLIC_APP_URL) return null;

  try {
    const canonical = new URL(process.env.NEXT_PUBLIC_APP_URL);
    const requestedHost = request.nextUrl.hostname.toLowerCase();
    const canonicalHost = canonical.hostname.toLowerCase();
    const requestedRoot = requestedHost.replace(/^www\./, "");
    const canonicalRoot = canonicalHost.replace(/^www\./, "");

    // Only canonicalize the configured custom domain. Preview and *.vercel.app
    // deployments must remain reachable on their own hostnames.
    if (requestedRoot !== canonicalRoot || requestedHost === canonicalHost) return null;

    const target = request.nextUrl.clone();
    target.protocol = canonical.protocol;
    target.host = canonical.host;
    return NextResponse.redirect(target, 308);
  } catch {
    return null;
  }
}

export function isInternalWorkflowPath(pathname: string) {
  return pathname === "/.well-known/workflow" || pathname.startsWith("/.well-known/workflow/");
}

export async function proxy(request: NextRequest) {
  // Workflow DevKit calls these endpoints at high frequency. They are internal
  // transport requests, not browser sessions, and must never refresh Supabase
  // auth or run user projection logic. Keep this guard as defense in depth in
  // case the statically analysed matcher changes in a future Next.js release.
  if (isInternalWorkflowPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  const canonicalRedirect = redirectToCanonicalHost(request);
  if (canonicalRedirect) return canonicalRedirect;

  const authParamNames = ["code", "error", "error_code", "error_description"] as const;
  // A plain `error` query belongs to the application UI too. Treat only the
  // parameters that uniquely identify a Supabase response as an auth callback;
  // otherwise `/login?error=...` redirects back to this callback forever.
  const hasAuthResponse =
    request.nextUrl.searchParams.has("code") ||
    request.nextUrl.searchParams.has("error_code") ||
    request.nextUrl.searchParams.has("error_description");
  if (hasAuthResponse && ["/", "/login"].includes(request.nextUrl.pathname)) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";
    callbackUrl.search = "";
    for (const name of authParamNames) {
      const value = request.nextUrl.searchParams.get(name);
      if (value) callbackUrl.searchParams.set(name, value);
    }
    return NextResponse.redirect(callbackUrl);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let response = applyAuthResponseHeaders(NextResponse.next({ request }));
  const authCookieCount = request.cookies
    .getAll()
    .filter(({ name }) => name.startsWith("sb-") && name.includes("-auth-token")).length;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = applyAuthResponseHeaders(NextResponse.next({ request }), headers);
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        }
      }
    }
  );

  const { error: claimsError } = await supabase.auth.getClaims();
  if (claimsError && authCookieCount > 0) {
    console.warn("[auth:proxy] Session validation failed", {
      path: request.nextUrl.pathname,
      code: claimsError.code,
      status: claimsError.status,
      authCookieCount
    });
  }
  const referral = request.nextUrl.searchParams.get("ref");
  if (referral && /^[a-z]{3,20}$/.test(referral)) {
    response.cookies.set("welinkbtc_ref", referral, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/"
    });
  }
  return applyAuthResponseHeaders(response);
}

export const config = {
  matcher: ["/((?!\\.well-known/workflow/|api/bstock-alpha/brand-icon|legacy/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
