const test = require('node:test');
const assert = require('node:assert/strict');
const DAY = 86400000;
const rows = (count, value = () => 1) => Array.from({ length: count }, (_, i) => ({ date: new Date(Date.UTC(2016, 0, 1) + i * DAY).toISOString().slice(0, 10), value: value(i) }));

test('RPLR-M uses a full trailing annual baseline and correct asymmetric transforms', async () => {
  const m = await import('../lib/rplrm-model.js');
  const input = rows(400, i => i < 393 ? 1 : .5), price = rows(400, () => 10000);
  const result = m.calculateRplrmSeries(input, price);
  assert.equal(result.length, 36);
  const last = result.at(-1), expected = .5 / ((358 + 7 * .5) / 365);
  assert.ok(Math.abs(last.momentum - expected) < 1e-12);
  assert.equal(last.profitMomentum, 0);
  assert.ok(Math.abs(last.lossMomentum - (1 - 1 / expected)) < 1e-12);
  assert.ok(Math.abs(last.state - (expected - 1) / (expected + 1)) < 1e-12);
});

test('isolated missing days keep latest windows usable without interpolation; sparse years are rejected', async () => {
  const m = await import('../lib/rplrm-model.js');
  const input = rows(500), price = rows(500, () => 10000);
  const sparse = input.filter((_, i) => i !== 460);
  const result = m.calculateRplrmSeries(sparse, price);
  assert.equal(result.at(-1).date, input.at(-1).date);
  assert.equal(result.at(-1).coverage365, 364);
  assert.ok(!result.some(row => row.date === input[460].date));
  assert.equal(m.calculateRplrmSeries(input.filter((_, i) => i % 3 === 0), price).length, 0);
});

test('zero short-term profit remains a dated negative state without Infinity, nulls are not zero observations', async () => {
  const m = await import('../lib/rplrm-model.js');
  const result = m.calculateRplrmSeries(rows(400, i => i < 393 ? 1 : 0), rows(400, () => 100));
  assert.equal(result.at(-1).state, -1); assert.equal(result.at(-1).lossMomentum, null);
  assert.equal(m.parseDailyPairs([[Date.parse('2026-01-01'), null]]).length, 0);
  assert.ok(!JSON.stringify(result).includes('Infinity'));
});

test('phase labels are causal and reference month counts never force the measured phase duration', async () => {
  const m = await import('../lib/rplrm-model.js');
  const observations = rows(1100, i => i < 500 ? 4 : i < 850 ? .25 : 4).map(row => ({ date: row.date, momentum: row.value }));
  const full = observations.map(row => ({ ...row })), prefix = observations.slice(0, 800).map(row => ({ ...row }));
  const phases = m.identifyRplrmPhases(full); m.identifyRplrmPhases(prefix);
  assert.deepEqual(full.slice(0, 800).map(row => row.macroPhase), prefix.map(row => row.macroPhase));
  assert.ok(phases.some(phase => phase.phase === 'A' && phase.closed));
  assert.equal(phases.at(-1).closed, false);
  assert.deepEqual(m.REFERENCE_SPANS.map(row => row.months), [14, 13, 11]);
});

test('conditional scenarios start at the observation, exclude future price and never alter measured history', async () => {
  const m = await import('../lib/rplrm-model.js');
  const series = m.calculateRplrmSeries(rows(2000, i => 1 + .8 * Math.sin(i / 70)), rows(2000, () => 10000));
  const phases = m.identifyRplrmPhases(series), before = JSON.stringify(series);
  const forecast = m.projectRplrm(series, phases);
  assert.equal(forecast[0].date, series.at(-1).date);
  assert.ok(Math.abs(forecast[0].momentum - series.at(-1).momentum) < 1e-10);
  assert.equal(Date.parse(forecast.at(-1).date) - Date.parse(forecast[0].date), 365 * DAY);
  assert.ok(forecast.every(row => !('price' in row) && row.lowState <= row.state && row.highState >= row.state));
  assert.equal(JSON.stringify(series), before);
});

test('offline public archives preserve full dated history, indicate stale status and separate supplied references', async () => {
  const { buildRplrmPayload } = await import('../api/rplr-m.js');
  const payload = await buildRplrmPayload({ now: Date.parse('2026-11-20'), fetchImpl: async () => { throw new Error('Offline'); } });
  assert.equal(payload.entityAdjusted, false);
  assert.ok(payload.series.length > 5000);
  assert.equal(payload.series[0].date, '2012-12-30');
  assert.equal(payload.series.at(-1).date, '2026-11-06');
  assert.equal(payload.stale, true); assert.equal(payload.archiveFallback, true);
  assert.match(payload.methodology.disclosure, /not the original/);
  assert.ok(payload.snapshot.phaseMonths !== 11);
});

test('live quote refreshes do not perpetually renew the cached history TTL', async () => {
  const { default: handler } = await import('../api/rplr-m.js');
  const originalFetch = global.fetch, originalNow = Date.now;
  delete global.__welinkRplrmV1;
  let now = Date.parse('2026-11-08T00:00:00Z'), reads = 0, spot = 78000;
  Date.now = () => now;
  global.fetch = async url => {
    if (String(url).includes('ticker/price')) return new Response(JSON.stringify({ price: String(++spot) }));
    reads++; throw new Error('Offline archive');
  };
  let body;
  const response = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { body = data; }, end() {} };
  try {
    await handler({ method: 'GET' }, response); const initialReads = reads;
    const initialSavedAt = global.__welinkRplrmV1.savedAt, initialSpot = body.snapshot.price;
    now += 10000; await handler({ method: 'GET' }, response);
    assert.equal(reads, initialReads); assert.equal(global.__welinkRplrmV1.savedAt, initialSavedAt);
    assert.ok(body.snapshot.price > initialSpot);
    now += 3600000; await handler({ method: 'GET' }, response);
    assert.ok(reads > initialReads); assert.equal(response.code, 200);
  } finally { global.fetch = originalFetch; Date.now = originalNow; delete global.__welinkRplrmV1; }
});
