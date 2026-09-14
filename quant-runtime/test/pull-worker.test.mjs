import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp, rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PullWorker, validateTask, safeReply} from '../bin/pull-worker.mjs';
import {approvedConfigHash} from '../lib/validation.mjs';
import {writeJson, readJson} from '../lib/storage.mjs';

const config = {name: 'Research', mode: 'paper', exchange: 'binance', symbols: ['BTC/USDT'], timeframe: '1h', strategy: 'default', stakeAmount: 100, maxOpenTrades: 2, stopLossPct: 2, startDate: '2026-01-01', endDate: '2026-02-01'};
function task(action = 'backtest', patch = {}) { return {dispatchId: 'dispatch-1', leaseToken: randomUUID(), expiresAt: new Date(Date.now()+60000).toISOString(), payload: {protocolVersion: 1, userId: 'a02d320c-6935-4b6c-8cd0-6295b4502881', engine: 'freqtrade', action, config, requestId: randomUUID(), controlSequence: 7, revision: 1, configHash: approvedConfigHash(config), expectedVersion: '2026.8', ...patch}}; }
async function workerFixture(t, behavior = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'welink-pull-test-'));
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('welink-pull-test-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const calls = [], native = [];
  const gateway = {async execute(command) {
    native.push(command);
    if (behavior.nativeFailure && command.action !== 'preflight') throw new Error('Secret native exception must not reach server');
    if (behavior.nativeRejected && command.action !== 'preflight') return {ok:false,message:'A partial native side effect cannot be excluded'};
    return {ok:true, runtime:{state:'ready',version:behavior.version ?? '2026.8',capabilities:['paper','live','backtest']}, result: command.action === 'preflight' ? {configHash:approvedConfigHash(command.config)} : {requestId:command.requestId,state:'running',config:{apiKey:'SECRET'}}};
  }};
  const fetcher = async (url, options) => {
    const operation = new URL(url).pathname.split('/').at(-1);
    const body = JSON.parse(options.body); calls.push({operation,body});
    if (behavior.fail === operation) throw new Error('Network unavailable');
    if (operation === 'begin') return Response.json({ok:true,permitted:true});
    return Response.json({ok:true,task:null,assignments:[]});
  };
  const worker = new PullWorker({baseUrl:'https://welink.example',workerId:'worker-one',token:'a'.repeat(40),gateway,fetcher,journalRoot:root,allowLive:false});
  return {worker,calls,native,behavior};
}

test('immutable queue payload rejects changed risk config, unexpected version and protocol',()=>{
  assert.equal(validateTask(task()).controlSequence,7);
  assert.throws(()=>validateTask(task('backtest',{config:{...config,stakeAmount:999}})),/integrity/);
  assert.throws(()=>validateTask(task('backtest',{expectedVersion:'latest'})),/version/);
  assert.throws(()=>validateTask(task('backtest',{protocolVersion:2})),/protocol/);
  assert.equal(JSON.stringify(safeReply({ok:true,result:{config:{apiKey:'SECRET'},state:'running'}})).includes('SECRET'),false);
});

test('worker runs native preflight, requests permission then executes exactly original ID and fence',async t=>{
  const f=await workerFixture(t); const input=task();
  await f.worker.handle(input);
  assert.deepEqual(f.native.map(c=>c.action),['preflight','backtest']);
  assert.equal(f.native.at(-1).requestId,input.payload.requestId);
  assert.equal(f.native.at(-1).controlSequence,7);
  assert.deepEqual(f.calls.map(c=>c.operation),['begin','complete']);
  assert.equal(f.calls.at(-1).body.outcome,'completed');
  assert.equal(JSON.stringify(f.calls).includes('SECRET'),false);
  assert.equal(await readJson(f.worker.journalFile),null);
});

test('missing begin acknowledgement prevents native mutation and version drift fails before permission',async t=>{
  const denied=await workerFixture(t,{fail:'begin'}); await denied.worker.handle(task());
  assert.deepEqual(denied.native.map(c=>c.action),['preflight']);
  assert.equal(denied.calls.at(-1).body.reply.ok,false);
  const wrong=await workerFixture(t,{version:'2026.9'}); await wrong.worker.handle(task());
  assert.deepEqual(wrong.calls.map(c=>c.operation),['complete']);
  assert.equal(wrong.calls[0].body.reply.ok,false);
});

test('worker default rejects live and expired tasks without any native activity',async t=>{
  const f=await workerFixture(t); const live={...config,mode:'live'};
  await f.worker.handle(task('start',{config:live,configHash:approvedConfigHash(live)}));
  const expired=task();expired.expiresAt=new Date(Date.now()-1000).toISOString();
  await f.worker.handle(expired);
  assert.equal(f.native.length,0);assert.equal(f.calls.every(c=>c.operation==='complete'),true);
});

test('native uncertainty is reported unknown and never retried as an execution',async t=>{
  const f=await workerFixture(t,{nativeFailure:true});await f.worker.handle(task());
  assert.equal(f.calls.at(-1).body.outcome,'unknown');
  assert.equal(JSON.stringify(f.calls).includes('Secret native exception'),false);
  assert.equal(f.native.filter(c=>c.action==='backtest').length,1);
});

test('native failure response after permission retains unknown state for partial side effects',async t=>{
  const f=await workerFixture(t,{nativeRejected:true});await f.worker.handle(task());
  assert.equal(f.calls.at(-1).body.outcome,'unknown');
  assert.equal(f.calls.at(-1).body.reply.ok,false);
  assert.equal(f.native.filter(c=>c.action==='backtest').length,1);
});

test('lost completion is retried only as completion from the durable worker journal',async t=>{
  const f=await workerFixture(t,{fail:'complete'});await assert.rejects(f.worker.handle(task()));
  assert.equal((await readJson(f.worker.journalFile)).phase,'report');
  f.behavior.fail=null;await f.worker.tick();
  assert.equal(f.native.filter(c=>c.action==='backtest').length,1);
  assert.equal(f.calls.filter(c=>c.operation==='complete').length,2);
});

test('restart after native execution began reports ambiguity without replaying the command',async t=>{
  const f=await workerFixture(t);await writeJson(f.worker.journalFile,{task:task(),phase:'executing'});
  await f.worker.recover();
  assert.equal(f.native.length,0);
  assert.equal(f.calls[0].operation,'complete');
  assert.equal(f.calls[0].body.outcome,'unknown');
});
