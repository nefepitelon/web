import { z } from "zod";
import { getStmTraderResearch } from "@/lib/stm-hunt/radar";
import { limitStmResearchRequest } from "@/lib/stm-hunt/radar-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;
const headers = { "Cache-Control": "private, no-store" };
const query = z.object({ venue: z.enum(["fomo", "hl", "pump", "binance", "lighter", "okx"]), reference: z.string().min(1).max(128), refresh: z.enum(["0", "1"]).default("0") }).strict();
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const input = query.safeParse(Object.fromEntries(params));
  if (!input.success || request.url.length > 1024 || [...params.keys()].some(key => params.getAll(key).length !== 1) || (input.success && ((input.data.venue === "fomo" && !/^(?:[A-Za-z0-9_]{1,64}|wsm:fomo:[A-Za-z0-9_-]{1,100})$/.test(input.data.reference)) || (["hl", "lighter"].includes(input.data.venue) && !/^0x[0-9a-fA-F]{40}$/.test(input.data.reference))))) {
    return Response.json({ error: "无效的公开账户标识" }, { status: 400, headers });
  }
  try {
    if (!await limitStmResearchRequest(request)) return Response.json({ error: "查询频率过高，请稍后重试" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    return Response.json(await getStmTraderResearch(input.data.venue, input.data.reference, input.data.refresh === "1"), { headers });
  } catch { return Response.json({ error: "来源未返回此账户的公开资料，或暂时无法连接；请稍后重试" }, { status: 502, headers }); }
}
