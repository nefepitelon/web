// PAPI accountEquity already applies Binance's collateral haircuts. Never use
// virtualMaxWithdrawAmount (a transfer limit) as executable buying power.
export const PORTFOLIO_MIN_UNIMMR = 1.5;

export function accountNumber(value: unknown, label: string) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value))) {
    throw new Error(`PAPI ${label} 不完整，禁止新增风险`);
  }
  return Number(value);
}

export function accountRows(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error(`PAPI ${label} 快照不完整`);
  return value as Array<Record<string, unknown>>;
}

export function portfolioRiskSnapshot(account: Record<string, unknown>, um: unknown, balances: unknown, cm: unknown) {
  const positions = accountRows(um, "UM 持仓");
  const assets = accountRows(balances, "资产/负债");
  const cmPositions = accountRows(cm, "CM 持仓");
  if (account.accountStatus !== "NORMAL") throw new Error(`PAPI 统一账户状态 ${String(account.accountStatus ?? "UNKNOWN")}，禁止新增仓位；仅允许风险减仓`);
  const collateralEquity = accountNumber(account.accountEquity, "折算权益");
  const actualEquity = accountNumber(account.actualEquity, "净权益");
  const equity = Math.min(collateralEquity, actualEquity);
  const initialMargin = accountNumber(account.accountInitialMargin, "初始保证金");
  const maintenanceMargin = accountNumber(account.accountMaintMargin, "维持保证金");
  const uniMMR = accountNumber(account.uniMMR, "uniMMR");
  if (initialMargin < 0 || maintenanceMargin < 0 || (maintenanceMargin > 0 && (uniMMR < PORTFOLIO_MIN_UNIMMR || equity / maintenanceMargin < PORTFOLIO_MIN_UNIMMR))) throw new Error(`PAPI 保证金安全缓冲不足：uniMMR 必须 ≥ ${PORTFOLIO_MIN_UNIMMR}`);
  // The dedicated account is an UM execution account, not a loan/CM trading
  // account. Shared collateral is supported; unmodelled leveraged books veto.
  if (cmPositions.some((p) => accountNumber(p.positionAmt, "CM 仓位数量") !== 0)) throw new Error("PAPI 专用账户存在 COIN-M 仓位；请勿与 TideSight UM 策略共用风险资金");
  for (const asset of assets) {
    if (accountNumber(asset.crossMarginBorrowed, "杠杆借款") !== 0 || accountNumber(asset.crossMarginInterest, "借款利息") !== 0 || accountNumber(asset.negativeBalance, "负余额") !== 0 || accountNumber(asset.crossMarginLocked, "杠杆挂单占用") !== 0) throw new Error("PAPI 专用账户存在杠杆借款、负余额或杠杆挂单占用；禁止新增 UM 风险");
  }
  let riskExposureNotional = 0, unrealizedPnl = 0, openPositionCount = 0;
  const positionSymbols: string[] = [];
  for (const p of positions) {
    const quantity = accountNumber(p.positionAmt, "UM 仓位数量");
    if (!quantity) continue;
    if (p.positionSide !== "BOTH" || typeof p.symbol !== "string" || !p.symbol.endsWith("USDT")) throw new Error("PAPI 专用账户须使用 One-way Mode 和 USDT 本位持仓");
    const notional = accountNumber(p.notional, "UM 名义敞口");
    if (!notional || Math.sign(notional) !== Math.sign(quantity)) throw new Error("PAPI UM 仓位敞口不可确认");
    riskExposureNotional += Math.abs(notional);
    unrealizedPnl += accountNumber(p.unRealizedProfit, "UM 未实现损益");
    openPositionCount++; positionSymbols.push(p.symbol);
  }
  const openLoss = account.totalMarginOpenLoss == null || account.totalMarginOpenLoss === "" ? 0 : Math.abs(accountNumber(account.totalMarginOpenLoss, "挂单浮亏"));
  const computedAvailable = Math.max(0, equity - initialMargin - openLoss);
  const exchangeAvailable = account.totalAvailableBalance == null || account.totalAvailableBalance === "" ? computedAvailable : accountNumber(account.totalAvailableBalance, "可用保证金");
  // Conservatively reserve new initial margin as if it were maintenance margin.
  // This cap also protects manual sizing and does not claim a liquidation price.
  const safetyAvailable = Math.max(0, equity / PORTFOLIO_MIN_UNIMMR - maintenanceMargin);
  const availableBalance = Math.max(0, Math.min(computedAvailable, exchangeAvailable, safetyAvailable));
  return { equity, availableBalance, riskExposureNotional, unrealizedPnl, openPositionCount, positionSymbols,
    portfolioMargin: { uniMMR, minUniMMR: PORTFOLIO_MIN_UNIMMR, collateralEquity, actualEquity, initialMargin, maintenanceMargin, accountStatus: "NORMAL", collateralAssets: assets.map((a) => String(a.asset)), riskScope: "DEDICATED_USDT_UM" } };
}
