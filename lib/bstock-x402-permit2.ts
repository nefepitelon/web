import { buildPermit2ExactPayment, isPermit2PaymentPayload, recoverPermit2ExactPayer } from "@bnb-chain/b402";
import { B402_PERMIT2_ADDRESS, CURATED_B402_SPENDERS } from "@bnb-chain/b402/client";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { getAddress, parseSignature, serializeSignature, type LocalAccount } from "viem";

export { B402_PERMIT2_ADDRESS };
const BSC_STABLES = new Set([
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", "0x55d398326f99059ff775485246999027b3197955"
]);

export function assertAgentPermit2Requirement(requirement: PaymentRequirements) {
  const spender = CURATED_B402_SPENDERS[requirement.network]?.exact;
  if (requirement.network !== "eip155:56" || requirement.scheme !== "exact"
    || requirement.extra?.assetTransferMethod !== "permit2-exact" || !spender
    || String(requirement.extra.spenderAddress).toLowerCase() !== spender.toLowerCase()
    || !BSC_STABLES.has(requirement.asset.toLowerCase())
    || !/^[1-9]\d*$/.test(requirement.amount) || BigInt(requirement.amount) > 10n ** 18n) {
    throw new Error("此付款要求未通过受信任的 BSC Permit2 Exact 网络、代币、结算合约与单笔额度校验。");
  }
  return spender;
}

/** The real B402 SDK constructs the typed data; this capture performs NO signing. */
export async function buildUnsignedAgentPermit2(requirement: PaymentRequirements, address: string, resourceUrl: string) {
  const spender = assertAgentPermit2Requirement(requirement);
  let typedData: Record<string, unknown> | undefined;
  const account = {
    address: getAddress(address),
    signTypedData: async (value: unknown) => {
      typedData = JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item));
      return `0x${"00".repeat(65)}`;
    }
  } as unknown as LocalAccount;
  const deadline = Math.floor(Date.now() / 1000) + Math.min(requirement.maxTimeoutSeconds, 180);
  const payment = await buildPermit2ExactPayment({
    account, requirements: requirement as unknown as Parameters<typeof buildPermit2ExactPayment>[0]["requirements"],
    trustedSpenders: [spender], resourceUrl, deadline: BigInt(deadline), maxSettlementSeconds: 180
  });
  if (!typedData) throw new Error("B402 SDK 未生成可审阅的 EIP-712 消息，未请求签名。");
  return { payment: payment as unknown as PaymentPayload, typedData, deadline };
}

export function normalizeAgentMessageSignature(value: string, recovery?: string | null) {
  let hex = value.replace(/^0x/, "");
  if (/^[a-fA-F0-9]{128}$/.test(hex) && recovery != null) {
    const normalized = recovery.replace(/^0x/, "");
    if (!/^(?:00|01|1b|1c)$/i.test(normalized)) throw new Error("钱包返回了无效的签名恢复位，付款未提交。");
    hex += normalized;
  }
  if (!/^(?:[a-fA-F0-9]{2}){65,2048}$/.test(hex)) throw new Error("钱包未返回有效的付款签名，付款未提交。");
  const signature = `0x${hex}` as `0x${string}`;
  return hex.length === 130 ? serializeSignature(parseSignature(signature)) : signature;
}

export async function bindAgentPermit2Signature(payment: PaymentPayload, signature: string, expectedAddress: string) {
  assertAgentPermit2Requirement(payment.accepted);
  const signed = { ...payment, payload: { ...payment.payload, signature } };
  if (!isPermit2PaymentPayload(signed)) throw new Error("钱包付款授权与已审阅的 Permit2 要求不一致，付款未提交。");
  const auth = signed.payload.permit2Authorization;
  if (getAddress(auth.from) !== getAddress(expectedAddress)
    || BigInt(auth.deadline) <= BigInt(Math.floor(Date.now() / 1000) + 5)) {
    throw new Error("钱包付款地址不匹配或签名已过期，付款未提交。");
  }
  if (/^0x[a-fA-F0-9]{130}$/.test(signature)
    && getAddress(await recoverPermit2ExactPayer(signed)) !== getAddress(expectedAddress)) {
    throw new Error("钱包 EIP-712 签名者与已验证钱包不一致，付款未提交。");
  }
  return signed;
}
