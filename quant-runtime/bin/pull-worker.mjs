import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, unlink } from 'node:fs/promises';
import { Gateway } from '../lib/gateway.mjs';
import { validateCommand, approvedConfigHash } from '../lib/validation.mjs';
import { readJson, writeJson } from '../lib/storage.mjs';

const VERSION = {freqtrade: '2026.8', nautilus: '1.231.0', hummingbot: '2.16.0', lean: '18057', jesse: '3.1.1', octobot: '2.1.1'};
export function versionMatches(engine, version) {
  return version === VERSION[engine] || (engine === 'hummingbot' && version === '2.16.0 / API 1.0.1') || (engine === 'lean' && version === '镜像 build 18057');
}
export function validateTask(task) {
  const payload = task?.payload;
  if (!task || typeof task.dispatchId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.dispatchId) || typeof task.leaseToken !== 'string' || !/^[a-f0-9-]{36}$/i.test(task.leaseToken)) throw new Error('Invalid task lease');
  if (payload?.protocolVersion !== 1 || !Number.isInteger(payload.revision) || payload.revision < 1 || payload.expectedVersion !== VERSION[payload.engine]) throw new Error('Unsupported task protocol or engine version');
  const command = validateCommand({userId: payload.userId, engine: payload.engine, action: payload.action, config: payload.config, requestId: payload.requestId, ...(['start', 'stop', 'backtest', 'optimize'].includes(payload.action) ? {controlSequence: payload.controlSequence} : {})});
  if (!['preflight', 'start', 'stop', 'backtest', 'optimize'].includes(command.action) || approvedConfigHash(command.config) !== payload.configHash) throw new Error('Task configuration integrity check failed');
  if (!Number.isFinite(Date.parse(task.expiresAt))) throw new Error('Invalid task deadline');
  return command;
}
export function safeReply(reply) {
  const result = {};
  for (const key of ['requestId', 'state', 'configHash']) if (typeof reply?.result?.[key] === 'string') result[key] = reply.result[key];
  if (reply?.result?.metrics) result.metrics = Object.fromEntries(Object.entries(reply.result.metrics).filter(([key, value]) => /^[a-zA-Z_][a-zA-Z0-9_]{0,59}$/.test(key) && typeof value === 'number' && Number.isFinite(value)));
  return {ok: reply?.ok === true, ...(reply?.runtime ? {runtime: reply.runtime} : {}), ...(typeof reply?.message === 'string' ? {message: reply.message.slice(0, 2000)} : {}), ...(Array.isArray(reply?.blockers) ? {blockers: reply.blockers.slice(0, 40).map(value => String(value).slice(0, 1500))} : {}), ...(Object.keys(result).length ? {result} : {})};
}

export class PullWorker {
  constructor({baseUrl, workerId, token, gateway = new Gateway(), fetcher = fetch, journalRoot = process.env.QUANT_RUNTIME_ROOT ?? '/srv/welink-quant', allowLive = process.env.QUANT_WORKER_ALLOW_LIVE === 'true'} = {}) {
    const url = new URL(baseUrl);
    const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash) throw new Error('Worker requires the trusted HTTPS application URL');
    if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(workerId ?? '') || typeof token !== 'string' || token.length < 32) throw new Error('Worker ID and server-issued scoped token are required');
    this.baseUrl = url; this.workerId = workerId; this.token = token; this.gateway = gateway; this.fetcher = fetcher; this.allowLive = allowLive;
    this.journalFile = path.join(path.resolve(journalRoot), 'pull-workers', workerId, 'inflight.json');
    this.assignments = []; this.active = null; this.stopped = false; this.heartbeatBusy = false;
  }
  async api(operation, body) {
    const url = new URL(`/api/quant-suite/worker/${operation}`, this.baseUrl);
    const response = await this.fetcher(url, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000), headers: {'content-type': 'application/json', authorization: `Bearer ${this.token}`, 'x-quant-worker-id': this.workerId}, body: JSON.stringify({protocolVersion: 1, ...body})});
    const text = await response.text();
    if (text.length > 1024 * 1024) throw new Error('Worker response exceeds maximum size');
    let value;
    try { value = JSON.parse(text); } catch { throw new Error('Worker service returned invalid JSON'); }
    if (!response.ok || value.ok !== true) throw new Error(`Worker request rejected (${response.status})`);
    return value;
  }
  async report(journal) {
    await this.api('complete', {dispatchId: journal.task.dispatchId, leaseToken: journal.task.leaseToken, outcome: journal.outcome, reply: journal.reply});
    await unlink(this.journalFile);
    this.active = null;
  }
  async recover() {
    const journal = await readJson(this.journalFile);
    if (!journal) return;
    if (journal.phase !== 'report') {
      // Recovery never calls a mutating native command again. The native durable ledger and an explicit stop reconcile ambiguity.
      journal.outcome = journal.phase === 'executing' ? 'unknown' : 'completed';
      journal.reply = {ok: false, message: journal.outcome === 'unknown' ? '执行器重启，原生操作结果尚未确认。' : '执行器在调用原生引擎前重启，此指令未执行。'};
      journal.phase = 'report';
      await writeJson(this.journalFile, journal);
    }
    await this.report(journal);
  }
  async handle(task) {
    let command;
    try { command = validateTask(task); }
    catch { await this.api('complete', {dispatchId: task.dispatchId, leaseToken: task.leaseToken, outcome: 'completed', reply: {ok: false, message: '指令的配置哈希、协议或锁定版本不匹配，未执行。'}}); return; }
    const journal = {task, phase: 'claimed', outcome: 'completed', reply: null};
    this.active = task;
    await writeJson(this.journalFile, journal);
    let invoked = false;
    try {
      if (Date.parse(task.expiresAt) <= Date.now()) throw new Error('Task expired before native execution');
      if (command.action === 'start' && command.config.mode === 'live' && !this.allowLive) throw new Error('This worker has not explicitly enabled live execution');
      if (['start', 'backtest', 'optimize'].includes(command.action)) {
        const preflight = await this.gateway.execute({...command, action: 'preflight', targetAction: command.action, controlSequence: undefined});
        const capability = command.action === 'start' ? command.config.mode : command.action;
        if (!preflight.ok || !preflight.runtime?.capabilities?.includes(capability) || !versionMatches(command.engine, preflight.runtime?.version) || preflight.result?.configHash !== task.payload.configHash) {
          journal.reply = safeReply({ok: false, message: '原生执行前校验未通过；策略、能力或锁定版本不匹配。', blockers: preflight.blockers, runtime: preflight.runtime});
        }
      }
      if (!journal.reply) {
        if (command.action !== 'preflight') {
          journal.phase = 'begin-request'; await writeJson(this.journalFile, journal);
          const permit = await this.api('begin', {dispatchId: task.dispatchId, leaseToken: task.leaseToken});
          if (permit.permitted !== true) throw new Error('Execution permission was not acknowledged');
          journal.phase = 'executing'; await writeJson(this.journalFile, journal);
          invoked = true;
        }
        journal.reply = safeReply(await this.gateway.execute(command));
        // A native failure can follow a partial side effect. Keep the cloud lock until an explicit stop/reconciliation.
        if (invoked && !journal.reply.ok) journal.outcome = 'unknown';
      }
    } catch {
      journal.outcome = invoked ? 'unknown' : 'completed';
      journal.reply = {ok: false, message: invoked ? '原生操作结果不确定，需核对引擎状态；未自动重试。' : '执行前检查或调度许可未通过，未调用原生交易动作。'};
    }
    journal.phase = 'report';
    await writeJson(this.journalFile, journal);
    await this.report(journal);
  }
  async heartbeat() {
    if (this.heartbeatBusy) return;
    this.heartbeatBusy = true;
    try {
      // Keep liveness/lease separate from native status probes so one slow engine cannot expire the worker lease.
      await this.api('heartbeat', {observations: [], ...(this.active ? {lease: {dispatchId: this.active.dispatchId, leaseToken: this.active.leaseToken}} : {})});
      const observations = (await Promise.all(this.assignments.slice(0, 50).map(async assignment => {
        try {
          const reply = await this.gateway.execute({userId: assignment.userId, engine: assignment.engine, action: 'status', config: assignment.config});
          if (!reply.runtime) return null;
          return {userId: assignment.userId, engine: assignment.engine, revision: assignment.revision, configHash: assignment.configHash, runtime: reply.runtime};
        } catch { return null; }
      }))).filter(Boolean);
      await this.api('heartbeat', {observations});
    } finally { this.heartbeatBusy = false; }
  }
  async tick() {
    if (await readJson(this.journalFile)) { await this.recover(); return; }
    const response = await this.api('claim', {});
    this.assignments = Array.isArray(response.assignments) ? response.assignments : [];
    if (response.task) await this.handle(response.task);
  }
  async run() {
    await mkdir(path.dirname(this.journalFile), {recursive: true, mode: 0o700});
    const timer = setInterval(() => this.heartbeat().catch(() => console.error('Worker heartbeat unavailable')), 10000);
    try {
      while (!this.stopped) {
        try { await this.tick(); } catch { console.error('Worker transport unavailable; pending work will only be reconciled, never replayed automatically'); }
        if (!this.stopped) await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } finally { clearInterval(timer); }
  }
  stop() { this.stopped = true; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const worker = new PullWorker({baseUrl: process.env.QUANT_APPLICATION_URL, workerId: process.env.QUANT_WORKER_ID, token: process.env.QUANT_WORKER_TOKEN});
  process.on('SIGTERM', () => worker.stop());
  process.on('SIGINT', () => worker.stop());
  await worker.run();
}
