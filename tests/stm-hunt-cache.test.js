const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const now = Date.parse('2026-11-20T08:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
function load(file, imports, clock = FixedDate) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date: clock, Error, Map, Set, Number, Array, Buffer,
    Math, JSON, Promise, AbortSignal, Response, URL, setTimeout, clearTimeout,
    process: { env: {} },
    require(name) {
      if (name === 'server-only') return {};
      if (['node:crypto','node:zlib'].includes(name)) return require(name);
      if (name in imports) return imports[name];
      throw Error(`Unmocked ${name}`);
    },
  }, { filename: file });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const captureCodec = load('lib/stm-hunt/capture-cache.ts', {});
const cachedCapture = value => captureCodec.decodeCaptureCache(value);
function capture(offsetMs = -30_000) {
  return { asOf: new Date(now + offsetMs).toISOString(), schemaVersion:2, sources: [], traders: [],
    candidates: [], events: [], chainEvents: [], markets: [] };
}
function harness(options = {}) {
  const counts = { cacheGets: 0, captureReads: 0, fallbackReads: 0, freshCaptureReads: 0, sourceCaptures: 0, historyReads: 0, personalReads: 0 };
  const shared = options.shared ?? new Map();
  const cacheWrites = [], recordWrites = [], namespaces = [], createBatches=[];
  const cache = {
    async get(key) {
      counts.cacheGets++;
      if (options.cacheGetError) throw Error('runtime cache unavailable');
      return shared.get(key) ?? null;
    },
    async set(key, value, settings) {
      cacheWrites.push({ key, value: plain(value), settings: plain(settings) });
      if (options.cacheSetError) throw Error('runtime cache unavailable');
      if (Buffer.byteLength(JSON.stringify(value)) > 2_000_000) throw Error('Runtime Cache item exceeds 2 MB');
      shared.set(key, plain(value));
    },
  };
  const store = {
    stmPersistenceConfigured: () => options.persistent ?? false,
    stmJson: plain,
    async getRecord(userId, kind, key) {
      if (userId === 'system' && kind === 'capture' && key === 'latest') {
        counts.captureReads++;
        counts.fallbackReads++;
        return options.readCapture ? options.readCapture() : options.persisted ?? null;
      }
      return null;
    },
    async getFreshPublicCapture(at, maxAgeMs) {
      counts.captureReads++;
      counts.freshCaptureReads++;
      const value = await (options.readCapture ? options.readCapture() : options.persisted ?? null);
      const capturedAt = Date.parse(value?.asOf ?? '');
      return capturedAt > at - maxAgeMs && capturedAt <= at ? value : null;
    },
    async listRecords(userId, kind) {
      if (userId !== 'system') {
        counts.personalReads++;
        if (kind === 'watch') return [{ key: `private-watch:${userId}`, payload: { privateOwner: userId } }];
      }
      return [];
    },
    async putRecord(...args) { recordWrites.push(args); return { key: args[2] }; },
    async retainSnapshots() {},
  };
  const prisma = { stmHuntRecord: {
    async findMany() { return options.subscriptions ?? []; },
    async createMany(args) { createBatches.push(plain(args));return { count: options.lockBusy && args.data?.[0]?.kind === 'capture-lease' ? 0 : 1 }; },
    async updateMany() { return { count: options.lockBusy ? 0 : 1 }; },
  } };
  const service = load('lib/stm-hunt/service.ts', {
    '@vercel/functions': { getCache(settings) { namespaces.push(plain(settings)); return cache; } },
    '@/lib/prisma': { prisma },
    './store': store,
    './sources': { stmNumber: Number, async captureStmSources() {
      counts.sourceCaptures++;
      return options.fresh ?? capture(0);
    } },
    './engine': options.engine ?? { STM_STRATEGIES: [], evaluateStmStrategies: () => [] },
    './history': { async readStmHistory(...args) {
      counts.historyReads++;
      return options.readHistory ? options.readHistory(...args) : { snapshots: [], count: 0 };
    } },
    './capture-cache': captureCodec,
  }, options.clock ?? FixedDate);
  return { service, counts, shared, cacheWrites, recordWrites, namespaces,createBatches };
}

test('fresh capture stays in instance memory after a single database read', async () => {
  const persisted = capture();
  const h = harness({ persisted });
  assert.equal(await h.service.refreshStmCapture(), persisted);
  assert.equal(await h.service.refreshStmCapture(), persisted);
  assert.equal(await h.service.refreshStmCapture(), persisted);
  assert.equal(h.counts.captureReads, 1);
  assert.equal(h.counts.cacheGets, 1);
  assert.equal(h.counts.sourceCaptures, 0);
  assert.equal(h.cacheWrites.length, 1);
  assert.equal(h.cacheWrites[0].key, 'latest');
  assert.equal(h.cacheWrites[0].settings.ttl, 330);
});

test('concurrent first capture requests share one in-flight cache and database lookup', async () => {
  let resolveRead;
  const pending = new Promise(resolve => { resolveRead = resolve; });
  const persisted = capture();
  const h = harness({ readCapture: () => pending });
  const requests = Array.from({ length: 5 }, () => h.service.refreshStmCapture());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.counts.captureReads, 1);
  assert.equal(h.counts.cacheGets, 1);
  resolveRead(persisted);
  const results = await Promise.all(requests);
  assert.ok(results.every(result => result === persisted));
  assert.equal(h.cacheWrites.length, 1);
  assert.equal(h.counts.sourceCaptures, 0);
});

test('manual capture refresh bypasses the one-minute cache while preserving a fifteen-second shared cooldown', async () => {
  const persisted = capture(-30_000), h = harness({ persisted, fresh: capture(0) });
  await h.service.refreshStmCapture();
  assert.equal(h.counts.sourceCaptures, 0);
  const updated = await h.service.refreshStmCapture({ force: true });
  assert.equal(updated.asOf, capture(0).asOf);
  assert.equal(h.counts.sourceCaptures, 1);
  await h.service.refreshStmCapture({ force: true });
  assert.equal(h.counts.sourceCaptures, 1);
  const other = harness({ shared: h.shared, persisted });
  await other.service.refreshStmCapture({ force: true });
  assert.equal(other.counts.sourceCaptures, 0, 'other instance must honor the successful shared manual refresh');
});

test('a separate module instance reuses shared public capture without querying the database', async () => {
  const shared = new Map();
  const first = harness({ shared, persisted: capture() });
  const expected = plain(await first.service.refreshStmCapture());
  const second = harness({ shared, readCapture: () => { throw Error('shared hit must skip database'); } });
  assert.deepEqual(plain(await second.service.refreshStmCapture()), expected);
  assert.equal(first.counts.captureReads, 1);
  assert.equal(second.counts.captureReads, 0);
  assert.equal(second.counts.sourceCaptures, 0);
  assert.equal(second.cacheWrites.length, 0);
  assert.deepEqual(second.namespaces, [{ namespace: 'welinkbtc-main:stm-public-capture:v3' }]);
});

for (const [description, value] of [
  ['expired at the one-minute boundary', capture(-60_000)],
  ['obsolete presentation schema', { ...capture(), schemaVersion:1 }],
  ['future-dated', capture(60_000)],
  ['invalid timestamp', { ...capture(), asOf: 'invalid' }],
]) {
  test(`${description} shared capture falls back to fresh persisted evidence`, async () => {
    const persisted = capture();
    const h = harness({ shared: new Map([['latest', captureCodec.encodeCaptureCache(value)]]), persisted });
    assert.equal(await h.service.refreshStmCapture(), persisted);
    assert.equal(h.counts.captureReads, 1);
    assert.equal(h.counts.sourceCaptures, 0);
    assert.deepEqual(plain(cachedCapture(h.shared.get('latest'))), plain(persisted));
  });
}

test('unavailable runtime cache falls back to the database and never caches personal dashboard state', async () => {
  const persisted = capture();
  const h = harness({ persisted, cacheGetError: true, cacheSetError: true, persistent: true });
  const first = await h.service.getStmDashboard('alice');
  const second = await h.service.getStmDashboard('bob');
  assert.deepEqual(plain(first.state.watchlist), ['private-watch:alice']);
  assert.deepEqual(plain(second.state.watchlist), ['private-watch:bob']);
  assert.equal(h.counts.captureReads, 1);
  assert.equal(h.counts.sourceCaptures, 0);
  assert.equal(h.counts.personalReads, 12, 'each user state and strategy is read independently');
  assert.equal(h.cacheWrites.length, 1);
  assert.deepEqual(plain(cachedCapture(h.cacheWrites[0].value)), plain(persisted));
  assert.ok(!JSON.stringify(h.cacheWrites).includes('private-watch'));
  assert.ok(!JSON.stringify(h.cacheWrites).includes('alice'));
  assert.ok(!JSON.stringify(h.cacheWrites).includes('bob'));
});

test('expired persisted evidence triggers a fresh source capture when no usable cache exists', async () => {
  const fresh = capture(0);
  const h = harness({ persisted: capture(-6 * 60_000), fresh });
  assert.deepEqual(plain(await h.service.refreshStmCapture()), fresh);
  assert.equal(h.counts.captureReads, 1);
  assert.equal(h.counts.sourceCaptures, 1);
  await h.service.refreshStmCapture();
  assert.equal(h.counts.sourceCaptures, 1);
  assert.deepEqual(plain(cachedCapture(h.shared.get('latest'))), fresh);
});

test('one-minute public refresh keeps five-minute immutable snapshot buckets and omits profile display payloads from history',async()=>{
  const fresh={...capture(0),candidates:[{id:'cex:BTC'}],traders:[{id:'wsm:hl:wallet',address:null,clusterId:null,updatedAt:new Date(now).toISOString(),visibility:'public',qualified:true,
    name:'Display Name',avatarUrl:'https://example.com/avatar.webp',socialLinks:[{label:'X',url:'https://x.com/test'}],
    holdings:[{asset:'cex:BTC',quantity:3,side:'long',symbol:'BTC',valueUsd:10,logoUrl:'https://example.com/token.webp'}]}]};
  const h=harness({persisted:capture(-61_000),fresh,persistent:true});await h.service.refreshStmCapture();
  const snapshot=h.createBatches.flatMap(batch=>batch.data).find(row=>row.kind==='snapshot');
  assert.equal(snapshot.key,String(Math.floor(now/(5*60_000))));
  assert.deepEqual(snapshot.payload.traders[0].holdings,[{asset:'cex:BTC',quantity:3,side:'long'}]);
  assert.equal(snapshot.payload.traders[0].avatarUrl,undefined);assert.equal(snapshot.payload.traders[0].name,undefined);
  assert.equal(cachedCapture(h.shared.get('latest')).traders[0].name,'Display Name','rich public response stays separate from minimal history');
});

test('alert sweep with no watch subscriptions does not load historical snapshots', async () => {
  const h = harness({ persisted: capture(), persistent: true });
  const result = await h.service.sweepStmAlerts();
  assert.equal(result.users, 0);
  assert.equal(result.alerts, 0);
  assert.equal(h.counts.historyReads, 0);
  assert.equal(h.recordWrites.length, 1);
  assert.deepEqual(h.recordWrites[0].slice(0, 3), ['system', 'cron', 'latest']);
});

test('alert sweep evaluates every user at the history projection time even when a cohort expires during its read', async () => {
  let currentTime = now;
  class AdvancingDate extends Date {
    constructor(...args) { super(...(args.length ? args : [currentTime])); }
    static now() { return currentTime; }
  }
  const engine = load('lib/stm-hunt/engine.ts', {});
  const history = load('lib/stm-hunt/history.ts', { '@/lib/prisma': {} });
  const iso = offset => new Date(now + offset).toISOString();
  const traders = (prefix, offset, quantity) => Array.from({ length: 3 }, (_, index) => ({
    id: `${prefix}:${index}`, address: null, qualified: true, visibility: 'public', updatedAt: iso(offset),
    holdings: [{ asset: 'cex:BTC', side: 'long', quantity }],
  }));
  const snapshots = [
    { asOf: iso(-60 * 60_000 + 1), traders: traders('old-cohort', -60 * 60_000 + 1, 1) },
    { asOf: iso(-59 * 60_000), traders: traders('new-cohort', -59 * 60_000, 1) },
    ...[-40, -30, -20].map((minutes, index) => ({ asOf: iso(minutes * 60_000), traders: [
      ...traders('old-cohort', minutes * 60_000, index + 2),
      ...traders('new-cohort', minutes * 60_000, index + 2),
    ] })),
  ];
  const persisted = { ...capture(), traders: [...traders('old-cohort', -60_000, 5), ...traders('new-cohort', -60_000, 5)],
    candidates: [{ id: 'cex:BTC', symbol: 'BTC', market: 'cex', updatedAt: iso(-60_000), price: 100 }],
    markets: [{ symbol: 'BTC', asOf: iso(-60_000), complete: true, fundingPercentile: 50, oiQuantityChange: 1, priceChange: 2 }],
  };
  const selected = engine.STM_STRATEGIES.map(strategy => ({ ...strategy, windowMinutes: 60, enabled: ['S2', 'S5'].includes(strategy.id) }));
  const evaluationTimes = [], historyTimes = [], evaluatedSignals = [];
  const h = harness({ persisted, persistent: true, clock: AdvancingDate,
    subscriptions: [{ userId: 'alice', key: 'cex:BTC' }, { userId: 'bob', key: 'cex:BTC' }],
    engine: { STM_STRATEGIES: selected, evaluateStmStrategies(input) {
      evaluationTimes.push(input.asOf);
      const signals = engine.evaluateStmStrategies(input);
      evaluatedSignals.push(signals.find(signal => signal.strategy === 'S2'));
      return signals;
    } },
    readHistory(strategies, projectedAt) {
      historyTimes.push(projectedAt);
      const projected = history.projectStmHistory(snapshots, strategies, projectedAt ?? currentTime);
      currentTime += 2; // The first snapshot has now expired; recomputing the evaluation time changes the original cohort.
      return { snapshots: projected, count: snapshots.length };
    },
  });
  const result = await h.service.sweepStmAlerts();
  assert.equal(currentTime, now + 2);
  assert.deepEqual(historyTimes, [now], 'users sharing a window share only evidence projected at the same evaluation instant');
  assert.deepEqual(evaluationTimes, [iso(0), iso(0)]);
  assert.equal(evaluatedSignals.length, 2);
  assert.ok(evaluatedSignals.every(signal => signal.entities === 3 && signal.actionable), 'advancing the wall clock must not silently discard the projected original cohort');
  assert.equal(result.alerts, 2);
  assert.equal(h.counts.historyReads, 1);
});

test('record writes return only their key and individual reads project only payload', async () => {
  let writeQuery, readQuery, stored = { payload: { large: 'evidence', nested: [1, 2] } };
  const store = load('lib/stm-hunt/store.ts', {
    '@/lib/prisma': { isDatabaseConfigured: () => true, prisma: { stmHuntRecord: {
      async upsert(query) { writeQuery = plain(query); return { key: 'latest' }; },
      async findUnique(query) { readQuery = plain(query); return stored; },
    } } },
  });
  const result = await store.putRecord('system', 'capture', 'latest', stored.payload);
  assert.deepEqual(plain(result), { key: 'latest' });
  assert.deepEqual(writeQuery.select, { key: true });
  assert.deepEqual(writeQuery.where, { userId_kind_key: { userId: 'system', kind: 'capture', key: 'latest' } });
  assert.deepEqual(writeQuery.update, { payload: stored.payload });
  assert.deepEqual(writeQuery.create, { userId: 'system', kind: 'capture', key: 'latest', payload: stored.payload });
  assert.equal(await store.getRecord('system', 'capture', 'latest'), stored.payload);
  assert.deepEqual(readQuery.select, { payload: true });
  assert.deepEqual(readQuery.where, writeQuery.where);
  stored = null;
  assert.equal(await store.getRecord('system', 'capture', 'missing'), null);
});

test('fresh public capture reads bind a strict freshness range in SQL and return no expired payload', async () => {
  const queries = [];
  let result = [{ payload: capture() }];
  const store = load('lib/stm-hunt/store.ts', {
    '@/lib/prisma': { isDatabaseConfigured: () => true, prisma: { async $queryRaw(parts, ...values) {
      queries.push({ sql: parts.join('?'), values });
      return result;
    } } },
  });
  assert.deepEqual(plain(await store.getFreshPublicCapture(now, 5 * 60_000)), capture());
  const query = queries[0];
  assert.match(query.sql, /SELECT payload FROM stm_hunt_records/);
  assert.match(query.sql, /"userId" = 'system' AND kind = 'capture' AND key = 'latest'/);
  assert.match(query.sql, /payload->>'asOf' > \? AND payload->>'asOf' <= \?/);
  assert.deepEqual(query.values, [new Date(now - 5 * 60_000).toISOString(), new Date(now).toISOString()]);
  assert.match(query.sql, /LIMIT 1/);
  result = [];
  assert.equal(await store.getFreshPublicCapture(now, 5 * 60_000), null);
});

test('normal capture expiry uses the freshness-filtered database read without downloading stale fallback evidence', async () => {
  const h = harness({ persisted: capture(-5 * 60_000), persistent: true });
  await h.service.refreshStmCapture();
  assert.equal(h.counts.freshCaptureReads, 1);
  assert.equal(h.counts.captureReads, 1, 'uncontended collection must not fetch the expired full capture');
  assert.equal(h.counts.sourceCaptures, 1);
});

test('multi-megabyte public capture survives the actual cache entry limit across isolated instances', async () => {
  const large = {...capture(), traders:Array.from({length:4000},(_,index)=>({id:`public:${index}`,name:`Trader ${index}`,avatar:'https://public.example/avatar/'+index,
    holdings:Array.from({length:6},(_,asset)=>({asset:`cex:ASSET${asset}`,quantity:index+asset,side:'long',evidence:'公開來源 '.repeat(18)}))}))};
  assert.ok(Buffer.byteLength(JSON.stringify(large)) > 2_000_000);
  const shared = new Map(), first = harness({shared,persisted:large});
  await first.service.refreshStmCapture();
  assert.ok(shared.has('latest'), 'an oversized raw capture must still populate Runtime Cache');
  assert.ok(Buffer.byteLength(JSON.stringify(shared.get('latest'))) < 1_900_000);
  const second = harness({shared,readCapture:()=>{throw Error('a shared hit must not download the full database JSON');}});
  assert.deepEqual(plain(await second.service.refreshStmCapture()),large);
  assert.equal(second.counts.captureReads,0);
  assert.equal(second.counts.sourceCaptures,0);
});

test('lease competitors use retained shared evidence with its original timestamp without a database fallback', async () => {
  const stale = capture(-90_000), shared = new Map([['latest',captureCodec.encodeCaptureCache(stale)]]);
  const h = harness({shared,persistent:true,lockBusy:true,persisted:stale});
  assert.deepEqual(plain(await h.service.refreshStmCapture()),stale);
  assert.equal(h.counts.freshCaptureReads,1);
  assert.equal(h.counts.fallbackReads,0);
  assert.equal(h.counts.sourceCaptures,0);
  assert.equal(h.cacheWrites.length,0,'stale evidence must not be rewritten as fresh');
});

test('retained shared evidence never postpones an uncontended automatic source refresh', async () => {
  const stale = capture(-90_000), fresh = capture(0);
  const h = harness({shared:new Map([['latest',captureCodec.encodeCaptureCache(stale)]]),persistent:true,persisted:stale,fresh});
  assert.deepEqual(plain(await h.service.refreshStmCapture()),fresh);
  assert.equal(h.counts.sourceCaptures,1);
  assert.equal(h.counts.fallbackReads,0);
  assert.deepEqual(plain(cachedCapture(h.shared.get('latest'))),fresh);
});

test('a corrupt shared envelope safely falls back to fresh persisted public evidence', async () => {
  const persisted=capture();
  const h=harness({shared:new Map([['latest',{encoding:'gzip-base64',data:'not valid'}]]),persisted});
  assert.deepEqual(plain(await h.service.refreshStmCapture()),persisted);
  assert.equal(h.counts.freshCaptureReads,1);
});
