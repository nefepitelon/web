const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { alphaAutomationSettingsSchema, selectAlphaAutomationCandidates } = require('../lib/alpha-execution/automation-strategy.ts');
const { validateAutomaticOrder } = require('../lib/alpha-execution/automation-guard.ts');

const now = Date.parse('2026-09-09T10:00:00.000Z');
// Use the same actual multi-source selector and fresh venue fixture as the strategy
// tests. The execution guard must accept its real output, not a hand-built candidate.
function approved(side = 'LONG', overrides = {}) {
  const settings = alphaAutomationSettingsSchema.parse({ enabled: true, ...overrides.settings });
  const account = { observedAt: now - 1000, equity: 1000, dayStartEquity: 1000, dailyPnl: 0, availableMargin: 1000,
    openPositions: [], pendingEntries: [], reconciliationHealthy: true, killSwitch: false, unresolvedOrders: false, ...overrides.account };
  const direction = side === 'LONG' ? 1 : -1;
  const selected = selectAlphaAutomationCandidates({ settings, now, market: 'futures', account, recentEntries: [], lastOrderAt: null,
    observations: ['anomaly','momentum'].map(source => ({ source, evidenceId: `${source}:BTC:independent-event`, symbol: 'BTC', side,
      score: source === 'momentum' ? null : 86, observedAt: now - 1000, dataComplete: true, overheated: false, priceMomentumScore:90, volumeAnomalyScore:90 })),
    markets: [{ symbol: 'BTCUSDT', market: 'futures', tradable: true, observedAt: now - 1000, quoteAt: now - 1000,
      bid: 99.99, ask: 100.01, quoteVolume24h: 30000000, return15mPct: 0.4 * direction, return1hPct: direction, return24hPct: 3 * direction,
      volumeMultiple: 1.5, atrPct: 1, fundingPct: 0.005, oiChangePct: 2, estimatedSlippagePct: 0.1, liquidityNotional: 100, takerFeePct: 0.05,
      filters: { tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 100000, minNotional: 5, maxNotional: null }, ...overrides.market }],
  });
  assert.equal(selected.candidates.length, 1, JSON.stringify(selected));
  const candidate = selected.candidates[0];
  return { candidate, settings, account, quantity: candidate.quantity, price: candidate.entryPrice, leverage: candidate.leverage, now };
}

test('the final guard accepts actual fresh LONG and SHORT selector proposals including cost reserves', () => {
  for (const side of ['LONG','SHORT']) {
    const input = approved(side);
    const before = structuredClone(input);
    const result = validateAutomaticOrder(input);
    assert.ok(result.notional > 49 && result.notional <= 50);
    assert.ok(result.stopRisk <= 2.5);
    assert.deepEqual(input, before, 'guard must not change approved candidate, account or settings');
  }
});

test('final execution is bound to the selected strategies and original evidence expiry',()=>{
  const input=approved();
  for(const matchedStrategies of [[],['unknown'],['strong_signal'],['anomaly','anomaly']]){
    assert.throws(()=>validateAutomaticOrder({...input,settings:{...input.settings,selectedStrategies:['anomaly']},
      candidate:{...input.candidate,matchedStrategies}}),/策略/);
  }
  assert.throws(()=>validateAutomaticOrder({...input,candidate:{...input.candidate,evidenceExpiresAt:now}}),/过期/);
});

test('candidate price windows reject missing legacy fields, malformed values and drift beyond the narrower saved bound', () => {
  const input=approved();
  const legacy={...input.candidate}; delete legacy.maxEntryDriftPct;
  assert.throws(()=>validateAutomaticOrder({...input,candidate:legacy}),/窗口|偏移/);
  for(const maxEntryDriftPct of [undefined,null,"0.3",NaN,Infinity,-0.001,input.settings.maxSlippagePct+0.001]) {
    assert.throws(()=>validateAutomaticOrder({...input,candidate:{...input.candidate,maxEntryDriftPct}}),/窗口|偏移/);
  }
  const narrower={...input.candidate,maxEntryDriftPct:0.02};
  for(const drift of [-0.02,0,0.02]) assert.doesNotThrow(()=>validateAutomaticOrder({...input,candidate:narrower,price:input.price*(1+drift/100)}));
  for(const drift of [-0.021,0.021]) assert.throws(()=>validateAutomaticOrder({...input,candidate:narrower,price:input.price*(1+drift/100)}),/窗口|偏移/);
  const exact={...input.candidate,maxEntryDriftPct:0};
  assert.doesNotThrow(()=>validateAutomaticOrder({...input,candidate:exact}));
  assert.throws(()=>validateAutomaticOrder({...input,candidate:exact,price:input.price*1.00000001}),/窗口|偏移/);
});

test('approved quantity and leverage cannot increase or change, and non-finite order values fail closed', () => {
  for (const patch of [{ quantity: 0 }, { quantity: NaN }, { quantity: Infinity }, { price: 0 }, { price: NaN }, { leverage: 3 }, { leverage: 1 }]) {
    const input = approved();
    assert.throws(() => validateAutomaticOrder({ ...input, ...patch }));
  }
  const input = approved();
  assert.throws(() => validateAutomaticOrder({ ...input, quantity: input.quantity * 1.001 }), /数量|杠杆/);
  assert.doesNotThrow(() => validateAutomaticOrder({ ...input, quantity: input.quantity / 2 }));
});

test('actual order, combined pending exposure, position count and available margin caps are enforced at execution', () => {
  const input = approved();
  const exposure = { symbol: 'ETHUSDT', side: 'LONG', notional: 160, openedAt: now - 1000 };
  for (const account of [
    { ...input.account, pendingEntries: [exposure] },
    { ...input.account, openPositions: [exposure] },
    { ...input.account, availableMargin: 1 },
    { ...input.account, pendingEntries: ['ETHUSDT','SOLUSDT','BNBUSDT'].map(symbol => ({ ...exposure, symbol, notional: 5 })) },
  ]) assert.throws(() => validateAutomaticOrder({ ...input, account }));
  assert.throws(() => validateAutomaticOrder({ ...input, settings: { ...input.settings, orderNotional: 40 } }), /名义金额/);
  assert.throws(() => validateAutomaticOrder({ ...input, settings: { ...input.settings, maxPortfolioNotional: 40 } }), /名义金额/);
  assert.throws(() => validateAutomaticOrder({ ...input, account: { ...input.account, equity: 100 } }), /名义金额|风险预算/);
});

test('same-symbol manual positions and pending orders block both repeated and opposing automatic entries', () => {
  for (const side of ['LONG','SHORT']) for (const collection of ['openPositions','pendingEntries']) {
    const input = approved();
    const account = { ...input.account, [collection]: [{ symbol: 'BTCUSDT', side, notional: 5, openedAt: now - 1000, automationManaged: false }] };
    assert.throws(() => validateAutomaticOrder({ ...input, account }), /同一标的/);
  }
});

test('expired quotes, stale accounts, unknown account state and unresolved orders cannot pass final validation', () => {
  const input = approved();
  assert.throws(() => validateAutomaticOrder({ ...input, now: input.candidate.expiresAt }), /过期/);
  assert.throws(() => validateAutomaticOrder({ ...input, now: NaN }));
  assert.throws(() => validateAutomaticOrder({ ...input, candidate: { ...input.candidate, expiresAt: NaN } }));
  for (const patch of [{ observedAt: now - 30001 }, { observedAt: now + 5001 }, { observedAt: NaN },
    { reconciliationHealthy: false }, { unresolvedOrders: true }, { killSwitch: true }]) {
    assert.throws(() => validateAutomaticOrder({ ...input, account: { ...input.account, ...patch } }), JSON.stringify(patch));
  }
});

test('net reward-risk and refreshed prices include costs; gross reward or a lower fee estimate cannot bypass them', () => {
  const input = approved();
  const grossRiskDistance = Math.abs(input.price - input.candidate.stopLoss);
  const grossTwoToOneTarget = input.price + 2 * grossRiskDistance;
  assert.throws(() => validateAutomaticOrder({ ...input, candidate: { ...input.candidate, takeProfit: grossTwoToOneTarget } }), /盈亏比/);
  assert.throws(() => validateAutomaticOrder({ ...input, candidate: { ...input.candidate, estimatedLossWithCosts: input.quantity * grossRiskDistance } }), /成本预留/);
  assert.throws(() => validateAutomaticOrder({ ...input, price: input.price * 1.004 }), /价格偏移/);
  assert.doesNotThrow(() => validateAutomaticOrder({ ...input, price: input.price * 1.001 }), 'permitted repricing is already budgeted by the selector');
  assert.throws(() => validateAutomaticOrder({ ...input, settings: { ...input.settings, riskPerTradePct: 0.01 } }), /风险预算/);
});

test('LONG and SHORT candidates tolerate small price moves and the permitted interval under unchanged final gates', () => {
  for (const side of ['LONG', 'SHORT']) for (const overrides of [
    {},
    { market: { atrPct: 0.2 } }, // The minimum-stop boundary needs room on both sides.
    { account: { equity: 100, dayStartEquity: 100 } }, // Risk, rather than nominal size, limits this trade.
    { account: { availableMargin: 4 } }, // Margin must reserve the highest possible price.
  ]) {
    const input = approved(side, overrides);
    for (const percent of [-0.2999, -0.1, -0.05, 0, 0.05, 0.1, 0.2999]) {
      const price = input.candidate.entryPrice * (1 + percent / 100);
      assert.doesNotThrow(() => validateAutomaticOrder({ ...input, price }), `${side}, ${percent}%, ${JSON.stringify(overrides)}`);
    }
    for (const percent of [-0.301, 0.301]) {
      assert.throws(() => validateAutomaticOrder({ ...input, price: input.candidate.entryPrice * (1 + percent / 100) }), /价格偏移/);
    }
    assert.ok(input.candidate.worstCaseNotional <= input.settings.orderNotional + 1e-8);
    assert.ok(input.candidate.worstCaseMarginRequired <= input.account.availableMargin + 1e-8);
    assert.ok(input.candidate.worstCaseLossWithCosts <= input.account.equity * input.settings.riskPerTradePct / 100 + 1e-8);
    assert.ok(input.candidate.notional < input.settings.orderNotional, 'quantity leaves room for a price increase');
  }
});

test('daily realized plus unrealized losses stop trading at the baseline limit even when current equity has grown', () => {
  const input = approved();
  for (const equity of [1000, 2000]) {
    assert.throws(() => validateAutomaticOrder({ ...input, account: { ...input.account, equity, dailyPnl: -10 } }), /日内亏损/);
    assert.throws(() => validateAutomaticOrder({ ...input, account: { ...input.account, equity, dailyPnl: -12 } }), /日内亏损/);
  }
  assert.doesNotThrow(() => validateAutomaticOrder({ ...input, account: { ...input.account, dailyPnl: -9.99 } }));
  for (const dailyPnl of [null, NaN, Infinity]) assert.throws(() => validateAutomaticOrder({ ...input, account: { ...input.account, dailyPnl } }));
});
