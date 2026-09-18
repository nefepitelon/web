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

test("dashboard exposes the thirty-third STH realized profit/loss momentum model", () => {
  assert.match(html, /id="sth-rpl-momentum-panel"/);
  assert.match(html, /id="sth-rpl-momentum-chart"/);
  assert.match(html, /data-chart-tabs="sth-rpl-momentum"/);
  assert.match(html, /data-surf-model="sth-rpl-momentum"/);
  assert.match(html, /id="sth-rpl-momentum-snapshot"/);
  assert.match(html, /id="sth-rpl-momentum-download"/);
  assert.match(html, /id="sth-rpl-momentum-fullscreen"/);
  assert.match(html, /113、139 与 103 天/);
  assert.match(html, /INDEX \/ 34/);
  assert.ok(html.indexOf('id="sth-rpl-momentum-panel"') > html.indexOf('id="utxo-age-rp-panel"'));
  assert.ok(html.indexOf('id="sth-rpl-momentum-panel"') < html.indexOf('class="chart-panel halving-section"'));
});

test("STH profit/loss momentum loads public data and keeps all chart interactions", () => {
  assert.match(js, /\/api\/sth-realized-profit-loss-momentum\?schema=1/);
  assert.match(js, /const loadSthRplMomentumMetrics = async/);
  assert.match(js, /writeDashboardCache\(STH_RPL_MOMENTUM_CACHE_KEY, payload/);
  assert.match(js, /const drawSthRplMomentumChart/);
  assert.match(js, /const saveSthRplMomentumSnapshot/);
  assert.match(js, /const downloadSthRplMomentumCsv/);
  assert.match(js, /const toggleSthRplMomentumFullscreen/);
  assert.match(js, /const showSthRplMomentumTooltip/);
  assert.match(js, /sma7_of_public_sth_realized_profit_loss_ratio_divided_by_sma365/);
  assert.match(route, /"sth-realized-profit-loss-momentum"/);
});

test("STH profit/loss momentum has dedicated styles and a homepage snapshot", () => {
  assert.match(css, /\.sth-rpl-momentum-panel::before/);
  assert.match(css, /\.sth-rpl-momentum-stage/);
  assert.match(css, /\.legend-sth-rpl-momentum-line/);
  assert.match(css, /\.legend-sth-rpl-momentum-reference/);
  assert.match(css, /grid-row: 1 \/ span 34/);
  assert.match(homepage, /data-model-option="sth-rpl-momentum"/);
  assert.match(homepage, /class="power-copy-orbit"><strong>34<\/strong>/);
  assert.match(product, /"sth-rpl-momentum": \{/);
  assert.match(product, /\/api\/sth-realized-profit-loss-momentum\?schema=1/);
  assert.match(fs.readFileSync(path.join(root, "styles.css"), "utf8"), /\.model-sth-rpl-momentum/);
});
