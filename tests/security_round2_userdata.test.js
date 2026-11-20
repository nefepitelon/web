import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SESSION = "33333333-3333-4333-8333-333333333333";
const active = { id: OWNER, status: "ACTIVE", role: "free", plan: "free", needsSecondFactor: false, twoFactorEnabled: false, twoFactorPassed: true };
const redirect = url => { throw new Error(`REDIRECT:${url}`); };
async function load(path, mocks = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", code)(name => {
    if (name in mocks) return mocks[name];
    if (name === "server-only") return {};
    if (name.startsWith("@/") || name.startsWith("next/")) throw new Error(`Missing dependency: ${name}`);
    return require(name);
  }, exports);
  return exports;
}
const security = () => load("lib/request-security.ts", { "next/headers": { headers: async () => new Headers() } });
const owned = (row, select) => Object.fromEntries(Object.entries(select).filter(([, include]) => include === true).map(([key]) => [key, row[key]]));

test("session revocation checks a verified user/session pair without reading tokens or falling open", async () => {
  let count = 0;
  let result = [{ active: true }];
  const { hasActiveAuthSession } = await load("lib/auth-session.ts", {
    react: { cache: f => f }, "@/lib/prisma": { prisma: { $queryRaw: async (sql, ...values) => {
      count++; assert.deepEqual(values, [SESSION, OWNER, OWNER]);
      assert.match(sql.join("?"), /s.not_after IS NULL OR s.not_after > now\(\)/);
      assert.match(sql.join("?"), /revoked.action = 'admin.user.2fa.reset_requested'/);
      assert.match(sql.join("?"), /revoked\."targetType" = 'user'/);
      assert.doesNotMatch(sql.join("?"), /JOIN public\.(users|user_roles|roles)/);
      assert.match(sql.join("?"), /revoked\."createdAt" >= s.created_at/);
      assert.doesNotMatch(sql.join("?"), /SELECT\s+\*/i);
      if (result instanceof Error) throw result;
      return result;
    } } }
  });
  assert.equal(await hasActiveAuthSession(OWNER, "not-a-session"), false);
  assert.equal(count, 0);
  assert.equal(await hasActiveAuthSession(OWNER, SESSION), true);
  result = [{ active: false }];
  assert.equal(await hasActiveAuthSession(OWNER, SESSION), false);
  result = new Error("database unavailable");
  assert.equal(await hasActiveAuthSession(OWNER, SESSION), false);
});

test("research permissions deny suspended users, pending MFA, and unenrolled administrators", async () => {
  const access = await load("lib/research-access.ts");
  for (const viewer of [{ ...active, role: "admin", status: "SUSPENDED" }, { ...active, role: "admin", needsSecondFactor: true }, { ...active, role: "admin" }]) {
    assert.equal(access.canManageResearch(viewer), false);
    assert.equal(access.canReadResearch("MAX", viewer), false);
  }
  assert.equal(access.canReadResearch("PUBLIC", null), true);
  assert.equal(access.canReadResearch("PRO", { ...active, plan: "pro" }), true);
  assert.equal(access.canManageResearch({ ...active, role: "admin", twoFactorEnabled: true }), true);
});

test("suspended administrators cannot upload or import before request parsing or storage writes", async () => {
  const requestSecurity = await security();
  const viewer = { ...active, role: "admin", status: "SUSPENDED", twoFactorEnabled: true };
  for (const path of ["app/api/research/upload/route.ts", "app/api/research/import/route.ts"]) {
    const api = await load(path, {
      "@vercel/blob": { put: () => { throw new Error("Unexpected storage"); } },
      "@/lib/membership": { getViewer: async () => viewer }, "@/lib/request-security": requestSecurity,
      "@/lib/audit": {}, "@/lib/prisma": {}, "@/lib/rate-limit": {},
      "@/lib/research-import": {}, "@/lib/research-routing": {}
    });
    const response = await api.POST(new Request("https://app.test/api", { method: "POST", headers: { origin: "https://app.test" } }));
    assert.equal(response.status, 403, path);
  }
});

test("member payloads reject suspended accounts before entitlement evaluation", async () => {
  const api = await load("app/api/member/[resource]/route.ts", {
    "@/lib/entitlements": {}, "@/lib/content-gates": { configuredAccess: () => { throw new Error("Unexpected entitlement lookup"); } },
    "@/lib/membership": { getViewer: async () => ({ ...active, status: "SUSPENDED", role: "admin" }) }
  });
  assert.equal((await api.GET(new Request("https://app.test"), { params: Promise.resolve({ resource: "research-full" }) })).status, 403);
});

test("referral API excludes invitee email, user identifiers, payment event IDs and internal sources", async () => {
  const sensitive = { userId: OTHER, referrerUserId: OWNER, referredUserId: OTHER, email: "private-invitee@secret.test", paymentEventId: "stripe-private-payment", source: "private-marketing-info" };
  const row = { ...sensitive, id: "owned-item", code: "invite", createdAt: new Date(), qualifiedAt: null, referred: { email: sensitive.email }, status: "PENDING", amountCents: 50 };
  const find = async ({ where, select }) => { assert.ok(Object.values(where).includes(OWNER)); return owned(row, select); };
  const api = await load("app/api/referrals/me/route.ts", {
    "@/lib/membership": { requireViewer: async () => active },
    "@/lib/prisma": { prisma: { referralCode: { findFirst: find }, referral: { findMany: async q => [await find(q)] }, commissionLedger: { findMany: async q => [await find(q)] } } }
  });
  const response = await api.GET();
  const body = await response.text();
  for (const value of Object.values(sensitive)) assert.ok(!body.includes(value));
  assert.match(body, /owned-item/);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
});

test("API-key revoke rejects foreign origin and scopes the atomic mutation to its owner", async () => {
  let auth = 0;
  let audit = 0;
  const tx = { apiKey: { updateMany: async ({ where }) => { assert.deepEqual(where, { id: "victim-key", userId: OWNER, revokedAt: null }); return { count: 0 }; } } };
  const api = await load("app/api/keys/[id]/route.ts", {
    "next/server": { NextResponse: { redirect: url => new Response(null, { status: 303, headers: { location: String(url) } }) } },
    "@/lib/request-security": await security(), "@/lib/membership": { requireViewer: async () => { auth++; return active; } },
    "@/lib/prisma": { prisma: { $transaction: fn => fn(tx) } }, "@/lib/audit": { writeAudit: async () => { audit++; } }
  });
  const params = { params: Promise.resolve({ id: "victim-key" }) };
  assert.equal((await api.POST(new Request("https://app.test/api", { method: "POST", headers: { origin: "https://hostile.test" } }), params)).status, 403);
  assert.equal(auth, 0);
  const response = await api.DELETE(new Request("https://app.test/api", { method: "DELETE", headers: { origin: "https://app.test" } }), params);
  assert.deepEqual(await response.json(), { ok: false });
  assert.equal(audit, 0);
});

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 11, 22, 33, 44]);
async function proofHarness() {
  const encryption = await load("lib/secret-encryption.ts");
  let stored;
  const api = await load("lib/payment-proofs.ts", {
    "@/lib/secret-encryption": encryption,
    "@vercel/blob": { put: async (path, bytes, options) => { stored = { path, bytes, options }; return { url: `https://store.public.blob.vercel-storage.com/${path}` }; } }
  });
  return { api, stored: () => stored, encryption };
}

test("payment uploads store only context-bound ciphertext with no user identifiers in public paths", async () => {
  const previous = process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY;
  const previousBlob = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_store_test";
  process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY = "test-only-encryption-key-never-a-production-secret";
  try {
    const harness = await proofHarness();
    const url = await harness.api.storePaymentProof(new File([png], "private-name.png", { type: "image/png" }), "invoice-one", OWNER);
    const stored = harness.stored();
    assert.ok(!stored.path.includes(OWNER) && !stored.path.includes("invoice-one") && !stored.path.includes("private-name"));
    assert.equal(stored.options.contentType, "application/octet-stream");
    assert.ok(!stored.bytes.includes(png.toString("base64")));
    assert.deepEqual(harness.encryption.decryptSecretBytes(stored.bytes, `payment-proof:invoice-one:${OWNER}`), png);
    assert.throws(() => harness.encryption.decryptSecretBytes(stored.bytes, `payment-proof:invoice-one:${OTHER}`));
    assert.match(url, /secure-v1/);
    await assert.rejects(harness.api.storePaymentProof(new File(["<svg>unsafe</svg>"], "wrong.png", { type: "image/png" }), "invoice-one", OWNER), /INVALID_PROOF/);
  } finally {
    if (previous === undefined) delete process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY; else process.env.TRADING_CREDENTIALS_ENCRYPTION_KEY = previous;
    if (previousBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previousBlob;
  }
});

test("payment proof fetches reject SSRF destinations, redirects and oversized data", async () => {
  const previousBlob = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_store_test";
  const { api } = await proofHarness();
  for (const url of ["http://127.0.0.1/payment-proofs/a", "https://evil.test/payment-proofs/a", "https://other-store.public.blob.vercel-storage.com/payment-proofs/a", "https://store.public.blob.vercel-storage.com/private/a", "https://store.public.blob.vercel-storage.com/payment-proofs/a?token=secret"]) assert.throws(() => api.trustedPaymentProofUrl(url));
  const previous = global.fetch;
  try {
    global.fetch = async (_url, options) => { assert.equal(options.redirect, "error"); assert.equal(options.cache, "no-store"); return new Response(png, { headers: { "content-length": String(api.MAX_PAYMENT_PROOF_BYTES + 1) } }); };
    await assert.rejects(api.readPaymentProof("https://store.public.blob.vercel-storage.com/payment-proofs/legacy.png", "invoice", OWNER), /PROOF_TOO_LARGE/);
  } finally { global.fetch = previous; if (previousBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previousBlob; }
});

test("payment proof download enforces owner/admin-MFA access and returns private attachment headers", async () => {
  let viewer = active;
  let found = false;
  let readCount = 0;
  const api = await load("app/api/account/payment-proofs/[id]/route.ts", {
    "@/lib/membership": { getViewer: async () => viewer },
    "@/lib/prisma": { prisma: { cryptoPayment: { findFirst: async ({ where, select }) => {
      assert.deepEqual(Object.keys(select), ["id", "userId", "proofUrl"]);
      if (where.userId) assert.equal(where.userId, OWNER);
      else assert.ok(viewer.role === "admin" && viewer.twoFactorEnabled && viewer.twoFactorPassed);
      return found ? { id: "invoice", userId: OWNER, proofUrl: "internal-location-never-return" } : null;
    } } } },
    "@/lib/payment-proofs": { readPaymentProof: async () => { readCount++; return { bytes: Buffer.from(png), type: "image/png", extension: "png" }; } }
  });
  const get = () => api.GET(new Request("https://app.test"), { params: Promise.resolve({ id: "invoice" }) });
  assert.equal((await get()).status, 404); assert.equal(readCount, 0);
  viewer = { ...active, role: "admin", needsSecondFactor: true, twoFactorEnabled: true, twoFactorPassed: false };
  assert.equal((await get()).status, 401); assert.equal(readCount, 0);
  viewer = { ...active, role: "admin", twoFactorEnabled: true };
  found = true;
  const response = await get();
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.match(response.headers.get("content-disposition"), /attachment; filename="payment-proof.png"/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
});

test("manual payment validates invoice ownership before processing or uploading a proof", async () => {
  let uploaded = 0;
  const action = await load("app/actions/crypto-billing.ts", {
    "next/cache": { revalidatePath() {} }, "next/navigation": { redirect },
    "@/lib/membership": { requireViewer: async () => active },
    "@/lib/payment-proofs": { storePaymentProof: async () => { uploaded++; } },
    "@/lib/crypto-payments": { requireManualPaymentInvoice: async (owner, id) => { assert.equal(owner, OWNER); assert.equal(id, "other-invoice"); throw new Error("INVOICE_NOT_FOUND"); } }
  });
  const form = new FormData(); form.set("proof", new File([png], "receipt.png", { type: "image/png" }));
  await assert.rejects(action.submitManualPaymentAction("other-invoice", form), /error=invoice_not_found/);
  assert.equal(uploaded, 0);
});

test("manual payment rejects isolated FAILED records and cannot race a completed admin review", async () => {
  let status = "FAILED";
  const invoice = () => ({ id: "invoice", paymentMethod: "WECHAT", status, expiresAt: new Date(Date.now() + 60000) });
  const lib = await load("lib/crypto-payments.ts", {
    "@/lib/plans": {}, "@/lib/subscription-fulfillment": {},
    "@/lib/prisma": { prisma: {
      cryptoPayment: {
        findFirst: async ({ where }) => { assert.deepEqual(where, { id: "invoice", userId: OWNER }); return invoice(); },
        updateMany: async ({ where }) => { assert.equal(where.userId, OWNER); assert.deepEqual(where.status, { in: ["PENDING", "REVIEW"] }); assert.ok(where.expiresAt.gt instanceof Date); return { count: 0 }; }
      }, systemSetting: { findUnique: async () => null }
    } }
  });
  await assert.rejects(lib.requireManualPaymentInvoice(OWNER, "invoice"), /PAYMENT_NOT_PENDING/);
  status = "REVIEW";
  await assert.rejects(lib.submitManualPayment(OWNER, "invoice", { paymentReference: "valid-owner-reference" }), /PAYMENT_ALREADY_PROCESSED/);
});
