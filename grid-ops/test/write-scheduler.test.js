import assert from 'node:assert/strict';
import test from 'node:test';
import { ExchangeWriteScheduler, isExplicitRateLimitError } from '../src/exchange/write-scheduler.js';

test('write scheduler serializes concurrent account writes in submission order', async () => {
  let now = 10_000;
  const waits = [];
  const scheduler = new ExchangeWriteScheduler({
    minGapMs: 200,
    now: () => now,
    sleep: async (ms) => { waits.push(ms); now += ms; },
  });
  const calls = [];
  await Promise.all([
    scheduler.run(async () => { calls.push('first'); return 1; }),
    scheduler.run(async () => { calls.push('second'); return 2; }),
    scheduler.run(async () => { calls.push('third'); return 3; }),
  ]);
  assert.deepEqual(calls, ['first', 'second', 'third']);
  assert.deepEqual(waits, [200, 200]);
});

test('write scheduler retries only explicit rate-limit rejections', async () => {
  let now = 10_000;
  const waits = [];
  const scheduler = new ExchangeWriteScheduler({
    label: 'Ondo Perps', minGapMs: 250, baseDelayMs: 1000, maxRetries: 3,
    now: () => now,
    sleep: async (ms) => { waits.push(ms); now += ms; },
  });
  let calls = 0;
  const result = await scheduler.run(async () => {
    calls++;
    if (calls === 1) {
      const error = new Error('Rate limited for account');
      error.exchangeCode = 'too_many_requests';
      error.httpStatus = 429;
      error.retryAfterMs = 1750;
      throw error;
    }
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1750]);

  const ambiguous = new Error('HTTP 429 after transport timeout');
  ambiguous.httpStatus = 429;
  ambiguous.statusUnknown = true;
  assert.equal(isExplicitRateLimitError(ambiguous), false);
});
