"use client";

import { x402Client } from "@x402/core/client";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import {
  B402ExactClientScheme,
  B402_PERMIT2_ADDRESS,
  CURATED_B402_SPENDERS
} from "@bnb-chain/b402/client";
import {
  isPermit2PaymentPayload,
  recoverEip3009Payer,
  recoverPermit2ExactPayer
} from "@bnb-chain/b402";
import { ExactEvmScheme, type ClientEvmSigner } from "@x402/evm";
import { useEffect } from "react";
import { sameX402Requirement } from "@/lib/bstock-x402";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  erc20Abi,
  getAddress,
  isAddress,
  parseCompactSignature,
  parseSignature,
  serializeSignature,
  compactSignatureToSignature,
  type AddEthereumChainParameter,
  type EIP1193Provider,
  type Hex
} from "viem";

type WalletMessage = {
  type: "welinkbtc:bstock:x402-sign";
  id: string;
  address: string;
  paymentRequired: PaymentRequired;
};

const BROWSER_X402_PROTOCOL_VERSION = "b402-x402-v2-20260902";

const ADD_CHAIN_PARAMS: Record<number, AddEthereumChainParameter> = {
  1: { chainId: "0x1", chainName: "Ethereum", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://ethereum-rpc.publicnode.com"], blockExplorerUrls: ["https://etherscan.io"] },
  10: { chainId: "0xa", chainName: "Optimism", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.optimism.io"], blockExplorerUrls: ["https://optimistic.etherscan.io"] },
  56: { chainId: "0x38", chainName: "BNB Smart Chain", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: ["https://bsc-dataseed.binance.org/"], blockExplorerUrls: ["https://bscscan.com"] },
  137: { chainId: "0x89", chainName: "Polygon", nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 }, rpcUrls: ["https://polygon-bor-rpc.publicnode.com"], blockExplorerUrls: ["https://polygonscan.com"] },
  8453: { chainId: "0x2105", chainName: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] },
  42161: { chainId: "0xa4b1", chainName: "Arbitrum One", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://arb1.arbitrum.io/rpc"], blockExplorerUrls: ["https://arbiscan.io"] },
  43114: { chainId: "0xa86a", chainName: "Avalanche C-Chain", nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 }, rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"], blockExplorerUrls: ["https://snowtrace.io"] }
};

function viemChain(chainId: number) {
  const params = ADD_CHAIN_PARAMS[chainId];
  const explorerUrl = params?.blockExplorerUrls?.[0];
  return defineChain({
    id: chainId,
    name: params?.chainName || `EVM Chain ${chainId}`,
    nativeCurrency: params?.nativeCurrency || { name: "Native Token", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: params?.rpcUrls || [] } },
    ...(explorerUrl ? { blockExplorers: { default: { name: `${params.chainName} Explorer`, url: explorerUrl } } } : {})
  });
}

function parseEvmNetwork(network: string) {
  const match = /^eip155:(\d+)$/.exec(network.toLowerCase());
  const chainId = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("所选 x402 付款方式不是有效的 EVM 网络。");
  return chainId;
}

async function switchEvmNetwork(provider: EIP1193Provider, chainId: number) {
  const chainIdHex = `0x${chainId.toString(16)}`;
  if (String(await provider.request({ method: "eth_chainId" })).toLowerCase() === chainIdHex) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (error) {
    const code = Number((error as { code?: unknown } | null)?.code);
    const params = ADD_CHAIN_PARAMS[chainId];
    if (code !== 4902 || !params) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [params] });
  }
  if (String(await provider.request({ method: "eth_chainId" })).toLowerCase() !== chainIdHex) {
    throw new Error(`钱包未切换到已审阅的 EVM chainId ${chainId}。`);
  }
}

function selectedEvmRequirement(paymentRequired: PaymentRequired) {
  if (paymentRequired.x402Version !== 2 || paymentRequired.accepts.length !== 1) {
    throw new Error("浏览器钱包只接受单一、已审阅的 x402 v2 付款方式。");
  }
  const requirement = paymentRequired.accepts[0];
  parseEvmNetwork(requirement.network);
  if (requirement.scheme.toLowerCase() !== "exact"
    || !isAddress(requirement.asset)
    || !isAddress(requirement.payTo)
    || !/^\d+$/.test(String(requirement.amount))
    || BigInt(requirement.amount) <= 0n) {
    throw new Error("所选 x402 付款要求不是可验证的 EVM exact 付款方式。");
  }
  return requirement;
}

function normalizeBrowserSignature(signature: Hex): Hex {
  if (/^0x[0-9a-fA-F]{128}$/.test(signature)) {
    return serializeSignature(compactSignatureToSignature(parseCompactSignature(signature)));
  }
  if (/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    // Some injected wallets return yParity (00/01) as the final byte. The
    // hosted B402 Permit2 verifier expects canonical RPC signatures (1b/1c).
    return serializeSignature(parseSignature(signature));
  }
  return signature;
}

async function locallyVerifyCreatedPayment(
  paymentPayload: Awaited<ReturnType<x402Client["createPaymentPayload"]>>,
  transferMethod: string,
  expectedAddress: `0x${string}`
) {
  const payload = paymentPayload.payload as Record<string, unknown>;
  const signature = String(payload.signature || "");
  if (transferMethod === "permit2-exact") {
    if (!isPermit2PaymentPayload(paymentPayload)) {
      throw new Error("浏览器钱包未能生成规范的 B402 Permit2 付款载荷；凭据未发送。请刷新页面后重新获取付款预览。");
    }
    if (/^0x[0-9a-fA-F]{130}$/.test(signature)) {
      const recovered = await recoverPermit2ExactPayer(paymentPayload);
      if (getAddress(recovered) !== expectedAddress) {
        throw new Error("浏览器钱包返回的 Permit2 EIP-712 签名无法恢复为当前地址；付款凭据未发送。请升级或切换钱包扩展后重试。");
      }
    }
    return;
  }
  // Longer signatures may be ERC-1271/ERC-7739 smart-account envelopes and
  // are intentionally left for the hosted verifier. EOA signatures are always
  // recovered locally before any paid request is submitted.
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return;
  const recovered = await recoverEip3009Payer(paymentPayload as unknown as Parameters<typeof recoverEip3009Payer>[0]);
  if (getAddress(recovered) !== expectedAddress) {
    throw new Error("浏览器钱包返回的 x402 EIP-712 签名无法恢复为当前地址；付款凭据未发送。请升级或切换钱包扩展后重试。");
  }
}

export function BstockBrowserWalletBridge() {
  useEffect(() => {
    const onMessage = async (event: MessageEvent<WalletMessage>) => {
      if (event.origin !== window.location.origin || event.data?.type !== "welinkbtc:bstock:x402-sign") return;
      const reply = (payload: Record<string, unknown>) => {
        event.source?.postMessage({ type: "welinkbtc:bstock:x402-result", id: event.data.id, ...payload }, { targetOrigin: event.origin });
      };
      try {
        const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
        if (!provider) throw new Error("未检测到浏览器钱包扩展。");
        const expectedAddress = getAddress(event.data.address);
        const requirement = selectedEvmRequirement(event.data.paymentRequired);
        const chainId = parseEvmNetwork(requirement.network);
        await switchEvmNetwork(provider, chainId);
        const accounts = await provider.request({ method: "eth_accounts" }) as string[];
        if (!accounts.some((account) => getAddress(account) === expectedAddress)) {
          throw new Error("当前钱包账户与已验证地址不一致。");
        }
        const chain = viemChain(chainId);
        const publicClient = createPublicClient({ chain, transport: custom(provider) });
        const walletClient = createWalletClient({ account: expectedAddress, chain, transport: custom(provider) });
        let approveTxHash: `0x${string}` | null = null;
        const transferMethod = String((requirement.extra as Record<string, unknown> | undefined)?.assetTransferMethod || "eip3009").toLowerCase();
        const asset = getAddress(requirement.asset);
        const balance = await publicClient.readContract({
          address: asset,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [expectedAddress]
        });
        if (balance < BigInt(requirement.amount)) throw new Error("所选网络上的付款代币余额不足。");
        if (transferMethod.startsWith("permit2")) {
          const allowance = await publicClient.readContract({
            address: asset,
            abi: erc20Abi,
            functionName: "allowance",
            args: [expectedAddress, B402_PERMIT2_ADDRESS]
          });
          if (allowance < BigInt(requirement.amount)) {
            approveTxHash = await walletClient.writeContract({
              account: expectedAddress,
              chain,
              address: asset,
              abi: erc20Abi,
              functionName: "approve",
              args: [B402_PERMIT2_ADDRESS, BigInt(requirement.amount)]
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash: approveTxHash, timeout: 120_000 });
            if (receipt.status !== "success") throw new Error("Permit2 一次性授权交易失败，尚未创建付款签名。");
          }
        }

        const signer: ClientEvmSigner = {
          address: expectedAddress,
          signTypedData: async ({ domain, types, primaryType, message }) => normalizeBrowserSignature(
            await walletClient.signTypedData({
              account: expectedAddress,
              domain,
              types,
              primaryType,
              message
            } as never)
          ),
          readContract: (args) => publicClient.readContract(args as never)
        };
        const b402Account = {
          address: expectedAddress,
          signTypedData: async (parameters: Record<string, unknown>) => normalizeBrowserSignature(
            await walletClient.signTypedData({
              ...parameters,
              account: expectedAddress
            } as never)
          )
        } as ConstructorParameters<typeof B402ExactClientScheme>[0]["account"];
        const curatedSpender = CURATED_B402_SPENDERS[requirement.network]?.exact;
        if (transferMethod === "permit2-exact" && !curatedSpender) {
          throw new Error(`BNB Chain B402 SDK 尚未为 ${requirement.network} 配置受信任的 Permit2 Exact 结算合约。`);
        }
        const scheme = transferMethod === "permit2-exact"
          ? new B402ExactClientScheme({
              account: b402Account,
              methods: ["permit2-exact"],
              permit2Allowance: ({ owner, spender, token }) => publicClient.readContract({
                address: token,
                abi: erc20Abi,
                functionName: "allowance",
                args: [owner, spender]
              }),
              trustedSpenders: { [requirement.network]: [curatedSpender!] }
            })
          : new ExactEvmScheme(signer);
        const sdkPaymentRequired: PaymentRequired = { ...event.data.paymentRequired, accepts: [requirement] };
        const client = x402Client.fromConfig({
          schemes: [{ network: requirement.network, client: scheme }],
          spendControls: {
            allowedAssets: [{
              network: requirement.network,
              asset: getAddress(requirement.asset),
              maxAmountPerPayment: String(requirement.amount)
            }]
          },
          policies: [(_version, requirements) => requirements.filter((candidate) => sameX402Requirement(candidate, requirement))]
        });
        const paymentPayload = await client.createPaymentPayload(sdkPaymentRequired);
        if (paymentPayload.x402Version !== 2 || !sameX402Requirement(paymentPayload.accepted, requirement)) {
          throw new Error("x402 SDK 生成的付款载荷与已审阅的网络、资产、金额或收款地址不一致。");
        }
        await locallyVerifyCreatedPayment(paymentPayload, transferMethod, expectedAddress);
        reply({
          ok: true,
          paymentProtocolVersion: BROWSER_X402_PROTOCOL_VERSION,
          paymentHeaderName: "PAYMENT-SIGNATURE",
          paymentHeaderValue: encodePaymentSignatureHeader(paymentPayload),
          approveTxHash
        });
      } catch (error) {
        reply({ ok: false, error: error instanceof Error ? error.message : "浏览器钱包签名失败。" });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}
