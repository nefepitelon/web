const CRYPTO_BUBBLES_URL = "https://cryptobubbles.net/backend/data/bubbles1000.usd.json";

function serializeCoin(coin) {
  return {
    id: coin.id,
    name: coin.name,
    symbol: coin.symbol,
    rank: coin.rank,
    price: coin.exchangePrices?.binance ?? coin.price,
    marketCap: coin.marketcap,
    volume: coin.volume,
    change24h: coin.performance.day,
    binanceSymbol: coin.symbols.binance,
    image: `https://cryptobubbles.net/backend/${coin.image}`
  };
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const upstreamResponse = await fetch(CRYPTO_BUBBLES_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });

    if (!upstreamResponse.ok) {
      throw new Error(`Crypto Bubbles responded with ${upstreamResponse.status}`);
    }

    const coins = await upstreamResponse.json();
    if (!Array.isArray(coins)) throw new Error("Crypto Bubbles returned an invalid payload");
    const binanceCoins = coins.filter((coin) => (
      coin?.symbols?.binance
      && Number.isFinite(Number(coin?.performance?.day))
      && Number.isFinite(Number(coin?.volume))
    ));

    const gainers = binanceCoins
      .filter((coin) => Number(coin.performance.day) > 0)
      .sort((left, right) => Number(right.performance.day) - Number(left.performance.day))
      .slice(0, 10)
      .map(serializeCoin);

    const losers = binanceCoins
      .filter((coin) => Number(coin.performance.day) < 0)
      .sort((left, right) => Number(left.performance.day) - Number(right.performance.day))
      .slice(0, 10)
      .map(serializeCoin);

    response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=90");
    response.status(200).json({
      exchange: "binance",
      period: "day",
      source: "Crypto Bubbles",
      sourceUpdatedAt: upstreamResponse.headers.get("last-modified"),
      fetchedAt: new Date().toISOString(),
      eligibleCoins: binanceCoins.length,
      gainers,
      losers
    });
  } catch (error) {
    response.status(502).json({
      error: "Crypto Bubbles data is temporarily unavailable",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
