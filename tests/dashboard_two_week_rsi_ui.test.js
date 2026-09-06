const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the twenty-third two-week RSI metric with full chart tools", () => {
  assert.match(html, /id="two-week-rsi-panel"/);
  assert.match(html, /id="two-week-rsi-chart"/);
  assert.match(html, /data-chart-tabs="two-week-rsi"/);
  assert.match(html, /data-surf-model="two-week-rsi"/);
  assert.match(html, /id="two-week-rsi-snapshot"/);
  assert.match(html, /id="two-week-rsi-download"/);
  assert.match(html, /id="two-week-rsi-fullscreen"/);
  assert.match(html, /BTC · 2-WEEK RSI · MACRO MOMENTUM CHANNEL/);
});

test("dashboard loads, caches, exports and redraws two-week RSI data", () => {
  assert.match(js, /\/api\/two-week-rsi\?schema=1/);
  assert.match(js, /const loadTwoWeekRsiMetrics = async/);
  assert.match(js, /writeDashboardCache\(TWO_WEEK_RSI_CACHE_KEY, payload/);
  assert.match(js, /drawTwoWeekRsiChart/);
  assert.match(js, /getTwoWeekRsiVisibleSeries/);
  assert.match(js, /saveTwoWeekRsiSnapshot/);
  assert.match(js, /downloadTwoWeekRsiCsv/);
  assert.match(js, /toggleTwoWeekRsiFullscreen/);
  assert.match(js, /showTwoWeekRsiTooltip/);
  assert.match(route, /"two-week-rsi"/);
});

test("two-week RSI keeps the dashboard visual and responsive system", () => {
  assert.match(css, /\.two-week-rsi-stage/);
  assert.match(css, /\.legend-two-week-rsi/);
  assert.match(css, /\.two-week-rsi-snapshot/);
  assert.match(css, /grid-row: 1 \/ span 30/);
  assert.match(css, /@media \(min-width: 981px\)[\s\S]*\.two-week-rsi-stage,[\s\S]*height: 560px/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.two-week-rsi-stage \{ min-height: 520px/);
});
