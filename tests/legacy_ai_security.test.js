import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
async function load(path, mocks) {
  const code = ts.transpileModule(await read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), module, module.exports);
  return module.exports;
}
const origin = "https://app.example.test";
const viewer = (overrides = {}) => ({ id: "user-1", role: "free", plan: "free", status: "ACTIVE", twoFactorEnabled: false, twoFactorPassed: true, needsSecondFactor: false, ...overrides });
const request = (route, body = {}, headers = {}) => new Request(`${origin}/api/${route}`, { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
async function harness(identity = null, { database = true, allowed = true, quota = 3 } = {}) {
  const state = { identityChecks: 0, handlerCalls: 0, rateChecks: 0, monthly: 0, audits: [], gates: [] };
  const security = await load("lib/legacy-ai-security.ts", {
    "@/lib/content-gates": { configuredAccess: async (_viewer, entitlement) => { state.gates.push(entitlement); return { allowed }; } },
    "@/lib/entitlements": { quotaFor: () => ({ aiResearchMonthly: quota }) },
    "@/lib/membership": { getViewer: async () => { state.identityChecks++; return identity; } },
    "@/lib/prisma": { isDatabaseConfigured: () => database, prisma: { rateLimitBucket: { upsert: async () => ({ count: ++state.monthly }) } } },
    "@/lib/rate-limit": { checkRateLimit: async () => { state.rateChecks++; return { allowed: true }; } },
    "@/lib/request-security": {
      assertSameOrigin: (request) => { if (request.headers.get("origin") !== origin) throw new Error("cross origin"); },
      requestContext: async () => ({ ipAddress: "203.0.113.1" })
    },
    "@/lib/audit": { writeAudit: async (input) => { state.audits.push(input); } }
  });
  const mocks = { "@/lib/legacy-ai-security": security,
    "@/lib/supabase/response": { applyAuthResponseHeaders: (response) => { response.headers.set("Cache-Control", "private, no-store"); return response; } } };
  for (const name of security.protectedLegacyAiRoutes) {
    mocks[`@/lib/legacy-handlers/${name}.js`] = (_request, response) => { state.handlerCalls++; response.status(200).json({ ok: true, name }); };
  }
  return { state, security, route: await load("app/api/[legacy]/route.ts", mocks) };
}
const context = (legacy) => ({ params: Promise.resolve({ legacy }) });

test("anonymous AI requests and forged identity headers never load a paid handler", async () => {
  const { route, state } = await harness();
  for (const endpoint of ["ai-ops-generate", "ai-ops-image", "surf-research", "asset-daily-report", "ai-ops-publish"]) {
    const result = await route.POST(request(endpoint, {}, { "x-user-id": "admin", "x-user-role": "admin", "x-admin": "true" }), context(endpoint));
    assert.equal(result.status, 401); assert.match(result.headers.get("cache-control"), /no-store/);
  }
  assert.equal(state.handlerCalls, 0); assert.equal(state.rateChecks, 0);
});

test("public report GET remains available without reading private identity or AI budget", async () => {
  const { route, state } = await harness();
  const response = await route.GET(new Request(`${origin}/api/asset-daily-report?asset=BTC`), context("asset-daily-report"));
  assert.equal(response.status, 200); assert.equal(state.identityChecks, 0); assert.equal(state.monthly, 0); assert.equal(state.handlerCalls, 1);
});

test("suspended accounts, pending MFA and missing configured entitlement are denied", async () => {
  for (const identity of [viewer({ status: "SUSPENDED" }), viewer({ needsSecondFactor: true, twoFactorPassed: false }), viewer({ role: "admin", plan: "max", twoFactorEnabled: false })]) {
    const { route, state } = await harness(identity);
    const response = await route.POST(request("surf-research"), context("surf-research"));
    assert.equal(response.status, 403); assert.equal(state.handlerCalls, 0);
  }
  const { route, state } = await harness(viewer(), { allowed: false });
  assert.equal((await route.POST(request("ai-ops-generate"), context("ai-ops-generate"))).status, 403);
  assert.deepEqual(state.gates, ["ai.standard"]); assert.equal(state.handlerCalls, 0);
});

test("publishing requires actual admin membership plus enabled, passed MFA", async () => {
  const denied = await harness(viewer({ role: "max", plan: "max", twoFactorEnabled: true }));
  assert.equal((await denied.route.POST(request("ai-ops-publish", { confirmed: true }), context("ai-ops-publish"))).status, 403);
  const accepted = await harness(viewer({ role: "admin", plan: "max", twoFactorEnabled: true }));
  assert.equal((await accepted.route.POST(request("ai-ops-publish", { confirmed: true }), context("ai-ops-publish"))).status, 200);
  assert.equal(accepted.state.handlerCalls, 1); assert.equal(accepted.state.audits[0].action, "ai.publish.requested");
});

test("authenticated AI starts are same-origin, bounded JSON and fail closed on missing database", async () => {
  const base = await harness(viewer({ plan: "pro" }));
  assert.equal((await base.route.POST(request("surf-research", {}, { origin: "https://evil.example.test" }), context("surf-research"))).status, 403);
  assert.equal((await base.route.POST(request("surf-research", {}, { "content-type": "text/plain" }), context("surf-research"))).status, 415);
  assert.equal((await base.route.POST(request("surf-research", { text: "x".repeat(70_000) }), context("surf-research"))).status, 413);
  assert.equal(base.state.handlerCalls, 0);
  const unavailable = await harness(viewer({ plan: "pro" }), { database: false });
  assert.equal((await unavailable.route.POST(request("surf-research"), context("surf-research"))).status, 503);
  assert.equal(unavailable.state.handlerCalls, 0);
});

test("independent paid endpoint switches share one persistent monthly allowance", async () => {
  const { route, state } = await harness(viewer(), { quota: 3 });
  for (const endpoint of ["asset-daily-report", "surf-research", "ai-ops-adapt"]) {
    assert.equal((await route.POST(request(endpoint), context(endpoint))).status, 200);
  }
  assert.equal((await route.POST(request("ai-ops-image"), context("ai-ops-image"))).status, 429);
  assert.equal(state.handlerCalls, 3); assert.equal(state.monthly, 4);
  assert.deepEqual(state.gates, ["ai.low", "ai.standard", "ai.standard", "ai.standard"]);
});

test("monthly usage bucket has a stable calendar-month start, including month boundaries", async () => {
  const { security } = await harness();
  assert.equal(security.monthlyAiBucket("user", new Date("2026-11-30T23:59:59Z")).windowStart.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(security.monthlyAiBucket("user", new Date("2026-12-01T00:00:00Z")).windowStart.toISOString(), "2026-12-01T00:00:00.000Z");
});

test("paid handlers have no independently deployed native route outside Next authorization", async () => {
  const { security } = await harness();
  const config = JSON.parse(await read("vercel.json"));
  const route = await read("app/api/[legacy]/route.ts");
  for (const name of security.protectedLegacyAiRoutes) {
    await assert.rejects(() => access(new URL(`../api/${name}.js`, import.meta.url)));
    await access(new URL(`../lib/legacy-handlers/${name}.js`, import.meta.url));
    assert.equal(config.functions[`api/${name}.js`], undefined);
    assert.ok(route.includes(`import("@/lib/legacy-handlers/${name}.js")`));
  }
});

test("provider continuation IDs require an untampered, unexpired proof for the current user", async () => {
  const { security } = await harness();
  const previous = process.env.TWO_FACTOR_SIGNING_KEY;
  process.env.TWO_FACTOR_SIGNING_KEY = "unit-test-research-proof-key-not-production-123456";
  const actualNow = Date.now;
  try {
    const result = security.researchConversationResponse({ ok: true, surfResponseId: "surf-response-1" }, {}, "user-1");
    const body = { query: "BTC", surfPreviousResponseId: "surf-response-1", conversationProof: result.conversationProof };
    assert.equal(security.prepareResearchConversation(body, "user-1").surfPreviousResponseId, "surf-response-1");
    assert.throws(() => security.prepareResearchConversation(body, "user-2"));
    assert.throws(() => security.prepareResearchConversation({ ...body, surfPreviousResponseId: "another-response" }, "user-1"));
    assert.throws(() => security.prepareResearchConversation({ ...body, conversationProof: `${body.conversationProof}x` }, "user-1"));
    assert.throws(() => security.prepareResearchConversation({ previousResponseId: "unscoped-response" }, "user-1"));
    assert.throws(() => security.prepareResearchConversation({ surfPreviousResponseId: "surf-response-1" }, "user-1"));
    Date.now = () => actualNow() + 3 * 60 * 60_000;
    assert.throws(() => security.prepareResearchConversation(body, "user-1"));
  } finally {
    Date.now = actualNow;
    if (previous === undefined) delete process.env.TWO_FACTOR_SIGNING_KEY; else process.env.TWO_FACTOR_SIGNING_KEY = previous;
  }
});

test("provider failure bodies cannot leak server API credentials through research fallbacks", async () => {
  const handler = require("../lib/legacy-handlers/surf-research.js");
  const originalFetch = global.fetch, previousSurf = process.env.SURF_API_KEY, previousOpenAi = process.env.OPENAI_API_KEY;
  process.env.SURF_API_KEY = "server-test-surf-secret";
  process.env.OPENAI_API_KEY = "server-test-openai-secret";
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Invalid key server-test-surf-secret server-test-openai-secret" } }) });
  const result = { statusCode: 200, payload: null, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
  try {
    await handler({ method: "POST", body: { query: "BTC current market" } }, result);
    assert.equal(result.statusCode, 502);
    assert.doesNotMatch(JSON.stringify(result.payload), /server-test-(?:surf|openai)-secret/);
    assert.match(result.payload.error, /HTTP 401/);
  } finally {
    global.fetch = originalFetch;
    if (previousSurf === undefined) delete process.env.SURF_API_KEY; else process.env.SURF_API_KEY = previousSurf;
    if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousOpenAi;
  }
});
