const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");

test("dashboard exposes the ninth Median MVRV indicator", () => {
  assert.match(html, /id="median-mvrv-panel"/);
  assert.match(html, /id="median-mvrv-chart"/);
  assert.match(html, /data-chart-tabs="median-mvrv"/);
  assert.match(html, /data-surf-model="median-mvrv"/);
  assert.match(html, /id="median-mvrv-snapshot"/);
  assert.match(html, /id="median-mvrv-download"/);
  assert.match(html, /id="median-mvrv-fullscreen"/);
  assert.match(html, /1\.0 Break-Even/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("Median MVRV appears after the eighth indicator and before halving", () => {
  const eighthIndex = html.indexOf('id="supply-pl-panel"');
  const ninthIndex = html.indexOf('id="median-mvrv-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');

  assert.ok(eighthIndex < ninthIndex);
  assert.ok(ninthIndex < halvingIndex);
});

test("Median MVRV reuses verified median realized price data without a duplicate API request", () => {
  assert.match(js, /const buildMedianMvrvSeries =/);
  assert.match(js, /point\.price \/ latestVerifiedMedian/);
  assert.match(js, /const buildMedianMvrvSnapshot =/);
  assert.match(js, /applyMedianMvrvPayload\(rows, payload, cacheFallback\)/);
  assert.match(js, /\/api\/median-realized-price/);
  assert.doesNotMatch(js, /\/api\/median-mvrv/);
});

test("Median MVRV supports chart controls, watermark, and auditable snapshot labeling", () => {
  assert.match(js, /drawMedianMvrvChart/);
  assert.match(js, /saveMedianMvrvSnapshot/);
  assert.match(js, /downloadMedianMvrvCsv/);
  assert.match(js, /toggleMedianMvrvFullscreen/);
  assert.match(js, /data-chart-tabs='median-mvrv'/);
  assert.match(js, /PUBLIC HODL RECONSTRUCTION/);
  assert.match(js, /drawBrandWatermark\(context,/);
  assert.match(css, /\.median-mvrv-stage/);
  assert.match(css, /#median-mvrv-signal-title\.is-near/);
});
