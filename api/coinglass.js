const ALLOWED_PATHS = new Set([
  "/api/futures/funding-rate/exchange-list",
  "/api/futures/open-interest/exchange-list",
  "/api/option/open-interest/exchange-list",
  "/api/futures/liquidation/history",
  "/api/bitcoin/etf/flow-history",
  "/api/futures/long-short/account-ratio"
]);

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  const apiKey = process.env.COINGLASS_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: "COINGLASS_API_KEY is not configured" });
    return;
  }

  const upstreamPath = request.query.path;
  if (!upstreamPath || !ALLOWED_PATHS.has(upstreamPath)) {
    response.status(403).json({ error: "Upstream path is not allowed" });
    return;
  }

  const upstream = new URL(upstreamPath, "https://open-api-v4.coinglass.com");
  Object.entries(request.query).forEach(([key, value]) => {
    if (key !== "path") upstream.searchParams.set(key, Array.isArray(value) ? value[0] : value);
  });

  const upstreamResponse = await fetch(upstream, {
    headers: {
      Accept: "application/json",
      "CG-API-KEY": apiKey
    }
  });

  response.status(upstreamResponse.status);
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  response.setHeader("Content-Type", upstreamResponse.headers.get("content-type") || "application/json");
  response.send(await upstreamResponse.text());
}
