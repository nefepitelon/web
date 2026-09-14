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

test("homepage summaries share the Operating System scale and are centered", () => {
  assert.match(css, /\.home-page \.power-law-copy \{[\s\S]*?min-height: 0;/);
  assert.match(css, /--home-summary-size: clamp\(28px, 2\.7vw, 44px\)/);
  for (const selector of ["operating-system-intro h2", "power-law-copy h2", "research-promise h2"]) {
    assert.ok(css.includes(`.home-page .${selector}`));
  }
  assert.match(css, /\.home-page \.power-copy-statement \{[^}]*text-align: center;/);
  assert.match(css, /\.home-page \.research-promise \{[^}]*text-align: center;/);
  assert.match(css, /\.home-page \.power-copy-topics span \{ min-height: 23px/);
});

test("Research promise leads the section and content rails match Network", () => {
  const inner = $("#research .research-inner");
  assert.equal(inner.length, 1);
  assert.ok(inner.children().eq(0).hasClass("research-promise"));
  assert.ok(inner.children().eq(1).hasClass("research-showcase"));
  assert.ok(inner.children().eq(2).hasClass("research-library"));
  assert.equal($("#research [data-i18n='research.listTitle']").length, 1);
  assert.equal(inner.find(".research-article-pill").length, 3);
  assert.match(css, /\.home-page \.research-inner \{[^}]*max-width: 1540px;/);
  assert.match(css, /\.home-page \.network-inner \{[^}]*max-width: 1540px;/);
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
