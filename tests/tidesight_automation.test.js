const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
require("tsx/cjs");
const { TIDESIGHT_AUTO_STRATEGIES, automaticIntent, isFreshAutomaticSignal } = require("../lib/tidesight/automatic-strategies.ts");
const { evaluateTradeIntent, resolvePolicy } = require("../workers/tidesight_risk_engine.js");
const alpha = require("../workers/risk_engine.js");
const policy = { riskPerTradePct: 1.5, maxLeverage: 25, perOrderNotionalLimit: 1000, dailyNotionalLimit: 5000 };
const context = { equity: 20000, availableBalance: 19000, dailyPnl: 0, openPositions: 0, openNotional: 0, dailyExecutedNotional: 0, recentIntents: [], environmentEnabled: true, credentialConfigured: true, liveUnlocked: true, liveTradingEnabled: true, twoFactorPassed: true, reconciliationHealthy: true, trustedMacdSignal: true };
const evaluate = (rule, changes = {}, policies = {}) => evaluateTradeIntent(automaticIntent(rule, "ETHUSDT", 2500, 1.5, 3), { ...context, ...changes }, { policy: { ...policy, ...policies } });
const evaluateAuto = (rule, changes = {}, policies = {}, stop = 1.5, target = 3) => evaluateTradeIntent(automaticIntent(rule, "ETHUSDT", 2500, stop, target), { ...context, riskCappedSizing: true, ...changes }, { policy: { ...policy, ...policies } });

test("all six exact automatic rules create fixed-notional protected plans", () => {
  assert.deepEqual(TIDESIGHT_AUTO_STRATEGIES.map(r => [r.interval, r.side, r.leverage, r.riskPct, r.notional]), [
    ["1d", "SHORT", 5, 1.5, 200], ["1h", "SHORT", 10, 1, 500], ["15m", "SHORT", 25, 0.5, 1000],
    ["15m", "LONG", 25, 0.5, 1000], ["1h", "LONG", 10, 1, 500], ["1d", "LONG", 5, 1.5, 200],
  ]);
  for (const rule of TIDESIGHT_AUTO_STRATEGIES) {
    const result = evaluate(rule);
    assert.equal(result.ok, true, JSON.stringify(result.violations));
    assert.equal(result.executionPlan.risk.notional, rule.notional);
    assert.equal(result.executionPlan.risk.leverage, rule.leverage);
    assert.equal(result.executionPlan.protectionOrders.length, 2);
    assert.equal(result.intent.tideSightScore, null, "MACD must not fabricate an Alpha score");
  }
});
test("fixed notional is rejected, never resized, on insufficient risk/equity/margin/budgets", () => {
  const rule = TIDESIGHT_AUTO_STRATEGIES[2];
  for (const changes of [{ equity: 1000 }, { availableBalance: 20 }, { openNotional: 9600 }, { dailyExecutedNotional: 4500 }]) {
    const result = evaluate(rule, changes);
    assert.equal(result.ok, false); assert.equal(result.executionPlan, null);
  }
  assert.equal(evaluate(rule, {}, { perOrderNotionalLimit: 500 }).ok, false);
});
test("authenticated automatic signals safely cap target notional to every remaining budget", () => {
  const rule = TIDESIGHT_AUTO_STRATEGIES[2];
  const lowEquity = evaluateAuto(rule, { equity: 99.07, availableBalance: 99.07 }, {}, 0.25, 3.505);
  assert.equal(lowEquity.ok, true, JSON.stringify(lowEquity.violations));
  assert.equal(lowEquity.executionPlan.risk.targetNotional, 1000);
  assert.equal(lowEquity.executionPlan.risk.exposureCapped, true);
  assert.equal(lowEquity.executionPlan.risk.sizingMode, "RISK_CAPPED_TARGET");
  assert.ok(lowEquity.executionPlan.risk.notional >= 49 && lowEquity.executionPlan.risk.notional <= 49.54);
  assert.ok(lowEquity.executionPlan.risk.riskPct <= rule.riskPct);
  assert.ok(lowEquity.warnings.some(item => item.code === "AUTO_NOTIONAL_RISK_CAPPED"));
  assert.ok(lowEquity.warnings.some(item => item.code === "AUTO_NOTIONAL_LIMIT_CAPPED"));

  const perOrder = evaluateAuto(rule, {}, { perOrderNotionalLimit: 500 });
  assert.equal(perOrder.ok, true); assert.equal(perOrder.executionPlan.risk.notional, 500);
  const daily = evaluateAuto(rule, { dailyExecutedNotional: 4750 });
  assert.equal(daily.ok, true); assert.equal(daily.executionPlan.risk.notional, 250);
  const portfolio = evaluateAuto(rule, { openNotional: 9900 });
  assert.equal(portfolio.ok, true); assert.equal(portfolio.executionPlan.risk.notional, 100);
  const margin = evaluateAuto(rule, { availableBalance: 10 });
  assert.equal(margin.ok, true); assert.ok(margin.executionPlan.risk.notional < 242);
  assert.equal(evaluateAuto(rule, { openNotional: 9997 }).ok, false, "sub-minimum residual budget must remain fail-closed");
});
test("automatic capping cannot be enabled by an untrusted or manual request", () => {
  const rule = TIDESIGHT_AUTO_STRATEGIES[2];
  assert.equal(evaluateTradeIntent(automaticIntent(rule, "ETHUSDT", 2500, 0.25, 3.505), { ...context, equity: 99.07, availableBalance: 99.07, riskCappedSizing: true, trustedMacdSignal: false }, { policy }).ok, false);
  assert.equal(evaluate(rule, { equity: 99.07, availableBalance: 99.07 }).ok, false);
});
test("configured 0.25 percent stop boundary is accepted without floating point false rejection", () => {
  for (const rule of TIDESIGHT_AUTO_STRATEGIES) {
    const result = evaluateAuto(rule, {}, {}, 0.25, 0.375);
    assert.equal(result.ok, true, `${rule.id}: ${JSON.stringify(result.violations)}`);
    assert.equal(result.executionPlan.risk.stopDistancePct, 0.25);
  }
});
test("TideSight risk limits are independent and enforced at 25x/1.5% ceilings", () => {
  assert.equal(resolvePolicy({ maxLeverage: 25 }).maxLeverage, 25);
  assert.equal(alpha.resolvePolicy({ maxLeverage: 25 }).maxLeverage, 20);
  assert.equal(evaluate(TIDESIGHT_AUTO_STRATEGIES[0], {}, { riskPerTradePct: 1 }).ok, false);
  assert.equal(evaluate(TIDESIGHT_AUTO_STRATEGIES[2], {}, { maxLeverage: 10 }).ok, false);
  assert.equal(evaluate(TIDESIGHT_AUTO_STRATEGIES[0], { dailyPnl: -500 }).ok, false);
});
test("live gates, uncertainty, dedupe and score bypass are fail-closed", () => {
  for (const changes of [{ killSwitch: true }, { environmentEnabled: false }, { credentialConfigured: false }, { liveUnlocked: false }, { twoFactorPassed: false }, { reconciliationHealthy: false }, { trustedMacdSignal: false }, { recentIntents: [{ symbol: "ETHUSDT", side: "SHORT", createdAt: new Date() }] }]) {
    assert.equal(evaluate(TIDESIGHT_AUTO_STRATEGIES[0], changes).ok, false, JSON.stringify(changes));
  }
});
test("protection requires an explicit choice and a buffer before liquidation", () => {
  const rule = TIDESIGHT_AUTO_STRATEGIES[2];
  for (const [stop, target] of [[undefined, undefined], [0, 3], [3.3, 6], [1.5, 1], [NaN, 3]]) assert.throws(() => automaticIntent(rule, "ETHUSDT", 2500, stop, target));
});
test("only fresh closed candles after enablement are eligible; no replay on restart", () => {
  const now = Date.now(); const start = new Date(now - 90000);
  assert.equal(isFreshAutomaticSignal(new Date(now - 30000).toISOString(), start, now), true);
  for (const timestamp of [now - 90000, now - 180000, now + 1]) assert.equal(isFreshAutomaticSignal(new Date(timestamp).toISOString(), start, now), false);
  assert.equal(isFreshAutomaticSignal("invalid", start, now), false);
});
test("TideSight implementation never reads or writes Alpha execution models/routes", () => {
  for (const file of ["service.ts", "data.ts", "access.ts", "lease.ts", "binance.ts", "credentials.ts"]) {
    const source = fs.readFileSync(`lib/tidesight/execution/${file}`, "utf8");
    assert.doesNotMatch(source, /prisma\.alpha|@\/lib\/alpha-execution|workers\/risk_engine/);
  }
  assert.doesNotMatch(fs.readFileSync("components/tidesight-quant-surface.tsx", "utf8"), /\/api\/alpha-execution/);
  const runtime = fs.readFileSync("lib/tidesight/automation-runtime.ts", "utf8");
  assert.match(runtime, /P2002/); assert.match(runtime, /autoGeneration/);
  assert.match(fs.readFileSync("prisma/schema.prisma", "utf8"), /eventKey\s+String\s+@unique/);
});
