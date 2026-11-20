import "server-only";
import { randomUUID } from "node:crypto";
import { getCache } from "@vercel/functions";
import { prisma } from "@/lib/prisma";
import { captureStmSources, stmNumber, type StmSourceCapture } from "./sources";
import { evaluateStmStrategies, STM_STRATEGIES } from "./engine";
import { getRecord, listRecords, putRecord, retainSnapshots, stmJson, stmPersistenceConfigured } from "./store";
import { readStmHistory } from "./history";
import type { StmAlert, StmCandidate, StmChainEvent, StmDashboard, StmJournal, StmMutation, StmPaperPosition, StmReplay, StmState, StmStrategy, StmSignal } from "./types";
import type { StmWalletProfile } from "./onchain";
import type { StmScanStatus } from "./scanner";

type Capture = StmSourceCapture & { chainEvents: StmChainEvent[] };
let flight: Promise<Capture> | null = null;
let memoryCapture: Capture | null = null;
const MIN_REFRESH_MS = 5 * 60000;
const publicCaptureCache = getCache({ namespace: "welinkbtc-main:stm-public-capture:v1" });
const freshCapture = (capture: Capture | null) => capture && Number.isFinite(Date.parse(capture.asOf))
  && Date.parse(capture.asOf) <= Date.now() && Date.now() - Date.parse(capture.asOf) < MIN_REFRESH_MS;
async function cacheCapture(capture: Capture) {
  memoryCapture = capture;
  const ttl = Math.floor((Date.parse(capture.asOf) + MIN_REFRESH_MS - Date.now()) / 1000);
  if (ttl > 0) await publicCaptureCache.set("latest", capture, { ttl }).catch(() => undefined);
}
async function safeRead<T>(job: () => Promise<T>, fallback: T): Promise<T> { try { return await job(); } catch { return fallback; } }
async function withLatestChain(capture:Capture):Promise<Capture> {
  const latest=await safeRead(()=>listRecords<StmChainEvent>("system","chain-event",1000),[]);
  const byId=new Map(capture.chainEvents.map(event=>[event.id,event]));
  for(const row of latest)if(row.payload.verified && Date.parse(row.payload.occurredAt)<=Date.now() && Date.now()-Date.parse(row.payload.occurredAt)<=6*3600000)byId.set(row.key,row.payload);
  const chainEvents=[...byId.values()],candidates=[...capture.candidates];
  for(const event of chainEvents)if(!candidates.some(row=>row.id===event.asset))candidates.push({id:event.asset,symbol:event.symbol,name:event.symbol,address:event.address,chain:event.chain,market:"onchain",sources:["verified-chain"],price:null,
    change24h:null,volumeUsd:null,liquidityUsd:event.liquidityUsd,score:0,bias:"observe",reason:"已核验 Swap；实时退出报价须再次确认",updatedAt:event.occurredAt,risk:event.riskPassed?"pass":"unknown",holders:1});
  const recent=chainEvents.filter(event=>Date.now()-Date.parse(event.occurredAt)<=10*60000);
  const scanner=await safeRead(()=>getRecord<StmScanStatus>("system","scanner-status","bsc"),null);
  const scannerSources:StmDashboard["sources"]=scanner?[{id:"bsc-scanner",name:"BSC 审核钱包扫描",url:"/api/stm-hunt/cron",semantics:"events",status:Date.now()-Date.parse(scanner.asOf)>15*60000?"stale":scanner.status==="ok"?"ok":scanner.status==="partial"?"stale":"unavailable",count:scanner.verified,updatedAt:scanner.asOf,fetchedAt:new Date().toISOString(),latencyMs:0,message:scanner.message}]:[];
  return {...capture,candidates,chainEvents,sources:[...capture.sources.filter(source=>!["verified-chain","bsc-scanner"].includes(source.id)),...scannerSources,{id:"verified-chain",name:"核验链上 Swap",url:"/api/stm-hunt/ingest",semantics:"events",status:recent.length?"ok":"unavailable",count:recent.length,fetchedAt:new Date().toISOString(),updatedAt:recent.map(row=>row.occurredAt).sort().at(-1)??null,latencyMs:0,message:recent.length?"签名接入、链上收据和真实池事件核验；十分钟有效":"等待签名数据提供商或已审核钱包的真实 Swap 事件"}]};
}
export async function refreshStmCapture(): Promise<Capture> {
  if (freshCapture(memoryCapture)) return memoryCapture!;
  if (flight) return flight;
  flight = (async () => {
    // Only public source evidence is shared. Personal state and trading checks never enter this cache.
    const cached = await publicCaptureCache.get("latest").catch(() => null) as Capture | null;
    if (freshCapture(cached)) { memoryCapture = cached; return cached!; }
    const prior = await safeRead(() => getRecord<Capture>("system", "capture", "latest"), memoryCapture);
    if (freshCapture(prior)) { await cacheCapture(prior!); return prior!; }
    const lease=randomUUID();
    let locked=false;
    if(stmPersistenceConfigured()) {
      const created=await prisma.stmHuntRecord.createMany({data:[{userId:"system",kind:"capture-lease",key:"global",payload:{owner:lease}}],skipDuplicates:true});
      if(created.count)locked=true;
      else {
        const acquired=await prisma.stmHuntRecord.updateMany({where:{userId:"system",kind:"capture-lease",key:"global",updatedAt:{lt:new Date(Date.now()-120000)}},data:{payload:{owner:lease}}});
        locked=acquired.count>0;
      }
      if(!locked) {
        if(prior)return prior;
        throw new Error("首次数据采集中，请稍后刷新");
      }
    }
    try {
    const capture = await captureStmSources();
    const vetted=await safeRead(()=>listRecords<StmWalletProfile>("system","vetted-wallet",1000),[]);
    for(const trader of capture.traders) {
      const profile=vetted.map(row=>row.payload).find(row=>row.qualified && row.reviewedAt && row.clusterId && trader.address
        && (row.chain==="solana" ? row.address===trader.address : row.address.toLowerCase()===trader.address.toLowerCase())
        && (trader.holdings.some(holding=>holding.chain===row.chain) || (row.chain==="solana" && ["pump","okx"].includes(trader.venue))));
      if(profile) {trader.qualified=true;trader.clusterId=profile.clusterId;trader.tags.push("已审核钱包");}
    }
    const chainRecords = await safeRead(() => listRecords<StmChainEvent>("system", "chain-event", 1000), []);
    const chainEvents = chainRecords.map(row => row.payload).filter(row => row.verified && Date.now()-Date.parse(row.occurredAt) <= 6*3600000 && Date.parse(row.occurredAt)<=Date.now());
    for (const event of chainEvents) if (!capture.candidates.some(row => row.id === event.asset)) {
      capture.candidates.push({ id:event.asset,symbol:event.symbol,name:event.symbol,address:event.address,chain:event.chain,market:"onchain",sources:["verified-chain"],price:null,
        change24h:null,volumeUsd:null,liquidityUsd:event.liquidityUsd,score:0,bias:"observe",reason:"已核验 Swap 事件；报价仍须实时确认",updatedAt:event.occurredAt,risk:event.riskPassed?"pass":"unknown",holders:1 });
    }
    const result: Capture = { ...capture, chainEvents };
    if (stmPersistenceConfigured()) {
      // Never mutate an earlier capture: replay must see exactly what was known then.
      const assets=new Set(result.candidates.map(row=>row.id));
      const compact={...result,sources:[],traders:result.traders.map(trader=>({...trader,holdings:trader.holdings.filter(holding=>assets.has(holding.asset))})).filter(trader=>trader.holdings.length>0 || trader.visibility==="private"),
        chainEvents:result.chainEvents.filter(event=>Date.parse(result.asOf)-Date.parse(event.occurredAt)<=10*60000)};
      await prisma.stmHuntRecord.createMany({ data: [{ userId:"system",kind:"snapshot",key:String(Math.floor(Date.parse(result.asOf)/MIN_REFRESH_MS)),payload:stmJson(compact) }], skipDuplicates:true });
      await putRecord("system", "capture", "latest", result);
      await retainSnapshots();
    }
    await cacheCapture(result);
    return result;
    } finally {
      if(locked) await prisma.stmHuntRecord.updateMany({where:{userId:"system",kind:"capture-lease",key:"global",payload:{equals:{owner:lease}}},data:{updatedAt:new Date(0)}}).catch(()=>undefined);
    }
  })();
  try { return await flight; } finally { flight = null; }
}

async function strategiesFor(userId?: string): Promise<StmStrategy[]> {
  if (!userId) return STM_STRATEGIES;
  const rows = await listRecords<StmStrategy>(userId,"strategy-active",5);
  return STM_STRATEGIES.map(base => rows.find(row=>row.key===base.id)?.payload ?? base);
}
function emptyState(): StmState { return {authenticated:false,persistent:false,watchlist:[],paper:[],alerts:[],journal:[],replays:[]}; }
async function stateFor(userId: string): Promise<StmState> {
  const [watch,paper,alerts,journal,replays] = await Promise.all([
    listRecords(userId,"watch",300),listRecords<StmPaperPosition>(userId,"paper",100),listRecords<StmAlert>(userId,"alert",100),
    listRecords<StmJournal>(userId,"journal",100),listRecords<StmReplay>(userId,"replay",20),
  ]);
  return {authenticated:true,persistent:true,watchlist:watch.map(row=>row.key),paper:paper.map(row=>row.payload),alerts:alerts.map(row=>row.payload),journal:journal.map(row=>row.payload),replays:replays.map(row=>row.payload)};
}
async function saveStmAlerts(userId:string,signals:StmSignal[],watchlist:string[]) {
  const watched=new Set(watchlist),ready=signals.filter(signal=>["ready","risk"].includes(signal.status)&&watched.has(signal.candidateId));
  if(!ready.length)return 0;
  const result=await prisma.stmHuntRecord.createMany({data:ready.map(signal=>{
    const key=`${signal.strategy}:${signal.candidateId}:${signal.strategyVersion}:${Math.floor(Date.parse(signal.asOf)/3600000)}`;
    const alert:StmAlert={id:key,symbol:signal.symbol,strategy:signal.strategy,message:[...signal.reasons,...signal.missing].join("；"),createdAt:signal.asOf,read:false};
    return {userId,kind:"alert",key,payload:stmJson(alert)};
  }),skipDuplicates:true});return result.count;
}
export async function getStmDashboard(userId?: string): Promise<StmDashboard> {
  const capture = await withLatestChain(await refreshStmCapture());
  let state = emptyState(), strategies = STM_STRATEGIES, persistent = stmPersistenceConfigured();
  if (userId) {
    try { [state,strategies]=await Promise.all([stateFor(userId),strategiesFor(userId)]); }
    catch { state={...emptyState(),authenticated:true}; persistent=false; }
  }
  const now = new Date().toISOString();
  const history = await safeRead(() => readStmHistory(strategies, Date.parse(now)), { snapshots: [], count: 0 });
  const snapshots = history.snapshots;
  if (!snapshots.some(row=>row.asOf===capture.asOf)) snapshots.push(capture);
  if (!userId && !history.count) persistent=false;
  const signals = evaluateStmStrategies({...capture,asOf:now,snapshots,strategies});
  if (userId && state.persistent) {
    const added=await saveStmAlerts(userId,signals,state.watchlist);
    if (added) state.alerts=(await listRecords<StmAlert>(userId,"alert",100)).map(row=>row.payload);
  }
  const sources = capture.sources.map(source=>{
    if (Date.now()-Date.parse(capture.asOf)>15*60000 && source.status==="ok") return {...source,status:"stale" as const,message:"本地采集已过期；仅保留历史观察"};
    return source;
  });
  return {asOf:capture.asOf,sources,traders:capture.traders,candidates:capture.candidates,signals,strategies,
    metrics:{traders:capture.traders.length,candidates:capture.candidates.length,ready:signals.filter(row=>row.actionable).length,watched:state.watchlist.length,snapshots:history.count,paperPnlUsd:state.paper.reduce((sum,row)=>sum+(row.pnlUsd??0),0)},state,
    capabilities:{persistence:persistent,exactTraderEvents:capture.events.some(row=>row.exact),onchainEvents:capture.chainEvents.some(row=>row.verified && Date.now()-Date.parse(row.occurredAt)<=10*60000),liveExecution:true,
      notes:["榜单、仓位差分与社交热度不等于真实成交。","S1/S3 只在已授权精确事件和链上核验齐备时放行。","实盘需独立确认、账户风控、报价有效期与成交对账。",...(!persistent?["存储不可用：私人状态及交易写入已关闭。"]:[])]}};
}
export async function sweepStmAlerts() {
  const capture=await withLatestChain(await refreshStmCapture());
  // Internal inbox only. No external notifications or order execution from cron.
  const subscriptions=await prisma.stmHuntRecord.findMany({where:{kind:"watch"},select:{userId:true,key:true},take:10000,orderBy:{id:"asc"}});
  const grouped=new Map<string,string[]>();
  for(const row of subscriptions)grouped.set(row.userId,[...(grouped.get(row.userId)??[]),row.key]);
  let alerts=0;
  const evaluationNow = Date.now(), evaluationAsOf = new Date(evaluationNow).toISOString();
  const histories = new Map<string, Awaited<ReturnType<typeof readStmHistory>>>();
  for(const [userId,watchlist] of grouped) {
    const strategies=await strategiesFor(userId);
    const windows=JSON.stringify(strategies.filter(row=>row.enabled && ["S2","S4"].includes(row.id)).map(row=>row.windowMinutes).sort((a,b)=>a-b));
    let history=histories.get(windows);
    if(!history) { history=await readStmHistory(strategies, evaluationNow); histories.set(windows,history); }
    const snapshots=[...history.snapshots];
    if(!snapshots.some(row=>row.asOf===capture.asOf)) snapshots.push(capture);
    const signals=evaluateStmStrategies({...capture,asOf:evaluationAsOf,snapshots,strategies});
    alerts+=await saveStmAlerts(userId,signals,watchlist);
  }
  await putRecord("system","cron","latest",{asOf:new Date().toISOString(),captureAt:capture.asOf,users:grouped.size,alerts});
  return {asOf:capture.asOf,sources:capture.sources.length,traders:capture.traders.length,candidates:capture.candidates.length,users:grouped.size,alerts};
}
async function journal(userId:string,action:string,message:string) {
  const value:StmJournal={id:randomUUID(),action,message,createdAt:new Date().toISOString()};
  await putRecord(userId,"journal",value.id,value);
}
export async function stmPaperMark(candidate: StmCandidate): Promise<number> {
  let price: number|null=null;
  if(candidate.market==="cex") {
    if(!/^[A-Z0-9]{2,20}$/.test(candidate.symbol)) throw new Error("无效交易对");
    const response=await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${candidate.symbol}USDT`,{cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(response.ok) price=stmNumber((await response.json()).price);
  } else if(candidate.chain && candidate.address) {
    const chainMap:Record<string,string>={bsc:"bsc",ethereum:"ethereum",base:"base",solana:"solana",robinhood:"robinhood",hood:"robinhood"};
    const chain=chainMap[candidate.chain]; if(!chain) throw new Error("该链尚无可验证的模拟行情");
    const response=await fetch(`https://api.dexscreener.com/tokens/v1/${chain}/${encodeURIComponent(candidate.address)}`,{cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(response.ok) {
      const raw=await response.json();
      const pairs=(Array.isArray(raw)?raw:[]).filter((row:Record<string,any>)=>row.chainId===chain && (candidate.chain==="solana" ? row.baseToken?.address===candidate.address : row.baseToken?.address?.toLowerCase()===candidate.address!.toLowerCase())).sort((a:Record<string,any>,b:Record<string,any>)=>Number(b.liquidity?.usd??0)-Number(a.liquidity?.usd??0));
      price=stmNumber(pairs[0]?.priceUsd);
    }
  }
  if(price===null || price<=0) throw new Error("当前价格不可用；模拟交易不会使用陈旧快照成交");
  return price;
}

export async function mutateStm(userId:string,input:StmMutation):Promise<unknown> {
  if(!stmPersistenceConfigured()) throw new Error("持久化数据库不可用，无法保存操作");
  if(input.action==="refresh") return getStmDashboard(userId);
  if(input.action==="watch") {
    const current=await listRecords(userId,"watch",301);
    if(input.enabled && current.length>=300 && !current.some(row=>row.key===input.id)) throw new Error("关注上限为 300 个实体");
    if(input.enabled) await putRecord(userId,"watch",input.id,{id:input.id,addedAt:new Date().toISOString()});
    else await prisma.stmHuntRecord.deleteMany({where:{userId,kind:"watch",key:input.id}});
    return {watched:input.enabled};
  }
  if(input.action==="strategy") {
    const strategies=await strategiesFor(userId), prior=strategies.find(row=>row.id===input.strategy.id)!;
    const next={...prior,...input.strategy,version:prior.version+1};
    await prisma.$transaction(async tx=>{
      await tx.stmHuntRecord.create({data:{userId,kind:"strategy-version",key:`${next.id}:${next.version}`,payload:stmJson(next)}});
      await tx.stmHuntRecord.upsert({where:{userId_kind_key:{userId,kind:"strategy-active",key:next.id}},create:{userId,kind:"strategy-active",key:next.id,payload:stmJson(next)},update:{payload:stmJson(next)}});
    });
    await journal(userId,"strategy",`${next.id} 发布 v${next.version}`); return {strategy:next};
  }
  if(input.action==="alert-read") {
    const alert=await getRecord<StmAlert>(userId,"alert",input.id); if(!alert) throw new Error("提醒不存在");
    await putRecord(userId,"alert",input.id,{...alert,read:true}); return {read:true};
  }
  if(input.action==="paper-open") {
    const prior=await getRecord<StmPaperPosition>(userId,"paper",input.idempotencyKey); if(prior) return {position:prior,idempotent:true};
    const dashboard=await getStmDashboard(userId), candidate=dashboard.candidates.find(row=>row.id===input.candidateId);
    const signal=dashboard.signals.find(row=>row.candidateId===input.candidateId && row.strategy===input.strategy && row.actionable);
    if(!candidate || !signal) throw new Error("策略证据尚未齐备；请选择已通过全部条件且未被 S5 拦截的候选");
    const feeBps=input.feeBps??10,slippageBps=input.slippageBps??30;
    const entryPrice=(await stmPaperMark(candidate))*(1+slippageBps/10000);
    const position:StmPaperPosition={id:input.idempotencyKey,candidateId:candidate.id,symbol:candidate.symbol,strategy:input.strategy,status:"open",quantity:input.notionalUsd/entryPrice,
      notionalUsd:input.notionalUsd,entryPrice,exitPrice:null,feeBps,slippageBps,pnlUsd:null,openedAt:new Date().toISOString(),closedAt:null};
    await prisma.$transaction(async tx=>{
      const open=await tx.stmHuntRecord.findMany({where:{userId,kind:"paper"},take:200});
      const exposure=open.reduce((sum,row)=>{const p=row.payload as unknown as StmPaperPosition;return sum+(p.status==="open"?p.notionalUsd:0);},0);
      if(exposure+input.notionalUsd>100000) throw new Error("模拟总敞口不可超过 $100,000");
      await tx.stmHuntRecord.create({data:{userId,kind:"paper",key:position.id,payload:stmJson(position)}});
    },{isolationLevel:"Serializable"});
    await journal(userId,"paper-open",`${candidate.symbol} 模拟开仓 $${input.notionalUsd}，费用 ${feeBps}bps / 滑点 ${slippageBps}bps`);return {position};
  }
  if(input.action==="paper-close") {
    const prior=await getRecord<StmPaperPosition>(userId,"paper",input.id); if(!prior) throw new Error("模拟仓位不存在"); if(prior.status==="closed") return {position:prior,idempotent:true};
    const dashboard=await getStmDashboard(userId), candidate=dashboard.candidates.find(row=>row.id===prior.candidateId)
      ?? (await safeRead(()=>listRecords<Capture>("system","snapshot",100),[])).flatMap(row=>row.payload.candidates).find(row=>row.id===prior.candidateId);
    if(!candidate) throw new Error("缺少该资产的可验证行情定义");
    const exitPrice=(await stmPaperMark(candidate))*(1-prior.slippageBps/10000);
    const pnlUsd=prior.quantity*exitPrice-prior.notionalUsd-(prior.notionalUsd+prior.quantity*exitPrice)*prior.feeBps/10000;
    const position={...prior,status:"closed" as const,exitPrice,pnlUsd,closedAt:new Date().toISOString()};
    // Compare the original JSON to prevent two closes from choosing different marks.
    const updated=await prisma.stmHuntRecord.updateMany({where:{userId,kind:"paper",key:prior.id,payload:{equals:stmJson(prior)}},data:{payload:stmJson(position)}});
    if(!updated.count) return {position:await getRecord<StmPaperPosition>(userId,"paper",prior.id),idempotent:true};
    await journal(userId,"paper-close",`${prior.symbol} 模拟平仓，扣费后盈亏 $${pnlUsd.toFixed(2)}`);return {position};
  }
  const captures=(await listRecords<Capture>("system","snapshot",1000)).map(row=>row.payload).sort((a,b)=>Date.parse(a.asOf)-Date.parse(b.asOf));
  const strategies=await strategiesFor(userId);
  // Current strategy version is explicitly applied to historical point-in-time evidence.
  const replay=runStmReplay(captures,strategies,input.feeBps??10,input.slippageBps??30);
  await putRecord(userId,"replay",replay.id,replay); await journal(userId,"replay",replay.message); return {replay};
}

export function runStmReplay(captures:Capture[],strategies:StmStrategy[],feeBps:number,slippageBps:number):StmReplay {
  let signals=0,ready=0,equity=10000,peak=10000,maxDrawdownPct=0,wins=0,trades=0;
  const active=new Map<string,{entry:number;quantity:number;notional:number;openedAt:number}>();
  for(let index=0;index<captures.length;index++) {
    const current=captures[index], asOf=Date.parse(current.asOf);
    const evaluation=evaluateStmStrategies({...current,chainEvents:current.chainEvents??[],events:current.events??[],markets:current.markets??[],snapshots:captures.slice(0,index+1),strategies});
    signals+=evaluation.length;ready+=evaluation.filter(row=>row.actionable).length;
    for(const [id,position] of active) {
      const mark=current.candidates.find(row=>row.id===id);
      if(!mark?.price || !mark.updatedAt || Date.parse(mark.updatedAt)<=position.openedAt || Date.parse(mark.updatedAt)>asOf) continue;
      if(asOf-position.openedAt<60*60000 && !evaluation.some(row=>row.candidateId===id && row.status==="risk")) continue;
      const exit=mark.price*(1-slippageBps/10000),pnl=position.quantity*exit-position.notional-(position.notional+position.quantity*exit)*feeBps/10000;
      equity+=pnl;peak=Math.max(peak,equity);maxDrawdownPct=Math.max(maxDrawdownPct,(peak-equity)/peak*100);trades++;if(pnl>0)wins++;active.delete(id);
    }
    if(index===0) continue;
    const previous=captures[index-1];
    const priorSignals=evaluateStmStrategies({...previous,chainEvents:previous.chainEvents??[],events:previous.events??[],markets:previous.markets??[],snapshots:captures.slice(0,index),strategies});
    for(const signal of priorSignals.filter(row=>row.actionable)) {
      if(active.has(signal.candidateId) || active.size>=3 || equity<=0 || Date.parse(signal.expiresAt)<asOf) continue;
      const candidate=current.candidates.find(row=>row.id===signal.candidateId);
      if(!candidate?.price || !candidate.updatedAt || Date.parse(candidate.updatedAt)<=Date.parse(previous.asOf) || Date.parse(candidate.updatedAt)>asOf) continue;
      const entry=candidate.price*(1+slippageBps/10000),notional=Math.min(1000,equity*.1);
      active.set(candidate.id,{entry,quantity:notional/entry,notional,openedAt:asOf});
    }
  }
  return {id:randomUUID(),createdAt:new Date().toISOString(),snapshots:captures.length,start:captures[0]?.asOf??null,end:captures.at(-1)?.asOf??null,signals,ready,feeBps,slippageBps,
    returns:trades?(equity/10000-1)*100:null,performance:{trades,winRate:trades?wins/trades*100:null,maxDrawdownPct:trades?maxDrawdownPct:null,netPnlUsd:equity-10000,initialEquityUsd:10000,finalEquityUsd:equity},
    message:`采集回放：${captures.length} 个时点，${trades} 笔已结算模拟交易；使用当前策略版本、下一新报价入场、60 分钟或风险退出，费用 ${feeBps}bps / 滑点 ${slippageBps}bps。${active.size} 笔未平仓未计入已实现收益。历史数据缺口不补造；非历史完整市场回测。`};
}
