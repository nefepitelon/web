const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
require("tsx/cjs");
const { Prisma } = require("@prisma/client");
let rows, starts, analysisCalls, failingSymbols, viewer, active, startFails, universeError, quickError, quickEmpty, progressStates, prepareAttempt, radarCalls, radarError, snapshotReads;
const clone = value => value === undefined ? undefined : structuredClone(value);
function reset() { rows = new Map(); starts = []; analysisCalls = 0; failingSymbols = new Set(); viewer = null; active = true; startFails = false; universeError = null; quickError = null; quickEmpty = false; progressStates = []; prepareAttempt = 1; radarCalls = []; radarError = null; snapshotReads = 0; }
function match(row, where) {
  if (typeof where.key === "string" && row.key !== where.key) return false;
  if (typeof where.key === "object" && where.key?.startsWith && !row.key.startsWith(where.key.startsWith)) return false;
  if (typeof where.key === "object" && where.key?.notIn?.includes(row.key)) return false;
  if (where.value && row.value.revision !== where.value.equals) return false;
  if (where.updatedAt?.lt && !(row.updatedAt < where.updatedAt.lt)) return false;
  return true;
}
const prisma = {
  user: { async findUnique() { return { status: active ? "ACTIVE" : "SUSPENDED" }; } },
  systemSetting: {
    async findUnique({ where }) { if (where.key.includes(":snapshot:")) snapshotReads++; return clone(rows.get(where.key) ?? null); },
    async create({ data }) {
      if (rows.has(data.key)) throw new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" });
      const row = { ...clone(data), updatedAt: new Date() }; rows.set(data.key, row); return clone(row);
    },
    async updateMany({ where, data }) { let count = 0; for (const row of rows.values()) if (match(row, where)) { Object.assign(row, clone(data), { updatedAt: new Date() }); count++; } return { count }; },
    async upsert({ where, create, update }) { const row = rows.get(where.key); if (!row) return this.create({ data: create }); Object.assign(row, clone(update), { updatedAt: new Date() }); return clone(row); },
    async findMany({ where }) { return [...rows.values()].filter(row => match(row, where)).sort((a, b) => a.key.localeCompare(b.key)).map(clone); },
    async deleteMany({ where }) { let count = 0; for (const [key, row] of rows) if (match(row, where)) { rows.delete(key); count++; } return { count }; },
  },
};
function candidate(stock, market = "ashare") {
  return { symbol: stock.symbol, name: stock.name, market, quote: { symbol: stock.symbol, name: stock.name, price: 10, changePct: 3, source: "fixture", asOf: new Date().toISOString() }, box: { low: 8, high: 10, tests: 3, testDates: [], positionPct: 100, spanPct: 25, startDate: "2026-01-01", endDate: "2026-03-01", endIndex: 59 }, volume: { days: 3, ratio: 2, ratios: Array(200).fill(2) }, flow: null, control: null, concepts: [], matchedTopics: [], score: 90, conditions: [], qualified: true, status: "达标关注", dataWarnings: [], scannedAt: new Date().toISOString() };
}
const universe = Array.from({ length: 17 }, (_, i) => ({ symbol: String(600000 + i), name: `股票${i}` }));
const market = {
  async fetchUniverse(onProgress) {
    if (onProgress) { await onProgress("A 股目录：正在验证备用数据源"); progressStates.push(clone(rows.get(store.keyForUser("alice"))?.value.job)); }
    if (universeError) throw universeError;
    return universe;
  }, async fetchTopics() { return [{ name: "机器人", changePct: 2, source: "fixture" }]; },
  async fetchQuote(symbol) { return candidate({ symbol, name: "测试股票" }).quote; }, async fetchBars() { return [{ date: "2026-09-01", open: 1, high: 2, low: 1, close: 2, volume: 100 }]; },
  async fetchCryptoUniverse() { return Array.from({ length: 510 }, (_, i) => ({ symbol: `COIN${i}USDT`, name: `COIN${i}` })); },
  async selectQuickUniverse(stocks, pool, onProgress) {
    if (onProgress) await onProgress("A 股快速扫描：批量报价已读取 17 / 17");
    if (quickError) throw quickError;
    return quickEmpty ? [] : [...stocks.slice(0, 5), ...pool];
  },
  async analyzeSymbol(stock, assetMarket) { analysisCalls++; if (failingSymbols.has(stock.symbol)) throw new Error("fixture source down"); return candidate(stock, assetMarket); },
};
const originalLoad = Module._load;
Module._load = function (name, parent, main) {
  if (name === "server-only") return {};
  if (name === "@/lib/prisma") return { prisma, isDatabaseConfigured: () => true };
  if (name === "@/lib/rate-limit") return { checkRateLimit: async () => ({ allowed: true }) };
  if (name === "@/lib/membership") return { getViewer: async () => viewer };
  if (name === "@/lib/alpha-execution/credentials") return { encryptTradingSecret: value => `encrypted:${value}`, decryptTradingSecret: value => value.replace("encrypted:", "") };
  if (name === "workflow/api") return { start: async (...args) => { if (startFails) throw new Error("fixture queue unavailable"); starts.push(args); return { runId: `run-${starts.length}` }; } };
  if (name === "workflow") return { getStepMetadata: () => ({ attempt: prepareAttempt }), FatalError: class FatalError extends Error {}, sleep: async () => {} };
  if (name === "./workflow" && parent?.filename.includes("box-breakout")) return { boxScanWorkflow() {}, boxScheduleWorkflow() {} };
  if (name === "./market" && parent?.filename.includes("box-breakout")) return market;
  if (name === "./radar-source" && parent?.filename.includes("box-breakout")) return {
    RADAR_SOURCE_LABELS: { "crypto-radar": "α-RadarTP 异动排行榜", "crypto-mainstream": "α-RadarTP 热门精选主流", "crypto-alpha-market-cap": "Binance Skills Hub Alpha 小市值", "crypto-alpha-open-interest": "Binance Skills Hub Alpha 持仓量" },
    async fetchRadarUniverse(mode, contracts) {
      radarCalls.push({ mode, contracts: contracts.length });
      if (radarError) throw radarError;
      const symbols = { "crypto-radar": "COIN400USDT", "crypto-mainstream": "COIN410USDT", "crypto-alpha-market-cap": "COIN420USDT", "crypto-alpha-open-interest": "COIN430USDT" };
      return { universe: [{ symbol: symbols[mode], name: "真实源夹具", sourceRank: 2 }], sourceCount: 2, skippedSymbols: ["SPOTONLYUSDT"], scannedAt: new Date().toISOString() };
    },
  };
  return originalLoad.call(this, name, parent, main);
};
const store = require("../lib/box-breakout/store.ts");
const service = require("../lib/box-breakout/service.ts");
const validation = require("../lib/box-breakout/validation.ts");
const schedule = require("../lib/box-breakout/schedule.ts");
const route = require("../app/api/box-breakout/route.ts");
// Exercise orchestration without the durable runtime: downlevel dynamic imports so existing
// service/Prisma mocks apply. Production retry/replay semantics are verified by deployment.
const workflowPath = require("node:path").resolve(__dirname, "../lib/box-breakout/workflow.ts");
const ts = require("typescript");
const workflowModule = new Module(workflowPath, module);
workflowModule.filename = workflowPath; workflowModule.paths = module.paths;
workflowModule._compile(ts.transpileModule(require("node:fs").readFileSync(workflowPath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, workflowPath);
const workflow = workflowModule.exports;
const commandRequest = body => new Request("https://example.test/api/box-breakout", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("box defaults are guest-readable, schedule off, secrets never serialized", async () => {
  reset();
  assert.equal((await service.dashboardState()).signedIn, false);
  assert.equal((await service.dashboardState()).settings.auto, false);
  await store.mutateState("alice", state => { state.telegramEncrypted = "SECRET"; state.generation = "PRIVATE"; });
  const state = await service.dashboardState("alice");
  assert.equal(state.settings.telegramConfigured, true);
  assert.doesNotMatch(JSON.stringify(state), /SECRET|PRIVATE|telegramEncrypted|scheduleRunId/);
  assert.equal((await service.dashboardState("bob")).settings.telegramConfigured, false);
});
test("box polling reads large snapshots once and skips unchanged versions", async () => {
  reset();
  const stockVersion = "11111111-1111-4111-8111-111111111111";
  const cryptoVersion = "22222222-2222-4222-8222-222222222222";
  await store.writeSnapshot("alice", stockVersion, [candidate({ symbol: "600000", name: "大型 A 股快照" })]);
  await store.writeSnapshot("alice", cryptoVersion, [candidate({ symbol: "BTCUSDT", name: "BTC" }, "crypto")]);
  await store.mutateState("alice", state => { state.stockSnapshot = stockVersion; state.cryptoSnapshot = cryptoVersion; });
  const first = await service.dashboardState("alice", { stockVersion: null, cryptoVersion: null });
  assert.equal(first.stocks.length, 1); assert.equal(first.crypto.length, 1); assert.equal(snapshotReads, 2);
  const next = await service.dashboardState("alice", { stockVersion, cryptoVersion });
  assert.equal(next.stockUnchanged, true); assert.equal(next.cryptoUnchanged, true);
  assert.equal(next.stocks.length, 0); assert.equal(next.crypto.length, 0); assert.equal(snapshotReads, 2);
});
test("box CAS preserves concurrent writes and user isolation", async () => {
  reset();
  await Promise.all(Array.from({ length: 8 }, (_, i) => store.mutateState("alice", state => { state.settings.sectors.push(`主题${i}`); })));
  assert.equal((await store.readState("alice")).settings.sectors.length, 8);
  assert.equal((await store.readState("bob")).settings.sectors.length, 0);
});
test("box scans reject duplicate active jobs and preserve previous results through cancellation", async () => {
  reset(); await store.mutateState("alice", state => { state.stocks = [candidate({ symbol: "600000", name: "上次结果" })]; });
  await service.executeCommand("alice", { action: "scan", mode: "market" });
  await assert.rejects(service.executeCommand("alice", { action: "scan", mode: "crypto" }), /已有扫描/);
  const job = (await store.readState("alice")).job;
  await service.executeCommand("alice", { action: "cancel" });
  assert.equal(await service.prepareScan("alice", job.id), null);
  assert.equal((await service.dashboardState("alice")).stocks[0].name, "上次结果");
  assert.equal(starts.length, 1);
});
test("box full scanner chunks are idempotent and replace only the completed market", async () => {
  reset(); await store.mutateState("alice", state => { state.crypto = [candidate({ symbol: "BTCUSDT", name: "BTC" }, "crypto")]; });
  const { jobId } = await service.createScan("alice", "market");
  const prepared = await service.prepareScan("alice", jobId);
  assert.equal(prepared.universe.length, 17);
  for (let offset = 0; offset < prepared.universe.length; offset += 8) {
    const chunk = { ...prepared, universe: prepared.universe.slice(offset, offset + 8) };
    await service.processScanChunk("alice", jobId, chunk, offset);
    await service.processScanChunk("alice", jobId, chunk, offset);
  }
  assert.equal(analysisCalls, 17);
  assert.equal((await service.dashboardState("alice")).stocks.length, 0);
  await service.finishScan("alice", jobId, prepared.topics);
  const result = await service.dashboardState("alice");
  assert.equal(result.job.status, "complete"); assert.equal(result.job.processed, 17);
  assert.equal(result.stocks.length, 17); assert.equal(result.crypto.length, 1);
  assert.equal(result.stocks[0].volume.ratios.length, 10);
  assert.equal((await store.readChunks("alice", jobId)).length, 0);
  await service.finishScan("alice", jobId, prepared.topics);
  assert.equal((await service.dashboardState("alice")).stocks.length, 17);
});
test("box crypto selects exactly top 30 perpetuals, not all 510", async () => {
  reset(); const { jobId } = await service.createScan("alice", "crypto");
  const prepared = await service.prepareScan("alice", jobId);
  assert.equal(prepared.universe.length, 30); assert.equal(prepared.universe[29].symbol, "COIN29USDT");
});

test("box new crypto commands validate explicitly and unknown source modes remain rejected", () => {
  for (const mode of ["crypto", "crypto-radar", "crypto-mainstream", "crypto-alpha-market-cap", "crypto-alpha-open-interest"]) assert.equal(validation.commandSchema.parse({ action: "scan", mode }).mode, mode);
  assert.deepEqual(validation.commandSchema.parse({ action: "scan", mode: "crypto-risk-pool", symbols: ["COIN4USDT"] }).symbols, ["COIN4USDT"]);
  assert.throws(() => validation.commandSchema.parse({ action: "scan", mode: "crypto-risk-pool" }), /雷达执行池暂无可扫描候选/);
  assert.throws(() => validation.commandSchema.parse({ action: "scan", mode: "crypto-risk-pool", symbols: ["../BTCUSDT"] }));
  assert.throws(() => validation.commandSchema.parse({ action: "scan", mode: "crypto-arbitrary" }));
  assert.throws(() => validation.commandSchema.parse({ action: "scan", mode: "crypto-radar", symbols: ["BTCUSDT"] }));
});

test("box risk-pool mode persists the visible Radar candidates and revalidates futures support", async () => {
  reset();
  const { jobId } = await service.createScan("alice", "crypto-risk-pool", undefined, ["COIN4USDT", "MISSINGUSDT", "COIN4USDT"]);
  const queued = await store.readState("alice");
  assert.deepEqual(queued.job.sourceSymbols.map(stock => stock.symbol), ["COIN4USDT", "MISSINGUSDT"]);
  assert.equal((await service.dashboardState("alice")).job.sourceSymbols, undefined);
  const prepared = await service.prepareScan("alice", jobId);
  assert.deepEqual(prepared.universe.map(stock => stock.symbol), ["COIN4USDT"]);
  const logs = (await service.dashboardState("alice")).job.logs.join("\n");
  assert.match(logs, /风控候选清单.*候选 2 项，匹配 1 项/);
  assert.match(logs, /跳过 1.*MISSINGUSDT/);
  await service.processScanChunk("alice", jobId, prepared, 0);
  await service.finishScan("alice", jobId, []);
  assert.equal((await service.dashboardState("alice")).cryptoSourceMode, "crypto-risk-pool");
});

test("box radar, mainstream and Skills Hub Alpha modes route genuine sources and update only successful crypto snapshots", async () => {
  reset();
  await store.mutateState("alice", state => { state.stocks = [candidate({ symbol: "600000", name: "A股保留" })]; state.crypto = [candidate({ symbol: "OLDUSDT", name: "涨幅榜保留" }, "crypto")]; });
  assert.equal((await service.dashboardState("alice")).cryptoSourceMode, "crypto");
  for (const mode of ["crypto-radar", "crypto-mainstream", "crypto-alpha-market-cap", "crypto-alpha-open-interest"]) {
    const before = await service.dashboardState("alice");
    const { jobId } = await service.createScan("alice", mode);
    const prepared = await service.prepareScan("alice", jobId);
    assert.equal(prepared.market, "crypto"); assert.equal(prepared.universe.length, 1);
    assert.deepEqual(radarCalls.at(-1), { mode, contracts: 510 });
    assert.equal((await service.dashboardState("alice")).cryptoSourceMode, before.cryptoSourceMode);
    assert.deepEqual((await service.dashboardState("alice")).crypto, before.crypto);
    assert.match((await service.dashboardState("alice")).job.logs.join("\n"), /原榜 2 项，匹配 1 项/);
    assert.match((await service.dashboardState("alice")).job.logs.join("\n"), /跳过 1.*SPOTONLYUSDT/);
    await service.processScanChunk("alice", jobId, prepared, 0);
    await service.finishScan("alice", jobId, []);
    const complete = await service.dashboardState("alice");
    assert.equal(complete.cryptoSourceMode, mode); assert.equal(complete.crypto[0].symbol, prepared.universe[0].symbol);
    assert.equal(complete.crypto[0].market, "crypto"); assert.equal(complete.stocks[0].name, "A股保留");
    assert.equal((await service.dashboardState("bob")).crypto.length, 0);
  }
});

test("box radar missing data and cancellation never relabel or erase the previous source", async () => {
  reset(); await store.mutateState("alice", state => { state.cryptoSourceMode = "crypto-mainstream"; state.crypto = [candidate({ symbol: "BTCUSDT", name: "保留" }, "crypto")]; });
  const { jobId } = await service.createScan("alice", "crypto-radar");
  radarError = new Error("α-RadarTP 行情源未返回有效榜单");
  await assert.rejects(service.prepareScan("alice", jobId), /行情源未返回有效榜单/);
  await service.failScan("alice", jobId, "α-RadarTP 行情源未返回有效榜单");
  let result = await service.dashboardState("alice");
  assert.equal(result.cryptoSourceMode, "crypto-mainstream"); assert.equal(result.crypto[0].symbol, "BTCUSDT");
  const next = await service.createScan("alice", "crypto-radar");
  await service.executeCommand("alice", { action: "cancel" });
  assert.equal(await service.prepareScan("alice", next.jobId), null);
  result = await service.dashboardState("alice");
  assert.equal(result.cryptoSourceMode, "crypto-mainstream"); assert.equal(result.crypto[0].symbol, "BTCUSDT");
});

test("box new crypto modes keep the shared scan lock and existing command authorization", async () => {
  reset();
  assert.equal((await route.POST(commandRequest({ action: "scan", mode: "crypto-radar" }))).status, 401);
  viewer = { id: "alice", status: "ACTIVE", needsSecondFactor: true };
  assert.equal((await route.POST(commandRequest({ action: "scan", mode: "crypto-mainstream" }))).status, 401);
  viewer.needsSecondFactor = false;
  assert.equal((await route.POST(commandRequest({ action: "scan", mode: "crypto-radar" }))).status, 200);
  assert.equal((await route.POST(commandRequest({ action: "scan", mode: "crypto-mainstream" }))).status, 409);
  assert.equal((await route.POST(commandRequest({ action: "scan", mode: "market" }))).status, 409);
  assert.equal(starts.length, 1);
});

test("box A-share completion leaves the last crypto source metadata intact", async () => {
  reset(); await store.mutateState("alice", state => { state.cryptoSourceMode = "crypto-mainstream"; state.crypto = [candidate({ symbol: "BTCUSDT", name: "保留" }, "crypto")]; state.settings.pool = [universe[0]]; });
  const { jobId } = await service.createScan("alice", "pool"), prepared = await service.prepareScan("alice", jobId);
  await service.processScanChunk("alice", jobId, prepared, 0); await service.finishScan("alice", jobId, []);
  const result = await service.dashboardState("alice");
  assert.equal(result.cryptoSourceMode, "crypto-mainstream"); assert.equal(result.crypto[0].symbol, "BTCUSDT");
});
test("box failed data and queue startup never erase a valid snapshot", async () => {
  reset(); await store.mutateState("alice", state => { state.stocks = [candidate({ symbol: "600001", name: "保留" })]; state.settings.pool = [universe[0]]; });
  failingSymbols.add(universe[0].symbol);
  const { jobId } = await service.createScan("alice", "pool"), prepared = await service.prepareScan("alice", jobId);
  await service.processScanChunk("alice", jobId, prepared, 0); await assert.rejects(service.finishScan("alice", jobId, []), /所有标的获取失败/);
  assert.equal((await service.dashboardState("alice")).job.status, "failed");
  assert.equal((await service.dashboardState("alice")).stocks[0].name, "保留");
  startFails = true; await assert.rejects(service.executeCommand("alice", { action: "scan", mode: "market" }), /后台任务/);
  assert.equal((await service.dashboardState("alice")).job.status, "failed");
});

test("box preparation publishes running stages and heartbeat before the universe is available", async () => {
  reset(); const { jobId } = await service.createScan("alice", "quick");
  const prepared = await service.prepareScan("alice", jobId, 2);
  assert.equal(progressStates[0].status, "running"); assert.equal(progressStates[0].total, 0);
  assert.match(progressStates[0].logs.join("\n"), /第 2 次尝试/);
  assert.match(progressStates[0].logs.at(-1), /备用数据源/);
  assert.ok(Number.isFinite(Date.parse(progressStates[0].heartbeatAt)));
  assert.equal(prepared.universe.length, 5);
  assert.match((await service.dashboardState("alice")).job.logs.join("\n"), /按量比、换手率/);
});

test("box transient preparation failure stays retryable and the next attempt continues the same job", async () => {
  reset(); const { jobId } = await service.createScan("alice", "quick");
  universeError = new Error("A 股列表暂不可用，公开数据源请求超时");
  await assert.rejects(service.prepareScan("alice", jobId, 1), /A 股股票列表/);
  assert.equal((await service.dashboardState("alice")).job.status, "running");
  assert.match((await service.dashboardState("alice")).job.logs.at(-1), /自动重试/);
  universeError = null;
  const prepared = await service.prepareScan("alice", jobId, 2);
  assert.equal(prepared.universe.length, 5);
  assert.equal((await service.dashboardState("alice")).job.id, jobId);
  assert.match((await service.dashboardState("alice")).job.logs.join("\n"), /第 2 次尝试/);
});

test("box cancelling during preparation cannot restart or overwrite the cancelled job", async () => {
  reset(); const { jobId } = await service.createScan("alice", "quick");
  const previous = market.fetchUniverse;
  market.fetchUniverse = async onProgress => {
    await service.executeCommand("alice", { action: "cancel" });
    await onProgress("A 股数据源返回了迟到的进度");
    return universe;
  };
  try {
    assert.equal(await service.prepareScan("alice", jobId), null);
    const state = await service.dashboardState("alice");
    assert.equal(state.job.status, "cancelled"); assert.equal(state.job.total, 0);
    assert.doesNotMatch(state.job.logs.at(-1), /迟到/);
  } finally { market.fetchUniverse = previous; }
});

test("box exhausted workflow preparation is failed in both dashboard and workflow, with a safe concrete reason", async () => {
  reset(); universeError = new Error("A 股列表暂不可用，数据源 HTTP 502 https://provider.test/?token=PRIVATE secret=PRIVATE"); prepareAttempt = 4;
  await store.mutateState("alice", state => { state.stocks = [candidate({ symbol: "600001", name: "上次结果" })]; });
  const { jobId } = await service.createScan("alice", "quick");
  await assert.rejects(workflow.boxScanWorkflow("alice", jobId), /扫描准备失败（A 股股票列表）/);
  const state = await service.dashboardState("alice");
  assert.equal(state.job.status, "failed"); assert.equal(state.job.total, 0);
  assert.match(state.job.logs.join("\n"), /重试上限/); assert.match(state.job.logs.at(-1), /HTTP 502/);
  assert.doesNotMatch(state.job.logs.join("\n"), /PRIVATE|https:\/\//);
  assert.equal(state.stocks[0].name, "上次结果");
  universeError = null;
  assert.notEqual((await service.createScan("alice", "quick")).jobId, jobId);
});

test("box valid empty quick screen completes and stores an explicit empty snapshot", async () => {
  reset(); quickEmpty = true;
  await store.mutateState("alice", state => { state.stocks = [candidate({ symbol: "600001", name: "旧结果" })]; });
  const { jobId } = await service.createScan("alice", "quick");
  await workflow.boxScanWorkflow("alice", jobId);
  const state = await service.dashboardState("alice");
  assert.equal(state.job.status, "complete"); assert.equal(state.job.processed, 0); assert.equal(state.job.errors, 0);
  assert.equal(state.stocks.length, 0); assert.match(state.job.logs.join("\n"), /零匹配结果/);
  assert.ok(rows.has(`${store.keyForUser("alice")}:snapshot:${jobId}`));
});

test("box unavailable quick quotes cannot masquerade as a successful empty screen", async () => {
  reset(); quickError = new Error("快速扫描行情源可用报价不足，请稍后重试");
  const { jobId } = await service.createScan("alice", "quick");
  await assert.rejects(workflow.boxScanWorkflow("alice", jobId), /快速扫描行情筛选/);
  assert.equal((await service.dashboardState("alice")).job.status, "failed");
  assert.equal((await service.dashboardState("alice")).asOf, null);
});

test("box all-symbol failure rejects the workflow and hides unexpected infrastructure secrets", async () => {
  reset(); await store.mutateState("alice", state => { state.settings.pool = [universe[0]]; });
  failingSymbols.add(universe[0].symbol);
  const { jobId } = await service.createScan("alice", "pool");
  await assert.rejects(workflow.boxScanWorkflow("alice", jobId), /所有标的获取失败/);
  assert.equal((await service.dashboardState("alice")).job.status, "failed");
  assert.equal(service.scanFailureReason(new Error("Prisma password=PRIVATE query SELECT")), "扫描状态存储暂不可用，请稍后重试");
  assert.equal(service.scanFailureReason(new Error("PRIVATE unknown infrastructure failure")), "后台扫描步骤异常，请稍后重试");
});
test("box stale jobs release the lock; suspended accounts cannot scan", async () => {
  reset(); const { jobId } = await service.createScan("alice", "market");
  await store.mutateState("alice", state => { state.job.heartbeatAt = new Date(Date.now() - store.JOB_STALE_MS - 1000).toISOString(); });
  assert.equal((await service.dashboardState("alice")).job.status, "failed");
  const next = await service.createScan("alice", "market"); assert.notEqual(next.jobId, jobId);
  active = false; assert.equal(await service.prepareScan("alice", next.jobId), null);
});
test("box Beijing schedule skips weekends and respects future custom times", () => {
  assert.equal(schedule.nextScheduleAt(Date.parse("2026-09-04T07:00:01Z"), ["15:00", "11:30"]), "2026-09-07T03:30:00.000Z");
  assert.equal(schedule.nextScheduleAt(Date.parse("2026-09-07T03:31:00Z"), ["11:30", "15:00"]), "2026-09-07T07:00:00.000Z");
  assert.equal(schedule.isFreshScheduleSlot("2026-09-07T03:30:00Z", Date.parse("2026-09-07T03:50:00Z")), false);
});
test("box explicit schedule enable starts one workflow; revoked generation cannot dispatch", async () => {
  reset(); await service.executeCommand("alice", { action: "settings", auto: true });
  const state = await store.readState("alice"); assert.equal(starts.length, 1); assert.ok(state.generation);
  await service.executeCommand("alice", { action: "settings", auto: false });
  assert.equal(await service.nextScheduledScan("alice", state.generation), null);
  await service.dispatchScheduledScan("alice", state.generation, new Date().toISOString());
  assert.equal(starts.length, 1); assert.equal((await store.readState("alice")).job, null);
});
test("box scheduler claim is deduplicated, even across concurrent dispatches", async () => {
  reset(); await store.mutateState("alice", state => { state.settings.auto = true; state.generation = "generation"; });
  const slot = new Date().toISOString();
  await Promise.all([service.dispatchScheduledScan("alice", "generation", slot), service.dispatchScheduledScan("alice", "generation", slot)]);
  assert.equal(starts.length, 1);
});
test("box schedule failure disables only the matching generation and reports recovery action", async () => {
  reset(); await store.mutateState("alice", state => { state.settings.auto = true; state.generation = "new"; state.scheduleRunId = "run"; });
  await service.failSchedule("alice", "old"); assert.equal((await store.readState("alice")).settings.auto, true);
  await service.failSchedule("alice", "new");
  const state = await service.dashboardState("alice");
  assert.equal(state.settings.auto, false); assert.match(state.error, /重新开启/);
  assert.equal((await store.readState("alice")).scheduleRunId, null);
});
test("box failed scans remove only their own intermediate chunks", async () => {
  reset(); const { jobId } = await service.createScan("alice", "market");
  await store.writeChunk("alice", jobId, 0, { results: [], errors: 1, warnings: [] });
  await store.writeChunk("bob", jobId, 0, { results: [], errors: 1, warnings: [] });
  await service.failScan("alice", jobId, "fixture failure");
  assert.equal((await store.readChunks("alice", jobId)).length, 0);
  assert.equal((await store.readChunks("bob", jobId)).length, 1);
});
test("box chunk snapshots are immutable and large results stay outside hot CAS state", async () => {
  reset(); const { jobId } = await service.createScan("alice", "pool").catch(async () => {
    await store.mutateState("alice", state => { state.settings.pool = [universe[0]]; });
    return service.createScan("alice", "pool");
  });
  const first = { results: [candidate(universe[0])], errors: 0, warnings: [] };
  await store.writeChunk("alice", jobId, 0, first);
  const second = await store.writeChunk("alice", jobId, 0, { results: [], errors: 1, warnings: ["later retry"] });
  assert.equal(second.results.length, 1);
  await store.mutateState("alice", state => { state.job.status = "running"; state.job.total = 1; state.job.processed = 1; });
  await service.finishScan("alice", jobId, []);
  assert.equal(rows.get(store.keyForUser("alice")).value.stocks.length, 0);
  assert.equal((await service.dashboardState("alice")).stocks.length, 1);
});
test("box validation blocks CSRF, oversized body, malformed symbols and unknown fields", async () => {
  reset();
  await assert.rejects(validation.readCommand(new Request("https://example.test/api/box-breakout", { method: "POST", body: "{}" })), /本站/);
  const huge = commandRequest({ action: "settings", sectors: ["x".repeat(17000)] }); await assert.rejects(validation.readCommand(huge), /过大/);
  assert.throws(() => validation.commandSchema.parse({ action: "scan", mode: "market", userId: "victim" }));
  assert.throws(() => validation.readSymbols(new URLSearchParams("market=crypto&symbols=https://internal")));
  assert.throws(() => validation.commandSchema.parse({ action: "settings", autoTimes: ["25:00"] }));
  assert.equal((await validation.readCommand(commandRequest({ action: "pool-add", symbol: "600519" }))).symbol, "600519");
});
test("box command route requires active authenticated account and second factor", async () => {
  reset(); assert.equal((await route.POST(commandRequest({ action: "scan", mode: "market" }))).status, 401);
  viewer = { id: "alice", status: "ACTIVE", needsSecondFactor: true }; assert.equal((await route.POST(commandRequest({ action: "scan", mode: "market" }))).status, 401);
  viewer.needsSecondFactor = false; assert.equal((await route.POST(commandRequest({ action: "scan", mode: "market" }))).status, 200);
  assert.equal(starts.length, 1);
});
test("box Telegram is encrypted/redacted and notification claims prevent duplicate mocked sends", async () => {
  reset(); const originalFetch = global.fetch; let sends = 0;
  global.fetch = async () => { sends++; return Response.json({ ok: true }); };
  try {
    const token = "123456789:abcdefghijklmnopqrstuvwxyz123456789";
    await service.executeCommand("alice", { action: "settings", telegramToken: token, telegramChat: "12345", telegramEnabled: true });
    assert.equal(sends, 0); assert.doesNotMatch(JSON.stringify(await service.dashboardState("alice")), /abcdefghijklmnopqrstuvwxyz/);
    const { jobId } = await service.createScan("alice", "market");
    await store.mutateState("alice", state => { state.job.status = "complete"; state.stocks = [candidate(universe[0])]; });
    await Promise.all([service.notifyScan("alice", jobId), service.notifyScan("alice", jobId)]);
    assert.equal(sends, 1);
  } finally { global.fetch = originalFetch; }
});

test("box optional notifications for every ranked crypto source use crypto candidates, never A-share rows", async () => {
  const originalFetch = global.fetch;
  try {
    for (const mode of ["crypto-radar", "crypto-mainstream", "crypto-alpha-market-cap", "crypto-alpha-open-interest"]) {
      reset(); const messages = [];
      global.fetch = async (_url, options) => { messages.push(JSON.parse(options.body).text); return Response.json({ ok: true }); };
      await store.mutateState("alice", state => { state.telegramEncrypted = "encrypted:fixture"; state.settings.telegramEnabled = true; state.settings.telegramChat = "12345"; });
      const { jobId } = await service.createScan("alice", mode);
      await store.mutateState("alice", state => { state.job.status = "complete"; state.stocks = [candidate({ symbol: "600000", name: "不发送" })]; state.crypto = [candidate({ symbol: "BTCUSDT", name: "BTC" }, "crypto")]; });
      await service.notifyScan("alice", jobId);
      assert.equal(messages.length, 1); assert.match(messages[0], /箱体突破 · 加密/); assert.match(messages[0], /BTCUSDT/); assert.doesNotMatch(messages[0], /600000|不发送/);
    }
  } finally { global.fetch = originalFetch; }
});
