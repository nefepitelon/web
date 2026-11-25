const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');
function load(file,imports={},globals={}) {
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require(name){if(name==='server-only')return{};if(name in imports)return imports[name];if(name==='node:crypto')return require(name);throw Error(`Unmocked ${name}`);},Date,Error,Map,Set,Number,Array,Math,JSON,Promise,AbortSignal,fetch,Response,URL,setTimeout,clearTimeout,process:{env:{}},...globals});
  return module.exports;
}
const engine=load('lib/stm-hunt/engine.ts');
const sources=load('lib/stm-hunt/sources.ts',{'../../api/alpha-scan.js':{}});
const service=load('lib/stm-hunt/service.ts',{'@/lib/prisma':{},'@vercel/functions':{getCache:()=>({get:async()=>null,set:async()=>undefined})},'./sources':{},'./engine':engine,'./store':{},'./history':{},'./capture-cache':{}});
const now=Date.parse('2026-11-19T10:00:00Z');
const iso=(minutes=0)=>new Date(now+minutes*60000).toISOString();
const candidate={id:'cex:BTC',symbol:'BTC',market:'cex',updatedAt:iso(-1),price:100,sources:['alpha']};
const market={symbol:'BTC',asOf:iso(-1),complete:true,close:100,breakout:true,volumeRatio:2,fundingPercentile:50,oiQuantityChange:1,priceChange:2};
const events=Array.from({length:3},(_,i)=>({id:`e${i}`,traderId:`trader${i}`,asset:'cex:BTC',symbol:'BTC',side:'long',action:'open',occurredAt:iso(-5),exact:true,qualified:true,quantity:1,clusterId:`entity${i}`}));
function evaluate(patch={}) {return engine.evaluateStmStrategies({asOf:iso(),candidates:[candidate],snapshots:[],events,chainEvents:[],markets:[market],...patch});}
const find=(rows,id)=>rows.find(row=>row.strategy===id);
test('S1 requires exact fresh open/add longs and closed market evidence',()=>{
  assert.equal(find(evaluate(),'S1').actionable,true);
  assert.equal(find(evaluate({events:events.map(row=>({...row,exact:false}))}),'S1').actionable,false);
  assert.equal(find(evaluate({events:events.map(row=>({...row,side:'short',action:'close'}))}),'S1').entities,0);
  assert.equal(find(evaluate({events:events.map(row=>({...row,occurredAt:iso(1)}))}),'S1').entities,0);
  assert.equal(find(evaluate({markets:[{...market,asOf:iso(-30)}]}),'S1').actionable,false);
});
test('S5 unknown evidence and crowding both veto entries without authorizing short sales',()=>{
  const unknown=evaluate({markets:[{...market,fundingPercentile:null}]});
  assert.equal(find(unknown,'S5').status,'blocked');assert.equal(find(unknown,'S1').actionable,false);
  const crowded=evaluate({markets:[{...market,fundingPercentile:99,oiQuantityChange:10}]});
  assert.equal(find(crowded,'S5').status,'risk');assert.equal(find(crowded,'S1').actionable,false);assert.equal(find(crowded,'S5').direction,'observe');
  assert.equal(find(evaluate({markets:[{...market,fundingPercentile:99,oiQuantityChange:-1}]}),'S1').actionable,true);
});
function snapshots({spot=false,decreasing=false,qualified=true,visibility='public',duplicates=false}={}) {
  const values=[0,1,2].map(index=>({asOf:iso(-30+index*10),traders:Array.from({length:3},(_,i)=>({id:`holder${i}`,address:`0x${String(i+1).padStart(40,'0')}`,qualified,visibility,updatedAt:iso(-30+index*10),holdings:[{asset:spot?'bsc:token':'cex:BTC',quantity:decreasing?3-index:1+index,side:spot?'spot':'long',valueUsd:100}]}))}));
  return duplicates?values.flatMap(row=>[row,{...row,asOf:new Date(Date.parse(row.asOf)+60000).toISOString()}]):values;
}
test('S2 uses quantity, original cohort, qualified identities and three distinct source timestamps',()=>{
  assert.equal(find(evaluate({snapshots:snapshots({duplicates:true})}),'S2').actionable,true);
  assert.equal(find(evaluate({snapshots:snapshots({qualified:false})}),'S2').entities,0);
  assert.equal(find(evaluate({snapshots:snapshots({visibility:'truncated'})}),'S2').entities,0);
  const same=snapshots();same.forEach(row=>row.traders.forEach(trader=>trader.holdings[0].quantity=1));
  assert.equal(find(evaluate({snapshots:same}),'S2').entities,0);
  const joined=snapshots();joined[0].traders=[];
  assert.equal(find(evaluate({snapshots:joined}),'S2').entities,0);
});
test('S2 spot balances require verified swaps in both intervals and chain wallet identity matches',()=>{
  const snap=snapshots({spot:true});
  const c={...candidate,id:'bsc:token',market:'onchain',chain:'bsc'};
  assert.equal(find(evaluate({candidates:[c],snapshots:snap}),'S2').entities,0);
  const chainEvents=[-25,-15].flatMap(minutes=>snap[0].traders.map(trader=>({asset:c.id,traderId:`bsc:${trader.address}`,verified:true,exact:true,action:'swap-buy',occurredAt:iso(minutes)})));
  assert.equal(find(evaluate({candidates:[c],snapshots:snap,chainEvents}),'S2').entities,3);
  chainEvents[0].verified=false;
  assert.equal(find(evaluate({candidates:[c],snapshots:snap,chainEvents}),'S2').entities,2);
});
test('S3 deduplicates funding clusters, rejects stale buys, absent routes, and sold positions',()=>{
  const c={...candidate,id:'bsc:token',market:'onchain',chain:'bsc'};
  const chainEvents=events.map(row=>({...row,asset:c.id,verified:true,action:'swap-buy',retained:true,riskPassed:true,routeAvailable:true,liquidityUsd:200000}));
  assert.equal(find(evaluate({candidates:[c],chainEvents}),'S3').actionable,true);
  assert.equal(find(evaluate({candidates:[c],chainEvents:chainEvents.map(row=>({...row,clusterId:'same'}))}),'S3').entities,1);
  for(const patch of [{occurredAt:iso(-11)},{routeAvailable:false},{retained:false},{riskPassed:false},{liquidityUsd:null}])assert.equal(find(evaluate({candidates:[c],chainEvents:chainEvents.map(row=>({...row,...patch}))}),'S3').actionable,false);
});
test('S4 is an exit warning and ignores hidden or missing positions',()=>{
  const rows=evaluate({snapshots:snapshots({decreasing:true})});
  assert.equal(find(rows,'S4').status,'risk');assert.equal(find(rows,'S4').direction,'exit');assert.equal(find(rows,'S4').actionable,false);
  assert.equal(find(evaluate({snapshots:snapshots({decreasing:true,visibility:'private'})}),'S4').entities,0);
});
test('source normalization preserves Solana address case and rejects ambiguous dates and unknown numbers',()=>{
  assert.equal(sources.stmTimestamp('2026-11-19 10:00:00'),null);assert.equal(sources.stmNumber(null),null);assert.equal(sources.stmNumber(''),null);
  assert.equal(sources.stmAsset('solana','AbC'),'solana:AbC');
  const roster=sources.normalizeStmRoster('okx',{traders:[{id:'abc',address:'AbC',shortfall:true,pnlUsd:null}]},{holdings:{abc:{positions:[{symbol:'X',mint:'MintCaSe',size:'5',valueUsd:10}]}}},iso());
  assert.equal(roster[0].address,'AbC');assert.equal(roster[0].holdings[0].asset,'solana:MintCaSe');assert.equal(roster[0].visibility,'truncated');assert.equal(roster[0].updatedAt,null);assert.equal(roster[0].qualified,false);
  const hidden=sources.normalizeStmRoster('binance',{traders:[{id:'x',statusKey:'private'}]},{holdings:{x:{shared:false,positions:[{symbol:'BTC',size:100}]}}},iso());
  assert.equal(hidden[0].holdings.length,0);assert.equal(hidden[0].visibility,'private');
});

test('actual Alpha display rows parse USD prices and change while keeping volume multiples out of dollar volume',()=>{
  const actual={symbol:'BTC',name:'Bitcoin',market:'both',price:'$101,234.5',change:2.71,volume:26.13,score:86,bias:'偏多',reason:'小时量能 26.1×'};
  const row=sources.normalizeStmAlphaCandidate(actual,iso());
  assert.equal(row.price,101234.5);assert.equal(row.change24h,2.71);assert.equal(row.volumeUsd,null);assert.equal(row.updatedAt,iso());
  assert.equal(sources.normalizeStmAlphaCandidate({...actual,price:'$0.0000123'},iso()).price,0.0000123);
  assert.equal(sources.normalizeStmAlphaCandidate({...actual,price:'$12,34.50'},iso()).price,null);
  assert.equal(sources.normalizeStmAlphaCandidate({...actual,price:'26.13×'},iso()).price,null);
  assert.equal(sources.normalizeStmAlphaCandidate({...actual,price:'$0.0000000'},iso()).price,null);
  assert.equal(sources.normalizeStmAlphaCandidate({...actual,volumeUsd:12_000_000},iso()).volumeUsd,12_000_000);
  assert.equal(sources.normalizeStmAlphaCandidate({...actual,volume24h:26.13},iso()).volumeUsd,null);
});

test('WSM profiles retain real avatars, handles, reported assets and partial portfolio semantics',()=>{
  const [fomo]=sources.normalizeStmRoster('fomo',{data:[{id:'frank',name:'Frank',handle:'frankdegods',avatar:'https://images.example.com/frank.webp',evm:'0x696d1265c8fc4f14797abebfae3c43ebfa9d8e28',sol:'498g1rVnFcnjBjpfw1xyqA1WvgQXUU8RWuELjxkjAayQ',total_usd:21942,official_rank:1,chains:[{chain:'solana',usd:17099}],top_tokens:[{symbol:'NIO',chain:'solana',usd:10629,logo:'https://images.example.com/nio.webp'}],holdings_updated_at:iso(-5)}]},null,iso(),iso());
  assert.equal(fomo.avatarUrl,'https://images.example.com/frank.webp');assert.equal(fomo.handle,'frankdegods');assert.equal(fomo.socialLinks[0].url,'https://x.com/frankdegods');
  assert.equal(fomo.totalValueUsd,21942);assert.equal(fomo.valueBasis,'wallet');assert.equal(fomo.chains[0].valueUsd,17099);assert.equal(fomo.chainsScope,'reported');assert.equal(fomo.wallets.length,2);
  assert.equal(fomo.holdings[0].logoUrl,'https://images.example.com/nio.webp');assert.equal(fomo.holdings[0].quantity,null);assert.equal(fomo.visibility,'truncated');assert.equal(fomo.holdingsCount,null);
  const [hidden]=sources.normalizeStmRoster('binance',{generatedAt:'2026-11-19 10:23:11',traders:[{id:'x',name:'Trader',avatar:'./avatars/x.webp',assetsUsd:1000,statusKey:'private',profileUrl:'javascript:alert(1)'}]},{holdings:{x:{shared:false,positions:[{symbol:'BTC',size:3,valueUsd:99}]}}},iso(),iso());
  assert.equal(hidden.avatarUrl,'https://web3smartmoney.com/binance/avatars/x.webp');assert.equal(hidden.profileUrl,null);assert.equal(hidden.totalValueUsd,1000);assert.equal(hidden.valueBasis,'account-equity');
  assert.equal(hidden.updatedAt,null);assert.equal(hidden.sourceUpdatedAt,iso());assert.equal(hidden.holdings.length,0);assert.equal(hidden.chains.length,0);
  const [partial]=sources.normalizeStmRoster('pump',{traders:[{userId:'p',wallet:'498g1rVnFcnjBjpfw1xyqA1WvgQXUU8RWuELjxkjAayQ'}]},{p:{quality:20,valueUsd:123,positions:[{symbol:'NIO',chainId:1399811149,mint:'MintCaSe',held:3,valueUsd:4,priceUsd:1.333,pnlUsd:-2}]}},iso());
  assert.equal(partial.totalValueUsd,null,'a source subtotal must not become total wallet assets');assert.equal(partial.holdingsCount,20);assert.equal(partial.visibility,'truncated');assert.equal(partial.chainsScope,'disclosed');assert.equal(partial.holdings[0].pnlUsd,-2);
  for(const value of ['javascript:alert(1)','data:image/svg+xml,bad','https://user:pass@example.com/avatar'])assert.equal(sources.stmPublicUrl(value),null);
});

test('shared FOMO tokens preserve exact contracts, reported totals and holder IDs without guessing ticker identities',()=>{
  const mint='6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx';
  const raw={shared_tokens:[{symbol:'STONK',name:'STONK',chain:'solana',address:mint,logo:'https://example.com/stonk.webp',price:0.12,total_usd:12517008,
    holders:[{id:'pointfarmcap',name:'point farm capital',usd:5103800},{id:'tiny',name:'Tiny',usd:12},{id:'pointfarmcap',name:'point farm capital',usd:5103800}],
    info:{description:'Provider description',websites:[{label:'Website',url:'https://example.com/'}],twitter:'https://x.com/LaunchOnSF',telegram:'javascript:alert(1)'}},
    {symbol:'STONK',chain:'solana',total_usd:10,holders:[{id:'unlinked',usd:10}]},
    {symbol:'BAD',chain:'solana',address:`0x${'1'.repeat(40)}`,holders:[]}]};
  const list=sources.normalizeStmSharedHoldings(raw,iso(-5));assert.equal(list.length,1);const row=list[0];
  assert.equal(row.id,`solana:${mint}`);assert.equal(row.address,mint);assert.equal(row.totalValueUsd,12517008,'explicit source total is not replaced by a partial holder sum');
  assert.equal(row.holdersCount,2);assert.deepEqual(Array.from(row.holderIds),['wsm:fomo:pointfarmcap','wsm:fomo:tiny']);assert.equal(row.holders[1].valueUsd,12,'no invented per-holder $500 threshold');
  assert.equal(row.wallets.length,0);assert.equal(row.scope,'source-reported');assert.equal(row.reported,true);assert.equal(row.sourceUpdatedAt,iso(-5));assert.equal(row.socialLinks.length,2);assert.equal(row.quantity,undefined);assert.equal(row.actionable,undefined);
});

test('public source revalidation keeps six-day-old upstream data stale despite a successful new HTTP check',async()=>{
  const checked=Date.parse('2026-11-25T08:00:00Z'),old='2026-11-19T02:23:11.000Z',requests=[];
  class ProbeDate extends Date{constructor(...args){super(...(args.length?args:[checked]));}static now(){return checked;}}
  const captured=load('lib/stm-hunt/sources.ts',{'../../api/alpha-scan.js':{buildAlphaScanSnapshot:async()=>({items:[],scannedAt:old})}},{Date:ProbeDate,fetch:async(url,options)=>{
    requests.push({url,options});const p=new URL(url).pathname;
    const data=p==='/version.json'?{builtAt:old,sources:Object.fromEntries(['fomo','hl','pump','binance','lighter','okx'].map(board=>[board,old]))}:p.endsWith('/traders.json')?{traders:[],data:[],fetchedAt:old}:{};
    return new Response(JSON.stringify(data),{status:200});
  }});
  const result=await captured.captureStmSources();assert.equal(result.schemaVersion,2);
  for(const source of result.sources.filter(row=>/^wsm-(fomo|hl|pump|binance|lighter|okx)$/.test(row.id))){
    assert.equal(source.status,'stale');assert.equal(source.updatedAt,old);assert.equal(source.checkedAt,new Date(checked).toISOString());assert.ok(source.sourceAgeSeconds>5*86400);
  }
  const publicRequests=requests.filter(row=>new URL(row.url).hostname==='web3smartmoney.com');assert.equal(publicRequests.length,12);
  assert.ok(publicRequests.every(row=>new URL(row.url).searchParams.get('stm_check')===String(Math.floor(checked/60000))&&row.options.cache==='no-store'&&row.options.headers['Cache-Control']==='no-cache'));
});
test('captured replay executes next available price with costs, never the signal snapshot, and reports insufficient data honestly',()=>{
  const captures=[0,5,70].map((minutes,index)=>({asOf:iso(minutes),candidates:[{...candidate,price:[100,110,121][index],updatedAt:iso(minutes-1)}],traders:[],sources:[],events:events.map(row=>({...row,occurredAt:iso(minutes-2)})),chainEvents:[],markets:[{...market,asOf:iso(minutes-1)}]}));
  const result=service.runStmReplay(captures,engine.STM_STRATEGIES,10,30);
  assert.equal(result.performance.trades,1);assert.ok(result.returns>0 && result.returns<1,'one $1000 trade bought near110 and sold near121 on $10000 equity');
  const empty=service.runStmReplay(captures.map(row=>({...row,events:[]})),engine.STM_STRATEGIES,10,30);
  assert.equal(empty.returns,null);assert.equal(empty.performance.trades,0);
  const noNext=service.runStmReplay([captures[0]],engine.STM_STRATEGIES,10,30);assert.equal(noNext.returns,null);
});

test('BSC scanner discovers token transfer candidates, deduplicates receipts and never promotes transfers to trades',()=>{
  const scanner=load('lib/stm-hunt/scanner.ts',{'@/lib/prisma':{},'./store':{},'./risk':{},'./onchain':{}});
  const wallet=`0x${'1'.repeat(40)}`,token=`0x${'2'.repeat(40)}`,hash=`0x${'3'.repeat(64)}`;
  const topic=address=>`0x${address.slice(2).padStart(64,'0')}`;
  const log={address:token,transactionHash:hash,blockNumber:'0x100',logIndex:'0x1',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(wallet),topic(wallet)]};
  const rows=scanner.stmScanCandidates([log,log,{...log,removed:true},{...log,address:'0x55d398326f99059ff775485246999027b3197955'},{...log,topics:['0x00',topic(wallet)]},{...log,blockNumber:'invalid'}],[wallet]);
  assert.equal(rows.length,1);assert.equal(rows[0].wallet,wallet);assert.equal(rows[0].token,token);assert.equal(rows[0].block,256n);
  assert.equal(rows[0].verified,undefined);assert.equal(rows[0].qualified,undefined);assert.equal(rows[0].key,`bsc:${hash}:${wallet}:${token}`);
});

test('BSC scanner is explicitly idle without vetted wallets and does not query RPC',async()=>{
  const writes=[];
  const scanner=load('lib/stm-hunt/scanner.ts',{'@/lib/prisma':{prisma:{stmHuntRecord:{createMany:async()=>({count:1}),updateMany:async()=>({count:1})}}},'./store':{listRecords:async()=>[],putRecord:async(...args)=>writes.push(args)},'./risk':{},'./onchain':{}});
  const result=await scanner.scanStmBscWallets();assert.equal(result.status,'idle');assert.equal(result.wallets,0);assert.equal(result.verified,0);assert.equal(writes[0][1],'scanner-status');
});
