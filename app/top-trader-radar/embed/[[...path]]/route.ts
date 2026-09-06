import type { NextRequest } from "next/server";

const UPSTREAM_ORIGIN = "https://traderadar.qianyuwing.com";
const LOCAL_BASE = "/top-trader-radar/embed";
const THEME_COOKIE = "welinkbtc_top_trader_theme";
const NON_PAGE_PREFIXES = new Set(["api", "assets", "ws"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ path?: string[] }> };
type EmbedTheme = "dark" | "light";

function validPath(path: string[]) {
  return path.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment));
}

function isExtensionlessPagePath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length || NON_PAGE_PREFIXES.has(segments[0])) return false;
  return !segments[segments.length - 1].includes(".");
}

function toUpstreamPath(path: string[]) {
  if (!path.length) return "/";
  const pathname = `/${path.join("/")}`;
  return isExtensionlessPagePath(pathname) ? `${pathname}.html` : pathname;
}

function toCleanLocalPath(pathname: string) {
  return pathname.endsWith(".html") ? pathname.slice(0, -5) : pathname;
}

function toLocalProxyUrl(url: URL) {
  return `${LOCAL_BASE}${toCleanLocalPath(url.pathname)}${url.search}${url.hash}`;
}

function toLocalHtmlTarget(target: string) {
  const suffixIndex = target.search(/[?#]/);
  const pathname = suffixIndex === -1 ? target : target.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : target.slice(suffixIndex);
  return `${LOCAL_BASE}${toCleanLocalPath(pathname)}${suffix}`;
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
    "X-Content-Type-Options": "nosniff",
  };
}

function embedRuntime(theme: EmbedTheme) {
  return `<base href="${LOCAL_BASE}/"><script>(()=>{const localBase='${LOCAL_BASE}',upstream='${UPSTREAM_ORIGIN}',nonPages=new Set(['api','assets','ws']),nativeFetch=window.fetch.bind(window),NativeWebSocket=window.WebSocket,cleanPath=pathname=>pathname.endsWith('.html')?pathname.slice(0,-5):pathname,upstreamPath=pathname=>{const parts=pathname.split('/').filter(Boolean);if(!parts.length)return'/';return!nonPages.has(parts[0])&&!parts[parts.length-1].includes('.')?pathname+'.html':pathname},localPath=url=>localBase+cleanPath(url.pathname)+url.search+url.hash,createStorage=entries=>{const values=new Map(entries);return{getItem:key=>values.has(String(key))?values.get(String(key)):null,setItem:(key,value)=>{const normalizedKey=String(key),normalizedValue=String(value);values.set(normalizedKey,normalizedValue);if(normalizedKey==='TR_theme'&&(normalizedValue==='dark'||normalizedValue==='light'))parent.postMessage({type:'welinkbtc:top-trader-theme',theme:normalizedValue},'*')},removeItem:key=>values.delete(String(key)),clear:()=>values.clear(),key:index=>Array.from(values.keys())[index]??null,get length(){return values.size}}};const localMemory=createStorage([['TR_theme','${theme}']]),sessionMemory=createStorage([]),embeddedPath=window.location.pathname.startsWith(localBase)?window.location.pathname.slice(localBase.length)||'/':window.location.pathname;window.__welinkTraderRadarLocalStorage=localMemory;window.__welinkTraderRadarSessionStorage=sessionMemory;window.__welinkTraderRadarPathname=upstreamPath(embeddedPath);function proxyUrl(input){const raw=typeof input==='string'?input:input instanceof URL?input.href:input&&typeof input.url==='string'?input.url:'';if(!raw)return raw;const url=new URL(raw,window.location.href);if(url.origin===upstream)return localPath(url);if(url.origin===window.location.origin){if(url.pathname===localBase||url.pathname.startsWith(localBase+'/')){const remote=new URL(url.pathname.slice(localBase.length)||'/',upstream);remote.search=url.search;remote.hash=url.hash;return localPath(remote)}return localPath(url)}return raw}window.fetch=(input,init)=>{const next=proxyUrl(input);if(next===input||!next)return nativeFetch(input,init);const options={...init,credentials:'omit',mode:'cors'};if(typeof input==='string'||input instanceof URL)return nativeFetch(next,options);return nativeFetch(new Request(next,input),options)};if(NativeWebSocket){window.WebSocket=class extends NativeWebSocket{constructor(url,protocols){const parsed=new URL(String(url),window.location.href);const next=(parsed.hostname===window.location.hostname&&parsed.pathname.startsWith('/ws/'))?'wss://traderadar.qianyuwing.com'+parsed.pathname+parsed.search:String(url);super(next,protocols)}}}function localize(el){for(const attr of ['href','src','action']){const value=el.getAttribute?.(attr);if(!value||!value.startsWith('/')||value.startsWith('//'))continue;const candidate=value===localBase||value.startsWith(localBase+'/')?value.slice(localBase.length)||'/':value,url=new URL(candidate,upstream);if((url.pathname.startsWith('/login')||url.pathname.startsWith('/register'))&&attr==='href'){el.setAttribute(attr,upstream+url.pathname+url.search+url.hash);el.setAttribute('target','_blank');el.setAttribute('rel','noopener noreferrer')}else el.setAttribute(attr,localPath(url))}}new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType!==1)return;localize(node);node.querySelectorAll?.('[href],[src],[action]').forEach(localize)}))).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('click',event=>{const link=event.target.closest?.('a[href]');if(link)localize(link)},true)})();</script>`;
}

function rewriteJavascript(script: string) {
  return script
    .replaceAll("window.location.pathname", "window.__welinkTraderRadarPathname")
    .replaceAll("location.pathname", "window.__welinkTraderRadarPathname")
    .replaceAll("localStorage", "window.__welinkTraderRadarLocalStorage")
    .replaceAll("sessionStorage", "window.__welinkTraderRadarSessionStorage")
    .replace(
      "headers: { 'content-type': 'application/json', ...(opts.headers || {}) },",
      "headers: { ...(String(opts.method || 'GET').toUpperCase() === 'GET' && opts.body === undefined ? {} : { 'content-type': 'application/json' }), ...(opts.headers || {}) },"
    );
}

function rewriteHtml(html: string, theme: EmbedTheme) {
  const rewritten = rewriteJavascript(html)
    .replace(/<script[^>]+static\.cloudflareinsights\.com[\s\S]*?<\/script>/gi, "")
    .replace(/(src|href|action)="(\/(?!\/)[^"]*)"/g, (_match, attribute, target) => {
      return `${attribute}="${toLocalHtmlTarget(target)}"`;
    });
  return rewritten.includes("<head>")
    ? rewritten.replace("<head>", `<head>${embedRuntime(theme)}`)
    : `${embedRuntime(theme)}${rewritten}`;
}

function rewriteCss(css: string) {
  return css.replace(/url\((['"]?)\/(?!\/)/g, `url($1${LOCAL_BASE}/`);
}

async function fetchUpstream(upstreamUrl: URL, request: NextRequest) {
  let lastResponse: Response | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      lastResponse = await fetch(upstreamUrl, {
        cache: "no-store",
        redirect: "manual",
        headers: {
          Accept: request.headers.get("accept") || "*/*",
          "Accept-Language": request.headers.get("accept-language") || "zh-CN,zh;q=0.9,en;q=0.7",
          "User-Agent": "welinkBTC TopTrader Radar Embed/1.0",
        },
      });
      if (lastResponse.status < 500 || attempt === 2) return lastResponse;
      await lastResponse.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("TopTrader upstream unavailable");
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  if (!validPath(path)) return new Response("Not found", { status: 404 });

  const upstreamUrl = new URL(toUpstreamPath(path), UPSTREAM_ORIGIN);
  upstreamUrl.search = request.nextUrl.search;
  let upstream: Response;
  try {
    upstream = await fetchUpstream(upstreamUrl, request);
  } catch {
    return new Response("TopTrader radar resource unavailable", {
      status: 502,
      headers: responseHeaders("text/plain; charset=utf-8", false),
    });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("location");
    const redirectUrl = location ? new URL(location, upstreamUrl) : null;
    const redirectLocation = redirectUrl?.origin === UPSTREAM_ORIGIN
      ? toLocalProxyUrl(redirectUrl)
      : redirectUrl?.toString();
    return new Response(null, {
      status: upstream.status,
      headers: redirectLocation ? { Location: redirectLocation } : undefined,
    });
  }

  const contentType = upstream.headers.get("content-type");
  const cacheable = upstreamUrl.pathname.startsWith("/assets/");
  const savedTheme = request.cookies.get(THEME_COOKIE)?.value;
  const theme: EmbedTheme = savedTheme === "light" ? "light" : "dark";

  if (contentType?.includes("text/html")) {
    return new Response(rewriteHtml(await upstream.text(), theme), {
      status: upstream.status,
      headers: responseHeaders(contentType, false),
    });
  }

  if (contentType?.includes("text/css")) {
    return new Response(rewriteCss(await upstream.text()), {
      status: upstream.status,
      headers: responseHeaders(contentType, cacheable),
    });
  }

  if (contentType?.includes("javascript")) {
    return new Response(rewriteJavascript(await upstream.text()), {
      status: upstream.status,
      headers: responseHeaders(contentType, cacheable),
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders(contentType, cacheable),
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
