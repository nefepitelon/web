import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { installEngine, stopLocalEngine, resumeLocalEngine, readLocalInstall, defaultConfig, checkDocker } from '../bin/install-engine.mjs';
import { ENGINE_INSTALLS } from '../local-engines/manifest.mjs';
import { paths, readJson, writeJson } from '../lib/storage.mjs';
import { approvedConfigHash, isPinnedImage } from '../lib/validation.mjs';

const userId = '11111111-2222-3333-4444-555555555555';
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'welink-engine-installer-test-'));
  t.after(async () => { assert.ok(path.basename(root).startsWith('welink-engine-installer-test-')); await rm(root, { recursive: true, force: true }); });
  const commands = [], logs = [];
  const dependencies = {
    async run(exe, args) {
      assert.equal(exe, 'docker'); commands.push(args);
      return { stdout: args[0] === 'info' ? 'linux\n' : args[0] === 'version' ? '27.5.1\n' : args[0] === 'create' ? 'a'.repeat(64) : args[0] === 'network' && args[1] === 'inspect' ? 'bridge' : '', stderr: '' };
    },
    async checkPort() {}, async fetcher() { return new Response('ok'); }, healthTimeoutMs: 5,
  };
  return { root, commands, logs, dependencies, onLog: m => logs.push(m) };
}

test('six choices install only their own stack; health never enables trading and credentials stay private', async t => {
  for (const engine of Object.keys(ENGINE_INSTALLS)) {
    await t.test(engine, async sub => {
      const f = await fixture(sub), config = defaultConfig(engine);
      const installed = await installEngine({ userId, engine, config, ...f });
      const p = paths(f.root, userId, engine);
      assert.equal(installed.status, ENGINE_INSTALLS[engine].ui ? 'ui-ready' : 'installed');
      assert.equal(installed.enabled, false); assert.deepEqual(installed.verifiedActions, []);
      const profile = await readJson(p.deployment);
      assert.equal(profile.approvedConfigHash, approvedConfigHash(config));
      for (const flag of ['enabled', 'paperVerified', 'liveVerified', 'accountConfigured', 'withdrawalsDisabled', 'ipAllowlistVerified']) assert.equal(profile[flag], false);
      assert.ok(isPinnedImage(profile.image));
      const credentials = await readJson(installed.credentialsFile);
      assert.ok(credentials.password.length >= 32);
      assert.ok(!JSON.stringify(installed).includes(credentials.password));
      assert.ok(!f.logs.join('\n').includes(credentials.password));
      assert.ok(!JSON.stringify(f.commands).includes(credentials.password));
      const compose = await readJson(path.join(p.base, 'compose.json'));
      for (const service of Object.values(compose.services)) {
        assert.ok(isPinnedImage(service.image), service.image);
        for (const port of service.ports ?? []) assert.ok(port.startsWith('127.0.0.1:'), port);
        assert.ok(!service.network_mode || service.network_mode === 'none');
      }
      const selected = f.commands.filter(args => args[0] === 'pull').flat().join(' ');
      for (const [other, spec] of Object.entries(ENGINE_INSTALLS)) if (other !== engine) assert.ok(!selected.includes(spec.image));
      assert.deepEqual(await readLocalInstall({ userId, engine, root: f.root }), installed);
      await assert.rejects(access(path.join(p.base, 'mutation.lock')));
      if (engine === 'freqtrade') {
        const native = await readJson(path.join(p.project, 'config.json'));
        assert.equal(native.dry_run, true); assert.equal(native.initial_state, 'stopped');
        assert.equal(native.stake_amount, config.stakeAmount);
        assert.deepEqual(native.exchange.pair_whitelist, config.symbols);
        assert.equal(native.api_server.password, credentials.password);
        assert.equal(compose.services.freqtrade.command[0], 'webserver');
      }
      if (engine === 'jesse') {
        assert.ok(!JSON.stringify(compose).includes('install-live'));
        const nativeRequest = await readJson(path.join(p.base, 'native/welink-request.json'));
        assert.equal(nativeRequest.action, 'backtest'); assert.deepEqual(nativeRequest.config, config);
        assert.match(await readFile(path.join(p.base, 'native/.env'), 'utf8'), /QUANT_REQUEST_FILE=\/home\/welink-request.json/);
      }
      if (engine === 'octobot') {
        const native = await readJson(path.join(p.project, 'user/config.json'));
        assert.equal(native.accepted_terms, false); assert.equal(native.trader.enabled, false);
      }
    });
  }
});

test('rejects live configuration before invoking Docker', async t => {
  const f = await fixture(t);
  await assert.rejects(installEngine({ userId, engine: 'freqtrade', config: { ...defaultConfig('freqtrade'), mode: 'live' }, ...f }), /PAPER/);
  assert.equal(f.commands.length, 0);
});

test('requires Linux Docker and rejects arbitrary engine names', async t => {
  const f = await fixture(t);
  await assert.rejects(checkDocker(async () => ({ stdout: 'windows' })), /Linux/);
  await assert.rejects(installEngine({ userId, engine: '../freqtrade', ...f }), /引擎/);
});

test('retry preserves credentials; changed config and foreign profiles cannot be overwritten', async t => {
  const f = await fixture(t), engine = 'freqtrade';
  const first = await installEngine({ userId, engine, ...f });
  const before = await readFile(first.credentialsFile, 'utf8');
  await installEngine({ userId, engine, ...f });
  assert.equal(await readFile(first.credentialsFile, 'utf8'), before);
  await assert.rejects(installEngine({ userId, engine, config: { ...defaultConfig(engine), stakeAmount: 99 }, ...f }), /配置已变化/);
  const foreignId = 'foreign';
  await writeJson(paths(f.root, foreignId, engine).deployment, { enabled: false });
  await assert.rejects(installEngine({ userId: foreignId, engine, ...f }), /不能覆盖/);
});

test('running container, task, reconciliation and mutation locks prevent installation', async t => {
  for (const blocker of ['container', 'job', 'reconciliation', 'lock']) {
    await t.test(blocker, async sub => {
      const f = await fixture(sub), engine = 'freqtrade', p = paths(f.root, userId, engine);
      if (blocker === 'container') {
        const original = f.dependencies.run;
        f.dependencies.run = (exe, args) => args[0] === 'ps' ? Promise.resolve({ stdout: `wq-${p.tenant.slice(0, 16)}-${engine}-bot` }) : original(exe, args);
      } else await writeJson(blocker === 'job' ? path.join(p.state, 'current-job.json') : path.join(p.base, blocker === 'reconciliation' ? 'reconciliation-required.json' : 'mutation.lock'), {});
      await assert.rejects(installEngine({ userId, engine, ...f }));
      assert.equal(f.commands.some(args => ['pull', 'build'].includes(args[0])), false);
      await assert.rejects(access(p.deployment));
    });
  }
});

test('stop uses only known compose stop and preserves all data even with reconciliation lock', async t => {
  const f = await fixture(t), engine = 'freqtrade';
  const first = await installEngine({ userId, engine, ...f });
  const p = paths(f.root, userId, engine);
  await writeJson(path.join(p.base, 'reconciliation-required.json'), {});
  const stopped = await stopLocalEngine({ userId, engine, ...f });
  assert.equal(stopped.status, 'stopped');
  assert.deepEqual(f.commands.at(-1).slice(-3), ['stop', '--timeout', '60']);
  assert.ok(!f.commands.flat().includes('down'));
  assert.ok(await readJson(first.credentialsFile)); assert.ok(await readJson(p.deployment));
});

test('health timeout is recorded honestly without failing or approving strategy capability', async t => {
  const f = await fixture(t);
  f.dependencies.fetcher = async () => new Response('booting', { status: 503 });
  const result = await installEngine({ userId, engine: 'freqtrade', ...f });
  assert.equal(result.status, 'installed'); assert.match(result.message, /尚未通过/);
  assert.equal(result.enabled, false);
});

test('explicit resume keeps verified research profile, credentials and halt fence unchanged', async t => {
  const f = await fixture(t), engine = 'freqtrade';
  const installed = await installEngine({ userId, engine, ...f });
  await stopLocalEngine({ userId, engine, ...f });
  const p = paths(f.root, userId, engine), profile = await readJson(p.deployment);
  profile.enabled = true; profile.verifiedActions = ['backtest', 'stop'];
  await writeJson(p.deployment, profile);
  await writeJson(path.join(p.base, 'local-halt.json'), { reason: 'local-stop' });
  const before = await readFile(installed.credentialsFile, 'utf8');
  const resumed = await resumeLocalEngine({ userId, engine, ...f });
  assert.equal(resumed.status, 'ui-ready');
  assert.deepEqual(await readJson(p.deployment), profile);
  assert.equal(await readFile(installed.credentialsFile, 'utf8'), before);
  assert.equal((await readJson(path.join(p.base, 'local-halt.json'))).reason, 'local-stop');
  assert.deepEqual(f.commands.at(-1).slice(-5), ['up', '--detach', '--no-build', '--pull', 'never']);
  await assert.rejects(resumeLocalEngine({ userId, engine, config: { ...defaultConfig(engine), stakeAmount: 99 }, ...f }), /PAPER/);
});

test('stop targets only observed managed containers with exact tenant, engine and safe name; verifies exit before Compose', async t => {
  const f = await fixture(t), engine = 'freqtrade';
  await installEngine({ userId, engine, ...f });
  const p = paths(f.root, userId, engine), prefix = `wq-${p.tenant.slice(0, 16)}-${engine}-`;
  const entries = [
    { id: '1'.repeat(64), name: `${prefix}bot` },
    { id: '2'.repeat(64), name: `${prefix}abcdef123456` },
    { id: '3'.repeat(64), name: `${prefix}verify-abcd1234-abc` },
    { id: '4'.repeat(64), name: `${prefix}foreign`, tenant: 'another-tenant' },
    { id: '5'.repeat(64), name: `${prefix}other-engine`, engine: 'jesse' },
    { id: '6'.repeat(64), name: `${prefix}unmanaged`, managed: 'false' },
    { id: '7'.repeat(64), name: 'unrelated-local-server' },
    { id: '8'.repeat(64), name: `${prefix}already-stopped`, running: false },
    { id: '9'.repeat(64), name: `${prefix}name;injection` },
    { id: 'a'.repeat(64), name: `${prefix}renamed`, inspectedName: 'other-container' },
  ];
  const original = f.dependencies.run;
  f.dependencies.run = async (exe, args) => {
    if (args[0] === 'ps') {
      f.commands.push(args);
      for (const label of ['label=welink.quant.managed=true', `label=welink.quant.tenant=${p.tenant}`, `label=welink.quant.engine=${engine}`]) assert.ok(args.includes(label));
      return { stdout: entries.map(v => `${v.id.slice(0, 12)}\t${v.name}`).join('\n') };
    }
    if (args[0] === 'container' && args[1] === 'inspect') {
      f.commands.push(args);
      const entry = entries.find(v => v.id.startsWith(args.at(-1)));
      assert.ok(entry);
      if (args.includes('{{.State.Running}}')) return { stdout: 'false' };
      return { stdout: JSON.stringify({ Id: entry.id, Name: `/${entry.inspectedName ?? entry.name}`, State: { Running: entry.running ?? true }, Config: { Labels: { 'welink.quant.managed': entry.managed ?? 'true', 'welink.quant.tenant': entry.tenant ?? p.tenant, 'welink.quant.engine': entry.engine ?? engine } } }) };
    }
    return original(exe, args);
  };
  const output = await stopLocalEngine({ userId, engine, ...f });
  assert.equal(output.status, 'stopped'); assert.match(output.message, /3 个/);
  assert.deepEqual(f.commands.filter(a => a[0] === 'stop').map(a => a.at(-1)), entries.slice(0, 3).map(v => v.id));
  assert.deepEqual(f.commands.at(-1).slice(-3), ['stop', '--timeout', '60']);
  assert.equal((await readJson(path.join(p.base, 'local-halt.json'))).reason, 'local-stop');
  assert.equal(f.commands.some(a => a.includes('rm') || a.includes('down')), false);
});

test('stop rejects unknown installations before touching Docker and explains native Hummingbot scope', async t => {
  const f = await fixture(t);
  await assert.rejects(stopLocalEngine({ userId, engine: 'freqtrade', ...f }), /没有本安装器/);
  assert.equal(f.commands.length, 0);
  await installEngine({ userId, engine: 'hummingbot', ...f });
  const stopped = await stopLocalEngine({ userId, engine: 'hummingbot', ...f });
  assert.match(stopped.message, /Hummingbot 原版面板另建的机器人/);
});

test('concurrent mutation prevents false stop completion but preserves the durable halt', async t => {
  const f = await fixture(t), engine = 'freqtrade';
  await installEngine({ userId, engine, ...f });
  const p = paths(f.root, userId, engine);
  await writeJson(path.join(p.base, 'mutation.lock'), { operation: 'pending-create' });
  const before = f.commands.length;
  await assert.rejects(stopLocalEngine({ userId, engine, ...f }), /已有运行操作/);
  assert.equal(f.commands.length, before);
  assert.equal((await readJson(path.join(p.base, 'local-halt.json'))).reason, 'local-stop');
  assert.equal((await readJson(path.join(p.base, 'mutation.lock'))).operation, 'pending-create');
  assert.notEqual((await readLocalInstall({ userId, engine, root: f.root })).status, 'stopped');
});

test('OctoBot resume rejects native live mode even when cloud configuration remains paper', async t => {
  const f = await fixture(t), engine = 'octobot';
  await installEngine({ userId, engine, ...f });
  await stopLocalEngine({ userId, engine, ...f });
  const p = paths(f.root, userId, engine), file = path.join(p.project, 'user/config.json');
  const native = await readJson(file);
  native.trader.enabled = true; native['trader-simulator'].enabled = false;
  await writeJson(file, native);
  const before = f.commands.length;
  await assert.rejects(resumeLocalEngine({ userId, engine, ...f }), /不能自动恢复实盘/);
  assert.equal(f.commands.slice(before).some(args => args.includes('up')), false);
  assert.ok(await readJson(path.join(p.base, 'local-halt.json')));
});
