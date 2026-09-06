const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("TopTrader strategy radar is grouped under More collaboration", () => {
  const header = read("components/platform-header.tsx");
  const collaboration = header.match(/const collaborationLinks:[\s\S]*?const resourceLinks:/)?.[0] ?? "";
  assert.match(collaboration, /href: "\/top-trader-radar"/);
  assert.match(collaboration, /zh: "TopTrader策略雷达"/);
  assert.match(collaboration, /en: "TopTrader Strategy Radar"/);
  assert.match(read("app/top-trader-radar/page.tsx"), /TopTraderRadarSurface/);
});

test("TopTrader radar surface opens the controlled in-site embed", () => {
  const surface = read("components/top-trader-radar-surface.tsx");
  assert.match(surface, /src="\/top-trader-radar\/embed\/"/);
  assert.match(surface, /referrerPolicy="no-referrer"/);
  assert.match(surface, /sandbox="[^"]*allow-scripts/);
  assert.doesNotMatch(surface.match(/sandbox="[^"]*"/)?.[0] ?? "", /allow-same-origin/);
  assert.doesNotMatch(surface, /target="_blank"/);
});

test("TopTrader embed defaults to dark and remembers an explicit theme switch", () => {
  const route = read("app/top-trader-radar/embed/[[...path]]/route.ts");
  const surface = read("components/top-trader-radar-surface.tsx");
  assert.match(route, /UPSTREAM_ORIGIN = "https:\/\/traderadar\.qianyuwing\.com"/);
  assert.match(route, /savedTheme === "light" \? "light" : "dark"/);
  assert.match(route, /\[\['TR_theme','\$\{theme\}'\]\]/);
  assert.match(route, /replaceAll\("localStorage", "window\.__welinkTraderRadarLocalStorage"\)/);
  assert.match(route, /String\(opts\.method \|\| 'GET'\)\.toUpperCase\(\) === 'GET'/);
  assert.match(route, /welinkbtc:top-trader-theme/);
  assert.match(surface, /event\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(surface, /welinkbtc_top_trader_theme/);
});

test("TopTrader proxy keeps public API and live data on the pinned upstream", () => {
  const route = read("app/top-trader-radar/embed/[[...path]]/route.ts");
  assert.match(route, /credentials:'omit'/);
  assert.match(route, /wss:\/\/traderadar\.qianyuwing\.com/);
  assert.match(route, /Access-Control-Allow-Origin/);
  assert.match(route, /redirect: "manual"/);
  assert.match(route, /attempt < 3/);
  assert.match(route, /lastResponse\.status < 500/);
  assert.match(route, /TopTrader radar resource unavailable/);
  assert.doesNotMatch(route, /request\.headers\.get\("cookie"\)|request\.headers\.get\("authorization"\)/);
});

test("TopTrader clean URLs resolve every embedded multi-page navigation target", () => {
  const route = read("app/top-trader-radar/embed/[[...path]]/route.ts");
  assert.match(route, /NON_PAGE_PREFIXES = new Set\(\["api", "assets", "ws"\]\)/);
  assert.match(route, /isExtensionlessPagePath\(pathname\) \? `\$\{pathname\}\.html` : pathname/);
  assert.match(route, /cleanPath=pathname=>pathname\.endsWith\('\.html'\)\?pathname\.slice\(0,-5\):pathname/);
  assert.match(route, /window\.__welinkTraderRadarPathname=upstreamPath\(embeddedPath\)/);
  assert.match(route, /replaceAll\("window\.location\.pathname", "window\.__welinkTraderRadarPathname"\)/);
  assert.match(route, /function toLocalHtmlTarget\(target: string\)/);
  assert.match(route, /target\.search\(\/\[\?#\]\//);
  assert.match(route, /toLocalHtmlTarget\(target\)/);
  assert.doesNotMatch(route, /new URL\(target, UPSTREAM_ORIGIN\)/);
});

test("TopTrader radar uses the full-height embedded tool layout", () => {
  const surface = read("components/top-trader-radar-surface.tsx");
  const styles = read("app/globals.css");
  assert.match(surface, /contract-assistant-page/);
  assert.match(surface, /contract-assistant-viewport/);
  assert.match(surface, /contract-assistant-frame/);
  assert.match(styles, /\.contract-assistant-frame\s*\{[\s\S]*?height:\s*100%/);
});
