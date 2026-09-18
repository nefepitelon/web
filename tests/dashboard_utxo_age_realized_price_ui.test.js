const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const homepage = fs.readFileSync(path.join(root, "index.html"), "utf8");
const product = fs.readFileSync(path.join(root, "product-dashboard.js"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the thirty-second UTXO age-band realized-price model", () => {
  assert.match(html, /id="utxo-age-rp-panel"/);
  assert.match(html, /id="utxo-age-rp-chart"/);
  assert.match(html, /data-chart-tabs="utxo-age-rp"/);
  assert.match(html, /data-surf-model="utxo-age-rp"/);
  assert.match(html, /id="utxo-age-rp-snapshot"/);
  assert.match(html, /id="utxo-age-rp-download"/);
  assert.match(html, /id="utxo-age-rp-fullscreen"/);
  assert.match(html, /1045、1028 与 1063 天/);
  assert.match(html, /INDEX \/ 34/);
  assert.ok(html.indexOf('id="utxo-age-rp-panel"') > html.indexOf('id="under-3m-heat-panel"'));
  assert.ok(html.indexOf('id="utxo-age-rp-panel"') < html.indexOf('class="chart-panel halving-section"'));
});

test("UTXO age-band model loads public data and offers complete chart interaction", () => {
  assert.match(js, /\/api\/utxo-age-realized-price-cycle\?schema=1/);
  assert.match(js, /const loadUtxoAgeRpMetrics = async/);
  assert.match(js, /writeDashboardCache\(UTXO_AGE_RP_CACHE_KEY, payload/);
  assert.match(js, /preserveRenderedChart\(utxoAgeRpSeries, utxoAgeRpSnapshot/);
  assert.match(js, /const drawUtxoAgeRpChart/);
  assert.match(js, /const saveUtxoAgeRpSnapshot/);
  assert.match(js, /const downloadUtxoAgeRpCsv/);
  assert.match(js, /const toggleUtxoAgeRpFullscreen/);
  assert.match(js, /const showUtxoAgeRpTooltip/);
  assert.match(js, /public_6m_12m_cohort_realized_cap_divided_by_supply/);
  assert.match(route, /"utxo-age-realized-price-cycle"/);
});

test("UTXO age-band model has its own visual treatment and homepage snapshot", () => {
  assert.match(css, /\.utxo-age-rp-panel::before/);
  assert.match(css, /\.utxo-age-rp-stage/);
  assert.match(css, /\.legend-utxo-age-rp-6m12m/);
  assert.match(css, /\.legend-utxo-age-rp-12m18m/);
  assert.match(css, /grid-row: 1 \/ span 34/);
  assert.match(homepage, /data-model-option="utxo-age-rp"/);
  assert.match(homepage, /class="power-copy-orbit"><strong>34<\/strong>/);
  assert.match(product, /"utxo-age-rp": \{/);
  assert.match(product, /\/api\/utxo-age-realized-price-cycle\?schema=1/);
  assert.match(css + fs.readFileSync(path.join(root, "styles.css"), "utf8"), /\.model-utxo-age-rp/);
});
