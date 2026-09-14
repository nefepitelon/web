import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Gateway } from '../lib/gateway.mjs';
import { paths, writeJson } from '../lib/storage.mjs';
import { validateCommand, approvedConfigHash, digest, authorized, isPinnedImage } from '../lib/validation.mjs';
import { dockerArgs, nativeCommand, hummingbotTask, nativeStatus, containerName } from '../lib/adapters.mjs';
import { createServer } from '../server.mjs';

const config = { name: 'BTC trend', mode: 'paper', exchange: 'binance', symbols: ['BTC/USDT'], timeframe: '1h', strategy: 'ema-trend', stakeAmount: 50, maxOpenTrades: 2, stopLossPct: 3 };
const cmd = (action, overrides = {}) => ({ userId: 'user-A', engine: 'freqtrade', action, config, requestId: 'request-12345', ...(['start', 'stop', 'backtest', 'optimize'].includes(action) ? { controlSequence: 1 } : {}), ...overrides });
class FakeDocker {
  containers = new Map(); runs = []; calls = [];
  async available() {}
  async image() {}
  async inspect(name) { assert.equal(typeof name, 'string'); return this.containers.get(name) ?? null; }
  async exec(args) {
    this.calls.push(args);
    if (args[0] === 'run') {
      const name = args[args.indexOf('--name') + 1];
      this.runs.push(args); this.containers.set(name, { running: true, exitCode: 0 });
      return 'container-id';
    }
    if (args[0] === 'container' && args[1] === 'rm') this.containers.delete(args[2]);
    return '';
  }
  async stop(name) { this.containers.set(name, { running: false, exitCode: 0 }); }
}
async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'welink-quant-test-'));
  // Recursive cleanup is limited to the exact mkdtemp directory under the OS temporary directory.
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('welink-quant-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const p = paths(root, 'user-A', options.engine ?? 'freqtrade');
  await mkdir(path.join(p.project, 'strategies'), { recursive: true });
  await writeJson(path.join(p.project, 'config.json'), {});
  const d = { engine: options.engine ?? 'freqtrade', enabled: true, image: 'freqtradeorg/freqtrade:2026.8', upstreamVersion: '2026.8', approvedConfigHash: approvedConfigHash(options.config ?? config), verifiedActions: ['start', 'stop', 'backtest', 'optimize'], paperVerified: true, liveVerified: true, accountConfigured: true, withdrawalsDisabled: true, ipAllowlistVerified: true, ...options.deployment };
  await writeJson(p.deployment, d);
  const docker = new FakeDocker();
  const gateway = new Gateway({ root, docker, allowLive: options.allowLive ?? false, fetcher: options.fetcher });
  return { root, p, d, docker, gateway };
}

test('strict validation rejects script injection, extra fields, traversal, duplicate pairs and malformed risk', () => {
  assert.throws(() => validateCommand(cmd('start', { engine: '../../secrets' })));
  assert.throws(() => validateCommand(cmd('start', { config: { ...config, command: 'rm -rf /' } })));
  assert.throws(() => validateCommand(cmd('start', { requestId: '../../x' })));
  assert.throws(() => validateCommand(cmd('start', { controlSequence: undefined })));
  assert.throws(() => validateCommand(cmd('start', { controlSequence: Number.MAX_SAFE_INTEGER + 1 })));
  assert.throws(() => validateCommand(cmd('start', { config: { ...config, symbols: ['BTC/USDT', 'BTC/USDT'] } })));
  assert.throws(() => validateCommand(cmd('start', { config: { ...config, stopLossPct: 0 } })));
  assert.throws(() => validateCommand(cmd('start', { config: { ...config, stakeAmount: Infinity } })));
  assert.throws(() => validateCommand(cmd('preflight', { targetAction: 'shell' })));
  assert.throws(() => validateCommand(cmd('backtest', { config: { ...config, startDate: '2026-02-30', endDate: '2026-03-10' } })));
});

test('token validation rejects missing, incorrect and short tokens; image versions must be stable and pinned', () => {
  const secret = 'a'.repeat(40);
  assert.equal(authorized(`Bearer ${secret}`, secret), true);
  assert.equal(authorized(`Bearer ${secret}b`, secret), false);
  assert.equal(authorized(undefined, secret), false);
  assert.equal(authorized('Bearer short', 'short'), false);
  for (const image of ['repo:stable', 'repo:latest', 'repo:nightly', 'repo:3.0.0-beta2', 'repo:2.0.0-rc.1', 'repo']) assert.equal(isPinnedImage(image), false);
  assert.equal(isPinnedImage('freqtradeorg/freqtrade:2026.8'), true);
  assert.equal(isPinnedImage(`repo@sha256:${'a'.repeat(64)}`), true);
});

test('configuration binding includes all risk fields but excludes display name and research window', () => {
  const hash = approvedConfigHash(config);
  assert.equal(hash, approvedConfigHash({ ...config, name: 'Renamed', startDate: '2026-01-01', endDate: '2026-02-01' }));
  for (const patch of [{ stakeAmount: 51 }, { mode: 'live' }, { maxOpenTrades: 3 }, { stopLossPct: 4 }, { timeframe: '4h' }, { strategy: 'other' }, { symbols: ['ETH/USDT'] }]) assert.notEqual(hash, approvedConfigHash({ ...config, ...patch }));
});

test('generic symbol validation supports equities and native instrument identifiers', () => {
  assert.deepEqual(validateCommand(cmd('start', { config: { ...config, symbols: ['AAPL', 'BTCUSDT-PERP.BINANCE', 'BTC/USDT:USDT'] } })).config.symbols, ['AAPL', 'BTCUSDT-PERP.BINANCE', 'BTC/USDT:USDT']);
  assert.throws(() => validateCommand(cmd('start', { config: { ...config, strategy: 'user script()' } })));
  assert.throws(() => validateCommand(cmd('start', { config: { ...config, exchange: 'BINANCE' } })));
});

test('unconfigured tenant is isolated and never invokes Docker', async t => {
  const f = await fixture(t);
  const response = await f.gateway.execute(cmd('status', { userId: 'user-B', config: undefined }));
  assert.equal(response.runtime.state, 'unconfigured');
  assert.equal(f.docker.calls.length, 0);
  assert.notEqual(paths(f.root, 'user-B', 'freqtrade').base, f.p.base);
  assert.equal(paths(f.root, '../user/../B', 'freqtrade').base.includes('../'), false);
});

test('live global gate rejects start even when all operator flags are true', async t => {
  const live = { ...config, mode: 'live' };
  const f = await fixture(t, { config: live });
  const response = await f.gateway.execute(cmd('start', { config: live }));
  assert.equal(response.ok, false);
  assert.ok(response.blockers.some(s => s.includes('QUANT_ALLOW_LIVE')));
  assert.equal(f.docker.runs.length, 0);
  assert.equal(response.runtime.capabilities.includes('live'), false);
});

test('changed risk parameters require renewed native configuration approval', async t => {
  const f = await fixture(t);
  const response = await f.gateway.execute(cmd('start', { config: { ...config, stakeAmount: 100 } }));
  assert.equal(response.ok, false);
  assert.ok(response.blockers.some(s => s.includes('风险参数')));
  assert.equal(f.docker.runs.length, 0);
});

test('persistent local halt blocks delayed start and research across restart while stop remains available', async t => {
  const f = await fixture(t);
  await writeJson(path.join(f.p.base, 'local-halt.json'), {schemaVersion: 1, at: new Date().toISOString(), reason: 'local-stop', configHash: approvedConfigHash(config)});
  const restarted = new Gateway({root: f.root, docker: f.docker});
  const status = await restarted.execute(cmd('status'));
  assert.equal(status.runtime.capabilities.includes('paper'), false);
  assert.equal(status.runtime.capabilities.includes('backtest'), false);
  for (const [index, action] of ['start', 'backtest', 'optimize'].entries()) {
    const result = await restarted.execute(cmd(action, {requestId: `local-halt-${action}`, controlSequence: index + 1, config: {...config, startDate: '2026-01-01', endDate: '2026-02-01'}}));
    assert.equal(result.ok, false);
    assert.ok(result.blockers.some(blocker => blocker.includes('本机停止')));
  }
  assert.equal(f.docker.runs.length, 0);
  const stopped = await restarted.execute(cmd('stop', {requestId: 'local-halt-stop', controlSequence: 4}));
  assert.equal(stopped.ok, true);
  assert.ok(await readFile(path.join(f.p.base, 'local-halt.json'), 'utf8'));
});

test('request id is durable across gateway restarts; exact replay does not create another container', async t => {
  const f = await fixture(t);
  const first = await f.gateway.execute(cmd('start'));
  assert.equal(first.ok, true);
  const restarted = new Gateway({ root: f.root, docker: f.docker });
  const replay = await restarted.execute(cmd('start'));
  assert.equal(replay.ok, true); assert.equal(replay.replayed, true);
  assert.equal(f.docker.runs.length, 1);
  const journal = await readFile(path.join(f.p.base, 'audit.ndjson'), 'utf8');
  assert.equal(journal.includes('requested'), true);
  assert.equal(journal.includes('config.json'), false);
});

test('request id conflicts and separately identified overlapping starts are rejected', async t => {
  const f = await fixture(t);
  await f.gateway.execute(cmd('start'));
  const conflict = await f.gateway.execute(cmd('start', { config: { ...config, stakeAmount: 100 } }));
  assert.match(conflict.message, /requestId/);
  const overlapping = await f.gateway.execute(cmd('start', { requestId: 'another-request', controlSequence: 2 }));
  assert.equal(overlapping.ok, false);
  assert.equal(f.docker.runs.length, 1);
});

test('cross-process lock serializes concurrent requests for a single account and engine', async t => {
  const f = await fixture(t);
  const other = new Gateway({ root: f.root, docker: f.docker });
  const results = await Promise.all([f.gateway.execute(cmd('start')), other.execute(cmd('start', { requestId: 'concurrent-request' }))]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(f.docker.runs.length, 1);
});

test('pending ledger blocks uncertain replay without executing anything', async t => {
  const f = await fixture(t);
  const command = validateCommand(cmd('start'));
  await writeJson(path.join(f.p.ledger, `${digest(command.requestId)}.json`), { commandHash: digest(command), status: 'pending' });
  const result = await f.gateway.execute(command);
  assert.equal(result.ok, false);
  assert.match(result.message, /不确定/);
  assert.equal(f.docker.runs.length, 0);
});

test('stop remains available after risk changes, disabled profile or global live denial', async t => {
  const f = await fixture(t);
  await f.gateway.execute(cmd('start'));
  await writeJson(f.p.deployment, { ...f.d, enabled: false });
  const stopped = await f.gateway.execute(cmd('stop', { requestId: 'stop-request-1', controlSequence: 2, config: { ...config, mode: 'live', stakeAmount: 1000 } }));
  assert.equal(stopped.ok, true);
  assert.equal([...f.docker.containers.values()][0].running, false);
});

test('durable monotonic fencing rejects delayed start after newer stop across gateway restart', async t => {
  const f = await fixture(t);
  const stop = await f.gateway.execute(cmd('stop', { requestId: 'newer-stop-request', controlSequence: 2, config: undefined }));
  assert.equal(stop.ok, true);
  const restarted = new Gateway({ root: f.root, docker: f.docker });
  const delayedStart = await restarted.execute(cmd('start', { requestId: 'delayed-start-request', controlSequence: 1 }));
  assert.equal(delayedStart.ok, false);
  assert.match(delayedStart.message, /序号已过期/);
  assert.equal(f.docker.runs.length, 0);
  const nextStart = await restarted.execute(cmd('start', { requestId: 'new-start-request', controlSequence: 3 }));
  assert.equal(nextStart.ok, true);
  assert.equal(f.docker.runs.length, 1);
});

test('research preflight accepts native backtesting without live-account/paper verification', async t => {
  const researchConfig = { ...config, mode: 'live', startDate: '2026-01-01', endDate: '2026-02-01' };
  const f = await fixture(t, { engine: 'jesse', config: researchConfig, deployment: { verifiedActions: ['backtest'], paperVerified: false, liveVerified: false, accountConfigured: false } });
  await writeJson(path.join(f.p.project, 'backtest.json'), {});
  await writeJson(path.join(f.p.project, 'candles.json'), {});
  const result = await f.gateway.execute(cmd('preflight', { engine: 'jesse', targetAction: 'backtest', config: researchConfig }));
  assert.equal(result.ok, true, result.blockers.join('; '));
  const start = await f.gateway.execute(cmd('preflight', { engine: 'jesse', config: researchConfig }));
  assert.equal(start.ok, false);
  assert.ok(start.blockers.some(s => s.includes('商业实盘插件')));
});

test('Docker argv never embeds arbitrary user source, never passes gateway token, and uses isolated mounts', async t => {
  const f = await fixture(t);
  const args = dockerArgs({ engine: 'freqtrade', action: 'start', config, deployment: f.d, p: f.p, name: 'test-bot', requestDir: '/safe/request', outputDir: '/safe/output', network: 'welink-quant' });
  assert.equal(args.includes('--privileged'), false);
  assert.equal(args.includes('--restart'), false);
  assert.ok(args.includes('--cap-drop'));
  assert.ok(args.includes('--user'));
  assert.ok(args.includes('type=bind,src=/safe/request,dst=/request,readonly'));
  assert.equal(args.includes('sh'), false);
  assert.equal(args.some(a => a.includes('QUANT_GATEWAY_TOKEN')), false);
});

test('native Freqtrade API validates whitelist from its separate endpoint before starting', async t => {
  const f = await fixture(t);
  await writeJson(path.join(f.p.project, 'api-auth.json'), { username: 'user', password: 'secret-never-return' });
  const d = { ...f.d, api: { baseUrl: 'http://native:8080' }, strategyClass: 'WelinkTrend' };
  const calls = [];
  const fetcher = async (url, opts) => {
    calls.push(new URL(url).pathname);
    const value = new URL(url).pathname.endsWith('show_config') ? { dry_run: true, stake_amount: 50, max_open_trades: 2, stoploss: -0.03, timeframe: '1h', exchange: 'binance', strategy: 'WelinkTrend' }
      : new URL(url).pathname.endsWith('whitelist') ? { method: ['StaticPairList'], whitelist: ['BTC/USDT'] } : { status: 'starting' };
    return new Response(JSON.stringify(value));
  };
  const result = await nativeCommand('freqtrade', 'start', d, f.p, config, fetcher);
  assert.equal(calls.join(','), '/api/v1/show_config,/api/v1/whitelist,/api/v1/start');
  assert.equal(JSON.stringify(result).includes('secret-never-return'), false);
  await assert.rejects(nativeCommand('freqtrade', 'start', d, f.p, { ...config, symbols: ['ETH/USDT'] }, fetcher), /不一致/);
});

test('Hummingbot task projection excludes native configuration and supports delete acknowledgement', async t => {
  const f = await fixture(t);
  await writeJson(path.join(f.p.project, 'api-auth.json'), { username: 'user', password: 'secret' });
  const d = { api: { baseUrl: 'http://native:8000' } };
  const state = await hummingbotTask(d, f.p, 'task-id', async () => new Response(JSON.stringify({ status: 'completed', config: { api_key: 'SECRET' }, result: { results: { net_pnl: 12 } } })));
  assert.deepEqual(state, { state: 'completed', metrics: { net_pnl: 12 } });
  const cancelled = await hummingbotTask(d, f.p, 'task-id', async () => new Response(JSON.stringify({ status: 'deleted', task_id: 'task-id' })), true);
  assert.equal(cancelled.state, 'cancelled');
});

test('Hummingbot unwraps real API envelopes, enforces tenant bot names and rejects unacknowledged commands', async t => {
  const f = await fixture(t);
  await writeJson(path.join(f.p.project, 'api-auth.json'), { username: 'user', password: 'secret' });
  const d = { api: { baseUrl: 'http://native:8000', botName: `${containerName(f.p, 'hummingbot')}-20260907-010101`, script: 'v2_with_controllers.py', conf: 'approved.yml' } };
  const state = await nativeStatus('hummingbot', d, f.p, async () => new Response(JSON.stringify({ status: 'success', data: { status: 'running', general_logs: ['SECRET'] } })));
  assert.equal(state.state, 'running');
  assert.equal(JSON.stringify(state).includes('SECRET'), false);
  await assert.rejects(nativeStatus('hummingbot', { api: { ...d.api, botName: 'another-users-bot' } }, f.p), /不属于/);
  await assert.rejects(nativeCommand('hummingbot', 'start', d, f.p, config, async () => new Response(JSON.stringify({ status: 'success', response: { success: false } }))), /未确认/);
});

test('stopping a Hummingbot research task persists cancellation without later querying its deleted native ID', async t => {
  let deleted = false;
  let botState = 'running';
  const fetcher = async (url, options) => {
    const route = new URL(url).pathname;
    if (route === '/backtesting/tasks/task-id') {
      if (options.method === 'DELETE') { deleted = true; return Response.json({ status: 'deleted' }); }
      assert.equal(deleted, false, 'Deleted native task must not be polled again');
      return Response.json({ status: 'running' });
    }
    if (route === '/bot-orchestration/stop-bot') { botState = 'stopped'; return Response.json({ status: 'success', response: { success: true } }); }
    return Response.json({ status: 'success', data: { status: botState } });
  };
  const f = await fixture(t, { engine: 'hummingbot', fetcher, deployment: { api: { baseUrl: 'http://native:8000' } } });
  await writeJson(path.join(f.p.project, 'api-auth.json'), { username: 'user', password: 'secret' });
  await writeJson(path.join(f.p.state, 'current-job.json'), { nativeId: 'task-id', requestId: 'old-backtest', action: 'backtest' });
  const result = await f.gateway.execute(cmd('stop', { engine: 'hummingbot' }));
  assert.equal(result.ok, true);
  assert.equal(result.runtime.job.state, 'cancelled');
  assert.equal(result.runtime.state, 'ready');
  const repeated = await f.gateway.execute(cmd('stop', { engine: 'hummingbot', requestId: 'another-stop-request', controlSequence: 2 }));
  assert.equal(repeated.ok, true);
});

test('HTTP server requires bearer auth and validated JSON; health exposes no tenant secrets', async t => {
  const f = await fixture(t);
  const token = 't'.repeat(40);
  const server = createServer({ token, gateway: f.gateway });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/health`)).status, 401);
  const health = await fetch(`${url}/health`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(health.status, 200); assert.equal((await health.json()).docker, true);
  const invalid = await fetch(`${url}/v1/command`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(cmd('shell')) });
  assert.equal(invalid.status, 400);
});
