const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const engines = ['lighter', 'entropy', 'binance', 'binance_okx', 'binance_hyperliquid', 'hyperliquid_lighter', 'ondoperps_entropy', 'ondoperps_ondoperps'];
const tick = () => new Promise(resolve => setImmediate(resolve));

function bridgeSource(mode, engine) {
  if (mode === 'local') {
    const python = fs.readFileSync('hedge-ops/local.py', 'utf8');
    return python.match(/bridge = r"""<script>([\s\S]*?)<\/script>/)[1]
      .replaceAll('__DATA__', JSON.stringify('http://127.0.0.1:8811'))
      .replaceAll('__CONTROL__', JSON.stringify('http://127.0.0.1:8812'))
      .replaceAll('__TOKEN__', JSON.stringify('fixture'))
      .replaceAll('__ENGINE__', engine);
  }
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync('lib/hedge-ops/console.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, { exports });
  return exports.integrateHedgeConsole('<html><head></head></html>', engine).match(/<script>([\s\S]*?)<\/script>/)[1];
}

function fixture(mode, engine) {
  const listeners = new Map(), documentListeners = new Map(), calls = [];
  const origin = mode === 'local' ? 'http://127.0.0.1:8812' : 'https://platform.test';
  const frame = { hidden: false };
  const parent = {};
  let observer;
  const document = { hidden: false, addEventListener(name, fn) { documentListeners.set(name, fn); }, getElementById() { return null; } };
  const window = {
    parent, frameElement: frame,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
    fetch(url, options = {}) {
      let resolve, reject;
      const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
      calls.push({ url, options, resolve, reject });
      if (options.signal) {
        if (options.signal.aborted) reject(options.signal.reason);
        else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      }
      return promise;
    },
  };
  const context = vm.createContext({ window, document, location: { href: origin + '/console/' + engine + '/', origin },
    AbortSignal, AbortController, Event, Error, Headers, Request, URL,
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
  });
  vm.runInContext(bridgeSource(mode, engine), context);
  return {
    window, document, frame, parent, origin, calls,
    visibility(hidden) { frame.hidden = hidden; observer(); },
    documentVisibility(hidden) { document.hidden = hidden; documentListeners.get('visibilitychange')(); },
    message(data, source = parent, eventOrigin = origin) { window.dispatchEvent({ type: 'message', data, source, origin: eventOrigin }); },
  };
}

for (const mode of ['local', 'hosted']) {
  test(`${mode} bridge pauses all eight hidden consoles and aborts reads without touching a pending mutation`, async () => {
    for (const engine of engines) {
      const f = fixture(mode, engine);
      let activations = 0;
      f.window.addEventListener('hedge-console-active', () => activations++);
      const read = f.window.fetch('/api/funding');
      const aborted = assert.rejects(read, error => error.name === 'AbortError' && error.hedgeConsoleInactive === true);
      const write = f.window.fetch('/api/cycle', { method: 'POST', body: '{}' });
      const readCall = f.calls[0], writeCall = f.calls[1];
      assert.equal(f.calls.length, 2);

      f.visibility(true);
      await aborted;
      assert.equal(readCall.options.signal.aborted, true);
      assert.ok(!writeCall.options.signal?.aborted, 'switching consoles must not cancel a trading write');
      await assert.rejects(f.window.fetch('/api/stats'), error => error.hedgeConsoleInactive === true);
      assert.equal(f.calls.length, 2, 'hidden polls must not consume the shared browser connection pool');

      f.visibility(false);
      assert.equal(activations, 1);
      assert.equal(f.calls.length, 2, 'visibility recovery must never replay either request');
      writeCall.resolve(Response.json({ ok: true }));
      await write;
      const recovered = f.window.fetch('/api/stats');
      assert.ok(String(f.calls[2].url).includes(mode === 'local' ? `/local/${engine}/api/stats` : `/api/hedge-ops/${engine}/stats`));
      f.calls[2].resolve(Response.json({ ok: true }));
      await recovered;
    }
  });

  test(`${mode} visibility messages require the actual parent, exact origin and matching engine`, async () => {
    const f = fixture(mode, 'entropy');
    const payload = { type: 'hedge-console-visibility', engine: 'entropy', active: false };
    f.message(payload, {}, f.origin);
    f.message(payload, f.parent, 'https://evil.invalid');
    f.message({ ...payload, engine: 'lighter' });
    assert.equal(f.window.hedgeConsoleIsActive(), true);
    const read = f.window.fetch('/api/status');
    const aborted = assert.rejects(read, error => error.hedgeConsoleInactive === true);
    f.message(payload);
    await aborted;
    assert.equal(f.window.hedgeConsoleIsActive(), false);
    f.message({ ...payload, active: true });
    assert.equal(f.window.hedgeConsoleIsActive(), true);
    assert.equal(f.calls.length, 1, 'reactivation dispatches an event; it does not replay requests');
  });

  test(`${mode} parent-tab visibility cancels reads and keeps caller cancellation intact`, async () => {
    const f = fixture(mode, 'binance_okx');
    const controller = new AbortController();
    const read = f.window.fetch('/api/tasks', { signal: controller.signal });
    const cancelled = assert.rejects(read, /caller cancelled/);
    controller.abort(new Error('caller cancelled'));
    await cancelled;
    const background = f.window.fetch('/api/funding');
    const paused = assert.rejects(background, error => error.hedgeConsoleInactive === true);
    f.documentVisibility(true);
    await paused;
    f.documentVisibility(false);
    await tick();
    assert.equal(f.calls.length, 2);
    assert.equal(f.window.hedgeConsoleIsActive(), true);
  });
}

test('all four native consoles pause read polling without false failures and refresh when selected again', async () => {
  for (const file of [
    'hedge-ops/binance_lighter/web/app.js',
    'hedge-ops/paired_hedge/web/binance_okx/app.js',
    'hedge-ops/paired_hedge/web/binance_hyperliquid/app.js',
    'hedge-ops/paired_hedge/web/hyperliquid_lighter/app.js',
  ]) {
    const source = fs.readFileSync(file, 'utf8');
    const elements = new Map(), calls = [], listeners = new Map();
    let active = true, holdFunding = false, rejectFunding, renders = 0;
    const window = {
      hedgeConsoleIsActive: () => active,
      addEventListener: (type, callback) => listeners.set(type, callback),
    };
    const context = vm.createContext({
      window, Date, console,
      document: { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
      render() { renders++; }, renderAssets() {},
      fetch: async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET' });
        if (holdFunding && url === '/api/funding') return new Promise((resolve, reject) => { rejectFunding = reject; });
        return Response.json({});
      },
    });
    const polling = source.slice(0, source.indexOf('function renderAssets()'));
    const activation = source.match(/^window\.addEventListener\('hedge-console-active'.*$/m)[0];
    vm.runInContext(polling + '\n' + activation, context);
    await vm.runInContext('refresh()', context);
    await tick();
    assert.equal(vm.runInContext('lastReadError', context), '');
    const originalRenders = renders;

    holdFunding = true;
    const pending = vm.runInContext('refresh()', context);
    await tick();
    assert.equal(typeof rejectFunding, 'function');
    active = false;
    rejectFunding(Object.assign(new Error('background paused'), { name: 'AbortError', hedgeConsoleInactive: true }));
    await pending;
    assert.equal(renders, originalRenders, 'deactivation preserves the existing display');
    assert.equal(vm.runInContext('lastReadError', context), '', 'a hidden console is not an exchange failure');
    const hiddenCalls = calls.length;
    await vm.runInContext('refresh(); loadSpreads(true)', context);
    assert.equal(calls.length, hiddenCalls);

    holdFunding = false;
    active = true;
    listeners.get('hedge-console-active')();
    await tick();
    await tick();
    assert.ok(renders > originalRenders);
    assert.ok(calls.length > hiddenCalls);
    assert.ok(calls.every(call => call.method === 'GET'), 'reactivation must only request data');
  }
});
