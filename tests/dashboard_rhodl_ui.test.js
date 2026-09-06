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

test("dashboard exposes the sixteenth Realized HODL Ratio indicator", () => {
  assert.match(html, /id="rhodl-panel"/);
  assert.match(html, /id="rhodl-chart"/);
  assert.match(html, /data-chart-tabs="rhodl"/);
  assert.match(html, /data-surf-model="rhodl"/);
  assert.match(html, /id="rhodl-snapshot"/);
  assert.match(html, /id="rhodl-download"/);
  assert.match(html, /id="rhodl-fullscreen"/);
  assert.match(html, /class="cost-basis-analysis-disclosure" open/);
});

test("RHODL appears after cycle timing and before halving progress", () => {
  const cycleIndex = html.indexOf('id="cycle-timing-panel"');
  const rhodlIndex = html.indexOf('id="rhodl-panel"');
  const halvingIndex = html.indexOf('class="chart-panel halving-section"');
  assert.ok(cycleIndex >= 0 && rhodlIndex > cycleIndex && halvingIndex > rhodlIndex);
});

test("RHODL uses the public endpoint and complete chart controls", () => {
  assert.match(route, /"rhodl-ratio": \(\) => import\("@\/api\/rhodl-ratio\.js"\)/);
  assert.match(js, /\/api\/rhodl-ratio/);
  assert.match(js, /loadRhodlMetrics/);
  assert.match(js, /drawRhodlChart/);
  assert.match(js, /saveRhodlSnapshot/);
  assert.match(js, /downloadRhodlCsv/);
  assert.match(js, /toggleRhodlFullscreen/);
  assert.match(js, /drawBrandWatermark\(context,/);
  assert.match(css, /\.rhodl-stage/);
  assert.match(css, /\.rhodl-zone-levels/);
});

test("RHODL API parses public CSV and calculates transparent zones and averages", async () => {
  const api = await import(pathToFileURL(path.join(root, "api", "rhodl-ratio.js")).href);
  const parsed = api.parseRhodlCsv([
    "d,unixTs,rhodlRatio,rhodl1m",
    "2026-01-01,1767225600,700,650",
    "2026-01-02,1767312000,800,670"
  ].join("\n"));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1].rhodl, 800);
  assert.equal(parsed[1].rhodl1m, 670);

  assert.equal(api.classifyRhodl(200), "accumulation");
  assert.equal(api.classifyRhodl(838), "normal");
  assert.equal(api.classifyRhodl(15_000), "elevated");
  assert.equal(api.classifyRhodl(60_000), "overheated");

  const rows = Array.from({ length: 30 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    price: 70_000 + index,
    rhodl: 700 + index * 10,
    rhodl1m: 745
  }));
  const snapshot = api.calculateRhodlSnapshot(rows, { value: 78_000, asOf: "2026-01-31T00:00:00Z" });
  assert.equal(snapshot.price, 78_000);
  assert.equal(snapshot.rhodl, 990);
  assert.equal(snapshot.zone, "normal");
  assert.equal(snapshot.trend, "rising");
  assert.equal(Math.round(snapshot.average7), 960);
  assert.equal(Math.round(snapshot.average30), 845);
});
