const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Module = require('node:module');
require('tsx/cjs');
let instances, commands, calls, behavior;
function matches(row, where = {}) { return Object.entries(where).every(([k,v]) => ['userId_engine','userId_requestId'].includes(k) ? matches(row,v) : row[k] === v); }
function model(collection) {
  const rows = () => collection === 'instance' ? instances : commands;
  const patch = (row, data) => { for (const [k,v] of Object.entries(data)) row[k] = v && typeof v === 'object' && 'increment' in v ? row[k] + v.increment : v; return {...row}; };
  return {
    async findUnique({where}) { const row = rows().find(r => matches(r,where)); return row ? {...row} : null; },
    async findUniqueOrThrow(input) { const row = await this.findUnique(input); assert.ok(row); return row; },
    async findMany({where}) {return rows().filter(r => matches(r,where)).map(r => ({...r}));},
    async create({data}) { const row = {id: randomUUID(), revision: 1, controlSequence: 0, activeCommandId: null, status:'PENDING', createdAt: new Date(), ...data}; rows().push(row); return {...row}; },
    async upsert({where,create,update}) { const row = rows().find(r => matches(r,where)); return row ? patch(row,update) : this.create({data:create}); },
    async update({where,data}) {const row = rows().find(r => matches(r,where)); assert.ok(row); return patch(row,data);},
    async updateMany({where,data}) {const selected = rows().filter(r => matches(r,where)); selected.forEach(r => patch(r,data)); return {count:selected.length};},
  };
}
const prisma = {quantSuiteInstance:model('instance'),quantSuiteCommand:model('command'),async $transaction(fn) {const backup = structuredClone({instances,commands}); try{return await fn(prisma);}catch(e){instances=backup.instances;commands=backup.commands;throw e;}}};
const loader = Module._load;
Module._load = function(name,parent,main) {
  if(name === 'server-only') return {};
  if(name === '@/lib/prisma') return {prisma};
  return loader.call(this,name,parent,main);
};
const gateway = require('../lib/quant-suite/gateway.ts');
const originalFetch = global.fetch;
global.fetch = async (url, init) => {
  const input = JSON.parse(init.body); calls.push(input);
  if(behavior === input.action) throw new Error('fixture timeout');
  const capabilities = behavior === 'blocked' ? [] : ['paper','live','stop','backtest','optimize'];
  return Response.json({ok:true,message:'fixture confirmed',runtime:{state:'ready',capabilities}});
};
const {executeQuantCommand,getQuantSuite} = require('../lib/quant-suite/service.ts');
const {quantConfigSchema,defaultQuantConfig,hasQuantAccess} = require('../lib/quant-suite/validation.ts');
const {QUANT_ENGINES} = require('../lib/quant-suite/catalog.ts');
const viewer = {id:'tenant-a',status:'ACTIVE',role:'admin',plan:'max',needsSecondFactor:false,twoFactorEnabled:true,twoFactorPassed:true};
const command = (action, extras={}) => ({engine:'freqtrade',action,requestId:randomUUID(),...extras});
function reset() {instances=[];commands=[];calls=[];behavior=null;process.env.QUANT_GATEWAY_URL='https://fixture.invalid';process.env.QUANT_GATEWAY_TOKEN='fixture-token-only';}
async function saved(mode='paper') {await executeQuantCommand(viewer,command('save-config',{config:{...defaultQuantConfig('freqtrade'),mode}}));}
test.after(() => {global.fetch=originalFetch;Module._load=loader;delete process.env.QUANT_GATEWAY_URL;delete process.env.QUANT_GATEWAY_TOKEN;});

test('all six engines validate defaults; invalid risk, injection and extra secret fields rejected',() => {
  for(const engine of QUANT_ENGINES) assert.equal(quantConfigSchema.parse(defaultQuantConfig(engine.id)).mode,'paper');
  for(const bad of [{stopLossPct:0},{stakeAmount:Infinity},{strategy:'x;curl bad'},{symbols:['BTC/USDT','BTC/USDT']},{apiSecret:'not-accepted'}]) assert.throws(()=>quantConfigSchema.parse({...defaultQuantConfig('freqtrade'),...bad}));
});
test('anonymous, inactive and incomplete 2FA cannot operate',async()=>{
  reset();assert.equal(hasQuantAccess(null),false);
  for(const change of [{role:'free',plan:'free'},{status:'SUSPENDED'},{needsSecondFactor:true}]) await assert.rejects(executeQuantCommand({...viewer,...change},command('start')), /Max/);
  assert.equal(calls.length,0);
});
test('save is durable and idempotent; reuse with changed payload rejected',async()=>{
  reset();const input=command('save-config',{config:defaultQuantConfig('freqtrade')});
  await executeQuantCommand(viewer,input);await executeQuantCommand(viewer,input);
  assert.equal(instances.length,1);assert.equal(commands.length,1);assert.equal(calls.length,0);
  await assert.rejects(executeQuantCommand(viewer,{...input,config:{...input.config,stakeAmount:200}}),/不同请求/);
});
test('native launch requires successful preflight and remains once per request',async()=>{
  reset();await saved();const input=command('start');await executeQuantCommand(viewer,input);await executeQuantCommand(viewer,input);
  assert.deepEqual(calls.map(c=>c.action),['preflight','start']);
  behavior='blocked';const rejected=await executeQuantCommand(viewer,command('backtest'));assert.equal(rejected.ok,false);assert.equal(calls.filter(c=>c.action==='backtest').length,0);
});
test('live requires admin 2FA plus engine-specific explicit confirmation',async()=>{
  reset();await saved('live');
  await assert.rejects(executeQuantCommand({...viewer,role:'max'},command('start',{confirmation:'LIVE freqtrade'})),/管理员/);
  await assert.rejects(executeQuantCommand({...viewer,twoFactorPassed:false},command('start',{confirmation:'LIVE freqtrade'})),/管理员/);
  await assert.rejects(executeQuantCommand(viewer,command('start',{confirmation:'LIVE lean'})),/LIVE freqtrade/);
  assert.equal(calls.length,0);
  await executeQuantCommand(viewer,command('start',{confirmation:'LIVE freqtrade'}));assert.equal(calls.at(-1).config.mode,'live');
});
test('uncertain launch blocks further starts but allows explicit stop',async()=>{
  reset();await saved();behavior='start';const input=command('start');await assert.rejects(executeQuantCommand(viewer,input),/未知/);
  assert.equal(commands.at(-1).status,'UNKNOWN');assert.ok(instances[0].activeCommandId);
  await assert.rejects(executeQuantCommand(viewer,command('start')),/尚未确认/);
  await executeQuantCommand(viewer,input);assert.equal(calls.filter(c=>c.action==='start').length,1);
  behavior=null;await executeQuantCommand(viewer,command('stop'));assert.equal(instances[0].activeCommandId,null);
  assert.ok(calls.find(c=>c.action==='stop').controlSequence > calls.find(c=>c.action==='start').controlSequence);
});
test('read-only preflight timeout releases lease and does not claim a launched task',async()=>{
  reset();await saved();behavior='preflight';await assert.rejects(executeQuantCommand(viewer,command('start')),/未知/);
  assert.equal(commands.at(-1).status,'REJECTED');assert.equal(instances[0].activeCommandId,null);assert.equal(calls.length,1);
});
test('tenant isolation and absent gateway return unconfigured without manufactured metrics',async()=>{
  reset();await saved();delete process.env.QUANT_GATEWAY_URL;
  const other=await getQuantSuite({...viewer,id:'tenant-b'});assert.equal(other.audits.length,0);assert.equal(other.instances.length,6);
  assert.ok(other.instances.every(i=>i.revision===0&&i.runtime.state==='unconfigured'&&!i.runtime.metrics));
  await assert.rejects(executeQuantCommand(viewer,command('start')),/尚未连接/);assert.equal(calls.length,0);
});
