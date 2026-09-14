const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Pure modules only: no filesystem writes, database, provider, or exchange calls.
function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { throw new Error(`Unmocked dependency: ${name}`); } });
  return module.exports;
}
const { summarizeAutomationSelection } = load("lib/alpha-execution/automation-summary.ts");
const { automationFillBindings } = load("lib/alpha-execution/automation-origin.ts");
const plain = value => structuredClone(value);

test("selection summary strictly projects diagnostics and never exposes arbitrary secrets, raw messages or trade intents", () => {
  const hidden = "fixture-sensitive-canary-do-not-output";
  const raw = {
    apiKey: hidden, apiSecret: hidden, userId: hidden, candidateCount: 999,
    candidates: [{ symbol: "BTCUSDT", entryPrice: 100, quantity: 0.5, credential: hidden }, { secret: hidden }],
    rejections: [{ symbol: "BTCUSDT", reason: "ATR_STOP_EXCEEDS_LIMIT", message: "真实 ATR 所需止损超过已保存上限", secret: hidden,
      details: { atrPct: 2.2, requiredStopLossPct: 4.4, maxStopLossPct: 3, apiKey: hidden, evidenceId: hidden, rawText: hidden,
        strategyChecks: [{ strategy: "p2_two_source", matched: true, source: "risk_pool", credentials: { secret: hidden },
          observations: [{ observedAt: 1789000000000, snapshotAt: 1789000000000, priority: "P2", sourceStatus: "live", raw_text: hidden, evidenceId: hidden }] }] } }],
    parameterWarnings: [{ code: "PARAMETER_CONFLICT", message: "止损区间与价格偏移配置存在冲突", details: { minStopLossPct: 1.5, maxStopLossPct: 1.6, encryptedKey: hidden }, apiSecret: hidden }],
    sourceStatus: [{ source: "signal", ok: true, observedAt: 1789000000000, count: 20, message: hidden, token: hidden },
      { source: "market", ok: false, observedAt: null, count: 0, message: hidden }, { source: "credentials", ok: true, message: hidden }],
  };
  const before = structuredClone(raw);
  const result = plain(summarizeAutomationSelection(raw));
  assert.equal(JSON.stringify(result).includes(hidden), false);
  assert.deepEqual(raw, before, "summary projection must not mutate audit input");
  assert.equal(result.candidateCount, 2, "count comes from actual candidates, not an unrelated supplied value");
  assert.deepEqual(result.rejectionCounts, [{ reason: "ATR_STOP_EXCEEDS_LIMIT", count: 1 }]);
  assert.equal(result.rejections[0].message, raw.rejections[0].message);
  assert.equal(result.rejections[0].details.strategyChecks[0].observations[0].priority, "P2");
  assert.equal(result.parameterWarnings[0].message, raw.parameterWarnings[0].message);
  assert.deepEqual(result.sourceStatus.map(row => row.source), ["signal", "market"]);
  assert.match(result.sourceStatus[0].message, /本轮数据源已读取/);
  assert.match(result.sourceStatus[1].message, /本轮数据源未就绪/);
  assert.equal(result.sourceStatus[0].count, 20);
});

test("summary preserves actual rejection totals even when visible diagnostic rows are capped", () => {
  const rejections = Array.from({ length: 100 }, (_, index) => ({ symbol: `COIN${index}USDT`, reason: index < 70 ? "MARKET_NOT_TRADABLE" : "ATR_STOP_EXCEEDS_LIMIT", message: "已按本轮真实检查拒绝" }));
  const result = plain(summarizeAutomationSelection({ candidates: [], rejections }));
  assert.equal(result.candidateCount, 0);
  assert.equal(result.rejections.length, 40);
  assert.deepEqual(result.rejectionCounts, [{ reason: "MARKET_NOT_TRADABLE", count: 70 }, { reason: "ATR_STOP_EXCEEDS_LIMIT", count: 30 }]);
});

test("malformed diagnostic input stays bounded, finite and safely classified", () => {
  const result = plain(summarizeAutomationSelection({ candidateCount: Infinity,
    rejections: [{ symbol: "BTCUSDT", reason: "invalid reason <script>", detail: "中文原因".repeat(100),
      details: { score: NaN, atrPct: Infinity, observations: Array.from({ length: 50 }, () => ({ eventAt: null, side: "LONG", password: "drop-me" })) } },
      { symbol: "<script>", reason: "UNSAFE_SYMBOL" }, { symbol: "x".repeat(100), reason: "UNSAFE_SYMBOL" }],
    sourceStatus: [{ source: "signal", ok: "true", count: -1, observedAt: Infinity, message: "drop-me" }],
  }));
  assert.equal(result.candidateCount, 0); assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0].reason, "UNKNOWN_REASON"); assert.equal(result.rejections[0].message.length, 320);
  assert.equal(result.rejections[0].details.score, null); assert.equal(result.rejections[0].details.atrPct, null);
  assert.equal(result.rejections[0].details.observations.length, 10);
  assert.equal(result.sourceStatus[0].ok, false); assert.equal(result.sourceStatus[0].count, 0); assert.equal(result.sourceStatus[0].observedAt, null);
  assert.equal(JSON.stringify(result).includes("drop-me"), false);
  for (const input of [null, undefined, [], "unexpected", 42]) assert.equal(summarizeAutomationSelection(input).candidateCount, 0);
});

function bindingFixture(side = "LONG") {
  const reservation = { id: "reservation-1", planId: "plan-1", symbol: "BTCUSDT", side };
  const entry = { id: "entry-1", planId: "plan-1", symbol: "BTCUSDT", side: side === "LONG" ? "BUY" : "SELL", environment: "LIVE", market: "FUTURES",
    role: "ENTRY", filledQuantity: 0.125, quantity: 0.5, status: "PARTIALLY_FILLED", exchangeOrderId: "123456789", plan: { intent: { source: "alpha-auto:reservation-1" } } };
  return { reservation, entry };
}

test("automation origin requires a reservation-owned real ENTRY fill and allows genuine partial fills in either direction", () => {
  for (const side of ["LONG", "SHORT"]) {
    const { reservation, entry } = bindingFixture(side);
    const result = automationFillBindings([reservation], [entry]);
    assert.equal(result.size, 1);
    assert.deepEqual(plain(result.get("plan-1")), { reservationId: "reservation-1", source: "alpha-auto:reservation-1", entryOrderId: "entry-1", symbol: "BTCUSDT" });
    assert.equal(entry.filledQuantity, 0.125); assert.equal(entry.quantity, 0.5);
  }
});

test("manual, testnet, unfilled, protection and mismatched fills cannot acquire an automation origin tag", () => {
  for (const patch of [
    { environment: "TESTNET" }, { environment: "PAPER" }, { market: "SPOT" }, { role: "STOP_LOSS" }, { role: "TAKE_PROFIT" },
    { filledQuantity: 0 }, { filledQuantity: -1 }, { filledQuantity: NaN }, { filledQuantity: Infinity }, { filledQuantity: "0.125" },
    { exchangeOrderId: null }, { exchangeOrderId: "" }, { planId: "another-plan" }, { symbol: "ETHUSDT" }, { side: "SELL" },
    { plan: { intent: { source: "manual" } } }, { plan: { intent: { source: "alpha-auto:other-reservation" } } },
    { plan: { intent: { source: "alpha-auto:reservation-1-forged-suffix" } } },
  ]) {
    const { reservation, entry } = bindingFixture();
    assert.equal(automationFillBindings([reservation], [{ ...entry, ...patch }]).size, 0, JSON.stringify(patch));
  }
  for (const patch of [{ planId: null }, { planId: "different-plan" }, { id: "invalid:id" }, { id: "" }, { symbol: "ETHUSDT" }, { side: "NEUTRAL" }]) {
    const { reservation, entry } = bindingFixture();
    assert.equal(automationFillBindings([{ ...reservation, ...patch }], [entry]).size, 0, JSON.stringify(patch));
  }
  const { entry } = bindingFixture();
  assert.equal(automationFillBindings([], [entry]).size, 0, "a forged source prefix alone is not a persisted reservation");
});
