const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const START = Date.parse("2026-09-06T12:00:00Z");
const modulePromise = import("../api/halving.js");

test("halving parses only plausible whole mainnet heights", async () => {
  const { parseHalvingHeight } = await modulePromise;
  assert.equal(parseHalvingHeight(" 965184\n", START), 965184);
  for (const value of [null, false, {}, "", "NaN", "965184oops", "9.65184e5", "965184.2", "-965184", "+965184", "<html>965184</html>", 965184.5, 12345, 99999999]) {
    assert.throws(() => parseHalvingHeight(value, START), `must reject ${String(value)}`);
  }
});

test("halving snapshot derives countdown, progress and estimate from one height", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const snapshot = makeHalvingSnapshot(965184, "mempool.space", START);
  assert.equal(snapshot.halvingNumber, 5);
  assert.equal(snapshot.previousHeight, 840000);
  assert.equal(snapshot.targetHeight, 1050000);
  assert.equal(snapshot.blocksRemaining, 84816);
  assert.equal(snapshot.daysRemaining, 589);
  assert.equal(snapshot.progressPct, 125184 / 210000 * 100);
  assert.equal(Date.parse(snapshot.estimatedAt), START + 84816 * 600000);
  assert.equal(snapshot.estimateBlockSeconds, 600);
  assert.equal(snapshot.currentReward, 3.125);
  assert.equal(snapshot.nextReward, 1.5625);
  assert.equal(snapshot.reductionPct, 50);
  assert.equal(snapshot.stale, false);
});

test("halving transitions dynamically at the actual subsidy boundary", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const now = Date.parse("2028-04-20T12:00:00Z");
  const before = makeHalvingSnapshot(1049999, "Blockstream", now);
  const after = makeHalvingSnapshot(1050000, "Blockstream", now);
  assert.equal(before.blocksRemaining, 1);
  assert.equal(before.halvingNumber, 5);
  assert.equal(after.halvingNumber, 6);
  assert.equal(after.previousHeight, 1050000);
  assert.equal(after.targetHeight, 1260000);
  assert.equal(after.blocksRemaining, 210000);
  assert.equal(after.progressPct, 0);
  assert.equal(after.currentReward, 1.5625);
  assert.equal(after.nextReward, 0.78125);
});

test("halving service caches fresh snapshots and deduplicates concurrent refreshes", async () => {
  const { createHalvingService } = await modulePromise;
  let clock = START;
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const service = createHalvingService({ now: () => clock, fetchImpl: async () => {
    calls++;
    await gate;
    return new Response("965184");
  } });
  const requests = [service.getPayload(), service.getPayload(), service.getPayload()];
  release();
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.deepEqual(results[0], results[2]);
  clock += 59000;
  assert.equal((await service.getPayload()).stale, false);
  assert.equal(calls, 1);
  clock += 1000;
  await service.getPayload();
  assert.equal(calls, 2);
});

test("halving retries Blockstream after network, HTTP, empty or malformed primary data", async () => {
  const { createHalvingService } = await modulePromise;
  for (const bad of [new Error("Offline"), new Response("limited", { status: 429 }), new Response(""), new Response("965184invalid")]) {
    const calls = [];
    const service = createHalvingService({ now: () => START, fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("mempool.space")) {
        if (bad instanceof Error) throw bad;
        return bad;
      }
      return new Response("965185");
    } });
    const payload = await service.getPayload();
    assert.equal(calls.length, 2);
    assert.equal(payload.source, "Blockstream");
    assert.equal(payload.currentHeight, 965185);
    assert.equal(payload.stale, false);
  }
});

test("halving timeout covers both stalled connection and response body", async () => {
  const { createHalvingService } = await modulePromise;
  for (const stallBody of [false, true]) {
    let primarySignal;
    const service = createHalvingService({ now: () => START, timeoutMs: 15, fetchImpl: async (url, options) => {
      if (url.includes("mempool.space")) {
        primarySignal = options.signal;
        return stallBody ? { ok: true, text: () => new Promise(() => {}) } : new Promise(() => {});
      }
      return new Response("965184");
    } });
    const payload = await service.getPayload();
    assert.equal(payload.source, "Blockstream");
    assert.equal(primarySignal.aborted, true);
  }
});

test("halving outages keep the last true height and observation, expire after 24 hours, then recover", async () => {
  const { createHalvingService, HALVING_MAX_STALE_MS } = await modulePromise;
  let clock = START;
  let offline = false;
  let calls = 0;
  const service = createHalvingService({ now: () => clock, fetchImpl: async () => {
    calls++;
    if (offline) throw new Error("Offline");
    return new Response(clock === START ? "965184" : "965300");
  } });
  const initial = await service.getPayload();
  clock += 60001;
  offline = true;
  const stale = await service.getPayload();
  assert.equal(stale.currentHeight, initial.currentHeight);
  assert.equal(stale.observedAt, initial.observedAt);
  assert.equal(stale.estimatedAt, initial.estimatedAt);
  assert.equal(stale.stale, true);
  const afterFailure = calls;
  clock += 1000;
  await service.getPayload();
  assert.equal(calls, afterFailure, "outage requests must respect backoff");
  clock = START + HALVING_MAX_STALE_MS;
  assert.equal((await service.getPayload()).stale, true);
  clock++;
  assert.equal(await service.getPayload(), null, "last-good expires even during retry cooldown");
  clock += 15000;
  offline = false;
  const recovered = await service.getPayload();
  assert.equal(recovered.stale, false);
  assert.equal(recovered.currentHeight, 965300);
  assert.notEqual(recovered.observedAt, initial.observedAt);
});

test("halving rejects lagging provider snapshots without rejecting small reorgs", async () => {
  const { createHalvingService } = await modulePromise;
  let clock = START;
  let height = "965184";
  const service = createHalvingService({ now: () => clock, fetchImpl: async () => new Response(height) });
  await service.getPayload();
  clock += 60001;
  height = "960000";
  const stale = await service.getPayload();
  assert.equal(stale.currentHeight, 965184);
  assert.equal(stale.stale, true);
  clock += 15001;
  height = "965182";
  const reorganized = await service.getPayload();
  assert.equal(reorganized.currentHeight, 965182);
  assert.equal(reorganized.stale, false);
});

test("halving cold outage returns no sample data; route has 503 and no-store semantics", async () => {
  const { createHalvingService } = await modulePromise;
  const service = createHalvingService({ now: () => START, fetchImpl: async () => new Response("invalid") });
  assert.equal(await service.getPayload(), null);
  const route = fs.readFileSync(require.resolve("../app/api/halving/route.ts"), "utf8");
  assert.match(route, /status: payload \? 200 : 503/);
  assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
  assert.match(route, /"Retry-After": "15"/);
});
