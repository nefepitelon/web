const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require(process.env.TIDESIGHT_PLAYWRIGHT_PATH || "playwright");
const useMocks = true;
const featuredAssets = ["BTC", "ETH", "BNB", "SOL", "ZEC", "TAO", "ENA", "ONDO", "UNI", "XRP", "SUI", "HYPE"];
const macdAssets = featuredAssets;
const macdIntervals = [
  ["1M", "月线", "Monthly"],
  ["1w", "周线", "Weekly"],
  ["1d", "日线", "Daily"],
  ["4h", "4 小时", "4 Hours"],
  ["1h", "1 小时", "1 Hour"],
  ["15m", "15 分钟", "15 Minutes"],
];

async function installLocalFixtures(page) {
  if (!useMocks) return;
  await page.route("**/api/tidesight/market", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      checkedAt: new Date().toISOString(),
      markets: featuredAssets.map((asset, index) => ({ symbol: `${asset}USDT`, asset, markPrice: 1000 / (index + 1), fundingRate: 0.0001, fundingAnnualizedPct: 10.95, priceChange24hPct: index % 2 ? -0.8 : 1.2, quoteVolume24h: 1_000_000_000 / (index + 1) })),
    }),
  }));
  await page.route("**/api/tidesight/macd", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      checkedAt: new Date().toISOString(),
      failures: [],
      monitors: macdAssets.flatMap((asset, assetIndex) => macdIntervals.map(([interval, intervalZh, intervalEn], intervalIndex) => ({
        symbol: `${asset}USDT`, asset, interval, intervalZh, intervalEn,
        closedAt: new Date(Date.now() - 60_000).toISOString(), closePrice: 1000 / (assetIndex + 1),
        dif: intervalIndex === 0 ? -0.5 : 1.2, dea: intervalIndex === 0 ? -0.8 : 1.1,
        histogram: intervalIndex === 0 ? 0.6 : 0.2, relation: "BULLISH",
        signal: intervalIndex === 0 ? "REBIRTH_GOLDEN_CROSS" : "NONE",
        lastCross: { signal: intervalIndex === 0 ? "REBIRTH_GOLDEN_CROSS" : "GOLDEN_CROSS", closedAt: new Date(Date.now() - 3_600_000).toISOString(), barsAgo: intervalIndex, dif: 1, dea: 0.9 },
      }))),
    }),
  }));
  await page.route("**/api/tidesight/macd/chart?**", (route) => {
    const requestUrl = new URL(route.request().url());
    const symbol = requestUrl.searchParams.get("symbol") || "BTCUSDT";
    const interval = requestUrl.searchParams.get("interval") || "1d";
    const asset = symbol.replace("USDT", "");
    const intervalMeta = macdIntervals.find(([value]) => value === interval) || macdIntervals[2];
    const base = asset === "BTC" ? 78000 : asset === "ETH" ? 2500 : asset === "SOL" ? 104 : 690;
    const now = Date.now();
    const series = Array.from({ length: 120 }, (_, index) => {
      const close = base + Math.sin(index / 7) * base * .035 + index * base * .0002;
      const open = close + Math.cos(index / 5) * base * .006;
      const dif = Math.sin(index / 8) * base * .012;
      const dea = Math.sin((index - 3) / 8) * base * .01;
      return {
        openTime: now - (120 - index) * 60_000,
        closeTime: now - (119 - index) * 60_000 - 1,
        open,
        high: Math.max(open, close) + base * .008,
        low: Math.min(open, close) - base * .008,
        close,
        volume: 10_000 + index * 120,
        dif,
        dea,
        histogram: (dif - dea) * 2,
        signal: index === 52 ? "REBIRTH_GOLDEN_CROSS" : index === 92 ? "DEATH_CROSS" : "NONE",
      };
    });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, source: "BINANCE_FUTURES_KLINES", symbol, asset, interval, intervalZh: intervalMeta[1], intervalEn: intervalMeta[2], checkedAt: new Date().toISOString(), parameters: { fast: 12, slow: 26, signal: 9, closedCandlesOnly: true }, series }),
    });
  });
  await page.route("**/api/binance-price**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ok: true, symbol: "BTCUSDT", price: 78000 }),
  }));
}


// Real React components and styles. Every network request is intercepted;
// no real API, database, exchange, unlock or automation is accessed.
(async () => {
  const compiled = await build({
    stdin: { contents: `import { createRoot } from 'react-dom/client';
      import { PlatformHeader } from './components/platform-header';
      import { PlatformRuntime } from './components/platform-runtime';
      import { TideSightQuantSurface } from './components/tidesight-quant-surface';
      import './app/globals.css';
      createRoot(document.getElementById('root')).render(<div className="app-shell"><PlatformHeader viewer={null}/><TideSightQuantSurface signedIn canOperate canUnlockLive operatorLabel="FIXTURE" initialTab={location.pathname.endsWith('/macd') ? 'macd' : 'overview'}/><PlatformRuntime/></div>);`,
      resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, outfile: "fixture.js", jsx: "automatic", loader: { ".css": "css" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "fixture", setup(b) {
      b.onLoad({ filter: /\.module\.css$/ }, args => ({ contents: fs.readFileSync(args.path, "utf8"), loader: "local-css" }));
      b.onResolve({ filter: /^next\/(link|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path.endsWith("navigation")
        ? "export function usePathname(){return window.location.pathname;}"
        : "import { createElement } from 'react'; export default function Link({prefetch,...props}){return createElement('a',props);}", loader: "js", resolveDir: process.cwd() }));
    }}],
  });
  const js = compiled.outputFiles.find(f => f.path.endsWith(".js")).text;
  const css = compiled.outputFiles.find(f => f.path.endsWith(".css")).text;
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const errors = [], mutations = [], matrix = [], untranslated = [];
  const screenshotDir = path.resolve("artifacts/tidesight-ui");
  fs.mkdirSync(screenshotDir, { recursive: true });
  let autoEnabled = false;
  async function install(page) {
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", e => { if (e.type() === "error") errors.push(e.text()); });
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname !== "tidesight-fixture.invalid") return route.fulfill({ status: 200, body: "" });
      if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "application/javascript", body: js });
      if (url.pathname === "/fixture.css") return route.fulfill({ contentType: "text/css", body: css });
      if (url.pathname === "/api/tidesight/execution/status") return route.fulfill({ contentType: "application/json", body: JSON.stringify({
        ok: true, config: { activeMode: "live", defaultMarket: "futures", liveEnabled: true, liveUnlocked: true, requireProtectionOrders: true,
          reconciliationHealthy: true, killSwitchActive: false, autoStopLossPct: 1, autoTakeProfitPct: 2, autoExecuteEnabled: autoEnabled, autoHeartbeatAt: new Date().toISOString() },
        credentials: [{ id: "fixture", environment: "LIVE", market: "FUTURES", apiKeyHint: "FIXTURE-ONLY", enabled: true, verifiedAt: new Date().toISOString(),
          permissionSummary: { accountMode: "portfolio", portfolioMargin: { uniMMR: 5, minUniMMR: 1.5, collateralEquity: 2000 } } }],
        portfolioStats: [], positions: [], plans: [], orders: [], audits: [] }) });
      if (url.pathname === "/api/tidesight/automation") {
        if (request.method() !== "GET") { mutations.push({ method: request.method(), body: request.postDataJSON() }); autoEnabled = request.method() === "POST"; }
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, events: [] }) });
      }
      if (url.pathname.startsWith("/api/")) throw new Error("Unexpected API request: " + url.pathname);
      if (url.pathname.endsWith(".webp")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"/>' });
      return route.fulfill({ contentType: "text/html", body: '<!doctype html><html data-language="zh" data-theme="dark"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script></html>' });
    });
    await installLocalFixtures(page);
  }
  try {
    const page = await context.newPage(); await install(page);
    await page.goto("http://tidesight-fixture.invalid/tidesight-quant", { waitUntil: "networkidle" });
    const labels = [["总览","Overview"],["MACD 多周期","MACD Monitor"],["研究信号","Research"],["策略实验室","Strategies"],["组合分配","Allocator"],["风险闸门","Risk Engine"],["执行与接入","Execution"],["成交级验证","Backtest"],["事实与审计","Audit"]];
    async function preferences(language, theme) {
      // Use the actual header controls, including its mobile preferences panel.
      const mobile = (page.viewportSize()?.width || 1440) < 1100;
      const header = page.locator(".platform-shell-header");
      if (mobile && (await page.locator(".platform-mobile-nav").getAttribute("open")) === null) await page.locator(".platform-mobile-nav summary").click();
      const rootLang = await page.locator("html").getAttribute("data-language");
      if (rootLang !== language) {
        const target = mobile ? page.locator(".platform-mobile-preferences button").nth(1) : header.getByRole("button", { name: language === "en" ? "Switch to English" : "切换到中文", exact: true });
        await target.click();
      }
      if ((await page.locator("html").getAttribute("data-theme")) !== theme) {
        const target = mobile ? page.locator(".platform-mobile-preferences button").first() : page.locator(".platform-tools--desktop button").first();
        await target.click();
      }
      if (mobile) await page.locator(".platform-mobile-nav summary").click();
      await page.waitForTimeout(80);
    }
    const visualOnly = process.env.TIDESIGHT_UI_VISUAL_ONLY === "1";
    for (const width of visualOnly ? [1440] : [1440, 2560, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const language of ["zh", "en"]) for (const theme of ["dark", "light"]) {
        await preferences(language, theme);
        for (const [zh, en] of visualOnly ? labels.filter(([zh]) => zh === "MACD 多周期") : labels) {
          const nav = page.getByRole("navigation", { name: language === "zh" ? "观潮量化模块" : "TideSight modules" });
          const item = nav.getByRole(zh === "总览" || zh === "MACD 多周期" ? "link" : "button", { name: language === "zh" ? zh : en, exact: true });
          await item.click();
          await page.locator("main h2").first().waitFor();
          if (zh === "MACD 多周期") await page.getByTestId("macd-realtime-chart").waitFor();
          if (zh === "总览") await page.locator('article').filter({ hasText: "PERP / USDT" }).first().waitFor();
          await page.waitForTimeout(60);
          const layout = await page.evaluate(() => {
            const main = document.querySelector("main");
            const bounds = [...main.querySelectorAll("*")].filter(el => {
              if (!el.getClientRects().length || el.closest('[class*="ChartFrame"],[class*="strategyTable"],nav,svg,[class*="ambient"]')) return false;
              const rect = el.getBoundingClientRect();
              return rect.right > innerWidth + 2 && getComputedStyle(el).position !== "absolute";
            }).slice(0, 5).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent.slice(0, 80) }));
            const cjk = [...main.querySelectorAll("h1,h2,h3,p,label,nav span")].map(el => el.textContent).filter(t => /[\u4e00-\u9fff]/.test(t));
            return { overflow: document.documentElement.scrollWidth > innerWidth + 2, bounds, cjk };
          });
          matrix.push({ width, language, theme, page: en, overflow: layout.overflow });
          assert.equal(layout.overflow, false, JSON.stringify({ width, language, theme, page: en, ...layout }));
          assert.deepEqual(layout.bounds, [], JSON.stringify({ width, language, theme, page: en, bounds: layout.bounds }));
          if (language === "en" && layout.cjk.length) untranslated.push({ page: en, text: layout.cjk });
          if (width === 1440 && zh === "MACD 多周期") {
            await page.locator('[class*="macdChartFrame"]').screenshot({ path: path.join(screenshotDir, "chart-" + theme + "-" + language + ".png") });
          }
          if (width === 1440 && language === "zh" && ["总览", "执行与接入", "策略实验室", "MACD 多周期", "风险闸门"].includes(zh)) {
            await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({ path: path.join(screenshotDir, en.replaceAll(" ", "-") + "-" + theme + ".png"), fullPage: zh !== "MACD 多周期" });
          }
          if (width === 390 && language === "en" && theme === "light" && zh === "执行与接入") await page.screenshot({ path: path.join(screenshotDir, "execution-mobile-light-en.png"), fullPage: true });
        }
      }
    }
    assert.deepEqual(untranslated, [], "Untranslated English UI: " + JSON.stringify(untranslated.slice(0, 12)));
    if (visualOnly) { console.log(JSON.stringify({ ok: true, fixtureOnly: true, chartThemeChecks: matrix.length, errors })); return; }
    await page.setViewportSize({ width: 1440, height: 1000 }); await preferences("en", "light");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    assert.equal(await page.locator("html").getAttribute("data-language"), "en");
    const second = await context.newPage(); await install(second); await second.goto("http://tidesight-fixture.invalid/tidesight-quant");
    await second.getByRole("button", { name: "切换到中文", exact: true }).click();
    await page.getByRole("navigation", { name: "观潮量化模块" }).waitFor();
    await second.close();
    await preferences("en", "light");
    await page.getByRole("navigation", { name: "TideSight modules" }).getByRole("button", { name: "Strategies", exact: true }).click();
    await page.getByLabel("Manual strategy pair").selectOption("ETHUSDT");
    await preferences("zh", "dark"); await preferences("en", "light");
    assert.equal(await page.getByLabel("Manual strategy pair").inputValue(), "ETHUSDT");
    await page.getByRole("navigation", { name: "TideSight modules" }).getByRole("button", { name: "Execution", exact: true }).click();
    await page.getByRole("button", { name: "Start automatic execution", exact: true }).click();
    let group = page.getByRole("group", { name: "Automatic trading agreements" });
    const checks = group.getByRole("checkbox");
    const confirm = group.getByRole("button", { name: "Confirm authorization and start", exact: true });
    assert.equal(await group.getByRole("textbox").count(), 0);
    assert.equal(await checks.count(), 2); assert.equal(await confirm.isDisabled(), true);
    await checks.nth(0).check(); assert.equal(await confirm.isDisabled(), true);
    await checks.nth(1).check(); assert.equal(await confirm.isEnabled(), true);
    await checks.nth(0).uncheck(); assert.equal(await confirm.isDisabled(), true);
    await group.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Start automatic execution", exact: true }).click();
    assert.equal(await checks.nth(0).isChecked(), false); assert.equal(await checks.nth(1).isChecked(), false);
    await checks.nth(0).check(); await checks.nth(1).check();
    await confirm.click();
    await page.getByRole("button", { name: "Stop automatic entries", exact: true }).waitFor();
    assert.deepEqual(mutations, [{ method: "POST", body: { acknowledgeRealFunds: true, acknowledgeDedicatedAccount: true } }]);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, fixtureOnly: true, matrixChecks: matrix.length, preferencesPersisted: true, crossTabSync: true, formPreserved: true, phraseInputs: 0, requiredAgreements: 2, noPageOverflow: true, noConsoleErrors: true, screenshotDir }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
