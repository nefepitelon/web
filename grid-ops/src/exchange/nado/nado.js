import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import BigNumber from 'bignumber.js';
import { createNadoClient } from '@nadohq/client';
import {
  ProductEngineType,
  addDecimals,
  nowInSeconds,
  packOrderAppendix,
} from '@nadohq/shared';
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ink, inkSepolia } from 'viem/chains';
import { extractLiquidationPrice } from '../liquidation-price.js';

const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const X18 = new BigNumber(10).pow(18);
const CANDLE_PERIODS = [60, 300, 900, 3600, 7200, 14400, 86400, 604800, 2419200];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const humanAmount = (value) => Number(new BigNumber(value?.toString?.() ?? value ?? 0).div(X18).toString());
const asNumber = (value) => Number(value?.toString?.() ?? value ?? 0);
const decimalsFor = (step) => Math.max(0, Math.min(12, String(step).split('.')[1]?.length || 0));

/**
 * Nado's official subaccount summary exposes maintenance health and per-product
 * risk weights, but not a precomputed liquidation boundary. Derive the price at
 * which maintenance health reaches zero, and only accept it after verifying
 * that the SDK's reported per-product contribution matches the documented
 * weighted-health equation. Accounts with non-quote spot exposure are skipped
 * because spread-health makes the single-price equation path dependent.
 */
export function deriveNadoLiquidationPrice(summary, positionRow) {
  const unavailable = {
    liquidationPrice: null,
    liquidationPriceStatus: 'unavailable',
    liquidationPriceSource: null,
  };
  if (!summary || !positionRow) return unavailable;

  const spotExposure = (summary.balances || []).some((row) => (
    Number(row.type) === ProductEngineType.SPOT
    && Number(row.productId) !== 0
    && Math.abs(humanAmount(row.amount)) > 1e-12
  ));
  if (spotExposure) return unavailable;

  const size = humanAmount(positionRow.amount);
  const oracle = asNumber(positionRow.oraclePrice);
  const vQuote = humanAmount(positionRow.vQuoteBalance);
  const weight = asNumber(size > 0
    ? positionRow.longWeightMaintenance
    : positionRow.shortWeightMaintenance);
  const maintenanceHealth = humanAmount(summary.health?.maintenance?.health);
  const reportedContribution = humanAmount(positionRow.healthContributions?.maintenance);
  if (!Number.isFinite(size) || !size || !(oracle > 0) || !(weight > 0)
    || !Number.isFinite(vQuote) || !Number.isFinite(maintenanceHealth)
    || !Number.isFinite(reportedContribution)) return unavailable;

  const expectedContribution = size * oracle * weight + vQuote;
  const tolerance = Math.max(0.02, Math.abs(reportedContribution) * 1e-6);
  if (Math.abs(expectedContribution - reportedContribution) > tolerance) return unavailable;

  // The account is already eligible for liquidation at the current oracle.
  if (maintenanceHealth <= 0) {
    return {
      liquidationPrice: oracle,
      liquidationPriceStatus: 'available',
      liquidationPriceSource: 'derived-maintenance-health',
    };
  }
  const slope = size * weight;
  const boundary = oracle - (maintenanceHealth / slope);
  if (!Number.isFinite(boundary)) return unavailable;
  if (boundary <= 0) {
    return {
      liquidationPrice: null,
      liquidationPriceStatus: 'none',
      liquidationPriceSource: 'derived-maintenance-health',
    };
  }
  return {
    liquidationPrice: boundary,
    liquidationPriceStatus: 'available',
    liquidationPriceSource: 'derived-maintenance-health',
  };
}

export function floorNadoStep(value, step) {
  const increment = Number(step);
  if (!(increment > 0)) return Number(value);
  return Number((Math.floor((Number(value) + increment * 1e-9) / increment) * increment).toFixed(decimalsFor(increment)));
}

export function ceilNadoStep(value, step) {
  const increment = Number(step);
  if (!(increment > 0)) return Number(value);
  const rounded = new BigNumber(value)
    .div(increment)
    .integerValue(BigNumber.ROUND_CEIL)
    .times(increment);
  return Number(rounded.toFixed(decimalsFor(increment)));
}

export function decodeNadoPrivateKey(raw) {
  let value = String(raw || '').trim();
  if (!value) throw new Error('Nado 私钥为空。');
  if (value.startsWith('{') || value.startsWith('[') || value.startsWith('"')) {
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new Error('Nado 私钥文件 JSON 格式无效。'); }
    if (typeof parsed === 'string') value = parsed.trim();
    else if (Array.isArray(parsed)) {
      if (parsed.length !== 32 || parsed.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
        throw new Error('Nado 字节数组私钥必须正好包含 32 个 0-255 整数。');
      }
      value = Buffer.from(parsed).toString('hex');
    } else {
      value = String(parsed.privateKey || parsed.private_key || parsed.key || '').trim();
    }
  }
  const hex = value.replace(/^0x/i, '');
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Nado 私钥必须是 32 字节 Hex（64 个十六进制字符）。');
  return `0x${hex.toLowerCase()}`;
}

export function readNadoPrivateKey({ privateKey = '', keyPath = '', rootDir = ENGINE_ROOT } = {}) {
  if (String(privateKey).trim()) return decodeNadoPrivateKey(privateKey);
  if (!String(keyPath).trim()) throw new Error('请配置 NADO_PRIVATE_KEY 或 NADO_KEY_PATH。');
  const resolved = path.isAbsolute(keyPath) ? path.normalize(keyPath) : path.resolve(rootDir, keyPath);
  if (!fs.existsSync(resolved)) throw new Error(`Nado 私钥文件不存在：${resolved}`);
  return decodeNadoPrivateKey(fs.readFileSync(resolved, 'utf8'));
}

/** Make every official SDK HTTP client use Grid Ops' selected per-host fetch route. */
export function configureNadoSdkNetwork(client) {
  for (const sdkClient of [
    client?.context?.engineClient,
    client?.context?.indexerClient,
    client?.context?.triggerClient,
    client?.context?.mobileClient,
  ]) {
    const defaults = sdkClient?.axiosInstance?.defaults;
    if (!defaults) continue;
    defaults.adapter = 'fetch';
    defaults.proxy = false;
    defaults.timeout = 20000;
    defaults.env = {
      fetch: globalThis.fetch.bind(globalThis),
      Request: globalThis.Request,
      Response: globalThis.Response,
    };
  }
  return client;
}

function maxLeverage(symbol) {
  const weight = asNumber(symbol?.longWeightInitial);
  if (!(weight >= 0 && weight < 1)) return 1;
  return Math.max(1, Math.floor((1 / (1 - weight)) + 1e-7));
}

function nearestCandlePeriod(seconds) {
  const target = Number(seconds) || 3600;
  return CANDLE_PERIODS.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, 3600);
}

export class NadoExchange extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.mode = 'live';
    this.network = opts.network === 'testnet' ? 'testnet' : 'mainnet';
    this.rpcUrl = String(opts.rpcUrl || (this.network === 'testnet'
      ? 'https://rpc-gel-sepolia.inkonchain.com'
      : 'https://rpc-gel.inkonchain.com')).replace(/\/$/, '');
    this.apiUrl = String(opts.apiUrl || (this.network === 'testnet'
      ? 'https://gateway.test.nado.xyz/v1'
      : 'https://gateway.prod.nado.xyz/v1')).replace(/\/$/, '');
    this.privateKey = opts.privateKey || '';
    this.keyPath = opts.keyPath || 'secrets/nado.key';
    this.address = String(opts.address || '').trim();
    this.subaccount = String(opts.subaccount || 'default').trim() || 'default';
    this.btcProductId = Number(opts.btcProductId) || 2;
    this.orderGapMs = Math.max(200, Number(opts.orderGapMs) || 200);
    this.configuredLeverage = Number(opts.leverage) > 0 ? Number(opts.leverage) : null;
    this.pollMs = Math.max(2500, Number(opts.pollMs) || 4000);
    this.proxy = opts.proxy || 'direct';
    this.client = opts.client || null;
    this.signer = opts.signer || null;
    this.owner = this.address || opts.owner || '';
    this.chain = this.network === 'testnet' ? inkSepolia : ink;
    this.chainEnv = this.network === 'testnet' ? 'inkTestnet' : 'inkMainnet';
    this._rootDir = opts.rootDir || ENGINE_ROOT;
    this.markets = new Map();
    this.marketToId = new Map();
    this._prices = new Map();
    this._positions = new Map();
    this._tracked = new Map();
    this._watch = new Set();
    this._timer = null;
    this._busy = false;
    this._writeTail = Promise.resolve();
    this._lastWriteAt = 0;
    this._gonePolls = new Map();
    this.balance = null;
    this.equity = null;
    this.availableMargin = null;
    this.realizedPnl = null;
    this.feeRate = 0.0001;
    this.lastOkAt = null;
    this.lastError = null;
    this.dataSource = null;
  }

  _ensureClient({ requireSigner = this.mode === 'live' } = {}) {
    if (this.client) return configureNadoSdkNetwork(this.client);
    const publicClient = createPublicClient({ chain: this.chain, transport: http(this.rpcUrl) });
    const accountOpts = { publicClient };
    if (requireSigner) {
      const privateKey = readNadoPrivateKey({ privateKey: this.privateKey, keyPath: this.keyPath, rootDir: this._rootDir });
      const account = privateKeyToAccount(privateKey);
      this.signer = account;
      const signerClient = createWalletClient({ account, chain: this.chain, transport: http(this.rpcUrl) });
      this.owner = this.owner || account.address;
      if (!isAddress(this.owner)) throw new Error('NADO_ADDRESS 不是有效的 EVM/Ink 账户地址。');
      if (this.owner.toLowerCase() === account.address.toLowerCase()) accountOpts.walletClient = signerClient;
      else accountOpts.linkedSignerWalletClient = signerClient;
    }
    this.client = configureNadoSdkNetwork(createNadoClient({ chainEnv: this.chainEnv, clientType: 'welinkbtc-grid-ops' }, accountOpts));
    return this.client;
  }

  _subaccount() {
    if (!this.owner) throw new Error('Nado 账户地址尚未初始化。');
    return { subaccountOwner: this.owner, subaccountName: this.subaccount };
  }

  async init() {
    this._ensureClient({ requireSigner: true });
    await this._loadMarkets();
    await this._pollPrices();
    try {
      await this._refreshAccount();
      await this._validateLinkedSigner();
    } catch (error) {
      throw new Error(`Nado 账户读取失败：${error?.message || error}。请确认 Ink 地址、子账户与 linked signer 配置。`);
    }
    this.dataSource = 'real';
    this.lastOkAt = Date.now();
    this.start();
    return true;
  }

  async reconnect() {
    this.stop();
    this.client = null;
    this.dataSource = null;
    return this.init();
  }

  async setProxy(proxy) {
    const next = String(proxy || 'direct');
    if (next === this.proxy) return false;
    this.proxy = next;
    return true;
  }

  async _validateLinkedSigner() {
    if (!this.signer || !this.owner || this.owner.toLowerCase() === this.signer.address.toLowerCase()) return true;
    const result = await this._ensureClient().context.engineClient.getLinkedSigner(this._subaccount());
    if (String(result?.signer || '').toLowerCase() !== this.signer.address.toLowerCase()) {
      throw new Error(`当前 NADO_PRIVATE_KEY 对应 ${this.signer.address}，但 ${this.owner}/${this.subaccount} 尚未将其设为 linked signer`);
    }
    return true;
  }

  async _loadMarkets() {
    const client = this._ensureClient({ requireSigner: false });
    const [rows, symbolResult] = await Promise.all([
      client.market.getAllMarkets(),
      client.market.getSymbols(),
    ]);
    const symbols = new Map(Object.values(symbolResult?.symbols || {}).map((item) => [Number(item.productId), item]));
    this.markets.clear();
    this.marketToId.clear();
    // A reconnect or network switch must not retain a quote/watch/position from
    // a previous product map. Product IDs are network-scoped, so reusing a
    // cached value here can associate a valid price with the wrong market.
    this._prices.clear();
    this._positions.clear();
    this._watch.clear();
    for (const row of rows) {
      const symbol = symbols.get(Number(row.productId));
      if (!symbol || Number(row.type) !== ProductEngineType.PERP || Number(symbol.type) !== ProductEngineType.PERP) continue;
      const stepSize = humanAmount(symbol.sizeIncrement);
      const limit = maxLeverage(symbol);
      const exchangeSymbol = String(symbol.symbol);
      const asset = exchangeSymbol.replace(/-PERP$/i, '');
      const market = {
        marketId: Number(row.productId),
        name: exchangeSymbol,
        displayName: `${asset}/USD`,
        longName: asset,
        symbol: asset,
        exchangeSymbol,
        lastPrice: asNumber(row.product?.oraclePrice) || null,
        stepSize,
        stepPrice: asNumber(symbol.priceIncrement),
        minOrderSize: stepSize,
        minNotional: humanAmount(symbol.minSize),
        maxOrderSize: asNumber(symbol.maxOpenInterest) || Number.MAX_SAFE_INTEGER,
        maxLeverage: this.configuredLeverage ? Math.min(limit, this.configuredLeverage) : limit,
        defaultLeverage: this.configuredLeverage ? Math.min(limit, this.configuredLeverage) : Math.min(3, limit),
        makerFee: asNumber(symbol.makerFeeRate),
        takerFee: asNumber(symbol.takerFeeRate),
        isolatedOnly: Boolean(symbol.isolatedOnly),
      };
      this.markets.set(market.marketId, market);
      this.marketToId.set(exchangeSymbol, market.marketId);
      if (market.lastPrice > 0) this._prices.set(market.marketId, market.lastPrice);
    }
    if (!this.markets.size) throw new Error('Nado 官方 API 未返回可交易永续市场。');
    this.markets = new Map([...this.markets.entries()].sort(([, a], [, b]) => {
      if (a.marketId === this.btcProductId) return -1;
      if (b.marketId === this.btcProductId) return 1;
      return a.exchangeSymbol.localeCompare(b.exchangeSymbol);
    }));
    this.feeRate = this.markets.values().next().value?.makerFee || this.feeRate;
  }

  async getMarkets() { return [...this.markets.values()]; }

  _market(marketId) {
    const market = this.markets.get(Number(marketId));
    if (!market) throw new Error(`Nado 未知市场 ID：${marketId}`);
    return market;
  }

  async getCandles(marketId, intervalSec = 3600, n = 200) {
    this._market(marketId);
    const rows = await this._ensureClient().market.getCandlesticks({
      productId: Number(marketId),
      period: nearestCandlePeriod(intervalSec),
      limit: Math.min(500, Math.max(20, Number(n) || 200)),
    });
    const byTime = new Map();
    for (const row of rows || []) {
      const candle = {
        time: asNumber(row.time) * 1000,
        open: asNumber(row.open), high: asNumber(row.high), low: asNumber(row.low), close: asNumber(row.close),
        volume: humanAmount(row.volume),
      };
      if (!Number.isFinite(candle.time) || !(candle.close > 0)) continue;
      byTime.set(candle.time, candle);
    }
    // The archive API is a historical query and may return newest-first. Every
    // indicator in Grid Ops expects chronological candles.
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }

  async _pollPrice(marketId) {
    const id = Number(marketId);
    const market = this._market(id);
    const result = await this._ensureClient().market.getLatestMarketPrice({ productId: id });
    if (result?.productId != null && Number(result.productId) !== id) {
      throw new Error(`Nado 行情响应产品不匹配：请求 ${id}，返回 ${result.productId}；已拒绝更新缓存。`);
    }
    const bid = asNumber(result?.bid), ask = asNumber(result?.ask);
    if (!(bid > 0) || !(ask > 0)) {
      throw new Error(`Nado ${market.exchangeSymbol} 未返回完整买一/卖一，已拒绝使用单边或缓存价格生成网格。`);
    }
    if (bid > 0 && ask > 0 && bid > ask) {
      throw new Error(`Nado ${market.exchangeSymbol} 行情异常：bid ${bid} 高于 ask ${ask}；已拒绝用该快照挂单。`);
    }
    const price = (bid + ask) / 2;
    const reference = Number(market.lastPrice);
    if (price > 0 && reference > 0) {
      const ratio = price / reference;
      if (ratio > 1000 || ratio < 0.001) {
        throw new Error(`Nado 行情价格单位异常：${market.exchangeSymbol} 实时价 ${price} 与市场参考价 ${reference} 相差过大；已拒绝写入网格。`);
      }
    }
    if (price > 0) {
      this._prices.set(id, price);
      market.lastPrice = price;
    }
    return price;
  }

  async _pollPrices() {
    const ids = this._watch.size ? [...this._watch] : [this.btcProductId];
    await Promise.all(ids.filter((id) => this.markets.has(id)).map((id) => this._pollPrice(id)));
  }

  async getPrice(marketId) {
    const id = Number(marketId);
    this._market(id);
    this._watch.add(id);
    const price = await this._pollPrice(id);
    if (!(price > 0)) throw new Error(`Nado ${this._market(id).exchangeSymbol} 未返回有效价格。`);
    return price;
  }

  async _refreshAccount() {
    const summary = await this._ensureClient().subaccount.getSubaccountSummary(this._subaccount());
    if (!summary?.exists) throw new Error(`Nado 子账户 ${this.subaccount} 尚未创建`);
    const quote = (summary.balances || []).find((row) => (
      Number(row.type) === ProductEngineType.SPOT && Number(row.productId) === 0
    ));
    this.balance = quote ? humanAmount(quote.amount) : 0;
    const health = summary.health?.unweighted;
    if (health?.health != null) {
      this.equity = humanAmount(health.health);
    } else if (health?.assets != null && health?.liabilities != null) {
      this.equity = humanAmount(new BigNumber(health.assets).minus(health.liabilities));
    } else {
      this.equity = this.balance;
    }
    const initialHealth = summary.health?.initial?.health;
    this.availableMargin = initialHealth != null
      ? Math.max(0, humanAmount(initialHealth))
      : Math.max(0, Number(this.equity) || 0);
    this._positions.clear();
    for (const row of summary.balances || []) {
      if (Number(row.type) !== ProductEngineType.PERP) continue;
      const sizeBase = humanAmount(row.amount);
      if (!sizeBase || !this.markets.has(Number(row.productId))) continue;
      const vQuote = humanAmount(row.vQuoteBalance);
      const mark = this._prices.get(Number(row.productId)) || asNumber(row.oraclePrice);
      const entryPrice = Math.abs(vQuote / sizeBase);
      const exchangeLiquidation = extractLiquidationPrice(row);
      const liquidation = exchangeLiquidation.liquidationPriceStatus !== 'unavailable'
        ? exchangeLiquidation
        : deriveNadoLiquidationPrice(summary, row);
      this._positions.set(Number(row.productId), {
        sizeBase,
        entryPrice,
        ...liquidation,
        unrealizedPnl: sizeBase * mark + vQuote,
        leverage: this.configuredLeverage,
      });
    }
    return summary;
  }

  async preflightTrading(marketId, context = {}) {
    await this._validateLinkedSigner();
    await this._refreshAccount();
    if (!(this.equity > 0)) throw new Error('Nado 可用保证金不足，请先向该子账户存入 USDT0 保证金。');
    if (!(this.availableMargin > 0)) {
      throw new Error('Nado 可用初始保证金不足：账户虽有权益，但 initial health 已用尽。请先降低仓位/撤单或补充 USDT0；尚未发送任何交易写请求。');
    }
    const market = this._market(marketId);
    const configuredSize = Number(context?.config?.sizeBase);
    const lowestPrice = Number(context?.config?.lower)
      || this._prices.get(Number(marketId))
      || Number(market.lastPrice);
    if (configuredSize > 0 && lowestPrice > 0 && market.minNotional > 0) {
      const requiredSize = ceilNadoStep(market.minNotional / lowestPrice, market.stepSize);
      if (configuredSize + market.stepSize * 1e-9 < requiredSize) {
        const asset = market.symbol || market.exchangeSymbol.replace(/-PERP$/i, '');
        throw new Error(`Nado 首单前最小名义价值预检未通过：每格 ${configuredSize} ${asset} 在最低挂单价 ${lowestPrice} 仅约 ${(configuredSize * lowestPrice).toFixed(4)} USDT0，低于 ${market.minNotional} USDT0；每格至少 ${requiredSize} ${asset}。请点击智能填充或提高每格数量；尚未发送任何交易写请求。`);
      }
    }
    return true;
  }

  async setLeverage(marketId, leverage) {
    const market = this._market(marketId);
    const value = Math.max(1, Math.floor(Number(leverage) || 1));
    if (value > market.maxLeverage) throw new Error(`Nado ${market.exchangeSymbol} 当前最大允许杠杆为 ${market.maxLeverage}x。`);
    return true;
  }

  getPosition(marketId) {
    const position = this._positions.get(Number(marketId));
    return position?.sizeBase ? position : null;
  }

  getOpenOrders(marketId) {
    return [...this._tracked.values()].filter((order) => order.marketId === Number(marketId));
  }

  async fetchOpenOrders(marketId) {
    this._market(marketId);
    const result = await this._ensureClient().market.getOpenSubaccountOrders({
      ...this._subaccount(), productId: Number(marketId),
    });
    return (result?.orders || []).map((row) => ({
      orderId: String(row.digest),
      marketId: Number(row.productId),
      side: new BigNumber(row.totalAmount).isPositive() ? 'buy' : 'sell',
      price: asNumber(row.price),
      sizeBase: Math.abs(humanAmount(row.unfilledAmount)),
      reduceOnly: Boolean(row.appendix?.reduceOnly),
      placementTime: Number(row.placementTime || 0),
    }));
  }

  adoptOrder(order) {
    this._tracked.set(String(order.orderId), {
      ...order,
      orderId: String(order.orderId), marketId: Number(order.marketId), price: Number(order.price), sizeBase: Number(order.sizeBase),
    });
  }

  async _serializeWrite(task) {
    const execute = async () => {
      const wait = this.orderGapMs - (Date.now() - this._lastWriteAt);
      if (wait > 0) await sleep(wait);
      try { return await task(); } finally { this._lastWriteAt = Date.now(); }
    };
    const result = this._writeTail.then(execute, execute);
    this._writeTail = result.catch(() => {});
    return result;
  }

  async _placeSignedOrder(order, executionType) {
    const market = this._market(order.marketId);
    const price = floorNadoStep(order.price, market.stepPrice);
    const size = floorNadoStep(order.sizeBase, market.stepSize);
    if (!(size >= market.minOrderSize)) throw new Error(`Nado 下单数量 ${size} 小于最小数量 ${market.minOrderSize}。`);
    if (market.minNotional > 0 && price * size < market.minNotional) {
      throw new Error(`Nado 订单名义价值 ${Number(price * size).toFixed(4)} 小于最低要求 ${market.minNotional}。`);
    }
    const signedSize = order.side === 'buy' ? size : -size;
    const result = await this._serializeWrite(() => this._ensureClient().market.placeOrder({
      productId: market.marketId,
      chainId: this.chain.id,
      order: {
        ...this._subaccount(),
        price: new BigNumber(price),
        amount: addDecimals(new BigNumber(signedSize)),
        expiration: BigInt(nowInSeconds() + 7 * 86400),
        appendix: packOrderAppendix({
          orderExecutionType: executionType,
          reduceOnly: Boolean(order.reduceOnly),
        }),
      },
    }));
    return { result, market, price, size };
  }

  async placeLimitOrder(order) {
    const { result, market, price, size } = await this._placeSignedOrder(order, 'post_only');
    const digest = String(result?.data?.digest || '');
    if (!digest) throw new Error('Nado 下单成功响应缺少订单 digest；已阻止自动重试，请到 Nado 订单页核对。');
    this._tracked.set(digest, {
      orderId: digest, marketId: market.marketId, levelIndex: order.levelIndex,
      side: order.side, price, sizeBase: size, reduceOnly: Boolean(order.reduceOnly),
    });
    this._watch.add(market.marketId);
    return { orderId: digest, price, sizeBase: size };
  }

  async cancelOrder(marketId, digest) {
    this._market(marketId);
    await this._serializeWrite(() => this._ensureClient().market.cancelOrders({
      ...this._subaccount(), chainId: this.chain.id,
      productIds: [Number(marketId)], digests: [String(digest)],
    }));
    this._tracked.delete(String(digest));
    this._gonePolls.delete(String(digest));
    return true;
  }

  async cancelAll(marketId) {
    this._market(marketId);
    await this._serializeWrite(() => this._ensureClient().market.cancelProductOrders({
      ...this._subaccount(), chainId: this.chain.id, productIds: [Number(marketId)],
    }));
    for (const [id, order] of this._tracked) if (order.marketId === Number(marketId)) this._tracked.delete(id);
    return true;
  }

  async closePosition(marketId) {
    await this._refreshAccount();
    const position = this._positions.get(Number(marketId));
    if (!position?.sizeBase) return true;
    const mark = await this.getPrice(marketId);
    await this._placeSignedOrder({
      marketId: Number(marketId),
      side: position.sizeBase > 0 ? 'sell' : 'buy',
      price: position.sizeBase > 0 ? mark * 0.97 : mark * 1.03,
      sizeBase: Math.abs(position.sizeBase),
      reduceOnly: true,
    }, 'ioc');
    return true;
  }

  async _resolveGone(id, tracked) {
    const history = await this._ensureClient().market.getHistoricalOrders({
      digests: [id], productIds: [tracked.marketId], limit: 1,
    }).catch(() => []);
    const row = history?.find((item) => String(item.digest) === id);
    if (row && !new BigNumber(row.baseFilled || 0).isZero()) {
      const base = Math.abs(humanAmount(row.baseFilled));
      const quote = Math.abs(humanAmount(row.quoteFilled));
      this.emit('fill', {
        orderId: id, marketId: tracked.marketId, levelIndex: tracked.levelIndex,
        side: tracked.side, price: base > 0 && quote > 0 ? quote / base : tracked.price,
        sizeBase: base || tracked.sizeBase,
      });
      this._tracked.delete(id);
      this._gonePolls.delete(id);
      return;
    }
    const count = (this._gonePolls.get(id) || 0) + 1;
    this._gonePolls.set(id, count);
    if (count >= 3) {
      this._tracked.delete(id);
      this._gonePolls.delete(id);
    }
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
      await this._pollPrices();
      await this._refreshAccount();
      for (const marketId of this._watch) {
        const price = this._prices.get(marketId);
        if (price > 0) this.emit('price', { marketId, price });
        const live = new Set((await this.fetchOpenOrders(marketId)).map((order) => order.orderId));
        for (const [id, tracked] of [...this._tracked]) {
          if (tracked.marketId === marketId && !live.has(id)) await this._resolveGone(id, tracked);
        }
      }
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
