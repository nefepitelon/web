const PROVIDERS = {
  cryptoquant: {
    baseUrl: "https://api.cryptoquant.com",
    keyName: "CRYPTOQUANT_API_KEY",
    allowedPaths: [
      "/v1/btc/market-indicator/mvrv",
      "/v1/btc/market-indicator/nupl",
      "/v1/btc/market-indicator/sopr",
      "/v1/btc/miner-flows/puell-multiple"
    ],
    headers: (key) => ({ Authorization: `Bearer ${key}` })
  },
  coinglass: {
    baseUrl: "https://open-api-v4.coinglass.com",
    keyName: "COINGLASS_API_KEY",
    allowedPaths: [
      "/api/futures/funding-rate/exchange-list",
      "/api/futures/open-interest/exchange-list",
      "/api/option/open-interest/exchange-list",
      "/api/futures/liquidation/history",
      "/api/bitcoin/etf/flow-history",
      "/api/futures/long-short/account-ratio"
    ],
    headers: (key) => ({ "CG-API-KEY": key })
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const [, apiPrefix, providerId] = url.pathname.split("/");
    const provider = PROVIDERS[providerId];

    if (apiPrefix !== "api" || !provider) {
      return json({ error: "Unknown provider" }, 404);
    }

    const apiKey = env[provider.keyName];
    if (!apiKey) {
      return json({ error: `${provider.keyName} is not configured` }, 500);
    }

    const upstreamPath = url.searchParams.get("path");
    if (!upstreamPath || !upstreamPath.startsWith("/")) {
      return json({ error: "Missing upstream path" }, 400);
    }

    if (!provider.allowedPaths.includes(upstreamPath)) {
      return json({ error: "Upstream path is not allowed" }, 403);
    }

    const upstream = new URL(upstreamPath, provider.baseUrl);
    url.searchParams.forEach((value, key) => {
      if (key !== "path") upstream.searchParams.set(key, value);
    });

    const upstreamResponse = await fetch(upstream.toString(), {
      headers: {
        Accept: "application/json",
        ...provider.headers(apiKey)
      }
    });

    const body = await upstreamResponse.text();
    return new Response(body, {
      status: upstreamResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json",
        "Cache-Control": "public, max-age=60"
      }
    });
  }
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
