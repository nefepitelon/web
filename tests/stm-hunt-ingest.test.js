const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const viem = require("viem");
const code = ts.transpileModule(fs.readFileSync("lib/stm-hunt/onchain.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, Buffer, Date, Error, process, require(name) {
  if (name === "server-only") return {};
  if (name === "node:crypto") return require(name);
  if (name === "viem") return { parseAbi: a => a };
  if (name === "viem/chains") return { bsc: {} };
  throw new Error(`Unexpected dependency ${name}`);
} });
const { validStmSignature } = mod.exports;
test("STM ingest authenticates exact body and timestamp with constant length HMAC", () => {
  const raw = '{"chain":"bsc","hash":"test"}';
  const secret = "a".repeat(48), time = "1795065600", now = Number(time) * 1000;
  const sign = createHmac("sha256", secret).update(`${time}.${raw}`).digest("hex");
  assert.equal(validStmSignature(raw, time, sign, secret, now), true);
  assert.equal(validStmSignature(raw + " ", time, sign, secret, now), false);
  assert.equal(validStmSignature(raw, time, sign, secret, now + 300001), false);
  assert.equal(validStmSignature(raw, time, sign, undefined, now), false);
  assert.equal(validStmSignature(raw, time, "ab", secret, now), false);
  assert.equal(validStmSignature(raw, time, sign, "short", now), false);
});

const NOW = Date.parse("2026-11-19T10:00:00Z");
const HASH = `0x${"ab".repeat(32)}`;
const BLOCK_HASH = `0x${"cd".repeat(32)}`;
const WALLET = `0x${"11".repeat(20)}`;
const TOKEN = `0x${"22".repeat(20)}`;
const POOL = `0x${"33".repeat(20)}`;
const OTHER_POOL = `0x${"44".repeat(20)}`;
const OTHER_WALLET = `0x${"55".repeat(20)}`;
const USDT = "0x55d398326f99059fF775485246999027B3197955";
const ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const RAW = 100_500_000n;
const input = { chain: "bsc", hash: HASH, wallet: WALLET, token: TOKEN };
const profile = { id: "reviewed-wallet", chain: "bsc", address: WALLET, label: "Reviewed trader", group: "Research", clusterId: "independent-entity-1", qualified: true, reviewedAt: new Date(NOW - 60_000).toISOString() };
const risk = { passed: true, liquidityUsd: 200_000, routeAvailable: true };

// Exercise the real verifier in isolation. Only RPC and log decoding are
// substituted; amount formatting, control flow and returned evidence are real.
function fixture(options = {}) {
  const calls = [];
  const transfer = { eventName: "Transfer", args: { from: POOL, to: WALLET, value: RAW, ...options.transfer } };
  const swap = { eventName: "Swap", args: { sender: ROUTER, to: WALLET, amount0In: 0n, amount1In: 1_000_000n, amount0Out: RAW, amount1Out: 0n, ...options.swap } };
  const logs = options.logs ?? [
    { address: TOKEN, data: "0x01", topics: [] },
    { address: POOL, data: "0x02", topics: [] },
  ];
  const receipt = { status: "success", from: WALLET, blockHash: BLOCK_HASH, blockNumber: 100n, logs, ...options.receipt };
  const client = {
    async getTransactionReceipt({ hash }) { calls.push({ method: "receipt", hash }); assert.equal(hash, HASH); return receipt; },
    async getBlockNumber() { calls.push({ method: "head" }); return options.head ?? 103n; },
    async getBlock({ blockHash }) { calls.push({ method: "block" }); assert.equal(blockHash, BLOCK_HASH); return { timestamp: options.timestamp ?? BigInt(NOW / 1000 - 60) }; },
    async readContract(request) {
      calls.push({ method: "contract", ...request });
      switch (request.functionName) {
        case "decimals": assert.equal(request.address, TOKEN); return 6;
        case "symbol": assert.equal(request.address, TOKEN); return "HUNT";
        case "balanceOf": assert.equal(request.address, TOKEN); assert.equal(request.args[0], WALLET); return options.balance ?? RAW;
        case "token0": return options.tokenSecond ? USDT : TOKEN;
        case "token1": return options.tokenSecond ? TOKEN : USDT;
        case "getPair":
          assert.equal(request.address.toLowerCase(), FACTORY.toLowerCase());
          assert.deepEqual(Array.from(request.args).map(value => value.toLowerCase()).sort(), [TOKEN, USDT].map(value => value.toLowerCase()).sort());
          return options.registeredPair ?? POOL;
        case "getAmountsOut":
          assert.equal(request.address.toLowerCase(), ROUTER.toLowerCase());
          assert.equal(request.args[0], RAW / 100n);
          assert.equal(request.args[1][0], TOKEN);
          assert.equal(request.args[1].at(-1), USDT);
          if (options.routeThrows) throw new Error("No executable exit route");
          return [request.args[0], options.routeOutput ?? 500_000n];
        default: throw new Error(`Unexpected contract method ${request.functionName}`);
      }
    },
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  }
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer, Date: FixedDate, Error, Math, Number, Promise,
    process: { env: { BSC_RPC_URL: "https://isolated-rpc.invalid" } },
    require(name) {
      if (name === "server-only") return {};
      if (name === "node:crypto") return require(name);
      if (name === "viem/chains") return { bsc: { id: 56 } };
      if (name === "viem") return {
        parseAbi: value => value, erc20Abi: viem.erc20Abi, formatUnits: viem.formatUnits,
        http(url, config) { calls.push({ method: "transport", url, config }); return {}; },
        createPublicClient() { calls.push({ method: "client" }); return client; },
        decodeEventLog({ abi, data }) {
          if (abi === viem.erc20Abi && data === "0x01") return transfer;
          if (abi !== viem.erc20Abi && data === "0x02" && !options.malformedSwap) return swap;
          throw new Error("This log does not match the requested ABI");
        },
      };
      throw new Error(`Unexpected verifier dependency ${name}`);
    },
  });
  return { verify: module.exports.verifyStmBscSwap, calls };
}

test("confirmed registered buy retains exact receipt identity, quantity and reviewed cluster", async () => {
  const { verify, calls } = fixture();
  const event = await verify(input, profile, risk);
  assert.equal(event.verified, true);
  assert.equal(event.exact, true);
  assert.equal(event.action, "swap-buy");
  assert.equal(event.quantity, 100.5);
  assert.equal(event.symbol, "HUNT");
  assert.equal(event.asset, `bsc:${TOKEN}`);
  assert.equal(event.traderId, `bsc:${WALLET}`);
  assert.equal(event.transactionHash, HASH);
  assert.equal(event.occurredAt, new Date(NOW - 60_000).toISOString());
  assert.equal(event.qualified, true);
  assert.equal(event.clusterId, profile.clusterId);
  assert.equal(event.retained, true);
  assert.equal(event.riskPassed, true);
  assert.equal(event.liquidityUsd, 200_000);
  assert.equal(event.routeAvailable, true);
  assert.equal(calls.filter(call => call.functionName === "getPair").length, 1);
  assert.equal(calls.filter(call => call.functionName === "getAmountsOut").length, 1);
});

test("a wallet transfer cannot impersonate a genuine factory-registered swap", async () => {
  const transferOnly = fixture({ logs: [{ address: TOKEN, data: "0x01", topics: [] }] });
  await assert.rejects(transferOnly.verify(input, profile, risk), /Swap|转账/);
  const unregistered = fixture({ registeredPair: OTHER_POOL });
  await assert.rejects(unregistered.verify(input, profile, risk), /已注册|转账/);
  const unrelatedToken = fixture({ tokenSecond: true, swap: { amount0Out: RAW, amount1Out: 0n } });
  await assert.rejects(unrelatedToken.verify(input, profile, risk), /同向|转账/);
  const malformed = fixture({ malformedSwap: true });
  await assert.rejects(malformed.verify(input, profile, risk), /Swap|转账/);
});

test("an unrelated same-token pool swap cannot launder a transfer into a wallet buy", async () => {
  const unrelatedTransfer = fixture({ transfer: { from: OTHER_POOL } });
  await assert.rejects(unrelatedTransfer.verify(input, profile, risk), /Swap|转账/);
  const differentAmount = fixture({ swap: { amount0Out: RAW + 1n } });
  await assert.rejects(differentAmount.verify(input, profile, risk), /Swap|转账/);
  const unrelatedSell = fixture({ transfer: { from: WALLET, to: OTHER_POOL }, swap: { amount0In: RAW, amount0Out: 0n } });
  await assert.rejects(unrelatedSell.verify(input, profile, risk), /Swap|转账/);
});

test("failed receipts and transactions from another wallet are rejected before further RPC reads", async () => {
  for (const receipt of [{ status: "reverted" }, { from: OTHER_WALLET }]) {
    const { verify, calls } = fixture({ receipt });
    await assert.rejects(verify(input, profile, risk), /未成功|发起人/);
    assert.equal(calls.some(call => call.method === "contract" || call.method === "head"), false);
  }
});

test("three subsequent blocks and a recent transaction are mandatory", async () => {
  const recentUnconfirmed = fixture({ head: 102n });
  await assert.rejects(recentUnconfirmed.verify(input, profile, risk), /3.*确认/);
  const old = fixture({ timestamp: BigInt(NOW / 1000 - 25 * 3600) });
  await assert.rejects(old.verify(input, profile, risk), /24.*小时|历史交易/);
  const future = fixture({ timestamp: BigInt(NOW / 1000 + 61) });
  await assert.rejects(future.verify(input, profile, risk), /时间|已知成交/);
});

test("risk, exit route, holdings and independent-entity qualification remain separate evidence", async () => {
  const noRoute = fixture({ routeThrows: true });
  const unrouteable = await noRoute.verify(input, profile, risk);
  assert.equal(unrouteable.verified, true);
  assert.equal(unrouteable.routeAvailable, false);
  assert.equal(noRoute.calls.filter(call => call.functionName === "getAmountsOut").length, 2);
  const noRisk = fixture();
  const unsafe = await noRisk.verify(input, profile, { ...risk, passed: false });
  assert.equal(unsafe.riskPassed, false);
  assert.equal(unsafe.routeAvailable, false);
  assert.equal(noRisk.calls.some(call => call.functionName === "getAmountsOut"), false);
  const sold = await fixture({ balance: RAW / 2n - 1n }).verify(input, profile, risk);
  assert.equal(sold.retained, false);
  for (const candidate of [null, { ...profile, qualified: false }, { ...profile, reviewedAt: null }, { ...profile, clusterId: null }, { ...profile, chain: "ethereum" }, { ...profile, address: OTHER_WALLET }]) {
    assert.equal((await fixture().verify(input, candidate, risk)).qualified, false);
  }
  assert.equal((await fixture().verify(input, { ...profile, address: OTHER_WALLET }, risk)).clusterId, null);
});

test("the monitored token can be token1 without reversing the buy direction", async () => {
  const event = await fixture({ tokenSecond: true, swap: { amount0Out: 0n, amount1Out: RAW } }).verify(input, profile, risk);
  assert.equal(event.action, "swap-buy");
  assert.equal(event.quantity, 100.5);
  assert.equal(event.routeAvailable, true);
});

test("registered sells are identified from the wallet's net outflow without inventing buy retention", async () => {
  const { verify, calls } = fixture({ transfer: { from: WALLET, to: POOL }, swap: { amount0In: RAW, amount1In: 0n, amount0Out: 0n, amount1Out: 2_000_000n }, balance: 0n });
  const event = await verify(input, profile, risk);
  assert.equal(event.action, "swap-sell");
  assert.equal(event.quantity, 100.5);
  assert.equal(event.retained, false);
  assert.equal(event.routeAvailable, false);
  assert.equal(calls.some(call => call.functionName === "getAmountsOut"), false);
});

test("expired processing budgets and log limits fail closed", async () => {
  const expired = fixture();
  await assert.rejects(expired.verify(input, profile, risk, { deadlineMs: NOW }), /预算/);
  assert.equal(expired.calls.length, 0);
  const limited = fixture();
  await assert.rejects(limited.verify(input, profile, risk, { maxLogs: 1 }), /Swap|转账/);
});
