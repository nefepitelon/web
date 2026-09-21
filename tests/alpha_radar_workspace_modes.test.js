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
  assert.match(html, /id="radar-skin-toggle"/);
  assert.match(html, /data-radar-zh="妖币雷达" data-radar-en="Meme Coin Radar"/);
  assert.match(html, /data-language-only="en">Multi-Dimensional Scanner/);
  assert.match(script, /alpha-radar-layout-mode/);
  assert.match(script, /alpha-radar-color-skin/);
  assert.match(script, /dataset\.radarSkin = radarSkinMode/);
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

test("sidebar account state is compact and merged into one status card", () => {
  const sidebar = html.slice(html.indexOf('<aside class="sidebar"'), html.indexOf('<div class="workspace">'));
  assert.match(sidebar, /class="safety-lock side-footer sidebar-status-card"/);
  assert.match(sidebar, /Paper 研究账户/);
  assert.equal((sidebar.match(/class="side-footer"/g) || []).length, 0);
  assert.match(css, /\.sidebar \{ overflow-y: hidden; \}/);
  assert.match(css, /\.side-nav a \{ min-height: 45px/);
});

test("sidebar controls are evenly aligned and navigation sequence numbers are removed", () => {
  const sidebar = html.slice(html.indexOf('<aside class="sidebar"'), html.indexOf('<div class="workspace">'));
  assert.match(sidebar, /class="sidebar-command-row"[\s\S]*?id="sidebar-toggle"[\s\S]*?id="layout-mode-toggle"[\s\S]*?id="radar-skin-toggle"/);
  assert.doesNotMatch(sidebar, /<em>0[1-8]<\/em>/);
  assert.match(css, /\.sidebar-command-row \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /--alpha-sidebar-width: 264px/);
});

test("Alpha radar removes redundant launch-gate messaging", () => {
  assert.doesNotMatch(html, /强制安全链路|查看上线门槛|id="roadmap-dialog"|id="show-roadmap"|id="expand-universe"/);
  assert.doesNotMatch(script, /show-roadmap|expand-universe|roadmap-dialog/);
});

test("crypto box breakout is integrated between the risk pool and execution control", () => {
  const pool = html.indexOf('id="risk-pool"');
  const box = html.indexOf('id="box-breakout"');
  const execution = html.indexOf('id="execution-control"');
  assert.ok(pool >= 0 && pool < box && box < execution);
  const boxMarkup = html.slice(box, execution);
  assert.doesNotMatch(boxMarkup, /alpha-box-open|打开完整看板|Open full dashboard/);
  assert.match(boxMarkup, /<header class="alpha-box-head">[\s\S]*?class="alpha-box-sources"/);
  assert.match(html, /data-box-scan="crypto-risk-pool"/);
  assert.match(html, /data-box-scan="crypto-radar"/);
  assert.match(html, /data-box-scan="crypto-mainstream"/);
  assert.match(html, /data-box-scan="crypto-alpha-market-cap"/);
  assert.match(html, /data-box-scan="crypto-alpha-open-interest"/);
  assert.match(html, /data-box-scan="crypto"/);
  assert.doesNotMatch(boxMarkup, /复用独立看板的实时加密扫描|Use the live crypto scanner/);
  assert.match(script, /fetch\("\/api\/box-breakout"/);
  assert.match(script, /\/api\/box-breakout\/quotes\?market=crypto/);
  assert.match(script, /\/api\/box-breakout\/chart\?market=crypto/);
  assert.match(script, /buildRiskPoolModel\(\)\.candidates/);
  assert.match(script, /command\.symbols = symbols/);
  assert.match(css, /\.alpha-box-results \{[^}]*grid-template-columns: repeat\(3/);
  assert.match(css, /\.alpha-box-chart \{[^}]*height: 156px/);
  assert.match(html, /id="alpha-box-chart-dialog"/);
  assert.match(script, /data-box-expand/);
  assert.match(script, /data-box-detail/);
  assert.match(script, /boxCandidateDetailToken/);
  assert.match(script, /openDrawer\(boxCandidateDetailToken\(candidate\)\)/);
  assert.match(script, /intentSource: "alpha-radar"/);
  assert.match(script, /showModal\(\)/);
  assert.match(script, /drawBoxChart\(boxExpandedChart,[\s\S]*?expanded: true/);
  assert.match(css, /\.alpha-box-conditions small \{[^}]*white-space: normal/);
});

test("bottom source tape includes Binance Skills Hub Alpha with a five-source health count", () => {
  assert.match(html, /id="source-health-count">0 \/ 5/);
  assert.match(html, /data-source-health="alpha"[\s\S]*?Binance Skills Hub Alpha/);
  assert.match(script, /updateSourceHealth\("alpha", payload\.stale \? "cached" : "live"/);
  assert.match(script, /configuredKeys\.size/);
});

test("risk pool dense captions have a readable scoped typography floor", () => {
  assert.match(css, /\.risk-pool-summary span \{ font-size: 12px/);
  assert.match(css, /\.risk-pool-summary em \{ font-size: 11px/);
  assert.match(css, /\.pool-source-tags i \{ font-size: 10\.5px/);
  assert.match(css, /\.risk-pool-legend \{ font-size: 10px/);
});

test("box breakout and the full workspace expose ink-green and navy dark skins", () => {
  assert.match(css, /body\[data-radar-skin="ink"\]:not\(\[data-theme="light"\]\)/);
  assert.match(css, /body\[data-radar-skin="navy"\]:not\(\[data-theme="light"\]\)/);
  assert.match(css, /--box-panel-gradient:/);
  assert.match(css, /@media \(min-width: 1441px\)/);
});

test("Surf Pulse follows the selected Alpha Radar language", () => {
  assert.match(script, /\/api\/surf-pulse\?limit=90&lang=\$\{platformLang\}/);
  assert.match(script, /event\.data\?\.type === "welinkbtc:preferences"/);
  assert.match(script, /platformLanguage\.addEventListener\("click",[\s\S]*?surfPulseItems = \[\];[\s\S]*?hydrateSurfPulse\(\{ announce: true \}\)/);
  assert.doesNotMatch(script, /fetchSurfPulse\(/);
  assert.match(script, /radarText\("三路实时 · 已去重", "Three sources live · deduplicated"\)/);
});
