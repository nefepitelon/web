const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.join(__dirname, '..');
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    if (['zod', '@prisma/client', 'node:crypto'].includes(name)) return require(name);
    throw new Error(`Unmocked dependency ${name}`);
  }, Date, Error, Buffer, Response, Request, URL, setTimeout, clearTimeout });
  return module.exports;
}
const strategy = load('lib/alpha-execution/automation-strategy.ts');
const selectionSummary = load('lib/alpha-execution/automation-summary.ts');
const savedSettings = load('lib/alpha-execution/automation-settings.ts', { './automation-strategy': strategy });
const copy = value => structuredClone(value);
const terminal = ['CLOSED', 'REJECTED', 'CANCELED'];
const execution = { perOrderNotionalLimit: 100, maxLeverage: 3, maxOpenPositions: 3, minAlphaScore: 80,
  maxPortfolioExposurePct: 20, riskPerTradePct: 0.25, dailyLossLimitPct: 1, dedupeWindowMinutes: 15 };

test('saved legacy limits become an editable draft but cannot silently authorize the new strategy set', async () => {
  const old = { ...copy(strategy.DEFAULT_ALPHA_AUTOMATION_SETTINGS), minIndependentSources:2, maxAbsReturn15mPct:2,
    maxAbsReturn1hPct:5, maxAbsReturn24hPct:15, maxAbsFundingPct:0.05, minVolumeMultiple:1.2, maxVolumeMultiple:4 };
  delete old.selectedStrategies;
  const before = copy(old);
  const draft = savedSettings.readSavedAutomationSettings(old);
  assert.deepEqual(old,before);
  assert.equal(draft.orderNotional,old.orderNotional);
  assert.equal(savedSettings.requiresAutomationStrategySelection(old),true);
  assert.equal('minIndependentSources' in draft,false);
  assert.equal(strategy.alphaAutomationSettingsSchema.safeParse(old).success,false,'retired API fields are not silently accepted');
  assert.throws(()=>savedSettings.readSavedAutomationSettings({...old,unrecognized:true}));
  const f = fixture({config:{enabled:false,status:'STOPPED',settings:old}});
  const response = await f.post({action:'start',version:'v1',confirmation:'START_LIVE_AUTOMATION',acknowledged:true});
  assert.equal(response.status,400);
  assert.equal(f.calls.workflow.length,0);
  assert.equal(f.calls.execute.length,0);
  assert.equal(f.config.enabled,false);
});

test('slow account collection refreshes only stale execution quotes without extending strategy evidence', async () => {
  const f = fixture();
  const observedAt=Date.now()-60_000;
  const snapshot={symbol:'BTCUSDT',observedAt,quoteAt:Date.now()-40_000,bid:99,ask:101};
  f.dependencies['./automation-market'].loadAlphaAutomationMarket=async()=>({observations:[],markets:[snapshot],sourceStatus:[]});
  let refreshes=0;
  const refresh=f.dependencies['./automation-market'].refreshAlphaAutomationQuote;
  f.dependencies['./automation-market'].refreshAlphaAutomationQuote=async(...args)=>{refreshes++;return refresh(...args);};
  let checked;
  f.dependencies['./automation-strategy'].selectAlphaAutomationCandidates=input=>{checked=input;return {candidates:[],rejections:[]};};
  await f.runtime.previewAutomation('alice');
  assert.equal(refreshes,1);
  assert.equal(checked.markets[0].observedAt,observedAt);
  assert.ok(checked.markets[0].quoteAt>Date.now()-5000);
  snapshot.quoteAt=Date.now()-40_000;
  f.dependencies['./automation-market'].refreshAlphaAutomationQuote=async()=>{throw new Error('unavailable');};
  await f.runtime.previewAutomation('alice');
  assert.equal(checked.markets[0].quoteAt,0,'failed refresh cannot leave an executable old book');
  assert.equal(checked.markets[0].observedAt,observedAt);
});

test('a candidate rejected before approval does not stop checking other independent candidates',async()=>{
  const make=symbol=>({symbol,side:'LONG',quantity:0.5,entryPrice:100,stopLoss:98,takeProfit:105,notional:50,
    estimatedLossWithCosts:1.1,evidenceExpiresAt:Date.now()+60_000,leverage:2,matchedStrategies:['strong_signal']});
  const first=make('BTCUSDT'),second=make('ETHUSDT');
  const f=fixture({candidates:[first,second]});
  const refresh=f.dependencies['./automation-market'].refreshAlphaAutomationQuote;
  f.dependencies['./automation-market'].refreshAlphaAutomationQuote=async(s,symbol)=>{
    if(symbol==='BTCUSDT')throw new Error('quote expired');
    return refresh(s,symbol);
  };
  await f.runtime.runAlphaAutoCycle('alice','g1');
  assert.equal(f.config.enabled,true);
  assert.equal(f.reservations[0].status,'REJECTED');
  assert.equal(f.calls.approve.length,1);
  assert.equal(f.calls.approve[0][0].symbol,'ETHUSDT');
  assert.equal(f.calls.execute.length,0,'a risk rejection is not an exchange fill');
});

test('preview and worker preserve venue rejection diagnostics and audit parameter warnings without trading', async () => {
  const f = fixture();
  const warnings = [{ code:'PRICE_WINDOW_NARROWED', message:'候选价格窗口已收紧', details:{maxEntryDriftPct:0.22} }];
  const rejections = [
    {symbol:'SPOTUSDT',reason:'MARKET_SNAPSHOT_MISSING_OR_AMBIGUOUS',details:{matchedStrategies:['p2_two_source']}},
    {symbol:'OLDUSDT',reason:'NO_SELECTED_STRATEGY_MATCH',message:'原始信号超过10分钟'},
    {symbol:'ATRUSDT',reason:'ATR_STOP_EXCEEDS_LIMIT',message:'ATR要求2%，上限1.5%'},
  ];
  f.dependencies['./automation-strategy'].selectAlphaAutomationCandidates=()=>({candidates:[],rejections:copy(rejections),parameterWarnings:warnings,blockedReason:'NO_ELIGIBLE_CANDIDATE'});
  const sourceStatus=[{source:'risk_pool',ok:true,count:3,observedAt:Date.now()}];
  f.dependencies['./automation-market'].loadAlphaAutomationMarket=async()=>({observations:[],markets:[],sourceStatus,
    marketRejections:[{symbol:'SPOTUSDT',reason:'MARKET_NOT_TRADABLE',message:'当前不属于可交易USDT永续'}]});
  const preview=await f.runtime.previewAutomation('alice');
  assert.equal(preview.previewOnly,true);
  assert.equal(preview.rejections[0].reason,'MARKET_NOT_TRADABLE');
  assert.deepEqual(preview.rejections[0].details.matchedStrategies,['p2_two_source']);
  assert.equal(preview.rejections[1].reason,'NO_SELECTED_STRATEGY_MATCH');
  assert.deepEqual(preview.parameterWarnings,warnings);
  assert.equal(f.calls.events.length,0,'preview cannot write scan events');
  assert.deepEqual(copy(await f.runtime.runAlphaAutoCycle('alice','g1')),{stop:false,waitMs:60000});
  const event=f.calls.events.find(row=>row[1]==='SCAN');
  assert.match(event[2],/本轮无可执行候选/);
  assert.match(event[2],/ATR 止损超限 1/);
  assert.equal(event[3].rejections[0].reason,'MARKET_NOT_TRADABLE');
  assert.deepEqual(event[3].sourceStatus,sourceStatus);
  assert.deepEqual(event[3].parameterWarnings,warnings);
  assert.equal(f.calls.approve.length,0);
  assert.equal(f.calls.execute.length,0);
  assert.equal(f.config.enabled,true,'no eligible candidate is not an account or workflow failure');
});

function matches(row, where) {
  return Object.entries(where || {}).every(([key, value]) => {
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'AND') return value.every(part => matches(row, part));
    if (value === undefined) return true;
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      if ('in' in value) return value.in.includes(row[key]);
      if ('lt' in value) return row[key] != null && row[key] < value.lt;
      if ('gt' in value) return row[key] != null && row[key] > value.gt;
      if ('gte' in value) return row[key] != null && row[key] >= value.gte;
      if ('not' in value) return row[key] !== value.not;
      return row[key] != null && matches(row[key], value);
    }
    return value instanceof Date ? Number(row[key]) === Number(value) : row[key] === value;
  });
}

function fixture(options = {}) {
  const config = { userId: 'alice', enabled: true, status: 'RUNNING', version: 'v1', generation: 'g1', grantFingerprint: 'grant',
    expiresAt: new Date(Date.now() + 3600000), nextScanAt: null, lastOrderAt: null, leaseToken: null, leaseUntil: null,
    settings: copy(strategy.DEFAULT_ALPHA_AUTOMATION_SETTINGS), ...options.config };
  const reservations = copy(options.reservations || []);
  const plans = copy(options.plans || []).map(plan => ({ environment: 'LIVE', market: 'FUTURES', ...plan }));
  const calls = { reconcile: [], market: 0, approve: [], execute: [], close: [], cancel: [], events: [], workflow: [], auth: [], readiness: 0 };
  const account = { equity: 1000, availableMargin: 900, dailyPnl: 0, openPositions: [], pendingEntries: [], reconciliationHealthy: true, unresolvedOrders: false, ...options.account };
  const configModel = {
    upsert: async () => copy(config),
    findUnique: async () => copy(config),
    findUniqueOrThrow: async () => copy(config),
    update: async ({ where, data }) => { assert.equal(where.userId, 'alice'); Object.assign(config, data); return copy(config); },
    updateMany: async ({ where, data }) => { if (!matches(config, where)) return { count: 0 }; Object.assign(config, data); return { count: 1 }; },
  };
  const orderModel = {
    findMany: async ({ where }) => reservations.filter(item => matches(item, where)).map(copy),
    findFirst: async ({ where }) => copy(reservations.find(item => matches(item, where)) || null),
    count: async ({ where }) => reservations.filter(item => matches(item, where)).length,
    update: async ({ where, data }) => { const item = reservations.find(row => row.id === where.id); if (!item) throw new Error('missing reservation'); Object.assign(item, data); return copy(item); },
    create: async ({ data }) => { const item = { id: `r${reservations.length + 1}`, status: 'RESERVED', ...data }; reservations.push(item); return copy(item); },
  };
  const prisma = { alphaAutomationConfig: configModel, alphaAutomationOrder: orderModel,
    alphaExecutionPlan: { findFirst: async ({ where }) => copy(plans.find(item => matches(item, where)) || null) },
    alphaTradingOrder: { findMany: async () => [] },
    $queryRaw: async () => [],
    $transaction: async callback => callback(prisma),
  };
  const data = {
    autoConfig: async () => copy(config), autoEvent: async (...args) => { calls.events.push(args); },
    currentAutoGrant: async () => ({ fingerprint: 'grant', managementFingerprint: 'grant', execution }),
    json: copy, TERMINAL_AUTO_ORDER: terminal,
    automationSnapshot: async () => ({ ok: true, config: copy(config) }),
    saveAutomationSettings: async () => {}, stopAutomation: async () => { config.enabled = false; config.status = 'STOPPING'; },
  };
  const dependencies = {
    '@/lib/prisma': { prisma }, './automation-data': data, './automation-settings': savedSettings,
    './automation-strategy': { ...strategy, selectAlphaAutomationCandidates: () => ({ candidates: options.candidates || [], rejections: [] }) },
    './automation-market': {
      loadAlphaAutomationMarket: async () => { calls.market++; return { observations: [], markets: [], sourceStatus: {} }; },
      refreshAlphaAutomationQuote: async () => ({ bid: 99.99, ask: 100, quoteAt: Date.now(), estimatedSlippagePct: 0.01, liquidityNotional: 1000, takerFeePct: 0.06,
        filters: { minQty: 0.0001, maxQty: 100, stepSize: 0.0001, minNotional: 0.01, maxNotional: 1000 } }),
    },
    './automation-account': { loadAutomationAccount: async () => { calls.readiness++; return { account, execution }; } },
    './automation-guard': { validateAutomaticOrder: () => { if (account.unresolvedOrders) throw new Error('unresolved orders'); } },
    './service': {
      reconcileExecution: async (...args) => { calls.reconcile.push(args); await options.onReconcile?.(); },
      approveTradeIntent: async (...args) => { calls.approve.push(args); return { ok: false }; },
      executePlan: async (...args) => { calls.execute.push(args); },
      closeLivePosition: async (...args) => { calls.close.push(args); },
      cancelExecutionPlan: async (...args) => { calls.cancel.push(args); },
    },
    './binance': { getLiveBinanceReferencePrice: async () => 100 },
  };
  const runtime = load('lib/alpha-execution/automation-runtime.ts', dependencies);
  const route = load('app/api/alpha-execution/automation/route.ts', {
    '@/lib/prisma': { prisma },
    '@/lib/request-security': { assertSameOrigin: request => { if (new URL(request.url).origin !== request.headers.get('origin')) throw new Error('cross origin'); } },
    '@/lib/alpha-execution/access': { requireAlphaOperator: async flags => { calls.auth.push(flags); return { id: 'alice' }; }, alphaExecutionErrorResponse: error => Response.json({ error: error.message }, { status: 400 }) },
    '@/lib/alpha-execution/automation-data': data,
    '@/lib/alpha-execution/automation-settings': savedSettings,
    '@/lib/alpha-execution/automation-strategy': strategy,
    '@/lib/alpha-execution/automation-runtime': { previewAutomation: async () => ({ previewOnly: true }) },
    '@/lib/alpha-execution/automation-account': dependencies['./automation-account'],
    '@/lib/alpha-execution/automation-workflow': { alphaAutomationWorkflow: () => {} },
    '@/lib/alpha-execution/automation-recommendation': { recommendAutomationSettings: async (user, settings) => ({ source: 'rules', settings, summary: 'readonly', reasons: [] }) },
    'workflow/api': { start: async (...args) => { calls.workflow.push(args); if (options.workflowError) throw new Error('unknown workflow response'); return { runId: 'workflow-id' }; } },
  });
  const post = body => route.POST(new Request('https://local.test/api/alpha-execution/automation', {
    method: 'POST', headers: { 'origin': 'https://local.test', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { config, reservations, plans, calls, prisma, dependencies, data, runtime, route, post };
}

test('automation is off by default and saving enabled=true cannot grant a session', async () => {
  assert.equal(strategy.DEFAULT_ALPHA_AUTOMATION_SETTINGS.enabled, false);
  const f = fixture({ config: { enabled: false, status: 'STOPPED' } });
  const mod = load('lib/alpha-execution/automation-data.ts', {
    '@/lib/prisma': { prisma: f.prisma },
    './automation-strategy': strategy,
    './automation-settings': savedSettings,
    './automation-summary': selectionSummary,
    './data': { getOrCreateAlphaExecutionConfig: async () => ({}), publicConfig: value => value, writeAlphaAudit: async () => {} },
  });
  await mod.saveAutomationSettings('alice', { enabled: true });
  assert.equal(f.config.enabled, false);
  assert.equal(f.config.settings.enabled, false);
  assert.notEqual(f.config.version, 'v1');
  assert.equal(f.calls.execute.length, 0);
});

test('recommendation is authenticated, read-only and uses the saved configuration when no draft is supplied', async () => {
  const f = fixture({ config: { enabled: false, status: 'STOPPED' } });
  const response = await f.post({action:'recommend'});
  assert.equal(response.status,200);
  const result = await response.json();
  assert.equal(result.recommendation.source,'rules');
  assert.deepEqual(result.recommendation.settings,f.config.settings);
  assert.equal(f.config.enabled,false);
  assert.equal(f.calls.execute.length,0);
  assert.equal(f.calls.workflow.length,0);
  assert.ok(f.calls.auth.some(flags=>flags?.live));
  f.config.status='STOPPING';
  assert.equal((await f.post({action:'recommend'})).status,400);
});

test('start requires exact acknowledgement, current saved version, healthy account and live authorization', async () => {
  for (const body of [
    { action: 'start', version: 'v1', acknowledged: true },
    { action: 'start', version: 'v1', confirmation: 'START_LIVE_AUTOMATION', acknowledged: false },
    { action: 'start', version: 'old', confirmation: 'START_LIVE_AUTOMATION', acknowledged: true },
  ]) {
    const f = fixture({ config: { enabled: false, status: 'STOPPED' } });
    assert.equal((await f.post(body)).status, 400);
    assert.equal(f.config.enabled, false);
    assert.equal(f.calls.workflow.length, 0);
  }
  const f = fixture({ config: { enabled: false, status: 'STOPPED' } });
  const response = await f.post({ action: 'start', version: 'v1', confirmation: 'START_LIVE_AUTOMATION', acknowledged: true });
  assert.equal(response.status, 200);
  assert.equal(f.config.enabled, true);
  assert.equal(f.config.status, 'RUNNING');
  assert.equal(f.calls.workflow.length, 1);
  assert.deepEqual(Array.from(f.calls.workflow[0][1]), ['alice', f.config.generation]);
  assert.ok(f.calls.auth.some(item => item?.live === true));
  assert.equal(f.calls.execute.length, 0);
  const unresolved = fixture({ config: { enabled: false, status: 'STOPPED' }, account: { unresolvedOrders: true } });
  assert.equal((await unresolved.post({ action: 'start', version: 'v1', confirmation: 'START_LIVE_AUTOMATION', acknowledged: true })).status, 400);
  assert.equal(unresolved.config.enabled, false);
});

test('unknown workflow start result closes new-entry authorization instead of claiming a running session', async () => {
  const f = fixture({ config: { enabled: false, status: 'STOPPED' }, workflowError: true });
  assert.equal((await f.post({ action: 'start', version: 'v1', confirmation: 'START_LIVE_AUTOMATION', acknowledged: true })).status, 400);
  assert.equal(f.config.enabled, false);
  assert.equal(f.config.status, 'ERROR');
  assert.equal(f.calls.execute.length, 0);
});

test('stopped and expired sessions reconcile but never scan or approve new entries', async () => {
  for (const config of [{ enabled: false, status: 'STOPPING' }, { expiresAt: new Date(Date.now() - 1) }]) {
    const f = fixture({ config });
    const result = await f.runtime.runAlphaAutoCycle('alice', 'g1');
    assert.equal(result.stop, true);
    assert.equal(f.calls.reconcile.length, 1);
    assert.equal(f.calls.market, 0);
    assert.equal(f.calls.approve.length, 0);
    assert.equal(f.calls.execute.length, 0);
    assert.equal(f.config.enabled, false);
    assert.equal(f.config.leaseToken, null);
  }
});

test('concurrent durable tasks compete for one atomic lease and only one reaches reconciliation and scan', { timeout: 5000 }, async () => {
  let release; let entered;
  const inReconcile = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = fixture({ onReconcile: async () => { entered(); await gate; } });
  const first = f.runtime.runAlphaAutoCycle('alice', 'g1');
  await inReconcile;
  const second = await f.runtime.runAlphaAutoCycle('alice', 'g1');
  assert.equal(second.stop, false);
  assert.equal(f.calls.reconcile.length, 1);
  release();
  await first;
  assert.equal(f.calls.market, 1);
  assert.equal(f.config.leaseToken, null);
  assert.equal(f.calls.execute.length, 0);
  let replaced;
  replaced = fixture({ onReconcile: async () => { replaced.config.leaseToken = 'replacement-worker'; replaced.config.leaseUntil = new Date(Date.now() + 60000); } });
  await replaced.runtime.runAlphaAutoCycle('alice', 'g1');
  assert.equal(replaced.calls.market, 0, 'a worker that lost its lease may not continue into scanning');
  assert.equal(replaced.config.leaseToken, 'replacement-worker', 'old worker cleanup must not release a new owner lease');
  assert.equal(replaced.config.enabled, true, 'lease loss alone must not turn off the newer worker');
});

test('interrupted SUBMITTING and UNKNOWN entries only reconcile and pause; unsubmitted plans are canceled rather than replayed', async () => {
  for (const state of ['UNKNOWN', 'EXECUTING', 'AWAITING_CONFIRMATION']) {
    const f = fixture({
      reservations: [{ id: 'r1', userId: 'alice', generation: 'g1', status: 'SUBMITTING', planId: 'p1', symbol: 'BTCUSDT', closeAfter: new Date(Date.now() + 10000) }],
      plans: [{ id: 'p1', userId: 'alice', state, intent: { source: 'alpha-auto:r1' }, position: null, orders: [] }],
    });
    await f.runtime.runAlphaAutoCycle('alice', 'g1');
    assert.equal(f.calls.reconcile.length, 1);
    assert.equal(f.calls.execute.length, 0);
    if (state === 'AWAITING_CONFIRMATION') {
      assert.deepEqual(f.calls.cancel, [['p1', 'alice']]);
      assert.equal(f.reservations[0].status, 'CANCELED');
    } else {
      assert.equal(f.config.enabled, false);
      assert.equal(f.config.status, 'STOPPING');
      assert.equal(f.calls.market, 0);
    }
  }
});

test('holding-time exits close only matching module-owned plans and verified entry quantities', async () => {
  for (const scenario of [{ source: 'alpha-auto:r1', valid: true }, { source: 'manual', valid: false },
    { source: 'alpha-auto:r1', orders: [], valid: false },
    { source: 'alpha-auto:r1', orders: [{ role: 'ENTRY', filledQuantity: NaN }], valid: false }]) {
    const f = fixture({ config: { enabled: false, status: 'STOPPING' },
      reservations: [{ id: 'r1', userId: 'alice', generation: 'g1', status: 'MONITORING', planId: 'p1', symbol: 'BTCUSDT', closeAfter: new Date(Date.now() - 10000) }],
      plans: [{ id: 'p1', userId: 'alice', state: 'MONITORING', intent: { source: scenario.source }, position: { id: 'position-owned', quantity: 0.01, closedAt: null }, orders: scenario.orders || [{ role: 'ENTRY', filledQuantity: 0.01 }] },
        { id: 'p2', userId: 'alice', state: 'MONITORING', intent: { source: 'manual' }, position: { id: 'position-manual', closedAt: null }, orders: [] }],
    });
    await f.runtime.runAlphaAutoCycle('alice', 'g1');
    assert.deepEqual(f.calls.close, scenario.valid ? [['position-owned', 'alice']] : []);
    assert.equal(f.calls.execute.length, 0);
  }
});

test('common executor rejects automatic plans before claiming and again immediately before exchange submission', async () => {
  const guarded = fixture({ config: { leaseToken: 'owned-lease', leaseUntil: new Date(Date.now() + 60000) },
    reservations: [{ id: 'r1', userId: 'alice', generation: 'g1', status: 'SUBMITTING', planId: 'p1', candidate: { symbol: 'BTCUSDT', side: 'LONG', quantity: 0.001, entryPrice: 100, stopLoss: 98, notional: 0.1, estimatedLossWithCosts: 0.01, evidenceExpiresAt: Date.now() + 60000 } }],
    plans: [{ id: 'p1', userId: 'alice', intent: { source: 'alpha-auto:r1', leverage: 2 }, mainOrder: { quantity: 0.001 } }],
  });
  await guarded.runtime.assertAutoPlanExecution('alice', 'p1', 100);
  guarded.config.enabled = false;
  await assert.rejects(guarded.runtime.assertAutoPlanExecution('alice', 'p1', 100), /会话已停止/);
  guarded.config.enabled = true;
  guarded.reservations[0].generation = 'old-generation';
  await assert.rejects(guarded.runtime.assertAutoPlanExecution('alice', 'p1', 100), /预留不可用/);
  guarded.reservations[0].generation = 'g1';
  guarded.dependencies['./automation-account'].loadAutomationAccount = async () => {
    guarded.config.enabled = false;
    return { account: {}, execution };
  };
  await assert.rejects(guarded.runtime.assertAutoPlanExecution('alice', 'p1', 100), /被停止|租约失效/);
  for (const failAt of [1, 2]) {
    let checks = 0; let claims = 0; let submissions = 0;
    const submissionLock = { userId: 'alice', submissionToken: null, submissionUntil: null };
    const plan = { id: 'p1', userId: 'alice', intentId: 'i1', environment: 'LIVE', market: 'FUTURES', state: 'PLANNED', expiresAt: new Date(Date.now() + 60000), orders: [],
      intent: { source: 'alpha-auto:r1', symbol: 'BTCUSDT', leverage: 2 }, mainOrder: { side: 'BUY', type: 'MARKET', quantity: 0.001, price: null } };
    const entry = { id: 'entry' };
    const prisma = { alphaAutomationConfig: { upsert: async () => copy(submissionLock), findUnique: async () => copy(submissionLock),
        updateMany: async ({ where, data }) => { if (!matches(submissionLock, where)) return { count: 0 }; Object.assign(submissionLock, data); return { count: 1 }; } },
      alphaExecutionPlan: { findFirst: async () => copy(plan), updateMany: async () => { claims++; return {count:1}; }, update: async () => {} },
      alphaTradingOrder: { upsert: async () => entry, update: async () => entry },
      alphaTradingCredential: { findUnique: async () => ({ id: 'credential', environment: 'LIVE', market: 'FUTURES', enabled: true, verifiedAt: new Date(), apiKeyEncrypted: 'fixture', apiSecretEncrypted: 'fixture' }) } };
    const service = load('lib/alpha-execution/service.ts', {
      '@/lib/prisma': { prisma },
      '@/lib/alpha-execution/binance': { AlphaBinanceClient: class { async placeOrder() { submissions++; throw new Error('unexpected submission'); } async close() {} }, BinanceRequestError: class extends Error {}, getLiveBinanceReferencePrice: async () => 100, isBinanceMissingOrderError: () => false },
      '@/lib/alpha-execution/credentials': { decryptTradingSecret: value => value },
      '@/lib/alpha-execution/data': { getOrCreateAlphaExecutionConfig: async () => ({ activeMode: 'LIVE', defaultMarket: 'FUTURES', liveEnabled: true, liveUnlockedAt: new Date(), reconciliationHealthy: true }), writeAlphaAudit: async () => {} },
      '@/workers/risk_engine.js': {},
      './automation-runtime': { assertAutoPlanExecution: async () => { if (++checks === failAt) throw new Error('automatic session revoked'); } },
    });
    await assert.rejects(service.executePlan('p1', 'alice'), /automatic session revoked/);
    assert.equal(checks, failAt);
    assert.equal(claims, failAt === 1 ? 0 : 1);
    assert.equal(submissions, 0);
    assert.equal(submissionLock.submissionToken, null, 'failed final checks release only their own account submission lease');
    await assert.rejects(service.approveTradeIntent({ source: 'alpha-auto:forged' }, 'alice', true), /已授权的服务端任务/);
    submissionLock.submissionToken = 'another-entry-request';
    submissionLock.submissionUntil = new Date(Date.now() + 60000);
    plan.intent.source = 'manual';
    await assert.rejects(service.executePlan('p1', 'alice'), /当前账户有订单正在提交/);
    assert.equal(submissionLock.submissionToken, 'another-entry-request');
    assert.equal(claims, failAt === 1 ? 0 : 1, 'manual entry must honor the same account submission lease');
    assert.equal(submissions, 0);
  }
});

test('real strategy candidate completes reservation, approval, execution, monitoring and an owned holding-time exit', async () => {
  const now = Date.now();
  const account = { observedAt: now, dayStartEquity: 1000, killSwitch: false };
  const observations = ['anomaly', 'momentum'].map(source => ({ source, evidenceId: `${source}:BTC:event-1`, symbol: 'BTC', side: 'LONG',
    score: source === 'momentum' ? null : 86, observedAt: now - 1000, dataComplete: true, overheated: false, priceMomentumScore:90, volumeAnomalyScore:90 }));
  const market = { symbol: 'BTCUSDT', market: 'futures', tradable: true, observedAt: now - 1000, quoteAt: now,
    bid: 99.99, ask: 100.01, quoteVolume24h: 30000000, return15mPct: 0.4, return1hPct: 1, return24hPct: 3,
    volumeMultiple: 1.5, atrPct: 1, fundingPct: 0.005, oiChangePct: 2, estimatedSlippagePct: 0.1, liquidityNotional: 100, takerFeePct: 0.05,
    filters: { tickSize: 0.01, stepSize: 0.001, minQty: 0.001, maxQty: 100000, minNotional: 5, maxNotional: null } };
  const f = fixture({ account });
  f.dependencies['./automation-strategy'].selectAlphaAutomationCandidates = strategy.selectAlphaAutomationCandidates;
  f.dependencies['./automation-guard'].validateAutomaticOrder = load('lib/alpha-execution/automation-guard.ts', { './automation-strategy': strategy }).validateAutomaticOrder;
  let quoteReads = 0;
  f.dependencies['./automation-market'].loadAlphaAutomationMarket = async () => {
    f.calls.market++;
    return { observations, markets: [market], sourceStatus: { anomaly: 'ready', momentum: 'ready' } };
  };
  f.dependencies['./automation-market'].refreshAlphaAutomationQuote = async () => {
    quoteReads++;
    return { ...market, quoteAt: Date.now() };
  };
  f.dependencies['./service'].approveTradeIntent = async (intent, userId, factor, limits) => {
    f.calls.approve.push([intent, userId, factor, limits]);
    assert.equal(userId, 'alice');
    assert.equal(factor, true);
    assert.equal(intent.source, 'alpha-auto:r1');
    assert.deepEqual(Array.from(limits.matchedStrategies), ['anomaly']);
    assert.equal(limits.quantityStep, market.filters.stepSize);
    assert.ok(limits.maxQuantity > 0 && limits.maxQuantity * intent.entryPrice <= 50);
    const plan = { id: 'approved-plan', userId, environment: 'LIVE', market: 'FUTURES', state: 'AWAITING_CONFIRMATION',
      intent, mainOrder: { quantity: limits.maxQuantity }, position: null, orders: [] };
    f.plans.push(plan);
    return { ok: true, executionPlan: { planId: plan.id } };
  };
  f.dependencies['./service'].executePlan = async (planId, userId) => {
    f.calls.execute.push([planId, userId]);
    assert.equal(f.reservations[0].status, 'SUBMITTING');
    assert.equal(f.reservations[0].planId, planId);
    // Exercise the actual final authorization + refreshed quote + final risk guard,
    // while the exchange submission itself remains a deterministic fixture.
    await f.runtime.assertAutoPlanExecution(userId, planId);
    const plan = f.plans.find(row => row.id === planId);
    plan.state = 'MONITORING';
    plan.orders = [{ role: 'ENTRY', status: 'FILLED', filledQuantity: plan.mainOrder.quantity }];
    plan.position = { id: 'owned-position', quantity: plan.mainOrder.quantity, closedAt: null };
  };
  f.dependencies['./service'].closeLivePosition = async (positionId, userId) => {
    f.calls.close.push([positionId, userId]);
    const plan = f.plans.find(row => row.position?.id === positionId);
    plan.position.closedAt = new Date();
    plan.state = 'CLOSED';
  };
  const first = await f.runtime.runAlphaAutoCycle('alice', 'g1');
  assert.equal(first.stop, false, JSON.stringify(f.calls.events));
  assert.equal(f.calls.approve.length, 1, JSON.stringify(f.calls.events));
  assert.deepEqual(f.calls.execute, [['approved-plan', 'alice']]);
  assert.equal(f.reservations.length, 1);
  assert.equal(f.reservations[0].status, 'MONITORING');
  assert.equal(f.config.enabled, true);
  assert.ok(f.config.lastOrderAt instanceof Date);
  assert.ok(quoteReads >= 2, 'both pre-approval and final-execution quotes are actually refreshed');
  assert.ok(f.calls.events.some(event => event[1] === 'SUBMITTED'));
  f.plans.push({ id: 'manual-plan', userId: 'alice', environment: 'LIVE', market: 'FUTURES', state: 'MONITORING',
    intent: { source: 'manual' }, position: { id: 'manual-position', quantity: 1, closedAt: null }, orders: [] });
  f.reservations[0].closeAfter = new Date(Date.now() - 1);
  await f.runtime.runAlphaAutoCycle('alice', 'g1');
  assert.equal(f.calls.reconcile.length, 2);
  assert.deepEqual(f.calls.close, [['owned-position', 'alice']]);
  assert.equal(f.calls.execute.length, 1, 'holding management must not replay entry execution');
  assert.equal(f.plans.find(plan => plan.id === 'manual-plan').position.closedAt, null);
  assert.ok(f.calls.events.some(event => event[1] === 'TIME_EXIT'));
});
