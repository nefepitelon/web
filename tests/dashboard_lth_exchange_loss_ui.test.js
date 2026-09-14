const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the twenty-second LTH exchange-loss proxy with full chart tools", () => {
  assert.match(html, /id="lth-exchange-loss-panel"/);
  assert.match(html, /id="lth-exchange-loss-chart"/);
  assert.match(html, /data-chart-tabs="lth-exchange-loss"/);
  assert.match(html, /data-surf-model="lth-exchange-loss"/);
  assert.match(html, /id="lth-exchange-loss-snapshot"/);
  assert.match(html, /id="lth-exchange-loss-download"/);
  assert.match(html, /id="lth-exchange-loss-fullscreen"/);
  assert.match(html, /PUBLIC PROXY · NOT EXCHANGE-LABELLED/);
});

test("dashboard loads, caches and redraws the public proxy", () => {
  assert.match(js, /\/api\/lth-exchange-loss\?schema=1/);
  assert.match(js, /const loadLthExchangeLossMetrics = async/);
  assert.match(js, /writeDashboardCache\(LTH_EXCHANGE_LOSS_CACHE_KEY, payload/);
  assert.match(js, /preserveRenderedChart\(lthExchangeLossSeries, lthExchangeLossSnapshot/);
  assert.match(js, /drawLthExchangeLossChart/);
  assert.match(js, /getLthExchangeLossVisibleSeries/);
  assert.match(js, /public_all_chain_proxy_not_exchange_labelled/);
  assert.match(route, /"lth-exchange-loss"/);
});

test("the new indicator keeps the dashboard visual system", () => {
  assert.match(css, /\.lth-exchange-loss-stage/);
  assert.match(css, /\.legend-lth-exchange-loss/);
  assert.match(css, /\.lth-exchange-loss-levels/);
  assert.match(css, /grid-row: 1 \/ span 32/);
});
