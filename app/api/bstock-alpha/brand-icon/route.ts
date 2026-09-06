import { NextRequest } from "next/server";
import {
  BSTOCK_BRAND_ICON_SYMBOLS,
  bstockBrandFallbackSvg,
  bstockBrandIconSources
} from "@/lib/bstock-branding";

export const runtime = "nodejs";

const MAX_BRAND_ICON_BYTES = 256 * 1024;
const allowedSymbols: ReadonlySet<string> = new Set<string>(BSTOCK_BRAND_ICON_SYMBOLS);
const cacheHeaders = {
  "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff"
};

async function fetchPublicBrandIcon(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8",
        "User-Agent": "WELINKBTC-bStockAlpha/1.0"
      },
      signal: AbortSignal.timeout(7_000)
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || "";
    if (!contentType.startsWith("image/") || contentType === "image/svg+xml") return null;
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_BRAND_ICON_BYTES) return null;
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_BRAND_ICON_BYTES) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") || "").trim().toUpperCase();
  if (!allowedSymbols.has(symbol)) {
    return Response.json({ error: "Unsupported bStock symbol." }, {
      status: 404,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
    });
  }

  for (const source of bstockBrandIconSources(symbol)) {
    const icon = await fetchPublicBrandIcon(source);
    if (!icon) continue;
    return new Response(icon.bytes, {
      headers: {
        ...cacheHeaders,
        "Content-Type": icon.contentType,
        "Content-Length": String(icon.bytes.byteLength)
      }
    });
  }

  return new Response(bstockBrandFallbackSvg(symbol), {
    headers: {
      ...cacheHeaders,
      "Content-Type": "image/svg+xml; charset=utf-8"
    }
  });
}
