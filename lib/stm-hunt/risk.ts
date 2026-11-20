import "server-only";
import { createPublicClient, getAddress, http, isAddress, parseAbi } from "viem";
import { bsc } from "viem/chains";
import tradingPolicy from "./trading-policy.js";

export const STM_BSC_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;
export const STM_BSC_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73" as const;
export const STM_WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
export const STM_PAY_TOKENS = {
  USDT: "0x55d398326f99059fF775485246999027B3197955",
  USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"
} as const;
export const stmBscClient = createPublicClient({ chain: bsc, transport: http(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org", { timeout: 10_000 }) });
const factoryAbi = parseAbi(["function getPair(address,address) view returns (address)"]);
const pairAbi = parseAbi(["function getReserves() view returns (uint112,uint112,uint32)"]);
const chains: Record<string, { id: string; dex: string }> = {
  bsc: { id: "56", dex: "bsc" }, ethereum: { id: "1", dex: "ethereum" },
  base: { id: "8453", dex: "base" }, arbitrum: { id: "42161", dex: "arbitrum" }
};
type DexPair = { chainId?: string; dexId?: string; labels?: string[]; pairAddress?: string; baseToken?: { address?: string; symbol?: string }; quoteToken?: { address?: string }; priceUsd?: string; liquidity?: { usd?: number }; volume?: { h24?: number } };
export interface StmTokenRisk {
  chain: string; address: string; status: "pass" | "blocked" | "unknown";
  eligible: boolean; riskPassed: boolean; routeAvailable: boolean; routeEvidence: string;
  liquidityUsd: number | null; priceUsd: number | null; volume24hUsd: number | null;
  symbol: string | null; pairAddress: string | null; checkedAt: string; expiresAt: string;
  reasons: string[]; unknown: string[]; flags: Record<string, unknown>;
  sources: Array<{ name: string; url: string; available: boolean }>;
}
const cache = new Map<string, { until: number; promise: Promise<StmTokenRisk> }>();
// A conservative per-instance budget complements cache coalescing. Provider
// 429 responses remain unknown and can never produce permission to trade.
let windowStart = 0;
let requests = 0;
async function fetchRiskJson(url: string) {
  const now = Date.now();
  if (now - windowStart >= 60_000) { windowStart = now; requests = 0; }
  if (++requests > 24) throw new Error("Risk provider local rate limit");
  const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "STM-hunt/1.0", ...(url.startsWith("https://api.gopluslabs.io/") && process.env.GOPLUS_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.GOPLUS_ACCESS_TOKEN}` } : {}) }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Risk provider HTTP ${response.status}`);
  return response.json();
}

export async function readStmBscPrices(addresses: string[]): Promise<Record<string, number>> {
  const tokens = [...new Set(addresses.map(address => getAddress(address).toLowerCase()))];
  if (tokens.length > 30) throw new Error("钱包跟踪资产超过 30 项，需先整理与对账后再开仓");
  if (!tokens.length) return {};
  const payload = await fetchRiskJson(`https://api.dexscreener.com/tokens/v1/bsc/${tokens.join(",")}`);
  if (!Array.isArray(payload)) throw new Error("钱包资产价格数据不可用");
  const prices: Record<string, number> = {};
  for (const token of tokens) {
    const pairs = (payload as DexPair[]).filter(pair => pair.chainId === "bsc" && pair.baseToken?.address?.toLowerCase() === token && Number(pair.liquidity?.usd) >= 50_000 && Number(pair.priceUsd) > 0).sort((a, b) => Number(b.liquidity?.usd) - Number(a.liquidity?.usd));
    if (!pairs[0]) throw new Error(`无法核验已跟踪持仓的价格：${token}`);
    prices[token] = Number(pairs[0].priceUsd);
  }
  return prices;
}

export async function assessStmTokenRisk(input: { chain: string; address: string }, options: { maxAgeMs?: number } = {}): Promise<StmTokenRisk> {
  const chain = input.chain.toLowerCase();
  const supported = chains[chain];
  if (!supported && chain !== "solana") throw new Error("暂不支持该链的风险核验");
  const address = chain === "solana" ? input.address : isAddress(input.address) ? getAddress(input.address).toLowerCase() : "";
  if (!address || (chain === "solana" && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address))) throw new Error("链或完整合约地址无效");
  const key = `${chain}:${address}`;
  const hit = cache.get(key);
  if (hit && hit.until > Date.now() && hit.until - Date.now() > 90_000 - (options.maxAgeMs ?? 90_000)) return hit.promise;
  const promise = loadRisk(chain, address, supported);
  cache.set(key, { until: Date.now() + 90_000, promise });
  if (cache.size > 400) cache.delete(cache.keys().next().value!);
  return promise;
}

async function loadRisk(chain: string, address: string, supported: { id: string; dex: string } | undefined): Promise<StmTokenRisk> {
  const securityUrl = chain === "solana"
    ? `https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(address)}`
    : `https://api.gopluslabs.io/api/v1/token_security/${supported!.id}?contract_addresses=${address}`;
  const dexUrl = `https://api.dexscreener.com/token-pairs/v1/${supported?.dex ?? "solana"}/${encodeURIComponent(address)}`;
  const [auditResult, dexResult] = await Promise.allSettled([fetchRiskJson(securityUrl), fetchRiskJson(dexUrl)]);
  const payload = auditResult.status === "fulfilled" ? auditResult.value as { code?: number; result?: Record<string, Record<string, unknown>> } : null;
  const audit = payload?.code === 1 ? payload.result?.[address] ?? (chain !== "solana" ? payload.result?.[address.toLowerCase()] : null) ?? null : null;
  const pairs = dexResult.status === "fulfilled" && Array.isArray(dexResult.value) ? dexResult.value as DexPair[] : [];
  const matching = pairs.filter(pair => pair.chainId === (supported?.dex ?? "solana") && (chain === "solana" ? pair.baseToken?.address === address : pair.baseToken?.address?.toLowerCase() === address.toLowerCase()) && Number.isFinite(Number(pair.liquidity?.usd)) && Number(pair.liquidity?.usd) > 0);
  const preferred = matching.filter(pair => chain !== "bsc" || (pair.dexId === "pancakeswap" && (!pair.labels?.length || pair.labels.includes("v2"))));
  const pair = [...(preferred.length ? preferred : matching)].sort((a, b) => Number(b.liquidity?.usd) - Number(a.liquidity?.usd))[0];
  const liquidityUsd = pair ? Number(pair.liquidity?.usd) : null;
  const price = pair?.priceUsd ? Number(pair.priceUsd) : NaN;
  const priceUsd = Number.isFinite(price) && price > 0 ? price : null;
  const evaluated = chain === "solana"
    ? { passed: false, detected: [] as string[], missing: ["Solana Beta 审计尚未满足本平台 EVM 交易安全策略"] }
    : tradingPolicy.evaluateAudit(audit);
  const reasons = evaluated.detected.map(field => `合约风险：${field}`);
  const unknown = [...evaluated.missing];
  if (liquidityUsd === null) unknown.push("无法确认可用池流动性");
  else if (liquidityUsd < 50_000) reasons.push("池流动性低于 $50,000");
  if (priceUsd === null) unknown.push("无法确认合约实时价格");
  let routeAvailable = false;
  let routeEvidence = "not-verified";
  if (chain === "bsc" && pair?.dexId === "pancakeswap" && pair.pairAddress && isAddress(pair.pairAddress) && pair.quoteToken?.address && isAddress(pair.quoteToken.address)) {
    try {
      const actualPair = await stmBscClient.readContract({ address: STM_BSC_FACTORY, abi: factoryAbi, functionName: "getPair", args: [getAddress(address), getAddress(pair.quoteToken.address)] });
      if (actualPair.toLowerCase() === pair.pairAddress.toLowerCase()) {
        const reserves = await stmBscClient.readContract({ address: actualPair, abi: pairAbi, functionName: "getReserves" });
        routeAvailable = reserves[0] > 0n && reserves[1] > 0n;
        routeEvidence = routeAvailable ? "verified-pancake-v2-pool; exact-input-quote-required" : "empty-pool";
      }
    } catch { unknown.push("Pancake V2 工厂与储备核验不可用"); }
  }
  if (!routeAvailable) unknown.push("尚无已核验的 Pancake V2 执行池；不代表已获得可执行报价");
  const riskPassed = evaluated.passed && liquidityUsd !== null && liquidityUsd >= 50_000 && priceUsd !== null;
  const eligible = riskPassed && routeAvailable;
  return {
    chain, address, status: reasons.length ? "blocked" : eligible ? "pass" : "unknown", eligible, riskPassed, routeAvailable, routeEvidence,
    liquidityUsd, priceUsd, volume24hUsd: Number.isFinite(Number(pair?.volume?.h24)) ? Number(pair!.volume!.h24) : null,
    symbol: typeof pair?.baseToken?.symbol === "string" ? pair.baseToken.symbol.slice(0, 30) : null, pairAddress: pair?.pairAddress ?? null,
    checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 90_000).toISOString(), reasons, unknown,
    flags: audit ? Object.fromEntries(Object.entries(audit).filter(([key]) => ["is_open_source", "is_honeypot", "buy_tax", "sell_tax", "is_proxy", "is_mintable", "hidden_owner", "holder_count", "transfer_pausable", "cannot_buy", "cannot_sell_all"].includes(key))) : {},
    sources: [{ name: "GoPlus", url: securityUrl, available: Boolean(audit) }, { name: "DEX Screener", url: dexUrl, available: dexResult.status === "fulfilled" }]
  };
}
