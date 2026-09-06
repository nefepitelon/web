const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const header = fs.readFileSync(path.join(root, "components/platform-header.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

test("AI Tide Alpha is an external shop in the first-level Products menu", () => {
  const products = header.match(/const productLinks:[\s\S]*?const collaborationLinks:/)?.[0] ?? "";
  const resources = header.match(/const resourceLinks:[\s\S]*?function MoreMenuLink/)?.[0] ?? "";
  const shop = products.match(/\{\s*href: "https:\/\/welinkbtc\.me\/",[\s\S]*?\}/)?.[0] ?? "";
  assert.match(shop, /zh: "AI潮汐Alpha"/);
  assert.match(shop, /en: "AI Tide Alpha"/);
  assert.match(shop, /icon: Store/);
  assert.match(shop, /external: true/);
  assert.doesNotMatch(resources, /welinkbtc\.me|AI潮汐Alpha/);
  assert.equal((products.match(/https:\/\/welinkbtc\.me\//g) ?? []).length, 1);
  assert.equal((header.match(/https:\/\/welinkbtc\.me\//g) ?? []).length, 1);
});

test("the shared menu link renderer keeps external products safe", () => {
  assert.equal((header.match(/productLinks\.map\(/g) ?? []).length, 1);
  assert.match(header, /return item\.external \?\s*\(\s*<a href=\{item\.href\} target="_blank" rel="noopener noreferrer">/);
  assert.match(header, /item\.external \? <ExternalLink/);
});

test("expanded navigation menus remain scrollable within short viewports", () => {
  const rule = styles.match(/\.platform-more-menu\s*\{([^}]+)\}/)?.[1] ?? "";
  assert.match(rule, /max-height:\s*calc\(100dvh - var\(--platform-shell-height\) - 24px\)/);
  assert.match(rule, /overflow-y:\s*auto/);
  assert.match(rule, /overscroll-behavior:\s*contain/);
});
