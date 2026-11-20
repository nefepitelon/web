const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const client = fs.readFileSync(path.join(root, "alpha-scanner.js"), "utf8");
const css = fs.readFileSync(path.join(root, "alpha-scanner.css"), "utf8");
const expectedSymbols = ["BTC", "ETH", "BNB", "SOL", "DOGE", "ZEC", "TAO", "ENA", "ONDO", "UNI", "XRP", "SUI", "HYPE"];

class AvatarElement {
  constructor(tagName = "span") {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.classes = new Set();
    this.classList = { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) };
  }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  setAttribute(name, value) { this.attributes[name] = value; }
  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentElement = null; });
    this.children = [];
    children.forEach((child) => this.append(child));
  }
  append(child) { child.parentElement = this; this.children.push(child); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  remove() {
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
}

function avatarHarness() {
  const context = { document: { createElement: (tagName) => new AvatarElement(tagName) }, avatarClass: () => "" };
  vm.createContext(context);
  vm.runInContext(client.slice(client.indexOf("const featuredMarketMeta ="), client.indexOf("const marketPriceDecimals =")), context);
  vm.runInContext(client.slice(client.indexOf("function updateTokenAvatar("), client.indexOf("function biasLabel(")), context);
  return { update: context.updateTokenAvatar, avatar: new AvatarElement() };
}

test("all 13 featured asset logos are local, valid 96px WebP files matching recorded provenance", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/alpha-radar-token-icons.json"), "utf8"));
  assert.deepEqual(manifest.assets.map((asset) => asset.symbol), expectedSymbols);
  let totalBytes = 0;
  for (const asset of manifest.assets) {
    assert.equal(asset.file, `/token-icons/${asset.symbol.toLowerCase()}.webp`);
    assert.equal(new URL(asset.source).hostname, "coin-images.coingecko.com");
    const buffer = fs.readFileSync(path.join(root, "public", asset.file));
    const metadata = await sharp(buffer).metadata();
    assert.equal(metadata.format, "webp", asset.symbol);
    assert.equal(metadata.width, 96, asset.symbol);
    assert.equal(metadata.height, 96, asset.symbol);
    assert.equal(crypto.createHash("sha256").update(buffer).digest("hex"), asset.sha256);
    assert.ok(buffer.length < 8192, asset.symbol);
    totalBytes += buffer.length;
  }
  assert.ok(totalBytes < 60000);
});

test("featured avatars use decorative same-origin logos and retain fallback until image loading completes", () => {
  const { update, avatar } = avatarHarness();
  update(avatar, "btc");
  const [fallback, image] = avatar.children;
  assert.equal(avatar.attributes["aria-hidden"], "true");
  assert.equal(fallback.textContent, "B");
  assert.equal(image.src, "/token-icons/btc.webp?v=20261118");
  assert.equal(image.alt, "");
  assert.equal(image.width, 32);
  assert.equal(image.height, 32);
  assert.equal(image.decoding, "async");
  assert.equal(avatar.classes.has("has-token-icon"), false);
  image.listeners.load();
  assert.equal(avatar.classes.has("has-token-icon"), true);
  image.listeners.error();
  assert.deepEqual(avatar.children, [fallback]);
  assert.equal(avatar.classes.has("has-token-icon"), false);
});

test("unknown and hostile feed symbols cannot request a remote or unlisted logo", () => {
  const { update, avatar } = avatarHarness();
  for (const symbol of ["UNKNOWN", "https://evil.example/a.svg", "<img src=x>", "__proto__", "constructor", ""]) {
    update(avatar, symbol);
    assert.equal(avatar.children.length, 1);
    assert.equal(avatar.children[0].tagName, "span");
    assert.equal(avatar.children[0].textContent, String(symbol).toUpperCase()[0] || "?");
  }
});

test("a late image callback cannot overwrite the next selected token's fallback state", () => {
  const { update, avatar } = avatarHarness();
  update(avatar, "BTC");
  const oldImage = avatar.children[1];
  update(avatar, "ETH");
  const newImage = avatar.children[1];
  oldImage.listeners.load();
  assert.equal(avatar.classes.has("has-token-icon"), false);
  newImage.listeners.load();
  oldImage.listeners.error();
  assert.equal(avatar.classes.has("has-token-icon"), true);
  assert.equal(avatar.children[1], newImage);
});

test("ranking rows and the shared detail drawer initialize token logos with contained stable sizing", () => {
  assert.match(client, /data-token-avatar="\$\{escapeHtml\(token\.symbol\)\}"/);
  assert.match(client, /rowsRoot\.querySelectorAll\("\[data-token-avatar\]"\)\.forEach\(\(element\) => updateTokenAvatar/);
  assert.match(client, /updateTokenAvatar\(avatar, token\.symbol\)/);
  assert.match(css, /\.token-avatar \{[^}]*flex-shrink: 0;[^}]*overflow: hidden;/);
  assert.match(css, /\.token-avatar-image \{[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: contain;/);
  assert.match(css, /\.token-avatar\.has-token-icon \.token-avatar-fallback \{ visibility: hidden; \}/);
});
