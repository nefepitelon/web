import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import { createDispatcher, connectionError } from '../../proxy.js';
import { ExchangeWriteScheduler, retryAfterMsFromHeaders } from '../write-scheduler.js';
import { extractLiquidationPrice } from '../liquidation-price.js';

const INTERVALS = { 60: '1m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 7200: '2h', 14400: '4h', 86400: '1d' };

function decimals(step) {
  const text = String(step);
  if (/e-/i.test(text)) return Number(text.split(/e-/i)[1]);
  return (text.split('.')[1] || '').replace(/0+$/, '').length;
}

export function floorToStep(value, step) {
  const s = Number(step);
  if (!(s > 0)) return Number(value);
  const d = decimals(step);
  return Number((Math.floor((Number(value) + s * 1e-9) / s) * s).toFixed(d));
}

export function signQuery(params, secret) {
  const query = new URLSearchParams(params).toString();
  return { query, signature: createHmac('sha256', secret).update(query).digest('hex') };
}

function binanceError(payload, status, headers) {
  const code = payload?.code != null ? ` (${payload.code})` : '';
  const error = new Error(`Binance 拒绝请求${code}: ${payload?.msg || `HTTP ${status}`}`);
  error.exchangeCode = payload?.code;
  error.httpStatus = status;
  error.retryAfterMs = retryAfterMsFromHeaders(headers);
  return error;
}

export class BinanceExchange extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.mode = 'live';
    this.network = opts.network || 'mainnet';
    this.apiUrl = String(opts.apiUrl || 'https://fapi.binance.com').replace(/\/$/, '');
    this.apiKey = opts.apiKey || '';
    this.apiSecret = opts.apiSecret || '';
    this.proxy = opts.proxy || '';
    this.dispatcher = null;
    this.recvWindow = Math.min(60000, Math.max(1000, Number(opts.recvWindow) || 5000));
    this.pollMs = Math.max(1500, Number(opts.pollMs) || 3000);
    this.orderGapMs = Math.max(100, Number(opts.orderGapMs) || 200);
    this._writeScheduler = new ExchangeWriteScheduler({
      label: 'Binance', minGapMs: this.orderGapMs, maxRetries: 5,
      baseDelayMs: Math.max(1000, this.orderGapMs), sleep: opts.sleep, now: opts.now,
    });
    this.feeRate = Number(opts.feeRate) || 0.0005;
    this.markets = new Map();
    this.symbolToId = new Map();
    this._tracked = new Map();
    this._positions = new Map();
    this._prices = new Map();
    this._watch = new Set();
    this._timer = null;
    this._busy = false;
    this._timeOffset = 0;
    this.balance = null;
    this.equity = null;
    this.lastOkAt = null;
    this.lastError = null;
    this.dataSource = null;
  }

  async init() {
    if (!this.apiKey || !this.apiSecret) throw new Error('Binance live 缺少 BINANCE_API_KEY 或 BINANCE_API_SECRET。');
    await this._ensureDispatcher();
    await this._syncTime();
    await this._loadMarkets();
    const mode = await this._request('GET', '/fapi/v1/positionSide/dual', {}, true);
    if (mode?.dualSidePosition === true) {
      throw new Error('Binance 当前为双向持仓（Hedge Mode）。请先在无持仓、无挂单时切换为单向持仓（One-way Mode）再启动。');
    }
    await this._refreshAccount();
    this.dataSource = 'real';
    this.lastOkAt = Date.now();
    this.start();
    return true;
  }

  async reconnect() {
    this.stop();
    this.dataSource = null;
    return this.init();
  }

  async _ensureDispatcher() {
    if (!this.proxy || this.dispatcher) return this.dispatcher;
    this.dispatcher = await createDispatcher(this.proxy);
    if (!this.dispatcher) throw new Error('Binance 专用代理初始化失败，请检查 BINANCE_PROXY 格式及代理依赖。');
    return this.dispatcher;
  }

  async setProxy(proxy) {
    const next = String(proxy || '');
    if (next === this.proxy) return false;
    const previous = this.dispatcher;
    this.proxy = next;
    this.dispatcher = null;
    try { await previous?.close?.(); } catch {}
    return true;
  }

  async _syncTime() {
    const response = await this._request('GET', '/fapi/v1/time');
    this._timeOffset = Number(response.serverTime) - Date.now();
  }

  async _request(method, endpoint, params = {}, signed = false, allowTimeRetry = true) {
    const execute = () => this._requestOnce(method, endpoint, params, signed, allowTimeRetry);
    if (method === 'GET') return execute();
    return this._writeScheduler.run(execute, { operation: `${method} ${endpoint}` });
  }

  async _requestOnce(method, endpoint, params = {}, signed = false, allowTimeRetry = true) {
    const values = { ...params };
    if (signed) {
      values.recvWindow = this.recvWindow;
      values.timestamp = Date.now() + this._timeOffset;
    }
    const { query, signature } = signQuery(values, signed ? this.apiSecret : '');
    const suffix = query + (signed ? `${query ? '&' : ''}signature=${signature}` : '');
    const url = `${this.apiUrl}${endpoint}${suffix ? '?' + suffix : ''}`;
    let response;
    try {
      const dispatcher = await this._ensureDispatcher();
      response = await fetch(url, {
        method,
        headers: signed || this.apiKey ? { 'X-MBX-APIKEY': this.apiKey } : {},
        ...(dispatcher ? { dispatcher } : {}),
        signal: AbortSignal.timeout(12000),
      });
    } catch (cause) {
      const detail = connectionError(cause);
      const host = (() => { try { return new URL(url).hostname; } catch { return 'Binance'; } })();
      const via = String(this.proxy).toLowerCase() === 'direct'
        ? '本机直连网络（已绕过全局代理）'
        : this.proxy ? '当前 Binance/全局代理' : '本机直连网络';
      const action = detail.code === 'ECONNRESET'
        ? `${via}在连接 ${host} 时被重置；请更换允许访问 Binance Futures 且支持 HTTPS CONNECT 的节点`
        : detail.code === 'UND_ERR_CONNECT_TIMEOUT' || detail.code === 'TimeoutError'
          ? `${via}连接 ${host} 超时；请配置可访问 Binance Futures 的 BINANCE_PROXY`
          : `请检查 ${via} 是否允许访问 ${host}`;
      const error = new Error(`Binance 网络请求失败（${detail.code}）：${action}。`);
      error.cause = cause;
      error.diagnosticCode = detail.code;
      error.statusUnknown = method === 'POST';
      throw error;
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || (payload && typeof payload === 'object' && Number(payload.code) < 0)) {
      const error = binanceError(payload, response.status, response.headers);
      error.statusUnknown = method === 'POST' && response.status >= 500;
      if (signed && allowTimeRetry && Number(payload?.code) === -1021) {
        await this._syncTime();
        return this._requestOnce(method, endpoint, params, signed, false);
      }
      throw error;
    }
    this.lastOkAt = Date.now();
    return payload;
  }

  async _loadMarkets() {
    const info = await this._request('GET', '/fapi/v1/exchangeInfo');
    const list = (info.symbols || [])
      .filter((symbol) => symbol.status === 'TRADING' && symbol.contractType === 'PERPETUAL' && symbol.quoteAsset === 'USDT')
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
    this.markets.clear();
    this.symbolToId.clear();
    let marketId = 1;
    for (const symbol of list) {
      const priceFilter = symbol.filters?.find((filter) => filter.filterType === 'PRICE_FILTER') || {};
      const lotFilter = symbol.filters?.find((filter) => filter.filterType === 'LOT_SIZE') || {};
      const notionalFilter = symbol.filters?.find((filter) => filter.filterType === 'MIN_NOTIONAL') || {};
      const market = {
        marketId,
        name: symbol.symbol,
        displayName: `${symbol.baseAsset}/USDT`,
        symbol: symbol.baseAsset,
        exchangeSymbol: symbol.symbol,
        lastPrice: null,
        stepSize: Number(lotFilter.stepSize || 0.001),
        stepPrice: Number(priceFilter.tickSize || 0.01),
        minOrderSize: Number(lotFilter.minQty || 0.001),
        maxOrderSize: Number(lotFilter.maxQty || 0),
        minNotional: Number(notionalFilter.notional || notionalFilter.minNotional || 5),
        maxLeverage: 125,
      };
      this.markets.set(marketId, market);
      this.symbolToId.set(symbol.symbol, marketId);
      marketId++;
    }
    if (!this.markets.size) throw new Error('Binance 未返回可交易的 USDT 永续合约。');
  }

  async getMarkets() { return [...this.markets.values()]; }

  _market(marketId) {
    const market = this.markets.get(Number(marketId));
    if (!market) throw new Error(`Binance 未知市场 ID: ${marketId}`);
    return market;
  }

  async getCandles(marketId, intervalSec = 3600, n = 200) {
    const market = this._market(marketId);
    const rows = await this._request('GET', '/fapi/v1/klines', {
      symbol: market.exchangeSymbol,
      interval: INTERVALS[intervalSec] || '1h',
      limit: Math.min(1000, Math.max(20, Number(n) || 200)),
    });
    return (rows || []).map((row) => ({
      time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]),
    }));
  }

  async getPrice(marketId) {
    const id = Number(marketId);
    const market = this._market(id);
    this._watch.add(id);
    const result = await this._request('GET', '/fapi/v1/premiumIndex', { symbol: market.exchangeSymbol });
    const price = Number(result.markPrice || result.indexPrice);
    if (!(price > 0)) throw new Error(`Binance ${market.exchangeSymbol} 未返回有效标记价格。`);
    this._prices.set(id, price);
    return price;
  }

  async preflightTrading() {
    const account = await this._request('GET', '/fapi/v3/account', {}, true);
    if (account.canTrade === false) throw new Error('Binance API Key 未获得 Futures 交易权限。请在 API Management 启用交易权限。');
    return true;
  }

  async setLeverage(marketId, leverage) {
    const market = this._market(marketId);
    await this._request('POST', '/fapi/v1/leverage', {
      symbol: market.exchangeSymbol,
      leverage: Math.max(1, Math.min(125, Math.floor(Number(leverage) || 1))),
    }, true);
    return true;
  }

  _orderParams(order, type = 'LIMIT') {
    const market = this._market(order.marketId);
    const quantity = floorToStep(order.sizeBase, market.stepSize);
    if (!(quantity >= market.minOrderSize)) throw new Error(`Binance 下单数量 ${quantity} 小于最小数量 ${market.minOrderSize}。`);
    if (type === 'LIMIT' && Number(order.price) * quantity < market.minNotional) {
      throw new Error(`Binance 订单名义价值低于最小值 ${market.minNotional} USDT。`);
    }
    const params = {
      symbol: market.exchangeSymbol,
      side: order.side === 'buy' ? 'BUY' : 'SELL',
      type,
      quantity,
      reduceOnly: order.reduceOnly ? 'true' : 'false',
      newClientOrderId: `wl${String(order.clientOrderId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(-32)}`,
    };
    if (type === 'LIMIT') {
      params.price = floorToStep(order.price, market.stepPrice);
      params.timeInForce = order.postOnly ? 'GTX' : 'GTC';
    }
    return { market, params };
  }

  async placeLimitOrder(order) {
    const { market, params } = this._orderParams(order, 'LIMIT');
    let result;
    try {
      result = await this._request('POST', '/fapi/v1/order', params, true);
    } catch (error) {
      if (!error.statusUnknown) throw error;
      // Binance documents 5xx/timeouts as execution status UNKNOWN. Resolve by
      // client id before returning; never blindly submit a duplicate order.
      try {
        result = await this._request('GET', '/fapi/v1/order', {
          symbol: market.exchangeSymbol,
          origClientOrderId: params.newClientOrderId,
        }, true);
      } catch {
        error.message += '；订单状态未知，已停止自动重试，请先在 Binance 订单页核对。';
        error.statusUnknown = true;
        throw error;
      }
    }
    const orderId = String(result.orderId);
    this._watch.add(Number(order.marketId));
    this._tracked.set(orderId, {
      orderId, marketId: Number(order.marketId), levelIndex: order.levelIndex,
      side: order.side, price: Number(params.price), sizeBase: Number(params.quantity), clientOrderId: params.newClientOrderId,
    });
    return { orderId };
  }

  async cancelOrder(marketId, orderId) {
    const market = this._market(marketId);
    const result = await this._request('DELETE', '/fapi/v1/order', { symbol: market.exchangeSymbol, orderId }, true);
    this._tracked.delete(String(orderId));
    return result;
  }

  async cancelAll(marketId) {
    const id = Number(marketId);
    const market = this._market(id);
    const result = await this._request('DELETE', '/fapi/v1/allOpenOrders', { symbol: market.exchangeSymbol }, true);
    for (const [orderId, order] of this._tracked) if (order.marketId === id) this._tracked.delete(orderId);
    return result;
  }

  getOpenOrders(marketId) {
    return [...this._tracked.values()].filter((order) => order.marketId === Number(marketId));
  }

  async fetchOpenOrders(marketId) {
    const market = this._market(marketId);
    const orders = await this._request('GET', '/fapi/v1/openOrders', { symbol: market.exchangeSymbol }, true);
    return (orders || []).map((order) => ({ orderId: String(order.orderId), price: Number(order.price), side: order.side === 'BUY' ? 'buy' : 'sell' }));
  }

  adoptOrder(order) {
    const marketId = Number(order.marketId);
    this._watch.add(marketId);
    this._tracked.set(String(order.orderId), {
      ...order, orderId: String(order.orderId), marketId, price: Number(order.price), sizeBase: Number(order.sizeBase),
    });
  }

  getPosition(marketId) {
    const position = this._positions.get(Number(marketId));
    return position && position.sizeBase !== 0 ? position : null;
  }

  async closePosition(marketId) {
    const id = Number(marketId);
    await this._refreshPosition(id);
    const position = this._positions.get(id);
    if (!position?.sizeBase) return true;
    const { params } = this._orderParams({
      marketId: id,
      side: position.sizeBase > 0 ? 'sell' : 'buy',
      sizeBase: Math.abs(position.sizeBase),
      reduceOnly: true,
      clientOrderId: Date.now(),
    }, 'MARKET');
    await this._request('POST', '/fapi/v1/order', params, true);
    return true;
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

  async _refreshPosition(marketId) {
    const market = this._market(marketId);
    const rows = await this._request('GET', '/fapi/v3/positionRisk', { symbol: market.exchangeSymbol }, true);
    const position = (Array.isArray(rows) ? rows : [rows]).find((row) => row.symbol === market.exchangeSymbol && row.positionSide === 'BOTH');
    const amount = Number(position?.positionAmt || 0);
    if (!amount) this._positions.delete(Number(marketId));
    else {
      const liquidation = extractLiquidationPrice(position);
      this._positions.set(Number(marketId), {
        sizeBase: amount,
        entryPrice: Number(position.entryPrice || 0),
        ...liquidation,
        unrealizedPnl: Number(position.unRealizedProfit || 0),
        leverage: Number(position.leverage || 0) || null,
      });
    }
  }

  async _refreshAccount() {
    const account = await this._request('GET', '/fapi/v3/account', {}, true);
    this.balance = Number(account.totalWalletBalance);
    this.equity = Number(account.totalMarginBalance);
  }

  async _resolveGone(orderId, tracked) {
    const market = this._market(tracked.marketId);
    let order;
    try { order = await this._request('GET', '/fapi/v1/order', { symbol: market.exchangeSymbol, orderId }, true); }
    catch (error) {
      if (Number(error.exchangeCode) === -2013) this._tracked.delete(String(orderId));
      return;
    }
    const status = String(order.status || '');
    if (!['FILLED', 'CANCELED', 'EXPIRED'].includes(status)) return;
    this._tracked.delete(String(orderId));
    const filled = Number(order.executedQty || 0);
    if (!(filled > 0)) return;
    this.emit('fill', {
      orderId: String(orderId), marketId: tracked.marketId, levelIndex: tracked.levelIndex,
      side: tracked.side, price: Number(order.avgPrice || tracked.price), sizeBase: filled,
    });
  }

  async _poll() {
    if (this._busy) return;
    this._busy = true;
    try {
      for (const marketId of this._watch) {
        const market = this._market(marketId);
        try {
          const mark = await this._request('GET', '/fapi/v1/premiumIndex', { symbol: market.exchangeSymbol });
          const price = Number(mark.markPrice);
          if (price > 0) { this._prices.set(marketId, price); this.emit('price', { marketId, price }); }
        } catch { /* keep last price */ }
        try {
          const open = await this._request('GET', '/fapi/v1/openOrders', { symbol: market.exchangeSymbol }, true);
          const live = new Set((open || []).map((order) => String(order.orderId)));
          for (const [orderId, tracked] of [...this._tracked]) {
            if (tracked.marketId === marketId && !live.has(orderId)) await this._resolveGone(orderId, tracked);
          }
        } catch { /* next poll reconciles */ }
        await this._refreshPosition(marketId).catch(() => {});
      }
      await this._refreshAccount();
      this.lastError = null;
      this.lastOkAt = Date.now();
    } catch (error) {
      this.lastError = error?.message || String(error);
      this.emit('error', error);
    } finally {
      this._busy = false;
    }
  }
}
