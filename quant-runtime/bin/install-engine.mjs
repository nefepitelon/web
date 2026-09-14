/** Explicit, per-account Docker Desktop installation. This never approves trading. */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, cp, access, open, unlink, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { approvedConfigHash, validateConfig, ENGINES } from '../lib/validation.mjs';
import { assertContained, paths, readJson as readRawJson, writeJson } from '../lib/storage.mjs';
import { ENGINE_INSTALLS } from '../local-engines/manifest.mjs';

const runtimeDir = fileURLToPath(new URL('../', import.meta.url));
const installerVersion = 1;
async function readJson(file) {
  try { return await readRawJson(file); }
  catch { throw new Error('本地 JSON 配置无法读取或解析，请在本机检查文件完整性。'); }
}
const seeds = {
  freqtrade: [['config.example.json', 'config.json'], ['strategies', 'strategies']],
  nautilus: [['paper.example.json', 'paper.json'], ['backtest.example.json', 'backtest.json']],
  hummingbot: [], lean: [['algorithm.py', 'algorithm.py'], ['backtest.example.json', 'backtest.json']],
  jesse: [['strategies', 'strategies'], ['backtest.example.json', 'backtest.json']], octobot: [],
};

export function defaultConfig(engine) {
  if (!ENGINES.includes(engine)) throw new Error('请选择支持的引擎。');
  return { name: `${engine} 本地研究`, mode: 'paper', exchange: 'binance', symbols: ['BTC/USDT'], timeframe: '1h', strategy: engine === 'freqtrade' || engine === 'jesse' ? 'WelinkTrend' : engine === 'nautilus' ? 'EMACrossResearch' : engine === 'lean' ? 'WelinkLeanAlgorithm' : engine === 'hummingbot' ? 'pmm_simple' : 'DailyTradingMode', stakeAmount: 50, maxOpenTrades: 2, stopLossPct: 3 };
}

function parameters({ userId, engine, root }) {
  if (typeof userId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(userId)) throw new Error('缺少有效的账户 ID。');
  if (!ENGINES.includes(engine)) throw new Error('请选择支持的引擎。');
  if (typeof root !== 'string' || !root.trim() || !path.isAbsolute(root)) throw new Error('本地状态目录必须是绝对路径。');
  return paths(root, userId, engine);
}

export function runCommand(executable, args, { cwd, timeout = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('本地安装步骤超时；请检查 Docker Desktop 后重试。')); }, timeout);
    child.stdout.on('data', data => { if (stdout.length < 128_000) stdout += data.toString(); });
    child.stderr.on('data', data => { if (stderr.length < 128_000) stderr += data.toString(); });
    child.once('error', () => { clearTimeout(timer); reject(new Error('无法运行 Docker。请安装并启动 Docker Desktop，启用 WSL 2 与 Linux 容器。')); });
    child.once('exit', code => {
      clearTimeout(timer);
      // Docker output may include environment values. Never forward it to browser/cloud logs.
      if (code !== 0) reject(new Error(`Docker 步骤失败（退出码 ${code ?? 'unknown'}）。请在 Docker Desktop 查看对应容器的本地日志。`));
      else resolve({ stdout, stderr });
    });
  });
}

export async function checkDocker(run = runCommand) {
  const version = await run('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 30_000 });
  const info = await run('docker', ['info', '--format', '{{.OSType}}'], { timeout: 30_000 });
  if (info.stdout.trim() !== 'linux') throw new Error('需要 Docker Desktop 的 Linux 容器模式；请切换后重试。');
  await run('docker', ['compose', 'version', '--short'], { timeout: 30_000 });
  return { engine: version.stdout.trim(), osType: 'linux' };
}

async function ensureRuntimeNetwork(run) {
  const network = process.env.QUANT_DOCKER_NETWORK ?? 'welink-quant';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(network)) throw new Error('本地交易运行网络名称无效。');
  const listed = await run('docker', ['network', 'ls', '--filter', `name=^${network.replaceAll('.', '\\.')}$`, '--format', '{{.Name}}']);
  if (!listed.stdout.split(/\r?\n/).includes(network)) await run('docker', ['network', 'create', '--driver', 'bridge', network]);
  const inspected = await run('docker', ['network', 'inspect', '--format', '{{.Driver}}', network]);
  if (inspected.stdout.trim() !== 'bridge') throw new Error('本地运行网络必须使用 Docker bridge 驱动。');
  return network;
}

async function portAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`本机端口 ${port} 已被占用。请停止占用服务或选择其它端口。`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function composeArgs(p, record) {
  return ['compose', '--project-name', `welink-${p.tenant.slice(0, 12)}-${record.engine}`, '--env-file', path.join(p.base, 'native', '.compose.env'), '--file', path.join(p.base, 'compose.json')];
}

function result(record, p) {
  return { ok: record.status !== 'failed', engine: record.engine, status: record.status, uiUrl: record.uiUrl ?? null, apiUrl: record.apiUrl ?? null, credentialsFile: path.join(p.base, 'native', 'credentials.json'), profilePath: p.deployment, configHash: record.configHash, enabled: false, verifiedActions: [], message: record.message, ...(record.error ? { error: record.error } : {}) };
}

export async function readLocalInstall(options) {
  const p = parameters(options);
  const record = await readJson(path.join(p.base, 'local-install.json'));
  if (!record) return null;
  if (record.installerVersion !== installerVersion || record.engine !== options.engine || record.tenant !== p.tenant) throw new Error('安装记录不属于本账户或安装器版本。');
  return result(record, p);
}

async function withLock(p, fn, lockMutation = false) {
  await mkdir(p.base, { recursive: true, mode: 0o700 });
  const lockPath = path.join(p.base, 'install.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('该引擎正在安装或停止。异常退出后，请先确认没有安装进程，再移除本地 install.lock 重试。'); throw error; }
  let mutation;
  const mutationPath = path.join(p.base, 'mutation.lock');
  try {
    if (lockMutation) {
      try { mutation = await open(mutationPath, 'wx', 0o600); }
      catch (error) { if (error.code === 'EEXIST') throw new Error('该引擎已有运行操作或待对账操作，不能安装或覆盖配置。'); throw error; }
    }
    await lock.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    return await fn();
  } finally {
    if (mutation) { await mutation.close(); await unlink(mutationPath); }
    await lock.close(); await unlink(lockPath);
  }
}

async function copySeeds(engine, project) {
  await mkdir(project, { recursive: true, mode: 0o700 });
  for (const [from, to] of seeds[engine]) {
    await cp(path.join(runtimeDir, 'recipes', engine, from), path.join(project, to), { recursive: true, force: false, errorOnExist: true });
  }
}

async function createProfile(p, engine, config, nativeImage) {
  await copySeeds(engine, p.project);
  const spec = ENGINE_INSTALLS[engine];
  await writeJson(p.deployment, {
    schemaVersion: 1, engine, enabled: false, image: nativeImage, upstreamVersion: spec.version,
    approvedConfigHash: approvedConfigHash(config), verifiedActions: [], paperVerified: false, liveVerified: false,
    accountConfigured: false, withdrawalsDisabled: false, ipAllowlistVerified: false, envFile: false,
    strategyClass: engine === 'freqtrade' || engine === 'jesse' ? 'WelinkTrend' : undefined, memory: '2g', cpus: 2,
  });
}

async function seedNative(p, engine, config, credentials) {
  const native = path.join(p.base, 'native');
  if (engine === 'freqtrade') {
    if (config.symbols.some(s => !/^[A-Z0-9]+\/[A-Z0-9]+$/.test(s))) throw new Error('初次 FreqUI 安装仅支持现货交易对，例如 BTC/USDT；合约配置需在原版界面单独核验。');
    const quote = config.symbols[0].split('/')[1];
    if (config.symbols.some(s => s.split('/')[1] !== quote)) throw new Error('Freqtrade 初始配置的计价币必须一致。');
    const ft = await readJson(path.join(p.project, 'config.json'));
    Object.assign(ft, { dry_run: true, initial_state: 'stopped', trading_mode: 'spot', timeframe: config.timeframe, strategy: 'WelinkTrend', stake_currency: quote, stake_amount: config.stakeAmount, max_open_trades: config.maxOpenTrades, stoploss: -config.stopLossPct / 100 });
    ft.exchange = { ...ft.exchange, name: config.exchange, key: '', secret: '', pair_whitelist: config.symbols };
    ft.api_server = { enabled: true, listen_ip_address: '0.0.0.0', listen_port: 8080, verbosity: 'error', enable_openapi: true, username: 'welink', password: credentials.password, jwt_secret_key: credentials.jwtSecret, ws_token: credentials.wsToken, CORS_origins: [] };
    await writeJson(path.join(p.project, 'config.json'), ft);
  } else if (engine === 'jesse') {
    await mkdir(path.join(native, 'storage'), { recursive: true, mode: 0o700 });
    await cp(path.join(p.project, 'strategies'), path.join(native, 'strategies'), { recursive: true, errorOnExist: true, force: false });
    await writeJson(path.join(native, 'welink-request.json'), { action: 'backtest', config });
    const values = { PASSWORD: credentials.password, APP_PORT: 9000, APP_HOST: '0.0.0.0', LSP_PORT: 9001, MCP_PORT: 9002, MCP_LOG_IN_TERMINAL: 'false', POSTGRES_HOST: 'postgres', POSTGRES_NAME: 'jesse_db', POSTGRES_PORT: 5432, POSTGRES_USERNAME: 'jesse_user', POSTGRES_PASSWORD: credentials.databasePassword, REDIS_HOST: 'redis', REDIS_PORT: 6379, REDIS_PASSWORD: credentials.redisPassword, QUANT_REQUEST_FILE: '/home/welink-request.json', LICENSE_API_TOKEN: '' };
    await writePrivate(path.join(native, '.env'), envText(values));
  } else if (engine === 'hummingbot') {
    await cp(path.join(runtimeDir, 'local-engines/hummingbot/acl.conf'), path.join(native, 'acl.conf'));
    await writePrivate(path.join(native, 'auth-bootstrap.csv'), `user_id,password,is_superuser\nwelink,${credentials.brokerPassword},false\n`);
  } else if (engine === 'octobot') {
    const octo = await readJson(path.join(runtimeDir, 'local-engines/octobot/default-config.upstream.json'));
    octo.services.web['auto-open-in-web-browser'] = false;
    octo.trader = { enabled: false };
    octo['trader-simulator'] = { enabled: true };
    // Native first-run terms/onboarding remains required. Do not accept it for the user.
    await writeJson(path.join(p.project, 'user/config.json'), octo);
    for (const directory of ['logs', 'backtesting']) await mkdir(path.join(native, directory), { recursive: true, mode: 0o700 });
  }
}

const envText = values => Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
const writePrivate = (file, content) => writeFile(file, content, { mode: 0o600, flag: 'wx' });

async function seedHummingbot(p, image, run, onLog) {
  const bots = path.join(p.base, 'native', 'bots');
  try { await access(path.join(bots, '.welink-seeded')); return; } catch { /* Not copied yet. */ }
  await mkdir(bots, { recursive: true, mode: 0o700 });
  onLog('从固定的官方 API 镜像提取原始 bots 工作目录。');
  const created = await run('docker', ['create', image]);
  const id = created.stdout.trim();
  if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Docker 未返回有效的临时容器标识。');
  try { await run('docker', ['cp', `${id}:/hummingbot-api/bots/.`, bots]); }
  finally { await run('docker', ['rm', id]); }
  await writePrivate(path.join(bots, '.welink-seeded'), 'API 1.0.1 original image workspace\n');
}

async function waitForUi(url, { fetcher, onLog, timeoutMs }) {
  const start = Date.now();
  let lastNotice = 0;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
      if (response.status >= 200 && response.status < 400) { await response.body?.cancel(); return true; }
      await response.body?.cancel();
    } catch { /* New containers are still booting. */ }
    if (Date.now() - lastNotice > 30_000) { onLog('原版服务启动中，正在检查本机健康端点。'); lastNotice = Date.now(); }
    await delay(Math.min(2_000, timeoutMs));
  }
  return false;
}

/** Dependencies are injectable for offline tests. Production callers omit `dependencies`. */
export async function installEngine({ userId, engine, root, config: input, port, onLog = () => {}, dependencies = {} }) {
  const p = parameters({ userId, engine, root });
  const config = validateConfig(input === undefined ? defaultConfig(engine) : input);
  if (config.mode !== 'paper') throw new Error('初次安装只接受 PAPER 配置。请先在系统保存 PAPER 配置；本安装器不会修改或自动批准 LIVE 配置。');
  const spec = ENGINE_INSTALLS[engine];
  const uiPort = port === undefined ? spec.port : Number(port);
  if (spec.ui && (!Number.isInteger(uiPort) || uiPort < 1024 || uiPort > 65400)) throw new Error('本地端口必须在 1024–65400 之间。');
  const { run = runCommand, fetcher = fetch, checkPort = portAvailable, healthTimeoutMs = 180_000 } = dependencies;
  onLog('检查 Docker Desktop、Linux 容器与 Docker Compose。');
  const docker = await checkDocker(run);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await mkdir(p.base, { recursive: true, mode: 0o700 });
  await assertContained(root, p.base);
  return withLock(p, async () => {
    const recordFile = path.join(p.base, 'local-install.json');
    const old = await readJson(recordFile);
    const profile = await readJson(p.deployment);
    const configHash = approvedConfigHash(config);
    if (await readJson(path.join(p.base, 'reconciliation-required.json'))) throw new Error('此前操作结果需要对账，不能安装或改写配置。');
    const job = await readJson(path.join(p.state, 'current-job.json'));
    if (job && !['completed', 'failed', 'cancelled'].includes(job.terminalState)) throw new Error('该引擎已有研究任务记录；请先确认任务已结束并完成对账，再安装。');
    const botPrefix = `wq-${p.tenant.slice(0, 16)}-${engine}-`;
    const running = await run('docker', ['ps', '--format', '{{.Names}}', '--filter', `name=${botPrefix}`], { timeout: 30_000 });
    if (running.stdout.split(/\r?\n/).some(name => name.startsWith(botPrefix))) throw new Error('该引擎有容器正在运行，请先停止任务。');
    if ((old && (old.installerVersion !== installerVersion || old.engine !== engine || old.tenant !== p.tenant)) || (profile && !old)) throw new Error('已存在非本安装器创建的配置，不能覆盖。');
    if (old && (old.configHash !== configHash || old.port !== (uiPort ?? null))) throw new Error('安装配置已变化。请保留现有目录，在本地管理器审查并迁移配置后再安装；不会覆盖原凭据或交易配置。');
    if (profile && (profile.enabled || profile.liveVerified || profile.approvedConfigHash !== configHash)) throw new Error('已有运行或实盘批准配置，不能用初次安装流程覆盖。');
    if (old && !old.provisioned) throw new Error('上次安装在配置初始化时中断。请先检查本地配置与凭据；不会自动覆盖不完整的原生目录。');
    if (!old && spec.ui) { await checkPort(uiPort); if (engine === 'hummingbot') await checkPort(uiPort + 1); }
    const native = path.join(p.base, 'native');
    await mkdir(native, { recursive: true, mode: 0o700 });
    const record = { installerVersion, engine, tenant: p.tenant, port: uiPort ?? null, configHash, status: 'installing', provisioned: old?.provisioned ?? false, uiUrl: spec.ui ? `http://127.0.0.1:${uiPort}` : null, apiUrl: engine === 'hummingbot' ? `http://127.0.0.1:${uiPort + 1}` : engine === 'freqtrade' ? `http://127.0.0.1:${uiPort}/api/v1` : null, docker, installedAt: old?.installedAt ?? new Date().toISOString(), updatedAt: new Date().toISOString(), message: '正在安装所选引擎。' };
    await writeJson(recordFile, record);
    try {
      let credentials = await readJson(path.join(native, 'credentials.json'));
      if (!credentials) {
        if (old) throw new Error('原本地凭据文件缺失；不能重置正在使用的数据库或引擎密码。');
        credentials = { username: 'welink', password: randomBytes(24).toString('hex'), jwtSecret: randomBytes(32).toString('hex'), wsToken: randomBytes(32).toString('hex'), databasePassword: randomBytes(24).toString('hex'), redisPassword: randomBytes(24).toString('hex'), configPassword: randomBytes(24).toString('hex'), brokerPassword: randomBytes(24).toString('hex'), brokerAdminPassword: randomBytes(24).toString('hex'), note: 'Only this Windows account should access this file. Do not upload or share it.' };
        await writeJson(path.join(native, 'credentials.json'), credentials);
      }
      if (!profile) {
        // Runtime image must be the recipe-compatible entry point. UI and runtime are separate for Jesse.
        const image = spec.build || engine === 'hummingbot' ? spec.runtimeImage : spec.image;
        await createProfile(p, engine, config, image);
        await seedNative(p, engine, config, credentials);
        await writeJson(path.join(p.base, 'requested-config.json'), config);
      }
      let compose = await readJson(path.join(runtimeDir, 'local-engines', engine, 'compose.json'));
      const replace = value => typeof value === 'string' ? value.replaceAll('${ENGINE_IMAGE}', spec.image).replaceAll('${UI_PORT}', String(uiPort)).replaceAll('${API_PORT}', String(uiPort + 1)) : Array.isArray(value) ? value.map(replace) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)])) : value;
      compose = replace(compose);
      await writeJson(path.join(p.base, 'compose.json'), compose);
      if (!old) {
        // Bot creation has additional Docker Desktop host-network and mount prerequisites.
        // The API/Dashboard itself works on the private Compose network. No bots are started here.
        await writePrivate(path.join(native, '.compose.env'), envText({ NATIVE_PASSWORD: credentials.password, DATABASE_PASSWORD: credentials.databasePassword, REDIS_PASSWORD: credentials.redisPassword, CONFIG_PASSWORD: credentials.configPassword, BROKER_PASSWORD: credentials.brokerPassword, BROKER_ADMIN_PASSWORD: credentials.brokerAdminPassword, BOTS_HOST_PARENT: '/hummingbot-api' }));
      }
      record.provisioned = true;
      await writeJson(recordFile, record);
      onLog('检查原生任务使用的独立 Docker bridge 网络。');
      record.runtimeNetwork = await ensureRuntimeNetwork(run);
      onLog(`下载 ${engine} 固定版本的官方镜像。`);
      if (!spec.build || engine === 'jesse') await run('docker', ['pull', spec.image]);
      if (spec.build) { onLog(`构建 ${engine} 固定版本的隔离研究运行器。`); await run('docker', ['build', '--pull', '--tag', spec.runtimeImage, path.join(runtimeDir, 'recipes', engine)]); }
      if (engine === 'hummingbot') { await run('docker', ['pull', spec.runtimeImage]); await seedHummingbot(p, spec.image, run, onLog); }
      const args = composeArgs(p, record);
      await run('docker', [...args, 'config', '--quiet']);
      if (spec.ui) {
        await run('docker', [...args, 'pull']);
        onLog('启动原版界面；端口只绑定到 127.0.0.1。');
        await run('docker', [...args, 'up', '--detach']);
        const ready = await waitForUi(`${record.uiUrl}${spec.health}`, { fetcher, onLog, timeoutMs: healthTimeoutMs });
        record.status = ready ? 'ui-ready' : 'installed';
        record.message = ready ? '原版界面已响应。运行配置仍未验证，交易保持关闭。请打开原版界面完成本地数据、策略与账户设置。' : '镜像和容器已安装，原版界面尚未通过健康检查。请在 Docker Desktop 检查容器日志后重试。';
      } else {
        await run('docker', [...args, '--profile', 'sdk', 'run', '--rm', '--no-deps', 'sdk']);
        record.status = 'installed';
        record.message = '原版 SDK 镜像已安装并通过版本命令。该开源引擎没有配套原版网页交易界面；策略与数据验证后才能启用任务。';
      }
      if (engine === 'hummingbot') record.message += ' Dashboard 为官方旧版 Streamlit 界面；机器人启动还需要配置 Docker Desktop 主机网络、MQTT 与主机挂载，当前未验证。';
      if (engine === 'jesse') record.message += ' 未安装商业实盘插件；实盘与 Paper Trading 许可需单独满足。';
      if (engine === 'octobot') record.message += ' 首次打开需要在原版向导中阅读条款并配置模拟策略。';
      record.updatedAt = new Date().toISOString();
      await writeJson(recordFile, record);
      return result(record, p);
    } catch (error) {
      record.status = 'failed'; record.error = error.message; record.message = '安装未完成；已有数据和凭据已保留。';
      await writeJson(recordFile, record);
      throw error;
    }
  }, true);
}

async function stopManagedRuntimeContainers(p, engine, run, onLog) {
  const prefix = `wq-${p.tenant.slice(0, 16)}-${engine}-`;
  const listed = await run('docker', ['ps', '--filter', 'status=running', '--filter', 'label=welink.quant.managed=true', '--filter', `label=welink.quant.tenant=${p.tenant}`, '--filter', `label=welink.quant.engine=${engine}`, '--format', '{{.ID}}\t{{.Names}}'], { timeout: 30_000 });
  let stopped = 0;
  const seen = new Set();
  for (const line of listed.stdout.trim().split(/\r?\n/)) {
    const [shortId, name, extra] = line.split('\t');
    if (extra !== undefined || !/^[a-f0-9]{12,64}$/.test(shortId ?? '') || !name?.startsWith(prefix) || !/^[a-z0-9][a-z0-9_-]{0,80}$/.test(name.slice(prefix.length)) || seen.has(shortId)) continue;
    seen.add(shortId);
    // Re-check labels against the observed immutable container ID. Never trust a name alone.
    const projection = '{"Id":{{json .Id}},"Name":{{json .Name}},"State":{"Running":{{json .State.Running}}},"Config":{"Labels":{{json .Config.Labels}}}}';
    const inspected = await run('docker', ['container', 'inspect', '--format', projection, shortId], { timeout: 30_000 });
    let container;
    try { container = JSON.parse(inspected.stdout); } catch { throw new Error('无法确认任务容器归属，停止结果需要本地核对。'); }
    const labels = container?.Config?.Labels;
    if (!/^[a-f0-9]{64}$/.test(container?.Id ?? '') || !container.Id.startsWith(shortId) || container.Name !== `/${name}` || labels?.['welink.quant.managed'] !== 'true' || labels?.['welink.quant.tenant'] !== p.tenant || labels?.['welink.quant.engine'] !== engine) continue;
    if (container.State?.Running !== true) continue;
    onLog('停止本账户、本引擎的已确认运行任务容器。');
    await run('docker', ['stop', '--time', '60', container.Id], { timeout: 75_000 });
    const confirmed = await run('docker', ['container', 'inspect', '--format', '{{.State.Running}}', container.Id], { timeout: 30_000 });
    if (confirmed.stdout.trim() !== 'false') throw new Error('任务容器停止尚未确认，请保留停机锁并检查本地 Docker。');
    stopped += 1;
  }
  return stopped;
}

export async function stopLocalEngine({ userId, engine, root, onLog = () => {}, dependencies = {} }) {
  const p = parameters({ userId, engine, root });
  const record = await readJson(path.join(p.base, 'local-install.json'));
  if (!record || record.installerVersion !== installerVersion || record.engine !== engine || record.tenant !== p.tenant) throw new Error('没有本安装器创建的引擎可停止。');
  await assertContained(root, p.base);
  // Persist first: a concurrent command that already passed preflight must release
  // mutation.lock before this stop can enumerate containers. New commands see the halt.
  if (!await readJson(path.join(p.base, 'local-halt.json'))) await writeJson(path.join(p.base, 'local-halt.json'), { schemaVersion: 1, at: new Date().toISOString(), reason: 'local-stop', configHash: record.configHash });
  return withLock(p, async () => {
    const run = dependencies.run ?? runCommand;
    const stopped = await stopManagedRuntimeContainers(p, engine, run, onLog);
    onLog('停止原版界面服务，保留配置、凭据和数据库。');
    await run('docker', [...composeArgs(p, record), 'stop', '--timeout', '60']);
    record.status = 'stopped'; record.updatedAt = new Date().toISOString(); record.message = `已确认停止 ${stopped} 个本账户、本引擎的运行任务容器，并停止原版界面服务。全部本地数据、凭据和停机/对账锁已保留；停止进程不等于平仓，请核对交易所挂单和持仓。`;
    if (engine === 'hummingbot') record.message += ' Hummingbot 原版面板另建的机器人不带本系统管理标签，仍需在原版面板或 Docker Desktop 单独核对与停止。';
    await writeJson(path.join(p.base, 'local-install.json'), record);
    return result(record, p);
  }, true);
}

export async function resumeLocalEngine({ userId, engine, root, config: input, onLog = () => {}, dependencies = {} }) {
  const p = parameters({ userId, engine, root });
  await assertContained(root, p.base);
  const { run = runCommand, fetcher = fetch, healthTimeoutMs = 180_000 } = dependencies;
  await checkDocker(run);
  return withLock(p, async () => {
    const recordFile = path.join(p.base, 'local-install.json');
    const record = await readJson(recordFile), profile = await readJson(p.deployment);
    if (!record || record.installerVersion !== installerVersion || record.engine !== engine || record.tenant !== p.tenant || !record.provisioned) throw new Error('没有本安装器已完成初始化的原版界面可恢复。');
    const config = validateConfig(input ?? await readJson(path.join(p.base, 'requested-config.json')));
    if (config.mode !== 'paper' || approvedConfigHash(config) !== record.configHash || profile?.approvedConfigHash !== record.configHash) throw new Error('只允许恢复与当前批准配置一致的 PAPER 原版界面。');
    if (await readJson(path.join(p.base, 'reconciliation-required.json'))) throw new Error('此前操作结果需要对账，暂不能恢复服务。');
    const botPrefix = `wq-${p.tenant.slice(0, 16)}-${engine}-`;
    const running = await run('docker', ['ps', '--format', '{{.Names}}', '--filter', `name=${botPrefix}`], { timeout: 30_000 });
    if (running.stdout.split(/\r?\n/).some(name => name.startsWith(botPrefix))) throw new Error('该引擎仍有任务容器正在运行，请先停止任务再恢复界面。');
    const job = await readJson(path.join(p.state, 'current-job.json'));
    if (job?.nativeId && !job.terminalState) throw new Error('该引擎有待核验的原生研究任务，暂不能恢复服务。');
    if (engine === 'freqtrade') {
      const native = await readJson(path.join(p.project, 'config.json'));
      if (native?.dry_run !== true || native?.initial_state !== 'stopped') throw new Error('原生 Freqtrade 配置已离开 PAPER 停止状态，请先核对。');
    }
    if (engine === 'octobot') {
      const native = await readJson(path.join(p.project, 'user/config.json'));
      if (native?.trader?.enabled === true || native?.['trader-simulator']?.enabled !== true) throw new Error('原生 OctoBot 配置已离开模拟模式，请先核对，不能自动恢复实盘。');
    }
    // Resume never rewrites deployment flags, credentials, native config or the local-halt fence.
    const spec = ENGINE_INSTALLS[engine];
    if (spec.ui) {
      onLog('恢复已有原版界面服务，保留所有交易批准状态和停机锁。');
      await run('docker', [...composeArgs(p, record), 'up', '--detach', '--no-build', '--pull', 'never']);
      const ready = await waitForUi(`${record.uiUrl}${spec.health}`, { fetcher, onLog, timeoutMs: healthTimeoutMs });
      record.status = ready ? 'ui-ready' : 'installed';
      record.message = ready ? '原版界面已恢复；恢复界面不会启动策略或解除本地停机锁。' : '服务已请求恢复，健康检查未通过，请检查 Docker Desktop。';
    } else { record.status = 'installed'; record.message = 'SDK 镜像仍已安装，无需启动网页界面。策略任务需要独立验证和启动。'; }
    record.updatedAt = new Date().toISOString(); delete record.error;
    await writeJson(recordFile, record);
    return result(record, p);
  }, true);
}

async function main() {
  const argv = process.argv.slice(2), args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--engine', '--root', '--user-id', '--config', '--port', '--stop', '--resume'].includes(argv[i]) || !argv[i + 1] || args[argv[i]] !== undefined) throw new Error('参数无效。用法：--engine ID --root ABSOLUTE_PATH --user-id ID [--config FILE] [--port N] [--stop true | --resume true]');
    args[argv[i]] = argv[i + 1];
  }
  const options = { userId: args['--user-id'], engine: args['--engine'], root: args['--root'], onLog: message => process.stderr.write(`${message}\n`) };
  if ((args['--stop'] && args['--stop'] !== 'true') || (args['--resume'] && args['--resume'] !== 'true') || (args['--stop'] && args['--resume'])) throw new Error('停止与恢复动作必须明确选择其中一个。');
  const configured = { ...options, ...(args['--config'] ? { config: await readJson(path.resolve(args['--config'])) } : {}), ...(args['--port'] ? { port: Number(args['--port']) } : {}) };
  const output = args['--stop'] === 'true' ? await stopLocalEngine(options) : args['--resume'] === 'true' ? await resumeLocalEngine(configured) : await installEngine(configured);
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { process.stdout.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exitCode = 1; });
}
