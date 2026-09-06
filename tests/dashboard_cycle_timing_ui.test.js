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

test("the fifteenth cycle indicator exposes five timing modes, future nodes and complete chart controls", () => {
  assert.match(html, /id="cycle-timing-panel"/);
  assert.match(html, /id="cycle-timing-chart"/);
  assert.match(html, /data-chart-tabs="cycle-timing"/);
  assert.match(html, /data-surf-model="cycle-timing"/);
  assert.match(html, /id="cycle-timing-snapshot"/);
  assert.match(html, /id="cycle-timing-download"/);
  assert.match(html, /id="cycle-timing-fullscreen"/);
  assert.equal((html.match(/data-cycle-mode="[^"]+"/g) || []).length, 5);
  assert.match(html, /data-cycle-mode="halving-top"/);
  assert.match(html, /data-cycle-mode="bottom-top"/);
  assert.match(html, /data-cycle-mode="halving-bottom"/);
  assert.match(html, /data-cycle-mode="top-top"/);
  assert.match(html, /data-cycle-mode="bottom-bottom"/);
  assert.match(html, /id="cycle-timing-future"/);
  assert.match(html, /legend-cycle-future-halving/);
  assert.match(html, /legend-cycle-future-top/);
  assert.match(html, /legend-cycle-future-bottom/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("cycle timing is placed after stock-to-flow and before the halving progress panel", () => {
  const stockIndex = html.indexOf('id="stock-to-flow-panel"');
  const cycleIndex = html.indexOf('id="cycle-timing-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');
  assert.ok(stockIndex >= 0 && cycleIndex > stockIndex && halvingIndex > cycleIndex);
});

test("cycle timing loads its public endpoint and supports redraw, export and mode changes", () => {
  assert.match(route, /"cycle-timing":\s*\(\)\s*=>\s*import\("@\/api\/cycle-timing\.js"\)/);
  assert.match(js, /\/api\/cycle-timing/);
  assert.match(js, /loadCycleTimingMetrics/);
  assert.match(js, /drawCycleTimingChart/);
  assert.match(js, /refreshCycleTimingMode/);
  assert.match(js, /saveCycleTimingSnapshot/);
  assert.match(js, /downloadCycleTimingCsv/);
  assert.match(js, /toggleCycleTimingFullscreen/);
  assert.match(js, /data-chart-tabs='cycle-timing'/);
  assert.match(js, /\[data-cycle-mode\]/);
  assert.match(js, /cycleTimingFutureCycle/);
  assert.match(js, /futureNodes/);
  assert.match(css, /\.cycle-mode-tabs/);
  assert.match(css, /\.cycle-timing-stage/);
  assert.match(css, /\.cycle-future-grid/);
});

test("cycle timing participates in language and fullscreen redraws", () => {
  assert.match(js, /if \(cycleTimingSnapshot\) refreshCycleTimingMode\(\)/);
  const fullscreenBlock = js.slice(js.indexOf('document.addEventListener("fullscreenchange"'), js.indexOf('document.querySelectorAll("[data-metric-filter]"'));
  assert.match(fullscreenBlock, /hideCycleTimingTooltip\(\)/);
  assert.match(fullscreenBlock, /drawCycleTimingChart\(\)/);
});

test("cycle timing projections use the documented UTC calendar windows", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "cycle-timing.js")));
  assert.equal(api.addDays("2024-04-19", 534), "2025-10-05");
  assert.equal(api.addDays("2022-11-21", 1050), "2025-10-06");
  assert.equal(api.addDays("2024-04-20", 863), "2026-08-31");
  assert.equal(api.addDays("2021-11-10", 1451), "2025-10-31");
  assert.equal(api.addDays("2022-11-21", 1434), "2026-10-25");
  assert.equal(api.dayDifference("2024-04-19", "2025-10-05"), 534);

  const halving = api.buildNextHalvingEstimate(new Date("2026-08-11T00:00:00Z"), 961965, "test height");
  assert.equal(halving.nextHalvingHeight, 1050000);
  assert.equal(halving.blocksRemaining, 88035);
  assert.equal(halving.projectedDate, "2028-04-13");

  const forecast = api.buildFutureCycleForecast(halving);
  assert.equal(forecast.nodes.length, 3);
  assert.deepEqual(forecast.nodes.map((node) => node.date), ["2028-04-13", "2029-09-29", "2030-08-24"]);
  assert.equal(forecast.nodes[1].alternateDate, "2029-10-21");
  assert.equal(forecast.nodes[2].alternateDate, "2030-09-28");
});
