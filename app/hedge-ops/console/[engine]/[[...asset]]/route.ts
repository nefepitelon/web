import fs from "node:fs/promises";
import path from "node:path";
import { hedgeErrorResponse, HedgeOpsError, requireHedgeOperator } from "@/lib/hedge-ops/access";
import { integrateHedgeConsole } from "@/lib/hedge-ops/console";
import { parseHedgeEngine } from "@/lib/hedge-ops/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ engine: string; asset?: string[] }> }) {
  try {
    await requireHedgeOperator();
    const params = await context.params;
    const engine = parseHedgeEngine(params.engine);
    const asset = (params.asset || []).join("/");
    const files: Record<string, [string, string]> = {
      "": ["index.html", "text/html; charset=utf-8"],
      "static/styles.css": ["styles.css", "text/css; charset=utf-8"],
      "static/app.js": ["app.js", "text/javascript; charset=utf-8"],
    };
    if (!Object.hasOwn(files, asset)) throw new HedgeOpsError("资源不存在", 404);
    const [filename, mime] = files[asset];
    // Only allowlisted frontend assets belong in the console response or trace.
    let content = !["lighter", "entropy", "binance"].includes(engine)
      ? await fs.readFile(path.join(process.cwd(), "hedge-ops/paired_hedge/web", engine, filename), "utf8")
      : engine === "binance"
      ? filename === "index.html"
        ? await fs.readFile(path.join(process.cwd(), "hedge-ops/binance_lighter/web/index.html"), "utf8")
        : filename === "app.js"
          ? await fs.readFile(path.join(process.cwd(), "hedge-ops/binance_lighter/web/app.js"), "utf8")
          : await fs.readFile(path.join(process.cwd(), "hedge-ops/binance_lighter/web/styles.css"), "utf8")
      : engine === "lighter"
      ? filename === "index.html"
        ? await fs.readFile(path.join(process.cwd(), "hedge-ops/engines/lighter/src/parallax_hedge/web/index.html"), "utf8")
        : filename === "app.js"
          ? await fs.readFile(path.join(process.cwd(), "hedge-ops/engines/lighter/src/parallax_hedge/web/app.js"), "utf8")
          : await fs.readFile(path.join(process.cwd(), "hedge-ops/engines/lighter/src/parallax_hedge/web/styles.css"), "utf8")
      : filename === "index.html"
        ? await fs.readFile(path.join(process.cwd(), "hedge-ops/engines/entropy/src/parallax_hedge/web/index.html"), "utf8")
        : filename === "app.js"
          ? await fs.readFile(path.join(process.cwd(), "hedge-ops/engines/entropy/src/parallax_hedge/web/app.js"), "utf8")
          : await fs.readFile(path.join(process.cwd(), "hedge-ops/engines/entropy/src/parallax_hedge/web/styles.css"), "utf8");
    if (filename === "index.html") content = integrateHedgeConsole(content, engine);
    if (filename === "app.js") content = content
      .replaceAll("把 .env 里的 <b>DRY_RUN 改成 false</b> 并重启", "在平台「连接设置」中关闭演练模式，保存后重新启动引擎")
      .replaceAll("把 .env 里的 DRY_RUN 改成 false 再重启", "在平台「连接设置」中关闭演练模式，保存后重新启动引擎")
      .replaceAll("在 .env 里填上", "在平台「连接设置」里填上")
      .replaceAll("不管 .env 里写没写，这里是准的", "来自当前账户引擎的实际配置");
    return new Response(content, { headers: {
      "Content-Type": mime, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "frame-ancestors 'self'",
    } });
  } catch (error) { return hedgeErrorResponse(error); }
}
