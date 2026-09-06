import { BinancePaperExchange } from '../binance/paper.js';
import { OkxExchange, floorOkx } from './okx.js';

const FALLBACK_MARKETS = [
  { marketId: 1, name: 'BTC-USDT-SWAP', displayName: 'BTC/USDT', symbol: 'BTC', exchangeSymbol: 'BTC-USDT-SWAP', lastPrice: 74000, stepSize: 0.001, stepPrice: 0.1, minOrderSize: 0.001, minNotional: 5, maxLeverage: 125 },
  { marketId: 2, name: 'ETH-USDT-SWAP', displayName: 'ETH/USDT', symbol: 'ETH', exchangeSymbol: 'ETH-USDT-SWAP', lastPrice: 2600, stepSize: 0.001, stepPrice: 0.01, minOrderSize: 0.001, minNotional: 5, maxLeverage: 125 },
];

export class OkxPaperExchange extends BinancePaperExchange {
  constructor(opts={}){super(opts);this.mode='paper';this.apiUrl=String(opts.apiUrl||'https://www.okx.com').replace(/\/$/,'');this._okx=new OkxExchange(opts);}
  async init(){
    try { await this._loadMarkets(); this.dataSource='real'; await this._pollPrices(); }
    catch(error){
      this.dataSource='synthetic'; this.markets.clear(); this.symbolToId.clear(); this._prices.clear();
      for(const market of FALLBACK_MARKETS){this.markets.set(market.marketId,{...market});this.symbolToId.set(market.exchangeSymbol,market.marketId);this._prices.set(market.marketId,market.lastPrice);}
      this.lastError=error?.message||String(error);
    }
    this.lastOkAt=Date.now(); this.start(); return true;
  }
  async _loadMarkets(){await this._okx._loadMarkets();this.markets=this._okx.markets;this.symbolToId=this._okx.symbolToId;}
  async setProxy(proxy){await super.setProxy(proxy);await this._okx.setProxy(proxy);return true;}
  async _syncTime(){return true;}
  async _request(method,path,params){return this._okx._request(method,path,params,false);}
  async _pollPrices(){for(const id of this._watch.size?this._watch:this.markets.keys()){try{this._prices.set(Number(id),await this._okx.getPrice(id));}catch{}}}
  async getCandles(id,sec,n){return this._okx.getCandles(id,sec,n);}
  async getPrice(id){this._watch.add(Number(id));if(!this._prices.has(Number(id)))this._prices.set(Number(id),await this._okx.getPrice(id));return this._prices.get(Number(id));}
  async placeLimitOrder(order){const m=this._market(order.marketId);const normalized={...order,sizeBase:floorOkx(order.sizeBase,m.stepSize),price:floorOkx(order.price,m.stepPrice)};return super.placeLimitOrder(normalized);}
}
