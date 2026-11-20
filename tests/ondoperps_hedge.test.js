const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const schema = require('../lib/hedge-ops/schema.json');
const engines = ['ondoperps_entropy', 'ondoperps_ondoperps'];
const tick = () => new Promise(resolve => setImmediate(resolve));

function load(file, imports, globals = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { exports, ...globals, require(name) { assert.ok(Object.hasOwn(imports, name), name); return imports[name]; } });
  return exports;
}
const config = load('lib/hedge-ops/environment.ts', { './schema.json': schema, 'node:crypto': crypto });
const protocol = load('lib/hedge-ops/protocol.ts', { 'node:crypto': crypto });
const keys = {
  ondoperps_entropy: { ONDOPERPS_API_KEY_ID: 'ondoKeyId_example+/=', ONDOPERPS_API_SECRET: 'ondoApiSecret_example+/=', HYPERLIQUID_ACCOUNT_ADDRESS: '0x' + 'ab'.repeat(20), HYPERLIQUID_PRIVATE_KEY: 'de'.repeat(32) },
  ondoperps_ondoperps: { ONDOPERPS_A_API_KEY_ID: 'ondoKeyId_A+/=', ONDOPERPS_A_API_SECRET: 'ondoApiSecret_A+/=', ONDOPERPS_B_API_KEY_ID: 'ondoKeyId_B+/=', ONDOPERPS_B_API_SECRET: 'ondoApiSecret_B+/=' },
};

test('both Ondoperps engines are independently registered and API credentials remain write-only', () => {
  assert.equal(protocol.HEDGE_ENGINES.length, 8);
  for (const engine of engines) {
    assert.equal(protocol.parseHedgeEngine(engine), engine);
    assert.match(protocol.HEDGE_PAIRS[engine], /Ondoperps/);
    const initial = config.defaultEnvironment(engine);
    assert.equal(initial.DRY_RUN, 'true');
    assert.equal(config.configuredEnvironment(initial, engine), false);
    const values = config.updateEnvironment(engine, initial, { values: keys[engine] });
    assert.equal(config.configuredEnvironment(values, engine), true, 'vault and proxy are optional');
    const view = config.environmentView(engine, values, false);
    for (const [key, value] of Object.entries(keys[engine])) if (/ONDOPERPS|PRIVATE_KEY/.test(key)) {
      assert.equal(view.values[key], '');
      assert.equal(view.fields.find(field => field.key === key).secret, true);
      assert.equal(view.fields.find(field => field.key === key).configured, true);
      assert.ok(!JSON.stringify(view).includes(value));
      assert.equal(config.updateEnvironment(engine, values, { values: { [key]: '' } })[key], value);
    }
    assert.equal(config.updateEnvironment(engine, values, { values: {}, clear: [Object.keys(keys[engine])[0]] })[Object.keys(keys[engine])[0]], '');
    assert.throws(() => config.updateEnvironment(engine, values, { values: { ONDOPERPS_BASE_URL: 'https://evil.invalid' } }));
  }
  assert.ok(Object.hasOwn(schema.defaults.ondoperps_entropy, 'ENTROPY_PROXY'));
  assert.ok(!Object.hasOwn(schema.defaults.ondoperps_entropy, 'HYPERLIQUID_DEX'));
  assert.equal(config.defaultEnvironment('ondoperps_ondoperps').MIN_NET_FUNDING_BPS_H, '0');
});

test('Ondoperps opaque credentials keep official prefixes and do not inherit hex or UUID restrictions', () => {
  const initial = config.defaultEnvironment('ondoperps_entropy');
  for (const value of ['ondoKeyId_abc123', 'ondoKeyId_opaque+/=']) {
    assert.equal(config.updateEnvironment('ondoperps_entropy', initial, { values: { ONDOPERPS_API_KEY_ID: value } }).ONDOPERPS_API_KEY_ID, value);
  }
  for (const [key, value] of [['ONDOPERPS_API_KEY_ID', 'abc123'], ['ONDOPERPS_API_SECRET', 'ondoApiSecret_'], ['ONDOPERPS_API_KEY_ID', 'ondoKeyId_bad space'], ['ONDOPERPS_API_SECRET', 'ondoApiSecret_bad\u007f']]) {
    assert.throws(() => config.updateEnvironment('ondoperps_entropy', initial, { values: { [key]: value } }));
  }
  assert.throws(() => config.updateEnvironment('ondoperps_ondoperps', config.defaultEnvironment('ondoperps_ondoperps'), { values: { ...keys.ondoperps_ondoperps, ONDOPERPS_B_API_KEY_ID: keys.ondoperps_ondoperps.ONDOPERPS_A_API_KEY_ID } }), /不同账户/);
});

test('shared account protection canonicalizes Ondoperps A/B and Entropy/Hyperliquid without retaining credentials', () => {
  const id = 'ondoKeyId_SameOpaque+/=';
  const one = config.sharedHedgeResources('ondoperps_entropy', { ...keys.ondoperps_entropy, ONDOPERPS_API_KEY_ID: id });
  const two = config.sharedHedgeResources('ondoperps_ondoperps', { ...keys.ondoperps_ondoperps, ONDOPERPS_B_API_KEY_ID: id });
  const identity = 'ondoperps:API_KEY_ID:' + crypto.createHash('sha256').update(id).digest('hex');
  assert.ok(one.includes(identity)); assert.ok(two.includes(identity));
  assert.ok(!JSON.stringify([...one, ...two]).includes(id));
  const native = config.sharedHedgeResources('binance_hyperliquid', { HYPERLIQUID_ACCOUNT_ADDRESS: keys.ondoperps_entropy.HYPERLIQUID_ACCOUNT_ADDRESS.toUpperCase(), HYPERLIQUID_PRIVATE_KEY: '0x' + keys.ondoperps_entropy.HYPERLIQUID_PRIVATE_KEY.toUpperCase() });
  const legacy = config.sharedHedgeResources('entropy', keys.ondoperps_entropy);
  assert.ok(native.filter(value => one.includes(value)).length >= 2);
  assert.ok(legacy.filter(value => one.includes(value)).length >= 2);
});

function browser(engine) {
  const elements = new Map(), calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: id === 'cost-input' ? '10' : id === 'f-asset' ? 'BTC' : '', innerHTML: '', textContent: '', style: {}, dataset: {}, hidden: false,
      classList: { toggle() {} }, setAttribute() {}, querySelector(selector) { return element(id + ':' + selector); }, querySelectorAll() { return []; } });
    return elements.get(id);
  };
  const context = vm.createContext({ console, AbortSignal, Promise, Date, Map, Object, Number,
    document: { activeElement: null, hidden: false, getElementById: element }, window: { hedgeConsoleIsActive: () => true },
    fetch(url, options) { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); calls.push({ url, options, resolve, reject }); return promise; },
  });
  const source = fs.readFileSync(`hedge-ops/paired_hedge/web/${engine}/app.js`, 'utf8');
  vm.runInContext(source.slice(0, source.indexOf("$('menu-button').onclick")), context);
  return { element, context, calls, run: source => vm.runInContext(source, context) };
}

test('Entropy collateral source accompanies a real nonzero balance and is hidden after a failed read', () => {
  const f = browser('ondoperps_entropy');
  const snapshot = { venues: { binance: { connected: true, equity: 150, available: 150 }, lighter: {
    connected: true, equity: '148.264135', available: '148.264135', unit: 'USDC',
    account_mode: 'unifiedAccount', balance_source: 'spot_usdc', balance_note: '统一账户 · 现货 USDC 抵押品',
  } } };
  f.run('state.funding='+JSON.stringify(snapshot)+';renderAccounts();');
  assert.match(f.element('ledger-grid').innerHTML, /\$148\.26/);
  assert.match(f.element('ledger-grid').innerHTML, /统一账户 · 现货 USDC 抵押品/);
  f.run("state.funding.venues.lighter.balance_note='<img src=x onerror=alert(1)>';renderAccounts();");
  assert.ok(!f.element('ledger-grid').innerHTML.includes('<img src=x'));
  f.run("readErrors.funding='读取超时';renderAccounts();");
  assert.ok(!f.element('ledger-grid').innerHTML.includes('$148.26'));
  assert.ok(!f.element('ledger-grid').innerHTML.includes('class=\"balance-source\"'));
  assert.match(f.element('ledger-grid').innerHTML, /读取未完成/);
});

test('new consoles retain all paired pages, controls and responsive styling', () => {
  const template = fs.readFileSync('hedge-ops/paired_hedge/web/binance_hyperliquid/index.html', 'utf8');
  const ids = [...template.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  for (const engine of engines) {
    const html = fs.readFileSync(`hedge-ops/paired_hedge/web/${engine}/index.html`, 'utf8');
    for (const id of ids) assert.ok(html.includes(`id="${id}"`), engine + ': ' + id);
    assert.match(html, /共同永续币种 · 两所合计价差从窄到宽/);
    assert.match(html, /id="f-leverage"/); assert.match(html, /value="binance_maker"/); assert.match(html, /value="ioc"/);
    assert.match(html, /保存任务/); assert.doesNotMatch(html, /Binance|Hyperliquid 原生/);
    assert.equal(fs.readFileSync(`hedge-ops/paired_hedge/web/${engine}/styles.css`, 'utf8'), fs.readFileSync('hedge-ops/paired_hedge/web/binance_hyperliquid/styles.css', 'utf8'));
    const js = fs.readFileSync(`hedge-ops/paired_hedge/web/${engine}/app.js`, 'utf8');
    assert.match(js, /hedge-console-active/); assert.match(js, /readFlights.has\(key\)/);
    assert.match(js, /document.activeElement!==\$\('f-asset'\)/); assert.match(js, /total_bps/);
    assert.match(js, /独立账户|HIP-3 io/);
  }
});

test('a slow funding read cannot block tasks or health, and repeated polling does not enqueue duplicate requests', async () => {
  for (const engine of engines) {
    const f = browser(engine);
    f.run("void readChannel('funding');void readChannel('tasks');void readChannel('status');void readChannel('funding');");
    assert.equal(f.calls.length, 3);
    assert.ok(f.calls.every(call => !call.options.method && call.options.signal));
    f.calls.find(call => call.url.endsWith('/tasks')).resolve(Response.json({ tasks: [{ asset: 'BTC', phase: 'IDLE', enabled: false, managed: {} }] }));
    f.calls.find(call => call.url.endsWith('/status')).resolve(Response.json({ dry_run: true, version: '1.5.0' }));
    await tick(); await tick();
    assert.equal(f.element('nav-tasks').textContent, 1);
    assert.equal(f.element('conn-title').textContent, '行情读取待恢复');
    assert.equal(f.run("readFlights.has('funding')"), true);
    f.calls.find(call => call.url.endsWith('/funding')).reject(Object.assign(new Error('request timed out'), { name: 'TimeoutError' }));
    await tick(); await tick();
    assert.equal(f.run('readFlights.size'), 0);
    assert.equal(f.element('conn-title').textContent, '行情读取待恢复', 'market failure must not report engine offline');
    assert.match(f.element('error').textContent, /funding.*读取超时/);
  }
});

test('failed account snapshot masks old balances, while a dual-account strategy never fabricates funding returns', () => {
  const f = browser('ondoperps_ondoperps');
  const snapshot = { ready: true, funding_ready: true, rows: [{ asset: 'BTC', binance_bps_h: 7, lighter_bps_h: 7, net_bps_h: 99, direction: 'LIGHTER_LONG', max_leverage: 10, binance_max_leverage: 20, lighter_max_leverage: 10 }], venues: { binance: { connected: true, equity: 100, available: 100 }, lighter: { connected: true, equity: 100, available: 100 } } };
  f.run('state={status:{dry_run:true},funding:' + JSON.stringify(snapshot) + '};render();');
  assert.match(f.element('stats-grid').innerHTML, /双账户对冲|手续费另计/);
  assert.doesNotMatch(f.element('stats-grid').innerHTML, /最优年化|最优净费率/);
  assert.match(f.element('funding-body').innerHTML, /0\.000/);
  assert.match(f.element('funding-body').innerHTML, /Ondoperps A 多 \/ Ondoperps B 空/);
  assert.doesNotMatch(f.element('funding-body').innerHTML, /99\.000/);
  f.run("readErrors.funding='读取超时';render();");
  assert.doesNotMatch(f.element('ledger-grid').innerHTML, /\$100\.00/);
  assert.match(f.element('ledger-grid').innerHTML, /本次账户快照读取失败/);
  assert.doesNotMatch(f.element('pos-grid').innerHTML, /双所当前没有持仓/);
  const unknownCard = f.run("card('Ondoperps A','A',{},{});");
  assert.doesNotMatch(unknownCard, /0 笔|\$0\.00/);
});

test('hidden new consoles pause reads without reporting a failure or changing task form drafts', async () => {
  for (const engine of engines) {
    const f = browser(engine);
    f.element('f-notional').value = '230';
    f.element('f-asset').innerHTML = '<option value="BTC">BTC draft selection</option>';
    f.context.document.activeElement = f.element('f-asset');
    f.run("void readChannel('funding')");
    f.run('window.hedgeConsoleIsActive=()=>false');
    f.calls[0].reject(Object.assign(new Error('paused'), { name: 'AbortError', hedgeConsoleInactive: true }));
    await tick(); await tick();
    assert.equal(f.run('Object.keys(readErrors).length'), 0);
    assert.equal(f.run('lastReadError'), '');
    const count = f.calls.length;
    await f.run('refresh(); loadSpreads(true)');
    assert.equal(f.calls.length, count);
    f.run('window.hedgeConsoleIsActive=()=>true');
    f.run("void readChannel('tasks')");
    f.calls.at(-1).resolve(Response.json({ tasks: [] }));
    await tick(); await tick();
    assert.equal(f.element('f-notional').value, '230');
    assert.equal(f.element('f-asset').innerHTML, '<option value="BTC">BTC draft selection</option>');
    assert.ok(f.calls.every(call => !call.options.method), 'reactivation only rereads and never replays a trading write');
  }
});

test('a visibility abort settling after reactivation starts one fresh read without waiting for the poll timer', async () => {
  for (const engine of engines) {
    const f = browser(engine);
    f.run("void readChannel('status')");
    f.calls[0].reject(Object.assign(new Error('paused just before reactivation'), { name: 'AbortError', hedgeConsoleInactive: true }));
    await tick();
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].url, '/api/status');
    f.calls[1].resolve(Response.json({ dry_run: true }));
    await tick(); await tick();
    assert.equal(f.run('readFlights.size'), 0);
    assert.equal(f.run('Object.keys(readErrors).length'), 0);
  }
});

test('cloud workers and local packages include both new engine assets', () => {
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.match(vercel.functions['api/hedge_*.py'].includeFiles, /paired_hedge\/\*\*/);
  assert.match(vercel.functions['api/hedge_*.py'].includeFiles, /release\.json/);
  for (const engine of engines) {
    assert.ok(fs.readFileSync(`api/hedge_${engine}.py`, 'utf8').includes(`create_worker("${engine}")`));
  }
  const packageScript = fs.readFileSync('scripts/package-hedge-ops.mjs', 'utf8');
  assert.match(packageScript, /source, 'paired_hedge'/);
  assert.match(packageScript, /ignoredPythonDirectories = new Set\(\[[^\]]*'\.pytest_cache'/);
  assert.match(packageScript, /if \(ignoredPythonDirectories\.has\(entry\.name\)/);
});

test('authenticated hosted routes serve each new console with scoped assets and reject path traversal', async () => {
  let authorized = 0;
  class HedgeOpsError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const consoleModule = load('lib/hedge-ops/console.ts', {});
  const route = load('app/hedge-ops/console/[engine]/[[...asset]]/route.ts', {
    'node:fs/promises': fs.promises, 'node:path': path,
    '@/lib/hedge-ops/protocol': protocol, '@/lib/hedge-ops/console': consoleModule,
    '@/lib/hedge-ops/access': { HedgeOpsError, requireHedgeOperator: async () => { authorized++; }, hedgeErrorResponse: error => Response.json({ error: error.message }, { status: error.status || 500 }) },
  }, { process: { cwd: () => process.cwd() }, Response });
  for (const engine of engines) {
    const response = await route.GET({}, { params: Promise.resolve({ engine, asset: [] }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const html = await response.text();
    assert.ok(html.includes(`/hedge-ops/console/${engine}/static/app.js`));
    assert.ok(html.includes(`/api/hedge-ops/${engine}`));
    const js = await route.GET({}, { params: Promise.resolve({ engine, asset: ['static', 'app.js'] }) });
    assert.equal(js.status, 200); assert.match(await js.text(), /const dualAccountRotation=/);
    assert.equal((await route.GET({}, { params: Promise.resolve({ engine, asset: ['..', '..', 'schema.json'] }) })).status, 404);
  }
  assert.equal(authorized, 6);
});
