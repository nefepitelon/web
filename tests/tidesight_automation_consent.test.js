const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
require("tsx/cjs");

// Exercise the real API and access gates, with no database, exchange or workflow IO.
let viewer, config, writes, audits, starts, failStart;
function reset() {
  viewer = { id: "fixture", role: "admin", plan: "max", status: "ACTIVE", twoFactorEnabled: true, twoFactorPassed: true, needsSecondFactor: false };
  config = { autoExecuteEnabled: false, activeMode: "LIVE", liveEnabled: true, liveUnlockedAt: new Date(), killSwitchActive: false, reconciliationHealthy: true, lastReconciledAt: new Date(), autoStopLossPct: 1, autoTakeProfitPct: 2, maxLeverage: 25, riskPerTradePct: 1.5, perOrderNotionalLimit: 1000 };
  writes = []; audits = []; starts = []; failStart = false;
}
const originalLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === "server-only") return {};
  if (name === "@/lib/membership") return { getViewer: async () => viewer };
  if (name === "workflow/api") return { start: async (...args) => { starts.push(args); if (failStart) throw new Error("Fixture workflow unavailable"); return { runId: "fixture-run" }; } };
  if (name === "@/lib/tidesight/workflow") return { tideSightAutomationWorkflow: () => {} };
  if (name === "@/lib/tidesight/execution/lease") return { withExecutionLease: async (_id, callback) => callback() };
  if (name === "@/lib/tidesight/execution/data") return { getOrCreateTideSightExecutionConfig: async () => config, writeTideSightAudit: async entry => audits.push(entry), publicConfig: value => value };
  if (name === "@/lib/prisma") return { prisma: { tideSightExecutionConfig: {
    update: async ({ data }) => { writes.push(data); Object.assign(config, data); return config; },
    updateMany: async ({ where, data }) => {
      if (where.autoGeneration && config.autoGeneration !== where.autoGeneration) return { count: 0 };
      writes.push(data); Object.assign(config, data); return { count: 1 };
    },
  } } };
  return originalLoad.call(this, name, parent, isMain);
};
const { POST } = require("../app/api/tidesight/automation/route.ts");
const agreements = { acknowledgeRealFunds: true, acknowledgeDedicatedAccount: true };
function start(body = agreements, origin = "https://fixture.invalid") {
  return POST(new Request("https://fixture.invalid/api/tidesight/automation", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
test("automatic start accepts only checked agreements without a phrase and audits consent", async () => {
  reset();
  assert.equal((await start()).status, 200);
  assert.equal(starts.length, 1);
  assert.equal(config.autoExecuteEnabled, true);
  assert.equal(config.autoRunId, "fixture-run");
  assert.deepEqual(audits[0].metadata, { ...agreements, confirmationMethod: "agreements" });
});
test("automatic start rejects missing, false and non-boolean consent before any mutation", async () => {
  for (const key of Object.keys(agreements)) for (const value of [undefined, false, "true", 1, null]) {
    reset();
    assert.equal((await start({ ...agreements, [key]: value })).status, 400);
    assert.equal(writes.length, 0);
    assert.equal(starts.length, 0);
  }
});
test("automatic start preserves authentication, admin 2FA and same-origin checks", async () => {
  for (const patch of [{ role: "user" }, { twoFactorEnabled: false }, { twoFactorPassed: false }, { needsSecondFactor: true }, { status: "SUSPENDED" }]) {
    reset(); Object.assign(viewer, patch);
    assert.equal((await start()).status, 403); assert.equal(writes.length, 0);
  }
  reset(); viewer = null; assert.equal((await start()).status, 401);
  reset(); assert.equal((await start(agreements, "https://other.invalid")).status, 400); assert.equal(writes.length, 0);
});
test("agreements never bypass LIVE, risk, protection, duplicate-start or reconciliation gates", async () => {
  for (const patch of [{ activeMode: "PAPER" }, { liveEnabled: false }, { liveUnlockedAt: null }, { killSwitchActive: true }, { reconciliationHealthy: false }, { lastReconciledAt: null }, { lastReconciledAt: new Date(Date.now() - 301000) }, { autoStopLossPct: null }, { autoTakeProfitPct: null }, { autoTakeProfitPct: 0.5 }, { maxLeverage: 20 }, { riskPerTradePct: 1 }, { autoExecuteEnabled: true }]) {
    reset(); Object.assign(config, patch);
    assert.equal((await start()).status, 400, JSON.stringify(patch));
    assert.equal(starts.length, 0); assert.equal(writes.length, 0);
  }
});
test("automatic start accepts a lower per-order cap because execution sizing remains risk-capped", async () => {
  reset(); config.perOrderNotionalLimit = 500;
  assert.equal((await start()).status, 200);
  assert.equal(config.autoExecuteEnabled, true); assert.equal(starts.length, 1);
});
test("a failed workflow start closes only the matching activation generation", async () => {
  reset(); failStart = true;
  assert.equal((await start()).status, 400);
  assert.equal(config.autoExecuteEnabled, false);
  assert.match(config.autoError, /Fixture workflow unavailable/);
});
