const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the twenty-fourth under-three-month HODL Waves metric with full chart tools", () => {
  assert.match(html, /id="under-3m-hodl-panel"/);
  assert.match(html, /id="under-3m-hodl-chart"/);
  assert.match(html, /data-chart-tabs="under-3m-hodl"/);
  assert.match(html, /data-surf-model="under-3m-hodl"/);
  assert.match(html, /id="under-3m-hodl-snapshot"/);
  assert.match(html, /id="under-3m-hodl-download"/);
  assert.match(html, /id="under-3m-hodl-fullscreen"/);
  assert.match(html, /BTC · &lt;3M REALIZED CAP HODL WAVES/);
});

test("dashboard loads, caches, exports and redraws under-three-month HODL Waves data", () => {
  assert.match(js, /\/api\/under-3m-realized-cap-cycle\?schema=1/);
  assert.match(js, /const loadUnder3mHodlMetrics = async/);
  assert.match(js, /writeDashboardCache\(UNDER_3M_HEAT_CACHE_KEY, payload/);
  assert.match(js, /drawUnder3mHodlChart/);
  assert.match(js, /getUnder3mHodlVisibleSeries/);
  assert.match(js, /saveUnder3mHodlSnapshot/);
  assert.match(js, /downloadUnder3mHodlCsv/);
  assert.match(js, /toggleUnder3mHodlFullscreen/);
  assert.match(js, /showUnder3mHodlTooltip/);
  assert.match(route, /"under-3m-realized-cap-hodl-waves"/);
});

test("under-three-month HODL Waves keeps the dashboard visual and responsive system", () => {
  assert.match(css, /\.under-3m-hodl-stage/);
  assert.match(css, /\.legend-under-3m-share/);
  assert.match(css, /\.under-3m-hodl-snapshot/);
  assert.match(css, /grid-row: 1 \/ span 32/);
  assert.match(css, /@media \(min-width: 981px\)[\s\S]*\.under-3m-hodl-stage,[\s\S]*height: 560px/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.under-3m-hodl-stage \{ min-height: 520px/);
});
