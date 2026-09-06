const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const route = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("dashboard exposes the twenty-fifth STH / 200DMA golden-cross model", () => {
  assert.match(html, /id="sth-200dma-panel"/);
  assert.match(html, /id="sth-200dma-chart"/);
  assert.match(html, /data-chart-tabs="sth-200dma"/);
  assert.match(html, /data-surf-model="sth-200dma"/);
  assert.match(html, /id="sth-200dma-snapshot"/);
  assert.match(html, /id="sth-200dma-download"/);
  assert.match(html, /id="sth-200dma-fullscreen"/);
});

test("STH / 200DMA model loads public data and supports complete chart interaction", () => {
  assert.match(js, /\/api\/sth-200dma\?schema=1/);
  assert.match(js, /const loadSth200dmaMetrics = async/);
  assert.match(js, /writeDashboardCache\(STH_200DMA_CACHE_KEY, payload/);
  assert.match(js, /drawSth200dmaChart/);
  assert.match(js, /saveSth200dmaSnapshot/);
  assert.match(js, /downloadSth200dmaCsv/);
  assert.match(js, /toggleSth200dmaFullscreen/);
  assert.match(js, /showSth200dmaTooltip/);
  assert.match(route, /"sth-200dma"/);
  assert.match(css, /\.sth-200dma-stage/);
  assert.match(css, /\.legend-sth-200dma-cross/);
  assert.match(css, /grid-row: 1 \/ span 30/);
});
