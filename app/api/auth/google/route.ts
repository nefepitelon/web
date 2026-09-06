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
import { checkRateLimit } from "@/lib/rate-limit";
import { requestContext } from "@/lib/request-security";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

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
  const pendingAccessCode = request.nextUrl.searchParams.get("accessCode")?.trim();
  if (pendingAccessCode && isDatabaseConfigured()) {
    const { ipAddress } = await requestContext(request);
    const rate = await checkRateLimit(`auth:access-code:${ipAddress ?? "unknown"}`, 20, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.redirect(authLoginErrorUrl(request.url, "invalid_access_code", next));
    }
  }
  const accessCodeValidation = pendingAccessCode && isDatabaseConfigured()
    ? await validateAccessCode(pendingAccessCode)
    : null;
  if (pendingAccessCode && !accessCodeValidation?.valid) {
    return NextResponse.redirect(authLoginErrorUrl(request.url, "invalid_access_code", next));
  }
  const pendingCookies: PendingCookie[] = [];
  const pendingHeaders: Record<string, string> = {};
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
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
