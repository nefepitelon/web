import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createEnvView, validateEnvUpdate } from '../src/env-config.js';
import { publicExchangeManifest } from '../src/exchange/manifest.js';
import { LighterExchange } from '../src/exchange/lr/lighter.js';
import { PaperExchange } from '../src/exchange/lr/paper.js';
import { makeClientOrderIndex, parseCandles, parseMarkets, RHC_API_URL, RHC_CHAIN_ID, RHC_MAX_CLIENT_ORDER_INDEX } from '../src/exchange/lr/market.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function marketPayload() {
  return { code: 200, order_book_details: [
    { symbol: 'BTC', market_id: 1, market_type: 'perp', status: 'active', supported_size_decimals: 5, supported_price_decimals: 1, min_base_amount: '0.0001', min_quote_amount: '1', min_initial_margin_fraction: 200, last_trade_price: 65000, maker_fee: '0.0001', taker_fee: '0.0004', open_interest: 100 },
    { symbol: 'OLD', market_id: 7, market_type: 'perp', status: 'inactive' },
  ] };
}

test('RHC Lighter manifest exposes the documented account, signer and runtime fields', () => {
  const definition = publicExchangeManifest().find((item) => item.key === 'lr');
  assert.equal(definition.name, 'RHC Lighter');
  assert.deepEqual(definition.networks, ['mainnet']);
  assert.equal(definition.fields.find((field) => field.env === 'LIGHTER_API_KEY_INDEX').min, 4);
  assert.deepEqual(definition.requiredLiveAnyOf, [['LIGHTER_API_PRIVATE_KEY', 'LIGHTER_API_PRIVATE_KEY_FILE']]);
  const view = createEnvView({}).values;
  assert.equal(view.LR_NETWORK, 'mainnet');
  assert.equal(view.LIGHTER_FEE_RATE, '0.0005');
  assert.throws(() => validateEnvUpdate({ LR_MODE: 'live', LIGHTER_API_PRIVATE_KEY_FILE: '' }, {}), /LIGHTER_ACCOUNT_INDEX.*LIGHTER_API_KEY_INDEX/);
});

test('RHC official market, candle and uint48 client id mappings are safe', () => {
  const market = parseMarkets(marketPayload())[0];
  assert.equal(market.displayName, 'BTC-USD');
  assert.equal(market.stepSize, 0.00001);
  assert.equal(market.maxLeverage, 50);
  const seconds = 1_786_680_000;
  assert.equal(parseCandles({ c: [{ t: seconds, o: 1, h: 2, l: 0.5, c: 1.5 }] })[0].time, seconds * 1000);
  const ids = Array.from({ length: 100 }, (_, index) => makeClientOrderIndex(index));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id >= 0 && id <= RHC_MAX_CLIENT_ORDER_INDEX));
  assert.equal(RHC_API_URL, 'https://api.rh.lighter.xyz');
  assert.equal(RHC_CHAIN_ID, 466324);
});

test('RHC account snapshot exposes balance, equity, position and liquidation price', async () => {
  const exchange = new LighterExchange({ accountIndex: 12, apiKeyIndex: 4, apiPrivateKey: 'test-only', signer: { start: async () => true, stop: async () => true, request: async () => ({}) } });
  exchange._get = async () => ({ code: 200, accounts: [{ index: 12, available_balance: '490.25', total_asset_value: '503.75', positions: [{ market_id: 1, sign: -1, position: '0.002', avg_entry_price: '65000', unrealized_pnl: '3.75', liquidation_price: '78000', initial_margin_fraction: '3333', margin_mode: 0 }] }] });
  await exchange._refreshAccount();
  assert.equal(exchange.balance, 490.25);
  assert.equal(exchange.equity, 503.75);
  assert.equal(exchange.getPosition(1).sizeBase, -0.002);
  assert.equal(exchange.getPosition(1).liquidationPrice, 78000);
});

test('RHC paper mode starts without Python or a private key', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  const exchange = new PaperExchange({ startBalance: 10000 });
  await exchange.init();
  assert.equal(exchange.dataSource, 'synthetic');
  const placed = await exchange.placeLimitOrder({ marketId: 1, side: 'buy', price: 64000, sizeBase: 0.001 });
  assert.equal(exchange.getOpenOrders(1)[0].orderId, placed.orderId);
});

test('Windows one-click launcher contains the portable Python and lighter SDK preparation flow', () => {
  const launcher = fs.readFileSync(path.join(here, '..', 'scripts', 'windows-launcher.ps1'), 'utf8');
  assert.match(launcher, /Python 3\.12/);
  assert.match(launcher, /requirements-lighter\.txt/);
  assert.match(launcher, /lighter-sdk/);
  assert.match(launcher, /EnsureLighterOnly/);
  const signer = fs.readFileSync(path.join(here, '..', 'src', 'exchange', 'lr', 'signer.js'), 'utf8');
  assert.match(signer, /-EnsureLighterOnly/);
  assert.match(signer, /runtimeBootstrapAttempted/);
});

test('RHC signer gives a directly configured API key priority over the optional default file', () => {
  const worker = fs.readFileSync(path.join(here, '..', 'src', 'exchange', 'lr', 'signer_worker.py'), 'utf8');
  assert.match(worker, /if not value and filename:/);
});
