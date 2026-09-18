const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dashboardHtml = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const dashboardJs = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const dashboardCss = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const carouselJs = fs.readFileSync(path.join(root, "dashboard-product-carousel.js"), "utf8");
const homepageHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("dashboard mounts the homepage 2D/3D loop directly below market overview KPIs", () => {
  assert.match(dashboardHtml, /data-section-link="onchain-carousel"[^>]*data-i18n="section\.carousel"/);
  assert.match(dashboardHtml, /<section class="dashboard-carousel-mount" id="onchain-carousel"/);

  const kpiIndex = dashboardHtml.indexOf('<section class="kpi-grid"');
  const carouselIndex = dashboardHtml.indexOf('<section class="dashboard-carousel-mount"');
  const workspaceIndex = dashboardHtml.indexOf('<div class="dashboard-workspace"');
  assert.ok(kpiIndex > -1 && kpiIndex < carouselIndex);
  assert.ok(carouselIndex < workspaceIndex);
});

test("dashboard carousel reuses the complete homepage component and controller", () => {
  assert.match(carouselJs, /new URL\("\."\, loaderScript\.src\)/);
  assert.match(carouselJs, /fetch\(assetUrl\(`index\.html/);
  assert.match(carouselJs, /querySelector\("#power-law"\)/);
  assert.match(carouselJs, /product-dashboard\.js/);
  assert.match(carouselJs, /window\.updateProductDashboardLanguage/);
  assert.match(dashboardHtml, /dashboard-product-carousel\.js/);
  assert.match(dashboardHtml, /href="styles\.css/);

  const options = homepageHtml.match(/data-model-option="[^"]+"/g) || [];
  assert.equal(options.length, 34);
  assert.match(homepageHtml, /data-view="2d"/);
  assert.match(homepageHtml, /data-view="3d"/);
});

test("dashboard-only carousel adaptation keeps homepage markup intact", () => {
  assert.match(carouselJs, /querySelector\("\.power-law-copy"\)/);
  assert.match(carouselJs, /promotionalCopy\?\.remove\(\)/);
  assert.match(carouselJs, /titleLine\.className = "dashboard-carousel-title-line"/);
  assert.match(carouselJs, /titleLine\.append\(subtitle, actions\)/);
  assert.match(carouselJs, /actions\.classList\.add\("dashboard-carousel-title-actions"\)/);

  assert.match(homepageHtml, /<div class="power-law-actions">/);
  assert.match(homepageHtml, /<div class="power-law-copy">/);
});

test("legacy publishing exposes the dashboard carousel loader", () => {
  const legacyRoute = fs.readFileSync(path.join(root, "lib", "legacy-route.ts"), "utf8");
  assert.match(legacyRoute, /"dashboard-product-carousel\.js"/);
});

test("dashboard language and section navigation include the carousel", () => {
  assert.match(dashboardJs, /"section\.carousel": "2\/3D指标轮询集"/);
  assert.match(dashboardJs, /"section\.carousel": "2D\/3D Indicator Loop"/);
  assert.match(dashboardJs, /#overview, #onchain-carousel, #valuation/);
  assert.match(dashboardJs, /window\.updateDashboardLanguage = applyLanguage/);
  assert.match(dashboardJs, /window\.updateProductDashboardLanguage\?\.\(\)/);
});

test("dashboard carousel has scoped desktop and responsive presentation", () => {
  assert.match(dashboardCss, /\.dashboard-carousel-mount > \.power-law-section/);
  assert.match(dashboardCss, /\.dashboard-carousel-mount \.power-law-toolbar/);
  assert.match(dashboardCss, /\.dashboard-carousel-mount \.dashboard-carousel-title-line/);
  assert.match(dashboardCss, /\.dashboard-carousel-mount \.dashboard-carousel-title-actions/);
  assert.match(dashboardCss, /\.dashboard-carousel-mount #power-law-canvas/);
  assert.match(dashboardCss, /@media \(max-width: 1440px\)[\s\S]*?grid-template-areas:\s*"brand brand brand"\s*"view model period"/);
  assert.match(dashboardCss, /@media \(max-width: 980px\)[\s\S]*?\.dashboard-carousel-mount \.power-law-toolbar/);
  assert.match(dashboardCss, /@media \(max-width: 980px\)[\s\S]*?grid-template-areas: "brand" "view" "model" "period"/);
  assert.match(dashboardCss, /@media \(max-width: 980px\)[\s\S]*?\.dashboard-carousel-mount \.power-law-brand \{[\s\S]*?display: grid/);
  assert.match(dashboardCss, /@media \(max-width: 700px\)[\s\S]*?\.dashboard-carousel-mount #power-law-canvas/);
});

function mountHarness({ scriptPath = "/legacy/dashboard-product-carousel.js", cycleReady = false, fetchOk = true } = {}) {
  const appended = [], requested = [], events = [], languages = [];
  const node = () => ({
    dataset: {}, attributes: {}, children: [], listeners: {}, classes: new Set(),
    classList: { add(...names) { names.forEach(name => this.owner.classes.add(name)); } },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    append(...children) { this.children.push(...children); },
    appendChild(child) { this.children.push(child); return child; },
    remove() { this.removed = true; },
    querySelector() { return null; }
  });
  const createNode = () => { const result = node(); result.classList.owner = result; return result; };
  const mount = createNode(), section = createNode(), brand = createNode(), subtitle = createNode(), actions = createNode(), copy = createNode();
  mount.replaceChildren = (...children) => { mount.children = children; };
  section.querySelector = selector => ({ ".power-law-brand": brand, ".power-law-actions": actions, ".power-law-copy": copy })[selector] || null;
  brand.querySelector = selector => selector === "em" ? subtitle : null;
  const document = {
    currentScript: { src: `https://example.test${scriptPath}` },
    documentElement: { lang: "zh-CN" },
    querySelector: selector => selector === "#onchain-carousel" ? mount : null,
    importNode: () => section,
    createElement: createNode,
    body: { appendChild: script => { appended.push(script); } }
  };
  const window = {
    updateDashboardLanguage: () => languages.push("dashboard"),
    dispatchEvent: event => events.push(event.type),
    ...(cycleReady ? { WelinkTrendIndicatorCycle: { create() {} } } : {})
  };
  const context = {
    window, document, URL,
    CustomEvent: class { constructor(type) { this.type = type; } },
    DOMParser: class { parseFromString() { return { querySelector: selector => selector === "#power-law" ? section : null }; } },
    fetch: async (url, options) => { requested.push({ url, options }); return { ok: fetchOk, status: fetchOk ? 200 : 503, text: async () => "homepage" }; },
    console: { error() {} }
  };
  vm.runInNewContext(carouselJs, context, { filename: "dashboard-product-carousel.js" });
  return { appended, requested, events, languages, window, mount, section, brand, subtitle, actions, copy };
}
const flushMount = () => new Promise(resolve => setImmediate(resolve));

test("dashboard mounts the shared 3D experience before sequential cycle/controller loading in either URL surface", async () => {
  for (const base of ["", "/legacy"]) {
    const run = mountHarness({ scriptPath: `${base}/dashboard-product-carousel.js` });
    await flushMount();
    assert.equal(run.requested[0].url, `${base}/index.html?v=20260917-mvrv-zscore-watermark-v2`);
    assert.equal(run.requested[0].options.cache, "no-cache");
    assert.equal(run.mount.children[0], run.section);
    assert.equal(run.section.dataset.onchainExperience, "shared-3d");
    assert.equal(run.copy.removed, true);
    assert.deepEqual(run.brand.children[0].children, [run.subtitle, run.actions]);
    assert.equal(run.appended.length, 1, "controller must wait for cycle dependency");
    assert.equal(run.appended[0].src, `${base}/trend-indicator-cycle.js?v=20260917-mvrv-zscore-watermark-v2`);
    assert.deepEqual(run.events, []);

    run.window.WelinkTrendIndicatorCycle = { create() {} };
    run.appended[0].listeners.load();
    await flushMount();
    assert.equal(run.appended.length, 2);
    assert.equal(run.appended[1].src, `${base}/product-dashboard.js?v=20260917-mvrv-zscore-watermark-v2`);
    run.window.updateProductDashboardLanguage = () => run.languages.push("shared");
    run.appended[1].listeners.load();
    await flushMount();
    assert.deepEqual(run.languages, ["dashboard", "shared"]);
    assert.deepEqual(run.events, ["dashboard:carousel-ready"]);
  }
});

test("dashboard reuses an existing cycle module without adding a duplicate script", async () => {
  const run = mountHarness({ cycleReady: true });
  await flushMount();
  assert.equal(run.appended.length, 1);
  assert.match(run.appended[0].src, /\/legacy\/product-dashboard\.js\?v=/);
  run.window.updateProductDashboardLanguage = () => {};
  run.appended[0].listeners.load();
  await flushMount();
  assert.deepEqual(run.events, ["dashboard:carousel-ready"]);
});

test("dashboard reports a dependency failure and never runs a partially initialized controller", async () => {
  const run = mountHarness();
  await flushMount();
  run.appended[0].listeners.error(new Error("asset unavailable"));
  await flushMount();
  assert.equal(run.appended.length, 1);
  assert.deepEqual(run.events, []);
  assert.equal(run.mount.children[0].attributes.role, "alert");
  assert.match(run.mount.children[0].children[0].textContent, /暂时无法载入/);
});

test("dashboard keeps scoped controls, a viewport popup, and floor space inside embedded narrow canvases", () => {
  assert.match(dashboardCss, /\.dashboard-carousel-mount \.power-orbit-controls\s*\{[^}]*flex-wrap: wrap/);
  assert.match(dashboardCss, /\.dashboard-carousel-mount \.power-model-options\s*\{[^}]*position: fixed/);
  assert.match(dashboardCss, /html\.welinkbtc-embedded \.dashboard-carousel-mount\s*\{[^}]*scroll-margin-top: 72px/);
  assert.match(dashboardCss, /\.dashboard-carousel-mount #power-law-canvas\s*\{\s*height: 720px/);
  assert.match(dashboardCss, /@media \(max-width: 700px\)[\s\S]*?\.dashboard-carousel-mount #power-law-canvas\s*\{\s*height: 640px/);
  assert.match(dashboardCss, /\.dashboard-carousel-mount \.is-3d \.power-metrics-head/);
  assert.doesNotMatch(carouselJs, /body\.classList\.add\("home-page"/);
});
