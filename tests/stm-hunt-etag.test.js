const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function fixture(){
  const sourceTime='2026-11-25T08:00:00.000Z';
  const base={asOf:sourceTime,sources:[{id:'wsm-fomo',updatedAt:'2026-11-19T02:23:11.000Z',fetchedAt:sourceTime,checkedAt:sourceTime,sourceAgeSeconds:500000,status:'stale'},
    {id:'verified-chain',updatedAt:null,fetchedAt:sourceTime,count:0,status:'unavailable'}],traders:[{id:'frank',name:'Frank'}],candidates:[],sharedHoldings:[],
    signals:[{id:'S1:1:cex:BTC:bucket',asOf:sourceTime,expiresAt:'2026-11-25T09:00:00.000Z',actionable:true,status:'ready',entities:3,reasons:['exact evidence'],missing:[]}],strategies:[{id:'S1',version:1}],
    metrics:{traders:1},state:{authenticated:true,watchlist:[],paper:[],journal:[],alerts:[],replays:[]},capabilities:{persistence:true}};
  let payload=structuredClone(base),viewer={id:'alice'},evaluations=0;
  const code=ts.transpileModule(fs.readFileSync('app/api/stm-hunt/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,Date,Request,Response,Error,JSON,require(name){
    if(name==='zod'||name==='node:crypto')return require(name);
    if(name==='@/lib/request-security')return{};
    if(name==='@/lib/alpha-execution/access')return{requireAlphaReadOperator:async()=>viewer,alphaExecutionErrorResponse:()=>new Response(null,{status:500})};
    if(name==='@/lib/stm-hunt/service')return{getStmDashboard:async()=>{evaluations++;return payload;}};
    throw Error(`Unexpected dependency ${name}`);
  }});
  return{get:tag=>module.exports.GET(new Request('https://app.test/api/stm-hunt',{headers:tag?{'If-None-Match':tag}:{}})),
    payload:()=>payload,reset:()=>{payload=structuredClone(base);},setViewer:value=>{viewer=value;},evaluations:()=>evaluations};
}
test('STM conditional GET re-evaluates every request and suppresses only non-substantive clock changes',async()=>{
  const h=fixture(),first=await h.get(),tag=first.headers.get('etag');assert.equal(first.status,200);assert.match(tag,/^W\/"[0-9a-f]{64}"$/);
  assert.match(first.headers.get('cache-control'),/private.*no-cache/);assert.equal(first.headers.get('vary'),'Cookie, Authorization');assert.ok(first.headers.get('x-stm-evaluated-at'));
  h.payload().sources[0].sourceAgeSeconds++;h.payload().sources[1].fetchedAt='2026-11-25T08:00:15.000Z';
  h.payload().signals[0].asOf='2026-11-25T08:00:15.000Z';h.payload().signals[0].expiresAt='2026-11-25T09:00:15.000Z';
  const second=await h.get(tag);assert.equal(second.status,304);assert.equal(await second.text(),'');assert.equal(h.evaluations(),2);
  h.payload().signals[0].actionable=false;h.payload().signals[0].status='blocked';h.payload().signals[0].missing=['evidence expired'];
  const expired=await h.get(tag);assert.equal(expired.status,200);assert.notEqual(expired.headers.get('etag'),tag);
});
test('STM ETag includes identities, source checks, reported holders, strategies and private state',async()=>{
  const h=fixture(),tag=(await h.get()).headers.get('etag');
  const changes=[p=>p.traders[0].name='New Name',p=>p.sources[0].checkedAt='2026-11-25T08:01:00Z',p=>p.sharedHoldings.push({id:'chain:contract',holdersCount:3}),p=>p.strategies[0].version++,p=>p.state.watchlist.push('cex:BTC')];
  for(const change of changes){h.reset();change(h.payload());assert.equal((await h.get(tag)).status,200);}
  h.reset();h.setViewer({id:'bob'});assert.equal((await h.get(tag)).status,200,'an account switch cannot retain a prior account response through a 304');
});
