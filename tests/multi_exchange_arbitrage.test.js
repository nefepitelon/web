const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("multi-exchange arbitrage assistant is grouped under More collaboration", () => {
  const header = read("components/platform-header.tsx");
  const collaboration = header.match(/const collaborationLinks:[\s\S]*?const resourceLinks:/)?.[0] ?? "";
  assert.match(collaboration, /href: "\/multi-exchange-arbitrage"/);
  assert.match(collaboration, /zh: "多交易所套利助手"/);
  assert.match(collaboration, /en: "Multi-Exchange Arbitrage"/);
  assert.match(read("app/multi-exchange-arbitrage/page.tsx"), /MultiExchangeArbitrageSurface/);
});

test("arbitrage surface opens the proxied PerpDEXList route in a secure sandbox", () => {
  const surface = read("components/multi-exchange-arbitrage-surface.tsx");
  assert.match(surface, /src="\/arbitrage"/);
  assert.match(surface, /sandbox="[^"]*allow-scripts/);
  assert.doesNotMatch(surface.match(/sandbox="[^"]*"/)?.[0] ?? "", /allow-same-origin/);
  assert.doesNotMatch(surface, /target="_blank"|perpdexlist\.com/);
});

test("arbitrage proxy is pinned to PerpDEXList and rewrites assets and live requests", () => {
  const route = read("app/arbitrage/[[...path]]/route.ts");
  assert.match(route, /UPSTREAM_ORIGIN = "https:\/\/perpdexlist\.com"/);
  assert.match(route, /LOCAL_BASE = "\/arbitrage"/);
  assert.match(route, /STATIC_ROOTS/);
  assert.match(route, /path\[0\] === "__upstream"/);
  assert.match(route, /window\.fetch/);
  assert.match(route, /window\.EventSource/);
  assert.match(route, /__welinkArbitrageLocalStorage/);
  assert.match(route, /__welinkArbitrageSessionStorage/);
  assert.match(route, /Object\.defineProperty\(window,'localStorage'/);
  assert.match(route, /Object\.defineProperty\(window,'sessionStorage'/);
  assert.match(route, /function rewriteJavascript/);
  assert.match(route, /__upstream\/logos/);
  assert.match(route, /__upstream\/promo/);
  assert.doesNotMatch(route, /MutationObserver/);
  assert.match(route, /credentials:'omit'/);
  assert.match(route, /sendBeacon/);
  assert.doesNotMatch(route, /replaceAll\("localStorage"/);
  assert.doesNotMatch(route, /replaceAll\("sessionStorage"/);
  assert.doesNotMatch(route, /\?embed=/);
  assert.match(route, /url\.origin===window\.location\.origin&&url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(route, /Access-Control-Allow-Origin/);
  assert.match(route, /redirect: "manual"/);
  assert.doesNotMatch(route, /request\.headers\.get\("cookie"\)/);
});
