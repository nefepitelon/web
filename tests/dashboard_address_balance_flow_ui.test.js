const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const js = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const css = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const legacyRoute = fs.readFileSync(path.join(root, "app", "api", "[legacy]", "route.ts"), "utf8");

test("address cohort flow sits between market overview and the 2D/3D indicator loop", () => {
  const kpi = html.indexOf('<section class="kpi-grid"');
  const addressFlow = html.indexOf('<section class="address-flow-panel" id="address-balance-flow"');
  const carousel = html.indexOf('<section class="dashboard-carousel-mount" id="onchain-carousel"');
  const workspace = html.indexOf('<div class="dashboard-workspace"');
  assert.ok(kpi > -1 && kpi < addressFlow);
  assert.ok(addressFlow < carousel && carousel < workspace);
  assert.match(html, /data-section-link="address-balance-flow"[^>]*data-i18n="section\.addressFlow"/);
  assert.match(js, /#overview, #address-balance-flow, #market-heatmap, #onchain-carousel, #cycle-pulse, #valuation/);
});

test("chart surface provides four cohorts, date controls, accessible data and no raw export", () => {
  const panel = html.slice(
    html.indexOf('<section class="address-flow-panel"'),
    html.indexOf('<section class="dashboard-carousel-mount"')
  );
  assert.equal((panel.match(/data-address-flow-bucket=/g) || []).length, 4);
  assert.match(panel, /data-address-flow-range="7"/);
  assert.match(panel, /data-address-flow-range="14"/);
  assert.match(panel, /data-address-flow-range="18"/);
  assert.match(panel, /data-address-flow-range="30"/);
  assert.match(panel, /BTC持仓地址层级资金脉冲/);
  assert.match(panel, /id="address-flow-chart"[\s\S]*?role="img"[\s\S]*?tabindex="0"/);
  assert.match(panel, /id="address-flow-tooltip"[^>]*aria-live="polite"/);
  assert.match(panel, /id="address-flow-table-body"/);
  assert.match(panel, /<th data-i18n="addressFlow\.under1">0\.001–1 BTC<\/th>/);
  assert.equal((panel.match(/data-i18n-aria="addressFlow\./g) || []).length, 4);
  assert.match(panel, /Bitview · Bitcoin Research Kit/);
  assert.match(panel, /地址数不等于独立投资者或资金净流入/);
  assert.doesNotMatch(panel, /download|export|csv/i);
});

test("dashboard draws a colorful symmetric-log chart with a readable animated site seal", () => {
  assert.match(js, /const ADDRESS_FLOW_PALETTE = \[/);
  assert.match(js, /const addressFlowSymlog =/);
  assert.match(js, /SYMLOG · DAILY Δ ADDRESSES/);
  assert.match(html, /class="address-flow-brand-seal" aria-hidden="true"/);
  assert.match(html, /class="address-flow-brand-disc"[\s\S]*?<img src="\/welinkbtc-orbit-brand\.webp"/);
  assert.equal((html.match(/>ai\.WELINKBTC\.xyz<\/textPath>/g) || []).length, 2);
  assert.match(html, /id="address-flow-brand-copy-top"/);
  assert.match(html, /id="address-flow-brand-copy-bottom"/);
  assert.match(css, /\.address-flow-brand-seal\s*\{[\s\S]*?pointer-events: none/);
  assert.match(css, /\.address-flow-brand-disc\s*\{[\s\S]*?opacity: 0\.72/);
  assert.match(css, /\.address-flow-brand-disc img\s*\{[\s\S]*?inset: -14%[\s\S]*?width: 128%[\s\S]*?height: 128%/);
  assert.match(css, /animation: address-flow-brand-orbit-outer 6\.8s linear infinite/);
  assert.match(css, /animation: address-flow-brand-orbit-inner 4\.6s linear infinite reverse/);
  assert.match(css, /@keyframes address-flow-brand-disc-tilt/);
  assert.match(js, /context\.shadowColor = color/);
});

test("live Bitview route is cached, loaded with the dashboard and responds to themes and resize", () => {
  assert.match(legacyRoute, /"address-balance-flow": \(\) => import\("@\/api\/address-balance-flow\.js"\)/);
  assert.match(js, /fetchJsonWithRetry\(`\$\{API_BASE\}\/api\/address-balance-flow\?days=30`/);
  assert.match(js, /loadAddressBalanceFlowMetrics\(\),/);
  assert.match(js, /const drawAllCharts = \(\) => \{\s*drawAddressBalanceFlowChart\(\)/);
  assert.match(js, /window\.setTimeout\(drawAllCharts, 120\)/);
  assert.match(js, /document\.querySelectorAll\("\[data-address-flow-range\]"\)/);
  assert.match(js, /button\.setAttribute\("aria-pressed", String\(selected\)\)/);
  assert.match(js, /ADDRESS_FLOW_CACHE_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000/);
});

test("browser fallback accepts a recent snapshot and rejects one older than 24 hours", () => {
  const start = js.indexOf("const readAddressFlowCache =");
  const end = js.indexOf("const finiteAddressFlowNumber =", start);
  assert.ok(start > -1 && end > start);
  const functionSource = js.slice(start, end);
  const now = Date.parse("2026-11-08T08:00:00Z");
  const read = (savedAt) => {
    const context = {
      Date: { now: () => now },
      localStorage: {
        getItem: () => JSON.stringify({ savedAt, payload: { marker: "snapshot" } })
      },
      result: null
    };
    vm.runInNewContext([
      'const ADDRESS_FLOW_CACHE_KEY = "welinkbtc-address-balance-flow-v1";',
      "const ADDRESS_FLOW_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;",
      functionSource,
      "result = readAddressFlowCache();"
    ].join("\n"), context);
    return context.result;
  };
  assert.equal(read(now - 60 * 60 * 1000)?.marker, "snapshot");
  assert.equal(read(now - 24 * 60 * 60 * 1000 - 1), null);
});

test("address cohort panel has desktop, tablet, mobile and reduced-motion presentation", () => {
  assert.match(css, /\.address-flow-panel\s*\{/);
  assert.match(css, /\.address-flow-summary\s*\{[\s\S]*?grid-template-columns: repeat\(4/);
  assert.match(css, /#address-flow-chart\s*\{[\s\S]*?height: 480px/);
  assert.match(css, /#address-flow-chart\s*\{[\s\S]*?touch-action: pan-x pan-y/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.address-flow-summary \{ grid-template-columns: repeat\(2/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?#address-flow-chart \{ min-width: 720px; height: 390px/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.address-flow-brand-seal\s*\{[\s\S]*?min-width: 716px[\s\S]*?height: 390px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.address-flow-brand-orbit \{ animation: none/);
});
