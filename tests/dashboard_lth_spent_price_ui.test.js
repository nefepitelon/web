const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the twentieth LTH Spent Price Under-water indicator", () => {
  assert.match(html, /id="lth-spent-panel"/);
  assert.match(html, /id="lth-spent-chart"/);
  assert.match(html, /data-chart-tabs="lth-spent"/);
  assert.match(html, /data-surf-model="lth-spent"/);
  assert.match(html, /id="lth-spent-snapshot"/);
  assert.match(html, /id="lth-spent-download"/);
  assert.match(html, /id="lth-spent-fullscreen"/);
  assert.match(html, /精确公开序列起点/);
});

test("LTH Spent Price follows Realized Cap HODL Waves and precedes halving", () => {
  const waves = html.indexOf('id="realized-cap-hodl-panel"');
  const spent = html.indexOf('id="lth-spent-panel"');
  const halving = html.indexOf('class="chart-panel halving-section"');
  assert.ok(waves >= 0 && spent > waves && halving > spent);
});

test("LTH Spent Price uses the public endpoint and complete controls", () => {
  assert.match(route, /"lth-spent-price": \(\) => import\("@\/api\/lth-spent-price\.js"\)/);
  assert.match(js, /\/api\/lth-spent-price/);
  assert.match(js, /loadLthSpentMetrics/);
  assert.match(js, /drawLthSpentChart/);
  assert.match(js, /saveLthSpentSnapshot/);
  assert.match(js, /downloadLthSpentCsv/);
  assert.match(js, /toggleLthSpentFullscreen/);
  assert.match(js, /exactHistoryStarts: lthSpentExactStart/);
  assert.match(css, /\.lth-spent-stage/);
  assert.match(css, /#lth-spent-signal-title\.is-deep-underwater/);
});

