import type { NextRequest } from "next/server";

const API_ORIGIN = "https://api2.qianyubtc.com";
const TOOL_ORIGIN = "https://tcv2.qianyubtc.com";
const ALLOWED_PROXY_HOSTS = new Set([
  "api.binance.com",
  "fapi.binance.com",
  "api.coingecko.com"
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path?: string[] }> };

function corsHeaders(contentType = "application/json; charset=utf-8") {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cross-Origin-Resource-Policy": "cross-origin",
    Vary: "Origin"
  };
}

function validPath(path: string[]) {
  return path.length > 0 && path.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment));
}

function hasAllowedProxyTarget(url: URL) {
  if (url.pathname !== "/api/proxy") return true;
  const target = url.searchParams.get("u");
  if (!target) return false;
  try {
    const parsed = new URL(target);
    return parsed.protocol === "https:" && ALLOWED_PROXY_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  if (!validPath(path)) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders() });

  const upstreamUrl = new URL(`/${path.join("/")}`, API_ORIGIN);
  upstreamUrl.search = request.nextUrl.search;
  if (!hasAllowedProxyTarget(upstreamUrl)) {
    return Response.json({ error: "Unsupported upstream target" }, { status: 400, headers: corsHeaders() });
  }

  const upstream = await fetch(upstreamUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      Accept: request.headers.get("accept") || "application/json",
      Origin: TOOL_ORIGIN,
      Referer: `${TOOL_ORIGIN}/`,
      "User-Agent": "welinkBTC Contract Assistant API Proxy/1.0"
    }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: corsHeaders(upstream.headers.get("content-type") || undefined)
  });
}
