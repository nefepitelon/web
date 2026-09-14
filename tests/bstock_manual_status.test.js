const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { z } = require("zod");

// Real handler/normalizer, strictly allowlisted imports. No database, wallet,
// external HTTP or receipt lookup can escape this in-memory fixture.
function load(file, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  vm.runInNewContext(source, { exports, Date, Error, console: { info() {}, error() {} },
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Unmocked import: ${name}`); }
  });
  return exports;
}
const normalization = load("lib/bstock-agentic-wallet-order-status.ts");
const fromToken = `0x${"1".repeat(40)}`;
const toToken = `0x${"2".repeat(40)}`;
const wallet = `0x${"3".repeat(40)}`;
const hash = `0x${"a".repeat(64)}`;
const otherHash = `0x${"b".repeat(64)}`;

function fixture(options = {}) {
  const record = { id: "audit", orderId: "known-order", ownerKey: "wallet-owner", agentKey: "previous-login", status: "SUBMITTED",
    fromToken, toToken, requestedAmount: "10", quotedAmount: "2", submittedAt: new Date(), txHash: null, ...options.record };
  const upstreamStatus = options.upstream || "FINISHED";
  const defaultRows = [{ orderId: "known-order", status: upstreamStatus, fromToken, toToken,
    ...(upstreamStatus === "FINISHED" ? { txHash: hash, fromTokenQty: "10", toTokenQty: "2" } : {}) }];
  const calls = { finds: [], writes: [], lookups: [] };
  const matches = where => Object.entries(where).every(([key, value]) =>
    value && typeof value === "object" && "in" in value ? value.in.includes(record[key]) : record[key] === value);
  class WalletError extends Error {}
  const handler = load("lib/bstock-trading-status-handler.ts", {
    "next/server": { NextResponse: { json: Response.json } }, zod: { z },
    "@/lib/bstock-agentic-wallet-auth": { isSameOrigin: () => true, noStoreHeaders: () => ({}) },
    "@/lib/bstock-agentic-wallet-client": { AgenticWalletRequestError: WalletError,
      connectedAgentSession: () => ({ walletAddress: wallet }),
      agentSessionKey: () => "new-login", agentWalletOwnerKey: () => "wallet-owner",
      persistAgentSession: response => response,
      agentWalletRequest: async (state, endpoint, request) => {
        calls.lookups.push({ endpoint, body: request.body });
        const rows = request.body.orderId ? options.directRows ?? defaultRows : options.historyRows ?? options.directRows ?? defaultRows;
        return { state, data: { list: rows } };
      }
    },
    "@/lib/bstock-agentic-wallet-order-status": normalization,
    "@/lib/prisma": { prisma: {
      bstockTradeRecord: {
        findFirst: async ({ where }) => { calls.finds.push(where); return matches(where) ? { ...record } : null; },
        updateMany: async ({ where, data }) => {
          calls.writes.push({ where, data });
          if (options.beforeWrite) options.beforeWrite(record);
          if (!matches(where)) return { count: 0 };
          Object.assign(record, data);
          return { count: 1 };
        }
      },
      bstockAutoOrder: { findUnique: async () => options.autoStatus ? { status: options.autoStatus } : null }
    } }
  }).handleBstockTradingStatus;
  return { record, calls, run: (input = {}, context = {}) => handler({ json: async () => ({ orderId: "known-order", ...input }) }, context) };
}

test("QR re-login uses verified owner scope while manual terminal writes remain reconciliation-owned", async () => {
  const app = fixture();
  const response = await app.run();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "FINISHED");
  assert.equal(body.identityVerified, true);
  assert.equal(app.record.status, "PENDING");
  assert.equal(app.record.txHash, hash);
  assert.equal(app.record.completedAt, undefined);
  assert.equal(app.record.actualToAmount, undefined);
  assert.equal(app.calls.finds[0].ownerKey, "wallet-owner");
  assert.equal(app.calls.finds[0].agentKey, undefined);
});

test("a different owner's record cannot trigger venue lookup or audit updates", async () => {
  const app = fixture({ record: { ownerKey: "other-wallet" } });
  const response = await app.run();
  assert.equal(response.status, 404);
  assert.equal(app.record.status, "SUBMITTED");
  assert.equal(app.calls.finds.length, 1);
  assert.equal(app.calls.writes.length, 0);
  assert.equal(app.calls.lookups.length, 0);
});

test("all nonterminal upstream statuses are canonical PENDING and remain startup blockers", async () => {
  for (const upstream of ["PENDING", "PROCESSING", "QUEUED", "OPEN", "NEW", "UNKNOWN", "SUBMITTED"]) {
    const app = fixture({ upstream });
    const body = await (await app.run()).json();
    assert.equal(app.record.status, "PENDING", upstream);
    assert.equal(body.status, "PENDING", upstream);
    assert.equal(body.final, false);
    assert.equal(body.successful, false);
    assert.equal(app.record.completedAt, undefined);
  }
});

test("late pending responses cannot downgrade already terminal manual audit records", async () => {
  for (const status of ["FINISHED", "FAILED", "REJECTED", "CANCELLED", "CONFIRMED", "SUCCESS", "FILLED", "INTENT_CREATED"]) {
    const app = fixture({ record: { status, actualToAmount: "verified-amount" }, upstream: "PENDING" });
    await app.run();
    assert.equal(app.record.status, status);
    assert.equal(app.record.actualToAmount, "verified-amount");
  }
});

test("unrelated completed B cannot clear pending A by matching amount or timestamp", async () => {
  for (const fromAmount of ["10", "100"]) {
    const unrelated = { orderId: "another-order", status: "FINISHED", fromToken, toToken, fromAmount, toAmount: "2", txHash: hash, createdAt: new Date().toISOString() };
    const app = fixture({ directRows: [unrelated] });
    const body = await (await app.run({ fromAmount, toAmount: "2", submittedAt: Date.now() })).json();
    assert.equal(body.matchStrategy, "CORRELATED");
    assert.equal(body.identityVerified, false);
    assert.equal(body.status, "PENDING");
    assert.equal(body.final, false);
    assert.equal(body.successful, false);
    assert.equal(body.txHash, null);
    assert.equal(app.record.status, "PENDING");
    assert.equal(app.record.txHash, null);
    assert.equal(app.record.completedAt, undefined);
    assert.equal(app.record.actualToAmount, undefined);
  }
});

test("client-supplied child identity cannot finalize a pending manual or automatic order", async () => {
  for (const autoStatus of [undefined, "PENDING"]) {
    for (const status of ["FINISHED", "FAILED", "REJECTED"]) {
      const app = fixture({ autoStatus, directRows: [{ orderId: "another-order", clientOrderId: "forged-child", status,
        fromToken, toToken, fromAmount: "10", txHash: hash }] });
      const body = await (await app.run({ clientOrderId: "forged-child", fromAmount: "10" }, { automation: true })).json();
      assert.equal(body.final, false);
      assert.equal(body.successful, false);
      assert.equal(body.status, "PENDING");
      assert.equal(body.identityVerified, false);
      assert.equal(app.record.status, "PENDING");
      assert.equal(app.record.txHash, null);
      assert.equal(app.record.completedAt, undefined);
    }
  }
});

test("saved trusted transaction hash supports exact child identity without accepting user hints", async () => {
  const app = fixture({ record: { txHash: hash }, autoStatus: "PENDING", directRows: [{ orderId: "child-order", status: "FINISHED", txHash: hash,
    fromToken, toToken, fromAmount: "10", toAmount: "2" }] });
  const body = await (await app.run({}, { automation: true })).json();
  assert.equal(body.identityVerified, true);
  assert.equal(body.matchStrategy, "TX_HASH");
  assert.equal(body.final, true);
  assert.equal(body.successful, true);
  assert.equal(body.txHash, hash);
  assert.equal(app.record.status, "PENDING");
  assert.equal(app.record.actualToAmount, undefined);
});

test("exact order IDs with conflicting saved hash or token direction stay pending", async () => {
  for (const options of [
    { record: { txHash: otherHash }, directRows: [{ orderId: "known-order", status: "FAILED", txHash: hash, fromToken, toToken }] },
    { directRows: [{ orderId: "known-order", status: "FINISHED", txHash: hash, fromToken: toToken, toToken: fromToken }] }
  ]) {
    const app = fixture({ autoStatus: "PENDING", ...options });
    const body = await (await app.run({}, { automation: true })).json();
    assert.equal(body.identityVerified, false);
    assert.equal(body.status, "PENDING");
    assert.equal(body.final, false);
    assert.equal(app.record.status, "PENDING");
    assert.equal(app.record.txHash, options.record?.txHash || null);
  }
});

test("fuzzy completed history cannot replace an exact still-processing direct result", async () => {
  const app = fixture({ autoStatus: "PENDING", directRows: [{ orderId: "known-order", status: "PROCESSING", fromToken, toToken }],
    historyRows: [{ orderId: "another-order", status: "FAILED", fromToken, toToken, fromAmount: "10", txHash: hash }] });
  const body = await (await app.run({}, { automation: true })).json();
  assert.equal(body.matchStrategy, "ORDER_ID");
  assert.equal(body.matchedOrderId, "known-order");
  assert.equal(body.final, false);
  assert.equal(app.record.status, "PENDING");
});

test("exact automatic success reaches the receipt verifier but cannot directly finalize the audit", async () => {
  const app = fixture({ autoStatus: "PENDING" });
  const internal = await (await app.run({}, { automation: true })).json();
  assert.equal(internal.final, true);
  assert.equal(internal.successful, true);
  assert.equal(internal.awaitingChainProof, true);
  assert.equal(app.record.status, "PENDING");
  assert.equal(app.record.actualFromAmount, undefined);
  const browser = await (await app.run()).json();
  assert.equal(browser.final, false);
  assert.equal(browser.status, "PENDING");
  assert.equal(app.record.completedAt, undefined);
});

test("exact upstream rejection may finish an automatic failure but cannot clear a manual audit", async () => {
  const automatic = fixture({ autoStatus: "PENDING", upstream: "REJECTED" });
  const autoBody = await (await automatic.run({}, { automation: true })).json();
  assert.equal(autoBody.final, true);
  assert.equal(autoBody.successful, false);
  assert.equal(automatic.record.status, "FAILED");
  assert.ok(automatic.record.completedAt instanceof Date);
  const manual = fixture({ upstream: "REJECTED" });
  const manualBody = await (await manual.run()).json();
  assert.equal(manualBody.final, true);
  assert.equal(manual.record.status, "PENDING");
  assert.equal(manual.record.completedAt, undefined);
});

test("verified automatic fills remain owned by the chain receipt verifier", async () => {
  const app = fixture({ record: { status: "FINISHED", actualToAmount: "verified-amount" }, autoStatus: "FINISHED" });
  await app.run();
  assert.equal(app.calls.writes.length, 0);
  assert.equal(app.record.actualToAmount, "verified-amount");
});

test("a concurrent trusted hash update cannot be overwritten by a stale status lookup", async () => {
  const app = fixture({ beforeWrite: record => { record.txHash = otherHash; } });
  await app.run();
  assert.equal(app.record.txHash, otherHash);
  assert.equal(app.record.status, "SUBMITTED");
  assert.equal(app.record.completedAt, undefined);
});

test("an unindexed legacy PROCESSING record is normalized without inventing a terminal result", async () => {
  for (const status of ["PROCESSING", "QUEUED", "NEW", "SENT_TO_VENUE"]) {
    const app = fixture({ record: { status }, directRows: [], historyRows: [] });
    const body = await (await app.run()).json();
    assert.equal(body.status, "PENDING");
    assert.equal(body.final, false);
    assert.equal(body.reason, "ORDER_NOT_INDEXED");
    assert.equal(app.record.status, "PENDING");
    assert.equal(app.calls.writes[0].where.status, status);
  }
});

test("a concurrent final audit transition is never reverted by an older lookup", async () => {
  const app = fixture({ upstream: "PROCESSING", beforeWrite: record => { record.status = "FINISHED"; } });
  await app.run();
  assert.equal(app.record.status, "FINISHED");
  assert.equal(app.record.txHash, null);
});
