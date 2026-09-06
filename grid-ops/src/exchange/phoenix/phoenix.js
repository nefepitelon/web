import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import {
  OrderFlags,
  Side,
  createPhoenixClient,
  priceUsdToTicksWithMarketParams,
  ticksToUsdWithMarketParams,
} from '@ellipsis-labs/rise';
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit';
import { getSetComputeUnitLimitInstruction } from '@solana-program/compute-budget';
import { connectionError } from '../../proxy.js';
import { extractLiquidationPrice } from '../liquidation-price.js';

const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const INTERVALS = { 60: '1m', 300: '5m', 900: '15m', 1800: '30m', 3600: '1h', 14400: '4h', 86400: '1d' };
const PHOENIX_QUOTE_ATOMS_PER_USD = 1_000_000;
const PHOENIX_MAX_SUBACCOUNTS = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tokenNumber = (value) => Number(value?.ui ?? value?.value ?? value ?? 0);
const decimalsFor = (step) => Math.max(0, Math.min(12, String(step).split('.')[1]?.length || 0));

function isRateLimitError(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status ?? 0);
  const message = String(error?.message || error || '');
  return status === 429 || /\b429\b|too many requests|rate.?limit/i.test(message);
}

function retryDelayMs(error, attempt, fallbackMs = 1500) {
  const retryAfterMs = Number(error?.retryAfterMs)
    || Number(error?.retryAfterSeconds) * 1000
    || Number(error?.response?.headers?.get?.('retry-after')) * 1000
    || 0;
  const exponential = fallbackMs * (2 ** Math.max(0, attempt));
  return Math.min(15000, Math.max(fallbackMs, retryAfterMs, exponential));
}

export function floorPhoenixStep(value, step) {
  const size = Number(step);
  if (!(size > 0)) return Number(value);
  return Number((Math.floor((Number(value) + size * 1e-9) / size) * size).toFixed(decimalsFor(size)));
}

export function phoenixIsolatedTransferAmount({ price, sizeBase, leverage, makerFee = 0, takerFee = 0 }) {
  const notional = Math.max(0, Number(price) * Number(sizeBase));
  const safeLeverage = Math.max(1, Number(leverage) || 1);
  // Phoenix isolated children start without collateral. Fund each grid order
  // with its leverage-adjusted margin plus a buffer for price/fee rounding;
  // the official isolated flow sweeps unused collateral back to the parent.
  const feeBuffer = notional * (Math.max(0, Number(makerFee) || 0) + Math.max(0, Number(takerFee) || 0) + 0.002);
  const usd = Math.max(0.01, (notional / safeLeverage) * 1.15 + feeBuffer + 0.05);
  return BigInt(Math.max(1, Math.ceil(usd * PHOENIX_QUOTE_ATOMS_PER_USD)));
}

function solanaSimulationLogs(error) {
  const candidates = [
    error?.context?.logs,
    error?.cause?.context?.logs,
    error?.cause?.cause?.context?.logs,
    error?.data?.logs,
  ];
  return candidates.find(Array.isArray) || [];
}

function transactionDefinitelyRejected(error) {
  const message = [error?.message, error?.cause?.message, ...solanaSimulationLogs(error)].filter(Boolean).join(' | ');
  return /transaction simulation failed|simulation failed|invalid account data|insufficient funds|blockhash not found/i.test(message);
}

function validateKeyBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || ![32, 64].includes(bytes.length)) {
    throw new Error(`Phoenix 私钥必须解码为 32 字节 seed 或 64 字节 Solana keypair；当前为 ${bytes?.length ?? 0} 字节。`);
  }
  return bytes;
}

export function decodePhoenixPrivateKey(raw) {
  const value = String(raw || '').trim();
  if (!value) throw new Error('Phoenix 私钥为空。');
  if (value.startsWith('[')) {
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw new Error('Phoenix JSON 私钥格式无效。'); }
    if (!Array.isArray(parsed) || parsed.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
      throw new Error('Phoenix JSON 私钥必须是 0-255 的字节数组。');
    }
    return validateKeyBytes(Uint8Array.from(parsed));
  }
  const hex = value.replace(/^0x/i, '');
  if (/^[0-9a-f]+$/i.test(hex) && [64, 128].includes(hex.length)) {
    return validateKeyBytes(Uint8Array.from(Buffer.from(hex, 'hex')));
  }
  try {
    const decoded = getBase58Encoder().encode(value);
    if ([32, 64].includes(decoded.length)) return decoded;
  } catch { /* try base64 below */ }
  try {
    const decoded = Uint8Array.from(Buffer.from(value, 'base64'));
    if ([32, 64].includes(decoded.length)) return decoded;
  } catch { /* handled by the final validation error */ }
  throw new Error('Phoenix 私钥无法识别；支持 64 字节 JSON、Base58、Base64 或 Hex。');
}

export function readPhoenixKeyBytes({ privateKey = '', keypairPath = '', rootDir = ENGINE_ROOT } = {}) {
  if (String(privateKey).trim()) return decodePhoenixPrivateKey(privateKey);
  if (!String(keypairPath).trim()) throw new Error('请配置 PHOENIX_PRIVATE_KEY 或 PHOENIX_KEYPAIR_PATH。');
  const resolved = path.isAbsolute(keypairPath) ? path.normalize(keypairPath) : path.resolve(rootDir, keypairPath);
  if (!fs.existsSync(resolved)) throw new Error(`Phoenix Keypair 文件不存在：${resolved}`);
  return decodePhoenixPrivateKey(fs.readFileSync(resolved, 'utf8'));
}

async function createSigner(opts) {
  const bytes = readPhoenixKeyBytes(opts);
  return bytes.length === 64
    ? createKeyPairSignerFromBytes(bytes)
    : createKeyPairSignerFromPrivateKeyBytes(bytes);
}

function orderId(symbol, priceInTicks, sequence) {
  return `ph:${symbol}:${String(priceInTicks)}:${String(sequence)}`;
}

export function parsePhoenixOrderId(value) {
  const match = String(value || '').match(/^ph:([^:]+):(\d+):(\d+)$/);
  if (!match) throw new Error(`Phoenix 订单号格式无效：${value}`);
  return { symbol: match[1], priceInTicks: BigInt(match[2]), orderSequenceNumber: match[3] };
}

function maxLeverage(market) {
  return Math.max(1, ...(market.leverageTiers || []).map((tier) => Number(tier.maxLeverage) || 1));
}

function activeMarket(market) {
  return !['closed', 'disabled', 'inactive', 'settled'].includes(String(market.marketStatus || 'active').toLowerCase());
}

export class PhoenixExchange extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.mode = 'live';
    this.network = 'mainnet';
    this.apiUrl = String(opts.apiUrl || 'https://perp-api.phoenix.trade').replace(/\/$/, '');
    this.rpcUrl = String(opts.rpcUrl || 'https://api.mainnet-beta.solana.com').replace(/\/$/, '');
    this.privateKey = opts.privateKey || '';
    this.keypairPath = opts.keypairPath || 'secrets/phoenix.key';
    this.proxy = opts.proxy || 'direct';
    this.orderGapMs = Math.max(200, Number(opts.orderGapMs) || 1200);
    this.apiReadGapMs = Math.max(500, Number(opts.apiReadGapMs) || Math.min(1500, this.orderGapMs));
    this.rpcReadGapMs = Math.max(250, Number(opts.rpcReadGapMs) || 350);
    this.computeUnitLimit = Math.max(200000, Math.min(1400000, Number(opts.computeUnitLimit) || 600000));
    this.configuredLeverage = Number(opts.leverage) > 0 ? Number(opts.leverage) : null;
    this.halfBand = Number(opts.halfBand) > 0 ? Number(opts.halfBand) : null;
    this.pollMs = Math.max(2500, Number(opts.pollMs) || 4000);
    this.client = opts.client || null;
    this.rpc = opts.rpc || null;
    this.signer = opts.signer || null;
    this._sendOverride = opts.sendInstructions || null;
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
    this._apiReadTail = Promise.resolve();
    this._lastApiReadAt = 0;
    this._rpcReadTail = Promise.resolve();
    this._lastRpcReadAt = 0;
    this._sleep = typeof opts.sleep === 'function' ? opts.sleep : sleep;
    this._trader = null;
    this._traderAddress = null;
    this._isolatedAccounts = new Map();
    this._leverageByMarket = new Map();
    this.balance = null;
    this.equity = null;
    this.realizedPnl = null;
    this.feeRate = 0.00005;
    this.lastOkAt = null;
    this.lastError = null;
    this.dataSource = null;
  }

  _ensureClient() {
    if (!this.client) {
      this.client = createPhoenixClient({
        apiUrl: this.apiUrl,
        rpcUrl: this.rpcUrl,
        ws: false,
        timeout: 15000,
        // The SDK only retries idempotent GET/HEAD requests. A wider budget is
        // safe here and prevents a short API burst from aborting a live grid.
        rateLimitRetry: { maxRetries: 5, maxTotalWaitMs: 60000, fallbackDelayMs: 2500 },
        exchangeMetadata: { stream: false },
      });
    }
    return this.client;
  }

  async init() {
    const client = this._ensureClient();
    if (!this.signer) {
      this.signer = await createSigner({ privateKey: this.privateKey, keypairPath: this.keypairPath, rootDir: this._rootDir });
    }
    if (!this.rpc) this.rpc = createSolanaRpc(this.rpcUrl);
    await this._loadMarkets();
    await this._pollPrices();
    this._traderAddress = await client.pda.getTraderAddress({
      authority: this.signer.address,
      traderPdaIndex: 0,
      subaccountIndex: 0,
    });
    try {
      await this._refreshAccount();
    } catch (error) {
      throw new Error(`Phoenix 账户读取失败：${error?.message || error}。请先在 Phoenix 网页连接该专用钱包并完成开户/入金。`);
    }
    this.dataSource = 'real';
    this.lastOkAt = Date.now();
    this.start();
    return true;
  }

  async reconnect() {
    this.stop();
    this.client?.dispose?.();
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

  async _rateLimitedRead(task, {
    kind,
    label,
    gapMs,
    retries,
  }) {
    const tailKey = kind === 'rpc' ? '_rpcReadTail' : '_apiReadTail';
    const lastKey = kind === 'rpc' ? '_lastRpcReadAt' : '_lastApiReadAt';
    const execute = async () => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        const gap = gapMs - (Date.now() - this[lastKey]);
        if (gap > 0) await this._sleep(gap);
        try {
          return await task();
        } catch (cause) {
          if (!isRateLimitError(cause)) throw cause;
          if (attempt >= retries) {
            const nextStep = kind === 'rpc'
              ? '若持续出现，请在“环境设置”更换 PHOENIX_SOLANA_RPC 为稳定的专用 RPC。'
              : '若持续出现，请检查 PHOENIX_API_URL 或稍后再试。';
            const error = new Error(`Phoenix ${label} 请求频率受限（HTTP 429），自动退避重试后仍未恢复。请等待 30-60 秒再试；${nextStep}`);
            error.code = 'PHOENIX_RATE_LIMITED';
            error.status = 429;
            error.cause = cause;
            throw error;
          }
          await this._sleep(retryDelayMs(cause, attempt));
        } finally {
          this[lastKey] = Date.now();
        }
      }
      return null;
    };
    const result = this[tailKey].then(execute, execute);
    this[tailKey] = result.catch(() => {});
    return result;
  }

  _apiRead(task, label = 'API') {
    return this._rateLimitedRead(task, {
      kind: 'api', label, gapMs: this.apiReadGapMs, retries: 2,
    });
  }

  _apiBuilder(task, label = '指令构建') {
    // Phoenix isolated-order POST endpoints only build unsigned instructions;
    // retrying a rate-limited response is safe because no transaction is sent.
    return this._rateLimitedRead(task, {
      kind: 'api', label, gapMs: this.apiReadGapMs, retries: 5,
    });
  }

  _rpcRead(task, label = 'Solana RPC') {
    return this._rateLimitedRead(task, {
      kind: 'rpc', label, gapMs: this.rpcReadGapMs, retries: 5,
    });
  }

  async _loadMarkets() {
    const client = this._ensureClient();
    // Keep public reads sequential. Parallel market + stats requests were a
    // common source of 429 responses on the shared Phoenix endpoint.
    const markets = await this._apiRead(() => client.api.exchange().getMarkets(), '市场列表');
    const latest = await this._apiRead(
      () => client.api.markets().getLatestMarketsStats(),
      '市场统计',
    ).catch(() => ({ markets: [] }));
    const stats = new Map((latest?.markets || []).map((item) => [item.symbol, item]));
    this.markets.clear();
    this.marketToId.clear();
    for (const row of markets.filter(activeMarket).sort((a, b) => String(a.symbol).localeCompare(String(b.symbol)))) {
      const priceStep = ticksToUsdWithMarketParams(1n, row);
      const sizeStep = 10 ** -Number(row.baseLotsDecimals || 0);
      const last = Number(stats.get(row.symbol)?.mark_price || 0) || null;
      const leverageLimit = maxLeverage(row);
      const market = {
        marketId: Number(row.assetId),
        name: `${row.symbol}-PERP`,
        displayName: `${row.symbol}/USD`,
        longName: row.metadata?.name || row.symbol,
        symbol: row.symbol,
        exchangeSymbol: row.symbol,
        lastPrice: last,
        stepSize: sizeStep,
        stepPrice: priceStep,
        minOrderSize: sizeStep,
        maxOrderSize: Number(row.leverageTiers?.[0]?.maxSizeBaseLots || 0) * sizeStep,
        minNotional: 0,
        maxLeverage: this.configuredLeverage ? Math.min(leverageLimit, this.configuredLeverage) : leverageLimit,
        defaultLeverage: this.configuredLeverage ? Math.min(leverageLimit, this.configuredLeverage) : Math.min(3, leverageLimit),
        makerFee: Number(row.makerFee || 0.00005),
        takerFee: Number(row.takerFee || 0.00035),
        baseLotsDecimals: Number(row.baseLotsDecimals || 0),
        tickSize: row.tickSize,
        isolatedOnly: Boolean(row.isolatedOnly),
        marketAddress: String(row.marketPubkey || ''),
      };
      this.markets.set(market.marketId, market);
      this.marketToId.set(market.exchangeSymbol, market.marketId);
      if (last > 0) this._prices.set(market.marketId, last);
    }
    if (!this.markets.size) throw new Error('Phoenix 官方 API 未返回可交易永续市场。');
    this.feeRate = this.markets.values().next().value?.makerFee || this.feeRate;
  }

  async getMarkets() { return [...this.markets.values()]; }

  _market(marketId) {
    const market = this.markets.get(Number(marketId));
    if (!market) throw new Error(`Phoenix 未知市场 ID：${marketId}`);
    return market;
  }

  async getCandles(marketId, intervalSec = 3600, n = 200) {
    const market = this._market(marketId);
    const rows = await this._apiRead(() => this._ensureClient().api.candles().getCandles(market.exchangeSymbol, {
      timeframe: INTERVALS[intervalSec] || '1h',
      limit: Math.min(500, Math.max(20, Number(n) || 200)),
      enableExternalSource: true,
    }), 'K 线');
    return rows.map((row) => ({
      time: Number(row.time), open: Number(row.markOpen ?? row.open), high: Number(row.markHigh ?? row.high),
      low: Number(row.markLow ?? row.low), close: Number(row.markClose ?? row.close), volume: Number(row.volume || 0),
    })).filter((row) => Number.isFinite(row.time) && row.close > 0);
  }

  async _pollPrices() {
    const result = await this._apiRead(
      () => this._ensureClient().api.markets().getLatestMarketsStats(),
      '市场统计',
    );
    for (const row of result?.markets || []) {
      const id = this.marketToId.get(row.symbol);
      const price = Number(row.mark_price || 0);
      if (id != null && price > 0) this._prices.set(id, price);
    }
  }

  async getPrice(marketId) {
    const id = Number(marketId);
    this._market(id);
    this._watch.add(id);
    await this._pollPrices();
    const price = this._prices.get(id);
    if (!(price > 0)) throw new Error(`Phoenix ${this._market(id).exchangeSymbol} 未返回有效标记价格。`);
    return price;
  }

  async _getTrader() {
    if (!this._traderAddress) {
      this._traderAddress = await this._ensureClient().pda.getTraderAddress({ authority: this.signer.address, traderPdaIndex: 0, subaccountIndex: 0 });
    }
    this._trader = await this._apiRead(
      () => this._ensureClient().api.traders().getTrader(this._traderAddress),
      '账户与挂单',
    );
    return this._trader;
  }

  async _discoverIsolatedAccounts() {
    const state = await this._apiRead(
      () => this._ensureClient().api.traders().getTraderStateSnapshot(this.signer.address, { traderPdaIndex: 0 }),
      '隔离子账户',
    );
    for (const subaccount of state?.snapshot?.subaccounts || []) {
      const index = Number(subaccount.subaccountIndex);
      if (!(index > 0)) continue;
      const symbols = new Set([
        ...(subaccount.positions || []).map((row) => String(row.symbol)),
        ...(subaccount.orders || [])
          .filter((row) => (row.orders || []).some((order) => String(order.status || 'open').toLowerCase() !== 'closed'))
          .map((row) => String(row.symbol)),
      ]);
      if (!symbols.size) continue;
      const address = await this._ensureClient().pda.getTraderAddress({
        authority: this.signer.address,
        traderPdaIndex: 0,
        subaccountIndex: index,
      });
      for (const symbol of symbols) {
        const marketId = this.marketToId.get(symbol);
        const market = marketId == null ? null : this.markets.get(marketId);
        if (market?.isolatedOnly) this._isolatedAccounts.set(marketId, { index, address: String(address) });
      }
    }
  }

  async _isolatedAccount(market, { discover = true } = {}) {
    let account = this._isolatedAccounts.get(market.marketId) || null;
    if (!account && discover) {
      await this._discoverIsolatedAccounts().catch((error) => {
        if (!/not found|404|uninitialized/i.test(String(error?.message || error))) throw error;
      });
      account = this._isolatedAccounts.get(market.marketId) || null;
    }
    return account;
  }

  async _rememberIsolatedAccount(market, instructions) {
    const programAddress = String(this._ensureClient().addresses?.phoenixProgramAddress || '');
    const orderInstruction = (instructions || []).find((instruction) => (
      (!programAddress || String(instruction.programAddress) === programAddress)
      && (instruction.accounts || []).some((account) => String(account.address) === market.marketAddress)
      && instruction.accounts?.[4]?.address
    ));
    const traderAddress = String(orderInstruction?.accounts?.[4]?.address || '');
    if (!traderAddress) {
      throw new Error(`Phoenix ${market.exchangeSymbol} 隔离下单指令未返回有效交易子账户，已阻止发送。`);
    }
    for (let index = 1; index <= PHOENIX_MAX_SUBACCOUNTS; index++) {
      const address = await this._ensureClient().pda.getTraderAddress({
        authority: this.signer.address,
        traderPdaIndex: 0,
        subaccountIndex: index,
      });
      if (String(address) === traderAddress) {
        const account = { index, address: traderAddress };
        this._isolatedAccounts.set(market.marketId, account);
        return account;
      }
    }
    throw new Error(`Phoenix ${market.exchangeSymbol} 返回了无法识别的隔离子账户，已阻止发送。`);
  }

  async _getTraderForMarket(market) {
    if (!market.isolatedOnly) return this._getTrader();
    const account = await this._isolatedAccount(market);
    if (!account) return null;
    return this._apiRead(
      () => this._ensureClient().api.traders().getTrader(account.address),
      `${market.exchangeSymbol} 隔离账户`,
    );
  }

  _storePositions(trader, onlyMarketId = null) {
    for (const row of trader?.positions || []) {
      const id = this.marketToId.get(String(row.symbol));
      const size = tokenNumber(row.positionSize);
      if (id == null || (onlyMarketId != null && id !== Number(onlyMarketId))) continue;
      if (!size) {
        this._positions.delete(id);
        continue;
      }
      const liquidation = extractLiquidationPrice(row);
      this._positions.set(id, {
        sizeBase: size,
        entryPrice: tokenNumber(row.entryPrice),
        ...liquidation,
        unrealizedPnl: tokenNumber(row.unrealizedPnl),
        leverage: this._leverageByMarket.get(id) || this.configuredLeverage,
      });
    }
  }

  async _refreshAccount() {
    const trader = await this._getTrader();
    let balance = tokenNumber(trader.collateralBalance);
    let equity = tokenNumber(trader.portfolioValue);
    this._positions.clear();
    this._storePositions(trader);
    const countedAccounts = new Set([String(this._traderAddress || '')]);
    for (const marketId of this._watch) {
      const market = this.markets.get(marketId);
      if (!market?.isolatedOnly || !this._isolatedAccounts.has(marketId)) continue;
      const isolated = this._isolatedAccounts.get(marketId);
      if (countedAccounts.has(String(isolated?.address || ''))) continue;
      const isolatedTrader = await this._getTraderForMarket(market);
      if (isolatedTrader) {
        countedAccounts.add(String(isolated?.address || ''));
        balance += tokenNumber(isolatedTrader.collateralBalance);
        equity += tokenNumber(isolatedTrader.portfolioValue);
        this._storePositions(isolatedTrader, marketId);
      }
    }
    // Phoenix transfers margin from the parent trader into isolated child
    // accounts while orders are resting. Report the authority-wide total so
    // this internal reservation cannot look like a withdrawal or realized PnL.
    this.balance = balance;
    this.equity = equity;
    return trader;
  }

  async preflightTrading(marketId = null) {
    const trader = await this._refreshAccount();
    if (!(this.equity > 0)) throw new Error('Phoenix 可用保证金不足，请先向专用交易钱包的 Phoenix 账户存入 USDC。');
    const access = trader.capabilities?.placeLimitOrder;
    if (access && !access.immediate && !access.viaColdActivation) throw new Error('Phoenix 当前账户没有限价下单权限。');
    if (this.rpc?.getBalance) {
      const result = await this._rpcRead(
        () => this.rpc.getBalance(this.signer.address, { commitment: 'confirmed' }).send({ abortSignal: AbortSignal.timeout(12000) }),
        'Solana 余额查询',
      );
      if (BigInt(result.value) < 100000n) throw new Error('Phoenix 专用钱包 SOL 不足；至少保留 0.0001 SOL 支付挂单、撤单和平仓手续费。');
    }
    if (marketId != null) {
      const market = this._market(marketId);
      if (market.isolatedOnly) await this._isolatedAccount(market).catch(() => null);
    }
    return true;
  }

  async setLeverage(marketId, leverage) {
    const market = this._market(marketId);
    const value = Math.max(1, Math.floor(Number(leverage) || 1));
    if (value > market.maxLeverage) throw new Error(`Phoenix ${market.exchangeSymbol} 当前最大允许杠杆为 ${market.maxLeverage}x。`);
    this._leverageByMarket.set(market.marketId, value);
    return true;
  }

  _ordersFromTrader(trader, market) {
    return (trader?.limitOrders?.[market.exchangeSymbol] || []).map((row) => {
      const price = tokenNumber(row.price);
      const ticks = priceUsdToTicksWithMarketParams(price, market);
      const sequence = String(row.orderSequenceNumber);
      return {
        orderId: orderId(market.exchangeSymbol, ticks, sequence),
        orderSequenceNumber: sequence,
        priceInTicks: BigInt(ticks),
        marketId: market.marketId,
        side: Number(row.side) === Side.Bid ? 'buy' : 'sell',
        price,
        sizeBase: tokenNumber(row.tradeSizeRemaining),
        reduceOnly: Boolean(row.isReduceOnly),
      };
    });
  }

  getOpenOrders(marketId) {
    return [...this._tracked.values()].filter((order) => order.marketId === Number(marketId));
  }

  async fetchOpenOrders(marketId) {
    const market = this._market(marketId);
    const trader = await this._getTraderForMarket(market);
    if (!trader) return [];
    return this._ordersFromTrader(trader, market);
  }

  adoptOrder(order) {
    this._tracked.set(String(order.orderId), {
      ...order, orderId: String(order.orderId), marketId: Number(order.marketId), price: Number(order.price), sizeBase: Number(order.sizeBase),
    });
  }

  async _serializeWrite(task) {
    const execute = async () => {
      const wait = this.orderGapMs - (Date.now() - this._lastWriteAt);
      if (wait > 0) await this._sleep(wait);
      try { return await task(); } finally { this._lastWriteAt = Date.now(); }
    };
    const result = this._writeTail.then(execute, execute);
    this._writeTail = result.catch(() => {});
    return result;
  }

  async _sendInstructions(instructions) {
    if (this._sendOverride) return this._sendOverride(instructions);
    const abortSignal = AbortSignal.timeout(30000);
    const { value: latest } = await this._rpcRead(
      () => this.rpc.getLatestBlockhash({ commitment: 'confirmed' }).send({ abortSignal }),
      'Solana 最新区块查询',
    );
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (tx) => setTransactionMessageFeePayerSigner(this.signer, tx),
      (tx) => setTransactionMessageLifetimeUsingBlockhash(latest, tx),
      (tx) => appendTransactionMessageInstructions([
        getSetComputeUnitLimitInstruction({ units: this.computeUnitLimit }),
        ...instructions,
      ], tx),
    );
    const signed = await signTransactionMessageWithSigners(message, { abortSignal });
    const encoded = getBase64EncodedWireTransaction(signed);
    let signature;
    try {
      signature = await this.rpc.sendTransaction(encoded, {
        encoding: 'base64',
        preflightCommitment: 'confirmed',
        maxRetries: 3n,
      }).send({ abortSignal });
    } catch (cause) {
      const detail = connectionError(cause);
      const logs = solanaSimulationLogs(cause);
      const programLog = logs.filter((line) => /program log:|failed:/i.test(String(line))).slice(-2).join(' | ');
      const error = new Error(`Phoenix Solana 交易发送失败（${detail.code}）：${detail.message}${programLog ? ` | ${programLog}` : ''}`);
      error.cause = cause;
      // A failed preflight simulation is definitive: the transaction never
      // reached the chain and must not be treated as an ambiguous send.
      error.statusUnknown = !transactionDefinitelyRejected(cause);
      error.diagnosticCode = detail.code;
      throw error;
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      let status;
      try {
        status = await this._rpcRead(
          () => this.rpc.getSignatureStatuses([signature], { searchTransactionHistory: true }).send({ abortSignal }),
          'Solana 交易确认查询',
        );
      } catch (cause) {
        const error = new Error(`Phoenix 交易 ${signature} 已发送，但确认查询失败：${cause?.message || cause}。系统不会自动重发，将改为从活动订单核验结果。`);
        error.cause = cause;
        error.statusUnknown = true;
        error.transactionSignature = String(signature);
        throw error;
      }
      const value = status.value?.[0];
      if (value?.err) throw new Error(`Phoenix 链上交易失败：${JSON.stringify(value.err)}`);
      if (['confirmed', 'finalized'].includes(value?.confirmationStatus)) return String(signature);
      await this._sleep(750);
    }
    const error = new Error(`Phoenix 交易 ${signature} 已发送，但 15 秒内未确认；请先在 Solana 浏览器核对，机器人不会自动重发。`);
    error.statusUnknown = true;
    error.transactionSignature = String(signature);
    throw error;
  }

  _checkBand(market, price) {
    if (!(this.halfBand > 0)) return;
    const mark = this._prices.get(market.marketId);
    if (!(mark > 0)) return;
    const low = mark * (1 - this.halfBand), high = mark * (1 + this.halfBand);
    if (price < low || price > high) {
      throw new Error(`Phoenix 订单价格 ${price} 超出当前价 ${mark} 的半带宽范围 [${low.toFixed(6)}, ${high.toFixed(6)}]。`);
    }
  }

  async _findNewOrder(market, before, side, priceInTicks) {
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt) await this._sleep(350);
      const rows = await this.fetchOpenOrders(market.marketId);
      const found = rows.filter((row) => !before.has(row.orderSequenceNumber)
        && row.side === side && BigInt(row.priceInTicks) === BigInt(priceInTicks))
        .sort((a, b) => BigInt(a.orderSequenceNumber) > BigInt(b.orderSequenceNumber) ? -1 : 1)[0];
      if (found) return found;
    }
    return null;
  }

  async placeLimitOrder(order) {
    const market = this._market(order.marketId);
    const price = floorPhoenixStep(order.price, market.stepPrice);
    const size = floorPhoenixStep(order.sizeBase, market.stepSize);
    if (!(size >= market.minOrderSize)) throw new Error(`Phoenix 下单数量 ${size} 小于最小数量 ${market.minOrderSize}。`);
    this._checkBand(market, price);
    const beforeRows = await this.fetchOpenOrders(market.marketId);
    const before = new Set(beforeRows.map((row) => row.orderSequenceNumber));
    const clientOrderId = BigInt(String(order.clientOrderId || Date.now()).replace(/\D/g, '').slice(-30) || Date.now());
    const limit = await this._ensureClient().orderPackets.buildLimitOrderPacket({
      symbol: market.exchangeSymbol,
      side: order.side === 'buy' ? Side.Bid : Side.Ask,
      priceUsd: price,
      baseUnits: size,
      clientOrderId,
      orderFlags: order.reduceOnly ? OrderFlags.ReduceOnly : OrderFlags.None,
    });
    const packet = {
      side: limit.side,
      priceInTicks: limit.priceInTicks,
      numBaseLots: limit.numBaseLots,
      clientOrderId: limit.clientOrderId,
      slide: false,
      lastValidSlot: null,
      orderFlags: limit.orderFlags,
      cancelExisting: false,
    };
    let instructions;
    if (market.isolatedOnly) {
      const leverage = this._leverageByMarket.get(market.marketId) || market.defaultLeverage || 1;
      const transferAmount = phoenixIsolatedTransferAmount({
        price,
        sizeBase: size,
        leverage,
        makerFee: market.makerFee,
        takerFee: market.takerFee,
      });
      if (packet.priceInTicks > BigInt(Number.MAX_SAFE_INTEGER) || packet.numBaseLots > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`Phoenix ${market.exchangeSymbol} 隔离订单数值超出安全范围，已阻止发送。`);
      }
      const isolatedAccount = this._isolatedAccounts.get(market.marketId) || null;
      if (isolatedAccount) {
        const [sync, transfer, place, sweep] = await Promise.all([
          this._ensureClient().ixs.buildSyncParentToChild({
            traderWallet: this.signer.address,
            traderPdaIndex: 0,
            traderSubaccountIndex: isolatedAccount.index,
          }),
          this._ensureClient().ixs.buildTransferCollateral({
            authority: this.signer.address,
            traderPdaIndex: 0,
            srcSubaccountIndex: 0,
            dstSubaccountIndex: isolatedAccount.index,
            amount: transferAmount,
          }),
          this._ensureClient().ixs.buildPlacePostOnlyOrder({
            authority: this.signer.address,
            symbol: market.exchangeSymbol,
            orderPacket: packet,
            traderPdaIndex: 0,
            traderSubaccountIndex: isolatedAccount.index,
          }),
          this._ensureClient().ixs.buildTransferCollateralChildToParent({
            authority: this.signer.address,
            traderPdaIndex: 0,
            childSubaccountIndex: isolatedAccount.index,
          }),
        ]);
        instructions = [sync, transfer, place, sweep];
      } else {
        instructions = await this._apiBuilder(
          () => this._ensureClient().api.orders().placeIsolatedLimitOrder({
            authority: String(this.signer.address),
            symbol: market.exchangeSymbol,
            side: order.side === 'buy' ? 'bid' : 'ask',
            priceInTicks: Number(packet.priceInTicks),
            numBaseLots: Number(packet.numBaseLots),
            transferAmount: Number(transferAmount),
            pdaIndex: 0,
            allowCrossAndIsolatedForAsset: false,
            isReduceOnly: Boolean(order.reduceOnly),
            isPostOnly: true,
            slide: false,
            skipTransferToParent: false,
          }),
          `${market.exchangeSymbol} 隔离下单指令`,
        );
        await this._rememberIsolatedAccount(market, instructions);
      }
    } else {
      instructions = [await this._ensureClient().ixs.buildPlacePostOnlyOrder({
        authority: this.signer.address,
        symbol: market.exchangeSymbol,
        orderPacket: packet,
        traderPdaIndex: 0,
        traderSubaccountIndex: 0,
      })];
    }
    let sendError = null;
    try { await this._serializeWrite(() => this._sendInstructions(instructions)); }
    catch (error) { if (!error?.statusUnknown) throw error; sendError = error; }
    const placed = await this._findNewOrder(market, before, order.side, packet.priceInTicks);
    if (!placed) {
      if (sendError) throw sendError;
      const error = new Error('Phoenix 交易已确认但未在活动订单中找到对应 Post-Only 单；为防重复下单，已停止自动重试，请到 Phoenix 订单页核对。');
      error.statusUnknown = true;
      throw error;
    }
    const tracked = {
      ...placed, levelIndex: order.levelIndex, sizeBase: size, reduceOnly: Boolean(order.reduceOnly), clientOrderId: String(clientOrderId),
    };
    this._tracked.set(placed.orderId, tracked);
    this._watch.add(market.marketId);
    return { orderId: placed.orderId };
  }

  async cancelOrder(marketId, value) {
    const market = this._market(marketId);
    const parsed = parsePhoenixOrderId(value);
    if (parsed.symbol !== market.exchangeSymbol) throw new Error('Phoenix 订单市场与当前市场不一致，已阻止撤单。');
    const isolatedAccount = market.isolatedOnly ? await this._isolatedAccount(market) : null;
    if (market.isolatedOnly && !isolatedAccount) throw new Error(`Phoenix ${market.exchangeSymbol} 未找到该订单所属的隔离子账户，已阻止错误撤单。`);
    const instruction = await this._ensureClient().ixs.buildCancelOrdersById({
      authority: this.signer.address,
      symbol: market.exchangeSymbol,
      traderPdaIndex: 0,
      traderSubaccountIndex: isolatedAccount?.index || 0,
      orders: [{ priceInTicks: parsed.priceInTicks, orderSequenceNumber: parsed.orderSequenceNumber }],
    });
    try { await this._serializeWrite(() => this._sendInstructions([instruction])); }
    catch (error) {
      if (!error?.statusUnknown) throw error;
      const live = await this.fetchOpenOrders(marketId).catch(() => null);
      if (!live || live.some((order) => order.orderId === String(value))) throw error;
    }
    this._tracked.delete(String(value));
    return true;
  }

  async cancelAll(marketId) {
    const market = this._market(marketId);
    const isolatedAccount = market.isolatedOnly ? await this._isolatedAccount(market) : null;
    if (market.isolatedOnly && !isolatedAccount) {
      for (const [id, order] of this._tracked) if (order.marketId === market.marketId) this._tracked.delete(id);
      return true;
    }
    const instruction = await this._ensureClient().ixs.buildCancelAll({
      authority: this.signer.address,
      symbol: market.exchangeSymbol,
      traderPdaIndex: 0,
      traderSubaccountIndex: isolatedAccount?.index || 0,
    });
    try {
      await this._serializeWrite(() => this._sendInstructions([instruction]));
    } catch (error) {
      if (!error?.statusUnknown) throw error;
      const live = await this.fetchOpenOrders(marketId).catch(() => null);
      if (!live || live.length) throw error;
    }
    for (const [id, order] of this._tracked) if (order.marketId === market.marketId) this._tracked.delete(id);
    return true;
  }

  getPosition(marketId) {
    const position = this._positions.get(Number(marketId));
    return position?.sizeBase ? position : null;
  }

  async closePosition(marketId) {
    const market = this._market(marketId);
    await this._refreshAccount();
    if (market.isolatedOnly) {
      const isolatedTrader = await this._getTraderForMarket(market);
      if (isolatedTrader) this._storePositions(isolatedTrader, market.marketId);
    }
    const position = this._positions.get(market.marketId);
    if (!position?.sizeBase) return true;
    const mark = await this.getPrice(market.marketId);
    const side = position.sizeBase > 0 ? Side.Ask : Side.Bid;
    const slippage = this.halfBand && this.halfBand > 0 ? Math.min(this.halfBand, 0.1) : 0.03;
    const packet = await this._ensureClient().orderPackets.buildMarketOrderPacket({
      symbol: market.exchangeSymbol,
      side,
      baseUnits: Math.abs(position.sizeBase),
      priceLimitUsd: side === Side.Ask ? mark * (1 - slippage) : mark * (1 + slippage),
      clientOrderId: BigInt(Date.now()),
      orderFlags: OrderFlags.ReduceOnly,
    });
    const isolatedAccount = market.isolatedOnly ? await this._isolatedAccount(market) : null;
    if (market.isolatedOnly && !isolatedAccount) throw new Error(`Phoenix ${market.exchangeSymbol} 未找到持仓所属的隔离子账户，已阻止错误平仓。`);
    const instruction = await this._ensureClient().ixs.buildPlaceMarketOrder({
      authority: this.signer.address,
      symbol: market.exchangeSymbol,
      orderPacket: packet,
      traderPdaIndex: 0,
      traderSubaccountIndex: isolatedAccount?.index || 0,
    });
    await this._serializeWrite(() => this._sendInstructions([instruction]));
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

  async _resolveGone(id, tracked) {
    const history = await this._apiRead(() => this._ensureClient().api.orders().getTraderOrderHistory(this.signer.address, {
      traderPdaIndex: 0,
      marketSymbol: this._market(tracked.marketId).exchangeSymbol,
      limit: 100,
    }), '历史订单');
    const row = history?.data?.find((item) => String(item.orderSequenceNumber) === String(tracked.orderSequenceNumber));
    if (!row) return;
    if (String(row.status).toLowerCase() === 'filled') {
      this.emit('fill', {
        orderId: id, marketId: tracked.marketId, levelIndex: tracked.levelIndex,
        side: tracked.side, price: Number(row.price || tracked.price), sizeBase: Number(row.filledBaseQty || tracked.sizeBase),
      });
    }
    this._tracked.delete(id);
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
