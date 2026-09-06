import assert from 'node:assert/strict';
import test from 'node:test';
import { aiChat, describeAiFetchError, describeAiHttpError } from '../src/ai/provider.js';
import { checkProxyTarget, describeProxyTargetDiagnosis } from '../src/proxy.js';

function fetchFailure(code, message) {
  const cause = Object.assign(new Error(message), { code });
  return new TypeError('fetch failed', { cause });
}

test('ECONNRESET is explained as a proxy or remote reset without leaking credentials', () => {
  const text = describeAiFetchError(fetchFailure('ECONNRESET', 'read ECONNRESET'), {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    proxyConfigured: true,
  });
  assert.match(text, /api\.openai\.com/);
  assert.match(text, /ECONNRESET/);
  assert.match(text, /AI 专用代理/);
  assert.doesNotMatch(text, /user|password|sk-/);
});

test('direct connection timeout gives a useful network action', () => {
  const text = describeAiFetchError(fetchFailure('UND_ERR_CONNECT_TIMEOUT', 'Connect Timeout Error'), {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    proxyConfigured: false,
  });
  assert.match(text, /连接超时/);
  assert.match(text, /防火墙|AI 专用代理/);
});

test('HTTP authentication and quota errors are distinguished', () => {
  assert.match(describeAiHttpError('openai', 401, { error: { message: 'Incorrect API key sk-secret' } }), /API Key/);
  assert.doesNotMatch(describeAiHttpError('openai', 401, { error: { message: 'Incorrect API key sk-secret' } }), /sk-secret/);
  assert.match(describeAiHttpError('openai', 429, { error: { message: 'quota exceeded' } }), /余额|配额/);
});

test('AI proxy diagnosis reports both a wrong scheme and a blocked target', () => {
  const result = describeProxyTargetDiagnosis({
    targetHost: 'api.openai.com',
    configuredScheme: 'https',
    primaryTarget: { reachable: false, code: 'UND_ERR_CONNECT_TIMEOUT' },
    primaryIp: { ok: false },
    fallbackTarget: { reachable: false, code: 'ECONNRESET' },
    fallbackIp: { ok: true, ip: '203.0.113.10' },
  });
  assert.equal(result.code, 'PROXY_PROTOCOL_AND_TARGET_BLOCKED');
  assert.match(result.error, /HTTP CONNECT/);
  assert.match(result.error, /api\.openai\.com/);
  assert.match(result.error, /更换/);
});

test('AI proxy diagnosis recommends only a scheme correction when target works over HTTP CONNECT', () => {
  const result = describeProxyTargetDiagnosis({
    targetHost: 'api.openai.com',
    configuredScheme: 'https',
    primaryTarget: { reachable: false, code: 'ERR_SSL_WRONG_VERSION_NUMBER' },
    primaryIp: { ok: false },
    fallbackTarget: { reachable: true, status: 401 },
    fallbackIp: { ok: true, ip: '203.0.113.10' },
  });
  assert.equal(result.code, 'PROXY_PROTOCOL_MISMATCH');
  assert.match(result.error, /http:\/\//);
});

test('target diagnosis performs a real direct probe when no proxy is configured', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => {
    const cause = Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
    throw new TypeError('fetch failed', { cause });
  };
  const result = await checkProxyTarget('', 'https://fapi.binance.com/fapi/v1/time', { timeoutMs: 100 });
  assert.equal(result.ok, false);
  assert.equal(result.direct, true);
  assert.equal(result.code, 'UND_ERR_CONNECT_TIMEOUT');
  assert.match(result.error, /fapi\.binance\.com/);
});

test('explicit direct mode bypasses configured global proxy', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    assert.ok(options.dispatcher, 'direct mode must supply its own dispatcher');
    return { status: 200 };
  };
  const result = await checkProxyTarget('direct', 'https://fapi.binance.com/fapi/v1/time', { timeoutMs: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.direct, true);
  assert.equal(result.explicitDirect, true);
});

test('AI authenticated direct test uses a dedicated dispatcher without changing saved proxy', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(['AI_PROVIDER', 'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'AI_PROXY'].map((key) => [key, process.env[key]]));
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  Object.assign(process.env, {
    AI_PROVIDER: 'openai', AI_API_KEY: 'sk-test-only', AI_BASE_URL: 'https://api.openai.com/v1',
    AI_MODEL: 'gpt-test', AI_PROXY: 'http://broken.invalid:8080',
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.ok(options.dispatcher, 'direct test must provide a dedicated dispatcher');
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) };
  };
  const reply = await aiChat({ proxyOverride: 'direct', maxTokens: 5, messages: [{ role: 'user', content: 'OK' }] });
  assert.equal(reply, 'OK');
  assert.equal(process.env.AI_PROXY, 'http://broken.invalid:8080');
});
