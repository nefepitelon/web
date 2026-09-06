const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("cheerio");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const $ = load(html);

test("homepage trend introduction appears exactly once before its toolbar and chart", () => {
  const section = $("#power-law");
  const children = section.children();
  assert.equal(section.find(".power-law-copy").length, 1);
  assert.ok(children.eq(0).hasClass("power-law-copy"));
  assert.ok(children.eq(1).hasClass("power-law-toolbar"));
  assert.ok(children.eq(2).hasClass("power-law-stage"));
  assert.equal(section.find(".power-copy-topics span").length, 5);
});

test("homepage summary uses a smaller scoped scale without changing the dashboard", () => {
  assert.match(css, /\.home-page \.power-law-copy \{[\s\S]*?min-height: 0;/);
  assert.match(css, /font-size: clamp\(17px, 1\.55vw, 26px\)/);
  assert.match(css, /\.home-page \.power-copy-topics span \{ min-height: 23px/);
});

test("homepage starts with the 3D tab and provides a manual motion toggle", () => {
  assert.equal($("#power-law [data-view='3d']").attr("aria-pressed"), "true");
  assert.equal($("#power-law [data-view='2d']").attr("aria-pressed"), "false");
  assert.equal($("#power-orbit-auto").length, 1);
  assert.equal($("#power-orbit-reset").length, 1);
});

test("homepage removes the duplicate DOM watermark and keeps canvas rendering", () => {
  assert.equal($("#power-law .power-watermark").length, 0);
  assert.doesNotMatch($("#power-law").text(), /WELINKBTC\s*·\s*ON-CHAIN/);
  assert.equal($("#power-law-canvas").length, 1);
});
