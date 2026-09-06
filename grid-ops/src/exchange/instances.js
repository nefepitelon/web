import { EXCHANGE_MANIFEST } from './manifest.js';

export const EXCHANGE_INSTANCE_ENV = 'EXCHANGE_INSTANCES';
export const MAX_EXCHANGE_INSTANCES = 3;

const ACCOUNT_SCOPED_PROPS = new Set([
  'apiKey', 'apiSecret', 'keyId', 'privateKey', 'keyPath', 'keypairPath',
  'account', 'address', 'subaccount', 'signerKey', 'vault',
  'starkPrivateKey', 'starkPublicKey',
  'passphrase', 'accountIndex', 'apiKeyIndex', 'apiPrivateKey',
  'apiPrivateKeyFile', 'pythonPath',
]);

export function instanceKey(baseKey, slot) {
  return slot === 1 ? baseKey : `${baseKey}${slot}`;
}

export function instanceEnvName(env, slot, kind = 'field') {
  if (slot === 1) return env;
  if (kind === 'mode') return `${env.replace(/_MODE$/, '')}${slot}_MODE`;
  if (kind === 'network') return `${env.replace(/_NETWORK$/, '')}${slot}_NETWORK`;
  return `${env}_${slot}`;
}

function clonePathDefault(value, slot) {
  const text = String(value || '');
  if (!text || slot === 1) return text;
  const dot = text.lastIndexOf('.');
  return dot > 0 ? `${text.slice(0, dot)}-${slot}${text.slice(dot)}` : `${text}-${slot}`;
}

export function isAccountScopedField(field) {
  return Boolean(field?.secret || field?.requiredLive || ACCOUNT_SCOPED_PROPS.has(field?.prop));
}

export function createInstanceDefinition(base, slot = 1) {
  const key = instanceKey(base.key, slot);
  const suffix = slot === 1 ? '' : ` ${slot}`;
  const fields = base.fields.map((field) => {
    const cloned = { ...field, env: instanceEnvName(field.env, slot) };
    if (slot > 1 && (field.prop === 'keyPath' || field.prop === 'keypairPath')) {
      cloned.default = clonePathDefault(field.default, slot);
    } else if (slot > 1 && isAccountScopedField(field)) {
      delete cloned.default;
    }
    return cloned;
  });
  const envMap = new Map(base.fields.map((field, index) => [field.env, fields[index].env]));

  return {
    ...base,
    key,
    baseKey: base.key,
    instanceIndex: slot,
    instanceLabel: `账号 ${slot}`,
    familyName: base.name,
    shortCode: slot === 1 ? base.shortCode : `${base.shortCode}${slot}`,
    name: `${base.name}${suffix}`,
    modeEnv: instanceEnvName(base.modeEnv, slot, 'mode'),
    networkEnv: instanceEnvName(base.networkEnv, slot, 'network'),
    // Network routing is shared by one exchange family. The route-aware fetch
    // layer is host-scoped, so allowing two accounts for the same API host to
    // select different proxies would make the last account silently win.
    proxyEnv: base.proxyEnv,
    fields,
    requiredLiveAnyOf: (base.requiredLiveAnyOf || []).map((group) => group.map((env) => envMap.get(env) || instanceEnvName(env, slot))),
    maxInstances: MAX_EXCHANGE_INSTANCES,
  };
}

export const ALL_EXCHANGE_INSTANCE_MANIFEST = EXCHANGE_MANIFEST.flatMap((base) =>
  Array.from({ length: MAX_EXCHANGE_INSTANCES }, (_, index) => createInstanceDefinition(base, index + 1)),
);

export function parseEnabledInstanceKeys(raw = '') {
  const requested = new Set(String(raw || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
  const validCloneKeys = new Set(ALL_EXCHANGE_INSTANCE_MANIFEST.filter((item) => item.instanceIndex > 1).map((item) => item.key));
  return [...requested].filter((key) => validCloneKeys.has(key));
}

export function buildExchangeInstanceManifest(raw = '') {
  const enabled = new Set(parseEnabledInstanceKeys(raw));
  return ALL_EXCHANGE_INSTANCE_MANIFEST.filter((definition) => definition.instanceIndex === 1 || enabled.has(definition.key));
}

export function enabledInstanceValue(definitions) {
  return definitions.filter((item) => item.instanceIndex > 1).map((item) => item.key).join(',');
}

export function nextExchangeInstance(baseKey, definitions) {
  const active = new Set(definitions.filter((item) => item.baseKey === baseKey).map((item) => item.instanceIndex));
  for (let slot = 2; slot <= MAX_EXCHANGE_INSTANCES; slot += 1) {
    if (!active.has(slot)) return createInstanceDefinition(EXCHANGE_MANIFEST.find((item) => item.key === baseKey), slot);
  }
  return null;
}

export function removableExchangeInstance(key, definitions) {
  const target = definitions.find((item) => item.key === String(key || '').trim().toLowerCase());
  if (!target) {
    const error = new Error('未找到要删除的交易所账号。');
    error.code = 'UNKNOWN_EXCHANGE_INSTANCE';
    throw error;
  }
  if (Number(target.instanceIndex || 1) <= 1) {
    const error = new Error(`${target.familyName || target.name} 至少需要保留一个账号，账号 1 不能删除。`);
    error.code = 'PRIMARY_INSTANCE_REQUIRED';
    throw error;
  }
  return target;
}

export function removeExchangeInstance(key, definitions) {
  const target = removableExchangeInstance(key, definitions);
  return {
    target,
    definitions: definitions.filter((item) => item.key !== target.key),
  };
}

export function instanceOwnedEnvKeys(definition) {
  if (!definition || Number(definition.instanceIndex || 1) <= 1) return [];
  return [...new Set([
    definition.modeEnv,
    definition.networkEnv,
    ...(definition.fields || []).map((field) => field.env),
  ].filter(Boolean))];
}
