/** Pure, deterministic checks shared by the API and its regression tests. */
const REQUIRED_ZERO_FLAGS = [
  "is_honeypot", "cannot_buy", "cannot_sell_all", "is_proxy", "is_mintable",
  "hidden_owner", "can_take_back_ownership", "owner_change_balance",
  "transfer_pausable", "is_blacklisted", "slippage_modifiable", "selfdestruct"
];

/** @param {Record<string, unknown> | null} audit */
function evaluateAudit(audit) {
  const missing = [];
  const detected = [];
  if (!audit) return { passed: false, missing: ["GoPlus 审计数据缺失"], detected };
  if (audit.is_open_source !== "1") {
    (audit.is_open_source === "0" ? detected : missing).push("is_open_source");
  }
  for (const flag of REQUIRED_ZERO_FLAGS) {
    if (audit[flag] === "1") detected.push(flag);
    else if (audit[flag] !== "0") missing.push(flag);
  }
  for (const field of ["buy_tax", "sell_tax"]) {
    const value = audit[field];
    // Blank strings, null and absent values mean unknown, never zero tax.
    if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) missing.push(field);
    else if (Number(value) !== 0) detected.push(`${field}=${value}`);
  }
  return { passed: !missing.length && !detected.length, missing, detected };
}

/** @param {{walletAddress:string, transaction:{to:string,data:string,value:string}}} quote
 * @param {{from:string,to:string|null,input:string,value:bigint,chainId?:number}} transaction */
function transactionMatchesQuote(quote, transaction) {
  return transaction.from.toLowerCase() === quote.walletAddress.toLowerCase()
    && transaction.to?.toLowerCase() === quote.transaction.to.toLowerCase()
    && transaction.input.toLowerCase() === quote.transaction.data.toLowerCase()
    && transaction.value.toString() === quote.transaction.value
    && (transaction.chainId === undefined || transaction.chainId === 56);
}

/** @param {{status:string,txHash?:string|null}} record @param {string} hash */
function registrationDecision(record, hash) {
  if (record.txHash) return record.txHash.toLowerCase() === hash.toLowerCase() ? "idempotent" : "conflict";
  return record.status === "QUOTED" ? "register" : "conflict";
}

/** @param {{notionalUsd:number,equityUsd:number,stopLossPct:number,liquidityUsd:number,existingExposureUsd:number,dailyReservedUsd:number}}
 * input @param {{perOrderNotionalLimit:number,dailyNotionalLimit:number,riskPerTradePct:number,maxPortfolioExposurePct:number}} policy */
function evaluateBuyBudget(input, policy) {
  const reasons = [];
  const values = [...Object.values(input), policy.perOrderNotionalLimit, policy.dailyNotionalLimit, policy.riskPerTradePct, policy.maxPortfolioExposurePct];
  if (values.some(value => !Number.isFinite(value)) || input.notionalUsd <= 0 || input.equityUsd <= 0 || input.stopLossPct <= 0 || input.liquidityUsd <= 0) {
    return { passed: false, reasons: ["资金、流动性或风险额度数据缺失"] };
  }
  if (input.notionalUsd > Math.min(2_000, policy.perOrderNotionalLimit)) reasons.push("超过单笔名义金额上限");
  if (input.dailyReservedUsd + input.notionalUsd > policy.dailyNotionalLimit) reasons.push("超过 UTC 当日累计买入预算（含待确认订单）");
  if (input.notionalUsd > input.liquidityUsd * 0.005) reasons.push("单笔金额超过池流动性的 0.5%");
  if (input.notionalUsd * input.stopLossPct / 100 > input.equityUsd * policy.riskPerTradePct / 100) reasons.push("预计止损风险超过单笔风险预算");
  if (input.existingExposureUsd + input.notionalUsd > input.equityUsd * policy.maxPortfolioExposurePct / 100) reasons.push("超过 STM 钱包组合敞口上限");
  return { passed: !reasons.length, reasons };
}

/** FIFO cost basis covers only actual STM receipt-settled fills. Unknown lots
 * are explicitly reported instead of assuming zero cost or zero loss.
 * @param {Array<{status:string, walletAddress:string,tokenAddress:string,side:string,createdAt:number,completedAt?:string,actualInput?:string,actualOutput?:string}>} fills
 * @param {string} day */
function trackedDailyPnl(fills, day) {
  const lots = new Map();
  let realizedUsd = 0;
  let unknownCostBasis = false;
  for (const fill of [...fills].filter(row => row.status === "CONFIRMED").sort((a, b) => a.createdAt - b.createdAt)) {
    const key = `${fill.walletAddress.toLowerCase()}:${fill.tokenAddress.toLowerCase()}`;
    const date = fill.completedAt || new Date(fill.createdAt).toISOString();
    const input = Number(fill.actualInput);
    const output = Number(fill.actualOutput);
    if (!(input > 0) || !(output > 0)) { if (date.startsWith(day)) unknownCostBasis = true; continue; }
    const queue = lots.get(key) || [];
    if (fill.side === "buy") queue.push({ quantity: output, cost: input });
    else {
      let remaining = input;
      let cost = 0;
      while (remaining > 1e-12 && queue.length) {
        const lot = queue[0];
        const used = Math.min(remaining, lot.quantity);
        cost += lot.cost * used / lot.quantity;
        lot.cost *= (lot.quantity - used) / lot.quantity;
        lot.quantity -= used;
        remaining -= used;
        if (lot.quantity < 1e-12) queue.shift();
      }
      if (date.startsWith(day)) {
        if (remaining > 1e-8 * Math.max(input, 1)) unknownCostBasis = true;
        else realizedUsd += output - cost;
      }
    }
    lots.set(key, queue);
  }
  return { realizedUsd, unknownCostBasis, basis: "STM receipt fills FIFO; stablecoin nominal value; gas excluded" };
}

/** @param {{equity:number,dayStartEquity:number,dailyPnl:number,observedAt:number,reconciliationHealthy:boolean,killSwitch:boolean,unresolvedOrders:boolean,openPositions:ReadonlyArray<{symbol:string,notional:number}>,pendingEntries:ReadonlyArray<{symbol:string,notional:number}>}} account
 * @param {{dailyLossLimitPct:number,maxOpenPositions:number,maxPortfolioExposurePct:number,perOrderNotionalLimit:number,riskPerTradePct:number,maxLeverage:number}} policy
 * @param {{symbol:string,notional:number,stopRisk:number,leverage:number}} [proposed] */
function evaluateCexAccountRisk(account, policy, proposed) {
  const reasons = [];
  const limits = [policy.dailyLossLimitPct, policy.maxOpenPositions, policy.maxPortfolioExposurePct, policy.perOrderNotionalLimit, policy.riskPerTradePct, policy.maxLeverage];
  if (![account.equity, account.dayStartEquity, account.dailyPnl, account.observedAt, ...limits].every(Number.isFinite) || account.equity <= 0 || account.dayStartEquity <= 0 || limits.some(value => value <= 0)) reasons.push("交易所日内风险基准无效");
  if (Date.now() - account.observedAt > 60_000 || account.observedAt > Date.now() + 1_000) reasons.push("交易所账户风险快照已过期");
  if (account.killSwitch !== false || account.reconciliationHealthy !== true || account.unresolvedOrders !== false) reasons.push("账户熔断、待核订单或五分钟对账健康检查未通过");
  if (account.dailyPnl <= -account.dayStartEquity * policy.dailyLossLimitPct / 100) reasons.push("合约账户已达到当日日亏损上限（含已实现与基准后浮盈变化，排除划转）");
  const entries = [...account.openPositions, ...account.pendingEntries];
  if (entries.some(row => !Number.isFinite(row.notional) || row.notional < 0)) reasons.push("账户仓位或挂单敞口无效");
  if (entries.length + (proposed ? 1 : 0) > policy.maxOpenPositions) reasons.push("账户仓位和待执行订单超过数量上限");
  const exposure = entries.reduce((sum, row) => sum + row.notional, 0);
  if (exposure + (proposed?.notional ?? 0) > Math.min(account.equity, account.dayStartEquity) * policy.maxPortfolioExposurePct / 100) reasons.push("交易所账户总敞口超过组合上限");
  if (proposed) {
    if (![proposed.notional, proposed.stopRisk, proposed.leverage].every(Number.isFinite) || proposed.notional <= 0 || proposed.stopRisk <= 0 || proposed.leverage < 1) reasons.push("执行计划风险金额无效");
    if (proposed.notional > policy.perOrderNotionalLimit || proposed.leverage > policy.maxLeverage) reasons.push("执行计划超过当前金额或杠杆限额");
    if (proposed.stopRisk > Math.min(account.equity, account.dayStartEquity) * policy.riskPerTradePct / 100) reasons.push("实时止损风险超过当前单笔预算");
    if (entries.some(row => row.symbol === proposed.symbol)) reasons.push("该交易对已有账户仓位或待执行订单，禁止混入手动仓位");
  }
  return { passed: !reasons.length, reasons };
}

/** @param {{asOf:string,candidates:ReadonlyArray<{id:string,symbol:string,market:string}>,signals:ReadonlyArray<{candidateId:string,strategy:string,status:string,actionable:boolean,direction:string,expiresAt:string,asOf:string,missing:ReadonlyArray<string>}>,strategies:ReadonlyArray<{id:string,enabled:boolean}>,state:{persistent:boolean},capabilities:{persistence:boolean}}} dashboard
 * @param {{symbol:string,strategy:string,side:string}} requested @param {number} now */
function evaluateCexSignalPermission(dashboard, requested, now) {
  const reasons = [];
  if (!dashboard.state.persistent || !dashboard.capabilities.persistence) reasons.push("策略持久化状态不可用");
  const captured = Date.parse(dashboard.asOf);
  if (!Number.isFinite(captured) || captured > now || now - captured > 6 * 60_000) reasons.push("STM 数据采集超过六分钟或时间无效");
  // Source adapters identify CEX evidence by base ticker (cex:BTC), while
  // execution retains the exact Binance pair (BTCUSDT). Remove only one
  // anchored quote suffix; never strip embedded USDT or normalize chain names.
  const pair = /^([A-Z0-9]{2,20})USDT$/.exec(requested.symbol);
  const evidenceSymbol = pair?.[1];
  if (!evidenceSymbol) reasons.push("执行交易对必须是完整的大写 Binance USDT 交易对");
  const candidate = evidenceSymbol ? dashboard.candidates.find(row => row.id === `cex:${evidenceSymbol}` && row.symbol === evidenceSymbol && row.market === "cex") : undefined;
  if (!candidate) reasons.push("该完整交易对不在当前 CEX 候选池，不能以同名链上资产代替");
  if (requested.side !== "LONG") reasons.push("当前 S1–S3 仅验证做多开仓证据，不能转为开空信号");
  const strategy = dashboard.strategies.find(row => row.id === requested.strategy);
  if (!strategy?.enabled) reasons.push("所选策略未启用");
  const signal = candidate && dashboard.signals.find(row => row.candidateId === candidate.id && row.strategy === requested.strategy);
  if (!signal || !signal.actionable || signal.status !== "ready" || signal.direction !== "long" || signal.missing.length || Date.parse(signal.expiresAt) <= now || !Number.isFinite(Date.parse(signal.expiresAt)) || !Number.isFinite(Date.parse(signal.asOf)) || Date.parse(signal.asOf) > now || now - Date.parse(signal.asOf) > 60_000) reasons.push("所选策略尚无证据齐备且未过期的 ready 做多信号");
  const veto = candidate && dashboard.signals.find(row => row.candidateId === candidate.id && row.strategy === "S5");
  if (!dashboard.strategies.some(row => row.id === "S5" && row.enabled) || !veto || veto.status !== "watch" || veto.direction !== "observe" || veto.missing.length || !Number.isFinite(Date.parse(veto.expiresAt)) || Date.parse(veto.expiresAt) <= now || !Number.isFinite(Date.parse(veto.asOf)) || Date.parse(veto.asOf) > now || now - Date.parse(veto.asOf) > 60_000) reasons.push("S5 拥挤过滤缺失、关闭、证据未知或已触发风险，禁止实盘新开仓");
  return { passed: !reasons.length, reasons };
}

/** @param {{status:string,expiresAt:number,policyFingerprint:string}} quote @param {number} now @param {string} fingerprint */
function signingQuotePermission(quote, now, fingerprint) {
  if (quote.status !== "QUOTED") return { passed: false, reason: "报价已经提交或结束，不能再次签署" };
  if (!Number.isFinite(quote.expiresAt) || quote.expiresAt <= now + 5_000) return { passed: false, reason: "报价已过期或距到期不足五秒，请重新报价" };
  if (quote.policyFingerprint !== fingerprint) return { passed: false, reason: "实盘授权或风险额度已变更，请重新报价" };
  return { passed: true, reason: "" };
}

/** @param {{side:string,referencePrice:number,stopLoss:number,takeProfit:number}} input */
function refreshedProtectionValid(input) {
  if (![input.referencePrice, input.stopLoss, input.takeProfit].every(value => Number.isFinite(value) && value > 0)) return false;
  if (input.side === "LONG") return input.stopLoss < input.referencePrice && input.referencePrice < input.takeProfit;
  if (input.side === "SHORT") return input.takeProfit < input.referencePrice && input.referencePrice < input.stopLoss;
  return false;
}

module.exports = { evaluateAudit, transactionMatchesQuote, registrationDecision, evaluateBuyBudget, trackedDailyPnl, evaluateCexAccountRisk, evaluateCexSignalPermission, signingQuotePermission, refreshedProtectionValid };
