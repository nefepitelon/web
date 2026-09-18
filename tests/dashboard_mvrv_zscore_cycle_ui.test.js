const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("dashboard exposes the complete MVRV Z-Score workspace", () => {
  const html = read("dashboard.html");
  const js = read("dashboard.js");
  const css = read("dashboard.css");

  assert.match(html, /id="mvrv-zscore-panel"/);
  assert.match(html, /id="mvrv-zscore-chart"/);
  assert.match(html, /data-surf-model="mvrv-zscore"/);
  assert.match(html, /data-chart-tabs="mvrv-zscore"/);
  assert.match(html, /id="mvrv-zscore-snapshot"/);
  assert.match(html, /id="mvrv-zscore-download"/);
  assert.match(html, /id="mvrv-zscore-fullscreen"/);
  assert.match(html, /INDEX \/ 34/);

  assert.match(js, /\/api\/mvrv-zscore-cycle\?schema=1/);
  assert.match(js, /const drawMvrvZscoreChart/);
  assert.match(js, /const applyMvrvZscorePayload/);
  assert.match(js, /const loadMvrvZscoreMetrics/);
  assert.match(js, /const downloadMvrvZscoreCsv/);
  assert.match(js, /"mvrv-zscore": \{/);
  assert.match(js, /threshold: 0\.7539/);
  assert.match(css, /\.mvrv-zscore-panel::before/);
  assert.match(css, /grid-row: 1 \/ span 34/);
});

test("MVRV Z-Score is available in the homepage product dashboard and legacy route", () => {
  const homepage = read("index.html");
  const product = read("product-dashboard.js");
  const styles = read("styles.css");
  const route = read("app/api/[legacy]/route.ts");

  assert.match(homepage, /data-model-option="mvrv-zscore"/);
  assert.match(homepage, /class="power-copy-orbit"><strong>34<\/strong>/);
  assert.match(product, /"mvrv-zscore": \{/);
  assert.match(product, /\/api\/mvrv-zscore-cycle\?schema=1/);
  assert.match(styles, /\.model-mvrv-zscore/);
  assert.match(route, /"mvrv-zscore-cycle"/);
  assert.match(homepage, /20260917-mvrv-zscore-watermark-v2/);
});
