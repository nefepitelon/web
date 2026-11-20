const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file){const module={exports:{}};const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(source,{module,exports:module.exports,URL,Buffer,require(name){if(name==='server-only')return{};if(name==='@/lib/trading-proxy-security')return load('lib/trading-proxy-security.ts');return require(name);}});return module.exports;}
const security=load('lib/trading-proxy-security.ts');
test('both cloud trading credential paths reject private, encoded, mapped and reserved proxy targets',()=>{
 for(const file of ['lib/alpha-execution/credentials.ts','lib/tidesight/execution/credentials.ts']){
  const {normalizeTradingProxy}=load(file);
  for(const target of ['http://[::1]:8080','http://[::ffff:127.0.0.1]:8080','http://[fd00::1]:8080','http://[fe80::1]:8080','http://127.1:8080','http://2130706433:8080','http://localhost.:8080','http://a.localhost:8080','http://service.internal:8080','http://10.1.2.3:8080','http://169.254.169.254:8080','http://100.64.0.1:8080'])assert.throws(()=>normalizeTradingProxy(target),/代理/);
  assert.equal(normalizeTradingProxy('direct'),'direct');assert.equal(normalizeTradingProxy(''), '');
  assert.equal(normalizeTradingProxy('http://user:pass@8.8.8.8:8080'),'http://user:pass@8.8.8.8:8080');
 }
});
function resolveWith(records,options={}){return new Promise(resolve=>{let lookups=0;const resolver=(host,opts,callback)=>{lookups++;assert.equal(opts.all,true);callback(null,records);};security.createPublicProxyLookup(resolver)('proxy.example.com',options,(error,address,family)=>resolve({code:error?.code,address,family,lookups}));});}
test('connector DNS lookup rejects a private or mixed answer and preserves public family selection',async()=>{
 assert.equal((await resolveWith([{address:'127.0.0.1',family:4}])).code,'EACCES');
 assert.equal((await resolveWith([{address:'8.8.8.8',family:4},{address:'::ffff:10.0.0.1',family:6}])).code,'EACCES');
 const all=await resolveWith([{address:'8.8.8.8',family:4},{address:'2606:4700:4700::1111',family:6}],{all:true});
 assert.equal(all.code,undefined);assert.equal(all.address.length,2);assert.equal(all.lookups,1);
 const one=await resolveWith([{address:'8.8.8.8',family:4}]);assert.equal(one.address,'8.8.8.8');assert.equal(one.family,4);
});
