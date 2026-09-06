const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the eighteenth SLRV cycle indicator", () => {
  assert.match(html, /id="slrv-panel"/);
  assert.match(html, /id="slrv-chart"/);
  assert.match(html, /data-chart-tabs="slrv"/);
  assert.match(html, /data-surf-model="slrv"/);
  assert.match(html, /id="slrv-snapshot"/);
  assert.match(html, /id="slrv-download"/);
  assert.match(html, /id="slrv-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("SLRV is placed after the seventeenth indicator and before halving", () => {
  const previous = html.indexOf('id="lth-rpl-panel"');
  const slrv = html.indexOf('id="slrv-panel"');
  const halving = html.indexOf('class="chart-panel halving-section"');
  assert.ok(previous >= 0 && slrv > previous && halving > slrv);
});

test("SLRV uses the public endpoint and complete chart controls", () => {
  assert.match(route, /"slrv-ratio": \(\) => import\("@\/api\/slrv-ratio\.js"\)/);
  assert.match(js, /\/api\/slrv-ratio/);
  assert.match(js, /loadSlrvMetrics/);
  assert.match(js, /drawSlrvChart/);
  assert.match(js, /saveSlrvSnapshot/);
  assert.match(js, /downloadSlrvCsv/);
  assert.match(js, /toggleSlrvFullscreen/);
  assert.match(js, /drawBrandWatermark\(context,/);
  assert.match(css, /\.slrv-stage/);
  assert.match(css, /\.slrv-zone-levels/);
});
