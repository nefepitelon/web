import { CURATED_B402_SPENDERS } from "@bnb-chain/b402/client";
import { agentX402RequirementSchema } from "./bstock-agentic-wallet-x402";

export type AgentPaymentOption = {
  index: number; status: "READY_TO_SIGN" | "ACTION_REQUIRED" | "NOT_SIGNABLE";
  reasons: string[]; binanceChainId?: string | null; needApproveFirst?: boolean;
};

export function selectableNativeAgentOption(option: AgentPaymentOption) {
  if (!option.binanceChainId || !/^\d+$/.test(option.binanceChainId)) return false;
  if (option.reasons.some(reason => /INSUFFICIENT|UNSUPPORTED|NOT_SUPPORTED|INVALID|BLOCKED|NO_WALLET/i.test(reason))) return false;
  return option.status === "READY_TO_SIGN" || (option.status === "ACTION_REQUIRED" && option.needApproveFirst === true);
}

/** Only the documented missing native method may use the reviewed Developer Mode rail.
 * Security, balance, policy and network blocks are never bypassed. */
export function externalPermit2Candidate(option: AgentPaymentOption, requirement: unknown) {
  const parsed = agentX402RequirementSchema.safeParse(requirement);
  if (!parsed.success || option.status !== "NOT_SIGNABLE" || !option.reasons.includes("UNSUPPORTED_METHOD")
    || option.reasons.some(reason => reason !== "UNSUPPORTED_METHOD")) return false;
  const req = parsed.data;
  const trusted = CURATED_B402_SPENDERS[req.network]?.exact;
  return req.scheme === "exact" && req.network === "eip155:56"
    && req.extra.assetTransferMethod === "permit2-exact" && Boolean(trusted)
    && String(req.extra.spenderAddress).toLowerCase() === trusted!.toLowerCase();
}

const REASONS: Record<string, string> = {
  INSUFFICIENT_BALANCE: "该网络的付款代币余额不足，请补足后重新预览",
  INSUFFICIENT_TOKEN_BALANCE: "该网络的付款代币余额不足",
  UNSUPPORTED_NETWORK: "Agentic Wallet 尚不支持此付款网络",
  UNSUPPORTED_SCHEME: "钱包不支持商户的付款协议",
  UNSUPPORTED_METHOD: "钱包原生付款接口不支持此转账方法",
  INVALID_ACCEPT_STRUCTURE: "钱包无法验证商户付款要求，已阻止签名",
  NO_WALLET_ON_CHAIN: "当前钱包尚无此网络地址",
  BLOCKED_BY_SECURITY_CHECK: "钱包安全检查拦截了此付款方式",
  BLOCKED_DAILY_LIMIT_REACHED: "钱包今日 x402 额度已用尽",
  PERMIT2_APPROVAL_REQUIRED: "需单独确认一次性 Permit2 授权"
};

export function agentPaymentReasonText(reasons: string[]) {
  return reasons.map(reason => REASONS[reason] || (reason.startsWith("BLOCKED") ? "付款受到钱包策略限制" : "此付款方式暂不可用")).join("；");
}
