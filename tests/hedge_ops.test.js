const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, URL, Error, Request, Response, Headers, AbortSignal, ...globals,
    require(name) { if (name === 'server-only') return {}; if (name === '@/lib/secret-redaction') return load('lib/secret-redaction.ts'); if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Unexpected import: ${name}`); },
  }, { filename: file });
  return exports;
}
const protocol = load('lib/hedge-ops/protocol.ts', { 'node:crypto': crypto });
const consoleModule = load('lib/hedge-ops/console.ts');

function fixture(options = {}) {
  const calls = [];
  const viewer = options.guest ? null : { id: 'viewer-a', role: 'max', status: 'ACTIVE', needsSecondFactor: false, ...options.viewer };
  const access = load('lib/hedge-ops/access.ts', {
    '@/lib/membership': { getViewer: async () => viewer },
    '@/lib/content-gates': { configuredAccess: async () => ({ allowed: options.allowed !== false }) },
  });
  const service = {
    hedgeRuntime: async () => ({ available: true, running: false, dryRun: options.dryRun !== false }),
    hedgeServiceRequest: async (...args) => { calls.push(args); return Response.json({ ok: true }); },
  };
  const imports = { '@/lib/hedge-ops/access': access, '@/lib/hedge-ops/protocol': protocol, '@/lib/hedge-ops/service': service };
  return { calls, access, imports, route: load('app/api/hedge-ops/[engine]/[...path]/route.ts', imports) };
}
const context = (engine = 'lighter', segments = ['tasks']) => ({ params: Promise.resolve({ engine, path: segments }) });
const request = (method, body = {}, origin = 'https://platform.test') => new Request('https://platform.test/api/hedge-ops/lighter/tasks', {
  method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
});

test('API denies missing membership, suspended users and cross-origin mutations before forwarding', async () => {
  for (const [options, expected] of [[{ guest: true }, 401], [{ allowed: false }, 403], [{ viewer: { status: 'SUSPENDED' } }, 403]]) {
    const f = fixture(options);
    assert.equal((await f.route.GET(request('GET'), context())).status, expected);
    assert.equal(f.calls.length, 0);
  }
  const f = fixture();
  assert.equal((await f.route.POST(request('POST', {}, 'https://attacker.test'), context())).status, 403);
  assert.equal(f.calls.length, 0);
});

test('API scopes to authenticated owner and never allows arbitrary service paths', async () => {
  const f = fixture();
  assert.equal((await f.route.POST(request('POST', { owner: 'victim', asset: 'BTC' }), context())).status, 200);
  assert.equal(f.calls[0][0], 'viewer-a');
  assert.equal(f.calls[0][1], 'lighter');
  assert.equal(f.calls[0][2], 'api/tasks');
  assert.equal(f.calls[0][3].liveAuthorized, false);
  assert.equal((await f.route.GET(request('GET'), context('lighter', ['..', 'config']))).status, 404);
  assert.equal((await f.route.DELETE(request('DELETE'), context('lighter', ['tasks', '../victim']))).status, 404);
  assert.equal((await f.route.DELETE(request('DELETE'), context('lighter', ['tasks', '..']))).status, 404);
  assert.equal(f.calls.length, 1);
  assert.notEqual(protocol.hedgeOwnerId('viewer-a'), protocol.hedgeOwnerId('viewer-b'));
  assert.match(protocol.hedgeOwnerId('../owner'), /^[a-f0-9]{64}$/);
});

test('live mutations require administrator with completed 2FA, including restart', async () => {
  const denied = fixture({ dryRun: false });
  assert.equal((await denied.route.POST(request('POST'), context())).status, 403);
  const runtime = load('app/api/hedge-ops/runtime/route.ts', denied.imports);
  assert.equal((await runtime.POST(request('POST', { engine: 'lighter', action: 'restart' }))).status, 403);
  const allowed = fixture({ dryRun: false, viewer: { role: 'admin', twoFactorEnabled: true, twoFactorPassed: true } });
  assert.equal((await allowed.route.POST(request('POST'), context())).status, 200);
  assert.equal(allowed.calls[0][3].liveAuthorized, true);
});

test('config cannot enable live mode without explicit acknowledgement', async () => {
  const f = fixture({ viewer: { role: 'admin', twoFactorEnabled: true, twoFactorPassed: true } });
  const config = load('app/api/hedge-ops/config/route.ts', f.imports);
  const req = (body) => new Request('https://platform.test/api/hedge-ops/config?engine=lighter', { method: 'PUT', headers: { Origin: 'https://platform.test' }, body: JSON.stringify(body) });
  assert.equal((await config.PUT(req({ values: { DRY_RUN: 'false' } }))).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await config.PUT(req({ values: { DRY_RUN: 'false' }, liveAcknowledged: true }))).status, 200);
  assert.equal(f.calls[0][3].liveAuthorized, true);
});

test('service URL requires TLS except loopback and forbids embedded credentials', () => {
  for (const url of ['http://remote.example', 'https://user:pass@service.example', 'https://service.example?token=secret', 'file:///etc/passwd']) {
    assert.throws(() => protocol.safeHedgeServiceUrl(url));
  }
  assert.equal(protocol.safeHedgeServiceUrl('http://127.0.0.1:8010/'), 'http://127.0.0.1:8010');
});

test('unknown write outcome is never retried and credentials never enter browser response', async () => {
  let calls = 0;
  const { access } = fixture();
  const service = load('lib/hedge-ops/service.ts', { './access': access, './protocol': protocol, './hosted': {}, 'node:path': path, 'node:fs/promises': {} }, {
    process: { env: { HEDGE_OPS_SERVICE_TOKEN: 'x'.repeat(64), HEDGE_OPS_SERVICE_URL: 'https://service.test' } },
    fetch: async () => { calls++; throw new Error('private upstream error'); },
  });
  await assert.rejects(() => service.hedgeServiceRequest('owner', 'lighter', 'api/cycle', { method: 'POST' }), /操作结果未知/);
  assert.equal(calls, 1);
});

test('server mode uses the built-in Vercel engine without external service credentials', async () => {
  for (const environment of ['production', 'development']) {
    let reads = 0;
    let requests = 0;
    const { access } = fixture();
    const service = load('lib/hedge-ops/service.ts', {
      './access': access, './protocol': protocol, 'node:path': path,
      './hosted': { hostedHedgeRequest: async () => { requests++; return Response.json({ available: true }); } },
      'node:fs/promises': { readFile: async () => { reads++; return 'x'.repeat(64); } },
    }, {
      process: { env: { NODE_ENV: environment }, cwd: () => '/workspace' },
      fetch: async () => { requests++; return Response.json({ running: false }); },
    });
    if (environment === 'production' || environment === 'development') {
      assert.equal((await service.hedgeServiceRequest('owner', 'lighter', 'runtime')).ok, true);
      assert.equal(reads, 0);
      assert.equal(requests, 1);
    } else {
      const response = await service.hedgeServiceRequest('owner', 'lighter', 'runtime');
      assert.equal(response.ok, true);
      assert.equal(reads, 1);
      assert.equal(requests, 1);
    }
  }
});

test('original consoles keep their pages and interactions while API calls are routed locally', async () => {
  for (const engine of ['lighter', 'entropy']) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'hedge-ops', 'engines', engine, 'src/parallax_hedge/web/index.html'), 'utf8');
    const html = consoleModule.integrateHedgeConsole(source, engine);
    for (const id of ['page-funding', 'page-tasks', 'page-system']) assert.ok(html.includes(`id="${id}"`));
    assert.ok(html.includes(`/hedge-ops/console/${engine}/static/app.js`));
    const calls = [];
    const window = { fetch: async (...args) => { calls.push(args); return Response.json({}); }, addEventListener() {} };
    vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { window, URL, Request, Error, AbortController, AbortSignal, Event, location: { href: 'https://platform.test/hedge-ops', origin: 'https://platform.test' }, document: { addEventListener() {}, getElementById() { return null; } } });
    await window.fetch('/api/tasks?limit=40');
    assert.equal(calls[0][0], `/api/hedge-ops/${engine}/tasks?limit=40`);
  }
});

test('navigation inserts hedge operations immediately after AI grid', () => {
  const header = fs.readFileSync(path.join(__dirname, '..', 'components/platform-header.tsx'), 'utf8');
  assert.match(header, /href: "\/grid-ops"[^\n]+\n\s*\{ href: "\/hedge-ops", zh: "套利对冲Ops"/);
});

const proxySecurity = load('lib/trading-proxy-security.ts', {
  'node:net': require('node:net'),
  'node:dns': { lookup() { throw new Error('Unexpected real DNS request in isolated test'); } },
});
const credentials = load('lib/alpha-execution/credentials.ts', { 'node:crypto': crypto, '@/lib/trading-proxy-security': proxySecurity }, { Buffer, process: { env: { TRADING_CREDENTIALS_ENCRYPTION_KEY: 'test-only-secret-'.repeat(4) } } });
const environments = load('lib/hedge-ops/environment.ts', { './schema.json': require('../lib/hedge-ops/schema.json'), 'node:crypto': crypto });
test('Binance engine is independently scoped and both Binance credentials are write-only', () => {
  assert.equal(protocol.parseHedgeEngine('binance'), 'binance');
  const values = environments.updateEnvironment('binance', environments.defaultEnvironment('binance'), { values: {
    BINANCE_API_KEY: 'a'.repeat(64), BINANCE_API_SECRET: 'b'.repeat(64), LIGHTER_ACCOUNT_INDEX: '1', LIGHTER_API_KEY_INDEX: '4', LIGHTER_API_PRIVATE_KEY: 'ab'.repeat(40),
  } });
  assert.equal(environments.configuredEnvironment(values, 'binance'), true);
  assert.equal(Object.hasOwn(values, 'ARCUS_ADDRESS'), false);
  const view = environments.environmentView('binance', values, false);
  assert.equal(view.values.BINANCE_API_KEY, ''); assert.equal(view.values.BINANCE_API_SECRET, '');
  assert.equal(environments.defaultEnvironment('lighter').LIGHTER_ACCOUNT_INDEX, '');
  assert.throws(() => environments.updateEnvironment('binance', values, { values: { BINANCE_API_SECRET: 'not-a-key' } }));
});
test('Lighter accepts its 40-byte API private key and rejects EVM wallet-sized keys', () => {
  for (const key of ['ab'.repeat(40), '0x' + 'AB'.repeat(40), '0X' + 'ab'.repeat(40)]) {
    const result = environments.updateEnvironment('lighter', environments.defaultEnvironment('lighter'), { values: { LIGHTER_API_PRIVATE_KEY: key } });
    assert.equal(result.LIGHTER_API_PRIVATE_KEY, key.toLowerCase());
  }
  for (const key of ['ab'.repeat(32), '0x' + 'ab'.repeat(32), 'a'.repeat(79), 'a'.repeat(81), 'g'.repeat(80), 'ab\n'.repeat(40)]) {
    assert.throws(() => environments.updateEnvironment('lighter', environments.defaultEnvironment('lighter'), { values: { LIGHTER_API_PRIVATE_KEY: key } }));
  }
  assert.throws(() => environments.updateEnvironment('entropy', environments.defaultEnvironment('entropy'), { values: { HYPERLIQUID_PRIVATE_KEY: 'ab'.repeat(40) } }));
});
function hostedFixture({ fail = false } = {}) {
  let row;
  let calls = 0;
  const { access } = fixture();
  const model = {
    async upsert({ create }) { row ||= { ...create, id: 'runtime-a', status: 'STOPPED', generation: null, operationId: null, operationStartedAt: null, heartbeatAt: null, views: null, updatedAt: new Date() }; return { ...row }; },
    async findUnique() { return row && { ...row }; },
    async updateMany({ where, data }) { if (!row || !Object.entries(where).every(([key, value]) => row[key] === value)) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
  };
  const module = load('lib/hedge-ops/hosted.ts', {
    'node:crypto': crypto, 'workflow/api': { start: async () => ({ runId: 'run-a' }) },
    '@/lib/prisma': { prisma: { hedgeOpsRuntime: model } },
    '@/lib/alpha-execution/credentials': credentials, './access': access, './environment': environments,
    './protocol': protocol, './workflow': { hostedHedgeWorkflow() {} },
  }, { process: { env: { TRADING_CREDENTIALS_ENCRYPTION_KEY: 'test-only-secret-'.repeat(4), VERCEL: '1' } },
    fetch: async (url, init) => {
      calls++;
      const payload = JSON.parse(init.body);
      assert.equal(url, 'https://www.welinkbtc-onchainmain.xyz/api/hedge_lighter');
      assert.equal(payload.operationId, row.operationId);
      assert.ok(init.headers['X-Hedge-Signature']);
      if (fail) throw Error('simulated lost connection');
      Object.assign(row, { operationId: null, operationStartedAt: null, ...(payload.action === 'safe-stop' ? { status: 'STOPPED' } : {}) });
      return Response.json({ data: { checks: [{ venue: 'arcus', ok: true }] }, status: 200 });
    },
  });
  return { module, get row() { return row; }, get calls() { return calls; } };
}

test('hosted settings work before engine starts, mask secrets, and keep blank keys', async () => {
  const f = hostedFixture();
  const initial = await (await f.module.hostedHedgeRequest('owner', 'lighter', 'runtime')).json();
  assert.equal(initial.available, true); assert.equal(initial.running, false); assert.equal(f.calls, 0);
  const values = { ARCUS_ADDRESS: '0x' + 'ab'.repeat(20), ARCUS_API_PRIVATE_KEY: '12'.repeat(32), DRY_RUN: 'true' };
  const result = await (await f.module.hostedHedgeRequest('owner', 'lighter', 'config', { method: 'PUT', body: JSON.stringify({ values }) })).json();
  assert.equal(result.values.ARCUS_API_PRIVATE_KEY, '');
  assert.ok(!f.row.configEncrypted.includes('12'.repeat(32)));
  await f.module.hostedHedgeRequest('owner', 'lighter', 'config', { method: 'PUT', body: JSON.stringify({ values: { ARCUS_API_PRIVATE_KEY: '' } }) });
  assert.equal(JSON.parse(credentials.decryptTradingSecret(f.row.configEncrypted)).ARCUS_API_PRIVATE_KEY, values.ARCUS_API_PRIVATE_KEY);
  await f.module.hostedHedgeRequest('owner', 'lighter', 'config', { method: 'PUT', body: JSON.stringify({ values: {}, clear: ['ARCUS_API_PRIVATE_KEY'] }) });
  assert.equal(JSON.parse(credentials.decryptTradingSecret(f.row.configEncrypted)).ARCUS_API_PRIVATE_KEY, '');
  assert.equal(f.calls, 0);
});

test('hosted configuration rejects unsafe fields, invalid risk limits and local proxies', async () => {
  for (const values of [{ HOST: 'evil' }, { CLOSE_CORRIDOR_PCT: '5', MIN_CORRIDOR_PCT: '3' }, { ENGINE_CYCLE_SECONDS: 'NaN' }, { MAKER_WAIT_SECONDS: '3600' }, { GLOBAL_PROXY: 'http://127.0.0.1:8080' }]) {
    const f = hostedFixture();
    await assert.rejects(() => f.module.hostedHedgeRequest('owner', 'lighter', 'config', { method: 'PUT', body: JSON.stringify({ values }) }));
    assert.equal(f.calls, 0);
  }
});

test('hosted lost write response retains claim, stops workflow, and cannot be retried', async () => {
  const f = hostedFixture({ fail: true });
  await f.module.hostedHedgeRequest('owner', 'lighter', 'runtime');
  f.row.configEncrypted = credentials.encryptTradingSecret(JSON.stringify({ ...environments.defaultEnvironment('lighter'), DRY_RUN: 'false' }));
  f.row.status = 'RUNNING';
  await assert.rejects(() => f.module.hostedHedgeRequest('owner', 'lighter', 'api/cycle', { method: 'POST', body: '{}', liveAuthorized: true }), /结果待确认/);
  assert.equal(f.row.status, 'REVIEW_REQUIRED'); assert.ok(f.row.operationId);
  await assert.rejects(() => f.module.hostedHedgeRequest('owner', 'lighter', 'api/cycle', { method: 'POST', body: '{}', liveAuthorized: true }), /未确认|暂停/);
  assert.equal(f.calls, 1);
  assert.equal((await f.module.hostedHedgeTick(f.row.id, f.row.generation)).stop, true);
});

test('all-program emergency requires acknowledgement, origin and live privileges before any mutation', async () => {
  for (const [options, body, origin, expected] of [
    [{}, {}, 'https://platform.test', 400],
    [{}, {acknowledged:true}, 'https://evil.test', 403],
    [{dryRun:false}, {acknowledged:true}, 'https://platform.test', 403],
    [{guest:true}, {acknowledged:true}, 'https://platform.test', 401],
  ]) {
    const f=fixture(options), route=load('app/api/hedge-ops/emergency-stop/route.ts', f.imports);
    assert.equal((await route.POST(request('POST',body,origin))).status,expected);
    assert.equal(f.calls.length,0);
  }
});

test('all-program emergency is owner scoped and isolates one unavailable engine', async () => {
  const f=fixture({viewer:{role:'admin',twoFactorEnabled:true,twoFactorPassed:true}}), seen=[];
  const service={hedgeRuntime:async()=>({dryRun:false}),hedgeServiceRequest:async(user,engine,path,init)=>{
    seen.push(engine);assert.equal(user,'viewer-a');assert.equal(path,'runtime');
    assert.equal(init.liveAuthorized,true);assert.equal(JSON.parse(init.body).action,'emergency-prepare');
    if(engine==='entropy')throw new f.access.HedgeOpsError('fixture outage',503);
    return Response.json({phase:'draining',message:'queued'});
  }};
  const route=load('app/api/hedge-ops/emergency-stop/route.ts',{...f.imports,'@/lib/hedge-ops/service':service});
  const response=await route.POST(request('POST',{acknowledged:true,owner:'victim'}));
  assert.equal(response.status,200);assert.deepEqual(seen,['lighter','entropy','binance','binance_okx','binance_hyperliquid','hyperliquid_lighter','ondoperps_entropy','ondoperps_ondoperps']);
  const data=await response.json();assert.equal(data.results[1].phase,'unknown');assert.equal(data.results[2].phase,'draining');
});

test('hosted emergency preserves active order claim and prevents all opening mutations', async () => {
  const f=hostedFixture();await f.module.hostedHedgeRequest('owner','lighter','runtime');
  Object.assign(f.row,{status:'RUNNING',operationId:'pending-order',generation:'old'});
  const result=await (await f.module.hostedHedgeRequest('owner','lighter','runtime',{method:'POST',body:JSON.stringify({action:'emergency-prepare'}),liveAuthorized:true})).json();
  assert.equal(result.phase,'draining');assert.equal(f.row.status,'DRAINING');assert.equal(f.row.operationId,'pending-order');assert.notEqual(f.row.generation,'old');assert.equal(f.calls,0);
  await assert.rejects(()=>f.module.hostedHedgeRequest('owner','lighter','api/tasks',{method:'POST',body:'{}',liveAuthorized:true}),/停撤平|执行/);
  await assert.rejects(()=>f.module.hostedHedgeRequest('owner','lighter','runtime',{method:'POST',body:JSON.stringify({action:'start'}),liveAuthorized:true}),/停撤平|执行/);
});
