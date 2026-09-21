const BINANCE_ALPHA_RANK_URL = "https://web3.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/pulse/unified/rank/list/ai";
const BINANCE_SPOT_EXCHANGE_URL = "https://data-api.binance.vision/api/v3/exchangeInfo";
const BINANCE_FUTURES_EXCHANGE_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";
const BINANCE_FUTURES_TICKERS_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr";
const BINANCE_FUTURES_PREMIUM_URL = "https://fapi.binance.com/fapi/v1/premiumIndex";
const BINANCE_FUTURES_OI_URL = "https://fapi.binance.com/fapi/v1/openInterest";
const ALPHA_CHAIN_IDS = ["56", "8453", "CT_501", "1"];
const CHAIN_NAMES = { "1": "Ethereum", "56": "BSC", "8453": "Base", CT_501: "Solana" };
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_ALPHA_PAGE_SIZE = 200;
const MAX_ALPHA_PAGES = 5;
const OI_CONCURRENCY = 12;

let cacheState = { value: null, expiresAt: 0, pending: null };

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedSymbol(value) {
  return String(value || "").trim().replace(/^\$/, "").toUpperCase();
}

async function fetchJson(url, options = {}, timeoutMs = 10_000, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          "User-Agent": "binance-web3/3.0 (WelinkBTC Alpha Radar)",
          ...(options.headers || {})
        },
        signal: AbortSignal.timeout(timeoutMs + attempt * 5000)
      });
      if (!response.ok) throw new Error(`${new URL(url).hostname} responded with ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

function alphaRankBody(chainId, page) {
  return {
    rankType: 20,
    chainId,
    period: 50,
    sortBy: 40,
    orderAsc: true,
    page,
    size: MAX_ALPHA_PAGE_SIZE,
    countMin: 10,
    launchTimeMin: 15,
    liquidityMin: 5000,
    uniqueTraderMin: 10,
    volumeMin: 10000
  };
}

async function fetchAlphaPage(chainId, page) {
  const payload = await fetchJson(BINANCE_ALPHA_RANK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alphaRankBody(chainId, page))
  }, 12_000);
  if (payload?.code && payload.code !== "000000") throw new Error(`Binance Alpha ${chainId} returned ${payload.code}`);
  return payload?.data || { tokens: [], total: 0 };
}

async function fetchAlphaUniverse() {
  const firstPages = await Promise.all(ALPHA_CHAIN_IDS.map(async (chainId) => ({ chainId, data: await fetchAlphaPage(chainId, 1) })));
  const followups = [];
  firstPages.forEach(({ chainId, data }) => {
    const pages = Math.min(MAX_ALPHA_PAGES, Math.ceil(numeric(data.total) / MAX_ALPHA_PAGE_SIZE));
    for (let page = 2; page <= pages; page += 1) followups.push(fetchAlphaPage(chainId, page));
  });
  const remaining = await Promise.all(followups);
  return [...firstPages.map(({ data }) => data), ...remaining].flatMap((data) => Array.isArray(data.tokens) ? data.tokens : []);
}

export function selectAlphaPerpetualUniverse({ alphaTokens, spotExchange, futuresExchange, futuresTickers, premiumIndexes }) {
  const spotBases = new Set((spotExchange?.symbols || [])
    .filter((symbol) => symbol.status === "TRADING" && symbol.isSpotTradingAllowed !== false)
    .map((symbol) => normalizedSymbol(symbol.baseAsset))
    .filter(Boolean));
  const futuresByBase = new Map();
  (futuresExchange?.symbols || []).forEach((symbol) => {
    const base = normalizedSymbol(symbol.baseAsset);
    if (!base || symbol.status !== "TRADING" || symbol.contractType !== "PERPETUAL" || !["USDT", "USDC"].includes(symbol.quoteAsset)) return;
    const current = futuresByBase.get(base);
    if (!current || symbol.quoteAsset === "USDT") futuresByBase.set(base, symbol);
  });
  const tickersBySymbol = new Map((futuresTickers || []).map((ticker) => [ticker.symbol, ticker]));
  const premiumBySymbol = new Map((premiumIndexes || []).map((premium) => [premium.symbol, premium]));
  const eligibleBySymbol = new Map();

  (alphaTokens || []).forEach((token) => {
    const symbol = normalizedSymbol(token.symbol);
    const future = futuresByBase.get(symbol);
    const marketCap = numeric(token.marketCap);
    if (!symbol || spotBases.has(symbol) || !future || marketCap <= 0) return;
    const current = eligibleBySymbol.get(symbol);
    if (current && numeric(current.marketCap) <= marketCap) return;
    const ticker = tickersBySymbol.get(future.symbol) || {};
    const premium = premiumBySymbol.get(future.symbol) || {};
    const icon = String(token.icon || "");
    eligibleBySymbol.set(symbol, {
      symbol,
      name: symbol,
      chainId: String(token.chainId || ""),
      chainName: CHAIN_NAMES[String(token.chainId || "")] || String(token.chainId || ""),
      contractAddress: String(token.contractAddress || ""),
      icon: icon && !/^https?:/i.test(icon) ? `https://bin.bnbstatic.com${icon}` : icon,
      marketCap,
      alphaPrice: numeric(token.price),
      alphaChange24h: numeric(token.percentChange24h),
      alphaDescriptionZh: String(token.alphaInfo?.cnDescription || ""),
      alphaDescriptionEn: String(token.alphaInfo?.enDescription || ""),
      futureSymbol: future.symbol,
      quoteAsset: future.quoteAsset,
      price: numeric(premium.markPrice ?? ticker.lastPrice ?? token.price),
      change24h: numeric(ticker.priceChangePercent ?? token.percentChange24h),
      quoteVolume24h: numeric(ticker.quoteVolume),
      funding: premium.lastFundingRate == null ? null : numeric(premium.lastFundingRate) * 100,
      openInterestUnits: null,
      openInterestUsd: null
    });
  });

  return [...eligibleBySymbol.values()];
}

async function hydrateOpenInterest(rows) {
  let cursor = 0;
  const hydrated = new Array(rows.length);
  const workers = Array.from({ length: Math.min(OI_CONCURRENCY, Math.max(1, rows.length)) }, async () => {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      const row = rows[index];
      try {
        const payload = await fetchJson(`${BINANCE_FUTURES_OI_URL}?symbol=${encodeURIComponent(row.futureSymbol)}`, {}, 7000);
        const units = numeric(payload?.openInterest, Number.NaN);
        hydrated[index] = {
          ...row,
          openInterestUnits: Number.isFinite(units) ? units : null,
          openInterestUsd: Number.isFinite(units) && row.price > 0 ? units * row.price : null
        };
      } catch {
        hydrated[index] = row;
      }
    }
  });
  await Promise.all(workers);
  return hydrated;
}

export function rankAlphaLists(rows, limit = 20) {
  const marketCapItems = [...rows]
    .sort((left, right) => left.marketCap - right.marketCap || left.symbol.localeCompare(right.symbol))
    .slice(0, limit);
  const openInterestItems = rows
    .filter((row) => Number.isFinite(row.openInterestUsd))
    .sort((left, right) => right.openInterestUsd - left.openInterestUsd || left.marketCap - right.marketCap)
    .slice(0, limit);
  return { marketCapItems, openInterestItems };
}

export async function buildBinanceAlphaLists() {
  const [alphaTokens, spotExchange, futuresExchange, futuresTickers, premiumIndexes] = await Promise.all([
    fetchAlphaUniverse(),
    fetchJson(BINANCE_SPOT_EXCHANGE_URL),
    fetchJson(BINANCE_FUTURES_EXCHANGE_URL),
    fetchJson(BINANCE_FUTURES_TICKERS_URL),
    fetchJson(BINANCE_FUTURES_PREMIUM_URL)
  ]);
  const intersection = selectAlphaPerpetualUniverse({ alphaTokens, spotExchange, futuresExchange, futuresTickers, premiumIndexes });
  const hydrated = await hydrateOpenInterest(intersection);
  const ranked = rankAlphaLists(hydrated);
  const refreshedAt = new Date();
  return {
    refreshIntervalHours: 2,
    refreshedAt: refreshedAt.toISOString(),
    nextRefreshAt: new Date(refreshedAt.getTime() + CACHE_TTL_MS).toISOString(),
    eligibility: {
      alphaUniverse: alphaTokens.length,
      intersection: intersection.length,
      rule: "Binance Alpha listed + Binance Spot not listed + Binance USDⓈ-M perpetual listed"
    },
    ...ranked,
    sources: {
      alpha: "Binance Skills Hub · Alpha Rank",
      spot: "Binance Spot exchange metadata",
      futures: "Binance USDⓈ-M Futures exchange metadata + open interest"
    }
  };
}

export async function getBinanceAlphaLists(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cacheState.value && cacheState.expiresAt > now) return cacheState.value;
  if (!forceRefresh && cacheState.pending) return cacheState.pending;
  const pending = buildBinanceAlphaLists().then((value) => {
    cacheState = { value, expiresAt: Date.now() + CACHE_TTL_MS, pending: null };
    return value;
  }).catch((error) => {
    cacheState.pending = null;
    throw error;
  });
  cacheState.pending = pending;
  return pending;
}

export default async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed" });
  const forceRefresh = Boolean(request.query?.refresh);
  try {
    const payload = await getBinanceAlphaLists(forceRefresh);
    response.setHeader("Cache-Control", forceRefresh ? "no-store" : "public, s-maxage=7200, stale-while-revalidate=300");
    response.status(200).json(payload);
  } catch (error) {
    if (cacheState.value) {
      response.setHeader("Cache-Control", "no-store");
      return response.status(200).json({
        ...cacheState.value,
        stale: true,
        warning: error instanceof Error ? error.message : String(error)
      });
    }
    response.status(502).json({
      error: "Binance Alpha lists are temporarily unavailable",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}
