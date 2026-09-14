import { createDispatcher, connectionError } from '../../proxy.js';
import { BinancePaperExchange } from '../binance/paper.js';

const INTERVALS = {
  60: '1m', 180: '3m', 300: '5m', 900: '15m', 1800: '30m',
  3600: '1h', 7200: '2h', 14400: '4h', 28800: '8h', 43200: '12h', 86400: '1d',
};

function powerStep(decimals) {
  const places = Math.max(0, Math.min(12, Number(decimals) || 0));
  return Number(`1e-${places}`);
}

export function entropyAssetId(perpDexs, dexName, universeIndex) {
  const index = (Array.isArray(perpDexs) ? perpDexs : []).findIndex((row) => row?.name === dexName);
  if (index < 0) throw new Error(`Hyperliquid 未返回 Entropy DEX（${dexName}）。`);
  if (!Number.isInteger(universeIndex) || universeIndex < 0) throw new Error('Entropy 市场序号无效。');
  // Hyperliquid HIP-3 asset IDs are derived from the live perpDexs ordering.
  // Never pin Entropy to a hard-coded numeric range: deployer ordering can move.
  return 100000 + index * 10000 + universeIndex;
}

export function mapEntropyMarkets(perpDexs, payload, dexName = 'io') {
  const [meta, contexts] = Array.isArray(payload) ? payload : [];
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  if (!universe.length) throw new Error('Entropy 官方接口未返回 HIP-3 市场。');
  return universe.flatMap((row, index) => {
    if (row?.isDelisted === true) return [];
    const name = String(row?.name || '');
    if (!name.startsWith(`${dexName}:`)) return [];
    const context = Array.isArray(contexts) ? contexts[index] || {} : {};
    const symbol = name.slice(dexName.length + 1);
    const szDecimals = Math.max(0, Number(row?.szDecimals) || 0);
    const priceDecimals = Math.max(0, 6 - szDecimals);
    const price = Number(context.markPx || context.midPx || context.oraclePx || 0);
    return [{
      marketId: entropyAssetId(perpDexs, dexName, index),
      name,
      displayName: `${symbol}/USD`,
      symbol,
      exchangeSymbol: name,
      lastPrice: price > 0 ? price : null,
      stepSize: powerStep(szDecimals),
      sizeIncrement: powerStep(szDecimals),
      stepPrice: powerStep(priceDecimals),
      minOrderSize: powerStep(szDecimals),
      minNotional: 0,
      maxLeverage: Math.max(1, Number(row?.maxLeverage) || 1),
      isolatedOnly: row?.onlyIsolated === true || row?.marginMode === 'strictIsolated',
      szDecimals,
      universeIndex: index,
    }];
  });
}

export class EntropyPaperExchange extends BinancePaperExchange {
  constructor(opts = {}) {
    super(opts);
    this.mode = 'paper';
    this.network = 'mainnet';
    this.apiUrl = String(opts.apiUrl || 'https://api.hyperliquid.xyz').replace(/\/$/, '');
    this.dex = String(opts.dex || 'io').trim() || 'io';
    this.proxy = String(opts.proxy || '');
    this.dispatcher = null;
    this._perpDexs = [];
  }

  async _ensureDispatcher() {
    if (!this.proxy || this.proxy === 'direct' || this.dispatcher) return this.dispatcher;
    this.dispatcher = await createDispatcher(this.proxy);
    if (!this.dispatcher) throw new Error('Entropy 专用代理初始化失败，请检查 ENTROPY_PROXY。');
    return this.dispatcher;
  }

  async _info(body) {
    let response;
    try {
      const dispatcher = await this._ensureDispatcher();
      response = await fetch(`${this.apiUrl}/info`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        ...(dispatcher ? { dispatcher } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch (cause) {
      const detail = connectionError(cause);
      const error = new Error(`Entropy / Hyperliquid 官方行情请求失败（${detail.code}）：请检查本机网络或 ENTROPY_PROXY。`);
      error.cause = cause;
      error.diagnosticCode = detail.code;
      throw error;
    }
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok) {
      throw new Error(`Entropy / Hyperliquid 官方接口错误 ${response.status}: ${payload?.error || payload?.message || response.statusText}`);
    }
    this.lastOkAt = Date.now();
    return payload;
  }

  async init() {
    await this._loadMarkets();
    await this._pollPrices();
    this.dataSource = 'real';
    this.lastError = null;
    this.lastOkAt = Date.now();
    this.start();
    return true;
  }

  async _loadMarkets() {
    const [perpDexs, marketPayload] = await Promise.all([
      this._info({ type: 'perpDexs' }),
      this._info({ type: 'metaAndAssetCtxs', dex: this.dex }),
    ]);
    const markets = mapEntropyMarkets(perpDexs, marketPayload, this.dex);
    if (!markets.length) throw new Error('Entropy 当前没有可用的在线市场。');
    this._perpDexs = perpDexs;
    this.markets.clear();
    this.symbolToId.clear();
    this._prices.clear();
    for (const market of markets) {
      this.markets.set(market.marketId, market);
      this.symbolToId.set(market.exchangeSymbol, market.marketId);
      if (market.lastPrice > 0) this._prices.set(market.marketId, market.lastPrice);
    }
  }

  async getCandles(marketId, seconds = 3600, count = 200) {
    const market = this._market(marketId);
    const interval = INTERVALS[seconds] || '1h';
    const durationMs = Math.max(60, Number(seconds) || 3600) * 1000;
    const endTime = Date.now();
    const startTime = endTime - durationMs * Math.min(5000, Math.max(20, Number(count) || 200));
    const rows = await this._info({
      type: 'candleSnapshot',
      req: { coin: market.exchangeSymbol, interval, startTime, endTime },
    });
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      time: Number(row.t || row.time || 0),
      open: Number(row.o || row.open),
      high: Number(row.h || row.high),
      low: Number(row.l || row.low),
      close: Number(row.c || row.close),
      volume: Number(row.v || row.volume || 0),
    })).filter((row) => row.time > 0 && row.close > 0).slice(-Math.max(20, Number(count) || 200));
  }

  async _pollPrices() {
    const payload = await this._info({ type: 'metaAndAssetCtxs', dex: this.dex });
    const markets = mapEntropyMarkets(this._perpDexs, payload, this.dex);
    for (const market of markets) {
      const current = this.markets.get(market.marketId);
      if (!current) continue;
      Object.assign(current, market);
      if (market.lastPrice > 0) this._prices.set(market.marketId, market.lastPrice);
    }
  }
}

export class EntropyLiveUnavailableExchange extends EntropyPaperExchange {
  constructor(opts = {}) {
    super(opts);
    this.mode = 'live';
  }

  _unsupported() {
    const error = new Error('Entropy 实盘暂未开放：官方交易面复用 Hyperliquid HIP-3，但本版本尚未完成 agent wallet、nonce、EIP-712 与 isolated collateral 的端到端签名验收。请使用 PAPER；系统不会把模拟订单伪装成实盘。');
    error.code = 'ENTROPY_LIVE_NOT_AVAILABLE';
    throw error;
  }

  async init() { return this._unsupported(); }
  async preflightTrading() { return this._unsupported(); }
  async setLeverage() { return this._unsupported(); }
  async placeLimitOrder() { return this._unsupported(); }
  async placeLimitOrders() { return this._unsupported(); }
  async cancelOrder() { return this._unsupported(); }
  async cancelAll() { return this._unsupported(); }
  async closePosition() { return this._unsupported(); }
}
