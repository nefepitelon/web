import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import { createDispatcher, connectionError } from '../../proxy.js';
import { ExchangeWriteScheduler, retryAfterMsFromHeaders } from '../write-scheduler.js';
import { extractLiquidationPrice } from '../liquidation-price.js';

const BARS = { 60:'1m',300:'5m',900:'15m',1800:'30m',3600:'1H',7200:'2H',14400:'4H',86400:'1D' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const decimals = (step) => (/e-/i.test(String(step)) ? Number(String(step).split(/e-/i)[1]) : (String(step).split('.')[1] || '').replace(/0+$/,'').length);
export function floorOkx(value, step) { const s=Number(step); return s>0 ? Number((Math.floor((Number(value)+s*1e-9)/s)*s).toFixed(decimals(step))) : Number(value); }
export function okxBaseFromContracts(contracts, contractValue=1){const value=Number(contracts)*Math.max(Number(contractValue)||1,Number.EPSILON);return Number.isFinite(value)?Number(value.toPrecision(15)):value;}
export function okxContractsFromBase(sizeBase,contractValue=1,contractStep=1){return floorOkx(Number(sizeBase)/Math.max(Number(contractValue)||1,Number.EPSILON),contractStep);}

function apiError(payload, status, headers) {
  const first = payload?.data?.find?.((item) => item?.sCode && item.sCode !== '0');
  const code = first?.sCode || payload?.code || status;
  const detail=first?.sMsg||payload?.msg||`HTTP ${status}`;
  const reason=String(code)==='51008'&&/insufficient.+margin/i.test(detail)?`可用保证金不足：${detail}`:detail;
  const error = new Error(`OKX 拒绝请求 (${code}): ${reason}`);
  error.exchangeCode = String(code); error.httpStatus = status; error.retryAfterMs = retryAfterMsFromHeaders(headers);
  error.responseData = Array.isArray(payload?.data) ? payload.data : null;
  return error;
}

export class OkxExchange extends EventEmitter {
  constructor(opts={}) {
    super(); this.mode='live'; this.network=opts.network||'mainnet'; this.apiUrl=String(opts.apiUrl||'https://www.okx.com').replace(/\/$/,'');
    this.apiKey=opts.apiKey||''; this.apiSecret=opts.apiSecret||''; this.passphrase=opts.passphrase||''; this.proxy=opts.proxy||'';
    this.positionMode=['net_mode','long_short_mode'].includes(opts.positionMode)?opts.positionMode:null;
    this.simulatedTrading=opts.simulatedTrading === true || String(opts.simulatedTrading)==='1' || this.network==='testnet';
    this.orderGapMs=Math.max(100,Number(opts.orderGapMs)||200); this.pollMs=Math.max(1500,Number(opts.pollMs)||3000); this.dispatcher=null;
    this._writeScheduler=new ExchangeWriteScheduler({label:'OKX',minGapMs:this.orderGapMs,maxRetries:5,baseDelayMs:Math.max(800,this.orderGapMs),sleep:opts.sleep});
    this.markets=new Map(); this.symbolToId=new Map(); this._tracked=new Map(); this._positions=new Map(); this._prices=new Map(); this._watch=new Set();
    this.balance=null; this.equity=null; this.availableMargin=null; this._availableMarginByCurrency=new Map(); this.realizedPnl=0; this.dataSource=null; this.lastOkAt=null; this.lastError=null; this._timer=null; this._busy=false;
  }
  async init(){
    if(!this.apiKey||!this.apiSecret||!this.passphrase) throw new Error('OKX live 缺少 API Key、Secret Key 或 Passphrase。');
    await this._ensureDispatcher();
    await this._loadMarkets();
    const accountConfig=(await this._request('GET','/api/v5/account/config',{},true))?.[0];
    if(!['net_mode','long_short_mode'].includes(accountConfig?.posMode)){
      throw new Error(`OKX 未返回可识别的持仓模式（posMode=${accountConfig?.posMode||'空'}），已阻止下单。`);
    }
    this.positionMode=accountConfig.posMode;
    await this._refreshAccount(); this.dataSource='real'; this.start(); return true;
  }
  async reconnect(){this.stop();return this.init();}
  async _ensureDispatcher(){if(!this.proxy||this.proxy==='direct'||this.dispatcher)return this.dispatcher;this.dispatcher=await createDispatcher(this.proxy);return this.dispatcher;}
  async setProxy(proxy){const old=this.dispatcher;this.proxy=String(proxy||'');this.dispatcher=null;try{await old?.close?.();}catch{}return true;}
  _signature(timestamp,method,path,body=''){return createHmac('sha256',this.apiSecret).update(`${timestamp}${method}${path}${body}`).digest('base64');}
  async _request(method, endpoint, params={}, auth=false){ const exec=()=>this._requestOnce(method,endpoint,params,auth); return method==='GET'?exec():this._writeScheduler.run(exec,{operation:`${method} ${endpoint}`}); }
  async _requestOnce(method,endpoint,params={},auth=false){
    const query=method==='GET'&&Object.keys(params).length?`?${new URLSearchParams(params)}`:''; const path=`${endpoint}${query}`; const body=method==='GET'?'':JSON.stringify(params); const timestamp=new Date().toISOString();
    const headers={'Content-Type':'application/json'}; if(auth) Object.assign(headers,{'OK-ACCESS-KEY':this.apiKey,'OK-ACCESS-SIGN':this._signature(timestamp,method,path,body),'OK-ACCESS-TIMESTAMP':timestamp,'OK-ACCESS-PASSPHRASE':this.passphrase}); if(this.simulatedTrading) headers['x-simulated-trading']='1';
    let response; try { const dispatcher=await this._ensureDispatcher(); response=await fetch(`${this.apiUrl}${path}`,{method,headers,...(body?{body}:{}),...(dispatcher?{dispatcher}:{}),signal:AbortSignal.timeout(15000)}); }
    catch(cause){const detail=connectionError(cause);const error=new Error(`OKX 网络请求失败（${detail.code}）：请检查本机直连或 OKX_PROXY 是否允许访问 www.okx.com。`);error.cause=cause;error.diagnosticCode=detail.code;error.statusUnknown=method!=='GET';throw error;}
    let payload;try{payload=await response.json();}catch{payload=null;} if(!response.ok||String(payload?.code??'0')!=='0'||payload?.data?.some?.((x)=>x?.sCode&&x.sCode!=='0')){const e=apiError(payload,response.status,response.headers);e.statusUnknown=method!=='GET'&&response.status>=500;throw e;} this.lastOkAt=Date.now();return payload?.data??payload;
  }
  async _loadMarkets(){const rows=await this._request('GET','/api/v5/public/instruments',{instType:'SWAP'});const list=(rows||[]).filter((x)=>x.state==='live'&&(x.ctType==='linear'||!x.ctType)&&(x.settleCcy==='USDT'||x.settleCcy==='USDC')).sort((a,b)=>a.instId.localeCompare(b.instId));this.markets.clear();this.symbolToId.clear();let id=1;for(const x of list){const contractValue=Math.max(Number(x.ctVal)||1,Number.EPSILON);const contractStepSize=Number(x.lotSz||x.minSz||1);const minContracts=Number(x.minSz||contractStepSize);const maxContracts=Number(x.maxLmtSz||0);const market={marketId:id,name:x.instId,displayName:x.instId.replace('-SWAP','').replace('-', '/'),symbol:x.ctValCcy||x.instId.split('-')[0],exchangeSymbol:x.instId,lastPrice:null,stepSize:okxBaseFromContracts(contractStepSize,contractValue),stepPrice:Number(x.tickSz||0.01),minOrderSize:okxBaseFromContracts(minContracts,contractValue),maxOrderSize:maxContracts>0?okxBaseFromContracts(maxContracts,contractValue):0,minNotional:0,maxLeverage:Number(x.lever||125),contractValue,contractValueCurrency:x.ctValCcy||'',contractStepSize,minContracts,maxContracts,settleCurrency:x.settleCcy||''};this.markets.set(id,market);this.symbolToId.set(x.instId,id);id++;}if(!this.markets.size)throw new Error('OKX 未返回可交易的永续合约。');}
  async getMarkets(){return [...this.markets.values()];} _market(id){const m=this.markets.get(Number(id));if(!m)throw new Error(`OKX 未知市场 ID: ${id}`);return m;}
  async getCandles(id,sec=3600,n=200){const m=this._market(id);const rows=await this._request('GET','/api/v5/market/candles',{instId:m.exchangeSymbol,bar:BARS[sec]||'1H',limit:String(Math.min(300,Math.max(20,Number(n)||200)))});return (rows||[]).map(r=>({time:Number(r[0]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5])})).reverse();}
  async getPrice(id){const m=this._market(id);this._watch.add(Number(id));const rows=await this._request('GET','/api/v5/market/ticker',{instId:m.exchangeSymbol});const p=Number(rows?.[0]?.last||rows?.[0]?.askPx||rows?.[0]?.bidPx);if(!(p>0))throw new Error(`OKX ${m.exchangeSymbol} 未返回有效价格。`);this._prices.set(Number(id),p);return p;}
  async preflightTrading(id,context={}){const m=this._market(id);await this._refreshAccount();const required=Number(context?.risk?.requiredMargin);const available=this._availableMarginByCurrency.get(m.settleCurrency)??this.availableMargin;if(Number.isFinite(required)&&Number.isFinite(available)&&required>available){throw new Error(`OKX 首单前保证金预检未通过：该网格约需 ${required} ${m.settleCurrency||'USDT'}（名义敞口 ${Number(context?.risk?.notional)||0}，${Number(context?.config?.leverage)||1}x），当前可用 ${available} ${m.settleCurrency||'USDT'}。请降低每格币数/网格数，或充值后再启动；尚未发送任何交易写请求。`);}return {availableMargin:available,settleCurrency:m.settleCurrency||null};}
  async setLeverage(id,leverage){const m=this._market(id);await this._request('POST','/api/v5/account/set-leverage',{instId:m.exchangeSymbol,lever:String(Math.max(1,Math.floor(Number(leverage)||1))),mgnMode:'cross'},true);return true;}
  _positionSide(order){
    if(this.positionMode==='net_mode')return null;
    if(this.positionMode!=='long_short_mode')throw new Error('OKX 持仓模式尚未初始化，已阻止下单。请先重连 OKX。');
    if(!['buy','sell'].includes(order.side))throw new Error(`OKX 不支持的订单方向: ${order.side}`);
    const closing=order.opening===false||order.reduceOnly===true;
    if(order.side==='buy')return closing?'short':'long';
    return closing?'long':'short';
  }
  _order(order,ordType='post_only'){
    const m=this._market(order.marketId);const contractValue=Math.max(Number(m.contractValue)||1,Number.EPSILON);const contractStep=Number(m.contractStepSize)||(Number(m.stepSize)/contractValue)||1;const minContracts=Number(m.minContracts)||(Number(m.minOrderSize)/contractValue)||contractStep;const contracts=okxContractsFromBase(order.sizeBase,contractValue,contractStep);const normalizedSizeBase=okxBaseFromContracts(contracts,contractValue);
    if(!(contracts>=minContracts))throw new Error(`OKX 下单数量 ${Number(order.sizeBase)} ${m.contractValueCurrency||'币'} 换算为 ${contracts} 张，低于最小 ${minContracts} 张（${okxBaseFromContracts(minContracts,contractValue)} ${m.contractValueCurrency||'币'}）。`);
    const posSide=this._positionSide(order);
    return {market:m,normalizedSizeBase,params:{
      instId:m.exchangeSymbol,tdMode:'cross',side:order.side,ordType,sz:String(contracts),
      ...(ordType==='market'?{}:{px:String(floorOkx(order.price,m.stepPrice))}),
      ...(posSide?{posSide}:{reduceOnly:!!order.reduceOnly}),
      clOrdId:`wl${String(order.clientOrderId||Date.now()).replace(/[^a-zA-Z0-9]/g,'').slice(-30)}`,
    }};
  }
  _recordPlaced(order,params,row={},normalizedSizeBase=Number(order.sizeBase)){
    if(row.sCode&&row.sCode!=='0')throw apiError({data:[row]},200,new Headers());
    const orderId=String(row.ordId||'').trim();
    if(!orderId){const error=new Error('OKX 下单回包缺少 ordId，订单状态未确认；已停止启动并要求撤单核对。');error.statusUnknown=true;throw error;}
    const tracked={orderId,marketId:Number(order.marketId),levelIndex:order.levelIndex,side:order.side,price:Number(params.px),sizeBase:Number(normalizedSizeBase),clientOrderId:params.clOrdId,opening:order.opening!==false,posSide:params.posSide||'net'};
    this._tracked.set(orderId,tracked);this._watch.add(Number(order.marketId));
    return {orderId,clientOrderId:String(order.clientOrderId??''),exchangeClientOrderId:params.clOrdId,price:tracked.price,sizeBase:tracked.sizeBase};
  }
  async placeLimitOrder(order){
    const {params,normalizedSizeBase}=this._order(order,order.postOnly===false?'limit':'post_only');
    const rows=await this._request('POST','/api/v5/trade/order',params,true);
    return this._recordPlaced(order,params,rows?.[0],normalizedSizeBase);
  }
  async placeLimitOrders(orders){
    // Validate and normalize the complete ladder before the first live write.
    const prepared=orders.map((order)=>({order,...this._order(order,order.postOnly===false?'limit':'post_only')}));
    const placed=[];
    for(let i=0;i<prepared.length;i+=20){
      const batch=prepared.slice(i,i+20);
      let rows;
      try{
        rows=await this._request('POST','/api/v5/trade/batch-orders',batch.map((item)=>item.params),true);
      }catch(error){
        for(let j=0;j<batch.length;j++){
          const row=error?.responseData?.[j];
          if(row&&String(row.sCode||'0')==='0'&&row.ordId){
            try{placed.push(this._recordPlaced(batch[j].order,batch[j].params,row,batch[j].normalizedSizeBase));}catch{}
          }
        }
        error.partialOrders=placed;throw error;
      }
      try{
        for(let j=0;j<batch.length;j++)placed.push(this._recordPlaced(batch[j].order,batch[j].params,rows?.[j],batch[j].normalizedSizeBase));
      }catch(error){error.partialOrders=placed;throw error;}
      if(i+20<prepared.length)await sleep(this.orderGapMs);
    }
    return {placed,failed:[]};
  }
  async cancelOrder(id,orderId){const m=this._market(id);await this._request('POST','/api/v5/trade/cancel-order',{instId:m.exchangeSymbol,ordId:String(orderId)},true);this._tracked.delete(String(orderId));return true;}
  async cancelAll(id){const m=this._market(id);const live=await this.fetchOpenOrders(id);for(let i=0;i<live.length;i+=20){await this._request('POST','/api/v5/trade/cancel-batch-orders',live.slice(i,i+20).map(o=>({instId:m.exchangeSymbol,ordId:o.orderId})),true);}for(const [oid,o] of this._tracked)if(o.marketId===Number(id))this._tracked.delete(oid);return true;}
  getOpenOrders(id){return [...this._tracked.values()].filter(o=>o.marketId===Number(id));}
  async fetchOpenOrders(id){const m=this._market(id);const rows=await this._request('GET','/api/v5/trade/orders-pending',{instType:'SWAP',instId:m.exchangeSymbol},true);return (rows||[]).map(x=>({orderId:String(x.ordId),price:Number(x.px),side:x.side,sizeBase:okxBaseFromContracts(x.sz,m.contractValue),posSide:x.posSide||'net',clientOrderId:x.clOrdId||''}));}
  adoptOrder(order){this._tracked.set(String(order.orderId),{...order,orderId:String(order.orderId),marketId:Number(order.marketId)});this._watch.add(Number(order.marketId));}
  getPosition(id){return this._positions.get(Number(id))||null;}
  async closePosition(id){
    const m=this._market(id);const base={instId:m.exchangeSymbol,mgnMode:'cross',autoCxl:true};
    if(this.positionMode==='net_mode'){await this._request('POST','/api/v5/trade/close-position',base,true);return true;}
    if(this.positionMode!=='long_short_mode')throw new Error('OKX 持仓模式尚未初始化，已阻止平仓。请先重连 OKX。');
    const rows=await this._request('GET','/api/v5/account/positions',{instType:'SWAP',instId:m.exchangeSymbol},true);
    const sides=[...new Set((rows||[]).filter((x)=>Number(x.pos||0)!==0&&['long','short'].includes(x.posSide)).map((x)=>x.posSide))];
    for(const posSide of sides)await this._request('POST','/api/v5/trade/close-position',{...base,posSide},true);
    return true;
  }
  start(){if(this._timer)return;this._timer=setInterval(()=>this._poll().catch(()=>{}),this.pollMs);this._timer.unref?.();} stop(){if(this._timer)clearInterval(this._timer);this._timer=null;}
  async _refreshAccount(){
    const balances=await this._request('GET','/api/v5/account/balance',{},true);const account=balances?.[0]||{};
    const details=account.details||[];this.equity=Number(account.totalEq||0);this.balance=details.reduce((sum,x)=>sum+Number(x.cashBal||0),0)||this.equity;this._availableMarginByCurrency.clear();
    for(const x of details){const currency=String(x.ccy||'').toUpperCase();const raw=x.availEq!==''&&x.availEq!=null?x.availEq:x.availBal;const value=Number(raw);if(currency&&Number.isFinite(value))this._availableMarginByCurrency.set(currency,value);}
    const stableAvailable=['USDT','USDC'].map((ccy)=>this._availableMarginByCurrency.get(ccy)).filter(Number.isFinite);this.availableMargin=stableAvailable.length?stableAvailable.reduce((sum,value)=>sum+value,0):(Number(account.adjEq||account.totalEq)||this.equity);
    const positions=await this._request('GET','/api/v5/account/positions',{instType:'SWAP'},true);this._positions.clear();
    for(const x of positions||[]){
      const id=this.symbolToId.get(x.instId);const m=this.markets.get(id);const contracts=Number(x.pos||0);const signedContracts=x.posSide==='short'?-Math.abs(contracts):x.posSide==='long'?Math.abs(contracts):contracts;const amount=okxBaseFromContracts(signedContracts,m?.contractValue);if(!id||!amount)continue;
      const previous=this._positions.get(id);const previousAbs=Math.abs(previous?.sizeBase||0);const currentAbs=Math.abs(amount);const totalAbs=previousAbs+currentAbs;
      this._positions.set(id,{sizeBase:(previous?.sizeBase||0)+amount,entryPrice:totalAbs?((Number(previous?.entryPrice||0)*previousAbs+Number(x.avgPx||0)*currentAbs)/totalAbs):0,unrealizedPnl:Number(previous?.unrealizedPnl||0)+Number(x.upl||0),leverage:Number(x.lever||0)||previous?.leverage||null,...extractLiquidationPrice(x)});
    }
  }
  async _poll(){if(this._busy)return;this._busy=true;try{for(const id of this._watch){const p=await this.getPrice(id);this.emit('price',{marketId:id,price:p});const live=new Set((await this.fetchOpenOrders(id)).map(o=>o.orderId));for(const [oid,o] of [...this._tracked])if(o.marketId===id&&!live.has(oid))this._tracked.delete(oid);}await this._refreshAccount();this.lastError=null;this.lastOkAt=Date.now();}catch(e){this.lastError=e?.message||String(e);this.emit('error',e);}finally{this._busy=false;}}
}
