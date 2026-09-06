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

test("dashboard exposes the tenth four-year standard-adjusted MVRV indicator", () => {
  assert.match(html, /id="mvrv-bands-panel"/);
  assert.match(html, /id="mvrv-bands-chart"/);
  assert.match(html, /data-chart-tabs="mvrv-bands"/);
  assert.match(html, /data-surf-model="mvrv-bands"/);
  assert.match(html, /id="mvrv-bands-snapshot"/);
  assert.match(html, /id="mvrv-bands-download"/);
  assert.match(html, /id="mvrv-bands-fullscreen"/);
  assert.match(html, /1,460D ROLLING/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("MVRV bands appear after Median MVRV and before halving", () => {
  const ninthIndex = html.indexOf('id="median-mvrv-panel"');
  const tenthIndex = html.indexOf('id="mvrv-bands-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');
  assert.ok(ninthIndex < tenthIndex);
  assert.ok(tenthIndex < halvingIndex);
});

test("MVRV bands use a dedicated public endpoint with complete controls", () => {
  assert.match(route, /"mvrv-bands": \(\) => import\("@\/api\/mvrv-bands\.js"\)/);
  assert.match(js, /\/api\/mvrv-bands/);
  assert.match(js, /drawMvrvBandsChart/);
  assert.match(js, /saveMvrvBandsSnapshot/);
  assert.match(js, /downloadMvrvBandsCsv/);
  assert.match(js, /toggleMvrvBandsFullscreen/);
  assert.match(js, /drawBrandWatermark\(context,/);
  assert.match(css, /\.mvrv-bands-stage/);
  assert.match(css, /\.mvrv-band-levels/);
});

test("MVRV bands API computes an exact rolling population standard deviation", async () => {
  const module = await import(pathToFileURL(path.join(root, "api", "mvrv-bands.js")).href);
  const rows = [1, 2, 3, 4].map((mvrv, index) => ({
    date: `2026-01-0${index + 1}`,
    price: 100 + index,
    mvrv
  }));
  const series = module.calculateRollingBands(rows, 3);
  assert.equal(series[0].mean, null);
  assert.equal(series[1].mean, null);
  assert.equal(series[2].mean, 2);
  assert.ok(Math.abs(series[2].std - Math.sqrt(2 / 3)) < 1e-12);
  assert.equal(series[3].mean, 3);
  assert.ok(Math.abs(series[3].zscore - (1 / Math.sqrt(2 / 3))) < 1e-12);
});
