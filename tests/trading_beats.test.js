const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("TradingBeats is grouped under More collaboration", () => {
  const header = read("components/platform-header.tsx");
  const collaboration = header.match(/const collaborationLinks:[\s\S]*?const resourceLinks:/)?.[0] ?? "";
  assert.match(collaboration, /href: "\/trading-beats"/);
  assert.match(collaboration, /zh: "TradingBeats交易阻击台"/);
  assert.match(collaboration, /en: "TradingBeats Strike Desk"/);
  assert.match(read("app/trading-beats/page.tsx"), /TradingBeatsSurface/);
});

test("TradingBeats opens the fixed upstream inside the site", () => {
  const surface = read("components/trading-beats-surface.tsx");
  assert.match(surface, /TRADING_BEATS_URL = "https:\/\/www\.tradingbeats\.xyz\/"/);
  assert.match(surface, /src=\{TRADING_BEATS_URL\}/);
  assert.match(surface, /referrerPolicy="no-referrer"/);
  assert.match(surface, /sandbox="[^"]*allow-same-origin[^"]*allow-scripts/);
  assert.match(surface, /allow-popups-to-escape-sandbox/);
  assert.match(surface, /allow-top-navigation-by-user-activation/);
  assert.doesNotMatch(surface, /target="_blank"/);
});

test("TradingBeats uses the full-height embedded tool layout", () => {
  const surface = read("components/trading-beats-surface.tsx");
  const styles = read("app/globals.css");
  assert.match(surface, /contract-assistant-page/);
  assert.match(surface, /contract-assistant-viewport/);
  assert.match(surface, /contract-assistant-frame/);
  assert.match(styles, /\.contract-assistant-frame\s*\{[\s\S]*?height:\s*100%/);
});
