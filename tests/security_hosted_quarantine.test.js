import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
async function load(path, mocks = {}) {
  const code = ts.transpileModule(await read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => {
    if (name in mocks) return mocks[name];
    if (name === "server-only") return {};
    if (name === "@/lib/secret-redaction") return secretRedaction;
    if (name.startsWith("@/") || name.startsWith("workflow") || name.includes("grid-ops/src")) throw new Error(`Missing dependency: ${name}`);
    return require(name);
  }, exports);
  return exports;
}
const secretRedaction = await load("lib/secret-redaction.ts");
const security = await load("lib/grid-ops-hosted/security.ts");
const normalBot = { id: "real-bot-1", userId: "owner-1", status: "STOPPED", lastError: null, runId: null, heartbeatAt: null };
function serviceMocks(db, calls = []) {
  return {
    "@/lib/prisma": { prisma: db }, "@/lib/grid-ops-hosted/security": security,
    "@/lib/grid-ops-hosted/config": {}, "@/lib/grid-ops-hosted/workflow": { hostedGridOpsWorkflow() {} },
    "workflow/api": {
      start: async () => { calls.push("start"); return { runId: "new-run" }; },
      getRun: () => { calls.push("getRun"); return { exists: false }; }
    }
  };
}

test("quarantine applies to preserved forged IDs and security markers while ordinary stop/restart remains allowed", () => {
  assert.equal(security.isHostedGridOpsQuarantined(normalBot), false);
  assert.equal(security.hostedGridOpsWorkerStopped(normalBot), true);
  assert.doesNotThrow(() => security.assertHostedGridOpsNotQuarantined(normalBot));
  for (const id of ["zz-i63635-canary-bot", "zz-i63676-bot-B-queued", "zz-i63676-bot-C-live", "zz-i63676-bot-D-dispatched", "zz-i63676-bot-E-metadata"]) {
    assert.equal(security.isHostedGridOpsQuarantined({ id, status: "RUNNING", lastError: null }), true);
  }
  assert.equal(security.isHostedGridOpsQuarantined({ ...normalBot, lastError: "SECURITY_QUARANTINE_20261119" }), true);
});

test("a stale owner request cannot wake or enqueue work for a newly quarantined bot", async () => {
  const calls = [];
  const db = {
    hostedGridOpsBot: { findUnique: async () => ({ ...normalBot, lastError: "SECURITY_QUARANTINE_20261119" }) },
    hostedGridOpsCommand: { create: async () => { calls.push("command-created"); } }
  };
  const api = await load("lib/grid-ops-hosted/service.ts", serviceMocks(db, calls));
  await assert.rejects(api.ensureHostedGridOpsRun(normalBot), /安全隔离/);
  await assert.rejects(api.ensureHostedGridOpsBot(normalBot.userId, { readOnly: true }), /安全隔离/);
  await assert.rejects(api.enqueueHostedGridOpsCommand({ bot: normalBot, userId: normalBot.userId, type: "GRID_START" }), /安全隔离/);
  assert.deepEqual(calls, []);
});

test("legitimate stopped bots may restart and the run write contains the atomic quarantine predicate", async () => {
  const calls = [];
  let observedWhere;
  const db = { hostedGridOpsBot: {
    findUnique: async () => normalBot,
    update: async ({ where, data }) => { observedWhere = where; return { ...normalBot, ...data }; }
  } };
  const api = await load("lib/grid-ops-hosted/service.ts", serviceMocks(db, calls));
  assert.equal((await api.ensureHostedGridOpsRun(normalBot)).runId, "new-run");
  assert.deepEqual(calls, ["start"]);
  assert.equal(observedWhere.id, normalBot.id);
  assert.ok(JSON.stringify(observedWhere).includes("SECURITY_QUARANTINE_"));
  assert.ok(JSON.stringify(observedWhere).includes("zz-i63676-bot-C-live"));
});

function runtimeMocks(db, { decrypt = () => ({}), disposed = () => {} } = {}) {
  return {
    "@/lib/prisma": { prisma: db }, "@/lib/grid-ops-hosted/security": security,
    "@/lib/grid-ops-hosted/config": { decryptHostedGridOpsEnvironment: decrypt },
    "../../grid-ops/src/config.js": { getConfigFromEnvironment: () => ({ exchanges: {}, instanceManifest: [] }) },
    "../../grid-ops/src/exchange/registry.js": { createRegisteredExchanges: () => ({}) },
    "../../grid-ops/src/bot.js": { GridBot: class {} },
    "../../grid-ops/src/hedge/cycle.js": { HedgeCycleManager: class { restore() {} async resume() {} dispose() { disposed(); } } },
    "../../grid-ops/src/trend.js": {}, "../../grid-ops/src/trend-recommendations.js": {}
  };
}

test("workers reject stopped or quarantined records before decrypting configuration or connecting to an exchange", async () => {
  for (const bot of [normalBot, { ...normalBot, status: "RUNNING", lastError: "SECURITY_QUARANTINE_20261119" }, { ...normalBot, id: "zz-i63676-bot-C-live", status: "RUNNING" }]) {
    let decrypted = false;
    const db = {
      hostedGridOpsBot: { findUnique: async () => bot },
      hostedGridOpsCommand: { count: async () => 1 }
    };
    const api = await load("lib/grid-ops-hosted/runtime.ts", runtimeMocks(db, { decrypt: () => { decrypted = true; throw new Error("Configuration must not be decrypted"); } }));
    assert.equal((await api.runHostedGridOpsSession(bot.id)).stop, true);
    assert.equal(decrypted, false);
  }
});

test("a quarantine appearing during a session stops the next loop before command dispatch and preserves its marker", async () => {
  let reads = 0, writes = 0, disposed = false;
  const db = {
    hostedGridOpsBot: {
      findUnique: async () => ++reads < 3
        ? { ...normalBot, status: "RUNNING", configEncrypted: "test-only", snapshot: {} }
        : { ...normalBot, lastError: "SECURITY_QUARANTINE_20261119" },
      updateMany: async ({ where }) => { writes++; assert.ok(JSON.stringify(where).includes("SECURITY_QUARANTINE_")); return { count: 1 }; }
    },
    hostedGridOpsCommand: { count: async () => 1, findFirst: async () => { throw new Error("Quarantined command must not be dispatched"); } }
  };
  const api = await load("lib/grid-ops-hosted/runtime.ts", runtimeMocks(db, { disposed: () => { disposed = true; } }));
  assert.equal((await api.runHostedGridOpsSession(normalBot.id)).stop, true);
  assert.equal(writes, 1, "only the pre-quarantine session start may write");
  assert.equal(disposed, true);
});

test("all owner configuration writes use a database quarantine predicate and scope the owner", async () => {
  const route = await read("app/api/grid-ops-hosted/[...path]/route.ts");
  const writes = [...route.matchAll(/hostedGridOpsBot\.update\(\{\s*where:\s*([^\n]+)/g)];
  assert.equal(writes.length, 4);
  for (const match of writes) {
    assert.match(match[1], /hostedGridOpsNotQuarantinedWhere\(bot\.id\)/);
    assert.match(match[1], /userId: viewer\.id/);
  }
});
