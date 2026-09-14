const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const Module = require('node:module');
require('tsx/cjs');
let rows;
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'AND') return value.every(part => matches(row, part));
    if (['userId_engine', 'userId_requestId'].includes(key)) return matches(row, value);
    if (value && typeof value === 'object' && !(value instanceof Date)) return Object.entries(value).every(([op, term]) => {
      if (op === 'in') return term.includes(row[key]);
      if (op === 'lt') return row[key] < term;
      if (op === 'gt') return row[key] > term;
      if (op === 'has') return row[key].includes(term);
      if (op === 'hasSome') return term.some(item => row[key].includes(item));
      throw new Error(`Unknown fixture operator ${op}`);
    });
    return row[key] === value;
  });
}
function model(name) {
  const project = (row, input) => {
    if (!row) return null;
    const copy = structuredClone(row);
    if (input.include?.user) copy.user = {status: 'ACTIVE'};
    return input.select ? Object.fromEntries(Object.keys(input.select).map(key => [key, copy[key]])) : copy;
  };
  const patch = (row, data) => {for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : value;};
  return {
    async findMany(input = {}) {let selected = rows[name].filter(row => matches(row, input.where)); for (const order of [...(Array.isArray(input.orderBy) ? input.orderBy : input.orderBy ? [input.orderBy] : [])].reverse()) {const [key, direction] = Object.entries(order)[0]; selected.sort((a,b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (direction === 'asc' ? 1 : -1));} return selected.slice(0, input.take ?? Infinity).map(row => project(row, input));},
    async findUnique(input) {return project(rows[name].find(row => matches(row, input.where)), input);},
    async findFirst(input) {return (await this.findMany({...input, take: 1}))[0] ?? null;},
    async findUniqueOrThrow(input) {const row = await this.findUnique(input); assert.ok(row); return row;},
    async create(input) {const row = {id: randomUUID(), revision: 1, controlSequence: 0, activeCommandId: null, cachedRuntime: null, revokedAt: null, workerId: null, status: name === 'dispatch' ? 'QUEUED' : 'PENDING', createdAt: new Date(), lastSeenAt: new Date(), ...input.data}; rows[name].push(row); return project(row,input);},
    async update(input) {const row = rows[name].find(row => matches(row,input.where)); assert.ok(row); patch(row,input.data); return project(row,input);},
    async updateMany(input) {const selected=rows[name].filter(row=>matches(row,input.where)); selected.forEach(row=>patch(row,input.data)); return {count:selected.length};},
    async upsert(input) {return rows[name].some(row=>matches(row,input.where)) ? this.update({where:input.where,data:input.update}) : this.create({data:input.create});},
  };
}
const prisma = {quantSuiteDevice:model('device'),quantSuiteWorker:model('worker'),quantSuiteInstance:model('instance'),quantSuiteDispatch:model('dispatch'),quantSuiteCommand:model('command'), async $queryRaw() {rows.locks++; return [];}, async $transaction(fn) {const backup=structuredClone(rows);try{return await fn(prisma);}catch(error){rows=backup;throw error;}}};
const originalLoader=Module._load;
Module._load=function(name,parent,main){if(name==='server-only')return {};if(name==='@/lib/prisma')return {prisma};return originalLoader.call(this,name,parent,main);};
const auth = require('../lib/quant-suite/dispatch-auth.ts');
const dispatch = require('../lib/quant-suite/dispatch.ts');
const devices = require('../lib/quant-suite/devices.ts');
const {executeQuantCommand,getQuantSuite}=require('../lib/quant-suite/service.ts');
const {defaultQuantConfig}=require('../lib/quant-suite/validation.ts');
const userId='11111111-1111-4111-8111-111111111111';
const otherId='22222222-2222-4222-8222-222222222222';
const viewer={id:userId,status:'ACTIVE',role:'admin',plan:'max',needsSecondFactor:false,twoFactorEnabled:true,twoFactorPassed:true};
function reset(){rows={device:[],worker:[],instance:[],dispatch:[],command:[],locks:0};process.env.QUANT_DISPATCH_MODE='supabase';process.env.NEXT_PUBLIC_APP_URL='https://fixture.invalid';delete process.env.QUANT_WORKER_TOKENS_JSON;}
function request(pairing, token=pairing.token){return new Request('https://fixture.invalid/api/quant-suite/worker/claim',{headers:{authorization:`Bearer ${token}`,'x-quant-worker-id':pairing.workerId}});}
async function pair(){return devices.pairDevice(viewer,{name:'Local fixture',engines:['freqtrade']});}
const command=(action,extra={})=>({engine:'freqtrade',action,requestId:randomUUID(),...extra});
async function save(){await executeQuantCommand(viewer,command('save-config',{config:defaultQuantConfig('freqtrade')}));}
async function task(){const paired=await pair();const binding=await auth.authorizeWorker(request(paired.pairing));await save();await executeQuantCommand(viewer,command('backtest'));return {paired,binding,...await dispatch.claimDispatch(binding)};}
const lease=t=>({protocolVersion:1,dispatchId:t.dispatchId,leaseToken:t.leaseToken});
test.after(()=>{Module._load=originalLoader;delete process.env.QUANT_DISPATCH_MODE;delete process.env.QUANT_WORKER_TOKENS_JSON;delete process.env.NEXT_PUBLIC_APP_URL;});
test('device token is returned once, stored hashed, tenant bound and absent from lists',async()=>{reset();const result=await pair();assert.ok(result.pairing.token.length>=43);assert.notEqual(rows.device[0].tokenHash,result.pairing.token);assert.equal(rows.device[0].tokenHash,auth.secretHash(result.pairing.token));assert.equal(rows.locks,1);const binding=await auth.authorizeWorker(request(result.pairing));assert.deepEqual(binding.userIds,[userId]);assert.equal(binding.source,'device');assert.equal('token' in binding,false);const listing=await devices.listDevices(viewer);assert.equal(listing.devices[0].online,false);assert.equal(JSON.stringify(listing).includes('token'),false);assert.equal((await devices.listDevices({...viewer,id:otherId})).devices.length,0);await assert.rejects(auth.authorizeWorker(request(result.pairing,'wrong-token-padding-over-thirtytwo-characters')),/认证失败/);});
test('pairing requires membership, verified session, unique scope and trusted server origin',async()=>{reset();for(const changes of [{plan:'free',role:'user'},{needsSecondFactor:true},{status:'SUSPENDED'}])await assert.rejects(devices.pairDevice({...viewer,...changes},{name:'x',engines:['freqtrade']}),/Max/);await pair();await assert.rejects(pair(),/已经绑定/);delete process.env.NEXT_PUBLIC_APP_URL;await assert.rejects(devices.pairDevice(viewer,{name:'x',engines:['lean']}),/可信/);});
test('environment bindings remain explicit and reject overlap with device enrolment',async()=>{reset();process.env.QUANT_WORKER_TOKENS_JSON=JSON.stringify([{id:'server-one',token:'x'.repeat(40),userIds:[userId],engines:['freqtrade']}]);await assert.rejects(pair(),/管理员分配/);assert.equal((await auth.assignedWorker(userId,'freqtrade')).id,'server-one');assert.equal(await auth.assignedWorker(otherId,'freqtrade'),undefined);});
test('offline execution cannot queue a delayed start; research is durable and one lease is claimed',async()=>{reset();const {binding,task:claimed}=await task();assert.ok(claimed);assert.equal(rows.dispatch[0].status,'CLAIMED');assert.equal((await dispatch.claimDispatch(binding)).busy,true);await assert.rejects(executeQuantCommand(viewer,command('start')),/启动请求不会排队/);assert.equal(rows.dispatch.length,1);const suite=await getQuantSuite(viewer);assert.equal(suite.dispatch.queueEnabled,true);assert.equal(suite.dispatch.workerOnline,true);assert.equal(suite.instances[0].runtime.state,'offline');await assert.rejects(dispatch.beginDispatch({...binding,id:'other-worker'},lease(claimed)),/设备已经撤销|租约无效/);});
test('newer stop prevents delayed begin and stale completion never releases newer instance lock',async()=>{reset();const {binding,task:claimed}=await task();await executeQuantCommand(viewer,command('stop'));await assert.rejects(dispatch.beginDispatch(binding,lease(claimed)),/更新的停止/);const stopId=rows.command.at(-1).id;await dispatch.completeDispatch(binding,{...lease(claimed),outcome:'completed',reply:{ok:false}});assert.equal(rows.instance[0].activeCommandId,stopId);const stop=(await dispatch.claimDispatch(binding)).task;assert.equal(stop.payload.action,'stop');await dispatch.beginDispatch(binding,lease(stop));await dispatch.completeDispatch(binding,{...lease(stop),outcome:'completed',reply:{ok:false}});assert.equal(rows.dispatch.at(-1).status,'UNKNOWN');assert.equal(rows.instance[0].activeCommandId,stopId);});
test('expired executing work becomes UNKNOWN and is never automatically re-leased',async()=>{reset();const {binding,task:claimed}=await task();await dispatch.beginDispatch(binding,lease(claimed));rows.dispatch[0].leaseExpiresAt=new Date(0);await dispatch.reconcileExpiredDispatches([userId]);assert.equal(rows.dispatch[0].status,'UNKNOWN');assert.ok(rows.instance[0].activeCommandId);assert.equal((await dispatch.claimDispatch(binding)).task,null);await dispatch.completeDispatch(binding,{...lease(claimed),outcome:'completed',reply:{ok:true}});assert.equal(rows.instance[0].activeCommandId,null);assert.equal((await dispatch.completeDispatch(binding,{...lease(claimed),outcome:'completed',reply:{ok:false}})).replayed,true);assert.equal(rows.dispatch[0].status,'SUCCEEDED');});
test('heartbeat accepts only current configuration and pinned native version; scope rejects another user',async()=>{reset();const {binding}=await task();const record=rows.instance[0];const observation={userId,engine:'freqtrade',revision:record.revision,configHash:dispatch.dispatchConfigHash(record.config),runtime:{state:'ready',version:'2026.8',capabilities:['paper']}};await assert.rejects(dispatch.heartbeatDispatch(binding,{observations:[{...observation,userId:otherId}]}),/绑定范围/);await dispatch.heartbeatDispatch(binding,{observations:[{...observation,configHash:'0'.repeat(64)}]});assert.equal(rows.instance[0].cachedRuntime,null);await dispatch.heartbeatDispatch(binding,{observations:[observation]});assert.equal((await dispatch.dispatchRuntime(userId,'freqtrade',rows.instance[0])).state,'ready');await dispatch.heartbeatDispatch(binding,{observations:[{...observation,runtime:{...observation.runtime,version:'old'}}]});assert.equal((await dispatch.dispatchRuntime(userId,'freqtrade',rows.instance[0])).state,'offline');});
test('revocation rejects stale in-flight authorization and preserves executing uncertainty',async()=>{reset();const {paired,binding,task:claimed}=await task();await dispatch.beginDispatch(binding,lease(claimed));await assert.rejects(devices.revokeDevice({...viewer,id:otherId},paired.device.id),/不存在/);await devices.revokeDevice(viewer,paired.device.id);assert.equal(rows.dispatch[0].status,'UNKNOWN');assert.ok(rows.instance[0].activeCommandId);await assert.rejects(auth.authorizeWorker(request(paired.pairing)),/撤销/);await assert.rejects(dispatch.beginDispatch(binding,lease(claimed)),/撤销/);await assert.rejects(dispatch.heartbeatDispatch(binding,{observations:[]}),/撤销/);await assert.rejects(dispatch.completeDispatch(binding,{...lease(claimed),outcome:'completed',reply:{ok:true}}),/撤销/);await assert.rejects(pair(),/未确认指令/);assert.equal((await devices.listDevices(viewer)).devices[0].online,false);});
test('revocation before begin cancels unexecuted work and expires its permission',async()=>{reset();const {paired,binding,task:claimed}=await task();await devices.revokeDevice(viewer,paired.device.id);assert.equal(rows.dispatch[0].status,'CANCELLED');assert.equal(rows.instance[0].activeCommandId,null);await assert.rejects(dispatch.beginDispatch(binding,lease(claimed)),/撤销/);const next=await pair();assert.notEqual(next.device.id,paired.device.id);});
test('unassigned research can be paired later but never crosses the explicit engine scope',async()=>{reset();await save();await executeQuantCommand(viewer,command('backtest'));assert.equal(rows.dispatch[0].workerId,null);const paired=await pair();const binding=await auth.authorizeWorker(request(paired.pairing));assert.ok((await dispatch.claimDispatch(binding)).task);assert.equal(await auth.assignedWorker(userId,'lean'),undefined);});
