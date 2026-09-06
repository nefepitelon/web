const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the root runtime owns theme, language and both shared floating applications", () => {
  const layout = read("app/layout.tsx");
  const runtime = read("components/platform-runtime.tsx");
  const player = read("components/secret-garden-player.tsx");

  assert.match(layout, /<PlatformRuntime\s*\/>/);
  assert.match(layout, /<SecretGardenPlayer\s*\/>/);
  assert.match(layout, /src="\/legacy\/surf-assistant\.js"/);
  assert.match(runtime, /document\.documentElement\.dataset\.language/);
  assert.match(runtime, /welinkbtc:preferences/);
  assert.match(runtime, /welinkbtc:navigation/);
  assert.match(player, /setLanguage\(localStorage\.getItem\("welinkbtc-language"\)/);
  assert.match(player, /Secret Garden site music player/);
});

test("embedded legacy workspaces receive preferences without duplicating Xiaowei", () => {
  const legacyRoute = read("lib/legacy-route.ts");
  const surface = read("components/legacy-surface.tsx");

  assert.match(legacyRoute, /new Set\(\["surf-assistant\.css", "surf-assistant\.js"\]\)/);
  assert.match(legacyRoute, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(legacyRoute, /document\.documentElement\.dataset\.language = language/);
  assert.match(surface, /type: "welinkbtc:preferences"/);
});

test("bStock and Alpha Radar expose the cross-platform readability and language upgrades", () => {
  const html = read("bstock-alpha.html");
  const bstock = read("bstock-alpha.js");
  const translations = read("ui-translations.js");
  const radarCss = read("alpha-scanner.css");

  assert.match(html, /ui-translations\.js\?v=20260904-bstock-ui-v2/);
  assert.match(bstock, /profile: "bstock"/);
  assert.match(bstock, /uiTranslator\?\.setLanguage/);
  assert.match(translations, /bstock:\s*\[/);
  assert.match(radarCss, /cross-platform readability pass/);
  assert.match(radarCss, /font-size: max\(11px, \.62vw\)/);
});

test("heavy dashboards defer offscreen work and suspend hidden-page polling", () => {
  const dashboard = read("dashboard.js");
  const dashboardCss = read("dashboard.css");
  const alphaOps = read("script.js");
  const classicSurface = read("components/classic-grid-surface.tsx");

  assert.match(dashboard, /runLoaderPool\(analysisLoaders, 4\)/);
  assert.match(dashboard, /new IntersectionObserver/);
  assert.match(dashboard, /if \(analysisSyncInFlight \|\| document\.hidden\)/);
  assert.match(dashboardCss, /content-visibility:\s*auto/);
  assert.match(alphaOps, /if \(document\.hidden\) return/);
  assert.match(classicSurface, /if \(silent && document\.hidden\) return/);
});
