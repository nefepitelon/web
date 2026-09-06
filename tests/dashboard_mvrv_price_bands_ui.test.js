const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");

test("dashboard exposes the thirteenth standard-adjusted MVRV price-bands indicator", () => {
  assert.match(html, /id="mvrv-price-bands-panel"/);
  assert.match(html, /id="mvrv-price-bands-chart"/);
  assert.match(html, /data-chart-tabs="mvrv-price-bands"/);
  assert.match(html, /data-surf-model="mvrv-price-bands"/);
  assert.match(html, /id="mvrv-price-bands-snapshot"/);
  assert.match(html, /id="mvrv-price-bands-download"/);
  assert.match(html, /id="mvrv-price-bands-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("MVRV price bands appear after LTH-NUPL and before halving", () => {
  const twelfthIndex = html.indexOf('id="lth-nupl-panel"');
  const thirteenthIndex = html.indexOf('id="mvrv-price-bands-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');
  assert.ok(twelfthIndex < thirteenthIndex);
  assert.ok(thirteenthIndex < halvingIndex);
});

test("MVRV price bands reuse the public MVRV pipeline with complete chart controls", () => {
  assert.match(js, /drawMvrvPriceBandsChart/);
  assert.match(js, /saveMvrvPriceBandsSnapshot/);
  assert.match(js, /downloadMvrvPriceBandsCsv/);
  assert.match(js, /toggleMvrvPriceBandsFullscreen/);
  assert.match(js, /priceMinusOne/);
  assert.match(js, /pricePlusTwo/);
  assert.match(css, /\.mvrv-price-bands-stage/);
  assert.match(css, /\.mvrv-price-band-levels/);
});

test("public MVRV API converts rolling sigma levels into auditable USD price bands", async () => {
  const module = await import(pathToFileURL(path.join(root, "api", "mvrv-bands.js")).href);
  const rows = [1, 2, 3].map((mvrv, index) => ({
    date: `2026-01-0${index + 1}`,
    price: mvrv * 100,
    mvrv
  }));
  const series = module.calculateRollingBands(rows, 3);
  const latest = series.at(-1);
  const std = Math.sqrt(2 / 3);
  assert.equal(latest.realizedPrice, 100);
  assert.ok(Math.abs(latest.priceMinusOne - 100 * (2 - std)) < 1e-10);
  assert.equal(latest.priceMean, 200);
  assert.ok(Math.abs(latest.pricePlusTwo - 100 * (2 + 2 * std)) < 1e-10);
});
