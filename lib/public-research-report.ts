import "server-only";
import type { LookupFunction } from "node:net";
import { Agent, request, type Dispatcher } from "undici";
import { assertPublicProxyHostname, publicProxyLookup } from "@/lib/trading-proxy-security";

const MAX_REPORT_BYTES = 1024 * 1024;
type ReportTransport = (url: URL, options: {
  dispatcher: Dispatcher;
  signal: AbortSignal;
  maxRedirections: number;
  headersTimeout: number;
  bodyTimeout: number;
  headers: Record<string, string>;
}) => Promise<{
  statusCode: number;
  body: AsyncIterable<Uint8Array> & { destroy(error?: Error): unknown };
}>;

function reportUrl(value: string | URL) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("研报文件地址无效。"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") {
    throw new Error("研报文件仅允许通过标准 HTTPS 公网地址下载。");
  }
  assertPublicProxyHostname(url.hostname);
  return url;
}

// The transport is injectable for offline tests; request data cannot replace it.
// DNS checks run inside the actual connector, preventing resolve/check/rebind.
export function createPublicResearchReportDownloader({
  transport = request,
  lookup = publicProxyLookup
}: { transport?: ReportTransport; lookup?: LookupFunction } = {}) {
  return async (value: string | URL): Promise<Response> => {
    const url = reportUrl(value);
    const dispatcher = new Agent({ connect: { lookup }, maxResponseSize: MAX_REPORT_BYTES });
    let body: Awaited<ReturnType<ReportTransport>>["body"] | undefined;
    try {
      const response = await transport(url, {
        dispatcher,
        signal: AbortSignal.timeout(15_000),
        // Do not send the next request before validating a redirect destination.
        // Object-storage URLs remain supported; redirects are never followed.
        maxRedirections: 0,
        headersTimeout: 15_000,
        bodyTimeout: 15_000,
        headers: { Accept: "application/json, text/markdown, text/plain;q=0.9", "Accept-Encoding": "identity" }
      });
      body = response.body;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        return new Response(null, { status: response.statusCode });
      }
      let length = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        length += chunk.byteLength;
        if (length > MAX_REPORT_BYTES) throw new Error("研报文件超过安全大小限制。");
        chunks.push(Buffer.from(chunk));
      }
      return new Response(Buffer.concat(chunks).toString("utf8"), { status: response.statusCode });
    } catch {
      // Signed object-storage URLs and upstream diagnostics must never reach logs/UI.
      throw new Error("研报文件下载失败或超过安全限制，请稍后重试。");
    } finally {
      body?.destroy();
      await dispatcher.destroy();
    }
  };
}

export const fetchPublicResearchReport = createPublicResearchReportDownloader();
