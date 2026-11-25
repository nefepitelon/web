import { z } from "zod";
import { getStmRadarBoard } from "@/lib/stm-hunt/radar";
import { limitStmResearchRequest } from "@/lib/stm-hunt/radar-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;
const headers = { "Cache-Control": "private, no-store" };
const query = z.object({ venue: z.enum(["fomo", "hl", "pump", "binance", "lighter", "okx"]), period: z.enum(["24h", "7d", "30d", "all"]).default("all"), refresh: z.enum(["0", "1"]).default("0") }).strict();
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = query.safeParse(Object.fromEntries(params));
  if (!input.success || request.url.length > 1024 || [...params.keys()].some(key => params.getAll(key).length !== 1)) return Response.json({ error: "无效的平台或收益周期" }, { status: 400, headers });
  try {
    if (!await limitStmResearchRequest(request)) return Response.json({ error: "查询频率过高，请稍后重试" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    return Response.json(await getStmRadarBoard(input.data.venue, input.data.period, input.data.refresh === "1"), { headers });
  } catch { return Response.json({ error: "研究榜单暂时不可用，请稍后重试" }, { status: 503, headers }); }
}
