import "server-only";

import { getAddress, isAddress, createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { bsc } from "viem/chains";
import { z } from "zod";
import { decryptTradingSecret, encryptTradingSecret } from "@/lib/alpha-execution/credentials";
import { agentWalletOwnerKey } from "@/lib/bstock-agentic-wallet-client";
import {
  PAY_TOKEN_ADDRESSES,
  type PayTokenSymbol,
  multiplyDecimals,
  safeNumber
} from "@/lib/bstock-alpha-live";
import { requireViewer } from "@/lib/membership";
import { prisma } from "@/lib/prisma";

export const BSC_NATIVE_TOKEN = PAY_TOKEN_ADDRESSES.BNB;
export const PANCAKE_SMART_ROUTER = "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4" as const;

export const browserWalletAddressSchema = z.string().trim().refine(isAddress, "浏览器钱包地址无效。");

export const browserPublicClient = createPublicClient({
  chain: bsc,
  transport: http(process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org"),
  batch: { multicall: { batchSize: 1024 * 200 } }
});

export type BrowserWalletIdentity = {
  address: `0x${string}`;
  ownerKey: string;
  agentKey: string;
  userId: string;
};

export async function requireBoundEvmBrowserWallet(addressInput: string): Promise<BrowserWalletIdentity> {
  const viewer = await requireViewer("/bstock-alpha");
  if (!isAddress(addressInput)) throw new Error("浏览器钱包地址无效。");
  const address = getAddress(addressInput);
  const wallets = await prisma.wallet.findMany({
    where: { userId: viewer.id, chain: "EVM" },
    select: { address: true }
  });
  const linked = wallets.some((wallet) => {
    try {
      return getAddress(wallet.address) === address;
    } catch {
      return false;
    }
  });
  if (!linked) throw new Error("该浏览器钱包尚未完成本站所有权签名验证。");
  const ownerKey = agentWalletOwnerKey(address);
  return { address, ownerKey, agentKey: ownerKey, userId: viewer.id };
}

type BrowserMarketAsset = {
  symbol: string;
  ticker: string;
  contractAddress: string;
  multiplier: string;
  price: number | null;
};

async function bnbPriceUsd() {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT", {
      headers: { "Accept": "application/json", "User-Agent": "bStockAlpha/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return 0;
    const payload = await response.json() as { price?: string };
    return safeNumber(payload.price);
  } catch {
    return 0;
  }
}

export async function fetchBrowserWalletSnapshot(address: `0x${string}`, assets: BrowserMarketAsset[]) {
  const tokenAddresses = Array.from(new Set([
    ...Object.values(PAY_TOKEN_ADDRESSES).filter((token) => token.toLowerCase() !== BSC_NATIVE_TOKEN.toLowerCase()),
    ...assets.map((asset) => asset.contractAddress)
  ].map((token) => getAddress(token))));
  const calls = tokenAddresses.flatMap((token) => ([
    { address: token, abi: erc20Abi, functionName: "decimals" as const },
    { address: token, abi: erc20Abi, functionName: "balanceOf" as const, args: [address] as const }
  ]));
  const [nativeBalance, priceBnb, results] = await Promise.all([
    browserPublicClient.getBalance({ address }),
    bnbPriceUsd(),
    browserPublicClient.multicall({ contracts: calls, allowFailure: true })
  ]);
  const balances = new Map<string, { decimals: number; raw: bigint; exact: string }>();
  tokenAddresses.forEach((token, index) => {
    const decimalsResult = results[index * 2];
    const balanceResult = results[index * 2 + 1];
    const decimals = decimalsResult?.status === "success" ? Number(decimalsResult.result) : 18;
    const raw = balanceResult?.status === "success" ? BigInt(balanceResult.result as bigint) : 0n;
    balances.set(token.toLowerCase(), { decimals, raw, exact: formatUnits(raw, decimals) });
  });

  const paymentBalances: Record<PayTokenSymbol, {
    symbol: PayTokenSymbol;
    address: string;
    balance: number;
    balanceExact: string;
    price: number;
    valueUsd: number;
  }> = {} as Record<PayTokenSymbol, never>;
  for (const [symbol, tokenAddress] of Object.entries(PAY_TOKEN_ADDRESSES) as Array<[PayTokenSymbol, string]>) {
    const balanceExact = symbol === "BNB"
      ? formatUnits(nativeBalance, 18)
      : balances.get(tokenAddress.toLowerCase())?.exact || "0";
    const price = symbol === "BNB" ? priceBnb : 1;
    paymentBalances[symbol] = {
      symbol,
      address: tokenAddress,
      balance: safeNumber(balanceExact),
      balanceExact,
      price,
      valueUsd: safeNumber(balanceExact) * price
    };
  }

  const bstockBalances = assets.map((asset) => {
    const rawBalance = balances.get(asset.contractAddress.toLowerCase())?.exact || "0";
    const balanceExact = multiplyDecimals(rawBalance, asset.multiplier);
    const price = asset.price || 0;
    return {
      symbol: asset.symbol,
      address: asset.contractAddress,
      balance: safeNumber(balanceExact),
      balanceExact,
      price,
      valueUsd: safeNumber(balanceExact) * price
    };
  });
  const totalWalletValueUsd = [
    ...Object.values(paymentBalances).map((entry) => entry.valueUsd),
    ...bstockBalances.map((entry) => entry.valueUsd)
  ].reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);

  return {
    address,
    paymentBalances,
    bstockBalances,
    totalWalletValueUsd,
    tokenMeta: balances,
    source: "Browser Wallet · BNB Chain"
  };
}

const browserResearchIntentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("browser-research"),
  walletAddress: z.string().refine(isAddress),
  ownerKey: z.string().length(64),
  provider: z.enum(["cmc", "studio"]),
  symbol: z.string(),
  ticker: z.string(),
  contractAddress: z.string().refine(isAddress),
  requestId: z.string().uuid(),
  paymentRequired: z.record(z.string(), z.unknown()),
  requirements: z.array(z.record(z.string(), z.unknown())).min(1).max(12),
  createdAt: z.number().int().positive()
});

const browserTradeIntentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("browser-trade"),
  walletAddress: z.string().refine(isAddress),
  ownerKey: z.string().length(64),
  mode: z.literal("policy"),
  side: z.enum(["buy", "sell"]),
  symbol: z.string(),
  ticker: z.string(),
  fromToken: z.string().refine(isAddress),
  toToken: z.string().refine(isAddress),
  fromSymbol: z.string(),
  toSymbol: z.string(),
  amount: z.string(),
  quoteOutput: z.string(),
  slippageRatio: z.string(),
  router: z.string().refine(isAddress),
  calldata: z.string().regex(/^0x[a-fA-F0-9]+$/),
  value: z.string().regex(/^\d+$/),
  quoteExpiresAt: z.number().int().positive(),
  createdAt: z.number().int().positive()
});

export type BrowserResearchIntent = z.infer<typeof browserResearchIntentSchema>;
export type BrowserTradeIntent = z.infer<typeof browserTradeIntentSchema>;

function encodeIntent(value: unknown) {
  return encryptTradingSecret(JSON.stringify(value));
}

function decodeIntent(value: string) {
  return JSON.parse(decryptTradingSecret(value)) as unknown;
}

export function encodeBrowserResearchIntent(value: BrowserResearchIntent) {
  return encodeIntent(browserResearchIntentSchema.parse(value));
}

export function decodeBrowserResearchIntent(value: string) {
  return browserResearchIntentSchema.parse(decodeIntent(value));
}

export function encodeBrowserTradeIntent(value: BrowserTradeIntent) {
  return encodeIntent(browserTradeIntentSchema.parse(value));
}

export function decodeBrowserTradeIntent(value: string) {
  return browserTradeIntentSchema.parse(decodeIntent(value));
}
