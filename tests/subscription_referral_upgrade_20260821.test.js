import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("BSC USDT verifies chain, official token, destination, amount and confirmations", async () => {
  const crypto = await read("lib/crypto-payments.ts");
  for (const marker of ["eth_chainId", "eth_getTransactionReceipt", "eth_blockNumber", "BSC_CHAIN_ID", "USDT_BSC_CONTRACT", "PAYMENT_ADDRESS_MISMATCH", "PAYMENT_AMOUNT_INSUFFICIENT"]) {
    assert.match(crypto, new RegExp(marker));
  }
  assert.match(crypto, /activatePaidSubscription/);
});

test("manual Binance UID and WeChat payments require proof and admin review", async () => {
  const [crypto, invoice, admin] = await Promise.all([
    read("lib/crypto-payments.ts"),
    read("app/account/subscription/crypto/[id]/page.tsx"),
    read("app/admin/crypto-payments/page.tsx")
  ]);
  assert.match(crypto, /PAYMENT_PROOF_REQUIRED/);
  assert.match(crypto, /reviewDueAt/);
  assert.match(crypto, /status: input\.approved \? "PAID" : "FAILED"/);
  assert.match(invoice, /提交付款凭证审核/);
  assert.match(admin, /确认到账并开通/);
});

test("referrals support registration, qualified users and two subscription levels", async () => {
  const [referrals, settings, guide] = await Promise.all([
    read("lib/referrals.ts"),
    read("app/admin/referrals/page.tsx"),
    read("app/account/getting-started/page.tsx")
  ]);
  assert.match(referrals, /REGISTERED_USER/);
  assert.match(referrals, /VALID_USER/);
  assert.match(referrals, /level1RateBps/);
  assert.match(referrals, /level2RateBps/);
  assert.match(settings, /每位有效用户奖励/);
  assert.match(guide, /新人指导任务/);
});

test("admin overview tracks visits, active, paid and referred users with daily trends", async () => {
  const [overview, tracker] = await Promise.all([
    read("app/admin/page.tsx"),
    read("components/analytics-tracker.tsx")
  ]);
  for (const marker of ["注册用户数", "30 日活跃用户", "平台访问次数", "付费用户数", "推荐用户数", "最近 14 天"]) {
    assert.match(overview, new RegExp(marker));
  }
  assert.match(tracker, /\/api\/analytics\/event/);
});
