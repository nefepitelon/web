import assert from 'node:assert/strict';
import test from 'node:test';
import { OrderFlags, Side } from '@ellipsis-labs/rise';
import { createEnvView, validateEnvUpdate } from '../src/env-config.js';
import { publicExchangeManifest } from '../src/exchange/manifest.js';
import {
  PhoenixExchange,
  decodePhoenixPrivateKey,
  floorPhoenixStep,
  parsePhoenixOrderId,
  phoenixIsolatedTransferAmount,
} from '../src/exchange/phoenix/phoenix.js';
import { PhoenixPaperExchange } from '../src/exchange/phoenix/paper.js';

function token(ui) {
  return { value: BigInt(Math.round(Number(ui) * 1_000_000)), decimals: 6, ui: String(ui) };
}

function marketRow() {
  return {
    symbol: 'SOL', assetId: 7, marketStatus: 'active', metadata: { name: 'Solana' },
    tickSize: 100, baseLotsDecimals: 2, takerFee: 0.00035, makerFee: 0.00005,
    leverageTiers: [{ maxLeverage: 20, maxSizeBaseLots: 1000000 }], isolatedOnly: false,
  };
}

function createMockClient() {
  const trader = {
    collateralBalance: token(500), portfolioValue: token(510),
    capabilities: { placeLimitOrder: { immediate: true, viaColdActivation: false } },
    positions: [], limitOrders: { SOL: [] },
  };
  const calls = { placed: [], cancelled: [] };
  const client = {
    api: {
      exchange: () => ({ getMarkets: async () => [marketRow()] }),
      markets: () => ({ getLatestMarketsStats: async () => ({ markets: [{ symbol: 'SOL', mark_price: '150.25' }] }) }),
      candles: () => ({ getCandles: async () => [{ time: 1700000000000, markOpen: '149', markHigh: '151', markLow: '148', markClose: '150', volume: '12' }] }),
      traders: () => ({ getTrader: async () => trader }),
      orders: () => ({ getTraderOrderHistory: async () => ({ data: [], hasMore: false, nextCursor: null }) }),
    },
    pda: { getTraderAddress: async () => 'Trader1111111111111111111111111111111111' },
    orderPackets: {
      buildLimitOrderPacket: async ({ side, priceUsd, baseUnits, clientOrderId, orderFlags }) => ({
        side, priceInTicks: BigInt(Math.floor(Number(priceUsd) / 0.01)), numBaseLots: BigInt(Math.floor(Number(baseUnits) * 100)),
        clientOrderId, orderFlags, lastValidSlot: null, cancelExisting: false,
      }),
      buildMarketOrderPacket: async (packet) => packet,
    },
    ixs: {
      buildPlacePostOnlyOrder: async (params) => { calls.placed.push(params); return { kind: 'place', params }; },
      buildCancelOrdersById: async (params) => { calls.cancelled.push(params); return { kind: 'cancel', params }; },
      buildCancelAll: async (params) => ({ kind: 'cancelAll', params }),
      buildPlaceMarketOrder: async (params) => ({ kind: 'market', params }),
    },
  };
  return { client, trader, calls };
}

test('Phoenix key formats, increments and order IDs are deterministic', () => {
  assert.equal(decodePhoenixPrivateKey('00'.repeat(32)).length, 32);
  assert.equal(decodePhoenixPrivateKey(JSON.stringify(Array.from({ length: 64 }, (_, i) => i))).length, 64);
  assert.throws(() => decodePhoenixPrivateKey('[1,2,3]'), /32 字节 seed 或 64 字节/);
  assert.equal(floorPhoenixStep(1.239, 0.01), 1.23);
  assert.deepEqual(parsePhoenixOrderId('ph:SOL:15000:42'), { symbol: 'SOL', priceInTicks: 15000n, orderSequenceNumber: '42' });
  assert.equal(phoenixIsolatedTransferAmount({ price: 0.0075, sizeBase: 100, leverage: 3, makerFee: 0.00005, takerFee: 0.00035 }), 339300n);
});

test('Phoenix is manifest-driven and accepts private key or local keypair path', () => {
  const definition = publicExchangeManifest().find((item) => item.key === 'ph');
  assert.equal(definition.name, 'Phoenix');
  assert.equal(definition.defaultNetwork, 'mainnet');
  assert.deepEqual(definition.networks, ['mainnet']);
  assert.deepEqual(definition.requiredLiveAnyOf, [['PHOENIX_PRIVATE_KEY', 'PHOENIX_KEYPAIR_PATH']]);
  assert.ok(definition.capabilities.includes('Post-Only'));
  assert.equal(createEnvView({}).values.PHOENIX_KEYPAIR_PATH, 'secrets/phoenix.key');
  assert.throws(() => validateEnvUpdate({ PHOENIX_MODE: 'live' }, {
    PHOENIX_PRIVATE_KEY: '', PHOENIX_KEYPAIR_PATH: '',
  }), /PHOENIX_PRIVATE_KEY \/ PHOENIX_KEYPAIR_PATH/);
  assert.equal(validateEnvUpdate({ PHOENIX_MODE: 'live' }, {
    PHOENIX_PRIVATE_KEY: '00'.repeat(32), PHOENIX_KEYPAIR_PATH: '',
  }).merged.PHOENIX_MODE, 'live');
});

test('Phoenix public market and candle mapping uses the official SDK response', async () => {
  const { client } = createMockClient();
  const exchange = new PhoenixExchange({ client, signer: { address: '11111111111111111111111111111111' }, rpc: {}, sendInstructions: async () => 'signature' });
  await exchange._loadMarkets();
  await exchange._pollPrices();
  const market = (await exchange.getMarkets())[0];
  assert.equal(market.exchangeSymbol, 'SOL');
  assert.equal(market.stepPrice, 0.01);
  assert.equal(market.stepSize, 0.01);
  assert.equal(market.maxLeverage, 20);
  assert.equal(await exchange.getPrice(market.marketId), 150.25);
  assert.equal((await exchange.getCandles(market.marketId, 3600, 20))[0].close, 150);
});

test('Phoenix serializes public reads and safely backs off after HTTP 429', async () => {
  const { client } = createMockClient();
  let attempts = 0;
  const waits = [];
  client.api.exchange = () => ({
    getMarkets: async () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error('HTTP error (429): Too Many Requests');
        error.status = 429;
        error.retryAfterSeconds = 1;
        throw error;
      }
      return [marketRow()];
    },
  });
  const exchange = new PhoenixExchange({
    client,
    signer: { address: '11111111111111111111111111111111' },
    rpc: {},
    apiReadGapMs: 500,
    sleep: async (ms) => { waits.push(ms); },
  });

  await exchange._loadMarkets();

  assert.equal(attempts, 2);
  assert.ok(waits.some((ms) => ms >= 1500));
  assert.equal((await exchange.getMarkets()).length, 1);
});

test('Phoenix Solana RPC read retries 429 without replaying a transaction write', async () => {
  const { client } = createMockClient();
  let attempts = 0;
  const waits = [];
  const exchange = new PhoenixExchange({
    client,
    signer: { address: '11111111111111111111111111111111' },
    rpc: {},
    rpcReadGapMs: 250,
    sleep: async (ms) => { waits.push(ms); },
  });

  const value = await exchange._rpcRead(async () => {
    attempts++;
    if (attempts < 3) {
      const error = new Error('HTTP 429 Too Many Requests');
      error.status = 429;
      throw error;
    }
    return 'confirmed';
  }, '测试确认查询');

  assert.equal(value, 'confirmed');
  assert.equal(attempts, 3);
  assert.deepEqual(waits.filter((ms) => ms >= 1500), [1500, 3000]);
});

test('Phoenix live order builds Post-Only and cancels by exact tick and sequence', async () => {
  const { client, trader, calls } = createMockClient();
  let operation = 'place';
  const exchange = new PhoenixExchange({
    client, signer: { address: '11111111111111111111111111111111' }, rpc: {}, orderGapMs: 200,
    sendInstructions: async () => {
      if (operation === 'place') {
        trader.limitOrders.SOL = [{ price: token(150.12), side: Side.Bid, orderSequenceNumber: '42', tradeSizeRemaining: token(0.12), isReduceOnly: false }];
      } else trader.limitOrders.SOL = [];
      return 'signature';
    },
  });
  await exchange._loadMarkets();
  const market = (await exchange.getMarkets())[0];
  const placed = await exchange.placeLimitOrder({ marketId: market.marketId, side: 'buy', price: 150.129, sizeBase: 0.129, clientOrderId: 'grid-1' });
  assert.equal(placed.orderId, 'ph:SOL:15012:42');
  assert.equal(calls.placed.length, 1);
  assert.equal(calls.placed[0].orderPacket.slide, false);
  assert.equal(calls.placed[0].orderPacket.orderFlags, OrderFlags.None);
  operation = 'cancel';
  await exchange.cancelOrder(market.marketId, placed.orderId);
  assert.equal(calls.cancelled.length, 1);
  assert.deepEqual(calls.cancelled[0].orders, [{ priceInTicks: 15012n, orderSequenceNumber: '42' }]);
});

test('Phoenix isolated-only market uses the official isolated flow and remembers its child subaccount', async () => {
  const mainTrader = {
    collateralBalance: token(500), portfolioValue: token(500),
    capabilities: { placeLimitOrder: { immediate: true, viaColdActivation: false } },
    positions: [], limitOrders: { SKR: [] },
  };
  const isolatedTrader = {
    collateralBalance: token(1), portfolioValue: token(1),
    capabilities: mainTrader.capabilities,
    positions: [], limitOrders: { SKR: [] },
  };
  const calls = { isolated: [], cancelled: [], sent: [], raw: [] };
  const market = {
    symbol: 'SKR', assetId: 5, marketStatus: 'active', metadata: { name: 'Seeker' },
    marketPubkey: 'MarketSKR', tickSize: 1, baseLotsDecimals: 0,
    takerFee: 0.00035, makerFee: 0.00005, isolatedOnly: true,
    leverageTiers: [{ maxLeverage: 3, maxSizeBaseLots: 14000000 }],
  };
  const client = {
    addresses: { phoenixProgramAddress: 'PhoenixProgram' },
    api: {
      exchange: () => ({ getMarkets: async () => [market] }),
      markets: () => ({ getLatestMarketsStats: async () => ({ markets: [{ symbol: 'SKR', mark_price: '0.0075' }] }) }),
      candles: () => ({ getCandles: async () => [] }),
      traders: () => ({
        getTrader: async (address) => address === 'Trader-2' ? isolatedTrader : mainTrader,
        getTraderStateSnapshot: async () => ({ snapshot: { subaccounts: [] } }),
      }),
      orders: () => ({
        placeIsolatedLimitOrder: async (params) => {
          calls.isolated.push(params);
          const accounts = Array.from({ length: 10 }, (_, index) => ({ address: `Account-${index}`, role: 1 }));
          accounts[4] = { address: 'Trader-2', role: 1 };
          accounts[8] = { address: 'MarketSKR', role: 1 };
          return [{ programAddress: 'PhoenixProgram', accounts, data: new Uint8Array([1]) }];
        },
        getTraderOrderHistory: async () => ({ data: [], hasMore: false, nextCursor: null }),
      }),
    },
    pda: { getTraderAddress: async ({ subaccountIndex }) => `Trader-${subaccountIndex}` },
    orderPackets: {
      buildLimitOrderPacket: async ({ side, priceUsd, baseUnits, clientOrderId, orderFlags }) => ({
        side, priceInTicks: BigInt(Math.floor(Number(priceUsd) * 1_000_000)), numBaseLots: BigInt(Math.floor(Number(baseUnits))),
        clientOrderId, orderFlags, lastValidSlot: null, cancelExisting: false,
      }),
    },
    ixs: {
      buildSyncParentToChild: async (params) => { calls.raw.push({ kind: 'sync', params }); return { kind: 'sync', params }; },
      buildTransferCollateral: async (params) => { calls.raw.push({ kind: 'transfer', params }); return { kind: 'transfer', params }; },
      buildPlacePostOnlyOrder: async (params) => { calls.raw.push({ kind: 'place', params }); return { kind: 'place', params }; },
      buildTransferCollateralChildToParent: async (params) => { calls.raw.push({ kind: 'sweep', params }); return { kind: 'sweep', params }; },
      buildCancelOrdersById: async (params) => { calls.cancelled.push(params); return { kind: 'cancel', params }; },
    },
  };
  let operation = 'place';
  let placement = 0;
  const exchange = new PhoenixExchange({
    client, signer: { address: 'Authority' }, rpc: {}, orderGapMs: 200,
    sendInstructions: async (instructions) => {
      calls.sent.push(instructions);
      if (operation === 'place') {
        placement++;
        isolatedTrader.limitOrders.SKR.push({
          price: token(placement === 1 ? 0.0075 : 0.0074), side: Side.Bid,
          orderSequenceNumber: String(8 + placement), tradeSizeRemaining: token(100), isReduceOnly: false,
        });
      } else isolatedTrader.limitOrders.SKR = [];
      return 'signature';
    },
  });
  await exchange._loadMarkets();
  const selected = (await exchange.getMarkets())[0];
  await exchange.setLeverage(selected.marketId, 3);
  const placed = await exchange.placeLimitOrder({ marketId: selected.marketId, side: 'buy', price: 0.0075, sizeBase: 100, clientOrderId: 'grid-iso-1' });
  assert.equal(placed.orderId, 'ph:SKR:7500:9');
  assert.equal(calls.isolated.length, 1);
  assert.equal(calls.isolated[0].transferAmount, 339300);
  assert.equal(calls.isolated[0].isPostOnly, true);
  assert.equal(calls.sent[0].length, 1);
  const placedAgain = await exchange.placeLimitOrder({ marketId: selected.marketId, side: 'buy', price: 0.0074, sizeBase: 100, clientOrderId: 'grid-iso-2' });
  assert.equal(placedAgain.orderId, 'ph:SKR:7400:10');
  assert.equal(calls.isolated.length, 1);
  assert.deepEqual(calls.raw.map((call) => call.kind), ['sync', 'transfer', 'place', 'sweep']);
  assert.equal(calls.raw[1].params.dstSubaccountIndex, 2);
  assert.equal(calls.raw[2].params.traderSubaccountIndex, 2);
  assert.equal(calls.sent[1].length, 4);
  operation = 'cancel';
  await exchange.cancelOrder(selected.marketId, placed.orderId);
  assert.equal(calls.cancelled[0].traderSubaccountIndex, 2);
});

test('Phoenix paper adapter can place and cancel a grid order without a private key', async () => {
  const { client } = createMockClient();
  const exchange = new PhoenixPaperExchange({ client, startBalance: 10000 });
  await exchange.init();
  exchange.stop();
  const market = (await exchange.getMarkets())[0];
  const placed = await exchange.placeLimitOrder({ marketId: market.marketId, side: 'buy', price: 149.999, sizeBase: 0.129, levelIndex: 3 });
  assert.equal(exchange.getOpenOrders(market.marketId).length, 1);
  await exchange.cancelOrder(market.marketId, placed.orderId);
  assert.equal(exchange.getOpenOrders(market.marketId).length, 0);
});

test('Phoenix account totals include isolated child collateral reserved by resting orders', async () => {
  const exchange = new PhoenixExchange({
    client: {}, signer: { address: 'Authority' }, rpc: {}, sendInstructions: async () => 'signature',
  });
  exchange._traderAddress = 'Parent';
  exchange.markets.set(1, { marketId: 1, exchangeSymbol: 'SKR', isolatedOnly: true });
  exchange.marketToId.set('SKR', 1);
  exchange._watch.add(1);
  exchange._isolatedAccounts.set(1, { index: 2, address: 'Child-2' });
  exchange._getTrader = async () => ({ collateralBalance: token(27.34), portfolioValue: token(27.34), positions: [] });
  exchange._getTraderForMarket = async () => ({ collateralBalance: token(197.26), portfolioValue: token(197.26), positions: [] });

  await exchange._refreshAccount();

  assert.equal(exchange.balance, 224.6);
  assert.equal(exchange.equity, 224.6);
  assert.equal(exchange.realizedPnl, null);
});
