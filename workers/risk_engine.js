const { createHash, randomUUID } = require("node:crypto");

const ENGINE_VERSION = "alpha-execution-v2.1";
const EXECUTION_MODES = new Set(["paper", "mock_exchange", "testnet", "live"]);
const BINANCE_MODES = new Set(["live", "testnet"]);
const AUTOMATION_STRATEGIES = ["p1_three_source", "p2_two_source", "strong_signal", "same_coin_x2", "anomaly"];
const DEFAULT_POLICY = Object.freeze({
  riskPerTradePct: 0.75,
  maxRiskPerTradePct: 1.5,
  maxLeverage: 3,
  absoluteMaxLeverage: 20,
  dailyLossLimitPct: 2,
  dedupeWindowMinutes: 15,
  maxOpenPositions: 6,
  maxPortfolioExposurePct: 50,
  minRiskRewardRatio: 1.5,
  minStopDistancePct: 0.25,
  maxStopDistancePct: 15,
  minAlphaScore: 75,
  maxSlippageBps: 25,
  planTtlMinutes: 5,
  perOrderNotionalLimit: 10_000,
  dailyNotionalLimit: 50_000
});

function finiteNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 8) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeSymbol(value) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;
  return compact.endsWith("USDT") ? compact : `${compact}USDT`;
}

function normalizeSide(value) {
  const normalized = String(value || "").toUpperCase();
  if (["LONG", "BUY", "多", "做多"].includes(normalized)) return "LONG";
  if (["SHORT", "SELL", "空", "做空"].includes(normalized)) return "SHORT";
  return null;
}

function normalizeMode(value) {
  return String(value || "paper").trim().toLowerCase();
}

function normalizeMarket(value) {
  return String(value || "futures").trim().toLowerCase() === "spot" ? "spot" : "futures";
}

function resolvePolicy(input = {}) {
  return {
    riskPerTradePct: clamp(finiteNumber(input.riskPerTradePct, DEFAULT_POLICY.riskPerTradePct), 0.1, DEFAULT_POLICY.maxRiskPerTradePct),
    maxRiskPerTradePct: DEFAULT_POLICY.maxRiskPerTradePct,
    maxLeverage: clamp(finiteNumber(input.maxLeverage, DEFAULT_POLICY.maxLeverage), 1, DEFAULT_POLICY.absoluteMaxLeverage),
    absoluteMaxLeverage: DEFAULT_POLICY.absoluteMaxLeverage,
    dailyLossLimitPct: clamp(Math.abs(finiteNumber(input.dailyLossLimitPct, DEFAULT_POLICY.dailyLossLimitPct)), 0.5, 3.5),
    dedupeWindowMinutes: clamp(finiteNumber(input.dedupeWindowMinutes, DEFAULT_POLICY.dedupeWindowMinutes), 5, 60),
    maxOpenPositions: clamp(Math.trunc(finiteNumber(input.maxOpenPositions, DEFAULT_POLICY.maxOpenPositions)), 1, 12),
    maxPortfolioExposurePct: clamp(finiteNumber(input.maxPortfolioExposurePct, DEFAULT_POLICY.maxPortfolioExposurePct), 10, 75),
    minRiskRewardRatio: clamp(finiteNumber(input.minRiskRewardRatio, DEFAULT_POLICY.minRiskRewardRatio), 1, 5),
    minStopDistancePct: DEFAULT_POLICY.minStopDistancePct,
    maxStopDistancePct: DEFAULT_POLICY.maxStopDistancePct,
    minAlphaScore: clamp(finiteNumber(input.minAlphaScore, DEFAULT_POLICY.minAlphaScore), 50, 95),
    maxSlippageBps: clamp(finiteNumber(input.maxSlippageBps, DEFAULT_POLICY.maxSlippageBps), 5, 100),
    planTtlMinutes: DEFAULT_POLICY.planTtlMinutes,
    perOrderNotionalLimit: Math.max(5, finiteNumber(input.perOrderNotionalLimit, DEFAULT_POLICY.perOrderNotionalLimit)),
    dailyNotionalLimit: Math.max(5, finiteNumber(input.dailyNotionalLimit, DEFAULT_POLICY.dailyNotionalLimit))
  };
}

function normalizeIntent(input = {}, policy = DEFAULT_POLICY, now = new Date()) {
  const riskPct = finiteNumber(input.riskPct, policy.riskPerTradePct);
  return {
    intentId: input.intentId || `TI-${randomUUID().slice(0, 8).toUpperCase()}`,
    mode: normalizeMode(input.mode),
    market: normalizeMarket(input.market),
    symbol: normalizeSymbol(input.symbol),
    side: normalizeSide(input.side),
    orderType: String(input.orderType || "LIMIT").toUpperCase() === "MARKET" ? "MARKET" : "LIMIT",
    entryPrice: finiteNumber(input.entryPrice),
    stopLoss: finiteNumber(input.stopLoss),
    takeProfit: finiteNumber(input.takeProfit),
    leverage: Math.trunc(finiteNumber(input.leverage, policy.maxLeverage)),
    riskPct,
    source: String(input.source || "manual").trim().slice(0, 80),
    alphaScore: finiteNumber(input.alphaScore),
    createdAt: input.createdAt || now.toISOString()
  };
}

function createDedupeHash(intent) {
  return createHash("sha256")
    .update(`${intent.symbol || "UNKNOWN"}|${intent.side || "UNKNOWN"}`)
    .digest("hex");
}

function shouldBlockDedupeFromEntryOrder(order = {}) {
  const status = String(order.status || "").toUpperCase();
  if (status === "REJECTED" || !status) return false;
  if (["SUBMITTED", "NEW", "PARTIALLY_FILLED", "FILLED", "UNKNOWN"].includes(status)) return true;
  if (finiteNumber(order.filledQuantity, 0) > 0) return true;
  return Boolean(String(order.exchangeOrderId || "").trim());
}

function createAudit(intentId, now) {
  const records = [];
  return {
    push(state, status, message, details = null) {
      records.push({
        auditId: `AUD-${randomUUID().slice(0, 8).toUpperCase()}`,
        intentId,
        state,
        status,
        message,
        details,
        timestamp: now.toISOString()
      });
    },
    records
  };
}

function isDuplicate(intent, recentIntents, windowMinutes, now) {
  const cutoff = now.getTime() - windowMinutes * 60_000;
  return (Array.isArray(recentIntents) ? recentIntents : []).some((candidate) => {
    const timestamp = new Date(candidate.createdAt || candidate.timestamp || 0).getTime();
    return normalizeSymbol(candidate.symbol) === intent.symbol
      && normalizeSide(candidate.side) === intent.side
      && Number.isFinite(timestamp)
      && timestamp >= cutoff;
  });
}

function resolveStrategyQualification(value) {
  if (value === undefined) return null;
  const matched = value && typeof value === "object" && !Array.isArray(value) ? value.matchedStrategies : null;
  const valid = Array.isArray(matched) && matched.length > 0 && matched.length <= AUTOMATION_STRATEGIES.length
    && new Set(matched).size === matched.length && matched.every(strategy => AUTOMATION_STRATEGIES.includes(strategy));
  if (!valid) return { valid: false, matchedStrategies: [], scoreThresholdApplied: true };
  return { valid: true, matchedStrategies: AUTOMATION_STRATEGIES.filter(strategy => matched.includes(strategy)),
    scoreThresholdApplied: !matched.some(strategy => strategy !== "anomaly") };
}

function hardRiskChecks(intent, context, policy, now, strategyQualification) {
  const violations = [];
  const warnings = [];
  const equity = finiteNumber(context.equity, 10_000);
  const dailyPnl = finiteNumber(context.dailyPnl, 0);
  const openPositions = Math.max(0, Math.trunc(finiteNumber(context.openPositions, 0)));
  if (strategyQualification && !strategyQualification.valid) {
    violations.push({ code: "STRATEGY_QUALIFICATION_INVALID", message: "服务端自动策略资格无效，不能生成执行计划。" });
  }

  if (!EXECUTION_MODES.has(intent.mode)) violations.push({ code: "MODE_INVALID", message: "执行模式必须为 paper、mock_exchange、testnet 或 live。" });
  if (BINANCE_MODES.has(intent.mode) && context.environmentEnabled !== true) {
    violations.push({ code: "ENVIRONMENT_LOCKED", message: `${intent.mode === "live" ? "生产实盘" : "Binance Testnet"} 尚未通过环境闸门。` });
  }
  if (BINANCE_MODES.has(intent.mode) && context.credentialConfigured !== true) {
    violations.push({ code: "CREDENTIALS_REQUIRED", message: "当前 Binance 环境未配置并验证 API Key。" });
  }
  if (intent.mode === "live") {
    if (context.liveUnlocked !== true || context.liveTradingEnabled !== true) violations.push({ code: "LIVE_LOCKED", message: "生产实盘保持加锁；必须由管理员完成二次验证和显式解锁。" });
    if (context.twoFactorPassed !== true) violations.push({ code: "TWO_FACTOR_REQUIRED", message: "生产实盘要求当前管理员会话已通过双重验证。" });
    if (context.reconciliationHealthy !== true) violations.push({ code: "RECONCILIATION_UNHEALTHY", message: "最近一次订单对账异常，禁止新增实盘仓位。" });
  }
  if (intent.market === "spot" && intent.side === "SHORT") violations.push({ code: "SPOT_SHORT_UNSUPPORTED", message: "现货执行器不建立裸空仓；做空信号请使用 USDⓈ-M Futures。" });
  if (intent.market === "spot" && intent.leverage !== 1) violations.push({ code: "SPOT_LEVERAGE_INVALID", message: "现货模式杠杆必须为 1×。" });
  if (context.killSwitch === true) violations.push({ code: "KILL_SWITCH_ACTIVE", message: "Kill Switch 已触发，禁止创建新仓位。" });
  if (!intent.symbol) violations.push({ code: "SYMBOL_REQUIRED", message: "缺少有效的 USDT 交易标的。" });
  if (!intent.side) violations.push({ code: "SIDE_REQUIRED", message: "方向必须为 LONG 或 SHORT。" });
  if (!(intent.entryPrice > 0)) violations.push({ code: "ENTRY_INVALID", message: "参考入场价必须大于 0。" });
  if (!(intent.stopLoss > 0)) violations.push({ code: "STOP_REQUIRED", message: "必须提供有效保护止损。" });
  if (!(intent.takeProfit > 0)) violations.push({ code: "TAKE_PROFIT_REQUIRED", message: "必须提供有效止盈。" });
  if (!(equity > 0)) violations.push({ code: "EQUITY_INVALID", message: "模拟权益必须大于 0。" });
  if (!(intent.riskPct > 0) || intent.riskPct > policy.maxRiskPerTradePct) {
    violations.push({ code: "RISK_BUDGET_EXCEEDED", message: `单笔风险必须在 0-${policy.maxRiskPerTradePct}% 内。` });
  }
  if (!(intent.leverage >= 1) || intent.leverage > policy.maxLeverage || intent.leverage > policy.absoluteMaxLeverage) {
    violations.push({ code: "LEVERAGE_EXCEEDED", message: `杠杆不得超过当前上限 ${policy.maxLeverage}×。` });
  }
  if (openPositions >= policy.maxOpenPositions) {
    violations.push({ code: "POSITION_LIMIT", message: `当前持仓数已达到上限 ${policy.maxOpenPositions}。` });
  }
  if (dailyPnl <= -(equity * policy.dailyLossLimitPct / 100)) {
    violations.push({ code: "DAILY_LOSS_LIMIT", message: `当日损失已触发 -${policy.dailyLossLimitPct}% 熔断线。` });
  }
  if (isDuplicate(intent, context.recentIntents, policy.dedupeWindowMinutes, now)) {
    violations.push({ code: "DUPLICATE_INTENT", message: `${policy.dedupeWindowMinutes} 分钟内存在已成功下单或状态待确认的相同标的、相同方向订单。` });
  }

  if (intent.entryPrice > 0 && intent.stopLoss > 0 && intent.takeProfit > 0 && intent.side) {
    const directionValid = intent.side === "LONG"
      ? intent.stopLoss < intent.entryPrice && intent.takeProfit > intent.entryPrice
      : intent.takeProfit < intent.entryPrice && intent.stopLoss > intent.entryPrice;
    if (!directionValid) violations.push({ code: "PROTECTION_DIRECTION_INVALID", message: "止损、入场与止盈的价格方向不完整或相互矛盾。" });

    const stopDistance = Math.abs(intent.entryPrice - intent.stopLoss);
    const rewardDistance = Math.abs(intent.takeProfit - intent.entryPrice);
    const stopDistancePct = stopDistance / intent.entryPrice * 100;
    const riskRewardRatio = stopDistance > 0 ? rewardDistance / stopDistance : 0;
    if (stopDistancePct < policy.minStopDistancePct) {
      violations.push({ code: "STOP_TOO_CLOSE", message: `止损距离不得小于 ${policy.minStopDistancePct}%。` });
    }
    if (stopDistancePct > policy.maxStopDistancePct) {
      violations.push({ code: "STOP_TOO_WIDE", message: `止损距离不得大于 ${policy.maxStopDistancePct}%。` });
    }
    if (riskRewardRatio < policy.minRiskRewardRatio) {
      violations.push({ code: "RISK_REWARD_TOO_LOW", message: `风险回报比不得低于 1:${policy.minRiskRewardRatio}。` });
    }
  }

  if (!(strategyQualification?.valid && !strategyQualification.scoreThresholdApplied)) {
    if (intent.alphaScore == null) {
      if (strategyQualification?.valid) violations.push({ code: "SCORE_REQUIRED_FOR_ANOMALY", message: "仅命中异动策略时必须保留真实 Alpha 分并通过分数阈值。" });
      else warnings.push({ code: "SCORE_MISSING", message: "未提供 Alpha 分，执行计划会保留人工复核要求。" });
    } else if (intent.alphaScore < policy.minAlphaScore) violations.push({ code: "SCORE_BELOW_THRESHOLD", message: `Alpha 分 ${intent.alphaScore} 低于阈值 ${policy.minAlphaScore}。` });
  }
  if (intent.orderType === "MARKET") warnings.push({ code: "MARKET_ORDER", message: "执行计划使用市价单，并保留最大滑点与名义额度限制。" });
  if (!BINANCE_MODES.has(intent.mode)) warnings.push({ code: "SIMULATED_EXCHANGE_FILTERS", message: "当前模拟环境不会访问 Binance；交易所过滤器由 Mock/Paper 适配器校验。" });

  return { violations, warnings, equity, dailyPnl, openPositions };
}

function buildExecutionPlan(intent, context, policy, equity, now) {
  const stopDistance = Math.abs(intent.entryPrice - intent.stopLoss);
  const rewardDistance = Math.abs(intent.takeProfit - intent.entryPrice);
  const requestedRiskAmount = equity * intent.riskPct / 100;
  const riskQuantity = requestedRiskAmount / stopDistance;
  const dailyExecutedNotional = Math.max(0, finiteNumber(context.dailyExecutedNotional, 0));
  const dailyRemainingNotional = Math.max(0, policy.dailyNotionalLimit - dailyExecutedNotional);
  const existingNotional = Math.max(0, finiteNumber(context.openNotional, 0));
  const portfolioRemainingNotional = Math.max(0, equity * policy.maxPortfolioExposurePct / 100 - existingNotional);
  const remainingNotional = Math.min(portfolioRemainingNotional, policy.perOrderNotionalLimit, dailyRemainingNotional);
  const requestedNotional = riskQuantity * intent.entryPrice;
  const notional = Math.min(requestedNotional, remainingNotional);
  const quantity = notional / intent.entryPrice;
  const actualRiskAmount = quantity * stopDistance;
  const expiresAt = new Date(now.getTime() + policy.planTtlMinutes * 60_000);
  const positionSide = intent.side;

  return {
    planId: `EP-${randomUUID().slice(0, 8).toUpperCase()}`,
    intentId: intent.intentId,
    engineVersion: ENGINE_VERSION,
    mode: intent.mode.toUpperCase(),
    market: intent.market.toUpperCase(),
    state: "AWAITING_CONFIRMATION",
    symbol: intent.symbol,
    side: intent.side,
    positionSide,
    source: intent.source,
    requiresHumanConfirmation: context.requireManualConfirmation !== false,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    mainOrder: {
      clientOrderId: `PAPER-MAIN-${randomUUID().slice(0, 8).toUpperCase()}`,
      type: intent.orderType,
      side: intent.side === "LONG" ? "BUY" : "SELL",
      positionSide,
      quantity: round(quantity),
      price: intent.orderType === "LIMIT" ? round(intent.entryPrice) : null,
      timeInForce: intent.orderType === "LIMIT" ? "GTC" : null,
      maxSlippageBps: policy.maxSlippageBps
    },
    protectionOrders: [
      {
        clientOrderId: `PAPER-SL-${randomUUID().slice(0, 8).toUpperCase()}`,
        type: "STOP_MARKET",
        side: intent.side === "LONG" ? "SELL" : "BUY",
        stopPrice: round(intent.stopLoss),
        quantity: round(quantity),
        reduceOnly: true,
        workingType: "MARK_PRICE"
      },
      {
        clientOrderId: `PAPER-TP-${randomUUID().slice(0, 8).toUpperCase()}`,
        type: "TAKE_PROFIT_MARKET",
        side: intent.side === "LONG" ? "SELL" : "BUY",
        stopPrice: round(intent.takeProfit),
        quantity: round(quantity),
        reduceOnly: true,
        workingType: "MARK_PRICE"
      }
    ],
    risk: {
      equity: round(equity, 2),
      riskPct: round(actualRiskAmount / equity * 100, 4),
      riskAmount: round(actualRiskAmount, 2),
      requestedRiskAmount: round(requestedRiskAmount, 2),
      stopDistancePct: round(stopDistance / intent.entryPrice * 100, 3),
      riskRewardRatio: round(rewardDistance / stopDistance, 2),
      notional: round(notional, 2),
      marginRequired: round(notional / intent.leverage, 2),
      leverage: intent.leverage,
      exposureCapped: notional + 0.000001 < requestedNotional,
      perOrderNotionalLimit: round(policy.perOrderNotionalLimit, 2),
      dailyRemainingNotional: round(dailyRemainingNotional, 2)
    },
    safeguards: {
      duplicateChecked: true,
      riskBudgetChecked: true,
      protectionOrdersValidated: true,
      killSwitchChecked: true,
      exchangeFiltersValidated: false,
      liveOrderPermission: BINANCE_MODES.has(intent.mode)
        ? context.environmentEnabled === true && context.credentialConfigured === true && (intent.mode !== "live" || context.liveUnlocked === true)
        : false,
      idempotencyRequired: true,
      reconciliationRequired: true
    }
  };
}

function evaluateTradeIntent(input = {}, context = {}, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const policy = resolvePolicy(options.policy || input.policy || {});
  const provisionalIntent = normalizeIntent(input, policy, now);
  const audit = createAudit(provisionalIntent.intentId, now);

  audit.push("CREATED", "OK", "交易意图已创建；尚未产生任何订单。", { source: provisionalIntent.source });
  audit.push("NORMALIZED", "OK", "交易参数已标准化。", { symbol: provisionalIntent.symbol, side: provisionalIntent.side, mode: provisionalIntent.mode, market: provisionalIntent.market });
  provisionalIntent.dedupeHash = createDedupeHash(provisionalIntent);
  audit.push("DEDUPE_CHECKED", "OK", "已对成功下单或状态待确认的相同标的、相同方向订单执行去重检查。", { hash: provisionalIntent.dedupeHash, windowMinutes: policy.dedupeWindowMinutes });

  // Only the trusted service invocation may attest qualification. Neither the
  // user intent nor account context can opt out of the generic score gate.
  const strategyQualification = resolveStrategyQualification(options.strategyQualification);
  if (strategyQualification?.valid) {
    audit.push("RISK_CHECKED", "STRATEGY_QUALIFIED", strategyQualification.scoreThresholdApplied
      ? "已记录服务端策略资格；仅异动策略继续检查真实 Alpha 分阈值。"
      : "已记录服务端 P1/P2 或信号策略资格；保留真实 Alpha 分，按已命中策略评估筛选资格，其余风控继续执行。",
    { matchedStrategies: strategyQualification.matchedStrategies, actualAlphaScore: provisionalIntent.alphaScore,
      scoreThresholdApplied: strategyQualification.scoreThresholdApplied, minAlphaScore: policy.minAlphaScore });
  }
  const checks = hardRiskChecks(provisionalIntent, context, policy, now, strategyQualification);
  if (checks.violations.length) {
    audit.push("RISK_CHECKED", "REJECTED", "硬性风控检查未通过。", { violationCodes: checks.violations.map((item) => item.code) });
    audit.push("REJECTED", "FINAL", "交易意图已拒绝，不生成执行计划。", null);
    return {
      ok: false,
      decision: "REJECTED",
      state: "REJECTED",
      engineVersion: ENGINE_VERSION,
      intent: provisionalIntent,
      policy,
      violations: checks.violations,
      warnings: checks.warnings,
      executionPlan: null,
      audit: audit.records
    };
  }

  audit.push("RISK_CHECKED", "APPROVED", "硬性风控检查通过。", null);
  const executionPlan = buildExecutionPlan(provisionalIntent, context, policy, checks.equity, now);
  if (!(executionPlan.mainOrder.quantity > 0) || executionPlan.risk.notional < 5) {
    const violation = { code: "EXPOSURE_BUDGET_EXHAUSTED", message: `当前环境剩余风险额度不足以创建 Binance 最低 5 USDT 名义仓位；请检查该环境的持仓敞口、单笔上限和单日额度。` };
    audit.push("REJECTED", "FINAL", violation.message, null);
    return {
      ok: false,
      decision: "REJECTED",
      state: "REJECTED",
      engineVersion: ENGINE_VERSION,
      intent: provisionalIntent,
      policy,
      violations: [violation],
      warnings: checks.warnings,
      executionPlan: null,
      audit: audit.records
    };
  }

  audit.push("PLANNED", "OK", "已生成包含主订单、止损、止盈和仓位预算的完整执行计划。", { planId: executionPlan.planId });
  audit.push("AWAITING_CONFIRMATION", "PENDING", executionPlan.requiresHumanConfirmation ? "等待人工确认；尚未向执行器提交订单。" : "风控已通过，可由自动执行器提交完整计划。", { expiresAt: executionPlan.expiresAt });
  return {
    ok: true,
    decision: "APPROVED",
    state: "AWAITING_CONFIRMATION",
    engineVersion: ENGINE_VERSION,
    intent: provisionalIntent,
    policy,
    violations: [],
    warnings: checks.warnings,
    executionPlan,
    audit: audit.records
  };
}

module.exports = {
  DEFAULT_POLICY,
  ENGINE_VERSION,
  createDedupeHash,
  evaluateTradeIntent,
  normalizeIntent,
  normalizeMarket,
  normalizeSide,
  normalizeSymbol,
  resolvePolicy,
  shouldBlockDedupeFromEntryOrder
};
