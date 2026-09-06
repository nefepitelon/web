const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
  assert.match(carouselJs, /fetch\(assetUrl\("index\.html/);
  assert.match(carouselJs, /querySelector\("#power-law"\)/);
  assert.match(carouselJs, /product-dashboard\.js/);
  assert.match(carouselJs, /window\.updateProductDashboardLanguage/);
  assert.match(dashboardHtml, /dashboard-product-carousel\.js/);
  assert.match(dashboardHtml, /href="styles\.css/);

  const options = homepageHtml.match(/data-model-option="[^"]+"/g) || [];
  assert.equal(options.length, 30);
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
