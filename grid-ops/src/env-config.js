import {
  ALL_EXCHANGE_INSTANCE_MANIFEST,
  EXCHANGE_INSTANCE_ENV,
  buildExchangeInstanceManifest,
} from './exchange/instances.js';

const MANIFEST_FIELDS = ALL_EXCHANGE_INSTANCE_MANIFEST.flatMap((definition) => definition.fields);

export const ENV_VALUE_KEYS = [
  'PAPER_BALANCE',
  EXCHANGE_INSTANCE_ENV,
  ...ALL_EXCHANGE_INSTANCE_MANIFEST.flatMap((definition) => [
    definition.modeEnv,
    definition.networkEnv,
    ...definition.fields.filter((field) => !field.secret).map((field) => field.env),
  ]),
];

export const ENV_SECRET_KEYS = MANIFEST_FIELDS.filter((field) => field.secret).map((field) => field.env);

export const ENV_EDIT_KEYS = [...ENV_VALUE_KEYS, ...ENV_SECRET_KEYS];

const DEFAULTS = Object.fromEntries([
  ['PAPER_BALANCE', '10000'],
  [EXCHANGE_INSTANCE_ENV, ''],
  ...ALL_EXCHANGE_INSTANCE_MANIFEST.flatMap((definition) => [
    [definition.modeEnv, 'paper'],
    [definition.networkEnv, definition.defaultNetwork || 'mainnet'],
    ...definition.fields.map((field) => [field.env, String(field.default ?? '')]),
  ]),
]);

const FIELD_BY_ENV = new Map(MANIFEST_FIELDS.map((field) => [field.env, field]));
const URL_KEYS = new Set(MANIFEST_FIELDS.filter((field) => field.type === 'url').map((field) => field.env));
const WS_URL_KEYS = new Set(MANIFEST_FIELDS.filter((field) => field.type === 'wsurl').map((field) => field.env));
const MODE_KEYS = new Set(ALL_EXCHANGE_INSTANCE_MANIFEST.map((definition) => definition.modeEnv));
const NETWORK_KEYS = new Set(ALL_EXCHANGE_INSTANCE_MANIFEST.map((definition) => definition.networkEnv));

export function parseEnvText(content = '') {
  const values = {};
  for (const line of String(content).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    const quoted = value.match(/^"([^"]*)"$|^'([^']*)'$/);
    if (quoted) value = quoted[1] ?? quoted[2] ?? '';
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}

export function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  return text.length <= 4 ? '••••' : `••••${text.slice(-4)}`;
}

function cleanValue(key, raw) {
  const value = raw == null ? '' : String(raw).trim();
  if (value.length > 4096 || /[\r\n\0]/.test(value)) throw new Error(`${key} 包含非法换行、控制字符或内容过长。`);
  const field = FIELD_BY_ENV.get(key);
  if (value && /\s/.test(value) && !field?.allowWhitespace) throw new Error(`${key} 不能包含空格。`);

  if (MODE_KEYS.has(key) && !/^(paper|live)$/i.test(value)) throw new Error(`${key} 只能选择 paper 或 live。`);
  if (NETWORK_KEYS.has(key) && !/^(mainnet|testnet)$/i.test(value)) throw new Error(`${key} 只能选择 mainnet 或 testnet。`);
  if (key === EXCHANGE_INSTANCE_ENV && value && !/^[a-z0-9,]+$/i.test(value)) throw new Error(`${key} 格式无效。`);
  if (key === 'PAPER_BALANCE' && (!/^\d+(\.\d+)?$/.test(value) || Number(value) < 100 || Number(value) > 1_000_000_000)) {
    throw new Error('PAPER_BALANCE 必须是 100 到 1,000,000,000 之间的数字。');
  }
  if ((field?.type === 'number' || field?.type === 'integer') && value) {
    if (!/^\d+(\.\d+)?$/.test(value) || (field.type === 'integer' && !/^\d+$/.test(value))) {
      throw new Error(`${key} 必须是${field.type === 'integer' ? '整数' : '数字'}。`);
    }
    const number = Number(value);
    if ((field.min != null && number < field.min) || (field.max != null && number > field.max)) {
      throw new Error(`${key} 必须在 ${field.min ?? '-∞'} 到 ${field.max ?? '∞'} 之间。`);
    }
  }
  if (URL_KEYS.has(key) && value && !/^https?:\/\/\S+$/i.test(value)) throw new Error(`${key} 必须以 http:// 或 https:// 开头。`);
  if (WS_URL_KEYS.has(key) && value && !/^wss?:\/\/\S+$/i.test(value)) throw new Error(`${key} 必须以 ws:// 或 wss:// 开头。`);
  return value;
}

export function validateEnvUpdate(input, current = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('环境配置格式无效。');
  const updates = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!ENV_EDIT_KEYS.includes(key)) throw new Error(`不允许修改该字段：${key}`);
    const value = cleanValue(key, raw);
    if (ENV_SECRET_KEYS.includes(key) && !value) continue;
    updates[key] = value;
  }

  const merged = { ...DEFAULTS, ...current, ...updates };
  const missing = [];
  for (const definition of buildExchangeInstanceManifest(merged[EXCHANGE_INSTANCE_ENV] || '')) {
    if (String(merged[definition.modeEnv]).toLowerCase() !== 'live') continue;
    for (const field of definition.fields.filter((item) => item.requiredLive)) {
      if (!String(merged[field.env] || '').trim()) missing.push(field.env);
    }
    for (const group of definition.requiredLiveAnyOf || []) {
      if (!group.some((env) => String(merged[env] || '').trim())) missing.push(`${group.join(' / ')}（二选一）`);
    }
  }
  if (missing.length) throw new Error(`切换 live 前请填写：${missing.join('、')}`);
  return { updates, merged };
}

export function upsertEnvText(content, updates) {
  let next = String(content || '');
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
    if (pattern.test(next)) next = next.replace(pattern, line);
    else next = `${next.trimEnd()}\n${line}\n`;
  }
  return next.trimStart().replace(/\n?$/, '\n');
}

export function removeEnvTextKeys(content, keys) {
  const removed = new Set((keys || []).map((key) => String(key || '').trim()).filter(Boolean));
  if (!removed.size) return String(content || '').trimStart().replace(/\n?$/, '\n');
  const lines = String(content || '').split(/\r?\n/).filter((line) => {
    const match = line.match(/^\s*#?\s*([A-Z0-9_]+)\s*=/);
    return !match || !removed.has(match[1]);
  });
  return lines.join('\n').replace(/^\n+/, '').replace(/\n*$/, '\n');
}

export function createEnvView(source = {}) {
  const values = {};
  const secrets = {};
  for (const key of ENV_VALUE_KEYS) {
    const supplied = source[key];
    values[key] = String(supplied == null || supplied === '' ? (DEFAULTS[key] ?? '') : supplied);
  }
  for (const key of ENV_SECRET_KEYS) secrets[key] = maskSecret(source[key]);
  return { values, secrets, port: '8080' };
}
