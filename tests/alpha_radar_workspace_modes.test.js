const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "alpha-radar.html"), "utf8");
const script = fs.readFileSync(path.join(root, "alpha-scanner.js"), "utf8");
const css = fs.readFileSync(path.join(root, "alpha-scanner.css"), "utf8");
const globalCss = fs.readFileSync(path.join(root, "app", "globals.css"), "utf8");

test("desktop navigation typography is enlarged for 1920-class screens", () => {
  assert.match(globalCss, /@media \(min-width: 1680px\)[\s\S]*?\.platform-main-nav > a,[\s\S]*?font-size: 16px/);
});

test("Alpha Radar navigation is language-exclusive and supports grid or tab layouts", () => {
  assert.match(html, /id="layout-mode-toggle"/);
  assert.match(html, /data-radar-zh="妖币雷达" data-radar-en="Meme Coin Radar"/);
  assert.match(html, /data-language-only="en">Multi-Dimensional Scanner/);
  assert.match(script, /alpha-radar-layout-mode/);
  assert.match(script, /data-tab-active/);
  assert.match(css, /data-workspace-layout="tabs"/);
  assert.match(script, /querySelectorAll\("\[data-language-only\]"\)/);
});

test("data sources are moved from the sidebar into a bottom scrolling tape", () => {
  const sidebar = html.slice(html.indexOf('<aside class="sidebar"'), html.indexOf('<div class="workspace">'));
  assert.doesNotMatch(sidebar, /class="source-stack"/);
  assert.match(html, /<footer class="source-tape"/);
  assert.match(html, /id="source-tape-track"/);
  assert.match(script, /function prepareSourceTape\(\)/);
  assert.match(css, /animation: sourceTapeLeft/);
});

test("crypto box breakout is integrated between the risk pool and execution control", () => {
  const pool = html.indexOf('id="risk-pool"');
  const box = html.indexOf('id="box-breakout"');
  const execution = html.indexOf('id="execution-control"');
  assert.ok(pool >= 0 && pool < box && box < execution);
  assert.match(html, /data-box-scan="crypto-radar"/);
  assert.match(html, /data-box-scan="crypto-mainstream"/);
  assert.match(html, /data-box-scan="crypto"/);
  assert.match(script, /fetch\("\/api\/box-breakout"/);
  assert.match(script, /\/api\/box-breakout\/quotes\?market=crypto/);
  assert.match(script, /\/api\/box-breakout\/chart\?market=crypto/);
});

test("Surf Pulse follows the selected Alpha Radar language", () => {
  assert.match(script, /\/api\/surf-pulse\?limit=90&lang=\$\{platformLang\}/);
  assert.match(script, /event\.data\?\.type === "welinkbtc:preferences"/);
  assert.match(script, /platformLanguage\.addEventListener\("click",[\s\S]*?surfPulseItems = \[\];[\s\S]*?hydrateSurfPulse\(\{ announce: true \}\)/);
  assert.doesNotMatch(script, /fetchSurfPulse\(/);
  assert.match(script, /radarText\("三路实时 · 已去重", "Three sources live · deduplicated"\)/);
});
