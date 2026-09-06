import assert from 'node:assert/strict';
import test from 'node:test';
import BigNumber from 'bignumber.js';
import { extractLiquidationPrice, finiteExchangeNumber } from '../src/exchange/liquidation-price.js';
import { deriveNadoLiquidationPrice } from '../src/exchange/nado/nado.js';

const X18 = new BigNumber(10).pow(18);
const x18 = (value) => new BigNumber(value).times(X18);

test('liquidation parser supports exchange aliases and SDK numeric wrappers', () => {
  assert.equal(finiteExchangeNumber({ ui: '123.456' }), 123.456);
  assert.equal(finiteExchangeNumber(new BigNumber('654.321')), 654.321);
  assert.deepEqual(extractLiquidationPrice({ estimated_liquidation_price: '42.5' }), {
    liquidationPrice: 42.5,
    liquidationPriceStatus: 'available',
    liquidationPriceSource: 'exchange',
  });
  assert.equal(extractLiquidationPrice({ risk: { liquidationPrice: { ui: '98.7' } } }).liquidationPrice, 98.7);
});

test('an authoritative zero liquidation price is not mislabeled as missing', () => {
  assert.deepEqual(extractLiquidationPrice({ estimated_liquidation_price: 0 }), {
    liquidationPrice: null,
    liquidationPriceStatus: 'none',
    liquidationPriceSource: 'exchange',
  });
  assert.deepEqual(extractLiquidationPrice({}), {
    liquidationPrice: null,
    liquidationPriceStatus: 'unavailable',
    liquidationPriceSource: null,
  });
});

function nadoFixture({ size, oracle = 64305.5, weight, vQuote, health = 20, extraSpot = false }) {
  const contribution = size * oracle * weight + vQuote;
  const target = {
    type: 1,
    productId: 2,
    amount: x18(size),
    vQuoteBalance: x18(vQuote),
    oraclePrice: new BigNumber(oracle),
    longWeightMaintenance: new BigNumber(size > 0 ? weight : 0.95),
    shortWeightMaintenance: new BigNumber(size < 0 ? weight : 1.05),
    healthContributions: { maintenance: x18(contribution) },
  };
  const balances = [
    { type: 0, productId: 0, amount: x18(200) },
    target,
  ];
  if (extraSpot) balances.push({ type: 0, productId: 3, amount: x18(0.1) });
  return {
    target,
    summary: { balances, health: { maintenance: { health: x18(health) } } },
  };
}

test('Nado maintenance-health boundary is derived for long and short positions', () => {
  const long = nadoFixture({ size: 0.00645, weight: 0.95, vQuote: -412.8 });
  const longResult = deriveNadoLiquidationPrice(long.summary, long.target);
  assert.equal(longResult.liquidationPriceStatus, 'available');
  assert.equal(longResult.liquidationPriceSource, 'derived-maintenance-health');
  assert.ok(longResult.liquidationPrice > 61000 && longResult.liquidationPrice < 61100);

  const short = nadoFixture({ size: -0.00645, weight: 1.05, vQuote: 412.8 });
  const shortResult = deriveNadoLiquidationPrice(short.summary, short.target);
  assert.equal(shortResult.liquidationPriceStatus, 'available');
  assert.ok(shortResult.liquidationPrice > 67200 && shortResult.liquidationPrice < 67300);
});

test('Nado refuses an unsafe estimate when spread exposure or health data disagrees', () => {
  const spread = nadoFixture({ size: 0.00645, weight: 0.95, vQuote: -412.8, extraSpot: true });
  assert.equal(deriveNadoLiquidationPrice(spread.summary, spread.target).liquidationPriceStatus, 'unavailable');

  const mismatch = nadoFixture({ size: 0.00645, weight: 0.95, vQuote: -412.8 });
  mismatch.target.healthContributions.maintenance = x18(999);
  assert.equal(deriveNadoLiquidationPrice(mismatch.summary, mismatch.target).liquidationPriceStatus, 'unavailable');
});
