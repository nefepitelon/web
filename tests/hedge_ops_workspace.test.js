const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const labels=['Arcus <> RHC Lighter','Entropy <> Arcus','Binance <> Lighter','Binance <> OKX','Binance <> Hyperliquid','Hyperliquid <> Lighter','Ondoperps <> Entropy','Ondoperps <> Ondoperps'];
function elements(node,predicate){if(!node||typeof node!=='object')return [];if(typeof node.type==='function')return elements(node.type(node.props),predicate);return [...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>elements(child,predicate))]}
function surface(){
  let cursor=0,refCursor=0,effectCursor=0;
  const values=[],refs=[],effects=[],runEffects=[],calls=[],messages=[],listeners=new Map(),domFrames=new Map();
  const statuses=Object.fromEntries(['lighter','entropy','binance','binance_okx','binance_hyperliquid','hyperliquid_lighter','ondoperps_entropy','ondoperps_ondoperps'].map(engine=>[engine,{available:true,running:true,engine,dryRun:true,configured:true}]));
  const react={useRef(initial){return refs[refCursor++]??(refs[refCursor-1]={current:initial})},useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],value=>values[i]=typeof value==='function'?value(values[i]):value]},useEffect(fn,deps){const i=effectCursor++,old=effects[i];if(!old||deps?.some((d,j)=>d!==old.deps?.[j])){runEffects.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()}})}}};
  const output={};const jsx=(type,props,key)=>({type,props,key});
  const context=vm.createContext({exports:output,AbortSignal,AbortController,document:{visibilityState:'visible'},
    localStorage:{getItem:()=>null},setInterval:()=>1,clearInterval(){},
    window:{location:{origin:'https://fixture.invalid'},localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)}},
    fetch:async(url,options={})=>{calls.push({url,options});return {ok:true,json:async()=>String(url).endsWith('/health')?{ok:true,service:'welinkbtc-hedge-local',controlPort:8812}:statuses[new URL(url,'https://fixture.invalid').searchParams.get('engine')]};},
    require(name){if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name.endsWith('release.json'))return {default:JSON.parse(fs.readFileSync('hedge-ops/release.json','utf8'))};return new Proxy({},{get:()=>()=>null})}});
  const source=ts.transpileModule(fs.readFileSync('components/hedge-ops-surface.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInContext(source+'\nexports.Hosted=HostedHedgeOpsSurface; exports.Choice=HedgeOpsSurface; exports.Local=LocalHedgeOpsSurface;',context);
  function render(which='Hosted'){
    cursor=0;refCursor=0;effectCursor=0;const tree=output[which]({storageScope:'fixture',onSwitchMode(){}});
    for(const node of elements(tree,n=>n.type==='iframe')){const key=node.key;if(!domFrames.has(key))domFrames.set(key,{dataset:{console:node.props['data-console']},contentWindow:{postMessage(data,origin){messages.push({key,data,origin})}}});const frame=domFrames.get(key);frame.hidden=node.props.hidden;if(node.props.ref)node.props.ref.current=frame;}
    const content=elements(tree,n=>n.props?.className==='hedge-ops-workspace-content'&&n.props.ref)[0];if(content)content.props.ref.current={querySelectorAll:()=>[...domFrames.values()]};
    runEffects.splice(0).forEach(fn=>fn());return tree;
  }
  return {render,statuses,calls,messages,listeners,domFrames};
}
test('run mode local card directly downloads the current centrally versioned launcher',()=>{
  const {render}=surface();const tree=render('Choice');
  const release=JSON.parse(fs.readFileSync('hedge-ops/release.json','utf8')).version;
  const link=elements(tree,n=>n.type==='a'&&Boolean(n.props.download))[0];
  assert.equal(link.props.download,`一键启动文件(${release}).bat`);
  assert.equal(decodeURIComponent(link.props.href),`/downloads/一键启动文件(${release}).bat`);
  const text=JSON.stringify(tree);assert.match(text,/八套平台/);assert.doesNotMatch(text,/三套/);
  const launcher=fs.readFileSync(`public/downloads/${link.props.download}`,'utf8');
  assert.match(launcher,new RegExp(`HEDGE_REQUESTED_RELEASE=${release.replaceAll('.','\\.')}`));
  const manifest=JSON.parse(fs.readFileSync('public/downloads/hedge-ops-manifest.json','utf8'));
  assert.equal(manifest.release,release);assert.equal(manifest.launcher,link.props.download);
});
test('hosted console selectors are a left sidebar and engine switches preserve iframe identity and URL',async()=>{
  const {render}=surface();render();await tick();render();let tree=render();
  const sidebar=elements(tree,n=>n.type==='aside'&&n.props.className==='hedge-ops-sidebar')[0];assert.ok(sidebar);
  const engineNav=elements(sidebar,n=>n.type==='nav'&&n.props.className==='hedge-ops-engines')[0];
  const choices=elements(engineNav,n=>n.type==='button');assert.equal(choices.length,8);
  assert.deepEqual(choices.map(n=>n.props.children[1].props.children),labels);
  const frames=elements(tree,n=>n.type==='iframe');assert.equal(frames.length,8);
  const before=Object.fromEntries(frames.map(n=>[n.props['data-console'],{key:n.key,src:n.props.src}]));
  choices[1].props.onClick();tree=render();await tick();tree=render();
  const after=elements(tree,n=>n.type==='iframe');assert.equal(after.length,8);
  for(const frame of after){assert.equal(frame.key,before[frame.props['data-console']].key);assert.equal(frame.props.src,before[frame.props['data-console']].src)}
  assert.equal(after.find(n=>n.props['data-console']==='entropy').props.hidden,false);
  assert.equal(after.find(n=>n.props['data-console']==='lighter').props.hidden,true);
});
test('Perpdex Box is independent of hosted engine state and returning preserves every console',async()=>{
  const f=surface();f.render();await tick();f.render();let tree=f.render();
  const before=elements(tree,n=>n.type==='iframe').map(n=>({key:n.key,src:n.props.src}));
  const service=elements(tree,n=>n.type==='button'&&n.props.className==='hedge-ops-service')[0];
  service.props.onClick();tree=f.render();
  assert.equal(elements(tree,n=>n.type==='iframe').length,8);
  assert.ok(elements(tree,n=>n.type==='iframe').every(n=>n.props.hidden));
  assert.equal(elements(tree,n=>n.type==='div'&&n.props.className==='hedge-ops-toolbar')[0].props.hidden,true);
  assert.ok(f.messages.slice(-8).every(m=>m.data.type==='hedge-console-visibility'&&m.data.active===false));
  const current=elements(tree,n=>n.type==='nav'&&n.props.className==='hedge-ops-engines')[0];
  elements(current,n=>n.type==='button')[0].props.onClick();tree=f.render();
  assert.deepEqual(elements(tree,n=>n.type==='iframe').map(n=>({key:n.key,src:n.props.src})),before);
  assert.equal(elements(tree,n=>n.type==='iframe'&&n.props['data-console']==='lighter')[0].props.hidden,false);
  assert.equal(f.messages.at(-8).data.active,true);
  assert.ok(f.calls.every(c=>!c.options.method||c.options.method==='GET'),'service navigation must not start, stop or mutate an engine');
});
test('run mode choice exposes Perpdex Box before selecting a trade runtime',()=>{
  const f=surface();let tree=f.render('Choice');
  elements(tree,n=>n.type==='button'&&n.props.className==='hedge-ops-service')[0].props.onClick();tree=f.render('Choice');
  assert.ok(elements(tree,n=>n.type==='strong'&&n.props.children==='Perpdex Box').length);
  assert.equal(f.calls.length,0);
  const back=elements(tree,n=>n.type==='button'&&n.props.className==='hedge-ops-workspace-return')[0];back.props.onClick();tree=f.render('Choice');
  assert.ok(elements(tree,n=>n.type==='a'&&n.props.download).length);
});
test('local service overlay authenticates local window messages and preserves the existing manager frame',async()=>{
  const f=surface();f.render('Local');await tick();let tree=f.render('Local');
  const frame=elements(tree,n=>n.type==='iframe')[0],dom=f.domFrames.get(frame.key),receive=()=>f.listeners.get('message');
  receive()({source:{},origin:'http://127.0.0.1:8812',data:{type:'hedge-open-perpdex-box'}});
  assert.equal(elements(f.render('Local'),n=>n.props?.['aria-label']==='Perpdex Box').length,0);
  receive()({source:dom.contentWindow,origin:'https://other.invalid',data:{type:'hedge-open-perpdex-box'}});
  assert.equal(elements(f.render('Local'),n=>n.props?.['aria-label']==='Perpdex Box').length,0);
  receive()({source:dom.contentWindow,origin:'http://127.0.0.1:8812',data:{type:'hedge-open-perpdex-box'}});tree=f.render('Local');
  assert.match(elements(tree,n=>n.props?.['aria-label']==='Perpdex Box')[0].props.className,/has-sidebar/);
  const sameFrame=elements(tree,n=>n.type==='iframe')[0];assert.equal(sameFrame.key,frame.key);assert.equal(sameFrame.props.src,frame.props.src);
  const back=elements(tree,n=>n.type==='button'&&JSON.stringify(n.props.children).includes('返回交易工作台'))[0];back.props.onClick();tree=f.render('Local');
  assert.equal(elements(tree,n=>n.props?.['aria-label']==='Perpdex Box').length,0);
  assert.equal(f.messages.at(-1).data.type,'hedge-close-perpdex-box');assert.equal(f.messages.at(-1).origin,'http://127.0.0.1:8812');
  assert.equal(elements(tree,n=>n.type==='iframe')[0].key,frame.key);
});
test('local console selectors use a responsive vertical sidebar without moving runtime actions into navigation',()=>{
  const html=fs.readFileSync('hedge-ops/local.html','utf8');
  const aside=html.match(/<aside class="engine-sidebar"[\s\S]*?<\/aside>/)[0];
  assert.equal((aside.match(/data-engine=/g)||[]).length,8);
  assert.doesNotMatch(aside,/id="(?:start|emergency|refresh|settings)"/);
  assert.match(html,/\.engine-sidebar nav\{display:flex;flex-direction:column/);
  assert.match(html,/@media\(max-width:650px\)/);
  assert.match(html,/hedge-console-visibility/);
});

test('Cex Hub and Perpdex switch in all run modes without recreating a trade workspace or sending a write',async()=>{
  const choice=surface();let tree=choice.render('Choice');
  const services=elements(tree,n=>n.type==='button'&&n.props.className==='hedge-ops-service');assert.equal(services.length,2);
  services[1].props.onClick();tree=choice.render('Choice');assert.ok(elements(tree,n=>n.type==='strong'&&n.props.children==='Cex Hub').length);assert.equal(choice.calls.length,0);
  const hosted=surface();hosted.render();await tick();hosted.render();tree=hosted.render();
  const frames=elements(tree,n=>n.type==='iframe').map(n=>({key:n.key,src:n.props.src}));
  elements(tree,n=>n.type==='button'&&n.props.className==='hedge-ops-service')[1].props.onClick();tree=hosted.render();
  assert.ok(elements(tree,n=>n.type==='iframe').every(n=>n.props.hidden));
  const tabs=elements(tree,n=>n.type==='nav'&&n.props.className==='hedge-ops-market-tabs')[0];
  assert.equal(elements(tabs,n=>n.type==='button')[1].props['aria-pressed'],true);
  elements(tabs,n=>n.type==='button')[0].props.onClick();tree=hosted.render();
  assert.equal(elements(elements(tree,n=>n.type==='nav'&&n.props.className==='hedge-ops-market-tabs')[0],n=>n.type==='button')[0].props['aria-pressed'],true);
  elements(tree,n=>n.type==='button'&&JSON.stringify(n.props.children).includes('返回交易工作台'))[0].props.onClick();tree=hosted.render();
  assert.deepEqual(elements(tree,n=>n.type==='iframe').map(n=>({key:n.key,src:n.props.src})),frames);
  assert.equal(elements(tree,n=>n.type==='iframe'&&!n.props.hidden).length,1);
  assert.ok(hosted.calls.every(c=>!c.options.method||c.options.method==='GET'));
  const local=surface();local.render('Local');await tick();tree=local.render('Local');
  const frame=elements(tree,n=>n.type==='iframe')[0],dom=local.domFrames.get(frame.key);
  local.listeners.get('message')({source:{},origin:'http://127.0.0.1:8812',data:{type:'hedge-open-cex-hub'}});
  assert.equal(elements(local.render('Local'),n=>n.props?.['aria-label']==='Cex Hub').length,0);
  local.listeners.get('message')({source:dom.contentWindow,origin:'http://127.0.0.1:8812',data:{type:'hedge-open-cex-hub'}});tree=local.render('Local');
  assert.match(elements(tree,n=>n.props?.['aria-label']==='Cex Hub')[0].props.className,/has-sidebar/);
  const localTabs=elements(tree,n=>n.type==='nav'&&n.props.className==='hedge-ops-market-tabs')[0];
  elements(localTabs,n=>n.type==='button')[0].props.onClick();tree=local.render('Local');
  assert.equal(local.messages.at(-1).data.type,'hedge-open-perpdex-box');assert.equal(local.messages.at(-1).data.service,'perpdex');
  const localBack=elements(tree,n=>n.type==='button'&&JSON.stringify(n.props.children).includes('返回交易工作台'))[0];localBack.props.onClick();tree=local.render('Local');
  assert.equal(elements(tree,n=>n.type==='iframe')[0].key,frame.key);assert.equal(elements(tree,n=>n.type==='iframe')[0].props.src,frame.props.src);
  assert.ok(local.calls.every(c=>!c.options.method||c.options.method==='GET'));
});

