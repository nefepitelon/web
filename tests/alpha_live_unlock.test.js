const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Every route dependency is isolated; no production database, credential or exchange is reachable.
function load(file, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Error, Response, Request, URL,
    require(name) { if (name in imports) return imports[name]; throw new Error(`Unmocked dependency: ${name}`); } });
  return module.exports;
}
const agreements = { acknowledgeRealFunds: true, acknowledgeNoWithdrawPermission: true };
function fixture(options = {}) {
  const owner = "fixture-alpha-admin";
  const viewer = options.viewer === null ? null : { id: owner, status: "ACTIVE", role: "admin", plan: "max", needsSecondFactor: false,
    twoFactorEnabled: true, twoFactorPassed: true, ...options.viewer };
  const config = { defaultMarket: "FUTURES", reconciliationHealthy: true, killSwitchActive: false, perOrderNotionalLimit: 100, ...options.config };
  const credential = options.credential === null ? null : { enabled: true, verifiedAt: new Date(), ...options.credential };
  const calls = { viewers: 0, configReads: 0, credentials: [], updates: [], audits: [] };
  const access = load("lib/alpha-execution/access.ts", { "server-only": {}, zod: require("zod"), "@/lib/membership": {
    getViewer: async () => { calls.viewers += 1; return viewer; },
  } });
  const security = load("lib/request-security.ts", { "next/headers": { headers() { throw new Error("Unexpected ambient headers access"); } } });
  const route = load("app/api/alpha-execution/live-unlock/route.ts", {
    zod: require("zod"), "@prisma/client": { AlphaExecutionMode: { LIVE: "LIVE", PAPER: "PAPER" }, AlphaExecutionState: { RISK_APPROVED: "RISK_APPROVED", CANCELED: "CANCELED" } },
    "@/lib/alpha-execution/access": access, "@/lib/request-security": security,
    "@/lib/alpha-execution/data": {
      getOrCreateAlphaExecutionConfig: async userId => { assert.equal(userId, owner); calls.configReads += 1; return config; },
      writeAlphaAudit: async event => { calls.audits.push(structuredClone(event)); },
    },
    "@/lib/prisma": { prisma: {
      alphaTradingCredential: { findUnique: async input => { calls.credentials.push(structuredClone(input)); return credential; } },
      alphaExecutionConfig: { update: async ({ where, data }) => { assert.equal(where.userId, owner); calls.updates.push(structuredClone(data)); return { ...config, ...data }; } },
    } },
  });
  return { calls, owner, post(body = agreements, origin = "https://fixture.invalid") {
    return route.POST(new Request("https://fixture.invalid/api/alpha-execution/live-unlock", {
      method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
    }));
  } };
}

test("Alpha LIVE unlock accepts two actual boolean agreements without a confirmation phrase", async () => {
  const f = fixture(); const response = await f.post(); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.ok, true); assert.ok(Number.isFinite(Date.parse(body.liveUnlockedAt)));
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(f.calls.updates.length, 1);
  assert.equal(f.calls.updates[0].liveEnabled, true); assert.equal(f.calls.updates[0].activeMode, "LIVE");
  assert.equal(f.calls.updates[0].liveUnlockedBy, f.owner);
  assert.deepEqual(f.calls.credentials[0].where, { userId_environment_market: { userId: f.owner, environment: "LIVE", market: "FUTURES" } });
  assert.deepEqual(f.calls.audits[0].metadata, { defaultMarket: "FUTURES", ...agreements });
  assert.match(f.calls.audits[0].message, /两项协议/);
});

test("missing, unchecked, string or numeric agreements reject before any unlock update", async () => {
  for (const field of Object.keys(agreements)) for (const value of [undefined, null, false, "true", "false", 1, [], {}]) {
    const f = fixture(); const response = await f.post({ ...agreements, [field]: value });
    assert.equal(response.status, 400, `${field}=${JSON.stringify(value)}`); assert.equal((await response.json()).ok, false);
    assert.equal(f.calls.updates.length, 0); assert.equal(f.calls.audits.length, 0); assert.equal(f.calls.configReads, 0);
  }
});

test("real access guard requires an active administrator with completed 2FA before unlocking", async () => {
  for (const viewer of [null, { role: "user" }, { role: "user", plan: "max" }, { status: "SUSPENDED" },
    { needsSecondFactor: true }, { twoFactorEnabled: false }, { twoFactorPassed: false }, { twoFactorPassed: undefined }]) {
    const f = fixture({ viewer }); const response = await f.post();
    assert.equal(response.status, viewer === null ? 401 : 403, JSON.stringify(viewer));
    assert.equal(f.calls.configReads, 0); assert.equal(f.calls.credentials.length, 0);
    assert.equal(f.calls.updates.length, 0); assert.equal(f.calls.audits.length, 0);
  }
});

test("same-origin protection rejects cross-origin unlock before authentication or state access", async () => {
  const f = fixture(); const response = await f.post(agreements, "https://other.invalid");
  assert.equal(response.status, 400); assert.match((await response.json()).message, /Cross-origin/);
  assert.equal(f.calls.viewers, 0); assert.equal(f.calls.configReads, 0); assert.equal(f.calls.updates.length, 0); assert.equal(f.calls.audits.length, 0);
});

test("Kill Switch, unhealthy reconciliation and unverified or disabled keys reject without update", async () => {
  for (const config of [{ killSwitchActive: true }, { reconciliationHealthy: false }]) {
    const f = fixture({ config }); const response = await f.post(); assert.equal(response.status, 400);
    assert.equal(f.calls.credentials.length, 0); assert.equal(f.calls.updates.length, 0); assert.equal(f.calls.audits.length, 0);
  }
  for (const credential of [null, { verifiedAt: null }, { verifiedAt: undefined }, { enabled: false }]) {
    const f = fixture({ credential }); const response = await f.post(); assert.equal(response.status, 400);
    assert.equal(f.calls.updates.length, 0); assert.equal(f.calls.audits.length, 0);
    assert.match((await response.json()).message, /API Key/);
  }
});
