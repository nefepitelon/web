const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");

test("dashboard exposes the fourteenth Stock-to-Flow cycle indicator", () => {
  assert.match(html, /id="stock-to-flow-panel"/);
  assert.match(html, /id="stock-to-flow-chart"/);
  assert.match(html, /data-chart-tabs="stock-to-flow"/);
  assert.match(html, /data-surf-model="stock-to-flow"/);
  assert.match(html, /id="stock-to-flow-snapshot"/);
  assert.match(html, /id="stock-to-flow-download"/);
  assert.match(html, /id="stock-to-flow-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("Stock-to-Flow appears after MVRV price bands and before halving", () => {
  const thirteenthIndex = html.indexOf('id="mvrv-price-bands-panel"');
  const fourteenthIndex = html.indexOf('id="stock-to-flow-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');
  assert.ok(thirteenthIndex < fourteenthIndex);
  assert.ok(fourteenthIndex < halvingIndex);
});

test("Stock-to-Flow UI includes complete chart, cache and export behavior", () => {
  assert.match(js, /\/api\/stock-to-flow/);
  assert.match(js, /drawStockToFlowChart/);
  assert.match(js, /saveStockToFlowSnapshot/);
  assert.match(js, /downloadStockToFlowCsv/);
  assert.match(js, /toggleStockToFlowFullscreen/);
  assert.match(js, /writeDashboardCache\(STOCK_TO_FLOW_CACHE_KEY, payload/);
  assert.match(js, /preserveRenderedChart\(stockToFlowSeries, stockToFlowSnapshot/);
  assert.match(js, /retryStockToFlowLoading/);
  assert.match(css, /\.stock-to-flow-stage/);
  assert.match(css, /\.stock-to-flow-forward/);
});

test("Stock-to-Flow API follows protocol subsidy eras and logarithmic model bands", async () => {
  const module = await import(pathToFileURL(path.join(root, "api", "stock-to-flow.js")).href);
  assert.equal(module.subsidyForDate("2012-11-27"), 50);
  assert.equal(module.subsidyForDate("2012-11-28"), 25);
  assert.equal(module.subsidyForDate("2024-04-20"), 3.125);

  const supply = 20_000_000;
  const price = 80_000;
  const [point] = module.calculateStockToFlowSeries([{ date: "2026-08-01", price, supply }]);
  const expectedFlow = 3.125 * 144 * 365;
  const expectedS2f = supply / expectedFlow;
  const expectedModel = Math.exp(2.53 * Math.log(expectedS2f) + 0.46);
  assert.ok(Math.abs(point.stockToFlow - expectedS2f) < 1e-10);
  assert.ok(Math.abs(point.modelPrice - expectedModel) < 1e-8);
  assert.ok(Math.abs(point.minusOne - expectedModel * Math.exp(-0.6)) < 1e-8);
  assert.equal(module.classifyDeviation(-2.1), "below-minus-two");
  assert.equal(module.classifyDeviation(0), "model-range");
});
