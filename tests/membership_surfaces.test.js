import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readBinary = (path) => readFile(new URL(`../${path}`, import.meta.url));

test("legacy pages use clean URLs that the route handler resolves to source HTML", async () => {
  const [route, home, alphaOps, radar, bstockAlpha, dashboard, aiOps] = await Promise.all([
    read("lib/legacy-route.ts"),
    read("app/page.tsx"),
    read("app/alphaops/page.tsx"),
    read("app/alpha-radar/page.tsx"),
    read("app/bstock-alpha/page.tsx"),
    read("app/dashboard/page.tsx"),
    read("app/ai-ops/page.tsx")
  ]);

  for (const [clean, source] of [
    ["index", "index.html"],
    ["alphaops", "alphaops.html"],
    ["alpha-radar", "alpha-radar.html"],
    ["bstock-alpha", "bstock-alpha.html"],
    ["dashboard", "dashboard.html"],
    ["ai-ops", "ai-ops.html"]
  ]) {
    assert.match(route, new RegExp(`\\[\\"${clean}\\", \\"${source}\\"\\]`));
  }

  assert.match(home, /src="\/legacy\/index"/);
  assert.match(alphaOps, /src="\/legacy\/alphaops"/);
  assert.match(radar, /src="\/legacy\/alpha-radar"/);
  assert.match(bstockAlpha, /src="\/legacy\/bstock-alpha"/);
  assert.match(dashboard, /src="\/legacy\/dashboard"/);
  assert.match(aiOps, /src="\/legacy\/ai-ops"/);
  assert.match(route, /"\.jfif": "image\/jpeg"/);
});

test("admin-facing surfaces explicitly describe full access", async () => {
  const files = await Promise.all([
    read("app/account/page.tsx"),
    read("app/account/subscription/page.tsx"),
    read("app/dashboard/page.tsx"),
    read("app/alpha-radar/page.tsx"),
    read("app/alphaops/page.tsx"),
    read("app/ai-ops/page.tsx")
  ]);

  for (const source of files) {
    assert.match(source, /viewer\.role === "admin"/);
  }
  assert.match(files[0], /ADMIN 全站权益/);
  assert.match(files[1], /管理员账户已包含全站与 Max 级别功能/);
});

test("legacy shell preserves the original navigation and stable embedded styles", async () => {
  const [route, header, surface, globals] = await Promise.all([
    read("lib/legacy-route.ts"),
    read("components/platform-header.tsx"),
    read("components/legacy-surface.tsx"),
    read("app/globals.css")
  ]);

  assert.match(route, /inlineLocalStyles/);
  assert.match(route, /rewriteLocalScriptUrls/);
  assert.match(route, /\/legacy\/\$\{src\}/);
  assert.match(route, /markEmbeddedDocument/);
  assert.match(route, /replace\("<\/head>", `\$\{embedStyle\}<\/head>`\)/);
  assert.match(route, /data-legacy-source/);
  assert.match(route, /welinkbtc:preferences/);
  assert.match(surface, /welinkbtc:navigate/);
  for (const label of ["首页", "研究", "链上看板", "AlphaOps", "α-RadarTP", "bStockAlpha", "AI网格", "观潮量化", "产品", "协同", "经典网格", "AI运营台", "联系"]) {
    assert.match(header, new RegExp(label));
  }
  assert.equal((header.match(/href: "\/"/g) || []).length, 1);
  assert.doesNotMatch(header, /href: "\/#(?:network|products)"/);
  const preferences = await read("lib/display-preferences.ts");
  assert.match(header, /readDisplayPreferences/);
  assert.match(header, /persistDisplayPreference\("theme", nextTheme\)/);
  assert.match(header, /persistDisplayPreference\("language", nextLanguage\)/);
  for (const marker of ["welinkbtc-theme", "welinkbtc-language"]) assert.ok(preferences.includes(marker));
  for (const marker of ["https://x.com/fly_welinkBTC", "币安聊天室", "linktr.ee/welinkBTC"]) {
    assert.match(header, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(globals, /\.access-ribbon\s*\{/);
});

test("shared header exposes the ordered primary nav, Products menu, and More collaboration menu", async () => {
  const [header, globals] = await Promise.all([
    read("components/platform-header.tsx"),
    read("app/globals.css")
  ]);

  assert.equal((header.match(/platform-tool platform-tool--preference/g) || []).length, 2);
  assert.doesNotMatch(header, /platform-tool--secondary|externalLinks|platform-more-overflow-link/);
  const primary = header.match(/const primaryNav = \[[\s\S]*?\] as const;/)?.[0] ?? "";
  const expectedPrimary = ["/", "/research", "/dashboard", "/alphaops", "/alpha-radar", "/bstock-alpha", "/grid-ops", "/tidesight-quant"];
  let previousIndex = -1;
  for (const href of expectedPrimary) {
    const index = primary.indexOf(`href: "${href}"`);
    assert.ok(index > previousIndex, `${href} must follow the requested primary navigation order`);
    previousIndex = index;
  }
  assert.doesNotMatch(primary, /\/classic-grid|\/ai-ops|\/toolbox|\/rankings|\/#contact/);
  const products = header.match(/const productLinks:[\s\S]*?const collaborationLinks:/)?.[0] ?? "";
  for (const href of ["/ai-ops", "/toolbox", "/classic-grid", "/rankings", "https://welinkbtc.me/"]) assert.match(products, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const collaboration = header.match(/const collaborationLinks:[\s\S]*?const resourceLinks:/)?.[0] ?? "";
  for (const href of ["/contract-trading-assistant", "/multi-exchange-arbitrage", "/top-trader-radar", "/trading-beats", "/crypto-baixiaosheng"]) assert.match(collaboration, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(collaboration, /\/classic-grid|\/rankings|\/ai-ops|\/toolbox|welinkbtc\.me/);
  for (const resource of ["https://x.com/fly_welinkBTC", "https://t.me/", "www.binance.com/groupList", "linktr.ee/welinkBTC", "/#contact"]) {
    assert.match(header, new RegExp(resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(header, /platform-product-menu[\s\S]*?产品[\s\S]*?platform-more-collaboration[\s\S]*?协同[\s\S]*?platform-more-group--resources[\s\S]*?资源/);
  assert.match(globals, /\.platform-main-nav > a,[\s\S]*?\.platform-more-trigger \{[^}]*white-space:\s*nowrap/);
  assert.match(globals, /\.platform-more-menu \{[\s\S]*?grid-template-columns: minmax\(220px,[\s\S]*?minmax\(290px/);
  assert.match(globals, /\.platform-product-menu-panel \{[\s\S]*?grid-template-columns: minmax\(280px/);
  assert.match(globals, /\.platform-more-group--resources \{[^}]*border-left:/);
  assert.match(globals, /\.platform-shell-header \{[^}]*z-index:\s*205/);
  assert.doesNotMatch(globals, /\.platform-main-nav\s*\{\s*display:\s*none/);
  assert.doesNotMatch(header, /platform-mobile-nav/);
  assert.match(globals, /@media \(max-width: 1180px\)[\s\S]*?\.platform-main-nav \{[\s\S]*?overflow-x: auto/);
});

test("legacy surfaces keep a single viewport scrollbar and viewport-sized overlays", async () => {
  const [route, surface, globals] = await Promise.all([
    read("lib/legacy-route.ts"),
    read("components/legacy-surface.tsx"),
    read("app/globals.css")
  ]);

  assert.doesNotMatch(route, /welinkbtc:legacy-height|ResizeObserver\(reportHeight\)/);
  assert.doesNotMatch(surface, /setHeight|style=\{\{ height/);
  assert.match(route, /--platform-header-height: 0px !important/);
  assert.match(route, /\.dashboard-subnav \{ top: 0 !important; \}/);
  assert.match(route, /\.cycle-radar \{ top: auto !important; \}/);
  assert.match(route, /scroll-padding-top: 62px/);
  assert.match(route, /\.detail-drawer/);
  assert.match(route, /\.onchain-support-drawer/);
  assert.match(route, /\.material-drawer/);
  assert.match(globals, /\.app-shell:has\(\.legacy-page\)[\s\S]*height: 100dvh/);
  assert.match(globals, /\.legacy-frame\s*\{[\s\S]*height: 100%/);
  assert.match(globals, /--access-ribbon-height: 28px/);
  assert.match(globals, /\.platform-tool\s*\{[\s\S]*border-radius: 0/);
});

test("account surfaces derive card backgrounds from light and dark theme variables", async () => {
  const globals = await read("app/globals.css");

  assert.match(globals, /\.account-sidebar, \.admin-sidebar \{[\s\S]*background: var\(--surface\)/);
  assert.match(globals, /\.panel \{[\s\S]*background: var\(--surface\)/);
  for (const selector of ["stat-card", "referral-box", "connection-card", "pricing-card", "backup-code"]) {
    assert.match(globals, new RegExp(`\\.${selector} \\{[^}]*background: var\\(--surface-2\\)`));
  }
});

test("theme defaults and embedded hero brands are visible before legacy navigation", async () => {
  const [layout, header, homeScript, alphaOps, dashboard, aiOps, sharedStyles] = await Promise.all([
    read("app/layout.tsx"),
    read("components/platform-header.tsx"),
    read("script.js"),
    read("alphaops.html"),
    read("dashboard.html"),
    read("ai-ops.html"),
    read("platform-actions.css")
  ]);

  assert.match(layout, /data-theme="dark"/);
  assert.match(layout, /strategy="beforeInteractive"/);
  assert.match(layout, /===\s*'light'\?'light':'dark'/);
  assert.match(header, /useState<Theme>\("dark"\)/);
  assert.match(header, /=== "light" \? "light" : "dark"/);
  assert.match(homeScript, /welinkbtc-theme"\) \|\| "dark"/);
  for (const source of [alphaOps, dashboard, aiOps]) {
    assert.match(source, /hero-brand/);
    assert.match(source, /<body data-theme="dark">/);
  }
  assert.match(sharedStyles, /\.hero-brand\s*\{/);
});

test("shared header uses the animated 3D Bitcoin orbit brand", async () => {
  const [header, globals, home, styles, nextAsset, legacyAsset] = await Promise.all([
    read("components/platform-header.tsx"),
    read("app/globals.css"),
    read("index.html"),
    read("styles.css"),
    readBinary("public/welinkbtc-orbit-brand.webp"),
    readBinary("assets/welinkbtc-orbit-brand.webp")
  ]);

  assert.match(header, /platform-brand-mark--orbit/);
  assert.match(header, /src="\/welinkbtc-orbit-brand\.webp"/);
  assert.match(globals, /@keyframes platform-brand-disc-tilt/);
  assert.match(globals, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(home, /brand-mark--orbit/);
  assert.match(home, /assets\/welinkbtc-orbit-brand\.webp/);
  assert.match(styles, /@keyframes brand-orbit-disc-tilt/);
  assert.equal(nextAsset.subarray(0, 4).toString("hex"), "52494646");
  assert.deepEqual(nextAsset, legacyAsset);
  assert.ok(nextAsset.length < 100_000, "navigation brand asset should remain lightweight");
});

test("homepage renders the on-chain brand lockup with an optimized transparent icon", async () => {
  const [home, styles, icon] = await Promise.all([
    read("index.html"),
    read("styles.css"),
    readBinary("public/welinkbtc-onchain-brand.png")
  ]);

  assert.match(home, /class="home-brand-lockup"/);
  assert.match(home, /\/welinkbtc-onchain-brand\.png/);
  assert.match(home, />WELINK BTC</);
  assert.match(home, />ON-CHAIN MAIN</);
  assert.match(styles, /\.home-brand-lockup\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(styles, /\.home-brand-tagline\s*\{/);
  assert.equal(icon.subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(icon.length < 100_000, "homepage brand icon should remain lightweight");
});

test("shared navigation opens a standalone database-backed research newsroom", async () => {
  const [header, researchPage, articlePage, composer, card, action, schema, migration, globals, homeScript] = await Promise.all([
    read("components/platform-header.tsx"),
    read("app/research/page.tsx"),
    read("app/research/[slug]/page.tsx"),
    read("components/research-composer.tsx"),
    read("components/research-card.tsx"),
    read("app/actions/research.ts"),
    read("prisma/schema.prisma"),
    read("prisma/migrations/20260810090000_enhance_research_platform/migration.sql"),
    read("app/globals.css"),
    read("script.js")
  ]);

  assert.match(header, /href:\s*"\/research",\s*zh:\s*"研究"/);
  assert.doesNotMatch(header, /href:\s*"\/#research"/);
  assert.match(header, />WELINKBTC</);
  assert.match(globals, /--platform-shell-height:\s*82px/);
  assert.doesNotMatch(globals, /\.platform-brand \{ font-size:\s*0; \}/);
  assert.match(globals, /\.platform-main-nav > a,[\s\S]*font-size:\s*14px/);
  assert.match(homeScript, /"network\.text":\s*"系统聚合展示/);
  assert.doesNotMatch(homeScript, /模板适合展示/);

  assert.match(researchPage, /prisma\.researchArticle\.findMany/);
  assert.match(researchPage, /<ResearchComposer/);
  assert.match(researchPage, /<ResearchCard/);
  assert.match(composer, /action=\{submitAction\}/);
  assert.match(composer, /createResearchArticleAction/);
  assert.match(composer, /name="sourceType"/);
  assert.match(composer, /name="externalUrl"/);
  assert.match(card, /readingMinutes/);
  assert.match(card, /toggleResearchBookmarkAction/);
  assert.match(articlePage, /function canRead/);
  assert.match(articlePage, /<ResearchBody body=\{article\.body\}/);
  assert.match(articlePage, /<ResearchExternalReader/);
  assert.match(articlePage, /createResearchCommentAction/);
  assert.match(action, /requireAdmin\("\/research"\)/);
  assert.match(action, /admin\.research\.created/);
  assert.match(schema, /model ResearchArticle\s*\{/);
  assert.match(schema, /model ResearchBookmark\s*\{/);
  assert.match(schema, /model ResearchComment\s*\{/);
  assert.match(migration, /CREATE TABLE "research_bookmarks"/);
  assert.match(migration, /CREATE TABLE "research_comments"/);
});
