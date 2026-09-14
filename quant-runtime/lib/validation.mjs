import { createHash, timingSafeEqual } from 'node:crypto';

export const ENGINES = ['freqtrade', 'nautilus', 'hummingbot', 'lean', 'jesse', 'octobot'];
export const ACTIONS = ['status', 'preflight', 'start', 'stop', 'backtest', 'optimize'];
export const MUTATIONS = ['start', 'stop', 'backtest', 'optimize'];
export class InputError extends Error {}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const tenantId = userId => createHash('sha256').update(userId).digest('hex').slice(0, 32);
export function authorized(header, token) {
  if (!token || token.length < 32 || typeof header !== 'string') return false;
  const expected = createHash('sha256').update(`Bearer ${token}`).digest();
  const actual = createHash('sha256').update(header).digest();
  return timingSafeEqual(expected, actual);
}

const text = (v, max = 80) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new InputError('config 必须是对象。');
  const allowed = ['name', 'mode', 'exchange', 'symbols', 'timeframe', 'strategy', 'stakeAmount', 'maxOpenTrades', 'stopLossPct', 'startDate', 'endDate'];
  if (Object.keys(config).some(k => !allowed.includes(k))) throw new InputError('配置含不支持的字段。');
  const c = { ...config, mode: config.mode ?? 'paper' };
  if (!['paper', 'live'].includes(c.mode)) throw new InputError('mode 必须是 paper 或 live。');
  if (!text(c.name) || !/^[a-z][a-z0-9_-]{1,39}$/.test(c.exchange) || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(c.strategy)) throw new InputError('名称、交易所或策略无效。');
  if (!Array.isArray(c.symbols) || !c.symbols.length || c.symbols.length > 20 || c.symbols.some(s => typeof s !== 'string' || !/^[A-Z0-9][A-Z0-9/:._-]{1,39}$/.test(s)) || new Set(c.symbols).size !== c.symbols.length) throw new InputError('交易品种无效。');
  if (!/^(1m|5m|15m|30m|1h|4h|1d)$/.test(c.timeframe)) throw new InputError('周期无效。');
  if (!Number.isFinite(c.stakeAmount) || c.stakeAmount < 5 || c.stakeAmount > 100000) throw new InputError('单笔金额必须在 5 到 100000 之间。');
  if (!Number.isInteger(c.maxOpenTrades) || c.maxOpenTrades < 1 || c.maxOpenTrades > 20) throw new InputError('最大持仓数必须在 1 到 20 之间。');
  if (!Number.isFinite(c.stopLossPct) || c.stopLossPct < 0.1 || c.stopLossPct > 25) throw new InputError('止损比例必须在 0.1 到 25 之间。');
  for (const key of ['startDate', 'endDate']) if (c[key] !== undefined && !isDate(c[key])) throw new InputError('日期必须是有效的 YYYY-MM-DD。');
  if (Boolean(c.startDate) !== Boolean(c.endDate) || (c.startDate && c.startDate >= c.endDate)) throw new InputError('起止日期须成对填写且结束日期晚于开始日期。');
  return c;
}

export function validateCommand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('请求必须是对象。');
  if (Object.keys(body).some(k => !['userId', 'engine', 'action', 'targetAction', 'controlSequence', 'config', 'requestId'].includes(k))) throw new InputError('请求含不支持的字段。');
  if (!text(body.userId, 160) || !ENGINES.includes(body.engine) || !ACTIONS.includes(body.action)) throw new InputError('用户、引擎或动作无效。');
  if (MUTATIONS.includes(body.action) && (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(body.requestId))) throw new InputError('交易动作需要 8–100 位 requestId。');
  if (MUTATIONS.includes(body.action) && (!Number.isSafeInteger(body.controlSequence) || body.controlSequence <= 0)) throw new InputError('变更动作需要服务端生成的正整数 controlSequence。');
  if (body.targetAction !== undefined && (body.action !== 'preflight' || !MUTATIONS.includes(body.targetAction))) throw new InputError('targetAction 仅适用于 preflight。');
  const config = body.config === undefined && ['status', 'stop'].includes(body.action) ? undefined : validateConfig(body.config);
  return { userId: body.userId, engine: body.engine, action: body.action, config, ...(MUTATIONS.includes(body.action) ? { controlSequence: body.controlSequence } : {}), ...(body.targetAction ? { targetAction: body.targetAction } : {}), ...(body.requestId ? { requestId: body.requestId } : {}) };
}

export function approvedConfigHash(config) {
  // Research dates do not alter approved execution/risk settings.
  const { startDate, endDate, name, ...execution } = validateConfig(config);
  return digest(execution);
}

export function isPinnedImage(image) {
  return typeof image === 'string' && /^[a-z0-9./_-]+(?::[a-zA-Z0-9._-]+|@sha256:[a-f0-9]{64})$/.test(image) && !/:(latest|stable|develop|nightly|main|master)$/.test(image) && !/(?:beta|rc)(?:[.-]?\d|$)/i.test(image);
}
