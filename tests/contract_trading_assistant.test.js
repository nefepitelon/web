const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("contract trading assistant is grouped in More collaboration and opens an internal route", () => {
  const header = read("components/platform-header.tsx");
  const collaboration = header.match(/const collaborationLinks:[\s\S]*?const resourceLinks:/)?.[0] ?? "";
  assert.match(collaboration, /href: "\/contract-trading-assistant"/);
  assert.match(collaboration, /zh: "合约交易助手"/);
  assert.match(collaboration, /en: "Contract Trading Assistant"/);
  assert.match(read("app/contract-trading-assistant/page.tsx"), /ContractTradingAssistantSurface/);
});

test("assistant surface embeds the fixed tool in a sandbox without same-origin privileges", () => {
  const surface = read("components/contract-trading-assistant-surface.tsx");
  assert.match(surface, /src="\/contract-trading-assistant\/embed"/);
  assert.doesNotMatch(surface, /独立打开|target="_blank"|tcv2\.qianyubtc\.com/);
  assert.match(surface, /sandbox="[^"]*allow-scripts/);
  assert.doesNotMatch(surface.match(/sandbox="[^"]*"/)?.[0] ?? "", /allow-same-origin/);
});

test("static embed proxy is fixed to TcTool and rewrites its API origin", () => {
  const route = read("app/contract-trading-assistant/embed/[[...path]]/route.ts");
  assert.match(route, /UPSTREAM_ORIGIN = "https:\/\/tcv2\.qianyubtc\.com"/);
  assert.match(route, /EMBED_BASE = "\/contract-trading-assistant\/embed\/"/);
  assert.match(route, /INTERNAL_API_BASE = "\/contract-trading-assistant\/api"/);
  assert.match(route, /Access-Control-Allow-Origin/);
  assert.match(route, /__welinkContractStorage/);
  assert.match(route, /new Map\(\[\['theme','dark'\]\]\)/);
  assert.match(route, /PAGE_FRAGMENTS/);
  assert.match(route, /preloadPageFragments/);
  assert.match(route, /Promise\.all/);
  assert.match(route, /analysis: true, monitor: true, resonance: true/);
  assert.match(route, /!document\.getElementById\('priceSymbol'\)/);
});

test("assistant API proxy fixes the origin and rejects arbitrary proxy targets", () => {
  const route = read("app/contract-trading-assistant/api/[[...path]]/route.ts");
  assert.match(route, /API_ORIGIN = "https:\/\/api2\.qianyubtc\.com"/);
  assert.match(route, /Origin: TOOL_ORIGIN/);
  assert.match(route, /ALLOWED_PROXY_HOSTS/);
  assert.match(route, /parsed\.protocol === "https:"/);
  assert.match(route, /Unsupported upstream target/);
});

test("assistant frame fills the remaining viewport in light and dark shells", () => {
  const globals = read("app/globals.css");
  assert.match(globals, /\.contract-assistant-page \{[\s\S]*?height: calc\(100dvh - var\(--platform-shell-height\)\)/);
  assert.match(globals, /\.contract-assistant-frame \{[^}]*width: 100%; height: 100%/);
  assert.match(globals, /html\[data-theme="light"\] \.contract-assistant-ribbon/);
});
