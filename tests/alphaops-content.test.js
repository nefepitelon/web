const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const alphaOpsHandler = require(path.join(root, "lib", "alphaops-project-state.js"));

test("members cannot remove, restore or inject projects while contributing comments", () => {
  const stored = { main: [{ name: "Visible" }], pending: [{ name: "Review" }], removedItems: [{ name: "Removed" }], removedProjects: ["Hidden"], hiddenPending: ["old"] };
  const incoming = { main: [{ name: "Injected" }], pending: [], removedItems: [], removedProjects: ["Visible"], hiddenPending: [], comments: [{ id: "new-comment", project: "Visible", text: "Useful comment" }] };
  const merged = alphaOpsHandler.mergeForAccess(incoming, stored, false);
  for (const field of ["main", "pending", "removedItems", "removedProjects", "hiddenPending"]) assert.deepEqual(merged[field], stored[field], field);
  assert.equal(merged.comments[0].text, "Useful comment");
  const publicState = alphaOpsHandler.stateForAccess(merged, false);
  assert.deepEqual(publicState.pending, []);
  assert.deepEqual(publicState.removedItems, []);
  assert.deepEqual(publicState.main, stored.main);
  assert.equal(alphaOpsHandler.stateForAccess(merged, true), merged);
  assert.ok(alphaOpsHandler.mergeForAccess(incoming, stored, true).removedProjects.includes("Visible"));
});

test("the state handler fails closed for unauthenticated writes", async () => {
  const response = { statusCode: 200, setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await alphaOpsHandler({ method: "PUT", body: { removedProjects: ["Visible"] } }, response);
  assert.equal(response.statusCode, 403);
});

test("the API derives project capabilities from the verified viewer, not request claims", async () => {
  const source = fs.readFileSync(path.join(root, "app/api/alphaops-projects/route.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  for (const [role, status, needsSecondFactor, expectedAdmin] of [
    ["admin", "ACTIVE", false, true], ["member", "ACTIVE", false, false],
    ["operator", "ACTIVE", false, false], ["admin", "SUSPENDED", false, false],
    ["admin", "ACTIVE", true, false], [null, null, false, false]
  ]) {
    const module = { exports: {} };
    let called = false;
    const viewer = role ? { role, status, needsSecondFactor } : null;
    const imports = name => name.includes("membership") ? { getViewer: async () => viewer }
      : name.includes("request-security") ? { assertSameOrigin: () => {} }
      : async (request, response) => { called = true; response.end(JSON.stringify(request.access)); };
    new Function("require", "module", "exports", compiled)(imports, module, module.exports);
    const response = await module.exports.GET(new Request("https://example.test/api/alphaops-projects?role=admin", { headers: { "x-role": "admin" } }));
    assert.equal((await response.json()).canManageProjects, expectedAdmin, `${role}/${status}/${needsSecondFactor}`);
    assert.match(response.headers.get("cache-control"), /private, no-store/);
    called = false;
    const write = await module.exports.PUT(new Request("https://example.test/api/alphaops-projects", { method: "PUT", body: "{}" }));
    const canWrite = Boolean(viewer && status === "ACTIVE" && !needsSecondFactor);
    assert.equal(called, canWrite);
    assert.equal(write.status, canWrite ? 200 : viewer ? 403 : 401);
  }
});

test("AlphaOps content state merges tutorials and comments without overwriting other devices", () => {
  const stored = {
    tutorials: [{ id: "tutorial-1", project: "Axiom", title: "基础教程", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }],
    comments: []
  };
  const incoming = {
    tutorials: [],
    comments: [{ id: "comment-1", project: "Axiom", text: "继续观察", createdAt: "2026-08-02T00:00:00.000Z", updatedAt: "2026-08-02T00:00:00.000Z" }]
  };
  const merged = alphaOpsHandler.mergeStates(incoming, stored);
  assert.equal(merged.tutorials.length, 1);
  assert.equal(merged.comments.length, 1);
  assert.equal(merged.tutorials[0].title, "基础教程");
});

test("AlphaOps content tombstones prevent deleted records from returning", () => {
  const merged = alphaOpsHandler.mergeStates(
    { tutorials: [], comments: [], contentTombstones: ["tutorial-1"] },
    { tutorials: [{ id: "tutorial-1", project: "Axiom", title: "旧教程" }], comments: [] }
  );
  assert.deepEqual(merged.tutorials, []);
  assert.deepEqual(merged.contentTombstones, ["tutorial-1"]);
});

test("AlphaOps content merge keeps the newest edit for the same record", () => {
  const merged = alphaOpsHandler.mergeStates(
    { comments: [{ id: "comment-1", project: "Theo", text: "新观点", updatedAt: "2026-08-05T00:00:00.000Z" }] },
    { comments: [{ id: "comment-1", project: "Theo", text: "旧观点", updatedAt: "2026-08-04T00:00:00.000Z" }] }
  );
  assert.equal(merged.comments[0].text, "新观点");
});

test("AlphaOps project cards expose tutorial and comment workflows with three feed modes", () => {
  const source = fs.readFileSync(path.join(root, "script.js"), "utf8");
  for (const marker of [
    "data-alpha-add-tutorial",
    "data-alpha-add-comment",
    'data-alpha-feed-mode="x"',
    'data-alpha-feed-mode="tutorials"',
    'data-alpha-feed-mode="comments"',
    "alpha-content-dialog",
    "ALPHA_TUTORIALS_STORAGE_KEY",
    "ALPHA_COMMENTS_STORAGE_KEY"
  ]) assert.match(source, new RegExp(marker));
});

test("AlphaOps medium-width layout prevents half-row gaps and compressed project cards", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const html = fs.readFileSync(path.join(root, "alphaops.html"), "utf8");
  for (const marker of [
    ".alphaops-grid > .leaderboard {",
    "grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));",
    ".alpha-library-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }",
    "@media (min-width: 981px) and (max-width: 1200px)",
    ".alpha-project-library { grid-template-columns: 1fr; }"
  ]) assert.ok(css.includes(marker), `missing responsive marker: ${marker}`);
  assert.match(html, /styles\.css\?v=20260826-alphaops-narrow-v2/);
});
