import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, verify } from 'node:crypto';
import test from 'node:test';
import {
  ArcusExchange,
  alignDecimal,
  buildCancelPayload,
  buildPlacePayload,
  canonicalJson,
  chooseTick,
  loadEd25519PrivateKey,
  publicKeyHex,
  signHex,
  timestampNs,
  toUnitsExact,
} from '../src/exchange/arcus/arcus.js';
import { ArcusPaperExchange } from '../src/exchange/arcus/paper.js';
import { createExchange } from '../src/exchange/arcus/index.js';

const ADDRESS = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

function keyFixture() {
  const pair = generateKeyPairSync('ed25519');
  const der = pair.privateKey.export({ format: 'der', type: 'pkcs8' });
  return {
    pair,
    der,
    seed: der.subarray(-32).toString('hex'),
    apiKey: pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex'),
  };
}

function market(overrides = {}) {
  return {
    marketId: 7,
    name: 'BTC-USD',
    displayName: 'BTC-USD',
    exchangeSymbol: 'BTC-USD',
    symbol: 'BTC',
    lastPrice: 100,
    tickSize: '0.01',
    tickTiers: [{ upToPrice: '200', tick: '0.05' }, { tick: '0.1' }],
    priceStep: '0.01',
    qtyStep: '0.001',
    stepPrice: 0.05,
    stepSize: 0.001,
    minOrderSize: 0.01,
    minOrderNotional: 5,
    minNotional: 5,
    maxOrderSize: 10,
    maxLeverage: 20,
    lowerTradingBound: null,
    upperTradingBound: null,
    ...overrides,
  };
}

function response(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('exact decimal helpers keep floating noise out of signed units', () => {
  assert.equal(alignDecimal(64721.50000000001, '0.1', 'nearest'), '64721.5');
  assert.equal(alignDecimal('0.00123456789', '0.00000001', 'down'), '0.00123456');
  assert.equal(alignDecimal('1.001', '0.01', 'up'), '1.01');
  assert.equal(toUnitsExact('600000.2', '0.1'), 6000002n);
  assert.throws(() => toUnitsExact('1.001', '0.01'), /整数倍/);
  assert.throws(() => alignDecimal('NaN', '0.1'), /无效十进制/);
});

test('tick tiers and canonical JSON are deterministic and fail closed', () => {
  const tiers = {
    tickSize: '0.01',
    tickTiers: [
      { upToPrice: '10', tick: '0.01' },
      { upToPrice: '100', tickSize: '0.05' },
      { tick: '0.1' },
    ],
  };
  assert.equal(chooseTick(tiers, '9.999'), '0.01');
  assert.equal(chooseTick(tiers, '50'), '0.05');
  assert.equal(chooseTick(tiers, '150'), '0.1');
  assert.throws(() => chooseTick({ tickTiers: [{ tick: '0' }] }, 1), /无效 tick/);
  assert.equal(canonicalJson({ z: 2, a: { y: true, x: 1n }, skip: undefined }), '{"a":{"x":1,"y":true},"z":2}');
  assert.throws(() => canonicalJson({ bad: Infinity }), /非有限/);
});

test('typed place and cancel payloads match the Arcus canonical schema', () => {
  assert.equal(buildPlacePayload({
    address: ADDRESS.toUpperCase(), accountIndex: 2, clientId: 'WG_ABC',
    timestamp: 1712345678000000000n, goodTilTimeUs: 4102444800000000n,
    marketId: 1, priceTicks: 500000n, quantityQuantums: 1000n,
    reduceOnly: false, side: 'BUY', timeInForce: 'GTT',
  }), '{"ad":"0xabcdefabcdefabcdefabcdefabcdefabcdefabcd","ai":2,"c":"wg_abc","ct":1712345678000000000,"g":4102444800000000000,"m":1,"op":1,"p":500000,"q":1000,"r":0,"s":0,"t":0,"v":1}');
  assert.equal(buildCancelPayload({
    address: ADDRESS, accountIndex: 2, timestamp: 1712345678000000001n,
    orderId: '0x123', marketId: 1,
  }), '{"ad":"0xabcdefabcdefabcdefabcdefabcdefabcdefabcd","ai":2,"ct":1712345678000000001,"id":"0x123","m":1,"op":2,"v":1}');
  assert.throws(() => buildPlacePayload({
    address: ADDRESS, accountIndex: 0, timestamp: 1n, goodTilTimeUs: 1n,
    marketId: 1, priceTicks: 1n, quantityQuantums: 1n, side: 'hold', timeInForce: 'GTT',
  }), /订单方向/);
  assert.throws(() => buildCancelPayload({
    address: ADDRESS, accountIndex: 0, timestamp: 1n, marketId: 1,
  }), /必须且只能/);
});

test('raw seed, PEM, hex DER and binary DER files all load as Ed25519', () => {
  const fixture = keyFixture();
  const directory = mkdtempSync(join(tmpdir(), 'arcus-key-'));
  try {
    const pemFile = join(directory, 'key.pem');
    const derFile = join(directory, 'key.der');
    writeFileSync(pemFile, fixture.pair.privateKey.export({ format: 'pem', type: 'pkcs8' }));
    writeFileSync(derFile, fixture.der);
    for (const key of [
      loadEd25519PrivateKey({ value: fixture.seed }),
      loadEd25519PrivateKey({ value: fixture.der.toString('hex') }),
      loadEd25519PrivateKey({ file: pemFile }),
      loadEd25519PrivateKey({ file: derFile }),
      loadEd25519PrivateKey({ value: fixture.seed, file: join(directory, 'missing-default.pem') }),
    ]) {
      assert.equal(publicKeyHex(key), fixture.apiKey);
      const message = 'arcus-ed25519-test';
      assert.equal(verify(null, Buffer.from(message), fixture.pair.publicKey, Buffer.from(signHex(message, key), 'hex')), true);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('factory and init reject missing or mismatched live credentials before network access', async () => {
  assert.throws(() => createExchange({ mode: 'live' }), /ARCUS_ADDRESS/);
  assert.equal(createExchange({ mode: 'paper' }) instanceof ArcusPaperExchange, true);
  const one = keyFixture();
  const other = keyFixture();
  const exchange = new ArcusExchange({
    address: ADDRESS, apiKey: one.apiKey, apiPrivateKey: other.seed,
  });
  let requested = false;
  exchange._get = async () => { requested = true; return {}; };
  await assert.rejects(exchange.init(), /不是同一对/);
  assert.equal(requested, false);
});

test('network defaults are selected from mainnet/testnet without remote references', () => {
  assert.equal(new ArcusExchange({}).apiUrl, 'https://api.arcus.xyz');
  assert.equal(new ArcusExchange({ network: 'testnet' }).apiUrl, 'https://api.testnet.arcus.xyz');
  assert.equal(new ArcusPaperExchange({ network: 'testnet' }).apiUrl, 'https://api.testnet.arcus.xyz');
});

test('market discovery filters offline rows and exposes bot precision fields', async () => {
  const exchange = new ArcusExchange({});
  exchange._get = async () => ({ markets: [
    {
      marketId: 1, marketDisplayName: 'BTC-USD', baseAsset: 'BTC', type: 'PERPETUAL',
      status: 'ONLINE', markPrice: '65000', tickSize: '0.1', stepSize: '0.0001',
      minOrderSize: '0.001', minOrderNotional: '5', maxOrderSize: '100',
      initialMarginFraction: '0.05', tickTiers: [{ upToPrice: '100000', tick: '0.1' }],
    },
    {
      marketId: 2, marketDisplayName: 'OLD-USD', baseAsset: 'OLD', type: 'PERPETUAL',
      status: 'OFFLINE', markPrice: '1', tickSize: '0.01', stepSize: '1',
    },
    {
      marketId: 3, marketDisplayName: 'BROKEN-USD', baseAsset: 'BAD', type: 'PERPETUAL',
      status: 'ONLINE', markPrice: '1', tickSize: '0', stepSize: '1',
    },
  ] });
  await exchange._loadMarkets();
  const [btc] = await exchange.getMarkets();
  assert.equal(exchange.markets.size, 1);
  assert.deepEqual({
    name: btc.name, stepSize: btc.stepSize, stepPrice: btc.stepPrice,
    minNotional: btc.minNotional, maxLeverage: btc.maxLeverage,
  }, { name: 'BTC-USD', stepSize: 0.0001, stepPrice: 0.1, minNotional: 5, maxLeverage: 20 });
});

test('order preparation enforces tier tick, quantity step, bounds and notional', () => {
  const exchange = new ArcusExchange({});
  const current = market();
  assert.deepEqual(exchange._prepareOrder(current, {
    side: 'buy', price: 99.976, sizeBase: 0.0519,
  }), {
    side: 'buy', price: '100', quantity: '0.051', priceTicks: 10000n, quantityQuantums: 51n,
  });
  assert.throws(() => exchange._prepareOrder(current, { side: 'buy', price: 100, sizeBase: 0.009 }), /最小下单量/);
  assert.throws(() => exchange._prepareOrder(current, { side: 'buy', price: 100, sizeBase: 0.02 }), /名义价值/);
  assert.throws(() => exchange._prepareOrder(current, { side: 'hold', price: 100, sizeBase: 1 }), /订单方向/);
  assert.throws(() => exchange._prepareOrder(market({ lowerTradingBound: '90' }), { side: 'buy', price: 80, sizeBase: 1 }), /交易下限/);
});

test('signed order entry sends canonical BigInt body and verifiable Ed25519 signature', async () => {
  const fixture = keyFixture();
  const exchange = new ArcusExchange({
    address: ADDRESS, accountIndex: 2, apiKey: fixture.apiKey,
    apiPrivateKey: fixture.seed, apiUrl: 'https://example.invalid', sleep: async () => {},
  });
  exchange._privateKey = loadEd25519PrivateKey({ value: fixture.seed });
  exchange.markets.set(7, market());
  const calls = [];
  exchange._req = async (method, path, body, headers) => {
    calls.push({ method, path, body, headers });
    return { orderId: 'arcus-order-1', status: 'ACK' };
  };
  const placed = await exchange.placeLimitOrder({
    marketId: 7, side: 'buy', price: 99.976, sizeBase: 0.0519,
    levelIndex: 3, clientOrderId: 123,
  });
  assert.equal(placed.orderId, 'arcus-order-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].path, `/v1/placeOrder?address=${encodeURIComponent(ADDRESS)}`);
  assert.equal(calls[0].body.price, '100');
  assert.equal(calls[0].body.quantity, '0.051');
  assert.equal(calls[0].body.clientId, 'wg123');
  assert.equal(typeof calls[0].body.timestamp, 'bigint');
  assert.match(calls[0].body.goodTilTime, /^\d+$/);
  assert.equal(calls[0].headers['X-Timestamp'], String(calls[0].body.timestamp));
  assert.match(calls[0].headers['X-Signature'], /^[0-9a-f]{128}$/);
  const payload = buildPlacePayload({
    address: ADDRESS, accountIndex: 2, clientId: 'wg123',
    timestamp: calls[0].body.timestamp, goodTilTimeUs: BigInt(calls[0].body.goodTilTime),
    marketId: 7, priceTicks: 10000n, quantityQuantums: 51n,
    reduceOnly: false, side: 'BUY', timeInForce: 'ALO',
  });
  assert.equal(verify(
    null, Buffer.from(payload), fixture.pair.publicKey,
    Buffer.from(calls[0].headers['X-Signature'], 'hex'),
  ), true);
});

test('batch placement validates every order before first write and reports partial success', async () => {
  const exchange = new ArcusExchange({});
  exchange.markets.set(7, market());
  let writes = 0;
  exchange.placeLimitOrder = async (order) => {
    writes++;
    if (writes === 2) throw new Error('rejected');
    return { orderId: `order-${writes}`, clientOrderId: order.clientOrderId };
  };
  await assert.rejects(
    exchange.placeLimitOrders([
      { marketId: 7, side: 'buy', price: 100, sizeBase: 0.1, clientOrderId: 1 },
      { marketId: 7, side: 'sell', price: 101, sizeBase: 0.1, clientOrderId: 2 },
    ]),
    (error) => error.message === 'rejected' && error.partialOrders.length === 1,
  );
  writes = 0;
  await assert.rejects(exchange.placeLimitOrders([
    { marketId: 7, side: 'buy', price: 100, sizeBase: 0.1 },
    { marketId: 7, side: 'sell', price: 101, sizeBase: 0.001 },
  ]), /最小下单量/);
  assert.equal(writes, 0);
});

test('transport failures retry reads once but never replay an ambiguous write', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const exchange = new ArcusExchange({ apiUrl: 'https://example.invalid' });
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('socket reset'), { code: 'ECONNRESET' });
      return response({ ok: true });
    };
    assert.deepEqual(await exchange._get('/v1/time'), { ok: true });
    assert.equal(calls, 2);

    calls = 0;
    globalThis.fetch = async () => {
      calls++;
      throw Object.assign(new Error('write timeout'), { code: 'ETIMEDOUT' });
    };
    await assert.rejects(
      exchange._req('POST', '/v1/placeOrder', { value: 1n }),
      (error) => error.statusUnknown === true && error.endpoint === '/v1/placeOrder',
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HTTP failures preserve exchange codes and retry-after for scheduler policy', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => response({ code: 'RATE_LIMITED', message: 'slow down' }, 429, { 'retry-after': '2' });
    const exchange = new ArcusExchange({ apiUrl: 'https://example.invalid' });
    await assert.rejects(exchange._req('POST', '/v1/placeOrder', {}), (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.exchangeCode, 'RATE_LIMITED');
      assert.equal(error.retryAfterMs, 2000);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('account snapshots fail closed and margin preflight rejects before writes', async () => {
  const exchange = new ArcusExchange({});
  exchange.markets.set(7, market());
  exchange.balance = 123;
  exchange.equity = 124;
  exchange._get = async () => ({ netQuoteBalance: 'invalid', equity: null });
  await assert.rejects(exchange._refreshAccount(), /账户快照缺少有效/);
  assert.equal(exchange.balance, 123);
  assert.equal(exchange.equity, 124);

  exchange._refreshAccount = async () => {
    exchange.balance = 20;
    exchange.availableMargin = 15;
    exchange.equity = 22;
  };
  await assert.rejects(
    exchange.preflightTrading(7, { risk: { requiredMargin: 16 } }),
    /保证金预检未通过/,
  );
});

test('positions retain direction, leverage and official liquidation semantics', async () => {
  const exchange = new ArcusExchange({ accountIndex: 1 });
  exchange.markets.set(7, market());
  exchange._get = async () => ({ positions: [
    {
      accountIndex: 1, marketId: 7, side: 'SHORT', size: '2',
      averageEntryPrice: '101', unrealizedPnl: '3', leverage: '5', liquidationPrice: '120',
    },
    { accountIndex: 2, marketId: 7, side: 'LONG', size: '100' },
  ] });
  await exchange._refreshPositions();
  assert.deepEqual(exchange.getPosition(7), {
    sizeBase: -2, entryPrice: 101, unrealizedPnl: 3, leverage: 5,
    liquidationPrice: 120, liquidationPriceStatus: 'available', liquidationPriceSource: 'exchange',
  });
  exchange._get = async () => ({ unexpected: true });
  await assert.rejects(exchange._refreshPositions(), /仓位快照格式异常/);
  assert.equal(exchange.getPosition(7).sizeBase, -2);
});

test('cancelAll only cancels the requested market and rejects malformed snapshots', async () => {
  const exchange = new ArcusExchange({});
  exchange.markets.set(7, market());
  exchange.markets.set(8, market({ marketId: 8, name: 'ETH-USD' }));
  exchange._fetchAllOpenOrders = async () => [
    { orderId: 'one', marketId: 7 }, { orderId: 'two', marketId: 8 },
  ];
  const canceled = [];
  exchange.cancelOrder = async (marketId, orderId) => { canceled.push([marketId, orderId]); return true; };
  await exchange.cancelAll(7);
  assert.deepEqual(canceled, [[7, 'one']]);
  exchange._fetchAllOpenOrders = async () => null;
  await assert.rejects(exchange.cancelAll(7), /拒绝执行批量撤单/);
});

test('closePosition creates a reduce-only IOC order with a bounded price', async () => {
  const exchange = new ArcusExchange({});
  exchange.markets.set(7, market());
  exchange._positions.set(7, { sizeBase: -2, entryPrice: 100 });
  exchange._refreshPositions = async () => {};
  exchange.getPrice = async () => 100;
  let submitted;
  exchange._submitOrder = async (order) => { submitted = order; return { orderId: 'close-1' }; };
  await exchange.closePosition(7);
  assert.deepEqual(submitted, {
    marketId: 7, side: 'buy', price: 105, sizeBase: 2,
    reduceOnly: true, orderType: 'MARKET', timeInForce: 'IOC',
  });
});

test('paper mode consumes real Arcus public markets/prices and simulates fills locally', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).endsWith('/v1/markets')) return response({ markets: [{
        marketId: 7, marketDisplayName: 'BTC-USD', baseAsset: 'BTC', type: 'PERPETUAL',
        status: 'ONLINE', markPrice: '100', tickSize: '0.1', stepSize: '0.01',
        minOrderSize: '0.05', minOrderNotional: '5', maxOrderSize: '10',
        initialMarginFraction: '0.05',
      }] });
      if (String(url).endsWith('/v1/prices')) return response({ prices: { 7: { marketId: 7, markPrice: '101' } } });
      throw new Error(`unexpected URL ${url}`);
    };
    const paper = new ArcusPaperExchange({ startBalance: 1000, pollMs: 60_000 });
    await paper.init();
    paper.stop();
    assert.equal(paper.dataSource, 'real');
    assert.equal(await paper.getPrice(7), 101);
    assert.deepEqual(calls, ['https://api.arcus.xyz/v1/markets', 'https://api.arcus.xyz/v1/prices']);

    let fill;
    paper.on('fill', (row) => { fill = row; });
    const placed = await paper.placeLimitOrder({
      marketId: 7, side: 'buy', price: 100.04, sizeBase: 0.051, levelIndex: 4,
    });
    assert.equal(placed.price, 100);
    assert.equal(placed.sizeBase, 0.05);
    paper._match(7, 101, 99);
    assert.equal(fill.orderId, placed.orderId);
    assert.equal(paper.getPosition(7).sizeBase, 0.05);
    assert.ok(paper.balance < 1000);
    await paper.closePosition(7);
    assert.equal(paper.getPosition(7), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('paper mode labels public outages synthetic and still enforces exchange minimums', async () => {
  const paper = new ArcusPaperExchange({ startBalance: 1000 });
  paper._get = async () => { throw new Error('offline'); };
  await paper.init();
  paper.stop();
  assert.equal(paper.dataSource, 'synthetic');
  const [btc] = await paper.getMarkets();
  await assert.rejects(paper.placeLimitOrder({
    marketId: btc.marketId, side: 'buy', price: btc.lastPrice, sizeBase: 0.00001,
  }), /最小数量/);
});

test('timestamps are process-monotonic', () => {
  const first = timestampNs();
  const second = timestampNs();
  assert.ok(second > first);
});
