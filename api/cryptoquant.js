const ALLOWED_PATHS = new Set([
  "/v1/btc/market-indicator/mvrv",
  "/v1/btc/market-indicator/nupl",
  "/v1/btc/market-indicator/sopr",
  "/v1/btc/miner-flows/puell-multiple"
]);

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  const apiKey = process.env.CRYPTOQUANT_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: "CRYPTOQUANT_API_KEY is not configured" });
    return;
  }

  const upstreamPath = request.query.path;
  if (!upstreamPath || !ALLOWED_PATHS.has(upstreamPath)) {
    response.status(403).json({ error: "Upstream path is not allowed" });
    return;
  }

  const upstream = new URL(upstreamPath, "https://api.cryptoquant.com");
  Object.entries(request.query).forEach(([key, value]) => {
    if (key !== "path") upstream.searchParams.set(key, Array.isArray(value) ? value[0] : value);
  });

  const upstreamResponse = await fetch(upstream, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`
    }
  });

  response.status(upstreamResponse.status);
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
  response.setHeader("Content-Type", upstreamResponse.headers.get("content-type") || "application/json");
  response.send(await upstreamResponse.text());
}
