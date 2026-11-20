import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const ADMIN = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const redirect = (url) => { throw new Error(`REDIRECT:${url}`); };

async function load(path, mocks) {
  const source = await read(path);
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/") || name.startsWith("next/") || name === "server-only") {
      throw new Error(`Missing test dependency: ${name}`);
    }
    return require(name);
  }, exports);
  return exports;
}

function form(values) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, String(value));
  return data;
}

function adminMocks(prisma, writeAudit, requireAdmin = async () => ({ id: ADMIN })) {
  return {
    "next/cache": { revalidatePath() {} }, "next/navigation": { redirect },
    "@/lib/access-codes": { normalizeAccessCode: (s) => s.replace(/-/g, "").toUpperCase(), hashAccessCode: () => "digest", accessCodeHint: () => "ABCD…WXYZ" },
    "@/lib/audit": { writeAudit }, "@/lib/membership": { requireAdmin }, "@/lib/prisma": { prisma },
    "@/lib/supabase/admin": { createSupabaseAdminClient: () => null },
    "@/lib/wlb-assets": { syncEligibleCommissionWlb: async () => {} }
  };
}

test("all administrative mutations authorize on the server before reading or writing records", async () => {
  const denied = async () => { throw new Error("DENIED"); };
  const db = new Proxy({}, { get() { throw new Error("Database reached before authorization"); } });
  const actions = await load("app/actions/admin.ts", adminMocks(db, denied, denied));
  assert.equal(Object.keys(actions).length, 9);
  for (const [name, action] of Object.entries(actions)) {
    await assert.rejects(action(new FormData()), /DENIED/, name);
  }
  for (const path of ["app/actions/admin-crypto.ts", "app/actions/admin-wlb-assets.ts"]) {
    const extra = await load(path, {
      ...adminMocks(db, denied, denied), "@vercel/blob": { put: denied },
      "@/lib/crypto-payments": {}, "@/lib/wlb-assets": {}
    });
    for (const [name, action] of Object.entries(extra)) await assert.rejects(action(new FormData()), /DENIED/, name);
  }
});

test("access-code creation rolls back if its audit entry cannot be written", async () => {
  const state = { codes: [] };
  const db = {
    accessCode: { findUnique: async () => null },
    async $transaction(fn) {
      const pending = [];
      const tx = { accessCode: { create: async ({ data }) => { const row = { id: "code-1", ...data }; pending.push(row); return row; } } };
      const result = await fn(tx);
      state.codes.push(...pending);
      return result;
    }
  };
  let auditTx;
  const actions = await load("app/actions/admin.ts", adminMocks(db, async (_input, tx) => { auditTx = tx; throw new Error("AUDIT_FAILED"); }));
  await assert.rejects(actions.createAccessCodeAction(form({ label: "New campaign", code: "ABCD-EFGH-IJKL-WXYZ" })), /AUDIT_FAILED/);
  assert.ok(auditTx?.accessCode, "audit must use the same transaction as the code");
  assert.deepEqual(state.codes, []);
});

test("an inactive or email-unverified target cannot be promoted to an administrative role", async () => {
  for (const target of [{ status: "SUSPENDED", emailVerifiedAt: new Date() }, { status: "ACTIVE", emailVerifiedAt: null }]) {
    let roleWrite = false;
    const tx = {
      user: { findUniqueOrThrow: async () => target },
      role: { findMany: async () => { roleWrite = true; return []; } }
    };
    const actions = await load("app/actions/admin.ts", adminMocks({ $transaction: (fn) => fn(tx) }, async () => {}));
    await assert.rejects(actions.updateUserRoleAction(form({ userId: TARGET, role: "admin" })), /已验证邮箱/);
    assert.equal(roleWrite, false);
  }
});

test("an unavailable Auth admin service cannot silently remove only local MFA protection", async () => {
  let deleted = false;
  const db = { twoFactorSetting: { findUnique: async () => ({ factorId: "factor-1" }) }, $transaction: async () => { deleted = true; } };
  const actions = await load("app/actions/admin.ts", adminMocks(db, async () => {}));
  await assert.rejects(actions.resetUserTwoFactorAction(form({ userId: TARGET })), /不能重置 2FA/);
  assert.equal(deleted, false);
});

test("cash-collection and WLB configuration updates cannot commit without their audit entry", async () => {
  for (const [path, name, dependencies] of [
    ["app/actions/admin-crypto.ts", "updateCryptoPaymentSettingsAction", {
      "@/lib/crypto-payments": { getCryptoPaymentSettings: async () => ({ binanceUid: { qrCodeUrl: "" }, wechat: { qrCodeUrl: "" } }) },
      "@vercel/blob": { put: async () => { throw new Error("Unexpected upload"); } }
    }],
    ["app/actions/admin-wlb-assets.ts", "updateWlbAssetSettingsAction", {
      "@/lib/wlb-assets": { getWlbAssetSettings: async () => ({ minDepositUsdt: 1, minTransferWlb: 1, minWithdrawalWlb: 1, withdrawalFeeWlb: 0, maxDailyTransferWlb: 100 }) }
    }]
  ]) {
    let committed = false;
    const tx = { systemSetting: { upsert: async () => ({}) } };
    const db = { async $transaction(fn) { const result = await fn(tx); committed = true; return result; } };
    const actions = await load(path, { ...adminMocks(db, async (_input, passedTx) => { assert.equal(passedTx, tx); throw new Error("AUDIT_FAILED"); }), ...dependencies });
    await assert.rejects(actions[name](new FormData()), /AUDIT_FAILED/);
    assert.equal(committed, false);
  }
});

test("historical malformed access-code records cannot mint a perpetual trial or grant a suspended account", async () => {
  const base = { id: "code-1", active: true, durationDays: 30, startsAt: null, expiresAt: null, maxRedemptions: null, redemptionCount: 0, label: "Trial" };
  let reserved = false;
  const tx = {
    user: { findUnique: async () => ({ status: "ACTIVE", emailVerifiedAt: new Date() }) },
    accessCode: { findUnique: async () => ({ ...base, durationDays: 36500 }), updateMany: async () => { reserved = true; return { count: 1 }; } }
  };
  const db = { accessCode: tx.accessCode, $transaction: (fn) => fn(tx) };
  const codes = await load("lib/access-codes.ts", {
    "server-only": {}, "@/lib/prisma": { prisma: db },
    "@/lib/max-trial": { WELINK_ACCESS_CODE: "WELINK", welinkMaxTrialEndsAt: () => new Date() }
  });
  assert.equal((await codes.validateAccessCode("FORGED-CODE")).valid, false);
  assert.equal((await codes.redeemAccessCode(TARGET, "FORGED-CODE", "account")).status, "invalid");
  assert.equal(reserved, false);
  tx.user.findUnique = async () => ({ status: "SUSPENDED", emailVerifiedAt: new Date() });
  tx.accessCode.findUnique = async () => { throw new Error("Code lookup must not occur for suspended account"); };
  assert.equal((await codes.redeemAccessCode(TARGET, "WELINK", "account")).status, "invalid");
});

async function membershipHarness({ confirmed = true, claims = { sub: ADMIN, aal: "aal1", session_id: "session-1" }, claimsError = null, enabled = true, status = "ACTIVE", sessionActive = true } = {}) {
  const record = {
    id: ADMIN, email: "admin@example.test", emailVerifiedAt: new Date(), status,
    lastLoginAt: new Date(), roles: [{ role: { key: "admin" }, roleId: "admin-role" }],
    subscriptions: [{ status: "FREE", planKey: "free", updatedAt: new Date(), provider: "admin", billingInterval: "month", currentPeriodEnd: null }],
    accessRedemptions: [], onboardingTasks: [], profile: null,
    twoFactor: enabled ? { factorId: "factor-1", enabledAt: new Date("2026-11-01T00:00:00Z") } : null
  };
  let transactionReached = false;
  let bindingObserved;
  const supabase = { auth: {
    getUser: async () => ({ data: { user: { id: ADMIN, email: record.email, email_confirmed_at: confirmed ? "2026-11-01T00:00:00Z" : null } } }),
    getClaims: async () => ({ data: { claims }, error: claimsError }),
    mfa: { getAuthenticatorAssuranceLevel: async () => { throw new Error("Unverified local AAL decoding must not run"); } }
  } };
  const exports = await load("lib/membership.ts", {
    "next/headers": { cookies: async () => ({ get: () => ({ value: "old-pass" }) }) },
    "next/navigation": { redirect }, react: { cache: (fn) => fn },
    "@/lib/entitlements": { allEntitlements: () => [] },
    "@/lib/auth-session": { hasActiveAuthSession: async () => sessionActive },
    "@/lib/max-trial": { WELINK_ACCESS_CODE: "WELINK", WELINK_MAX_TRIAL_ANNOUNCEMENT_TASK: "welcome" },
    "@/lib/prisma": { isDatabaseConfigured: () => true, prisma: { user: { findUnique: async () => record }, $transaction: async () => { transactionReached = true; } } },
    "@/lib/referrals": { awardRegistrationReferral() {} },
    "@/lib/security": {
      twoFactorBindingFromClaims: (verified, userId, factorId, enabledAt) => verified?.sub === userId && verified.session_id && factorId && enabledAt ? { sessionId: verified.session_id, factorId, enabledAt: enabledAt.toISOString() } : null,
      verifyTwoFactorPass: async (_token, _id, binding) => { bindingObserved = binding; return false; }
    },
    "@/lib/supabase/server": { createServerSupabaseClient: async () => supabase }
  });
  return { exports, transactionReached: () => transactionReached, binding: () => bindingObserved };
}

test("email-unverified Auth identities cannot project users or bootstrap ADMIN_EMAILS", async () => {
  const harness = await membershipHarness({ confirmed: false });
  assert.equal(await harness.exports.getViewer(), null);
  await assert.rejects(harness.exports.syncAuthenticatedUser({ id: ADMIN, email: "admin@example.test", email_confirmed_at: null }), /verified email/);
  assert.equal(harness.transactionReached(), false);
});

test("administrator access requires valid matching claims and a completed enabled second factor", async () => {
  for (const args of [{ claims: { sub: TARGET, aal: "aal2" } }, { claimsError: new Error("Invalid signature") }]) {
    const harness = await membershipHarness(args);
    assert.equal(await harness.exports.getViewer(), null);
  }
  const aal1 = await membershipHarness();
  const viewer = await aal1.exports.getViewer();
  assert.equal(viewer.needsSecondFactor, true);
  assert.equal(aal1.binding().sessionId, "session-1");
  await assert.rejects(aal1.exports.requireAdmin(), /auth\/verify-2fa/);
  const noFactor = await membershipHarness({ enabled: false });
  await assert.rejects(noFactor.exports.requireAdmin(), /account\/security/);
  const aal2 = await membershipHarness({ claims: { sub: ADMIN, aal: "aal2", session_id: "session-1" } });
  assert.equal((await aal2.exports.requireAdmin()).id, ADMIN);
});

test("the fast authorization projection never grants admin for suspended or missing MFA accounts", async () => {
  for (const args of [{ enabled: false }, { status: "SUSPENDED", claims: { sub: ADMIN, aal: "aal2" } }, {}]) {
    const harness = await membershipHarness(args);
    assert.equal((await harness.exports.getActiveViewerAccess()).isAdmin, false);
  }
});

test("a signed JWT cannot authorize any viewer projection after its Auth session is revoked", async () => {
  const harness = await membershipHarness({ sessionActive: false, claims: { sub: ADMIN, aal: "aal2", session_id: "session-before-admin-mfa-reset" } });
  assert.equal(await harness.exports.getViewer(), null);
  assert.equal(await harness.exports.getActiveViewerId(), null);
  assert.equal(await harness.exports.getActiveViewerAccess(), null);
  assert.equal(harness.transactionReached(), false);
  const refreshedSameSession = await membershipHarness({ sessionActive: false, claims: { sub: ADMIN, aal: "aal2", session_id: "session-before-admin-mfa-reset", iat: Date.now() / 1000 } });
  assert.equal(await refreshedSameSession.exports.getViewer(), null);
  const newLogin = await membershipHarness({ claims: { sub: ADMIN, aal: "aal2", session_id: "new-session-after-admin-mfa-reset" } });
  assert.equal((await newLogin.exports.getViewer()).id, ADMIN);
});

test("Data API hardening covers every Prisma business table and future migration-role defaults without deleting evidence", async () => {
  const baseline = "20261119093000_harden_all_business_data_api";
  const folders = (await readdir(new URL("../prisma/migrations/", import.meta.url))).filter(name => name >= baseline);
  const [schema, sql] = await Promise.all([
    read("prisma/schema.prisma"), Promise.all(folders.map(name => read(`prisma/migrations/${name}/migration.sql`)))
  ]);
  // New business tables are secured in additive migrations; deployed migration
  // checksums must remain immutable when a later feature introduces a table.
  const migration = sql.join("\n");
  const tables = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)].map((match) => match[2].match(/@@map\("([^"]+)"\)/)?.[1] || match[1]);
  assert.ok(tables.length >= 72);
  for (const table of tables) assert.ok(migration.includes(`'${table}'`) || migration.includes(`"${table}"`), table);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM PUBLIC/);
  assert.match(migration, /ARRAY\['anon', 'authenticated'\]/);
  assert.match(migration, /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES/);
  assert.ok(migration.includes("'_prisma_migrations'"));
  assert.ok(migration.includes("'telegram_signals'"));
  assert.match(migration, /ALTER FUNCTION public\.prevent_wlb_ledger_mutation\(\) SET search_path = pg_catalog/);
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.prevent_wlb_ledger_mutation\(\) FROM PUBLIC/);
  assert.doesNotMatch(migration, /\b(?:DELETE FROM|TRUNCATE|DROP TABLE|FORCE ROW LEVEL SECURITY)\b/);
});
