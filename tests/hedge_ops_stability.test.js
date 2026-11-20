const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const tick = () => new Promise(resolve => setImmediate(resolve));
function localWindow(){const value={addEventListener(){},open(){}};value.parent=value;return value;}

test('local console preserves iframe and entered form during failed probes, pending process and engine switching', async () => {
  const elements = new Map(), frames = [], buttons = ['lighter','entropy','binance','binance_okx','binance_hyperliquid','hyperliquid_lighter','ondoperps_entropy','ondoperps_ondoperps'].map(name => ({dataset:{engine:name},classList:{toggle(){}},querySelector(){return {textContent:name}}}));
  const element = id => elements.get(id) || (elements.set(id,{hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},append(frame){frames.push(frame)}}),elements.get(id));
  const states = Object.fromEntries(['lighter','entropy','binance','binance_okx','binance_hyperliquid','hyperliquid_lighter','ondoperps_entropy','ondoperps_ondoperps'].map(engine => [engine,{running:true,processPresent:true,dryRun:true}]));
  let failed=false,loads=0;
  const context=vm.createContext({console,URL,window:localWindow(),AbortSignal,localStorage:{getItem:()=> 'binance',setItem(){}},setInterval(){},confirm:()=>false,
    document:{hidden:false,getElementById:element,createElement(){let src='';return {dataset:{},getAttribute:()=>src,set src(value){src=value;loads++},get src(){return src}}},
      querySelector(selector){if(selector.startsWith('iframe'))return frames.find(f=>selector.includes('"'+f.dataset.console+'"'));return element(selector)},
      querySelectorAll(selector){return selector==='[data-engine]'?buttons:selector==='[data-console]'?frames:[]}},
    fetch:async url=>{if(failed)throw Error('probe timeout');return {ok:true,json:async()=>url.endsWith('/local/runtimes')?{engines:states}:states[url.split('/')[2]]}}
  });
  const html=fs.readFileSync('hedge-ops/local.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1].replace('__CSRF_TOKEN__','"fixture"').replace('__CONTROL_ORIGIN__','""'),context);
  await tick();const original=frames[0];original.draft='unsaved';assert.equal(loads,1);
  failed=true;await vm.runInContext('refresh()',context);assert.equal(loads,1);assert.equal(original.hidden,false);assert.equal(element('start').disabled,true);
  failed=false;states.binance={running:false,processPresent:true};await vm.runInContext('refresh()',context);assert.equal(original.hidden,false);assert.equal(loads,1);
  states.binance.running=true;await vm.runInContext('refresh()',context);
  buttons[1].onclick();await tick();assert.equal(original.hidden,true);
  buttons[2].onclick();await tick();assert.equal(original.hidden,false);assert.equal(original.draft,'unsaved');assert.equal(loads,2);
  states.binance={running:false,processPresent:false};await vm.runInContext('refresh()',context);assert.equal(original.hidden,true);
  assert.equal(element('workspace-state').hidden,false);
  assert.equal(element('workspace-start').disabled,false);
});

test('cold console with an unconfirmed process shows recovery panel and opens workspace when ready', async () => {
  const elements=new Map(),frames=[],buttons=['lighter','entropy','binance','binance_okx','binance_hyperliquid','hyperliquid_lighter','ondoperps_entropy','ondoperps_ondoperps'].map(engine=>({dataset:{engine},classList:{toggle(){}}}));
  const element=id=>elements.get(id)||(elements.set(id,{hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},append(f){frames.push(f)}}),elements.get(id));
  let state={running:false,processPresent:true,dryRun:true,message:'checking engine'},loads=0;
  const context=vm.createContext({URL,window:localWindow(),AbortSignal,localStorage:{getItem:()=> 'entropy',setItem(){}},setInterval(){},confirm:()=>false,
    document:{hidden:false,getElementById:element,createElement(){let src='';return {dataset:{},getAttribute:()=>src,set src(value){src=value;loads++}}},
      querySelector(selector){if(selector.startsWith('iframe'))return frames.find(f=>selector.includes('"'+f.dataset.console+'"'));return element(selector)},
      querySelectorAll(selector){return selector==='[data-engine]'?buttons:selector==='[data-console]'?frames:[]}},
    fetch:async url=>({ok:true,json:async()=>url.endsWith('/local/runtimes')?{engines:Object.fromEntries(buttons.map(b=>[b.dataset.engine,state]))}:state})});
  vm.runInContext(fs.readFileSync('hedge-ops/local.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1].replace('__CSRF_TOKEN__','"fixture"').replace('__CONTROL_ORIGIN__','""'),context);
  await tick();assert.equal(loads,0);assert.equal(element('workspace-state').hidden,false);assert.equal(element('workspace-start').disabled,true);
  state={running:false,processPresent:false,status:'STOPPED',staleRecordCleared:true,message:'old process ended'};
  await vm.runInContext('refresh()',context);assert.equal(element('start').disabled,false);assert.equal(element('workspace-start').disabled,false);assert.equal(element('workspace-message').textContent,'old process ended');
  state={running:true,processPresent:true,dryRun:true};await vm.runInContext('refresh()',context);
  assert.equal(loads,1);assert.equal(frames[0].hidden,false);assert.equal(element('workspace-state').hidden,true);
  await vm.runInContext('refresh()',context);assert.equal(loads,1);
});

test('outer platform health timeout never removes an already connected local console', async () => {
  let cursor=0,initialized=false,fail=false;const values=[],effects=[],timers=[],urls=[];
  const react={useRef:()=>({current:null}),useState(initial){const index=cursor++;if(!(index in values))values[index]=initial;return [values[index],next=>values[index]=typeof next==='function'?next(values[index]):next]},useEffect(fn){if(!initialized)effects.push(fn)}};
  const jsx=(type,props,key)=>({type,props,key});const output={};
  const code=ts.transpileModule(fs.readFileSync('components/hedge-ops-surface.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const context=vm.createContext({exports:output,AbortController,AbortSignal,window:{addEventListener(){},removeEventListener(){}},document:{hidden:false},setInterval(fn){timers.push(fn);return 1},clearInterval(){},
    fetch:async url=>{urls.push(url);if(fail)throw Error('health timeout');return {ok:true,json:async()=>({ok:true,service:'welinkbtc-hedge-local',controlPort:8812})}},
    require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};return new Proxy({},{get:()=>()=>null})}});
  vm.runInContext(code+'\nexports.TestLocal = LocalHedgeOpsSurface;',context);
  function render(){cursor=0;const tree=output.TestLocal({onSwitchMode(){}});if(!initialized){initialized=true;effects.forEach(fn=>fn())}return tree}
  function iframe(node){if(!node||typeof node!=='object')return null;if(node.type==='iframe')return node;return [node.props?.children].flat(Infinity).map(iframe).find(Boolean)}
  render();await tick();const first=iframe(render());assert.ok(first);
  fail=true;timers[0]();await tick();const pending=iframe(render());assert.ok(pending);assert.equal(pending.key,first.key);assert.equal(pending.props.src,first.props.src);
  assert.equal(first.props.src,'http://127.0.0.1:8812/?embedded=1');
  assert.equal(urls[1],'http://127.0.0.1:8812/health');
  fail=false;timers[0]();await tick();assert.equal(iframe(render()).key,first.key);
  assert.equal(urls[2],'http://127.0.0.1:8011/health');
});

test('Binance OKX starts and opens on the control origin; an expired token is recovered without replaying a write', async () => {
  const elements=new Map(),frames=[],engines=['lighter','entropy','binance','binance_okx','binance_hyperliquid','hyperliquid_lighter','ondoperps_entropy','ondoperps_ondoperps'];
  const buttons=engines.map(engine=>({dataset:{engine},classList:{toggle(){}}}));
  const element=id=>elements.get(id)||(elements.set(id,{hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},append(f){frames.push(f)}}),elements.get(id));
  let running=false,rejectWrite=false,starts=0,loads=0;const urls=[];
  const context=vm.createContext({URL,window:localWindow(),AbortSignal,localStorage:{getItem:()=> 'binance_okx',setItem(){}},setInterval(){},confirm:()=>false,
    document:{hidden:false,getElementById:element,createElement(){let src='';return {dataset:{},getAttribute:()=>src,set src(v){src=v;loads++},get src(){return src}}},
      querySelector(s){if(s.startsWith('iframe'))return frames.find(f=>s.includes('"'+f.dataset.console+'"'));return element(s)},
      querySelectorAll(s){return s==='[data-engine]'?buttons:s==='[data-console]'?frames:[]}},
    fetch:async(url,init={})=>{urls.push(url);const path=new URL(url,'http://127.0.0.1:8811').pathname;
      if(path==='/local/session')return {ok:true,json:async()=>({service:'welinkbtc-hedge-local',controlOrigin:'http://127.0.0.1:8812',csrf:'replacement'})};
      if(path==='/local/runtimes')return {ok:true,json:async()=>({engines:Object.fromEntries(engines.map(e=>[e,{running,processPresent:running,dryRun:true}]))})};
      if(init.method==='POST'){starts++;if(rejectWrite)return {ok:false,status:403,json:async()=>({detail:'expired session'})};running=true;}
      return {ok:true,json:async()=>({running,processPresent:running,dryRun:true,engine:'binance_okx'})};}
  });
  const code=fs.readFileSync('hedge-ops/local.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1].replace('__CSRF_TOKEN__','"fixture"').replace('__CONTROL_ORIGIN__','"http://127.0.0.1:8812"');
  vm.runInContext(code,context);await tick();assert.equal(element('start').disabled,false);
  await element('start').onclick();assert.equal(starts,1);assert.equal(frames[0].src,'http://127.0.0.1:8812/console/binance_okx/');
  assert.equal(element('workspace-state').hidden,true);assert.equal(loads,1);
  rejectWrite=true;
  await assert.rejects(vm.runInContext("api('runtime',{method:'POST',body:'{}'})",context),/expired session/);
  assert.equal(starts,2);assert.equal(vm.runInContext('hedgeLocalControl().csrf',context),'replacement');
  assert.ok(urls.filter(u=>u.includes('/runtime')).every(u=>u.startsWith('http://127.0.0.1:8812')));
  assert.equal(loads,1,'session recovery must not reload an existing workspace');
  assert.ok(urls.some(u=>u.endsWith('/local/runtimes')),'one status batch avoids eight parallel browser connections');
  vm.runInContext("controlOrigin='http://127.0.0.1:8813'",context);
  await vm.runInContext('refresh()',context);
  assert.equal(frames[0].src,'http://127.0.0.1:8813/console/binance_okx/');
  assert.equal(loads,2,'a changed control port must reconnect the workspace once');
  await vm.runInContext('refresh()',context);assert.equal(loads,2);
});

test('local Perpdex service pauses console reads and returns without reloading or mutating a trade runtime',async()=>{
  const frames=[],elements=new Map(),listeners=new Map(),messages=[],visibility=[],calls=[];
  const engines=['lighter','entropy','binance','binance_okx','binance_hyperliquid','hyperliquid_lighter','ondoperps_entropy','ondoperps_ondoperps'];
  const buttons=engines.map(engine=>({dataset:{engine},classList:{toggle(){}}}));
  const element=id=>elements.get(id)||(elements.set(id,{hidden:false,disabled:false,classList:{toggle(){}},setAttribute(){},append(f){frames.push(f)}}),elements.get(id));
  const platform={postMessage(data,origin){messages.push({data,origin})}},win={parent:platform,addEventListener(type,fn){listeners.set(type,fn)},open(){throw Error('embedded service should use parent navigation')}};
  let loads=0;
  const context=vm.createContext({URL,AbortSignal,window:win,location:{origin:'http://127.0.0.1:8812'},localStorage:{getItem:()=> 'binance',setItem(){}},setInterval(){},confirm:()=>false,
    document:{hidden:false,referrer:'https://www.welinkbtc-onchainmain.xyz/hedge-ops',getElementById:element,
      createElement(){let src='';return {dataset:{},contentWindow:{postMessage(data){visibility.push(data)}},getAttribute:()=>src,set src(value){src=value;loads++},get src(){return src}}},
      querySelector(selector){if(selector.startsWith('iframe'))return frames.find(f=>selector.includes('"'+f.dataset.console+'"'));return element(selector)},
      querySelectorAll(selector){return selector==='[data-engine]'?buttons:selector==='[data-console]'?frames:[]}},
    fetch:async(url,options={})=>{calls.push({url,options});return {ok:true,json:async()=>({engines:Object.fromEntries(engines.map(engine=>[engine,{running:true,processPresent:true,dryRun:true}]))})}}});
  vm.runInContext(fs.readFileSync('hedge-ops/local.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1].replace('__CSRF_TOKEN__','"fixture"').replace('__CONTROL_ORIGIN__','"http://127.0.0.1:8812"'),context);
  await tick();const frame=frames[0],src=frame.src;frame.draft='unsaved strategy input';
  element('perpdex-box').onclick();assert.equal(frame.hidden,true);assert.equal(visibility.at(-1).active,false);assert.equal(loads,1);
  assert.equal(messages.at(-1).data.type,'hedge-open-perpdex-box');assert.equal(messages.at(-1).origin,'https://www.welinkbtc-onchainmain.xyz');
  element('cex-hub').onclick();assert.equal(messages.at(-1).data.type,'hedge-open-cex-hub');assert.equal(frame.hidden,true);
  assert.equal(vm.runInContext('marketService',context),'cex');assert.equal(element('selected-pair').textContent,'Cex Hub');
  listeners.get('message')({source:platform,origin:'https://other.invalid',data:{type:'hedge-open-perpdex-box',service:'perpdex'}});assert.equal(vm.runInContext('marketService',context),'cex');
  listeners.get('message')({source:platform,origin:'https://www.welinkbtc-onchainmain.xyz',data:{type:'hedge-open-perpdex-box',service:'perpdex'}});assert.equal(vm.runInContext('marketService',context),'perpdex');
  listeners.get('message')({source:platform,origin:'https://www.welinkbtc-onchainmain.xyz',data:{type:'hedge-open-perpdex-box',service:'cex'}});assert.equal(vm.runInContext('marketService',context),'cex');assert.equal(frame.hidden,true);
  listeners.get('message')({source:{},origin:'https://www.welinkbtc-onchainmain.xyz',data:{type:'hedge-close-perpdex-box'}});assert.equal(frame.hidden,true);
  listeners.get('message')({source:platform,origin:'https://other.invalid',data:{type:'hedge-close-perpdex-box'}});assert.equal(frame.hidden,true);
  listeners.get('message')({source:platform,origin:'https://www.welinkbtc-onchainmain.xyz',data:{type:'hedge-close-perpdex-box'}});assert.equal(frame.hidden,false);assert.equal(visibility.at(-1).active,true);
  element('perpdex-box').onclick();buttons[2].onclick();assert.equal(frame.hidden,false);assert.equal(messages.at(-1).data.type,'hedge-close-perpdex-box');
  assert.equal(frame.src,src);assert.equal(frame.draft,'unsaved strategy input');assert.equal(loads,1);
  assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));
});

