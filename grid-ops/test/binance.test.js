import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { BinanceExchange, floorToStep, signQuery } from '../src/exchange/binance/binance.js';
import { createEnvView, validateEnvUpdate } from '../src/env-config.js';
import { publicExchangeManifest } from '../src/exchange/manifest.js';

function market() {
  return {
    marketId: 1,
    name: 'BTCUSDT',
    displayName: 'BTC/USDT',
    symbol: 'BTC',
    exchangeSymbol: 'BTCUSDT',
    stepSize: 0.001,
    stepPrice: 0.1,
    minOrderSize: 0.001,
    maxOrderSize: 1000,
    minNotional: 5,
    maxLeverage: 125,
  };
}

test('Binance quantity/price flooring avoids exceeding exchange precision', () => {
  assert.equal(floorToStep(1.234567, 0.001), 1.234);
  assert.equal(floorToStep(100.19, 0.1), 100.1);
  assert.equal(floorToStep(12.999, 1), 12);
});

test('Binance query signing is deterministic HMAC SHA256', () => {
  const result = signQuery({ symbol: 'BTCUSDT', side: 'BUY' }, 'secret');
  assert.equal(result.query, 'symbol=BTCUSDT&side=BUY');
  assert.equal(result.signature, '83ef3517b61b829b8755e0f6dcff8b6b1c29f47ae72076ecd2aee6237ffbc10f');
});

test('Binance is exposed through the manifest and defaults to testnet', () => {
  const definition = publicExchangeManifest().find((item) => item.key === 'bn');
  assert.equal(definition.name, 'Binance');
  assert.equal(definition.defaultNetwork, 'testnet');
  assert.deepEqual(definition.networks, ['mainnet', 'testnet']);
  assert.ok(definition.fields.some((field) => field.env === 'BINANCE_API_SECRET' && field.secret));
  assert.equal(createEnvView({}).values.BN_NETWORK, 'testnet');
});

test('Binance live mode requires both API credentials and masks the secret', () => {
  assert.throws(() => validateEnvUpdate({ BN_MODE: 'live' }, {}), /BINANCE_API_KEY.*BINANCE_API_SECRET/);
  const result = validateEnvUpdate({ BN_MODE: 'live' }, {
    BINANCE_API_KEY: 'key-123',
    BINANCE_API_SECRET: 'secret-5678',
  });
  assert.equal(result.merged.BN_MODE, 'live');
  const view = createEnvView(result.merged);
  assert.equal(view.secrets.BINANCE_API_SECRET, '••••5678');
  assert.doesNotMatch(JSON.stringify(view), /secret-5678/);
});

test('Binance live order uses signed Futures endpoint and exchange filters', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ orderId: 987654 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const exchange = new BinanceExchange({
    apiUrl: 'https://demo-fapi.binance.com',
    apiKey: 'public-key',
    apiSecret: 'secret-key',
  });
  exchange.markets.set(1, market());
  const result = await exchange.placeLimitOrder({
    marketId: 1,
    side: 'buy',
    price: 100.19,
    sizeBase: 0.123456,
    postOnly: true,
    reduceOnly: false,
    clientOrderId: 'grid/level/1',
  });

  assert.equal(result.orderId, '987654');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['X-MBX-APIKEY'], 'public-key');
  const url = new URL(request.url);
  assert.equal(url.pathname, '/fapi/v1/order');
  assert.equal(url.searchParams.get('symbol'), 'BTCUSDT');
  assert.equal(url.searchParams.get('side'), 'BUY');
  assert.equal(url.searchParams.get('type'), 'LIMIT');
  assert.equal(url.searchParams.get('quantity'), '0.123');
  assert.equal(url.searchParams.get('price'), '100.1');
  assert.equal(url.searchParams.get('timeInForce'), 'GTX');
  assert.equal(url.searchParams.get('newClientOrderId'), 'wlgridlevel1');
  const signature = url.searchParams.get('signature');
  url.searchParams.delete('signature');
  const expected = createHmac('sha256', 'secret-key').update(url.searchParams.toString()).digest('hex');
  assert.equal(signature, expected);
});

test('Binance resolves an unknown POST result by client order id without resubmitting', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), method: options.method });
    if (requests.length === 1) throw new TypeError('connection reset after write');
    return new Response(JSON.stringify({ orderId: 42 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const exchange = new BinanceExchange({ apiUrl: 'https://example.test', apiKey: 'key', apiSecret: 'secret' });
  exchange.markets.set(1, market());
  const result = await exchange.placeLimitOrder({
    marketId: 1,
    side: 'sell',
    price: 100,
    sizeBase: 0.1,
    clientOrderId: 'safe-reconcile',
  });

  assert.equal(result.orderId, '42');
  assert.deepEqual(requests.map((item) => item.method), ['POST', 'GET']);
  const lookup = new URL(requests[1].url);
  assert.equal(lookup.searchParams.get('origClientOrderId'), 'wlsafe-reconcile');
});

test('Binance timestamp correction retries only once', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests++;
    if (new URL(String(url)).pathname === '/fapi/v1/time') {
      return new Response(JSON.stringify({ serverTime: Date.now() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ code: -1021, msg: 'Timestamp outside recvWindow' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  };

  const exchange = new BinanceExchange({ apiUrl: 'https://example.test', apiKey: 'key', apiSecret: 'secret' });
  await assert.rejects(exchange._request('GET', '/fapi/v3/account', {}, true), /-1021/);
  assert.equal(requests, 3);
});

test('Binance uses its dedicated dispatcher and preserves the diagnostic code', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requestOptions;
  globalThis.fetch = async (_url, options) => {
    requestOptions = options;
    const cause = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    throw new TypeError('fetch failed', { cause });
  };

  const exchange = new BinanceExchange({
    apiUrl: 'https://fapi.binance.com', apiKey: 'key', apiSecret: 'secret',
    proxy: 'http://user:password@127.0.0.1:7890',
  });
  await assert.rejects(exchange._request('GET', '/fapi/v1/time'), (error) => {
    assert.equal(error.diagnosticCode, 'ECONNRESET');
    assert.match(error.message, /fapi\.binance\.com/);
    assert.match(error.message, /HTTPS CONNECT/);
    assert.doesNotMatch(error.message, /user|password/);
    return true;
  });
  assert.ok(requestOptions.dispatcher);
  await exchange.setProxy('');
});
