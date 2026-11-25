import "server-only";

import { createHash } from "node:crypto";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { encodeFunctionData, erc20Abi, formatUnits, getAddress } from "viem";
import { z } from "zod";
import { decryptTradingSecret, encryptTradingSecret } from "@/lib/alpha-execution/credentials";
import type { AgentSessionState } from "@/lib/bstock-agentic-wallet-auth";
import { agentSessionKey, agentWalletRequest } from "@/lib/bstock-agentic-wallet-client";
import { resolveResearchOwner } from "@/lib/bstock-agent-studio";
import type { ResearchIntent } from "@/lib/bstock-alpha-live";
import { getEvmPublicClientByChainId } from "@/lib/bstock-evm";
import { claimResearchOperation } from "@/lib/bstock-research-claim";
import { assertAgentPermit2Requirement, B402_PERMIT2_ADDRESS, bindAgentPermit2Signature, buildUnsignedAgentPermit2, normalizeAgentMessageSignature } from "@/lib/bstock-x402-permit2";

const BASE = "/bapi/defi/v1/public/wallet-direct/agent-wallet";
const reviewSchema = z.object({
  version: z.literal(1), kind: z.enum(["APPROVAL", "PAYMENT"]), agentKey: z.string(),
  intentHash: z.string().length(64), selectedIndex: z.number().int().positive(),
  requestId: z.string().min(1).max(200), address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  expiresAt: z.number().int().positive(), payment: z.record(z.string(), z.unknown()).optional(),
  orderId: z.string().min(1).max(200).optional()
});
type ExternalReview = z.infer<typeof reviewSchema>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const encodeReview = (review: ExternalReview) => encryptTradingSecret(JSON.stringify(reviewSchema.parse(review)));

export function decodeBoundExternalReview(token: string, intentToken: string, intent: ResearchIntent, selectedIndex: number, state: AgentSessionState) {
  const review = reviewSchema.parse(JSON.parse(decryptTradingSecret(token)));
  if (review.agentKey !== agentSessionKey(state) || review.agentKey !== intent.agentKey
    || review.intentHash !== hash(intentToken) || review.selectedIndex !== selectedIndex
    || review.expiresAt <= Date.now()) throw new Error("外部签名预览已过期或不属于当前付款与钱包，请重新预览；未签名、未付款。");
  return review;
}

async function enabledDeveloperMode(state: AgentSessionState) {
  const response = await agentWalletRequest<{ devMode?: { enabled?: boolean; expiresAt?: number; balanceExceeded?: boolean } }>(state,
    `${BASE}/settings/query`, { method: "GET", timeoutMs: 10_000 });
  const mode = response.data?.devMode;
  if (!mode?.enabled || mode.balanceExceeded || (mode.expiresAt != null && Number(mode.expiresAt) * 1000 <= Date.now())) {
    throw new Error("此商户使用 B402 Permit2 Exact。请先在 Binance App 的 Agentic Wallet 设置中启用有效的 Developer Mode，再重新预览；当前未授权、未签名、未付款。也可选择钱包原生支持且余额充足的付款方式。");
  }
  return response.state;
}

/** Only read balances/settings and call the official preview APIs. */
export async function previewExternalResearch(state: AgentSessionState, token: string, intent: ResearchIntent, index: number) {
  const option = intent.allowedOptions.find(entry => entry.index === index && entry.signingMode === "external");
  if (!option) throw new Error("此付款选项不属于已审阅的外部签名流程。");
  const requirement = option.requirement;
  assertAgentPermit2Requirement(requirement);
  state = await enabledDeveloperMode(state);
  const owner = await resolveResearchOwner(state);
  state = owner.state;
  const address = getAddress(owner.walletAddress);
  const client = getEvmPublicClientByChainId(56, { timeout: 7_000, retryCount: 0 });
  if (!client) throw new Error("BSC 付款网络暂不可核验，未请求授权或签名。");
  const asset = getAddress(requirement.asset);
  const [balance, allowance, decimals, symbol] = await Promise.all([
    client.readContract({ address: asset, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: "allowance", args: [address, B402_PERMIT2_ADDRESS] }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: asset, abi: erc20Abi, functionName: "symbol" })
  ]);
  if (balance < BigInt(requirement.amount)) throw new Error(`BSC 上 ${symbol} 余额不足：需要 ${formatUnits(BigInt(requirement.amount), decimals)}，当前 ${formatUnits(balance, decimals)}；未授权、未签名、未付款。`);
  const kind = allowance < BigInt(requirement.amount) ? "APPROVAL" as const : "PAYMENT" as const;
  let payment: PaymentPayload | undefined;
  let operation: Record<string, unknown>;
  if (kind === "APPROVAL") {
    const gas = await client.getBalance({ address });
    if (gas === 0n) throw new Error("BSC 上 BNB Gas 余额不足，无法提交有限额度授权；未授权、未签名、未付款。");
    operation = { binanceChainId: "56", from: address, to: asset, value: "0", inputData: encodeFunctionData({
      abi: erc20Abi, functionName: "approve", args: [B402_PERMIT2_ADDRESS, BigInt(requirement.amount)]
    }) };
  } else {
    const unsigned = await buildUnsignedAgentPermit2(requirement, address, intent.resourceUrl);
    payment = unsigned.payment;
    operation = { binanceChainId: "56", signType: "EIP712", message: JSON.stringify({ method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(unsigned.typedData)] }) };
  }
  const preview = await agentWalletRequest<Record<string, unknown>>(state,
    `${BASE}/${kind === "APPROVAL" ? "contract-call" : "sign-message"}/preview`, { body: operation, timeoutMs: 20_000 });
  const requestId = z.string().min(1).max(200).parse(preview.data?.requestId);
  // Never proceed on an intercepted response: the wallet does not issue a requestId.
  const providerExpiry = Number(preview.data.expiresAt);
  const expiresAt = Math.min(intent.createdAt + 2 * 60_000, Date.now() + 2 * 60_000,
    Number.isFinite(providerExpiry) && providerExpiry > 0 ? (providerExpiry < 1e11 ? providerExpiry * 1000 : providerExpiry) : Infinity);
  if (expiresAt <= Date.now() + 5_000) throw new Error("钱包预览即将过期，请重新获取；未签名、未付款。");
  const review: ExternalReview = { version: 1, kind, agentKey: intent.agentKey, intentHash: hash(token), selectedIndex: index,
    requestId, address, expiresAt, ...(payment ? { payment: payment as unknown as Record<string, unknown> } : {}) };
  return { state: preview.state, body: {
    externalReview: encodeReview(review), kind, expiresAt, tokenSymbol: symbol,
    amount: formatUnits(BigInt(requirement.amount), decimals), tokenAddress: asset, networkLabel: "BNB Smart Chain", chainId: 56,
    payTo: requirement.payTo, resourceUrl: intent.resourceUrl, spender: B402_PERMIT2_ADDRESS,
    settlementSpender: requirement.extra.spenderAddress, currentBalance: formatUnits(balance, decimals),
    parsed: kind === "APPROVAL" ? preview.data.parsedTx : preview.data.parsedMessage,
    risks: preview.data.risks || {}, simulation: preview.data.simulationResult || null,
    authorityChanges: preview.data.authorityChanges || null,
    requireConfirmation: Boolean(preview.data.requireConfirmation),
    message: kind === "APPROVAL" ? "本次仅授权商户付款所需的有限额度，不支付研报费用。授权确认后须重新预览，再独立确认付款签名。" : "本次仅签署已审阅网络、代币、金额、收款人和资源的 Permit2 Exact 付款；签名完成后向同一商户提交一次。"
  } };
}

/** Called only by the existing confirmed execute route; pending polling never re-executes. */
export async function executeExternalResearch(state: AgentSessionState, review: ExternalReview, intent: ResearchIntent) {
  state = await enabledDeveloperMode(state);
  const owner = await resolveResearchOwner(state);
  state = owner.state;
  if (getAddress(owner.walletAddress) !== getAddress(review.address)) throw new Error("外部签名钱包地址已变化，未提交。");
  const isApproval = review.kind === "APPROVAL";
  let response;
  if (review.orderId) {
    if (isApproval) throw new Error("授权交易不可作为付款签名查询。");
    response = await agentWalletRequest<Record<string, unknown>>(state,
      `${BASE}/sign-message/result`, { body: { orderId: review.orderId }, timeoutMs: 15_000 });
  } else {
    await claimResearchOperation(intent.agentKey, intent.requestId, isApproval ? `approval:${review.requestId}` : "signature");
    response = await agentWalletRequest<Record<string, unknown>>(state,
      `${BASE}/${isApproval ? "contract-call" : "sign-message"}/execute`, { body: { requestId: review.requestId }, timeoutMs: 20_000 });
  }
  state = response.state;
  const data = response.data;
  if (isApproval) {
    const txHash = typeof data.txHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(data.txHash) ? data.txHash : null;
    const terminalStatus = typeof data.status === "string" ? data.status.toUpperCase() : "";
    if (["REJECTED", "FAILED", "EXPIRED"].includes(terminalStatus)) {
      const reason = terminalStatus === "REJECTED" ? "已被拒绝" : terminalStatus === "FAILED" ? "失败" : "已过期";
      return { state, body: { status: `APPROVAL_${terminalStatus}`, provider: intent.provider,
        approveTxHash: txHash, approvalStatus: terminalStatus,
        message: `有限额度授权${reason}，未执行研报付款签名、未提交研报付款。请核对钱包记录后重新预览。` } };
    }
    return { state, body: { status: "APPROVAL_SUBMITTED", provider: intent.provider, approveTxHash: txHash,
      approvalStatus: data.status === "PENDING_CONFIRMATION" ? "PENDING_CONFIRMATION" : txHash ? "BROADCASTED" : "UNKNOWN",
      message: data.status === "PENDING_CONFIRMATION" ? "请在 Binance App 确认这笔有限额度授权。确认上链后，重新预览并独立确认研报付款。此次尚未支付研报费用。" : "有限额度授权已提交。确认上链后，重新预览并独立确认研报付款。此次尚未支付研报费用。" } };
  }
  if (data.status === "PENDING_CONFIRMATION") {
    const orderId = z.string().min(1).max(200).parse(data.orderId);
    if (review.orderId && orderId !== review.orderId) throw new Error("钱包签名任务不匹配，付款未提交。");
    return { state, body: { status: "SIGNATURE_PENDING", provider: intent.provider,
      externalReview: encodeReview({ ...review, orderId }), message: "请在 Binance App 确认已审阅的付款签名；随后查询同一签名任务，不会再次执行签名。" } };
  }
  if (data.status !== "COMPLETED" || typeof data.signature !== "string" || !review.payment) {
    throw new Error("钱包签名尚未完成或已拒绝，付款未提交。请核对同一签名任务，勿重复签名。");
  }
  if (review.orderId && data.orderId !== review.orderId) throw new Error("钱包返回了不一致的签名任务，付款未提交。");
  const signature = normalizeAgentMessageSignature(data.signature, typeof data.signatureRecovery === "string" ? data.signatureRecovery : null);
  const payment = await bindAgentPermit2Signature(review.payment as unknown as PaymentPayload, signature, review.address);
  if (signature.length !== 132) {
    const code = await getEvmPublicClientByChainId(56)?.getCode({ address: getAddress(review.address) });
    if (!code || code === "0x") throw new Error("普通钱包返回了非标准签名，付款未提交。");
  }
  return { state, signature: { paymentHeaderName: "PAYMENT-SIGNATURE", paymentHeaderValue: encodePaymentSignatureHeader(payment as unknown as PaymentPayload),
    approveTxHash: null, binanceChainId: null, signatureExpiresAt: Number(payment.payload.permit2Authorization.deadline) } };
}
