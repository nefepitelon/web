import assert from 'node:assert/strict';
import test from 'node:test';
import BigNumber from 'bignumber.js';
import { unpackOrderAppendix } from '@nadohq/shared';
import { createEnvView, validateEnvUpdate } from '../src/env-config.js';
import { publicExchangeManifest } from '../src/exchange/manifest.js';
import {
  NadoExchange,
  configureNadoSdkNetwork,
  decodeNadoPrivateKey,
  floorNadoStep,
} from '../src/exchange/nado/nado.js';
import { NadoPaperExchange } from '../src/exchange/nado/paper.js';

const x18 = (value) => new BigNumber(value).times(new BigNumber(10).pow(18));

function createMockClient() {
  const calls = { placed: [], cancelled: [], cancelAll: [] };
  const axiosClient = () => ({ axiosInstance: { defaults: {} } });
  const market = {
    getAllMarkets: async () => [{
      productId: 2, type: 1, minSize: x18(100), priceIncrement: new BigNumber(1), sizeIncrement: x18(0.00005),
      product: { oraclePrice: new BigNumber(65000), longWeightInitial: new BigNumber(0.98) },
    }],
    getSymbols: async () => ({ symbols: { 'BTC-PERP': {
      productId: 2, type: 1, symbol: 'BTC-PERP', minSize: x18(100), priceIncrement: new BigNumber(1), sizeIncrement: x18(0.00005),
      makerFeeRate: new BigNumber(0.0001), takerFeeRate: new BigNumber(0.00035), longWeightInitial: new BigNumber(0.98),
      maxOpenInterest: new BigNumber(1000000), isolatedOnly: false,
    } } }),
    getLatestMarketPrice: async () => ({ productId: 2, bid: new BigNumber(64999), ask: new BigNumber(65001) }),
    getCandlesticks: async () => [{ time: new BigNumber(1700000000), open: new BigNumber(64000), high: new BigNumber(65100), low: new BigNumber(63900), close: new BigNumber(65000), volume: x18(12) }],
    placeOrder: async (params) => { calls.placed.push(params); return { status: 'success', data: { digest: '0x' + 'ab'.repeat(32) } }; },
    cancelOrders: async (params) => { calls.cancelled.push(params); return { status: 'success', data: {} }; },
    cancelProductOrders: async (params) => { calls.cancelAll.push(params); return { status: 'success', data: {} }; },
    getOpenSubaccountOrders: async () => ({ productId: 2, orders: [] }),
    getHistoricalOrders: async () => [],
  };
  const client = {
    context: { engineClient: axiosClient(), indexerClient: axiosClient(), triggerClient: axiosClient(), mobileClient: axiosClient() },
    market,
    subaccount: { getSubaccountSummary: async () => ({ exists: true, balances: [], health: { unweighted: { assets: x18(500), liabilities: x18(10) } } }) },
  };
  return { client, calls };
}

test('Nado private key, increments and official SDK network bridge are deterministic', () => {
  assert.equal(decodeNadoPrivateKey('11'.repeat(32)), `0x${'11'.repeat(32)}`);
  assert.equal(decodeNadoPrivateKey(JSON.stringify(Array(32).fill(17))), `0x${'11'.repeat(32)}`);
  assert.throws(() => decodeNadoPrivateKey('1234'), /32 字节 Hex/);
  assert.equal(floorNadoStep(1.239, 0.01), 1.23);
  const { client } = createMockClient();
  configureNadoSdkNetwork(client);
  assert.equal(client.context.engineClient.axiosInstance.defaults.adapter, 'fetch');
  assert.equal(client.context.engineClient.axiosInstance.defaults.proxy, false);
});

test('Nado is manifest-driven and exposes every requested local env field', () => {
  const definition = publicExchangeManifest().find((item) => item.key === 'nd');
  assert.equal(definition.name, 'Nado');
  assert.equal(definition.chain, 'Ink L2 · Perpetuals');
  assert.deepEqual(definition.networks, ['mainnet', 'testnet']);
  assert.deepEqual(definition.requiredLiveAnyOf, [['NADO_PRIVATE_KEY', 'NADO_KEY_PATH']]);
  assert.ok(definition.capabilities.includes('Linked Signer'));
  const env = createEnvView({}).values;
  assert.equal(env.NADO_KEY_PATH, 'secrets/nado.key');
  assert.equal(env.NADO_SUBACCOUNT, 'default');
  assert.equal(env.NADO_BTC_PRODUCT_ID, '2');
  assert.equal(env.NADO_INK_RPC, 'https://rpc-gel.inkonchain.com');
  assert.throws(() => validateEnvUpdate({ NADO_MODE: 'live' }, {
    NADO_PRIVATE_KEY: '', NADO_KEY_PATH: '',
  }), /NADO_PRIVATE_KEY \/ NADO_KEY_PATH/);
});

test('Nado public markets, price and candles map official SDK units correctly', async () => {
  const { client } = createMockClient();
  const exchange = new NadoExchange({ client, signer: { address: `0x${'22'.repeat(20)}` }, owner: `0x${'22'.repeat(20)}` });
  await exchange._loadMarkets();
  const market = (await exchange.getMarkets())[0];
  assert.equal(market.marketId, 2);
  assert.equal(market.exchangeSymbol, 'BTC-PERP');
  assert.equal(market.stepSize, 0.00005);
  assert.equal(market.minNotional, 100);
  assert.equal(market.maxLeverage, 50);
  assert.equal(await exchange.getPrice(2), 65000);
  const candle = (await exchange.getCandles(2, 3600, 20))[0];
  assert.equal(candle.time, 1700000000000);
  assert.equal(candle.close, 65000);
  assert.equal(candle.volume, 12);
});

test('Nado live order is Post-Only, signed locally and cancelled by exact digest', async () => {
  const { client, calls } = createMockClient();
  const owner = `0x${'22'.repeat(20)}`;
  const exchange = new NadoExchange({ client, signer: { address: owner }, owner, orderGapMs: 200 });
  await exchange._loadMarkets();
  const placed = await exchange.placeLimitOrder({ marketId: 2, side: 'buy', price: 64999.9, sizeBase: 0.002, levelIndex: 4 });
  assert.equal(placed.orderId, `0x${'ab'.repeat(32)}`);
  assert.equal(calls.placed.length, 1);
  assert.equal(calls.placed[0].order.price.toString(), '64999');
  assert.equal(calls.placed[0].order.amount.toString(), x18(0.002).toString());
  assert.equal(unpackOrderAppendix(calls.placed[0].order.appendix).orderExecutionType, 'post_only');
  await exchange.cancelOrder(2, placed.orderId);
  assert.deepEqual(calls.cancelled[0].productIds, [2]);
  assert.deepEqual(calls.cancelled[0].digests, [placed.orderId]);
});

test('Nado paper adapter places and cancels a grid order without a private key', async () => {
  const { client } = createMockClient();
  const exchange = new NadoPaperExchange({ client, startBalance: 10000 });
  await exchange.init();
  exchange.stop();
  const placed = await exchange.placeLimitOrder({ marketId: 2, side: 'buy', price: 65000, sizeBase: 0.002, levelIndex: 3 });
  assert.equal(exchange.getOpenOrders(2).length, 1);
  await exchange.cancelOrder(2, placed.orderId);
  assert.equal(exchange.getOpenOrders(2).length, 0);
});
