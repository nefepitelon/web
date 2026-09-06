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

test("dashboard exposes the eleventh Value Days Destroyed Multiple indicator", () => {
  assert.match(html, /id="vdd-panel"/);
  assert.match(html, /id="vdd-chart"/);
  assert.match(html, /data-chart-tabs="vdd"/);
  assert.match(html, /data-surf-model="vdd"/);
  assert.match(html, /id="vdd-snapshot"/);
  assert.match(html, /id="vdd-download"/);
  assert.match(html, /id="vdd-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("VDD appears after four-year MVRV bands and before halving", () => {
  const tenthIndex = html.indexOf('id="mvrv-bands-panel"');
  const eleventhIndex = html.indexOf('id="vdd-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');
  assert.ok(tenthIndex < eleventhIndex);
  assert.ok(eleventhIndex < halvingIndex);
});

test("VDD uses a dedicated public endpoint with complete controls", () => {
  assert.match(route, /"vdd-multiple": \(\) => import\("@\/api\/vdd-multiple\.js"\)/);
  assert.match(js, /\/api\/vdd-multiple/);
  assert.match(js, /drawVddChart/);
  assert.match(js, /saveVddSnapshot/);
  assert.match(js, /downloadVddCsv/);
  assert.match(js, /toggleVddFullscreen/);
  assert.match(js, /drawBrandWatermark\(context,/);
  assert.match(css, /\.vdd-stage/);
  assert.match(css, /\.vdd-threshold-levels/);
});

test("VDD API calculates averages, zones and contiguous accumulation periods", async () => {
  const module = await import(pathToFileURL(path.join(root, "api", "vdd-multiple.js")).href);
  const rows = [0.9, 0.7, 0.6, 0.8, 3.1].map((vdd, index) => ({
    date: `2026-01-0${index + 1}`,
    price: 100 + index,
    vdd
  }));
  const snapshot = module.calculateVddSnapshot(rows);
  assert.equal(snapshot.vdd, 3.1);
  assert.equal(snapshot.zone, "distribution");
  assert.equal(snapshot.recentLow, 0.6);
  assert.equal(module.detectLowZones(rows)[0].days, 2);
  assert.equal(module.detectLowZones(rows)[0].minVdd, 0.6);
});
