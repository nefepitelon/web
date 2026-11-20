import { assessStmTokenRisk } from "@/lib/stm-hunt/risk";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const risk = await assessStmTokenRisk({ chain: url.searchParams.get("chain") ?? "bsc", address: url.searchParams.get("address") ?? "" });
    return Response.json({ ok: true, risk }, { headers: { "Cache-Control": "public, max-age=15, s-maxage=30" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "风险核验暂不可用" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
