import { headers } from "next/headers";
import { isIP } from "node:net";

export function assertSameOrigin(request: Request) {
  // Cookie-authenticated mutations must not accept a missing Origin as proof
  // of same-origin access. Fetch Metadata also rejects hostile sibling sites.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    throw new Error("Cross-origin request rejected");
  }
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (origin) {
    if (origin !== requestOrigin) throw new Error("Cross-origin request rejected");
    return;
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      if (new URL(referer).origin === requestOrigin) return;
    } catch { /* Reject malformed Referer below. */ }
    throw new Error("Cross-origin request rejected");
  }
  if (fetchSite !== "same-origin") throw new Error("Request origin could not be verified");
}

export function trustedRequestIp(headerStore: Pick<Headers, "get">) {
  // On Vercel these headers are set/overwritten at the trusted edge. Do not
  // accept arbitrary forwarding headers on a directly exposed Node server.
  if (!process.env.VERCEL && process.env.TRUST_PROXY_HEADERS !== "true") return null;
  const raw = (process.env.VERCEL ? headerStore.get("x-vercel-forwarded-for") : null)
    ?? headerStore.get("x-forwarded-for")
    ?? headerStore.get("x-real-ip");
  const candidate = raw?.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

export async function requestContext(request?: Request) {
  const headerStore = request ? request.headers : await headers();
  return {
    ipAddress: trustedRequestIp(headerStore),
    userAgent: headerStore.get("user-agent")?.slice(0, 512) ?? null
  };
}
