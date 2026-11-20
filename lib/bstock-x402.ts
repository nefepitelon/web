import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export function sameX402Requirement(left: PaymentRequirements, right: unknown) {
  if (!right || typeof right !== "object") return false;
  const candidate = right as Record<string, unknown>;
  return left.scheme.toLowerCase() === String(candidate.scheme || "").toLowerCase()
    && left.network.toLowerCase() === String(candidate.network || "").toLowerCase()
    && left.asset.toLowerCase() === String(candidate.asset || "").toLowerCase()
    && left.payTo.toLowerCase() === String(candidate.payTo || "").toLowerCase()
    && String(left.amount) === String(candidate.amount || "")
    && Number(left.maxTimeoutSeconds) === Number(candidate.maxTimeoutSeconds)
    && canonicalJson(left.extra || {}) === canonicalJson(candidate.extra || {});
}

// Studio's verifier requires the original accepted object, strict padded Base64
// and decimal uint256 strings. These wire-only changes preserve the typed-data
// values; never replace an authorization, nonce, spender or signature with a new one.
export function canonicalizeReviewedX402Payment(payment: PaymentPayload, requirement: PaymentRequirements, resourceUrl?: string): PaymentPayload {
  if (!sameX402Requirement(requirement, payment.accepted)) throw new Error("付款凭据与已审阅的付款要求不一致，未提交。");
  if (resourceUrl && payment.resource?.url && payment.resource.url !== resourceUrl) throw new Error("付款资源与已审阅服务不一致，未提交。");
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("付款授权字段格式无效，凭据未提交。");
    return value as Record<string, unknown>;
  };
  const uint = (value: unknown) => {
    if ((typeof value !== "string" || !/^(?:\d+|0x[a-fA-F0-9]+)$/.test(value))
      && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) throw new Error("付款授权数值无效，凭据未提交。");
    const parsed = BigInt(value as string | number);
    if (parsed < 0n || parsed >= 2n ** 256n) throw new Error("付款授权数值超出范围，凭据未提交。");
    return parsed.toString();
  };
  const payload = record(payment.payload);
  const method = String(requirement.extra?.assetTransferMethod || "eip3009").toLowerCase();
  let canonicalPayload = payload;
  if (method === "permit2-exact") {
    const auth = record(payload.permit2Authorization);
    const permitted = record(auth.permitted);
    const witness = record(auth.witness);
    if (String(permitted.token).toLowerCase() !== requirement.asset.toLowerCase()
      || uint(permitted.amount) !== requirement.amount
      || String(auth.spender).toLowerCase() !== String(requirement.extra?.spenderAddress).toLowerCase()
      || String(witness.to).toLowerCase() !== requirement.payTo.toLowerCase()) throw new Error("Permit2 授权与已审阅付款要求不一致，凭据未提交。");
    canonicalPayload = { signature: payload.signature, permit2Authorization: {
      permitted: { token: permitted.token, amount: uint(permitted.amount) }, from: auth.from,
      spender: String(auth.spender).toLowerCase(), nonce: uint(auth.nonce), deadline: uint(auth.deadline),
      witness: { to: witness.to, validAfter: uint(witness.validAfter) }
    } };
  } else if (method === "eip3009") {
    const auth = record(payload.authorization);
    if (String(auth.to).toLowerCase() !== requirement.payTo.toLowerCase() || uint(auth.value) !== requirement.amount) throw new Error("付款授权金额或收款人与已审阅要求不一致，凭据未提交。");
    canonicalPayload = { signature: payload.signature, authorization: {
      from: auth.from, to: auth.to, value: uint(auth.value), validAfter: uint(auth.validAfter), validBefore: uint(auth.validBefore), nonce: auth.nonce
    } };
  }
  return { ...payment, accepted: requirement, payload: canonicalPayload,
    ...(resourceUrl ? { resource: { ...payment.resource, url: resourceUrl } } : {}) };
}
