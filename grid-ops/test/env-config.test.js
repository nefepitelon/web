import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvView, parseEnvText, removeEnvTextKeys, upsertEnvText, validateEnvUpdate } from '../src/env-config.js';

test('environment view never returns raw private keys', () => {
  const view = createEnvView({ DECIBEL_PRIVATE_KEY: 'secret-value-1234', DE_MODE: 'live' });
  assert.equal(view.values.DE_MODE, 'live');
  assert.equal(view.secrets.DECIBEL_PRIVATE_KEY, '••••1234');
  assert.doesNotMatch(JSON.stringify(view), /secret-value/);
});

test('environment view exposes effective manifest defaults instead of blank placeholders', () => {
  const view = createEnvView({ PHOENIX_API_URL: '', PHOENIX_SOLANA_RPC: '', PHOENIX_KEYPAIR_PATH: '' });
  assert.equal(view.values.PHOENIX_API_URL, 'https://perp-api.phoenix.trade');
  assert.equal(view.values.PHOENIX_SOLANA_RPC, 'https://api.mainnet-beta.solana.com');
  assert.equal(view.values.PHOENIX_KEYPAIR_PATH, 'secrets/phoenix.key');
  assert.equal(view.values.PHOENIX_NETWORK, 'mainnet');
});

test('live mode requires every exchange credential before writing', () => {
  assert.throws(() => validateEnvUpdate({ DE_MODE: 'live' }, {}), /DECIBEL_API_KEY/);
  const result = validateEnvUpdate({ DE_MODE: 'live' }, {
    DECIBEL_API_KEY: 'api-key',
    DECIBEL_PRIVATE_KEY: 'private-key',
    DECIBEL_SUBACCOUNT: '0x1234',
  });
  assert.equal(result.merged.DE_MODE, 'live');
});

test('blank secret fields preserve existing local credentials', () => {
  const result = validateEnvUpdate({ EX_MODE: 'live', EXTENDED_API_KEY: '' }, {
    EXTENDED_API_KEY: 'saved-key',
    EXTENDED_VAULT: '123',
    EXTENDED_STARK_PRIVATE_KEY: 'saved-private',
    EXTENDED_STARK_PUBLIC_KEY: 'saved-public',
  });
  assert.equal(result.updates.EXTENDED_API_KEY, undefined);
  assert.equal(result.merged.EXTENDED_API_KEY, 'saved-key');
});

test('env writer preserves comments and updates values as complete lines', () => {
  const initial = '# local only\nDE_MODE=paper\nPAPER_BALANCE=10000\n';
  const updated = upsertEnvText(initial, { DE_MODE: 'live', DECIBEL_SUBACCOUNT: '0xabc' });
  assert.equal(parseEnvText(updated).DE_MODE, 'live');
  assert.equal(parseEnvText(updated).DECIBEL_SUBACCOUNT, '0xabc');
  assert.match(updated, /# local only/);
});

test('deleting a cloned account removes its active and commented env keys only', () => {
  const initial = [
    'GLOBAL_PROXY=http://global.example:8080',
    'BINANCE_PROXY=http://family.example:8080',
    'BINANCE_API_KEY=primary',
    'BN2_MODE=live',
    '# BN2_NETWORK=mainnet',
    'BINANCE_API_KEY_2=secondary',
    'BINANCE_API_SECRET_2=secondary-secret',
    '',
  ].join('\n');
  const updated = removeEnvTextKeys(initial, [
    'BN2_MODE', 'BN2_NETWORK', 'BINANCE_API_KEY_2', 'BINANCE_API_SECRET_2',
  ]);

  assert.doesNotMatch(updated, /BN2_MODE|BN2_NETWORK|BINANCE_API_KEY_2|BINANCE_API_SECRET_2/);
  assert.match(updated, /GLOBAL_PROXY=http:\/\/global\.example:8080/);
  assert.match(updated, /BINANCE_PROXY=http:\/\/family\.example:8080/);
  assert.match(updated, /BINANCE_API_KEY=primary/);
});
