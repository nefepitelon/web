import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { connectionError, createDispatcher } from '../../proxy.js';
import { ExchangeWriteScheduler, retryAfterMsFromHeaders } from '../write-scheduler.js';
import { extractLiquidationPrice } from '../liquidation-price.js';

const INTERVALS = { 60: '1', 300: '5', 900: '15', 1800: '30', 3600: '60', 14400: '240', 86400: '1D' };

function decimals(step) {
  const text = String(step);
  if (/e-/i.test(text)) return Number(text.split(/e-/i)[1]);
  return (text.split('.')[1] || '').replace(/0+$/, '').length;
}

export function floorToStep(value, step) {
  const size = Number(step);
  if (!(size > 0)) return Number(value);
  return Number((Math.floor((Number(value) + size * 1e-9) / size) * size).toFixed(decimals(step)));
}

export function signOndoRequest({ timestamp, method, requestPath, body = '', secret }) {
  const payload = `${timestamp}${String(method).toUpperCase()}${requestPath}${body}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function apiError(payload, status, headers) {
  const code = payload?.error_code || payload?.code || '';
  const message = payload?.error || payload?.message || `HTTP ${status}`;
  const error = new Error(`Ondo Perps 拒绝请求${code ? `（${code}）` : ''}: ${message}`);
  error.exchangeCode = code;
  error.httpStatus = status;
  error.retryAfterMs = retryAfterMsFromHeaders(headers);
  return error;
}

function resultList(result, key) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.[key])) return result[key];
  return [];
}

function sameOrderNumber(left, right) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9);
}

function batchRowValue(row, key, aliases = []) {
  const source = row?.order && typeof row.order === 'object' ? row.order : row;
  for (const name of [key, ...aliases]) {
    if (source?.[name] !== undefined && source?.[name] !== null) return source[name];
  }
  return undefined;
}

export class OndoPerpsExchange extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.mode = 'live';
    this.network = opts.network || 'mainnet';
    this.apiUrl = String(opts.apiUrl || 'https://api.ondoperps.xyz').replace(/\/$/, '');
    this.wsUrl = opts.wsUrl || '';
    this.keyId = opts.keyId || '';
    this.apiSecret = opts.apiSecret || '';
    this.proxy = opts.proxy || '';
    this.dispatcher = null;
    this.pollMs = Math.max(1500, Number(opts.pollMs) || 3000);
    this.orderGapMs = Math.max(250, Number(opts.orderGapMs) || 1200);
    this._requestScheduler = new ExchangeWriteScheduler({
      label: 'Ondo Perps', minGapMs: this.orderGapMs, maxRetries: 6,
      baseDelayMs: Math.max(1500, this.orderGapMs),
      sleep: opts.sleep, now: opts.now,
    });
    this.feeRate = 0.00015;
    this.markets = new Map();
    this.marketToId = new Map();
    this._prices = new Map();
    this._positions = new Map();
    this._tracked = new Map();
    this._watch = new Set();
    this._timer = null;
    this._busy = false;
    this.balance = null;
    this.equity = null;
    this.realizedPnl = null;
    this.lastOkAt = null;
    this.lastError = null;
    this.dataSource = null;
  }

  async init() {
    if (!this.keyId || !this.apiSecret) throw new Error('Ondo Perps live 缺少 ONDO_KEY_ID 或 ONDO_API_SECRET。');
    await this._ensureDispatcher();
    await this._request('GET', '/status');
    await this._loadMarkets();
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
    if (!this.dispatcher) throw new Error('Ondo Perps 专用代理初始化失败，请检查 ONDO_PROXY。');
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

  async _request(method, endpoint, query = {}, body = null, authenticated = false) {
    const execute = () => this._requestOnce(method, endpoint, query, body, authenticated);
    if (!authenticated) return execute();
    const write = method !== 'GET';
    return this._requestScheduler.run(execute, {
      operation: write ? `${method} ${endpoint}` : `账户查询 ${endpoint}`,
      minGapMs: write ? this.orderGapMs : Math.min(300, this.orderGapMs),
    });
  }

  async _requestOnce(method, endpoint, query = {}, body = null, authenticated = false) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
    }
    const queryText = params.toString();
    const requestPath = `${endpoint}${queryText ? `?${queryText}` : ''}`;
    const bodyText = body == null ? '' : JSON.stringify(body);
    const headers = { Accept: 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (authenticated) {
      const timestamp = String(Date.now());
      headers['ONDO-KEY-ID'] = this.keyId;
      headers['ONDO-TIMESTAMP'] = timestamp;
      headers['ONDO-SIGN'] = signOndoRequest({ timestamp, method, requestPath, body: bodyText, secret: this.apiSecret });
    }
    const url = `${this.apiUrl}${requestPath}`;
    let response;
    try {
      const dispatcher = await this._ensureDispatcher();
      response = await fetch(url, {
        method,
        headers,
        ...(bodyText ? { body: bodyText } : {}),
        ...(dispatcher ? { dispatcher } : {}),
        signal: AbortSignal.timeout(12000),
      });
    } catch (cause) {
      const detail = connectionError(cause);
      const host = (() => { try { return new URL(url).hostname; } catch { return 'Ondo Perps'; } })();
      const via = String(this.proxy).toLowerCase() === 'direct' ? '本机直连网络' : this.proxy ? '当前 Ondo/全局代理' : '本机直连网络';
      const error = new Error(`Ondo Perps 网络请求失败（${detail.code}）：${via}无法访问 ${host}，请检测 ONDO_PROXY 或切换为 direct。`);
      error.cause = cause;
      error.diagnosticCode = detail.code;
      error.statusUnknown = method === 'POST';
      throw error;
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || payload?.success === false) {
      const error = apiError(payload, response.status, response.headers);
      error.statusUnknown = method === 'POST' && response.status >= 500;
      throw error;
    }
    this.lastOkAt = Date.now();
    return payload?.result ?? payload;
  }

  async _loadMarkets() {
    const [result, contracts] = await Promise.all([
      this._request('GET', '/v1/markets'),
      this._request('GET', '/v1/perps/contracts', { sparkline: false }).catch(() => []),
    ]);
    const pairs = result?.perps?.tradingPairs || resultList(result, 'tradingPairs');
    const contractList = resultList(contracts, 'contracts');
    const contractByName = new Map(contractList.map((item) => [item.market, item]));
    const list = [...pairs].sort((a, b) => String(a.market).localeCompare(String(b.market)));
    this.markets.clear();
    this.marketToId.clear();
    let marketId = 1;
    for (const pair of list) {
      const contract = contractByName.get(pair.market) || {};
      if (contract.disabled === true) continue;
      const maxLeverage = Math.max(1, ...resultList(pair.marginInfo, 'marginInfo').map((item) => Number(item.maxLeverage) || 1));
      const market = {
        marketId,
        name: pair.market,
        displayName: `${pair.pair?.base || pair.displayName}/${pair.pair?.quote || 'USD'}`,
        longName: pair.longName || pair.displayName || pair.market,
        symbol: pair.pair?.base || pair.displayName,
        exchangeSymbol: pair.market,
        lastPrice: Number(contract.lastPrice || contract.indexPrice || 0) || null,
        stepSize: Number(pair.baseIncrement || 0.01),
        stepPrice: Number(pair.quoteIncrement || 0.01),
        minOrderSize: Number(pair.baseIncrement || 0.01),
        maxOrderSize: Number(pair.maxPositionBaseSize || 0),
        minNotional: 0,
        maxLeverage,
        defaultLeverage: Number(pair.defaultLeverage || maxLeverage),
        makerFee: Number(pair.makerFee || contract.makerFee || 0.00015),
        takerFee: Number(pair.takerFee || contract.takerFee || 0.00035),
        tags: pair.tags || contract.tags || [],
        isClosed: contract.isClosed === true,
      };
      this.markets.set(marketId, market);
      this.marketToId.set(market.exchangeSymbol, marketId);
      if (market.lastPrice > 0) this._prices.set(marketId, market.lastPrice);
      marketId++;
    }
    if (!this.markets.size) throw new Error('Ondo Perps 未返回可交易永续合约。');
    this.feeRate = this.markets.values().next().value?.makerFee || this.feeRate;
  }

  async getMarkets() { return [...this.markets.values()]; }

  _market(marketId) {
    const market = this.markets.get(Number(marketId));
    if (!market) throw new Error(`Ondo Perps 未知市场 ID: ${marketId}`);
    return market;
  }

  async getCandles(marketId, intervalSec = 3600, n = 200) {
    const market = this._market(marketId);
    const count = Math.min(500, Math.max(20, Number(n) || 200));
    const to = Math.floor(Date.now() / 1000);
    const result = await this._request('GET', '/v1/perps/candles', {
      market: market.exchangeSymbol,
      resolution: INTERVALS[intervalSec] || '60',
      from: to - count * intervalSec,
      to,
    }, null, Boolean(this.keyId && this.apiSecret));
    return resultList(result, 'candles').map((row) => ({
      time: Date.parse(row.startTime || row.time),
      open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close), volume: Number(row.volume || 0),
    })).filter((row) => Number.isFinite(row.time) && row.close > 0);
  }

  async _pollPrices() {
    const result = await this._request('GET', '/v1/perps/mark_prices');
    for (const [symbol, row] of Object.entries(result || {})) {
      const marketId = this.marketToId.get(symbol);
      const price = Number(row?.markPrice || row?.price || row);
      if (marketId && price > 0) this._prices.set(marketId, price);
    }
  }

  async getPrice(marketId) {
    const id = Number(marketId);
    this._market(id);
    this._watch.add(id);
    await this._pollPrices();
    const price = this._prices.get(id);
    if (!(price > 0)) throw new Error(`Ondo Perps ${this._market(id).exchangeSymbol} 未返回有效标记价格。`);
    return price;
  }

  async preflightTrading() {
    const account = await this._request('GET', '/v1/perps/balance', {}, null, true);
    if (account?.underLiquidation) throw new Error('Ondo Perps 账户正在清算，已阻止启动新网格。');
    const available = Number(account?.availableMargin ?? account?.marginBalance ?? 0);
    if (!(available > 0)) throw new Error('Ondo Perps 可用保证金不足，请先存入 USDC。');
    return true;
  }

  async setLeverage(marketId, leverage) {
    const market = this._market(marketId);
    const next = Math.max(1, Math.min(market.maxLeverage, Math.floor(Number(leverage) || 1)));
    await this._request('POST', '/v1/perps/leverage', {}, { market: market.exchangeSymbol, leverage: String(next) }, true);
    return true;
  }

  _orderBody(order, type = 'limit') {
    const market = this._market(order.marketId);
    const size = floorToStep(order.sizeBase, market.stepSize);
    if (!(size >= market.minOrderSize)) throw new Error(`Ondo Perps 下单数量 ${size} 小于最小精度 ${market.minOrderSize}。`);
    const clientOrderId = `wl_${String(order.clientOrderId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '').slice(-56)}`;
    const body = {
      market: market.exchangeSymbol,
      side: order.side === 'buy' ? 'buy' : 'sell',
      type,
      size: String(size),
      clientOrderId,
      reduceOnly: Boolean(order.reduceOnly),
    };
    if (type === 'limit') {
      body.price = String(floorToStep(order.price, market.stepPrice));
      body.timeInForce = 'GTC';
      body.postOnly = Boolean(order.postOnly);
    }
    return { market, body };
  }

  async placeLimitOrder(order) {
    const { body } = this._orderBody(order, 'limit');
    let result;
    try {
      result = await this._request('POST', '/v1/perps/orders', {}, body, true);
    } catch (error) {
      if (!error.statusUnknown) throw error;
      try {
        result = await this._request('GET', `/v1/perps/orders/client:${encodeURIComponent(body.clientOrderId)}`, {}, null, true);
      } catch {
        error.message += '；订单状态未知，已停止自动重试，请先在 Ondo Perps 订单页核对。';
        throw error;
      }
    }
    return this._trackPlacedOrder(order, body, result);
  }

  _trackPlacedOrder(order, body, result) {
    const orderId = String(result?.orderId || result?.id || '');
    if (!orderId) throw new Error('Ondo Perps 下单响应缺少 orderId，已停止继续操作。');
    // Keep the adapter contract tied to the caller-supplied client id. Ondo's
    // wire id is namespaced with `wl_`, while GridBot correlates a batch with
    // the original id it generated. Returning the wire id here made every
    // successfully accepted batch look like 0/N to GridBot even though the
    // live orders already existed on the exchange.
    const clientOrderId = String(order?.clientOrderId ?? body.clientOrderId);
    this._watch.add(Number(order.marketId));
    this._tracked.set(orderId, {
      orderId, marketId: Number(order.marketId), levelIndex: order.levelIndex,
      side: order.side, price: Number(body.price), sizeBase: Number(body.size), clientOrderId: body.clientOrderId,
    });
    return { orderId, clientOrderId, exchangeClientOrderId: body.clientOrderId };
  }

  _matchBatchResult(row, chunk, accounted) {
    const clientOrderId = String(batchRowValue(row, 'clientOrderId', ['client_order_id']) || '');
    if (clientOrderId) {
      const exact = chunk.find((item) => item.body.clientOrderId === clientOrderId);
      if (exact && !accounted.has(exact.body.clientOrderId)) return exact;
    }

    // Ondo's official ApiOrder schema makes clientOrderId optional. Correlate
    // successful rows with the original request using the immutable order
    // fields instead. Grid prices are unique, so this remains deterministic.
    const market = String(batchRowValue(row, 'market') || '');
    const side = String(batchRowValue(row, 'side') || '').toLowerCase();
    const price = batchRowValue(row, 'price', ['limitPrice', 'limit_price']);
    const size = batchRowValue(row, 'size', ['quantity', 'orderSize', 'order_size']);
    if (!market || !side || price === undefined || size === undefined) return null;
    const matches = chunk.filter((item) => (
      !accounted.has(item.body.clientOrderId)
      && item.body.market === market
      && item.body.side === side
      && sameOrderNumber(item.body.price, price)
      && sameOrderNumber(item.body.size, size)
    ));
    return matches.length === 1 ? matches[0] : null;
  }

  /**
   * Ondo's official batch endpoint accepts at most 20 orders. Using it avoids
   * exhausting the per-account request budget when a 30/40/80-level grid is
   * seeded. Explicit 429 responses are retried by the account scheduler.
   */
  async placeLimitOrders(orders) {
    const source = Array.isArray(orders) ? orders : [];
    if (!source.length) return { placed: [], failed: [] };
    const prepared = source.map((order) => {
      const { body } = this._orderBody(order, 'limit');
      return { order, body };
    });
    const placed = [];
    const failed = [];

    for (let offset = 0; offset < prepared.length; offset += 20) {
      const chunk = prepared.slice(offset, offset + 20);
      let result;
      try {
        result = await this._request('POST', '/v1/perps/orders/batch', {}, { orders: chunk.map((item) => item.body) }, true);
      } catch (error) {
        // A transport/5xx failure has unknown execution state. Reconcile every
        // client id once; never replay an ambiguous batch and risk duplicates.
        if (error.statusUnknown) {
          for (const item of chunk) {
            try {
              const row = await this._request('GET', `/v1/perps/orders/client:${encodeURIComponent(item.body.clientOrderId)}`, {}, null, true);
              placed.push(this._trackPlacedOrder(item.order, item.body, row));
            } catch { /* unresolved below */ }
          }
          error.message += '；批量请求状态未知，已按 clientOrderId 对账，未确认部分不会自动重放。';
        }
        error.partialOrders = placed;
        throw error;
      }

      const accounted = new Set();
      for (const row of resultList(result, 'addedOrders')) {
        const item = this._matchBatchResult(row, chunk, accounted);
        if (!item) continue;
        accounted.add(item.body.clientOrderId);
        placed.push(this._trackPlacedOrder(item.order, item.body, row));
      }
      const byClientId = new Map(chunk.map((item) => [item.body.clientOrderId, item]));
      for (const row of resultList(result, 'failedOrders')) {
        const clientOrderId = String(batchRowValue(row, 'clientOrderId', ['client_order_id']) || '');
        const item = byClientId.get(clientOrderId);
        if (clientOrderId) accounted.add(clientOrderId);
        failed.push({
          clientOrderId,
          levelIndex: item?.order?.levelIndex,
          code: row?.errorCode || 'batch_order_failed',
          message: row?.error || 'Ondo Perps 批量下单中的订单被拒绝',
        });
      }

      // A successful batch response may omit individual rows or omit the
      // optional clientOrderId. Confirm only the unresolved client ids with a
      // read request. Never replay the batch: doing so could create duplicates.
      for (const item of chunk) {
        if (accounted.has(item.body.clientOrderId)) continue;
        try {
          const row = await this._request('GET', `/v1/perps/orders/client:${encodeURIComponent(item.body.clientOrderId)}`, {}, null, true);
          if (!row?.orderId && !row?.id) continue;
          accounted.add(item.body.clientOrderId);
          placed.push(this._trackPlacedOrder(item.order, item.body, row));
        } catch { /* unresolved below */ }
      }
      for (const item of chunk) {
        if (!accounted.has(item.body.clientOrderId)) {
          failed.push({
            clientOrderId: item.body.clientOrderId,
            levelIndex: item.order.levelIndex,
            code: 'batch_order_unconfirmed',
            message: 'Ondo Perps 批量响应未包含该订单结果，且按 clientOrderId 回查未确认',
          });
        }
      }
    }
    return { placed, failed };
  }

  async cancelOrder(marketId, orderId) {
    this._market(marketId);
    const result = await this._request('DELETE', `/v1/perps/orders/${encodeURIComponent(orderId)}`, {}, null, true);
    this._tracked.delete(String(orderId));
    return result;
  }

  async cancelAll(marketId) {
    const market = this._market(marketId);
    const result = await this._request('DELETE', '/v1/perps/orders', { market: market.exchangeSymbol }, null, true);
    for (const [orderId, order] of this._tracked) if (order.marketId === Number(marketId)) this._tracked.delete(orderId);
    return result;
  }

  getOpenOrders(marketId) {
    return [...this._tracked.values()].filter((order) => order.marketId === Number(marketId));
  }

  async fetchOpenOrders(marketId) {
    const market = this._market(marketId);
    const result = await this._request('GET', '/v1/perps/orders', { market: market.exchangeSymbol }, null, true);
    return resultList(result, 'orders')
      .filter((order) => ['open', 'pending', 'untriggered'].includes(String(order.status || 'open').toLowerCase()))
      .map((order) => ({
        orderId: String(order.orderId || order.id),
        clientOrderId: String(order.clientOrderId || order.client_order_id || ''),
        price: Number(order.price),
        sizeBase: Number(order.size || order.quantity || 0),
        side: String(order.side).toLowerCase(),
      }));
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
    const { body } = this._orderBody({
      marketId: id,
      side: position.sizeBase > 0 ? 'sell' : 'buy',
      sizeBase: Math.abs(position.sizeBase),
      reduceOnly: true,
      clientOrderId: `close_${Date.now()}`,
    }, 'market');
    await this._request('POST', '/v1/perps/orders', {}, body, true);
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
    const result = await this._request('GET', '/v1/perps/positions', {}, null, true);
    const row = resultList(result, 'positions').find((item) => item.market === market.exchangeSymbol);
    let amount = Number(row?.netQuantity || row?.size || 0);
    if (amount > 0 && String(row?.direction).toLowerCase() === 'short') amount = -amount;
    if (!amount) this._positions.delete(Number(marketId));
    else {
      const liquidation = extractLiquidationPrice(row);
      this._positions.set(Number(marketId), {
        sizeBase: amount,
        entryPrice: Number(row.averageEntryPrice || row.entryPrice || 0),
        ...liquidation,
        unrealizedPnl: Number(row.unrealizedPnl || 0),
        leverage: Number(row.leverage || 0) || null,
      });
    }
  }

  async _refreshAccount() {
    const account = await this._request('GET', '/v1/perps/balance', {}, null, true);
    this.balance = Number(account.walletBalance ?? account.marginBalance ?? 0);
    this.equity = Number(account.marginBalance ?? this.balance + Number(account.unrealizedPnl || 0));
    this.realizedPnl = Number(account.realizedPnl ?? account.totalPnL ?? 0);
  }

  async _resolveGone(orderId, tracked) {
    let order;
    try { order = await this._request('GET', `/v1/perps/orders/${encodeURIComponent(orderId)}`, {}, null, true); }
    catch (error) {
      if (error.httpStatus === 404 || error.exchangeCode === 'order_not_found') this._tracked.delete(String(orderId));
      return;
    }
    const status = String(order?.status || '').toLowerCase();
    if (!['fullyfilled', 'canceled', 'cancelled', 'expired'].includes(status)) return;
    this._tracked.delete(String(orderId));
    const filled = Number(order.filledSize || order.executedSize || 0);
    if (!(filled > 0)) return;
    this.emit('fill', {
      orderId: String(orderId), marketId: tracked.marketId, levelIndex: tracked.levelIndex,
      side: tracked.side, price: Number(order.averageFillPrice || order.price || tracked.price), sizeBase: filled,
    });
  }

  async _poll() {
    if (this._busy) return;
    this._busy = true;
    try {
      await this._pollPrices();
      for (const marketId of this._watch) {
        const price = this._prices.get(marketId);
        if (price > 0) this.emit('price', { marketId, price });
        const live = new Set((await this.fetchOpenOrders(marketId)).map((order) => String(order.orderId)));
        for (const [orderId, tracked] of [...this._tracked]) {
          if (tracked.marketId === marketId && !live.has(orderId)) await this._resolveGone(orderId, tracked);
        }
        await this._refreshPosition(marketId);
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
