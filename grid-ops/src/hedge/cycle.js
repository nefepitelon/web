import { EventEmitter } from 'node:events';
import { validateHedgeAdapter } from '../exchange/registry.js';

export const HEDGE_STATES = Object.freeze({
  DRAFT: 'DRAFT', VALIDATING: 'VALIDATING', READY: 'READY', OPENING: 'OPENING',
  OPEN: 'OPEN', EXIT_TRIGGERED: 'EXIT_TRIGGERED', CLOSING: 'CLOSING',
  COMPENSATING: 'COMPENSATING', RECONCILING: 'RECONCILING', CLOSED: 'CLOSED',
  COOLDOWN: 'COOLDOWN', COMPLETED: 'COMPLETED', FAILED: 'FAILED', EMERGENCY: 'EMERGENCY',
});

const ACTIVE = new Set(['VALIDATING', 'READY', 'OPENING', 'OPEN', 'EXIT_TRIGGERED', 'CLOSING', 'COMPENSATING', 'RECONCILING', 'COOLDOWN', 'EMERGENCY']);
const TRANSITIONS = {
  DRAFT: ['VALIDATING'], VALIDATING: ['READY', 'FAILED'], READY: ['OPENING', 'FAILED'],
  OPENING: ['OPEN', 'COMPENSATING', 'FAILED'], OPEN: ['EXIT_TRIGGERED', 'RECONCILING', 'EMERGENCY'],
  EXIT_TRIGGERED: ['CLOSING', 'EMERGENCY'], CLOSING: ['CLOSED', 'RECONCILING', 'EMERGENCY'],
  COMPENSATING: ['CLOSED', 'RECONCILING', 'FAILED', 'EMERGENCY'],
  RECONCILING: ['OPEN', 'CLOSED', 'FAILED', 'EMERGENCY'], CLOSED: ['COOLDOWN', 'COMPLETED'],
  COOLDOWN: ['READY', 'COMPLETED'], FAILED: ['RECONCILING'], EMERGENCY: ['CLOSING', 'RECONCILING', 'CLOSED'],
  COMPLETED: [],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nullableNumber = (value) => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const round = (value, digits = 12) => Number(Number(value).toFixed(digits));
const positionSize = (position) => number(position?.sizeBase ?? position?.size ?? position?.quantity, 0);
const marketLabel = (market) => String(market?.displayName || market?.name || market?.symbol || '').toUpperCase().replace(/[-_]/g, '/');
const ALLOWED_LEVERAGES = new Set([1, 2, 5, 10]);
const ALLOWED_SIZE_PERCENTS = new Set([5, 10, 20, 30, 40]);
const HISTORY_LIMIT = 100;
const ORDER_HISTORY_LIMIT = 400;
const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED']);

function decimalPlaces(value) {
  const text = String(value ?? 0).toLowerCase();
  if (text.includes('e-')) return Number(text.split('e-')[1]) || 0;
  return (text.split('.')[1] || '').length;
}

function gcd(left, right) {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function commonStep(values) {
  const steps = values.map((value) => number(value)).filter((value) => value > 0);
  if (!steps.length) return 1e-8;
  const digits = Math.min(10, Math.max(...steps.map(decimalPlaces)));
  const scale = 10 ** digits;
  const integers = steps.map((value) => Math.max(1, Math.round(value * scale)));
  const lcm = integers.reduce((value, next) => Math.abs(value * next) / gcd(value, next), 1);
  return lcm / scale;
}

function accountView(exchange) {
  const balance = nullableNumber(exchange?.balance);
  const equity = nullableNumber(exchange?.equity);
  const positive = [balance, equity].filter((value) => value != null && value > 0);
  return {
    balance,
    equity,
    available: positive.length ? Math.min(...positive) : null,
  };
}

function positionView(position) {
  if (!position) return { sizeBase: 0, side: 'flat', entryPrice: null, markPrice: null, liquidationPrice: null, leverage: null, unrealizedPnl: null };
  const sizeBase = round(positionSize(position));
  return {
    sizeBase,
    side: sizeBase > 0 ? 'long' : sizeBase < 0 ? 'short' : 'flat',
    entryPrice: nullableNumber(position.entryPrice ?? position.avgEntryPrice),
    markPrice: nullableNumber(position.markPrice ?? position.price),
    liquidationPrice: nullableNumber(position.liquidationPrice ?? position.liqPrice ?? position.liquidation_price),
    leverage: nullableNumber(position.leverage),
    unrealizedPnl: nullableNumber(position.unrealizedPnl ?? position.unrealizedPnL),
  };
}

function publicError(error) {
  return { message: error?.message || String(error), code: error?.code || 'HEDGE_ERROR' };
}

function sanitizeCycle(cycle) {
  if (!cycle) return null;
  return JSON.parse(JSON.stringify(cycle, (key, value) => {
    if (/secret|private|token|passphrase|apiKey/i.test(key)) return undefined;
    return typeof value === 'bigint' ? value.toString() : value;
  }));
}

export class HedgeCycleManager extends EventEmitter {
  constructor({ exchanges, definitions, configs = {}, onChange = () => {}, pollMs = 1000, wait = sleep, now = () => Date.now() }) {
    super();
    this.exchanges = exchanges;
    this.definitions = Object.fromEntries(definitions.map((item) => [item.key, item]));
    this.configs = configs;
    this.onChange = onChange;
    this.pollMs = pollMs;
    this.wait = wait;
    this.now = now;
    this.cycle = null;
    this.history = [];
    this.queue = Promise.resolve();
    this.monitor = null;
    this.monitorErrors = 0;
    this.seenEvents = new Set();
  }

  async options() {
    return Promise.all(Object.keys(this.exchanges).map(async (key) => {
      const definition = this.definitions[key] || { key, name: key };
      const validation = validateHedgeAdapter(this.exchanges[key], definition);
      return {
        key, baseKey: definition.baseKey || key, name: definition.name,
        mode: this.configs[key]?.mode || 'paper', network: this.configs[key]?.network || 'mainnet',
        hedgeReady: validation.ok, missing: validation.missing,
        account: accountView(this.exchanges[key]),
        markets: (await this.exchanges[key].getMarkets?.() || []).map((market) => ({
          marketId: market.marketId, displayName: marketLabel(market), stepSize: number(market.stepSize),
          minOrderSize: number(market.minOrderSize), maxLeverage: number(market.maxLeverage, 100),
        })),
      };
    }));
  }

  status() {
    return {
      cycle: sanitizeCycle(this.cycle),
      history: sanitizeCycle(this.history),
      active: !!this.cycle && ACTIVE.has(this.cycle.state),
      serverTime: this.now(),
    };
  }

  async dashboard() {
    const snapshot = this.status();
    if (!this.cycle?.legs?.A?.marketId || !this.cycle?.legs?.B?.marketId) return snapshot;
    try {
      const legs = {};
      await Promise.all(['A', 'B'].map(async (label) => {
        const leg = this.cycle.legs[label];
        const exchange = this.exchanges[leg.accountKey];
        const [position, orders] = await Promise.all([
          exchange.getPosition(leg.marketId),
          exchange.fetchOpenOrders(leg.marketId),
        ]);
        legs[label] = {
          accountKey: leg.accountKey,
          exchangeName: leg.exchangeName,
          market: leg.market,
          side: leg.side,
          account: accountView(exchange),
          position: positionView(position),
          openOrderCount: Array.isArray(orders) ? orders.length : 0,
          openOrders: (Array.isArray(orders) ? orders : []).slice(0, 100).map((order) => ({
            orderId: order?.orderId ?? order?.id ?? null,
            side: order?.side ?? null,
            price: nullableNumber(order?.price),
            sizeBase: nullableNumber(order?.sizeBase ?? order?.size ?? order?.quantity),
            reduceOnly: !!order?.reduceOnly,
            status: order?.status ?? null,
          })),
        };
      }));
      return { ...snapshot, legs };
    } catch (error) {
      return { ...snapshot, readError: publicError(error) };
    }
  }

  restore(snapshot) {
    const restored = snapshot?.cycle;
    if (!restored?.id || !restored?.state) return false;
    this.cycle = restored;
    this.history = Array.isArray(snapshot?.history)
      ? snapshot.history.filter((item) => item?.id && item?.state).slice(-HISTORY_LIMIT)
      : [];
    this._audit('RESTORED', '本地引擎已恢复对冲轮次，等待交易所对账。');
    return true;
  }

  async resume() {
    if (!this.cycle || !ACTIVE.has(this.cycle.state)) return this.status();
    if (this.cycle.state === 'OPEN') {
      const positions = await this._positions();
      if (this._matched(positions)) this._startMonitor();
      else await this._reconcileInternal('重启后检测到双边仓位不一致');
    } else {
      await this._reconcileInternal(`重启恢复状态 ${this.cycle.state}`);
    }
    return this.status();
  }

  start(input) { return this._serial(() => this._start(input)); }
  stop(reason = '用户停止') { return this._serial(() => this._exit(reason, false)); }
  emergency(reason = '一键紧急停撤平') { return this._serial(() => this._exit(reason, true)); }
  reconcile(reason = '用户主动对账') { return this._serial(() => this._reconcileInternal(reason)); }

  ingestEvent(event) {
    if (!this.cycle || !ACTIVE.has(this.cycle.state)) return false;
    const cycleAccounts = new Set(Object.values(this.cycle.legs || {}).map((leg) => leg.accountKey));
    if (event?.accountKey && !cycleAccounts.has(event.accountKey)) return false;
    const id = String(event?.eventId || event?.id || event?.orderId || '');
    if (id && this.seenEvents.has(id)) return false;
    if (id) {
      this.seenEvents.add(id);
      if (this.seenEvents.size > 500) this.seenEvents.delete(this.seenEvents.values().next().value);
    }
    this._audit('EXCHANGE_EVENT', event?.type || '交易所事件', { eventId: id || undefined });
    if (['position_closed', 'tp_filled', 'sl_filled', 'liquidated', 'abnormal_exit'].includes(event?.type)) {
      this._serial(() => this._exit(`交易所事件触发退出：${event.type}`, event.type === 'liquidated'));
    } else if (['fill', 'partial_fill', 'order_update'].includes(event?.type)) {
      this._serial(() => this._reconcileInternal(`交易所事件对账：${event.type}`));
    }
    return true;
  }

  // Stop the in-process monitor without changing exchange positions. Hosted
  // sessions persist the cycle and resume/reconcile it in the next invocation.
  dispose() {
    clearInterval(this.monitor);
    this.monitor = null;
    this.removeAllListeners();
  }

  async _start(input = {}) {
    if (this.cycle && ACTIVE.has(this.cycle.state)) throw new Error('已有对冲轮次正在运行，请先停止并确认双边归零。');
    const accountA = String(input.accountA || '');
    const accountB = String(input.accountB || '');
    if (!accountA || !accountB || accountA === accountB) throw new Error('账号 A 与账号 B 必须是两个不同的已配置账户。');
    const modeA = this.configs[accountA]?.mode || 'paper';
    const modeB = this.configs[accountB]?.mode || 'paper';
    if (modeA !== modeB) throw new Error('首版对冲要求两个账户使用相同模式，不能混用 paper 与 live。');
    if (input.riskAccepted !== true) throw new Error('请先阅读并勾选双边对冲实盘风险确认。');

    const leverage = Math.max(1, Math.floor(number(input.leverage, 1)));
    const sizePercent = number(input.sizePercent);
    const takeProfitPct = Math.max(0, number(input.takeProfitPct));
    const stopLossPct = Math.max(0, number(input.stopLossPct));
    const maxEntryDeviationPct = Math.min(20, Math.max(0.01, number(input.maxEntryDeviationPct, 1)));
    const maxUnhedgedMs = Math.min(120000, Math.max(3000, number(input.maxUnhedgedMs, 30000)));
    if (!ALLOWED_LEVERAGES.has(leverage)) throw new Error('统一杠杆只支持 1x、2x、5x、10x。');
    if (!ALLOWED_SIZE_PERCENTS.has(sizePercent)) throw new Error('合约数量只支持可用权益的 5%、10%、20%、30%、40%。');
    if (!(takeProfitPct > 0) || !(stopLossPct > 0)) throw new Error('止盈与止损百分比必须大于 0。');

    this.cycle = {
      id: `hc-${this.now()}-${Math.random().toString(36).slice(2, 8)}`, version: 2, state: 'DRAFT', mode: modeA,
      market: String(input.market || '').toUpperCase().replace(/[-_]/g, '/'), quantity: null, sizePercent, leverage,
      takeProfitPct, stopLossPct, maxEntryDeviationPct, maxUnhedgedMs, autoRepeat: !!input.autoRepeat,
      cooldownMs: Math.max(0, number(input.cooldownMs, 30000)),
      maxCycles: Math.min(1000, Math.max(1, Math.floor(number(input.maxCycles, 1)))), cycleNumber: 1,
      createdAt: this.now(), updatedAt: this.now(),
      legs: { A: { accountKey: accountA, side: 'buy' }, B: { accountKey: accountB, side: 'sell' } },
      entry: null, exit: null, error: null, audit: [], orders: [],
    };
    this._transition('VALIDATING', '校验账户、市场、仓位和适配器能力');
    try {
      await this._resolveLeg('A');
      await this._resolveLeg('B');
      const positions = await this._positions();
      if (Math.abs(positions.A) > this._tolerance('A') || Math.abs(positions.B) > this._tolerance('B')) {
        throw new Error('所选账户/市场已有持仓。为防止误平仓，请先处理现有仓位。');
      }
      const openOrders = await Promise.all(['A', 'B'].map((label) => {
        const leg = this.cycle.legs[label];
        return this.exchanges[leg.accountKey].fetchOpenOrders(leg.marketId);
      }));
      if (openOrders.some((orders) => Array.isArray(orders) && orders.length > 0)) {
        throw new Error('所选账户/市场已有挂单。为避免接管非本策略订单，请先撤销现有挂单。');
      }
      this._transition('READY', '双账户验证通过');
      await this._open();
      return this.status();
    } catch (error) {
      this.cycle.error = publicError(error);
      if (['OPENING', 'OPEN'].includes(this.cycle.state)) await this._compensate(`开仓失败：${error.message}`);
      else this._transition('FAILED', `启动失败：${error.message}`);
      throw error;
    }
  }

  async _resolveLeg(label) {
    const leg = this.cycle.legs[label];
    const exchange = this.exchanges[leg.accountKey];
    const definition = this.definitions[leg.accountKey] || { key: leg.accountKey, name: leg.accountKey };
    if (!exchange) throw new Error(`账户 ${leg.accountKey} 不存在。`);
    const validation = validateHedgeAdapter(exchange, definition);
    if (!validation.ok) throw new Error(`${definition.name} 缺少对冲能力：${validation.missing.join('、')}`);
    const market = (await exchange.getMarkets() || []).find((item) => marketLabel(item) === this.cycle.market);
    if (!market) throw new Error(`${definition.name} 不支持交易对 ${this.cycle.market}。`);
    if (this.cycle.leverage > number(market.maxLeverage, 100)) throw new Error(`${definition.name} 杠杆超过市场上限 ${market.maxLeverage}x。`);
    Object.assign(leg, {
      exchangeName: definition.name,
      marketId: market.marketId,
      market: marketLabel(market),
      stepSize: number(market.stepSize),
      minOrderSize: number(market.minOrderSize),
      maxLeverage: number(market.maxLeverage, 100),
    });
  }

  _calculateSizing(prices) {
    const accounts = {};
    for (const label of ['A', 'B']) {
      const leg = this.cycle.legs[label];
      accounts[label] = accountView(this.exchanges[leg.accountKey]);
      if (!(accounts[label].available > 0)) {
        throw new Error(`${leg.exchangeName} 未返回可用余额/权益，无法按比例安全计算对冲数量。请先刷新账户或检查 API 权限。`);
      }
    }
    const baseCapital = Math.min(accounts.A.available, accounts.B.available);
    const marginBudget = baseCapital * this.cycle.sizePercent / 100;
    const notional = marginBudget * this.cycle.leverage;
    const referencePrice = Math.max(...prices.map((value) => number(value)));
    if (!(referencePrice > 0)) throw new Error('交易所未返回有效价格，无法计算对冲数量。');
    const stepSize = commonStep(['A', 'B'].map((label) => this.cycle.legs[label].stepSize));
    const rawQuantity = notional / referencePrice;
    const quantity = round(Math.floor((rawQuantity + 1e-12) / stepSize) * stepSize);
    for (const label of ['A', 'B']) {
      const leg = this.cycle.legs[label];
      if (!(quantity > 0) || quantity < leg.minOrderSize) {
        throw new Error(`${leg.exchangeName} 按 ${this.cycle.sizePercent}% 权益计算的数量 ${quantity || 0} 低于最小下单量 ${leg.minOrderSize}。`);
      }
    }
    return {
      accounts,
      baseCapital: round(baseCapital),
      sizePercent: this.cycle.sizePercent,
      marginBudget: round(marginBudget),
      leverage: this.cycle.leverage,
      notional: round(notional),
      referencePrice: round(referencePrice),
      rawQuantity: round(rawQuantity),
      stepSize,
      quantity,
      calculatedAt: this.now(),
    };
  }

  async _open() {
    this._transition('OPENING', '并发提交双边开仓并等待真实仓位确认');
    const submittedAt = this.now();
    const prices = await Promise.all(['A', 'B'].map((label) => this.exchanges[this.cycle.legs[label].accountKey].getPrice(this.cycle.legs[label].marketId)));
    const priceMid = (number(prices[0]) + number(prices[1])) / 2;
    const priceDeviationPct = priceMid > 0 ? Math.abs(number(prices[0]) - number(prices[1])) / priceMid * 100 : Infinity;
    if (!Number.isFinite(priceDeviationPct) || priceDeviationPct > this.cycle.maxEntryDeviationPct) {
      const error = new Error(`双边参考价偏差 ${priceDeviationPct.toFixed(3)}% 超过上限 ${this.cycle.maxEntryDeviationPct}% ，未发送开仓订单。`);
      error.code = 'HEDGE_ENTRY_PRICE_DEVIATION';
      throw error;
    }
    if (this.cycle.sizePercent) {
      this.cycle.sizing = this._calculateSizing(prices);
      this.cycle.quantity = this.cycle.sizing.quantity;
      this._audit('SIZING', `按较低可用权益的 ${this.cycle.sizePercent}% 计算双边数量 ${this.cycle.quantity}`, this.cycle.sizing);
    }
    if (!(number(this.cycle.quantity) > 0)) throw new Error('未能计算出有效的双边合约数量。');
    await Promise.all(['A', 'B'].map((label) => {
      const leg = this.cycle.legs[label];
      return this.exchanges[leg.accountKey].setLeverage(leg.marketId, this.cycle.leverage);
    }));
    const orders = ['A', 'B'].map((label, index) => {
      const leg = this.cycle.legs[label];
      const slippage = label === 'A' ? 1.003 : 0.997;
      return {
        marketId: leg.marketId, levelIndex: label === 'A' ? 1 : -1, side: leg.side,
        price: round(number(prices[index]) * slippage), sizeBase: this.cycle.quantity,
        postOnly: false, reduceOnly: false, clientOrderId: `${this.cycle.id}-${label}-open`,
      };
    });
    const orderHistory = orders.map((order, index) => this._recordOrder({
      leg: index === 0 ? 'A' : 'B',
      stage: 'ENTRY',
      action: 'OPEN_POSITION',
      side: order.side,
      orderType: 'LIMIT',
      reduceOnly: false,
      requestedPrice: order.price,
      requestedQuantity: order.sizeBase,
      clientOrderId: order.clientOrderId,
      status: 'SUBMITTING',
    }));
    const results = await Promise.allSettled(['A', 'B'].map((label, index) => this.exchanges[this.cycle.legs[label].accountKey].placeLimitOrder(orders[index])));
    for (let index = 0; index < results.length; index++) {
      const label = index === 0 ? 'A' : 'B';
      const result = results[index];
      if (result.status === 'fulfilled') {
        this.cycle.legs[label].openOrderId = result.value?.orderId || result.value?.id || null;
        Object.assign(orderHistory[index], {
          orderId: this.cycle.legs[label].openOrderId,
          status: 'SUBMITTED',
          updatedAt: this.now(),
        });
      } else {
        this.cycle.legs[label].submitError = publicError(result.reason);
        Object.assign(orderHistory[index], {
          status: 'SUBMIT_FAILED',
          error: publicError(result.reason),
          updatedAt: this.now(),
        });
      }
    }
    this.cycle.entry = { submittedAt, referencePrices: { A: prices[0], B: prices[1] }, priceDeviationPct: round(priceDeviationPct, 6) };
    this._persist();
    if (results.some((item) => item.status === 'rejected')) return this._compensate('任一侧提交失败，立即撤单并清理可能成交的仓位');
    const positions = await this._waitFor((value) => this._matched(value), this.cycle.maxUnhedgedMs);
    if (!positions) return this._compensate('超过最大单边暴露时间，未确认双边等量成交');
    this.cycle.entry.confirmedAt = this.now();
    this.cycle.entry.positions = positions;
    for (const record of orderHistory) {
      if (record.status === 'SUBMITTED') Object.assign(record, {
        status: 'POSITION_CONFIRMED',
        filledQuantity: this.cycle.quantity,
        confirmedAt: this.now(),
        updatedAt: this.now(),
      });
    }
    this._transition('OPEN', '双边真实仓位已确认等量，进入持仓监控');
    this._startMonitor();
  }

  async _exit(reason, emergency) {
    if (!this.cycle || !ACTIVE.has(this.cycle.state)) return this.status();
    clearInterval(this.monitor); this.monitor = null;
    if (emergency && TRANSITIONS[this.cycle.state]?.includes('EMERGENCY')) this._transition('EMERGENCY', reason);
    if (this.cycle.state !== 'EXIT_TRIGGERED' && TRANSITIONS[this.cycle.state]?.includes('EXIT_TRIGGERED')) this._transition('EXIT_TRIGGERED', reason);
    if (this.cycle.state === 'EMERGENCY') this._transition('CLOSING', '紧急撤销双方挂单并 reduceOnly 平仓');
    else if (this.cycle.state === 'EXIT_TRIGGERED') this._transition('CLOSING', '撤销双方挂单并 reduceOnly 平仓');
    else if (!['CLOSING', 'COMPENSATING', 'RECONCILING'].includes(this.cycle.state)) return this._reconcileInternal(reason);
    return this._flatten(reason);
  }

  async _compensate(reason) {
    if (this.cycle.state !== 'COMPENSATING') this._transition('COMPENSATING', reason);
    return this._flatten(reason);
  }

  async _flatten(reason) {
    const attempts = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const positionsBefore = await this._positions().catch(() => ({ A: null, B: null }));
      const closeHistory = {};
      const operations = ['A', 'B'].flatMap((label) => {
        const leg = this.cycle.legs[label];
        const exchange = this.exchanges[leg.accountKey];
        closeHistory[label] = this._recordOrder({
          leg,
          legLabel: label,
          stage: 'EXIT',
          action: 'CLOSE_POSITION',
          side: label === 'A' ? 'sell' : 'buy',
          orderType: 'MARKET',
          reduceOnly: true,
          requestedPrice: null,
          requestedQuantity: Math.abs(number(positionsBefore[label], 0)),
          attempt,
          status: 'SUBMITTING',
        });
        return [
          { label, action: 'CANCEL_ALL', run: () => exchange.cancelAll(leg.marketId) },
          { label, action: 'CLOSE_POSITION', run: () => exchange.closePosition(leg.marketId) },
        ];
      });
      const settled = await Promise.allSettled(operations.map((operation) => operation.run()));
      settled.forEach((result, index) => {
        const operation = operations[index];
        if (operation.action !== 'CLOSE_POSITION') return;
        const record = closeHistory[operation.label];
        if (result.status === 'fulfilled') Object.assign(record, {
          orderId: result.value?.orderId || result.value?.id || null,
          status: 'SUBMITTED',
          updatedAt: this.now(),
        });
        else Object.assign(record, { status: 'SUBMIT_FAILED', error: publicError(result.reason), updatedAt: this.now() });
      });
      attempts.push({
        attempt,
        results: settled.map((item, index) => ({
          leg: operations[index].label,
          action: operations[index].action,
          result: item.status === 'fulfilled' ? 'ok' : publicError(item.reason),
        })),
      });
      const positions = await this._waitFor((value) => this._flat(value), Math.max(3000, this.pollMs * 3));
      if (positions) {
        for (const record of Object.values(closeHistory)) {
          if (record.status === 'SUBMITTED') Object.assign(record, {
            status: 'POSITION_CLOSED_CONFIRMED',
            filledQuantity: record.requestedQuantity,
            confirmedAt: this.now(),
            updatedAt: this.now(),
          });
        }
        this.cycle.exit = { reason, confirmedAt: this.now(), positions, attempts };
        this._transition('CLOSED', '已确认双边仓位归零');
        if (this.cycle.autoRepeat) {
          this._transition('COOLDOWN', `冷却 ${this.cycle.cooldownMs}ms 后进入下一轮`);
          await this.wait(this.cycle.cooldownMs);
          if (this.cycle.cycleNumber >= this.cycle.maxCycles) {
            this._transition('COMPLETED', `已完成设定的 ${this.cycle.maxCycles} 轮`);
          } else {
            this.cycle.cycleNumber += 1;
            this.cycle.entry = null; this.cycle.exit = null; this.cycle.error = null;
            for (const leg of Object.values(this.cycle.legs)) {
              delete leg.openOrderId; delete leg.submitError;
            }
            this._transition('READY', `冷却完成，开始第 ${this.cycle.cycleNumber} 轮`);
            await this._open();
          }
        } else this._transition('COMPLETED', '本轮对冲已安全结束');
        return this.status();
      }
    }
    this.cycle.exit = { reason, attempts, residual: await this._positions() };
    if (this.cycle.state !== 'RECONCILING') this._transition('RECONCILING', '仍有残余仓位，禁止开始下一轮并等待人工对账');
    return this.status();
  }

  async _reconcileInternal(reason) {
    if (!this.cycle) return this.status();
    clearInterval(this.monitor); this.monitor = null;
    if (this.cycle.state !== 'RECONCILING') {
      if (!TRANSITIONS[this.cycle.state]?.includes('RECONCILING')) throw new Error(`状态 ${this.cycle.state} 不能进入对账。`);
      this._transition('RECONCILING', reason);
    }
    const positions = await this._positions();
    if (this._flat(positions)) {
      this.cycle.exit = { ...(this.cycle.exit || {}), reason, confirmedAt: this.now(), positions };
      this._transition('CLOSED', '交易所对账确认双边归零');
      this._transition('COMPLETED', '本轮对冲已安全结束');
    } else if (this._matched(positions)) {
      this._transition('OPEN', '交易所对账确认双边仓位等量');
      this._startMonitor();
    } else await this._flatten(`对账检测到单边或不等量仓位：${reason}`);
    return this.status();
  }

  _startMonitor() {
    clearInterval(this.monitor);
    this.monitorErrors = 0;
    this.monitor = setInterval(() => this._serial(async () => {
      if (this.cycle?.state !== 'OPEN') return;
      const positions = await this._positions();
      if (!this._matched(positions)) return this._exit('检测到单边退出或仓位不等量', false);
      const prices = await Promise.all(['A', 'B'].map((label) => {
        const leg = this.cycle.legs[label];
        return this.exchanges[leg.accountKey].getPrice(leg.marketId);
      }));
      const reference = this.cycle.entry?.referencePrices || {};
      const pnlPctA = (number(prices[0]) - number(reference.A)) / number(reference.A, 1) * 100;
      const pnlPctB = (number(reference.B) - number(prices[1])) / number(reference.B, 1) * 100;
      if (pnlPctA >= this.cycle.takeProfitPct || pnlPctB >= this.cycle.takeProfitPct) return this._exit('任一侧触发止盈', false);
      if (pnlPctA <= -this.cycle.stopLossPct || pnlPctB <= -this.cycle.stopLossPct) return this._exit('任一侧触发止损', false);
      this.monitorErrors = 0;
      this.cycle.lastMonitorAt = this.now(); this.cycle.lastPositions = positions; this._persist();
    }).catch((error) => {
      this.monitorErrors += 1;
      this._audit('MONITOR_ERROR', `连续 ${this.monitorErrors} 次监控失败：${error.message}`);
      if (this.monitorErrors >= 3 && this.cycle?.state === 'OPEN') {
        this._serial(() => this._reconcileInternal('连续网络或交易所回读失败，暂停策略并强制对账'))
          .catch((reconcileError) => this._audit('RECONCILE_ERROR', reconcileError.message));
      }
    }), Math.max(500, this.pollMs));
    this.monitor.unref?.();
  }

  async _positions() {
    const values = await Promise.all(['A', 'B'].map(async (label) => {
      const leg = this.cycle.legs[label];
      return positionSize(await this.exchanges[leg.accountKey].getPosition(leg.marketId));
    }));
    return { A: round(values[0]), B: round(values[1]) };
  }

  async _waitFor(predicate, timeoutMs) {
    const deadline = this.now() + timeoutMs;
    do {
      const positions = await this._positions();
      if (predicate(positions)) return positions;
      await this.wait(Math.min(this.pollMs, Math.max(0, deadline - this.now())));
    } while (this.now() < deadline);
    return null;
  }

  _matched(positions) {
    const target = number(this.cycle?.quantity);
    return target > 0
      && Math.abs(positions.A - target) <= this._tolerance('A')
      && Math.abs(positions.B + target) <= this._tolerance('B');
  }

  _flat(positions) { return Math.abs(positions.A) <= this._tolerance('A') && Math.abs(positions.B) <= this._tolerance('B'); }
  _tolerance(label) { return Math.max(1e-9, number(this.cycle?.legs?.[label]?.stepSize) / 2); }

  _transition(next, message) {
    const current = this.cycle.state;
    if (!TRANSITIONS[current]?.includes(next)) throw new Error(`非法对冲状态转换：${current} -> ${next}`);
    this.cycle.state = next; this.cycle.version += 1; this.cycle.updatedAt = this.now();
    this._audit('STATE', `${current} -> ${next} · ${message}`);
  }

  _audit(type, message, meta = undefined) {
    if (!this.cycle) return;
    this.cycle.audit ||= [];
    this.cycle.audit.push({ at: this.now(), type, message, ...(meta ? { meta } : {}) });
    if (this.cycle.audit.length > 200) this.cycle.audit.splice(0, this.cycle.audit.length - 200);
    this._persist();
  }

  _recordOrder(input = {}) {
    if (!this.cycle) return null;
    const label = input.legLabel || (typeof input.leg === 'string' ? input.leg : null);
    const leg = typeof input.leg === 'object' ? input.leg : this.cycle.legs?.[label] || {};
    const record = {
      id: `ho-${this.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cycleId: this.cycle.id,
      cycleRound: this.cycle.cycleNumber || 1,
      leg: label,
      accountKey: leg.accountKey || null,
      exchangeName: leg.exchangeName || this.definitions[leg.accountKey]?.name || leg.accountKey || null,
      market: leg.market || this.cycle.market || null,
      createdAt: this.now(),
      updatedAt: this.now(),
      ...input,
    };
    delete record.legLabel;
    if (typeof record.leg === 'object') record.leg = label;
    this.cycle.orders ||= [];
    this.cycle.orders.push(record);
    if (this.cycle.orders.length > ORDER_HISTORY_LIMIT) {
      this.cycle.orders.splice(0, this.cycle.orders.length - ORDER_HISTORY_LIMIT);
    }
    return record;
  }

  _archiveCurrentCycle() {
    if (!this.cycle?.id || !TERMINAL_STATES.has(this.cycle.state)) return;
    const archived = sanitizeCycle(this.cycle);
    const index = this.history.findIndex((item) => item.id === archived.id);
    if (index >= 0) this.history[index] = archived;
    else this.history.push(archived);
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
  }

  _persist() {
    this._archiveCurrentCycle();
    const snapshot = { cycle: sanitizeCycle(this.cycle), history: sanitizeCycle(this.history) };
    this.onChange(snapshot);
    this.emit('change', this.status());
  }

  _serial(task) {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }
}
