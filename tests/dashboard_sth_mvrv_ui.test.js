import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard exposes the 30th STH-MVRV model with full controls", () => {
  const html = read("dashboard.html");
  const js = read("dashboard.js");
  const css = read("dashboard.css");
  const route = read("app/api/[legacy]/route.ts");

  assert.match(html, /id="sth-mvrv-panel"/);
  assert.match(html, /id="sth-mvrv-chart"/);
  assert.match(html, /data-chart-tabs="sth-mvrv"/);
  assert.match(html, /data-surf-model="sth-mvrv"/);
  assert.match(html, /id="sth-mvrv-snapshot"/);
  assert.match(html, /id="sth-mvrv-download"/);
  assert.match(html, /id="sth-mvrv-fullscreen"/);
  assert.match(html, /INDEX \/ 32/);
  assert.match(html, /短期持有者 MVRV/);

  assert.match(js, /\/api\/sth-mvrv\?schema=1/);
  assert.match(js, /const drawSthMvrvChart/);
  assert.match(js, /const applySthMvrvPayload/);
  assert.match(js, /const downloadSthMvrvCsv/);
  assert.match(js, /const toggleSthMvrvFullscreen/);
  assert.match(js, /name: "BTC Short Term Holder MVRV"/);
  assert.match(js, /drawBrandWatermark\(context, padding\.left \+ chartWidth \/ 2, padding\.top \+ availableHeight \/ 2\)/);

  assert.match(route, /"sth-mvrv"/);
  assert.match(css, /\.sth-mvrv-stage/);
  assert.match(css, /\.legend-sth-mvrv-breakeven/);
  assert.match(css, /grid-row: 1 \/ span 32/);
});

test("homepage exposes the 30th STH-MVRV snapshot", () => {
  const html = read("index.html");
  const js = read("product-dashboard.js");
  assert.match(html, /data-model-option="sth-mvrv"/);
  assert.match(js, /"sth-mvrv": \{/);
  assert.match(js, /\/api\/sth-mvrv\?schema=1/);
});
