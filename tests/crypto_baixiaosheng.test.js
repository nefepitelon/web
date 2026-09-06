const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Crypto Baixiaosheng is grouped under More collaboration", () => {
  const header = read("components/platform-header.tsx");
  const collaboration = header.match(/const collaborationLinks:[\s\S]*?const resourceLinks:/)?.[0] ?? "";
  assert.match(collaboration, /href: "\/crypto-baixiaosheng"/);
  assert.match(collaboration, /zh: "币圈百晓生"/);
  assert.match(collaboration, /en: "Crypto Baixiaosheng"/);
  assert.match(read("app/crypto-baixiaosheng/page.tsx"), /CryptoBaixiaoshengSurface/);
});

test("Crypto Baixiaosheng opens the fixed upstream inside the site", () => {
  const surface = read("components/crypto-baixiaosheng-surface.tsx");
  assert.match(surface, /CRYPTO_BAIXIAOSHENG_URL = "https:\/\/info\.qianyuwing\.com\/"/);
  assert.match(surface, /src=\{CRYPTO_BAIXIAOSHENG_URL\}/);
  assert.match(surface, /referrerPolicy="no-referrer"/);
  assert.match(surface, /sandbox="[^"]*allow-same-origin[^"]*allow-scripts/);
  assert.match(surface, /allow-top-navigation-by-user-activation/);
  assert.doesNotMatch(surface, /target="_blank"/);
});

test("Crypto Baixiaosheng uses the full-height embedded tool layout", () => {
  const surface = read("components/crypto-baixiaosheng-surface.tsx");
  const styles = read("app/globals.css");
  assert.match(surface, /contract-assistant-page/);
  assert.match(surface, /contract-assistant-viewport/);
  assert.match(surface, /contract-assistant-frame/);
  assert.match(styles, /\.contract-assistant-frame\s*\{[\s\S]*?height:\s*100%/);
});
