import { NadoExchange, floorNadoStep } from './nado.js';

const FALLBACK_MARKETS = [
  { marketId: 2, name: 'BTC-PERP', displayName: 'BTC/USD', longName: 'Bitcoin', symbol: 'BTC', exchangeSymbol: 'BTC-PERP', lastPrice: 65000, stepSize: 0.00005, stepPrice: 1, minOrderSize: 0.00005, minNotional: 100, maxOrderSize: 1000, maxLeverage: 20, defaultLeverage: 3, makerFee: 0.0001 },
  { marketId: 4, name: 'ETH-PERP', displayName: 'ETH/USD', longName: 'Ethereum', symbol: 'ETH', exchangeSymbol: 'ETH-PERP', lastPrice: 3500, stepSize: 0.001, stepPrice: 0.1, minOrderSize: 0.001, minNotional: 100, maxOrderSize: 10000, maxLeverage: 20, defaultLeverage: 3, makerFee: 0.0001 },
  { marketId: 8, name: 'SOL-PERP', displayName: 'SOL/USD', longName: 'Solana', symbol: 'SOL', exchangeSymbol: 'SOL-PERP', lastPrice: 150, stepSize: 0.1, stepPrice: 0.01, minOrderSize: 0.1, minNotional: 100, maxOrderSize: 100000, maxLeverage: 20, defaultLeverage: 3, makerFee: 0.0001 },
];

export class NadoPaperExchange extends NadoExchange {
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
      this._ensureClient({ requireSigner: false });
      await this._loadMarkets();
      await this._pollPrices();
      this.dataSource = 'real';
    } catch (error) {
      this.dataSource = 'synthetic';
      this.markets.clear();
      this.marketToId.clear();
      this._prices.clear();
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
    // PAPER orders are simulated, but the selected market still uses Nado's
    // real BBO. Fetch it immediately so a newly selected non-BTC product does
    // not inherit the oracle snapshot loaded at startup until the next poll.
    if (this.dataSource === 'real') return super.getPrice(id);
    const price = this._prices.get(id) || this.markets.get(id)?.lastPrice;
    if (!(price > 0)) throw new Error(`Nado ${this._market(id).exchangeSymbol} 未返回有效模拟价格。`);
    return price;
  }

  async getCandles(marketId, intervalSec = 3600, n = 200) {
    if (this.dataSource === 'real') {
      try { return await super.getCandles(marketId, intervalSec, n); } catch { /* synthesize below */ }
    }
    const price = await this.getPrice(marketId);
    const count = Math.min(300, Math.max(20, Number(n) || 200));
    const now = Date.now();
    return Array.from({ length: count }, (_, index) => {
      const age = count - index;
      const close = price * (1 + Math.sin((index + Number(marketId)) / 9) * 0.006 - age * 0.00001);
      const open = close * (1 + Math.sin(index / 5) * 0.001);
      return { time: now - age * intervalSec * 1000, open, high: Math.max(open, close) * 1.0015, low: Math.min(open, close) * 0.9985, close, volume: 0 };
    });
  }

  async placeLimitOrder(order) {
    const market = this._market(order.marketId);
    const size = floorNadoStep(order.sizeBase, market.stepSize);
    const price = floorNadoStep(order.price, market.stepPrice);
    if (!(size >= market.minOrderSize)) throw new Error(`Nado 模拟单数量小于最小数量 ${market.minOrderSize}。`);
    if (market.minNotional > 0 && price * size < market.minNotional) throw new Error(`Nado 模拟单名义价值小于 ${market.minNotional}。`);
    const id = `nd-paper-${this._seq++}`;
    this._watch.add(market.marketId);
    this._tracked.set(id, {
      orderId: id, marketId: market.marketId, levelIndex: order.levelIndex,
      side: order.side, price, sizeBase: size, reduceOnly: Boolean(order.reduceOnly),
    });
    return { orderId: id };
  }

  async cancelOrder(_marketId, id) { this._tracked.delete(String(id)); return true; }
  async cancelAll(marketId) {
    for (const [id, order] of this._tracked) if (order.marketId === Number(marketId)) this._tracked.delete(id);
    return true;
  }
  async fetchOpenOrders(marketId) { return this.getOpenOrders(marketId).map((order) => ({ ...order })); }

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
      if (this.dataSource === 'real') {
        try { await this._pollPrices(); } catch { /* keep the last quote */ }
      } else {
        for (const [marketId, price] of this._prices) {
          const seed = this.markets.get(marketId)?.lastPrice || price;
          this._prices.set(marketId, Math.max(0.0001, price * (1 + (seed - price) / seed * 0.02 + (Math.random() * 2 - 1) * 0.0015)));
        }
      }
      for (const marketId of this._watch) {
        const price = this._prices.get(marketId);
        if (!(price > 0)) continue;
        this.emit('price', { marketId, price });
        this._match(marketId, previous.get(marketId) ?? price, price);
      }
      this._refreshPaperEquity();
      this.lastOkAt = Date.now();
      this.lastError = null;
    } catch (error) { this.lastError = error?.message || String(error); }
    finally { this._busy = false; }
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
      this.emit('fill', { ...order, marketId });
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
      const next = position.sizeBase + signed;
      position.entryPrice = (Math.abs(position.sizeBase) * position.entryPrice + Math.abs(signed) * price) / Math.abs(next);
      position.sizeBase = next;
    } else {
      const closing = Math.min(Math.abs(position.sizeBase), Math.abs(signed));
      const pnl = position.sizeBase > 0 ? closing * (price - position.entryPrice) : closing * (position.entryPrice - price);
      this.balance += pnl;
      this.realizedPnl += pnl;
      const remaining = position.sizeBase + signed;
      if (!remaining) { position.sizeBase = 0; position.entryPrice = 0; }
      else if (Math.sign(remaining) === Math.sign(position.sizeBase)) position.sizeBase = remaining;
      else { position.sizeBase = remaining; position.entryPrice = price; }
    }
    if (position.sizeBase) this._positions.set(marketId, position); else this._positions.delete(marketId);
    this._refreshPaperEquity();
  }

  _refreshPaperEquity() {
    let unrealized = 0;
    for (const [marketId, position] of this._positions) {
      const mark = this._prices.get(marketId) || position.entryPrice;
      position.unrealizedPnl = position.sizeBase * (mark - position.entryPrice);
      unrealized += position.unrealizedPnl;
    }
    this.equity = this.balance + unrealized;
  }
}
