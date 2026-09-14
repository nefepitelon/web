import { EventEmitter } from 'node:events';
import { createDispatcher, connectionError } from '../../proxy.js';
import { alignDecimal, chooseTick, toUnitsExact } from './arcus.js';

const URLS = {
  mainnet: 'https://api.arcus.xyz',
  testnet: 'https://api.testnet.arcus.xyz',
};
const INTERVALS = {
  60: '1m', 180: '3m', 300: '5m', 900: '15m', 1800: '30m',
  3600: '1h', 7200: '2h', 14400: '4h', 28800: '8h', 43200: '12h',
  86400: '1d', 259200: '3d', 604800: '1w',
};
const FALLBACK_MARKETS = [
  {
    marketId: 1, name: 'BTC-USD', displayName: 'BTC-USD', exchangeSymbol: 'BTC-USD',
    symbol: 'BTC', lastPrice: 65_000, tickSize: '0.1', tickTiers: [], priceStep: '0.1',
    qtyStep: '0.00000001', stepPrice: 0.1, stepSize: 0.00000001,
    minOrderSize: 0.0001, minOrderNotional: 5, minNotional: 5,
    maxOrderSize: 10_000, maxLeverage: 40,
  },
  {
    marketId: 2, name: 'ETH-USD', displayName: 'ETH-USD', exchangeSymbol: 'ETH-USD',
    symbol: 'ETH', lastPrice: 2_500, tickSize: '0.01', tickTiers: [], priceStep: '0.01',
    qtyStep: '0.0000001', stepPrice: 0.01, stepSize: 0.0000001,
    minOrderSize: 0.001, minOrderNotional: 5, minNotional: 5,
    maxOrderSize: 100_000, maxLeverage: 25,
  },
];

function arrayPayload(value, ...keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return null;
}

export class ArcusPaperExchange extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.mode = 'paper';
    this.network = opts.network === 'testnet' ? 'testnet' : 'mainnet';
    this.apiUrl = String(opts.apiUrl || URLS[this.network]).replace(/\/$/, '');
    this.proxy = opts.proxy || '';
    this.dispatcher = null;
    this.balance = Number(opts.startBalance) || 10_000;
    this.equity = this.balance;
    this.availableMargin = this.balance;
    this.realizedPnl = 0;
    this.feeRate = Math.max(0, Number(opts.feeRate) || 0.0005);
    this.pollMs = Math.max(2000, Number(opts.pollMs) || 5000);
    this.dataSource = 'connecting';
    this.lastOkAt = 0;
    this.lastError = null;
    this.markets = new Map();
    this._prices = new Map();
    this._tracked = new Map();
    this._positions = new Map();
    this._watch = new Set();
    this._seq = 0;
    this._timer = null;
    this._busy = false;
  }

  async _ensureDispatcher() {
    if (!this.proxy || this.dispatcher) return this.dispatcher;
    this.dispatcher = await createDispatcher(this.proxy);
    return this.dispatcher;
  }

  async setProxy(value) {
    const previous = this.dispatcher;
    this.proxy = String(value || '');
    this.dispatcher = null;
    try { await previous?.close?.(); } catch { /* best effort */ }
    return true;
  }

  async _get(path) {
    try {
      const dispatcher = await this._ensureDispatcher();
      const response = await fetch(this.apiUrl + path, {
        headers: { Accept: 'application/json', 'User-Agent': 'WELINKBTC-ArcusPaper/1.0' },
        ...(dispatcher ? { dispatcher } : {}),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (cause) {
      const diagnostic = connectionError(cause);
      const error = new Error(`Arcus 公开行情请求失败（${diagnostic.code}）：${diagnostic.message || cause?.message || cause}`);
      error.cause = cause;
      throw error;
    }
  }

  _parseMarkets(payload) {
    const rows = arrayPayload(payload, 'markets', 'result') || [];
    const parsed = [];
    for (const raw of rows) {
      if (String(raw?.type || 'PERPETUAL').toUpperCase() !== 'PERPETUAL') continue;
      if (String(raw?.status || '').toUpperCase() !== 'ONLINE') continue;
      const marketId = Number(raw.marketId);
      const tickSize = String(raw.tickSize ?? '');
      const qtyStep = String(raw.stepSize ?? '');
      const lastPrice = Number(raw.markPrice ?? raw.oraclePrice ?? raw.lastTradePrice);
      if (!Number.isInteger(marketId) || !(Number(tickSize) > 0) || !(Number(qtyStep) > 0)) continue;
      const initialMargin = Number(raw.isOutsideRth ? raw.offHoursInitialMarginFraction : raw.initialMarginFraction);
      const tickTiers = Array.isArray(raw.tickTiers)
        ? raw.tickTiers.map((tier) => ({ upToPrice: tier.upToPrice ?? null, tick: tier.tick ?? tier.tickSize }))
        : [];
      const minOrderSize = Number(raw.minOrderSize ?? qtyStep);
      const maxOrderSize = Number(raw.maxOrderSize ?? Infinity);
      if (!(minOrderSize > 0) || !(maxOrderSize >= minOrderSize)) continue;
      parsed.push({
        marketId,
        name: String(raw.marketDisplayName || raw.symbol || marketId),
        displayName: String(raw.marketDisplayName || raw.symbol || marketId),
        exchangeSymbol: String(raw.marketDisplayName || raw.symbol || marketId),
        symbol: String(raw.baseAsset || raw.base || ''),
        lastPrice: lastPrice > 0 ? lastPrice : 100,
        tickSize,
        tickTiers,
        priceStep: tickSize,
        qtyStep,
        stepPrice: Number(chooseTick({ tickSize, tickTiers }, lastPrice > 0 ? lastPrice : tickSize)),
        stepSize: Number(qtyStep),
        minOrderSize,
        minOrderNotional: Number(raw.minOrderNotional ?? raw.minNotional ?? 0),
        minNotional: Number(raw.minOrderNotional ?? raw.minNotional ?? 0),
        maxOrderSize,
        maxLeverage: Number.isFinite(initialMargin) && initialMargin > 0
          ? Math.max(1, Math.floor(1 / initialMargin + 1e-9)) : 50,
      });
    }
    return parsed;
  }

  _setMarkets(rows) {
    this.markets = new Map(rows.map((market) => [Number(market.marketId), { ...market }]));
    for (const market of rows) {
      if (!this._prices.has(Number(market.marketId))) {
        this._prices.set(Number(market.marketId), Number(market.lastPrice) || 100);
      }
    }
  }

  async init() {
    try {
      const rows = this._parseMarkets(await this._get('/v1/markets'));
      if (!rows.length) throw new Error('Arcus 当前没有可用的 ONLINE 永续市场。');
      this._setMarkets(rows);
      await this._refreshPrices();
      this.dataSource = 'real';
      this.lastError = null;
    } catch (error) {
      // PAPER remains usable during a public-data outage, but is explicitly
      // labelled synthetic so it can never be mistaken for live market data.
      this._setMarkets(FALLBACK_MARKETS);
      this.dataSource = 'synthetic';
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

  async getMarkets() { return [...this.markets.values()]; }

  _market(marketId) {
    const market = this.markets.get(Number(marketId));
    if (!market) throw new Error(`未知 Arcus 模拟市场 marketId=${marketId}`);
    return market;
  }

  async getCandles(marketId, intervalSec = 3600, count = 200) {
    const market = this._market(marketId);
    if (this.dataSource === 'real') {
      try {
        const timeframe = INTERVALS[Number(intervalSec)] || '1h';
        const to = BigInt(Date.now()) * 1000n;
        const payload = await this._get(`/v1/candles?market=${encodeURIComponent(market.name)}&timeframe=${timeframe}&to=${to}&countback=${Math.min(1500, Math.max(20, Number(count) || 200))}`);
        const rows = arrayPayload(payload, 'candles', 'result') || [];
        const candles = rows.map((row) => ({
          time: Math.floor(Number(row.openTime ?? row.timestamp ?? row.time ?? 0) / 1000),
          open: Number(row.open), high: Number(row.high), low: Number(row.low),
          close: Number(row.close), volume: Number(row.volume || 0),
        })).filter((row) => row.time > 0 && Number.isFinite(row.close)).sort((a, b) => a.time - b.time);
        if (candles.length) return candles;
      } catch { /* deterministic local fallback below */ }
    }
    return syntheticCandles(this._prices.get(market.marketId) || market.lastPrice, Number(count) || 200, Number(intervalSec) || 3600);
  }

  async getPrice(marketId) {
    const market = this._market(marketId);
    this._watch.add(market.marketId);
    const price = this._prices.get(market.marketId) ?? market.lastPrice;
    if (!(price > 0)) throw new Error(`Arcus ${market.name} 没有有效模拟价格。`);
    return price;
  }

  async preflightTrading() { return true; }
  async setLeverage() { return true; }

  _prepareOrder(order) {
    const market = this._market(order.marketId);
    const side = String(order.side || '').toLowerCase();
    if (!['buy', 'sell'].includes(side)) throw new Error(`Arcus 模拟单方向无效: ${order.side}`);
    if (!(Number(order.price) > 0) || !(Number(order.sizeBase) > 0)) {
      throw new Error('Arcus 模拟单价格和数量必须为正数。');
    }
    const price = alignDecimal(order.price, chooseTick(market, order.price), 'nearest');
    const quantity = alignDecimal(order.sizeBase, market.qtyStep, 'down');
    if (toUnitsExact(quantity, market.qtyStep) <= 0n || Number(quantity) < market.minOrderSize) {
      throw new Error(`Arcus 模拟单数量小于最小数量 ${market.minOrderSize}。`);
    }
    if (Number(quantity) > market.maxOrderSize) throw new Error(`Arcus 模拟单数量超过最大数量 ${market.maxOrderSize}。`);
    if (!order.reduceOnly && market.minOrderNotional > 0 && Number(price) * Number(quantity) < market.minOrderNotional) {
      throw new Error(`Arcus 模拟单名义价值低于 ${market.minOrderNotional} USD。`);
    }
    return { market, side, price: Number(price), sizeBase: Number(quantity) };
  }

  async placeLimitOrder(order) {
    const prepared = this._prepareOrder(order);
    const orderId = `ar-paper-${++this._seq}`;
    const tracked = {
      ...order,
      orderId,
      marketId: prepared.market.marketId,
      side: prepared.side,
      price: prepared.price,
      sizeBase: prepared.sizeBase,
      reduceOnly: Boolean(order.reduceOnly),
    };
    this._watch.add(tracked.marketId);
    this._tracked.set(orderId, tracked);
    return { ...tracked };
  }

  async placeLimitOrders(orders) {
    for (const order of orders) this._prepareOrder(order);
    const placed = [];
    for (const order of orders) placed.push(await this.placeLimitOrder(order));
    return { placed, failed: [] };
  }

  async cancelOrder(marketId, orderId) {
    this._market(marketId);
    const current = this._tracked.get(String(orderId));
    if (current && current.marketId !== Number(marketId)) throw new Error('Arcus 模拟订单不属于当前市场。');
    this._tracked.delete(String(orderId));
    return true;
  }

  async cancelAll(marketId) {
    this._market(marketId);
    for (const [orderId, order] of this._tracked) {
      if (order.marketId === Number(marketId)) this._tracked.delete(orderId);
    }
    return true;
  }

  getOpenOrders(marketId) {
    return [...this._tracked.values()].filter((order) => order.marketId === Number(marketId));
  }

  async fetchOpenOrders(marketId) {
    return this.getOpenOrders(marketId).map((order) => ({ ...order }));
  }

  forgetOrder(orderId) { this._tracked.delete(String(orderId)); }

  forgetOrders(marketId) {
    for (const [orderId, order] of this._tracked) {
      if (order.marketId === Number(marketId)) this._tracked.delete(orderId);
    }
  }

  adoptOrder(order) {
    this._market(order.marketId);
    if (!order.orderId) throw new Error('Arcus 模拟订单缺少 orderId。');
    this._tracked.set(String(order.orderId), {
      ...order, orderId: String(order.orderId), marketId: Number(order.marketId),
    });
  }

  getPosition(marketId) {
    const position = this._positions.get(Number(marketId));
    if (!position?.sizeBase) return null;
    const price = this._prices.get(Number(marketId)) || position.entryPrice;
    return { ...position, unrealizedPnl: position.sizeBase * (price - position.entryPrice) };
  }

  async closePosition(marketId) {
    const market = this._market(marketId);
    const position = this._positions.get(market.marketId);
    if (!position?.sizeBase) return true;
    const price = this._prices.get(market.marketId) || position.entryPrice;
    this._applyFill(market.marketId, position.sizeBase > 0 ? 'sell' : 'buy', price, Math.abs(position.sizeBase));
    return true;
  }

  async _refreshPrices() {
    const payload = await this._get('/v1/prices');
    const source = payload?.prices ?? payload?.result ?? payload;
    const rows = Array.isArray(source) ? source.map((row) => [row?.marketId, row]) : Object.entries(source || {});
    let found = 0;
    for (const [key, row] of rows) {
      const marketId = Number(row?.marketId ?? key);
      const price = Number(row?.markPrice ?? row?.oraclePrice ?? row?.price);
      if (!this.markets.has(marketId) || !(price > 0)) continue;
      this._prices.set(marketId, price);
      this.markets.get(marketId).lastPrice = price;
      found++;
    }
    if (!found && !this._prices.size) throw new Error('Arcus 公开价格快照为空。');
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this._poll().catch(() => {}), this.pollMs);
    this._timer.unref?.();
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async _poll() {
    if (this._busy) return;
    this._busy = true;
    try {
      const previous = new Map(this._prices);
      if (this.dataSource === 'real') await this._refreshPrices();
      else {
        for (const [marketId, price] of this._prices) {
          const anchor = this.markets.get(marketId)?.lastPrice || price;
          const drift = (anchor - price) / Math.max(anchor, 1e-12) * 0.02;
          this._prices.set(marketId, Math.max(1e-8, price * (1 + drift + (Math.random() * 2 - 1) * 0.0015)));
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
    } finally {
      this._busy = false;
    }
  }

  _match(marketId, previous, current) {
    for (const order of [...this._tracked.values()]) {
      if (order.marketId !== marketId) continue;
      const crossed = order.side === 'buy'
        ? current <= order.price || (previous > order.price && current <= order.price)
        : current >= order.price || (previous < order.price && current >= order.price);
      if (!crossed) continue;
      if (order.reduceOnly && !this._reduces(marketId, order.side)) {
        this._tracked.delete(order.orderId);
        continue;
      }
      this._tracked.delete(order.orderId);
      this._applyFill(marketId, order.side, order.price, order.sizeBase);
      this.emit('fill', { ...order });
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
    const position = this._positions.get(marketId) || {
      sizeBase: 0, entryPrice: 0, unrealizedPnl: 0, leverage: null,
      liquidationPrice: null, liquidationPriceStatus: 'unavailable', liquidationPriceSource: null,
    };
    const signed = side === 'buy' ? quantity : -quantity;
    if (!position.sizeBase || Math.sign(position.sizeBase) === Math.sign(signed)) {
      const next = position.sizeBase + signed;
      position.entryPrice = (Math.abs(position.sizeBase) * position.entryPrice + quantity * price) / Math.abs(next);
      position.sizeBase = next;
    } else {
      const closing = Math.min(Math.abs(position.sizeBase), quantity);
      const pnl = position.sizeBase > 0
        ? closing * (price - position.entryPrice)
        : closing * (position.entryPrice - price);
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
    this.availableMargin = this.balance;
  }
}

// Compatibility with adapters whose paper class is named generically.
export { ArcusPaperExchange as PaperExchange };

function syntheticCandles(start, count, intervalSec) {
  const size = Math.min(1500, Math.max(20, count));
  const rows = [];
  let price = Number(start) || 100;
  let time = Math.floor(Date.now() / 1000) - size * intervalSec;
  for (let index = 0; index < size; index++) {
    const open = price;
    const close = Math.max(1e-8, open * (1 + Math.sin(index / 11) * 0.0015));
    rows.push({
      time,
      open,
      high: Math.max(open, close) * 1.001,
      low: Math.min(open, close) * 0.999,
      close,
      volume: 0,
    });
    price = close;
    time += intervalSec;
  }
  return rows;
}
