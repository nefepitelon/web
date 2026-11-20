const test = require('node:test');
const assert = require('node:assert/strict');
const { createEvidenceService: createService, evidenceInput, parseAnswer, evidenceReferences } = require('../api/_asset-daily-evidence');
const createEvidenceService = options => createService({ getFallbackKey: () => '', ...options });
const now = Date.parse('2026-11-16T00:00:00Z');
const report = { asset: { id: 'SOL', symbol: 'SOL', name: 'Solana' }, generatedAt: new Date(now).toISOString(),
  quote: { price: 100, change24hPct: -2, volume24hUsd: 9000, asOf: new Date(now).toISOString() },
  trends: [{ id: 'tvl', label: '锁仓总额', current: 500, unit: 'USD', asOf: '2026-11-15' }],
  news: { status: 'ready', items: [{ id: 'one', title: '公开报道', summary: '待核实事实', kind: 'news', publishedAt: new Date(now).toISOString() }] },
  xMonitor: { status: 'unavailable', items: [] } };
const answer = { summary: '价格有所回落，需结合链上活动观察。', signals: [{ title: '行情', text: '永续合约价格24小时回落。',
  tone: 'negative', type: 'fact', evidenceIds: ['quote'] }] };
const response = output => new Response(JSON.stringify({ output_text: JSON.stringify(output), model: 'surf-2.0' }));

test('AI receives bounded observations and rejects ungrounded evidence references', () => {
  const input = evidenceInput(report);
  assert.equal(input.observations.length, 3);
  assert.equal(input.coverage.xStatus, 'unavailable');
  assert.throws(() => parseAnswer(JSON.stringify({ ...answer, signals: [{ ...answer.signals[0], evidenceIds: ['invented'] }] }), input));
  assert.throws(() => parseAnswer(JSON.stringify({ ...answer, signals: [] }), input));
  assert.deepEqual(parseAnswer(JSON.stringify(answer), input).signals[0].evidenceIds, ['quote']);
});

test('missing configuration never labels rule output as AI or fetches a paid provider', async () => {
  let calls = 0;
  const service = createEvidenceService({ getKey: () => '', now: () => now, fetchImpl: () => { calls++; } });
  const result = await service.get(report);
  assert.equal(result.status, 'unavailable'); assert.equal(result.method, 'unavailable'); assert.equal(calls, 0);
});

test('reference links come from server observations rather than invented model citations', () => {
  const linked = structuredClone(report);
  linked.quote.sourceUrl = 'https://api.hyperliquid.xyz/info';
  linked.trends[0].sourceUrl = 'https://api.llama.fi/v2/historicalChainTvl/Solana';
  linked.news.items[0].url = 'javascript:alert(1)';
  const refs = evidenceReferences(linked, evidenceInput(linked));
  assert.equal(refs[0].url, linked.quote.sourceUrl);
  assert.equal(refs[1].url, linked.trends[0].sourceUrl);
  assert.equal(refs[2].url, null);
});

test('explicit evidence work is deduplicated, cached, and retains original evidence time', async () => {
  let calls = 0, time = now;
  const service = createEvidenceService({ getKey: () => 'test-only', now: () => time, fetchImpl: async (url, init) => {
    calls++; assert.equal(url, 'https://api.asksurf.ai/gateway/v1/responses');
    const body = JSON.parse(init.body); assert.equal(body.tools, undefined);
    assert.match(body.instructions, /仅使用输入/); return response(answer);
  } });
  const [a, b] = await Promise.all([service.get(report), service.get(report)]);
  assert.equal(calls, 1); assert.equal(a.status, 'ready'); assert.equal(a.method, 'surf-ai'); assert.equal(b.summary, a.summary);
  time += 5 * 60_000;
  const cached = await service.get({ ...report, generatedAt: new Date(time).toISOString() });
  assert.equal(calls, 1); assert.equal(cached.cached, true); assert.equal(cached.sourceGeneratedAt, report.generatedAt);
  time += 11 * 60_000; await service.get(report); assert.equal(calls, 2);
});

test('AI timeouts and invalid answers degrade honestly without exposing credentials', async () => {
  const stalled = createEvidenceService({ getKey: () => 'secret-do-not-print', now: () => now, timeoutMs: 5,
    fetchImpl: () => new Promise(() => {}) });
  const timed = await stalled.get(report); assert.equal(timed.status, 'timeout'); assert.equal(timed.method, 'unavailable');
  assert.ok(!JSON.stringify(timed).includes('secret-do-not-print'));
  const invalid = createEvidenceService({ getKey: () => 'test-only', now: () => now, fetchImpl: async () => response({ ...answer,
    signals: [{ ...answer.signals[0], evidenceIds: ['unknown-source'] }] }) });
  assert.equal((await invalid.get(report)).status, 'error');
});

test('new AI generations have a rolling budget while cached reports remain readable', async () => {
  let calls = 0, time = now;
  const service = createEvidenceService({ getKey: () => 'test-only', now: () => time, maxGenerations: 2,
    fetchImpl: async () => { calls++; return response(answer); } });
  const asset = id => ({ ...report, asset: { ...report.asset, id } });
  assert.equal((await service.get(asset('SOL'))).status, 'ready');
  assert.equal((await service.get(asset('BTC'))).status, 'ready');
  assert.equal((await service.get(asset('ETH'))).status, 'busy');
  assert.equal((await service.get(asset('SOL'))).cached, true);
  assert.equal(calls, 2);
  time += 15 * 60_000;
  assert.equal((await service.get(asset('ETH'))).status, 'ready');
  assert.equal(calls, 3);
});

test('configured backup AI uses the same evidence and no tools when Surf rejects the request', async () => {
  const calls = [];
  const service = createEvidenceService({ getKey: () => 'primary-test', getFallbackKey: () => 'backup-test',
    getFallbackModel: () => 'configured-model', now: () => now, fetchImpl: async (url, init) => {
      const body = JSON.parse(init.body); calls.push({ url, body });
      if (url.includes('asksurf.ai')) return new Response('{}', { status: 402 });
      assert.equal(body.model, 'configured-model'); assert.equal(body.tools, undefined);
      return response(answer);
    } });
  const result = await service.get(report);
  assert.equal(result.status, 'ready'); assert.equal(result.method, 'openai-ai');
  assert.equal(result.provider, 'openai'); assert.equal(calls.length, 2);
  assert.equal(calls[0].body.input, calls[1].body.input);
  assert.ok(!JSON.stringify(result).includes('backup-test'));
});

test('official X originals remain distinct from public-feed references in model evidence', () => {
  const input = evidenceInput({ ...report, xMonitor: { status: 'available', items: [
    { id: 'x-original', kind: 'x', provenance: 'official-api', author: '@original', title: '原帖', publishedAt: report.generatedAt },
    { id: 'x-reported', kind: 'x', title: '二次收录', publishedAt: report.generatedAt }
  ] } });
  assert.equal(input.observations.find(o => o.id === 'event:x-original').type, 'public-x-original');
  assert.equal(input.observations.find(o => o.id === 'event:x-original').author, '@original');
  assert.equal(input.observations.find(o => o.id === 'event:x-reported').type, 'x-reference-in-public-feed');
});
