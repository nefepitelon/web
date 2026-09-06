import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("password auth supports standard and QQ email addresses without a domain allowlist", async () => {
  const [form, route] = await Promise.all([read("components/login-form.tsx"), read("app/api/auth/password/route.ts")]);
  assert.match(form, /you@qq\.com/);
  assert.match(form, /密码登录/);
  assert.match(form, /注册账户/);
  assert.match(route, /signInWithPassword/);
  assert.match(route, /auth\.signUp/);
  assert.doesNotMatch(route, /qq\.com.*reject|ALLOWED_EMAIL_DOMAINS/);
});

test("new plans use 10-month annual pricing and offer verified BSC and TRON USDT", async () => {
  const [plans, page, crypto, migration] = await Promise.all([read("lib/plans.ts"), read("app/account/subscription/page.tsx"), read("lib/crypto-payments.ts"), read("prisma/migrations/20260821120000_expand_payments_referrals_onboarding_analytics/migration.sql")]);
  assert.match(plans, /pro: \{ month: 900, year: 9000 \}/);
  assert.match(plans, /max: \{ month: 1900, year: 19000 \}/);
  assert.match(page, /BSC_USDT/);
  assert.match(page, /BINANCE_UID/);
  assert.match(page, /WECHAT/);
  assert.match(page, /按 10 个月计费/);
  assert.match(crypto, /TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t/);
  assert.match(crypto, /55d398326f99059ff775485246999027b3197955/);
  for (const marker of ["only_confirmed=true", "PAYMENT_ADDRESS_MISMATCH", "PAYMENT_AMOUNT_INSUFFICIENT", "TX_ALREADY_USED"]) assert.match(crypto, new RegExp(marker));
  assert.match(migration, /ALTER TABLE "crypto_payments"/);
});

test("grid modules and toolbox enforce role-aware server gates", async () => {
  const [ops, classic, toolbox, exportRoute, entitlements] = await Promise.all([read("app/grid-ops/page.tsx"), read("app/classic-grid/page.tsx"), read("lib/toolbox.ts"), read("app/api/toolbox/export/route.ts"), read("lib/entitlements.ts")]);
  assert.match(ops, /entitlement="grid\.ops"/);
  assert.match(classic, /entitlement="grid\.classic"/);
  assert.match(toolbox, /items\.slice\(0, 8\)/);
  assert.match(exportRoute, /toolbox\.export/);
  assert.match(entitlements, /"grid\.ops": "max"/);
});

test("profile avatars and the only retained referral query link have branded social sharing", async () => {
  const [accountAction, overview, referrals, share, image, background] = await Promise.all([read("app/actions/account.ts"), read("app/account/page.tsx"), read("app/account/referrals/page.tsx"), read("components/referral-share-menu.tsx"), read("app/api/referrals/share-image/[handle]/route.tsx"), read("lib/referral-share-background.ts")]);
  assert.match(accountAction, /put\(`avatars\//);
  assert.match(overview, /\/?ref=\$\{viewer\.handle\}/);
  assert.doesNotMatch(overview, /\/i\/\$\{viewer\.handle\}/);
  assert.doesNotMatch(referrals, /备用推荐参数/);
  assert.match(share, /twitter\.com\/intent\/tweet/);
  assert.match(share, /service\.weibo\.com/);
  assert.match(share, /createPortal/);
  assert.match(share, /role="dialog"/);
  assert.match(share, /referral-share-dialog-backdrop/);
  assert.match(image, /系统跟踪BTC周期和链上信号!/);
  assert.match(image, /referralShareBackground/);
  assert.match(image, /linear-gradient\(90deg/);
  assert.match(background, /data:image\/jpeg;base64/);
});
