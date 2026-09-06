import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvView, validateEnvUpdate } from '../src/env-config.js';
import { publicExchangeManifest } from '../src/exchange/manifest.js';
import { GrvtExchange } from '../src/exchange/grvt/grvt.js';
import { GrvtPaperExchange } from '../src/exchange/grvt/paper.js';
import { GridBot } from '../src/bot.js';
import BigNumber from 'bignumber.js';

const PRIVATE_KEY = `0x${'11'.repeat(32)}`;

test('GRVT is manifest-driven and requires the three live credentials', () => {
  const definition = publicExchangeManifest().find((item) => item.key === 'gv');
  assert.equal(definition.name, 'GRVT');
  assert.equal(definition.chain, 'GRVT L2 · Perpetuals');
  assert.deepEqual(definition.networks, ['mainnet', 'testnet']);
  assert.equal(definition.networks.includes('mainnet'), true);
  assert.equal(createEnvView({}).values.GRVT_NETWORK, 'testnet');
  assert.throws(() => validateEnvUpdate({ GRVT_MODE: 'live' }, {}), /GRVT_API_KEY.*GRVT_PRIVATE_KEY.*GRVT_SUB_ACCOUNT_ID/);
});

test('GRVT API-key login sends the routing cookie and adopts its authenticated trading account', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requestHeaders;
  globalThis.fetch = async (_url, options) => {
    requestHeaders = options.headers;
    return new Response(JSON.stringify({ status: 'success', sub_account_id: '42' }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'set-cookie': 'gravity=session; Path=/' },
    });
  };
  const exchange = new GrvtExchange({ apiKey: 'test-api-key', authUrl: 'https://edge.grvt.io', subaccount: 'wrong-local-value' });

  await exchange._login();

  assert.equal(requestHeaders.Cookie, 'rm=true;');
  assert.equal(exchange.accountId, '42');
  assert.equal(exchange.subaccount, '42');
  assert.match(exchange.cookie, /^gravity=session/);
});

test('GRVT account initialization uses the current account_summary endpoint', async () => {
  const exchange = new GrvtExchange({ subaccount: '42' });
  let requestedPath = '';
  exchange._post = async (_base, path) => {
    requestedPath = path;
    return { total_equity: '123.45', available_balance: '100', positions: [] };
  };
  await exchange._refreshAccount();
  assert.equal(requestedPath, '/full/v1/account_summary');
  assert.equal(exchange.equity, 123.45);
  assert.equal(exchange.balance, 100);
});

test('GRVT HTTP errors identify the safe host and path', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response('', { status: 404, statusText: 'Not Found' });
  const exchange = new GrvtExchange();
  await assert.rejects(
    exchange._raw('https://trades.grvt.io/full/v1/account_summary', {}),
    /404 \[POST trades\.grvt\.io\/full\/v1\/account_summary\]: Not Found/,
  );
});

test('GRVT public market and ticker responses map official fields', async () => {
  const exchange = new GrvtExchange({ network: 'testnet' });
  exchange._post = async (_base, path) => path.endsWith('all_instruments') ? [{
    instrument: 'BTC_USDT_Perp', instrument_hash: '123', base: 'BTC', quote: 'USDT',
    base_decimals: 3, quote_decimals: 6, tick_size: '0.1', min_size: '0.001', max_position_size: '100', min_notional: '5',
  }] : { mark_price: '65000.5' };
  await exchange._loadMarkets();
  const market = (await exchange.getMarkets())[0];
  assert.equal(market.exchangeSymbol, 'BTC_USDT_Perp');
  assert.equal(market.stepSize, 0.001);
  assert.equal(await exchange.getPrice(market.marketId), 65000.5);
});

test('GRVT order is signed locally with the official EIP-712 shape', async () => {
  const exchange = new GrvtExchange({ network: 'testnet', privateKey: PRIVATE_KEY, subaccount: '42' });
  exchange.account = (await import('viem/accounts')).privateKeyToAccount(PRIVATE_KEY);
  exchange.markets.set(1, { marketId: 1, exchangeSymbol: 'BTC_USDT_Perp', instrumentHash: '123', baseDecimals: 3, stepSize: '0.001', stepPrice: 0.1 });
  const order = await exchange._signedOrder({ marketId: 1, side: 'buy', price: 65000.5, sizeBase: 0.125, postOnly: true, clientOrderId: '77' });
  assert.equal(order.sub_account_id, '42');
  assert.equal(order.legs[0].instrument, 'BTC_USDT_Perp');
  assert.equal(order.legs[0].is_buying_asset, true);
  assert.equal(order.signature.signer, exchange.account.address);
  assert.match(order.signature.r, /^0x[0-9a-f]{64}$/i);
  assert.equal(order.signature.v === 27 || order.signature.v === 28, true);
});

test('GRVT paper mode keeps GRVT markets when public data is unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  const exchange = new GrvtPaperExchange({ startBalance: 10000 });
  await exchange.init(); exchange.stop();
  assert.equal((await exchange.getMarkets())[0].exchangeSymbol, 'BTC_USDT_Perp');
  assert.equal(exchange.dataSource, 'synthetic');
});

// Public XPL instrument rules from GRVT mainnet; no live credentials or writes.
const XPL = {
  instrument: 'XPL_USDT_Perp', instrument_hash: '0x034401', base: 'XPL', quote: 'USDT',
  base_decimals: 6, quote_decimals: 6, tick_size: '0.0001', min_size: '1.0', min_notional: '5.0',
};

async function xplFixture({ failAt = 0, responseId = '0x00', price = '0.0825' } = {}) {
  const exchange = new GrvtExchange({ subaccount: '42', sleep: async () => {} });
  const account = (await import('viem/accounts')).privateKeyToAccount(PRIVATE_KEY);
  const signed = [];
  const submitted = [];
  const book = new Map();
  const cancelRequests = [];
  let cancellations = 0;
  exchange.account = {
    address: account.address,
    signTypedData: async (data) => { signed.push(data); return account.signTypedData(data); },
  };
  exchange.orderGapMs = 0;
  exchange.start = () => {};
  exchange._post = async (_base, path, body) => {
    if (path.endsWith('all_instruments')) return [XPL];
    if (path.endsWith('account_summary')) return { total_equity: '58.8', available_balance: '58.8', positions: [] };
    if (path.endsWith('ticker')) return { mark_price: price };
    if (path.endsWith('open_orders')) return [...book.values()];
    if (path.endsWith('cancel_all_orders')) { cancellations++; book.clear(); return {}; }
    if (path.endsWith('cancel_order')) {
      cancelRequests.push(body);
      for (const [key, order] of book) {
        if (key === body.client_order_id || order.order_id === body.order_id) book.delete(key);
      }
      return {};
    }
    if (path.endsWith('set_initial_leverage')) return {};
    if (path.endsWith('create_order')) {
      const leg = body.order.legs[0];
      assert.equal(new BigNumber(leg.limit_price).mod(XPL.tick_size).isZero(), true, 'GRVT 2064: Invalid limit price tick');
      assert.equal(new BigNumber(leg.size).mod(XPL.min_size).isZero(), true, 'GRVT 2065: Order size too granular');
      const signedLeg = signed.at(-1).message.legs[0];
      assert.equal(signedLeg.limitPrice.toString(), new BigNumber(leg.limit_price).shiftedBy(9).toFixed(0));
      assert.equal(signedLeg.contractSize.toString(), new BigNumber(leg.size).shiftedBy(6).toFixed(0));
      if (failAt && submitted.length + 1 === failAt) throw new Error('simulated GRVT rejection');
      submitted.push(body.order);
      const actualId = `0x${(0xabc00 + submitted.length).toString(16)}`;
      book.set(body.order.metadata.client_order_id, { ...body.order, order_id: actualId });
      // GRVT create_order returns a placeholder; open_orders has the real ID.
      return { ...body.order, order_id: responseId === 'real' ? actualId : responseId };
    }
    throw new Error(`Unexpected endpoint in offline fixture: ${path}`);
  };
  await exchange._loadMarkets();
  await exchange._refreshAccount();
  return { exchange, signed, submitted, book, cancelRequests, cancellations: () => cancellations };
}

test('GRVT signs the tick/lot-aligned decimal strings sent on the wire', async () => {
  const { exchange, signed } = await xplFixture();
  const market = (await exchange.getMarkets())[0];
  assert.equal(market.baseDecimals, 6, 'signing units are not the order lot size');
  assert.equal(market.stepSize, 1, 'intelligent sizing must use the exchange lot size');
  for (const [side, expected] of [['buy', '0.0779'], ['sell', '0.078']]) {
    const order = await exchange._signedOrder({ marketId: 1, side, price: 0.0779438, sizeBase: 93.432203 });
    assert.equal(order.legs[0].limit_price, expected);
    assert.equal(order.legs[0].size, '93');
    assert.equal(signed.at(-1).message.legs[0].limitPrice.toString(), new BigNumber(expected).shiftedBy(9).toFixed(0));
    assert.equal(signed.at(-1).message.legs[0].contractSize, 93000000n);
  }
});

test('GRVT handles non-power-of-ten ticks and exact uint64 signing without Number rounding', async () => {
  const { exchange, signed } = await xplFixture();
  exchange.markets.set(2, { marketId: 2, exchangeSymbol: 'TEST_USDT_Perp', instrumentHash: '123', baseDecimals: -1, stepSize: '10', stepPrice: '0.25' });
  const order = await exchange._signedOrder({ marketId: 2, side: 'sell', price: '1.013', sizeBase: '39' });
  assert.equal(order.legs[0].limit_price, '1.25');
  assert.equal(order.legs[0].size, '30');
  assert.equal(signed.at(-1).message.legs[0].contractSize, 3n);
  exchange.markets.set(3, { marketId: 3, exchangeSymbol: 'TEST_USDT_Perp', instrumentHash: '123', baseDecimals: 6, stepSize: '1e-6', stepPrice: '1e-9' });
  const precise = await exchange._signedOrder({ marketId: 3, side: 'buy', price: '12345678.123456789', sizeBase: '1.013001' });
  assert.equal(precise.legs[0].limit_price, '12345678.123456789');
  assert.equal(signed.at(-1).message.legs[0].limitPrice, 12345678123456789n);
});

test('GRVT validates the entire batch before submitting any order', async () => {
  const { exchange, submitted } = await xplFixture();
  await assert.rejects(() => exchange.placeLimitOrders([
    { marketId: 1, side: 'buy', price: 0.08, sizeBase: 100 },
    { marketId: 1, side: 'buy', price: 0.00001, sizeBase: 100 },
  ]), /价格/);
  assert.equal(submitted.length, 0);
});

test('GRVT rejects invalid limits locally and keeps market closes reduce-only with zero signed price', async () => {
  const { exchange, signed, submitted } = await xplFixture();
  for (const [fields, message] of [
    [{ sizeBase: 0.1 }, /最小数量/],
    [{ sizeBase: 1 }, /最小金额/],
    [{ price: NaN }, /价格/],
    [{ side: 'invalid' }, /方向/],
    [{ sizeBase: '18446744073709551616' }, /uint64/],
  ]) {
    await assert.rejects(() => exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 0.08, sizeBase: 100, ...fields }), message);
  }
  assert.equal(submitted.length, 0);
  assert.equal(signed.length, 0);
  await assert.rejects(() => exchange._signedOrder({ marketId: 1, side: 'sell', sizeBase: '0.000001', reduceOnly: true }, true), /最小数量步长/);
  const close = await exchange._signedOrder({ marketId: 1, side: 'sell', sizeBase: '93', reduceOnly: true }, true);
  assert.equal(close.legs[0].limit_price, '0');
  assert.equal(close.legs[0].size, '93');
  assert.equal(close.time_in_force, 'IMMEDIATE_OR_CANCEL');
  assert.equal(close.post_only, false);
  assert.equal(close.reduce_only, true);
  assert.equal(signed.at(-1).message.legs[0].limitPrice, 0n);
});

const xplConfig = { marketId: 1, mode: 'neutral', lower: 0.0781991, upper: 0.0870009, gridCount: 16, sizeBase: 93.432203, leverage: 3 };

test('GRVT XPL grid startup tracks every aligned seed, and replacement uses the same precision rules', async () => {
  const { exchange, submitted } = await xplFixture();
  const bot = new GridBot(exchange, { exchangeName: 'GRVT' });
  bot._startReconcileTimer = () => {};
  const state = await bot.start(xplConfig);
  assert.equal(state.running, true);
  assert.ok(submitted.length >= 16);
  assert.equal(bot.active.size, submitted.length);
  for (const [id, active] of bot.active) {
    const tracked = exchange.getOpenOrders(1).find((order) => order.orderId === id);
    assert.equal(active.price, tracked.price);
    assert.equal(active.sizeBase, tracked.sizeBase);
    assert.equal(active.sizeBase, 93, 'track actual whole-lot size, not the unrounded input');
  }
  const [id, first] = bot.active.entries().next().value;
  bot.active.delete(id);
  assert.equal(await bot._place({ ...first, price: 0.08301234, side: 'sell', opening: false }), true);
  assert.equal(submitted.at(-1).legs[0].limit_price, '0.0831');
  assert.equal([...bot.active.values()].at(-1).price, 0.0831);
  assert.equal([...bot.active.values()].at(-1).sizeBase, 93);
});

test('GRVT floors lots independently of signing decimals, including non-power-of-ten steps', async () => {
  const { exchange, signed } = await xplFixture();
  for (const [lot, input, expected] of [
    ['1', '93.432203', '93'], ['1', '93', '93'], ['0.001', '0.125678', '0.125'],
    ['0.05', '1.149999', '1.1'], ['0.05', '1.15', '1.15'], ['10', '39.999999', '30'],
    ['1e-5', '0.123456', '0.12345'],
  ]) {
    exchange.markets.set(2, { marketId: 2, exchangeSymbol: 'TEST_USDT_Perp', instrumentHash: '123', baseDecimals: 9, stepSize: lot, stepPrice: '0.1' });
    for (const side of ['buy', 'sell']) {
      const order = await exchange._signedOrder({ marketId: 2, side, price: '10000', sizeBase: input });
      assert.equal(order.legs[0].size, expected);
      assert.ok(new BigNumber(expected).lte(input), 'never increase the requested exposure');
      assert.ok(new BigNumber(expected).mod(lot).isZero());
      assert.equal(signed.at(-1).message.legs[0].contractSize.toString(), new BigNumber(expected).shiftedBy(9).toFixed(0));
    }
  }
});

test('GRVT fails closed for absent or invalid lot rules and rechecks notional after rounding', async () => {
  const { exchange, signed } = await xplFixture();
  for (const stepSize of [undefined, 0, -1, 'NaN', 'Infinity', '0.0000001']) {
    exchange.markets.set(2, { marketId: 2, exchangeSymbol: 'TEST_USDT_Perp', instrumentHash: '123', baseDecimals: 6, stepSize, stepPrice: '0.1' });
    await assert.rejects(() => exchange._signedOrder({ marketId: 2, side: 'buy', price: 100, sizeBase: 1 }), /步长|精度/);
  }
  // 62.9 * 0.08 exceeds 5, but the valid 62-XPL order does not.
  await assert.rejects(() => exchange._signedOrder({ marketId: 1, side: 'buy', price: 0.08, sizeBase: 62.9 }), /最小金额/);
  await assert.rejects(() => exchange.placeLimitOrders([
    { marketId: 1, side: 'buy', price: 0.08, sizeBase: 93.432203 },
    { marketId: 1, side: 'sell', price: 0.09, sizeBase: 0.9 },
  ]), /最小数量步长/);
  assert.equal(signed.length, 0, 'all batch validation must finish before signing or submitting');
});

test('GRVT partial seed failure exposes accepted orders so GridBot cancels them', async () => {
  const fixture = await xplFixture({ failAt: 2 });
  const bot = new GridBot(fixture.exchange, { exchangeName: 'GRVT' });
  await assert.rejects(() => bot.start(xplConfig), /本次已挂出的订单已尝试撤销/);
  assert.equal(fixture.submitted.length, 1);
  assert.equal(fixture.cancellations(), 2);
  assert.equal(bot.running, false);
  assert.equal(bot.active.size, 0);
  assert.equal(fixture.exchange.getOpenOrders(1).length, 0);
  assert.equal(fixture.book.size, 0);
});

test('GRVT screenshot startup counts 16 placeholder acknowledgements as 16 distinct client orders', async () => {
  const fixture = await xplFixture({ price: '0.0833' });
  const bot = new GridBot(fixture.exchange, { exchangeName: 'GRVT' });
  bot._startReconcileTimer = () => {};
  const state = await bot.start({ ...xplConfig, lower: 0.0794149, upper: 0.0871851, sizeBase: 92 });
  assert.equal(state.running, true);
  assert.equal(fixture.submitted.length, 16);
  assert.equal(bot.active.size, 16);
  assert.equal(fixture.exchange.getOpenOrders(1).length, 16);
  assert.equal(fixture.cancellations(), 1, 'do not cancel a successfully acknowledged ladder');
  assert.equal(bot.alerts.some(x => /成功 1\/16|返回订单数不完整/.test(x.message)), false);

  const ids = [...bot.active.keys()];
  assert.ok(ids.every(id => id.startsWith('grvt-client:')));
  assert.deepEqual((await fixture.exchange.fetchOpenOrders(1)).map(x => x.orderId), ids);
  await fixture.exchange._poll();
  await bot.reconcileOpenOrders();
  assert.deepEqual([...bot.active.keys()], ids, 'real exchange IDs must not replace the stable local IDs');
  assert.equal(fixture.exchange.getOpenOrders(1).length, 16);
  assert.equal(fixture.cancelRequests.length, 0, 'ID reconciliation must not cancel valid orders');
  assert.equal(fixture.submitted.length, 16, 'read-only reconciliation must not re-submit orders');
  fixture.exchange._tracked.clear();
  assert.deepEqual((await fixture.exchange.fetchOpenOrders(1)).map(x => x.orderId), ids, 'client references survive loss of the adapter cache');
});

test('GRVT cancels placeholder-backed orders by client ID before and after snapshot adoption', async () => {
  const fixture = await xplFixture();
  const first = await fixture.exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 0.08, sizeBase: 93, clientOrderId: '18446744073709551614' });
  const second = await fixture.exchange.placeLimitOrder({ marketId: 1, side: 'sell', price: 0.09, sizeBase: 93, clientOrderId: '18446744073709551615' });
  assert.notEqual(first.orderId, second.orderId);
  await fixture.exchange.cancelOrder(1, first.orderId);
  assert.deepEqual(fixture.cancelRequests[0], { sub_account_id: '42', client_order_id: first.clientOrderId });
  assert.equal(fixture.book.size, 1);

  const restored = (await xplFixture()).exchange;
  restored._post = fixture.exchange._post;
  // GridBot persists its orderId but does not persist adapter-private metadata.
  restored.adoptOrder({ orderId: second.orderId, marketId: 1, side: 'sell', price: 0.09, sizeBase: 93 });
  const live = await restored.fetchOpenOrders(1);
  assert.equal(live[0].orderId, second.orderId);
  assert.equal(live[0].clientOrderId, second.clientOrderId);
  assert.match(live[0].exchangeOrderId, /^0xabc/);
  await restored.cancelOrder(1, second.orderId);
  assert.deepEqual(fixture.cancelRequests[1], { sub_account_id: '42', client_order_id: second.clientOrderId });
  assert.equal(fixture.book.size, 0);
});

test('GRVT supports real create IDs and legacy real-ID tracking without using zero IDs for cancellation', async () => {
  const fixture = await xplFixture({ responseId: 'real' });
  const order = await fixture.exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 0.08, sizeBase: 93, clientOrderId: '123' });
  assert.match(order.exchangeOrderId, /^0xabc/);
  assert.equal((await fixture.exchange.fetchOpenOrders(1))[0].orderId, order.orderId);
  fixture.exchange._tracked.clear();
  fixture.exchange.adoptOrder({ orderId: order.exchangeOrderId, marketId: 1, side: 'buy', price: 0.08, sizeBase: 93 });
  assert.equal((await fixture.exchange.fetchOpenOrders(1))[0].orderId, order.exchangeOrderId);
  await fixture.exchange.cancelOrder(1, order.exchangeOrderId);
  assert.equal(fixture.book.size, 0);
  for (const id of ['0x00', '0x000000', '0', '', 'undefined']) {
    await assert.rejects(() => fixture.exchange.cancelOrder(1, id), /订单标识/);
  }
  assert.equal(fixture.cancelRequests.length, 1);
});

test('GRVT rejects duplicate client IDs before submitting a batch', async () => {
  const fixture = await xplFixture();
  const order = { marketId: 1, side: 'buy', price: 0.08, sizeBase: 93, clientOrderId: '123' };
  await assert.rejects(() => fixture.exchange.placeLimitOrders([order, { ...order, price: 0.081 }]), /重复/);
  assert.equal(fixture.submitted.length, 0);
  assert.equal(fixture.signed.length, 0);
  await fixture.exchange.placeLimitOrder(order);
  await assert.rejects(() => fixture.exchange.placeLimitOrder(order), /重复/);
  assert.equal(fixture.submitted.length, 1);
});

test('GRVT malformed open-order snapshots do not silently erase tracked identities', async () => {
  const fixture = await xplFixture();
  const order = await fixture.exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 0.08, sizeBase: 93 });
  const originalPost = fixture.exchange._post;
  for (const malformed of [{}, [{ order_id: '0x00', legs: [{ instrument: XPL.instrument }] }]]) {
    fixture.exchange._post = async (base, path, ...args) => path.endsWith('open_orders') ? malformed : originalPost(base, path, ...args);
    await assert.rejects(() => fixture.exchange.fetchOpenOrders(1), /快照|订单标识/);
    assert.equal(fixture.exchange.getOpenOrders(1)[0].orderId, order.orderId);
  }
});

test('GRVT ambiguous first acknowledgement triggers cleanup without claiming no order was submitted', async () => {
  const fixture = await xplFixture();
  const originalPost = fixture.exchange._post;
  fixture.exchange._post = async (base, path, ...args) => {
    const result = await originalPost(base, path, ...args);
    return path.endsWith('create_order') ? {} : result;
  };
  const bot = new GridBot(fixture.exchange, { exchangeName: 'GRVT' });
  await assert.rejects(() => bot.start(xplConfig), (error) => {
    assert.equal(error.statusUnknown, true);
    assert.match(error.message, /结果未确认/);
    assert.doesNotMatch(error.message, /未挂出任何初始订单/);
    return true;
  });
  assert.equal(fixture.submitted.length, 1, 'never retry an ambiguous creation');
  assert.equal(fixture.cancellations(), 2);
  assert.equal(fixture.book.size, 0);
  assert.equal(bot.running, false);
  assert.equal(bot.active.size, 0);
});

test('GRVT transport unwraps the official placeholder acknowledgement and sends cancellation by client ID', async (t) => {
  const fixture = await xplFixture();
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  fixture.exchange.cookie = 'gravity=test';
  fixture.exchange.accountId = 'test-account';
  fixture.exchange._post = GrvtExchange.prototype._post;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['X-Grvt-Account-Id'], 'test-account');
    if (url.endsWith('/create_order')) return Response.json({ result: { ...body.order, order_id: '0x00' } });
    if (url.endsWith('/cancel_order')) return Response.json({ result: { ack: true } });
    throw new Error('unexpected offline transport request');
  };
  const result = await fixture.exchange.placeLimitOrders([
    { marketId: 1, side: 'buy', price: 0.08, sizeBase: 93, clientOrderId: '123' },
    { marketId: 1, side: 'sell', price: 0.09, sizeBase: 93, clientOrderId: '124' },
  ]);
  assert.deepEqual(result.placed.map(x => x.orderId), ['grvt-client:123', 'grvt-client:124']);
  await fixture.exchange.cancelOrder(1, result.placed[0].orderId);
  assert.deepEqual(requests.at(-1).body, { sub_account_id: '42', client_order_id: '123' });
});
