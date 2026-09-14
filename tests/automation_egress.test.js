const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Response, require(name) {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    throw Error(name);
  } });
  return module.exports;
}
const summary = load('lib/alpha-execution/automation-summary.ts');
test('automatic status polls never select audit metadata, while keeping event detail links', async () => {
  let query;
  const data = load('lib/alpha-execution/automation-data.ts', {
    'node:crypto': {}, '@prisma/client': {},
    '@/lib/prisma': { prisma: {
      alphaAutomationConfig: { findUnique: async () => ({ settings: {}, status: 'RUNNING', grantFingerprint: 'private' }) },
      alphaTradingAudit: { findMany: async args => { query = args; return [{ id: 'event1', status: 'AUTO_SCAN', message: 'scan', createdAt: 'now' }]; } },
    } },
    './data': { getOrCreateAlphaExecutionConfig: async () => ({}), publicConfig: value => value },
    './automation-strategy': {}, './automation-settings': { readSavedAutomationSettings: value => value, requiresAutomationStrategySelection: () => false },
  });
  const result = await data.automationSnapshot('alice');
  assert.deepEqual(Object.keys(query.select).sort(), ['createdAt', 'id', 'message', 'status']);
  assert.equal(query.where.userId, 'alice'); assert.equal(query.take, 30);
  assert.equal(result.events[0].detailAvailable, true); assert.equal(result.events[0].id, 'event1');
  assert.equal(result.config.grantFingerprint, undefined);
});
test('single event diagnostics are owner scoped, scan only, and use the existing safe projection', async () => {
  const metadata = { candidates: [{ secret: 'hidden' }], rejections: [{ symbol: 'BTCUSDT', reason: 'LOW_SCORE', message: '低分' }], apiKey: 'hidden' };
  const data = load('lib/alpha-execution/automation-event-details.ts', {
    './automation-summary': summary,
    '@/lib/prisma': { prisma: { alphaTradingAudit: { findFirst: async ({ where, select }) => {
      assert.equal(where.status, 'AUTO_SCAN'); assert.deepEqual(Object.keys(select), ['metadata']);
      return where.userId === 'alice' && where.id === 'event1' ? { metadata } : null;
    } } } },
  });
  const own = await data.automationEventDetails('alice', 'event1');
  assert.equal(JSON.stringify(own.summary), JSON.stringify(summary.summarizeAutomationSelection(metadata)));
  assert.equal(JSON.stringify(own).includes('hidden'), false);
  assert.equal(await data.automationEventDetails('bob', 'event1'), null);
  assert.equal(await data.automationEventDetails('alice', 'missing'), null);
});
test('event API requires an operator before lookup and returns private 404 for missing events', async () => {
  let viewer = null, calls = 0;
  const route = load('app/api/alpha-execution/automation/events/[id]/route.ts', {
    '@/lib/alpha-execution/access': {
      requireAlphaOperator: async () => { if (!viewer) throw Error('unauthorized'); return viewer; },
      alphaExecutionErrorResponse: () => new Response('', { status: 401 }),
    },
    '@/lib/alpha-execution/automation-event-details': { automationEventDetails: async userId => { calls++; assert.equal(userId, 'alice'); return null; } },
  });
  const context = { params: Promise.resolve({ id: 'event1' }) };
  assert.equal((await route.GET(null, context)).status, 401); assert.equal(calls, 0);
  viewer = { id: 'alice' };
  const missing = await route.GET(null, context);
  assert.equal(missing.status, 404); assert.equal(missing.headers.get('cache-control'), 'private, no-store'); assert.equal(calls, 1);
  assert.equal((await route.GET(null, { params: Promise.resolve({ id: '../bad' }) })).status, 404); assert.equal(calls, 1);
});
test('diagnostic clicks deduplicate requests, cache loaded events and never fetch during status rendering', async () => {
  const source = fs.readFileSync('alpha-auto-trading.js', 'utf8');
  const snippet = source.slice(source.indexOf('  const eventDetails = new Map();'), source.indexOf('  function render(next'));
  let click, calls = 0, finish;
  const container = { innerHTML: '', addEventListener: (_, fn) => { click = fn; } };
  const globals = { snapshot: { events: [{ id: 'one', detailAvailable: true }] },
    el: () => container, escape: String, time: String, reason: String, eventSummaryHtml: s => JSON.stringify(s),
    endpoint: '/api/alpha-execution/automation', AbortSignal, showError: msg => { throw Error(msg); },
    fetch: async () => { calls++; return await new Promise(resolve => { finish = () => resolve({ ok: true, json: async () => ({ ok: true, id: 'one', summary: { candidateCount: 2 } }) }); }); },
  };
  const context = vm.createContext(globals);
  vm.runInContext(snippet + '\nrenderEvents(snapshot.events);', context);
  assert.equal(calls, 0);
  const event = { target: { closest: () => ({ dataset: { eventDetail: 'one' } }) } };
  const first = click(event); await click(event); await click(event);
  assert.equal(calls, 1); finish(); await first;
  vm.runInContext('renderEvents(snapshot.events);', context);
  await click(event); await click(event);
  assert.equal(calls, 1); assert.match(container.innerHTML, /candidateCount/);
});
