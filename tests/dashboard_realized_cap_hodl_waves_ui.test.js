const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the nineteenth realized-cap HODL Waves indicator", () => {
  assert.match(html, /id="realized-cap-hodl-panel"/);
  assert.match(html, /id="realized-cap-hodl-chart"/);
  assert.match(html, /data-chart-tabs="realized-cap-hodl"/);
  assert.match(html, /data-surf-model="realized-cap-hodl"/);
  assert.match(html, /id="realized-cap-hodl-snapshot"/);
  assert.match(html, /id="realized-cap-hodl-download"/);
  assert.match(html, /id="realized-cap-hodl-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("realized-cap HODL Waves appears after SLRV and before halving", () => {
  const previous = html.indexOf('id="slrv-panel"');
  const waves = html.indexOf('id="realized-cap-hodl-panel"');
  const lthSpent = html.indexOf('id="lth-spent-panel"');
  const halving = html.indexOf('class="chart-panel halving-section"');
  assert.ok(previous >= 0 && waves > previous && lthSpent > waves && halving > lthSpent);
});

test("realized-cap HODL Waves uses the public endpoint and complete controls", () => {
  assert.match(route, /"realized-cap-hodl-waves": \(\) => import\("@\/api\/realized-cap-hodl-waves\.js"\)/);
  assert.match(js, /\/api\/realized-cap-hodl-waves/);
  assert.match(js, /loadRealizedCapHodlMetrics/);
  assert.match(js, /drawRealizedCapHodlChart/);
  assert.match(js, /saveRealizedCapHodlSnapshot/);
  assert.match(js, /downloadRealizedCapHodlCsv/);
  assert.match(js, /toggleRealizedCapHodlFullscreen/);
  assert.match(css, /\.realized-cap-hodl-stage/);
  assert.match(css, /\.realized-cap-hodl-legend/);
});
