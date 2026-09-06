import "server-only";

import { createPublicClient, defineChain, http } from "viem";

type EvmRpcConfig = {
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: 18 };
  rpcUrl: string;
};

const EVM_RPC_CONFIGS: Record<number, EvmRpcConfig> = {
  1: {
    name: "Ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: process.env.ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com"
  },
  10: {
    name: "Optimism",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: process.env.OPTIMISM_RPC_URL || "https://mainnet.optimism.io"
  },
  56: {
    name: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrl: process.env.BSC_RPC_URL || "https://bsc-dataseed1.binance.org"
  },
  137: {
    name: "Polygon",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com"
  },
  8453: {
    name: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org"
  },
  42161: {
    name: "Arbitrum One",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: process.env.ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc"
  },
  43114: {
    name: "Avalanche C-Chain",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    rpcUrl: process.env.AVALANCHE_RPC_URL || "https://api.avax.network/ext/bc/C/rpc"
  }
};

export function parseEvmCaip2Network(network: unknown) {
  const match = /^eip155:(\d+)$/.exec(String(network || "").trim().toLowerCase());
  if (!match) return null;
  const chainId = Number(match[1]);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

export function isEvmCaip2Network(network: unknown) {
  return parseEvmCaip2Network(network) !== null;
}

export function evmNetworkLabel(network: unknown) {
  const chainId = parseEvmCaip2Network(network);
  if (chainId == null) return String(network || "未知网络");
  return EVM_RPC_CONFIGS[chainId]?.name || `EVM Chain ${chainId}`;
}

export function evmNativeSymbol(chainId: number) {
  return EVM_RPC_CONFIGS[chainId]?.nativeCurrency.symbol || "Gas";
}

export function getEvmPublicClientByChainId(chainId: number, transportOptions?: { timeout: number; retryCount: number }) {
  const config = EVM_RPC_CONFIGS[chainId];
  if (!config) return null;
  const chain = defineChain({
    id: chainId,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: { default: { http: [config.rpcUrl] } }
  });
  return createPublicClient({ chain, transport: http(config.rpcUrl, transportOptions) });
}

export function getEvmPublicClient(network: unknown, transportOptions?: { timeout: number; retryCount: number }) {
  const chainId = parseEvmCaip2Network(network);
  return chainId == null ? null : getEvmPublicClientByChainId(chainId, transportOptions);
}
