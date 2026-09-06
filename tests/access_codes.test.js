import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("login keeps a compact two-column identity surface and prominent optional access code", async () => {
  const [page, form, styles] = await Promise.all([
    read("app/login/page.tsx"),
    read("components/login-form.tsx"),
    read("app/globals.css")
  ]);

  assert.match(page, /系统跟踪BTC周期和链上信号!/);
  assert.doesNotMatch(page, /auth-story-tagline/);
  assert.match(page, /auth-brand-motion/);
  assert.match(page, /welinkbtc-orbit-brand\.webp/);
  assert.doesNotMatch(page, /---从研究、信号、报价到清算，保持同一个工作台。/);
  assert.doesNotMatch(page, /钱包只作为经过签名验证的账户连接/);
  assert.match(page, /auth-grid auth-grid--login/);
  assert.match(form, /className="access-code-capsule"/);
  assert.match(form, /可选，可跳过/);
  assert.match(form, /accessCode: accessCode\.trim\(\) \|\| undefined/);
  assert.match(form, /请在你的邮箱收件箱中查看登录链接/);
  assert.match(form, /垃圾邮件或所有邮件/);
  assert.match(form, /建议开启 VPN/);
  assert.match(styles, /\.access-code-capsule,/);
  assert.match(styles, /\.auth-panel--login \.access-code-capsule \{[\s\S]*border: 2px solid/);
  assert.match(styles, /\.auth-panel--login \.auth-input \{ min-height: 38px/);
  assert.match(styles, /@media \(max-width: 1440px\)[\s\S]*\.auth-grid--login \{ grid-template-columns: minmax\(250px, \.82fr\) minmax\(340px, 1\.18fr\)/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*\.auth-grid--login \{ grid-template-columns: 1fr/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*body:has\(\.auth-page\) #surf-assistant/);
});

test("email and Google auth validate pending codes before the callback redeems them", async () => {
  const [email, google, callback, service] = await Promise.all([
    read("app/api/auth/email/route.ts"),
    read("app/api/auth/google/route.ts"),
    read("app/auth/callback/route.ts"),
    read("lib/access-codes.ts")
  ]);

  for (const source of [email, google]) {
    assert.match(source, /validateAccessCode/);
    assert.match(source, /PENDING_ACCESS_CODE_COOKIE/);
  }
  assert.match(callback, /redeemAccessCode\(data\.user\.id, pendingAccessCode, "login"\)/);
  assert.match(callback, /syncAuthenticatedUser\(data\.user\)/);
  assert.match(callback, /PENDING_ACCESS_CODE_COOKIE, "", \{ expires: new Date\(0\)/);
  assert.match(service, /createHash\("sha256"\)/);
  assert.match(service, /TransactionIsolationLevel\.Serializable/);
  assert.match(service, /accessCodeId_userId/);
});

test("access codes create a time-bound Max grant without admin access", async () => {
  const [schema, migration, membership, entitlements] = await Promise.all([
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260808152000_add_access_codes/migration.sql"),
    read("lib/membership.ts"),
    read("lib/entitlements.ts")
  ]);

  assert.match(schema, /model AccessCode\s*\{/);
  assert.match(schema, /durationDays\s+Int\s+@default\(30\)/);
  assert.match(schema, /model AccessCodeRedemption\s*\{/);
  assert.match(schema, /@@unique\(\[accessCodeId, userId\]\)/);
  assert.match(migration, /CREATE TABLE "access_code_redemptions"/);
  assert.match(membership, /if \(hasActiveAccessGrant\) return "max"/);
  assert.match(membership, /accessRedemptions:/);
  assert.match(entitlements, /if \(viewer\?\.role === "admin"\) return true/);
  assert.match(entitlements, /if \(required === "admin"\) return false/);
});

test("users can redeem later and admins can issue and disable campaigns", async () => {
  const [accountPage, redeemAction, adminPage, adminAction, accountSidebar, adminSidebar] = await Promise.all([
    read("app/account/referrals/page.tsx"),
    read("app/actions/access-code.ts"),
    read("app/admin/access-codes/page.tsx"),
    read("app/actions/admin.ts"),
    read("components/account-sidebar.tsx"),
    read("components/admin-sidebar.tsx")
  ]);

  assert.match(accountPage, /<AccessCodeRedeemForm \/>/);
  assert.match(accountPage, /同一个 Access Code 仅可兑换一次/);
  assert.match(redeemAction, /requireViewer\("\/account\/referrals"\)/);
  assert.match(redeemAction, /管理员后台不会开放/);
  assert.match(adminPage, /<AccessCodeAdminForm \/>/);
  assert.match(adminPage, /停用只阻止新的兑换/);
  assert.match(adminAction, /admin\.access_code\.created/);
  assert.match(adminAction, /admin\.access_code\.deactivated/);
  assert.match(accountSidebar, /\/account\/referrals/);
  assert.match(adminSidebar, /\/admin\/access-codes/);
});
