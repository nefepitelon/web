const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the twenty-sixth VDD / Median Price cycle model", () => {
  assert.match(html, /id="vdd-median-panel"/);
  assert.match(html, /id="vdd-median-chart"/);
  assert.match(html, /data-chart-tabs="vdd-median"/);
  assert.match(html, /data-surf-model="vdd-median"/);
  assert.match(html, /id="vdd-median-snapshot"/);
  assert.match(html, /id="vdd-median-download"/);
  assert.match(html, /id="vdd-median-fullscreen"/);
  assert.match(html, /INDEX \/ 34/);
});

test("VDD / Median model loads public data and supports complete chart interaction", () => {
  assert.match(js, /\/api\/vdd-median-cycle\?schema=1/);
  assert.match(js, /const loadVddMedianMetrics = async/);
  assert.match(js, /writeDashboardCache\(VDD_MEDIAN_CACHE_KEY, payload/);
  assert.match(js, /drawVddMedianCycleChart/);
  assert.match(js, /saveVddMedianSnapshot/);
  assert.match(js, /downloadVddMedianCsv/);
  assert.match(js, /toggleVddMedianFullscreen/);
  assert.match(js, /showVddMedianTooltip/);
  assert.match(route, /"vdd-median-cycle"/);
  assert.match(css, /\.vdd-median-stage/);
  assert.match(css, /\.legend-vdd-median-bottom/);
  assert.match(css, /grid-row: 1 \/ span 34/);
});
