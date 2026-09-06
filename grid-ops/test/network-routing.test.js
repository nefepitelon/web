import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { getConfig } from '../src/config.js';
import { getAiConfig } from '../src/ai/provider.js';
import {
  createAptosClientProvider,
  createDispatcher,
  checkGlobalProxyReadiness,
  networkRouteCandidates,
  proxyRuntimeState,
  selectNetworkRoute,
  setupProxies,
} from '../src/proxy.js';

const ENV_KEYS = [
  'GLOBAL_PROXY', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'AI_PROXY',
  'DECIBEL_PROXY', 'EXTENDED_PROXY', 'RISEX_PROXY', 'BINANCE_PROXY', 'ONDO_PROXY',
];

function saveEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test('ambient HTTP(S)_PROXY never becomes the hidden trading proxy', (t) => {
  const original = saveEnv();
  t.after(() => restoreEnv(original));
  for (const key of ENV_KEYS) process.env[key] = '';
  process.env.HTTP_PROXY = 'http://stale-system-proxy.invalid:8080';
  process.env.HTTPS_PROXY = 'http://stale-system-proxy.invalid:8080';

  const config = getConfig();
  assert.equal(config.globalProxy, '');
  assert.equal(config.exchanges.de.dedicatedProxy, '');
  assert.equal(config.exchanges.bn.dedicatedProxy, '');
  assert.equal(config.exchanges.de.proxy, 'direct');
  assert.equal(config.exchanges.bn.proxy, 'direct');
});

test('AI route ignores exchange proxies and defaults to an explicit direct dispatcher', (t) => {
  const original = saveEnv();
  t.after(() => restoreEnv(original));
  for (const key of ENV_KEYS) process.env[key] = '';
  process.env.DECIBEL_PROXY = 'http://exchange-only.invalid:8080';

  const config = getAiConfig();
  assert.equal(config.effectiveProxy, 'direct');
  assert.equal(config.proxySource, 'direct');
  assert.equal(config.proxyConfigured, false);
});

test('a dedicated exchange proxy remains host-scoped while the process default stays direct', async (t) => {
  const result = await setupProxies({
    globalProxy: '',
    exchanges: {
      de: { apiUrl: 'https://api.mainnet.aptoslabs.com/decibel', proxy: 'http://127.0.0.1:65530', proxySource: 'exchange' },
      ex: { apiUrl: 'https://api.starknet.extended.exchange', proxy: '', proxySource: 'none' },
      rs: { apiUrl: 'https://api.risex.trade', proxy: '', proxySource: 'none' },
      bn: { apiUrl: 'https://fapi.binance.com', proxy: 'direct', proxySource: 'direct' },
      op: { apiUrl: 'https://api.ondoperps-sandbox.xyz', proxy: '', proxySource: 'none' },
    },
  });
  t.after(async () => { try { await result.dispatcher?.close?.(); } catch {} });

  assert.equal(result.mode, 'proxy');
  assert.equal(result.used, null);
  assert.equal(proxyRuntimeState().de.source, 'exchange');
  assert.equal(proxyRuntimeState().ex.source, 'none');
  assert.equal(proxyRuntimeState().bn.source, 'direct');
});

test('route candidates always prefer direct, then dedicated, then global', () => {
  assert.deepEqual(
    networkRouteCandidates({ dedicatedProxy: 'http://dedicated.test:8080', globalProxy: 'http://global.test:8080' })
      .map((item) => item.source),
    ['direct', 'exchange', 'global'],
  );
});

test('target-aware selector automatically falls back without replaying a request', async () => {
  const calls = [];
  const result = await selectNetworkRoute({
    targetUrl: 'https://exchange.example/status',
    dedicatedProxy: 'http://dedicated.test:8080',
    globalProxy: 'http://global.test:8080',
    probe: async (candidate) => {
      calls.push(candidate.source);
      return candidate.source === 'global'
        ? { reachable: true, status: 200, proxy: candidate.proxy }
        : { reachable: false, code: `${candidate.source.toUpperCase()}_DOWN`, proxy: candidate.proxy };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'global');
  assert.equal(result.autoSwitched, true);
  assert.deepEqual(calls, ['direct', 'exchange', 'global']);
  assert.deepEqual(result.attempts.map((item) => item.ok), [false, false, true]);
});

test('one route must reach both Phoenix API and Solana RPC before it is selected', async () => {
  const calls = [];
  const result = await selectNetworkRoute({
    targetUrl: 'https://perp-api.phoenix.trade/v1/view/exchange/status',
    additionalTargetUrls: ['https://api.mainnet-beta.solana.com'],
    dedicatedProxy: 'http://phoenix-proxy.test:8080',
    probe: async (candidate, targetUrl) => {
      calls.push(`${candidate.source}:${new URL(targetUrl).hostname}`);
      const directRpcFailure = candidate.source === 'direct' && targetUrl.includes('solana.com');
      return directRpcFailure
        ? { reachable: false, code: 'RPC_DOWN', proxy: candidate.proxy }
        : { reachable: true, status: 200, proxy: candidate.proxy };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'exchange');
  assert.deepEqual(calls, [
    'direct:perp-api.phoenix.trade', 'direct:api.mainnet-beta.solana.com',
    'exchange:perp-api.phoenix.trade', 'exchange:api.mainnet-beta.solana.com',
  ]);
  assert.deepEqual(result.attempts.map((item) => item.ok), [false, true]);
});

test('global channel diagnostic reports a failed LIVE target without deciding console startup', async () => {
  const cfg = {
    globalProxy: 'http://global.test:8080',
    exchanges: {
      bn: { mode: 'live', apiUrl: 'https://fapi.binance.com' },
    },
  };
  const failed = await checkGlobalProxyReadiness(cfg, {
    checkIp: async () => ({ ok: true, ip: '203.0.113.10' }),
    checkTarget: async () => ({ ok: false, code: 'ECONNRESET', targetHost: 'fapi.binance.com' }),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.code, 'GLOBAL_PROXY_NOT_READY');

  const ready = await checkGlobalProxyReadiness(cfg, {
    checkIp: async () => ({ ok: true, ip: '203.0.113.10' }),
    checkTarget: async () => ({ ok: true, status: 200, targetHost: 'fapi.binance.com' }),
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.targets[0].status, 200);
});

test('Decibel Aptos client provider carries JSON over its selected dispatcher', async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'application/json', 'x-route-test': 'ok' });
    response.end(JSON.stringify({ path: request.url, method: request.method }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const dispatcher = await createDispatcher('direct');
  t.after(async () => { try { await dispatcher?.close?.(); } catch {} });
  const provider = createAptosClientProvider(dispatcher, 2000);
  const response = await provider({
    url: `http://127.0.0.1:${port}/v1/test`,
    method: 'GET',
    params: { ledger_version: 123 },
    headers: { accept: 'application/json' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.method, 'GET');
  assert.match(response.data.path, /ledger_version=123/);
  assert.equal(response.headers['x-route-test'], 'ok');
});
