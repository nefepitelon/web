const test=require("node:test");
const assert=require("node:assert/strict");
require("tsx/cjs");
const {createAlphaAutomationMarketLoader,alphaClosedCandleIndicators,alphaDepthSlippage}=require("../lib/alpha-execution/automation-market.ts");
const {selectAlphaAutomationCandidates}=require("../lib/alpha-execution/automation-strategy.ts");
const now=Date.parse("2026-09-09T10:00:01.000Z"),bar=15*60_000;
function candles(count=30) {
  const lastOpen=Math.floor(now/bar)*bar-bar;
  return Array.from({length:count},(_,i)=>{
    const close=100+i*0.2,open=lastOpen-(count-1-i)*bar;
    return [open,String(close-0.1),String(close+0.4),String(close-0.4),String(close),i===count-1?"150":"100",open+bar-1];
  });
}
function source(symbol="BTC",patch={}) {return {symbol,score:86,bias:"long",signalType:"多头共振",dimensions:[95,94,70,70,70,70,70],dimensionAvailability:[true,true,true,true,true,true,true],...patch};}
function signal(symbol="BTC",patch={}) {return {symbol,pair:`${symbol}USDT`,dedupe_hash:`${symbol}:original:1`,direction:"long",price_change_pct:1.2,oi_change_pct:3,
  confidence:1,parse_status:"parsed",source_mode:"public_preview",signal_time:new Date(now-1000).toISOString(),signal_time_source:"source_timestamp",...patch};}
function metadata(symbol) {return {symbol:`${symbol}USDT`,status:"TRADING",contractType:"PERPETUAL",quoteAsset:"USDT",filters:[
  {filterType:"PRICE_FILTER",tickSize:"0.01"},{filterType:"LOT_SIZE",stepSize:"0.001",minQty:"0.001",maxQty:"10000"},
  {filterType:"MARKET_LOT_SIZE",stepSize:"0.001",minQty:"0.002",maxQty:"1000"},{filterType:"MIN_NOTIONAL",notional:"5"}]};}
function harness(options={}) {
  const symbols=options.symbols??["BTC"],calls=[],requests={active:0,max:0};
  const fetchImpl=async(url,init)=>{
    const parsed=new URL(url);calls.push({url,init,startedAt:options.now?.()??now});
    if(options.beforeFetch)await options.beforeFetch(parsed);
    if(options.fail?.(parsed)) return new Response("unavailable",{status:503});
    if(["t.me","telegram.me","r.jina.ai"].includes(parsed.hostname)&&options.publicPreviewHtml!==undefined)
      return new Response(options.publicPreviewHtml,{headers:{"content-type":"text/html",...(options.previewHeaders??{})}});
    const specific=!!parsed.searchParams.get("symbol");
    if(specific){requests.active++;requests.max=Math.max(requests.max,requests.active);await new Promise(resolve=>setTimeout(resolve,1));requests.active--;}
    let data;
    if(parsed.hostname==="cryptobubbles.net") data=symbols.map((symbol,i)=>({symbol,symbols:{binance:`${symbol}_USDT`},performance:{day:3+i*0.01},volume:30_000_000}));
    else if(parsed.pathname.endsWith("exchangeInfo")) data={symbols:symbols.map(metadata)};
    else if(parsed.pathname.endsWith("ticker/24hr")) data=symbols.map(symbol=>({symbol:`${symbol}USDT`,quoteVolume:"30000000",priceChangePercent:"3",closeTime:now-1000}));
    else if(parsed.pathname.endsWith("ticker/bookTicker")) {
      const rows=symbols.map(symbol=>({symbol:`${symbol}USDT`,bidPrice:"105.79",askPrice:"105.81",time:now-1000}));
      data=specific?rows.find(row=>row.symbol===parsed.searchParams.get("symbol")):rows;
    }
    else if(parsed.pathname.endsWith("premiumIndex")) data=symbols.map(symbol=>({symbol:`${symbol}USDT`,lastFundingRate:"0.00005",time:now-1000}));
    else if(parsed.pathname.endsWith("/depth")) data={E:now-100,bids:[["105.79","10"]],asks:[["105.81","10"]]};
    else if(parsed.pathname.endsWith("/klines")) data=candles();
    else if(parsed.pathname.endsWith("openInterestHist")) data=[{sumOpenInterest:"1000",timestamp:now-301000},{sumOpenInterest:"1020",timestamp:now-1000}];
    else throw new Error(`Unexpected URL: ${url}`);
    data=options.mutate?.(parsed,data)??data;
    return new Response(JSON.stringify(data),{headers:options.headers??{"content-type":"application/json"}});
  };
  const loader=createAlphaAutomationMarketLoader({fetchImpl,now:options.now??(()=>now),
    scanLoader:options.scanLoader??(async()=>({scannedAt:new Date(now-1000).toISOString(),items:symbols.map(symbol=>source(symbol))})),
    signalLoader:options.publicPreviewHtml!==undefined?undefined:options.signalLoader??(async()=>({latest:symbols.map(symbol=>signal(symbol))})),
  });
  return {loader,calls,requests};
}

test("closed candle features use true range with gaps, exclude forming bars and validate continuity",()=>{
  const raw=candles(),normal=alphaClosedCandleIndicators(raw,now);
  const lastOpen=Math.floor(now/bar)*bar;
  assert.deepEqual(alphaClosedCandleIndicators([...raw,[lastOpen,"bad",NaN,Infinity,-1,-5,lastOpen+bar-1]],now),normal);
  const gapped=candles();const last=gapped.length-1;gapped[last]=[gapped[last][0],"110","111","109","110","150",gapped[last][6]];
  const prior=Number(gapped[last-1][4]);
  assert.ok(Math.abs(alphaClosedCandleIndicators(gapped,now).atrPct-((13*0.8+Math.max(2,111-prior))/14/110*100))<1e-8);
  assert.equal(normal.volumeMultiple,1.5);
  const missing=candles();missing.splice(20,1);assert.throws(()=>alphaClosedCandleIndicators(missing,now),/non-contiguous/);
  const unordered=candles().reverse();assert.throws(()=>alphaClosedCandleIndicators(unordered,now),/non-contiguous/);
  assert.throws(()=>alphaClosedCandleIndicators(candles().slice(-14),now),/15 closed/);
  assert.throws(()=>alphaClosedCandleIndicators(candles(),now+bar+5000),/stale/);
  const zeroVolume=candles();zeroVolume.forEach(row=>row[5]="0");assert.equal(alphaClosedCandleIndicators(zeroVolume,now).volumeMultiple,null);
  assert.equal(alphaClosedCandleIndicators(candles().slice(-15),now).volumeMultiple,null);
});

test("depth simulation verifies both sides and never invents missing liquidity",()=>{
  const depth={bids:[["100","0.1"],["99","10"]],asks:[["100.01","0.1"],["101","10"]]};
  assert.ok(alphaDepthSlippage(depth,50)>0.5);
  assert.equal(alphaDepthSlippage({bids:[["100","1"]],asks:[["100.01","1"]]},50),0);
  assert.throws(()=>alphaDepthSlippage({bids:[["100","1"]],asks:[["100.01","0.001"]]},50),/insufficient liquidity/);
  assert.throws(()=>alphaDepthSlippage({bids:[["102","1"]],asks:[["100","1"]]},50),/crossed/);
  assert.throws(()=>alphaDepthSlippage({bids:[["100","0.01"],["101","1"]],asks:[["102","1"]]},50),/level order/);
});

test("public adapter returns genuine distinct evidence and a validated fresh futures snapshot using GET only",async()=>{
  const h=harness();const result=await h.loader({enabled:true});
  assert.equal(result.markets.length,1);
  assert.deepEqual(new Set(result.observations.map(row=>row.source)),new Set(["anomaly","momentum","signal","risk_pool"]));
  const scan=result.observations.find(row=>row.source==="anomaly"),pool=result.observations.find(row=>row.source==="risk_pool");
  assert.equal(scan.evidenceId,pool.evidenceId);
  assert.equal(pool.riskPoolPriority,"P1");
  assert.equal(scan.priceMomentumScore,95);assert.equal(scan.volumeAnomalyScore,94);
  assert.equal(result.observations.find(row=>row.source==="signal").score,null,"parse confidence is not predictive score");
  const market=result.markets[0];assert.equal(market.symbol,"BTCUSDT");assert.equal(market.market,"futures");
  assert.equal(market.quoteVolume24h,30_000_000);assert.equal(market.filters.minQty,0.002);assert.equal(market.filters.maxQty,1000);
  assert.equal(market.volumeMultiple,1.5);assert.equal(market.takerFeePct,0.06);assert.equal(market.oiChangePct,null);assert.equal(market.fundingPct,null);
  assert.ok(result.sourceStatus.find(row=>row.source==="market").message.includes("estimate"));
  for(const call of h.calls){assert.equal(call.init.method,"GET");assert.equal(call.init.cache,"no-store");assert.ok(call.init.signal);assert.equal(Object.hasOwn(call.init.headers,"Authorization"),false);}
  const selected=selectAlphaAutomationCandidates({settings:{enabled:true},now,market:"futures",...result,
    account:{observedAt:now-1000,equity:1000,dayStartEquity:1000,dailyPnl:0,availableMargin:1000,openPositions:[],pendingEntries:[],reconciliationHealthy:true,killSwitch:false,unresolvedOrders:false},recentEntries:[],lastOrderAt:null});
  assert.equal(selected.candidates.length,1,JSON.stringify(selected));
});

test("source failures and fabricated, stale or timestamp-less messages never fall back to demo data",async()=>{
  const h=harness({scanLoader:async()=>{throw new Error("scanner unavailable");},signalLoader:async()=>({latest:[
    signal("BTC",{source_mode:"mock"}),signal("BTC",{source_mode:"unknown"}),signal("BTC",{signal_time:null}),
    signal("BTC",{dedupe_hash:"old",signal_time:new Date(now-601000).toISOString()}),
  ]})});
  const result=await h.loader({enabled:true});
  assert.equal(result.markets.length,0);
  assert.deepEqual(new Set(result.observations.filter(row=>row.source==="signal").map(row=>row.observedAt)),new Set([null,now-601000]));
  assert.equal(result.observations.find(row=>row.source==="signal"&&row.observedAt===null).dataComplete,false,"unknown event remains visible for diagnostics without invented time");
  assert.equal(result.sourceStatus.find(row=>row.source==="anomaly").ok,false);
  assert.equal(result.sourceStatus.find(row=>row.source==="risk_pool").ok,false);
  assert.equal(result.observations.some(row=>row.source==="anomaly"),false);
  const partial=harness({scanLoader:async()=>({scannedAt:new Date(now-1000).toISOString(),items:[source("BTC",{dimensionAvailability:[false,true,true,true,true,true,true]})]})});
  const incomplete=await partial.loader({enabled:true,selectedStrategies:["anomaly"]});assert.equal(incomplete.markets.length,0);assert.equal(incomplete.observations.find(row=>row.source==="anomaly").dataComplete,false);
});

test("failed symbol enrichment is isolated while global metadata failures produce no executable snapshots",async()=>{
  const h=harness({symbols:["BTC","ETH"],fail:url=>url.pathname.endsWith("depth")&&url.searchParams.get("symbol")==="BTCUSDT"});
  const result=await h.loader({enabled:true});assert.deepEqual(result.markets.map(row=>row.symbol),["ETHUSDT"]);
  assert.ok(result.sourceStatus.find(row=>row.source==="market").message.includes("BTCUSDT"));
  const failed=await harness({fail:url=>url.pathname.endsWith("exchangeInfo")}).loader({enabled:true});
  assert.equal(failed.markets.length,0);assert.equal(failed.sourceStatus.find(row=>row.source==="market").ok,false);
  const stale=await harness({headers:{age:"700"}}).loader({enabled:true});
  assert.equal(stale.markets.length,0);assert.equal(stale.sourceStatus.find(row=>row.source==="momentum").ok,false);
});

test("metadata cache and at most twelve symbols with three enrichment jobs keep public requests bounded",async()=>{
  const symbols=Array.from({length:20},(_,i)=>`COIN${String(i).padStart(2,"0")}`),h=harness({symbols});
  const first=await h.loader({enabled:true});assert.equal(first.markets.length,12);assert.ok(h.requests.max<=9);
  assert.equal(h.calls.filter(row=>row.url.includes("/depth?")).length,12);
  assert.equal(h.calls.filter(row=>row.url.includes("/ticker/bookTicker?")).length,12);
  assert.equal(h.calls.some(row=>row.url.endsWith("/ticker/bookTicker")),false,"per-symbol book replaces redundant bulk book");
  await h.loader({enabled:true});assert.equal(h.calls.filter(row=>row.url.endsWith("exchangeInfo")).length,1);
});

test("spot-only leaders do not consume the twelve tradable-symbol enrichment slots",async()=>{
  const symbols=Array.from({length:25},(_,i)=>`COIN${String(i).padStart(2,"0")}`);
  const h=harness({symbols,mutate:(url,data)=>url.pathname.endsWith("exchangeInfo")?{symbols:data.symbols.slice(12)}:data});
  const result=await h.loader({selectedStrategies:["anomaly"]});
  assert.deepEqual(result.markets.map(row=>row.symbol),symbols.slice(12,24).map(symbol=>`${symbol}USDT`));
  const reasons=new Map(result.marketRejections.map(row=>[row.symbol,row]));
  for(const symbol of symbols.slice(0,12))assert.equal(reasons.get(`${symbol}USDT`).reason,"MARKET_NOT_TRADABLE");
  assert.equal(reasons.get("COIN24USDT").reason,"MARKET_ENRICHMENT_LIMIT");
  assert.equal(result.marketRejections.length,13);
  for(const path of ["/ticker/bookTicker?","/depth?","/klines?"])assert.equal(h.calls.filter(row=>row.url.includes(path)).length,12);
  assert.ok(h.requests.max<=9);
  assert.ok(h.calls.filter(row=>new URL(row.url).searchParams.has("symbol")).every(row=>!symbols.slice(0,12).some(symbol=>new URL(row.url).searchParams.get("symbol")===`${symbol}USDT`)));
});

test("matched inactive, non-perpetual and non-USDT markets return explicit reasons without execution-data requests",async()=>{
  for(const patch of [{status:"SETTLING"},{contractType:"CURRENT_QUARTER"},{quoteAsset:"USDC"}]) {
    const h=harness({mutate:(url,data)=>url.pathname.endsWith("exchangeInfo")?{symbols:[{...metadata("BTC"),...patch}]}:data});
    const result=await h.loader({selectedStrategies:["anomaly"]});
    assert.equal(result.markets.length,0);assert.equal(result.marketRejections[0].reason,"MARKET_NOT_TRADABLE");
    assert.equal(result.marketRejections[0].symbol,"BTCUSDT");
    assert.equal(h.calls.some(row=>new URL(row.url).searchParams.has("symbol")),false);
    assert.equal(result.sourceStatus.find(row=>row.source==="market").ok,false);
  }
});

test("matched symbols receive safe per-symbol diagnostics for metadata, ticker and enrichment failures",async()=>{
  for(const failedPath of ["exchangeInfo","ticker/24hr","depth"]) {
    const result=await harness({fail:url=>url.pathname.endsWith(failedPath)}).loader({selectedStrategies:["anomaly"]});
    assert.equal(result.marketRejections.length,1);
    const rejection=result.marketRejections[0];
    assert.equal(rejection.symbol,"BTCUSDT");assert.equal(rejection.reason,"MARKET_DATA_UNAVAILABLE");
    assert.match(rejection.message,/[\u4e00-\u9fff]/);assert.doesNotMatch(rejection.message,/HTTP|503|https?:|fapi|Error/);
  }
  const malformed=await harness({mutate:(url,data)=>url.pathname.endsWith("exchangeInfo")?{symbols:[{...metadata("BTC"),filters:[]}]}:data}).loader({selectedStrategies:["anomaly"]});
  assert.equal(malformed.marketRejections[0].reason,"MARKET_DATA_UNAVAILABLE");
});

test("slow source collection precedes fresh execution quotes without refreshing source evidence",async()=>{
  let current=now;
  const h=harness({symbols:["BTC","ETH"],now:()=>current,
    scanLoader:async()=>{await new Promise(resolve=>setImmediate(resolve));current+=35_000;
      return {scannedAt:new Date(now-1000).toISOString(),items:[source("BTC")]};},
    signalLoader:async()=>({latest:[signal("BTC"),signal("ETH",{signal_time:new Date(now-601_000).toISOString()})]}),
    mutate:(url,data)=>url.pathname.endsWith("ticker/24hr")?data.map(row=>({...row,closeTime:current-1000}))
      :url.pathname.endsWith("ticker/bookTicker")?{...data,time:current-100}
      :url.pathname.endsWith("/depth")?{...data,E:current-100}:data});
  const result=await h.loader({enabled:true,selectedStrategies:["strong_signal"]});
  assert.deepEqual(result.markets.map(row=>row.symbol),["BTCUSDT"]);
  const quoteCalls=h.calls.filter(row=>/ticker\/24hr|ticker\/bookTicker|\/depth\?/.test(row.url));
  assert.ok(quoteCalls.every(row=>row.startedAt===current),"source work must finish before execution-price requests");
  assert.equal(result.markets[0].quoteAt,current-100);
  assert.equal(result.observations.find(row=>row.source==="signal"&&row.symbol==="BTCUSDT").observedAt,now-1000);
  assert.equal(result.observations.find(row=>row.source==="signal"&&row.symbol==="ETHUSDT").observedAt,now-601_000);
  const selection=selectAlphaAutomationCandidates({settings:{enabled:true,selectedStrategies:["strong_signal"]},now:current,market:"futures",...result,
    account:{observedAt:current,equity:1000,dayStartEquity:1000,dailyPnl:0,availableMargin:1000,openPositions:[],pendingEntries:[],reconciliationHealthy:true,killSwitch:false,unresolvedOrders:false},recentEntries:[],lastOrderAt:null});
  assert.equal(selection.candidates.length,1,JSON.stringify(selection));
  assert.equal(selection.candidates[0].evidenceExpiresAt,now-1000+600_000,"receipt of a new book cannot extend old strategy evidence");
});

test("queued enrichment uses each symbol's latest book while preserving original market observations",async()=>{
  let current=now;
  const symbols=Array.from({length:12},(_,i)=>`COIN${String(i).padStart(2,"0")}`);
  const h=harness({symbols,now:()=>current,
    beforeFetch:async url=>{if(url.pathname.endsWith("ticker/bookTicker")&&["COIN03USDT","COIN06USDT","COIN09USDT"].includes(url.searchParams.get("symbol")))current+=15_000;},
    mutate:(url,data)=>url.pathname.endsWith("ticker/bookTicker")?{...data,time:current-100}
      :url.pathname.endsWith("/depth")?{...data,E:current-100}:data});
  const result=await h.loader({selectedStrategies:["anomaly"]});
  assert.equal(result.markets.length,12,JSON.stringify(result.sourceStatus));
  assert.equal(current,now+45_000);
  assert.equal(result.markets.find(row=>row.symbol==="COIN11USDT").quoteAt,current-100);
  assert.ok(result.markets.every(row=>row.observedAt===now-1000),"new book receipt must not replace actual 24h ticker closeTime");
  assert.ok(result.observations.filter(row=>row.source==="anomaly").every(row=>row.observedAt===now-1000));
  assert.equal(h.calls.filter(row=>row.url.includes("/ticker/24hr")).length,1);
  assert.equal(h.calls.filter(row=>row.url.includes("/ticker/bookTicker?")).length,12);
});

test("invalid candle data, unknown exchange filters and stale quotes reject a symbol",async()=>{
  for(const mutate of [
    (url,data)=>url.pathname.endsWith("exchangeInfo")?{symbols:[{...metadata("BTC"),filters:[]}]}:data,
    (url,data)=>url.pathname.endsWith("ticker/bookTicker")?{...data,time:now-31000}:data,
    (url,data)=>url.pathname.endsWith("/klines")?data.slice(0,10):data,
  ]){const result=await harness({mutate}).loader({enabled:true});assert.equal(result.markets.length,0);}
});

test("standalone anomaly reads actual two dimension scores and uses strict AND thresholds without unrelated completeness gates",async()=>{
  for(const [patch,expected] of [
    [{score:81,dimensions:[90,90,null,null,null,null,null],dimensionAvailability:[true,true,false,false,false,false,false]},1],
    [{score:80},0],
    [{dimensions:[89,100,70,70,70,70,70]},0],
    [{dimensions:[100,89,70,70,70,70,70]},0],
    [{dimensions:[100,null,70,70,70,70,70]},0],
    [{dimensions:[100,100,70,70,70,70,70],dimensionAvailability:[true,false,true,true,true,true,true]},0],
    [{bias:"neutral"},0],
    [{score:101},0],
  ]) {
    const h=harness({scanLoader:async()=>({scannedAt:new Date(now-1000).toISOString(),items:[source("BTC",patch)]})});
    const result=await h.loader({selectedStrategies:["anomaly"]});
    assert.equal(result.markets.length,expected,JSON.stringify(patch));
  }
});

test("pool priorities reproduce scanner top ten and momentum top five rather than all returned rows",async()=>{
  const symbols=Array.from({length:12},(_,i)=>`COIN${String(i).padStart(2,"0")}`);
  const h=harness({symbols,signalLoader:async()=>({latest:[signal("COIN00"),signal("COIN05"),signal("COIN10")]}),
    mutate:(url,data)=>url.hostname==="cryptobubbles.net"?data.map((row,i)=>({...row,performance:{day:12-i}})):data});
  const result=await h.loader({selectedStrategies:["p1_three_source","p2_two_source"]});
  const pools=new Map(result.observations.filter(row=>row.source==="risk_pool").map(row=>[row.symbol,row]));
  assert.equal(pools.get("COIN00USDT").riskPoolPriority,"P1");
  assert.equal(pools.get("COIN01USDT").riskPoolPriority,"P2");
  assert.equal(pools.get("COIN05USDT").riskPoolPriority,"P2","rank six momentum is not a pool source");
  assert.equal(pools.has("COIN06USDT"),false);
  assert.equal(pools.has("COIN10USDT"),false,"scanner rank eleven is not a pool source");
  assert.deepEqual(result.markets.map(row=>row.symbol),symbols.slice(0,6).map(symbol=>`${symbol}USDT`));
});

test("pool direction follows frontend majority while selected opposing strategy evidence remains visible to matcher",async()=>{
  const h=harness({signalLoader:async()=>({latest:[signal("BTC",{direction:"short",price_change_pct:-2})]})});
  const poolOnly=await h.loader({selectedStrategies:["p1_three_source"]});
  assert.equal(poolOnly.observations.find(row=>row.source==="risk_pool").side,"LONG");
  assert.equal(poolOnly.observations.find(row=>row.source==="signal").side,"SHORT");
  assert.equal(poolOnly.markets.length,1);
  assert.equal((await h.loader({selectedStrategies:["p1_three_source","strong_signal"]})).markets.length,0);
  const tied=await harness({scanLoader:async()=>({scannedAt:new Date(now-1000).toISOString(),items:[]}),
    signalLoader:async()=>({latest:[signal("BTC",{direction:"short"})]})}).loader({selectedStrategies:["p2_two_source"]});
  assert.equal(tied.observations.find(row=>row.source==="risk_pool").side,"NEUTRAL");
  assert.equal(tied.markets.length,0);
});

test("momentum plus signal produces a real P2 without inventing an Alpha score",async()=>{
  const result=await harness({scanLoader:async()=>({scannedAt:new Date(now-1000).toISOString(),items:[]})}).loader({selectedStrategies:["p2_two_source"]});
  const pool=result.observations.find(row=>row.source==="risk_pool");
  assert.equal(pool.riskPoolPriority,"P2");assert.equal(pool.score,null);assert.equal(result.markets.length,1);
});

test("current P1 and P2 pool snapshots retain older member events without relabeling them as fresh signals",async()=>{
  const eventAt=now-73*60_000,snapshotAt=now-2000;
  for(const strategy of ["p1_three_source","p2_two_source"]) {
    const h=harness({scanLoader:async()=>({scannedAt:new Date(now-1000).toISOString(),items:strategy==="p1_three_source"?[source("BTC")]:[]}),
      signalLoader:async()=>({refreshed_at:new Date(snapshotAt).toISOString(),latest:[signal("BTC",{signal_time:new Date(eventAt).toISOString()})]})});
    const result=await h.loader({enabled:true,selectedStrategies:[strategy]});
    assert.equal(result.markets.length,1,JSON.stringify(result.sourceStatus));
    const pool=result.observations.find(row=>row.source==="risk_pool"),event=result.observations.find(row=>row.source==="signal");
    assert.equal(pool.riskPoolPriority,strategy==="p1_three_source"?"P1":"P2");
    assert.equal(pool.observedAt,snapshotAt);assert.equal(pool.dataComplete,true);
    assert.equal(event.observedAt,eventAt,"source publication time must remain the real old event time");
    assert.deepEqual(pool.poolMembers.find(row=>row.source==="signal"),{source:"signal",evidenceId:event.evidenceId,snapshotAt,eventAt});
    assert.equal(result.sourceStatus.find(row=>row.source==="signal").observedAt,snapshotAt);
    assert.equal((await h.loader({selectedStrategies:["strong_signal"]})).markets.length,0,"current pool membership must not reset the ten-minute strong-signal clock");
  }
  const twoOld=await harness({signalLoader:async()=>({latest:[signal("BTC",{signal_time:new Date(eventAt).toISOString()}),
    signal("BTC",{dedupe_hash:"second-old-message",signal_time:new Date(eventAt-60_000).toISOString()})]})}).loader({selectedStrategies:["same_coin_x2"]});
  assert.equal(twoOld.markets.length,0,"two current feed members do not make old x2 events newly timely");
});

test("pool snapshot freshness rejects expired, unknown, future and cached source responses independently of event time",async()=>{
  for(const patch of [
    {refreshed_at:new Date(now-601_000).toISOString()},
    {refreshed_at:null},
    {refreshed_at:new Date(now+1000).toISOString()},
    {stale:true,refreshed_at:new Date(now).toISOString()},
    {stale:false,fallback:"persistent_cache",refreshed_at:new Date(now).toISOString()},
  ]) {
    const result=await harness({signalLoader:async()=>({...patch,latest:[signal("BTC")]})}).loader({selectedStrategies:["p1_three_source","strong_signal"]});
    assert.equal(result.markets.length,0,JSON.stringify(patch));
    assert.equal(result.observations.find(row=>row.source==="risk_pool").dataComplete,false);
    assert.equal(result.sourceStatus.find(row=>row.source==="signal").ok,false);
    assert.equal(result.observations.find(row=>row.source==="signal").observedAt,now-1000);
  }
});

test("real public HTML collector records snapshot response age separately from original message publication time",async()=>{
  const eventAt=now-73*60_000;
  const publicPreviewHtml=`<div class="tgme_widget_message_wrap js-widget_message_wrap"><div data-post="BWE_OI_Price_monitor/12345">
    <div class="tgme_widget_message_text js-message_text">[BTCUSDT] Binance openinterest +6.0%, Price +4.0%</div>
    <time datetime="${new Date(eventAt).toISOString()}">08:47</time></div></div>`;
  const result=await harness({publicPreviewHtml,previewHeaders:{age:"5"}}).loader({selectedStrategies:["p1_three_source"]});
  assert.equal(result.markets.length,1,JSON.stringify(result.sourceStatus));
  const event=result.observations.find(row=>row.source==="signal"),pool=result.observations.find(row=>row.source==="risk_pool");
  assert.equal(event.observedAt,eventAt);assert.equal(event.sameCoinCount,1);
  assert.equal(pool.observedAt,now-5000);
  assert.equal(pool.poolMembers.find(row=>row.source==="signal").eventAt,eventAt);
  const cached=await harness({publicPreviewHtml,previewHeaders:{age:"601"}}).loader({selectedStrategies:["p1_three_source"]});
  assert.equal(cached.markets.length,0);assert.equal(cached.sourceStatus.find(row=>row.source==="signal").ok,false);
});

test("unknown publication time qualifies only current pool membership with a unique verified message identity",async()=>{
  const unknown=signal("BTC",{signal_time:null,signal_time_source:"unknown",telegram_message_id:"12345",channel_username:"BWE_OI_Price_monitor"});
  for(const strategy of ["p1_three_source","p2_two_source"]) {
    const h=harness({scanLoader:async()=>({scannedAt:new Date(now-1000).toISOString(),items:strategy==="p1_three_source"?[source("BTC")]:[]}),
      signalLoader:async()=>({latest:[unknown]})});
    const result=await h.loader({selectedStrategies:[strategy]});
    assert.equal(result.markets.length,1);
    const event=result.observations.find(row=>row.source==="signal"),pool=result.observations.find(row=>row.source==="risk_pool");
    assert.equal(event.observedAt,null);assert.equal(event.snapshotAt,now);assert.equal(event.dataComplete,false);
    assert.equal(event.sourceStatus,"unknown");assert.equal(event.sourceReason,"SIGNAL_EVENT_TIME_UNKNOWN");
    assert.equal(pool.sourceStatus,"live");assert.equal(pool.dataComplete,true);assert.equal(pool.poolMembers.find(row=>row.source==="signal").eventAt,null);
    assert.equal((await h.loader({selectedStrategies:["strong_signal","same_coin_x2"]})).markets.length,0);
  }
  for(const latest of [
    [{...unknown,telegram_message_id:null}],
    [{...unknown,telegram_message_id:"bad"}],
    [{...unknown,channel_username:null}],
    [{...unknown,direction:"unknown"}],
    [unknown,{...unknown,dedupe_hash:"another-hash-same-message"}],
    [{...unknown,signal_time:new Date(now+60_000).toISOString(),signal_time_source:"source_timestamp"}],
    [{...unknown,signal_time:new Date(now+60_000).toISOString(),signal_time_source:"unknown"}],
  ]) {
    const result=await harness({signalLoader:async()=>({latest})}).loader({selectedStrategies:["p1_three_source"]});
    assert.equal(result.markets.length,0,JSON.stringify(latest));
    assert.equal(result.observations.find(row=>row.source==="risk_pool").dataComplete,false);
    assert.ok(result.observations.some(row=>row.source==="signal"),"unknown or invalid events remain available for per-symbol diagnostics");
  }
});

test("real Markdown collector's unknown event time can prove only verified current pool membership",async()=>{
  const publicPreviewHtml="[](https://t.me/BWE_OI_Price_monitor/12345)\n[BTCUSDT] Binance openinterest +6.0%, Price +4.0%\n";
  const h=harness({publicPreviewHtml});
  const result=await h.loader({selectedStrategies:["p1_three_source"]});
  assert.equal(result.markets.length,1,JSON.stringify(result.sourceStatus));
  assert.ok(h.calls.some(call=>new URL(call.url).hostname==="r.jina.ai"),"exercise the real Markdown fallback parser");
  const event=result.observations.find(row=>row.source==="signal");
  assert.equal(event.observedAt,null);assert.equal(event.sourceReason,"SIGNAL_EVENT_TIME_UNKNOWN");
  assert.equal(result.observations.find(row=>row.source==="risk_pool").dataComplete,true);
  const signalsOnly=await h.loader({selectedStrategies:["strong_signal","same_coin_x2"]});
  assert.equal(signalsOnly.markets.length,0);assert.equal(signalsOnly.observations.find(row=>row.source==="signal").observedAt,null);
});

test("same-coin labels count distinct latest twenty across directions and ages before fresh-event selection",async()=>{
  const fresh=signal("BTC"),old=signal("BTC",{dedupe_hash:"old",direction:"short",signal_time:new Date(now-601000).toISOString()});
  const two=await harness({signalLoader:async()=>({latest:[fresh,old]})}).loader({selectedStrategies:["same_coin_x2"]});
  assert.ok(two.observations.filter(row=>row.source==="signal").every(row=>row.sameCoinCount===2));
  assert.equal(two.markets.length,1,"only the fresh LONG event qualifies; old SHORT is not refreshed");
  const three=await harness({signalLoader:async()=>({latest:[fresh,old,{...old,dedupe_hash:"older"}]})}).loader({selectedStrategies:["same_coin_x2","strong_signal"]});
  assert.ok(three.observations.filter(row=>row.source==="signal").every(row=>row.sameCoinCount===3));
  assert.equal(three.markets.length,0,"x3 must not become x2 after freshness filtering");
  const duplicate=await harness({signalLoader:async()=>({latest:[fresh,{...fresh}]})}).loader({selectedStrategies:["same_coin_x2"]});
  assert.equal(duplicate.observations.filter(row=>row.source==="signal").length,1);
  assert.equal(duplicate.observations.find(row=>row.source==="signal").sameCoinCount,1);assert.equal(duplicate.markets.length,0);
  const latest20=[fresh,...Array.from({length:19},(_,i)=>signal(`ALT${i}`,{signal_time:new Date(now-2000-i).toISOString()})),old];
  const clipped=await harness({signalLoader:async()=>({latest:latest20})}).loader({selectedStrategies:["strong_signal"]});
  assert.equal(clipped.observations.find(row=>row.source==="signal"&&row.symbol==="BTCUSDT").sameCoinCount,1);
  assert.equal(clipped.observations.filter(row=>row.source==="signal").length,20);
});

test("unknown message identity, stale payload and future contributor cannot create fresh strong or pool evidence",async()=>{
  const unknown=await harness({signalLoader:async()=>({latest:[signal(),signal("BTC",{dedupe_hash:null})]})}).loader({selectedStrategies:["strong_signal"]});
  assert.equal(unknown.observations.find(row=>row.source==="signal").sameCoinCount,null);assert.equal(unknown.markets.length,0);
  for(const payload of [{stale:true,latest:[signal()]},{latest:[signal("BTC",{signal_time:new Date(now+60_000).toISOString()})]}]) {
    const result=await harness({signalLoader:async()=>payload}).loader({selectedStrategies:["p1_three_source","strong_signal"]});
    assert.equal(result.markets.length,0);assert.equal(result.observations.find(row=>row.source==="risk_pool").dataComplete,false);
  }
});

test("selected signal is not silently filtered by OI, confidence, prior return or volume-multiple rules",async()=>{
  const h=harness({signalLoader:async()=>({latest:[signal("BTC",{oi_change_pct:null,price_change_pct:null,confidence:0.3,parse_status:"partial"})]}),
    fail:url=>/premiumIndex|openInterestHist/.test(url.pathname),
    mutate:(url,data)=>url.pathname.endsWith("ticker/24hr")?data.map(row=>({...row,priceChangePercent:"90"})):url.pathname.endsWith("/klines")?data.map(row=>row.map((value,i)=>i===5?"0":value)):data});
  const result=await h.loader({selectedStrategies:["strong_signal"]});
  assert.equal(result.markets.length,1);assert.equal(result.markets[0].volumeMultiple,null);
  assert.equal(result.observations.find(row=>row.source==="signal").score,null);
  assert.equal(h.calls.some(row=>/premiumIndex|openInterestHist/.test(row.url)),false);
});

test("quote refresh fetches fresh exact-symbol book and full target depth without refreshing evidence",async()=>{
  const h=harness();const loaded=await h.loader({enabled:true});const before=h.calls.length;
  const quote=await h.loader.refreshQuote({enabled:true},"BTC");
  assert.equal(quote.symbol,"BTCUSDT");assert.equal(quote.quoteAt,now-1000);assert.equal(quote.liquidityNotional,50);
  assert.equal(quote.takerFeePct,0.06);assert.equal(quote.estimatedSlippagePct,0);
  assert.equal(h.calls.length-before,2,"cached metadata + two read-only price/depth requests");
  assert.ok(h.calls.slice(before).every(row=>row.url.includes("symbol=BTCUSDT")));
  assert.equal(loaded.observations[0].observedAt,now-1000,"quote refresh never updates source timestamps");
  for(const mutate of [
    (url,data)=>url.pathname.endsWith("ticker/bookTicker")?{...data,time:now-31000}:data,
    (url,data)=>url.pathname.endsWith("ticker/bookTicker")?{...data,symbol:"ETHUSDT"}:data,
    (url,data)=>url.pathname.endsWith("/depth")?{...data,asks:[["105.81","0.001"]]}:data,
  ])await assert.rejects(harness({mutate}).loader.refreshQuote({},"BTC"));
});

test("fresh but divergent bookTicker and depth cannot authorize a low-slippage order",async()=>{
  for(const depthBid of [102,98]) {
    const h=harness({mutate:(url,data)=>url.pathname.endsWith("ticker/bookTicker")?{...data,bidPrice:"100",askPrice:"100.01"}
      :url.pathname.endsWith("/depth")?{...data,bids:[[String(depthBid),"10"]],asks:[[String(depthBid+0.01),"10"]]}:data});
    const result=await h.loader({enabled:true});
    assert.equal(result.markets.length,0);
    assert.match(result.sourceStatus.find(row=>row.source==="market").message,/bookTicker\/depth price deviation/);
    await assert.rejects(h.loader.refreshQuote({},"BTC"),/bookTicker\/depth price deviation/);
  }
});

test("small quote differences use depth entry prices and contribute to the actual cost reserve",async()=>{
  const h=harness({mutate:(url,data)=>url.pathname.endsWith("ticker/bookTicker")?{...data,bidPrice:"100",askPrice:"100.01",time:now-2000}
    :url.pathname.endsWith("/depth")?{...data,bids:[["100.05","10"]],asks:[["100.06","10"]]}:data});
  const result=await h.loader({enabled:true});assert.equal(result.markets.length,1);
  const market=result.markets[0];assert.equal(market.bid,100.05);assert.equal(market.ask,100.06);
  assert.ok(Math.abs(market.estimatedSlippagePct-0.05)<1e-9,"flat depth still reserves cross-snapshot price movement");
  assert.equal(market.quoteAt,now-2000,"newer depth does not erase older book timestamp");
  const refreshed=await h.loader.refreshQuote({},"BTC");
  assert.equal(refreshed.bid,market.bid);assert.equal(refreshed.ask,market.ask);
  assert.equal(refreshed.estimatedSlippagePct,market.estimatedSlippagePct);assert.equal(refreshed.quoteAt,now-2000);
  const inputs={settings:{enabled:true},now,market:"futures",...result,
    account:{observedAt:now,equity:1000,dayStartEquity:1000,dailyPnl:0,availableMargin:1000,openPositions:[],pendingEntries:[],reconciliationHealthy:true,killSwitch:false,unresolvedOrders:false},recentEntries:[],lastOrderAt:null};
  const withMovement=selectAlphaAutomationCandidates(inputs).candidates[0];
  assert.ok(withMovement);
  assert.equal(withMovement.entryPrice,100.06);
  const costRate=c=>(c.estimatedLossWithCosts-c.quantity*Math.abs(c.entryPrice-c.stopLoss))/c.notional;
  const actualSpreadPct=(market.ask-market.bid)/((market.ask+market.bid)/2)*100;
  const measuredRoundTripCostRate=(2*(market.takerFeePct+market.estimatedSlippagePct)+actualSpreadPct)/100;
  assert.ok(costRate(withMovement)+1e-10>=measuredRoundTripCostRate,
    "monetary reserve must cover both fees, measured cross-snapshot/depth slippage and spread, even when a larger configured buffer already covers them");
});

test("individually small snapshot movement and depth slippage cannot hide an excessive combined fill cost",async()=>{
  const h=harness({mutate:(url,data)=>url.pathname.endsWith("ticker/bookTicker")?{...data,bidPrice:"100",askPrice:"100.01"}
    :url.pathname.endsWith("/depth")?{...data,bids:[["100.19","10"]],asks:[["100.21","0.001"],["100.42","10"]]}:data});
  assert.ok(alphaDepthSlippage({bids:[["100.19","10"]],asks:[["100.21","0.001"],["100.42","10"]]},50)<0.3);
  assert.equal((await h.loader({enabled:true})).markets.length,0);
  await assert.rejects(h.loader.refreshQuote({},"BTC"),/combined snapshot movement/);
});

test("malformed bulk records, limits and signal payload fail closed with source status",async()=>{
  for(const mutate of [
    (url,data)=>url.pathname.endsWith("ticker/bookTicker")?[null]:data,
    (url,data)=>url.pathname.endsWith("exchangeInfo")?{symbols:[null]}:data,
    (url,data)=>url.pathname.endsWith("exchangeInfo")?{symbols:[{...metadata("BTC"),filters:[...metadata("BTC").filters.slice(0,-1),{filterType:"NOTIONAL",minNotional:"5",maxNotional:"bad"}]}]}:data,
  ]){const result=await harness({mutate}).loader({enabled:true});assert.equal(result.markets.length,0);assert.equal(result.sourceStatus.find(row=>row.source==="market").ok,false);}
  const malformed=await harness({signalLoader:async()=>({nonsense:true})}).loader({enabled:true});
  assert.equal(malformed.sourceStatus.find(row=>row.source==="signal").ok,false);
});
