const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.TIDESIGHT_PLAYWRIGHT_PATH || "playwright");
const base = process.env.TIDESIGHT_BASE_URL || "http://localhost:3000";
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    const hydrated = page.waitForResponse(response => response.url().includes("/api/tidesight/market"), { timeout: 60_000 });
    await page.goto(`${base}/tidesight-quant`, { waitUntil: "domcontentloaded" });
    await hydrated;
    await page.getByRole("button", { name: "策略实验室" }).click();
    await page.getByRole("heading", { name: "普通策略区", exact: true }).waitFor();
    const auto = page.getByRole("region", { name: "自成交策略区" });
    assert.equal(await auto.locator("article").count(), 6);
    assert.equal(await page.getByLabel("普通策略交易对").locator("option").count(), 12);
    await page.getByLabel("普通策略交易对").selectOption("HYPEUSDT");
    assert.equal(await page.getByLabel("普通策略交易对").inputValue(), "HYPEUSDT");
    await page.screenshot({ path: path.resolve("tidesight-strategies-verified.png"), fullPage: true });
    await page.getByRole("button", { name: "风险闸门" }).click();
    await page.getByRole("heading", { name: "独立风险策略设置" }).waitFor();
    const save = page.getByRole("button", { name: "保存 TideSight 独立策略" });
    assert.equal(await save.isDisabled(), true);
    await page.screenshot({ path: path.resolve("tidesight-risk-verified.png"), fullPage: true });
    const auth = [];
    for (const route of ["/api/tidesight/automation", "/api/tidesight/execution/config", "/api/tidesight/execution/status"]) {
      const response = await page.request.get(`${base}${route}`, { timeout: 60_000 }); auth.push({ route, status: response.status() }); assert.equal(response.status(), 401);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "策略实验室" }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2), false);
    await page.screenshot({ path: path.resolve("tidesight-strategies-mobile-verified.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, automaticStrategies: 6, manualPairs: 12, unauthenticatedWritesDisabled: true, auth, errors }, null, 2));
  } catch (error) {
    await page.screenshot({ path: path.resolve("tidesight-controls-error.png"), fullPage: true });
    console.error({ url: page.url(), errors, body: (await page.locator("body").innerText()).slice(0, 2200) });
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
