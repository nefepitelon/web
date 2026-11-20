import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";

export async function researchPaymentRejection(response: Response, provider: "cmc" | "studio", expectedNetwork?: string) {
  const name = provider === "studio" ? "Agent Studio" : "CMC AI";
  let paymentTxHash: string | null = null;
  let settled = false;
  let rejected = false;
  let receiptCode: unknown;
  let receiptNetwork: unknown;
  let hasSettlementReference = false;
  const receipt = response.headers.get("payment-response");
  if (receipt) {
    try {
      const parsed = decodePaymentResponseHeader(receipt) as unknown as Record<string, unknown>;
      settled = parsed.success === true;
      rejected = parsed.success === false;
      receiptCode = parsed.errorReason || parsed.errorCode;
      receiptNetwork = parsed.network;
      hasSettlementReference = [parsed.transaction, parsed.txHash].some(value => value != null && value !== "");
      const hash = parsed.transaction || parsed.txHash;
      if (typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)) paymentTxHash = hash;
    } catch { /* A malformed receipt cannot prove a rejected payment is safe to repeat. */ }
  }
  const body = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
  let upstreamCode = receiptCode || body?.errorCode || body?.code || body?.error;
  const challenge = response.headers.get("payment-required");
  if (!upstreamCode && challenge) {
    try { upstreamCode = (decodePaymentRequiredHeader(challenge) as unknown as Record<string, unknown>).error; } catch { /* No reliable code. */ }
  }
  // Never echo arbitrary merchant messages: they can contain credentials or HTML.
  const safeCode = typeof upstreamCode === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(upstreamCode) ? upstreamCode : "payment_rejected";
  // The merchant explicitly returns success:false / transaction:"" for a
  // rejected settlement. The existence of a header alone is NOT a payment.
  // Conflicting, malformed or unrecognized receipts remain fail-closed.
  const uncertain = settled || hasSettlementReference || (Boolean(receipt) && (!rejected
    || (expectedNetwork !== undefined && receiptNetwork !== expectedNetwork)));
  return {
    status: uncertain ? 502 : 402,
    body: {
      error: uncertain
        ? `${name} 返回 402，但付款结算结果尚需核对。请查看钱包交易与原研报任务，勿重新签名或重复付款。`
        : `${name} 明确拒绝了本次付款结算（${safeCode}），未返回成功扣款或研报任务凭证。请先核对钱包记录；勿连续重签或重复付款。如持续出现，请由研究服务方核查结算网关。`,
      code: uncertain ? "X402_SETTLEMENT_STATUS_UNKNOWN" : "X402_PAYMENT_REJECTED",
      upstreamCode: safeCode,
      paymentStatus: uncertain ? "UNKNOWN" : "REJECTED",
      paymentTxHash,
      settlementSuccess: settled ? true : rejected ? false : null,
      receiptNetwork: typeof receiptNetwork === "string" && /^eip155:\d+$/.test(receiptNetwork) ? receiptNetwork : null,
      requiresNewPreview: !uncertain,
      retryable: false
    }
  };
}
