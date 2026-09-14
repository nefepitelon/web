import {
  alphaAutomationSettingsSchema, normalizeAlphaAutomationSymbol, matchAlphaAutomationStrategies,
  type AlphaAutomationMarketSnapshot, type AlphaAutomationObservation, type AlphaAutomationSettings,
} from "./automation-strategy";
import { buildAlphaScanSnapshot } from "../../api/alpha-scan.js";
import collector from "../../workers/telegram_signal_collector.js";

const BINANCE = "https://fapi.binance.com";
const BUBBLES = "https://cryptobubbles.net/backend/data/bubbles1000.usd.json";
const BAR_MS = 15 * 60_000;
const MAX_ENRICHED = 12;
const FETCH_TIMEOUT_MS = 8000;
const EXCHANGE_CACHE_MS = 5 * 60_000;
type RecordValue = Record<string, any>;
type Fetch = typeof fetch;
export type AlphaAutomationSourceStatus = {source:string;ok:boolean;observedAt:number|null;count:number;message:string};
export type AlphaAutomationMarketObservation = AlphaAutomationObservation;
export type AlphaAutomationMarketRejection = {
  symbol:string;reason:"MARKET_NOT_TRADABLE"|"MARKET_ENRICHMENT_LIMIT"|"MARKET_DATA_UNAVAILABLE";message:string;
};
export type AlphaAutomationMarketResult = {
  observations: AlphaAutomationMarketObservation[];
  markets: AlphaAutomationMarketSnapshot[];
  sourceStatus: AlphaAutomationSourceStatus[];
  marketRejections?: AlphaAutomationMarketRejection[];
};
export type AlphaAutomationQuote = Pick<AlphaAutomationMarketSnapshot,
  "symbol"|"quoteAt"|"bid"|"ask"|"estimatedSlippagePct"|"liquidityNotional"|"takerFeePct"|"filters">;
type Dependencies = {
  fetchImpl?: Fetch;
  now?: () => number;
  scanLoader?: () => Promise<unknown>;
  signalLoader?: () => Promise<unknown>;
};

function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return null;
  const result = Number(value); return Number.isFinite(result) ? result : null;
}
const positive = (value: unknown) => { const result=numeric(value); return result !== null && result>0 ? result : null; };
function timestamp(value: unknown): number | null {
  if (typeof value === "number") return value>0 && Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const parsed=Date.parse(value); return Number.isFinite(parsed) ? parsed : null;
}
const ageValid = (at: number | null, now: number, maxAge: number): at is number => at !== null && at<=now && now-at<=maxAge;
const sideOf = (value: unknown) => value === "long" || value === "LONG" ? "LONG" : value === "short" || value === "SHORT" ? "SHORT" : "NEUTRAL";
function array(value: unknown, label: string): RecordValue[] {
  if (!Array.isArray(value)) throw new Error(`${label}: malformed array`);
  return value;
}
function records(value: unknown, label: string): RecordValue[] {
  const rows=array(value,label);
  if(rows.some(row=>!row||typeof row!=="object"||Array.isArray(row))) throw new Error(`${label}: malformed record`);
  return rows;
}
async function bounded<T>(job: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([job,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label}: timeout`)),milliseconds);})]); }
  finally { if(timer) clearTimeout(timer); }
}

/** Reject gaps and incomplete OHLC rather than fabricating a bar or using the open candle. */
export function alphaClosedCandleIndicators(raw: unknown, now: number) {
  const rows=array(raw,"klines");
  const candles: {openTime:number;closeTime:number;open:number;high:number;low:number;close:number;volume:number|null}[]=[];
  for (const row of rows) {
    if (!Array.isArray(row)) throw new Error("klines: malformed candle");
    const closeTime=positive(row[6]);
    if (closeTime===null) throw new Error("klines: missing close time");
    if (closeTime>=now) continue;
    const [openTime,open,high,low,close,volume]=[numeric(row[0]),positive(row[1]),positive(row[2]),positive(row[3]),positive(row[4]),numeric(row[5])];
    if (openTime===null || open===null || high===null || low===null || close===null
      || high<Math.max(open,close) || low>Math.min(open,close) || high<low || closeTime-openTime!==BAR_MS-1
      || (candles.length && openTime-candles[candles.length-1].openTime!==BAR_MS)) throw new Error("klines: invalid or non-contiguous closed candles");
    candles.push({openTime,closeTime,open,high,low,close,volume:volume!==null&&volume>=0?volume:null});
  }
  if(candles.length<15) throw new Error("klines: at least 15 closed candles required for true-range ATR");
  const last=candles[candles.length-1];
  // A just-fetched 15m history legitimately ends at the previous 15m close.
  if(now-last.closeTime>BAR_MS+2000) throw new Error("klines: stale last closed candle");
  const priorVolumes=candles.slice(-21,-1).map(candle=>candle.volume);
  const previousVolume=priorVolumes.length===20&&priorVolumes.every(value=>value!==null)
    ? priorVolumes.reduce<number>((sum,value)=>sum+(value??0),0)/20 : null;
  const trueRanges=candles.slice(-14).map((candle,index)=>{
    const prior=candles[candles.length-15+index].close;
    return Math.max(candle.high-candle.low,Math.abs(candle.high-prior),Math.abs(candle.low-prior));
  });
  return {return15mPct:(last.close/candles[candles.length-2].close-1)*100,
    return1hPct:(last.close/candles[candles.length-5].close-1)*100,
    volumeMultiple:last.volume!==null&&previousVolume!==null&&previousVolume>0?last.volume/previousVolume:null,
    atrPct:trueRanges.reduce((sum,value)=>sum+value,0)/14/last.close*100};
}

function depthExecution(raw: unknown, notional: number) {
  const book=raw as RecordValue;
  if(!book || !(notional>0)) throw new Error("depth: invalid order notional");
  const side=(levels:unknown,ascending:boolean)=>{
    if(!Array.isArray(levels)||!levels.length) throw new Error("depth: empty book");
    let remaining=notional,spent=0,quantity=0,previous:number|null=null,best=0;
    for(const row of levels) {
      if(!Array.isArray(row)) throw new Error("depth: malformed level");
      const price=positive(row[0]),size=positive(row[1]);
      if(price===null||size===null||(previous!==null&&(ascending?price<previous:price>previous))) throw new Error("depth: invalid level order");
      if(!best) best=price;
      previous=price;
      const quote=Math.min(remaining,price*size); spent+=quote; quantity+=quote/price; remaining-=quote;
      if(remaining<=1e-8) break;
    }
    if(remaining>1e-8||!(quantity>0)) throw new Error("depth: insufficient liquidity for target notional");
    const vwap=spent/quantity;
    return {best,vwap,slippage:Math.max(0,ascending?(vwap/best-1)*100:(1-vwap/best)*100)};
  };
  const asks=side(book.asks,true),bids=side(book.bids,false);
  if(asks.best<bids.best) throw new Error("depth: crossed book");
  return {asks,bids,slippage:Math.max(asks.slippage,bids.slippage)};
}

/** Worst direction is used because a single snapshot may be evaluated for either LONG or SHORT. */
export function alphaDepthSlippage(raw: unknown, notional: number) {
  return depthExecution(raw,notional).slippage;
}

/** Entry and depth cost share the same book. Divergent fresh snapshots still require rejection. */
function alignedExecutionQuote(book:RecordValue,rawDepth:unknown,notional:number,maxSlippagePct:number) {
  const tickerBid=positive(book?.bidPrice),tickerAsk=positive(book?.askPrice);
  if(tickerBid===null||tickerAsk===null||tickerAsk<tickerBid) throw new Error("Quote: incomplete or crossed bookTicker");
  const depth=depthExecution(rawDepth,notional);
  const deviationPct=Math.max(Math.abs(depth.bids.best/tickerBid-1),Math.abs(depth.asks.best/tickerAsk-1))*100;
  if(deviationPct>maxSlippagePct) throw new Error("Quote: bookTicker/depth price deviation exceeds slippage limit");
  // Include even small cross-snapshot movement in the reserve, together with
  // the actual depth VWAP relative to both the current book and bookTicker.
  // Favorable movement cannot erase an adverse depth cost in either direction.
  const estimatedSlippagePct=Math.max(depth.slippage,deviationPct,
    Math.abs(depth.bids.vwap/tickerBid-1)*100,Math.abs(depth.asks.vwap/tickerAsk-1)*100);
  if(estimatedSlippagePct>maxSlippagePct) throw new Error("Quote: combined snapshot movement and depth slippage exceeds limit");
  return {bid:depth.bids.best,ask:depth.asks.best,estimatedSlippagePct};
}

function exchangeFilters(symbol: RecordValue): AlphaAutomationMarketSnapshot["filters"] {
  const rules=records(symbol.filters,"exchangeInfo filters");
  const price=rules.find(rule=>rule.filterType==="PRICE_FILTER");
  const lot=rules.find(rule=>rule.filterType==="LOT_SIZE");
  const marketLot=rules.find(rule=>rule.filterType==="MARKET_LOT_SIZE");
  const notional=rules.find(rule=>rule.filterType==="MIN_NOTIONAL"||rule.filterType==="NOTIONAL");
  const tickSize=positive(price?.tickSize),stepSize=positive(lot?.stepSize),minQty=numeric(lot?.minQty),maxQty=positive(lot?.maxQty);
  const minNotional=numeric(notional?.notional??notional?.minNotional);
  if(tickSize===null||stepSize===null||minQty===null||minQty<0||maxQty===null||minNotional===null||minNotional<0) throw new Error("exchangeInfo: missing mandatory symbol filters");
  const marketStep=positive(marketLot?.stepSize);
  // Futures typically share increments. Do not pretend mismatched increments are interchangeable.
  if(marketStep!==null&&marketStep!==stepSize) throw new Error("exchangeInfo: differing market quantity increment requires review");
  const marketMin=numeric(marketLot?.minQty),marketMax=positive(marketLot?.maxQty);
  const maxNotional=positive(notional?.maxNotional);
  if((marketLot&&(marketMin===null||marketMin<0||marketMax===null||numeric(marketLot.stepSize)===null))
    ||(notional?.maxNotional!==undefined&&maxNotional===null)
    ||Math.min(maxQty,marketMax??Infinity)<Math.max(minQty,marketMin??0)
    ||(maxNotional!==null&&maxNotional<minNotional)) throw new Error("exchangeInfo: invalid market quantity or notional limits");
  return {tickSize,stepSize,minQty:Math.max(minQty,marketMin??0),maxQty:Math.min(maxQty,marketMax??Infinity),minNotional,maxNotional};
}

export function createAlphaAutomationMarketLoader(deps: Dependencies = {}) {
  const fetchImpl=deps.fetchImpl??fetch,clock=deps.now??Date.now;
  let exchangeCache:{at:number;rows:RecordValue[]}|null=null;
  let exchangePending:Promise<RecordValue[]>|null=null;
  async function get(url:string) {
    const response=await fetchImpl(url,{method:"GET",cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(FETCH_TIMEOUT_MS)});
    if(!response.ok) throw new Error(`${new URL(url).hostname}${new URL(url).pathname}: HTTP ${response.status}`);
    const body=await response.text(); if(body.length>8_000_000) throw new Error("Public response exceeded size limit");
    const receivedAt=clock(),age=numeric(response.headers.get("age"))??0;
    if(age<0) throw new Error("Invalid public response age");
    return {data:JSON.parse(body),at:receivedAt-age*1000};
  }
  async function exchangeInfo() {
    if(exchangeCache&&clock()-exchangeCache.at>=0&&clock()-exchangeCache.at<EXCHANGE_CACHE_MS) return exchangeCache.rows;
    if(exchangePending) return exchangePending;
    exchangePending=(async()=>{
      const response=await get(`${BINANCE}/fapi/v1/exchangeInfo`);
      if(!ageValid(response.at,clock(),EXCHANGE_CACHE_MS)) throw new Error("exchangeInfo: stale metadata");
      const rows=records(response.data?.symbols,"exchangeInfo");
      exchangeCache={at:response.at,rows}; return rows;
    })();
    try{return await exchangePending;}finally{exchangePending=null;}
  }
  async function signals():Promise<{payload:RecordValue;at:number|null}> {
    if(deps.signalLoader) {
      const payload=await deps.signalLoader() as RecordValue;
      return {payload,at:payload?.refreshed_at===undefined?clock():timestamp(payload.refreshed_at)};
    }
    const deadline=AbortSignal.timeout(20_000);
    const responseTimes=new Map<string,number|null>();
    // Reuse the real parser, but its persistence calls target memory only. No writes to Blob/Supabase/webhook occur.
    const payload=await collector.collectPublicPreviewSignals({store:new collector.MemorySignalStore(),fetchImpl:(async(url:Parameters<Fetch>[0],init?:RequestInit)=>{
      const response=await fetchImpl(url,{...init,method:"GET",cache:"no-store",signal:AbortSignal.any([deadline,AbortSignal.timeout(FETCH_TIMEOUT_MS),...(init?.signal?[init.signal]:[])])});
      const age=numeric(response.headers.get("age"))??0;
      responseTimes.set(String(url),age>=0?clock()-age*1000:null);
      return response;
    }) as Fetch});
    return {payload,at:responseTimes.get(payload.source_url)??null};
  }
  async function refreshQuote(settingsInput:unknown,symbolInput:string):Promise<AlphaAutomationQuote> {
    const settings=alphaAutomationSettingsSchema.parse(settingsInput),symbol=normalizeAlphaAutomationSymbol(symbolInput);
    if(!symbol) throw new Error("Quote refresh: invalid symbol");
    const [metadata,book,depth]=await Promise.all([exchangeInfo(),get(`${BINANCE}/fapi/v1/ticker/bookTicker?symbol=${symbol}`),get(`${BINANCE}/fapi/v1/depth?symbol=${symbol}&limit=100`)]);
    const meta=metadata.find(row=>row.symbol===symbol);
    if(!meta||meta.status!=="TRADING"||meta.contractType!=="PERPETUAL"||meta.quoteAsset!=="USDT") throw new Error("Quote refresh: inactive USDT perpetual");
    const bid=positive(book.data?.bidPrice),ask=positive(book.data?.askPrice),now=clock();
    const times=[timestamp(book.data?.time),timestamp(depth.data?.E??depth.data?.T),book.at,depth.at];
    if(book.data?.symbol!==symbol||bid===null||ask===null||ask<bid
      ||!times.every(at=>ageValid(at,now,settings.maxQuoteAgeSeconds*1000))) throw new Error("Quote refresh: incomplete, stale or crossed quote");
    const liquidityNotional=Math.min(settings.orderNotional,settings.maxOrderNotional);
    return {symbol,quoteAt:Math.min(...times as number[]),...alignedExecutionQuote(book.data,depth.data,liquidityNotional,settings.maxSlippagePct),
      liquidityNotional,takerFeePct:0.06,filters:exchangeFilters(meta)};
  }
  async function load(settingsInput:unknown):Promise<AlphaAutomationMarketResult> {
    const settings:AlphaAutomationSettings=alphaAutomationSettingsSchema.parse(settingsInput);
    const observations:AlphaAutomationMarketObservation[]=[],markets:AlphaAutomationMarketSnapshot[]=[],sourceStatus:AlphaAutomationSourceStatus[]=[];
    const marketRejections:AlphaAutomationMarketRejection[]=[];
    const rejectMarket=(symbol:string,reason:AlphaAutomationMarketRejection["reason"],message:string)=>marketRejections.push({symbol,reason,message});
    type PoolMember={source:"anomaly"|"momentum"|"signal";evidenceId:string;side:AlphaAutomationObservation["side"];score:number|null;snapshotAt:number|null;eventAt:number|null;complete:boolean};
    const scanPool=new Map<string,PoolMember>(),momentumPool=new Map<string,PoolMember>(),signalPool=new Map<string,PoolMember>();
    const status=(source:string,ok:boolean,observedAt:number|null,count:number,message:string)=>sourceStatus.push({source,ok,observedAt,count,message});
    const results=await Promise.allSettled([
      bounded((deps.scanLoader??buildAlphaScanSnapshot)(),25_000,"alpha scan"),
      get(BUBBLES),bounded(signals(),22_000,"signal preview"),exchangeInfo(),
    ]);
    const age=settings.maxDataAgeMinutes*60_000,now=clock();
    if(results[0].status==="fulfilled") {
      const snapshot=results[0].value as RecordValue,at=timestamp(snapshot?.scannedAt);
      if(ageValid(at,now,age)&&Array.isArray(snapshot?.items)) {
        for(const [rank,row] of snapshot.items.entries()) {
          const symbol=normalizeAlphaAutomationSymbol(row?.symbol),score=numeric(row?.score);
          if(!symbol) continue;
          const scoreValid=score!==null&&score>=0&&score<=100;
          const dimension=(index:number)=>{
            const value=numeric(row?.dimensions?.[index]);
            return row?.dimensionAvailability?.[index]===true&&value!==null&&value>=0&&value<=100?value:null;
          };
          const priceMomentumScore=dimension(0),volumeAnomalyScore=dimension(1);
          const complete=scoreValid&&priceMomentumScore!==null&&volumeAnomalyScore!==null;
          const evidence:AlphaAutomationObservation={source:"anomaly",evidenceId:`alpha-scan:${symbol}:${at}`,symbol,side:sideOf(row.bias),score:scoreValid?score:null,observedAt:at,snapshotAt:at,sourceStatus:"live",sourceReason:null,
            priceMomentumScore,volumeAnomalyScore,dataComplete:complete,overheated:/过热|overheat/i.test(String(row.signalType??row.type??""))};
          observations.push(evidence);
          // Frontend buildRiskPoolModel uses the displayed scanner's first ten,
          // not all rows and not the standalone anomaly strategy's score filter.
          if(rank<10)scanPool.set(symbol,{source:"anomaly",evidenceId:evidence.evidenceId,side:evidence.side,score:scoreValid?score:null,snapshotAt:at,eventAt:at,complete:true});
        }
        status("anomaly",true,at,observations.filter(row=>row.source==="anomaly").length,"Actual scanner Alpha score and dimensions[0]/[1]; unavailable scores remain null. Pool membership uses scanner top 10.");
      } else status("anomaly",false,at,0,"Scanner snapshot malformed or stale; no substitution.");
    } else status("anomaly",false,null,0,String(results[0].reason?.message??"Scanner failed"));
    if(results[1].status==="fulfilled") {
      const response=results[1].value;
      if(ageValid(response.at,now,age)&&Array.isArray(response.data)) {
        const eligible=response.data.filter((row:RecordValue)=>typeof row?.symbols?.binance==="string"&&row.symbols.binance.length>0&&normalizeAlphaAutomationSymbol(row?.symbol)
          &&numeric(row?.performance?.day)!==null&&numeric(row?.volume)!==null);
        const gainers=eligible.filter((row:RecordValue)=>Number(row.performance.day)>0).sort((a:RecordValue,b:RecordValue)=>Number(b.performance.day)-Number(a.performance.day)).slice(0,10);
        const losers=eligible.filter((row:RecordValue)=>Number(row.performance.day)<0).sort((a:RecordValue,b:RecordValue)=>Number(a.performance.day)-Number(b.performance.day)).slice(0,10);
        const poolSymbols=new Set([...gainers.slice(0,5),...losers.slice(0,5)].map(row=>normalizeAlphaAutomationSymbol(row.symbol)));
        const ranked=[...gainers,...losers];
        for(const row of ranked) {
          const symbol=normalizeAlphaAutomationSymbol(row.symbol)!;
          const evidence:AlphaAutomationObservation={source:"momentum",evidenceId:`cryptobubbles:1d:${symbol}:${response.at}`,symbol,side:Number(row.performance.day)>0?"LONG":"SHORT",score:null,
            observedAt:response.at,snapshotAt:response.at,sourceStatus:"live",sourceReason:null,dataComplete:true,overheated:false};
          observations.push(evidence);
          if(poolSymbols.has(symbol))momentumPool.set(symbol,{source:"momentum",evidenceId:evidence.evidenceId,side:evidence.side,score:null,snapshotAt:response.at,eventAt:response.at,complete:true});
        }
        status("momentum",true,response.at,ranked.length,"Actual Crypto Bubbles Binance 1D gainers/losers; ranks and returns are not Alpha scores.");
      } else status("momentum",false,response.at,0,"Momentum response malformed or stale.");
    } else status("momentum",false,null,0,String(results[1].reason?.message??"Momentum failed"));
    if(results[2].status==="fulfilled") {
      const {payload,at:snapshotAt}=results[2].value;
      const snapshotFresh=payload?.stale!==true&&!payload?.fallback&&ageValid(snapshotAt,now,age);
      const records:RecordValue[]=Array.isArray(payload?.latest)?payload.latest:Array.isArray(payload?.signals)?payload.signals:[];
      const realRecord=(row:RecordValue)=>row&&typeof row==="object"&&["webhook","public_preview","public_preview_markdown"].includes(row.source_mode)
        &&typeof row.dedupe_hash==="string"&&row.dedupe_hash.length>0;
      const labelCountsKnown=records.every(realRecord);
      const seen=new Set<string>();
      const latest=records.filter(realRecord).sort(collector.compareRecentSignals).filter(row=>{
        if(seen.has(row.dedupe_hash))return false;seen.add(row.dedupe_hash);return true;
      }).slice(0,20);
      const symbolCounts=new Map<string,number>();
      const identityCounts=new Map<string,number>();
      const messageIdentity=(row:RecordValue)=>{
        const id=String(row.telegram_message_id??""),channel=String(row.channel_username??"").trim().replace(/^@/,"").toLowerCase();
        return /^[1-9]\d*$/.test(id)&&Number.isSafeInteger(Number(id))&&/^[a-z0-9_]{3,64}$/.test(channel)?`${channel}:${id}`:null;
      };
      // Same-coin labels count the complete displayed latest-20 feed, across
      // directions and ages. Filtering by freshness first would turn x3 into x2.
      for(const row of latest){
        const symbol=normalizeAlphaAutomationSymbol(row.pair??row.symbol);if(symbol)symbolCounts.set(symbol,(symbolCounts.get(symbol)??0)+1);
        const identity=messageIdentity(row);if(identity)identityCounts.set(identity,(identityCounts.get(identity)??0)+1);
      }
      for(const row of latest) {
        const symbol=normalizeAlphaAutomationSymbol(row?.pair??row?.symbol),at=timestamp(collector.verifiedSignalTime(row)),direction=sideOf(row?.direction);
        if(!symbol)continue;
        const claimedAt=timestamp(row.signal_time),futureEvent=claimedAt!==null&&claimedAt>now;
        const parsedDirection=["parsed","partial"].includes(row.parse_status)&&direction!=="NEUTRAL";
        const identity=messageIdentity(row),uniqueIdentity=identity!==null&&identityCounts.get(identity)===1;
        const sourceKnown=snapshotFresh&&parsedDirection&&labelCountsKnown;
        const complete=sourceKnown&&!futureEvent&&at!==null&&at<=now;
        const sourceStatus:AlphaAutomationObservation["sourceStatus"]=!snapshotFresh?(snapshotAt===null||snapshotAt>now?"unknown":"stale")
          :!sourceKnown||futureEvent||at===null||at>now?"unknown":"live";
        const sourceReason:AlphaAutomationObservation["sourceReason"]=snapshotAt===null?"SNAPSHOT_TIME_UNKNOWN"
          :!sourceKnown||futureEvent?"SOURCE_UNVERIFIED":at===null?"SIGNAL_EVENT_TIME_UNKNOWN":at>now?"SOURCE_UNVERIFIED":null;
        const evidenceId=`telegram:${row.dedupe_hash}`;
        if(!signalPool.has(symbol))signalPool.set(symbol,{source:"signal",evidenceId,side:direction,score:null,snapshotAt,eventAt:at,
          // An untimed, uniquely identified current message can prove set
          // membership. It never receives a synthetic event publication time.
          complete:sourceKnown&&!futureEvent&&(at===null?uniqueIdentity:at<=now)});
        observations.push({source:"signal",evidenceId,symbol,side:direction,score:null,observedAt:at,snapshotAt,sourceStatus,sourceReason,dataComplete:complete,
          sameCoinCount:labelCountsKnown?symbolCounts.get(symbol)??null:null,overheated:false});
      }
      const counted=observations.filter(row=>row.source==="signal");
      const validPayload=Array.isArray(payload?.latest)||Array.isArray(payload?.signals);
      status("signal",validPayload&&snapshotFresh,snapshotAt,counted.length,validPayload
        ?`Signal collection snapshot time; original message timestamps are preserved separately. Same-coin labels count unique latest 20 across ages and directions. Parser confidence is not Alpha score.${labelCountsKnown?"":" Label counts unavailable due to unidentified records."}`:"Signal response malformed; no substitution.");
    } else status("signal",false,null,0,String(results[2].reason?.message??"Signal preview failed"));
    for(const symbol of new Set([...scanPool.keys(),...momentumPool.keys(),...signalPool.keys()])) {
      const members=[scanPool.get(symbol),momentumPool.get(symbol),signalPool.get(symbol)].filter((row):row is PoolMember=>Boolean(row));
      if(members.length<2)continue;
      const times=members.map(row=>row.snapshotAt).filter((at):at is number=>at!==null);
      if(!times.length)continue;
      const snapshotAt=Math.min(...times),snapshotsFresh=members.every(row=>ageValid(row.snapshotAt,now,age));
      const complete=members.every(row=>row.complete)&&snapshotsFresh;
      const longs=members.filter(row=>row.side==="LONG").length,shorts=members.filter(row=>row.side==="SHORT").length;
      observations.push({source:"risk_pool",symbol,evidenceId:members[0].evidenceId,score:scanPool.get(symbol)?.score??null,
        side:longs===shorts?"NEUTRAL":longs>shorts?"LONG":"SHORT",observedAt:snapshotAt,snapshotAt,
        sourceStatus:complete?"live":snapshotsFresh||members.some(row=>row.snapshotAt===null||row.snapshotAt>now)?"unknown":"stale",
        sourceReason:complete?null:members.some(row=>row.snapshotAt===null)?"SNAPSHOT_TIME_UNKNOWN":"SOURCE_UNVERIFIED",
        dataComplete:complete,overheated:false,riskPoolPriority:members.length===3?"P1":"P2",
        poolMembers:members.map(({source,evidenceId,snapshotAt,eventAt})=>({source,evidenceId,snapshotAt,eventAt}))});
    }
    const poolRows=observations.filter(row=>row.source==="risk_pool"),poolReady=["anomaly","momentum","signal"].every(source=>sourceStatus.find(row=>row.source===source)?.ok);
    const poolTimes=poolRows.map(row=>row.snapshotAt).filter((at):at is number=>at!==null&&at!==undefined);
    status("risk_pool",poolReady,poolTimes.length?Math.min(...poolTimes):null,poolRows.length,
      "Current pool snapshots: scanner top 10 + momentum top 5 gainers/5 losers + unique latest 20 messages; P1=3 sets/P2=2. Pool freshness uses source snapshot times, not member message age. Original message times still govern strong/x2 strategies. Direction is majority, ties neutral; derived evidence never adds an independent vote.");
    const matchedSymbols=[...new Set(observations.map(row=>row.symbol))].map(symbol=>{
      const match=matchAlphaAutomationStrategies(observations.filter(row=>row.symbol===symbol),settings,clock());
      return {symbol,match,score:Math.max(0,...(match?.observations??[]).map(row=>row.score??0))};
    }).filter(row=>row.match!==null)
      .sort((a,b)=>(b.match?.matchedStrategies.length??0)-(a.match?.matchedStrategies.length??0)||b.score-a.score||a.symbol.localeCompare(b.symbol));
    if(results[3].status!=="fulfilled") {
      matchedSymbols.forEach(({symbol})=>rejectMarket(symbol,"MARKET_DATA_UNAVAILABLE","交易所合约元数据暂不可核验，无法确认交易规则。"));
      status("market",false,null,0,"Binance exchange metadata unavailable."); return {observations,markets,sourceStatus,marketRejections};
    }
    const exchangeRows=(results[3] as PromiseFulfilledResult<RecordValue[]>).value;
    const metadata=new Map(exchangeRows.map(row=>[row.symbol,row]));
    // Non-executable symbols must not consume the bounded enrichment budget.
    const tradableSymbols=matchedSymbols.filter(({symbol})=>{
      const meta=metadata.get(symbol);
      if(!meta||meta.status!=="TRADING"||meta.contractType!=="PERPETUAL"||meta.quoteAsset!=="USDT") {
        rejectMarket(symbol,"MARKET_NOT_TRADABLE","该标的不属于当前可交易的 Binance USDT 永续合约。");return false;
      }
      try {exchangeFilters(meta);return true;}
      catch {rejectMarket(symbol,"MARKET_DATA_UNAVAILABLE","该标的交易所价格、数量或名义金额规则暂不可核验。");return false;}
    });
    tradableSymbols.slice(MAX_ENRICHED).forEach(({symbol})=>rejectMarket(symbol,"MARKET_ENRICHMENT_LIMIT","本轮可交易标的行情核验已达 12 个上限，将等待后续扫描。"));
    const symbols=tradableSymbols.slice(0,MAX_ENRICHED);
    // Do not let the scanner/collector consume the lifetime of execution quotes.
    // One post-source ticker request supplies volume; each queued symbol gets its
    // own exact-symbol book below, so no unused bulk book request is necessary.
    let tickerResponse:{data:unknown;at:number};
    try {
      tickerResponse=symbols.length?await get(`${BINANCE}/fapi/v1/ticker/24hr`):{data:[],at:clock()};
      if(!ageValid(tickerResponse.at,clock(),age)) throw new Error("Binance 24h ticker response expired");
      records(tickerResponse.data,"Binance 24h ticker");
    } catch(error) {
      symbols.forEach(({symbol})=>rejectMarket(symbol,"MARKET_DATA_UNAVAILABLE","本轮真实成交量行情暂不可核验。"));
      status("market",false,null,0,error instanceof Error?error.message:"Binance 24h ticker unavailable"); return {observations,markets,sourceStatus,marketRejections};
    }
    const tickers=new Map(array(tickerResponse.data,"tickers").map(row=>[row.symbol,row]));
    const failures:string[]=[]; let cursor=0;
    await Promise.all(Array.from({length:Math.min(3,symbols.length)},async()=>{
      while(cursor<symbols.length) {
        const {symbol}=symbols[cursor++];
        try {
          const meta=metadata.get(symbol),ticker=tickers.get(symbol);
          if(!meta||meta.status!=="TRADING"||meta.contractType!=="PERPETUAL"||meta.quoteAsset!=="USDT") throw new Error("Not an active USDT perpetual");
          const filters=exchangeFilters(meta),quoteVolume24h=positive(ticker?.quoteVolume),return24hPct=numeric(ticker?.priceChangePercent);
          if(quoteVolume24h===null) throw new Error("Incomplete real liquidity data");
          const [book,depth,klines]=await Promise.all([get(`${BINANCE}/fapi/v1/ticker/bookTicker?symbol=${symbol}`),get(`${BINANCE}/fapi/v1/depth?symbol=${symbol}&limit=100`),
            get(`${BINANCE}/fapi/v1/klines?symbol=${symbol}&interval=15m&limit=30`)]);
          const checkedAt=clock(),bid=positive(book.data?.bidPrice),ask=positive(book.data?.askPrice);
          if(book.data?.symbol!==symbol||bid===null||ask===null||ask<bid) throw new Error("Incomplete, mismatched or crossed real quote");
          const marketTimes=[timestamp(ticker?.closeTime),tickerResponse.at,klines.at];
          const quoteTimes=[timestamp(book.data?.time),timestamp(depth.data?.E??depth.data?.T),book.at,depth.at];
          if(!marketTimes.every(at=>ageValid(at,checkedAt,age))||!quoteTimes.every(at=>ageValid(at,checkedAt,settings.maxQuoteAgeSeconds*1000))) throw new Error("Stale, future or incomplete Binance observations");
          const indicators=alphaClosedCandleIndicators(klines.data,checkedAt);
          const liquidityNotional=Math.min(settings.orderNotional,settings.maxOrderNotional);
          const executionQuote=alignedExecutionQuote(book.data,depth.data,liquidityNotional,settings.maxSlippagePct);
          markets.push({symbol,market:"futures",tradable:true,observedAt:Math.min(...marketTimes as number[]),quoteAt:Math.min(...quoteTimes as number[]),
            ...executionQuote,quoteVolume24h,return24hPct,...indicators,fundingPct:null,oiChangePct:null,
            liquidityNotional,takerFeePct:0.06,filters});
        } catch(error) {
          rejectMarket(symbol,"MARKET_DATA_UNAVAILABLE","该标的实时盘口、深度或已收盘 K 线缺失、过期或未通过执行校验。");
          failures.push(`${symbol}: ${error instanceof Error?error.message:"market enrichment failed"}`);
        }
      }
    }));
    markets.sort((a,b)=>a.symbol.localeCompare(b.symbol));
    marketRejections.sort((a,b)=>a.symbol.localeCompare(b.symbol));
    status("market",markets.length>0||matchedSymbols.length===0,markets.length?Math.min(...markets.map(row=>row.quoteAt)):null,markets.length,
      `Fresh Binance USDT perpetuals; max ${MAX_ENRICHED} tradable symbols, concurrency 3; fee reserve 0.06% per leg is an estimate. Exchange metadata is checked before allocating execution quotes, depth and closed-candle ATR.${matchedSymbols.length===0?" No symbol matches the selected strategies; no executable candidate was invented.":symbols.length===0?" Matched symbols have no verifiable active USDT perpetual market.":""}${failures.length?` Skipped: ${failures.join("; ")}`:""}`);
    return {observations,markets,sourceStatus,marketRejections};
  };
  return Object.assign(load,{refreshQuote});
}

/** Public, read-only network adapter. It does not start an engine, persist signals or access trading credentials. */
export const loadAlphaAutomationMarket = createAlphaAutomationMarketLoader();
/** Refresh only execution quotes/depth. Original evidenceExpiresAt must still pass the final guard. */
export const refreshAlphaAutomationQuote = loadAlphaAutomationMarket.refreshQuote;
