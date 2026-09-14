import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createLocalConsole, validatePairing, openConsoleBrowser } from '../bin/local-console.mjs';
import { approvedConfigHash } from '../lib/validation.mjs';
import { paths, writeJson } from '../lib/storage.mjs';

const pairing = {schemaVersion: 1, baseUrl: 'https://ai.welinkbtc.xyz', workerId: 'fixture-worker', userId: 'fixture_user_012345', token: 'fixture_device_token_never_use_in_real_world_0123456789'};
const config = {name: 'Fixture strategy', mode: 'paper', exchange: 'binance', symbols: ['BTC/USDT'], timeframe: '1h', strategy: 'default', stakeAmount: 100, maxOpenTrades: 2, stopLossPct: 2};
async function waitFor(predicate) { const deadline = Date.now() + 5000; while (!await predicate()) { if (Date.now() > deadline) throw new Error('Fixture state did not settle.'); await new Promise(resolve => setTimeout(resolve, 10)); } }
test('optional browser launch uses a fixed loopback URL and hidden shell-free child', async () => {
  const calls = []; const runner = async (...args) => calls.push(args);
  assert.equal(await openConsoleBrowser({enabled: false, platform: 'win32', runner}), false);
  assert.equal(await openConsoleBrowser({enabled: true, platform: 'linux', runner}), false);
  assert.equal(await openConsoleBrowser({enabled: true, platform: 'win32', runner}), true);
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'powershell.exe'); assert.equal(calls[0][1].at(-1), "Start-Process 'http://127.0.0.1:8790'"); assert.equal(calls[0][2].windowsHide, true); assert.equal(calls[0][2].shell, false);
});
test('pairing accepts only exact trusted origins and versioned account-scoped device data', () => {
  assert.deepEqual(validatePairing(pairing), pairing);
  for (const baseUrl of ['https://example.com', 'https://ai.welinkbtc.xyz.evil.test', 'https://ai.welinkbtc.xyz/other', 'https://user:pass@ai.welinkbtc.xyz', 'http://127.0.0.1:1234', 'https://ai.welinkbtc.xyz?foo=1']) assert.throws(() => validatePairing({...pairing, baseUrl}));
  assert.throws(() => validatePairing({...pairing, schemaVersion: 2}));
  assert.throws(() => validatePairing({...pairing, userId: undefined}));
  assert.throws(() => validatePairing({...pairing, apiKey: 'secret'}));
});

test('local console guards requests, hides tokens, uses scoped assignments, and gates live execution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'welink-local-console-test-'));
  const invocations = [], instances = [], verifications = [];
  const app = createLocalConsole({root, port: 0, verifier: async options => { verifications.push(options); assert.equal(instances[0].stopped, true); return {ok: true, engine: options.engine, configHash: approvedConfigHash(options.config), checks: [], message: 'Fixture research verification only'}; }, commandRunner: async (_binary, args) => args[0] === 'info' ? '{"OSType":"linux"}' : 'fixture environment', installer: async args => { invocations.push(args); return {ok: true, engine: args[1], status: args.includes('--stop') ? 'stopped' : args.includes('--resume') ? 'ui-ready' : 'installed', uiUrl: null, message: 'Fixture command only'}; }, workerFactory: options => {
    const fixture = {gateway: options.gateway, allowLive: options.allowLive, assignments: [], stopped: false, api: async () => ({ok: true}), async tick() { await this.api('claim', {}); this.assignments = [{engine: 'freqtrade', userId: pairing.userId, revision: 2, configHash: approvedConfigHash(config), config}, {engine: 'jesse', userId: 'different-user', revision: 1, configHash: approvedConfigHash(config), config}]; }, async run() { await this.tick(); while (!this.stopped) await new Promise(resolve => setTimeout(resolve, 5)); }, stop() { this.stopped = true; }};
    instances.push(fixture); return fixture;
  }});
  try {
    const address = await app.listen(), origin = `http://127.0.0.1:${address.port}`;
    const html = await fetch(origin); const cookie = html.headers.get('set-cookie').split(';')[0]; const htmlText = await html.text(); const csrf = htmlText.match(/name="local-csrf" content="([a-f0-9]+)"/)[1];
    const post = (url, body, extra = {}) => fetch(`${origin}${url}`, {method: 'POST', headers: {cookie, origin, 'content-type': 'application/json', 'x-local-csrf': csrf, ...extra}, body: JSON.stringify(body)});
    const rawGet = (pathname, headers) => new Promise(resolve => {const req = http.request(`${origin}${pathname}`, {headers}, res => {res.resume(); resolve(res.statusCode);}); req.end();});
    const navigationHeaders = {'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', 'sec-fetch-user': '?1'};
    assert.equal(await rawGet('/', navigationHeaders), 200);
    assert.equal(await rawGet('/index.html', navigationHeaders), 200);
    assert.equal(await rawGet('/', {...navigationHeaders, 'sec-fetch-dest': 'iframe'}), 403);
    assert.equal(await rawGet('/', {...navigationHeaders, 'sec-fetch-mode': 'cors'}), 403);
    assert.equal(await rawGet('/', {...navigationHeaders, 'sec-fetch-user': '?0'}), 403);
    assert.equal(await rawGet('/api/status', {...navigationHeaders, cookie}), 403);
    assert.equal(await rawGet('/app.js', navigationHeaders), 403);
    assert.equal(await rawGet('/', {...navigationHeaders, host: 'evil.test'}), 403);
    assert.equal((await fetch(`${origin}/api/status`)).status, 401);
    assert.equal((await post('/api/pair', pairing, {origin: 'https://evil.test'})).status, 403);
    assert.equal((await post('/api/pair', pairing, {'x-local-csrf': 'invalid'})).status, 403);
    assert.equal(await new Promise(resolve => { const req = http.request(`${origin}/api/status`, {headers: {host: 'evil.test'}}, res => { res.resume(); resolve(res.statusCode); }); req.end(); }), 403);
    assert.equal((await post('/api/pair', pairing, {'content-type': 'text/plain'})).status, 415);
    assert.equal((await post('/api/pair', {...pairing, token: 'x'.repeat(40000)})).status, 413);
    assert.equal((await post('/api/pair', {...pairing, baseUrl: 'https://example.com'})).status, 400);
    const saved = await post('/api/pair', pairing); assert.equal(saved.status, 200); assert.equal((await saved.text()).includes(pairing.token), false);
    assert.equal(JSON.parse(await readFile(path.join(root, 'settings/device.json'), 'utf8')).token, pairing.token);
    await writeJson(path.join(paths(root, pairing.userId, 'freqtrade').base, 'native', 'credentials.json'), {username: 'welink', password: 'fixture-native-password', jwtSecret: 'must-not-return-jwt', databasePassword: 'must-not-return-db'});
    assert.equal((await post('/api/credentials', {engine: 'freqtrade'})).status, 400);
    const login = await (await post('/api/credentials', {engine: 'freqtrade', confirmation: 'VIEW freqtrade'})).json();
    assert.equal(login.password, 'fixture-native-password'); assert.equal(Object.hasOwn(login, 'jwtSecret'), false); assert.equal(Object.hasOwn(login, 'databasePassword'), false);
    assert.equal((await post('/api/credentials', {engine: 'octobot', confirmation: 'VIEW octobot'})).status, 400);
    assert.equal((await post('/api/live', {enabled: true, confirmation: 'wrong'})).status, 400);
    assert.equal((await post('/api/live', {enabled: true, confirmation: 'ENABLE LOCAL LIVE'})).status, 200);
    await post('/api/connect', {}); await waitFor(async () => (await app.snapshot()).engines.some(engine => engine.assigned));
    assert.equal(instances[0].allowLive, true); assert.equal(instances[0].gateway.allowLive, true);
    const status = await (await fetch(`${origin}/api/status`, {headers: {cookie}})).json();
    assert.equal(status.connection, 'connected'); assert.equal(status.engines.find(e => e.id === 'freqtrade').assigned, true); assert.equal(status.engines.find(e => e.id === 'jesse').assigned, false); assert.equal(JSON.stringify(status).includes(pairing.token), false);
    await post('/api/live', {enabled: false}); assert.equal(instances[0].allowLive, false); assert.equal(instances[0].gateway.allowLive, false);
    assert.equal((await post('/api/install', {engine: 'freqtrade'})).status, 400);
    await post('/api/diagnostics', {});
    assert.equal((await post('/api/install', {engine: 'jesse'})).status, 400);
    assert.equal((await post('/api/install', {engine: 'freqtrade'})).status, 200); await waitFor(async () => (await app.snapshot()).operation?.status === 'completed');
    assert.equal(invocations.length, 1); assert.deepEqual(invocations[0].slice(0, 2), ['--engine', 'freqtrade']); assert.equal(invocations[0].includes(pairing.userId), true);
    await post('/api/disconnect', {}); await waitFor(async () => (await app.snapshot()).connection === 'disconnected');
    assert.equal((await post('/api/stop-engine', {engine: 'freqtrade', confirmation: 'STOP freqtrade'})).status, 200); await waitFor(async () => (await app.snapshot()).operation?.status === 'completed');
    assert.equal(invocations[1].includes('--stop'), true);
    assert.equal(JSON.parse(await readFile(path.join(paths(root, pairing.userId, 'freqtrade').base, 'local-halt.json'), 'utf8')).reason, 'local-stop');
    assert.equal((await post('/api/verify-engine', {engine: 'freqtrade', resume: true, confirmation: 'wrong'})).status, 400);
    assert.equal((await post('/api/verify-engine', {engine: 'freqtrade', resume: true, confirmation: 'RESUME freqtrade'})).status, 200); await waitFor(async () => (await app.snapshot()).operation?.status === 'completed');
    assert.equal(verifications.length, 1); assert.equal(verifications[0].resume, true); assert.deepEqual(verifications[0].actions, ['backtest']); assert.equal(invocations[2].includes('--resume'), true);
    const haltFile = path.join(paths(root, pairing.userId, 'freqtrade').base, 'local-halt.json');
    const haltBefore = await readFile(haltFile, 'utf8');
    assert.equal((await post('/api/resume-ui', {engine: 'freqtrade', confirmation: 'RESUME freqtrade'})).status, 400);
    assert.equal((await post('/api/resume-ui', {engine: 'nautilus', confirmation: 'RESUME UI nautilus'})).status, 400);
    await post('/api/connect', {}); await waitFor(async () => (await app.snapshot()).connection === 'connected');
    assert.equal((await post('/api/resume-ui', {engine: 'freqtrade', confirmation: 'RESUME UI freqtrade'})).status, 200); await waitFor(async () => (await app.snapshot()).operation?.status === 'completed');
    assert.equal(instances[1].stopped, true); assert.equal((await app.snapshot()).connection, 'disconnected');
    assert.equal(verifications.length, 1, 'UI-only recovery must not invoke or depend on the research verifier.');
    assert.equal(await readFile(haltFile, 'utf8'), haltBefore, 'UI-only recovery must preserve the durable halt exactly.');
    assert.equal(invocations[3].includes('--resume'), true); assert.equal(invocations[3].includes('--config'), true);
    const persisted = JSON.parse(await readFile(path.join(root, 'settings/device.json'), 'utf8')); assert.equal(Object.hasOwn(persisted, 'liveEnabled'), false);
    assert.equal((await fetch(`${origin}/api/status`, {headers: {cookie, 'sec-fetch-site': 'cross-site'}})).status, 403);
  } finally { await app.close(); assert.equal(path.dirname(root), os.tmpdir()); assert.ok(path.basename(root).startsWith('welink-local-console-test-')); await rm(root, {recursive: true, force: true}); }
});
