import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, noStoreHeaders } from "@/lib/bstock-agentic-wallet-auth";
import { fetchCmcLiveSnapshot, fetchOfficialBstockMarket } from "@/lib/bstock-alpha-live";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: noStoreHeaders() });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return json({ error: "公开实时数据仅允许从本站请求。" }, 403);

  const startedAt = Date.now();
  const [cmcResult, marketResult] = await Promise.allSettled([
    fetchCmcLiveSnapshot(),
    fetchOfficialBstockMarket()
  ]);
  const cmc = cmcResult.status === "fulfilled" ? cmcResult.value : null;
  const market = marketResult.status === "fulfilled" ? marketResult.value : null;
  if (cmcResult.status === "rejected") {
    console.warn("[bstock:market-snapshot] cmc_unavailable", { error: cmcResult.reason instanceof Error ? cmcResult.reason.message : String(cmcResult.reason) });
  }
  if (marketResult.status === "rejected") {
    console.warn("[bstock:market-snapshot] market_unavailable", { error: marketResult.reason instanceof Error ? marketResult.reason.message : String(marketResult.reason) });
  }
  console.info("[bstock:market-snapshot] completed", {
    durationMs: Date.now() - startedAt,
    cmcMode: cmc?.deliveryMode ?? "UNAVAILABLE",
    marketMode: market?.deliveryMode ?? "UNAVAILABLE",
    marketAssets: market?.assets.length ?? 0,
    eligibleAssets: market?.eligibleCount ?? 0
  });
  return json({
    live: Boolean(cmc || market),
    ...(cmc ? { cmc } : {}),
    ...(market ? { market } : {}),
    sources: {
      cmc: cmc ? { status: cmc.deliveryMode, source: cmc.source, fetchedAt: cmc.fetchedAt, persistedAt: cmc.persistedAt } : { status: "UNAVAILABLE" },
      market: market ? { status: market.deliveryMode, source: "Binance bStock registry + Binance Spot", fetchedAt: market.fetchedAt, persistedAt: market.persistedAt } : { status: "UNAVAILABLE" }
    }
  }, cmc || market ? 200 : 502);
}
