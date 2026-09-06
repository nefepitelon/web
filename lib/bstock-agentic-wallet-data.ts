import "server-only";

import { z } from "zod";
import type { AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import { agentWalletRequest, normalizeBscWalletAddress } from "@/lib/bstock-agentic-wallet-client";
import {
  BSC_CHAIN_ID,
  PAY_TOKEN_ADDRESSES,
  type PayTokenSymbol,
  multiplyDecimals,
  safeNumber
} from "@/lib/bstock-alpha-live";

export const WALLET_LIST_ENDPOINT = "/bapi/defi/v1/public/wallet-direct/agent-wallet/mpc-wallet/list";
export const WALLET_TOKEN_LIST_ENDPOINT = "/bapi/defi/v1/public/wallet-direct/agent-wallet/mpc-wallet/token/list";

const tokenSchema = z.object({
  binanceChainId: z.coerce.string(),
  contractAddress: z.string().nullable().optional().transform((value) => value || ""),
  symbol: z.string().default(""),
  balance: z.union([z.string(), z.number()]).transform(String),
  price: z.union([z.string(), z.number()]).nullable().optional().transform((value) => value == null ? null : String(value)),
  decimals: z.union([z.number(), z.string()]).optional()
}).passthrough();

const tokenListSchema = z.object({
  tokenList: z.array(tokenSchema).default([])
}).passthrough();

const addressSchema = z.object({
  binanceChainId: z.coerce.string(),
  address: z.string()
}).passthrough();

const walletListSchema = z.array(z.object({
  subWalletList: z.array(z.object({
    addresses: z.array(addressSchema).default([])
  }).passthrough()).default([])
}).passthrough());

export type RawAgentWalletToken = z.infer<typeof tokenSchema>;

export async function fetchAgentWalletData(state: AgentSessionState) {
  const walletResponse = await agentWalletRequest<unknown>(state, WALLET_LIST_ENDPOINT);
  const walletList = walletListSchema.parse(walletResponse.data);
  const tokenResponse = await agentWalletRequest<unknown>(walletResponse.state, WALLET_TOKEN_LIST_ENDPOINT);
  const tokenList = tokenListSchema.parse(tokenResponse.data).tokenList;
  const bscAddress = normalizeBscWalletAddress(walletList
    .flatMap((wallet) => wallet.subWalletList)
    .flatMap((wallet) => wallet.addresses)
    .find((entry) => entry.binanceChainId === BSC_CHAIN_ID)?.address || "");

  return {
    state: bscAddress ? { ...tokenResponse.state, walletAddress: bscAddress } : tokenResponse.state,
    address: bscAddress,
    tokens: tokenList.filter((token) => token.binanceChainId === BSC_CHAIN_ID)
  };
}

export function walletSnapshotDto(tokens: RawAgentWalletToken[], bstockMultipliers: Map<string, string>) {
  const payAddressMap = new Map<string, PayTokenSymbol>(
    Object.entries(PAY_TOKEN_ADDRESSES).map(([symbol, address]) => [address.toLowerCase(), symbol as PayTokenSymbol])
  );
  const paymentBalances: Partial<Record<PayTokenSymbol, {
    symbol: PayTokenSymbol;
    address: string;
    balance: number;
    balanceExact: string;
    price: number;
    valueUsd: number;
  }>> = {};
  const bstockBalances: Array<{
    symbol: string;
    address: string;
    balance: number;
    balanceExact: string;
    price: number;
    valueUsd: number;
  }> = [];
  let totalWalletValueUsd = 0;

  for (const token of tokens) {
    const price = safeNumber(token.price);
    const value = safeNumber(token.balance) * price;
    if (Number.isFinite(value) && value > 0) totalWalletValueUsd += value;
    const address = token.contractAddress.toLowerCase();
    const paySymbol = payAddressMap.get(address) || (token.symbol.toUpperCase() === "BNB" ? "BNB" : undefined);
    if (paySymbol) {
      paymentBalances[paySymbol] = {
        symbol: paySymbol,
        address: token.contractAddress,
        balance: safeNumber(token.balance),
        balanceExact: token.balance,
        price,
        valueUsd: value
      };
    }
    const multiplier = bstockMultipliers.get(address);
    if (multiplier) {
      const shareBalance = multiplyDecimals(token.balance, multiplier);
      const sharePrice = safeNumber(multiplier) > 0 ? price / safeNumber(multiplier) : price;
      bstockBalances.push({
        symbol: token.symbol,
        address: token.contractAddress,
        balance: safeNumber(shareBalance),
        balanceExact: shareBalance,
        price: sharePrice,
        valueUsd: safeNumber(shareBalance) * sharePrice
      });
    }
  }

  for (const [symbol, address] of Object.entries(PAY_TOKEN_ADDRESSES) as Array<[PayTokenSymbol, string]>) {
    paymentBalances[symbol] ??= { symbol, address, balance: 0, balanceExact: "0", price: 0, valueUsd: 0 };
  }

  return { paymentBalances, bstockBalances, totalWalletValueUsd };
}
