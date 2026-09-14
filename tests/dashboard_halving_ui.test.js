const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { load } = require("cheerio");

const source = fs.readFileSync(path.join(__dirname, "../dashboard.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../dashboard.html"), "utf8");
const modulePromise = import("../api/halving.js");
const NOW = Date.parse("2026-09-06T12:00:00Z");
const CACHE_KEY = "welinkbtc-halving-v1";
const MAX_AGE = 24 * 60 * 60 * 1000;

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing production source section: ${start}`);
  return source.slice(from, to);
}

function harness({ now = NOW, fetchPayload = async () => { throw new Error("offline"); }, cache } = {}) {
  const $ = load(html);
  const wrappers = new WeakMap();
  const storage = new Map(cache === undefined ? [] : [[CACHE_KEY, typeof cache === "string" ? cache : JSON.stringify(cache)]]);
  const calls = [];
  function wrap(node) {
    if (!node) return null;
    if (wrappers.has(node)) return wrappers.get(node);
    const element = {
      get textContent() { return $(node).text(); },
      set textContent(value) { $(node).text(String(value)); },
      setAttribute(key, value) { $(node).attr(key, String(value)); },
      getAttribute(key) { return $(node).attr(key) ?? null; },
      removeAttribute(key) { $(node).removeAttr(key); },
      dataset: new Proxy({}, {
        get: (_, key) => $(node).attr(`data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`),
        set: (_, key, value) => { $(node).attr(`data-${String(key).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, String(value)); return true; }
      }),
      style: new Proxy({}, {
        get: (_, key) => $(node).css(key),
        set: (_, key, value) => { $(node).css(key, String(value)); return true; }
      })
    };
    wrappers.set(node, element);
    return element;
  }
  const document = {
    documentElement: {},
    querySelector: (selector) => wrap($(selector).get(0)),
    querySelectorAll: (selector) => $(selector).toArray().map(wrap)
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    document, Date: ClockDate, Intl,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    fetchJsonWithRetry: async (...args) => { calls.push(args); return fetchPayload(...args); },
    writeResilientCacheItem: (key, value) => storage.set(key, JSON.stringify(value)),
    window: {}, langButtons: [], onchainSupportOpenButton: null, onchainSupportCloseButton: null,
    updateSurfPanelLabels() {}, syncTrendNavigatorLabels() {}, updateCycleRadar() {}, renderReferences() {}, applyTheme() {}, cycleTimingSnapshot: null
  });
  vm.runInContext([
    section("const translations = {", "const metricReferences = {"),
    `let currentLanguage = "zh"; const API_BASE = ""; const HALVING_CACHE_KEY = ${JSON.stringify(CACHE_KEY)};
     const HALVING_MAX_AGE_MS = ${MAX_AGE}; let halvingSnapshot = null; let halvingInFlight = null;
     const metricSnapshot = { halvingDays: null }; const publicDataWarnings = [];`,
    section("const getCopy =", "const fetchJson ="),
    section("const writeDashboardCache =", "const clearDashboardCache ="),
    section("const validHalvingPayload =", "const loadNetwork ="),
    section("const applyLanguage =", "window.updateDashboardLanguage =")
  ].join("\n"), context);
  return {
    $, calls, storage,
    run: (code) => vm.runInContext(code, context),
    apply: (payload, fallback = false) => { context.payload = payload; return vm.runInContext(`applyHalvingPayload(payload, ${fallback})`, context); },
    validate: (payload) => { context.payload = payload; return vm.runInContext("validHalvingPayload(payload)", context); },
    load: () => vm.runInContext("loadHalving()", context),
    language: (language) => vm.runInContext(`currentLanguage = ${JSON.stringify(language)}; applyLanguage();`, context),
    tick: (milliseconds) => { now += milliseconds; }
  };
}

test("one validated halving snapshot populates overview, network, countdown, rewards, progress and timeline", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const payload = makeHalvingSnapshot(965184, "Blockstream", NOW);
  const h = harness({ fetchPayload: async () => payload });
  await h.load();
  assert.equal(h.$("#halving-days").text(), "589 天");
  assert.equal(h.$("#halving-countdown-days").text(), "589");
  assert.equal(h.$("#current-height").text(), "965,184");
  assert.equal(h.$("#network-height").text(), "965,184");
  assert.equal(h.$("#halving-target").text(), "1,050,000");
  assert.equal(h.$("#blocks-left").text(), "84,816");
  assert.equal(h.$("#radar-halving").text(), "589 天");
  assert.equal(h.$("#halving-current-reward").text(), "3.125 BTC");
  assert.equal(h.$("#halving-next-reward").text(), "1.5625 BTC");
  assert.equal(h.$("#halving-reduction").text(), "−50%");
  assert.match(h.$("#halving-reward").text(), /3\.125 → 1\.5625 BTC/);
  assert.equal(h.$(".halving-progress-shell").attr("aria-valuenow"), payload.progressPct.toFixed(2));
  assert.equal(parseFloat(h.$("#halving-progress").css("width")), payload.progressPct);
  assert.match(h.$("#halving-progress-label").text(), /59\.61%/);
  assert.match(h.$("#halving-eta").text(), /2028/);
  assert.equal(h.$("#halving-timeline-date").text(), `预计 ${payload.estimatedAt.slice(0, 10)}`);
  assert.equal(h.$(".halving-timeline li").length, 5);
  assert.equal(h.$("#halving-data-state").attr("data-state"), "live");
  assert.match(h.$("#halving-source").text(), /Blockstream.*区块数据已同步/);
  assert.equal(JSON.parse(h.storage.get(CACHE_KEY)).payload.currentHeight, 965184);
  assert.equal(h.calls[0][0], "/api/halving");
});

test("malformed or internally inconsistent payloads never replace valid UI", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const payload = makeHalvingSnapshot(965184, "mempool.space", NOW);
  const h = harness();
  h.apply(payload);
  const rendered = h.$(".halving-section").html();
  const invalid = [
    null, {}, { ...payload, currentHeight: "965184" }, { ...payload, currentHeight: NaN },
    { ...payload, currentHeight: 839999 }, { ...payload, currentHeight: 965184.5 },
    { ...payload, progressPct: NaN }, { ...payload, source: "" }, { ...payload, stale: undefined },
    { ...payload, daysRemaining: 590 }, { ...payload, blocksRemaining: 1 },
    { ...payload, currentReward: 50 }, { ...payload, nextReward: 25 },
    { ...payload, reductionPct: NaN }, { ...payload, estimatedAt: "not-a-date" },
    { ...payload, estimatedAt: new Date(Date.parse(payload.estimatedAt) + 60000).toISOString() },
    { ...payload, observedAt: new Date(NOW + 61000).toISOString() }
  ];
  for (const candidate of invalid) {
    assert.equal(h.validate(candidate), false);
    assert.equal(h.apply(candidate), false);
    assert.equal(h.$(".halving-section").html(), rendered, "Rejected data must not change rendered values");
  }
});

test("browser-cache expiration uses observedAt, not a recent savedAt", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const expired = makeHalvingSnapshot(965184, "mempool.space", NOW - MAX_AGE - 1);
  const h = harness({ cache: { savedAt: NOW, payload: expired } });
  assert.equal(h.run("readHalvingCache()"), null);
  await assert.rejects(h.load(), /offline/);
  assert.equal(h.$("#halving-countdown-days").text(), "—");
  assert.equal(h.$("#halving-data-state").attr("data-state"), "unavailable");
  const recent = makeHalvingSnapshot(965184, "Blockstream", NOW - 60000);
  const valid = harness({ cache: { savedAt: 0, payload: recent } });
  assert.equal(valid.run("readHalvingCache().currentHeight"), 965184);
});

test("network failure keeps a last-good browser snapshot visibly stale and retains its observation timestamp", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const payload = makeHalvingSnapshot(965184, "mempool.space", NOW - 120000);
  const h = harness({ cache: { savedAt: NOW, payload } });
  await h.load();
  assert.equal(h.$("#halving-days").text(), "589 天");
  assert.equal(h.$("#halving-countdown-days").text(), "589");
  assert.equal(h.$("#halving-data-state").attr("data-state"), "stale");
  assert.match(h.$("#halving-source").text(), /缓存快照.*19:58:00/);
  assert.equal(h.run("halvingSnapshot.observedAt"), payload.observedAt);
  assert.equal(h.run("publicDataWarnings.includes('halving-cache')"), true);
  assert.equal(JSON.parse(h.storage.get(CACHE_KEY)).payload.observedAt, payload.observedAt);
});

test("network failure preserves an in-memory snapshot without inventing newer height", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const payload = makeHalvingSnapshot(965184, "Blockstream", NOW);
  let offline = false;
  const h = harness({ fetchPayload: async () => { if (offline) throw new Error("offline"); return payload; } });
  await h.load();
  offline = true;
  h.storage.clear();
  h.tick(180000);
  await h.load();
  assert.equal(h.$("#current-height").text(), "965,184");
  assert.equal(h.$("#halving-data-state").attr("data-state"), "stale");
  assert.equal(h.run("halvingSnapshot.observedAt"), payload.observedAt);
});

test("an unavailable source and unusable cache show an explicit retry state, never NaN or stale countdown", async () => {
  for (const cache of [undefined, "malformed JSON", { payload: {} }]) {
    const h = harness({ cache });
    await assert.rejects(h.load(), /offline/);
    for (const id of ["halving-days", "halving-countdown-days", "current-height", "network-height", "blocks-left", "halving-eta", "halving-progress-label", "radar-halving"]) {
      assert.equal(h.$(`#${id}`).text(), "—", id);
    }
    assert.equal(h.$("#halving-data-state").attr("data-state"), "unavailable");
    assert.match(h.$("#halving-data-state").text(), /数据暂不可用.*自动重试/);
    assert.equal(h.$(".halving-progress-shell").attr("aria-valuenow"), undefined);
    assert.equal(h.$("#halving-progress").css("width"), "0%");
    assert.doesNotMatch(h.$(".halving-section").text(), /NaN|Invalid Date/);
  }
});

test("language changes translate an unavailable state without a stored snapshot", async () => {
  const h = harness();
  await assert.rejects(h.load(), /offline/);
  h.language("en");
  assert.equal(h.run("halvingSnapshot"), null);
  for (const id of ["halving-data-state", "halving-block", "halving-source"]) {
    assert.equal(h.$(`#${id}`).text(), "Data unavailable · retrying automatically");
  }
  assert.equal(h.$("#halving-timeline-date").text(), "Awaiting date estimate");
  h.language("zh");
  assert.equal(h.$("#halving-data-state").text(), "数据暂不可用 · 自动重试中");
  assert.equal(h.$("#halving-timeline-date").text(), "预计日期同步中");
  assert.equal(h.calls.length, 1);
});

test("language rerender translates runtime countdown, status, cycle progress and estimate without fetching again", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const payload = makeHalvingSnapshot(965184, "Blockstream", NOW);
  const h = harness({ fetchPayload: async () => payload });
  await h.load();
  h.language("en");
  assert.equal(h.$("#halving-days").text(), "589 days");
  assert.equal(h.$("#halving-title").text(), "Fifth Halving Progress");
  assert.match(h.$("#halving-source").text(), /Block data synced/);
  assert.match(h.$("#halving-progress-label").text(), /through the current halving cycle/);
  assert.match(h.$("#halving-timeline-date").text(), /^Est\. 2028/);
  assert.equal(h.$("#halving-countdown-days").text(), "589");
  h.language("zh");
  assert.equal(h.$("#halving-days").text(), "589 天");
  assert.equal(h.$("#halving-title").text(), "第五次减半进度");
  assert.equal(h.calls.length, 1);
});

test("concurrent refreshes share a single request and unlock after it settles", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const payload = makeHalvingSnapshot(965184, "mempool.space", NOW);
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const h = harness({ fetchPayload: () => pending });
  const first = h.load();
  const second = h.load();
  const third = h.load();
  assert.equal(h.calls.length, 1);
  resolve(payload);
  await Promise.all([first, second, third]);
  assert.equal(h.$("#halving-countdown-days").text(), "589");
  assert.equal(h.run("halvingInFlight"), null);
  await h.load();
  assert.equal(h.calls.length, 2);
});

test("an aged snapshot clears on rerender instead of extending the cache lifetime", async () => {
  const { makeHalvingSnapshot } = await modulePromise;
  const h = harness();
  h.apply(makeHalvingSnapshot(965184, "mempool.space", NOW));
  h.tick(MAX_AGE + 1);
  h.language("en");
  assert.equal(h.$("#halving-days").text(), "—");
  assert.match(h.$("#halving-data-state").text(), /Data unavailable/);
  assert.equal(h.run("halvingSnapshot"), null);
  assert.equal(h.run("metricSnapshot.halvingDays"), null);
  assert.equal(h.$(".halving-progress-shell").attr("aria-valuenow"), undefined);
  assert.equal(h.$(".halving-progress-shell").attr("aria-valuetext"), undefined);
});
