const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module = {exports:{}};
  vm.runInNewContext(code, {module,exports:module.exports,require(name) {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    if (name === '@prisma/client') return require(name);
    throw Error(name);
  }, Date, Buffer, structuredClone, ...globals});
  return module.exports;
}
const automationOrigin = load('lib/alpha-execution/automation-origin.ts');
test('immutable snapshots coalesce reads and isolate users and caller mutations', async () => {
  const cached = load('lib/box-breakout/snapshot-cache.ts').createSnapshotCache();
  let calls=0;
  const read=async()=>{calls++;return [{score:80}];};
  const [a,b]=await Promise.all([cached('alice:job',read),cached('alice:job',read)]);
  assert.equal(calls,1);a[0].score=0;assert.equal(b[0].score,80);
  assert.equal((await cached('alice:job',read))[0].score,80);
  await cached('bob:job',read);await cached('alice:new-job',read);assert.equal(calls,3);
});
test('snapshot cache expires, evicts at bounds, and retries errors or missing rows', async () => {
  let now=0;class Clock extends Date {static now(){return now;}}
  const cached=load('lib/box-breakout/snapshot-cache.ts',{}, {Date:Clock}).createSnapshotCache({ttlMs:10,maxBytes:50,maxEntries:1});
  let calls=0;const read=async()=>{calls++;return ['ok'];};
  await cached('a',read);now=11;await cached('a',read);assert.equal(calls,2);
  await cached('b',read);await cached('a',read);assert.equal(calls,4);
  await assert.rejects(cached('error',async()=>{throw Error('offline');}));
  assert.deepEqual(await cached('error',read),['ok']);
  assert.equal(await cached('missing',async()=>null),null);
  assert.deepEqual(await cached('missing',read),['ok']);
  const large=async()=>{calls++;return ['x'.repeat(100)];};const before=calls;
  await cached('large',large);await cached('large',large);assert.equal(calls-before,2);
});
test('existing execution configuration is one read, first use remains atomic, retired mode still falls back', async () => {
  let existing={activeMode:'LIVE'},reads=0,creates=0,retired=0;
  const data=load('lib/alpha-execution/data.ts',{'@/lib/prisma':{prisma:{alphaExecutionConfig:{
    findUnique:async()=>{reads++;return existing;},upsert:async()=>{creates++;return {activeMode:'PAPER'};},
    updateMany:async()=>{retired++;},findUniqueOrThrow:async()=>({activeMode:'PAPER'})
  }}},'@/lib/alpha-execution/credentials':{},'./automation-origin':automationOrigin});
  assert.equal((await data.getOrCreateAlphaExecutionConfig('alice')).activeMode,'LIVE');assert.equal(reads,1);assert.equal(creates,0);
  existing=null;await data.getOrCreateAlphaExecutionConfig('alice');assert.equal(creates,1);
  existing={activeMode:'TESTNET'};assert.equal((await data.getOrCreateAlphaExecutionConfig('alice')).activeMode,'PAPER');assert.equal(retired,1);
});
test('display snapshot omits heavy payloads at query time and retains user filters',async()=>{
  const queries={};const model=name=>({findMany:async args=>{queries[name]=args;return [];},groupBy:async()=>[]});
  const prisma={alphaExecutionConfig:{findUnique:async()=>({activeMode:'PAPER',defaultMarket:'FUTURES'})},
    alphaTradingCredential:model('credentials'),alphaExecutionPlan:model('plans'),alphaTradingOrder:model('orders'),alphaTradingPosition:model('positions'),alphaTradingAudit:model('audits'),alphaTradeIntent:model('intents')};
  const data=load('lib/alpha-execution/data.ts',{'@/lib/prisma':{prisma},'@/lib/alpha-execution/credentials':{},'./automation-origin':automationOrigin});
  const result=await data.executionSnapshot('alice');
  assert.equal(result.config.activeMode,'paper');
  for(const query of Object.values(queries)) assert.equal(query.where.userId,'alice');
  assert.equal(queries.orders.omit.rawResponse,true);
  for(const field of ['riskSnapshot','mainOrder','protectionOrders','safeguards']) assert.equal(queries.plans.select[field],undefined);
  assert.equal(queries.audits.select.metadata,undefined);assert.equal(queries.audits.select.message,true);
});

test('execution snapshots bind automated fills within each user and do not label manual or unverified orders',async()=>{
  const order=(userId,planId,symbol,source,patch={})=>({
    id:userId+'-'+planId+'-entry',userId,planId,symbol,side:'BUY',environment:'LIVE',market:'FUTURES',role:'ENTRY',
    filledQuantity:1,exchangeOrderId:userId+'-'+planId+'-exchange',plan:{intent:{source}},...patch,
  });
  const orders=[
    order('alice','alice-auto','BTCUSDT','alpha-auto:alice-reservation'),
    order('alice','alice-manual','ETHUSDT','alpha-radar'),
    order('alice','alice-pending','SOLUSDT','alpha-auto:pending-reservation',{filledQuantity:0}),
    order('alice','alice-no-reference','ADAUSDT','alpha-auto:no-reference-reservation',{exchangeOrderId:null}),
    // Even a misbound row with another user's plan/source cannot borrow that user's reservation.
    order('alice','bob-auto','XRPUSDT','alpha-auto:bob-reservation'),
    order('bob','bob-auto','XRPUSDT','alpha-auto:bob-reservation'),
  ];
  const positions=orders.map(row=>({id:row.id.replace('-entry','-position'),userId:row.userId,planId:row.planId,
    symbol:row.symbol,side:'LONG',environment:row.environment,market:row.market,state:'PROTECTION_ACTIVE',
    quantity:1,entryPrice:100,markPrice:101,unrealizedPnl:1,plan:row.plan}));
  const reservations=[
    {id:'alice-reservation',userId:'alice',planId:'alice-auto',symbol:'BTCUSDT',side:'LONG'},
    {id:'pending-reservation',userId:'alice',planId:'alice-pending',symbol:'SOLUSDT',side:'LONG'},
    {id:'no-reference-reservation',userId:'alice',planId:'alice-no-reference',symbol:'ADAUSDT',side:'LONG'},
    {id:'bob-reservation',userId:'bob',planId:'bob-auto',symbol:'XRPUSDT',side:'LONG'},
  ];
  const queries=[];
  let currentUser;
  const query=(model,args)=>{
    assert.equal(args.where.userId,currentUser,model+' must be scoped to the requested user');
    queries.push({model,userId:currentUser,args});
  };
  const readRows=(model,rows,args)=>{
    query(model,args);
    const where=args.where;
    return structuredClone(rows.filter(row=>row.userId===where.userId
      &&(!where.planId || where.planId.in.includes(row.planId))
      &&(!where.environment || row.environment===where.environment)
      &&(!where.market || row.market===where.market)
      &&(!where.role || row.role===where.role)
      &&(!where.filledQuantity || row.filledQuantity>where.filledQuantity.gt)
      &&(!where.exchangeOrderId || row.exchangeOrderId!==where.exchangeOrderId.not)));
  };
  const emptyModel=model=>({findMany:async args=>{query(model,args);return [];},groupBy:async args=>{query(model,args);return [];}});
  const prisma={
    alphaExecutionConfig:{findUnique:async args=>{query('config',args);return{activeMode:'LIVE',defaultMarket:'FUTURES'};}},
    alphaTradingCredential:emptyModel('credentials'),alphaExecutionPlan:emptyModel('plans'),alphaTradingAudit:emptyModel('audits'),alphaTradeIntent:emptyModel('intents'),
    alphaTradingOrder:{findMany:async args=>{
      assert.equal((args.include?.plan || args.select?.plan)?.select.intent.select.source,true,'Both display and fill proof queries include the intent source');
      return readRows('orders',orders,args);
    }},
    alphaTradingPosition:{findMany:async args=>{
      assert.equal(args.include.plan.select.intent.select.source,true);
      return readRows('positions',positions,args);
    },groupBy:async args=>{query('positionTotals',args);return [];}},
    alphaAutomationOrder:{findMany:async args=>readRows('reservations',reservations,args)},
  };
  const data=load('lib/alpha-execution/data.ts',{'@/lib/prisma':{prisma},'@/lib/alpha-execution/credentials':{},'./automation-origin':automationOrigin});
  currentUser='alice';
  const alice=await data.executionSnapshot('alice');
  for(const rows of [alice.orders,alice.positions]) {
    assert.ok(rows.every(row=>row.userId==='alice'),'Another user must not appear in the snapshot');
    assert.deepEqual(Array.from(rows.filter(row=>row.isAutomation),row=>row.planId),['alice-auto']);
    const automated=rows.find(row=>row.planId==='alice-auto');
    assert.deepEqual(JSON.parse(JSON.stringify(automated.automationOrder)),{
      reservationId:'alice-reservation',source:'alpha-auto:alice-reservation',entryOrderId:'alice-alice-auto-entry',
    });
    for(const row of rows.filter(row=>row.planId!=='alice-auto')) {
      assert.equal(row.isAutomation,false,row.planId);
      assert.equal(row.automationOrder,null,row.planId);
    }
  }
  currentUser='bob';
  const bob=await data.executionSnapshot('bob');
  for(const rows of [bob.orders,bob.positions]) {
    assert.equal(rows.length,1);
    assert.equal(rows[0].userId,'bob');
    assert.equal(rows[0].isAutomation,true);
    assert.equal(rows[0].automationOrder.reservationId,'bob-reservation');
    assert.equal(rows[0].automationOrder.entryOrderId,'bob-bob-auto-entry');
  }
  for(const userId of ['alice','bob']) {
    const proofs=queries.filter(item=>item.userId===userId && item.model==='orders' && item.args.where.planId);
    assert.equal(proofs.length,1,'Fill proofs are batched per snapshot, not per row');
    assert.equal(proofs[0].args.where.role,'ENTRY');
    assert.equal(proofs[0].args.where.environment,'LIVE');
    assert.equal(proofs[0].args.where.market,'FUTURES');
    assert.equal(proofs[0].args.where.filledQuantity.gt,0);
    assert.equal(proofs[0].args.where.exchangeOrderId.not,null);
    assert.equal(proofs[0].args.where.planId.in.includes('alice-manual'),false);
    assert.equal(queries.filter(item=>item.userId===userId && item.model==='reservations').length,1);
  }
});
test('execution display polling slows only when idle and stops while hidden',()=>{
  const source=fs.readFileSync('alpha-scanner.js','utf8');
  const code=source.slice(source.indexOf('function alphaExecutionHasActiveWork('),source.indexOf('async function hydrateAlphaExecution('));
  const delays=[];const context={document:{hidden:false},alphaExecutionAuthorized:true,alphaExecutionTimer:null,alphaExecutionRefreshMs:15000,alphaExecutionIdleRefreshMs:300000,
    alphaExecutionSnapshot:{positions:[],orders:[]},hydrateAlphaExecution(){},window:{clearTimeout(){},setTimeout(fn,ms){delays.push(ms);return 1;}}};
  vm.createContext(context);vm.runInContext(code,context);
  context.scheduleAlphaExecutionRefresh();assert.equal(delays.at(-1),300000);
  context.alphaExecutionSnapshot.orders=[{status:'NEW'}];context.scheduleAlphaExecutionRefresh();assert.equal(delays.at(-1),15000);
  context.alphaExecutionSnapshot={orders:[],positions:[{state:'UNKNOWN'}]};context.scheduleAlphaExecutionRefresh();assert.equal(delays.at(-1),15000);
  context.document.hidden=true;const count=delays.length;context.scheduleAlphaExecutionRefresh();assert.equal(delays.length,count);
});
test('idle live portfolios do not schedule exchange reconciliation',()=>{
  const source=fs.readFileSync('alpha-scanner.js','utf8');
  const start=source.indexOf('function alphaExecutionHasActiveWork(');
  const helper=source.slice(start,source.indexOf('function scheduleAlphaExecutionRefresh(',start));
  const schedule=source.slice(source.indexOf('function ensureLivePortfolioPullSchedule('),source.indexOf('async function pullLivePortfolioData('));
  const delays=[];const state={textContent:''};const context={document:{hidden:false},alphaExecutionAuthorized:true,alphaExecutionConfig:{activeMode:'live'},
    alphaExecutionSnapshot:{positions:[],orders:[]},livePortfolioPullTimer:null,livePortfolioPulling:false,livePortfolioPullMs:30000,livePortfolioPullState:state,
    pullLivePortfolioData(){},window:{clearTimeout(){},setTimeout(fn,ms){delays.push(ms);return 1;}}};
  vm.createContext(context);vm.runInContext(helper+schedule,context);
  context.ensureLivePortfolioPullSchedule();assert.equal(delays.length,0);assert.match(state.textContent,/无活动订单或持仓/);
  context.alphaExecutionSnapshot.orders=[{status:'NEW'}];context.ensureLivePortfolioPullSchedule();assert.deepEqual(delays,[30000]);
});
test('reconciliation read and write models omit large rows and routine healthy audits',()=>{
  const service=fs.readFileSync('lib/alpha-execution/service.ts','utf8');
  const reconcile=service.slice(service.indexOf('export async function reconcileExecution'),service.indexOf('async function requireLivePosition'));
  assert.match(reconcile,/omit: \{ rawResponse: true \}/);
  assert.match(service,/const credentialSecretSelect = \{[\s\S]*apiSecretEncrypted: true[\s\S]*\} satisfies Prisma\.AlphaTradingCredentialSelect/);
  assert.match(reconcile,/alphaExecutionConfig\.update\([\s\S]*select: \{ id: true \}/);
  assert.match(reconcile,/if \(errors\.length > 0 \|\| config\.reconciliationHealthy !== reconciliationHealthy\)/);
  assert.doesNotMatch(reconcile,/status: errors\.length \? "WARNING" : "OK"/);
});
