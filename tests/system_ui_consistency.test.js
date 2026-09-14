const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the shared platform header uses the same icon-only appearance and language controls everywhere", () => {
  const header = read("components/platform-header.tsx");
  const css = read("app/globals.css");

  assert.match(header, /data-preference="theme"/);
  assert.match(header, /data-preference="language"/);
  assert.match(header, /platform-preference-icon/);
  assert.doesNotMatch(header, /platform-preference-copy/);
  assert.doesNotMatch(header, /bstockContext/);
  assert.match(css, /\.platform-tool--preference \{[\s\S]*width: 42px/);
  assert.doesNotMatch(css, /@media \(max-width: 900px\) \{\s*\.platform-tools--desktop \{ display: none; \}/);
});

test("both floating tools are smaller, draggable while compact and can tuck into the right edge", () => {
  const garden = read("components/secret-garden-player.tsx");
  const gardenCss = read("components/secret-garden-player.module.css");
  const assistant = read("surf-assistant.js");
  const assistantCss = read("surf-assistant.css");

  assert.match(garden, /launcherDrag = event\.currentTarget\.classList\.contains\(styles\.launcher\)/);
  assert.match(garden, /welinkbtc-secret-garden-tucked:v1/);
  assert.match(gardenCss, /\.tucked \{ transform: translate\(calc\(100% - 10px\), -50%\)/);
  assert.match(gardenCss, /\.launcher \{[\s\S]*width: 78px;[\s\S]*min-height: 94px/);
  assert.match(assistant, /welinkbtc-surf-bot-tucked/);
  assert.match(assistant, /className = "surf-edge-toggle"/);
  assert.match(assistantCss, /\.surf-assistant\.is-tucked/);
  assert.match(assistantCss, /\.surf-bot-toggle \{[\s\S]*width: 60px;[\s\S]*min-height: 84px/);
});

test("Cycle Radar ends with derivatives and the desktop trend workspace spans the full dashboard", () => {
  const html = read("dashboard.html");
  const css = read("dashboard.css");

  assert.doesNotMatch(html, /class="source-ledger"/);
  assert.doesNotMatch(html, /data-i18n="radar\.sources"/);
  assert.match(css, /\.dashboard-main-column \{\s*display: contents;/);
  assert.match(css, /\.dashboard-main-column > \.derivatives-section \{ grid-column: 1; grid-row: 4; \}/);
  assert.match(css, /\.dashboard-main-column > \.chart-section \{ grid-column: 1 \/ -1; grid-row: 5; \}/);
  assert.match(css, /\.cycle-radar \{[\s\S]*grid-column: 2;[\s\S]*grid-row: 1 \/ 5;[\s\S]*align-self: stretch/);
  assert.match(read("lib/legacy-route.ts"), /\.cycle-radar \{ top: auto !important; \}/);
});
