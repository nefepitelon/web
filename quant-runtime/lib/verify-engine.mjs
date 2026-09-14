/** Explicit local research verification. Never starts a trading bot or approves live execution. */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID, createHash} from 'node:crypto';
import {mkdir, open, unlink, readFile, access} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {Docker} from './docker.mjs';
import {paths, readJson, writeJson, assertContained, audit} from './storage.mjs';
import {validateConfig, approvedConfigHash, ENGINES, isPinnedImage} from './validation.mjs';
import {containerName, dockerArgs, requiredFiles} from './adapters.mjs';
import {ENGINE_INSTALLS} from '../local-engines/manifest.mjs';

const recipeRoot = fileURLToPath(new URL('../recipes/', import.meta.url));
const BASELINES = {
  freqtrade: {files: ['strategies/WelinkTrend.py'], configFiles: ['config.json'], strategy: 'WelinkTrend', aliases: ['default', 'WelinkTrend', 'ema-trend']},
  jesse: {files: ['strategies/__init__.py', 'strategies/WelinkTrend/__init__.py'], configFiles: ['backtest.json'], strategy: 'WelinkTrend', aliases: ['default', 'WelinkTrend']},
  lean: {files: ['algorithm.py'], configFiles: ['backtest.json'], strategy: 'WelinkTrend', aliases: ['default', 'WelinkTrend', 'WelinkLeanAlgorithm']},
};
const UNSUPPORTED = {
  nautilus: 'Nautilus 示例策略尚未实现全部单笔金额、并发与止损语义；请先审阅原生策略。此自动验证器不会批准示例执行，原版 SDK 可独立研究。',
  hummingbot: 'Hummingbot 的控制器风险映射、MQTT 与 Docker Desktop 机器人挂载尚未验证；请在原版界面完成研究。当前自动验证器不启用云端执行。',
  octobot: 'OctoBot 原版 tentacles、历史数据及风险配置尚未与本站字段建立可验证映射；请在原版界面研究。当前自动验证器不启用云端执行。',
};
const digest = value => createHash('sha256').update(value).digest('hex');
async function hashFile(file) {return digest(await readFile(file));}
function acceptedImage(engine, image) {
  const spec = ENGINE_INSTALLS[engine];
  return isPinnedImage(image) && image === (spec.build ? spec.runtimeImage : spec.image);
}
function validateOptions({root, userId, engine, config, actions = ['backtest'], resume = false}) {
  if (!path.isAbsolute(root ?? '') || !/^[A-Za-z0-9_-]{1,160}$/.test(userId ?? '') || !ENGINES.includes(engine)) throw new Error('本机验证账户、引擎或状态目录无效。');
  if (!Array.isArray(actions) || actions.length !== 1 || actions[0] !== 'backtest') throw new Error('本机自动验证仅支持 backtest，不批准 paper、live 或优化动作。');
  if (typeof resume !== 'boolean') throw new Error('恢复参数必须明确为 true 或 false。');
  const validated = validateConfig(config);
  if (validated.mode !== 'paper') throw new Error('研究验证需要在网站明确保存 PAPER 配置；不会修改或批准 LIVE 配置。');
  if (!validated.startDate || !validated.endDate) throw new Error('请在网站保存明确的回测开始和结束日期后再验证。');
  return validated;
}

/** Re-check proof before each cloud command. Native UI edits invalidate the exact reviewed files. */
export async function verifyStoredEvidence(p, deployment, action, docker = new Docker()) {
  const proof = deployment.verification;
  if (!proof) return [];
  if (action === 'stop') return [];
  const blockers = [];
  if (proof.schemaVersion !== 1 || action !== 'backtest' || proof.configHash !== deployment.approvedConfigHash || !Array.isArray(proof.files) || !proof.files.length || !/^sha256:[a-f0-9]{64}$/.test(proof.imageId ?? '')) return ['原生验证证据无效或未涵盖此动作，请重新验证。'];
  try {
    const actualImage = await docker.exec(['image', 'inspect', '--format', '{{.Id}}', deployment.image]);
    if (actualImage.trim() !== proof.imageId) blockers.push('运行镜像已发生变化，请重新执行本机验证。');
  } catch {blockers.push('无法确认已验证的镜像，请检查 Docker。');}
  for (const file of proof.files) {
    if (typeof file.path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(file.path) || file.path.split('/').some(part => part === '..' || !part) || !/^[a-f0-9]{64}$/.test(file.sha256 ?? '')) {blockers.push('原生文件验证路径无效。'); continue;}
    try {
      const target = path.join(p.project, file.path);
      await assertContained(p.project, target);
      if (await hashFile(target) !== file.sha256) blockers.push(`原生文件 ${file.path} 已更改，请重新验证配置与策略。`);
    } catch {blockers.push(`原生文件 ${file.path} 不可读取，请重新验证。`);}
  }
  return blockers;
}

async function baselineFiles(p, engine, config) {
  const baseline = BASELINES[engine];
  if (!baseline.aliases.includes(config.strategy)) throw new Error('当前自动验证器仅支持本项目提供的基线策略；自定义原生策略需要单独审阅。');
  const files = [];
  for (const relative of baseline.files) {
    const source = path.join(p.project, relative);
    await assertContained(p.project, source);
    const actual = await hashFile(source);
    if (actual !== await hashFile(path.join(recipeRoot, engine, relative))) throw new Error('原生基线策略源码已修改；自动验证不会批准未经审阅的自定义代码。');
    files.push({path: relative, sha256: actual});
  }
  for (const relative of baseline.configFiles) {
    const source = path.join(p.project, relative); await assertContained(p.project, source);
    files.push({path: relative, sha256: await hashFile(source)});
  }
  if (engine === 'freqtrade') {
    const native = await readJson(path.join(p.project, 'config.json'));
    if (native?.exchange?.name !== config.exchange || native.trading_mode !== 'spot' || config.symbols.some(pair => !/^[A-Z0-9]+\/[A-Z0-9]+$/.test(pair) || pair.split('/')[1] !== native.stake_currency)) throw new Error('Freqtrade 自动研究验证需要一致的现货交易所和计价币配置。');
  }
  if (engine === 'jesse') {
    const native = await readJson(path.join(p.project, 'backtest.json'));
    if (native?.exchangeId !== config.exchange || native.config?.type !== 'spot' || config.symbols.length > config.maxOpenTrades) throw new Error('Jesse 研究基线需要现货配置且交易路线数不得超过最大同时持仓数。');
  }
  if (engine === 'lean') {
    const native = await leanConfig(p);
    const known = await readJson(path.join(recipeRoot, engine, 'backtest.example.json'));
    for (const key of Object.keys(known).filter(key => key.endsWith('-handler') || key.endsWith('-provider') || key === 'history-provider')) {
      if (JSON.stringify(native[key]) !== JSON.stringify(known[key])) throw new Error('LEAN 自动研究验证只接受内置回测处理器与本地数据提供器。');
    }
    if (config.exchange !== 'binance' || config.symbols.some(pair => !/^[A-Z0-9]+\/USDT$/.test(pair))) throw new Error('LEAN 研究基线仅支持 Binance 现货 USDT 交易对。');
  }
  return files;
}
async function leanConfig(p) {
  const native = await readJson(path.join(p.project, 'backtest.json'));
  const effective = {...native, ...(native?.environments?.[native.environment] ?? {})};
  if (effective['live-mode'] !== false) throw new Error('LEAN 验证必须使用原生 backtesting 配置。');
  return effective;
}
function resultEvidence(engine, result) {
  if (!result || result.engine !== engine || (result.action && result.action !== 'backtest')) throw new Error('原生回测未产生可确认的结果文件。');
  const metrics = Object.fromEntries(Object.entries(result.metrics ?? {}).filter(([key, value]) => /^[a-zA-Z_][a-zA-Z0-9_]{0,59}$/.test(key) && typeof value === 'number' && Number.isFinite(value)));
  if (!Object.keys(metrics).length || (engine === 'freqtrade' && (!Number.isFinite(metrics.total_trades) || !Number.isFinite(metrics.profit_total))) || (engine === 'lean' && !(metrics.observed_bars > 0))) throw new Error('原生回测没有可验证的市场数据/统计结果，未批准执行能力。');
  return metrics;
}

/** Runs an actual native historical job, with no trading action or credential environment. */
export async function verifyEngine(options) {
  const config = validateOptions(options);
  const {root, userId, engine, resume = false, onLog = () => {}, dependencies = {}} = options;
  const {docker = new Docker(), timeoutMs = 600000, pollMs = 1500} = dependencies;
  const p = paths(root, userId, engine), configHash = approvedConfigHash(config);
  const checks = [], blockers = [];
  const fail = message => ({ok: false, engine, configHash, verifiedActions: [], enabled: false, resumed: false, checks, blockers: [message], message});
  if (UNSUPPORTED[engine]) return fail(UNSUPPORTED[engine]);
  await assertContained(root, p.base);
  let installLock, mutationLock, verificationName;
  const installLockPath = path.join(p.base, 'install.lock'), mutationLockPath = path.join(p.base, 'mutation.lock');
  try {
    installLock = await open(installLockPath, 'wx', 0o600);
    mutationLock = await open(mutationLockPath, 'wx', 0o600);
    const deployment = await readJson(p.deployment);
    const installed = await readJson(path.join(p.base, 'local-install.json'));
    if (!deployment || !installed || installed.engine !== engine || installed.tenant !== p.tenant || installed.installerVersion !== 1) return fail('请先安装本账户的原版引擎，再进行验证。');
    if (deployment.engine !== engine || !acceptedImage(engine, deployment.image) || deployment.upstreamVersion !== ENGINE_INSTALLS[engine].version) return fail('原生镜像或版本与本地安装器锁定版本不符。');
    if (deployment.liveVerified || deployment.paperVerified || (deployment.verifiedActions ?? []).some(action => ['start', 'optimize'].includes(action))) return fail('此配置已有独立交易批准；自动研究验证不能覆盖，请先由运行管理员审核。');
    if (await readJson(path.join(p.base, 'reconciliation-required.json'))) return fail('原生操作结果尚未对账，请先核对引擎及订单，验证不会删除对账锁。');
    const halted = await readJson(path.join(p.base, 'local-halt.json'));
    if (halted && !resume) return fail('此引擎有本机停止锁，请明确选择恢复并验证后重试。');
    await docker.available();
    const operatingSystem = await docker.exec(['info', '--format', '{{.OSType}}']);
    if (operatingSystem.trim() !== 'linux') return fail('验证需要 Docker Desktop 的 Linux 容器模式。');
    const network = process.env.QUANT_DOCKER_NETWORK ?? 'welink-quant';
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(network)) return fail('原生运行网络名称无效。');
    await docker.exec(['network', 'inspect', '--format', '{{.Name}}', network]);
    const imageId = (await docker.exec(['image', 'inspect', '--format', '{{.Id}}', deployment.image])).trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) return fail('Docker 未返回可验证的镜像内容摘要。');
    checks.push({name: 'runtime', ok: true, message: 'Linux Docker、专用网络与锁定镜像已确认。'});
    const active = (await docker.exec(['ps', '--format', '{{.Names}}', '--filter', `name=wq-${p.tenant.slice(0, 16)}-${engine}-`])).split(/\r?\n/).filter(Boolean);
    if (active.some(name => name.startsWith(`wq-${p.tenant.slice(0, 16)}-${engine}-`))) return fail('本账户引擎还有独立运行任务，请先停止并确认后验证。');
    for (const relative of requiredFiles(engine, 'backtest', config)) {
      const target = path.join(p.project, relative);
      try {await access(target); await assertContained(p.project, target);} catch {return fail(`缺少原生研究文件 ${relative}。请在本机准备真实数据和原生配置后重试。`);}
    }
    const files = await baselineFiles(p, engine, config);
    checks.push({name: 'strategy', ok: true, message: '基线策略源码、原生配置和本站风险参数已核对。'});
    if (engine === 'jesse') {
      const version = await docker.exec(['run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--entrypoint', 'python', deployment.image, '-c', 'import importlib.metadata; print(importlib.metadata.version("jesse"))']);
      if (version.trim() !== '3.1.1') return fail('本机构建镜像中的 Jesse SDK 版本不是已锁定的 3.1.1。');
      checks.push({name: 'sdk', ok: true, message: '已从实际容器读取 Jesse SDK 3.1.1 版本。'});
    }
    const verificationId = randomUUID();
    const directory = path.join(p.base, 'verification', verificationId);
    const requestDir = path.join(directory, 'request'), outputDir = path.join(directory, 'output');
    await mkdir(requestDir, {recursive: true, mode: 0o700}); await mkdir(outputDir, {recursive: true, mode: 0o700});
    await writeJson(path.join(requestDir, 'request.json'), {action: 'backtest', config, requestId: verificationId, strategyClass: BASELINES[engine].strategy});
    if (engine === 'lean') await writeJson(path.join(outputDir, 'lean-config.json'), {...await leanConfig(p), environments: {}, 'live-mode': false, 'algorithm-language': 'Python', 'algorithm-type-name': 'WelinkTrend', 'algorithm-location': '/project/algorithm.py', 'data-folder': '/project/data', 'results-destination-folder': '/state', 'object-store-root': '/state/storage'});
    verificationName = containerName(p, engine, `verify-${verificationId.slice(0, 12)}`);
    const args = dockerArgs({engine, action: 'backtest', config, deployment: {...deployment, envFile: false}, p, name: verificationName, requestDir, outputDir, network});
    onLog('正在执行原生历史回测；不会启动机器人或发送实盘订单。首次下载行情可能需要数分钟。');
    await audit(p, {action: 'verify-backtest', phase: 'requested', requestId: verificationId, configHash, imageId});
    await docker.exec(args);
    const started = Date.now(); let finished = false; let lastNotice = Date.now();
    while (Date.now() - started < timeoutMs) {
      const runtime = await docker.inspect(verificationName);
      if (!runtime) throw new Error('验证容器不存在，未获得原生执行结果。');
      if (!runtime.running) {if (runtime.exitCode !== 0) throw new Error('原生回测失败，请在 Docker Desktop 查看此验证容器日志及数据配置。'); finished = true; break;}
      if (Date.now() - lastNotice > 30000) {onLog('原生历史回测仍在运行，等待真实结果。'); lastNotice = Date.now();}
      await delay(pollMs);
    }
    if (!finished) throw new Error('原生验证超过时间限制，已请求停止验证容器；未启用执行能力。');
    const metrics = resultEvidence(engine, await readJson(path.join(outputDir, 'result.json')));
    const verification = {schemaVersion: 1, at: new Date().toISOString(), configHash, imageId, files, action: 'backtest', startDate: config.startDate, endDate: config.endDate, metrics};
    const proofErrors = await verifyStoredEvidence(p, {...deployment, approvedConfigHash: configHash, verification}, 'backtest', docker);
    if (proofErrors.length) throw new Error(proofErrors[0]);
    const updated = {...deployment, enabled: true, approvedConfigHash: configHash, verifiedActions: ['backtest', 'stop'], paperVerified: false, liveVerified: false, accountConfigured: false, withdrawalsDisabled: false, ipAllowlistVerified: false, envFile: false, strategyClass: BASELINES[engine].strategy, verification};
    await writeJson(p.deployment, updated);
    await writeJson(path.join(directory, 'evidence.json'), verification);
    if (resume && halted) await unlink(path.join(p.base, 'local-halt.json'));
    await audit(p, {action: 'verify-backtest', phase: 'completed', requestId: verificationId, configHash, imageId, ok: true, resumed: Boolean(resume && halted)});
    checks.push({name: 'backtest', ok: true, message: '实际原生回测已退出且产生有效统计结果，仅批准同配置的研究回测与停止。'});
    return {ok: true, engine, configHash, verifiedActions: ['backtest', 'stop'], enabled: true, resumed: Boolean(resume && halted), checks, blockers, message: resume && halted ? '原生研究回测验证通过，本机停止锁已解除；交易启动权限保持关闭。' : '原生研究回测验证通过，可从网站提交回测；交易启动权限保持关闭。'};
  } catch (error) {
    return fail(error.code === 'EEXIST' ? '本机已有安装、验证或交易操作，当前验证未执行。' : error.code === 'ENOENT' ? '原生配置或数据尚未准备完整，请先完成本机安装。' : error.message || '本机原生验证失败，未启用执行能力。');
  } finally {
    if (verificationName) {
      try {if ((await docker.inspect(verificationName))?.running) await docker.stop(verificationName);} catch {/* Retain stopped/failed verification container for local diagnostics. */}
    }
    if (mutationLock) {await mutationLock.close(); await unlink(mutationLockPath);}
    if (installLock) {await installLock.close(); await unlink(installLockPath);}
  }
}
