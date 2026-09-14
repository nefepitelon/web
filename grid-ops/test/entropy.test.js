import assert from 'node:assert/strict';
import test from 'node:test';
import { createExchange } from '../src/exchange/entropy/index.js';
import { entropyAssetId, mapEntropyMarkets } from '../src/exchange/entropy/entropy.js';

const DEXS = [
  { name: '' }, { name: 'abc' }, { name: 'io', fullName: 'EntropyIO' },
];

test('Entropy derives HIP-3 asset IDs from current perpDexs order', () => {
  assert.equal(entropyAssetId(DEXS, 'io', 0), 120000);
  assert.equal(entropyAssetId([{ name: 'io' }], 'io', 4), 100004);
  assert.throws(() => entropyAssetId([], 'io', 0), /未返回 Entropy DEX/);
});

test('Entropy maps active official markets and filters delisted rows', () => {
  const markets = mapEntropyMarkets(DEXS, [{ universe: [
    { name: 'io:ANTH', szDecimals: 3, maxLeverage: 6, onlyIsolated: true },
    { name: 'io:OLD', szDecimals: 2, maxLeverage: 3, isDelisted: true },
  ] }, [
    { markPx: '2.345' }, { markPx: '1' },
  ]], 'io');
  assert.equal(markets.length, 1);
  assert.equal(markets[0].symbol, 'ANTH');
  assert.equal(markets[0].marketId, 120000);
});

test('Entropy market mapping exposes precision and isolated-only metadata', () => {
  const [market] = mapEntropyMarkets(DEXS, [{ universe: [
    { name: 'io:ANTH', szDecimals: 3, maxLeverage: 6, onlyIsolated: true },
  ] }, [{ markPx: '2.345' }]], 'io');
  assert.equal(market.marketId, 120000);
  assert.equal(market.displayName, 'ANTH/USD');
  assert.equal(market.stepSize, 0.001);
  assert.equal(market.stepPrice, 0.001);
  assert.equal(market.lastPrice, 2.345);
  assert.equal(market.isolatedOnly, true);
});

test('Entropy paper is tradable simulation while live fails closed', async () => {
  const paper = createExchange({ mode: 'paper' });
  assert.equal(paper.mode, 'paper');
  const live = createExchange({ mode: 'live' });
  assert.equal(live.mode, 'live');
  await assert.rejects(live.init(), (error) => error.code === 'ENTROPY_LIVE_NOT_AVAILABLE');
  await assert.rejects(live.placeLimitOrder({}), /实盘暂未开放/);
});
