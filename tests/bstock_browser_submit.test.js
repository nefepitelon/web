const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { z } = require("zod");

const wallet = `0x${"3".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`;
const otherHash = `0x${"b".repeat(64)}`;
const intentHash = "reviewed-browser-intent";
const intent = { walletAddress: wallet, ownerKey: "owner", mode: "policy", symbol: "NVDAB", side: "buy",
  fromToken: "payment-token", toToken: "stock-token", fromSymbol: "USDT", toSymbol: "NVDAB", amount: "10", quoteOutput: "0.05" };

function fixture(options = {}) {
  let record = { id: "audit", ownerKey: "owner", intentHash, status: "INTENT_CREATED", orderId: null, txHash: null,
    submittedAt: null, automationIgnoredAt: null, automationIgnoredBy: null, ...options.record };
  const calls = { locks: 0, reads: 0, writes: [], authenticated: 0 };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  let queue = Promise.resolve();
  const prisma = {
    $transaction(callback) {
      const pending = queue.then(async () => {
        const working = structuredClone(record);
        let locked = false;
        const result = await callback({
          $queryRaw: async (strings, ownerKey) => {
            assert.match(strings.join("?"), /pg_advisory_xact_lock/);
            assert.equal(ownerKey, "owner");
            calls.locks++; locked = true; return [];
          },
          bstockTradeRecord: {
            findFirst: async ({ where }) => {
              assert.equal(locked, true); calls.reads++;
              return matches(working, where) ? { ...working } : null;
            },
            updateMany: async ({ where, data }) => {
              assert.equal(locked, true); calls.writes.push({ where, data });
              if (options.failCas || !matches(working, where)) return { count: 0 };
              Object.assign(working, data); return { count: 1 };
            }
          },
          // Registering an already-broadcast receipt is always allowed, even
          // when the bot started while the user's wallet window was open.
          bstockAutoConfig: { findUnique: async () => { throw new Error("Must not veto receipt registration based on automation"); } }
        });
        assert.equal(locked, true);
        record = working;
        return result;
      });
      queue = pending.catch(() => undefined);
      return pending;
    }
  };
  const imports = {
    "next/server": { NextResponse: { json: Response.json } },
    viem: { getAddress: value => value.toLowerCase() }, zod: { z },
    "@/lib/bstock-agentic-wallet-auth": { isSameOrigin: () => options.sameOrigin !== false, noStoreHeaders: () => ({}) },
    "@/lib/bstock-browser-wallet": {
      browserWalletAddressSchema: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      decodeBrowserTradeIntent: () => ({ ...intent, ...options.intent }),
      requireBoundEvmBrowserWallet: async () => { calls.authenticated++; return { address: wallet, ownerKey: "owner" }; }
    },
    "@/lib/prisma": { prisma },
    "@/lib/bstock-trade-records": { tradeIntentAuditHash: () => intentHash }
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../app/api/bstock-alpha/browser-wallet/trading/submit/route.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(source, { exports, Date, Error,
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Unmocked import: ${name}`); }
  });
  return { calls, get record() { return record; }, run: (input = {}) => exports.POST({ json: async () => ({
    address: wallet, intent: "encrypted-reviewed-browser-intent", txHash: hash,
    confirmation: "确认实盘交易", acknowledged: true, ...input
  }) }) };
}

test("first browser receipt registers once under the owner lock without checking bot availability", async () => {
  const app = fixture();
  const response = await app.run();
  const body = await response.json();
  assert.equal(response.status, 202);
  assert.equal(body.status, "SUBMITTED");
  assert.equal(body.alreadyRegistered, false);
  assert.equal(app.record.txHash, hash);
  assert.equal(app.record.orderId, hash);
  assert.equal(app.record.status, "SUBMITTED");
  assert.equal(app.record.automationIgnoredAt, null);
  assert.equal(app.calls.locks, 1);
  assert.equal(app.calls.writes.length, 1);
  assert.deepEqual(Object.keys(app.calls.writes[0].data).sort(), ["orderId", "status", "submittedAt", "txHash"]);
});

test("same-hash retries preserve pending or terminal status, override and receipt-derived amounts", async () => {
  for (const status of ["SUBMITTED", "PENDING", "FINISHED", "FAILED", "REJECTED"]) {
    const original = { status, orderId: hash, txHash: hash, submittedAt: new Date(0), completedAt: new Date(1),
      automationIgnoredAt: new Date(2), automationIgnoredBy: "verified-actor", actualToAmount: "verified-receipt-amount" };
    const app = fixture({ record: original });
    const before = structuredClone(app.record);
    const response = await app.run({ txHash: `0x${"A".repeat(64)}` });
    const body = await response.json();
    assert.equal(response.status, 202);
    assert.equal(body.status, status);
    assert.equal(body.alreadyRegistered, true);
    assert.deepEqual(app.record, before);
    assert.equal(app.calls.writes.length, 0);
  }
});

test("a new hash cannot replace a submitted or ignored transaction on the same intent", async () => {
  for (const record of [
    { status: "SUBMITTED", orderId: hash, txHash: hash },
    { status: "PENDING", orderId: hash, txHash: hash, automationIgnoredAt: new Date(0), automationIgnoredBy: "actor" },
    { status: "FINISHED", orderId: hash, txHash: hash },
    { status: "INTENT_CREATED", orderId: hash, txHash: hash },
    { status: "PENDING", orderId: hash, txHash: otherHash }
  ]) {
    const app = fixture({ record });
    const before = structuredClone(app.record);
    const response = await app.run({ txHash: otherHash });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "BROWSER_TRADE_HASH_CONFLICT");
    assert.deepEqual(app.record, before);
    assert.equal(app.calls.writes.length, 0);
  }
});

test("ambiguous records without an identity cannot be rebound by a browser receipt", async () => {
  for (const status of ["SUBMITTING", "SUBMITTED", "SUBMISSION_UNKNOWN", "PENDING", "PROCESSING", "FINISHED", "FAILED"]) {
    const app = fixture({ record: { status } });
    const response = await app.run();
    assert.equal(response.status, 409);
    assert.equal(app.record.status, status);
    assert.equal(app.record.txHash, null);
    assert.equal(app.calls.writes.length, 0);
  }
});

test("an invalid ignored empty quote cannot silently attach a new transaction to an old override", async () => {
  const app = fixture({ record: { automationIgnoredAt: new Date(0), automationIgnoredBy: "actor" } });
  assert.equal((await app.run()).status, 409);
  assert.equal(app.record.status, "INTENT_CREATED");
  assert.equal(app.record.txHash, null);
  assert.equal(app.calls.writes.length, 0);
});

test("different owners and forged intent identities never register another wallet's receipt", async () => {
  const foreign = fixture({ record: { ownerKey: "another-owner" } });
  const response = await foreign.run();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "BROWSER_TRADE_AUDIT_NOT_FOUND");
  assert.equal(foreign.calls.writes.length, 0);
  const forged = fixture({ intent: { ownerKey: "another-owner" } });
  assert.equal((await forged.run()).status, 403);
  assert.equal(forged.calls.locks, 0);
});

test("same-origin and explicit transaction acknowledgement checks still precede database access", async () => {
  const foreignOrigin = fixture({ sameOrigin: false });
  assert.equal((await foreignOrigin.run()).status, 403);
  assert.equal(foreignOrigin.calls.authenticated + foreignOrigin.calls.locks, 0);
  const noAcknowledgement = fixture();
  assert.notEqual((await noAcknowledgement.run({ acknowledged: false })).status, 202);
  assert.equal(noAcknowledgement.calls.authenticated + noAcknowledgement.calls.locks, 0);
});

test("concurrent same-hash registrations are idempotent and different-hash registrations have one winner", async () => {
  for (const secondHash of [hash, otherHash]) {
    const app = fixture();
    const responses = await Promise.all([app.run(), app.run({ txHash: secondHash })]);
    assert.equal(responses[0].status, 202);
    assert.equal(responses[1].status, secondHash === hash ? 202 : 409);
    assert.equal(app.calls.writes.length, 1);
    assert.equal(app.record.txHash, hash);
  }
});

test("a failed compare-and-set does not overwrite a changed registration", async () => {
  const app = fixture({ failCas: true });
  const response = await app.run();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "BROWSER_TRADE_REGISTRATION_CHANGED");
  assert.equal(app.record.status, "INTENT_CREATED");
  assert.equal(app.record.txHash, null);
});
