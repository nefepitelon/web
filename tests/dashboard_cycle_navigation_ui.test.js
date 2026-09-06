const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");

test("cycle pulse gauges sit above the valuation matrix and use live dashboard metrics", () => {
  assert.ok(html.indexOf('id="cycle-pulse"') < html.indexOf('id="valuation"'));
  assert.match(html, /id="cycle-pendulum-dial"/);
  assert.match(html, /id="fear-greed-dial"/);
  assert.match(js, /const getCyclePressureScore = \(\) =>/);
  assert.match(js, /const updateCyclePulseGauges =/);
  assert.match(js, /metricSnapshot\.fng/);
  assert.match(js, /metricSnapshot\.mvrv/);
  assert.match(js, /metricSnapshot\.wma/);
  assert.match(js, /metricSnapshot\.funding/);
});

test("valuation cards present explanations before daily source metadata", () => {
  const firstCard = html.slice(html.indexOf('class="signal-card"'), html.indexOf('class="signal-card"', html.indexOf('class="signal-card"') + 1));
  assert.ok(firstCard.indexOf('class="signal-explanation"') < firstCard.indexOf('class="signal-frequency"'));
  assert.match(css, /\.signal-card > p\.signal-explanation/);
  assert.match(css, /\.signal-card > em\.signal-frequency/);
});

test("trend index navigates all chart panels and adapts to narrow screens", () => {
  const panelIds = [...html.matchAll(/<article class="chart-panel[^>]+id="([^"]+-panel)"/g)].map((match) => match[1]);
  assert.equal(panelIds.length, 30);
  assert.match(html, /id="trend-index-list"/);
  assert.match(js, /const setupTrendNavigator = \(\) =>/);
  assert.match(js, /const getTrendScrollOffset = \(\) =>/);
  assert.match(js, /const jumpToTrendPanel = \(panel\) =>/);
  assert.match(js, /root\.style\.scrollBehavior = "auto"/);
  assert.match(js, /window\.scrollTo\(0, Math\.max\(0, top\)\)/);
  assert.doesNotMatch(js, /panel\.scrollIntoView/);
  assert.match(css, /\.chart-section \{[\s\S]*grid-template-columns: 174px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 1440px\)[\s\S]*\.trend-index-list \{[\s\S]*display: flex/);
  assert.match(css, /top: var\(--trend-index-sticky-top\)/);
  assert.match(css, /overscroll-behavior-inline: contain/);
  assert.match(js, /const syncTrendNavigatorLayout = \(\) =>/);
  assert.match(js, /--trend-index-sticky-top/);
});

test("trend analysis starts compact and expands the active panel while keeping the guide open", () => {
  assert.match(js, /disclosure\.open = index === 0/);
  assert.match(js, /const expandTrendAnalysis =/);
  assert.match(js, /firstDisclosure\.open = true/);
  assert.match(js, /setActiveTrendPanel\(current, panels\)/);
});

test("gauge needles map the full 0 to 100 score across the 180 degree arc", () => {
  assert.match(js, /clampScore\(score\) \* 1\.8/);
  assert.match(css, /\.sentiment-dial \{[\s\S]*--gauge-angle: 0deg/);
});

test("cycle conclusions and trend analysis remain readable while public sources retry", () => {
  assert.match(js, /const getCyclePressureAssessment = \(\) =>/);
  assert.match(js, /仅供周期观察，不构成投资建议/);
  assert.match(js, /const stabilizePendingAnalysisStates = \(\) =>/);
  assert.match(js, /#charts \[data-i18n\$="\.waiting"\]/);
  assert.match(js, /公开源重试中 · 说明可用/);
  assert.match(js, /stabilizePendingAnalysisStates\(\)/);
});

test("dashboard history caches compact and evict only dashboard data when storage is full", () => {
  assert.match(js, /const DASHBOARD_DATA_CACHE_KEYS = \[/);
  assert.match(js, /const compactDashboardCacheValue = \(value, maxArrayItems = 720\)/);
  assert.match(js, /const writeResilientCacheItem = \(key, value, label\)/);
  assert.match(js, /\.filter\(\(cacheKey\) => cacheKey !== key/);
  assert.doesNotMatch(js, /localStorage\.clear\(\)/);
});

test("wide dashboard containers use more desktop width and shorter chart stages", () => {
  assert.match(css, /\.dashboard-workspace \{[\s\S]*max-width: 1880px/);
  assert.match(css, /@media \(min-width: 981px\)[\s\S]*\.ratio-stage,[\s\S]*height: 520px/);
});

test("dashboard assets use the latest matching cache key", () => {
  assert.match(html, /dashboard\.css\?v=20260902-sthmvrv-v1/);
  assert.match(html, /dashboard\.js\?v=20260902-sthmvrv-v1/);
});
