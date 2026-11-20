const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");

test("section navigation retains a tall intersecting section when a shorter section exits in a later observer batch", () => {
  const start = js.indexOf("const sectionIntersections =");
  const end = js.indexOf("const watermarkStages =", start);
  assert.ok(start >= 0 && end > start);
  const targets = ["overview", "address-balance-flow", "market-heatmap", "onchain-carousel"].map(id => ({ id }));
  const links = targets.map(target => ({ dataset: { sectionLink: target.id }, active: false,
    classList: { toggle(_name, selected) { this.owner.active = selected; } } }));
  links.forEach(link => { link.classList.owner = link; });
  let notify;
  const observed = [];
  vm.runInNewContext(js.slice(start, end), {
    IntersectionObserver: class {
      constructor(callback) { notify = callback; }
      observe(target) { observed.push(target.id); }
    },
    document: { querySelectorAll(selector) { return selector === "[data-section-link]" ? links : targets; } }
  });
  assert.ok(observed.includes("market-heatmap"));
  const entry = (id, intersectionRatio, isIntersecting = true) => ({ target: targets.find(target => target.id === id), intersectionRatio, isIntersecting });
  const active = () => links.filter(link => link.active).map(link => link.dataset.sectionLink);

  // The heatmap is taller, so its ratio remains below the next 0.1 threshold.
  notify([entry("address-balance-flow", .13), entry("market-heatmap", .07)]);
  assert.deepEqual(active(), ["address-balance-flow"]);
  // Only the leaving section changed; the heatmap will not receive another entry.
  notify([entry("address-balance-flow", 0, false)]);
  assert.deepEqual(active(), ["market-heatmap"]);
  notify([entry("onchain-carousel", .2)]);
  assert.deepEqual(active(), ["onchain-carousel"]);
  notify([entry("onchain-carousel", 0, false)]);
  assert.deepEqual(active(), ["market-heatmap"]);
  notify([entry("market-heatmap", 0, false), entry("address-balance-flow", .13)]);
  assert.deepEqual(active(), ["address-balance-flow"]);
});

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

test("compact valuation and derivatives cards omit source footers and retain explanations and values", () => {
  const valuation = html.slice(html.indexOf('id="valuation"'), html.indexOf('id="network"'));
  const derivatives = html.slice(html.indexOf('class="terminal-section derivatives-section"'), html.indexOf('id="charts"'));
  assert.equal((valuation.match(/class="signal-explanation"/g) || []).length, 6);
  assert.doesNotMatch(valuation, /signal-frequency|id="(?:balanced|mvrv-z|nupl|sopr|puell|profit-supply)-source"/);
  assert.doesNotMatch(derivatives, /<em|id="[^"]+-source"/);
  assert.equal((derivatives.match(/<strong id=/g) || []).length, 5);
  assert.match(css, /\.signal-card > p\.signal-explanation/);
});

test("trend index navigates all chart panels and adapts to narrow screens", () => {
  const panelIds = [...html.matchAll(/<article class="chart-panel[^>]+id="([^"]+-panel)"/g)].map((match) => match[1]);
  assert.equal(panelIds.length, 35);
  assert.match(html, /id="trend-index-list"/);
  assert.match(js, /const setupTrendNavigator = \(\) =>/);
  assert.match(js, /const getTrendScrollOffset = \(\) =>/);
  assert.match(js, /const jumpToTrendPanel = \(panel\) =>/);
  assert.match(js, /root\.style\.scrollBehavior = "auto"/);
  assert.match(js, /window\.scrollTo\(0, Math\.max\(0, top\)\)/);
  assert.doesNotMatch(js, /panel\.scrollIntoView/);
  assert.match(css, /\.chart-section \{[\s\S]*grid-template-columns: 208px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.trend-index-list \{[\s\S]*display: flex/);
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
  assert.match(html, /dashboard\.css\?v=20261110-cycle-seasons-v1/);
  assert.match(html, /dashboard\.js\?v=20261116-dashboard-interactions-scrollspy-v3/);
});
