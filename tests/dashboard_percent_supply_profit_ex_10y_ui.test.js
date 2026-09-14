import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard exposes the 29th active profit-supply model with full controls", () => {
  const html = read("dashboard.html");
  const js = read("dashboard.js");
  const css = read("dashboard.css");
  const route = read("app/api/[legacy]/route.ts");

  assert.match(html, /id="percent-profit-ex-10y-panel"/);
  assert.match(html, /id="percent-profit-ex-10y-chart"/);
  assert.match(html, /data-chart-tabs="percent-profit-ex-10y"/);
  assert.match(html, /data-surf-model="percent-profit-ex-10y"/);
  assert.match(html, /id="percent-profit-ex-10y-snapshot"/);
  assert.match(html, /id="percent-profit-ex-10y-download"/);
  assert.match(html, /id="percent-profit-ex-10y-fullscreen"/);
  assert.match(html, /INDEX \/ 32/);
  assert.match(html, /剔除十年以上沉睡筹码后的比特币链上浮盈比例/);

  assert.match(js, /\/api\/percent-supply-profit-ex-10y\?schema=1/);
  assert.match(js, /const drawPercentProfitEx10yChart/);
  assert.match(js, /const applyPercentProfitEx10yPayload/);
  assert.match(js, /const downloadPercentProfitEx10yCsv/);
  assert.match(js, /const togglePercentProfitEx10yFullscreen/);
  assert.match(js, /name: "BTC Percent Supply in Profit \[Ex >10y, 7DMA\]"/);
  assert.match(js, /drawBrandWatermark\(context, padding\.left \+ chartWidth \/ 2, padding\.top \+ availableHeight \/ 2\)/);

  assert.match(route, /"percent-supply-profit-ex-10y"/);
  assert.match(css, /\.percent-profit-ex-10y-stage/);
  assert.match(css, /\.legend-percent-profit-ex-10y-modern/);
  assert.match(css, /grid-row: 1 \/ span 32/);
});

test("homepage exposes the 29th model snapshot", () => {
  const html = read("index.html");
  const js = read("product-dashboard.js");
  assert.match(html, /data-model-option="percent-profit-ex-10y"/);
  assert.match(js, /"percent-profit-ex-10y": \{/);
  assert.match(js, /\/api\/percent-supply-profit-ex-10y\?schema=1/);
});
