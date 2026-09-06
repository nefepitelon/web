const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "bstock-alpha.html"), "utf8");
const css = fs.readFileSync(path.join(root, "bstock-alpha-ui.css"), "utf8");
const script = fs.readFileSync(path.join(root, "bstock-alpha.js"), "utf8");
const shellCss = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");
const header = fs.readFileSync(path.join(root, "components", "platform-header.tsx"), "utf8");

test("bStockAlpha loads its isolated visual system through the legacy allowlist", () => {
  assert.match(html, /bstock-alpha-ui\.css\?v=20260904-ui-system-v1/);
  assert.match(html, /class="theme-toggle"[^>]+data-current="dark"[\s\S]*?class="preference-label">深色/);
  assert.match(html, /class="lang-toggle"[^>]+data-current="zh"[\s\S]*?class="preference-label">中文/);

  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", `
    const assert = require('node:assert/strict');
    const { serveLegacy } = require('./lib/legacy-route.ts');
    (async () => {
      const page = await serveLegacy(new Request('http://localhost/legacy/bstock-alpha?embedded=1'), ['bstock-alpha']);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /data-legacy-source="bstock-alpha-ui.css"/);
      const asset = await serveLegacy(new Request('http://localhost/legacy/bstock-alpha-ui.css'), ['bstock-alpha-ui.css']);
      assert.equal(asset.status, 200);
      assert.match(await asset.text(), /bStockAlpha visual system/);
      assert.equal((await serveLegacy(new Request('http://localhost/legacy/not-public.css'), ['not-public.css'])).status, 404);
    })().catch(e => { console.error(e); process.exitCode = 1; });
  `], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("visual hierarchy covers the core workspace, dialogs, light mode and responsive layouts", () => {
  for (const selector of [
    ".command-bar", ".market-strip", ".metric-card", ".trading-grid", ".panel",
    ".token-row", ".ai-card", ".review-button", ".cycle-panel", ".portfolio-panel", "dialog"
  ]) assert.ok(css.includes(selector), `missing ${selector}`);
  assert.match(css, /body\[data-theme="light"\]/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /font-size:\s*14px/);
  assert.match(css, /--ui-shadow:/);
});

test("theme and language controls render current state and survive restricted storage", () => {
  assert.match(script, /function renderPreferenceControls\(theme, language\)/);
  assert.match(script, /function readDisplayPreference\(key, fallback\)/);
  assert.match(script, /function persistDisplayPreference\(key, value\)/);
  assert.doesNotMatch(script, /querySelector\("\.theme-toggle"\)\.textContent/);
  assert.doesNotMatch(script, /querySelector\("\.lang-toggle"\)\.textContent/);
  assert.match(header, /platform-shell-header--bstock/);
  assert.match(header, /data-preference=\{bstockContext \? "theme"/);
  assert.match(header, /data-preference=\{bstockContext \? "language"/);
  assert.match(header, /currentThemeLabel/);
  assert.match(shellCss, /\.platform-shell-header--bstock \.platform-tool--preference/);
  assert.match(shellCss, /html\[data-theme="light"\] \.bstock-report-share-page/);
});
