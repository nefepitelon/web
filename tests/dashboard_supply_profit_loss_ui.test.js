const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");

test("dashboard exposes the eighth active supply profit/loss indicator", () => {
  assert.match(html, /id="supply-pl-panel"/);
  assert.match(html, /id="supply-pl-chart"/);
  assert.match(html, /data-chart-tabs="supply-pl"/);
  assert.match(html, /data-surf-model="supply-pl"/);
  assert.match(html, /id="supply-pl-snapshot"/);
  assert.match(html, /id="supply-pl-download"/);
  assert.match(html, /id="supply-pl-fullscreen"/);
  assert.match(html, /1\.0 Bear Threshold/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("eighth indicator appears after LTH realized price and before halving", () => {
  const lthRealizedPriceIndex = html.indexOf('id="lth-rp-panel"');
  const supplyProfitLossIndex = html.indexOf('id="supply-pl-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');

  assert.ok(lthRealizedPriceIndex < supplyProfitLossIndex);
  assert.ok(supplyProfitLossIndex < halvingIndex);
});

test("supply profit/loss UI supports the complete chart workflow", () => {
  assert.match(js, /\/api\/supply-profit-loss-ratio\?schema=1/);
  assert.match(js, /cache:\s*"no-store"/);
  assert.match(js, /drawSupplyProfitLossChart/);
  assert.match(js, /saveSupplyProfitLossSnapshot/);
  assert.match(js, /downloadSupplyProfitLossCsv/);
  assert.match(js, /toggleSupplyProfitLossFullscreen/);
  assert.match(js, /retrySupplyProfitLossLoading/);
  assert.match(js, /data-chart-tabs='supply-pl'/);
  assert.match(css, /\.supply-pl-stage/);
  assert.match(css, /#supply-pl-signal-title\.is-bottom/);
});

test("supply profit/loss keeps valid chart data visible when refresh fails", () => {
  assert.match(js, /loading\.hidden = supplyProfitLossSeries\.length >= 2 && Boolean\(supplyProfitLossSnapshot\)/);
  assert.match(js, /preserveRenderedChart\(supplyProfitLossSeries, supplyProfitLossSnapshot, \["#supply-pl-loading"\]/);
  assert.match(js, /writeDashboardCache\(SUPPLY_PROFIT_LOSS_CACHE_KEY, payload, "Supply profit\/loss ratio"\)/);
  assert.match(js, /clearDashboardCache\(SUPPLY_PROFIT_LOSS_CACHE_KEY, "Supply profit\/loss ratio"\)/);
});

