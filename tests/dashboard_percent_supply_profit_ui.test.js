const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("the twenty-first Percent Supply in Profit panel follows the established chart order and tools", () => {
  const panelIndex = html.indexOf('id="percent-profit-panel"');
  assert.ok(panelIndex > html.indexOf('id="lth-spent-panel"'));
  assert.ok(panelIndex < html.indexOf('class="chart-panel halving-section"'));
  assert.match(html, /id="percent-profit-chart"/);
  assert.match(html, /data-chart-tabs="percent-profit"/);
  assert.match(html, /id="percent-profit-snapshot"/);
  assert.match(html, /id="percent-profit-download"/);
  assert.match(html, /id="percent-profit-fullscreen"/);
  assert.match(html, /data-surf-model="percent-profit"/);
  assert.match(html, /data-range="7"[\s\S]*data-range="30"[\s\S]*data-range="90"[\s\S]*data-range="365"[\s\S]*data-range="all"/);
});

test("the Percent Supply in Profit client loads, caches and renders complete public history", () => {
  assert.match(route, /"percent-supply-profit": \(\) => import\("@\/api\/percent-supply-profit\.js"\)/);
  assert.match(js, /const PERCENT_PROFIT_CACHE_KEY/);
  assert.match(js, /\/api\/percent-supply-profit/);
  assert.match(js, /loadPercentProfitMetrics/);
  assert.match(js, /drawPercentProfitChart/);
  assert.match(js, /getPercentProfitVisibleSeries/);
  assert.match(js, /writeDashboardCache\(PERCENT_PROFIT_CACHE_KEY, payload/);
  assert.match(js, /savePercentProfitSnapshot/);
  assert.match(js, /downloadPercentProfitCsv/);
  assert.match(js, /togglePercentProfitFullscreen/);
});

test("the Percent Supply in Profit visual system includes zones, responsive height and transparent research wording", () => {
  assert.match(css, /\.percent-profit-stage/);
  assert.match(css, /\.legend-percent-profit-bottom/);
  assert.match(css, /\.legend-percent-profit-top/);
  assert.match(css, /\.percent-profit-levels/);
  assert.match(html, /50% 与 95% 为本看板研究区间/);
  assert.match(html, /不构成投资建议/);
  assert.match(js, /drawBrandWatermark/);
});
