import { authorizeLegacyAiRequest, consumeLegacyAiBudget, LegacyAiSecurityError, prepareResearchConversation, protectedLegacyAiRoutes, readLegacyAiBody, researchConversationResponse } from "@/lib/legacy-ai-security";
import { applyAuthResponseHeaders } from "@/lib/supabase/response";

type LegacyRequest = {
  method: string;
  query: Record<string, string | string[]>;
  body: unknown;
  headers: Record<string, string>;
};

type LegacyResponse = {
  statusCode: number;
  setHeader(name: string, value: string | number | readonly string[]): LegacyResponse;
  status(code: number): LegacyResponse;
  json(value: unknown): LegacyResponse;
  send(value: unknown): LegacyResponse;
  end(value?: unknown): LegacyResponse;
};

type LegacyHandler = (request: LegacyRequest, response: LegacyResponse) => unknown | Promise<unknown>;
type HandlerModule = { default?: LegacyHandler } | LegacyHandler;

const loaders: Record<string, () => Promise<HandlerModule>> = {
  "address-balance-flow": () => import("@/api/address-balance-flow.js"),
  "address-balance-history": () => import("@/api/address-balance-history.js"),
  "aicoin-pulse-collector": () => import("@/api/aicoin-pulse-collector.js"),
  "ai-ops-adapt": () => import("@/lib/legacy-handlers/ai-ops-adapt.js"),
  "ai-ops-config": () => import("@/api/ai-ops-config.js"),
  "ai-ops-generate": () => import("@/lib/legacy-handlers/ai-ops-generate.js"),
  "ai-ops-image": () => import("@/lib/legacy-handlers/ai-ops-image.js"),
  "ai-ops-library": () => import("@/lib/legacy-handlers/ai-ops-library.js"),
  "ai-ops-polish": () => import("@/lib/legacy-handlers/ai-ops-polish.js"),
  "ai-ops-publish": () => import("@/lib/legacy-handlers/ai-ops-publish.js"),
  "alpha-scan": () => import("@/api/alpha-scan.js"),
  "binance-alpha-lists": () => import("@/api/binance-alpha-lists.js"),
  "alphaops-feed": () => import("@/api/alphaops-feed.js"),
  coinglass: () => import("@/api/coinglass.js"),
  "cost-basis": () => import("@/api/cost-basis.js"),
  "cycle-seasons": () => import("@/api/cycle-seasons.js"),
  "cycle-timing": () => import("@/api/cycle-timing.js"),
  cryptobubbles: () => import("@/api/cryptobubbles.js"),
  cryptoquant: () => import("@/api/cryptoquant.js"),
  "lth-market-cap-loss": () => import("@/api/lth-market-cap-loss.js"),
  "lth-realized-profit-loss": () => import("@/api/lth-realized-profit-loss.js"),
  "lth-realized-price": () => import("@/api/lth-realized-price.js"),
  "lth-exchange-loss": () => import("@/api/lth-exchange-loss.js"),
  "lth-spent-price": () => import("@/api/lth-spent-price.js"),
  "lth-sth-ratio": () => import("@/api/lth-sth-ratio.js"),
  "market-metrics": () => import("@/api/market-metrics.js"),
  "market-heatmap": () => import("@/api/market-heatmap.js"),
  "asset-daily-report": () => import("@/lib/legacy-handlers/asset-daily-report.js"),
  "median-realized-price": () => import("@/api/median-realized-price.js"),
  "mvrv-bands": () => import("@/api/mvrv-bands.js"),
  "vdd-multiple": () => import("@/api/vdd-multiple.js"),
  "lth-nupl": () => import("@/api/lth-nupl.js"),
  "onchain-overview": () => import("@/api/onchain-overview.js"),
  "percent-supply-profit": () => import("@/api/percent-supply-profit.js"),
  "percent-supply-profit-ex-10y": () => import("@/api/percent-supply-profit-ex-10y.js"),
  "realized-profit-loss": () => import("@/api/realized-profit-loss.js"),
  "rplr-m": () => import("@/api/rplr-m.js"),
  "realized-cap-hodl-waves": () => import("@/api/realized-cap-hodl-waves.js"),
  "rhodl-ratio": () => import("@/api/rhodl-ratio.js"),
  "slrv-ratio": () => import("@/api/slrv-ratio.js"),
  "supply-profit-loss-ratio": () => import("@/api/supply-profit-loss-ratio.js"),
  "stock-to-flow": () => import("@/api/stock-to-flow.js"),
  "sth-200dma": () => import("@/api/sth-200dma.js"),
  "sth-mvrv": () => import("@/api/sth-mvrv.js"),
  "stablecoin-supply-ratio": () => import("@/api/stablecoin-supply-ratio.js"),
  "sth-cost-basis-bands": () => import("@/api/sth-cost-basis-bands.js"),
  "two-week-rsi": () => import("@/api/two-week-rsi.js"),
  "under-3m-realized-cap-hodl-waves": () => import("@/api/under-3m-realized-cap-hodl-waves.js"),
  "under-3m-realized-cap-cycle": () => import("@/api/under-3m-realized-cap-cycle.js"),
  "utxo-age-realized-price-cycle": () => import("@/api/utxo-age-realized-price-cycle.js"),
  "sth-realized-profit-loss-momentum": () => import("@/api/sth-realized-profit-loss-momentum.js"),
  "mvrv-zscore-cycle": () => import("@/api/mvrv-zscore-cycle.js"),
  "vdd-median-cycle": () => import("@/api/vdd-median-cycle.js"),
  "risk-engine": () => import("@/api/risk-engine.js"),
  "surf-pulse": () => import("@/api/surf-pulse.js"),
  "surf-research": () => import("@/lib/legacy-handlers/surf-research.js"),
  "telegram-signal-collector": () => import("@/api/telegram-signal-collector.js")
};

export const maxDuration = 300;

function queryFrom(url: URL) {
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length > 1 ? values : values[0] ?? "";
  }
  return query;
}

async function bodyFrom(request: Request) {
  if (["GET", "HEAD"].includes(request.method)) return undefined;
  const text = await request.text();
  if (!text) return undefined;
  if (request.headers.get("content-type")?.includes("application/json")) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

function unwrapHandler(module: HandlerModule) {
  if (typeof module === "function") return module;
  if (typeof module.default === "function") return module.default;
  throw new Error("Legacy API module does not export a handler");
}

async function handle(request: Request, legacy: string) {
  const load = loaders[legacy];
  if (!load) return Response.json({ error: "Not found" }, { status: 404 });
  const protectedAi = protectedLegacyAiRoutes.has(legacy);
  if (protectedAi && request.method === "OPTIONS") {
    return applyAuthResponseHeaders(new Response(null, { status: 204, headers: { Allow: legacy === "asset-daily-report" ? "GET, POST, OPTIONS" : "POST, OPTIONS" } }));
  }
  let requestBody: unknown;
  let aiViewer: Awaited<ReturnType<typeof authorizeLegacyAiRequest>> = null;
  try {
    aiViewer = await authorizeLegacyAiRequest(request, legacy);
    requestBody = aiViewer ? await readLegacyAiBody(request) : await bodyFrom(request);
    if (aiViewer && legacy === "surf-research") requestBody = prepareResearchConversation(requestBody, aiViewer.id);
    if (aiViewer) await consumeLegacyAiBudget(request, legacy, aiViewer);
  } catch (error) {
    return applyAuthResponseHeaders(Response.json({ ok: false, error: error instanceof LegacyAiSecurityError ? error.message : "安全验证服务暂不可用。" }, {
      status: error instanceof LegacyAiSecurityError ? error.status : 503,
      headers: error instanceof LegacyAiSecurityError && error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined
    }));
  }
  const url = new URL(request.url);
  const headers = new Headers();
  let statusCode = 200;
  let responseBody: BodyInit | null = null;

  const legacyResponse: LegacyResponse = {
    statusCode,
    setHeader(name, value) {
      const values = Array.isArray(value) ? value : [String(value)];
      headers.delete(name);
      for (const item of values) headers.append(name, String(item));
      return this;
    },
    status(code) {
      statusCode = code;
      this.statusCode = code;
      return this;
    },
    json(value) {
      headers.set("Content-Type", "application/json; charset=utf-8");
      responseBody = JSON.stringify(aiViewer && legacy === "surf-research" ? researchConversationResponse(value, requestBody, aiViewer.id) : value);
      return this;
    },
    send(value) {
      if (typeof value === "string" || value instanceof Uint8Array) {
        responseBody = value as BodyInit;
      } else {
        headers.set("Content-Type", "application/json; charset=utf-8");
        responseBody = JSON.stringify(value);
      }
      return this;
    },
    end(value) {
      if (value !== undefined) responseBody = typeof value === "string" ? value : JSON.stringify(value);
      return this;
    }
  };

  const legacyRequest: LegacyRequest = {
    method: request.method,
    query: queryFrom(url),
    body: requestBody,
    headers: Object.fromEntries(request.headers.entries())
  };

  try {
    const handler = unwrapHandler(await load());
    await handler(legacyRequest, legacyResponse);
    if (protectedAi && request.method === "POST") {
      headers.delete("Access-Control-Allow-Origin");
      headers.delete("Access-Control-Allow-Credentials");
      return applyAuthResponseHeaders(new Response(responseBody, { status: statusCode, headers }));
    }
    return new Response(responseBody, { status: statusCode, headers });
  } catch (caught) {
    console.error(`Legacy API ${legacy} failed`, caught);
    return Response.json({ error: "Legacy API request failed" }, { status: 500 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ legacy: string }> }) {
  return handle(request, (await context.params).legacy);
}
export async function POST(request: Request, context: { params: Promise<{ legacy: string }> }) {
  return handle(request, (await context.params).legacy);
}
export async function PUT(request: Request, context: { params: Promise<{ legacy: string }> }) {
  return handle(request, (await context.params).legacy);
}
export async function PATCH(request: Request, context: { params: Promise<{ legacy: string }> }) {
  return handle(request, (await context.params).legacy);
}
export async function DELETE(request: Request, context: { params: Promise<{ legacy: string }> }) {
  return handle(request, (await context.params).legacy);
}
export async function OPTIONS(request: Request, context: { params: Promise<{ legacy: string }> }) {
  return handle(request, (await context.params).legacy);
}
