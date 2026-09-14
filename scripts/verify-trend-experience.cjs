// Isolated browser checks: local production HTML/CSS/chart scripts, clearly synthetic data,
// and no network passthrough. Other page features are not booted (including trading engines).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {load} = require('cheerio');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.TREND_PLAYWRIGHT_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const repo = path.resolve(__dirname, '..');
const output = process.env.TREND_SCREENSHOT_DIR || path.join(os.tmpdir(), 'welink-trend-experience');
const origin = 'http://trend-fixture.test';
const chartScripts = new Set(['trend-indicator-cycle.js', 'product-dashboard.js', 'dashboard-product-carousel.js']);
const publicDataPath=process.env.TREND_PUBLIC_DATA || path.join(repo,'.codex-trend-public.json');
const publicData=fs.existsSync(publicDataPath) ? JSON.parse(fs.readFileSync(publicDataPath,'utf8')) : null;
const fixtureRows = Array.from({length:730}, (_, index) => {
  const price = 17000 * Math.exp(index / 440) * (1 + 0.14 * Math.sin(index / 41) + 0.045 * Math.cos(index / 7));
  return {date:new Date(Date.UTC(2024, 8, 1) + index * 86400000).toISOString().slice(0, 10),price,
    sth:price*(0.84+0.075*Math.sin(index/51)),tmmp:price*(0.7+0.11*Math.cos(index/91)),
    lth:price*0.55,median:price*0.48,ratio:1.3+0.9*Math.sin(index/63),value:1.3+0.9*Math.sin(index/63)};
});
const fixtureData = {ok:true,series:fixtureRows,snapshot:{...fixtureRows.at(-1),current:1.7,average7:1.6,average30:1.4,asOf:'2026-08-31'},
  ratioSnapshot:{current:1.15,average7:1.1,average30:1.05,asOf:'2026-08-31'},
  sources:{mode:'ISOLATED VERIFICATION FIXTURE · SYNTHETIC',history:'ISOLATED VERIFICATION FIXTURE · SYNTHETIC',ratio:'ISOLATED VERIFICATION FIXTURE · SYNTHETIC'}};

function documentFixture(file) {
  const $ = load(fs.readFileSync(path.join(repo,file), 'utf8'));
  $('script').each((_, element) => { if (!chartScripts.has(($(element).attr('src') || '').split('?')[0])) $(element).remove(); });
  // The remaining document is unchanged; the unrelated dashboard engine is deliberately not loaded.
  return $.html();
}
async function until(read, description) {
  const deadline = Date.now()+15000;
  while (Date.now()<deadline) { if (await read()) return; await new Promise(resolve=>setTimeout(resolve,25)); }
  throw new Error(`Timed out: ${description}`);
}
async function createPage(browser, mode, {clock=false, failLoss=false, width=1280, visual=false} = {}) {
  const context = await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1});
  const page = await context.newPage(), errors = [], requests = [];
  let heldRequest=null;
  page.on('pageerror', error=>errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push({method:request.method(),url:request.url()});
    assert.equal(request.method(),'GET','No mutating request is allowed');
    if (url.origin !== origin) return route.fulfill({contentType:'text/css',body:''}); // Fonts, never fetched remotely.
    if (url.pathname === '/' || url.pathname === '/index.html') return route.fulfill({contentType:'text/html',body:documentFixture('index.html')});
    if (url.pathname === '/dashboard.html') return route.fulfill({contentType:'text/html',body:documentFixture('dashboard.html')});
    if (url.pathname.startsWith('/api/')) {
      if (heldRequest?.pathname===url.pathname) {
        const held=heldRequest; heldRequest=null; held.started(); await held.released;
      }
      if (failLoss && url.pathname === '/api/lth-market-cap-loss') return route.fulfill({status:503,json:{ok:false,reason:'Intentional unavailable-indicator fixture'}});
      if (visual && publicData?.ok && url.pathname==='/api/cost-basis') return route.fulfill({json:publicData});
      return route.fulfill({json:fixtureData});
    }
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (relative.endsWith('.js') && !chartScripts.has(relative)) return route.fulfill({contentType:'text/javascript',body:''});
    const candidate = [path.resolve(repo,relative),path.resolve(repo,'public',relative)].find(file=>file.startsWith(repo+path.sep) && fs.existsSync(file) && fs.statSync(file).isFile());
    const extension = path.extname(relative).toLowerCase();
    if (candidate && ['.js','.css','.png','.jpg','.jpeg','.webp','.svg','.woff','.woff2'].includes(extension)) {
      const contentType = {'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff':'font/woff','.woff2':'font/woff2'}[extension];
      return route.fulfill({contentType,body:fs.readFileSync(candidate)});
    }
    return route.fulfill({status:404,body:''});
  });
  if (clock) {
    await page.clock.install({time:new Date('2026-09-10T00:00:00Z')});
    await page.clock.pauseAt(new Date('2026-09-10T00:01:00Z'));
  }
  await page.goto(origin+(mode==='home'?'/index.html':'/dashboard.html'),{waitUntil:'load'});
  await until(()=>page.locator('#power-law[data-indicator="cost-basis"]').count(),'shared chart mount');
  await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto'; const section=document.querySelector('#power-law'); window.scrollTo(0,section.querySelector('.power-law-toolbar').getBoundingClientRect().top+scrollY);});
  await until(()=>page.locator('#power-law').getAttribute('data-indicator-cycle').then(value=>value==='running'),'visible ready cycle');
  return {context,page,errors,requests,holdNext(pathname) {
    let started,release;
    const captured=new Promise(resolve=>{started=resolve;}),released=new Promise(resolve=>{release=resolve;});
    heldRequest={pathname,started,released}; return {captured,release};
  }};
}
const click = (page,selector) => page.locator('#power-law').locator(selector).evaluate(element=>element.click());
const indicator = page => page.locator('#power-law').getAttribute('data-indicator');
async function ready(page, id, failure=false) {
  await until(async()=>await indicator(page)===id && await page.locator('#power-chart-status').evaluate(element=>element.hidden || element.classList.contains('is-error')),'indicator '+id);
  assert.equal(await page.locator('#power-chart-status').evaluate(element=>element.classList.contains('is-error')),failure,'Expected load result for '+id);
  await until(()=>page.locator('#power-law').getAttribute('data-indicator-cycle').then(value=>value==='running'),'cycle after '+id);
}
async function choose(page,id) {
  await click(page,'#power-model-toggle'); await click(page,`[data-model-option="${id}"]`); await ready(page,id);
}
async function afterFullInterval(page,before,after,failure=false) {
  await page.clock.fastForward(24999); assert.equal(await indicator(page),before,'No switch before 25 seconds');
  await page.clock.fastForward(1); await ready(page,after,failure);
}

async function screenshots(browser, mode) {
  const reports=[];
  for (const width of [1920,1280,390]) {
    const h=await createPage(browser,mode,{width,visual:true});
    try {
      const sectionHeight=await h.page.locator('#power-law').evaluate(element=>element.getBoundingClientRect().height);
      await h.page.setViewportSize({width,height:Math.ceil(Math.max(1000,sectionHeight+240))});
      await h.page.evaluate(()=>{const section=document.querySelector('#power-law'); window.scrollTo(0,section.getBoundingClientRect().top+scrollY-200);});
      await until(()=>h.page.locator('#power-chart-status').evaluate(element=>element.hidden),'chart loaded for screenshot');
      await h.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const dimensions = await h.page.evaluate(()=>{
        const canvas=document.querySelector('#power-law-canvas'),metrics=document.querySelector('#power-metrics-panel');
        const bounds=canvas.getBoundingClientRect();
        return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvasWidth:bounds.width,canvasHeight:bounds.height,
          default3D:document.querySelector('#power-law').classList.contains('is-3d'),metricsCollapsed:metrics.classList.contains('is-collapsed')};
      });
      const screenshot=path.join(output,`${mode}-${width}.png`);
      await h.page.locator('#power-law').screenshot({path:screenshot,animations:'allow'});
      reports.push({...dimensions,screenshot});
      process.stdout.write(JSON.stringify({mode,...dimensions,screenshot})+'\n');
      assert.equal(dimensions.default3D,true,mode+' defaults to 3D');
      assert.equal(dimensions.metricsCollapsed,width>=720,'Default metrics visibility at '+width);
      assert.ok(dimensions.scrollWidth<=width+1,mode+' horizontal overflow at '+width);
      assert.deepEqual(h.errors,[],mode+' runtime errors');
    } finally { await h.context.close(); }
  }
  return reports;
}
async function behavior(browser,mode) {
  const h=await createPage(browser,mode,{clock:true,failLoss:true}), {page}=h;
  try {
    assert.equal(await page.locator('#power-law').evaluate(element=>element.classList.contains('is-3d')),true);
    await afterFullInterval(page,'cost-basis','sth-ratio');
    await afterFullInterval(page,'sth-ratio','lth-loss',true);
    await afterFullInterval(page,'lth-loss','rpl');
    await click(page,'[data-view="2d"]'); await click(page,'[data-range="30"]');
    await afterFullInterval(page,'rpl','median-rp');
    assert.equal(await page.locator('#power-law [data-view="2d"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#power-law [data-range="30"]').evaluate(element=>element.classList.contains('active')),true,'Range survives automatic indicator changes');
    await page.clock.fastForward(20000); await choose(page,'cost-basis');
    await afterFullInterval(page,'cost-basis','sth-ratio');
    await click(page,'#power-model-toggle'); await page.clock.fastForward(60000);
    assert.equal(await indicator(page),'sth-ratio','Open menu pauses the cycle');
    await click(page,'#power-model-toggle'); await page.locator('#power-model-toggle').focus();
    await page.clock.fastForward(60000); assert.equal(await indicator(page),'sth-ratio','Closed menu focus pauses the cycle');
    await page.locator('#power-law-canvas').focus();
    await afterFullInterval(page,'sth-ratio','lth-loss',true);
    await choose(page,'cost-basis'); await click(page,'[data-view="3d"]');
    const box=await page.locator('#power-law-canvas').boundingBox();
    await page.mouse.move(box.x+box.width*0.35,Math.min(800,box.y+box.height*0.45)); await page.mouse.down();
    await page.clock.fastForward(60000); assert.equal(await indicator(page),'cost-basis','Pointer drag pauses the cycle');
    await page.mouse.up(); await afterFullInterval(page,'cost-basis','sth-ratio');
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    await until(()=>page.locator('#power-law').getAttribute('data-indicator-cycle').then(value=>value==='waiting'),'offscreen pause');
    await page.clock.fastForward(90000); assert.equal(await indicator(page),'sth-ratio','Offscreen never catches up');
    await page.evaluate(()=>{const canvas=document.querySelector('#power-law-canvas');window.scrollTo(0,canvas.getBoundingClientRect().top+scrollY-100);});
    await until(()=>page.locator('#power-law').getAttribute('data-indicator-cycle').then(value=>value==='running'),'onscreen resumes');
    await afterFullInterval(page,'sth-ratio','lth-loss',true);
    await click(page,'#power-cycle-toggle'); await page.clock.fastForward(90000);
    assert.equal(await indicator(page),'lth-loss','Explicit pause prevents automatic changes');
    await click(page,'#power-cycle-toggle'); await afterFullInterval(page,'lth-loss','rpl');
    const slow=h.holdNext('/api/lth-sth-ratio');
    await click(page,'#power-model-toggle'); await click(page,'[data-model-option="lth-sth"]'); await slow.captured;
    await page.clock.fastForward(15000);
    assert.equal(await indicator(page),'lth-sth','Loading does not advance to another indicator');
    assert.equal(await page.locator('#power-law').getAttribute('data-indicator-cycle'),'waiting');
    slow.release(); await ready(page,'lth-sth'); await afterFullInterval(page,'lth-sth','lth-rp');
    assert.equal(await page.locator('#power-law [data-view="3d"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#power-law [data-range="30"]').evaluate(element=>element.classList.contains('active')),true);
    assert.deepEqual(h.errors,[],mode+' runtime errors');
    process.stdout.write(`${mode}: 25-second order, failure recovery, 2D/3D and range preservation, manual reset, menu/focus/drag/offscreen and explicit pause passed.\n`);
  } finally { await h.context.close(); }
}
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
  try {
    const reports={fixture:'Behavior uses synthetic data and isolated routes; only chart scripts enabled',visualData:publicData?.ok ? `Public read-only cost-basis snapshot ${publicData.generatedAt || ''}` : 'Synthetic verification sample',screenshots:{}};
    for(const mode of ['home','dashboard']) reports.screenshots[mode]=await screenshots(browser,mode);
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(reports,null,2));
    if(process.env.TREND_VISUAL_ONLY!=='1') for(const mode of ['home','dashboard']) await behavior(browser,mode);
    process.stdout.write(`Trend experience verification passed. Screenshots: ${output}\n`);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
