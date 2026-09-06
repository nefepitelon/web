import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createEnvView, validateEnvUpdate } from '../src/env-config.js';
import { publicExchangeManifest } from '../src/exchange/manifest.js';
import { OndoPerpsExchange, floorToStep, signOndoRequest } from '../src/exchange/ondo/ondo.js';

function market() {
  return {
    marketId: 1,
    name: 'AAPL-USD.P',
    displayName: 'AAPL/USD',
    symbol: 'AAPL',
    exchangeSymbol: 'AAPL-USD.P',
    stepSize: 0.01,
    stepPrice: 0.01,
    minOrderSize: 0.01,
    maxOrderSize: 100,
    maxLeverage: 20,
  };
}

test('Ondo quantity and price flooring follows market increments', () => {
  assert.equal(floorToStep(1.239, 0.01), 1.23);
  assert.equal(floorToStep(305.559, 0.01), 305.55);
});

test('Ondo request signing follows timestamp + method + path + body HMAC', () => {
  const input = {
    timestamp: '1700000000000',
    method: 'POST',
    requestPath: '/v1/perps/orders',
    body: '{"market":"AAPL-USD.P"}',
    secret: 'ondoApiSecret_test',
  };
  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}${input.method}${input.requestPath}${input.body}`)
    .digest('hex');
  assert.equal(signOndoRequest(input), expected);
});

test('Ondo is manifest-driven, defaults to sandbox and masks both credentials', () => {
  const definition = publicExchangeManifest().find((item) => item.key === 'op');
  assert.equal(definition.name, 'Ondo Perps');
  assert.equal(definition.defaultNetwork, 'testnet');
  assert.equal(definition.healthPath, '/status');
  assert.deepEqual(definition.networks, ['mainnet', 'testnet']);
  assert.ok(definition.capabilities.includes('实盘 HMAC'));
  assert.equal(createEnvView({}).values.ONDO_NETWORK, 'testnet');
  assert.throws(() => validateEnvUpdate({ ONDO_MODE: 'live' }, {}), /ONDO_KEY_ID.*ONDO_API_SECRET/);
  const view = createEnvView({ ONDO_KEY_ID: 'ondoKeyId_123456', ONDO_API_SECRET: 'ondoApiSecret_abcdef' });
  assert.equal(view.secrets.ONDO_KEY_ID, '••••3456');
  assert.equal(view.secrets.ONDO_API_SECRET, '••••cdef');
  assert.doesNotMatch(JSON.stringify(view), /ondoApiSecret_abcdef/);
});

test('Ondo loads the official nested market response and precision', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    const result = path.endsWith('/v1/markets')
      ? { perps: { tradingPairs: [{ market:'AAPL-USD.P', displayName:'AAPLUSD', longName:'Apple', pair:{base:'AAPL',quote:'USD'}, baseIncrement:'0.01', quoteIncrement:'0.01', maxPositionBaseSize:'100', defaultLeverage:'20', marginInfo:[{maxLeverage:'20'}], makerFee:'0.00015', takerFee:'0.00035', tags:['Stock'] }] } }
      : [{ market:'AAPL-USD.P', lastPrice:'305.55', disabled:false, isClosed:false }];
    return new Response(JSON.stringify({ success:true, result }), { status:200, headers:{'content-type':'application/json'} });
  };
  const exchange = new OndoPerpsExchange({ apiUrl:'https://api.example.test', keyId:'id', apiSecret:'secret' });
  await exchange._loadMarkets();
  const loaded = (await exchange.getMarkets())[0];
  assert.equal(loaded.exchangeSymbol, 'AAPL-USD.P');
  assert.equal(loaded.displayName, 'AAPL/USD');
  assert.equal(loaded.stepSize, 0.01);
  assert.equal(loaded.maxLeverage, 20);
  assert.equal(loaded.lastPrice, 305.55);
});

test('Ondo live order signs exact JSON body and reconciles an unknown POST once', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  t.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow; });
  Date.now = () => 1700000000000;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url:String(url), options });
    if (requests.length === 1) throw new TypeError('connection reset after write');
    return new Response(JSON.stringify({ success:true, result:{ orderId:'ondo-42' } }), { status:200, headers:{'content-type':'application/json'} });
  };
  const exchange = new OndoPerpsExchange({ apiUrl:'https://api.example.test', keyId:'ondoKeyId_key', apiSecret:'ondoApiSecret_secret' });
  exchange.markets.set(1, market());
  const result = await exchange.placeLimitOrder({ marketId:1, side:'buy', price:305.559, sizeBase:1.239, postOnly:true, clientOrderId:'grid/1' });
  assert.equal(result.orderId, 'ondo-42');
  assert.deepEqual(requests.map((item) => item.options.method), ['POST', 'GET']);
  const body = requests[0].options.body;
  const parsed = JSON.parse(body);
  assert.equal(parsed.price, '305.55');
  assert.equal(parsed.size, '1.23');
  assert.equal(parsed.clientOrderId, 'wl_grid1');
  assert.equal(requests[0].options.headers['ONDO-KEY-ID'], 'ondoKeyId_key');
  assert.equal(requests[0].options.headers['ONDO-TIMESTAMP'], '1700000000000');
  const expected = signOndoRequest({ timestamp:'1700000000000', method:'POST', requestPath:'/v1/perps/orders', body, secret:'ondoApiSecret_secret' });
  assert.equal(requests[0].options.headers['ONDO-SIGN'], expected);
  assert.match(new URL(requests[1].url).pathname, /\/v1\/perps\/orders\/client:wl_grid1$/);
});

test('Ondo seeds large grids through the official max-20 batch endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const batchSizes = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(String(url)).pathname, '/v1/perps/orders/batch');
    const body = JSON.parse(options.body);
    batchSizes.push(body.orders.length);
    return new Response(JSON.stringify({
      success: true,
      result: {
        addedOrders: body.orders.map((order, index) => ({
          ...order, orderId: `batch-${batchSizes.length}-${index}`, status: 'open',
        })),
        failedOrders: [],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  let now = 20_000;
  const exchange = new OndoPerpsExchange({
    apiUrl: 'https://api.example.test', keyId: 'id', apiSecret: 'secret', orderGapMs: 250,
    now: () => now, sleep: async (ms) => { now += ms; },
  });
  exchange.markets.set(1, market());
  const orders = Array.from({ length: 45 }, (_, index) => ({
    marketId: 1, side: index % 2 ? 'sell' : 'buy', price: 300 + index * 0.01,
    sizeBase: 0.1, clientOrderId: `grid-${index}`, levelIndex: index,
  }));
  const result = await exchange.placeLimitOrders(orders);
  assert.deepEqual(batchSizes, [20, 20, 5]);
  assert.equal(result.placed.length, 45);
  assert.equal(result.failed.length, 0);
  assert.equal(exchange.getOpenOrders(1).length, 45);
  assert.deepEqual(
    result.placed.map((row) => row.clientOrderId),
    orders.map((order) => String(order.clientOrderId)),
    'batch results must preserve the caller client ids used by GridBot correlation',
  );
  assert.ok(result.placed.every((row) => row.exchangeClientOrderId.startsWith('wl_')));
});

test('Ondo correlates the official batch ApiOrder response when clientOrderId is omitted', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      success: true,
      result: {
        addedOrders: body.orders.map((order, index) => ({
          orderId: `official-${index}`,
          market: order.market,
          side: order.side,
          price: Number(order.price),
          size: Number(order.size),
          status: 'open',
        })),
        failedOrders: [],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const exchange = new OndoPerpsExchange({
    apiUrl: 'https://api.example.test', keyId: 'id', apiSecret: 'secret', orderGapMs: 250,
  });
  exchange.markets.set(1, market());
  const result = await exchange.placeLimitOrders(Array.from({ length: 10 }, (_, index) => ({
    marketId: 1,
    side: index % 2 ? 'sell' : 'buy',
    price: 300 + index * 0.01,
    sizeBase: 0.1,
    clientOrderId: `official-grid-${index}`,
    levelIndex: index,
  })));
  assert.equal(result.placed.length, 10);
  assert.equal(result.failed.length, 0);
  assert.equal(exchange.getOpenOrders(1).length, 10);
  assert.equal(requests.length, 1, 'successful response must not trigger duplicate writes or unnecessary reconciliation');
  assert.deepEqual(result.placed.map((row) => row.clientOrderId), Array.from({ length: 10 }, (_, index) => `official-grid-${index}`));
  assert.deepEqual(result.placed.map((row) => row.exchangeClientOrderId), Array.from({ length: 10 }, (_, index) => `wl_official-grid-${index}`));
});

test('Ondo confirms omitted batch results by clientOrderId without replaying the write', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const methods = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url));
    methods.push(options.method);
    if (options.method === 'POST') {
      return new Response(JSON.stringify({ success: true, result: { addedOrders: [], failedOrders: [] } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    const clientOrderId = decodeURIComponent(parsed.pathname.split('client:')[1]);
    return new Response(JSON.stringify({ success: true, result: {
      orderId: `confirmed-${clientOrderId}`, clientOrderId, status: 'open',
    } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  let now = 40_000;
  const exchange = new OndoPerpsExchange({
    apiUrl: 'https://api.example.test', keyId: 'id', apiSecret: 'secret', orderGapMs: 250,
    now: () => now, sleep: async (ms) => { now += ms; },
  });
  exchange.markets.set(1, market());
  const result = await exchange.placeLimitOrders([
    { marketId: 1, side: 'buy', price: 304, sizeBase: 0.1, clientOrderId: 'confirm-a', levelIndex: 1 },
    { marketId: 1, side: 'sell', price: 306, sizeBase: 0.1, clientOrderId: 'confirm-b', levelIndex: 2 },
  ]);
  assert.deepEqual(methods, ['POST', 'GET', 'GET']);
  assert.equal(result.placed.length, 2);
  assert.equal(result.failed.length, 0);
  assert.equal(exchange.getOpenOrders(1).length, 2);
});

test('Ondo batch placement backs off and retries an explicit account rate limit', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls++;
    if (calls === 1) {
      return new Response(JSON.stringify({ success: false, error: 'Rate limited for account', error_code: 'too_many_requests' }), {
        status: 429, headers: { 'content-type': 'application/json', 'retry-after': '2' },
      });
    }
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({ success: true, result: {
      addedOrders: body.orders.map((order) => ({ ...order, orderId: 'retried-1', status: 'open' })), failedOrders: [],
    } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  let now = 30_000;
  const waits = [];
  const exchange = new OndoPerpsExchange({
    apiUrl: 'https://api.example.test', keyId: 'id', apiSecret: 'secret', orderGapMs: 250,
    now: () => now, sleep: async (ms) => { waits.push(ms); now += ms; },
  });
  exchange.markets.set(1, market());
  const result = await exchange.placeLimitOrders([{
    marketId: 1, side: 'buy', price: 305, sizeBase: 0.1, clientOrderId: 'rate-grid', levelIndex: 1,
  }]);
  assert.equal(result.placed.length, 1);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [2000]);
});
