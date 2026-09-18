import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard exposes the 27th SSR Bollinger model with Surf, export and fullscreen controls", () => {
  const html = read("dashboard.html");
  const js = read("dashboard.js");
  const css = read("dashboard.css");
  const route = read("app/api/[legacy]/route.ts");

  assert.match(html, /id="ssr-panel"/);
  assert.match(html, /id="ssr-chart"/);
  assert.match(html, /data-chart-tabs="ssr"/);
  assert.match(html, /data-surf-model="ssr"/);
  assert.match(html, /id="ssr-snapshot"/);
  assert.match(html, /id="ssr-download"/);
  assert.match(html, /id="ssr-fullscreen"/);
  assert.match(html, /INDEX \/ 34/);
  assert.match(html, /SSR 稳定币供应比例上下条形带/);

  assert.match(js, /\/api\/stablecoin-supply-ratio\?schema=1/);
  assert.match(js, /const drawSsrChart/);
  assert.match(js, /const applySsrPayload/);
  assert.match(js, /const downloadSsrCsv/);
  assert.match(js, /const toggleSsrFullscreen/);
  assert.match(js, /name: "BTC Stablecoin Supply Ratio \/ Bollinger Bands \(200, 2\)"/);

  assert.match(route, /"stablecoin-supply-ratio"/);
  assert.match(css, /\.ssr-stage/);
  assert.match(css, /\.legend-ssr-upper/);
  assert.match(css, /grid-row: 1 \/ span 34/);
});
