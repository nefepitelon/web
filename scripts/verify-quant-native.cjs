const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.QUANT_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.QUANT_BASE_URL || 'http://localhost:3026';
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.QUANT_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage({viewport:{width:1500,height:1050}});
  const errors = [], brokenAssets = [];
  page.on('pageerror',error => errors.push(error.message));
  page.on('response',response => {if (response.status() >= 400 && /\/quant-native\/.*\.(?:m?js|css|woff2?|svg|png)(?:\?|$)/.test(response.url())) brokenAssets.push({url:response.url(),status:response.status()});});
  fs.mkdirSync('artifacts/quant-native',{recursive:true});
  try {
    for (const engine of ['freqtrade','jesse','nautilus','lean','hummingbot','octobot']) {
      await page.goto(`${base}/quant-suite/${engine}`,{waitUntil:'domcontentloaded',timeout:120000});
      await page.locator('h1').waitFor();
      assert.equal(await page.locator('h1').count(),1);
      assert.equal(await page.locator(`a[href="/quant-suite/${engine}/control"]`).count() > 0,true);
      if (['freqtrade','jesse'].includes(engine)) {
        await page.frameLocator('iframe').locator('body').waitFor();
        const frame = page.frames().find(frame => frame.url().includes(`/quant-native/${engine}`));
        assert.ok(frame,`actual ${engine} iframe`);
        await frame.waitForFunction(() => document.body.innerText.length > 30);
        if (engine === 'freqtrade') await frame.locator('#app header').waitFor();
        if (engine === 'jesse') await frame.locator('#__nuxt').filter({hasText:/Jesse/}).waitFor();
        assert.ok((await frame.locator('body').innerText()).length > 30,`${engine} original UI must render`);
        assert.ok(!/Application error:|This page could not be found/.test(await frame.locator('body').innerText()));
      } else if (['nautilus','lean'].includes(engine)) {
        assert.equal(await page.getByRole('tab',{name:/官方 SDK/}).getAttribute('aria-selected'),'true');
        assert.ok((await page.locator('pre').innerText()).length > 100,'real upstream source must be present');
      }
      await page.screenshot({path:`artifacts/quant-native/${engine}-desktop.png`,fullPage:true});
    }
    await page.goto(`${base}/quant-native/freqtrade/settings`,{waitUntil:'domcontentloaded'});
    await page.locator('#app header').waitFor();
    assert.ok((await page.locator('body').innerText()).length > 40,'upstream SPA deep link');
    await page.goto(`${base}/quant-native/jesse/login`,{waitUntil:'domcontentloaded'});
    await page.locator('#__nuxt').filter({hasText:/Jesse/}).waitFor();
    assert.ok((await page.locator('body').innerText()).length > 30,'Jesse deep link');
    await page.setViewportSize({width:390,height:844});
    for (const route of ['freqtrade','lean','devices']) {
      await page.goto(`${base}/quant-suite/${route}`,{waitUntil:'domcontentloaded'});
      await page.locator('h1').waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),`${route} mobile overflow`);
      await page.screenshot({path:`artifacts/quant-native/${route}-mobile.png`,fullPage:true});
    }
    assert.equal(await page.locator('a[download][href="/downloads/启动量化交易集.bat"]').count(),1);
    const denied = await page.request.get(`${base}/api/quant-suite/devices`); assert.equal(denied.status(),401);
    const nativeDenied = await page.request.get(`${base}/api/quant-suite/native/freqtrade/api/v1/balance`); assert.equal(nativeDenied.status(),401);
    const csrf = await page.request.post(`${base}/api/quant-suite/devices`,{headers:{Origin:'https://untrusted.invalid'},data:{name:'denied',engines:['freqtrade']}}); assert.equal(csrf.status(),403);
    assert.deepEqual(brokenAssets,[]);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,base,upstreamInterfaces:2,sdkSources:2,serverUiEntrypoints:2,mobileRoutes:3,guestAndCsrfGates:true,errors,brokenAssets}));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1);});
