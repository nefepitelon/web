import fs from "node:fs/promises";
import path from "node:path";
import { requireAlphaOperator } from "@/lib/alpha-execution/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAlphaOperator();
    const source = await fs.readFile(path.join(process.cwd(), "classic-grid", "public", "index.html"), "utf8");
    const html = source
      .replaceAll("/api/snapshot", "/api/classic-grid/snapshot")
      .replaceAll("/api/statistics-refresh", "/api/classic-grid/refresh")
      .replaceAll('paused ? "/api/pause" : "/api/resume"', '"/api/classic-grid/pause"')
      .replace('body: JSON.stringify({ reason: "dashboard-ui" })', 'body: JSON.stringify({ paused })')
      .replace("八所网格总看板 · 8088", "AIClassic 网格总看板")
      .replace("</style>", ".classic-grid-embedded > header{display:none}.classic-grid-embedded > main{padding-top:16px}</style>")
      .replace("<body>", '<body class="classic-grid-embedded">');
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      }
    });
  } catch {
    return new Response("<!doctype html><html lang=\"zh-CN\"><body style=\"background:#0d1117;color:#e6edf3;font-family:sans-serif;padding:32px\">请先登录 Max 或管理员账户后使用 AIClassic 网格。</body></html>", {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" }
    });
  }
}
