export const BSTOCK_MAX_POSITION_PCT = 50;
export const BSTOCK_MAX_POSITION_RATIO = BSTOCK_MAX_POSITION_PCT / 100;

export function bstockPositionLimitUsd(totalWalletValueUsd: number) {
  return Math.max(0, totalWalletValueUsd) * BSTOCK_MAX_POSITION_RATIO;
}

export function isBstockPositionWithinLimit(postTradeExposureUsd: number, totalWalletValueUsd: number) {
  const limitUsd = bstockPositionLimitUsd(totalWalletValueUsd);
  return Number.isFinite(postTradeExposureUsd)
    && limitUsd > 0
    && postTradeExposureUsd < limitUsd;
}
