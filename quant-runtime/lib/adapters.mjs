import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './storage.mjs';

const recipes = fileURLToPath(new URL('../recipes/', import.meta.url));
export const ENGINE_CAPABILITIES = {
  freqtrade: ['start', 'stop', 'backtest', 'optimize'],
  nautilus: ['start', 'stop', 'backtest'],
  hummingbot: ['start', 'stop', 'backtest'],
  lean: ['start', 'stop', 'backtest'],
  jesse: ['backtest'],
  octobot: ['start', 'stop', 'backtest', 'optimize'],
};

export function containerName(p, engine, suffix = 'bot') { return `wq-${p.tenant.slice(0, 16)}-${engine}-${suffix}`; }
function hummingbotName(deployment, p) {
  const prefix = containerName(p, 'hummingbot');
  const name = deployment.api?.botName ?? prefix;
  if (name !== prefix && !new RegExp(`^${prefix}-[0-9]{8}-[0-9]{6}$`).test(name)) throw new Error('Hummingbot 原生机器人名称不属于此账户。');
  return name;
}
export function supported(engine, deployment) {
  return ['status', 'preflight', ...ENGINE_CAPABILITIES[engine].filter(action => deployment?.verifiedActions?.includes(action))];
}

export function requiredFiles(engine, action, config) {
  const mode = action === 'start' ? config.mode : 'backtest';
  return {
    freqtrade: ['config.json', 'strategies'],
    nautilus: [`${mode}.json`],
    hummingbot: ['api-auth.json'],
    lean: [`${mode}.json`, 'algorithm.py', 'data'],
    jesse: ['backtest.json', 'candles.json', 'strategies'],
    octobot: ['user', 'tentacles'],
  }[engine];
}

export function dockerArgs({ engine, action, config, deployment, p, name, requestDir, outputDir, network }) {
  const args = ['run', '--detach', '--name', name,
    '--user', `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    '--label', 'welink.quant.managed=true', '--label', `welink.quant.tenant=${p.tenant}`,
    '--label', `welink.quant.engine=${engine}`, '--label', `welink.quant.action=${action}`,
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '512',
    '--memory', deployment.memory ?? '2g', '--cpus', String(deployment.cpus ?? 2),
    '--log-opt', 'max-size=10m', '--log-opt', 'max-file=3',
    '--network', network,
    '--mount', `type=bind,src=${p.project},dst=/project,readonly`,
    '--mount', `type=bind,src=${requestDir},dst=/request,readonly`,
    '--mount', `type=bind,src=${outputDir},dst=/state`,
    '--mount', `type=bind,src=${path.join(recipes, engine)},dst=/integration,readonly`,
    '--env', 'QUANT_REQUEST_FILE=/request/request.json'];
  if (deployment.envFile === true) args.push('--env-file', path.join(p.project, 'engine.env'));
  // Restarts require an explicit reconciled start; Docker may never autonomously resume live trading.
  if (engine === 'lean') {
    args.push('--entrypoint', 'dotnet', '--workdir', '/Lean/Launcher/bin/Debug', deployment.image,
      'QuantConnect.Lean.Launcher.dll', '--config', '/state/lean-config.json');
  } else {
    args.push('--entrypoint', 'python', deployment.image, engine === 'nautilus' ? '/integration/driver.py' : '/integration/run.py');
  }
  return args;
}

async function nativeRequest(deployment, p, route, body, fetcher, method) {
  if (!deployment.api?.baseUrl) throw new Error('原生 API 地址尚未配置。');
  const base = new URL(deployment.api.baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('原生 API 地址配置无效。');
  const auth = await readJson(path.join(p.project, 'api-auth.json'));
  if (!auth || typeof auth.username !== 'string' || typeof auth.password !== 'string') throw new Error('原生 API 认证未配置。');
  const response = await fetcher(new URL(route, base), {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: { authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`原生 API 返回 HTTP ${response.status}；请在运行主机检查日志。`);
  const raw = await response.text();
  if (raw.length > 1024 * 1024) throw new Error('原生 API 响应超过上限。');
  try { return JSON.parse(raw); } catch { throw new Error('原生 API 返回无效 JSON。'); }
}

export async function nativeStatus(engine, deployment, p, fetcher = fetch) {
  if (engine === 'freqtrade') {
    const body = await nativeRequest(deployment, p, '/api/v1/show_config', undefined, fetcher);
    return { state: body.state === 'running' ? 'running' : 'ready', message: body.dry_run === true ? 'Freqtrade Dry-run API 已连接。' : 'Freqtrade 原生 API 已连接。', metrics: { dryRun: body.dry_run === true ? 1 : 0 } };
  }
  if (engine === 'hummingbot') {
    const name = hummingbotName(deployment, p);
    const body = await nativeRequest(deployment, p, `/bot-orchestration/${encodeURIComponent(name)}/status`, undefined, fetcher);
    const state = body.data?.status ?? body.status;
    if (!['running', 'stopped', 'not_running', 'stopping', 'idle'].includes(state)) throw new Error('Hummingbot 返回无法验证的机器人状态；请核对已锁定 API 版本。');
    return { state: ['running', 'stopping'].includes(state) ? 'running' : state === 'idle' ? 'offline' : 'ready', message: `Hummingbot API 机器人状态：${state}。` };
  }
  throw new Error('此引擎没有已实现的原生状态 API。');
}

export async function hummingbotTask(deployment, p, id, fetcher = fetch, cancel = false) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('原生任务编号无效。');
  const body = await nativeRequest(deployment, p, `/backtesting/tasks/${id}`, undefined, fetcher, cancel ? 'DELETE' : 'GET');
  if (cancel && body.status === 'deleted') return { state: 'cancelled', metrics: {} };
  if (!['pending', 'running', 'completed', 'failed', 'cancelled'].includes(body.status)) throw new Error('原生任务返回未知状态。');
  const metrics = {};
  for (const key of ['net_pnl', 'net_pnl_pct', 'max_drawdown', 'sharpe_ratio', 'total_trades']) {
    const value = body.result?.results?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) metrics[key] = value;
  }
  return { state: body.status, metrics };
}

export async function nativeCommand(engine, action, deployment, p, config, fetcher = fetch) {
  if (engine === 'freqtrade' && ['start', 'stop'].includes(action) && deployment.api) {
    if (action === 'start') {
      const native = await nativeRequest(deployment, p, '/api/v1/show_config', undefined, fetcher);
      const pairs = await nativeRequest(deployment, p, '/api/v1/whitelist', undefined, fetcher);
      const expectedPairs = config.symbols.slice().sort().join(',');
      const actualPairs = (pairs.whitelist ?? []).slice().sort().join(',');
      if (native.exchange !== config.exchange || native.strategy !== (deployment.strategyClass ?? 'WelinkTrend') || pairs.method?.length !== 1 || pairs.method[0] !== 'StaticPairList' || native.dry_run !== (config.mode === 'paper') || Number(native.stake_amount) !== config.stakeAmount || native.max_open_trades !== config.maxOpenTrades || !Number.isFinite(Number(native.stoploss)) || Math.abs(Number(native.stoploss) + config.stopLossPct / 100) > 1e-8 || native.timeframe !== config.timeframe || expectedPairs !== actualPairs) throw new Error('Freqtrade API 当前原生配置与本系统风险参数不一致；拒绝启动。');
    }
    await nativeRequest(deployment, p, `/api/v1/${action}`, {}, fetcher);
    return { message: action === 'stop' ? '已请求 Freqtrade 停止交易；请核对既有挂单与持仓。' : 'Freqtrade 已接受启动请求。' };
  }
  if (engine === 'hummingbot') {
    const name = hummingbotName(deployment, p);
    if (action === 'backtest') {
      if (!deployment.api.backtest || !config.startDate) throw new Error('需要已验证的 Hummingbot 回测配置和起止日期。');
      const body = await nativeRequest(deployment, p, '/backtesting/tasks', { ...deployment.api.backtest,
        start_time: Date.parse(config.startDate) / 1000, end_time: Date.parse(config.endDate) / 1000 }, fetcher);
      if (typeof body.task_id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(body.task_id)) throw new Error('Hummingbot 未返回可验证的研究任务编号。');
      return { message: 'Hummingbot 原生回测任务已提交。', taskId: body.task_id, state: body.status };
    }
    if (!['start', 'stop'].includes(action)) throw new Error('Hummingbot 不支持此动作。');
    const body = action === 'start' ? { bot_name: name, log_level: 'INFO', script: deployment.api.script, conf: deployment.api.conf, async_backend: false }
      : { bot_name: name, skip_order_cancellation: false, async_backend: false };
    if (action === 'start' && (!body.script || !body.conf)) throw new Error('Hummingbot 原生脚本及控制器配置尚未部署。');
    const response = await nativeRequest(deployment, p, `/bot-orchestration/${action}-bot`, body, fetcher);
    if ((response.response?.success ?? response.success) !== true) throw new Error('Hummingbot 未确认指令已发布；请检查运行主机的原生 API 日志。');
    return { message: `Hummingbot 已接受${action === 'start' ? '启动' : '停止并撤单'}请求。` };
  }
  throw new Error('原生 API 不支持此动作。');
}
