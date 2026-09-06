import { getHomeMarketPayload } from "@/api/home-market.js";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET() {
  const payload = await getHomeMarketPayload();
  return Response.json(payload, {
    status: payload.ok ? 200 : 502,
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
