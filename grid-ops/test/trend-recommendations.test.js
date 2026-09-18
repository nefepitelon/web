import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTrendIntervalSec,
  normalizeTrendRecommendation,
  normalizeTrendRecommendationMinStrength,
  scanTrendRecommendations,
  TREND_RECOMMENDATION_MIN_STRENGTH,
} from '../src/trend-recommendations.js';

test('trend recommendation scan keeps only neutral markets strictly above 30 percent', async () => {
  const visited = [];
  const result = await scanTrendRecommendations({
    markets: [
      { marketId: 1, displayName: 'ALPHA/USDT' },
      { marketId: 2, displayName: 'BETA/USDT' },
      { marketId: 3, displayName: 'GAMMA/USDT' },
      { marketId: 4, displayName: 'CLOSED/USDT', isClosed: true },
      { marketId: 5, displayName: 'FAILED/USDT' },
    ],
    intervalSec: 900,
    concurrency: 2,
    getCandles: async (marketId) => {
      visited.push(marketId);
      if (marketId === 5) throw new Error('market unavailable');
      return Array.from({ length: 60 }, (_, index) => ({ marketId, close: index + 1 }));
    },
    getPrice: async () => 100,
    analyze: (candles, _price) => ({
      recommended: candles[0].marketId === 3 ? 'long' : 'neutral',
      strength: candles[0].marketId === 1 ? 0.31 : candles[0].marketId === 2 ? 0.30 : 0.90,
      price: 100,
      atrPct: 1.2,
      detail: 'test',
    }),
  });

  assert.equal(TREND_RECOMMENDATION_MIN_STRENGTH, 0.30);
  assert.deepEqual(result.recommendations.map((item) => item.marketId), [1]);
  assert.equal(result.scanned, 4);
  assert.equal(result.matched, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.intervalSec, 900);
  assert.equal(visited.includes(4), false);
});

test('trend recommendation scan supports long and short filters with ten-percent strength steps', async () => {
  const result = await scanTrendRecommendations({
    markets: [
      { marketId: 1, displayName: 'LONG-LOW' },
      { marketId: 2, displayName: 'LONG-HIGH' },
      { marketId: 3, displayName: 'SHORT-HIGH' },
    ],
    recommendation: 'long',
    minStrength: 0.36,
    getCandles: async (marketId) => Array.from({ length: 60 }, () => ({ close: 1, marketId })),
    getPrice: async () => 1,
    analyze: (candles) => ({
      recommended: candles[0].marketId === 3 ? 'short' : 'long',
      strength: candles[0].marketId === 1 ? 0.40 : 0.51,
      price: 1,
      detail: '',
    }),
  });

  assert.equal(result.recommendation, 'long');
  assert.equal(result.minStrength, 0.4);
  assert.deepEqual(result.recommendations.map((item) => item.marketId), [2]);
  assert.equal(result.recommendations[0].recommended, 'long');
  assert.equal(normalizeTrendRecommendation('SHORT'), 'short');
  assert.equal(normalizeTrendRecommendation('invalid'), 'neutral');
  assert.equal(normalizeTrendRecommendationMinStrength(null), 0.3);
  assert.equal(normalizeTrendRecommendationMinStrength('0.84'), 0.8);
});

test('trend recommendation scan bounds concurrency and normalizes unsupported intervals', async () => {
  let active = 0;
  let maxActive = 0;
  const result = await scanTrendRecommendations({
    markets: Array.from({ length: 8 }, (_, index) => ({ marketId: index + 1, displayName: `M${index + 1}` })),
    intervalSec: 123,
    concurrency: 3,
    getCandles: async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return Array.from({ length: 60 }, () => ({ close: 1 }));
    },
    getPrice: async () => 1,
    analyze: () => ({ recommended: 'neutral', strength: 0.5, price: 1, detail: '' }),
  });

  assert.ok(maxActive <= 3);
  assert.equal(result.intervalSec, 3600);
  assert.equal(result.recommendations.length, 8);
  assert.equal(normalizeTrendIntervalSec('86400'), 86400);
  assert.equal(normalizeTrendIntervalSec('unsupported'), 3600);
});
