import { BinancePaperExchange } from '../binance/paper.js';
import { GrvtExchange } from './grvt.js';

const FALLBACK_MARKETS = [
  { marketId: 1, name: 'BTC_USDT_Perp', displayName: 'BTC/USDT', symbol: 'BTC', exchangeSymbol: 'BTC_USDT_Perp', instrumentHash: '1', baseDecimals: 3, lastPrice: 74000, stepSize: 0.001, stepPrice: 0.1, minOrderSize: 0.001, minNotional: 5, maxLeverage: 50 },
  { marketId: 2, name: 'ETH_USDT_Perp', displayName: 'ETH/USDT', symbol: 'ETH', exchangeSymbol: 'ETH_USDT_Perp', instrumentHash: '2', baseDecimals: 3, lastPrice: 2600, stepSize: 0.001, stepPrice: 0.01, minOrderSize: 0.001, minNotional: 5, maxLeverage: 50 },
];

export class GrvtPaperExchange extends BinancePaperExchange {
  constructor(opts={}){super(opts);this.mode='paper';this._grvt=new GrvtExchange(opts);this.apiUrl=this._grvt.marketUrl;}
  async init(){
    try { await this._loadMarkets(); this.dataSource='real'; await this._pollPrices(); }
    catch(error){
      this.dataSource='synthetic'; this.markets.clear(); this.symbolToId.clear(); this._prices.clear();
      for(const market of FALLBACK_MARKETS){this.markets.set(market.marketId,{...market});this.symbolToId.set(market.exchangeSymbol,market.marketId);this._prices.set(market.marketId,market.lastPrice);}
      this.lastError=error?.message||String(error);
    }
    this.lastOkAt=Date.now(); this.start(); return true;
  }
  async setProxy(proxy){await super.setProxy(proxy);await this._grvt.setProxy(proxy);return true;}
  async _syncTime(){return true;} async _loadMarkets(){await this._grvt._loadMarkets();this.markets=this._grvt.markets;this.symbolToId=this._grvt.symbolToId;}
  async _pollPrices(){for(const id of this._watch.size?this._watch:this.markets.keys()){try{this._prices.set(Number(id),await this._grvt.getPrice(id));}catch{}}}
  async getCandles(id,sec,n){return this._grvt.getCandles(id,sec,n);} async getPrice(id){this._watch.add(Number(id));if(!this._prices.has(Number(id)))this._prices.set(Number(id),await this._grvt.getPrice(id));return this._prices.get(Number(id));}
}
