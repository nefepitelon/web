import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectExchangeInstanceExposure } from '../src/exchange/instance-removal.js';

function botState(overrides = {}) {
  return {
    running: false,
    openOrders: 0,
    position: null,
    config: { marketId: 7 },
    ...overrides,
  };
}

test('a running secondary bot is never safe to delete', async () => {
  const exposure = await inspectExchangeInstanceExposure({
    bot: { getState: () => botState({ running: true }) },
    exchange: {},
    mode: 'paper',
  });
  assert.equal(exposure.running, true);
  assert.equal(exposure.safeToDelete, false);
});

test('cached paper orders and positions block deletion', async () => {
  const exposure = await inspectExchangeInstanceExposure({
    bot: { getState: () => botState({ openOrders: 2 }) },
    exchange: {
      _tracked: new Map([['o1', { marketId: 7 }]]),
      _positions: new Map([[7, { sizeBase: -0.25, entryPrice: 101 }]]),
    },
    mode: 'paper',
  });
  assert.equal(exposure.openOrders, 2);
  assert.equal(exposure.positions.length, 1);
  assert.equal(exposure.safeToDelete, false);
});

test('cached orders from a previously selected market still block account deletion', async () => {
  const exposure = await inspectExchangeInstanceExposure({
    bot: { getState: () => botState() },
    exchange: { _tracked: new Map([['old-market-order', { marketId: 99 }]]) },
    mode: 'paper',
  });
  assert.equal(exposure.openOrders, 1);
  assert.equal(exposure.safeToDelete, false);
});

test('live deletion refreshes the account and verifies remote orders before allowing removal', async () => {
  let refreshes = 0;
  let orderChecks = 0;
  const exposure = await inspectExchangeInstanceExposure({
    bot: { getState: () => botState() },
    exchange: {
      async _refreshAccount() { refreshes += 1; },
      async fetchOpenOrders(marketId) { orderChecks += 1; assert.equal(marketId, 7); return []; },
      getPosition() { return null; },
      _tracked: new Map(),
      _positions: new Map(),
    },
    mode: 'live',
  });
  assert.equal(refreshes, 1);
  assert.equal(orderChecks, 1);
  assert.deepEqual(exposure.marketIds, [7]);
  assert.equal(exposure.remoteOpenOrders, 0);
  assert.equal(exposure.safeToDelete, true);
});

test('live deletion fails closed when the exchange cannot confirm account exposure', async () => {
  await assert.rejects(
    inspectExchangeInstanceExposure({
      bot: { getState: () => botState() },
      exchange: {
        async _refreshAccount() { throw new Error('network timeout'); },
        async fetchOpenOrders() { return []; },
      },
      mode: 'live',
    }),
    (error) => error?.code === 'INSTANCE_RISK_CHECK_FAILED' && /已拒绝删除/.test(error.message),
  );
});

test('live remote orders block deletion even when the local bot cache is empty', async () => {
  const exposure = await inspectExchangeInstanceExposure({
    bot: { getState: () => botState() },
    exchange: {
      async _refreshAccount() {},
      async fetchOpenOrders() { return [{ orderId: 'remote-1' }]; },
      getPosition() { return null; },
      _tracked: new Map(),
      _positions: new Map(),
    },
    mode: 'live',
  });
  assert.equal(exposure.openOrders, 1);
  assert.equal(exposure.safeToDelete, false);
});
