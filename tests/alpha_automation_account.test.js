const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const now = Date.parse('2026-09-10T01:00:00Z');
class Clock extends Date { static now() { return now; } }
function load(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date: Clock, require(name) {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    throw new Error(`Unmocked import: ${name}`);
  } });
  return module.exports;
}
const risk = load('lib/alpha-execution/automation-baseline.ts');
const baseline = { day: '2026-09-10', equity: 1000, unrealized: 0, income: 0, observedAt: now - 1000 };

function fixture({ initial = null, concurrent = false, winningBaseline, equity = 990, unrealized = -10 } = {}) {
  const userId = 'owner-account';
  const state = { stored: initial, updates: 0, closes: 0, transactions: 0, initialReads: 0, locks: [] };
  let releaseReads, firstCommitted;
  const readsReady = new Promise(resolve => { releaseReads = resolve; });
  const committed = new Promise(resolve => { firstCommitted = resolve; });
  const lockTails = new Map();
  const owned = args => assert.equal(args.where.userId, userId);
  const emptyOwnedQuery = { async findMany(args) { owned(args); return []; } };
  const prisma = {
    alphaTradingPosition: emptyOwnedQuery, alphaExecutionPlan: emptyOwnedQuery, alphaAutomationOrder: emptyOwnedQuery,
    async $transaction(callback) {
      state.transactions += 1;
      let unlock, locked = false;
      try {
        return await callback({
          async $queryRaw(strings, key) {
            assert.match(strings.join('?'), /pg_advisory_xact_lock/);
            assert.equal(key, `alpha-auto-baseline:${userId}`);
            state.locks.push(key);
            const previous = lockTails.get(key) || Promise.resolve();
            const current = new Promise(resolve => { unlock = resolve; });
            lockTails.set(key, previous.then(() => current));
            await previous;
            locked = true;
          },
          alphaAutomationConfig: {
            async findUniqueOrThrow(args) {
              owned(args); assert.equal(locked, true);
              if (winningBaseline !== undefined) state.stored = winningBaseline;
              return { dailyBaseline: state.stored };
            },
            async update(args) {
              owned(args); assert.equal(locked, true);
              state.updates += 1;
              state.stored = args.data.dailyBaseline;
              firstCommitted();
            },
          },
        });
      } finally { if (unlock) unlock(); }
    },
  };
  let clients = 0;
  class Client {
    constructor() { this.index = clients++; }
    async getAutomationAccountSnapshot() {
      // Both config reads observe the empty value, then the later network result
      // completes after the first request persisted its baseline.
      if (concurrent && this.index === 1) await committed;
      return { observedAt: new Date(now).toISOString(), equity: concurrent && this.index === 0 ? 1000 : equity,
        unrealizedPnl: concurrent && this.index === 0 ? 0 : unrealized, availableMargin: 900, positions: [], openEntryOrders: [] };
    }
    async close() { state.closes += 1; }
  }
  const account = load('lib/alpha-execution/automation-account.ts', {
    '@/lib/prisma': { prisma }, './binance': { AlphaBinanceClient: Client },
    './credentials': { decryptTradingSecret: () => 'test-fixture' },
    './pnl': { async fetchLiveIncomeForPeriod(owner, market, start, end) {
      assert.equal(owner, userId); assert.equal(market, 'futures');
      return { status: 'ready', coverageComplete: true, amount: 0, assets: [], nonTradingFlows: [],
        periodStart: new Date(start).toISOString(), periodEnd: new Date(end).toISOString(), message: 'fixture' };
    } },
    './automation-data': {
      json: value => JSON.parse(JSON.stringify(value)), TERMINAL_AUTO_ORDER: ['CLOSED', 'REJECTED', 'CANCELED'],
      async currentAutoGrant(owner) {
        assert.equal(owner, userId);
        return { credential: { apiKeyEncrypted: 'fixture', apiSecretEncrypted: 'fixture' },
          execution: { reconciliationHealthy: true, lastReconciledAt: new Date(now), killSwitchActive: false } };
      },
      async autoConfig(owner) {
        assert.equal(owner, userId);
        const observed = state.stored;
        state.initialReads += 1;
        if (concurrent) {
          if (state.initialReads === 2) releaseReads();
          await readsReady;
        }
        return { dailyBaseline: observed };
      },
    }, './automation-baseline': risk,
  });
  return { state, read: options => account.loadAutomationAccount(userId, options) };
}

test('concurrent startup checks retain the first baseline and charge subsequent floating loss', async () => {
  const f = fixture({ concurrent: true });
  const [first, later] = await Promise.all([f.read({ persistBaseline: true }), f.read({ persistBaseline: true })]);
  assert.equal(f.state.initialReads, 2);
  assert.equal(f.state.transactions, 2);
  assert.equal(f.state.updates, 1);
  assert.equal(first.baseline.equity, 1000);
  assert.equal(later.baseline.equity, 1000);
  assert.equal(later.baseline.unrealized, 0);
  assert.equal(later.account.dailyPnl, -10);
  assert.equal(later.account.dayStartEquity, 990);
  assert.equal(f.state.stored.unrealized, 0);
  assert.equal(f.state.closes, 2);
});

test('a winning saved baseline is recalculated under the lock even if the initial read was empty', async () => {
  const f = fixture({ winningBaseline: baseline, equity: 1490, unrealized: -10 });
  const result = await f.read({ persistBaseline: true });
  assert.equal(f.state.updates, 0);
  assert.equal(result.baseline, baseline);
  assert.equal(result.account.dailyPnl, -10);
  assert.equal(result.account.dayStartEquity, 1000);
});

test('an invalid same-day winning baseline fails closed instead of replacing and resetting it', async () => {
  const invalid = { ...baseline, income: null };
  const f = fixture({ winningBaseline: invalid });
  await assert.rejects(f.read({ persistBaseline: true }), /已保存的当日风险基准无效/);
  assert.equal(f.state.updates, 0);
  assert.equal(f.state.stored, invalid);
  assert.equal(f.state.closes, 1);
});

test('account previews reuse persisted daily losses without writing a baseline', async () => {
  const f = fixture({ initial: baseline });
  const result = await f.read();
  assert.equal(result.account.dailyPnl, -10);
  assert.equal(result.account.dayStartEquity, 990);
  assert.equal(f.state.transactions, 0);
  assert.equal(f.state.updates, 0);
  assert.equal(f.state.closes, 1);
});
