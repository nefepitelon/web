const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("cheerio");
const postcss = require("postcss");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "public/home-button-glow.css"), "utf8");
const header = fs.readFileSync(path.join(root, "components/platform-header.tsx"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const $ = load(html);
const stylesheet = postcss.parse(css);
const effectSelectors = [];
const containingBlockSelectors = [];
stylesheet.walkRules((rule) => {
  const declarations = new Map(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]));
  if (declarations.get("animation")?.includes("home-border-travel") && declarations.has("content")) {
    for (const selector of rule.selectors) {
      assert.ok(selector.endsWith("::before"), "Border glow must use its own before pseudo-element");
      effectSelectors.push(selector.slice(0, -"::before".length));
    }
  }
  if (declarations.get("position") === "relative") containingBlockSelectors.push(...rule.selectors);
});
assert.ok(effectSelectors.length > 0, "Expected the homepage border glow definition");
const receivesGlow = (element) => effectSelectors.some((selector) => $(element).is(selector));
const getsContainingBlock = (element) => containingBlockSelectors.some((selector) => $(element).is(selector));

test("border glow remains on product demos, CTA links, research, and model/orbit controls", () => {
  const retainedFamilies = [
    "[data-demo-tab]", ".product-demo-caption > a", ".product-demo button",
    "main .primary-button", "main .text-link", ".research-button",
    ".research-article-pill", "a.contact-card", "#power-model-toggle",
    "#power-orbit-auto", "#power-orbit-reset",
  ];
  for (const family of retainedFamilies) {
    const elements = $(family).toArray();
    assert.ok(elements.length > 0, `Missing expected retained family ${family}`);
    for (const element of elements) {
      assert.ok(receivesGlow(element), `Missing glow for ${family}: ${$(element).text().trim()}`);
    }
  }
  assert.equal($(".product-demo-caption > a").length, 6);
  assert.equal($("[data-demo-tab]").length, 6);
  assert.equal($(".research-article-pill").length, 3);
});

test("homepage navigation, view, period, and glow controls have no border glow", () => {
  const excludedFamilies = [
    ".site-header a, .site-header button, .site-header summary",
    ".mobile-menu a, .mobile-menu button, .mobile-menu summary",
    "#power-law [data-view]", "#power-law [data-range]", "#power-law .glow-toggle",
  ];
  for (const family of excludedFamilies) {
    const elements = $(family).toArray();
    assert.ok(elements.length > 0, `Missing expected excluded family ${family}`);
    for (const element of elements) {
      assert.equal(receivesGlow(element), false, `Unexpected glow on ${family}: ${$(element).text().trim()}`);
      assert.equal(getsContainingBlock(element), false, `Glow must not reposition excluded ${family}`);
    }
  }
  assert.equal($("#power-law [data-view]").length, 2);
  assert.equal($("#power-law [data-range]").length, 5);
});

test("glow keeps existing backgrounds, focus rings, and tab progress intact", () => {
  assert.match(css, /mask-composite: exclude/);
  assert.match(css, /pointer-events: none/);
  assert.doesNotMatch(css, /\}\s*[^{}]*::after\s*\{/);
  assert.doesNotMatch(css, /outline:\s*(?:none|0)/);
  const metricsToggle = $(".power-metrics-toggle").get(0);
  assert.ok(metricsToggle, "Expected metrics toggle to retain its absolute anchor");
  assert.equal(getsContainingBlock(metricsToggle), false);
  assert.equal(receivesGlow(metricsToggle), true);
});

test("the shell no longer imports or opts into homepage border glow", () => {
  assert.doesNotMatch(header, /data-home-glow/);
  assert.doesNotMatch(header, /home-button-glow\.css/);
  assert.doesNotMatch(css, /data-home-glow/);
  assert.equal($("link[rel='stylesheet'][href^='/home-button-glow.css']").length, 1);
  assert.match(css, /body\.home-page\[data-theme="light"\]/);
});

test("reduced motion and unsupported masks preserve an unobstructed static UI", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation: none !important/);
  assert.match(css, /@supports not \(\(mask-composite: exclude\) or \(-webkit-mask-composite: xor\)\)/);
  assert.match(css, /content: none/);
  assert.match(css, /button:disabled/);
});
