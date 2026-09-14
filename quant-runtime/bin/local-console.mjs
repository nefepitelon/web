import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, chmod, realpath } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PullWorker } from './pull-worker.mjs';
import { Gateway } from '../lib/gateway.mjs';
import { ENGINES, validateConfig, approvedConfigHash } from '../lib/validation.mjs';
import { paths, readJson, writeJson, assertContained } from '../lib/storage.mjs';

const exec = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const trustedOrigins = new Set(['https://ai.welinkbtc.xyz', 'https://www.welinkbtc-onchainmain.xyz']);
const nativePorts = new Set([8791, 8793, 8794, 8795, 8796]);
const names = {freqtrade: 'Freqtrade · FreqUI', nautilus: 'NautilusTrader · SDK', hummingbot: 'Hummingbot · Dashboard', lean: 'QuantConnect LEAN · CLI', jesse: 'Jesse · Dashboard', octobot: 'OctoBot · Web UI'};

export function validatePairing(value, {allowTestOrigin = false} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请粘贴网站生成的完整设备配对 JSON。');
  if (Object.keys(value).some(key => !['schemaVersion', 'baseUrl', 'workerId', 'token', 'userId'].includes(key)) || value.schemaVersion !== 1) throw new Error('配对信息版本无效，请从网站重新复制。');
  let url;
  try { url = new URL(value.baseUrl); } catch { throw new Error('配对网站地址无效。'); }
  const isTest = allowTestOrigin && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((!trustedOrigins.has(url.origin) && !isTest) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('仅允许 WELINKBTC 的已知 HTTPS 网站，未保存或发送设备凭据。');
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(value.workerId || '') || typeof value.token !== 'string' || value.token.length < 32 || value.token.length > 4096 || /\s/.test(value.token)) throw new Error('设备编号或设备令牌格式无效。');
  if (typeof value.userId !== 'string' || !/^[A-Za-z0-9_-]{8,160}$/.test(value.userId)) throw new Error('配对信息必须包含网站账户 userId，请从网站重新复制。');
  return {schemaVersion: 1, baseUrl: url.origin, workerId: value.workerId, token: value.token, userId: value.userId};
}

function nativeUrl(value) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && nativePorts.has(Number(url.port)) && !url.username && !url.password && !url.search && !url.hash ? url.href : null; } catch { return null; }
}
async function command(binary, args) { return (await exec(binary, args, {windowsHide: true, shell: false, timeout: 10000, maxBuffer: 64000})).stdout.trim(); }
export async function openConsoleBrowser({enabled = process.env.QUANT_OPEN_BROWSER === 'true', platform = process.platform, runner = exec} = {}) {
  if (!enabled || platform !== 'win32') return false;
  await runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Start-Process 'http://127.0.0.1:8790'"], {windowsHide: true, shell: false, timeout: 10000, maxBuffer: 16000});
  return true;
}

export function createLocalConsole({root = process.env.QUANT_RUNTIME_ROOT || path.join(os.homedir(), '.welink-quant'), port = 8790, workerFactory = options => new PullWorker(options), commandRunner = command, installer = null, verifier = null} = {}) {
  const stateRoot = path.resolve(root);
  const deviceFile = path.join(stateRoot, 'settings', 'device.json');
  const csrf = randomBytes(32).toString('hex'), session = randomBytes(32).toString('hex');
  const state = {connection: 'disconnected', lastSyncAt: null, lastError: null, liveEnabled: false, diagnostics: null, operation: null, assignments: [], logs: []};
  let pairing = null, worker = null, workerPromise = null, diagnosticPromise = null, installPromise = null, mutationBusy = false;
  const allowTestOrigin = process.env.QUANT_LOCAL_CONSOLE_TEST === 'true';
  const redact = value => {
    let text = String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
    if (pairing?.token) text = text.replaceAll(pairing.token, '[已隐藏]');
    return text.replace(/(bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[已隐藏]').replace(/((?:password|passwd|token|secret|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;}]+/gi, '$1[已隐藏]').slice(0, 1500);
  };
  function log(message, level = 'info') { state.logs.push({at: new Date().toISOString(), level, message: redact(message)}); if (state.logs.length > 200) state.logs.splice(0, state.logs.length - 200); }
  async function loadDevice() {
    try { const saved = await readJson(deviceFile); if (saved) pairing = validatePairing(saved, {allowTestOrigin}); }
    catch { log('本机配对文件无效；请重新配对。', 'error'); }
  }
  const initialized = loadDevice();
  async function diagnostics() {
    if (diagnosticPromise) return diagnosticPromise;
    diagnosticPromise = (async () => {
      const result = {checkedAt: new Date().toISOString(), node: process.version, platform: process.platform, dockerInstalled: false, dockerReady: false, dockerVersion: null, dockerOs: null, wslAvailable: null};
      try { result.dockerVersion = redact(await commandRunner('docker', ['--version'])); result.dockerInstalled = true; } catch {}
      try { const info = JSON.parse(await commandRunner('docker', ['info', '--format', '{{json .}}'])); result.dockerOs = info.OSType === 'linux' ? 'linux' : 'windows'; result.dockerReady = info.OSType === 'linux'; } catch {}
      if (process.platform === 'win32') { try { await commandRunner('wsl.exe', ['--status']); result.wslAvailable = true; } catch { result.wslAvailable = false; } }
      state.diagnostics = result; return result;
    })().finally(() => { diagnosticPromise = null; });
    return diagnosticPromise;
  }
  function assignments(values) {
    return (Array.isArray(values) ? values : []).filter(a => a?.userId === pairing?.userId && ENGINES.includes(a.engine) && Number.isSafeInteger(a.revision) && a.revision > 0).flatMap(a => {
      try { const config = validateConfig(a.config); if (approvedConfigHash(config) !== a.configHash) return []; return [{engine: a.engine, userId: a.userId, revision: a.revision, configHash: a.configHash, config}]; } catch { return []; }
    });
  }
  async function connect() {
    if (!pairing) throw new Error('请先配对本站设备。');
    if (installPromise) throw new Error('本机安装、停止或验证任务仍在执行，完成后再连接网站。');
    if (worker || workerPromise) throw new Error('连接已启动或仍在结束上一项任务。');
    state.connection = 'connecting'; state.lastError = null;
    const candidate = workerFactory({...pairing, journalRoot: stateRoot, gateway: new Gateway({root: stateRoot, allowLive: state.liveEnabled}), allowLive: state.liveEnabled});
    const originalApi = candidate.api.bind(candidate);
    candidate.api = async (...args) => {
      try { const result = await originalApi(...args); if (worker === candidate && state.connection !== 'disconnecting') { state.connection = 'connected'; state.lastSyncAt = new Date().toISOString(); state.lastError = null; } return result; }
      catch (error) { if (worker === candidate && state.connection !== 'disconnecting') { state.connection = 'reconnecting'; state.lastError = '无法同步网站；请检查网络、设备是否被撤销以及网站配对状态。'; } throw error; }
    };
    const originalTick = candidate.tick.bind(candidate);
    candidate.tick = async () => { await originalTick(); state.assignments = assignments(candidate.assignments); };
    worker = candidate;
    log(`已开启设备连接；仅拉取此设备授权账户的指令。实盘执行${state.liveEnabled ? '已在本次会话解锁，仍须网站及策略验证' : '当前关闭'}。`);
    workerPromise = candidate.run().catch(() => { state.lastError = '本机执行器停止，请核对设备连接。'; log(state.lastError, 'error'); }).finally(() => { worker = null; workerPromise = null; state.connection = 'disconnected'; log('设备连接已结束。'); });
  }
  function disconnect() {
    if (worker) { state.connection = 'disconnecting'; worker.stop(); log('停止接收新指令；已经领取的任务仍需完成或对账。断开网站连接不会自动停止已运行的引擎。'); }
  }
  async function listEngines() {
    return Promise.all(ENGINES.map(async engine => {
      let local = null, halted = false;
      if (pairing) { try { const base = paths(stateRoot, pairing.userId, engine).base; local = await readJson(path.join(base, 'local-install.json')); halted = Boolean(await readJson(path.join(base, 'local-halt.json'))); } catch {} }
      const assigned = state.assignments.find(a => a.engine === engine);
      return {id: engine, name: names[engine], assigned: Boolean(assigned), revision: assigned?.revision ?? null, mode: assigned?.config.mode ?? null, configName: assigned?.config.name ?? null, halted, installed: ['installed', 'ui-ready', 'stopped'].includes(local?.status), status: typeof local?.status === 'string' ? redact(local.status) : 'not-installed', uiUrl: local?.status === 'ui-ready' ? nativeUrl(local?.uiUrl) : null, installedAt: local?.installedAt ?? local?.updatedAt ?? null, message: typeof local?.message === 'string' ? redact(local.message) : null};
    }));
  }
  async function snapshot() {
    return {ok: true, version: '1.0.0', paired: Boolean(pairing), device: pairing ? {baseUrl: pairing.baseUrl, workerId: pairing.workerId, userId: pairing.userId} : null, connection: state.connection, lastSyncAt: state.lastSyncAt, lastError: state.lastError, liveEnabled: state.liveEnabled, diagnostics: state.diagnostics, operation: state.operation, engines: await listEngines(), logs: state.logs.slice(-100)};
  }
  function invokeInstaller(args, onLog) {
    if (installer) return installer(args, onLog);
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(packageRoot, 'bin', 'install-engine.mjs'), ...args], {cwd: packageRoot, env: {...process.env, QUANT_RUNTIME_ROOT: stateRoot}, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe']});
      let output = '', errorLines = '';
      child.stdout.on('data', bytes => { output += bytes.toString(); if (output.length > 1024 * 1024) { child.kill(); reject(new Error('安装结果超过大小限制。')); } });
      child.stderr.on('data', bytes => { errorLines += bytes.toString(); const lines = errorLines.split(/\r?\n/); errorLines = lines.pop().slice(-1500); lines.slice(-20).forEach(onLog); });
      child.on('error', () => reject(new Error('无法启动本机引擎安装程序。')));
      child.on('close', code => { if (errorLines) onLog(errorLines); if (code !== 0) return reject(new Error('安装程序未完成，请查看本机日志与 Docker 状态。')); try { resolve(JSON.parse(output.trim())); } catch { reject(new Error('安装程序未返回可验证的结果。')); } });
    });
  }
  async function install(engine) {
    if (!ENGINES.includes(engine)) throw new Error('不支持的引擎。');
    if (installPromise) throw new Error('已有引擎正在安装，请等待当前任务完成。');
    if (!pairing || state.connection !== 'connected') throw new Error('请先连接网站并同步已保存的配置。');
    const assignment = state.assignments.find(a => a.engine === engine);
    if (!assignment) throw new Error('请先在网站为此引擎保存配置，再等待本机同步。');
    if (assignment.config.mode !== 'paper') throw new Error('首次安装需要网站保存的 PAPER 配置。请先在网站切换到 PAPER 并保存；本机不会擅自修改实盘配置。');
    if (!state.diagnostics?.dockerReady) throw new Error('请先启动 Docker Desktop，切换 Linux 容器，并重新检查环境。');
    const configFile = path.join(stateRoot, 'settings', `install-${engine}.json`);
    await writeJson(configFile, assignment.config);
    state.operation = {engine, status: 'running', startedAt: new Date().toISOString(), message: '正在安装原生引擎及其可用界面。'};
    log(`${names[engine]}：开始安装锁定版本。`);
    installPromise = invokeInstaller(['--engine', engine, '--root', stateRoot, '--user-id', pairing.userId, '--config', configFile], value => log(value)).then(result => {
      if (result?.ok !== true || result.engine !== engine) throw new Error('安装结果校验失败。');
      state.operation = {...state.operation, status: 'completed', completedAt: new Date().toISOString(), message: redact(result.message || '安装完成。策略与交易权限仍须单独验证。'), uiUrl: nativeUrl(result.uiUrl), credentialsFile: typeof result.credentialsFile === 'string' ? redact(result.credentialsFile) : null};
      log(`${names[engine]}：${state.operation.message}`);
    }).catch(error => { state.operation = {...state.operation, status: 'failed', message: redact(error.message)}; log(state.operation.message, 'error'); }).finally(() => { installPromise = null; });
  }
  async function stopEngine(engine, confirmation) {
    if (!ENGINES.includes(engine) || confirmation !== `STOP ${engine}`) throw new Error('停止原生引擎需要明确确认。');
    if (!pairing) throw new Error('尚无本机账户配对。');
    if (installPromise) throw new Error('本机当前安装或停止任务尚未结束。');
    // Stop remains available after cloud disconnection/revocation. The helper
    // only addresses its recorded local compose project and never removes data.
    const assignment = state.assignments.find(a => a.engine === engine);
    await writeJson(path.join(paths(stateRoot, pairing.userId, engine).base, 'local-halt.json'), {schemaVersion: 1, at: new Date().toISOString(), reason: 'local-stop', configHash: assignment?.configHash ?? null});
    state.operation = {engine, status: 'running', startedAt: new Date().toISOString(), message: '已持久锁定新启动与研究指令，正在结束设备连接并停止本机服务。'};
    log(`${names[engine]}：用户请求停止本机原生服务。`);
    disconnect();
    installPromise = (async () => { if (workerPromise) await workerPromise; return invokeInstaller(['--engine', engine, '--root', stateRoot, '--user-id', pairing.userId, '--stop', 'true'], value => log(value)); })().then(result => {
      if (result?.ok !== true || result.engine !== engine || result.status !== 'stopped') throw new Error('停止结果尚未确认，请核对本机 Docker 容器。');
      state.operation = {...state.operation, status: 'completed', completedAt: new Date().toISOString(), message: redact(result.message || '本机原生服务已停止；交易所未成交订单和持仓需要单独核对。')}; log(state.operation.message);
    }).catch(error => { state.operation = {...state.operation, status: 'failed', message: redact(error.message)}; log(state.operation.message, 'error'); }).finally(() => { installPromise = null; });
  }
  async function verifyEngine(engine, resume, confirmation) {
    if (!ENGINES.includes(engine) || typeof resume !== 'boolean' || confirmation !== `${resume ? 'RESUME' : 'VERIFY'} ${engine}`) throw new Error('研究验证或恢复缺少明确确认。');
    if (!pairing || installPromise) throw new Error('请先配对设备并等待当前本机任务完成。');
    const assignment = state.assignments.find(a => a.engine === engine);
    if (!assignment) throw new Error('请先连接网站同步此引擎的当前配置。');
    if (assignment.config.mode !== 'paper') throw new Error('本次操作只验证 PAPER 配置的原生研究能力，请先在网站保存 PAPER 配置。');
    const userId = pairing.userId;
    state.operation = {engine, status: 'running', startedAt: new Date().toISOString(), message: '正在结束设备连接，随后运行原生历史回测以验证研究能力。'};
    disconnect(); log(`${names[engine]}：用户确认${resume ? '重新验证并恢复研究调度及原生界面' : '原生研究验证'}。`);
    installPromise = (async () => {
      if (workerPromise) await workerPromise;
      const verify = verifier || (await import('../lib/verify-engine.mjs')).verifyEngine;
      const result = await verify({root: stateRoot, userId, engine, config: assignment.config, actions: ['backtest'], resume, onLog: message => log(message)});
      for (const check of result?.checks || []) log(`${check.ok ? '通过' : '未通过'} · ${check.name}: ${check.message}`, check.ok ? 'info' : 'error');
      if (!result?.ok || result.engine !== engine || result.configHash !== assignment.configHash) {
        for (const blocker of result?.blockers || []) log(blocker, 'error');
        throw new Error(result?.message || '原生研究验证未通过，未恢复调度。');
      }
      let local = null;
      if (resume) {
        try {
          const resumeConfig = path.join(stateRoot, 'settings', `resume-${engine}.json`);
          await writeJson(resumeConfig, assignment.config);
          local = await invokeInstaller(['--engine', engine, '--root', stateRoot, '--user-id', userId, '--resume', 'true', '--config', resumeConfig], value => log(value));
          if (!local?.ok || local.engine !== engine) throw new Error('原生界面恢复结果未确认。');
        } catch (error) {
          await writeJson(path.join(paths(stateRoot, userId, engine).base, 'local-halt.json'), {schemaVersion: 1, at: new Date().toISOString(), reason: 'resume-ui-failed', configHash: assignment.configHash});
          throw error;
        }
      }
      state.operation = {...state.operation, status: 'completed', completedAt: new Date().toISOString(), message: redact(result.message), ...(nativeUrl(local?.uiUrl) ? {uiUrl: nativeUrl(local.uiUrl)} : {})};
      log(state.operation.message); log('此验证不授予实盘能力。网站连接保持断开，点击「连接网站」后才恢复接收指令。');
    })().catch(error => {state.operation = {...state.operation, status: 'failed', message: redact(error.message)}; log(state.operation.message, 'error');}).finally(() => {installPromise = null;});
  }
  async function resumeUi(engine, confirmation) {
    if (!['freqtrade', 'hummingbot', 'jesse', 'octobot'].includes(engine) || confirmation !== `RESUME UI ${engine}`) throw new Error('仅恢复原版界面需要输入 RESUME UI 加引擎标识。');
    if (!pairing || installPromise) throw new Error('请先配对并等待当前本机任务完成。');
    const assignment = state.assignments.find(a => a.engine === engine);
    if (!assignment || assignment.config.mode !== 'paper') throw new Error('请先连接网站，同步此引擎的当前 PAPER 配置。');
    const userId = pairing.userId;
    const haltFile = path.join(paths(stateRoot, userId, engine).base, 'local-halt.json');
    // UI recovery must work before historical data exists. It never calls the
    // research verifier or clears the durable halt that blocks cloud execution.
    if (!await readJson(haltFile)) await writeJson(haltFile, {schemaVersion: 1, at: new Date().toISOString(), reason: 'ui-only-resume', configHash: assignment.configHash});
    state.operation = {engine, status: 'running', startedAt: new Date().toISOString(), message: '正在结束设备连接，仅恢复本机原版界面；保留停机锁。'};
    disconnect(); log(`${names[engine]}：用户确认仅恢复原版界面，不恢复云端研究或交易调度。`);
    installPromise = (async () => {
      if (workerPromise) await workerPromise;
      const configFile = path.join(stateRoot, 'settings', `resume-ui-${engine}.json`);
      await writeJson(configFile, assignment.config);
      const result = await invokeInstaller(['--engine', engine, '--root', stateRoot, '--user-id', userId, '--resume', 'true', '--config', configFile], value => log(value));
      if (!result?.ok || result.engine !== engine || result.status !== 'ui-ready') throw new Error('原版界面恢复结果未确认；本地停机锁仍保留。');
      state.operation = {...state.operation, status: 'completed', completedAt: new Date().toISOString(), message: '原版界面已恢复。本地停机锁保留，网站连接保持断开，云端研究与交易调度未恢复。', uiUrl: nativeUrl(result.uiUrl)};
      log(state.operation.message);
    })().catch(error => {state.operation = {...state.operation, status: 'failed', message: redact(error.message)}; log(state.operation.message, 'error');}).finally(() => {installPromise = null;});
  }
  async function body(request) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) throw Object.assign(new Error('只接受 JSON 请求。'), {status: 415});
    let bytes = 0, text = '';
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 32768) throw Object.assign(new Error('请求超过 32 KB。'), {status: 413}); text += chunk; }
    try { return JSON.parse(text); } catch { throw new Error('请求 JSON 无效。'); }
  }
  async function credentials(engine, confirmation) {
    if (!pairing || !['freqtrade', 'hummingbot', 'jesse'].includes(engine) || confirmation !== `VIEW ${engine}`) throw new Error('此引擎没有可查看的本机登录信息，或缺少查看确认。');
    const base = paths(stateRoot, pairing.userId, engine).base;
    const target = await realpath(path.join(base, 'native', 'credentials.json'));
    await assertContained(stateRoot, target);
    const relative = path.relative(await realpath(base), target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('登录信息文件超出此账户的引擎目录。');
    const bytes = await readFile(target);
    if (bytes.length > 32768) throw new Error('本机登录信息文件异常。');
    let data; try { data = JSON.parse(bytes.toString('utf8')); } catch { throw new Error('本机登录信息文件无效。'); }
    if (typeof data.password !== 'string' || !data.password || data.password.length > 4096 || /[\u0000-\u001f]/.test(data.password)) throw new Error('本机密码格式无效。');
    const username = engine === 'jesse' ? null : typeof data.username === 'string' && data.username.length < 100 ? data.username : 'welink';
    // Never return JWT, websocket, database, broker or exchange credentials.
    return {ok: true, engine, username, password: data.password, purpose: engine === 'hummingbot' ? '仅用于本机 Hummingbot API（127.0.0.1:8794）登录；Dashboard 本身无此登录步骤。' : '仅用于本机原版应用登录。'};
  }
  const server = http.createServer(async (request, response) => {
    const serverPort = server.address()?.port ?? port;
    const acceptedHosts = new Set([`127.0.0.1:${serverPort}`, `localhost:${serverPort}`]);
    const host = request.headers.host;
    const headers = {'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
    const json = (status, value) => { response.writeHead(status, {...headers, 'content-type': 'application/json; charset=utf-8'}); response.end(JSON.stringify(value)); };
    try {
      if (!acceptedHosts.has(host) || !['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) return json(403, {ok: false, message: '只允许本机回环连接。'});
      const url = new URL(request.url, `http://${host}`);
      if (url.origin !== `http://${host}`) return json(403, {ok: false, message: '请求地址无效。'});
      const userTopLevelNavigation = request.method === 'GET' && ['/', '/index.html'].includes(url.pathname) && request.headers['sec-fetch-mode'] === 'navigate' && request.headers['sec-fetch-dest'] === 'document' && request.headers['sec-fetch-user'] === '?1';
      if (request.headers['sec-fetch-site'] === 'cross-site' && !userTopLevelNavigation) return json(403, {ok: false, message: '拒绝跨站访问。'});
      await initialized;
      if (request.method === 'GET' && ['/', '/index.html'].includes(url.pathname)) {
        const html = (await readFile(path.join(packageRoot, 'local-console', 'index.html'), 'utf8')).replace('__LOCAL_CSRF__', csrf);
        response.writeHead(200, {...headers, 'content-type': 'text/html; charset=utf-8', 'set-cookie': `welink_local_session=${session}; HttpOnly; SameSite=Strict; Path=/`}); return response.end(html);
      }
      if (request.method === 'GET' && ['/app.js', '/style.css'].includes(url.pathname)) {
        const type = url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css';
        response.writeHead(200, {...headers, 'content-type': `${type}; charset=utf-8`}); return response.end(await readFile(path.join(packageRoot, 'local-console', url.pathname.slice(1))));
      }
      if (!request.headers.cookie?.split(';').some(value => value.trim() === `welink_local_session=${session}`)) return json(401, {ok: false, message: '请在本机浏览器打开控制台。'});
      if (request.method === 'GET' && url.pathname === '/api/status') return json(200, await snapshot());
      if (request.method !== 'POST' || !url.pathname.startsWith('/api/')) return json(404, {ok: false, message: '接口不存在。'});
      if (request.headers.origin !== `http://${host}` || request.headers['x-local-csrf'] !== csrf) return json(403, {ok: false, message: '本机请求校验失败，请刷新控制台。'});
      const data = await body(request);
      if (mutationBusy) return json(409, {ok: false, message: '另一项本机操作正在提交，请稍后重试。'});
      mutationBusy = true;
      try {
      if (url.pathname === '/api/pair') {
        if (workerPromise || installPromise) throw new Error('请先断开设备并等待当前任务完成，再更换配对。');
        const candidate = validatePairing(data, {allowTestOrigin});
        await mkdir(path.dirname(deviceFile), {recursive: true, mode: 0o700}); await writeJson(deviceFile, candidate); await chmod(deviceFile, 0o600);
        pairing = candidate; state.assignments = []; state.lastSyncAt = null; state.lastError = null; state.liveEnabled = false; log('设备配对已保存到本机受保护目录；令牌不会返回浏览器。');
      } else if (url.pathname === '/api/connect') await connect();
      else if (url.pathname === '/api/disconnect') disconnect();
      else if (url.pathname === '/api/diagnostics') await diagnostics();
      else if (url.pathname === '/api/install') await install(data.engine);
      else if (url.pathname === '/api/stop-engine') await stopEngine(data.engine, data.confirmation);
      else if (url.pathname === '/api/credentials') return json(200, await credentials(data.engine, data.confirmation));
      else if (url.pathname === '/api/verify-engine') await verifyEngine(data.engine, data.resume === true, data.confirmation);
      else if (url.pathname === '/api/resume-ui') await resumeUi(data.engine, data.confirmation);
      else if (url.pathname === '/api/live') {
        if (typeof data.enabled !== 'boolean') throw new Error('实盘解锁设置无效。');
        if (data.enabled && (!pairing || data.confirmation !== 'ENABLE LOCAL LIVE')) throw new Error('解锁本机实盘执行须先配对并输入 ENABLE LOCAL LIVE。');
        state.liveEnabled = data.enabled;
        if (worker) { worker.allowLive = data.enabled; worker.gateway.allowLive = data.enabled; }
        log(data.enabled ? '用户解锁了本次会话的本机实盘执行。此操作不会启动交易；网站权限、配置及原生验证仍须通过。' : '本机实盘执行已锁定。已经提交的操作可能需要对账；锁定不会自动平仓。');
      }
      else return json(404, {ok: false, message: '接口不存在。'});
      return json(200, await snapshot());
      } finally { mutationBusy = false; }
    } catch (error) { return json(error.status || 400, {ok: false, message: redact(error.message)}); }
  });
  return {server, stateRoot, initialized, snapshot, diagnostics, async close() { disconnect(); await new Promise(resolve => server.close(resolve)); }, listen() { return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server.address())); }); }};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const consoleApp = createLocalConsole();
  await consoleApp.listen();
  console.log('WELINKBTC 本机控制台：http://127.0.0.1:8790');
  openConsoleBrowser().catch(() => console.error('浏览器未能自动打开，请访问 http://127.0.0.1:8790'));
  consoleApp.diagnostics().catch(() => {});
  process.on('SIGINT', () => consoleApp.close()); process.on('SIGTERM', () => consoleApp.close());
}
