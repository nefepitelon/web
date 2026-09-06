const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");

const functionBody = (start, end) => js.slice(js.indexOf(start), js.indexOf(end));

test("all thirty on-chain trend charts use the unified icon and text watermark", () => {
  assert.match(js, /chartBrandWatermark\.src = "\/welinkbtc-orbit-brand\.webp"/);
  assert.match(js, /chartBrandWatermark\.loading = "eager"/);
  assert.match(js, /chartBrandWatermark\.decode\(\)\.catch/);
  assert.match(js, /const drawBrandWatermark = \(context, centerX, centerY, label = "welinkBTC"\)/);
  assert.match(js, /context\.drawImage\(chartBrandWatermark/);
  assert.match(js, /fontSize \* 1\.22/);
  assert.match(js, /context\.globalAlpha = isDark \? 0\.34 : 0\.28/);
  assert.match(js, /const watermarkStages = document\.querySelectorAll\("\.cost-basis-stage"\)/);
  assert.match(css, /\.cost-basis-stage\.is-watermark-visible::after/);
  assert.match(css, /@keyframes chart-watermark-curtain/);
  assert.equal((js.match(/drawBrandWatermark\(context,/g) || []).length, 30);
  assert.doesNotMatch(js, /context\.fillText\("welinkBTC"/);
});

test("cycle indicators 25 and 26 use the full dashboard watermark scale", () => {
  const sth200dma = functionBody("const drawSth200dmaChart", "const showSth200dmaTooltip");
  const vddMedian = functionBody("const drawVddMedianCycleChart", "const showVddMedianTooltip");
  const fullScaleFont = /context\.font = `800 \$\{Math\.max\(30, Math\.min\(width \* 0\.085, height \* 0\.15, 86\)\)\}px Inter`/;

  assert.match(sth200dma, fullScaleFont);
  assert.match(vddMedian, fullScaleFont);
});

test("cycle indicator 27 centers its watermark across both chart panes", () => {
  const ssr = functionBody("const drawSsrChart", "const showSsrTooltip");

  assert.match(ssr, /drawBrandWatermark\(context, padding\.left \+ chartWidth \/ 2, padding\.top \+ availableHeight \/ 2\)/);
  assert.doesNotMatch(ssr, /drawBrandWatermark\(context, padding\.left \+ chartWidth \/ 2, padding\.top \+ priceHeight \/ 2\)/);
});
