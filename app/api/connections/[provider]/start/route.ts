import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_NEXT_COOKIE, authCallbackUrl } from "@/lib/auth-redirect";
import { requireViewer } from "@/lib/membership";
import { createOAuthState } from "@/lib/security";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

function connectionError(request: Request, message: string) {
  const target = new URL("/account/connections", request.url);
  target.searchParams.set("error", message);
  return applyAuthResponseHeaders(NextResponse.redirect(target));
}

async function startSupabaseXLink(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return connectionError(request, "Supabase Auth 尚未配置");
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
  const { data, error } = await supabase.auth.linkIdentity({
    provider: "x",
    options: {
      redirectTo: authCallbackUrl(request.url).toString(),
      skipBrowserRedirect: true
    }
  });

  if (error || !data.url) {
    console.error("[connections:x] Supabase identity linking failed", {
      code: error?.code,
      status: error?.status,
      message: error?.message
    });
    const normalized = error?.message?.toLowerCase() ?? "";
    const message = normalized.includes("manual") || normalized.includes("linking")
      ? "请先在 Supabase Auth 设置中开启 Manual Linking（手动身份关联）"
      : normalized.includes("provider") || normalized.includes("unsupported")
        ? "请确认 Supabase 已启用 X / Twitter (OAuth 2.0) Provider"
        : "无法发起 X 授权，请检查 Supabase X OAuth 与手动身份关联设置";
    return connectionError(request, message);
  }

  const response = applyAuthResponseHeaders(NextResponse.redirect(data.url));
  applyAuthResponseHeaders(response, pendingHeaders);
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  response.cookies.set(AUTH_NEXT_COOKIE, "/account/connections?oauth=x", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/"
  });
  console.info("[connections:x] Supabase identity linking started", {
    callbackPath: authCallbackUrl(request.url).pathname,
    authority: "supabase-x-oauth2"
  });
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const viewer = await requireViewer("/account/connections");
  const { provider } = await params;
  if (!( ["twitter", "discord"] as string[]).includes(provider)) {
    return connectionError(request, "不支持的绑定类型");
  }

  if (provider === "twitter") {
    return startSupabaseXLink(request);
  }

  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    return connectionError(request, "Discord OAuth 尚未配置");
  }
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const redirectUri = `${origin}/api/connections/discord/callback`;
  const authorizationUrl = new URL("https://discord.com/oauth2/authorize");
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "identify"
  }).toString();

  const state = await createOAuthState(viewer.id, "discord");
  authorizationUrl.searchParams.set("state", state);
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set("welinkbtc_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/connections/discord/callback"
  });
  return response;
}
