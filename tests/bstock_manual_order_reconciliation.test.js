const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const viem = require("viem");

// Only RPC, database and authenticated venue transport are mocked. Matching and
// ERC-20 log decoding run the production implementation without external IO.
const compiled = new Map();
function load(file, imports) {
  if (!compiled.has(file)) compiled.set(file, ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText);
  const exports = {};
  vm.runInNewContext(compiled.get(file), { exports, Date, Error, Map, Set, Number, Promise,
    setTimeout, clearTimeout, process: { env: {} }, console: imports.console || { info() {} },
    require(name) { if (Object.hasOwn(imports, name)) return imports[name]; throw new Error(`Unmocked import ${name}`); }
  }, { filename: file });
  return exports;
}
const normalizer = load("lib/bstock-agentic-wallet-order-status.ts", {});
const wallet = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const fromToken = "0x3333333333333333333333333333333333333333";
const toToken = "0x4444444444444444444444444444444444444444";
const native = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const hash = `0x${"a".repeat(64)}`;
const blockHash = `0x${"b".repeat(64)}`;
const ownerKey = `owner:${wallet}`;
const copy = value => structuredClone(value);
const transfer = (token, from, to, amount) => ({ address: token,
  topics: viem.encodeEventTopics({ abi: viem.erc20Abi, eventName: "Transfer", args: { from, to } }),
  data: viem.encodeAbiParameters([{ type: "uint256" }], [BigInt(amount)]) });
const defaultLogs = () => [transfer(fromToken, wallet, other, 100n), transfer(fromToken, other, wallet, 1n), transfer(toToken, other, wallet, 20n)];
const pendingRecord = (data = {}) => ({ id: "trade-1", ownerKey, agentKey: "old-session-key", orderId: "venue-123",
  txHash: null, status: "SUBMITTED", fromToken, toToken, requestedAmount: "1", quotedAmount: "999",
  actualFromAmount: null, actualToAmount: null, createdAt: new Date(0), ...data });
const finished = (data = {}) => ({ orderId: "venue-123", status: "FINISHED", txHash: hash, fromToken, toToken, ...data });
const matches = (row, where) => Object.entries(where).every(([key, value]) =>
  value && typeof value === "object" && "in" in value ? value.in.includes(row[key]) : row[key] === value);

function fixture(options = {}) {
  const state = { stage: "connected", walletAddress: wallet, clientId: "new-session-key", agentSessionId: "secret-test-session",
    sessionExpireAt: Date.now() + 60_000, ...options.state };
  const records = copy(options.records || [pendingRecord()]);
  const auto = new Set(options.autoLinked || []);
  const calls = { lookups: [], receipts: [], updates: [], locks: 0, logs: [] };
  let readDone = false;
  const db = {
    $queryRaw: async (strings, suppliedOwner, onlyBlocking) => {
      const sql = strings.join("?");
      if (sql.includes("pg_advisory")) { calls.locks++; return []; }
      assert.match(sql, /NOT EXISTS/);
      assert.match(sql, /a\."tradeRecordId" = t\.id/);
      const exclusions = [...sql.match(/t\.status NOT IN \(([^)]+)\)/s)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
      assert.deepEqual(exclusions, Array.from(module.MANUAL_NON_PENDING_STATUSES), "SQL and API exclusion lists must stay identical");
      assert.equal(suppliedOwner, ownerKey);
      if (options.dbFailure) throw new Error("database unavailable secret-token");
      const found = records.filter(row => row.ownerKey === suppliedOwner && !exclusions.includes(row.status) && !auto.has(row.id)
        && (!onlyBlocking || row.automationIgnoredAt == null));
      readDone = true;
      return copy(found.slice(0, 16).map(row => ({ ...row, pendingTotal: options.invalidCount ? "invalid" : String(found.length) })));
    },
    $transaction: async (operation, limits) => {
      assert.equal(limits.timeout, 3000);
      if (options.beforeWrite) options.beforeWrite({ records, auto });
      return operation({
        $queryRaw: db.$queryRaw,
        bstockAutoOrder: { findUnique: async ({ where }) => auto.has(where.tradeRecordId) ? { id: "auto-linked" } : null },
        bstockTradeRecord: { updateMany: async ({ where, data }) => {
          calls.updates.push({ where: copy(where), data: copy(data) });
          const found = records.filter(row => matches(row, where));
          found.forEach(row => Object.assign(row, copy(data)));
          return { count: found.length };
        } }
      });
    }
  };
  const chain = {
    getTransactionReceipt: async ({ hash: requestedHash }) => {
      calls.receipts.push(requestedHash);
      if (options.receiptError) throw new Error("RPC timeout private-body");
      return { transactionHash: requestedHash, blockNumber: 100n, blockHash, status: "success", from: wallet,
        logs: defaultLogs(), ...options.receipt };
    },
    getBlockNumber: async () => options.blockNumber ?? 101n,
    getTransaction: async ({ hash: requestedHash }) => ({ hash: requestedHash, blockHash, from: wallet, value: viem.parseEther("1"), ...options.transaction })
  };
  const module = load("lib/bstock-manual-order-reconciliation.ts", {
    "server-only": {}, viem: { ...viem, createPublicClient: () => chain, http: () => ({}) }, "viem/chains": { bsc: { id: 56 } },
    "@/lib/prisma": { prisma: db }, "@/lib/bstock-agentic-wallet-order-status": normalizer,
    "@/lib/bstock-agentic-wallet-client": {
      agentWalletOwnerKey: address => `owner:${address.toLowerCase()}`,
      agentWalletRequest: async (session, endpoint, request) => {
        assert.ok(readDone);
        assert.match(endpoint, /batch-query-market-orders$/);
        assert.ok(request.timeoutMs <= 3000);
        calls.lookups.push(copy(request.body));
        if (options.lookupError) throw new Error("timeout agentSessionId=must-not-log");
        return { state: { ...session, ...(options.returnState || {}) }, data: options.lookup ? options.lookup(request.body) : { list: [finished()], total: 1 } };
      }
    }, console: { info: (...args) => calls.logs.push(args) }
  });
  return { state, records, calls, run: (key = ownerKey, options) => module.reconcileBstockManualOrders(state, key, options) };
}

test("startup reconciliation skips reviewed records without starving new blockers", async () => {
  const ignored = Array.from({ length: 16 }, (_, index) => pendingRecord({ id: `ignored-${index}`,
    automationIgnoredAt: new Date(0), automationIgnoredBy: wallet }));
  const app = fixture({ records: [...ignored, pendingRecord({ id: "new-blocker" })] });
  const result = await app.run(ownerKey, { onlyBlocking: true });
  assert.equal(result.reconciled, 1);
  assert.equal(result.remaining, 0);
  assert.equal(app.records.at(-1).status, "FINISHED");
  assert.ok(app.records.slice(0, 16).every(row => row.status === "SUBMITTED"));
});

test("reviewed ignore never replaces receipt verification or erases its audit marker", async () => {
  const stamp = new Date(0);
  const app = fixture({ records: [pendingRecord({ automationIgnoredAt: stamp, automationIgnoredBy: wallet })] });
  assert.equal((await app.run()).reconciled, 1);
  assert.equal(app.records[0].status, "FINISHED");
  assert.deepEqual(app.records[0].automationIgnoredAt, stamp);
  assert.equal(app.records[0].automationIgnoredBy, wallet);
  assert.equal(app.calls.receipts.length, 1);
});

test("old Agent session record is reconciled by current verified owner and real ERC20 receipt evidence", async () => {
  const app = fixture();
  const result = await app.run();
  assert.equal(result.reconciled, 1);
  assert.equal(result.remaining, 0);
  assert.equal(result.lookupFailed, false);
  assert.equal(app.records[0].status, "FINISHED");
  assert.equal(app.records[0].agentKey, "old-session-key");
  assert.equal(app.records[0].txHash, hash);
  assert.equal(app.records[0].actualToAmount, null, "raw token quantities/quote are not fabricated as bStock shares");
  assert.equal(app.calls.updates[0].where.ownerKey, ownerKey);
  assert.equal(Object.hasOwn(app.calls.updates[0].where, "agentKey"), false);
  assert.equal(app.calls.locks, 1);
});

test("owner mismatch or expired/changed session performs no lookup or update", async () => {
  for (const state of [{ walletAddress: other }, { stage: "pending" }, { sessionExpireAt: Date.now() - 1 }]) {
    const app = fixture({ state });
    await assert.rejects(app.run(), /钱包身份或授权/);
    assert.equal(app.calls.lookups.length, 0);
    assert.equal(app.calls.updates.length, 0);
  }
  const changed = fixture({ returnState: { walletAddress: other } });
  const result = await changed.run();
  assert.equal(result.reconciled, 0);
  assert.equal(result.lookupFailed, true);
  assert.equal(result.state.walletAddress, wallet);
});

test("similar amount/time/token history is never an identity match", async () => {
  const app = fixture({ lookup: () => ({ list: [finished({ orderId: "unrelated", fromAmount: "1", toAmount: "999", createdAt: new Date().toISOString() })], total: 1 }) });
  const result = await app.run();
  assert.equal(result.remaining, 1);
  assert.equal(result.reconciled, 0);
  assert.equal(app.calls.receipts.length, 0);
});

test("provided reverse token direction and conflicting stored hashes fail closed", async () => {
  for (const options of [
    { lookup: () => ({ list: [finished({ fromToken: toToken, toToken: fromToken })] }) },
    { records: [pendingRecord({ txHash: `0x${"c".repeat(64)}` })], receipt: { logs: [] } }
  ]) {
    const app = fixture(options);
    assert.equal((await app.run()).reconciled, 0);
    assert.equal(app.calls.updates.length, 0);
  }
});

test("timeout and database failure retain a blocking result and never log credentials", async () => {
  for (const options of [{ lookupError: true }, { receiptError: true }, { dbFailure: true }, { invalidCount: true }]) {
    const app = fixture(options);
    const result = await app.run();
    assert.equal(result.lookupFailed, true);
    assert.ok(result.remaining >= 1);
    assert.equal(result.reconciled, 0);
    assert.equal(app.calls.updates.length, 0);
    assert.doesNotMatch(JSON.stringify(app.calls.logs), /secret|private-body|agentSessionId|must-not-log/);
  }
});

test("all auto-linked records are excluded initially and a concurrent auto link vetoes the write", async () => {
  const excluded = fixture({ autoLinked: ["trade-1"] });
  assert.equal((await excluded.run()).remaining, 0);
  assert.equal(excluded.calls.lookups.length, 0);
  const concurrent = fixture({ beforeWrite: ({ auto }) => auto.add("trade-1") });
  assert.equal((await concurrent.run()).reconciled, 0);
  assert.equal(concurrent.records[0].status, "SUBMITTED");
  assert.equal(concurrent.calls.updates.length, 0);
});

test("real pending and unknown-without-identity remain blocking regardless of age", async () => {
  const app = fixture({ records: [pendingRecord({ status: "PENDING" }), pendingRecord({ id: "no-id", status: "SUBMISSION_UNKNOWN", orderId: null })],
    lookup: () => ({ list: [{ orderId: "venue-123", status: "PENDING" }] }) });
  const result = await app.run();
  assert.equal(result.remaining, 2);
  assert.equal(result.reconciled, 0);
  assert.equal(app.calls.updates.length, 0);
});

test("PROCESSING and unknown nonterminal aliases remain blocking or require exact confirmed settlement", async () => {
  for (const status of ["PROCESSING", "QUEUED", "NEW", "UNKNOWN_PROVIDER_STATE"]) {
    const pending = fixture({ records: [pendingRecord({ status })], lookup: () => ({ list: [{ orderId: "venue-123", status }] }) });
    const result = await pending.run();
    assert.equal(result.remaining, 1);
    assert.equal(result.reconciled, 0);
    assert.equal(pending.records[0].status, status);
    assert.equal(pending.calls.updates.length, 0);
    const confirmed = fixture({ records: [pendingRecord({ status })] });
    assert.equal((await confirmed.run()).reconciled, 1);
    assert.equal(confirmed.records[0].status, "FINISHED");
    assert.equal(confirmed.calls.updates[0].where.status, status);
  }
});

test("all existing terminal aliases and quote intents are excluded from receipt reconciliation", async () => {
  const statuses = ["INTENT_CREATED", "FINISHED", "SUCCESS", "SUCCEEDED", "COMPLETED", "CONFIRMED", "FILLED", "FAILED", "FAILURE", "REJECTED", "CANCELED", "CANCELLED", "EXPIRED"];
  const app = fixture({ records: statuses.map((status, index) => pendingRecord({ id: `terminal-${index}`, status })) });
  const result = await app.run();
  assert.equal(result.remaining, 0);
  assert.equal(result.reconciled, 0);
  assert.equal(app.calls.lookups.length, 0);
  assert.equal(app.calls.updates.length, 0);
});

test("confirmed success requires at least two blocks, correct wallet net input/output and successful receipt", async () => {
  for (const options of [
    { blockNumber: 100n }, { receipt: { status: "reverted" } }, { receipt: { logs: [] } },
    { receipt: { logs: [transfer(fromToken, other, wallet, 100n), transfer(toToken, wallet, other, 20n)] } },
    { receipt: { logs: [transfer(fromToken, wallet, other, 100n), transfer(fromToken, other, wallet, 100n), transfer(toToken, other, wallet, 20n)] } },
    { receipt: { transactionHash: `0x${"d".repeat(64)}` } }
  ]) {
    const app = fixture(options);
    assert.equal((await app.run()).reconciled, 0);
    assert.equal(app.calls.updates.length, 0);
  }
});

test("targeted lookup falls back beyond the first 100 history records without correlation", async () => {
  const app = fixture({ lookup: body => body.orderId ? { list: [], total: 0 }
    : body.page === 1 ? { list: Array.from({ length: 100 }, (_, i) => finished({ orderId: `other-${i}` })), total: 101 }
      : { list: [finished()], total: 101 } });
  const result = await app.run();
  assert.equal(result.reconciled, 1);
  assert.deepEqual(app.calls.lookups.map(body => body.orderId || body.page), ["venue-123", 1, 2]);
});

test("array history envelopes with 100 rows do not mistake synthetic total for the end of pagination", async () => {
  for (const wrap of [rows => rows, rows => ({ data: rows })]) {
    const app = fixture({ lookup: body => body.orderId ? wrap([])
      : body.page === 1 ? wrap(Array.from({ length: 100 }, (_, i) => finished({ orderId: `unrelated-${i}` })))
        : wrap([finished()]) });
    const result = await app.run();
    assert.equal(result.reconciled, 1);
    assert.deepEqual(app.calls.lookups.map(body => body.orderId || body.page), ["venue-123", 1, 2]);
  }
});

test("explicit failed exact ID may finalize without a hash, hash-only failure cannot cancel a record", async () => {
  const exact = fixture({ lookup: () => ({ list: [{ orderId: "venue-123", status: "CANCELLED", fromToken, toToken }] }) });
  assert.equal((await exact.run()).reconciled, 1);
  assert.equal(exact.records[0].status, "FAILED");
  assert.equal(exact.calls.receipts.length, 0);
  const hashOnly = fixture({ records: [pendingRecord({ txHash: hash })], receipt: { logs: [] },
    lookup: () => ({ list: [finished({ orderId: "other-order", status: "FAILED" })] }) });
  assert.equal((await hashOnly.run()).reconciled, 0);
  const malformed = fixture({ lookup: () => ({ list: [finished({ status: "FAILED", txHash: "malformed-hash" })] }) });
  assert.equal((await malformed.run()).reconciled, 0);
});

test("persisted transaction identity proves a browser record without any venue query", async () => {
  const app = fixture({ records: [pendingRecord({ orderId: hash, txHash: hash, agentKey: ownerKey })] });
  assert.equal((await app.run()).reconciled, 1);
  assert.equal(app.calls.lookups.length, 0);
});

test("an exact persisted browser hash may finalize a double-confirmed direct-wallet revert only", async () => {
  const records = [pendingRecord({ orderId: hash, txHash: hash, agentKey: ownerKey })];
  const failed = fixture({ records, receipt: { status: "reverted" } });
  const result = await failed.run();
  assert.equal(result.reconciled, 1);
  assert.equal(result.remaining, 0);
  assert.equal(failed.records[0].status, "FAILED");
  assert.equal(failed.records[0].actualToAmount, null);
  assert.equal(failed.calls.lookups.length, 0);
  for (const options of [
    { records, blockNumber: 100n },
    { records, receipt: { status: "reverted", from: other } },
    { records: [pendingRecord({ orderId: hash, txHash: null })] },
    { records: [pendingRecord({ orderId: "venue-123", txHash: hash })] }
  ]) {
    const unresolved = fixture({ ...options, receipt: { status: "reverted", ...(options.receipt || {}) } });
    assert.equal((await unresolved.run()).reconciled, 0);
    assert.equal(unresolved.calls.updates.length, 0);
  }
});

test("native input needs exact direct wallet value; native output is unresolved without internal traces", async () => {
  const nativeInput = { records: [pendingRecord({ fromToken: native, txHash: hash })], receipt: { logs: [transfer(toToken, other, wallet, 20n)] } };
  assert.equal((await fixture(nativeInput).run()).reconciled, 1);
  for (const transaction of [{ from: other }, { value: 1n }, { blockHash: `0x${"c".repeat(64)}` }]) {
    assert.equal((await fixture({ ...nativeInput, transaction }).run()).reconciled, 0);
  }
  const nativeOutput = fixture({ records: [pendingRecord({ toToken: native, txHash: hash })] });
  assert.equal((await nativeOutput.run()).reconciled, 0);
});

test("concurrent terminal status and changed transaction identity are monotonic", async () => {
  for (const mutate of [row => { row.status = "FINISHED"; row.actualToAmount = "12.5"; }, row => { row.status = "PROCESSING"; }, row => { row.orderId = "replacement-id"; }, row => { row.txHash = `0x${"c".repeat(64)}`; }]) {
    const app = fixture({ beforeWrite: ({ records }) => mutate(records[0]) });
    assert.equal((await app.run()).reconciled, 0);
    if (app.records[0].status === "FINISHED") assert.equal(app.records[0].actualToAmount, "12.5");
  }
});

test("pending count includes records beyond the processing page and history calls are bounded", async () => {
  const records = Array.from({ length: 30 }, (_, i) => pendingRecord({ id: `trade-${i}`, orderId: `venue-${i}` }));
  const app = fixture({ records, lookup: () => ({ list: Array.from({ length: 100 }, (_, i) => finished({ orderId: `unrelated-${i}` })), total: 9999 }) });
  const result = await app.run();
  assert.equal(result.remaining, 30);
  assert.equal(result.reconciled, 0);
  assert.equal(app.calls.lookups.length, 8);
});
