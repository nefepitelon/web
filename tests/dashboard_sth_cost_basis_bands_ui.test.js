import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard exposes the 28th STH four-year nine-band model with complete controls", () => {
  const html = read("dashboard.html");
  const js = read("dashboard.js");
  const css = read("dashboard.css");
  const route = read("app/api/[legacy]/route.ts");

  assert.match(html, /id="sth-bands-panel"/);
  assert.match(html, /id="sth-bands-chart"/);
  assert.match(html, /data-chart-tabs="sth-bands"/);
  assert.match(html, /data-surf-model="sth-bands"/);
  assert.match(html, /id="sth-bands-snapshot"/);
  assert.match(html, /id="sth-bands-download"/);
  assert.match(html, /id="sth-bands-fullscreen"/);
  assert.match(html, /INDEX \/ 32/);
  assert.match(html, /短期持有成本基础模型 \[4年，2011年至今\] 九彩条形带/);

  assert.match(js, /\/api\/sth-cost-basis-bands\?schema=1/);
  assert.match(js, /const drawSthBandsChart/);
  assert.match(js, /const applySthBandsPayload/);
  assert.match(js, /const downloadSthBandsCsv/);
  assert.match(js, /const toggleSthBandsFullscreen/);
  assert.match(js, /name: "BTC Short-Term Holder Cost Basis Model \[4Y, 2011-\] · Nine Bands"/);
  assert.match(js, /drawBrandWatermark\(context, padding\.left \+ chartWidth \/ 2, padding\.top \+ chartHeight \/ 2\)/);

  assert.match(route, /"sth-cost-basis-bands"/);
  assert.match(css, /\.sth-bands-stage/);
  assert.match(css, /\.legend-sth-bands-line7/);
  assert.match(css, /grid-row: 1 \/ span 32/);
});

test("homepage exposes the 28th model snapshot", () => {
  const html = read("index.html");
  const js = read("product-dashboard.js");
  assert.match(html, /data-model-option="sth-bands"/);
  assert.match(js, /"sth-bands": \{/);
  assert.match(js, /\/api\/sth-cost-basis-bands\?schema=1/);
});
