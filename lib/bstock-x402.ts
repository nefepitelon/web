import type { PaymentRequirements } from "@x402/core/types";

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
