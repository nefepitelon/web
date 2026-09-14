const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
require('tsx/cjs');
const load = Module._load;
Module._load = function(name, parent, main) {if (name === 'server-only') return {}; return load.call(this, name, parent, main);};
const {nativeService, nativeReadPath, nativeRead} = require('../lib/quant-suite/native.ts');
const original = process.env.QUANT_NATIVE_SERVICES_JSON;
test.after(() => {Module._load = load; if (original === undefined) delete process.env.QUANT_NATIVE_SERVICES_JSON; else process.env.QUANT_NATIVE_SERVICES_JSON = original;});
const service = {userId:'tenant-one', engine:'freqtrade', apiUrl:'https://native.example.test', username:'private-user', password:'private-password'};

test('native service bindings are explicit per tenant and cannot fall back to another account', () => {
  process.env.QUANT_NATIVE_SERVICES_JSON = JSON.stringify([service]);
  assert.equal(nativeService('tenant-two','freqtrade'), undefined);
  assert.equal(nativeService('tenant-one','jesse'), undefined);
  assert.equal(nativeService('tenant-one','freqtrade').apiUrl, service.apiUrl);
  process.env.QUANT_NATIVE_SERVICES_JSON = JSON.stringify([service, service]);
  assert.throws(() => nativeService('tenant-one','freqtrade'), /配置无效/);
});
test('native configured endpoints reject credentials in URLs, query tokens, and insecure protocols', () => {
  for (const apiUrl of ['http://native.example.test', 'https://user:pass@native.example.test', 'https://native.example.test?token=secret']) {
    process.env.QUANT_NATIVE_SERVICES_JSON = JSON.stringify([{...service, apiUrl}]);
    assert.throws(() => nativeService('tenant-one','freqtrade'), /配置无效/);
  }
});
test('only known read-only FreqUI paths are allowed, no force-entry or filesystem passthrough', () => {
  for (const route of ['api/v1/ping','api/v1/show_config','api/v1/trade/12','api/v1/backtest/history']) assert.equal(nativeReadPath('freqtrade', route.split('/')), route);
  for (const route of ['api/v1/forceenter','api/v1/../start','api/v1/token/login','api/v1/%2e%2e','https://other.invalid/']) assert.throws(() => nativeReadPath('freqtrade',route.split('/')));
  assert.throws(() => nativeReadPath('jesse',['download','download-api-keys']));
});
test('native requests use server credentials and do not forward them into the response', async () => {
  let captured;
  const result = await nativeRead(service,'api/v1/show_config',new URLSearchParams(),async (url,init) => {
    captured = {url:String(url),init};
    return Response.json({state:'stopped', dry_run:true, exchange:{name:'binance',api_key:'secret', password:'hidden'}, nested:[{accessToken:'hidden', value:3}]});
  });
  assert.equal(captured.url,'https://native.example.test/api/v1/show_config');
  assert.match(captured.init.headers.Authorization,/^Basic /);
  assert.equal(captured.init.redirect,'error');
  assert.deepEqual(result,{state:'stopped',dry_run:true,exchange:{name:'binance'},nested:[{value:3}]});
});
test('native API bridge rejects URL/path/secret query injection without making a network request', async () => {
  for (const query of ['url=https://evil.invalid','filename=secret','apiKey=hidden']) {
    await assert.rejects(nativeRead(service,'api/v1/logs',new URLSearchParams(query),async () => {throw new Error('must not fetch');}),/查询参数/);
  }
});
test('native timeout and upstream failures expose sanitized errors rather than credentials', async () => {
  await assert.rejects(nativeRead(service,'api/v1/ping',new URLSearchParams(),async () => {throw new Error('private-password');}), error => !error.message.includes('private-password') && error.status === 503);
  await assert.rejects(nativeRead(service,'api/v1/ping',new URLSearchParams(),async () => new Response('password=private-password',{status:401})), error => error.status === 502 && !error.message.includes('private-password'));
});
