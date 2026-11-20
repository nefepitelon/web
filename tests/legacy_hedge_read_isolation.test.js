const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(engine,{active=true,handler}={}) {
 const elements=new Map(),events=new Map(),intervals=[],requests=[];
 const el=id=>elements.get(id)||(elements.set(id,{textContent:'',innerHTML:'',value:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},querySelector(){return el(id+'-b')}}),elements.get(id));
 const controls={active};
 const window={hedgeConsoleIsActive:()=>controls.active,addEventListener(name,fn){events.set(name,fn)}};
 const normal=url=>url.includes('/status')?{dry_run:true,stale_max_seconds:180}:url.includes('/stats')?{dry_run:true,balances:{},ledger:{total:{fills:114,volume:109172,fees:16.54},venues:{},by_asset:{}}}:url.includes('/tasks')?{dry_run:true,tasks:[{asset:'SNDK',leverage:6,rotation_hours:1}],decisions:[]}:url.includes('/cycles')?{cycles:[]}:url.includes('/spreads')?{assets:[]}:{ready:true,generated_at:Date.now()/1000,rows:[],accounts:{arcus_configured:true,[engine+'_configured']:true},venues:{}};
 const context=vm.createContext({console,AbortSignal,window,setInterval(fn){intervals.push(fn)},clearInterval(){},alert(){},document:{getElementById:el,addEventListener(){},querySelectorAll(){return []}},fetch:async(url,init)=>{requests.push({url,init});const data=handler?await handler(url,normal):normal(url);return {ok:true,json:async()=>data}}});
 vm.runInContext(fs.readFileSync(`hedge-ops/engines/${engine}/src/parallax_hedge/web/app.js`,'utf8'),context);
 return {el,context,requests,intervals,controls,resume(){controls.active=true;events.get('hedge-console-active')?.()}};
}
for(const engine of ['entropy','lighter']) {
 test(`${engine} hidden console does not poll and resumes independent reads without mutations`,async()=>{
  const f=fixture(engine,{active:false});await tick();assert.equal(f.requests.length,0);
  f.intervals.forEach(fn=>fn());await tick();assert.equal(f.requests.length,0);
  f.resume();await tick();assert.ok(f.requests.some(r=>r.url==='/api/status'));assert.ok(f.requests.some(r=>r.url==='/api/stats'));assert.ok(f.requests.some(r=>r.url==='/api/tasks'));
  assert.ok(f.requests.every(r=>!r.init.method||r.init.method==='GET'));
  assert.match(f.el('task-list').innerHTML,/SNDK/);
 });
 test(`${engine} stalled funding cannot block tasks and its intentional abort never reports engine offline`,async()=>{
  let rejectFunding,releaseFunding,fundingCalls=0;
  const f=fixture(engine,{handler:(url,normal)=>url.includes('/funding')?(fundingCalls++,new Promise((resolve,reject)=>{releaseFunding=resolve;rejectFunding=reject})):normal(url)});
  await tick();assert.match(f.el('task-list').innerHTML,/SNDK/);assert.match(f.el('ledger-grid').innerHTML,/109,172/);
  vm.runInContext('load(false);load(true);load(false)',f.context);await tick();assert.equal(fundingCalls,1);
  f.controls.active=false;const stopped=Error('read paused');stopped.name='AbortError';stopped.hedgeConsoleInactive=true;rejectFunding(stopped);await tick();
  assert.doesNotMatch(f.el('conn-title').textContent,/中断|失败/);
  f.resume();await tick();assert.equal(fundingCalls,2);
  releaseFunding({ready:false,error:'metadata timeout',rows:[],accounts:{errors:{[engine]:'timeout'}}});await tick();
  assert.equal(f.el('conn-title').textContent,'引擎已连接 · 行情异常');assert.equal(f.el('pos-meta').textContent,'持仓待核实');
 });
}
