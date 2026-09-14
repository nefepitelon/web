import { BstockSubmissionClaimError } from "@/lib/bstock-trade-submission-claim";

type TimedSource = { deliveryMode?: string; fetchedAt?: string | null };
type ExecutionGuardInput = {
  side: "buy" | "sell";
  market: TimedSource & { registrySourceAvailable: boolean };
  asset: { contractAddress: string; multiplier: string; marketUpdatedAt: string | null };
  reviewedAsset: { contractAddress?: unknown; multiplier?: unknown };
  cmc: TimedSource | null;
  reportCompletedAt?: Date | string | null;
  settings: { budgetUsd: number; orderUsd: number };
  notionalUsd: number;
  totalWalletValueUsd: number;
  postTradeExposureUsd: number;
  robotCostUsd: number;
  botEquityUsd: number;
  gasUsd: number;
  now?: number;
};

export function validateBstockAutoExecution(input: ExecutionGuardInput) {
  const now = input.now ?? Date.now();
  const fresh = (value: Date | string | null | undefined, maxAge: number) => {
    const time = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
    const age = now - time;
    return Number.isFinite(age) && age >= -60_000 && age <= maxAge;
  };
  const reject = (message: string, code: string): never => { throw new BstockSubmissionClaimError(message, code); };
  if (!input.market.registrySourceAvailable || input.market.deliveryMode === "CACHE_STALE"
    || !fresh(input.market.fetchedAt, 120_000) || !fresh(input.asset.marketUpdatedAt, 120_000)) {
    reject("提交前官方标的或实时行情已过期，自动订单未广播。", "AUTOMATION_MARKET_STALE");
  }
  if (typeof input.reviewedAsset.contractAddress !== "string" || typeof input.reviewedAsset.multiplier !== "string"
    || input.reviewedAsset.contractAddress.toLowerCase() !== input.asset.contractAddress.toLowerCase()
    || input.reviewedAsset.multiplier !== input.asset.multiplier) {
    reject("提交前标的合约或拆股倍率已变化，自动订单未广播。", "AUTOMATION_ASSET_CHANGED");
  }
  if (input.side === "sell") return;
  if (!input.cmc || input.cmc.deliveryMode === "CACHE_STALE" || !fresh(input.cmc.fetchedAt, 120_000)) {
    reject("提交前 CMC 实时信号已过期，自动订单未广播。", "AUTOMATION_CMC_STALE");
  }
  if (!fresh(input.reportCompletedAt, 7 * 86_400_000)) {
    reject("提交前无法验证七日内的已付费研报，自动订单未广播。", "AUTOMATION_RESEARCH_STALE");
  }
  if (![input.notionalUsd, input.settings.orderUsd, input.settings.budgetUsd, input.totalWalletValueUsd,
    input.postTradeExposureUsd, input.robotCostUsd, input.botEquityUsd, input.gasUsd].every(Number.isFinite)
    || input.notionalUsd <= 0 || input.settings.orderUsd <= 0 || input.settings.budgetUsd <= 0
    || input.totalWalletValueUsd <= 0 || input.postTradeExposureUsd < 0 || input.robotCostUsd < 0
    || input.gasUsd < 0) {
    reject("自动订单预算或费用数据不完整，订单未广播。", "AUTOMATION_BUDGET_UNAVAILABLE");
  }
  if (input.notionalUsd > input.settings.orderUsd + 0.000001) {
    reject("提交前实时订单金额超过配置的单笔上限，自动订单未广播。", "AUTOMATION_ORDER_LIMIT");
  }
  if (input.postTradeExposureUsd >= input.totalWalletValueUsd * 0.25) {
    reject("提交前标的仓位未严格低于钱包净值的 25%，自动订单未广播。", "AUTOMATION_POSITION_LIMIT");
  }
  if (input.robotCostUsd + input.notionalUsd + 2 * input.gasUsd > Math.min(input.settings.budgetUsd, input.botEquityUsd) + 0.000001) {
    reject("提交前持仓成本、订单与往返 Gas 预留超过可用自动交易预算，订单未广播。", "AUTOMATION_TOTAL_BUDGET");
  }
}
