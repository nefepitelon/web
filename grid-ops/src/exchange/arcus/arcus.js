import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import {
  createPrivateKey, createPublicKey, randomBytes, sign as cryptoSign,
} from 'node:crypto';
import { createDispatcher, connectionError } from '../../proxy.js';
import { ExchangeWriteScheduler, retryAfterMsFromHeaders } from '../write-scheduler.js';
import { extractLiquidationPrice } from '../liquidation-price.js';

const URLS = {
  mainnet: 'https://api.arcus.xyz',
  testnet: 'https://api.testnet.arcus.xyz',
};
const RAW_ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const FINAL_ORDER_STATES = new Set([
  'FILLED', 'CANCELED', 'CANCELLED', 'MARGIN_CANCELED', 'REJECTED', 'EXPIRED',
]);
const INTERVALS = {
  60: '1m', 180: '3m', 300: '5m', 900: '15m', 1800: '30m',
  3600: '1h', 7200: '2h', 14400: '4h', 28800: '8h', 43200: '12h',
  86400: '1d', 259200: '3d', 604800: '1w',
};
let lastTimestampNs = 0n;

function decimalFraction(value) {
  const raw = String(value).trim();
  const match = raw.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match || (!match[2] && !match[3])) throw new Error(`无效十进制数字: ${raw}`);
  const exponent = Number(match[4] || 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) {
    throw new Error(`十进制指数超出范围: ${raw}`);
  }
  const digits = ((match[2] || '0') + (match[3] || '')).replace(/^0+(?=\d)/, '') || '0';
  let scale = (match[3] || '').length - exponent;
  let integer = BigInt(digits) * (match[1] === '-' ? -1n : 1n);
  if (scale < 0) {
    integer *= 10n ** BigInt(-scale);
    scale = 0;
  }
  return { integer, scale };
}

function pow10(value) { return 10n ** BigInt(value); }

function commonIntegers(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return {
    left: left.integer * pow10(scale - left.scale),
    right: right.integer * pow10(scale - right.scale),
    scale,
  };
}

function divFloor(left, right) {
  let quotient = left / right;
  const remainder = left % right;
  if (remainder !== 0n && ((remainder > 0n) !== (right > 0n))) quotient -= 1n;
  return quotient;
}

function formatScaled(integer, scale) {
  const negative = integer < 0n;
  let digits = (negative ? -integer : integer).toString();
  if (!scale) return (negative ? '-' : '') + digits;
  if (digits.length <= scale) digits = digits.padStart(scale + 1, '0');
  const decimal = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?)0+$/, '$1');
  return (negative ? '-' : '') + decimal;
}

/** Stable JSON for signed Arcus bodies. BigInts intentionally remain JSON numbers. */
export function canonicalJson(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Arcus 签名内容包含非有限数字。');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new Error('Arcus 签名内容包含不支持的类型。');
}

/** Nanosecond Unix timestamp, monotonic within this process. */
export function timestampNs() {
  const now = BigInt(Date.now()) * 1_000_000n + (process.hrtime.bigint() % 1_000_000n);
  lastTimestampNs = now > lastTimestampNs ? now : lastTimestampNs + 1n;
  return lastTimestampNs;
}

export function futureGoodTilUs(days = 40) {
  const safeDays = Math.max(32, Math.min(180, Number(days) || 40));
  return BigInt(Date.now() + safeDays * 86_400_000) * 1000n;
}

/** Align a decimal without introducing IEEE-754 rounding into a signed order. */
export function alignDecimal(value, step, mode = 'nearest') {
  const source = decimalFraction(value);
  const unit = decimalFraction(step);
  if (unit.integer <= 0n) throw new Error(`无效步长: ${step}`);
  const common = commonIntegers(source, unit);
  let quotient = divFloor(common.left, common.right);
  const remainder = common.left - quotient * common.right;
  if (mode === 'up' && remainder !== 0n) quotient += 1n;
  else if (mode === 'nearest' && remainder * 2n >= common.right) quotient += 1n;
  else if (!['down', 'up', 'nearest'].includes(mode)) throw new Error(`未知取整模式: ${mode}`);
  const scaledUnit = unit.integer * pow10(common.scale - unit.scale);
  return formatScaled(quotient * scaledUnit, common.scale);
}

export function toUnitsExact(value, unit) {
  const source = decimalFraction(value);
  const quantum = decimalFraction(unit);
  if (quantum.integer <= 0n) throw new Error(`无效单位: ${unit}`);
  const common = commonIntegers(source, quantum);
  if (common.left % common.right !== 0n) throw new Error(`${value} 不是 ${unit} 的整数倍。`);
  return common.left / common.right;
}

/** Select the documented price tier; a malformed tier fails closed. */
export function chooseTick(market, price) {
  const numericPrice = Number(price);
  if (!(numericPrice > 0)) throw new Error(`Arcus 价格无效: ${price}`);
  const fallback = String(market?.tickSize ?? market?.priceStep ?? '');
  const tiers = Array.isArray(market?.tickTiers) ? market.tickTiers : [];
  for (const tier of tiers) {
    const tick = String(tier?.tick ?? tier?.tickSize ?? fallback);
    if (!(Number(tick) > 0)) throw new Error('Arcus tickTiers 包含无效 tick。');
    if (tier?.upToPrice == null || numericPrice <= Number(tier.upToPrice)) return tick;
  }
  if (!(Number(fallback) > 0)) throw new Error('Arcus 市场缺少有效 tickSize。');
  return fallback;
}

function timeInForceCode(value) {
  const code = { GTT: 0, FOK: 1, IOC: 2, ALO: 3 }[String(value || 'GTT').toUpperCase()];
  if (code == null) throw new Error(`Arcus 不支持的 timeInForce: ${value}`);
  return code;
}

export function buildPlacePayload({
  address, accountIndex, clientId, timestamp, goodTilTimeUs, marketId,
  priceTicks, quantityQuantums, reduceOnly, side, timeInForce,
}) {
  const normalizedSide = String(side).toUpperCase();
  if (!['BUY', 'SELL'].includes(normalizedSide)) throw new Error(`Arcus 不支持的订单方向: ${side}`);
  const client = clientId ? `,"c":${JSON.stringify(String(clientId).toLowerCase())}` : '';
  return `{"ad":${JSON.stringify(String(address).toLowerCase())},"ai":${Number(accountIndex)}${client},"ct":${BigInt(timestamp)},"g":${BigInt(goodTilTimeUs) * 1000n},"m":${Number(marketId)},"op":1,"p":${BigInt(priceTicks)},"q":${BigInt(quantityQuantums)},"r":${reduceOnly ? 1 : 0},"s":${normalizedSide === 'SELL' ? 1 : 0},"t":${timeInForceCode(timeInForce)},"v":1}`;
}

export function buildCancelPayload({ address, accountIndex, clientId, timestamp, orderId, marketId }) {
  const client = clientId ? `,"c":${JSON.stringify(String(clientId).toLowerCase())}` : '';
  const id = orderId ? `,"id":${JSON.stringify(String(orderId))}` : '';
  if ((client && id) || (!client && !id)) throw new Error('Arcus 撤单必须且只能指定 orderId 或 clientId。');
  return `{"ad":${JSON.stringify(String(address).toLowerCase())},"ai":${Number(accountIndex)}${client},"ct":${BigInt(timestamp)}${id},"m":${Number(marketId)},"op":2,"v":1}`;
}

function privateKeyFromBytes(bytes) {
  if (bytes.length === 32) {
    return createPrivateKey({ key: Buffer.concat([RAW_ED25519_PKCS8_PREFIX, bytes]), format: 'der', type: 'pkcs8' });
  }
  return createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' });
}

/** Load raw seed hex, PKCS#8 PEM, PKCS#8 DER (binary/hex/base64), or a file. */
export function loadEd25519PrivateKey({ value, file } = {}) {
  let source;
  try {
    // An explicitly supplied inline key wins over the optional/default file
    // path. This prevents a harmless missing default file from shadowing a
    // valid ARCUS_API_PRIVATE_KEY.
    if (String(value || '').trim()) source = String(value).trim().replace(/\\n/g, '\n');
    else if (file) source = fs.readFileSync(String(file));
    else source = '';
  } catch (cause) {
    throw new Error(`无法读取 Arcus API 私钥文件: ${file}`, { cause });
  }
  if ((!Buffer.isBuffer(source) && !source) || (Buffer.isBuffer(source) && !source.length)) {
    throw new Error('缺少 Arcus Ed25519 API 私钥。');
  }
  try {
    let key;
    const text = Buffer.isBuffer(source) ? source.toString('utf8').trim() : String(source).trim();
    const printable = /^[\x09\x0a\x0d\x20-\x7e]+$/.test(text);
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) key = createPrivateKey(text);
    else if (Buffer.isBuffer(source) && (source.length === 32 || !printable)) key = privateKeyFromBytes(source);
    else {
      const compact = text.replace(/^0x/i, '').replace(/\s+/g, '');
      if (/^[0-9a-f]{64}$/i.test(compact)) key = privateKeyFromBytes(Buffer.from(compact, 'hex'));
      else if (/^[0-9a-f]+$/i.test(compact) && compact.length % 2 === 0) key = privateKeyFromBytes(Buffer.from(compact, 'hex'));
      else key = privateKeyFromBytes(Buffer.from(compact, 'base64'));
    }
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('不是 Ed25519 私钥');
    return key;
  } catch (cause) {
    throw new Error('Arcus Ed25519 API 私钥格式无效：支持 64 位 seed hex、PKCS#8 PEM/DER 或私钥文件。', { cause });
  }
}

export function publicKeyHex(privateKey) {
  const publicKey = createPublicKey(privateKey);
  if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('Arcus API 私钥不是 Ed25519。');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return Buffer.from(der).subarray(-32).toString('hex');
}

export function signHex(message, privateKey) {
  return cryptoSign(null, Buffer.from(String(message), 'utf8'), privateKey).toString('hex');
}

export function legacySignature({ timestamp, action, body, privateKey }) {
  return signHex(`${timestamp}${action}${canonicalJson(body)}`, privateKey);
}

function arrayPayload(value, ...keys) {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return null;
}

function clientOrderId(value) {
  const clean = String(value || `wg${Date.now().toString(36)}${randomBytes(5).toString('hex')}`)
    .toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 36);
  if (!clean) throw new Error('Arcus clientId 为空或格式无效。');
  return clean;
}

export class ArcusExchange extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.mode = 'live';
    this.network = opts.network === 'testnet' ? 'testnet' : 'mainnet';
    this.apiUrl = String(opts.apiUrl || URLS[this.network]).replace(/\/$/, '');
    this.wsUrl = String(opts.wsUrl || `wss://${this.network === 'testnet' ? 'api.testnet' : 'api'}.arcus.xyz/v1/ws`);
    this.address = String(opts.address || '').trim().toLowerCase();
    this.accountIndex = Number(opts.accountIndex ?? 0);
    this.apiKey = String(opts.apiKey || '').trim().replace(/^0x/i, '').toLowerCase();
    this.apiPrivateKey = opts.apiPrivateKey || '';
    this.apiPrivateKeyFile = opts.apiPrivateKeyFile || '';
    this.proxy = opts.proxy || '';
    this.dispatcher = null;
    this.goodTilDays = Math.max(32, Math.min(180, Number(opts.goodTilDays) || 40));
    this.feeRate = Math.max(0, Number(opts.feeRate) || 0.0005);
    this.orderGapMs = Math.max(100, Number(opts.orderGapMs) || 250);
    this.pollMs = Math.max(2000, Number(opts.pollMs) || 4000);
    this._writeScheduler = new ExchangeWriteScheduler({
      label: 'Arcus', minGapMs: this.orderGapMs, maxRetries: 4,
      baseDelayMs: Math.max(800, this.orderGapMs), sleep: opts.sleep,
    });
    this.markets = new Map();
    this.balance = null;
    this.equity = null;
    this.availableMargin = null;
    this.realizedPnl = 0;
    this.dataSource = null;
    this.lastOkAt = 0;
    this.lastError = null;
    this._privateKey = null;
    this._prices = new Map();
    this._positions = new Map();
    this._tracked = new Map();
    this._watch = new Set();
    this._missingCounts = new Map();
    this._timer = null;
    this._busy = false;
  }

  _validateCredentials() {
    if (!/^0x[0-9a-f]{40}$/.test(this.address)) {
      throw new Error('ARCUS_ADDRESS 必须是 0x 开头的 40 位 Ethereum 钱包公开地址。');
    }
    if (!Number.isInteger(this.accountIndex) || this.accountIndex < 0 || this.accountIndex > 9) {
      throw new Error('ARCUS_ACCOUNT_INDEX 必须是 0-9。');
    }
    if (!/^[0-9a-f]{64}$/.test(this.apiKey)) {
      throw new Error('ARCUS_API_KEY 必须是 64 位十六进制 Ed25519 公钥。');
    }
    if (!this.apiPrivateKey && !this.apiPrivateKeyFile) {
      throw new Error('Arcus LIVE 模式需要 ARCUS_API_PRIVATE_KEY 或 ARCUS_API_PRIVATE_KEY_FILE。');
    }
  }

  async init() {
    this._validateCredentials();
    this._privateKey = loadEd25519PrivateKey({ value: this.apiPrivateKey, file: this.apiPrivateKeyFile });
    if (publicKeyHex(this._privateKey) !== this.apiKey) {
      throw new Error('ARCUS_API_KEY 与 ARCUS_API_PRIVATE_KEY 不是同一对 Ed25519 密钥，已拒绝启动实盘。');
    }
    await this._ensureDispatcher();
    await this._loadMarkets();
    await this._refreshAccount();
    await this._refreshPositions();
    await this._refreshFeeRate();
    this.dataSource = 'real';
    this.lastOkAt = Date.now();
    this.start();
    return true;
  }

  async reconnect() {
    this.stop();
    this._writeScheduler.reset();
    await this._ensureDispatcher();
    await this._loadMarkets();
    await this._refreshAccount();
    await this._refreshPositions();
    await this._refreshOpenOrders();
    this.dataSource = 'real';
    this.lastOkAt = Date.now();
    this.lastError = null;
    this.start();
    return true;
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

  _headers(extra = {}) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'WELINKBTC-ArcusGrid/1.0',
      ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
      ...extra,
    };
  }

  async _req(method, path, body, extraHeaders = {}) {
    const requestBody = body === undefined ? undefined : canonicalJson(body);
    const attempts = method === 'GET' ? 2 : 1;
    let response;
    let cause;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const dispatcher = await this._ensureDispatcher();
        response = await fetch(this.apiUrl + path, {
          method,
          headers: this._headers(extraHeaders),
          body: requestBody,
          ...(dispatcher ? { dispatcher } : {}),
          signal: AbortSignal.timeout(15_000),
        });
        break;
      } catch (error) {
        cause = error;
        if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    const route = String(path).split('?')[0];
    if (!response) {
      const diagnostic = connectionError(cause);
      const error = new Error(`Arcus 网络请求失败（${route}，${diagnostic.code}）：${diagnostic.message || 'fetch failed'}`);
      error.cause = cause;
      error.diagnosticCode = diagnostic.code;
      error.endpoint = route;
      error.statusUnknown = method !== 'GET';
      throw error;
    }
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; }
    catch { payload = { message: text.slice(0, 500) }; }
    if (response.ok) {
      this.lastOkAt = Date.now();
      return payload;
    }
    const detail = payload?.message || payload?.error?.message || payload?.error || payload?.rejectReason || response.statusText;
    let message = `Arcus 接口错误 ${response.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
    if (payload?.code === 'GEO_RESTRICTED') message = 'Arcus 拒绝交易：当前账户或地区受 GEO_RESTRICTED 限制。';
    else if (response.status === 401) message = 'Arcus API 鉴权失败：请检查 API key、签名私钥和电脑时间。';
    else if (response.status === 403) message = 'Arcus 拒绝访问：钱包地址或 accountIndex 与 API key 不匹配。';
    const error = new Error(message);
    error.httpStatus = response.status;
    error.status = response.status;
    error.exchangeCode = payload?.code || payload?.error?.code;
    error.retryAfterMs = retryAfterMsFromHeaders(response.headers)
      ?? (Number(payload?.retryAfterMs || 0) || undefined);
    error.endpoint = route;
    error.data = payload;
    throw error;
  }

  _get(path) { return this._req('GET', path); }

  _accountQuery(extra = '') {
    const base = `address=${encodeURIComponent(this.address)}&accountIndex=${this.accountIndex}`;
    return extra ? `${base}&${extra}` : base;
  }

  async _write(path, body, headers, operation) {
    return this._writeScheduler.run(
      () => this._req('POST', path, body, headers),
      { operation },
    );
  }

  async _signedTyped(path, payload, body, timestamp) {
    return this._write(
      `${path}?address=${encodeURIComponent(this.address)}`,
      body,
      { 'X-Timestamp': String(timestamp), 'X-Signature': signHex(payload, this._privateKey) },
      path,
    );
  }

  async _signedLegacy(path, action, body) {
    const timestamp = timestampNs();
    return this._write(
      `${path}?address=${encodeURIComponent(this.address)}`,
      body,
      {
        'X-Timestamp': String(timestamp),
        'X-Signature': legacySignature({ timestamp, action, body, privateKey: this._privateKey }),
      },
      path,
    );
  }

  async _loadMarkets() {
    const payload = await this._get('/v1/markets');
    const rows = arrayPayload(payload, 'markets', 'result');
    if (!rows?.length) throw new Error('Arcus 未返回市场列表。');
    const next = new Map();
    for (const raw of rows) {
      if (String(raw?.type || 'PERPETUAL').toUpperCase() !== 'PERPETUAL') continue;
      if (String(raw?.status || '').toUpperCase() !== 'ONLINE') continue;
      const marketId = Number(raw.marketId);
      const tickSize = String(raw.tickSize ?? '');
      const stepSize = String(raw.stepSize ?? '');
      const lastPrice = Number(raw.markPrice ?? raw.oraclePrice ?? raw.lastTradePrice);
      if (!Number.isInteger(marketId) || !(Number(tickSize) > 0) || !(Number(stepSize) > 0)) continue;
      const initialMargin = Number(raw.isOutsideRth ? raw.offHoursInitialMarginFraction : raw.initialMarginFraction);
      const tickTiers = Array.isArray(raw.tickTiers)
        ? raw.tickTiers.map((tier) => ({ upToPrice: tier.upToPrice ?? null, tick: tier.tick ?? tier.tickSize }))
        : [];
      const market = {
        marketId,
        name: String(raw.marketDisplayName || raw.symbol || marketId),
        displayName: String(raw.marketDisplayName || raw.symbol || marketId),
        exchangeSymbol: String(raw.marketDisplayName || raw.symbol || marketId),
        symbol: String(raw.baseAsset || raw.base || ''),
        category: raw.category || null,
        lastPrice: lastPrice > 0 ? lastPrice : null,
        tickSize,
        tickTiers,
        priceStep: tickSize,
        qtyStep: stepSize,
        stepPrice: Number(chooseTick({ tickSize, tickTiers }, lastPrice > 0 ? lastPrice : tickSize)),
        stepSize: Number(stepSize),
        minOrderSize: Number(raw.minOrderSize ?? stepSize),
        minOrderNotional: Number(raw.minOrderNotional ?? raw.minNotional ?? 0),
        minNotional: Number(raw.minOrderNotional ?? raw.minNotional ?? 0),
        maxOrderSize: Number(raw.maxOrderSize ?? Infinity),
        maxLeverage: Number.isFinite(initialMargin) && initialMargin > 0
          ? Math.max(1, Math.floor(1 / initialMargin + 1e-9)) : 50,
        lowerTradingBound: raw.lowerTradingBound ?? null,
        upperTradingBound: raw.upperTradingBound ?? null,
      };
      if (!(market.minOrderSize > 0) || !(market.maxOrderSize >= market.minOrderSize)) continue;
      next.set(marketId, market);
      if (lastPrice > 0) this._prices.set(marketId, lastPrice);
    }
    if (!next.size) throw new Error('Arcus 当前没有 ONLINE 状态且精度有效的永续市场。');
    this.markets = next;
  }

  async getMarkets() { return [...this.markets.values()]; }

  _market(marketId) {
    const market = this.markets.get(Number(marketId));
    if (!market) throw new Error(`未知 Arcus 市场 marketId=${marketId}`);
    return market;
  }

  async getCandles(marketId, intervalSec = 3600, count = 200) {
    const market = this._market(marketId);
    const timeframe = INTERVALS[Number(intervalSec)] || '1h';
    const to = BigInt(Date.now()) * 1000n;
    const path = `/v1/candles?market=${encodeURIComponent(market.name)}&timeframe=${timeframe}&to=${to}&countback=${Math.min(1500, Math.max(1, Number(count) || 200))}`;
    const payload = await this._get(path);
    const rows = arrayPayload(payload, 'candles', 'result') || [];
    return rows.map((row) => ({
      time: Math.floor(Number(row.openTime ?? row.timestamp ?? row.time ?? 0) / 1000),
      open: Number(row.open), high: Number(row.high), low: Number(row.low),
      close: Number(row.close), volume: Number(row.volume || 0),
    })).filter((row) => row.time > 0 && Number.isFinite(row.close)).sort((a, b) => a.time - b.time);
  }

  async getPrice(marketId) {
    const market = this._market(marketId);
    this._watch.add(market.marketId);
    try {
      const bbo = await this._get(`/v1/bbo/${encodeURIComponent(market.name)}`);
      const bid = Number(bbo?.bestBid?.price ?? bbo?.bestBid);
      const ask = Number(bbo?.bestAsk?.price ?? bbo?.bestAsk);
      const price = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid > 0 ? bid : ask;
      if (price > 0) {
        this._applyPrice(market.marketId, price);
        return price;
      }
    } catch { /* global snapshot/cache below */ }
    if (!this._prices.has(market.marketId)) await this._refreshPrices();
    const price = this._prices.get(market.marketId) ?? market.lastPrice;
    if (!(price > 0)) throw new Error(`Arcus ${market.name} 未返回有效价格。`);
    return price;
  }

  async preflightTrading(marketId, context = {}) {
    this._market(marketId);
    await this._refreshAccount();
    const available = Number(this.availableMargin ?? this.balance);
    if (!Number.isFinite(available) || available < 0) {
      throw new Error('Arcus 未返回有效可用保证金，已拒绝发送交易写请求。');
    }
    const required = Number(context?.risk?.requiredMargin);
    if (Number.isFinite(required) && required > available) {
      throw new Error(`Arcus 首单前保证金预检未通过：网格约需 ${required} USD，当前可用 ${available} USD。请降低每格数量/网格数或补充保证金；尚未发送任何交易写请求。`);
    }
    return { availableMargin: available, settleCurrency: 'USD' };
  }

  _prepareOrder(market, order) {
    const side = String(order.side || '').toLowerCase();
    if (!['buy', 'sell'].includes(side)) throw new Error(`Arcus 不支持的订单方向: ${order.side}`);
    if (!(Number(order.price) > 0) || !(Number(order.sizeBase) > 0)) {
      throw new Error('Arcus 订单价格和数量必须为正数。');
    }
    const tierTick = chooseTick(market, order.price);
    const price = alignDecimal(order.price, tierTick, 'nearest');
    const quantity = alignDecimal(order.sizeBase, market.qtyStep, 'down');
    const quantityQuantums = toUnitsExact(quantity, market.qtyStep);
    const priceTicks = toUnitsExact(price, market.priceStep);
    if (quantityQuantums <= 0n || Number(quantity) < market.minOrderSize) {
      throw new Error(`数量 ${quantity} 低于 Arcus ${market.name} 最小下单量 ${market.minOrderSize}。`);
    }
    if (Number(quantity) > market.maxOrderSize) {
      throw new Error(`数量 ${quantity} 超过 Arcus ${market.name} 最大下单量 ${market.maxOrderSize}。`);
    }
    const notional = Number(price) * Number(quantity);
    if (!order.reduceOnly && market.minOrderNotional > 0 && notional < market.minOrderNotional) {
      throw new Error(`订单名义价值 ${notional} 低于 Arcus ${market.name} 最低 ${market.minOrderNotional} USD。`);
    }
    if (market.lowerTradingBound != null && Number(price) < Number(market.lowerTradingBound)) {
      throw new Error(`Arcus ${market.name} 价格低于交易下限 ${market.lowerTradingBound}。`);
    }
    if (market.upperTradingBound != null && Number(price) > Number(market.upperTradingBound)) {
      throw new Error(`Arcus ${market.name} 价格高于交易上限 ${market.upperTradingBound}。`);
    }
    return { side, price, quantity, priceTicks, quantityQuantums };
  }

  async _submitOrder(order) {
    const market = this._market(order.marketId);
    const prepared = this._prepareOrder(market, order);
    const timestamp = timestampNs();
    const goodTilTime = futureGoodTilUs(this.goodTilDays);
    const side = prepared.side.toUpperCase();
    const timeInForce = String(order.timeInForce || (order.orderType === 'MARKET' ? 'IOC' : order.postOnly ? 'ALO' : 'GTT')).toUpperCase();
    const clientId = clientOrderId(order.clientId || (order.clientOrderId != null ? `wg${order.clientOrderId}` : ''));
    const signedPayload = buildPlacePayload({
      address: this.address, accountIndex: this.accountIndex, clientId,
      timestamp, goodTilTimeUs: goodTilTime, marketId: market.marketId,
      priceTicks: prepared.priceTicks, quantityQuantums: prepared.quantityQuantums,
      reduceOnly: Boolean(order.reduceOnly), side, timeInForce,
    });
    const body = {
      address: this.address,
      accountIndex: this.accountIndex,
      marketId: market.marketId,
      orderSide: side,
      orderType: order.orderType || 'LIMIT',
      quantity: prepared.quantity,
      price: prepared.price,
      timeInForce,
      goodTilTime: String(goodTilTime),
      reduceOnly: Boolean(order.reduceOnly),
      clientId,
      timestamp,
    };
    let response;
    try {
      response = await this._signedTyped('/v1/placeOrder', signedPayload, body, timestamp);
    } catch (error) {
      if (error.statusUnknown) {
        const found = await this._findOrderByClientId(clientId).catch(() => null);
        if (found?.orderId) response = found;
        else throw error;
      } else throw error;
    }
    const row = response?.result ?? response?.order ?? response;
    if (String(row?.status || row?.state || '').toUpperCase() === 'REJECTED') {
      throw new Error(`Arcus 订单被拒绝：${row?.rejectReason || row?.rejectionReason || 'REJECTED'}`);
    }
    const orderId = String(row?.orderId || '');
    if (!orderId) {
      const error = new Error('Arcus 已响应下单请求但未返回 orderId；结果未确认，请先核对交易所挂单。');
      error.statusUnknown = true;
      throw error;
    }
    const tracked = {
      orderId, clientId, marketId: market.marketId, levelIndex: order.levelIndex,
      side: prepared.side, price: Number(prepared.price), sizeBase: Number(prepared.quantity),
      reduceOnly: Boolean(order.reduceOnly), placedAt: Date.now(),
    };
    this._watch.add(market.marketId);
    this._tracked.set(orderId, tracked);
    return { ...tracked, clientOrderId: order.clientOrderId };
  }

  async placeLimitOrder(order) {
    return this._submitOrder({
      ...order,
      orderType: 'LIMIT',
      timeInForce: order.postOnly === false ? 'GTT' : 'ALO',
    });
  }

  async placeLimitOrders(orders) {
    if (!Array.isArray(orders) || !orders.length) return { placed: [], failed: [] };
    // Validate the complete ladder before the first live write.
    for (const order of orders) this._prepareOrder(this._market(order.marketId), order);
    const placed = [];
    try {
      for (const order of orders) placed.push(await this.placeLimitOrder(order));
    } catch (error) {
      error.partialOrders = placed;
      throw error;
    }
    return { placed, failed: [] };
  }

  async cancelOrder(marketId, orderId) {
    const market = this._market(marketId);
    const tracked = this._tracked.get(String(orderId));
    if (tracked && tracked.marketId !== market.marketId) throw new Error('Arcus 订单不属于当前市场。');
    const timestamp = timestampNs();
    const signedPayload = buildCancelPayload({
      address: this.address, accountIndex: this.accountIndex, timestamp,
      orderId: String(orderId), marketId: market.marketId,
    });
    await this._signedTyped('/v1/cancelOrder', signedPayload, {
      address: this.address, accountIndex: this.accountIndex, marketId: market.marketId,
      kind: 'orderId', orderId: String(orderId), timestamp,
    }, timestamp);
    this._tracked.delete(String(orderId));
    this._missingCounts.delete(String(orderId));
    return true;
  }

  async cancelAll(marketId) {
    const market = this._market(marketId);
    const rows = await this._fetchAllOpenOrders();
    if (!Array.isArray(rows)) throw new Error('Arcus 无法读取真实挂单，已拒绝执行批量撤单。');
    const targets = rows.filter((row) => Number(row.marketId) === market.marketId);
    for (const row of targets) await this.cancelOrder(market.marketId, row.orderId);
    return true;
  }

  async setLeverage(marketId, value) {
    const market = this._market(marketId);
    const leverage = Math.max(1, Math.min(market.maxLeverage, Math.floor(Number(value) || 1)));
    const body = { address: this.address, accountIndex: this.accountIndex, marketId: market.marketId, leverage };
    try {
      const response = await this._signedLegacy('/v1/setLeverage', 'setLeverage', body);
      if (String(response?.status || '').toUpperCase() === 'REJECTED') {
        throw new Error(response?.rejectReason || 'Arcus 杠杆设置被拒绝');
      }
      return true;
    } catch (error) {
      this.lastError = error?.message || String(error);
      this._emitError(error);
      return false;
    }
  }

  getOpenOrders(marketId) {
    return [...this._tracked.values()].filter((order) => order.marketId === Number(marketId));
  }

  forgetOrder(orderId) {
    this._tracked.delete(String(orderId));
    this._missingCounts.delete(String(orderId));
  }

  forgetOrders(marketId) {
    for (const [orderId, order] of this._tracked) {
      if (order.marketId === Number(marketId)) this.forgetOrder(orderId);
    }
  }

  adoptOrder(order) {
    const market = this._market(order.marketId);
    if (!order.orderId || !['buy', 'sell'].includes(String(order.side).toLowerCase())) {
      throw new Error('Arcus 无法恢复缺少订单标识或方向的挂单。');
    }
    const tracked = {
      ...order,
      orderId: String(order.orderId), marketId: market.marketId,
      side: String(order.side).toLowerCase(), price: Number(order.price),
      sizeBase: Number(order.sizeBase || 0), placedAt: Number(order.placedAt) || Date.now(),
    };
    this._watch.add(market.marketId);
    this._tracked.set(tracked.orderId, tracked);
  }

  async fetchOpenOrders(marketId) {
    const market = this._market(marketId);
    const rows = await this._fetchAllOpenOrders();
    if (!Array.isArray(rows)) throw new Error('Arcus 挂单快照格式异常，已保留本地订单记录。');
    return rows.filter((row) => Number(row.marketId) === market.marketId).map((row) => ({
      orderId: String(row.orderId),
      clientOrderId: row.clientId == null ? null : String(row.clientId),
      marketId: market.marketId,
      side: String(row.side || row.orderSide || '').toLowerCase() === 'buy' ? 'buy' : 'sell',
      price: Number(row.price),
      sizeBase: Number(row.remainingSize ?? row.quantity ?? row.size ?? 0),
    }));
  }

  async _fetchAllOpenOrders() {
    const payload = await this._get(`/v1/openOrders?${this._accountQuery()}`);
    const rows = arrayPayload(payload, 'orders', 'openOrders', 'result');
    if (!rows) return null;
    return rows.filter((row) => row?.orderId != null
      && (row.accountIndex == null || Number(row.accountIndex) === this.accountIndex));
  }

  async _findOrderByClientId(clientId) {
    const payload = await this._get(`/v1/orders?${this._accountQuery('limit=200')}`);
    const rows = arrayPayload(payload, 'orders', 'result') || [];
    return rows.find((row) => String(row?.clientId || '').toLowerCase() === String(clientId).toLowerCase()) || null;
  }

  getPosition(marketId) {
    return this._positions.get(Number(marketId)) || null;
  }

  async closePosition(marketId) {
    const market = this._market(marketId);
    await this._refreshPositions();
    const position = this._positions.get(market.marketId);
    if (!position?.sizeBase) return true;
    const isBuy = position.sizeBase < 0;
    const mark = await this.getPrice(market.marketId);
    return this._submitOrder({
      marketId: market.marketId,
      side: isBuy ? 'buy' : 'sell',
      price: mark * (isBuy ? 1.05 : 0.95),
      sizeBase: Math.abs(position.sizeBase),
      reduceOnly: true,
      orderType: 'MARKET',
      timeInForce: 'IOC',
    });
  }

  _applyPrice(marketId, price) {
    const id = Number(marketId);
    const numeric = Number(price);
    if (!this.markets.has(id) || !(numeric > 0)) return false;
    this._prices.set(id, numeric);
    this.markets.get(id).lastPrice = numeric;
    if (this._watch.has(id)) this.emit('price', { marketId: id, price: numeric });
    return true;
  }

  async _refreshPrices() {
    const payload = await this._get('/v1/prices');
    const source = payload?.prices ?? payload?.result ?? payload;
    const rows = Array.isArray(source) ? source.map((row) => [row?.marketId, row]) : Object.entries(source || {});
    let applied = 0;
    for (const [key, row] of rows) {
      if (this._applyPrice(row?.marketId ?? key, row?.markPrice ?? row?.oraclePrice ?? row?.price)) applied++;
    }
    if (!applied) throw new Error('Arcus 价格快照格式异常。');
  }

  async _refreshAccount() {
    try {
      const payload = await this._get(`/v1/account?${this._accountQuery()}`);
      const row = payload?.result ?? payload?.account ?? payload;
      const balance = Number(row?.netQuoteBalance ?? row?.balance);
      const equity = Number(row?.accountEquity ?? row?.equity);
      if (!Number.isFinite(balance) || !Number.isFinite(equity)) {
        throw new Error('Arcus 账户快照缺少有效的 netQuoteBalance/equity，已保留上一份有效数据。');
      }
      this.balance = balance;
      this.equity = equity;
      const available = Number(row?.availableMargin ?? row?.availableBalance ?? balance);
      this.availableMargin = Number.isFinite(available) ? available : balance;
      const realized = Number(row?.realizedPnl ?? row?.realizedPnL);
      if (Number.isFinite(realized)) this.realizedPnl = realized;
    } catch (error) {
      if (error.status === 404) {
        this.balance = 0;
        this.equity = 0;
        this.availableMargin = 0;
        return;
      }
      throw error;
    }
  }

  async _refreshPositions() {
    try {
      const payload = await this._get(`/v1/positions?${this._accountQuery()}`);
      const wrapped = payload?.positions !== undefined || payload?.result !== undefined;
      const source = payload?.positions ?? payload?.result ?? payload;
      const keyedEntries = !wrapped && source && typeof source === 'object' && !Array.isArray(source)
        ? Object.entries(source) : [];
      const keyedSnapshot = keyedEntries.length > 0
        && keyedEntries.every(([key, value]) => /^\d+$/.test(key) && value && typeof value === 'object');
      if (!Array.isArray(source) && !(wrapped && source && typeof source === 'object') && !keyedSnapshot) {
        throw new Error('Arcus 仓位快照格式异常，已保留上一份有效仓位。');
      }
      const rows = Array.isArray(source) ? source : Object.values(source || {});
      const next = new Map();
      for (const row of rows) {
        if (!row || (row.accountIndex != null && Number(row.accountIndex) !== this.accountIndex)) continue;
        const marketId = Number(row.marketId);
        let sizeBase = Number(row.size ?? row.sizeBase ?? 0);
        if (String(row.side).toUpperCase() === 'SHORT' && sizeBase > 0) sizeBase = -sizeBase;
        if (!this.markets.has(marketId) || !Number.isFinite(sizeBase) || !sizeBase) continue;
        next.set(marketId, {
          sizeBase,
          entryPrice: Number(row.averageEntryPrice ?? row.entryPrice ?? 0),
          unrealizedPnl: Number(row.unrealizedPnl ?? row.unrealizedPnL ?? 0),
          leverage: Number(row.leverage) > 0 ? Number(row.leverage) : null,
          ...extractLiquidationPrice(row),
        });
        this._watch.add(marketId);
      }
      this._positions = next;
    } catch (error) {
      if (error.status === 404) {
        this._positions.clear();
        return;
      }
      throw error;
    }
  }

  async _refreshFeeRate() {
    try {
      const payload = await this._get(`/v1/account/stats?address=${encodeURIComponent(this.address)}&include=feeTier`);
      const tier = payload?.tradingFeeTier ?? payload?.result?.tradingFeeTier;
      const maker = Number(tier?.makerFeePpm);
      const taker = Number(tier?.takerFeePpm);
      const rate = Math.max(Number.isFinite(maker) ? maker : 0, Number.isFinite(taker) ? taker : 0);
      if (rate >= 0 && (Number.isFinite(maker) || Number.isFinite(taker))) this.feeRate = rate / 1_000_000;
    } catch { /* keep conservative configured fallback */ }
  }

  _handleOrderUpdate(row) {
    const orderId = String(row?.orderId || '');
    const tracked = this._tracked.get(orderId);
    if (!tracked) return;
    const status = String(row.status || row.state || '').toUpperCase();
    if (!FINAL_ORDER_STATES.has(status)) return;
    this.forgetOrder(orderId);
    const original = Number(row.originalSize ?? row.quantity ?? tracked.sizeBase);
    const remaining = Number(row.remainingSize ?? 0);
    const explicit = Number(row.filledSize ?? row.executedQuantity);
    const filled = Number.isFinite(explicit) ? explicit : Math.max(0, original - remaining);
    if (status === 'FILLED' || filled > 0) {
      this.emit('fill', {
        orderId, marketId: tracked.marketId, levelIndex: tracked.levelIndex,
        side: tracked.side, sizeBase: filled > 0 ? filled : original,
        price: Number(row.avgFillPrice ?? row.averagePrice ?? row.price ?? tracked.price),
      });
    } else if (['REJECTED', 'MARGIN_CANCELED'].includes(status)) {
      this._emitError(new Error(`Arcus 订单 ${orderId} 被拒绝/取消：${row.rejectionReason || row.rejectReason || status}`));
    }
  }

  async _refreshOpenOrders() {
    const rows = await this._fetchAllOpenOrders();
    if (!Array.isArray(rows)) throw new Error('Arcus 挂单快照格式异常。');
    const live = new Map(rows.map((row) => [String(row.orderId), row]));
    for (const row of rows) this._handleOrderUpdate(row);
    for (const [orderId, tracked] of [...this._tracked]) {
      if (live.has(orderId) || Date.now() - tracked.placedAt < this.pollMs * 2) {
        this._missingCounts.delete(orderId);
        continue;
      }
      const missing = (this._missingCounts.get(orderId) || 0) + 1;
      this._missingCounts.set(orderId, missing);
      if (missing < 2) continue;
      try {
        const payload = await this._get(`/v1/order/${encodeURIComponent(orderId)}?${this._accountQuery()}`);
        this._handleOrderUpdate(payload?.order ?? payload?.result ?? payload);
      } catch (error) {
        // A missing order is never guessed to be filled. Keep it until several
        // authoritative misses, then stop tracking without creating a grid leg.
        if (error.status === 404 && missing >= 6) {
          this.forgetOrder(orderId);
          this._emitError(new Error(`Arcus 订单 ${orderId} 已离开挂单簿但无法确认成交，已停止跟踪且不会补单。`));
        } else if (error.status !== 404) throw error;
      }
    }
  }

  _emitError(error) {
    if (this.listenerCount('error')) this.emit('error', error);
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
      await this._refreshPrices();
      await this._refreshAccount();
      await this._refreshPositions();
      await this._refreshOpenOrders();
      this.lastOkAt = Date.now();
      this.lastError = null;
    } catch (error) {
      this.lastError = error?.message || String(error);
      this._emitError(error);
    } finally {
      this._busy = false;
    }
  }
}
