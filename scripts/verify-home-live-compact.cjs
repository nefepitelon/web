const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.TIDESIGHT_PLAYWRIGHT_PATH || 'playwright');

// Read-only browser smoke check; no login, trading or account mutations.
(async () => {
  const base = process.env.VERIFY_BASE_URL || 'http://localhost:3108';
  const out = path.join(process.cwd(), 'artifacts', 'home-live-compact');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('.platform-main-nav').waitFor();
    const frameElement = page.locator('iframe').first();
    await frameElement.waitFor();
    const frame = await (await frameElement.elementHandle()).contentFrame();
    await frame.locator('.power-law-toolbar').waitFor({ timeout: 120000 });
    const reports = [];
    for (const width of [1920, 1280, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await frame.evaluate(() => window.scrollTo(0, 0));
      const nav = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, center: r.top + r.height / 2 }; };
        return { header: rect('.platform-shell-header'), brand: rect('.platform-brand'), nav: rect('.platform-main-nav'), account: rect('.platform-header-right'), brandText: getComputedStyle(document.querySelector('.platform-brand > span:last-child')).display, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.ok(Math.abs(nav.brand.center - nav.nav.center) < 2, `navigation wraps at ${width}`);
      assert.ok(Math.abs(nav.account.center - nav.nav.center) < 2, `account wraps at ${width}`);
      assert.equal(nav.brandText === 'none', width <= 1440, `brand visibility at ${width}`);
      assert.equal(nav.overflow, false, `page overflow at ${width}`);
      if (width === 1280) await page.screenshot({ path: path.join(out, 'home-1280.png') });
      await frame.locator('.power-law-toolbar').scrollIntoViewIfNeeded();
      const chart = await frame.evaluate(() => {
        const toolbar = document.querySelector('.power-law-toolbar');
        const r = toolbar.getBoundingClientRect();
        return { height: r.height, width: r.width, scrollWidth: toolbar.scrollWidth, centers: Array.from(toolbar.children).map(e => { const b = e.getBoundingClientRect(); return b.top + b.height / 2; }), overflow: document.documentElement.scrollWidth > innerWidth + 1, actionsInToolbar: toolbar.contains(document.querySelector('#power-glow')) };
      });
      assert.ok(Math.max(...chart.centers) - Math.min(...chart.centers) < 2, `chart wraps at ${width}`);
      assert.ok(chart.height < 90, `chart header too tall at ${width}`);
      assert.equal(chart.overflow, false, `iframe overflow at ${width}`);
      assert.equal(chart.actionsInToolbar, true);
      if (width === 1280) await page.screenshot({ path: path.join(out, 'chart-1280.png') });
      await frame.locator('#power-model-toggle').click();
      const menu = frame.locator('#power-model-options');
      await menu.waitFor({ state: 'visible' });
      const box = await menu.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `menu out of bounds at ${width}`);
      await menu.locator('[data-model-option="sth-ratio"]').click();
      await menu.waitFor({ state: 'hidden' });
      await frame.locator('[data-view="3d"]').click();
      await frame.locator('[data-view="2d"]').click();
      await frame.locator('[data-range="30"]').click();
      await frame.locator('#power-glow').check();
      assert.equal(await frame.locator('#power-glow').isChecked(), true);
      await frame.locator('#power-glow').uncheck();
      reports.push({ width, nav, chart });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await frame.evaluate(() => window.scrollTo(0, 0));
    await frame.locator('#home-btc-price').waitFor();
    await frame.waitForFunction(() => document.querySelector('#home-btc-price').textContent !== '—', null, { timeout: 45000 }).catch(() => {});
    const market = await frame.locator('#home-live-market').innerText();
    assert.ok(!market.includes('63,840.20') && !market.includes('18 bps'), 'mock prices remain');
    const response = await page.request.get(`${base}/api/home-market`, { timeout: 45000 });
    const api = await response.json();
    console.log(JSON.stringify({ base, reports, market, apiStatus: response.status(), api, pageErrors: errors }, null, 2));
    fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify({ base, reports, market, apiStatus: response.status(), api, pageErrors: errors }, null, 2));
    assert.equal(errors.length, 0, 'browser runtime errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
