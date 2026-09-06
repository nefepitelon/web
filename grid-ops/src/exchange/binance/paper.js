import { BinanceExchange, floorToStep } from './binance.js';

const FALLBACK_MARKETS = [
  { marketId: 1, name: 'BTCUSDT', displayName: 'BTC/USDT', symbol: 'BTC', exchangeSymbol: 'BTCUSDT', lastPrice: 74000, stepSize: 0.001, stepPrice: 0.1, minOrderSize: 0.001, minNotional: 5, maxLeverage: 125 },
  { marketId: 2, name: 'ETHUSDT', displayName: 'ETH/USDT', symbol: 'ETH', exchangeSymbol: 'ETHUSDT', lastPrice: 2600, stepSize: 0.001, stepPrice: 0.01, minOrderSize: 0.001, minNotional: 5, maxLeverage: 125 },
];

export class BinancePaperExchange extends BinanceExchange {
  constructor(opts = {}) {
    super(opts);
    this.mode = 'paper';
    this.balance = Number(opts.startBalance) || 10000;
    this.equity = this.balance;
    this.realizedPnl = 0;
    this._seq = 1;
  }

  async init() {
    try {
      await this._syncTime();
      await this._loadMarkets();
      this.dataSource = 'real';
      await this._pollPrices();
    } catch (error) {
      this.dataSource = 'synthetic';
      this.markets.clear();
      this.symbolToId.clear();
      for (const market of FALLBACK_MARKETS) {
        this.markets.set(market.marketId, { ...market });
        this.symbolToId.set(market.exchangeSymbol, market.marketId);
        this._prices.set(market.marketId, market.lastPrice);
      }
      this.lastError = error?.message || String(error);
    }
    this.lastOkAt = Date.now();
    this.start();
    return true;
  }

  async reconnect() {
    this.stop();
    return this.init();
  }

  async preflightTrading() { return true; }
  async setLeverage() { return true; }

  async getPrice(marketId) {
    const id = Number(marketId);
    this._market(id);
    this._watch.add(id);
    if (!this._prices.has(id) && this.dataSource === 'real') await this._pollPrices();
    return this._prices.get(id) ?? this.markets.get(id)?.lastPrice;
  }

  async placeLimitOrder(order) {
    const market = this._market(order.marketId);
    const quantity = floorToStep(order.sizeBase, market.stepSize);
    const price = floorToStep(order.price, market.stepPrice);
    if (!(quantity >= market.minOrderSize)) throw new Error(`Binance 模拟单数量小于最小数量 ${market.minOrderSize}。`);
    if (price * quantity < market.minNotional) throw new Error(`Binance 模拟单名义价值低于最小值 ${market.minNotional} USDT。`);
    const orderId = `bn-paper-${this._seq++}`;
    const tracked = {
      orderId, marketId: Number(order.marketId), levelIndex: order.levelIndex,
      side: order.side, price, sizeBase: quantity, reduceOnly: !!order.reduceOnly,
      clientOrderId: order.clientOrderId,
    };
    this._watch.add(tracked.marketId);
    this._tracked.set(orderId, tracked);
    return { orderId };
  }

  async cancelOrder(_marketId, orderId) { this._tracked.delete(String(orderId)); return true; }

  async cancelAll(marketId) {
    const id = Number(marketId);
    for (const [orderId, order] of this._tracked) if (order.marketId === id) this._tracked.delete(orderId);
    return true;
  }

  async fetchOpenOrders(marketId) {
    return this.getOpenOrders(marketId).map((order) => ({ orderId: order.orderId, price: order.price, side: order.side }));
  }

  async closePosition(marketId) {
    const id = Number(marketId);
    const position = this._positions.get(id);
    if (!position?.sizeBase) return true;
    const price = this._prices.get(id) || position.entryPrice;
    this._applyFill(id, position.sizeBase > 0 ? 'sell' : 'buy', price, Math.abs(position.sizeBase));
    return true;
  }

  async _pollPrices() {
    const result = await this._request('GET', '/fapi/v1/premiumIndex');
    const rows = Array.isArray(result) ? result : [result];
    for (const row of rows) {
      const marketId = this.symbolToId.get(row.symbol);
      const price = Number(row.markPrice || row.indexPrice);
      if (marketId && price > 0) this._prices.set(marketId, price);
    }
  }

  async _poll() {
    if (this._busy) return;
    this._busy = true;
    try {
      const previous = new Map(this._prices);
      if (this.dataSource === 'real') await this._pollPrices();
      else {
        for (const [marketId, price] of this._prices) {
          const seed = this.markets.get(marketId)?.lastPrice || price;
          const drift = (seed - price) / seed * 0.02;
          this._prices.set(marketId, Math.max(0.0001, price * (1 + drift + (Math.random() * 2 - 1) * 0.0015)));
        }
      }
      for (const marketId of this._watch) {
        const price = this._prices.get(marketId);
        if (!(price > 0)) continue;
        this.emit('price', { marketId, price });
        this._match(marketId, previous.get(marketId) ?? price, price);
      }
      this._refreshEquity();
      this.lastOkAt = Date.now();
      this.lastError = null;
    } catch (error) {
      this.lastError = error?.message || String(error);
      // Keep the simulator alive even if the public market endpoint is temporarily unavailable.
      for (const marketId of this._watch) {
        const price = this._prices.get(marketId);
        if (price > 0) this.emit('price', { marketId, price });
      }
    } finally {
      this._busy = false;
    }
  }

  _match(marketId, previous, current) {
    for (const order of [...this._tracked.values()]) {
      if (order.marketId !== marketId) continue;
      const crossed = order.side === 'buy'
        ? (current <= order.price || (previous > order.price && current <= order.price))
        : (current >= order.price || (previous < order.price && current >= order.price));
      if (!crossed) continue;
      if (order.reduceOnly && !this._reduces(marketId, order.side)) {
        this._tracked.delete(order.orderId);
        continue;
      }
      this._tracked.delete(order.orderId);
      this._applyFill(marketId, order.side, order.price, order.sizeBase);
      this.emit('fill', {
        orderId: order.orderId, marketId, side: order.side, price: order.price,
        sizeBase: order.sizeBase, levelIndex: order.levelIndex, clientOrderId: order.clientOrderId,
      });
    }
  }

  _reduces(marketId, side) {
    const position = this._positions.get(marketId);
    return !!position?.sizeBase && (side === 'sell' ? position.sizeBase > 0 : position.sizeBase < 0);
  }

  _applyFill(marketId, side, price, quantity) {
    const fee = price * quantity * this.feeRate;
    this.balance -= fee;
    this.realizedPnl -= fee;
    const position = this._positions.get(marketId) || { sizeBase: 0, entryPrice: 0, unrealizedPnl: 0 };
    const signed = side === 'buy' ? quantity : -quantity;
    if (!position.sizeBase || Math.sign(position.sizeBase) === Math.sign(signed)) {
      const nextSize = position.sizeBase + signed;
      position.entryPrice = (Math.abs(position.sizeBase) * position.entryPrice + Math.abs(signed) * price) / Math.abs(nextSize);
      position.sizeBase = nextSize;
    } else {
      const closeQuantity = Math.min(Math.abs(position.sizeBase), Math.abs(signed));
      const pnl = position.sizeBase > 0
        ? closeQuantity * (price - position.entryPrice)
        : closeQuantity * (position.entryPrice - price);
      this.balance += pnl;
      this.realizedPnl += pnl;
      const remaining = position.sizeBase + signed;
      if (!remaining) { position.sizeBase = 0; position.entryPrice = 0; }
      else if (Math.sign(remaining) === Math.sign(position.sizeBase)) position.sizeBase = remaining;
      else { position.sizeBase = remaining; position.entryPrice = price; }
    }
    if (position.sizeBase) this._positions.set(marketId, position);
    else this._positions.delete(marketId);
    this._refreshEquity();
  }

  _refreshEquity() {
    let unrealized = 0;
    for (const [marketId, position] of this._positions) {
      const mark = this._prices.get(marketId) || position.entryPrice;
      position.unrealizedPnl = position.sizeBase * (mark - position.entryPrice);
      unrealized += position.unrealizedPnl;
    }
    this.equity = this.balance + unrealized;
  }
}

