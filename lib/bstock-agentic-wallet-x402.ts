import { decodePaymentSignatureHeader } from "@x402/core/http";
import { z } from "zod";
import { sameX402Requirement } from "./bstock-x402";

export const agentX402RequirementSchema = z.object({
  scheme: z.string().min(1),
  network: z.string().regex(/^eip155:[1-9]\d*$/).transform((network) => network as `eip155:${number}`),
  asset: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(/^[1-9]\d*$/),
  payTo: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  maxTimeoutSeconds: z.number().finite().positive(),
  extra: z.record(z.string(), z.unknown()).default({})
}).passthrough();

export const reviewedAgentX402OptionSchema = z.object({
  index: z.number().int().positive(),
  binanceChainId: z.string().regex(/^[1-9]\d*$/),
  requirement: agentX402RequirementSchema
}).refine((option) => option.requirement.network === `eip155:${option.binanceChainId}`);

export class AgentX402ValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AgentX402ValidationError";
  }
}

// Binance sign.binanceChainId describes approveTxHash, not the payment itself.
// It is explicitly null for EIP-3009 and already-approved Permit2 payments.
export function validateAgentX402Signature(signature: {
  paymentHeaderName: string;
  paymentHeaderValue: string;
  approveTxHash?: string | null;
  binanceChainId?: string | null;
  signatureExpiresAt: number;
}, reviewed: z.infer<typeof reviewedAgentX402OptionSchema>, resourceUrl: string, now = Date.now()) {
  if (signature.paymentHeaderName.toUpperCase() !== "PAYMENT-SIGNATURE") {
    throw new AgentX402ValidationError("X402_HEADER_INVALID", "Agentic Wallet 返回了不受支持的付款签名头；研究服务未重放。");
  }
  let payment;
  try {
    payment = decodePaymentSignatureHeader(signature.paymentHeaderValue);
  } catch {
    throw new AgentX402ValidationError("X402_PAYLOAD_INVALID", "Agentic Wallet 付款凭据无法解码；研究服务未重放。");
  }
  if (!payment || payment.x402Version !== 2 || !sameX402Requirement(reviewed.requirement, payment.accepted)) {
    throw new AgentX402ValidationError("X402_REVIEW_MISMATCH", "Agentic Wallet 付款凭据的网络、代币、金额或收款要求与已审阅选项不一致；研究服务未重放。");
  }
  if (payment.resource?.url && payment.resource.url !== resourceUrl) {
    throw new AgentX402ValidationError("X402_RESOURCE_MISMATCH", "Agentic Wallet 付款凭据对应的研究服务不一致；研究服务未重放。");
  }
  if (signature.approveTxHash && (!/^0x[a-fA-F0-9]{64}$/.test(signature.approveTxHash)
    || signature.binanceChainId !== reviewed.binanceChainId)) {
    throw new AgentX402ValidationError("X402_APPROVAL_NETWORK_MISMATCH", "Agentic Wallet 授权交易所在网络与已审阅付款网络不一致；研究服务未重放。");
  }
  if (!signature.approveTxHash && signature.binanceChainId != null && signature.binanceChainId !== reviewed.binanceChainId) {
    throw new AgentX402ValidationError("X402_APPROVAL_METADATA_MISMATCH", "Agentic Wallet 返回了不一致的授权网络信息；研究服务未重放。");
  }
  if (!Number.isFinite(signature.signatureExpiresAt) || signature.signatureExpiresAt * 1000 <= now + 2_000) {
    throw new AgentX402ValidationError("X402_SIGNATURE_EXPIRED", "付款签名已接近过期，未向研究服务重放。请重新预览。");
  }
  return { paymentHeaderName: "PAYMENT-SIGNATURE", network: reviewed.requirement.network };
}
