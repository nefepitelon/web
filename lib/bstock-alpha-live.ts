import "server-only";

import { z } from "zod";
import bstockLocalization from "@/data/bstock-localization.json";
import { bstockBrandIconPath } from "@/lib/bstock-branding";
import { decryptTradingSecret, encryptTradingSecret } from "@/lib/alpha-execution/credentials";
import {
  agentStudioRatingScore,
  extractAgentStudioReportSummary
} from "@/lib/bstock-agent-studio-report";
import {
  BSTOCK_ELIGIBILITY_SNAPSHOT,
  BSTOCK_REGISTRY_BASELINE_ASSETS,
  eligibilitySnapshotIsCurrent
} from "@/lib/bstock-eligible-snapshot";
import { loadBstockPublicData } from "@/lib/bstock-public-data-cache";
import { multiplyDecimals } from "@/lib/bstock-decimals";
import { reviewedAgentX402OptionSchema } from "@/lib/bstock-agentic-wallet-x402";

export {
  agentStudioRatingScore,
  buildAgentStudioReadableReport,
  extractAgentStudioReportSummary
} from "@/lib/bstock-agent-studio-report";
export {
  compareDecimals,
  divideDecimalsRoundUp,
  multiplyDecimals,
  resolveBstockSellRawAmount
} from "@/lib/bstock-decimals";

export const BSC_CHAIN_ID = "56";
export const BSTOCK_SYMBOL_PATTERN = /^[A-Z][A-Z0-9]{1,11}B$/;
const BSTOCK_CHINESE_NAMES: Record<string, string> = bstockLocalization.names;
export const PAY_TOKEN_ADDRESSES = {
  BNB: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  U: "0xcE24439F2D9C6a2289F741120FE202248B666666",
  USD1: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d"
} as const;

export type PayTokenSymbol = keyof typeof PAY_TOKEN_ADDRESSES;

const cmcStatusSchema = z.object({
  error_code: z.union([z.string(), z.number()]),
  error_message: z.string().nullable().optional(),
  timestamp: z.string().optional()
});

const fearGreedSchema = z.object({
  status: cmcStatusSchema,
  data: z.object({
    value: z.union([z.string(), z.number()]),
    value_classification: z.string(),
    update_time: z.string()
  })
});

const globalMetricsSchema = z.object({
  status: cmcStatusSchema,
  data: z.object({
    btc_dominance: z.number(),
    btc_dominance_24h_percentage_change: z.number().optional(),
    eth_dominance: z.number().optional(),
    last_updated: z.string(),
    quote: z.object({
      USD: z.object({
        total_market_cap: z.number(),
        total_volume_24h: z.number(),
        total_market_cap_yesterday_percentage_change: z.number().optional(),
        total_volume_24h_yesterday_percentage_change: z.number().optional(),
        last_updated: z.string().optional()
      })
    })
  })
});

const simplePriceSchema = z.object({
  status: cmcStatusSchema,
  data: z.array(z.object({ id: z.number(), price: z.number() })).min(1)
});

const bstockRegistrySchema = z.object({
  code: z.coerce.string(),
  data: z.array(z.object({
    chainId: z.string(),
    contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    symbol: z.string(),
    ticker: z.string(),
    type: z.number(),
    // Binance occasionally omits assetType for newly listed equities. Type 1 is
    // the conservative equity default; known ETFs still arrive as type 3.
    assetType: z.number().default(1),
    multiplier: z.string(),
    cs: z.string().optional()
  }))
});

type BstockRegistryEntry = z.infer<typeof bstockRegistrySchema>["data"][number];

const tickerSchema = z.object({
  symbol: z.string(),
  lastPrice: z.string(),
  priceChange: z.string(),
  priceChangePercent: z.string(),
  quoteVolume: z.string(),
  closeTime: z.number()
});

const researchIntentSchema = z.object({
  version: z.literal(2),
  kind: z.literal("research"),
  agentKey: z.string().length(64),
  provider: z.enum(["cmc", "studio"]),
  symbol: z.string().regex(BSTOCK_SYMBOL_PATTERN),
  ticker: z.string().regex(/^[A-Z][A-Z0-9.]{0,11}$/),
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  requestId: z.string().uuid(),
  paymentId: z.string().min(1).max(200),
  resourceUrl: z.string().min(1).max(2_048),
  allowedIndices: z.array(z.number().int().positive()).max(12),
  allowedOptions: z.array(reviewedAgentX402OptionSchema).max(12),
  createdAt: z.number().int().positive()
});

const tradeIntentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("trade"),
  agentKey: z.string().length(64),
  mode: z.literal("policy"),
  side: z.enum(["buy", "sell"]),
  symbol: z.string().regex(BSTOCK_SYMBOL_PATTERN),
  ticker: z.string().regex(/^[A-Z]{1,10}$/),
  fromToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  toToken: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^\d+(?:\.\d+)?$/),
  slippageRatio: z.string().regex(/^\d+(?:\.\d+)?$/),
  campaignEligibility: z.enum(["CONFIRMED", "UNVERIFIED"]),
  quoteOutput: z.string().max(100),
  quoteExpiresAt: z.number().int().positive(),
  createdAt: z.number().int().positive()
});

export type ResearchIntent = z.infer<typeof researchIntentSchema>;
export type TradeIntent = z.infer<typeof tradeIntentSchema>;

function assertCmcSuccess(status: z.infer<typeof cmcStatusSchema>) {
  if (String(status.error_code) !== "0") {
    throw new Error(status.error_message || "CoinMarketCap returned an error.");
  }
}

async function fetchJson(url: string, timeoutMs = 10_000) {
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "bStockAlpha/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}.`);
  return response.json();
}

async function fetchCmcLiveSnapshotLive() {
  const [fearRaw, globalRaw, btcRaw] = await Promise.all([
    fetchJson("https://pro-api.coinmarketcap.com/public-api/v3/fear-and-greed/latest"),
    fetchJson("https://pro-api.coinmarketcap.com/public-api/v1/global-metrics/quotes/latest?convert=USD"),
    fetchJson("https://pro-api.coinmarketcap.com/public-api/v1/simple/price?ids=1&convert=USD")
  ]);
  const fear = fearGreedSchema.parse(fearRaw);
  const global = globalMetricsSchema.parse(globalRaw);
  const btc = simplePriceSchema.parse(btcRaw);
  assertCmcSuccess(fear.status);
  assertCmcSuccess(global.status);
  assertCmcSuccess(btc.status);

  const score = Math.max(0, Math.min(100, Number(fear.data.value)));
  const marketChange = global.data.quote.USD.total_market_cap_yesterday_percentage_change ?? 0;
  const volumeChange = global.data.quote.USD.total_volume_24h_yesterday_percentage_change ?? 0;
  const regime = score >= 70 ? "RISK_ON" : score >= 45 ? "NEUTRAL" : "RISK_OFF";
  const regimeLabel = score >= 70 ? "偏多" : score >= 45 ? "中性" : "防御";
  const macroRisk = Math.round(Math.max(0, Math.min(100, 50 - marketChange * 5 - volumeChange * 0.45)));

  return {
    source: "CoinMarketCap Keyless Public API",
    sourceUrl: "https://coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api",
    fetchedAt: new Date().toISOString(),
    updatedAt: fear.data.update_time,
    score,
    classification: fear.data.value_classification,
    regime,
    regimeLabel,
    btcPrice: btc.data[0].price,
    btcDominance: global.data.btc_dominance,
    btcDominanceChange24h: global.data.btc_dominance_24h_percentage_change ?? 0,
    totalMarketCapUsd: global.data.quote.USD.total_market_cap,
    totalVolume24hUsd: global.data.quote.USD.total_volume_24h,
    marketCapChange24h: marketChange,
    volumeChange24h: volumeChange,
    macroRisk
  };
}

export async function fetchCmcLiveSnapshot() {
  return loadBstockPublicData({
    key: "bstock.public.cmc.v1",
    description: "bStockAlpha CoinMarketCap public snapshot cache",
    freshForMs: 60_000,
    staleForMs: 30 * 60_000,
    load: fetchCmcLiveSnapshotLive,
    isUsable: (value) => Number.isFinite(value.score) && Number.isFinite(value.btcPrice)
  });
}

export function deterministicBstockScore(
  cmcScore: number,
  agentStudioScore: number | null,
  liquidityScore: number | null,
  portfolioScore: number | null
) {
  if ([cmcScore, agentStudioScore, liquidityScore, portfolioScore].some((value) => value == null || !Number.isFinite(value))) {
    return null;
  }
  return {
    score: cmcScore * 0.3 + agentStudioScore! * 0.45 + liquidityScore! * 0.15 + portfolioScore! * 0.1,
    equityScore: agentStudioScore!,
    liquidityScore: liquidityScore!,
    portfolioScore: portfolioScore!,
    equitySource: "AGENT_STUDIO_PAID_REPORT" as const
  };
}

export function realLiquidityScore(volumes: Array<number | null>, selectedVolume: number | null) {
  const valid = volumes.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (selectedVolume == null || !Number.isFinite(selectedVolume) || selectedVolume <= 0 || valid.length < 2) return null;
  const logs = valid.map((value) => Math.log10(value));
  const min = Math.min(...logs);
  const max = Math.max(...logs);
  if (max === min) return 75;
  return Math.round(50 + (Math.log10(selectedVolume) - min) / (max - min) * 50);
}

export function realPortfolioFitScore(totalWalletValueUsd: number, currentPositionValueUsd: number) {
  if (!Number.isFinite(totalWalletValueUsd) || totalWalletValueUsd <= 0) return null;
  const exposurePct = Math.max(0, currentPositionValueUsd) / totalWalletValueUsd * 100;
  return Math.round(Math.max(0, Math.min(100, 100 - exposurePct / 8 * 100)));
}

async function fetchEligibilityDocument() {
  const url = BSTOCK_ELIGIBILITY_SNAPSHOT.sourceUrl;
  try {
    const response = await fetch(url, {
      headers: { "Accept": "text/html", "User-Agent": "bStockAlpha/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });
    const body = response.ok ? await response.text() : "";
    const normalized = body.toUpperCase();
    const contractCount = normalized.match(/0X[A-F0-9]{40}/g)?.length ?? 0;
    const isOfficialListDocument = normalized.includes("ELIGIBLE BSTOCK TOKENS")
      && normalized.includes("ELIGIBLE TOKENS (THIS WEEK)")
      && contractCount >= 10;
    if (response.ok && isOfficialListDocument) {
      return {
        available: true as const,
        url,
        body: normalized,
        sourceMode: "LIVE_OFFICIAL_PAGE" as const,
        effectiveFrom: null,
        effectiveUntil: null,
        lastUpdated: null
      };
    }
  } catch {
    // Continue into the audited, time-bounded official snapshot fallback.
  }

  const snapshotIsCurrent = eligibilitySnapshotIsCurrent();
  if (snapshotIsCurrent) {
    return {
      available: true as const,
      url,
      body: BSTOCK_ELIGIBILITY_SNAPSHOT.assets
        .flatMap(([ticker, symbol, name, address]) => [ticker, symbol, name, address])
        .join("\n")
        .toUpperCase(),
      sourceMode: "PERSISTENT_OFFICIAL_WEEKLY_CATALOG" as const,
      effectiveFrom: BSTOCK_ELIGIBILITY_SNAPSHOT.effectiveFrom,
      effectiveUntil: BSTOCK_ELIGIBILITY_SNAPSHOT.effectiveUntil,
      lastUpdated: BSTOCK_ELIGIBILITY_SNAPSHOT.lastUpdated
    };
  }

  return {
    available: false as const,
    url,
    body: "",
    sourceMode: "UNAVAILABLE" as const,
    effectiveFrom: null,
    effectiveUntil: null,
    lastUpdated: null
  };
}

async function fetchOfficialBstockMarketLive() {
  const registryUrl = "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai?type=3";
  const persistentBaseline: BstockRegistryEntry[] = BSTOCK_REGISTRY_BASELINE_ASSETS.map(([ticker, symbol, , contractAddress]) => ({
    chainId: BSC_CHAIN_ID,
    contractAddress,
    symbol,
    ticker,
    type: 3,
    assetType: 1,
    multiplier: "1",
    cs: `${symbol}USDT`
  }));
  let registrySourceAvailable = false;
  let liveEntries: BstockRegistryEntry[] = [];
  try {
    const registry = bstockRegistrySchema.parse(await fetchJson(registryUrl));
    if (registry.code !== "000000") throw new Error("Binance bStock registry returned an error.");
    registrySourceAvailable = true;
    liveEntries = registry.data.filter((item) => item.chainId === BSC_CHAIN_ID && item.type === 3);
  } catch (error) {
    console.warn("[bstock:market] registry_unavailable_using_persistent_baseline", {
      baselineAssets: persistentBaseline.length,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // The current audited catalog is the durable floor. Live registry rows enrich
  // and extend it, but a shorter weekly/remote response never deletes symbols.
  const entriesBySymbol = new Map(persistentBaseline.map((item) => [item.symbol, item] as const));
  liveEntries.forEach((item) => entriesBySymbol.set(item.symbol, item));
  const entries = [...entriesBySymbol.values()];
  const snapshotNames = new Map<string, string>(
    BSTOCK_REGISTRY_BASELINE_ASSETS.map(([, symbol, name]) => [symbol, name] as const)
  );
  const symbols = entries.map((item) => item.cs || `${item.symbol}USDT`);
  const tickerUrl = symbols.length
    ? `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    : null;
  let tickers: z.infer<typeof tickerSchema>[] = [];
  try {
    const tickerRaw = tickerUrl ? await fetchJson(tickerUrl) : [];
    tickers = z.array(tickerSchema).parse(tickerRaw);
  } catch (error) {
    console.warn("[bstock:market] tickers_unavailable_catalog_retained", {
      catalogAssets: entries.length,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  const tickerMap = new Map(tickers.map((item) => [item.symbol, item]));

  const assets = entries.map((item) => {
    const ticker = tickerMap.get(item.cs || `${item.symbol}USDT`);
    const name = snapshotNames.get(item.symbol) || item.ticker;
    // The registry's numeric assetType currently mislabels at least NFLX.
    // The campaign page project name plus canonical ETF tickers is the
    // auditable classification used by the opportunity-pool filters.
    const assetType = /(?:\bETF\b|\bTRUST\b)/i.test(name) || /^(?:SPY|TQQQ)$/.test(item.ticker) ? "ETF" : "STOCK";
    const leveragedOrInverse = /(?:\b[23]X\b|ULTRAPRO|BULL|BEAR|LONG|SHORT)/i.test(name);
    return {
      symbol: item.symbol,
      ticker: item.ticker,
      marketSymbol: item.cs || `${item.symbol}USDT`,
      contractAddress: item.contractAddress,
      multiplier: item.multiplier,
      name,
      assetType,
      leveragedOrInverse,
      campaignEligibility: "UNVERIFIED" as const,
      price: ticker ? Number(ticker.lastPrice) : null,
      priceChange: ticker ? Number(ticker.priceChange) : null,
      priceChangePercent: ticker ? Number(ticker.priceChangePercent) : null,
      quoteVolume: ticker ? Number(ticker.quoteVolume) : null,
      marketUpdatedAt: ticker ? new Date(ticker.closeTime).toISOString() : null
    };
  });

  return {
    registryUrl,
    registrySourceAvailable,
    registrySourceMode: registrySourceAvailable ? "LIVE_OFFICIAL_REGISTRY" as const : "PERSISTENT_AUDITED_BASELINE" as const,
    tradableCount: assets.length,
    fetchedAt: new Date().toISOString(),
    assets
  };
}

export async function fetchOfficialBstockMarket() {
  const registry = await loadBstockPublicData({
    key: "bstock.public.registry.v1",
    description: "bStockAlpha persistent Binance BSC type=3 registry and ticker cache",
    freshForMs: 30_000,
    staleForMs: Number.MAX_SAFE_INTEGER,
    load: fetchOfficialBstockMarketLive,
    isUsable: (value) => Array.isArray(value.assets) && value.assets.length > 0
  });
  const eligibility = await fetchEligibilityDocument();
  const assets = registry.assets.map((item) => ({
    ...item,
    nameZh: BSTOCK_CHINESE_NAMES[item.symbol] || null,
    brandIconUrl: bstockBrandIconPath(item.symbol),
    campaignEligibility: eligibility.available
      && eligibility.body.includes(item.symbol.toUpperCase())
      && eligibility.body.includes(item.contractAddress.toUpperCase())
      ? "CONFIRMED" as const
      : "UNVERIFIED" as const
  }));
  return {
    ...registry,
    eligibilityUrl: eligibility.url,
    eligibilitySourceAvailable: eligibility.available,
    eligibilitySourceMode: eligibility.sourceMode,
    eligibilityEffectiveFrom: eligibility.effectiveFrom,
    eligibilityEffectiveUntil: eligibility.effectiveUntil,
    eligibilityLastUpdated: eligibility.lastUpdated,
    tradableCount: assets.length,
    eligibleCount: assets.filter((item) => item.campaignEligibility === "CONFIRMED").length,
    assets
  };
}

const klineSchema = z.array(z.tuple([
  z.number(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.string(),
  z.number(),
  z.string(),
  z.number(),
  z.string(),
  z.string(),
  z.string()
]));

async function fetchBstockMarketHistoryLive(symbol: string, interval: "1h" | "4h" | "1d" | "1w") {
  if (!BSTOCK_SYMBOL_PATTERN.test(symbol)) throw new Error("Invalid bStock symbol.");
  const market = await fetchOfficialBstockMarket();
  const asset = market.assets.find((item) => item.symbol === symbol);
  if (!asset) throw new Error("Binance 官方 bStock 注册表中未找到该标的。");
  const limit = interval === "1h" ? 48 : interval === "4h" ? 42 : interval === "1d" ? 40 : 26;
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(asset.marketSymbol)}&interval=${interval}&limit=${limit}`;
  const rows = klineSchema.parse(await fetchJson(url));
  return {
    source: "Binance Spot Klines",
    sourceUrl: url,
    symbol,
    interval,
    fetchedAt: new Date().toISOString(),
    points: rows.map((row) => ({
      openTime: new Date(row[0]).toISOString(),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: new Date(row[6]).toISOString()
    }))
  };
}

export async function fetchBstockMarketHistory(symbol: string, interval: "1h" | "4h" | "1d" | "1w") {
  return loadBstockPublicData({
    key: `bstock.public.history.v1.${symbol}.${interval}`,
    description: `bStockAlpha Binance Spot ${symbol} ${interval} kline cache`,
    freshForMs: 60_000,
    staleForMs: 24 * 60 * 60_000,
    load: () => fetchBstockMarketHistoryLive(symbol, interval),
    isUsable: (value) => Array.isArray(value.points) && value.points.length > 0
  });
}

export function encodeResearchIntent(value: ResearchIntent) {
  return encryptTradingSecret(JSON.stringify(researchIntentSchema.parse(value)));
}

export function decodeResearchIntent(value: string) {
  return researchIntentSchema.parse(JSON.parse(decryptTradingSecret(value)));
}

export function encodeTradeIntent(value: TradeIntent) {
  return encryptTradingSecret(JSON.stringify(tradeIntentSchema.parse(value)));
}

export function decodeTradeIntent(value: string) {
  return tradeIntentSchema.parse(JSON.parse(decryptTradingSecret(value)));
}

export function safeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
