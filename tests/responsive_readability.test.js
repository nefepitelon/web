const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Alpha Radar reclaims its sidebar and raises dense labels on laptop widths", () => {
  const css = read("alpha-scanner.css");
  const html = read("alpha-radar.html");

  assert.match(css, /Narrow-screen readability: reclaim the fixed navigation rail/);
  assert.match(css, /@media \(min-width: 821px\) and \(max-width: 1440px\)/);
  assert.match(css, /\.sidebar\.open \{ transform: translateX\(0\); \}/);
  assert.match(css, /\.scanner-table td[\s\S]*font-size: 10px/);
  assert.match(html, /alpha-scanner\.css\?v=20260921-radar-v12/);
  assert.match(css, /@media \(min-width: 1441px\)[\s\S]*?body \{ font-size: 15px; \}/);
});

test("bStockAlpha switches to a two-column workspace before text becomes cramped", () => {
  const css = read("bstock-alpha.css");
  const html = read("bstock-alpha.html");

  assert.match(css, /@media \(max-width: 1480px\)/);
  assert.match(css, /\.trading-grid \{ grid-template-columns: minmax\(350px, 390px\) minmax\(0,1fr\); \}/);
  assert.match(css, /grid-template-areas:"execution-head execution-head"/);
  assert.match(css, /\.command-actions \{[^}]*margin-left: auto/);
  assert.match(css, /Desktop readability baseline: keep dense terminal data legible at every viewport size/);
  assert.match(css, /--muted: #9aa9ba/);
  assert.match(css, /font-size: clamp\(10px, \.58vw, 11px\)/);
  assert.match(css, /body\[data-theme="light"\] \.command-bar/);
  assert.match(css, /body\[data-theme="light"\] \.market-strip/);
  assert.match(css, /\.risk-checks li \{ min-height: 29px; \}/);
  assert.match(html, /bstock-alpha\.css\?v=20260826-ledger-reports-v3/);
});

test("shared dashboards and operations pages include narrow-screen readability rules", () => {
  const dashboardCss = read("dashboard.css");
  const aiOpsCss = read("ai-ops.css");
  const sharedCss = read("styles.css");
  const dashboardHtml = read("dashboard.html");
  const aiOpsHtml = read("ai-ops.html");

  assert.match(dashboardCss, /Narrow-screen readability: strengthen dense dashboard captions/);
  assert.match(dashboardCss, /@media \(max-width: 1440px\) \{[\s\S]*\.nav-links,[\s\S]*\.header-tools/);
  assert.match(aiOpsCss, /Narrow-screen readability for the operations console/);
  assert.match(sharedCss, /Narrow-screen readability for shared marketing and AlphaOps pages/);
  assert.match(dashboardHtml, /dashboard\.css\?v=20260917-mvrv-zscore-watermark-v2/);
  assert.match(aiOpsHtml, /ai-ops\.css\?v=20260824-readable-v1/);
});
