// ExtendedExchange: LIVE adapter for Extended (https://extended.exchange),
// a perpetuals DEX on Starknet. Zero external dependencies:
//   - REST via built-in fetch (X-Api-Key header for reads)
//   - order signing via ./starkcrypto.js (SNIP-12 + Stark ECDSA, verified
//     against the official python SDK test vectors; selfTest() runs on init)
//
// Markets on Extended are addressed by NAME ("BTC-USD"). The bot uses numeric
// marketIds, so this adapter assigns stable per-process ids (sorted by daily
// volume) and keeps the name in `market.name`.
//
// Fills are detected by polling open orders: an order we placed that is no
// longer resting is confirmed via GET /api/v1/user/orders/history?id={id}
// (a FILLED order leaves the open-orders endpoint, so history is the only place
// that reports its filledQty); only a positively-confirmed fill is reported.
import { EventEmitter } from 'node:events';
import {
  selfTest, orderMsgHash, starkSign, settlementAmounts, alignToStep, parseDec, toHex,
  publicKeyFromPrivate,
} from './starkcrypto.js';
import { ExchangeWriteScheduler, retryAfterMsFromHeaders } from '../write-scheduler.js';
import { extractLiquidationPrice } from '../liquidation-price.js';

const DOMAINS = {
  mainnet: { name: 'Perpetuals', version: 'v0', chainId: 'SN_MAIN', revision: 1 },
  testnet: { name: 'Perpetuals', version: 'v0', chainId: 'SN_SEPOLIA', revision: 1 },
};
const INTERVALS = { 60: 'PT1M', 300: 'PT5M', 900: 'PT15M', 1800: 'PT30M', 3600: 'PT1H', 7200: 'PT2H', 14400: 'PT4H', 86400: 'P1D' };
const ORDER_EXPIRY_DAYS = 90;          // resting grid orders live this long (max GTT; longer = less decay on long-running grids)
const SETTLEMENT_BUFFER_DAYS = 14;     // same buffer as the official SDK
const USER_AGENT = 'ExtendedGridBot/1.0';

function normalizeFeeRate(value, label) {
  const text = String(value ?? '').trim();
  const number = Number(text);
  if (!text || !Number.isFinite(number) || number < 0) {
    throw new Error(`Extended 返回了无效的${label}：${text || '空值'}`);
  }
  return text;
}

function isInvalidTradingFeeError(error) {
  return String(error?.code || '') === '1128' || /Trading fees? are invalid|接口错误\s*1128/i.test(String(error?.message || error));
}

export class ExtendedExchange extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.mode = 'live';
    this.apiKey = opts.apiKey;
    this.vault = String(opts.vault ?? '').trim();
    this.privateKey = BigInt(opts.privateKey);
    this.publicKey = opts.publicKey ? BigInt(opts.publicKey) : null;
    this.apiUrl = (opts.apiUrl || '').replace(/\/$/, '');
    this.network = opts.network || 'mainnet';
    // EXTENDED_MAX_FEE is a safety ceiling, not the value blindly signed into
    // every order. Extended requires the account's CURRENT maker/taker fee from
    // GET /api/v1/user/fees; discounted accounts can differ from the public
    // schedule and a stale hard-coded fee is rejected with code 1128.
    this.maxFeeRate = normalizeFeeRate(opts.feeRate || '0.0005', '手续费上限');
    this.feeRate = this.maxFeeRate; // replaced by the current taker rate during init
    this.pollMs = opts.pollMs ?? 2500;
    this.orderGapMs = Math.max(200, Number(opts.orderGapMs) || 400);
    this._writeScheduler = new ExchangeWriteScheduler({
      label: 'Extended', minGapMs: this.orderGapMs, maxRetries: 5,
      baseDelayMs: Math.max(1000, this.orderGapMs), sleep: opts.sleep, now: opts.now,
    });
    this._graceMs = this.pollMs * 2; // grace before judging a just-placed order "gone"
    this.lastOkAt = 0;
    this.lastError = null;
    this.domain = DOMAINS[this.network] || DOMAINS.mainnet;
    this.markets = new Map();   // marketId -> market
    this.balance = null;
    this.equity = null;
    this._tracked = new Map();  // orderId(str) -> {marketId, levelIndex, side, price, sizeBase, seen}
    this._watch = new Set();    // marketIds to poll
    this._watchTouch = new Map(); // marketId -> last external interest (for idle pruning)
    this._pos = new Map();      // marketId -> position
    this._prices = new Map();
    this._fees = new Map();       // market name -> { makerFeeRate, takerFeeRate }
    this._feesLoadedAt = 0;
    this._timer = null;
    this._busy = false;
  }

  async init() {
    if (!this.apiKey || !/^\d+$/.test(this.vault) || !this.privateKey) {
      throw new Error('LIVE 模式需要 EXTENDED_API_KEY / EXTENDED_VAULT / EXTENDED_STARK_PRIVATE_KEY（在 app.extended.exchange 的 API Management 页面获取）。');
    }
    // Refuse to trade if the signing implementation doesn't reproduce the
    // official SDK test vector (protects against env/runtime quirks).
    selfTest();
    if (this.publicKey == null) this.publicKey = publicKeyFromPrivate(this.privateKey);
    await this._syncAccountIdentity();

    // The markets endpoint has been observed transiently returning an EMPTY
    // list (same API flakiness as the open-orders snapshot). A single bad
    // response used to fail init and knock this exchange out for the whole
    // session — retry a few times before giving up.
    let data = null;
    for (let i = 1; i <= 3; i++) {
      data = await this._get('/api/v1/info/markets').catch((e) => { if (i === 3) throw e; return null; });
      if (Array.isArray(data) && data.length) break;
      if (i < 3) { console.log(`[Extended] 市场列表为空/异常，${i}/2 次重试...`); await new Promise((r) => setTimeout(r, 2500 * i)); }
    }
    const list = (data || [])
      .filter((m) => m.active && (m.type ?? 'PERPETUAL') === 'PERPETUAL' && m.l2Config)
      .sort((a, b) => Number(b.marketStats?.dailyVolume || 0) - Number(a.marketStats?.dailyVolume || 0));
    let id = 1;
    for (const m of list) {
      const t = m.tradingConfig || {};
      const px = Number(m.marketStats?.lastPrice || m.marketStats?.markPrice || 0);
      this.markets.set(id, {
        marketId: id, name: m.name, displayName: m.name, symbol: m.assetName,
        lastPrice: px,
        stepSize: Number(t.minOrderSizeChange || t.minOrderSize), stepPrice: Number(t.minPriceChange),
        maxLeverage: Number(t.maxLeverage || 50), minOrderSize: Number(t.minOrderSize),
        qtyStep: String(t.minOrderSizeChange || t.minOrderSize), priceStep: String(t.minPriceChange),
        l2: { // keep as strings: market objects are JSON-serialized for the dashboard
          syntheticId: String(m.l2Config.syntheticId), collateralId: String(m.l2Config.collateralId),
          synRes: Number(m.l2Config.syntheticResolution), colRes: Number(m.l2Config.collateralResolution),
        },
      });
      this._prices.set(id, px);
      id++;
    }
    if (!this.markets.size) {
      // 诊断：打印原始响应，区分「接口维护」与「代理出口 IP 被风控拦截」（后者
      // 通常返回 Cloudflare 质询页/403，res.json() 解析失败后表现为"空市场列表"）。
      try {
        const res = await fetch(this.apiUrl + '/api/v1/info/markets', { headers: this._headers(), signal: AbortSignal.timeout(10000) });
        const body = (await res.text()).slice(0, 200).replace(/\s+/g, ' ');
        console.error(`[Extended] 诊断：HTTP ${res.status}；响应开头：${body}`);
        if (res.status === 403 || /cloudflare|challenge|blocked|denied|captcha/i.test(body)) {
          console.error('[Extended] ➤ 疑似代理出口 IP 被交易所风控拦截：请在代理软件里更换节点（换出口 IP），然后点击仪表盘上的「🔌 重连交易所」即可，无需重启程序。');
        }
      } catch (e) {
        console.error('[Extended] 诊断请求失败：' + (e?.message || e) + '（网络层面连不通，检查代理）');
      }
      throw new Error('Extended 未返回可交易市场。');
    }
    this.dataSource = 'real';
    this.lastOkAt = Date.now();
    await this._refreshAccount(); // also validates the API key
    await this._refreshFees(null, { required: true });
    this.start();
    return true;
  }

  /**
   * Re-establish the exchange connection WITHOUT touching resting orders or the
   * position: break a stuck poll lock, probe the API once, restart polling.
   * Order tracking is preserved. Throws if the exchange is still unreachable.
   * (Extended uses plain fetch per request — no persistent client to rebuild.)
   */
  async reconnect() {
    this.stop();          // clear the poll timer
    this._busy = false;   // break a poll wedged on a hung request
    this.lastError = null;
    if (!this.markets.size) return this.init(); // never came up: full init
    await this._syncAccountIdentity();
    const b = await this._get('/api/v1/user/balance')
      .catch((e) => { if (/404/.test(String(e?.message))) return null; throw e; }); // 404 = zero balance, still connected
    if (b) { this.balance = Number(b.balance); this.equity = Number(b.equity); }
    await this._refreshFees(null, { required: true });
    this.lastOkAt = Date.now();
    this.start();
    return true;
  }

  // ---------- HTTP ----------
  _headers() {
    return { 'X-Api-Key': this.apiKey, 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' };
  }

  async _req(method, path, body) {
    const execute = () => this._reqOnce(method, path, body);
    if (method === 'GET') return execute();
    return this._writeScheduler.run(execute, { operation: `${method} ${path}` });
  }

  async _reqOnce(method, path, body) {
    const res = await fetch(this.apiUrl + path, {
      method, headers: this._headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    let j = null;
    try { j = await res.json(); } catch { /* some endpoints return empty bodies */ }
    if (res.status === 401) throw new Error('API key 无效或已过期 (401)。');
    if (res.status === 429) {
      const error = new Error('Extended 触发限流 (429)，正在自动退避后重试。');
      error.exchangeCode = 'too_many_requests';
      error.httpStatus = 429;
      error.retryAfterMs = retryAfterMsFromHeaders(res.headers);
      throw error;
    }
    if (j && j.status === 'ERROR') {
      const e = j.error || {};
      const error = new Error(`Extended 接口错误 ${e.code || res.status}: ${e.message || JSON.stringify(j)}`);
      error.code = e.code || res.status;
      error.httpStatus = res.status;
      throw error;
    }
    if (!res.ok) throw new Error(`Extended 接口错误 HTTP ${res.status}: ${path}`);
    return j ? j.data : null;
  }

  _get(path) { return this._req('GET', path); }

  /**
   * The API key is scoped to exactly one Extended sub-account. Always read its
   * authoritative Stark key + L2 vault before the first write: this prevents
   * a stale copied Vault ID from producing code 1102 and also avoids silently
   * signing for a different sub-account. The in-memory vault is corrected from
   * the authenticated account; secrets are never written back or logged.
   */
  async _syncAccountIdentity() {
    const account = await this._get('/api/v1/user/account/info');
    const vault = String(account?.l2Vault ?? '').trim();
    const status = String(account?.status || '').toUpperCase();
    if (status && status !== 'ACTIVE') {
      throw new Error(`Extended 当前 API Key 对应子账户状态为 ${status}，已阻止实盘下单。`);
    }
    if (!/^\d+$/.test(vault)) {
      throw new Error('Extended 账户接口未返回有效的 l2Vault，已阻止实盘下单。请重新创建该子账户的 API Key。');
    }
    let accountPublicKey;
    try { accountPublicKey = BigInt(account?.l2Key); }
    catch { throw new Error('Extended 账户接口未返回有效的 l2Key，已阻止实盘下单。'); }
    if (accountPublicKey !== this.publicKey) {
      throw new Error('Extended API Key 与 Stark 私钥不属于同一个子账户。请在 API Management 重新复制同一行的 API Key、Stark Key 和 Vault。');
    }
    if (vault !== this.vault) {
      console.warn('[Extended] 配置中的 Vault 已过期或属于其他子账户；本次运行已采用当前 API Key 返回的权威 l2Vault。');
      this.vault = vault;
    }
    return { vault: this.vault, status: status || 'ACTIVE' };
  }

  // ---------- market data ----------
  async getMarkets() { return [...this.markets.values()]; }

  _market(marketId) {
    const m = this.markets.get(Number(marketId));
    if (!m) throw new Error('未知市场 marketId=' + marketId);
    return m;
  }

  async getCandles(marketId, intervalSec = 3600, n = 200) {
    const m = this._market(marketId);
    const interval = INTERVALS[intervalSec] || 'PT1H';
    const data = await this._get(`/api/v1/info/candles/${encodeURIComponent(m.name)}/trades?interval=${interval}&limit=${Math.min(n, 1000)}`);
    return (data || [])
      .map((c) => ({ time: Number(c.T), open: +c.o, high: +c.h, low: +c.l, close: +c.c, volume: +(c.v ?? 0) }))
      .filter((c) => Number.isFinite(c.close))
      .sort((a, b) => a.time - b.time);
  }

  async getPrice(marketId, opts = {}) {
    const mId = Number(marketId);
    this._watch.add(mId);
    if (opts.touch !== false) this._watchTouch.set(mId, Date.now()); // external interest
    const m = this._market(mId);
    try {
      const book = await this._get(`/api/v1/info/markets/${encodeURIComponent(m.name)}/orderbook`);
      const bid = Number(book?.bid?.[0]?.price), ask = Number(book?.ask?.[0]?.price);
      if (bid && ask) { const mid = (bid + ask) / 2; this._prices.set(mId, mid); return mid; }
      if (bid || ask) { const px = bid || ask; this._prices.set(mId, px); return px; }
    } catch { /* fall back */ }
    return this._prices.get(mId) ?? m.lastPrice;
  }

  // ---------- trading ----------
  async setLeverage(marketId, x) {
    const m = this._market(marketId);
    try {
      await this._req('PATCH', '/api/v1/user/leverage', { market: m.name, leverage: String(x) });
      return true;
    } catch (e) { this.emit('error', e); return false; }
  }

  _assertFeeWithinCap(feeRate, market, kind) {
    if (Number(feeRate) <= Number(this.maxFeeRate)) return;
    throw new Error(
      `Extended ${market} 当前${kind} ${feeRate} 超过本机安全上限 EXTENDED_MAX_FEE=${this.maxFeeRate}。` +
      '请先在“环境设置”确认费率后再提高上限，机器人不会绕过该保护。',
    );
  }

  async _refreshFees(marketName = null, { required = false } = {}) {
    try {
      const query = marketName ? `?market=${encodeURIComponent(marketName)}` : '';
      const rows = await this._get(`/api/v1/user/fees${query}`);
      if (!Array.isArray(rows) || !rows.length) throw new Error('Extended 未返回当前账户费率。');

      const updatedMarkets = new Set();
      for (const row of rows) {
        const market = String(row?.market || marketName || '').trim();
        if (!market) continue;
        const makerFeeRate = normalizeFeeRate(row?.makerFeeRate, `${market} maker 费率`);
        const takerFeeRate = normalizeFeeRate(row?.takerFeeRate, `${market} taker 费率`);
        this._assertFeeWithinCap(makerFeeRate, market, 'maker 费率');
        this._assertFeeWithinCap(takerFeeRate, market, 'taker 费率');
        this._fees.set(market, { makerFeeRate, takerFeeRate });
        updatedMarkets.add(market);
      }
      if (!updatedMarkets.size || (marketName && !updatedMarkets.has(marketName))) {
        throw new Error(`Extended 未返回 ${marketName || '任何市场'} 的当前账户费率。`);
      }
      // The bot's spacing guard reads feeRate. Use the highest CURRENT taker
      // fee seen, while each order below still uses its exact market fee.
      this.feeRate = [...this._fees.values()]
        .map((fee) => fee.takerFeeRate)
        .reduce((highest, fee) => Number(fee) > Number(highest) ? fee : highest, '0');
      this._feesLoadedAt = Date.now();
      return true;
    } catch (error) {
      if (required || !this._fees.size) throw error;
      this.lastError = error?.message || String(error);
      return false;
    }
  }

  _feeForOrder(market, postOnly) {
    const rates = this._fees.get(market.name);
    if (!rates) throw new Error(`Extended 尚未取得 ${market.name} 的当前账户费率，已阻止下单。`);
    const feeRate = postOnly ? rates.makerFeeRate : rates.takerFeeRate;
    this._assertFeeWithinCap(feeRate, market.name, postOnly ? 'maker 费率' : 'taker 费率');
    return feeRate;
  }

  async preflightTrading(marketId) {
    const market = marketId != null ? this._market(marketId) : null;
    await this._refreshFees(market?.name || null, { required: true });
    return true;
  }

  /** Build, sign and submit an order. Returns { orderId }. */
  async _submitOrder(m, order, allowFeeRefreshRetry = true) {
    try {
      return await this._submitOrderOnce(m, order);
    } catch (error) {
      // 1128 is an explicit REST rejection: the order was not accepted, so it
      // is safe to refresh the account fee and rebuild/sign exactly once. We do
      // not retry transport timeouts or unknown exchange states.
      if (!allowFeeRefreshRetry || !isInvalidTradingFeeError(error)) throw error;
      await this._refreshFees(m.name, { required: true });
      console.warn(`[Extended] 账户费率已更新，使用 ${m.name} 当前费率重新签名下单。`);
      return this._submitOrderOnce(m, order);
    }
  }

  async _submitOrderOnce(m, { side, qtyStr, priceStr, type, timeInForce, postOnly, reduceOnly }) {
    const isBuy = side === 'buy';
    const feeRate = this._feeForOrder(m, !!postOnly);
    const amounts = settlementAmounts({
      qty: qtyStr, price: priceStr, feeRate,
      synRes: m.l2.synRes, colRes: m.l2.colRes, isBuy,
    });
    const nonce = Math.floor(Math.random() * 0xFFFFFFFF);
    const expiryEpochMillis = Date.now() + ORDER_EXPIRY_DAYS * 86400_000;
    const expirationSec = Math.ceil(expiryEpochMillis / 1000) + SETTLEMENT_BUFFER_DAYS * 86400;
    const synId = BigInt(m.l2.syntheticId), colId = BigInt(m.l2.collateralId);
    const hash = orderMsgHash({
      positionId: this.vault,
      baseAssetId: synId, baseAmount: amounts.syntheticAmount,
      quoteAssetId: colId, quoteAmount: amounts.collateralAmount,
      feeAssetId: colId, feeAmount: amounts.feeAmount,
      expirationSec, salt: nonce, publicKey: this.publicKey, domain: this.domain,
    });
    const { r, s } = starkSign(hash, this.privateKey);
    const payload = {
      id: hash.toString(10),
      market: m.name,
      type,
      side: isBuy ? 'BUY' : 'SELL',
      qty: qtyStr,
      price: priceStr,
      reduceOnly: !!reduceOnly,
      postOnly: !!postOnly,
      timeInForce,
      expiryEpochMillis,
      fee: feeRate,
      nonce: String(nonce),
      selfTradeProtectionLevel: 'ACCOUNT',
      settlement: {
        signature: { r: toHex(r), s: toHex(s) },
        starkKey: toHex(this.publicKey),
        collateralPosition: String(this.vault),
      },
    };
    const data = await this._req('POST', '/api/v1/user/order', payload);
    return { orderId: String(data?.id ?? payload.id), externalId: payload.id };
  }

  async placeLimitOrder(o) {
    const m = this._market(o.marketId);
    const qtyStr = alignToStep(o.sizeBase, m.qtyStep, 'down');
    const priceStr = alignToStep(o.price, m.priceStep, 'nearest');
    if (parseDec(qtyStr).i <= 0n) throw new Error('数量过小，低于市场最小下单单位。');
    // postOnly defaults to FALSE: a grid replacement placed 1-3s after a fill can
    // cross the book in a fast market; a post-only order is then REJECTED and the
    // bot (correctly) doesn't re-quote it — that rung was silently lost forever.
    // GTC-style crossing just fills as taker: one taker fee beats a dead rung.
    // (Decibel adapter made the same change earlier for the same reason.)
    const { orderId, externalId } = await this._submitOrder(m, {
      side: o.side, qtyStr, priceStr, type: 'LIMIT', timeInForce: 'GTT',
      postOnly: o.postOnly ?? false, reduceOnly: !!o.reduceOnly,
    });
    this._watch.add(m.marketId);
    this._tracked.set(orderId, {
      marketId: m.marketId, levelIndex: o.levelIndex, side: o.side,
      price: Number(priceStr), sizeBase: Number(qtyStr), seen: false,
      externalId, placedAt: Date.now(), goneAttempts: 0, resolving: false,
    });
    return { orderId };
  }

  async cancelOrder(marketId, orderId) {
    this._tracked.delete(String(orderId));
    return this._req('DELETE', `/api/v1/user/order/${orderId}`);
  }

  async cancelAll(marketId) {
    const m = this._market(marketId);
    for (const [id, o] of this._tracked) if (o.marketId === m.marketId) this._tracked.delete(id);
    try { return await this._req('POST', '/api/v1/user/order/massCancel', { markets: [m.name] }); }
    catch (e) { this.emit('error', e); return false; }
  }

  getOpenOrders(marketId) {
    return [...this._tracked.values()].filter((o) => o.marketId === Number(marketId));
  }

  /** REAL resting orders on the exchange for this market (for reconciliation). */
  async fetchOpenOrders(marketId) {
    const m = this._market(marketId);
    const data = await this._get(`/api/v1/user/orders?market=${encodeURIComponent(m.name)}`);
    // A missing/malformed payload is NOT "zero orders" — return null so the
    // reconciler skips this cycle instead of pruning live orders off tracking.
    if (!Array.isArray(data)) return null;
    return data.map((o) => ({
      orderId: String(o.id),
      price: Number(o.price),
      side: String(o.side || '').toLowerCase() === 'buy' ? 'buy' : 'sell',
    }));
  }

  /** Re-attach a previously-placed order to this adapter's tracking (resume). */
  adoptOrder({ orderId, marketId, levelIndex, side, price, sizeBase }) {
    const mId = Number(marketId);
    this._watch.add(mId);
    this._tracked.set(String(orderId), {
      marketId: mId, levelIndex, side, price: Number(price), sizeBase: Number(sizeBase),
      seen: false, placedAt: Date.now(), goneAttempts: 0, resolving: false,
    });
  }

  getPosition(marketId) {
    const p = this._pos.get(Number(marketId));
    return p && p.sizeBase !== 0 ? p : null;
  }

  /** Close the current position with a reduce-only IOC market order. */
  async closePosition(marketId) {
    const m = this._market(marketId);
    const p = this._pos.get(m.marketId);
    if (!p || !p.sizeBase) return true;
    const isBuy = p.sizeBase < 0; // closing a short buys back
    const last = this._prices.get(m.marketId) || p.entryPrice;
    const worst = last * (isBuy ? 1.05 : 0.95); // worst accepted price
    const qtyStr = alignToStep(Math.abs(p.sizeBase), m.qtyStep, 'down');
    const priceStr = alignToStep(worst, m.priceStep, 'nearest');
    return this._submitOrder(m, {
      side: isBuy ? 'buy' : 'sell', qtyStr, priceStr,
      type: 'MARKET', timeInForce: 'IOC', postOnly: false, reduceOnly: true,
    });
  }

  // ---------- polling ----------
  start() { if (!this._timer) { this._timer = setInterval(() => this._poll(), this.pollMs); this._timer.unref?.(); } }
  stop() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }

  async _poll() {
    if (this._busy) {
      // Watchdog: a poll wedged >90s would block polling forever ("数据 Xs 未更新").
      if (Date.now() - (this._busySince || 0) < 90_000) return;
      console.log('[Extended] ⚠ 上一轮轮询卡住超过 90 秒，强制解锁继续轮询。');
    }
    this._busy = true; this._busySince = Date.now();
    try {
      // prune idle watch entries: no resting orders, no position, and no external
      // price interest for 10 minutes -> stop polling that market (each watched
      // market costs 3 sequential HTTP calls per cycle)
      const nowT = Date.now();
      for (const mId of [...this._watch]) {
        const hasOrders = [...this._tracked.values()].some((t) => t.marketId === mId);
        if (!hasOrders && !this._pos.has(mId) && nowT - (this._watchTouch.get(mId) || 0) > 600_000) {
          this._watch.delete(mId); this._watchTouch.delete(mId);
        }
      }
      for (const mId of this._watch) {
        const m = this.markets.get(mId);
        if (!m) continue;
        // price (also emitted for the dashboard)
        this.getPrice(mId, { touch: false }).then((px) => { if (px) this.emit('price', { marketId: mId, price: px }); }).catch(() => {});
        // open orders -> fill detection
        let open = null;
        try { open = await this._get(`/api/v1/user/orders?market=${encodeURIComponent(m.name)}`); } catch { /* keep */ }
        if (open) {
          const liveIds = new Set(open.map((o) => String(o.id)));
          for (const o of open) { const t = this._tracked.get(String(o.id)); if (t) { t.seen = true; t.goneAttempts = 0; } }
          const now = Date.now();
          for (const [id, t] of [...this._tracked]) {
            if (t.marketId !== mId || liveIds.has(id) || t.resolving) continue;
            // resolve once seen resting OR aged past grace (catches fast fills
            // that filled before the first poll — the old `seen`-only gate
            // dropped those and the grid stalled at that rung).
            if (!t.seen && now - (t.placedAt || 0) < this._graceMs) continue;
            t.resolving = true;
            this._resolveGone(id, t).finally(() => { t.resolving = false; });
          }
        }
        // position
        try {
          const ps = await this._get(`/api/v1/user/positions?market=${encodeURIComponent(m.name)}`);
          const p = (ps || [])[0];
          if (p && Number(p.size)) {
            const short = String(p.side).toUpperCase() === 'SHORT';
            const size = Math.abs(Number(p.size)) * (short ? -1 : 1);
            const liquidation = extractLiquidationPrice(p);
            this._pos.set(mId, {
              sizeBase: size, entryPrice: Number(p.openPrice),
              ...liquidation,
              unrealizedPnl: Number(p.unrealisedPnl ?? 0),
              leverage: p.leverage != null ? Number(p.leverage) : null,
            });
          } else { this._pos.delete(mId); }
        } catch { /* keep last */ }
      }
      await this._refreshAccount().catch(() => {});
      this.lastOkAt = Date.now();
    } catch (e) { this.lastError = e?.message || String(e); this.emit('error', e); }
    finally { this._busy = false; }
  }

  /**
   * A tracked order disappeared from the book: filled or cancelled?
   * Inconclusive lookups are retried a few polls before defaulting to filled, so
   * a transient API error can't fabricate a phantom fill. When the exchange
   * reports the real filled qty / average price we report THOSE (accurate volume
   * & PnL) instead of the order's intended size/price.
   */
  async _resolveGone(id, t) {
    let verdict = 'unknown';
    let fillPrice = t.price, fillSize = t.sizeBase;
    try {
      // A FILLED order is NOT returned by the open-orders endpoints — once it
      // fills it moves to ORDER HISTORY. So confirm via history (filtered by
      // order id), which carries the terminal status + filledQty + averagePrice.
      // (Querying the open-orders-by-id path could never see a real fill, which
      // previously made every Extended fill look "unconfirmed" and dropped its
      // take-profit replacement.)
      // Match by externalId (the order hash — a full-precision STRING the API
      // echoes back). The numeric `id` is a 19-digit integer that exceeds JS's
      // safe-integer range, so JSON parsing rounds it and String(x.id) compares
      // never match reliably. Query history by market (the id query-filter is
      // unreliable for the same precision reason).
      const mkt = this.markets.get(t.marketId)?.name;
      const data = await this._get(`/api/v1/user/orders/history?limit=200` + (mkt ? `&market=${encodeURIComponent(mkt)}` : ''));
      const rows = Array.isArray(data) ? data : [];
      const o = rows.find((x) =>
        (t.externalId && String(x.externalId) === String(t.externalId)) || String(x.id) === String(id));
      if (o) {
        const fq = Number(o.filledQty ?? 0);
        const st = String(o.status || '');
        if (fq > 0 || /FILLED/i.test(st)) {            // positive confirmation only
          verdict = 'filled';
          if (fq > 0) fillSize = fq;
          const avg = Number(o.averagePrice ?? 0);
          if (avg > 0) fillPrice = avg;
        } else if (/CANCELLED|REJECTED|EXPIRED/i.test(st)) {
          verdict = 'cancelled';
        } else if (/NEW|OPEN|ACCEPTED|PENDING|UNTRIGGERED|PARTIAL/i.test(st)) {
          // History says the order is STILL LIVE: the open-orders snapshot that
          // reported it "gone" was a glitch. Revive tracking and bail out —
          // counting these toward the give-up threshold used to drop dozens of
          // perfectly live orders during an API hiccup.
          t.goneAttempts = 0;
          t.seen = true;
          return;
        }
      }
    } catch { /* keep 'unknown' */ }

    if (verdict === 'unknown') {
      t.goneAttempts = (t.goneAttempts || 0) + 1;
      if (t.goneAttempts < 12) return; // re-check; tolerate order-history settlement lag
      verdict = 'cancelled';           // never confirmed filled -> assume NOT filled (no re-quote)
    }
    this._tracked.delete(id);
    if (verdict === 'filled') {
      this.emit('fill', { orderId: id, marketId: t.marketId, side: t.side, price: fillPrice, sizeBase: fillSize, levelIndex: t.levelIndex });
    } else {
      this.emit('error', new Error(`订单 ${id}（${t.side} @ ${t.price}）未确认成交，已停止跟踪（不补单）。`));
    }
  }

  async _refreshAccount() {
    try {
      const b = await this._get('/api/v1/user/balance');
      if (b) {
        this.balance = Number(b.balance);
        this.equity = Number(b.equity);
        this.lastOkAt = Date.now();
      }
    } catch (e) {
      if (/401/.test(e.message)) throw e;       // bad API key: surface it
      if (/404/.test(e.message)) this.balance = 0; // balance endpoint 404s when balance is 0
      /* otherwise keep last known balance */
    }
  }
}
