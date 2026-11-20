const test=require("node:test");
const assert=require("node:assert/strict");
const worker=require("../workers/telegram_signal_collector");
const fixture=require("./fixtures/eqn-oi-public-preview.json");
const html=fixture.messages.map(({rawText,options})=>`<div class="tgme_widget_message_wrap"><div data-post="EQN_OI_Price_monitor/${options.messageId}"><div class="tgme_widget_message_text">${rawText.replaceAll("\n","<br/>")}</div><time datetime="${options.signalTime}"></time></div></div>`).join("");

async function invoke({query={public:"1"},store=new worker.MemorySignalStore(),fetchImpl=async()=>({ok:true,text:async()=>html})}={}) {
  const originalFactory=worker.createStoreFromEnv, originalFetch=global.fetch;
  worker.createStoreFromEnv=()=>store;
  const apiPath=require.resolve("../api/telegram-signal-collector");
  delete require.cache[apiPath];
  const handler=require(apiPath);
  worker.createStoreFromEnv=originalFactory;
  global.fetch=fetchImpl;
  const response={statusCode:0,headers:{},setHeader(name,value){this.headers[name]=value;},end(value){this.payload=JSON.parse(value);}};
  try{await handler({method:"GET",headers:{},query},response);return response;}
  finally{global.fetch=originalFetch;delete require.cache[apiPath];}
}

test("the first public GET collects EQN immediately and excludes the previous channel from persistent cache",async()=>{
  const old=worker.parseTelegramSignal("[BTCUSDT] OI +6%, Price +4%",{channelUsername:"BWE_OI_Price_monitor",messageId:99999,signalTime:"2026-11-18T11:00:00Z",sourceMode:"public_preview"});
  const result=await invoke({store:new worker.MemorySignalStore([old])});
  assert.equal(result.statusCode,200);assert.equal(result.payload.target_channel,"eqn_oi_price_monitor");
  assert.equal(result.payload.stale,false);assert.equal(result.payload.parsed,fixture.messages.length);
  assert.equal(result.payload.latest[0].telegram_message_id,"20662");
  assert.equal(result.payload.latest[0].signal_time,"2026-11-18T10:34:25.000Z");
  assert.ok(result.payload.latest.every(row=>row.channel_username==="eqn_oi_price_monitor"&&row.symbol&&row.source_message_url.startsWith("https://t.me/EQN_OI_Price_monitor/")));
});

test("both cached and source-failure branches expose only correctly attributed EQN records",async()=>{
  const [captured]=fixture.messages, current=worker.parseTelegramSignal(captured.rawText,captured.options);
  const old={...current,channel_username:"bwe_oi_price_monitor",source_message_url:"https://t.me/BWE_OI_Price_monitor/20644",dedupe_hash:"old",telegram_message_id:"99999"};
  const cached=await invoke({store:new worker.MemorySignalStore([old,current]),fetchImpl:async()=>{throw new Error("must not fetch with a matching cache");}});
  assert.equal(cached.payload.fallback,"persistent_cache");assert.equal(cached.payload.latest.length,1);
  assert.equal(cached.payload.latest[0].channel_username,"eqn_oi_price_monitor");
  const fallback=await invoke({query:{public:"1",refresh:"1"},store:new worker.MemorySignalStore([old]),fetchImpl:async()=>{throw new Error("public source temporarily unavailable");}});
  assert.equal(fallback.payload.stale,true);assert.equal(fallback.payload.fallback,"build_snapshot");
  assert.ok(fallback.payload.latest.length>0);
  assert.ok(fallback.payload.latest.every(row=>row.channel_username==="eqn_oi_price_monitor"&&row.source_message_url.startsWith("https://t.me/EQN_OI_Price_monitor/")));
});
