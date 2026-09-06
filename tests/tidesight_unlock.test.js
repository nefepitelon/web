const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
require("tsx/cjs");

// In-memory fixtures only: these tests never access a database, key or exchange.
let viewer, config, credential, updates, audits;
function reset() {
  viewer = { id: "fixture-user", role: "admin", plan: "max", status: "ACTIVE", twoFactorEnabled: true, twoFactorPassed: true, needsSecondFactor: false };
  config = { defaultMarket: "FUTURES", reconciliationHealthy: true, killSwitchActive: false, lastReconciledAt: new Date(), perOrderNotionalLimit: 1000 };
  credential = { verifiedAt: new Date(), enabled: true };
  updates = []; audits = [];
}
const originalLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === "server-only") return {};
  if (name === "@/lib/membership") return { getViewer: async () => viewer };
  if (name === "@/lib/prisma") return { prisma: {
    tideSightTradingCredential: { findUnique: async () => credential },
    tideSightExecutionConfig: { update: async ({ data }) => { updates.push(data); return { ...config, ...data }; } },
  } };
  if (name === "@/lib/tidesight/execution/data") return {
    getOrCreateTideSightExecutionConfig: async () => config,
    writeTideSightAudit: async (entry) => audits.push(entry),
  };
  return originalLoad.call(this, name, parent, isMain);
};
const { TideSightBinanceClient } = require("../lib/tidesight/execution/binance.ts");
const { POST } = require("../app/api/tidesight/execution/live-unlock/route.ts");

async function preflight(permissions) {
  const client = new TideSightBinanceClient({ environment: "live", market: "futures", apiKey: "fixture", apiSecret: "fixture" });
  client.syncTime = async () => {};
  client.rawRequest = async (method, route) => {
    assert.equal(method, "GET");
    if (route === "/sapi/v1/account/apiRestrictions") return permissions;
    if (route === "/fapi/v3/account") return { canTrade: true, positions: [], totalMarginBalance: "1000", availableBalance: "1000" };
    if (route === "/fapi/v1/positionSide/dual") return { dualSidePosition: false };
    throw new Error(`Unexpected fixture request: ${route}`);
  };
  try { return await client.preflight(); } finally { await client.close(); }
}
const agreements = { acknowledgeRealFunds: true, acknowledgeNoWithdrawPermission: true };
function unlock(body = agreements, origin = "https://fixture.invalid") {
  return POST(new Request("https://fixture.invalid/api/tidesight/execution/live-unlock", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
  }));
}

test("preflight allows disabled or unknown IP restrictions and reports the actual value", async () => {
  for (const ipRestrict of [true, false, undefined]) {
    const result = await preflight({ enableWithdrawals: false, enableFutures: true, ipRestrict });
    assert.equal(result.connected, true);
    assert.equal(result.withdrawalsDisabled, true);
    assert.equal(result.ipRestricted, ipRestrict ?? null);
  }
});
test("preflight still requires explicitly disabled withdrawals and Futures permission", async () => {
  for (const enableWithdrawals of [true, undefined, null, "false", 0]) {
    await assert.rejects(preflight({ enableWithdrawals, enableFutures: true, ipRestrict: true }), /交易所确认提现关闭/);
  }
  await assert.rejects(preflight({ enableWithdrawals: false, enableFutures: false, ipRestrict: false }), /Futures 交易权限/);
});
test("LIVE unlock accepts just two checked agreements, without a confirmation phrase", async () => {
  reset(); const response = await unlock();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].liveEnabled, true);
  assert.equal(updates[0].activeMode, "LIVE");
  assert.deepEqual(audits[0].metadata, { defaultMarket: "FUTURES", ...agreements });
});
test("unchecked, missing or string-valued agreements cannot unlock LIVE", async () => {
  for (const field of Object.keys(agreements)) {
    for (const value of [false, undefined, "true", 1]) {
      reset(); const response = await unlock({ ...agreements, [field]: value });
      assert.equal(response.status, 400);
      assert.equal(updates.length, 0);
    }
  }
});
test("LIVE unlock preserves admin authentication, verified 2FA and same-origin checks", async () => {
  for (const patch of [{ role: "user" }, { twoFactorEnabled: false }, { twoFactorPassed: false }, { needsSecondFactor: true }, { status: "SUSPENDED" }]) {
    reset(); Object.assign(viewer, patch);
    const response = await unlock(); assert.equal(response.status, 403); assert.equal(updates.length, 0);
  }
  reset(); viewer = null; assert.equal((await unlock()).status, 401); assert.equal(updates.length, 0);
  reset(); assert.equal((await unlock(agreements, "https://other.invalid")).status, 400); assert.equal(updates.length, 0);
});
test("LIVE unlock still rejects unhealthy or old reconciliation, Kill Switch and unverified keys", async () => {
  for (const patch of [{ reconciliationHealthy: false }, { killSwitchActive: true }, { lastReconciledAt: null }, { lastReconciledAt: new Date(Date.now() - 301_000) }]) {
    reset(); Object.assign(config, patch);
    const response = await unlock(); assert.equal(response.status, 400); assert.equal(updates.length, 0);
  }
  for (const invalid of [null, { verifiedAt: null, enabled: true }, { verifiedAt: new Date(), enabled: false }]) {
    reset(); credential = invalid;
    const response = await unlock(); assert.equal(response.status, 400); assert.equal(updates.length, 0);
  }
});
