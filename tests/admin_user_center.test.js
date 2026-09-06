import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin user management links every row to a no-prefetch read-only user center", async () => {
  const page = await read("app/admin/users/page.tsx");
  assert.match(page, /href=\{`\/admin\/users\/\$\{user\.id\}`\}/);
  assert.match(page, /prefetch=\{false\}>查看中心/);
  assert.match(page, /socialAccounts: \{ select: \{ provider: true \} \}/);
  assert.match(page, /wallets: \{ select: \{ id: true \} \}/);
  assert.match(page, /wlbAccount: \{ select: \{ availableMilliWlb: true, pendingWithdrawalMilliWlb: true \} \}/);
  for (const label of ["X 已绑定", "钱包", "WLB 资产"]) assert.match(page, new RegExp(label));
  assert.match(page, /用户绑定状态筛选/);
  assert.match(page, /activeTag === "twitter"/);
  assert.match(page, /activeTag === "wallet"/);
  assert.match(page, /activeTag === "wlb"/);
});

test("admin user center is protected and exposes a safe account snapshot", async () => {
  const page = await read("app/admin/users/[id]/page.tsx");
  assert.match(page, /requireAdmin\(`\/admin\/users\/\$\{id\}`\)/);
  assert.match(page, /ADMIN READ-ONLY VIEW/);
  assert.match(page, /仅查看，不会切换身份/);
  assert.match(page, /socialAccounts:[\s\S]*?select: \{ provider: true, username: true, profileUrl: true, createdAt: true, updatedAt: true \}/);
  assert.doesNotMatch(page, /accessToken:\s*true|refreshToken:\s*true|factorId:\s*true|apiKeys:/);
  assert.match(page, /detail=\{wallet\.address\}/);
  assert.match(page, /admin-user-center__wallet-address/);
  assert.doesNotMatch(page, /compactAddress\(wallet\.address\)/);
  assert.match(page, /notFound\(\)/);
});

test("admin user center includes subscriptions, referrals, security and onboarding state", async () => {
  const page = await read("app/admin/users/[id]/page.tsx");
  assert.match(page, /订阅与体验权益/);
  assert.match(page, /成功邀请/);
  assert.match(page, /双重验证/);
  assert.match(page, /新人指导与内容参与/);
  assert.match(page, /onboardingTasks\.map/);
});
