import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtendedExchange } from '../src/exchange/ex/extended.js';

const PRIVATE_KEY = '0x7a7ff6fd3cab02ccdcd4a572563f5976f8976899b03a39773795a3c486d4986';
const PUBLIC_KEY = '0x61c5e7e8339b7d56f197f54ea91b776776690e3232313de0f2ecbd0ef76f466';

function createExchange(maxFeeRate = '0.0005') {
  const exchange = new ExtendedExchange({
    apiKey: 'test-key', vault: 10002, privateKey: PRIVATE_KEY, publicKey: PUBLIC_KEY,
    apiUrl: 'https://api.starknet.extended.exchange', network: 'mainnet', feeRate: maxFeeRate,
  });
  exchange.markets.set(1, {
    marketId: 1, name: 'LIT-USD', qtyStep: '0.1', priceStep: '0.001',
    l2: { syntheticId: '3440737', collateralId: '1', synRes: 1_000_000, colRes: 1_000_000 },
  });
  return exchange;
}

test('Extended loads the authenticated account fee instead of signing the configured cap', async () => {
  const exchange = createExchange();
  exchange._get = async (path) => {
    assert.equal(path, '/api/v1/user/fees?market=LIT-USD');
    return [{ market: 'LIT-USD', makerFeeRate: '0.0', takerFeeRate: '0.000225', builderFeeRate: '0' }];
  };

  await exchange.preflightTrading(1);
  assert.equal(exchange.feeRate, '0.000225');
  assert.equal(exchange._feeForOrder(exchange.markets.get(1), true), '0.0');
  assert.equal(exchange._feeForOrder(exchange.markets.get(1), false), '0.000225');
});

test('Extended signs non-post-only orders with the current taker fee and post-only with maker fee', async () => {
  const exchange = createExchange();
  exchange._fees.set('LIT-USD', { makerFeeRate: '0.0', takerFeeRate: '0.000225' });
  const payloads = [];
  exchange._req = async (method, path, body) => {
    assert.equal(method, 'POST');
    assert.equal(path, '/api/v1/user/order');
    payloads.push(body);
    return { id: String(payloads.length) };
  };

  await exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 2.3, sizeBase: 17, postOnly: false });
  await exchange.placeLimitOrder({ marketId: 1, side: 'sell', price: 2.4, sizeBase: 17, postOnly: true });
  assert.deepEqual(payloads.map((payload) => payload.fee), ['0.000225', '0.0']);
  assert.deepEqual(payloads.map((payload) => payload.postOnly), [false, true]);
});

test('Extended refreshes and safely retries exactly once after explicit fee rejection 1128', async () => {
  const exchange = createExchange();
  exchange._fees.set('LIT-USD', { makerFeeRate: '0.0', takerFeeRate: '0.00025' });
  const submittedFees = [];
  let posts = 0;
  exchange._req = async (method, path, body) => {
    if (method === 'GET' && path === '/api/v1/user/fees?market=LIT-USD') {
      return [{ market: 'LIT-USD', makerFeeRate: '0.0', takerFeeRate: '0.000225' }];
    }
    submittedFees.push(body.fee);
    posts++;
    if (posts === 1) {
      const error = new Error('Extended 接口错误 1128: Trading fees are invalid');
      error.code = 1128;
      throw error;
    }
    return { id: 'accepted' };
  };

  const result = await exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 2.3, sizeBase: 17 });
  assert.equal(result.orderId, 'accepted');
  assert.equal(posts, 2);
  assert.deepEqual(submittedFees, ['0.00025', '0.000225']);
});

test('Extended refuses a live account fee above the configured safety cap', async () => {
  const exchange = createExchange('0.0005');
  exchange._get = async () => [{ market: 'LIT-USD', makerFeeRate: '0.0', takerFeeRate: '0.0006' }];
  await assert.rejects(
    () => exchange.preflightTrading(1),
    /超过本机安全上限 EXTENDED_MAX_FEE=0\.0005/,
  );
});

test('Extended replaces a stale configured vault with the API-key account vault before signing', async () => {
  const exchange = createExchange();
  exchange._get = async (path) => {
    assert.equal(path, '/api/v1/user/account/info');
    return { status: 'ACTIVE', l2Key: PUBLIC_KEY, l2Vault: '9007199254740993123' };
  };

  const result = await exchange._syncAccountIdentity();

  assert.equal(result.vault, '9007199254740993123');
  assert.equal(exchange.vault, '9007199254740993123');
});

test('Extended blocks an API key paired with another sub-account Stark key', async () => {
  const exchange = createExchange();
  exchange._get = async () => ({ status: 'ACTIVE', l2Key: '0x123', l2Vault: '10002' });
  await assert.rejects(() => exchange._syncAccountIdentity(), /不属于同一个子账户/);
});
