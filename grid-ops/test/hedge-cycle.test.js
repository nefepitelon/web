import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { HedgeCycleManager } from '../src/hedge/cycle.js';

class FakeExchange extends EventEmitter {
  constructor({ rejectOpen = false, rejectAfterFill = false, fillRatio = 1, initialSize = 0, initialOrders = [], price = 100, balance = 5, equity = balance } = {}) {
    super();
    this.position = initialSize;
    this.rejectOpen = rejectOpen;
    this.rejectAfterFill = rejectAfterFill;
    this.fillRatio = fillRatio;
    this.price = price;
    this.balance = balance;
    this.equity = equity;
    this.cancelCount = 0;
    this.closeCount = 0;
    this.orders = [...initialOrders];
  }

  async init() {}
  getMarkets() { return [{ marketId: 'BTC-USDT', displayName: 'BTC/USDT', stepSize: 0.001, minOrderSize: 0.001, maxLeverage: 20 }]; }
  async getCandles() { return []; }
  async getPrice() { return this.price; }
  async setLeverage() {}
  async placeLimitOrder(order) {
    if (this.rejectOpen) throw new Error('simulated rejection');
    this.orders.push(order);
    this.position += (order.side === 'buy' ? 1 : -1) * order.sizeBase * this.fillRatio;
    if (this.rejectAfterFill) throw new Error('network timeout after exchange accepted order');
    return { orderId: order.clientOrderId };
  }
  async cancelOrder() {}
  async cancelAll() { this.cancelCount += 1; }
  async fetchOpenOrders() { return this.orders; }
  async getPosition() { return { sizeBase: this.position, entryPrice: 100 }; }
  async closePosition() { this.closeCount += 1; this.position = 0; }
}

const definitions = [
  { key: 'a', baseKey: 'bn', name: 'Account A' },
  { key: 'b', baseKey: 'bn', name: 'Account B' },
];

function createManager(a = new FakeExchange(), b = new FakeExchange(), saved = []) {
  return new HedgeCycleManager({
    exchanges: { a, b }, definitions,
    configs: { a: { mode: 'paper' }, b: { mode: 'paper' } },
    pollMs: 1, onChange: (snapshot) => saved.push(structuredClone(snapshot)),
  });
}

const validInput = {
  accountA: 'a', accountB: 'b', market: 'BTC/USDT', sizePercent: 10,
  leverage: 2, takeProfitPct: 2, stopLossPct: 1, maxEntryDeviationPct: 1, maxUnhedgedMs: 25,
  riskAccepted: true,
};

test('opens two equal opposite legs and stops only after both are flat', async () => {
  const a = new FakeExchange();
  const b = new FakeExchange();
  const manager = createManager(a, b);
  const opened = await manager.start(validInput);
  assert.equal(opened.cycle.state, 'OPEN');
  assert.equal(a.position, 0.01);
  assert.equal(b.position, -0.01);
  const stopped = await manager.stop('test stop');
  assert.equal(stopped.cycle.state, 'COMPLETED');
  assert.equal(a.position, 0);
  assert.equal(b.position, 0);
  assert.equal(a.cancelCount, 1);
  assert.equal(b.cancelCount, 1);
  assert.equal(stopped.history.length, 1);
  assert.equal(stopped.history[0].id, stopped.cycle.id);
  assert.equal(stopped.history[0].orders.filter((order) => order.leg === 'A').length, 2);
  assert.equal(stopped.history[0].orders.filter((order) => order.leg === 'B').length, 2);
  assert.deepEqual(new Set(stopped.history[0].orders.map((order) => order.stage)), new Set(['ENTRY', 'EXIT']));
  assert.ok(stopped.history[0].orders.every((order) => /CONFIRMED$/.test(order.status)));
});

test('persists and restores bounded Cycle ID order history without secrets', async () => {
  const saved = [];
  const manager = createManager(new FakeExchange(), new FakeExchange(), saved);
  await manager.start(validInput);
  await manager.stop('archive this cycle');
  const snapshot = saved.at(-1);
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.history[0].orders.length, 4);
  assert.equal(JSON.stringify(snapshot).includes('privateKey'), false);

  const restored = createManager();
  assert.equal(restored.restore(snapshot), true);
  assert.equal(restored.status().history.length, 1);
  assert.equal(restored.status().history[0].id, snapshot.cycle.id);
});

test('compensates a one-sided submit failure and confirms no residual position', async () => {
  const a = new FakeExchange();
  const b = new FakeExchange({ rejectOpen: true });
  const manager = createManager(a, b);
  const status = await manager.start(validInput);
  assert.equal(status.cycle.state, 'COMPLETED');
  assert.equal(a.position, 0);
  assert.equal(b.position, 0);
  assert.match(status.cycle.audit.map((item) => item.message).join('\n'), /COMPENSATING|提交失败/);
});

test('deduplicates exchange events and ignores unrelated accounts', async () => {
  const manager = createManager();
  await manager.start(validInput);
  assert.equal(manager.ingestEvent({ eventId: 'same', accountKey: 'other', type: 'order_update' }), false);
  assert.equal(manager.ingestEvent({ eventId: 'same', accountKey: 'a', type: 'order_update' }), true);
  assert.equal(manager.ingestEvent({ eventId: 'same', accountKey: 'a', type: 'order_update' }), false);
  await manager.queue;
  assert.equal(manager.status().cycle.state, 'OPEN');
  await manager.stop();
});

test('restores an interrupted cycle and flattens a residual leg before completion', async () => {
  const a = new FakeExchange({ initialSize: 0.01 });
  const b = new FakeExchange({ initialSize: 0 });
  const manager = createManager(a, b);
  assert.equal(manager.restore({ cycle: {
    id: 'restored', version: 4, state: 'OPEN', mode: 'paper', market: 'BTC/USDT', quantity: 0.01,
    leverage: 2, takeProfitPct: 2, stopLossPct: 1, maxUnhedgedMs: 25, cooldownMs: 0,
    legs: {
      A: { accountKey: 'a', side: 'buy', marketId: 'BTC-USDT', stepSize: 0.001 },
      B: { accountKey: 'b', side: 'sell', marketId: 'BTC-USDT', stepSize: 0.001 },
    }, audit: [], createdAt: Date.now(), updatedAt: Date.now(),
  } }), true);
  const resumed = await manager.resume();
  assert.equal(resumed.cycle.state, 'COMPLETED');
  assert.equal(a.position, 0);
  assert.equal(b.position, 0);
});

test('rejects mixed paper/live accounts and never persists secrets', async () => {
  const saved = [];
  const manager = createManager(new FakeExchange(), new FakeExchange(), saved);
  manager.configs.b.mode = 'live';
  await assert.rejects(manager.start({ ...validInput, apiKey: 'should-not-persist' }), /不能混用/);
  assert.equal(JSON.stringify(saved).includes('should-not-persist'), false);
});

test('refuses to start when either account already has open orders', async () => {
  const a = new FakeExchange({ initialOrders: [{ orderId: 'manual-order' }] });
  const manager = createManager(a, new FakeExchange());
  await assert.rejects(manager.start(validInput), /已有挂单/);
  assert.equal(a.position, 0);
});

test('compensates partial fills and unknown submit outcomes instead of declaring the cycle open', async () => {
  const a = new FakeExchange({ fillRatio: 0.5 });
  const b = new FakeExchange({ rejectAfterFill: true });
  const manager = createManager(a, b);
  const status = await manager.start(validInput);
  assert.equal(status.cycle.state, 'COMPLETED');
  assert.equal(a.position, 0);
  assert.equal(b.position, 0);
  assert.ok(a.closeCount >= 1);
  assert.ok(b.closeCount >= 1);
});

test('blocks a cross-exchange entry when reference prices exceed the configured deviation', async () => {
  const a = new FakeExchange({ price: 100 });
  const b = new FakeExchange({ price: 103 });
  const manager = createManager(a, b);
  await assert.rejects(manager.start(validInput), /参考价偏差/);
  assert.equal(a.orders.length, 0);
  assert.equal(b.orders.length, 0);
  assert.equal(manager.status().cycle.state, 'COMPLETED');
});

test('sizes both legs from the lower account equity and selected percentage', async () => {
  const a = new FakeExchange({ balance: 100, equity: 90 });
  const b = new FakeExchange({ balance: 40, equity: 45 });
  const manager = createManager(a, b);
  const status = await manager.start({ ...validInput, sizePercent: 5, leverage: 2 });
  assert.equal(status.cycle.quantity, 0.04);
  assert.equal(status.cycle.sizing.baseCapital, 40);
  assert.equal(status.cycle.sizing.marginBudget, 2);
  assert.equal(status.cycle.sizing.notional, 4);
  assert.equal(a.position, 0.04);
  assert.equal(b.position, -0.04);
  await manager.stop();
});

test('rejects leverage and size percentages outside the UI whitelist', async () => {
  const manager = createManager();
  await assert.rejects(manager.start({ ...validInput, leverage: 3 }), /只支持 1x/);
  await assert.rejects(manager.start({ ...validInput, sizePercent: 15 }), /只支持可用权益/);
});
