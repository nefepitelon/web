import { mkdir, access, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Docker } from './docker.mjs';
import { paths, readJson, writeJson, assertContained, audit } from './storage.mjs';
import { validateCommand, approvedConfigHash, digest, MUTATIONS, isPinnedImage } from './validation.mjs';
import { supported, requiredFiles, dockerArgs, containerName, nativeStatus, nativeCommand, hummingbotTask } from './adapters.mjs';
import { verifyStoredEvidence } from './verify-engine.mjs';

const blocked = (message, runtime, blockers = [message]) => ({ ok: false, message, blockers, runtime });
export class Gateway {
  constructor({ root = process.env.QUANT_RUNTIME_ROOT ?? '/srv/welink-quant', docker = new Docker(), allowLive = process.env.QUANT_ALLOW_LIVE === 'true', network = process.env.QUANT_DOCKER_NETWORK ?? 'welink-quant', fetcher = fetch } = {}) {
    this.root = path.resolve(root); this.docker = docker; this.allowLive = allowLive; this.network = network; this.fetcher = fetcher;
  }

  async deployment(p) {
    const d = await readJson(p.deployment);
    if (d) await assertContained(this.root, p.project);
    return d;
  }
  runtime(d, state, message) {
    const capabilities = d ? supported(d.engine, d) : ['status', 'preflight'];
    if (capabilities.includes('start') && d?.paperVerified) capabilities.push('paper');
    if (capabilities.includes('start') && this.allowLive && d?.liveVerified && d?.accountConfigured && d?.withdrawalsDisabled && d?.ipAllowlistVerified) capabilities.push('live');
    return { state, message, ...(d?.upstreamVersion ? { version: String(d.upstreamVersion).slice(0, 40) } : {}), capabilities };
  }

  async status(command, p, d) {
    const halted = await readJson(path.join(p.base, 'local-halt.json'));
    const withHalt = runtime => halted ? { ...runtime, capabilities: (runtime.capabilities ?? []).filter(value => ['status', 'preflight', 'stop'].includes(value)), message: '本机停止锁已生效，禁止启动和研究任务；已有进程状态仍以原生引擎为准，恢复前需用户重新验证。' } : runtime;
    if (!d?.enabled) return withHalt(this.runtime(d, 'unconfigured', '尚未安装并审核此账户的独立引擎运行配置。'));
    if (d.engine !== command.engine) throw new Error('运行配置的引擎标识不匹配。');
    try {
      let runtime;
      if (command.engine === 'hummingbot' || (command.engine === 'freqtrade' && d.api)) {
        runtime = { ...this.runtime(d, 'ready', ''), ...await nativeStatus(command.engine, d, p, this.fetcher) };
      } else {
        const state = await this.docker.inspect(containerName(p, command.engine));
        runtime = this.runtime(d, state?.running ? 'running' : state && state.exitCode !== 0 ? 'error' : 'ready', state?.running ? '引擎容器正在运行；不代表交易所已完成成交。' : state && state.exitCode !== 0 ? `引擎容器已退出，退出码 ${state.exitCode}。` : '运行主机已连接；引擎当前未运行。');
      }
      const job = await readJson(path.join(p.state, 'current-job.json'));
      if (job?.terminalState) {
        runtime.job = { requestId: job.requestId, action: job.action, state: job.terminalState };
      } else if (job?.nativeId) {
        const state = await hummingbotTask(d, p, job.nativeId, this.fetcher);
        runtime.job = { requestId: job.requestId, action: job.action, state: state.state };
        if (Object.keys(state.metrics).length) runtime.metrics = state.metrics;
      } else if (job) {
        const state = await this.docker.inspect(job.container);
        runtime.job = { requestId: job.requestId, action: job.action, state: state?.running ? 'running' : state ? state.exitCode === 0 ? 'completed' : 'failed' : 'missing', ...(state && !state.running ? { exitCode: state.exitCode } : {}) };
        if (state && !state.running && state.exitCode === 0) {
          const result = await readJson(path.join(p.state, 'jobs', job.directory, 'output', 'result.json'));
          const metrics = {};
          for (const [key, value] of Object.entries(result?.metrics ?? {})) if (/^[a-zA-Z_][a-zA-Z0-9_]{0,50}$/.test(key) && typeof value === 'number' && Number.isFinite(value)) metrics[key] = value;
          if (Object.keys(metrics).length) runtime.metrics = metrics;
        }
      }
      if (d.verification) {
        const proofErrors = await verifyStoredEvidence(p, d, 'backtest', this.docker);
        if (proofErrors.length) runtime = { ...runtime, state: runtime.state === 'running' ? 'running' : 'unconfigured', capabilities: ['status', 'preflight', 'stop'], message: proofErrors.join(' ') };
      }
      return withHalt(runtime);
    } catch { return withHalt(this.runtime(d, 'offline', '无法读取已验证的引擎状态；请检查运行主机及原生服务。')); }
  }

  async preflight(command, p, d) {
    const blockers = [];
    const c = command.config;
    const target = command.action === 'preflight' ? command.targetAction ?? 'start' : command.action;
    const runtime = await this.status(command, p, d);
    if (target === 'stop') return { ok: Boolean(d), runtime, blockers: d ? [] : ['尚无可停止的运行配置。'] };
    if (await readJson(path.join(p.base, 'local-halt.json'))) blockers.push('此引擎已被用户在本机停止并锁定，需明确重新验证/恢复后才能执行新任务。');
    if (!d?.enabled) blockers.push('管理员需在持久 Linux Docker 主机安装此账户的运行配置。');
    if (d?.engine !== command.engine && d) blockers.push('运行配置引擎不匹配。');
    if (d && !isPinnedImage(d.image)) blockers.push('引擎镜像必须锁定稳定版本或 sha256，禁止浮动和预发布标签。');
    if (d?.approvedConfigHash !== approvedConfigHash(c)) blockers.push('交易所、模式、策略、交易对或风险参数尚未与原生配置校验；需重新审核部署配置。');
    if (!supported(command.engine, d).includes(target)) blockers.push('此动作尚未通过此引擎的原生运行验证。');
    if (target === 'start' && c.mode === 'paper' && !d?.paperVerified) blockers.push('原生模拟/沙盒模式尚未验证，拒绝启动。');
    if (target === 'start' && c.mode === 'live') {
      if (!this.allowLive) blockers.push('运行主机 QUANT_ALLOW_LIVE 未开启。');
      if (!d?.liveVerified || !d?.accountConfigured) blockers.push('交易所实盘账户及原生风控配置尚未验证。');
      if (!d?.withdrawalsDisabled || !d?.ipAllowlistVerified) blockers.push('需验证交易 API 无提现权限且已设置运行主机 IP 白名单。');
    }
    if (['backtest', 'optimize'].includes(target) && !c.startDate) blockers.push('研究任务需要明确的起止日期。');
    if (command.engine === 'jesse' && target === 'start') blockers.push('Jesse 商业实盘插件未集成；当前只提供 MIT 核心研究回测。');
    if (await readJson(path.join(p.base, 'reconciliation-required.json'))) blockers.push('此前运行操作结果不确定；管理员需核对原生引擎后解除对账锁。');
    if (d?.enabled) {
      blockers.push(...await verifyStoredEvidence(p, d, target, this.docker));
      if (d.envFile === true) {
        try { await access(path.join(p.project, 'engine.env')); await assertContained(this.root, path.join(p.project, 'engine.env')); }
        catch { blockers.push('缺少服务器专用的原生凭据文件 engine.env。'); }
      }
      for (const file of requiredFiles(command.engine, target, c)) {
        try { await access(path.join(p.project, file)); await assertContained(this.root, path.join(p.project, file)); }
        catch { blockers.push(`缺少已部署的原生文件：${file}。`); }
      }
      if (command.engine !== 'hummingbot') {
        try { await this.docker.image(d.image); } catch { blockers.push('运行主机上不存在已锁定镜像；需先安装/构建该镜像。'); }
      }
      if (runtime.state === 'offline') blockers.push(runtime.message);
    }
    return { ok: blockers.length === 0, runtime, blockers, result: { configHash: approvedConfigHash(c) }, message: blockers.length ? '运行前检查未通过。' : '配置与运行依赖检查通过；尚未启动交易。' };
  }

  async execute(input) {
    const command = validateCommand(input);
    const p = paths(this.root, command.userId, command.engine);
    const d = await this.deployment(p);
    if (command.action === 'status') return { ok: true, runtime: await this.status(command, p, d) };
    if (command.action === 'preflight') return this.preflight(command, p, d);
    // One durable cross-process mutation lock per account/engine. A crash leaves the lock for operator reconciliation.
    await mkdir(p.ledger, { recursive: true, mode: 0o700 });
    const ledgerFile = path.join(p.ledger, `${digest(command.requestId)}.json`);
    const commandHash = digest(command);
    const existing = await readJson(ledgerFile);
    if (existing) return this.replay(existing, commandHash, d);
    const lockPath = path.join(p.base, 'mutation.lock');
    let lock;
    try { lock = await open(lockPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') return blocked('该引擎已有操作或恢复中的操作；请查询状态后由管理员对账。', this.runtime(d, 'error', '操作锁尚未释放。')); throw error; }
    try {
      const doubleCheck = await readJson(ledgerFile);
      if (doubleCheck) return this.replay(doubleCheck, commandHash, d);
      const controlFile = path.join(p.base, 'last-control.json');
      const lastControl = await readJson(controlFile);
      if (lastControl && command.controlSequence <= lastControl.sequence) return blocked('指令序号已过期；较新的控制指令已经生效。', this.runtime(d, 'error', '已拒绝延迟到达的旧指令。'));
      // Persist fencing before side effects, including stop and rejected preflights.
      await writeJson(controlFile, { sequence: command.controlSequence, requestId: command.requestId, at: new Date().toISOString() });
      if (command.action !== 'stop') {
        const check = await this.preflight(command, p, d);
        if (!check.ok) return check;
      } else if (!d) return blocked('尚无可停止的运行配置。', this.runtime(d, 'unconfigured', '尚未配置运行主机。'));
      await writeJson(ledgerFile, { commandHash, status: 'pending', requestId: command.requestId, action: command.action, startedAt: new Date().toISOString() });
      await audit(p, { requestId: command.requestId, action: command.action, controlSequence: command.controlSequence, phase: 'requested', configHash: command.config ? approvedConfigHash(command.config) : null });
      let response;
      try { response = await this.perform(command, p, d); }
      catch (error) {
        await writeJson(path.join(p.base, 'reconciliation-required.json'), { requestId: command.requestId, action: command.action, at: new Date().toISOString() });
        const message = error instanceof SyntaxError ? '原生运行文件不是有效 JSON；请管理员检查配置。' : error.message;
        response = blocked(message, this.runtime(d, 'error', message));
      }
      await writeJson(ledgerFile, { commandHash, status: 'completed', response, completedAt: new Date().toISOString() });
      await audit(p, { requestId: command.requestId, action: command.action, phase: 'completed', ok: response.ok });
      return response;
    } finally { await lock.close(); await unlink(lockPath); }
  }

  replay(existing, hash, d) {
    if (existing.commandHash !== hash) return blocked('同一 requestId 不可用于不同指令。', this.runtime(d, 'error', '幂等键冲突。'));
    if (existing.status === 'completed') return { ...existing.response, replayed: true };
    return blocked('此前请求执行结果不确定；已阻止重放，请核对容器和交易所状态。', this.runtime(d, 'error', '待恢复的操作。'));
  }

  async perform(command, p, d) {
    const { engine, action, config } = command;
    if (action === 'stop') {
      const job = await readJson(path.join(p.state, 'current-job.json'));
      if (job?.nativeId && !job.terminalState) {
        const task = await hummingbotTask(d, p, job.nativeId, this.fetcher);
        if (['pending', 'running'].includes(task.state)) {
          await hummingbotTask(d, p, job.nativeId, this.fetcher, true);
          await writeJson(path.join(p.state, 'current-job.json'), { ...job, terminalState: 'cancelled' });
        }
      } else if (job?.container && (await this.docker.inspect(job.container))?.running) await this.docker.stop(job.container);
      if (engine === 'hummingbot' || (engine === 'freqtrade' && d.api)) await nativeCommand(engine, action, d, p, config, this.fetcher);
      else {
        const name = containerName(p, engine);
        if ((await this.docker.inspect(name))?.running) await this.docker.stop(name);
      }
      return { ok: true, runtime: await this.status(command, p, d), message: '停止请求已执行。停止进程不等于平仓，请核对原有持仓及交易所挂单。' };
    }
    if (engine === 'hummingbot' || (engine === 'freqtrade' && d.api && action === 'start')) {
      const current = await this.status(command, p, d);
      if (current.state === 'running' || ['pending', 'running'].includes(current.job?.state)) return blocked('该引擎已有活动机器人或研究任务。', current);
      const result = await nativeCommand(engine, action, d, p, config, this.fetcher);
      if (result.taskId) await writeJson(path.join(p.state, 'current-job.json'), { nativeId: result.taskId, requestId: command.requestId, action });
      return { ok: true, result, runtime: await this.status(command, p, d), message: result.message };
    }
    const botName = containerName(p, engine);
    const bot = await this.docker.inspect(botName);
    const job = await readJson(path.join(p.state, 'current-job.json'));
    if (job && (await this.docker.inspect(job.container))?.running) return blocked('该引擎已有研究任务运行中。', await this.status(command, p, d));
    if (bot?.running) return blocked('该引擎已有机器人运行中；先停止再更改或启动新任务。', await this.status(command, p, d));
    if (action === 'start' && bot) await this.docker.exec(['container', 'rm', botName]);
    const directory = digest(command.requestId).slice(0, 32);
    const requestDir = path.join(p.state, 'jobs', directory, 'request');
    const outputDir = action === 'start' ? path.join(p.state, 'trading') : path.join(p.state, 'jobs', directory, 'output');
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
    await mkdir(requestDir, { recursive: true, mode: 0o700 });
    // Only non-secret, validated input is mounted into the engine.
    await writeJson(path.join(requestDir, 'request.json'), { action, config, requestId: command.requestId, strategyClass: d.strategyClass });
    if (engine === 'lean') {
      const native = await readJson(path.join(p.project, `${action === 'start' ? config.mode : 'backtest'}.json`));
      const effective = { ...native, ...(native?.environments?.[native.environment] ?? {}) };
      if (effective['live-mode'] !== (action === 'start')) throw new Error('LEAN 原生执行模式与请求不一致。');
      if (action === 'start' && config.mode === 'paper' && effective['live-mode-brokerage'] !== 'PaperBrokerage') throw new Error('LEAN paper 必须使用 PaperBrokerage。');
      await writeJson(path.join(outputDir, 'lean-config.json'), { ...effective, environments: {}, 'algorithm-language': 'Python', 'algorithm-type-name': 'WelinkTrend', 'algorithm-location': '/project/algorithm.py', 'data-folder': '/project/data', 'results-destination-folder': '/state', 'object-store-root': '/state/storage' });
    }
    const name = action === 'start' ? botName : containerName(p, engine, directory.slice(0, 12));
    const args = dockerArgs({ engine, action, config, deployment: d, p, name, requestDir, outputDir, network: this.network });
    if (action !== 'start') await writeJson(path.join(p.state, 'current-job.json'), { directory, container: name, requestId: command.requestId, action });
    await this.docker.exec(args);
    const inspected = await this.docker.inspect(name);
    if (!inspected || (!inspected.running && inspected.exitCode !== 0)) return blocked('原生引擎启动失败，请检查运行主机日志。', this.runtime(d, 'error', '容器未成功启动。'));
    return { ok: true, runtime: await this.status(command, p, d), result: { requestId: command.requestId, state: inspected.running ? 'running' : 'completed' }, message: action === 'start' ? '原生引擎已启动；请查询状态并核对交易所连接。' : '原生研究任务已提交，结果与日志保存在运行主机。' };
  }
}
