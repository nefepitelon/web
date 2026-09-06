import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { GridBot } from '../src/bot.js';

class StartExchange extends EventEmitter {
  constructor({ preflightError = null, failAt = null } = {}) {
    super();
    this.balance = 10000;
    this.equity = 10000;
    this.preflightError = preflightError;
    this.failAt = failAt;
    this.placeCalls = 0;
    this.cancelCalls = 0;
    this.leverageCalls = 0;
  }

  async getMarkets() {
    return [{
      marketId: 1, displayName: 'HYPE/USD', maxLeverage: 20,
      minOrderSize: 0.01, stepSize: 0.01, stepPrice: 0.01,
    }];
  }

  async preflightTrading() {
    if (this.preflightError) throw this.preflightError;
    return { sufficient: true };
  }

  async setLeverage() { this.leverageCalls++; return true; }
  async cancelAll() { this.cancelCalls++; return true; }
  async closePosition() { this.closeCalls = (this.closeCalls || 0) + 1; return true; }
  getPosition() { return null; }
  async getPrice() { return 100; }
  start() {}

  async placeLimitOrder() {
    this.placeCalls++;
    if (this.placeCalls === this.failAt) throw new Error('simulated order rejection');
    return { orderId: String(this.placeCalls) };
  }
}

const config = {
  marketId: 1, mode: 'neutral', lower: 90, upper: 110,
  gridCount: 4, sizeBase: 0.1, leverage: 2,
};

test('gas preflight failure stops before any live write', async () => {
  const ex = new StartExchange({ preflightError: new Error('APT gas insufficient') });
  const bot = new GridBot(ex);
  await assert.rejects(() => bot.start(config), /APT gas insufficient/);
  assert.equal(ex.leverageCalls, 0);
  assert.equal(ex.placeCalls, 0);
  assert.equal(bot.running, false);
  assert.equal(bot.alerts.some((item) => item.message.includes('已启动')), false);
});

test('initial order rejection fails fast and never reports a zero-order start', async () => {
  const ex = new StartExchange({ failAt: 1 });
  const bot = new GridBot(ex);
  await assert.rejects(() => bot.start(config), /网格启动失败/);
  assert.equal(ex.placeCalls, 1);
  assert.equal(bot.running, false);
  assert.equal(bot.active.size, 0);
  assert.equal(bot.alerts.some((item) => item.message.includes('已启动')), false);
});

test('partial initial ladder is cancelled when a later seed order fails', async () => {
  const ex = new StartExchange({ failAt: 2 });
  const bot = new GridBot(ex);
  await assert.rejects(() => bot.start(config), /本次已挂出的订单已尝试撤销/);
  assert.equal(ex.placeCalls, 2);
  assert.equal(ex.cancelCalls, 2); // stale-order cleanup + partial-start cleanup
  assert.equal(bot.running, false);
  assert.equal(bot.active.size, 0);
});

test('large-grid capable adapters use one batch startup call and record every order', async () => {
  const ex = new StartExchange();
  ex.placeLimitOrders = async (orders) => ({
    placed: orders.map((order, index) => ({ orderId: `batch-${index}`, clientOrderId: String(order.clientOrderId) })),
    failed: [],
  });
  const bot = new GridBot(ex, { exchangeName: 'Ondo Perps' });
  const state = await bot.start({ ...config, gridCount: 40 });
  assert.equal(ex.placeCalls, 0);
  assert.ok(state.running);
  assert.equal(bot.active.size, 40);
  assert.match(bot.alerts.find((item) => /批量接口分批挂出/.test(item.message))?.message || '', /40/);
});

test('batch startup correlates original client ids even when an exchange uses namespaced wire ids', async () => {
  const ex = new StartExchange();
  let writes = 0;
  ex.placeLimitOrders = async (orders) => {
    writes++;
    return {
      placed: orders.map((order, index) => ({
        orderId: `ondo-live-${index}`,
        clientOrderId: String(order.clientOrderId),
        exchangeClientOrderId: `wl_${order.clientOrderId}`,
      })),
      failed: [],
    };
  };
  const bot = new GridBot(ex, { exchangeName: 'Ondo Perps 2' });

  const state = await bot.start({ ...config, gridCount: 40 });

  assert.equal(writes, 1, 'the startup batch must never be replayed during correlation');
  assert.equal(state.running, true);
  assert.equal(bot.active.size, 40);
  assert.equal(ex.cancelCalls, 1, 'only the normal stale-order cleanup should run');
  assert.equal(bot.alerts.some((item) => /成功 0\/40|返回订单数不完整/.test(item.message)), false);
});

test('partial-start cleanup warning names the actual exchange instead of Decibel', async () => {
  const ex = new StartExchange({ failAt: 2 });
  ex.cancelAll = async () => {
    ex.cancelCalls++;
    if (ex.cancelCalls > 1) throw new Error('cleanup unavailable');
    return true;
  };
  const bot = new GridBot(ex, { exchangeName: 'Phoenix' });

  await assert.rejects(
    () => bot.start(config),
    (error) => /Phoenix 交易页检查挂单/.test(error.message) && !/Decibel/.test(error.message),
  );
  assert.equal(bot.running, false);
  assert.equal(bot.active.size, 0);
});

test('a fresh grid start clears stopped-session statistics and ignores resting-order margin reservations', async () => {
  const ex = new StartExchange();
  ex.realizedPnl = null;
  const bot = new GridBot(ex, { exchangeName: 'Phoenix' });
  bot.stats = { buys: 9, sells: 8, completedRungs: 7, gridProfit: -193.77, volume: 999 };
  bot.completedByLevel = { 1: 7 };
  bot.startBalance = 224.6;

  const started = await bot.start(config);
  assert.equal(started.realizedPnl, 0);
  assert.equal(started.stats.completedRungs, 0);
  assert.equal(started.volume, 0);
  assert.deepEqual(started.completedByLevel, {});

  ex.balance = 27.34;
  ex.equity = 27.34;
  const reserved = bot.getState();
  assert.equal(reserved.realizedPnl, 0, 'a collateral reservation is not a realized loss');
});

test('crash recovery refuses a stale running snapshot with zero orders', async () => {
  const ex = new StartExchange();
  const bot = new GridBot(ex);
  await assert.rejects(() => bot.resume({ running: true, config, active: [] }), /没有任何可接管的挂单/);
  assert.equal(bot.running, false);
  assert.equal(bot.config.marketId, 1); // original configuration remains available for display/recovery checks
});

test('LIVE summary order refresh is read-only and records the real exchange count', async () => {
  const ex = new StartExchange();
  ex.mode = 'live';
  ex.getPosition = () => null;
  ex.fetchOpenOrders = async () => [
    { orderId: 'live-1', price: 99, side: 'buy' },
    { orderId: 'live-2', price: 101, side: 'sell' },
  ];
  const bot = new GridBot(ex);
  bot.config = { ...config, displayName: 'HYPE/USD' };

  const result = await bot.refreshExchangeOpenOrders();
  const state = bot.getState();

  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(state.exchangeOpenOrders, 2);
  assert.ok(state.ordersSyncedAt > 0);
  assert.equal(state.ordersSyncError, null);
  assert.equal(ex.placeCalls, 0);
  assert.equal(ex.cancelCalls, 0);
});

test('strict emergency stop confirms cancel and close before reporting success', async () => {
  const ex = new StartExchange();
  const bot = new GridBot(ex);
  bot.config = { ...config, displayName: 'HYPE/USD' };
  bot.running = true;

  const state = await bot.stop({ closePosition: true, requireConfirmedClose: true });

  assert.equal(state.running, false);
  assert.equal(ex.cancelCalls, 1);
  assert.equal(ex.closeCalls, 1);
  assert.match(bot.alerts.at(-1).message, /已确认仓位已平/);
});

test('strict emergency stop reports an unconfirmed close and still stops automation', async () => {
  const ex = new StartExchange();
  ex.closePosition = async () => { throw new Error('close rejected'); };
  const bot = new GridBot(ex);
  bot.config = { ...config, displayName: 'HYPE/USD' };
  bot.running = true;

  await assert.rejects(
    () => bot.stop({ closePosition: true, requireConfirmedClose: true }),
    (error) => error.code === 'EMERGENCY_ACTION_INCOMPLETE' && /平仓未确认/.test(error.message),
  );
  assert.equal(bot.running, false);
  assert.equal(ex.cancelCalls, 1);
});

test('closing fills mark the exact completed grid cell for the overview ladder', () => {
  const ex = new StartExchange();
  const bot = new GridBot(ex);
  bot.running = true;
  bot.config = { ...config, mode: 'long' };
  bot.grid = { levels: [90, 95, 100, 105, 110], spacing: 5, count: 4 };
  bot.outOfRange = true; // prevent replacement writes; this is a pure state test
  bot.active.set('closing-1', { levelIndex: 3, side: 'sell', price: 105, opening: false });

  bot._handleFill({ orderId: 'closing-1', marketId: 1, side: 'sell', price: 105, sizeBase: 0.1 });

  const state = bot.getState();
  assert.equal(state.completedByLevel[2], 1);
  assert.equal(state.stats.completedRungs, 1);
  assert.equal(state.fills[0].completedCell, 2);
  assert.equal(state.fills[0].closing, true);
  assert.equal(ex.placeCalls, 0);
});

test('completed grid-cell history survives a snapshot restore', () => {
  const first = new GridBot(new StartExchange());
  first.config = { ...config };
  first.grid = { levels: [90, 95, 100, 105, 110], spacing: 5, count: 4 };
  first.completedByLevel = { 0: 2, 2: 3 };

  const restored = new GridBot(new StartExchange());
  restored.restore({ ...first.snapshot(), running: false });

  assert.deepEqual(restored.getState().completedByLevel, { 0: 2, 2: 3 });
});
