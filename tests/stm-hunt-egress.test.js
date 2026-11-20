const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Date, require(name) {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    throw Error(`Unexpected dependency ${name}`);
  } });
  return module.exports;
}
const engine = load('lib/stm-hunt/engine.ts');
const history = load('lib/stm-hunt/history.ts', { '@/lib/prisma': {} });
const now = Date.parse('2026-11-20T10:00:00.000Z');
const iso = minutes => new Date(now + minutes * 60_000).toISOString();
const plain = value => JSON.parse(JSON.stringify(value));
const strategies = (s2 = 60, s4 = 360) => engine.STM_STRATEGIES.map(strategy => ({
  ...strategy, windowMinutes: strategy.id === 'S2' ? s2 : strategy.id === 'S4' ? s4 : strategy.windowMinutes,
}));
const traders = (prefix, at, quantity, patch = {}) => Array.from({ length: 3 }, (_, index) => ({
  id: `${prefix}${index}`, address: null, clusterId: `${prefix}-entity-${index}`, qualified: true,
  visibility: 'public', updatedAt: iso(at), name: 'display metadata should never leave the database',
  tags: ['unnecessary display data'], pnlUsd: 100,
  holdings: [{ asset: 'cex:BTC', quantity, side: 'long', symbol: 'BTC', valueUsd: 1000 }], ...patch,
}));
function evaluate(snapshots, selected = strategies()) {
  return engine.evaluateStmStrategies({ asOf: iso(0), snapshots, strategies: selected,
    candidates: [{ id: 'cex:BTC', symbol: 'BTC', market: 'cex', updatedAt: iso(-1), price: 100 }],
    events: [], chainEvents: [], markets: [{ symbol: 'BTC', asOf: iso(-1), complete: true,
      breakout: true, volumeRatio: 2, fundingPercentile: 50, oiQuantityChange: 1, priceChange: 2 }],
  });
}
function equivalent(snapshots, selected = strategies()) {
  const projected = history.projectStmHistory(snapshots, selected, now);
  assert.deepEqual(plain(evaluate(projected, selected)), plain(evaluate(snapshots, selected)));
  return projected;
}
const signal = (snapshots, id, selected = strategies()) => evaluate(snapshots, selected).find(row => row.strategy === id);

test('history keeps the union of original cohorts for different strategy windows and preserves signals', () => {
  const snapshots = [-300, -240, -180, -50, -30, -10].map((at, index) => ({ asOf: iso(at), traders: [
    ...traders('long-window', at, 6 - index),
    ...(index >= 3 ? traders('short-window', at, index - 2) : []),
    ...(index >= 4 ? traders('late-joiner', at, index) : []),
  ], candidates: [{ heavy: 'not needed for history' }], markets: [{ heavy: 'not needed' }] }));
  const projected = equivalent(snapshots);
  assert.equal(signal(projected, 'S2').entities, 3);
  assert.equal(signal(projected, 'S4').entities, 3);
  assert.equal(projected.at(-1).traders.some(row => row.id.startsWith('late-joiner')), false);
  const encoded = JSON.stringify(projected);
  for (const display of ['name', 'tags', 'pnlUsd', 'symbol', 'valueUsd', 'markets', 'candidates']) assert.equal(encoded.includes(`"${display}"`), false);
  assert.equal(snapshots.at(-1).traders[0].name, 'display metadata should never leave the database');
});

test('qualification and visibility failures remain in the last three source observations', () => {
  for (const patch of [{ qualified: false }, { visibility: 'private' }, { visibility: 'truncated' }]) {
    const snapshots = [-50, -40, -30, -20, -10].map((at, index) => ({ asOf: iso(at), traders: traders('original', at, index + 1, index === 3 ? patch : {}) }));
    const projected = equivalent(snapshots, strategies(60, 60));
    assert.equal(projected[3].traders.length, 3);
    assert.equal(signal(projected, 'S2', strategies(60, 60)).entities, 0);
  }
});

test('a later failed observation with the same source timestamp still overrides the earlier public observation', () => {
  const snapshots = [-50, -40, -30, -20, -10].map((at, index) => ({ asOf: iso(at), traders: traders('original', at, index + 1,
    index === 3 ? { updatedAt: iso(-30), qualified: false } : {}) }));
  const projected = equivalent(snapshots, strategies(60, 60));
  assert.equal(signal(projected, 'S2', strategies(60, 60)).entities, 0);
});

test('empty first snapshots remain present and later joiners cannot become an original cohort', () => {
  const snapshots = [-50, -30, -20, -10].map((at, index) => ({ asOf: iso(at), traders: index ? traders('joined', at, index) : [] }));
  const projected = equivalent(snapshots, strategies(60, 60));
  assert.equal(projected.length, 4);
  assert.equal(projected.every(snapshot => snapshot.traders.length === 0), true);
  assert.equal(signal(projected, 'S2', strategies(60, 60)).entities, 0);
});

test('an unqualified leaderboard contributes no history bytes while retaining each evaluation timestamp', () => {
  const snapshots = [-50, -30, -10].map(at => ({ asOf: iso(at), traders: Array.from({ length: 500 }, (_, index) => ({
    ...traders(`unqualified-${index}`, at, index + 1, { qualified: false })[0],
    name: 'display-only metadata '.repeat(20),
  })) }));
  const projected = equivalent(snapshots, strategies(60, 60));
  assert.equal(projected.length, 3);
  assert.equal(projected.every(snapshot => snapshot.traders.length === 0), true);
  assert.ok(JSON.stringify(projected).length < JSON.stringify(snapshots).length / 1000);
});

test('window boundaries exclude old and future snapshots while a custom 24 hour window retains its cohort', () => {
  const selected = strategies(1440, 1440);
  const snapshots = [-1441, -1440, -30, -10, 1].map((at, index) => ({ asOf: iso(at), traders: traders('original', at, index + 1) }));
  const projected = equivalent(snapshots, selected);
  assert.deepEqual(plain(projected.map(row => row.asOf)), [-1440, -30, -10].map(iso));
  assert.equal(signal(projected, 'S2', selected).entities, 3);
});

test('without enabled history strategies production reads only a bounded count and no JSON payload', async () => {
  const queries = [];
  const reader = load('lib/stm-hunt/history.ts', { '@/lib/prisma': { prisma: { $queryRaw: async (parts, ...values) => {
    queries.push({ sql: parts.join('?'), values }); return [{ count: 171 }];
  } } } });
  const selected = strategies().map(strategy => ['S2', 'S4'].includes(strategy.id) ? { ...strategy, enabled: false } : strategy);
  assert.deepEqual(plain(await reader.readStmHistory(selected, now)), { snapshots: [], count: 171 });
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /LIMIT 300/);
  assert.doesNotMatch(queries[0].sql, /payload|jsonb_array/);
  equivalent([{ asOf: iso(-1), traders: traders('original', -1, 1) }], selected);
});

test('production history query binds time bounds and projects JSON inside SQL instead of transferring full captures', async () => {
  let query;
  const snapshots = [{ asOf: iso(-10), traders: [] }];
  const reader = load('lib/stm-hunt/history.ts', { '@/lib/prisma': { prisma: { $queryRaw: async (parts, ...values) => {
    query = { sql: parts.join('?'), values }; return [{ count: 171, snapshots }];
  } } } });
  assert.deepEqual(plain(await reader.readStmHistory(strategies(), now)), { count: 171, snapshots });
  assert.match(query.sql, /cohort AS MATERIALIZED/);
  assert.match(query.sql, /WHERE trader\.value->>'id' IN \(SELECT id FROM cohort\)/);
  assert.match(query.sql, /ORDER BY holding\.ordinality/);
  assert.match(query.sql, /ORDER BY trader\.ordinality/);
  assert.equal(query.values[0].toISOString(), iso(-362));
  assert.equal(query.values[1], iso(-360));
  assert.equal(query.values[2], iso(0));
  assert.deepEqual(JSON.parse(query.values[3]), [iso(-60), iso(-360)]);
  assert.doesNotMatch(query.sql, /SELECT\s+(?:\w+\.)?\*/i);
});
