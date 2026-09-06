import { OndoPerpsExchange, floorToStep } from './ondo.js';

const FALLBACK_MARKETS = [
  { marketId: 1, name: 'BTC-USD.P', displayName: 'BTC/USD', longName: 'Bitcoin', symbol: 'BTC', exchangeSymbol: 'BTC-USD.P', lastPrice: 65000, stepSize: 0.0001, stepPrice: 1, minOrderSize: 0.0001, maxLeverage: 20, makerFee: 0.00015 },
  { marketId: 2, name: 'AAPL-USD.P', displayName: 'AAPL/USD', longName: 'Apple', symbol: 'AAPL', exchangeSymbol: 'AAPL-USD.P', lastPrice: 220, stepSize: 0.01, stepPrice: 0.01, minOrderSize: 0.01, maxLeverage: 20, makerFee: 0.00015 },
  { marketId: 3, name: 'QQQ-USD.P', displayName: 'QQQ/USD', longName: 'Invesco QQQ', symbol: 'QQQ', exchangeSymbol: 'QQQ-USD.P', lastPrice: 580, stepSize: 0.01, stepPrice: 0.01, minOrderSize: 0.01, maxLeverage: 20, makerFee: 0.00015 },
  { marketId: 4, name: 'XAU-USD.P', displayName: 'XAU/USD', longName: 'Gold', symbol: 'XAU', exchangeSymbol: 'XAU-USD.P', lastPrice: 3300, stepSize: 0.001, stepPrice: 0.1, minOrderSize: 0.001, maxLeverage: 20, makerFee: 0.00015 },
];

export class OndoPerpsPaperExchange extends OndoPerpsExchange {
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
      await this._request('GET', '/status');
      await this._loadMarkets();
      await this._pollPrices();
      this.dataSource = 'real';
    } catch (error) {
      this.dataSource = 'synthetic';
      this.markets.clear();
      this.marketToId.clear();
      for (const market of FALLBACK_MARKETS) {
        this.markets.set(market.marketId, { ...market });
        this.marketToId.set(market.exchangeSymbol, market.marketId);
        this._prices.set(market.marketId, market.lastPrice);
      }
      this.lastError = error?.message || String(error);
    }
    this.lastOkAt = Date.now();
    this.start();
    return true;
  }

  async reconnect() { this.stop(); return this.init(); }
  async preflightTrading() { return true; }
  async setLeverage() { return true; }

  async getPrice(marketId) {
    const id = Number(marketId);
    this._market(id);
    this._watch.add(id);
    if (!this._prices.has(id) && this.dataSource === 'real') await this._pollPrices();
    return this._prices.get(id) ?? this.markets.get(id)?.lastPrice;
  }

  async getCandles(marketId, intervalSec = 3600, n = 200) {
    const price = await this.getPrice(marketId);
    const count = Math.min(300, Math.max(20, Number(n) || 200));
    const now = Date.now();
    return Array.from({ length: count }, (_, index) => {
      const age = count - index;
      const wave = Math.sin((index + Number(marketId)) / 9) * 0.006;
      const close = price * (1 + wave - age * 0.00001);
      const open = close * (1 + Math.sin(index / 5) * 0.001);
      return { time: now - age * intervalSec * 1000, open, high: Math.max(open, close) * 1.0015, low: Math.min(open, close) * 0.9985, close, volume: 0 };
    });
  }

  async placeLimitOrder(order) {
    const market = this._market(order.marketId);
    const size = floorToStep(order.sizeBase, market.stepSize);
    const price = floorToStep(order.price, market.stepPrice);
    if (!(size >= market.minOrderSize)) throw new Error(`Ondo Perps 模拟单数量小于最小精度 ${market.minOrderSize}。`);
    const orderId = `op-paper-${this._seq++}`;
    this._watch.add(Number(order.marketId));
    this._tracked.set(orderId, {
      orderId, marketId: Number(order.marketId), levelIndex: order.levelIndex,
      side: order.side, price, sizeBase: size, reduceOnly: Boolean(order.reduceOnly), clientOrderId: order.clientOrderId,
    });
    return { orderId };
  }

  async cancelOrder(_marketId, orderId) { this._tracked.delete(String(orderId)); return true; }
  async cancelAll(marketId) {
    for (const [orderId, order] of this._tracked) if (order.marketId === Number(marketId)) this._tracked.delete(orderId);
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

  async _poll() {
    if (this._busy) return;
    this._busy = true;
    try {
      const previous = new Map(this._prices);
      if (this.dataSource === 'real') await this._pollPrices();
      else for (const [marketId, price] of this._prices) {
        const seed = this.markets.get(marketId)?.lastPrice || price;
        const drift = (seed - price) / seed * 0.02;
        this._prices.set(marketId, Math.max(0.0001, price * (1 + drift + (Math.random() * 2 - 1) * 0.0015)));
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
    } finally { this._busy = false; }
  }

  _match(marketId, previous, current) {
    for (const order of [...this._tracked.values()]) {
      if (order.marketId !== marketId) continue;
      const crossed = order.side === 'buy'
        ? current <= order.price || (previous > order.price && current <= order.price)
        : current >= order.price || (previous < order.price && current >= order.price);
      if (!crossed) continue;
      if (order.reduceOnly && !this._reduces(marketId, order.side)) { this._tracked.delete(order.orderId); continue; }
      this._tracked.delete(order.orderId);
      this._applyFill(marketId, order.side, order.price, order.sizeBase);
      this.emit('fill', { ...order, marketId, sizeBase: order.sizeBase });
    }
  }

  _reduces(marketId, side) {
    const position = this._positions.get(marketId);
    return Boolean(position?.sizeBase && (side === 'sell' ? position.sizeBase > 0 : position.sizeBase < 0));
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
      const pnl = position.sizeBase > 0 ? closeQuantity * (price - position.entryPrice) : closeQuantity * (position.entryPrice - price);
      this.balance += pnl;
      this.realizedPnl += pnl;
      const remaining = position.sizeBase + signed;
      if (!remaining) { position.sizeBase = 0; position.entryPrice = 0; }
      else if (Math.sign(remaining) === Math.sign(position.sizeBase)) position.sizeBase = remaining;
      else { position.sizeBase = remaining; position.entryPrice = price; }
    }
    if (position.sizeBase) this._positions.set(marketId, position); else this._positions.delete(marketId);
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
