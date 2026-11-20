import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { PENDING_ACCESS_CODE_COOKIE, validateAccessCode } from "@/lib/access-codes";
import {
  AUTH_NEXT_COOKIE,
  authCallbackUrl,
  authLoginErrorUrl,
  safeAuthNext
} from "@/lib/auth-redirect";
import { isDatabaseConfigured } from "@/lib/prisma";
import { AuthProtectionError, protectAuthRequest } from "@/lib/auth-protection";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";
import { supabaseCookieOptions } from "@/lib/supabase/cookie-options";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.redirect(authLoginErrorUrl(request.url, "not_configured"));
  }

  const next = safeAuthNext(request.nextUrl.searchParams.get("next"));
  try {
    await protectAuthRequest(request, "oauth");
  } catch (error) {
    if (!(error instanceof AuthProtectionError)) throw error;
    const response = applyAuthResponseHeaders(NextResponse.redirect(authLoginErrorUrl(request.url, "rate_limited", next)));
    if (error.retryAfterSeconds) response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
  const pendingAccessCode = request.nextUrl.searchParams.get("accessCode")?.trim();
  const accessCodeValidation = pendingAccessCode && isDatabaseConfigured()
    ? await validateAccessCode(pendingAccessCode)
    : null;
  if (pendingAccessCode && !accessCodeValidation?.valid) {
    return NextResponse.redirect(authLoginErrorUrl(request.url, "invalid_access_code", next));
  }
  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders: Record<string, string> = {};
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: supabaseCookieOptions,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        pendingCookies.push(...cookiesToSet);
        Object.assign(pendingHeaders, headers);
      }
    }
  });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authCallbackUrl(request.url).toString(),
      skipBrowserRedirect: true
    }
  });

  if (error || !data.url) {
    console.error("[auth:google] OAuth start failed", {
      code: error?.code,
      status: error?.status,
      message: error?.message
    });
    return NextResponse.redirect(authLoginErrorUrl(request.url, "oauth_start_failed", next));
  }

  const response = applyAuthResponseHeaders(NextResponse.redirect(data.url));
  applyAuthResponseHeaders(response, pendingHeaders);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  response.cookies.set(AUTH_NEXT_COOKIE, next, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/"
  });
  if (accessCodeValidation?.valid) {
    response.cookies.set(PENDING_ACCESS_CODE_COOKIE, accessCodeValidation.normalized, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 60,
      path: "/"
    });
  } else {
    response.cookies.set(PENDING_ACCESS_CODE_COOKIE, "", { expires: new Date(0), path: "/" });
  }
  return response;
}
