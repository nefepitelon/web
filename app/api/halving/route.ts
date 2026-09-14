import { getHalvingPayload } from "@/api/halving.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET() {
  const payload = await getHalvingPayload();
  return Response.json(payload ?? {
    schema: 1,
    error: "HALVING_UNAVAILABLE",
    message: "Bitcoin chain-tip providers are temporarily unavailable. Please retry."
  }, {
    status: payload ? 200 : 503,
    // Freshness is managed in the service. Never let a CDN preserve stale:false
    // or cache an outage beyond the short retry window.
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(payload ? {} : { "Retry-After": "15" })
    }
  });
}
