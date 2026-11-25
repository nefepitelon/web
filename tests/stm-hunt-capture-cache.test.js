const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { gzipSync } = require('node:zlib');
const { randomBytes } = require('node:crypto');

const moduleUnderTest = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('lib/stm-hunt/capture-cache.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
vm.runInNewContext(source, { module: moduleUnderTest, exports: moduleUnderTest.exports, Buffer, require(name) {
  if (name === 'server-only') return {};
  if (name === 'node:zlib') return require(name);
  throw Error(`Unexpected dependency ${name}`);
} });
const { encodeCaptureCache, decodeCaptureCache } = moduleUnderTest.exports;
const plain = value => JSON.parse(JSON.stringify(value));

test('a realistic multi-megabyte public capture fits Runtime Cache after compression and round-trips losslessly', () => {
  const capture = { schemaVersion: 2, asOf: '2026-11-25T10:00:00.000Z',
    sources: [{ id: 'public-roster', status: 'ok', updatedAt: '2026-11-25T09:59:00.000Z' }],
    traders: Array.from({ length: 6000 }, (_, index) => ({
      id: `public-trader:${index}`, name: `公开交易员 ${index} · 東京 🌊`, address: `0x${index.toString(16).padStart(40, '0')}`,
      qualified: index % 5 === 0, visibility: index % 3 ? 'public' : 'private', updatedAt: '2026-11-25T09:59:00.000Z',
      avatarUrl: `https://example.com/avatars/${index}.png`, profileUrl: `https://example.com/profile/${index}`,
      wallets: [{ chain: 'bsc', address: `0x${index.toString(16).padStart(40, '0')}` }],
      socialLinks: [{ label: 'public profile', url: `https://example.com/social/${index}` }],
      holdings: [{ asset: 'cex:BTC', symbol: 'BTC', quantity: index / 1000, valueUsd: index * 75, side: 'long' },
        { asset: 'cex:ETH', symbol: 'ETH', quantity: index / 100, valueUsd: index * 20, side: 'long' }],
    })), candidates: [{ id: 'cex:BTC', symbol: 'BTC', price: 75000 }], sharedHoldings: [], chainEvents: [], events: [], markets: [],
  };
  assert.ok(Buffer.byteLength(JSON.stringify(capture)) > 2 * 1024 * 1024);
  const encoded = encodeCaptureCache(capture);
  assert.ok(encoded);
  assert.equal(encoded.encoding, 'gzip-base64');
  assert.ok(Buffer.byteLength(JSON.stringify(encoded)) < 1_900_000);
  assert.deepEqual(plain(decodeCaptureCache(encoded)), capture);
});

test('unicode, nested objects and JSON scalar values survive encoding', () => {
  for (const value of [{ text: '中文、日本語、é、🚀', nested: ['\u0000', { key: '值' }] }, ['a', 1, true], '🌕', 42, false]) {
    assert.deepEqual(plain(decodeCaptureCache(encodeCaptureCache(value))), value);
  }
});

test('invalid envelope shapes, noncanonical base64, corrupt gzip and non-JSON contents return null', () => {
  const valid = encodeCaptureCache({ ok: true });
  for (const value of [null, undefined, [], {}, 'raw capture', { encoding: 'plain-json', data: valid.data },
    { encoding: 'gzip-base64', data: '' }, { encoding: 'gzip-base64', data: 42 },
    { encoding: 'gzip-base64', data: valid.data + '\n' }, { encoding: 'gzip-base64', data: '____' },
    { encoding: 'gzip-base64', data: 'A===' }, { encoding: 'gzip-base64', data: 'AB==' },
    { encoding: 'gzip-base64', data: Buffer.from('not gzip').toString('base64') },
    { encoding: 'gzip-base64', data: gzipSync('not JSON').toString('base64') },
    { encoding: 'gzip-base64', data: valid.data.slice(0, -4) }]) assert.equal(decodeCaptureCache(value), null);
});

test('encoding rejects non-JSON values, oversized input and payloads that cannot fit the encoded cache limit', () => {
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(encodeCaptureCache(cyclic), null);
  assert.equal(encodeCaptureCache(undefined), null);
  assert.equal(encodeCaptureCache(1n), null);
  assert.equal(encodeCaptureCache('x'.repeat(32 * 1024 * 1024)), null);
  assert.equal(encodeCaptureCache({ random: randomBytes(2_000_000).toString('base64') }), null);
});

test('decoding caps compressed envelope bytes and expanded gzip output', () => {
  assert.equal(decodeCaptureCache({ encoding: 'gzip-base64', data: 'A'.repeat(1_900_004) }), null);
  const bomb = gzipSync(JSON.stringify({ oversized: 'x'.repeat(32 * 1024 * 1024) }), { level: 1 }).toString('base64');
  assert.ok(bomb.length < 1_900_000);
  assert.equal(decodeCaptureCache({ encoding: 'gzip-base64', data: bomb }), null);
});
