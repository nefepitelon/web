const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const prismaTypes = require('@prisma/client');
const riskEngine = require('../workers/risk_engine');

function fixture({ referencePrice = 100.1, killSwitch = false } = {}) {
  const owner = 'automation-owner';
  const calls = { intents: [], plans: [], audits: [], engine: [], quotes: [], preflight: 0, closed: 0 };
  const config = { activeMode: 'LIVE', defaultMarket: 'FUTURES', dedupeWindowMinutes: 15,
    riskPerTradePct: 0.25, maxLeverage: 3, dailyLossLimitPct: 1, maxOpenPositions: 3,
    maxPortfolioExposurePct: 20, minAlphaScore: 80, perOrderNotionalLimit: 100, dailyNotionalLimit: 1000,
    killSwitchActive: killSwitch, liveEnabled: true, liveUnlockedAt: new Date(),
    reconciliationHealthy: true, requireManualConfirmation: false };
  const prisma = {
    alphaTradingCredential: { async findUnique({ where }) {
      assert.equal(where.userId_environment_market.userId, owner);
      return { environment: 'LIVE', market: 'FUTURES', apiKeyEncrypted: 'fixture', apiSecretEncrypted: 'fixture', enabled: true, verifiedAt: new Date() };
    } },
    alphaTradingOrder: { async findMany({ where }) { assert.equal(where.userId, owner); return []; } },
    alphaTradingPosition: { async findMany({ where }) { assert.equal(where.userId, owner); return []; } },
    alphaTradeIntent: { async create({ data }) { assert.equal(data.userId, owner); calls.intents.push(structuredClone(data)); return data; } },
    alphaExecutionPlan: { async create({ data }) { assert.equal(data.userId, owner); calls.plans.push(structuredClone(data)); return data; } },
  };
  class Client {
    async preflight() { calls.preflight += 1; return { equity: 1000 }; }
    async close() { calls.closed += 1; }
  }
  const dependencies = {
    'server-only': {}, '@prisma/client': prismaTypes, 'node:crypto': require('node:crypto'), '@/lib/prisma': { prisma },
    '@/lib/alpha-execution/binance': { AlphaBinanceClient: Client, async getLiveBinanceReferencePrice(market, symbol) {
      calls.quotes.push([market, symbol]); return referencePrice;
    } },
    '@/lib/alpha-execution/credentials': { decryptTradingSecret: () => 'test-only' },
    '@/lib/alpha-execution/data': {
      async getOrCreateAlphaExecutionConfig(userId) { assert.equal(userId, owner); return config; },
      marketFrom: value => value.toUpperCase(), modeFrom: value => value.toUpperCase(),
      async writeAlphaAudit(input) { assert.equal(input.userId, owner); calls.audits.push(structuredClone(input)); },
    },
    '@/workers/risk_engine.js': { ...riskEngine, evaluateTradeIntent(...args) {
      const result = riskEngine.evaluateTradeIntent(...args);
      calls.engine.push(structuredClone(result));
      return result;
    } },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('lib/alpha-execution/service.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Error, Buffer, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unmocked import ${name}`);
  } });
  const input = { symbol: 'BTC', source: 'alpha-auto:reservation-1', mode: 'live', market: 'futures', side: 'LONG',
    entryPrice: 100, stopLoss: 98, takeProfit: 106, leverage: 2, riskPct: 0.1, alphaScore: null, orderType: 'MARKET' };
  const automation = { context: { equity: 1000 }, policy: {}, maxQuantity: 0.5,
    quantityStep: 0.01, minQuantity: 0.01, minNotional: 5, matchedStrategies: ['strong_signal'] };
  return { calls, input, automation, approve: (overrides = {}, options = automation) => module.exports.approveTradeIntent({ ...input, ...overrides }, owner, true, options) };
}

test('actual approval always floors a smaller repriced engine quantity and synchronizes protections and risk', async () => {
  const f = fixture();
  const result = await f.approve();
  const raw = f.calls.engine[0].executionPlan.mainOrder.quantity;
  assert.ok(raw < 0.5 && raw > 0.47);
  assert.notEqual(raw / 0.01, Math.round(raw / 0.01), 'the repriced engine result is not step-aligned');
  assert.equal(result.ok, true);
  const plan = result.executionPlan;
  assert.equal(plan.mainOrder.quantity, 0.47);
  assert.ok(plan.protectionOrders.every(order => order.quantity === 0.47));
  assert.equal(plan.risk.notional, 47.047);
  assert.equal(plan.risk.marginRequired, 23.5235);
  assert.equal(plan.risk.riskAmount, 0.987);
  assert.equal(plan.risk.riskPct, 0.0987);
  assert.equal(plan.risk.exposureCapped, true);
  assert.equal(f.calls.plans.length, 1);
  assert.equal(f.calls.plans[0].mainOrder.quantity, 0.47);
  assert.deepEqual(f.calls.plans[0].riskSnapshot, structuredClone(plan.risk));
  assert.equal(f.calls.intents[0].alphaScore, null);
  assert.equal(f.calls.intents[0].state, 'RISK_APPROVED');
  assert.ok(f.calls.audits.some(event => event.status === 'QUANTITY_FILTERS_VALIDATED'));
  assert.deepEqual(f.calls.quotes, [['futures', 'BTCUSDT']]);
  assert.equal(f.calls.closed, f.calls.preflight);
});

test('automatic approval never enlarges raw or candidate quantity to reach a step or minimum', async () => {
  const f = fixture({ referencePrice: 99.5 });
  const result = await f.approve({}, { ...f.automation, maxQuantity: 0.51, quantityStep: 0.1 });
  assert.equal(result.ok, true);
  assert.ok(f.calls.engine[0].executionPlan.mainOrder.quantity > 0.51);
  assert.equal(result.executionPlan.mainOrder.quantity, 0.5);
  assert.ok(result.executionPlan.mainOrder.quantity <= 0.51);
  assert.equal(result.executionPlan.risk.riskAmount, 0.75);
  const awkward = fixture();
  const aligned = await awkward.approve({}, { ...awkward.automation, maxQuantity: 0.475, quantityStep: 0.025 });
  assert.equal(aligned.executionPlan.mainOrder.quantity, 0.475, 'decimal step division must not lose an already aligned cap');
});

test('sub-minimum or invalid automatic quantities are saved rejected with audits and no executable plan', async () => {
  for (const [patch, code] of [
    [{ quantityStep: 1 }, 'AUTOMATION_ORDER_BELOW_EXCHANGE_MINIMUM'],
    [{ minQuantity: 0.48 }, 'AUTOMATION_ORDER_BELOW_EXCHANGE_MINIMUM'],
    [{ minNotional: 48 }, 'AUTOMATION_ORDER_BELOW_EXCHANGE_MINIMUM'],
    [{ maxQuantity: 0.049 }, 'AUTOMATION_ORDER_BELOW_EXCHANGE_MINIMUM'],
    [{ quantityStep: 0 }, 'AUTOMATION_QUANTITY_FILTERS_INVALID'],
    [{ quantityStep: NaN }, 'AUTOMATION_QUANTITY_FILTERS_INVALID'],
    [{ minQuantity: undefined }, 'AUTOMATION_QUANTITY_FILTERS_INVALID'],
    [{ minNotional: -1 }, 'AUTOMATION_QUANTITY_FILTERS_INVALID'],
  ]) {
    const f = fixture();
    const result = await f.approve({}, { ...f.automation, ...patch });
    assert.equal(f.calls.engine[0].ok, true, 'the rejection must come from service filter validation');
    assert.equal(result.ok, false, JSON.stringify(patch));
    assert.equal(result.executionPlan, null);
    assert.ok(result.violations.some(item => item.code === code));
    assert.equal(f.calls.plans.length, 0);
    assert.equal(f.calls.intents.length, 1);
    assert.equal(f.calls.intents[0].state, 'RISK_REJECTED');
    assert.ok(f.calls.intents[0].rejectionReason);
    assert.equal(f.calls.audits.some(event => ['PLANNED', 'AWAITING_CONFIRMATION'].includes(event.state)), false);
    const final = f.calls.audits.at(-1);
    assert.equal(final.state, 'RISK_REJECTED');
    assert.ok(final.metadata.violationCodes.includes(code));
  }
});

test('manual approvals retain raw engine sizing and input fields cannot invoke automatic quantization', async () => {
  const f = fixture();
  const result = await f.approve({ source: 'manual', alphaScore: 90, quantityStep: 1, maxQuantity: 0.01 }, null);
  assert.equal(result.ok, true);
  assert.equal(result.executionPlan.mainOrder.quantity, f.calls.engine[0].executionPlan.mainOrder.quantity);
  assert.ok(result.executionPlan.mainOrder.quantity > 0.47);
  assert.equal(f.calls.audits.some(event => event.status === 'QUANTITY_FILTERS_VALIDATED'), false);
});

test('automatic step quantization cannot turn an existing risk rejection into approval', async () => {
  const f = fixture({ killSwitch: true });
  const result = await f.approve();
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(item => item.code === 'KILL_SWITCH_ACTIVE'));
  assert.equal(f.calls.intents[0].state, 'RISK_REJECTED');
  assert.equal(f.calls.plans.length, 0);
  assert.equal(f.calls.audits.some(event => event.status === 'QUANTITY_FILTERS_VALIDATED'), false);
});
