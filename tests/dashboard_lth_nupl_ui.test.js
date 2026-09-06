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

test("dashboard exposes the twelfth Entity-Adjusted LTH-NUPL indicator", () => {
  assert.match(html, /id="lth-nupl-panel"/);
  assert.match(html, /id="lth-nupl-chart"/);
  assert.match(html, /data-chart-tabs="lth-nupl"/);
  assert.match(html, /data-surf-model="lth-nupl"/);
  assert.match(html, /id="lth-nupl-snapshot"/);
  assert.match(html, /id="lth-nupl-download"/);
  assert.match(html, /id="lth-nupl-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("LTH-NUPL appears after VDD and before halving", () => {
  const eleventhIndex = html.indexOf('id="vdd-panel"');
  const twelfthIndex = html.indexOf('id="lth-nupl-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');
  assert.ok(eleventhIndex < twelfthIndex);
  assert.ok(twelfthIndex < halvingIndex);
});

test("LTH-NUPL uses a dedicated public endpoint and complete controls", () => {
  assert.match(route, /"lth-nupl": \(\) => import\("@\/api\/lth-nupl\.js"\)/);
  assert.match(js, /\/api\/lth-nupl\?schema=1/);
  assert.match(js, /drawLthNuplChart/);
  assert.match(js, /saveLthNuplSnapshot/);
  assert.match(js, /downloadLthNuplCsv/);
  assert.match(js, /toggleLthNuplFullscreen/);
  assert.match(js, /public_utxo_age_proxy/);
  assert.match(css, /\.lth-nupl-stage/);
  assert.match(css, /\.lth-nupl-phase-levels/);
  assert.match(css, /\.lth-nupl-research-pattern/);
});

test("LTH-NUPL API classifies phases and detects contiguous stress zones", async () => {
  const module = await import(pathToFileURL(path.join(root, "api", "lth-nupl.js")).href);
  assert.equal(module.classifyLthNupl(-0.1), "capitulation");
  assert.equal(module.classifyLthNupl(0.1), "fear");
  assert.equal(module.classifyLthNupl(0.3), "hope");
  assert.equal(module.classifyLthNupl(0.6), "optimism");
  assert.equal(module.classifyLthNupl(0.8), "euphoria");

  const rows = [-0.1, 0.1, 0.2, 0.3, 0.2, 0.1, 0.05].map((nupl, index) => ({
    date: `2026-01-0${index + 1}`,
    price: 100 + index,
    nupl
  }));
  const zones = module.detectStressZones(rows);
  assert.equal(zones.length, 2);
  assert.equal(zones[0].days, 3);
  assert.equal(zones[1].active, true);
  const snapshot = module.calculateLthNuplSnapshot(rows);
  assert.equal(snapshot.zone, "fear");
  assert.equal(snapshot.currentStressDays, 3);
});

test("public proxy methodology is disclosed instead of presented as paid entity clustering", () => {
  assert.match(html, /公开实时序列采用 BGeometrics 的 UTXO 币龄 LTH-NUPL/);
  assert.match(html, /严格的实体聚类调整口径由 Glassnode 付费接口提供/);
  assert.match(js, /Public Proxy/);
});
