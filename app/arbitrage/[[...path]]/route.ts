import type { NextRequest } from "next/server";

const UPSTREAM_ORIGIN = "https://perpdexlist.com";
const LOCAL_BASE = "/arbitrage";
const STATIC_ROOTS = new Set([
  "assets",
  "fonts",
  "logos",
  "promo",
  "favicon.png",
  "og-image.png"
]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ path?: string[] }> };

function validPath(path: string[]) {
  return path.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment));
}

function upstreamPath(path: string[]) {
  if (path.length === 0) return "/arbitrage";
  if (path[0] === "__upstream") return `/${path.slice(1).join("/")}`;
  if (STATIC_ROOTS.has(path[0])) return `/${path.join("/")}`;
  return `/arbitrage/${path.join("/")}`;
}

function responseHeaders(contentType: string | null, cacheable: boolean) {
  return {
    "Content-Type": contentType || "application/octet-stream",
    "Cache-Control": cacheable
      ? "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
      : "no-store",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  };
}

function embedRuntime() {
  return `<base href="${LOCAL_BASE}/"><script>(()=>{const localBase='${LOCAL_BASE}',upstream='${UPSTREAM_ORIGIN}',nativeFetch=window.fetch.bind(window),nativeEventSource=window.EventSource,createStorage=()=>{const values=new Map();return{getItem:key=>values.has(String(key))?values.get(String(key)):null,setItem:(key,value)=>values.set(String(key),String(value)),removeItem:key=>values.delete(String(key)),clear:()=>values.clear(),key:index=>Array.from(values.keys())[index]??null,get length(){return values.size}}};const localMemory=createStorage(),sessionMemory=createStorage();window.__welinkArbitrageLocalStorage=localMemory;window.__welinkArbitrageSessionStorage=sessionMemory;try{Object.defineProperty(window,'localStorage',{configurable:true,value:localMemory})}catch{}try{Object.defineProperty(window,'sessionStorage',{configurable:true,value:sessionMemory})}catch{}function proxyUrl(input){const raw=typeof input==='string'?input:input instanceof URL?input.href:input&&typeof input.url==='string'?input.url:'';if(!raw)return raw;if(raw===localBase||raw.startsWith(localBase+'/'))return raw;const url=new URL(raw,window.location.href);if(url.origin===upstream||(url.origin===window.location.origin&&url.pathname.startsWith('/api/')))return localBase+'/__upstream'+url.pathname+url.search;if(raw.startsWith('/'))return localBase+'/__upstream'+raw;return raw}window.fetch=(input,init)=>{const next=proxyUrl(input);if(next===input||!next)return nativeFetch(input,init);const options={...init,credentials:'omit',mode:'cors'};if(typeof input==='string'||input instanceof URL)return nativeFetch(next,options);return nativeFetch(new Request(next,input),options)};try{Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:()=>true})}catch{}if(nativeEventSource){window.EventSource=class extends nativeEventSource{constructor(url,config){super(proxyUrl(url),config)}}}})();</script>`;
}

function rewriteHtml(html: string) {
  return html
    .replace(/<script async src="https:\/\/www\.googletagmanager\.com\/[^>]+><\/script>/g, "")
    .replace(/<script src="\/analytics\.js"><\/script>/g, "")
    .replaceAll('href="/favicon.png"', `href="${LOCAL_BASE}/favicon.png"`)
    .replace(/(src|href)="\/assets\/([^"]+)"/g, `$1="${LOCAL_BASE}/assets/$2"`)
    .replace("<head>", `<head>${embedRuntime()}`);
}

function rewriteCss(css: string) {
  return css.replaceAll("url(/", `url(${LOCAL_BASE}/__upstream/`);
}

function rewriteJavascript(script: string) {
  return script
    .replaceAll('"/logos/', `"${LOCAL_BASE}/__upstream/logos/`)
    .replaceAll('"/promo/', `"${LOCAL_BASE}/__upstream/promo/`)
    .replaceAll("'/logos/", `'${LOCAL_BASE}/__upstream/logos/`)
    .replaceAll("'/promo/", `'${LOCAL_BASE}/__upstream/promo/`);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  if (!validPath(path)) return new Response("Not found", { status: 404 });

  const targetPath = upstreamPath(path);
  if (targetPath === "/") return new Response("Not found", { status: 404 });

  const upstreamUrl = new URL(targetPath, UPSTREAM_ORIGIN);
  upstreamUrl.search = request.nextUrl.search;
  const upstream = await fetch(upstreamUrl, {
    cache: "no-store",
    redirect: "manual",
    headers: {
      Accept: request.headers.get("accept") || "*/*",
      "Accept-Language": request.headers.get("accept-language") || "zh-CN,zh;q=0.9,en;q=0.7",
      "User-Agent": "welinkBTC Multi-Exchange Arbitrage Embed/1.0"
    }
  });

  if (!upstream.ok) {
    return new Response("Arbitrage assistant resource unavailable", {
      status: upstream.status,
      headers: responseHeaders("text/plain; charset=utf-8", false)
    });
  }

  const contentType = upstream.headers.get("content-type");
  const cacheable = targetPath.startsWith("/fonts/")
    || targetPath.startsWith("/logos/")
    || targetPath.startsWith("/promo/")
    || targetPath === "/favicon.png"
    || targetPath === "/og-image.png";

  if (contentType?.includes("text/html")) {
    return new Response(rewriteHtml(await upstream.text()), {
      headers: responseHeaders(contentType, false)
    });
  }

  if (contentType?.includes("text/css")) {
    return new Response(rewriteCss(await upstream.text()), {
      headers: responseHeaders(contentType, cacheable)
    });
  }

  if (contentType?.includes("javascript")) {
    return new Response(rewriteJavascript(await upstream.text()), {
      headers: responseHeaders(contentType, cacheable)
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders(contentType, cacheable)
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
