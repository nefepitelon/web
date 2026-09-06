const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateTradeIntent, normalizeSymbol, shouldBlockDedupeFromEntryOrder } = require("../workers/risk_engine");

const now = new Date("2026-08-02T08:00:00.000Z");

function validLong(overrides = {}) {
  return {
    mode: "paper",
    symbol: "POPCAT",
    side: "LONG",
    entryPrice: 0.6412,
    stopLoss: 0.6026,
    takeProfit: 0.7184,
    leverage: 3,
    riskPct: 0.75,
    source: "alpha-radar",
    alphaScore: 91,
    ...overrides
  };
}

function validContext(overrides = {}) {
  return {
    equity: 10_000,
    dailyPnl: 0,
    openPositions: 0,
    openNotional: 0,
    recentIntents: [],
    killSwitch: false,
    ...overrides
  };
}

test("approved LONG intent returns a complete paper execution plan", () => {
  const result = evaluateTradeIntent(validLong(), validContext(), { now });

  assert.equal(result.ok, true);
  assert.equal(result.decision, "APPROVED");
  assert.equal(result.state, "AWAITING_CONFIRMATION");
  assert.equal(result.executionPlan.mode, "PAPER");
  assert.equal(result.executionPlan.requiresHumanConfirmation, true);
  assert.equal(result.executionPlan.safeguards.liveOrderPermission, false);
  assert.ok(result.executionPlan.mainOrder.quantity > 0);
  assert.equal(result.executionPlan.protectionOrders.length, 2);
  assert.ok(result.executionPlan.protectionOrders.every((order) => order.reduceOnly === true));
  assert.deepEqual(result.executionPlan.protectionOrders.map((order) => order.type).sort(), ["STOP_MARKET", "TAKE_PROFIT_MARKET"]);
});

test("normalizes base symbols to Binance USDT pairs", () => {
  assert.equal(normalizeSymbol("btc/usdt"), "BTCUSDT");
  assert.equal(normalizeSymbol("ena"), "ENAUSDT");
});

test("rejects a LONG intent with contradictory protection prices", () => {
  const result = evaluateTradeIntent(validLong({ stopLoss: 0.68, takeProfit: 0.59 }), validContext(), { now });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => item.code === "PROTECTION_DIRECTION_INVALID"));
  assert.equal(result.executionPlan, null);
});

test("rejects duplicate symbol and side within the configured window", () => {
  const result = evaluateTradeIntent(validLong(), validContext({
    recentIntents: [{ symbol: "POPCATUSDT", side: "LONG", createdAt: "2026-08-02T07:50:01.000Z" }]
  }), { now, policy: { dedupeWindowMinutes: 15 } });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => item.code === "DUPLICATE_INTENT"));
});

test("dedupe only blocks entry orders accepted by the executor or left with unknown exchange status", () => {
  assert.equal(shouldBlockDedupeFromEntryOrder({ status: "REJECTED" }), false);
  assert.equal(shouldBlockDedupeFromEntryOrder({ status: "PENDING" }), false);
  assert.equal(shouldBlockDedupeFromEntryOrder({ status: "CANCELED" }), false);
  assert.equal(shouldBlockDedupeFromEntryOrder({ status: "CANCELED", exchangeOrderId: "12345" }), true);
  assert.equal(shouldBlockDedupeFromEntryOrder({ status: "UNKNOWN" }), true);
  assert.equal(shouldBlockDedupeFromEntryOrder({ status: "FILLED", filledQuantity: 12 }), true);
  assert.equal(shouldBlockDedupeFromEntryOrder({ status: "EXPIRED", filledQuantity: 0.5 }), true);
});

test("kill switch fails closed before position sizing", () => {
  const result = evaluateTradeIntent(validLong(), validContext({ killSwitch: true }), { now });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => item.code === "KILL_SWITCH_ACTIVE"));
  assert.equal(result.audit.at(-1).state, "REJECTED");
});

test("daily loss circuit breaker rejects new exposure", () => {
  const result = evaluateTradeIntent(validLong(), validContext({ dailyPnl: -200 }), { now, policy: { dailyLossLimitPct: 2 } });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => item.code === "DAILY_LOSS_LIMIT"));
});

test("Testnet fails closed until its environment and verified credential gates are open", () => {
  const locked = evaluateTradeIntent(validLong({ mode: "testnet" }), validContext(), { now });
  const approved = evaluateTradeIntent(validLong({ mode: "testnet" }), validContext({ environmentEnabled: true, credentialConfigured: true }), { now });

  assert.equal(locked.ok, false);
  assert.ok(locked.violations.some((item) => item.code === "ENVIRONMENT_LOCKED"));
  assert.ok(locked.violations.some((item) => item.code === "CREDENTIALS_REQUIRED"));
  assert.equal(approved.ok, true);
  assert.equal(approved.executionPlan.mode, "TESTNET");
  assert.equal(approved.executionPlan.safeguards.idempotencyRequired, true);
  assert.equal(approved.executionPlan.safeguards.reconciliationRequired, true);
});

test("production live requires explicit unlock, 2FA and a healthy reconciliation", () => {
  const locked = evaluateTradeIntent(validLong({ mode: "live" }), validContext({ environmentEnabled: true, credentialConfigured: true }), { now });
  const approved = evaluateTradeIntent(validLong({ mode: "live" }), validContext({
    environmentEnabled: true,
    credentialConfigured: true,
    liveUnlocked: true,
    liveTradingEnabled: true,
    twoFactorPassed: true,
    reconciliationHealthy: true
  }), { now });

  assert.equal(locked.ok, false);
  assert.ok(locked.violations.some((item) => item.code === "LIVE_LOCKED"));
  assert.ok(locked.violations.some((item) => item.code === "TWO_FACTOR_REQUIRED"));
  assert.ok(locked.violations.some((item) => item.code === "RECONCILIATION_UNHEALTHY"));
  assert.equal(approved.ok, true);
  assert.equal(approved.executionPlan.mode, "LIVE");
  assert.equal(approved.executionPlan.safeguards.liveOrderPermission, true);
});

test("spot execution rejects shorts and leverage while allowing a protected long", () => {
  const short = evaluateTradeIntent(validLong({ market: "spot", side: "SHORT", leverage: 1, stopLoss: 0.68, takeProfit: 0.59 }), validContext(), { now });
  const leveraged = evaluateTradeIntent(validLong({ market: "spot", leverage: 2 }), validContext(), { now });
  const approved = evaluateTradeIntent(validLong({ market: "spot", leverage: 1 }), validContext(), { now });

  assert.ok(short.violations.some((item) => item.code === "SPOT_SHORT_UNSUPPORTED"));
  assert.ok(leveraged.violations.some((item) => item.code === "SPOT_LEVERAGE_INVALID"));
  assert.equal(approved.ok, true);
  assert.equal(approved.executionPlan.market, "SPOT");
});

test("position sizing respects both stop risk and remaining exposure", () => {
  const result = evaluateTradeIntent(validLong(), validContext({ openNotional: 4_800 }), {
    now,
    policy: { maxPortfolioExposurePct: 50 }
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionPlan.risk.exposureCapped, true);
  assert.equal(result.executionPlan.risk.notional, 200);
  assert.ok(result.executionPlan.risk.riskAmount < result.executionPlan.risk.requestedRiskAmount);
});

test("per-order limit remains available after existing portfolio exposure is accounted for", () => {
  const result = evaluateTradeIntent(validLong(), validContext({ openNotional: 1_000 }), {
    now,
    policy: { maxPortfolioExposurePct: 50, perOrderNotionalLimit: 50 }
  });

  assert.equal(result.ok, true);
  assert.equal(result.executionPlan.risk.notional, 50);
});

test("rejects a plan below the minimum risk reward ratio", () => {
  const result = evaluateTradeIntent(validLong({ takeProfit: 0.67 }), validContext(), { now });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => item.code === "RISK_REWARD_TOO_LOW"));
});

test("rejects leverage above the active hard limit", () => {
  const result = evaluateTradeIntent(validLong({ leverage: 5 }), validContext(), { now, policy: { maxLeverage: 3 } });

  assert.equal(result.ok, false);
  assert.ok(result.violations.some((item) => item.code === "LEVERAGE_EXCEEDED"));
});

test("supports the expanded 1.5 percent single-trade risk boundary", () => {
  const approved = evaluateTradeIntent(validLong({ riskPct: 1.5 }), validContext(), { now, policy: { riskPerTradePct: 1.5 } });
  const rejected = evaluateTradeIntent(validLong({ riskPct: 1.51 }), validContext(), { now, policy: { riskPerTradePct: 1.5 } });

  assert.equal(approved.ok, true);
  assert.equal(approved.policy.maxRiskPerTradePct, 1.5);
  assert.ok(rejected.violations.some((item) => item.code === "RISK_BUDGET_EXCEEDED"));
});

test("supports 10x and 20x policies while preserving the absolute leverage gate", () => {
  const tenX = evaluateTradeIntent(validLong({ leverage: 10 }), validContext(), { now, policy: { maxLeverage: 10 } });
  const twentyX = evaluateTradeIntent(validLong({ leverage: 20 }), validContext(), { now, policy: { maxLeverage: 20 } });
  const aboveLimit = evaluateTradeIntent(validLong({ leverage: 21 }), validContext(), { now, policy: { maxLeverage: 20 } });

  assert.equal(tenX.ok, true);
  assert.equal(twentyX.ok, true);
  assert.equal(twentyX.executionPlan.risk.leverage, 20);
  assert.ok(aboveLimit.violations.some((item) => item.code === "LEVERAGE_EXCEEDED"));
});

test("applies the expanded 3.5 percent daily circuit-breaker boundary", () => {
  const beforeBoundary = evaluateTradeIntent(validLong(), validContext({ dailyPnl: -349.99 }), { now, policy: { dailyLossLimitPct: 3.5 } });
  const atBoundary = evaluateTradeIntent(validLong(), validContext({ dailyPnl: -350 }), { now, policy: { dailyLossLimitPct: 3.5 } });

  assert.equal(beforeBoundary.ok, true);
  assert.ok(atBoundary.violations.some((item) => item.code === "DAILY_LOSS_LIMIT"));
  assert.match(atBoundary.violations.find((item) => item.code === "DAILY_LOSS_LIMIT").message, /-3\.5%/);
});

test("applies both 5-minute and 60-minute dedupe windows", () => {
  const recentIntents = [{ symbol: "POPCATUSDT", side: "LONG", createdAt: "2026-08-02T07:50:00.000Z" }];
  const fiveMinutes = evaluateTradeIntent(validLong(), validContext({ recentIntents }), { now, policy: { dedupeWindowMinutes: 5 } });
  const sixtyMinutes = evaluateTradeIntent(validLong(), validContext({ recentIntents }), { now, policy: { dedupeWindowMinutes: 60 } });

  assert.equal(fiveMinutes.ok, true);
  assert.ok(sixtyMinutes.violations.some((item) => item.code === "DUPLICATE_INTENT"));
  assert.equal(sixtyMinutes.policy.dedupeWindowMinutes, 60);
});

test("Alpha score boundary approves 75 and rejects 74", () => {
  const approved = evaluateTradeIntent(validLong({ alphaScore: 75 }), validContext(), { now });
  const rejected = evaluateTradeIntent(validLong({ alphaScore: 74 }), validContext(), { now });

  assert.equal(approved.ok, true);
  assert.equal(approved.decision, "APPROVED");
  assert.equal(rejected.ok, false);
  assert.ok(rejected.violations.some((item) => item.code === "SCORE_BELOW_THRESHOLD"));
  assert.match(rejected.violations.find((item) => item.code === "SCORE_BELOW_THRESHOLD").message, /阈值 75/);
});

test("missing Alpha score requires review but does not bypass hard risk checks", () => {
  const intent = validLong();
  delete intent.alphaScore;
  const result = evaluateTradeIntent(intent, validContext(), { now });

  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((item) => item.code === "SCORE_MISSING"));
  assert.equal(result.executionPlan.requiresHumanConfirmation, true);
});

test("audit trail records the ordered approval state machine", () => {
  const result = evaluateTradeIntent(validLong(), validContext(), { now });
  assert.deepEqual(result.audit.map((item) => item.state), [
    "CREATED",
    "NORMALIZED",
    "DEDUPE_CHECKED",
    "RISK_CHECKED",
    "PLANNED",
    "AWAITING_CONFIRMATION"
  ]);
});
