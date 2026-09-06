import assert from 'node:assert/strict';
import test from 'node:test';
import { getConfigFromEnvironment } from '../src/config.js';

test('RISEx mainnet uses the current official REST and WebSocket hosts', () => {
  const config = getConfigFromEnvironment({ RS_MODE: 'paper', RS_NETWORK: 'mainnet' });
  assert.equal(config.rs.apiUrl, 'https://api.rise.trade');
  assert.equal(config.rs.wsUrl, 'wss://ws.rise.trade/ws');
});

test('Extended vault identifiers retain full decimal precision', () => {
  const vault = '9007199254740993123';
  const config = getConfigFromEnvironment({ EXTENDED_VAULT: vault });
  assert.equal(config.ex.vault, vault);
});
