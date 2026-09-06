const path = require("node:path");
const { chromium } = require(process.env.TIDESIGHT_PLAYWRIGHT_PATH || "playwright");

const baseUrl = process.env.TIDESIGHT_BASE_URL || "http://localhost:3000";
const outputDir = process.env.TIDESIGHT_SCREENSHOT_DIR || process.cwd();
const useMocks = process.env.TIDESIGHT_BROWSER_MOCKS === "1";

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

async function verify() {
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.TIDESIGHT_BROWSER_PATH ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1100 }, deviceScaleFactor: 1 });
    await installLocalFixtures(page);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

    const response = await page.goto(`${baseUrl}/tidesight-quant`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 30_000 });
    await page.getByText(/更多|More/, { exact: true }).click();
    const productNavVisible = await page.getByRole("link", { name: /观潮量化 TideSight Quant|TideSight Quant/ }).first().isVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 1100 });
    const title = await page.title();
    const bodyLength = (await page.locator("body").innerText()).trim().length;
    const overlay = await page.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
    const marketCards = await page.locator("article").filter({ hasText: /PERP \/ USDT/ }).count();
    const overviewMacdPanels = await page.locator('section[aria-label$=" MACD"] article').count();
    const modeLabels = await page.getByRole("region", { name: /执行环境|Execution environment/ }).getByRole("button").allTextContents();
    await page.screenshot({ path: path.join(outputDir, "tidesight-local-desktop.png"), fullPage: true });

    await page.getByRole("link", { name: /MACD 多周期|MACD Monitor/ }).click();
    await page.waitForURL("**/tidesight-quant/macd", { timeout: 30_000 });
    await page.locator('section[aria-label="BTC MACD"] article dl').first().waitFor({ timeout: 45_000 });
    await page.getByTestId("macd-realtime-chart").waitFor({ timeout: 45_000 });
    const macdPanels = await page.locator('section[aria-label$=" MACD"] article').count();
    const macdCandles = await page.locator('[data-testid="macd-realtime-chart"] [data-candle="true"]').count();
    const macdBoardVisible = await page.getByRole("heading", { name: /MACD 多周期监控信号|MACD multi-timeframe signals/ }).isVisible();
    const macdRouteVisible = page.url().endsWith("/tidesight-quant/macd");
    await page.getByRole("group", { name: /选择代币|Select asset/ }).getByRole("button", { name: /ETH/ }).click();
    await page.getByRole("group", { name: /选择 MACD 周期|Select MACD interval/ }).getByRole("button", { name: /4 小时|4 Hours/ }).click();
    await page.getByText(/ETH \/ USDT · 4 小时|ETH \/ USDT · 4 Hours/).waitFor({ timeout: 30_000 });
    const selectorWorks = await page.getByRole("group", { name: /选择代币|Select asset/ }).getByRole("button", { name: /ETH/ }).getAttribute("aria-pressed") === "true"
      && await page.getByRole("group", { name: /选择 MACD 周期|Select MACD interval/ }).getByRole("button", { name: /4 小时|4 Hours/ }).getAttribute("aria-pressed") === "true";
    await page.screenshot({ path: path.join(outputDir, "tidesight-macd-local-desktop.png"), fullPage: true });

    await page.getByRole("link", { name: /总览|Overview/ }).click();
    await page.waitForURL((url) => url.pathname === "/tidesight-quant", { timeout: 30_000 });
    await page.getByRole("button", { name: /策略实验室|Strategies/ }).click();
    await page.getByRole("button", { name: /生成待确认计划|Create pending plan/ }).click();
    await page.getByText("PREVIEW_APPROVED").waitFor({ timeout: 30_000 });
    const previewPlanVisible = await page.getByText("PREVIEW-NOT-PERSISTED").isVisible();
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await installLocalFixtures(mobile);
    mobile.on("console", (message) => {
      if (message.type() === "error") errors.push(`mobile console: ${message.text()}`);
    });
    mobile.on("pageerror", (error) => errors.push(`mobile pageerror: ${error.message}`));
    await mobile.goto(`${baseUrl}/tidesight-quant/macd`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await mobile.getByRole("heading", { level: 1 }).waitFor({ timeout: 30_000 });
    await mobile.locator('section[aria-label="BTC MACD"] article dl').first().waitFor({ timeout: 45_000 });
    await mobile.getByTestId("macd-realtime-chart").waitFor({ timeout: 45_000 });
    await mobile.screenshot({ path: path.join(outputDir, "tidesight-macd-local-mobile.png"), fullPage: true });
    const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    const mobileOverlay = await mobile.locator("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay").count();
    const mobileMacdPanels = await mobile.locator('section[aria-label$=" MACD"] article').count();
    const mobileMacdCandles = await mobile.locator('[data-testid="macd-realtime-chart"] [data-candle="true"]').count();

    const result = {
      ok: Boolean(response?.ok()) && overlay === 0 && mobileOverlay === 0 && bodyLength > 500 && productNavVisible && marketCards === 12 && overviewMacdPanels === 0 && macdPanels === 72 && mobileMacdPanels === 72 && macdCandles >= 100 && mobileMacdCandles >= 100 && modeLabels.join(",") === "PAPER,LIVE" && macdBoardVisible && macdRouteVisible && selectorWorks && previewPlanVisible && !mobileOverflow && errors.length === 0,
      status: response?.status(),
      title,
      bodyLength,
      overlay,
      mobileOverlay,
      marketCards,
      overviewMacdPanels,
      macdPanels,
      mobileMacdPanels,
      macdCandles,
      mobileMacdCandles,
      modeLabels,
      macdBoardVisible,
      macdRouteVisible,
      selectorWorks,
      productNavVisible,
      previewPlanVisible,
      mobileOverflow,
      errors,
      useMocks,
      screenshots: [path.join(outputDir, "tidesight-local-desktop.png"), path.join(outputDir, "tidesight-macd-local-desktop.png"), path.join(outputDir, "tidesight-macd-local-mobile.png")],
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
