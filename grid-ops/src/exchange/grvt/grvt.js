import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import { parseSignature } from 'viem';
import { createDispatcher, connectionError } from '../../proxy.js';
import { ExchangeWriteScheduler } from '../write-scheduler.js';
import { extractLiquidationPrice } from '../liquidation-price.js';
import { grvtUnits, normalizeGrvtOrder } from './order-precision.js';

const INTERVALS={60:'CI_1_M',300:'CI_5_M',900:'CI_15_M',1800:'CI_30_M',3600:'CI_1_H',7200:'CI_2_H',14400:'CI_4_H',86400:'CI_1_D'};
const ORDER_TYPES={GOOD_TILL_TIME:1,IMMEDIATE_OR_CANCEL:3,FILL_OR_KILL:4};
const CLIENT_REF_PREFIX = 'grvt-client:';
function clientId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const n = BigInt(text);
  return n > 0n && n <= 18446744073709551615n ? n.toString() : null;
}
function exchangeId(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return null;
  const text = String(value ?? '').trim();
  if (!/^(?:0x[0-9a-f]+|\d+)$/i.test(text) || BigInt(text) === 0n) return null;
  return text.toLowerCase();
}
function clientIdFromRef(value) {
  return String(value).startsWith(CLIENT_REF_PREFIX) ? clientId(String(value).slice(CLIENT_REF_PREFIX.length)) : null;
}
const TYPES={Order:[{name:'subAccountID',type:'uint64'},{name:'isMarket',type:'bool'},{name:'timeInForce',type:'uint8'},{name:'postOnly',type:'bool'},{name:'reduceOnly',type:'bool'},{name:'legs',type:'OrderLeg[]'},{name:'nonce',type:'uint32'},{name:'expiration',type:'int64'}],OrderLeg:[{name:'assetID',type:'uint256'},{name:'contractSize',type:'uint64'},{name:'limitPrice',type:'uint64'},{name:'isBuyingContract',type:'bool'}]};

export class GrvtExchange extends EventEmitter {
  constructor(opts={}){super();this.mode='live';this.network=opts.network||'mainnet';this.marketUrl=String(opts.marketUrl||opts.apiUrl||'https://market-data.grvt.io').replace(/\/$/,'');this.tradeUrl=String(opts.tradeUrl||'https://trades.grvt.io').replace(/\/$/,'');this.authUrl=String(opts.authUrl||'https://edge.grvt.io').replace(/\/$/,'');this.apiKey=opts.apiKey||'';this.privateKey=opts.privateKey||'';this.subaccount=String(opts.subaccount||'');this.proxy=opts.proxy||'';this.orderGapMs=Math.max(100,Number(opts.orderGapMs)||250);this.pollMs=Math.max(2000,Number(opts.pollMs)||4000);this.dispatcher=null;this.cookie='';this.accountId='';this.account=null;this.chainId=this.network==='testnet'?326:325;this._writeScheduler=new ExchangeWriteScheduler({label:'GRVT',minGapMs:this.orderGapMs,maxRetries:4,baseDelayMs:800,sleep:opts.sleep});this.markets=new Map();this.symbolToId=new Map();this._tracked=new Map();this._positions=new Map();this._prices=new Map();this._watch=new Set();this.balance=null;this.equity=null;this.realizedPnl=0;this.dataSource=null;this.lastOkAt=0;this.lastError=null;this._timer=null;this._busy=false;}
  async init(){if(!this.apiKey||!this.privateKey||!this.subaccount)throw new Error('GRVT live 缺少 API Key、EIP-712 交易私钥或 Sub Account ID。');this.account=privateKeyToAccount(this.privateKey.startsWith('0x')?this.privateKey:`0x${this.privateKey}`);await this._ensureDispatcher();await this._login();await this._loadMarkets();await this._refreshAccount();this.dataSource='real';this.start();return true;}
  async reconnect(){this.stop();this.cookie='';return this.init();}
  async _ensureDispatcher(){if(!this.proxy||this.proxy==='direct'||this.dispatcher)return this.dispatcher;this.dispatcher=await createDispatcher(this.proxy);return this.dispatcher;}
  async setProxy(v){const old=this.dispatcher;this.proxy=String(v||'');this.dispatcher=null;try{await old?.close?.();}catch{}return true;}
  async _raw(url,body,auth=false,extraHeaders={}){const headers={'content-type':'application/json',...extraHeaders};if(auth){if(!this.cookie)await this._login();headers.Cookie=this.cookie;headers['X-Grvt-Account-Id']=this.accountId;}let res;try{const dispatcher=await this._ensureDispatcher();res=await fetch(url,{method:'POST',headers,body:JSON.stringify(body||{}),...(dispatcher?{dispatcher}:{}),signal:AbortSignal.timeout(15000)});}catch(cause){const d=connectionError(cause);const e=new Error(`GRVT 网络请求失败（${d.code}）：请检查本机直连或 GRVT_PROXY 是否允许访问 GRVT 官方域名。`);e.cause=cause;e.diagnosticCode=d.code;throw e;}let payload;try{payload=await res.json();}catch{payload=null;}const apiError=payload?.error||(!res.ok||payload?.code?payload:null);if(!res.ok||apiError){if(auth&&(res.status===401||res.status===403)){this.cookie='';}let target='GRVT API';try{const parsed=new URL(url);target=`POST ${parsed.host}${parsed.pathname}`;}catch{}throw new Error(`GRVT 接口错误 ${res.status} [${target}]: ${apiError?.message||payload?.message||res.statusText}`);}this.lastOkAt=Date.now();return {payload,headers:res.headers};}
  async _login(){const {payload,headers}=await this._raw(`${this.authUrl}/auth/api_key/login`,{api_key:this.apiKey},false,{Cookie:'rm=true;'});const cookies=headers.getSetCookie?.()||[headers.get('set-cookie')].filter(Boolean);this.cookie=cookies.map(x=>String(x).split(';')[0]).join('; ');const authenticatedSubaccount=String(payload?.result?.sub_account_id||payload?.sub_account_id||'');this.accountId=headers.get('x-grvt-account-id')||payload?.result?.account_id||payload?.account_id||authenticatedSubaccount||'';if(!this.cookie||!this.accountId)throw new Error('GRVT API Key 登录成功但未返回 gravity 会话或账户 ID。');if(authenticatedSubaccount)this.subaccount=authenticatedSubaccount;}
  async _post(base,path,body,auth=false,write=false){const exec=async()=>{const {payload}=await this._raw(`${base}${path}`,body,auth);return payload?.result??payload?.results??payload;};return write?this._writeScheduler.run(exec,{operation:path}):exec();}
  async _loadMarkets(){const rows=await this._post(this.marketUrl,'/full/v1/all_instruments',{is_active:true,kinds:['PERPETUAL']});this.markets.clear();this.symbolToId.clear();let id=1;for(const x of (Array.isArray(rows)?rows:[]).sort((a,b)=>a.instrument.localeCompare(b.instrument))){const market={marketId:id,name:x.instrument,displayName:x.instrument.replace('_Perp','').replaceAll('_','/'),symbol:x.base,exchangeSymbol:x.instrument,instrumentHash:x.instrument_hash,baseDecimals:Number(x.base_decimals),quoteDecimals:Number(x.quote_decimals),lastPrice:null,sizeStep:x.min_size,stepSize:Number(x.min_size),tickSize:x.tick_size,stepPrice:Number(x.tick_size),minOrderSize:Number(x.min_size||0),maxOrderSize:Number(x.max_position_size||0),minNotional:Number(x.min_notional||0),maxLeverage:50};this.markets.set(id,market);this.symbolToId.set(x.instrument,id);id++;}if(!this.markets.size)throw new Error('GRVT 未返回可交易的永续合约。');}
  async getMarkets(){return [...this.markets.values()];} _market(id){const m=this.markets.get(Number(id));if(!m)throw new Error(`GRVT 未知市场 ID: ${id}`);return m;}
  async getCandles(id,sec=3600,n=200){const m=this._market(id);const rows=await this._post(this.marketUrl,'/full/v1/kline',{instrument:m.exchangeSymbol,interval:INTERVALS[sec]||'CI_1_H',type:'TRADE',limit:Math.min(1000,Math.max(20,Number(n)||200))});return (Array.isArray(rows)?rows:[]).map(x=>({time:Number(BigInt(x.open_time)/1000000n),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume_b)})).reverse();}
  async getPrice(id){const m=this._market(id);this._watch.add(Number(id));const row=await this._post(this.marketUrl,'/full/v1/ticker',{instrument:m.exchangeSymbol});const p=Number(row?.mark_price||row?.mid_price||row?.last_price);if(!(p>0))throw new Error(`GRVT ${m.exchangeSymbol} 未返回有效价格。`);this._prices.set(Number(id),p);return p;}
  async preflightTrading(){await this._post(this.tradeUrl,'/full/v1/account_summary',{sub_account_id:this.subaccount},true);return true;}
  async setLeverage(id,leverage){const m=this._market(id);await this._post(this.tradeUrl,'/full/v1/set_initial_leverage',{sub_account_id:this.subaccount,instrument:m.exchangeSymbol,leverage:String(Math.max(1,Number(leverage)||1))},true,true);return true;}
  _nonce(){return randomBytes(4).readUInt32BE(0);} _clientId(){return (2n**63n+BigInt(Date.now())*100000n+BigInt(randomBytes(2).readUInt16BE(0))).toString();}
  async _signedOrder(order, isMarket = false) {
    const m = this._market(order.marketId);
    const normalized = normalizeGrvtOrder(order, m, isMarket);
    const coid = clientId(order.clientOrderId ?? this._clientId());
    if (!coid) throw new Error('GRVT client_order_id 必须为非零 uint64 整数字符串。');
    const nonce = this._nonce();
    const expiration = (BigInt(Date.now() + 30 * 60 * 1000) * 1000000n).toString();
    const tif = isMarket ? 'IMMEDIATE_OR_CANCEL' : 'GOOD_TILL_TIME';
    const leg = { assetID: BigInt(m.instrumentHash), contractSize: grvtUnits(normalized.sizeBase, m.baseDecimals), limitPrice: grvtUnits(normalized.price, 9), isBuyingContract: order.side === 'buy' };
    const message = { subAccountID: BigInt(this.subaccount), isMarket, timeInForce: ORDER_TYPES[tif], postOnly: !isMarket && order.postOnly !== false, reduceOnly: !!order.reduceOnly, legs: [leg], nonce, expiration: BigInt(expiration) };
    const signature = parseSignature(await this.account.signTypedData({ domain: { name: 'GRVT Exchange', version: '0', chainId: this.chainId }, types: TYPES, primaryType: 'Order', message }));
    return {
      sub_account_id: this.subaccount, is_market: isMarket, time_in_force: tif, post_only: message.postOnly, reduce_only: message.reduceOnly,
      legs: [{ instrument: m.exchangeSymbol, size: normalized.sizeBase, limit_price: normalized.price, is_buying_asset: order.side === 'buy' }],
      signature: { signer: this.account.address, r: signature.r, s: signature.s, v: Number(signature.yParity ?? 0) + 27, expiration, nonce },
      metadata: { client_order_id: coid },
    };
  }
  _assertClientIdAvailable(coid) {
    if (this._pendingClientIds?.has(coid) || [...this._tracked.values()].some(o => (o.clientOrderId || clientIdFromRef(o.orderId)) === coid)) {
      throw new Error('GRVT client_order_id 重复，已阻止重复发送订单。');
    }
  }
  async placeLimitOrder(order) {
    const coid = clientId(order.clientOrderId ?? this._clientId());
    if (!coid) throw new Error('GRVT client_order_id 必须为非零 uint64 整数字符串。');
    this._assertClientIdAvailable(coid);
    this._pendingClientIds ??= new Set();
    this._pendingClientIds.add(coid);
    try {
      const payload = await this._signedOrder({ ...order, clientOrderId: coid }, false);
      const response = await this._post(this.tradeUrl, '/full/v1/create_order', { order: payload }, true, true);
      const row = response?.order ?? response;
      if (row?.state?.status === 'REJECTED') throw new Error(`GRVT 订单被拒绝：${row.state.reject_reason || 'REJECTED'}`);
      const realId = exchangeId(row?.order_id);
      const echoedClientId = clientId(row?.metadata?.client_order_id);
      if ((row?.metadata?.client_order_id != null && echoedClientId !== coid) || (!realId && echoedClientId !== coid)) {
        const error = new Error('GRVT 下单回包缺少匹配的订单标识，结果未确认；请先核对交易所挂单，禁止盲目重试。');
        error.statusUnknown = true;
        throw error;
      }
      // create_order normally returns order_id="0x00". Never use that shared
      // placeholder as a Map key. Persist the client reference so cancel and
      // restart recovery still work before a real exchange ID is available.
      const orderId = CLIENT_REF_PREFIX + coid;
      const confirmed = { orderId, clientOrderId: coid, exchangeOrderId: realId, price: Number(payload.legs[0].limit_price), sizeBase: Number(payload.legs[0].size) };
      this._tracked.set(orderId, { ...confirmed, marketId: Number(order.marketId), side: order.side, levelIndex: order.levelIndex, placedAt: Date.now() });
      this._watch.add(Number(order.marketId));
      return confirmed;
    } finally {
      this._pendingClientIds.delete(coid);
    }
  }
  async placeLimitOrders(orders) {
    // Validate the whole seed ladder before the first write. The scheduler in
    // _post serializes/rate-limits writes; do not add a second sleep here.
    const ids = new Set();
    const prepared = orders.map(order => {
      normalizeGrvtOrder(order, this._market(order.marketId));
      const coid = clientId(order.clientOrderId ?? this._clientId());
      if (!coid) throw new Error('GRVT client_order_id 必须为非零 uint64 整数字符串。');
      if (ids.has(coid)) throw new Error('GRVT 批量订单 client_order_id 重复，已阻止发送。');
      this._assertClientIdAvailable(coid);
      ids.add(coid);
      return { ...order, clientOrderId: coid };
    });
    const placed = [];
    try {
      for (const order of prepared) placed.push(await this.placeLimitOrder(order));
    } catch (error) {
      error.partialOrders = placed;
      throw error;
    }
    return { placed, failed: [] };
  }
  async cancelOrder(id, orderId) {
    this._market(id);
    const ref = String(orderId);
    const tracked = this._tracked.get(ref);
    if (tracked && tracked.marketId !== Number(id)) throw new Error('GRVT 订单标识不属于当前市场。');
    const coid = clientIdFromRef(ref) || clientId(tracked?.clientOrderId);
    const realId = exchangeId(tracked?.exchangeOrderId) || exchangeId(ref);
    if (!coid && !realId) throw new Error('GRVT 缺少有效订单标识，不能使用 0x00 占位编号撤单。');
    await this._post(this.tradeUrl, '/full/v1/cancel_order', {
      sub_account_id: this.subaccount, ...(coid ? { client_order_id: coid } : { order_id: realId }),
    }, true, true);
    this._tracked.delete(ref);
    return true;
  }
  async cancelAll(id){const m=this._market(id);await this._post(this.tradeUrl,'/full/v1/cancel_all_orders',{sub_account_id:this.subaccount,kind:['PERPETUAL'],base:[m.symbol],quote:['USDT','USDC']},true,true);for(const [oid,o] of this._tracked)if(o.marketId===Number(id))this._tracked.delete(oid);return true;}
  getOpenOrders(id){return [...this._tracked.values()].filter(o=>o.marketId===Number(id));}
  async fetchOpenOrders(id) {
    const m = this._market(id);
    const rows = await this._post(this.tradeUrl, '/full/v1/open_orders', { sub_account_id: this.subaccount, kind: ['PERPETUAL'], base: [m.symbol] }, true);
    if (!Array.isArray(rows)) throw new Error('GRVT 挂单快照格式异常，已保留本地订单记录。');
    const seen = new Set();
    const result = [];
    for (const row of rows) {
      if (!Array.isArray(row?.legs) || !row.legs.length) throw new Error('GRVT 挂单快照缺少合约信息。');
      const leg = row.legs.find(x => x.instrument === m.exchangeSymbol);
      if (!leg) continue;
      const coid = clientId(row.metadata?.client_order_id);
      const realId = exchangeId(row.order_id);
      if (!coid && !realId) throw new Error('GRVT 挂单快照缺少有效订单标识。');
      const tracked = [...this._tracked.values()].find(o => o.marketId === Number(id) && (
        (coid && (o.clientOrderId || clientIdFromRef(o.orderId)) === coid)
        || (realId && (o.exchangeOrderId === realId || exchangeId(o.orderId) === realId))
      ));
      // Keep the original local key even after GRVT assigns its real ID. Old
      // snapshots keyed by a real exchange ID also keep their original key.
      const orderId = tracked?.orderId || (coid ? CLIENT_REF_PREFIX + coid : realId);
      if (seen.has(orderId)) throw new Error('GRVT 挂单快照包含重复订单标识。');
      seen.add(orderId);
      if (tracked) {
        if (coid) tracked.clientOrderId = coid;
        if (realId) tracked.exchangeOrderId = realId;
      }
      result.push({ orderId, clientOrderId: coid, exchangeOrderId: realId, price: Number(leg.limit_price), side: leg.is_buying_asset ? 'buy' : 'sell', sizeBase: Number(leg.size) });
    }
    return result;
  }
  adoptOrder(o) {
    const orderId = String(o.orderId);
    const previous = this._tracked.get(orderId);
    const coid = clientIdFromRef(orderId) || clientId(o.clientOrderId) || previous?.clientOrderId;
    const realId = exchangeId(o.exchangeOrderId) || exchangeId(orderId) || previous?.exchangeOrderId;
    if (!coid && !realId) throw new Error('GRVT 无法恢复没有有效订单标识的挂单。');
    this._tracked.set(orderId, { ...previous, ...o, orderId, clientOrderId: coid, exchangeOrderId: realId, marketId: Number(o.marketId), placedAt: o.placedAt ?? Date.now() });
    this._watch.add(Number(o.marketId));
  }
  getPosition(id){return this._positions.get(Number(id))||null;}
  async closePosition(id){await this._refreshAccount();const p=this._positions.get(Number(id));if(!p?.sizeBase)return true;const payload=await this._signedOrder({marketId:Number(id),side:p.sizeBase>0?'sell':'buy',sizeBase:Math.abs(p.sizeBase),reduceOnly:true},true);await this._post(this.tradeUrl,'/full/v1/create_order',{order:payload},true,true);return true;}
  async _refreshAccount(){const summary=await this._post(this.tradeUrl,'/full/v1/account_summary',{sub_account_id:this.subaccount},true);this.equity=Number(summary?.total_equity||0);this.balance=Number(summary?.available_balance||this.equity);this._positions.clear();for(const x of summary?.positions||[]){const id=this.symbolToId.get(x.instrument),size=Number(x.size||0);if(!id||!size)continue;this._positions.set(id,{sizeBase:size,entryPrice:Number(x.entry_price||0),unrealizedPnl:Number(x.unrealized_pnl||0),leverage:Number(x.leverage||0)||null,...extractLiquidationPrice(x)});}}
  start(){if(this._timer)return;this._timer=setInterval(()=>this._poll().catch(()=>{}),this.pollMs);this._timer.unref?.();}stop(){if(this._timer)clearInterval(this._timer);this._timer=null;}
  async _poll(){if(this._busy)return;this._busy=true;try{for(const id of this._watch){const p=await this.getPrice(id);this.emit('price',{marketId:id,price:p});const live=new Set((await this.fetchOpenOrders(id)).map(x=>x.orderId));for(const [oid,o] of [...this._tracked])if(o.marketId===id&&!live.has(oid))this._tracked.delete(oid);}await this._refreshAccount();this.lastError=null;this.lastOkAt=Date.now();}catch(e){this.lastError=e?.message||String(e);this.emit('error',e);}finally{this._busy=false;}}
}
