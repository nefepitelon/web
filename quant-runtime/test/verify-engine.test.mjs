import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, cp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {verifyEngine, verifyStoredEvidence} from '../lib/verify-engine.mjs';
import {Gateway} from '../lib/gateway.mjs';
import {paths, readJson, writeJson} from '../lib/storage.mjs';
import {approvedConfigHash} from '../lib/validation.mjs';
import {ENGINE_INSTALLS} from '../local-engines/manifest.mjs';

const recipes = fileURLToPath(new URL('../recipes/', import.meta.url));
const config = {name: 'Research verification', mode: 'paper', exchange: 'binance', symbols: ['BTC/USDT'], timeframe: '1h', strategy: 'default', stakeAmount: 100, maxOpenTrades: 2, stopLossPct: 2, startDate: '2026-01-01', endDate: '2026-02-01'};
async function fixture(t, engine = 'freqtrade', behavior = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'welink-verify-test-'));
  assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('welink-verify-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const p = paths(root, 'tenant-a', engine);
  await mkdir(p.project, {recursive: true});
  if (engine === 'freqtrade') {
    await cp(path.join(recipes,engine,'strategies'),path.join(p.project,'strategies'),{recursive:true});
    await writeJson(path.join(p.project,'config.json'),{exchange:{name:'binance',key:'NATIVE_SECRET_MUST_NOT_PASS_AS_ENV'},trading_mode:'spot',stake_currency:'USDT'});
  }
  if (engine === 'lean') {
    await cp(path.join(recipes,engine,'algorithm.py'),path.join(p.project,'algorithm.py'));
    await cp(path.join(recipes,engine,'backtest.example.json'),path.join(p.project,'backtest.json'));
    await mkdir(path.join(p.project,'data'));
  }
  if (engine === 'jesse') {
    await cp(path.join(recipes,engine,'strategies'),path.join(p.project,'strategies'),{recursive:true});
    await cp(path.join(recipes,engine,'backtest.example.json'),path.join(p.project,'backtest.json'));
  }
  const spec = ENGINE_INSTALLS[engine];
  await writeJson(path.join(p.base,'local-install.json'),{installerVersion:1,engine,tenant:p.tenant});
  await writeJson(p.deployment,{engine,enabled:false,image:spec.build?spec.runtimeImage:spec.image,upstreamVersion:spec.version,verifiedActions:[],paperVerified:false,liveVerified:false,approvedConfigHash:approvedConfigHash(config),envFile:true});
  const calls=[], containers=new Map();
  const imageId=`sha256:${'a'.repeat(64)}`;
  const docker={
    async available(){}, async image(){},
    async exec(args){
      calls.push(args);
      if(args[0]==='info') return behavior.windows?'windows':'linux';
      if(args[0]==='network'){if(behavior.noNetwork)throw new Error('Docker network unavailable'); return 'welink-quant';}
      if(args[0]==='image')return behavior.imageId??imageId;
      if(args[0]==='ps')return behavior.running?`wq-${p.tenant.slice(0,16)}-${engine}-bot`:'';
      if(args[0]==='run'&&args.includes('--read-only'))return behavior.sdkVersion??'3.1.1';
      if(args[0]==='run'){
        const name=args[args.indexOf('--name')+1];
        const stateMount=args.find(arg=>arg.startsWith('type=bind,src=')&&arg.endsWith(',dst=/state'));
        const output=stateMount.slice('type=bind,src='.length,-',dst=/state'.length);
        const requestMount=args.find(arg=>arg.startsWith('type=bind,src=')&&arg.endsWith(',dst=/request,readonly'));
        const requestDir=requestMount.slice('type=bind,src='.length,-',dst=/request,readonly'.length);
        const request=await readJson(path.join(requestDir,'request.json'));
        assert.equal(request.action,'backtest');assert.equal(request.config.mode,'paper');
        assert.equal(args.includes('--env-file'),false);
        containers.set(name,{running:Boolean(behavior.timeout),exitCode:behavior.exitCode??0});
        if(!behavior.noResult)await writeJson(path.join(output,'result.json'),{engine,action:'backtest',metrics:behavior.metrics??(engine==='lean'?{observed_bars:100,portfolio_value:10000}:{total_trades:0,profit_total:0})});
        return 'fake-container-id';
      }
      return '';
    },
    async inspect(name){return containers.get(name)??null;},
    async stop(name){const state=containers.get(name);if(state)state.running=false;calls.push(['stop',name]);},
  };
  const options={root,userId:'tenant-a',engine,config,dependencies:{docker,timeoutMs:25,pollMs:1}};
  return {root,p,docker,calls,options,imageId};
}
test('actual native result and baseline proof are required before enabling research only',async t=>{
  const f=await fixture(t);const result=await verifyEngine(f.options);
  assert.equal(result.ok,true);assert.deepEqual(result.verifiedActions,['backtest','stop']);
  const profile=await readJson(f.p.deployment);assert.equal(profile.enabled,true);assert.equal(profile.paperVerified,false);assert.equal(profile.liveVerified,false);assert.equal(profile.verification.imageId,f.imageId);
  assert.equal(f.calls.filter(args=>args[0]==='run').length,1);assert.equal(JSON.stringify(result).includes('NATIVE_SECRET'),false);
  assert.deepEqual(await verifyStoredEvidence(f.p,profile,'backtest',f.docker),[]);
});
test('no Docker/Linux network, wrong image or running job never grants capability',async t=>{
  for(const behavior of [{windows:true},{noNetwork:true},{running:true},{imageId:'not-a-content-id'}]){const f=await fixture(t,'freqtrade',behavior);const result=await verifyEngine(f.options);assert.equal(result.ok,false);assert.equal((await readJson(f.p.deployment)).enabled,false);assert.equal(f.calls.filter(args=>args[0]==='run').length,0);}
});
test('failed native exit, empty result, missing real metrics or timeout cannot be approved',async t=>{
  for(const behavior of [{exitCode:1},{noResult:true},{metrics:{}},{timeout:true}]){const f=await fixture(t,'freqtrade',behavior);const result=await verifyEngine(f.options);assert.equal(result.ok,false);assert.equal((await readJson(f.p.deployment)).enabled,false);if(behavior.timeout)assert.equal(f.calls.some(args=>args[0]==='stop'),true);}
});
test('live mode and start/optimize verification requests are rejected before any native action',async t=>{
  const f=await fixture(t);await assert.rejects(verifyEngine({...f.options,config:{...config,mode:'live'}}),/PAPER/);await assert.rejects(verifyEngine({...f.options,actions:['start']}),/仅支持/);await assert.rejects(verifyEngine({...f.options,actions:['optimize']}),/仅支持/);assert.equal(f.calls.length,0);
});
test('custom strategy edits invalidate baseline and later file/image drift invalidates evidence',async t=>{
  const f=await fixture(t);assert.equal((await verifyEngine(f.options)).ok,true);const profile=await readJson(f.p.deployment);
  const file=path.join(f.p.project,'config.json');await writeJson(file,{...await readJson(file),stake_currency:'BTC'});
  assert.ok((await verifyStoredEvidence(f.p,profile,'backtest',f.docker)).some(value=>value.includes('已更改')));
  const g=await fixture(t);const strategy=path.join(g.p.project,'strategies/WelinkTrend.py');await writeJson(strategy,{changed:true});assert.equal((await verifyEngine(g.options)).ok,false);assert.equal(g.calls.filter(args=>args[0]==='run').length,0);
});
test('local halt is preserved on failed verification and clears only explicit successful resume',async t=>{
  const f=await fixture(t);await writeJson(path.join(f.p.base,'local-halt.json'),{reason:'local-stop'});
  assert.equal((await verifyEngine(f.options)).ok,false);assert.ok(await readJson(path.join(f.p.base,'local-halt.json')));
  const result=await verifyEngine({...f.options,resume:true});assert.equal(result.ok,true);assert.equal(result.resumed,true);assert.equal(await readJson(path.join(f.p.base,'local-halt.json')),null);assert.equal((await readJson(f.p.deployment)).liveVerified,false);
  const g=await fixture(t,'freqtrade',{noResult:true});await writeJson(path.join(g.p.base,'local-halt.json'),{});assert.equal((await verifyEngine({...g.options,resume:true})).ok,false);assert.ok(await readJson(path.join(g.p.base,'local-halt.json')));
});
test('LEAN requires native data processing and Jesse missing candles stays unconfigured',async t=>{
  const lean=await fixture(t,'lean');assert.equal((await verifyEngine(lean.options)).ok,true);const run=lean.calls.find(args=>args[0]==='run');assert.ok(run.includes('dotnet'));
  const jesse=await fixture(t,'jesse');const missing=await verifyEngine(jesse.options);assert.equal(missing.ok,false);assert.ok(missing.message.includes('candles.json'));
});
test('Jesse requires actual SDK version and native results before admitting the supplied candle dataset',async t=>{
  const f=await fixture(t,'jesse',{sdkVersion:'3.0.0'});await writeJson(path.join(f.p.project,'candles.json'),{});
  const wrong=await verifyEngine(f.options);assert.equal(wrong.ok,false);assert.ok(wrong.message.includes('SDK'));assert.equal(f.calls.some(args=>args.includes('--detach')),false);
  const g=await fixture(t,'jesse');await writeJson(path.join(g.p.project,'candles.json'),{});assert.equal((await verifyEngine(g.options)).ok,true);assert.equal(g.calls.filter(args=>args.includes('--detach')).length,1);
});
test('unsupported risk mappings remain explicitly blocked and do not create synthetic proof',async t=>{
  const f=await fixture(t);for(const engine of ['nautilus','hummingbot','octobot']){const result=await verifyEngine({...f.options,engine});assert.equal(result.ok,false);assert.equal(result.enabled,false);assert.ok(result.blockers.length);}
  assert.equal(f.calls.length,0);
});
test('gateway rechecks file proof and cannot upgrade successful research into trading',async t=>{
  const f=await fixture(t);await verifyEngine(f.options);
  const gateway=new Gateway({root:f.root,docker:f.docker});
  const preflight=await gateway.execute({userId:'tenant-a',engine:'freqtrade',action:'preflight',targetAction:'backtest',config});assert.equal(preflight.ok,true);
  const start=await gateway.execute({userId:'tenant-a',engine:'freqtrade',action:'preflight',targetAction:'start',config});assert.equal(start.ok,false);assert.equal(start.runtime.capabilities.includes('paper'),false);
  const file=path.join(f.p.project,'config.json');await writeJson(file,{...await readJson(file),timeframe:'4h'});
  const changed=await gateway.execute({userId:'tenant-a',engine:'freqtrade',action:'preflight',targetAction:'backtest',config});assert.equal(changed.ok,false);assert.ok(changed.blockers.some(value=>value.includes('已更改')));
});
