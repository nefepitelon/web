const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.QUANT_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.QUANT_BASE_URL || 'http://localhost:3026';
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.QUANT_CHROME_PATH ? {executablePath:process.env.QUANT_CHROME_PATH} : {})});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  fs.mkdirSync('artifacts/quant-suite', {recursive:true});
  try {
    await page.goto(`${base}/quant-suite`,{waitUntil:'domcontentloaded',timeout:120000});
    await page.getByRole('heading',{name:/量化交易集/}).waitFor();
    assert.equal(await page.locator('main').getByRole('link',{name:/Freqtrade/}).count() > 0,true);
    await page.screenshot({path:path.resolve('artifacts/quant-suite/desktop.png'),fullPage:true});
    await page.locator('.platform-product-menu summary').click();
    const productMenu = page.locator('.platform-product-menu-panel');
    for(const engine of ['freqtrade','nautilus','hummingbot','lean','jesse','octobot']) assert.equal(await productMenu.locator(`a[href="/quant-suite/${engine}"]`).count(),1);
    await page.screenshot({path:path.resolve('artifacts/quant-suite/navigation.png')});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.platform-product-menu').getAttribute('open'),null);
    for(const engine of ['freqtrade','nautilus','hummingbot','lean','jesse','octobot']) {
      await page.goto(`${base}/quant-suite/${engine}`,{waitUntil:'domcontentloaded',timeout:120000});
      assert.equal(await page.locator('h1').count(),1);
      assert.ok(!(await page.locator('h1').innerText()).includes('404'));
    }
    await page.goto(`${base}/quant-suite/freqtrade`,{waitUntil:'domcontentloaded'});
    await page.screenshot({path:path.resolve('artifacts/quant-suite/freqtrade-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.resolve('artifacts/quant-suite/freqtrade-mobile.png'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),'mobile page must not overflow');
    await page.goto(`${base}/quant-suite`,{waitUntil:'domcontentloaded'});
    await page.screenshot({path:path.resolve('artifacts/quant-suite/mobile.png'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1));
    await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.dataset.language='en';});
    await page.getByRole('heading',{name:'Quant Trading Suite',exact:true}).waitFor();
    await page.screenshot({path:path.resolve('artifacts/quant-suite/light-en-mobile.png'),fullPage:true});
    const snapshot=await page.request.get(`${base}/api/quant-suite`);
    assert.equal(snapshot.status(),200);
    const data=await snapshot.json();assert.equal(data.engines.length,6);assert.equal(data.canOperate,false);
    const rejected=await page.request.post(`${base}/api/quant-suite`,{headers:{Origin:base},data:{engine:'freqtrade',action:'start',requestId:'00000000-0000-4000-8000-000000000001'}});
    assert.equal(rejected.status(),401);
    const wrongOrigin=await page.request.post(`${base}/api/quant-suite`,{headers:{Origin:'https://untrusted.invalid'},data:{}});
    assert.equal(wrongOrigin.status(),403);
    const unknown=await page.request.get(`${base}/quant-suite/nonexistent`);assert.equal(unknown.status(),404);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({ok:true,base,engines:6,viewports:['1440x1000','390x844'],errors,api:'guest catalog, authenticated mutation gate, CSRF and 404 verified',screenshots:'artifacts/quant-suite'}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
