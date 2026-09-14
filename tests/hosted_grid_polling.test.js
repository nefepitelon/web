import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/hosted-grid-polling.js', import.meta.url), 'utf8');
function setup() {
  let now = 0, calls = 0, active = false, status = 200;
  const listeners = new Map();
  const document = { hidden: false, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  const window = { location: { origin: 'https://app.example.test' } };
  vm.runInNewContext(source, { window, document, URL, Response, AbortSignal, Date: { now: () => now } });
  const client = window.createHostedGridPolling(async () => {
    calls++;
    return new Response(JSON.stringify(status === 200 ? { active, overview: { de: { running: active }, ex: { running: false } }, hedge: { active: false }, proxyConfig: { global: 'direct' }, status: 'READY' } : { error: 'Unauthorized' }), { status });
  }, '/api/grid-ops-hosted');
  return { client, document, calls: () => calls, tick: ms => { now += ms; }, active: value => { active = value; }, status: value => { status = value; }, show() { document.hidden = false; listeners.get('visibilitychange')?.(); } };
}

test('concurrent hosted panels use one poll and idle data lasts 30 seconds', async () => {
  const h = setup();
  const paths = ['de/state', 'ex/state', 'overview', 'proxy-config', 'proxy-check', 'ai/status', 'hedge'];
  const results = await Promise.all(paths.map(p => h.client.fetch('/api/grid-ops-hosted/' + p)));
  assert.equal(h.calls(), 1);
  assert.equal((await results[0].json()).running, false);
  h.tick(29999); await h.client.fetch('/api/grid-ops-hosted/de/state'); assert.equal(h.calls(), 1);
  h.tick(1); await h.client.fetch('/api/grid-ops-hosted/de/state'); assert.equal(h.calls(), 2);
});

test('active bots refresh after five seconds and mutations invalidate immediately', async () => {
  const h = setup(); h.active(true);
  await h.client.fetch('/api/grid-ops-hosted/de/state');
  h.tick(5000); await h.client.fetch('/api/grid-ops-hosted/de/state'); assert.equal(h.calls(), 2);
  h.client.invalidate(); await h.client.fetch('/api/grid-ops-hosted/de/state'); assert.equal(h.calls(), 3);
});

test('hidden tabs make no requests and resume on visibility', async () => {
  const h = setup(); h.document.hidden = true;
  const request = h.client.fetch('/api/grid-ops-hosted/de/state');
  await Promise.resolve(); assert.equal(h.calls(), 0);
  h.show(); assert.equal((await request).status, 200); assert.equal(h.calls(), 1);
});

test('authentication failures are not converted into successful snapshots', async () => {
  const h = setup(); h.status(401);
  const responses = await Promise.all([h.client.fetch('/api/grid-ops-hosted/de/state'), h.client.fetch('/api/grid-ops-hosted/ex/state')]);
  assert.equal(h.calls(), 1); assert.ok(responses.every(r => r.status === 401));
  h.status(200); h.tick(5000); assert.equal((await h.client.fetch('/api/grid-ops-hosted/de/state')).status, 200);
});

test('private caches are isolated between console instances; unrelated endpoints bypass', async () => {
  const a = setup(), b = setup();
  await a.client.fetch('/api/grid-ops-hosted/de/state');
  assert.equal(b.calls(), 0);
  assert.equal(a.client.matches('https://other.example/api/grid-ops-hosted/de/state'), false);
  assert.equal(a.client.matches('/api/grid-ops-hosted/env-config'), false);
  assert.equal(a.client.matches('/api/grid-ops-hosted/de/markets'), false);
});

test('a failed network request is shared and backs off instead of multiplying retries', async () => {
  let calls = 0;
  const window = { location: { origin: 'https://app.example.test' } };
  vm.runInNewContext(source, { window, document: { hidden: false }, URL, Response, AbortSignal, Date });
  const client = window.createHostedGridPolling(async () => { calls++; throw new Error('offline'); }, '/api/grid-ops-hosted');
  const a = await client.fetch('/api/grid-ops-hosted/de/state');
  const b = await client.fetch('/api/grid-ops-hosted/ex/state');
  assert.equal(a.status, 503); assert.equal(b.status, 503); assert.equal(calls, 1);
});

test('a poll started before a mutation cannot overwrite the next snapshot cache', async () => {
  const resolvers = [];
  let calls = 0;
  const window = { location: { origin: 'https://app.example.test' } };
  vm.runInNewContext(source, { window, document: { hidden: false }, URL, Response, AbortSignal, Date });
  const client = window.createHostedGridPolling(() => { calls++; return new Promise(resolve => resolvers.push(resolve)); }, '/api/grid-ops-hosted');
  const old = client.fetch('/api/grid-ops-hosted/de/state');
  await Promise.resolve(); client.invalidate();
  const fresh = client.fetch('/api/grid-ops-hosted/de/state'); await Promise.resolve();
  resolvers[1](Response.json({ overview: { de: { running: true } }, active: true })); await fresh;
  resolvers[0](Response.json({ overview: { de: { running: false } }, active: false })); await old;
  assert.equal((await (await client.fetch('/api/grid-ops-hosted/de/state')).json()).running, true);
  assert.equal(calls, 2);
});
