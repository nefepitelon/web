const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");

test("dashboard exposes the sixth LTH/STH cycle indicator with complete chart tools", () => {
  assert.match(html, /id="lth-sth-panel"/);
  assert.match(html, /id="lth-sth-chart"/);
  assert.match(html, /data-chart-tabs="lth-sth"/);
  assert.match(html, /id="lth-sth-snapshot"/);
  assert.match(html, /id="lth-sth-download"/);
  assert.match(html, /id="lth-sth-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("all thirty-two cycle indicators expose an on-demand Surf model switch", () => {
  const switches = html.match(/data-surf-model="[^"]+"/g) || [];
  assert.equal(switches.length, 32);
  assert.match(js, /\/api\/surf-research/);
  assert.match(js, /toggleSurfMetricPanel/);
  assert.match(css, /\.surf-model-panel/);
});

test("LTH/STH UI loads the public endpoint and supports range redraws", () => {
  assert.match(js, /\/api\/lth-sth-ratio/);
  assert.match(js, /cache:\s*"no-store"/);
  assert.match(js, /response\.status === 304/);
  assert.match(js, /LTH\/STH 数据同步失败，点击重试/);
  assert.match(js, /retryLthSthLoading/);
  assert.match(js, /#lth-sth-loading"\)\?\.addEventListener\("click"/);
  assert.match(js, /drawLthSthChart/);
  assert.match(js, /getLthSthVisibleSeries/);
  assert.match(js, /data-chart-tabs='lth-sth'/);
  assert.match(css, /\.lth-sth-stage/);
});

test("all trend loaders preserve rendered data and treat browser cache as best-effort", () => {
  assert.match(js, /const writeDashboardCache =/);
  assert.match(js, /const preserveRenderedChart =/);
  assert.match(js, /loading\.hidden = lthSthSeries\.length >= 2 && Boolean\(lthSthSnapshot\)/);
  for (const [cacheKey, series, snapshot] of [
    ["COST_BASIS_CACHE_KEY", "costBasisSeries", "costBasisSnapshot"],
    ["LTH_REALIZED_CACHE_KEY", "lthRealizedSeries", "lthRealizedSnapshot"],
    ["REALIZED_PROFIT_LOSS_CACHE_KEY", "realizedProfitLossSeries", "realizedProfitLossSnapshot"],
    ["MEDIAN_REALIZED_CACHE_KEY", "medianRealizedSeries", "medianRealizedSnapshot"],
    ["LTH_STH_CACHE_KEY", "lthSthSeries", "lthSthSnapshot"],
    ["LTH_LOSS_CACHE_KEY", "lthLossSeries", "lthLossSnapshot"],
    ["SUPPLY_PROFIT_LOSS_CACHE_KEY", "supplyProfitLossSeries", "supplyProfitLossSnapshot"],
    ["MVRV_BANDS_CACHE_KEY", "mvrvBandsSeries", "mvrvBandsSnapshot"],
    ["STOCK_TO_FLOW_CACHE_KEY", "stockToFlowSeries", "stockToFlowSnapshot"],
    ["CYCLE_TIMING_CACHE_KEY", "cycleTimingSeries", "cycleTimingSnapshot"],
    ["RHODL_CACHE_KEY", "rhodlSeries", "rhodlSnapshot"],
    ["LTH_RPL_CACHE_KEY", "lthRplSeries", "lthRplSnapshot"],
    ["LTH_EXCHANGE_LOSS_CACHE_KEY", "lthExchangeLossSeries", "lthExchangeLossSnapshot"],
    ["VDD_CACHE_KEY", "vddSeries", "vddSnapshot"],
    ["LTH_NUPL_CACHE_KEY", "lthNuplSeries", "lthNuplSnapshot"]
  ]) {
    assert.match(js, new RegExp(`writeDashboardCache\\(${cacheKey}, payload`));
    assert.match(js, new RegExp(`preserveRenderedChart\\(${series}, ${snapshot}`));
  }
});

test("dashboard assets use a release version so browsers do not retain the pre-fix loader", () => {
  assert.match(html, /dashboard\.js\?v=20260914-system-ui-v1/);
  assert.match(html, /dashboard\.css\?v=20260914-system-ui-v1/);
});
