const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");

test("dashboard exposes the seventh LTH market-cap-in-loss indicator", () => {
  assert.match(html, /id="lth-loss-panel"/);
  assert.match(html, /id="lth-loss-chart"/);
  assert.match(html, /data-chart-tabs="lth-loss"/);
  assert.match(html, /data-surf-model="lth-loss"/);
  assert.match(html, /id="lth-loss-snapshot"/);
  assert.match(html, /id="lth-loss-download"/);
  assert.match(html, /id="lth-loss-fullscreen"/);
  assert.match(html, /27% Bear Threshold/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("LTH market-cap-in-loss and long-term realized-price panels swap positions", () => {
  const ratioIndex = html.indexOf('id="sth-ratio-panel"');
  const lossIndex = html.indexOf('id="lth-loss-panel"');
  const realizedProfitLossIndex = html.indexOf('id="rpl-panel"');
  const lthRealizedPriceIndex = html.indexOf('id="lth-rp-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');

  assert.ok(ratioIndex < lossIndex);
  assert.ok(lossIndex < realizedProfitLossIndex);
  assert.ok(realizedProfitLossIndex < lthRealizedPriceIndex);
  assert.ok(lthRealizedPriceIndex < halvingIndex);
});

test("LTH loss UI loads public data and supports the complete chart workflow", () => {
  assert.match(js, /\/api\/lth-market-cap-loss/);
  assert.match(js, /cache:\s*"no-store"/);
  assert.match(js, /drawLthLossChart/);
  assert.match(js, /saveLthLossSnapshot/);
  assert.match(js, /downloadLthLossCsv/);
  assert.match(js, /toggleLthLossFullscreen/);
  assert.match(js, /retryLthLossLoading/);
  assert.match(js, /data-chart-tabs='lth-loss'/);
  assert.match(css, /\.lth-loss-stage/);
  assert.match(css, /#lth-loss-signal-title\.is-capitulation/);
});

test("LTH loss keeps valid chart data visible when refresh or cache persistence fails", () => {
  assert.match(js, /loading\.hidden = lthLossSeries\.length >= 2 && Boolean\(lthLossSnapshot\)/);
  assert.match(js, /preserveRenderedChart\(lthLossSeries, lthLossSnapshot, \["#lth-loss-loading"\]/);
  assert.match(js, /writeDashboardCache\(LTH_LOSS_CACHE_KEY, payload, "LTH market cap in loss"\)/);
  assert.match(js, /clearDashboardCache\(LTH_LOSS_CACHE_KEY, "LTH market cap in loss"\)/);
});
