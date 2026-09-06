import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("WLB ledger fixes the USDT conversion and stores integer milli-WLB amounts", async () => {
  const [schema, service] = await Promise.all([
    read("prisma/schema.prisma"),
    read("lib/wlb-assets.ts")
  ]);
  assert.match(schema, /availableMilliWlb\s+BigInt/);
  assert.match(schema, /pendingWithdrawalMilliWlb\s+BigInt/);
  assert.match(service, /WLB_PER_USDT = 10/);
  assert.match(service, /MILLI_WLB_PER_USDT_CENT = 100n/);
  assert.doesNotMatch(service, /parseFloat\(/);
});

test("deposits accept only configured BSC and TRON USDT and globally claim transaction hashes", async () => {
  const [actions, service, payments, schema] = await Promise.all([
    read("app/actions/wlb-assets.ts"),
    read("lib/wlb-assets.ts"),
    read("lib/crypto-payments.ts"),
    read("prisma/schema.prisma")
  ]);
  assert.match(actions, /z\.enum\(\["BSC_USDT", "TRON_USDT"\]\)/);
  assert.match(service, /verifyUsdtTransfer/);
  assert.match(service, /purpose: "WLB_DEPOSIT"/);
  assert.match(payments, /purpose: "SUBSCRIPTION"/);
  assert.match(schema, /@@unique\(\[network, txHash\]\)/);
});

test("internal transfers and withdrawals use serializable balance-guarded transactions", async () => {
  const service = await read("lib/wlb-assets.ts");
  assert.match(service, /availableMilliWlb: \{ gte: amountMilliWlb \}/);
  assert.match(service, /pendingWithdrawalMilliWlb: \{ increment: amountMilliWlb \}/);
  assert.match(service, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(service, /phase: input\.approved \? "SETTLE" : "RELEASE"/);
  assert.match(service, /purpose: "WLB_WITHDRAWAL"/);
});

test("asset surfaces expose user operations and administrator chain approval", async () => {
  const [accountPage, adminPage, accountSidebar, adminSidebar] = await Promise.all([
    read("app/account/assets/page.tsx"),
    read("app/admin/assets/page.tsx"),
    read("components/account-sidebar.tsx"),
    read("components/admin-sidebar.tsx")
  ]);
  for (const label of ["充值", "站内划转", "提现", "近期资金账单"]) assert.match(accountPage, new RegExp(label));
  for (const anchor of ["deposit", "transfer", "withdraw"]) {
    assert.match(accountPage, new RegExp(`href="#wlb-${anchor}"`));
    assert.match(accountPage, new RegExp(`id="wlb-${anchor}"`));
  }
  assert.match(accountPage, /aria-label="资产快捷操作"/);
  assert.match(adminPage, /提现审核/);
  assert.match(adminPage, /核验哈希并批准/);
  assert.match(adminPage, /<code>\{item\.payoutAddress\}<\/code>/);
  assert.match(adminPage, /<CopyButton value=\{item\.payoutAddress\} label="复制地址" \/>/);
  assert.match(adminPage, /活动奖励发放/);
  assert.match(accountSidebar, /\/account\/assets/);
  assert.match(adminSidebar, /\/admin\/assets/);
});

test("approved referral commissions are idempotently converted to WLB", async () => {
  const [service, adminActions] = await Promise.all([
    read("lib/wlb-assets.ts"),
    read("app/actions/admin.ts")
  ]);
  assert.match(service, /externalReference: reference/);
  assert.match(service, /`commission:\$\{commission\.id\}`/);
  assert.match(service, /status: \{ in: \["APPROVED", "PAYABLE", "PAID"\] \}/);
  assert.match(adminActions, /syncEligibleCommissionWlb\(commission\.referrerUserId\)/);
});
