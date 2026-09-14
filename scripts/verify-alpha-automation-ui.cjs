// Isolated browser verification. Every request is fulfilled locally; no exchange or production API is contacted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cheerio = require('cheerio');
require('tsx/cjs');
const {DEFAULT_ALPHA_AUTOMATION_SETTINGS} = require('../lib/alpha-execution/automation-strategy.ts');
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.ALPHA_PLAYWRIGHT_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const repo = path.resolve(__dirname, '..');

(async () => {
  const browser = await playwright.chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let settings = {...DEFAULT_ALPHA_AUTOMATION_SETTINGS,minScore:70};
    let config = {enabled:false,status:'disabled',version:'fixture-v1',market:'futures'};
    let strategySelectionRequired = true;
    let unavailable = false;
    let recommendationMode = 'ai';
    let warnParameters = false;
    let rejectParameters = false;
    let heldStatusRead = null;
    const posts = [];
    let eventDetailReads = 0;
    const candidate = {symbol:'BTCUSDT',side:'LONG',alphaScore:null,matchedStrategies:['strong_signal'],independentSources:['signal'],notional:50,marginRequired:25,leverage:2,entryPrice:100,stopLoss:98,takeProfit:104,estimatedLossWithCosts:1.2,maxHoldingMinutes:120};
    const parameterWarning = {code:'STOP_SLIPPAGE_RANGE_CONFLICT',message:'止损范围 1%–1.5% 无法覆盖允许的 ±0.3% 价格变化；做多至少需要 1.5922%，做空至少需要 1.6078%。当前配置未被修改。',details:{blockedSides:['LONG','SHORT']}};
    const diagnosticRejections = [{symbol:'XRPUSDT',reason:'NO_SELECTED_STRATEGY_MATCH',details:{strategyChecks:[{strategy:'strong_signal',source:'signal',message:'强信号：原始信号超过 10 分钟上限',observations:[{side:'LONG',ageBasis:'event',ageMinutes:12,maxAgeMinutes:10,snapshotAt:Date.now(),observedAt:Date.now()-720000,sameCoinCount:2,issues:[{code:'SIGNAL_TOO_OLD',message:'原始信号已过去 12 分钟，超过 10 分钟上限'}]}]}]}},{symbol:'SOLUSDT',reason:'ATR_STOP_EXCEEDS_LIMIT',message:'P2 已命中；ATR 2% × 2 要求止损 4%，超过最大 3%',detail:'<img src=x onerror=alert(1)>'}];
    const sourceStatus = [{source:'risk_pool',ok:true,count:2,observedAt:Date.now(),message:'当前池快照已读取'},{source:'signal',ok:false,count:0,observedAt:null,message:'原始时间未知'}];
    const header = fs.readFileSync(path.join(repo,'alpha-radar.html'),'utf8').match(/<div class="panel-head aat-panel-head">[\s\S]*?<\/p><\/div><\/div>/)[0];
    const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/alpha-scanner.css"><link rel="stylesheet" href="/alpha-auto-trading.css"></head><body><div class="app-shell sidebar-collapsed"><aside class="sidebar" style="width:68px"></aside><div class="workspace"><main style="padding:12px"><section class="panel alpha-auto-trading" id="auto-trading">${header}<div id="alpha-auto-trading-root"></div></section></main></div></div><script src="/alpha-auto-trading.js"></script></body></html>`;
    const actual = cheerio.load(fs.readFileSync(path.join(repo,'alpha-radar.html'),'utf8'));
    actual('script,link,iframe').remove();
    actual('img').removeAttr('src').removeAttr('srcset');
    actual('head').append('<link rel="stylesheet" href="/alpha-scanner.css"><link rel="stylesheet" href="/alpha-auto-trading.css">');
    actual('#paper').addClass('environment-portfolio environment-live');
    actual('#portfolio-title').text('生产实盘组合 · 隔离验证样本');
    actual('#portfolio-kicker').text('LOCAL FIXTURE · NO EXCHANGE REQUESTS');
    actual('#portfolio-footnote').text('隔离验证样本，不代表真实持仓或成交');
    actual('#paper-equity,#paper-pnl,#paper-exposure').text('—');
    actual('body').append('<script src="/fixture-execution.js"></script><script src="/alpha-auto-trading.js"></script>');
    const scannerSource = fs.readFileSync(path.join(repo,'alpha-scanner.js'),'utf8');
    const sourceSlice = (start,end) => scannerSource.slice(scannerSource.indexOf(start),scannerSource.indexOf(end));
    const binding = {reservationId:'fixture-reservation',source:'alpha-auto:fixture-reservation',entryOrderId:'fixture-entry'};
    const fixturePositions = ['BTCUSDT','ETHUSDT','SOLUSDT','DOGEUSDT'].map((symbol,index)=>({id:'fixture-position-'+index,environment:'LIVE',market:'FUTURES',symbol,side:'LONG',quantity:1,entryPrice:100,markPrice:101,stopLoss:98,takeProfit:105,unrealizedPnl:1,state:'PROTECTION_ACTIVE',openedAt:'2026-09-11T00:00:00Z',isAutomation:index===0||index===3,automationOrder:index===0||index===3?binding:null,plan:{intent:{source:index===0?binding.source:index===1?'alpha-radar':index===2?'telegram':'manual',leverage:2}}}));
    const fixtureOrders = fixturePositions.slice(0,3).map((position,index)=>({...position,role:'ENTRY',status:index===2?'NEW':'FILLED',filledQuantity:index===2?0:1,averagePrice:100,createdAt:position.openedAt,clientOrderId:'fixture-client-'+index,...(index===2?{isAutomation:true,automationOrder:binding,plan:{intent:{source:binding.source}}}:{})}));
    const executionFixtureScript = `const alphaExecutionConfig={activeMode:'live',defaultMarket:'futures'}; const alphaExecutionSnapshot=${JSON.stringify({positions:fixturePositions,orders:fixtureOrders})};
      const paperRows=document.querySelector('#paper-rows'), executionOrderList=document.querySelector('#execution-order-list'), executionOrderCount=document.querySelector('#execution-order-count');
      const executionEnum=value=>String(value||'').toLowerCase(), escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      const formatRiskPrice=value=>String(value??'—'), formatSignedMoney=value=>String(value), executionMarketLabel=value=>value, executionModeLabel=value=>String(value||'LIVE').toUpperCase();
      const formatPaperOrderTime=value=>({iso:value,full:value,date:'2026/09/11',time:'08:00:00'});
      ${sourceSlice('function activeExecutionPositions()', 'function activeExecutionPortfolioStats()')}
      ${sourceSlice('function automationTradeBadge(', 'function renderExecutionPositions()')}
      ${sourceSlice('function renderActiveExecutionPortfolio()', 'async function closeActiveLivePosition(')}
      ${sourceSlice('function syncLiveUnlockAcknowledgements()', 'async function unlockAlphaLive()')}
      ${sourceSlice('const mobileMenu =', 'document.querySelectorAll(".side-nav a")')}
      renderActiveExecutionPortfolio(); renderExecutionOrders(); initializeLiveUnlockHelp();
      document.querySelectorAll('#live-ack-funds,#live-ack-withdraw').forEach(input=>input.addEventListener('change',syncLiveUnlockAcknowledgements));`;
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      assert.equal(url.origin,'http://alpha-ui.test','Unexpected request was prevented');
      if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:fixture});
      if (url.pathname === '/execution-layout') return route.fulfill({contentType:'text/html',body:actual.html()});
      if (url.pathname === '/fixture-execution.js') return route.fulfill({contentType:'text/javascript',body:executionFixtureScript});
      if (['/alpha-scanner.css','/alpha-auto-trading.css','/alpha-auto-trading.js'].includes(url.pathname)) return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(repo,url.pathname.slice(1)),'utf8')});
      if (url.pathname === '/api/alpha-execution/automation/events/fixture-scan') {
        eventDetailReads++;
        return route.fulfill({json:{ok:true,id:'fixture-scan',summary:{candidateCount:0,rejectionCounts:[{reason:'NO_SELECTED_STRATEGY_MATCH',count:1},{reason:'ATR_STOP_EXCEEDS_LIMIT',count:1}],rejections:diagnosticRejections,parameterWarnings:[parameterWarning],sourceStatus}}});
      }
      if (url.pathname !== '/api/alpha-execution/automation') return route.fulfill({status:404,body:''});
      if (route.request().method() === 'GET' && heldStatusRead) {
        const held = heldStatusRead; heldStatusRead = null;
        const reply = held.failure ? {status:503,json:{ok:false,message:'fixture delayed status unavailable'}}
          : {json:{ok:true,settings:{...settings},config:{...config},strategySelectionRequired,events:[]}};
        held.started(); await held.released;
        return route.fulfill(reply);
      }
      if (unavailable) return route.fulfill({status:503,json:{ok:false,message:'fixture service unavailable'}});
      let preview, recommendation;
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON(); posts.push(body);
        if (body.action === 'save') { settings = body.settings; config = {...config,version:'fixture-v2'}; strategySelectionRequired=false; }
        if (body.action === 'preview') {
          if(rejectParameters) return route.fulfill({status:400,json:{ok:false,message:'参数预检失败',issues:[{path:['settings','maxStopLossPct'],message:'需要覆盖允许的价格变化'}]}});
          preview = {candidates:warnParameters?[]:[candidate],blockedReason:warnParameters?'NO_ELIGIBLE_CANDIDATE':null,parameterWarnings:warnParameters?[parameterWarning]:[],sourceStatus,rejections:[{symbol:'<img src=x onerror=alert(1)>',reason:'SIGNAL_STALE'},{symbol:'ETHUSDT',reason:'PROTECTION_PRICE_RANGE_UNAVAILABLE'},...diagnosticRejections]};
        }
        if (body.action === 'recommend') {
          if (recommendationMode === 'failure') return route.fulfill({status:503,json:{ok:false,message:'fixture recommendation unavailable'}});
          recommendation = {source:recommendationMode==='rules'?'rules':'ai',model:'fixture-model',settings:{...DEFAULT_ALPHA_AUTOMATION_SETTINGS,orderNotional:recommendationMode==='rules'?30:35},summary:'<b>根据账户和风险约束提供参数建议</b>',reasons:['更低的名义金额保留风险空间','<img src=x onerror=alert(1)>'],factorReasons:[{field:'orderNotional',evidence:'account_budget',reason:'更低的名义金额保留风险空间'},'<img src=x onerror=alert(1)>'],aiAdjustedFields:['orderNotional'],generatedAt:new Date().toISOString(),blocked:recommendationMode==='rules',blockedReasons:['NO_VERIFIED_EXECUTABLE_MARKET'],provenance:{accountAvailable:true,accountObservedAt:Date.now(),publicMarketAvailable:true,marketObservedAt:Date.now()}};
          if (recommendationMode === 'invalid') recommendation.settings.leverage = 999;
          if (recommendationMode === 'unchanged') recommendation.aiAdjustedFields = [];
          recommendation.settings.selectedStrategies=['anomaly']; // A recommendation must never replace the user's selection.
        }
        if (body.action === 'start') { assert.equal(body.version,'fixture-v2'); assert.equal(body.acknowledged,true); assert.equal(body.confirmation,'START_LIVE_AUTOMATION'); config = {...config,enabled:true,status:'running',expiresAt:new Date(Date.now()+86400000).toISOString()}; }
        if (body.action === 'stop') config = {...config,enabled:false,status:'STOPPING'};
      }
      return route.fulfill({json:{ok:true,settings,config,strategySelectionRequired,preview,recommendation,events:[{id:'fixture-scan',detailAvailable:true,message:'NO_ELIGIBLE_CANDIDATE',createdAt:new Date().toISOString()},{message:'<b>service event</b>',createdAt:new Date().toISOString()}]}});
    });
    async function holdStatus(failure = false) {
      let started, release;
      const captured = new Promise(resolve => { started = resolve; });
      const released = new Promise(resolve => { release = resolve; });
      heldStatusRead = {started,released,failure};
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await captured;
      return async () => {
        const response = page.waitForResponse(row => row.url().includes('/automation') && row.request().method() === 'GET');
        release(); await (await response).finished();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };
    }
    await page.goto('http://alpha-ui.test/');
    await page.waitForFunction(() => document.querySelector('[name=orderNotional]')?.value === '50').catch(async error => { console.error({errors,body:await page.locator('body').innerText()}); throw error; });
    assert.equal(await page.locator('#aat-form input[type=number]').count(),23,'Exactly 23 configurable numeric settings remain');
    assert.equal(await page.locator('#aat-form input[name=selectedStrategies]:checked').count(),5,'Five strategies are selected by default');
    assert.deepEqual(await page.locator('.aat-form-groups .aat-fields').evaluateAll(groups=>groups.map(group=>group.children.length)),[4,4,4,4,4,4],'Each parameter group contains four compact slots');
    assert.equal(await page.locator('#aat-form [name=minIndependentSources], #aat-form [name^=maxAbs], #aat-form [name=minVolumeMultiple], #aat-form [name=maxVolumeMultiple]').count(),0);
    assert.equal(await page.locator('[name=minScore]').inputValue(),'70');
    assert.equal(await page.locator('[name=minScore]').evaluate(input=>input.checkValidity()),true,'Legacy Alpha thresholds remain editable');
    assert.match(await page.locator('#aat-anomaly-note').textContent(),/仅作用于异动榜[\s\S]*严格大于 80/);
    assert.equal(await page.locator('.aat-sizing-note,.aat-stop-note').count(),0,'Long explanations are moved next to the relevant controls');
    assert.match(await page.locator('#aat-help-stop').textContent(),/固定使用启动时的部署版本[\s\S]*停止并等待收尾结束[\s\S]*重新开启/);
    const nominalHelp = page.locator('.aat-help-toggle[popovertarget=aat-help-orderNotional]');
    await nominalHelp.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#aat-help-orderNotional').matches(':popover-open') && document.querySelector('.aat-help-toggle[popovertarget=aat-help-orderNotional]').getAttribute('aria-expanded')==='true');
    assert.match(await page.locator('#aat-help-orderNotional').innerText(),/50 USDT[\s\S]*25 USDT/);
    assert.equal(await nominalHelp.getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#aat-help-orderNotional').matches(':popover-open'));
    assert.equal(await nominalHelp.evaluate(button=>document.activeElement===button),true,'Escape returns focus to the help control');
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>document.querySelector('#aat-help-orderNotional').matches(':popover-open'));
    await page.locator('#aat-help-orderNotional button').click();
    await page.waitForFunction(()=>!document.querySelector('#aat-help-orderNotional').matches(':popover-open'));
    assert.equal(await nominalHelp.evaluate(button=>document.activeElement===button),true,'The explicit close action restores focus');
    assert.equal(await page.locator('#aat-events b').count(),0,'Server events render as text');
    assert.equal(posts.length,0,'Initial loading cannot submit actions');
    assert.match(await page.locator('#aat-save-state').innerText(),/请选择策略并保存参数后开启新交易/);
    assert.equal(await page.locator('#aat-save').isDisabled(),false,'Legacy settings can be explicitly saved without a numeric edit');
    assert.equal(await page.locator('#aat-start').isDisabled(),true,'Legacy strategy scope cannot start before a new save');
    assert.match(await page.locator('.aat-panel-head').innerText(),/LIVE · 真实资金/);
    const actionBounds = await page.locator('.aat-command-bar').boundingBox();
    const fieldBounds = await page.locator('.aat-form-groups').boundingBox();
    assert.ok(actionBounds.y+actionBounds.height<fieldBounds.y,'Status and controls precede parameters');
    for(const input of await page.locator('[name=selectedStrategies]').all()) await input.uncheck();
    assert.equal(await page.locator('#aat-strategy-error').isVisible(),true);
    for(const id of ['aat-save','aat-recommend','aat-preview','aat-start']) assert.equal(await page.locator('#'+id).isDisabled(),true,'Empty strategy selection blocks '+id);
    assert.equal(posts.length,0,'Empty selection never causes a request');
    await page.locator('[name=selectedStrategies][value=strong_signal]').check();
    assert.match(await page.locator('#aat-selected-strategy-count').innerText(),/1 \/ 5/);
    await page.locator('[name=orderNotional]').fill('400');
    await page.locator('#aat-preview').click();
    assert.match(await page.locator('#aat-form-error').innerText(),/目标名义金额不能超过名义金额上限/);
    assert.equal(posts.length,0,'An invalid parameter combination is explained before submitting');
    await page.locator('[name=orderNotional]').fill('40');
    assert.equal(await page.locator('#aat-start').isDisabled(),true,'Unsaved parameters cannot start');
    await page.locator('#aat-recommend').click();
    await page.waitForFunction(() => document.querySelector('[name=orderNotional]').value === '35');
    assert.equal(posts[0].action,'recommend');
    assert.equal(posts[0].settings.orderNotional,40,'Recommendation receives current unsaved draft');
    assert.equal(posts[0].settings.enabled,false);
    assert.equal(posts[0].settings.minScore,70,'A legacy threshold does not block creating a draft');
    assert.deepEqual(posts[0].settings.selectedStrategies,['strong_signal']);
    assert.deepEqual(await page.locator('[name=selectedStrategies]:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['strong_signal'],'AI recommendations preserve a single selected strategy');
    assert.equal(settings.orderNotional,50,'Recommendation must not persist settings');
    assert.equal(posts.some(row=>['save','start'].includes(row.action)),false);
    assert.match(await page.locator('#aat-recommendation').innerText(),/AI 参与的参数建议[\s\S]*fixture-model[\s\S]*风险空间/);
    assert.match(await page.locator('.aat-reason-meta').innerText(),/目标名义金额 · 账户预算/);
    assert.match(await page.locator('#aat-recommendation').innerText(),/账户预算：已核验[\s\S]*公开统计：已读取/);
    assert.match(await page.locator('#aat-recommendation').innerText(),/AI 调整字段：目标名义金额/);
    assert.equal(await page.locator('#aat-recommendation b, #aat-recommendation img').count(),0,'Recommendation text is escaped');
    assert.equal(await page.locator('#aat-start').isDisabled(),true,'Recommendation is unsaved until user saves');
    recommendationMode = 'unchanged';
    await page.locator('#aat-recommend').click();
    await page.waitForFunction(() => document.querySelector('#aat-recommendation').textContent.includes('沿用当前保守参数（无额外数值调整）'));
    await page.locator('[name=selectedStrategies][value=p1_three_source]').check();
    await page.locator('[name=orderNotional]').fill('36');
    const refreshed = page.waitForResponse(response => response.url().includes('/automation') && response.request().method()==='GET');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await refreshed;
    assert.equal(await page.locator('[name=orderNotional]').inputValue(),'36','Status refresh preserves edited recommendation');
    assert.deepEqual(await page.locator('[name=selectedStrategies]:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['p1_three_source','strong_signal'],'Status refresh preserves multiple strategy selections');
    recommendationMode = 'failure';
    const releaseBeforeFailure = await holdStatus();
    await page.locator('#aat-recommend').click();
    await page.waitForFunction(() => document.querySelector('#aat-status-detail').textContent.includes('fixture recommendation unavailable'));
    assert.equal(await page.locator('[name=orderNotional]').inputValue(),'36','Recommendation failure preserves draft');
    await releaseBeforeFailure();
    assert.match(await page.locator('#aat-status-detail').innerText(),/fixture recommendation unavailable/,'An older successful GET cannot clear an action error');
    assert.equal(await page.locator('[name=orderNotional]').inputValue(),'36');
    recommendationMode = 'invalid';
    await page.locator('#aat-recommend').click();
    await page.waitForFunction(() => document.querySelector('#aat-status-detail').textContent.includes('推荐参数不完整'));
    assert.equal(await page.locator('[name=orderNotional]').inputValue(),'36','Malformed recommendation preserves draft');
    recommendationMode = 'rules';
    await page.locator('#aat-recommend').click();
    await page.waitForFunction(() => document.querySelector('[name=orderNotional]').value === '30');
    assert.match(await page.locator('#aat-recommendation').innerText(),/规则参数参考 · 非 AI 生成/);
    assert.match(await page.locator('#aat-recommendation .aat-blocked').innerText(),/当前执行条件未满足[\s\S]*核验通过的可执行市场/);
    assert.doesNotMatch(await page.locator('#aat-recommendation header').innerText(),/fixture-model/);
    assert.deepEqual(await page.locator('[name=selectedStrategies]:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['p1_three_source','strong_signal'],'Rule recommendations also preserve strategy selections');
    await page.locator('[name=orderNotional]').fill('40');
    const releaseBeforeSave = await holdStatus();
    await page.locator('#aat-save').click();
    await page.waitForFunction(() => document.querySelector('#aat-save').disabled && !document.querySelector('[name=orderNotional]').disabled);
    assert.equal(posts.filter(row=>row.action==='save').length,1);
    assert.equal(posts.find(row=>row.action==='save').settings.enabled,false,'Saving never enables execution');
    assert.equal(posts.find(row=>row.action==='save').settings.orderNotional,40);
    assert.doesNotMatch(await page.locator('#aat-save-state').innerText(),/请选择策略/,'Explicit save clears the legacy selection gate');
    assert.deepEqual(posts.find(row=>row.action==='save').settings.selectedStrategies,['p1_three_source','strong_signal']);
    assert.deepEqual(Object.keys(posts.find(row=>row.action==='save').settings).sort(),Object.keys(DEFAULT_ALPHA_AUTOMATION_SETTINGS).sort(),'The saved contract contains no removed limits');
    await releaseBeforeSave();
    assert.equal(await page.locator('[name=orderNotional]').inputValue(),'40','A GET captured before save cannot restore the old saved parameters');
    assert.equal(await page.locator('#aat-save').isDisabled(),true,'Saved parameters remain clean after an old GET');
    const releaseFailureBeforePreview = await holdStatus(true);
    await page.locator('#aat-preview').click();
    await page.locator('.aat-candidate').waitFor();
    assert.equal(await page.locator('#aat-preview-result img').count(),0,'Candidate rejection text is escaped');
    assert.match(await page.locator('#aat-preview-result').textContent(),/ETHUSDT · 允许价格范围内无法同时满足止损上下限/,'Protection price range failures have an actionable Chinese explanation');
    assert.match(await page.locator('.aat-candidate').innerText(),/保证金约 25 USDT/);
    assert.match(await page.locator('.aat-candidate').innerText(),/未提供 Alpha 评分[\s\S]*命中策略：强信号/);
    assert.doesNotMatch(await page.locator('.aat-candidate header').innerText(),/0 分/,'Missing Alpha scores cannot become zero');
    assert.match(await page.locator('#aat-preview-result').textContent(),/该币种未命中已选策略[\s\S]*原始信号已过去 12 分钟[\s\S]*P2 已命中/);
    assert.match(await page.locator('#aat-preview-result').textContent(),/原始事件时效：12 \/ 10 分钟[\s\S]*同币计数：2/);
    assert.equal(eventDetailReads,0,'Status reads and actions do not load historical metadata');
    await page.getByRole('button',{name:'查看筛选明细',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('#aat-events').textContent.includes('通过筛选：0 个候选'));
    await page.getByRole('button',{name:'收起筛选明细',exact:true}).click();
    await page.getByRole('button',{name:'查看筛选明细',exact:true}).click();
    assert.equal(eventDetailReads,1,'Reopening immutable diagnostics reuses the page cache');
    assert.match(await page.locator('#aat-events').textContent(),/本轮没有满足条件的候选[\s\S]*通过筛选：0 个候选[\s\S]*该币种未命中已选策略：1/);
    assert.doesNotMatch(await page.locator('#aat-events').textContent(),/NO_ELIGIBLE|NO_SELECTED/);
    assert.match(await page.locator('#aat-events').textContent(),/当前池快照已读取[\s\S]*时间未知/);
    await releaseFailureBeforePreview();
    assert.equal(await page.locator('#aat-start').isDisabled(),false,'An older failed GET cannot mark a successful action stale');
    assert.doesNotMatch(await page.locator('#aat-status-detail').innerText(),/fixture delayed status unavailable/);
    warnParameters = true;
    await page.locator('#aat-preview').click();
    await page.waitForFunction(()=>!document.querySelector('#aat-parameter-warnings').hidden);
    assert.match(await page.locator('#aat-parameter-warnings').innerText(),/1.5922%[\s\S]*当前配置未被修改/);
    assert.equal(await page.locator('[name=orderNotional]').inputValue(),'40');
    assert.match(await page.locator('#aat-preview-result').innerText(),/本轮没有满足条件的候选/);
    warnParameters = false; rejectParameters = true;
    await page.locator('#aat-preview').click();
    await page.waitForFunction(()=>document.querySelector('#aat-status-detail').textContent.includes('参数预检失败'));
    assert.match(await page.locator('#aat-status-detail').innerText(),/最大止损距离：需要覆盖允许的价格变化/);
    assert.equal(await page.locator('[name=orderNotional]').inputValue(),'40','Server preflight failures keep the draft');
    rejectParameters = false;
    config = {...config,lastError:'fixture fresh status'};
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.querySelector('#aat-status-detail').textContent === 'fixture fresh status');
    config = {...config,lastError:null};
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => document.querySelector('#aat-status-detail').textContent.includes('自动交易默认关闭'));
    await page.locator('#aat-start').click();
    await page.waitForFunction(() => document.querySelector('#aat-confirm-dialog').open);
    assert.equal(await page.locator('#aat-confirm').isDisabled(),true,'Confirmation requires explicit acknowledgement');
    assert.match(await page.locator('#aat-review').innerText(),/已选策略[\s\S]*P1 · 三来源共振、强信号/);
    assert.equal(posts.filter(row=>row.action==='start').length,0);
    await page.locator('#aat-cancel').click();
    assert.equal(posts.filter(row=>row.action==='start').length,0,'Canceling cannot start execution');
    await page.locator('#aat-start').click();
    await page.waitForFunction(() => document.querySelector('#aat-confirm-dialog').open);
    await page.locator('#aat-ack').check();
    await page.locator('#aat-confirm').click();
    await page.waitForFunction(() => !document.querySelector('#aat-confirm-dialog').open);
    assert.equal(posts.filter(row=>row.action==='start').length,1);
    assert.equal(await page.locator('[name=orderNotional]').isDisabled(),true,'Running parameters are locked');
    assert.equal(await page.locator('[name=selectedStrategies]:enabled').count(),0,'Running strategy choices are locked');
    assert.equal(await page.locator('#aat-recommend').isDisabled(),true,'Running session cannot load recommendations');
    await page.locator('#aat-stop').click();
    await page.waitForFunction(() => document.querySelector('#aat-status-name').textContent.includes('已停止'));
    assert.equal(posts.at(-1).action,'stop');
    assert.equal(await page.locator('[name=orderNotional]').isDisabled(),true,'Stopping locks changes while owned positions are still managed');
    assert.equal(await page.locator('#aat-start').isDisabled(),true,'Finishing session cannot be restarted');
    assert.equal(await page.locator('#aat-recommend').isDisabled(),true);
    config = {...config,status:'STOPPED'};
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[name=orderNotional]')?.value === '40');
    assert.equal(await page.locator('[name=orderNotional]').isDisabled(),false);
    assert.deepEqual(await page.locator('[name=selectedStrategies]:checked').evaluateAll(inputs=>inputs.map(input=>input.value)),['p1_three_source','strong_signal'],'Reload restores saved strategies');
    for (const width of [1920,1280,768,390]) {
      await page.setViewportSize({width,height:900});
      await page.locator('.aat-advanced').evaluate(element => { element.open = true; });
      const dimensions = await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,wrappedUnits:[...document.querySelectorAll('.aat-input em')].filter(element=>getComputedStyle(element).whiteSpace!=='nowrap').length,
        cardTops:[...document.querySelectorAll('.aat-form-groups fieldset')].map(element=>element.getBoundingClientRect().top),
        glowCount:[...document.querySelectorAll('.aat-form-groups fieldset')].filter(element=>getComputedStyle(element).animationName==='aat-border-flow').length}));
      assert.ok(dimensions.scroll<=dimensions.width,JSON.stringify(dimensions));
      assert.equal(dimensions.wrappedUnits,0,'Units stay on one line');
      assert.equal(dimensions.glowCount,6,'All six groups have flowing borders');
      if(width===1920) assert.ok(Math.max(...dimensions.cardTops)-Math.min(...dimensions.cardTops)<1,'Wide displays show all six vertical groups in one row');
      if (process.env.ALPHA_UI_SCREENSHOT_DIR) {
        fs.mkdirSync(process.env.ALPHA_UI_SCREENSHOT_DIR,{recursive:true});
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:path.join(process.env.ALPHA_UI_SCREENSHOT_DIR,`alpha-automation-${width}.png`),fullPage:true});
      }
      const help = page.locator('.aat-help-toggle[popovertarget=aat-help-dailyLossLimitPct]');
      await help.click();
      await page.waitForFunction(()=>document.querySelector('#aat-help-dailyLossLimitPct').matches(':popover-open') && document.querySelector('.aat-help-toggle[popovertarget=aat-help-dailyLossLimitPct]').getAttribute('aria-expanded')==='true');
      const helpBounds = await page.locator('#aat-help-dailyLossLimitPct').boundingBox();
      assert.ok(helpBounds.x>=0 && helpBounds.x+helpBounds.width<=width && helpBounds.y>=0 && helpBounds.y+helpBounds.height<=900,'Help remains on-screen at '+width);
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:1920,height:900});
    // The live 1920px page shares its width with navigation and news. Test the
    // actual card budget independently from this isolated fixture's wider main.
    await page.locator('#auto-trading').evaluate(element => { element.style.width = '1200px'; });
    const compactDesktop = await page.locator('#auto-trading').evaluate(panel => {
      const cards = [...panel.querySelectorAll('.aat-form-groups fieldset')];
      return {
        width:panel.getBoundingClientRect().width,
        cardTops:cards.map(card=>card.getBoundingClientRect().top),
        overflowingText:cards.flatMap(card=>{
          const bounds=card.getBoundingClientRect();
          return [...card.querySelectorAll('legend,label > span,.aat-input em,.aat-readonly')].filter(element=>{
            const range=document.createRange(); range.selectNodeContents(element);
            return [...range.getClientRects()].some(rect=>rect.left<bounds.left-1 || rect.right>bounds.right+1);
          }).map(element=>element.textContent);
        }),
        scrollingCards:cards.filter(card=>card.scrollWidth>card.clientWidth+1).length,
      };
    });
    assert.equal(compactDesktop.width,1200);
    assert.ok(Math.max(...compactDesktop.cardTops)-Math.min(...compactDesktop.cardTops)<1,'A 1200px card on a 1920px page shows all six vertical groups');
    assert.deepEqual(compactDesktop.overflowingText,[],'Compact desktop labels and units remain inside their groups');
    assert.equal(compactDesktop.scrollingCards,0,'Compact desktop parameter groups do not overflow');
    if(process.env.ALPHA_UI_SCREENSHOT_DIR) await page.locator('#auto-trading').screenshot({path:path.join(process.env.ALPHA_UI_SCREENSHOT_DIR,'alpha-automation-panel-1200.png')});
    await page.locator('#auto-trading').evaluate(element => { element.style.removeProperty('width'); });
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.aat-form-groups fieldset').evaluateAll(groups=>groups.every(group=>getComputedStyle(group).animationName==='none')),true,'Reduced motion stops the border animation');
    unavailable = true;
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#aat-status-detail')?.textContent.includes('fixture service unavailable'));
    assert.equal(await page.locator('#aat-start').isDisabled(),true,'Unverified service cannot enable start');
    unavailable=false;
    await page.goto('http://alpha-ui.test/execution-layout');
    await page.waitForFunction(()=>document.querySelector('#paper-rows .automation-fill-badge') && document.querySelector('[name=orderNotional]')?.value==='40');
    const verifiedAutomationRows = page.locator('#paper-rows tr').filter({has:page.locator('.automation-fill-badge')});
    assert.equal(await verifiedAutomationRows.count(),1,'Only the server-verified active automated position is labelled');
    assert.match(await verifiedAutomationRows.first().innerText(),/BTCUSDT/);
    assert.equal(await verifiedAutomationRows.first().locator('td').nth(7).innerText(),'alpha-auto','The portfolio source hides the reservation identifier');
    assert.doesNotMatch(await verifiedAutomationRows.first().innerText(),/alpha-auto:/);
    assert.match(await page.locator('#paper-rows tr').filter({hasText:'ETHUSDT'}).innerText(),/alpha-radar/,'Manual portfolio sources remain unchanged');
    assert.equal(await page.locator('#execution-order-list .automation-fill-badge').count(),1,'Only a genuinely filled automated order is labelled');
    assert.equal(await page.locator('#live-unlock-phrase,#fill-live-phrase').count(),0);
    assert.equal(await page.locator('#live-unlock-panel > p').count(),0,'The real interlock card has no always-visible explanatory paragraph');
    const lockHelp=page.locator('#live-lock-help-toggle');
    assert.equal(await page.locator('#live-unlock-panel header #live-lock-help-toggle').count(),1,'The help trigger is beside the actual card title');
    assert.equal(await page.locator('#live-lock-help').isVisible(),false);
    const postsBeforeHelp=posts.length;
    await lockHelp.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#live-lock-help-toggle').getAttribute('aria-expanded')==='true');
    assert.match(await page.locator('#live-lock-help').innerText(),/双重验证管理员[\s\S]*无提现权限 API[\s\S]*健康对账[\s\S]*Kill Switch/);
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.querySelector('#live-lock-help-toggle').getAttribute('aria-expanded')==='false');
    assert.equal(await lockHelp.evaluate(button=>document.activeElement===button),true);
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>document.querySelector('#live-lock-help-toggle').getAttribute('aria-expanded')==='true');
    await page.locator('#live-lock-help button').click();
    await page.waitForFunction(()=>document.querySelector('#live-lock-help-toggle').getAttribute('aria-expanded')==='false');
    assert.equal(await lockHelp.evaluate(button=>document.activeElement===button),true);
    assert.equal(posts.length,postsBeforeHelp,'Opening the interlock explanation performs no API action');
    assert.equal(await page.locator('#unlock-live').isDisabled(),true);
    await page.locator('#live-ack-funds').check();
    assert.equal(await page.locator('#unlock-live').isDisabled(),true);
    await page.locator('#live-ack-withdraw').check();
    assert.equal(await page.locator('#unlock-live').isDisabled(),false,'Both acknowledgements enable the explicit unlock control');
    // No unlock click is made; this document has no production mutation handlers.
    for(const width of [1920,1280,390]) {
      await page.setViewportSize({width,height:1000});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const layout=await page.evaluate(()=>{
        const rect=selector=>{const value=document.querySelector(selector).getBoundingClientRect();return{x:value.x,y:value.y,width:value.width,height:value.height};};
        return{width:innerWidth,scroll:document.documentElement.scrollWidth,vault:rect('.credential-vault'),settings:rect('#execution-config-form'),lock:rect('#live-unlock-panel'),momentum:rect('.momentum-panel'),signals:rect('.pulse-panel'),auto:rect('#auto-trading'),tops:[...document.querySelectorAll('.aat-form-groups fieldset')].map(card=>card.getBoundingClientRect().top)};
      });
      assert.ok(layout.scroll<=width,'Actual Alpha Radar layout overflows: '+JSON.stringify(layout));
      if(width===1920) {
        assert.ok(layout.vault.x<layout.settings.x,'API configuration stays in the left column');
        assert.ok(Math.abs(layout.vault.y-layout.settings.y)<1,'Both execution columns start on the same row');
        assert.ok(Math.abs(layout.settings.x-layout.lock.x)<1 && layout.lock.y>=layout.settings.y+layout.settings.height-1,'The live interlock is stacked below environment settings');
        assert.ok(Math.abs(layout.momentum.height-layout.signals.height)<1,'Momentum and signal cards have equal heights');
        assert.ok(Math.max(...layout.tops)-Math.min(...layout.tops)<1,'The actual 1920px main card shows six parameter columns: '+JSON.stringify(layout));
      }
      if(width===390) assert.ok(layout.vault.y<layout.settings.y && layout.settings.y<layout.lock.y,'Narrow execution sections follow reading order');
      if(process.env.ALPHA_UI_SCREENSHOT_DIR) {
        const capturePanel=async(selector,name)=>{
          const panel=page.locator(selector),bounds=await panel.boundingBox();
          // Fit a whole section into the screenshot viewport so fixed site bars
          // do not get stitched over its lower controls during a tall capture.
          await page.setViewportSize({width,height:Math.max(1000,Math.ceil(bounds.height)+230)});
          await panel.evaluate(element=>window.scrollTo(0,element.getBoundingClientRect().top+scrollY-200));
          await panel.screenshot({path:path.join(process.env.ALPHA_UI_SCREENSHOT_DIR,name)});
        };
        await capturePanel('#execution-control',`alpha-execution-${width}.png`);
        if(width===1920) {
          await lockHelp.click();
          await page.waitForFunction(()=>document.querySelector('#live-lock-help-toggle').getAttribute('aria-expanded')==='true');
          const helpBounds=await page.locator('#live-lock-help').boundingBox(),cardBounds=await page.locator('#execution-control').boundingBox();
          assert.ok(helpBounds.x>=cardBounds.x && helpBounds.x+helpBounds.width<=cardBounds.x+cardBounds.width,'The desktop interlock help stays inside its card boundary');
          await page.locator('#execution-control').screenshot({path:path.join(process.env.ALPHA_UI_SCREENSHOT_DIR,'alpha-execution-help-1920.png')});
          await page.keyboard.press('Escape');
        }
        if(width===1920) await capturePanel('#paper','alpha-portfolio-badge-1920.png');
      }
    }
    assert.deepEqual(errors,[]);
    process.stdout.write('Alpha isolated browser checks passed: six columns in the actual 1920px page and a 1200px card; keyboard popovers; Chinese strategy/time/source diagnostics and parameter warnings; draft/race preservation; mocked start/stop; compact alpha-auto sources; stacked API/settings/interlock layout; aligned momentum/signals; 390/768/1280/1920px without overflow. No production mutations.\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
