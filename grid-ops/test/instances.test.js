import assert from 'node:assert/strict';
import test from 'node:test';

import { getConfig } from '../src/config.js';
import { createEnvView, validateEnvUpdate } from '../src/env-config.js';
import {
  buildExchangeInstanceManifest,
  enabledInstanceValue,
  instanceOwnedEnvKeys,
  nextExchangeInstance,
  removeExchangeInstance,
} from '../src/exchange/instances.js';
import { publicExchangeManifest } from '../src/exchange/manifest.js';

function withEnv(values, fn) {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value == null) delete process.env[key]; else process.env[key] = value;
  }
  try { return fn(); }
  finally {
    for (const [key, value] of Object.entries(before)) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('enabled account instances stay adjacent and expose independent env keys', () => {
  const definitions = buildExchangeInstanceManifest('bn3,de2,bn2,unknown');
  assert.deepEqual(definitions.filter((item) => item.baseKey === 'de').map((item) => item.key), ['de', 'de2']);
  assert.deepEqual(definitions.filter((item) => item.baseKey === 'bn').map((item) => item.key), ['bn', 'bn2', 'bn3']);

  const clone = definitions.find((item) => item.key === 'bn2');
  assert.equal(clone.modeEnv, 'BN2_MODE');
  assert.equal(clone.networkEnv, 'BN2_NETWORK');
  assert.equal(clone.proxyEnv, 'BINANCE_PROXY');
  assert.equal(clone.fields.find((field) => field.prop === 'apiKey').env, 'BINANCE_API_KEY_2');
  assert.equal(clone.fields.find((field) => field.prop === 'apiSecret').env, 'BINANCE_API_SECRET_2');

  const publicClone = publicExchangeManifest([clone])[0];
  assert.equal(publicClone.baseKey, 'bn');
  assert.equal(publicClone.instanceIndex, 2);
  assert.equal(publicClone.name, 'Binance 2');
});

test('cloned live account validates only its own credentials', () => {
  assert.throws(
    () => validateEnvUpdate({ EXCHANGE_INSTANCES: 'bn2', BN2_MODE: 'live' }, {}),
    /BINANCE_API_KEY_2.*BINANCE_API_SECRET_2/,
  );
  const result = validateEnvUpdate({
    EXCHANGE_INSTANCES: 'bn2',
    BN2_MODE: 'live',
    BINANCE_API_KEY_2: 'clone-key',
    BINANCE_API_SECRET_2: 'clone-secret',
  }, {});
  assert.equal(result.updates.BN2_MODE, 'live');
  assert.equal(createEnvView(result.merged).secrets.BINANCE_API_SECRET_2, '••••cret');
});

test('runtime config keeps account credentials and paper balances independent', () => withEnv({
  EXCHANGE_INSTANCES: 'bn2',
  BN_MODE: 'live',
  BN2_MODE: 'paper',
  BINANCE_API_KEY: 'primary-key',
  BINANCE_API_KEY_2: 'secondary-key',
  BINANCE_API_SECRET: 'primary-secret',
  BINANCE_API_SECRET_2: 'secondary-secret',
}, () => {
  const config = getConfig();
  assert.deepEqual(config.instanceManifest.filter((item) => item.baseKey === 'bn').map((item) => item.key), ['bn', 'bn2']);
  assert.equal(config.exchanges.bn.apiKey, 'primary-key');
  assert.equal(config.exchanges.bn2.apiKey, 'secondary-key');
  assert.equal(config.exchanges.bn2.mode, 'paper');
  assert.notEqual(config.exchanges.bn, config.exchanges.bn2);
}));

test('a family can allocate only slots two and three', () => {
  const base = buildExchangeInstanceManifest('');
  const slot2 = nextExchangeInstance('op', base);
  assert.equal(slot2.key, 'op2');
  const slot3 = nextExchangeInstance('op', [...base, slot2]);
  assert.equal(slot3.key, 'op3');
  assert.equal(nextExchangeInstance('op', [...base, slot2, slot3]), null);
});

test('a secondary account can be removed without removing its primary account or shared proxy', () => {
  const definitions = buildExchangeInstanceManifest('bn2,bn3,de2');
  const { target, definitions: remaining } = removeExchangeInstance('bn2', definitions);

  assert.equal(target.key, 'bn2');
  assert.deepEqual(remaining.filter((item) => item.baseKey === 'bn').map((item) => item.key), ['bn', 'bn3']);
  assert.deepEqual(remaining.filter((item) => item.baseKey === 'de').map((item) => item.key), ['de', 'de2']);
  assert.equal(enabledInstanceValue(remaining), 'de2,bn3');

  const owned = instanceOwnedEnvKeys(target);
  assert.ok(owned.includes('BN2_MODE'));
  assert.ok(owned.includes('BN2_NETWORK'));
  assert.ok(owned.includes('BINANCE_API_KEY_2'));
  assert.ok(owned.includes('BINANCE_API_SECRET_2'));
  assert.ok(!owned.includes('BINANCE_PROXY'), 'family-shared proxy must survive deleting one account');
});

test('the primary account cannot be removed because every family must retain one instance', () => {
  const definitions = buildExchangeInstanceManifest('de2');
  assert.throws(
    () => removeExchangeInstance('de', definitions),
    (error) => error?.code === 'PRIMARY_INSTANCE_REQUIRED' && /至少需要保留一个账号/.test(error.message),
  );
});
