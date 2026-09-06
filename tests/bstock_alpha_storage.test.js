const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "bstock-alpha-storage.js"), "utf8");

class MemoryStorage {
  constructor({ fail = false, blockedByKey = "" } = {}) {
    this.values = new Map();
    this.fail = fail;
    this.blockedByKey = blockedByKey;
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  removeItem(key) { this.values.delete(key); }
  setItem(key, value) {
    if (this.fail || (this.blockedByKey && this.values.has(this.blockedByKey))) {
      const error = new Error("exceeded the quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, String(value));
  }
}

function loadStorage(localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage()) {
  const context = { localStorage, sessionStorage };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { api: context.BstockAlphaStorage, localStorage, sessionStorage };
}

function pendingOrder(extra = {}) {
  return {
    orderId: "order-123",
    clientOrderId: "client-456",
    symbol: "TSMB",
    side: "sell",
    fromToken: "0x1234",
    toToken: "0x5678",
    fromSymbol: "TSMB",
    toSymbol: "USDT",
    fromAmount: "0.47631607017892623",
    toAmount: "201.28202498",
    createdAt: Date.now(),
    ...extra
  };
}

function studioJob(extra = {}) {
  return {
    jobId: "x402_d873fb17f85b5599e289e526c2d526e1",
    symbol: "SPCX",
    createdAt: Date.now(),
    ...extra
  };
}

test("pending bStock orders stay compact and ignore untrusted large fields", () => {
  const { api, localStorage } = loadStorage();
  const result = api.persistPendingOrder(pendingOrder({ reportMarkdown: "x".repeat(6_000_000) }));
  const serialized = localStorage.getItem(api.pendingOrderStorageKey);
  assert.equal(result.backend, "localStorage");
  assert.equal(result.durable, true);
  assert.ok(serialized.length < api.maxPendingOrderCharacters);
  assert.doesNotMatch(serialized, /reportMarkdown/);
});

test("pending order persistence evicts only the disposable public-data cache on quota pressure", () => {
  const localStorage = new MemoryStorage({ blockedByKey: "bstock-alpha-public-data-v2" });
  localStorage.values.set("bstock-alpha-public-data-v2", "x".repeat(10_000));
  localStorage.values.set("bstock-alpha-studio-job", "paid-job-recovery");
  const { api } = loadStorage(localStorage);
  const result = api.persistPendingOrder(pendingOrder());
  assert.equal(result.backend, "localStorage");
  assert.equal(localStorage.getItem("bstock-alpha-public-data-v2"), null);
  assert.equal(localStorage.getItem("bstock-alpha-studio-job"), "paid-job-recovery");
  assert.equal(api.readPendingOrder().orderId, "order-123");
});

test("pending order persistence degrades without throwing when localStorage is full", () => {
  const localStorage = new MemoryStorage({ fail: true });
  const sessionStorage = new MemoryStorage();
  const { api } = loadStorage(localStorage, sessionStorage);
  const result = api.persistPendingOrder(pendingOrder());
  assert.equal(result.backend, "sessionStorage");
  assert.equal(result.durable, true);
  assert.equal(api.readPendingOrder().side, "sell");
  api.clearPendingOrder();
  assert.equal(api.readPendingOrder(), null);
});

test("server-ledger recovery can continue from memory even when every browser store is unavailable", () => {
  const { api } = loadStorage(new MemoryStorage({ fail: true }), new MemoryStorage({ fail: true }));
  const result = api.persistPendingOrder(pendingOrder());
  assert.equal(result.backend, "memory");
  assert.equal(result.durable, false);
  assert.equal(api.readPendingOrder().orderId, "order-123");
});

test("Agent Studio recovery metadata is compact and strips report payloads and private fields", () => {
  const { api, localStorage } = loadStorage();
  const result = api.persistStudioJob(studioJob({
    jobToken: "private-token",
    reportMarkdown: "x".repeat(6_000_000)
  }));
  const serialized = localStorage.getItem(api.studioJobStorageKey);
  assert.equal(result.backend, "localStorage");
  assert.equal(result.durable, true);
  assert.ok(serialized.length < api.maxStudioJobCharacters);
  assert.doesNotMatch(serialized, /jobToken|reportMarkdown|private-token/);
  assert.equal(api.readStudioJob().symbol, "SPCX");
});

test("Agent Studio metadata evicts only disposable cache and survives full localStorage", () => {
  const localStorage = new MemoryStorage({ blockedByKey: "bstock-alpha-public-data-v2" });
  localStorage.values.set("bstock-alpha-public-data-v2", "x".repeat(10_000));
  localStorage.values.set("bstock-alpha-pending-order", "authoritative-order-pointer");
  const { api } = loadStorage(localStorage);
  const result = api.persistStudioJob(studioJob());
  assert.equal(result.backend, "localStorage");
  assert.equal(localStorage.getItem("bstock-alpha-public-data-v2"), null);
  assert.equal(localStorage.getItem("bstock-alpha-pending-order"), "authoritative-order-pointer");
  assert.equal(api.readStudioJob().jobId, studioJob().jobId);
});

test("Agent Studio metadata falls back to session and memory without throwing", () => {
  const localStorage = new MemoryStorage({ fail: true });
  const sessionStorage = new MemoryStorage();
  const { api } = loadStorage(localStorage, sessionStorage);
  const result = api.persistStudioJob(studioJob());
  assert.equal(result.backend, "sessionStorage");
  assert.equal(api.readStudioJob().symbol, "SPCX");
  api.clearStudioJob();
  assert.equal(api.readStudioJob(), null);

  const memoryOnly = loadStorage(new MemoryStorage({ fail: true }), new MemoryStorage({ fail: true }));
  assert.equal(memoryOnly.api.persistStudioJob(studioJob()).backend, "memory");
  assert.equal(memoryOnly.api.readStudioJob().jobId, studioJob().jobId);
});

test("public data cache is field-whitelisted and size bounded", () => {
  const { api, localStorage } = loadStorage();
  const wrote = api.writePublicDataCache({
    market: {
      deliveryMode: "LIVE",
      ignoredPayload: "x".repeat(2_000_000),
      assets: [{ symbol: "TSMB", ticker: "TSM", price: 419.99, reportMarkdown: "y".repeat(2_000_000) }]
    },
    cmc: { score: 55, regime: "NEUTRAL", ignoredPayload: "z".repeat(2_000_000) }
  });
  const serialized = localStorage.getItem(api.publicDataCacheKey);
  assert.equal(wrote, true);
  assert.ok(serialized.length < api.maxPublicCacheCharacters);
  assert.doesNotMatch(serialized, /ignoredPayload|reportMarkdown/);
  const cached = JSON.parse(serialized);
  assert.equal(cached.market.data.assets[0].symbol, "TSMB");
  assert.equal(cached.cmc.data.score, 55);
});

test("bStockAlpha resumes non-final orders from the authoritative server ledger", () => {
  const script = fs.readFileSync(path.join(root, "bstock-alpha.js"), "utf8");
  const legacyRoute = fs.readFileSync(path.join(root, "lib", "legacy-route.ts"), "utf8");
  assert.match(script, /function resumePendingOrderFromLedger\(\)/);
  assert.match(script, /liveSnapshot\?\.tradingLedger\?\.orders/);
  assert.match(script, /pendingPersistence\.durable/);
  assert.doesNotMatch(script, /localStorage\.setItem\("bstock-alpha-pending-order"/);
  assert.doesNotMatch(script, /localStorage\.(?:setItem|removeItem)\("bstock-alpha-studio-job"/);
  assert.match(script, /bstockStorage\.persistStudioJob/);
  assert.match(script, /bstockStorage\.clearStudioJob/);
  assert.match(legacyRoute, /"bstock-alpha-storage\.js"/);
});
