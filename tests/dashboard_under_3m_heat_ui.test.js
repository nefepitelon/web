const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the thirty-first under-three-month hot-capital cycle model", () => {
  assert.match(html, /id="under-3m-heat-panel"/);
  assert.match(html, /id="under-3m-heat-chart"/);
  assert.match(html, /data-chart-tabs="under-3m-heat"/);
  assert.match(html, /data-surf-model="under-3m-heat"/);
  assert.match(html, /39%–45%/);
  assert.ok(html.indexOf('id="under-3m-heat-panel"') > html.indexOf('id="sth-mvrv-panel"'));
  assert.ok(html.indexOf('id="under-3m-heat-panel"') < html.indexOf('class="chart-panel halving-section"'));
});

test("thirty-first model loads live data, renders projection and keeps all chart tools", () => {
  assert.match(js, /\/api\/under-3m-realized-cap-cycle\?schema=1/);
  assert.match(js, /drawUnder3mHeatChart/);
  assert.match(js, /under3mHeatProjection/);
  assert.match(js, /saveUnder3mHeatSnapshot/);
  assert.match(js, /downloadUnder3mHeatCsv/);
  assert.match(js, /toggleUnder3mHeatFullscreen/);
  assert.match(js, /showUnder3mHeatTooltip/);
  assert.match(route, /"under-3m-realized-cap-cycle"/);
});

test("thirty-first model has distinct responsive and reference styling", () => {
  assert.match(css, /\.under-3m-heat-panel::before/);
  assert.match(css, /\.under-3m-heat-stage/);
  assert.match(css, /\.legend-under-3m-heat-share/);
  assert.match(css, /\.under-3m-heat-history/);
  assert.match(css, /grid-row: 1 \/ span 34/);
});
