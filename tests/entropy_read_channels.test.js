const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(handler) {
  const elements = new Map(), intervals = [];
  const element = id => elements.get(id) || (elements.set(id, {
    textContent:'', innerHTML:'', value:'', style:{}, dataset:{}, title:'',
    classList:{add(){},remove(){},toggle(){}}, addEventListener(){},
    setAttribute(){}, querySelector(){ return element(id+'-b'); },
  }),elements.get(id));
  const context = vm.createContext({console, AbortSignal, Date, Map, Set,
    setInterval(fn){intervals.push(fn)}, clearInterval(){}, alert(){},
    document:{getElementById:element,addEventListener(){},querySelectorAll(){return []}},
    fetch:async(url,init)=>({ok:true,json:async()=>handler(url,init)})});
  vm.runInContext(fs.readFileSync('hedge-ops/engines/entropy/src/parallax_hedge/web/app.js','utf8'),context);
  return {context,element,intervals};
}
const stats = {ledger:{total:{fills:114,volume:109172,fees:16.54},venues:{},by_asset:{}},
  balances:{entropy:{equity:236,available:40,unrealized:2,positions:1},arcus:{equity:159,available:19,unrealized:14,positions:1}},account_errors:{},dry_run:true};
const tasks = {dry_run:true,tasks:[{asset:'SNDK',leverage:6,rotation_hours:1}],decisions:[]};
function response(url) {
  if(url.includes('/stats'))return stats;
  if(url.includes('/status'))return {version:'1.6.1',dry_run:true};
  if(url.includes('/tasks'))return tasks;
  if(url.includes('/cycles'))return {cycles:[{asset:'SNDK',plan:'idle',created_at:1,reason:'verified'}]};
  if(url.includes('/spreads'))return {assets:[]};
  return {};
}
test('stalled funding cannot block account, task, cycle or health rendering; repeated polls do not overlap',async()=>{
  let fundingCalls=0, release;
  const {context,element}=fixture(url=>url.includes('/funding')?(fundingCalls++,new Promise(resolve=>release=resolve)):response(url));
  await tick();
  assert.match(element('ledger-grid').innerHTML,/236\.00/);
  assert.match(element('task-list').innerHTML,/SNDK/);
  assert.match(element('cycle-log').innerHTML,/verified/);
  assert.equal(element('conn-title').textContent,'引擎已连接 · 行情待就绪');
  const p=vm.runInContext('Promise.all([load(false),load(true),load(false)])',context);
  await tick(); assert.equal(fundingCalls,1);
  release({ready:false,error:'Entropy metadata timeout',rows:[],accounts:{errors:{entropy:'timeout'}}});
  await p;
  assert.equal(element('conn-title').textContent,'引擎已连接 · 行情异常');
  assert.equal(element('pos-meta').textContent,'持仓待核实');
  assert.match(element('task-list').innerHTML,/SNDK/);
});
test('cycle read failure does not discard task list, mode or unsaved form',async()=>{
  let failCycles=true;
  const {context,element}=fixture(url=>{
    if(url.includes('/cycles')&&failCycles)throw Error('cycle transport timeout');
    if(url.includes('/funding'))return {ready:false,rows:[]};
    return response(url);
  });
  await tick();
  assert.match(element('task-list').innerHTML,/SNDK/);
  assert.equal(element('mode-pill-b').textContent,'演练 · 不下单');
  vm.runInContext('formTouched=true',context);
  element('f-leverage').value='9';
  failCycles=false;
  await vm.runInContext('Promise.all([loadTasks(),loadCycles()])',context);
  assert.equal(element('f-leverage').value,'9');
  assert.match(element('cycle-log').innerHTML,/verified/);
});
test('unavailable stats show section error without fabricating zero or replacing confirmed ledger',async()=>{
  let failed=false;
  const {context,element}=fixture(url=>{
    if(url.includes('/stats')&&failed)throw Error('account channel timeout');
    if(url.includes('/funding'))return {ready:false,rows:[]};
    return response(url);
  });
  await tick();const confirmed=element('ledger-grid').innerHTML;
  failed=true;await vm.runInContext('loadStats()',context);
  assert.equal(element('ledger-grid').innerHTML,confirmed);
  assert.match(element('ledger-meta').textContent,/已保留上次展示/);
  assert.match(element('ledger-note').textContent,/account channel timeout/);
});
