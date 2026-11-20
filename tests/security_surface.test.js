const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, Response, Request, URL, Headers, AbortSignal, Buffer, console,
    ...globals,
    require(name) {
      if (name === "server-only") return {};
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unmocked dependency: ${name}`);
    }
  });
  return module.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const validViewer = { id: "owner-1", status: "ACTIVE", role: "admin", roles: ["admin"], plan: "max", needsSecondFactor: false, twoFactorEnabled: true, twoFactorPassed: true };
const toolboxTypes = load("lib/toolbox-types.ts");
const category = { id: "category-1", name: "Public", isPublic: true, description: "", color: "#aaaaaa", sortOrder: 1, isCollapsed: false };
const columns = [
  { key: "name", isVisible: true, isPublic: true, isSensitive: false },
  { key: "officialUrl", isVisible: true, isPublic: true, isSensitive: false },
  { key: "loginAccount", isVisible: true, isPublic: true, isSensitive: false }, // Even a misconfigured credential column stays private.
  { key: "privateNotes", isVisible: true, isPublic: false, isSensitive: false },
  { key: "apiSecret", isVisible: true, isPublic: true, isSensitive: true },
  { key: "hiddenData", isVisible: false, isPublic: true, isSensitive: false }
].map((entry, index) => ({ ...entry, id: `column-${index}`, type: "text", width: 120, sortOrder: index, isSystem: !index, isEditable: true, isRequired: false, options: [] }));
const item = { id: "item-1", categoryId: category.id, name: "Public Tool", description: "hidden description", officialUrl: "https://example.com", loginAccount: "CREDENTIAL_SENTINEL", isPublished: true, isPublic: true, rating: 5, financing: "HIDDEN_FINANCING", tutorial: "HIDDEN_TUTORIAL", rowColor: "none", sortOrder: 1, updatedAt: new Date(0), favorites: [], cells: [
  { column: { key: "privateNotes" }, value: "PRIVATE_NOTE_SENTINEL" },
  { column: { key: "apiSecret" }, value: "SECRET_SENTINEL" },
  { column: { key: "hiddenData" }, value: "HIDDEN_SENTINEL" }
] };
function matchesColumn(column, where) {
  return (!where.isVisible || column.isVisible) && (!where.isPublic || column.isPublic)
    && (where.isSensitive === undefined || column.isSensitive === where.isSensitive)
    && (!where.key?.not || column.key !== where.key.not);
}
function toolbox(db = true) {
  const queries = [];
  const module = load("lib/toolbox.ts", {
    "@/lib/prisma": { isDatabaseConfigured: () => db, prisma: {
      toolboxCategory: { findMany: async () => [category] },
      toolboxColumn: { findMany: async (query) => columns.filter(column => matchesColumn(column, query.where)) },
      toolboxItem: { findMany: async (query) => { queries.push(query); return [item]; } },
      systemSetting: { findUnique: async () => null },
      auditLog: { findMany: async () => [] }
    } },
    "@/lib/toolbox-types": toolboxTypes,
    "@/data/toolbox-enriched-data.json": { source: { enrichedAt: new Date(0).toISOString() }, categories: [category], items: [item, { ...item, id: "private-item", isPublic: false }] }
  });
  return { ...module, queries };
}

test("toolbox management fails closed for inactive, incomplete MFA, or a plain role claim", () => {
  const { toolboxRole } = toolbox();
  assert.equal(toolboxRole(validViewer), "admin");
  assert.equal(toolboxRole({ ...validViewer, role: "free", roles: ["operator"] }), "operator");
  for (const change of [{ status: "SUSPENDED" }, { status: "DELETED" }, { needsSecondFactor: true }, { twoFactorEnabled: false }, { twoFactorPassed: false }]) {
    assert.equal(toolboxRole({ ...validViewer, ...change }), "viewer");
  }
  assert.equal(toolboxRole({ ...validViewer, role: "free", roles: ["free"] }), "viewer");
  assert.equal(toolboxRole(null), "viewer");
});

test("toolbox public JSON omits hidden/private dynamic cells and duplicate credential fields", async () => {
  const api = toolbox();
  for (const viewer of [null, { ...validViewer, role: "free", roles: ["free"] }, { ...validViewer, twoFactorPassed: false }]) {
    const snapshot = await api.getToolboxSnapshot(viewer);
    const json = JSON.stringify(snapshot);
    for (const sentinel of ["CREDENTIAL_SENTINEL", "PRIVATE_NOTE_SENTINEL", "SECRET_SENTINEL", "HIDDEN_SENTINEL", "HIDDEN_FINANCING", "HIDDEN_TUTORIAL"]) assert.ok(!json.includes(sentinel), sentinel);
    assert.deepEqual(Object.keys(snapshot.items[0].values).sort(), ["name", "officialUrl"]);
    assert.equal(snapshot.items[0].loginAccount, "");
    assert.deepEqual(plain(api.queries.at(-1).where), { isPublic: true, isPublished: true, category: { isPublic: true } });
    assert.equal(api.queries.at(-1).include.cells.where.column.isSensitive, false);
  }
});

test("verified operators retain operational access but not credential/sensitive columns", async () => {
  const api = toolbox();
  const snapshot = await api.getToolboxSnapshot({ ...validViewer, role: "operator", roles: ["operator"] });
  assert.equal(snapshot.role, "operator");
  assert.equal(api.queries.at(-1).where, undefined);
  assert.equal(snapshot.items[0].values.privateNotes, "PRIVATE_NOTE_SENTINEL");
  assert.ok(!JSON.stringify(snapshot).includes("CREDENTIAL_SENTINEL"));
  assert.ok(!JSON.stringify(snapshot).includes("SECRET_SENTINEL"));
  const admin = await api.getToolboxSnapshot(validViewer);
  assert.equal(admin.items[0].loginAccount, "CREDENTIAL_SENTINEL");
  assert.equal(admin.items[0].values.apiSecret, "SECRET_SENTINEL");
  assert.ok(!JSON.stringify(admin).includes("HIDDEN_SENTINEL"));
});

test("toolbox no-database previews obey the same row and field boundary", async () => {
  const api = toolbox(false);
  const snapshot = await api.getToolboxSnapshot({ ...validViewer, role: "free", roles: ["free"] });
  assert.deepEqual(snapshot.items.map(row => row.id), ["item-1"]);
  assert.equal(snapshot.items[0].loginAccount, "");
  assert.ok(!JSON.stringify(snapshot).includes("CREDENTIAL_SENTINEL"));
});

const CSP = load("lib/external-embed-security.ts");
const proxies = [
  "app/top-trader-radar/embed/[[...path]]/route.ts",
  "app/arbitrage/[[...path]]/route.ts",
  "app/contract-trading-assistant/embed/[[...path]]/route.ts",
  "app/contract-trading-assistant/api/[[...path]]/route.ts"
];
for (const file of proxies) test(`direct navigation to remote proxy remains sandboxed: ${file}`, async () => {
  let calls = 0;
  const api = load(file, { "@/lib/external-embed-security": CSP }, { fetch: async () => {
    calls++;
    return new Response("<html><head></head><body><script>window.pwned = true</script></body></html>", { headers: { "Content-Type": "text/html" } });
  } });
  const request = new Request("https://site.example/direct");
  request.nextUrl = new URL(request.url);
  request.cookies = { get: () => undefined };
  const response = await api.GET(request, { params: Promise.resolve({ path: ["index.html"] }) });
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  const policy = response.headers.get("content-security-policy");
  const sandbox = policy.split(";").find(directive => directive.trim().startsWith("sandbox"));
  assert.ok(sandbox.includes("allow-scripts"));
  assert.ok(!sandbox.includes("allow-same-origin"));
  assert.match(policy, /frame-ancestors 'self'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(await response.text(), /window.pwned/); // Active content is isolated by response policy, not brittle string stripping.
});

function mutation(viewer, { operatorCanCreate = false, visibleItem = null } = {}) {
  const writes = [];
  const api = toolbox();
  const route = load("app/api/toolbox/route.ts", {
    "@prisma/client": { Prisma: { JsonNull: null } },
    zod: require("zod"),
    "@/lib/audit": { writeAudit: async () => {} },
    "@/lib/membership": { getViewer: async () => viewer },
    "@/lib/prisma": { isDatabaseConfigured: () => true, prisma: {
      systemSetting: { findUnique: async () => ({ value: { operatorCanCreate, operatorCanDelete: false, operatorCanBulk: false, showActions: true } }) },
      toolboxItem: { findFirst: async () => visibleItem, create: async () => { writes.push("create"); } },
      toolboxFavorite: { create: async () => { writes.push("favorite"); }, findUnique: async () => null }
    } },
    "@/lib/request-security": { assertSameOrigin: () => {} },
    "@/lib/toolbox": { ...api, getToolboxSnapshot: async () => ({ role: api.toolboxRole(viewer) }) },
    "@/lib/toolbox-types": toolboxTypes
  });
  const post = body => route.POST(new Request("https://site.example/api/toolbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { post, writes };
}

test("toolbox mutations reject incomplete MFA and operator actions not granted in server settings", async () => {
  for (const viewer of [null, { ...validViewer, status: "SUSPENDED" }, { ...validViewer, twoFactorPassed: false }, { ...validViewer, twoFactorEnabled: false }]) {
    const route = mutation(viewer);
    const response = await route.post({ action: "createItem" });
    assert.ok([401, 403].includes(response.status));
    assert.equal(route.writes.length, 0);
  }
  const operator = mutation({ ...validViewer, role: "operator", roles: ["operator"] });
  assert.equal((await operator.post({ action: "createItem" })).status, 403);
  assert.equal((await operator.post({ action: "createColumn" })).status, 403);
  assert.equal(operator.writes.length, 0);
});

test("a favorite cannot reference a private item by guessing its identifier", async () => {
  const viewer = { ...validViewer, role: "free", roles: ["free"], twoFactorEnabled: false, twoFactorPassed: false };
  const denied = mutation(viewer);
  assert.equal((await denied.post({ action: "toggleFavorite", itemId: "private-item" })).status, 404);
  assert.equal(denied.writes.length, 0);
  const allowed = mutation(viewer, { visibleItem: { id: "public-item" } });
  assert.equal((await allowed.post({ action: "toggleFavorite", itemId: "public-item" })).status, 200);
  assert.deepEqual(allowed.writes, ["favorite"]);
});
