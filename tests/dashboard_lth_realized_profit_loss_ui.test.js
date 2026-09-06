const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the seventeenth LTH realized profit loss ratio indicator", () => {
  assert.match(html, /id="lth-rpl-panel"/);
  assert.match(html, /id="lth-rpl-chart"/);
  assert.match(html, /data-chart-tabs="lth-rpl"/);
  assert.match(html, /data-surf-model="lth-rpl"/);
  assert.match(html, /id="lth-rpl-snapshot"/);
  assert.match(html, /id="lth-rpl-download"/);
  assert.match(html, /id="lth-rpl-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("LTH realized profit loss appears after RHODL and before halving", () => {
  const rhodlIndex = html.indexOf('id="rhodl-panel"');
  const ratioIndex = html.indexOf('id="lth-rpl-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');
  assert.ok(rhodlIndex >= 0 && ratioIndex > rhodlIndex && halvingIndex > ratioIndex);
});

test("LTH realized profit loss uses the public endpoint and complete chart controls", () => {
  assert.match(route, /"lth-realized-profit-loss": \(\) => import\("@\/api\/lth-realized-profit-loss\.js"\)/);
  assert.match(js, /\/api\/lth-realized-profit-loss/);
  assert.match(js, /loadLthRplMetrics/);
  assert.match(js, /drawLthRplChart/);
  assert.match(js, /saveLthRplSnapshot/);
  assert.match(js, /downloadLthRplCsv/);
  assert.match(js, /toggleLthRplFullscreen/);
  assert.match(js, /drawBrandWatermark\(context,/);
  assert.match(js, /lthRplRange === "all" \? 1_000_000_000/);
  assert.match(css, /\.lth-rpl-stage/);
  assert.match(css, /\.lth-rpl-zone-levels/);
});

test("public API calculates smoothed ratios, zones and explicit methodology", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "lth-realized-profit-loss.js")).href);
  const start = Date.UTC(2025, 0, 1);
  const profit = [];
  const loss = [];
  const price = [];
  for (let index = 0; index < 400; index += 1) {
    const timestamp = start + index * 86_400_000;
    const ratio = index < 360 ? 2 : index < 390 ? 0.8 : 1.2;
    profit.push({ timestamp, value: 100 * ratio });
    loss.push({ timestamp, value: -100 });
    price.push({ timestamp, value: 60_000 + index * 20 });
  }
  const series = api.buildLthRealizedProfitLossSeries(profit, loss, price);
  assert.equal(series.length, 400);
  assert.ok(series[370].ratio < 1);
  const zones = api.detectUnderwaterZones(series);
  assert.ok(zones.some((zone) => zone.days >= 14));
  const snapshot = api.calculateLthRealizedProfitLossSnapshot(series, { value: 78_060, asOf: "2026-02-05T00:00:00Z" }, zones);
  assert.equal(snapshot.price, 78_060);
  assert.ok(Number.isFinite(snapshot.average7));
  assert.equal(api.classifyLthRealizedProfitLoss(0.91), "underwater");
  assert.equal(api.classifyLthRealizedProfitLoss(1.2), "pivot");
  assert.equal(api.classifyLthRealizedProfitLoss(3), "profit");
  assert.equal(api.classifyLthRealizedProfitLoss(25), "distribution");
  assert.match(fs.readFileSync(path.join(root, "api", "lth-realized-profit-loss.js"), "utf8"), /does not reproduce Glassnode's proprietary entity-cluster adjustment/);
});
