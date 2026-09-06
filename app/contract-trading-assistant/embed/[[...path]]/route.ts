import type { NextRequest } from "next/server";

const UPSTREAM_ORIGIN = "https://tcv2.qianyubtc.com";
const EMBED_BASE = "/contract-trading-assistant/embed/";
const INTERNAL_API_BASE = "/contract-trading-assistant/api";
const PAGE_FRAGMENTS = [
  { page: "analysis", containerId: "pageAnalysis" },
  { page: "monitor", containerId: "pageMonitor" },
  { page: "resonance", containerId: "pageResonance" }
] as const;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path?: string[] }> };

function validPath(path: string[]) {
  return path.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment));
}

function proxyHeaders(contentType: string | null) {
  return {
    "Content-Type": contentType || "application/octet-stream",
    "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff"
  };
}

function injectEmbedRuntime(html: string) {
  const runtime = `<base href="${EMBED_BASE}"><script>window.__welinkContractStorage=(()=>{const values=new Map([['theme','dark']]);return{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()}})();</script>`;
  return html.includes("<head>") ? html.replace("<head>", `<head>${runtime}`) : `${runtime}${html}`;
}

async function preloadPageFragments(html: string) {
  const fragments = await Promise.all(
    PAGE_FRAGMENTS.map(async ({ page }) => {
      const response = await fetch(new URL(`/pages/${page}.html`, UPSTREAM_ORIGIN), {
        cache: "no-store",
        headers: { "User-Agent": "welinkBTC Contract Assistant Embed/1.0" }
      });
      if (!response.ok) throw new Error(`Unable to preload contract assistant page: ${page}`);
      return response.text();
    })
  );

  return PAGE_FRAGMENTS.reduce((document, { containerId }, index) => {
    const container = new RegExp(
      `(<div id="${containerId}" class="page-view(?: active)?">)[\\s\\S]*?(</div><!-- /${containerId} -->)`
    );
    return document.replace(container, (_match, opening: string, closing: string) => {
      return `${opening}\n${fragments[index]}\n${closing}`;
    });
  }, html);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  if (!validPath(path)) return new Response("Not found", { status: 404 });

  const upstreamUrl = new URL(`/${path.join("/")}`, UPSTREAM_ORIGIN);
  upstreamUrl.search = request.nextUrl.search;

  const upstream = await fetch(upstreamUrl, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      Accept: request.headers.get("accept") || "*/*",
      "User-Agent": "welinkBTC Contract Assistant Embed/1.0"
    }
  });

  if (!upstream.ok) {
    return new Response("Contract assistant resource unavailable", {
      status: upstream.status,
      headers: proxyHeaders("text/plain; charset=utf-8")
    });
  }

  const contentType = upstream.headers.get("content-type");
  if (contentType?.includes("text/html")) {
    const upstreamHtml = await upstream.text();
    const html = path.length === 0
      ? injectEmbedRuntime(await preloadPageFragments(upstreamHtml))
      : upstreamHtml;
    return new Response(html, { headers: proxyHeaders(contentType) });
  }

  if (upstreamUrl.pathname === "/js/config.js") {
    const script = (await upstream.text()).replaceAll(UPSTREAM_ORIGIN.replace("tcv2", "api2"), INTERNAL_API_BASE);
    return new Response(script, { headers: proxyHeaders(contentType) });
  }

  if (upstreamUrl.pathname === "/js/app.js") {
    const script = (await upstream.text())
      .replaceAll("localStorage", "window.__welinkContractStorage")
      .replace(
        "const _pageCache = {};",
        "const _pageCache = { analysis: true, monitor: true, resonance: true };"
      );
    return new Response(script, { headers: proxyHeaders(contentType) });
  }

  if (upstreamUrl.pathname === "/js/analysis.js") {
    const script = (await upstream.text()).replace(
      /if \(!symbolEl\) return;/,
      "if (!symbolEl || !document.getElementById('priceSymbol')) return;"
    );
    return new Response(script, { headers: proxyHeaders(contentType) });
  }

  return new Response(upstream.body, { headers: proxyHeaders(contentType) });
}
