import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createEnvView, validateEnvUpdate } from '../src/env-config.js';
import { GridBot } from '../src/bot.js';
import { publicExchangeManifest } from '../src/exchange/manifest.js';
import { floorOkx, okxBaseFromContracts, okxContractsFromBase, OkxExchange } from '../src/exchange/okx/okx.js';
import { OkxPaperExchange } from '../src/exchange/okx/paper.js';

test('OKX is manifest-driven and exposes API Key, Secret and Passphrase', () => {
  const definition = publicExchangeManifest().find((item) => item.key === 'ok');
  assert.equal(definition.name, 'OKX');
  assert.deepEqual(definition.networks, ['mainnet', 'testnet']);
  assert.ok(definition.fields.some((field) => field.env === 'OKX_PASSPHRASE' && field.secret));
  assert.equal(createEnvView({}).values.OKX_NETWORK, 'testnet');
  assert.throws(() => validateEnvUpdate({ OKX_MODE: 'live' }, {}), /OKX_API_KEY.*OKX_API_SECRET.*OKX_PASSPHRASE/);
});

test('OKX HMAC and exchange precision are deterministic', () => {
  const exchange = new OkxExchange({ apiSecret: 'secret' });
  const timestamp = '2026-08-20T00:00:00.000Z';
  assert.equal(exchange._signature(timestamp, 'GET', '/api/v5/account/balance'), createHmac('sha256', 'secret').update(`${timestamp}GET/api/v5/account/balance`).digest('base64'));
  assert.equal(floorOkx(1.234567, 0.001), 1.234);
  assert.equal(floorOkx(100.19, 0.1), 100.1);
  assert.equal(okxContractsFromBase(369, 10, 1), 36);
  assert.equal(okxBaseFromContracts(36, 10), 360);
});

test('OKX publishes derivative contract rules in base-asset units', async () => {
  const exchange = new OkxExchange();
  exchange._request = async (method, path) => {
    assert.equal(method, 'GET');
    assert.equal(path, '/api/v5/public/instruments');
    return [{
      instId: 'ONDO-USDT-SWAP', state: 'live', ctType: 'linear', settleCcy: 'USDT',
      ctVal: '10', ctValCcy: 'ONDO', lotSz: '1', minSz: '1', maxLmtSz: '100', tickSz: '0.0001', lever: '20',
    }];
  };

  await exchange._loadMarkets();

  assert.deepEqual(exchange.markets.get(1), {
    marketId: 1,
    name: 'ONDO-USDT-SWAP',
    displayName: 'ONDO/USDT',
    symbol: 'ONDO',
    exchangeSymbol: 'ONDO-USDT-SWAP',
    lastPrice: null,
    stepSize: 10,
    stepPrice: 0.0001,
    minOrderSize: 10,
    maxOrderSize: 1000,
    minNotional: 0,
    maxLeverage: 20,
    contractValue: 10,
    contractValueCurrency: 'ONDO',
    contractStepSize: 1,
    minContracts: 1,
    maxContracts: 100,
    settleCurrency: 'USDT',
  });
});

test('OKX converts requested base size to contracts and reports the normalized base size', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ code: '0', data: [{ ordId: 'ondo-1', sCode: '0' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const exchange = new OkxExchange({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass', positionMode: 'net_mode' });
  exchange.markets.set(1, {
    marketId: 1, exchangeSymbol: 'ONDO-USDT-SWAP', stepSize: 10, stepPrice: 0.0001, minOrderSize: 10,
    contractValue: 10, contractStepSize: 1, minContracts: 1,
  });

  const placed = await exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 0.36, sizeBase: 369, postOnly: true, clientOrderId: 'ondo-grid-1' });

  assert.equal(body.sz, '36');
  assert.equal(placed.sizeBase, 360);
  assert.equal(exchange.getOpenOrders(1)[0].sizeBase, 360);
});

test('OKX preflight uses settlement-currency available equity before live writes', async () => {
  const exchange = new OkxExchange();
  exchange.markets.set(1, { marketId: 1, exchangeSymbol: 'ONDO-USDT-SWAP', settleCurrency: 'USDT' });
  exchange.symbolToId.set('ONDO-USDT-SWAP', 1);
  exchange._request = async (method, path) => {
    assert.equal(method, 'GET');
    if (path === '/api/v5/account/balance') {
      return [{ totalEq: '1024.63', details: [{ ccy: 'USDT', cashBal: '1039.25', availEq: '700' }] }];
    }
    if (path === '/api/v5/account/positions') return [];
    throw new Error(`unexpected ${path}`);
  };

  await assert.rejects(
    () => exchange.preflightTrading(1, { risk: { requiredMargin: 735, notional: 2205 }, config: { leverage: 3 } }),
    /首单前.*735.*700.*USDT/,
  );
});

test('OKX converts live order and position quantities back to base assets', async () => {
  const exchange = new OkxExchange();
  exchange.markets.set(1, { marketId: 1, exchangeSymbol: 'ONDO-USDT-SWAP', contractValue: 10, settleCurrency: 'USDT' });
  exchange.symbolToId.set('ONDO-USDT-SWAP', 1);
  exchange._request = async (_method, path) => {
    if (path === '/api/v5/trade/orders-pending') return [{ ordId: '1', px: '0.36', side: 'buy', sz: '36' }];
    if (path === '/api/v5/account/balance') return [{ totalEq: '1000', details: [{ ccy: 'USDT', cashBal: '1000', availEq: '900' }] }];
    if (path === '/api/v5/account/positions') return [{ instId: 'ONDO-USDT-SWAP', posSide: 'short', pos: '36', avgPx: '0.36', upl: '2', lever: '3' }];
    throw new Error(`unexpected ${path}`);
  };

  assert.equal((await exchange.fetchOpenOrders(1))[0].sizeBase, 360);
  await exchange._refreshAccount();
  assert.equal(exchange.getPosition(1).sizeBase, -360);
  assert.equal(exchange.availableMargin, 900);
});

test('OKX live order sends signed post-only request and demo header', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(JSON.stringify({ code: '0', data: [{ ordId: 'okx-42', sCode: '0' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const exchange = new OkxExchange({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass', network: 'testnet', positionMode: 'net_mode' });
  exchange.markets.set(1, { marketId: 1, exchangeSymbol: 'BTC-USDT-SWAP', stepSize: 0.001, stepPrice: 0.1, minOrderSize: 0.001 });
  const result = await exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 100.19, sizeBase: 0.123456, postOnly: true, clientOrderId: 'grid-1' });
  assert.equal(result.orderId, 'okx-42');
  assert.equal(new URL(request.url).pathname, '/api/v5/trade/order');
  assert.equal(request.options.headers['OK-ACCESS-KEY'], 'key');
  assert.equal(request.options.headers['OK-ACCESS-PASSPHRASE'], 'pass');
  assert.equal(request.options.headers['x-simulated-trading'], '1');
  assert.deepEqual(JSON.parse(request.options.body), { instId: 'BTC-USDT-SWAP', tdMode: 'cross', side: 'buy', ordType: 'post_only', sz: '0.123', px: '100.1', reduceOnly: false, clOrdId: 'wlgrid1' });
});

test('OKX loads the account position mode before trading', async () => {
  const exchange = new OkxExchange({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass' });
  exchange._ensureDispatcher = async () => null;
  exchange._loadMarkets = async () => {};
  exchange._refreshAccount = async () => {};
  exchange._request = async (method, path) => {
    assert.equal(method, 'GET');
    assert.equal(path, '/api/v5/account/config');
    return [{ posMode: 'long_short_mode' }];
  };

  await exchange.init();
  exchange.stop();

  assert.equal(exchange.positionMode, 'long_short_mode');
});

test('OKX hedge mode maps open and close orders to the required position side', () => {
  const exchange = new OkxExchange({ positionMode: 'long_short_mode' });
  exchange.markets.set(1, { marketId: 1, exchangeSymbol: 'ONDO-USDT-SWAP', stepSize: 1, stepPrice: 0.0001, minOrderSize: 1 });
  const base = { marketId: 1, price: 0.36, sizeBase: 10, postOnly: true, clientOrderId: 'grid-1' };

  assert.deepEqual(
    [
      exchange._order({ ...base, side: 'buy', opening: true }).params,
      exchange._order({ ...base, side: 'sell', opening: true }).params,
      exchange._order({ ...base, side: 'sell', opening: false }).params,
      exchange._order({ ...base, side: 'buy', opening: false }).params,
    ].map(({ posSide, reduceOnly }) => ({ posSide, reduceOnly })),
    [
      { posSide: 'long', reduceOnly: undefined },
      { posSide: 'short', reduceOnly: undefined },
      { posSide: 'long', reduceOnly: undefined },
      { posSide: 'short', reduceOnly: undefined },
    ],
  );
});

test('OKX batch startup preserves client correlation and sends posSide for a long grid', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    return new Response(JSON.stringify({
      code: '0',
      data: body.map((row, index) => ({ ordId: `okx-${index + 1}`, clOrdId: row.clOrdId, sCode: '0', sMsg: '' })),
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const exchange = new OkxExchange({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass', positionMode: 'long_short_mode' });
  exchange.markets.set(1, {
    marketId: 1, displayName: 'ONDO/USDT', exchangeSymbol: 'ONDO-USDT-SWAP',
    stepSize: 1, stepPrice: 0.0001, minOrderSize: 1, maxLeverage: 20,
  });
  exchange.balance = 1000;
  exchange.equity = 1000;
  exchange.preflightTrading = async () => true;
  exchange.setLeverage = async () => true;
  exchange.cancelAll = async () => true;
  exchange.getPrice = async () => 0.36;
  exchange.start = () => {};
  const bot = new GridBot(exchange, { exchangeName: 'OKX' });

  const state = await bot.start({ marketId: 1, mode: 'long', lower: 0.35, upper: 0.39, gridCount: 16, sizeBase: 10, leverage: 3 });

  assert.equal(state.running, true);
  assert.equal(bot.active.size, 4);
  assert.equal(bodies.length, 1);
  assert.ok(bodies[0].every((order) => order.side === 'buy' && order.posSide === 'long'));
  assert.ok(bodies[0].every((order) => !Object.hasOwn(order, 'reduceOnly')));
  assert.equal(bot.alerts.some((item) => /返回订单数不完整|51000/.test(item.message)), false);
});

test('OKX hedge close-position closes every live position side explicitly', async () => {
  const exchange = new OkxExchange({ positionMode: 'long_short_mode' });
  exchange.markets.set(1, { marketId: 1, exchangeSymbol: 'ONDO-USDT-SWAP' });
  const writes = [];
  exchange._request = async (method, path, params) => {
    if (method === 'GET') {
      assert.equal(path, '/api/v5/account/positions');
      return [
        { instId: 'ONDO-USDT-SWAP', posSide: 'long', pos: '10' },
        { instId: 'ONDO-USDT-SWAP', posSide: 'short', pos: '3' },
      ];
    }
    writes.push({ path, params });
    return [{ sCode: '0' }];
  };

  await exchange.closePosition(1);

  assert.deepEqual(writes.map((item) => item.params.posSide), ['long', 'short']);
  assert.ok(writes.every((item) => item.path === '/api/v5/trade/close-position'));
});

test('OKX partial batch errors expose confirmed orders for startup cleanup', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      code: '0',
      data: [
        { ordId: 'okx-1', clOrdId: body[0].clOrdId, sCode: '0', sMsg: '' },
        { ordId: '', clOrdId: body[1].clOrdId, sCode: '51000', sMsg: 'Parameter posSide error' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const exchange = new OkxExchange({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass', positionMode: 'long_short_mode' });
  exchange.markets.set(1, { marketId: 1, exchangeSymbol: 'ONDO-USDT-SWAP', stepSize: 1, stepPrice: 0.0001, minOrderSize: 1 });
  const orders = [
    { marketId: 1, side: 'buy', price: 0.35, sizeBase: 10, opening: true, clientOrderId: '101' },
    { marketId: 1, side: 'buy', price: 0.34, sizeBase: 10, opening: true, clientOrderId: '102' },
  ];

  await assert.rejects(
    () => exchange.placeLimitOrders(orders),
    (error) => error.exchangeCode === '51000'
      && error.partialOrders?.length === 1
      && error.partialOrders[0].orderId === 'okx-1'
      && error.partialOrders[0].clientOrderId === '101',
  );
});

test('OKX paper mode keeps OKX markets when the public endpoint is unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  const exchange = new OkxPaperExchange({ startBalance: 10000 });
  await exchange.init(); exchange.stop();
  assert.equal((await exchange.getMarkets())[0].exchangeSymbol, 'BTC-USDT-SWAP');
  assert.equal(exchange.dataSource, 'synthetic');
});
