const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const alphaOpsHandler = require(path.join(root, "api", "alphaops-projects.js"));

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
