import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { PENDING_ACCESS_CODE_COOKIE, redeemAccessCode } from "@/lib/access-codes";
import { writeAudit } from "@/lib/audit";
import { AUTH_NEXT_COOKIE, authLoginErrorUrl, safeAuthNext } from "@/lib/auth-redirect";
import { syncAuthenticatedUser } from "@/lib/membership";
import { hasSupabaseXIdentity, syncSupabaseXIdentity } from "@/lib/social-connections";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

function authFailureResponse(url: URL, error: string, next: string) {
  const response = applyAuthResponseHeaders(
    NextResponse.redirect(authLoginErrorUrl(url.toString(), error, next))
  );
  response.cookies.set(AUTH_NEXT_COOKIE, "", { expires: new Date(0), path: "/" });
  response.cookies.set(PENDING_ACCESS_CODE_COOKIE, "", { expires: new Date(0), path: "/" });
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  const next = safeAuthNext(
    request.cookies.get(AUTH_NEXT_COOKIE)?.value ?? url.searchParams.get("next")
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return authFailureResponse(url, "not_configured", next);
  }
  if (providerError) {
    const providerErrorCode = url.searchParams.get("error_code");
    console.error("[auth:callback] Provider returned an error", {
      error: providerError,
      code: providerErrorCode
    });
    return authFailureResponse(
      url,
      providerErrorCode === "otp_expired" ? "link_expired" : "provider_failed",
      next
    );
  }

  if (code) {
    const response = applyAuthResponseHeaders(NextResponse.redirect(new URL(next, url.origin)));
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          applyAuthResponseHeaders(response, headers);
        }
      }
    });
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      let xIdentitySynced = false;
      let xIdentitySyncError: string | null = null;
      if (data.user) {
        try {
          await syncAuthenticatedUser(data.user);
        } catch (postAuthError) {
          console.error("[auth:callback] Post-auth account sync failed", {
            message: postAuthError instanceof Error ? postAuthError.message : "unknown"
          });
        }

        try {
          let identities = data.user.identities;
          if (!hasSupabaseXIdentity(identities)) {
            const { data: identitiesData, error: identitiesError } = await supabase.auth.getUserIdentities();
            if (identitiesError) throw identitiesError;
            identities = identitiesData.identities;
          }
          if (hasSupabaseXIdentity(identities)) {
            await syncSupabaseXIdentity({
              userId: data.user.id,
              identities,
              request
            });
            xIdentitySynced = true;
            console.info("[auth:callback] X identity synchronized", {
              authority: "supabase-x-oauth2"
            });
          }
        } catch (identityError) {
          xIdentitySyncError = identityError instanceof Error
            ? identityError.message
            : "X 身份同步失败，请重新授权";
          console.error("[auth:callback] X identity synchronization failed", {
            message: xIdentitySyncError
          });
        }

        try {
          const pendingAccessCode = request.cookies.get(PENDING_ACCESS_CODE_COOKIE)?.value;
          if (pendingAccessCode) {
            const redemption = await redeemAccessCode(data.user.id, pendingAccessCode, "login");
            if (redemption.status === "activated") {
              await writeAudit({
                actorUserId: data.user.id,
                action: "access_code.redeemed",
                targetType: "access_code",
                metadata: { source: "login", label: redemption.label, endsAt: redemption.endsAt.toISOString() },
                request
              });
            }
          }
        } catch (accessCodeError) {
          console.error("[auth:callback] Pending access code redemption failed", {
            message: accessCodeError instanceof Error ? accessCodeError.message : "unknown"
          });
        }
      }

      if (next.startsWith("/account/connections")) {
        const connectionTarget = new URL("/account/connections", url.origin);
        if (xIdentitySynced) connectionTarget.searchParams.set("connected", "twitter");
        if (xIdentitySyncError) connectionTarget.searchParams.set("error", xIdentitySyncError);
        response.headers.set("Location", connectionTarget.toString());
      }
      response.cookies.set(AUTH_NEXT_COOKIE, "", { expires: new Date(0), path: "/" });
      response.cookies.set(PENDING_ACCESS_CODE_COOKIE, "", { expires: new Date(0), path: "/" });
      return response;
    }
    console.error("[auth:callback] Code exchange failed", {
      code: error.code,
      status: error.status,
      message: error.message
    });
  }

  return authFailureResponse(url, "callback_failed", next);
}
