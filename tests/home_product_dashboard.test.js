const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "product-dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const legacyRoute = fs.readFileSync(path.join(root, "lib", "legacy-route.ts"), "utf8");

test("homepage product dashboard exposes all 30 on-chain trend snapshots", () => {
  const options = html.match(/data-model-option="[^"]+"/g) || [];
  assert.equal(options.length, 30);
  for (const indicator of [
    "cost-basis", "sth-ratio", "lth-loss", "rpl", "median-rp", "lth-sth", "lth-rp", "supply-pl", "median-mvrv",
    "mvrv-bands", "vdd", "lth-nupl", "mvrv-price-bands", "stock-to-flow", "cycle-timing", "rhodl", "lth-rpl", "slrv",
    "realized-cap-hodl", "lth-spent", "percent-profit", "lth-exchange-loss", "two-week-rsi", "under-3m-hodl", "sth-200dma", "vdd-median", "ssr", "sth-bands", "percent-profit-ex-10y", "sth-mvrv"
  ]) {
    assert.match(html, new RegExp(`data-model-option="${indicator}"`));
    assert.match(js, new RegExp(`"?${indicator}"?:?\\s*\\{`));
  }
  assert.match(html, /class="power-copy-orbit"><strong>30<\/strong>/);
  assert.match(html, /product-dashboard\.js/);
  assert.match(legacyRoute, /"product-dashboard\.js"/);
});

test("homepage product actions keep Glow and remove legacy utility buttons", () => {
  assert.match(html, /id="power-glow"/);
  assert.doesNotMatch(html, /id="power-project"/);
  assert.doesNotMatch(html, /id="power-summary"/);
  assert.doesNotMatch(html, /id="power-download"/);
  assert.match(js, /context\.shadowBlur = line\.axis === "price" \? 10 : 22/);
  assert.match(css, /\.power-law-section\.is-glowing/);
});

test("homepage uses a restrained responsive type scale", () => {
  assert.match(css, /\.hero h1 \{[\s\S]*font-size: clamp\(48px, 6vw, 94px\)/);
  assert.match(css, /\.ticker-strip strong \{[\s\S]*font-size: clamp\(22px, 2\.35vw, 34px\)/);
  assert.match(css, /\.feature-card \{[\s\S]*min-height: 276px/);
});

test("homepage product dashboard provides an interactive 3D orbit view", () => {
  assert.match(html, /data-view="2d"/);
  assert.match(html, /data-view="3d"/);
  assert.match(html, /id="power-orbit-controls"/);
  assert.match(html, /id="power-orbit-reset"/);
  assert.match(js, /const project3d =/);
  assert.match(js, /camera\.yaw/);
  assert.match(js, /camera\.pitch/);
  assert.match(js, /camera\.zoom/);
  assert.match(js, /addEventListener\("wheel"/);
  assert.match(js, /pointerGesture\?\.type === "pinch"/);
  assert.match(js, /event\.shiftKey \|\| event\.button === 1 \|\| event\.button === 2/);
  assert.match(css, /\.power-law-section\.is-3d #power-law-canvas/);
  assert.match(css, /touch-action: none/);
});

test("homepage product summary integrates a compact on-chain positioning module", () => {
  assert.match(html, /data-i18n="power\.eyebrow">链上数据指标</);
  assert.match(html, /用周期估值、链上行为、矿工压力、衍生品与资金流回答一个问题：比特币现在处于什么位置。/);
  assert.match(html, /class="power-copy-visual"/);
  assert.match(html, /class="power-copy-orbit"/);
  assert.match(html, /class="power-copy-topics"/);
  for (const topic of ["Cycle", "Behavior", "Miners", "Derivatives", "Flows"]) {
    assert.match(html, new RegExp(`data-i18n="power\\.topic${topic}"`));
  }
  assert.match(css, /grid-template-columns: minmax\(190px, 0\.34fr\) minmax\(0, 1\.66fr\)/);
  assert.match(css, /font-size: clamp\(34px, 3\.15vw, 58px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(html, /在首页直接查看链上看板的九项趋势快照/);
});

test("homepage time ranges match every on-chain dashboard trend range", () => {
  for (const [value, label] of [["7", "7D"], ["30", "30D"], ["90", "90D"], ["365", "1Y"], ["all", "ALL"]]) {
    assert.match(html, new RegExp(`data-range="${value}"[^>]*>${label}<`));
  }
  assert.doesNotMatch(html, /data-range="10">10Y/);
  assert.match(js, /Math\.max\(days - 1, 1\) \* DAY_MS/);
});

test("homepage snapshots reuse the dashboard data APIs and render latest metric cards", () => {
  for (const endpoint of [
    "/api/cost-basis",
    "/api/lth-market-cap-loss?schema=6",
    "/api/realized-profit-loss",
    "/api/median-realized-price",
    "/api/lth-sth-ratio?schema=2",
    "/api/supply-profit-loss-ratio?schema=1",
    "/api/mvrv-bands",
    "/api/vdd-multiple?schema=1",
    "/api/lth-nupl?schema=1",
    "/api/stock-to-flow",
    "/api/cycle-timing",
    "/api/rhodl-ratio?schema=1",
    "/api/lth-realized-profit-loss?schema=1",
    "/api/slrv-ratio?schema=1",
    "/api/realized-cap-hodl-waves?schema=1",
    "/api/lth-spent-price?schema=1",
    "/api/percent-supply-profit?schema=1",
    "/api/lth-exchange-loss?schema=1",
    "/api/two-week-rsi?schema=1",
    "/api/under-3m-realized-cap-hodl-waves?schema=1",
    "/api/sth-200dma?schema=1",
    "/api/vdd-median-cycle?schema=1",
    "/api/stablecoin-supply-ratio?schema=1",
    "/api/sth-cost-basis-bands?schema=1",
    "/api/percent-supply-profit-ex-10y?schema=1",
    "/api/sth-mvrv?schema=1"
  ]) {
    assert.ok(js.includes(endpoint), `missing endpoint ${endpoint}`);
  }
  assert.match(html, /id="power-metrics-list"/);
  assert.match(js, /config\.metrics\(state\.data\)/);
  assert.match(js, /快照日期/);
  assert.match(js, /loadPayload\(config\.endpoint\)/);
  assert.match(js, /thresholdsFor\(config\)/);
});
