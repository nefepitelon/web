const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const prismaTypes = require('@prisma/client');

function load(file, imports = {}, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'server-only') return {};
    if (name in imports) return imports[name];
    if (name === '@prisma/client' || name === 'node:crypto' || name === 'zod') return require(name);
    throw new Error(`Unmocked import ${name}`);
  }, Date, Buffer, URL, URLSearchParams, Response, Request, AbortSignal, TextEncoder, ReadableStream, ...globals });
  return module.exports;
}

const summary = load('lib/alpha-execution/pnl-summary.ts');
const row = (tranId, incomeType, income, asset = 'USDT') => ({ tranId, incomeType, income, asset, time: 100 });

test('exchange income pages preserve decimal totals, dedupe by income type and never combine currencies or transfers', async () => {
  const pages = [
    [row(1, 'REALIZED_PNL', '10.3'), row(1, 'COMMISSION', '-0.1'), row(3, 'FUNDING_FEE', '-0.2')],
    [row(1, 'REALIZED_PNL', '10.3'), row(4, 'REALIZED_PNL', '0.01', 'BTC'), row(5, 'TRANSFER', '1000')],
    [row(6, 'COMMISSION', '-0.001', 'BTC')],
  ];
  const calls = [];
  const result = await summary.collectIncomeSummary(async (input) => { calls.push(input); return pages[input.page - 1]; }, 0, 200, { pageSize: 3 });
  assert.equal(result.amount, 10);
  assert.equal(result.status, 'ready');
  assert.equal(result.coverageComplete, true);
  assert.equal(result.assets.find(x => x.asset === 'BTC').netRealizedPnl, 0.009);
  assert.equal(result.realizedIncomeCount, 2);
  assert.equal(result.recordCount, 5);
  assert.equal(result.hasNonTradingFlows, true);
  assert.equal(result.nonTradingFlows[0].amount, 1000);
  assert.deepEqual(calls.map(x => [x.startTime, x.endTime, x.page, x.limit]), [[0,200,1,3],[0,200,2,3],[0,200,3,3]]);
  assert.equal(result.allTime, false);
  assert.equal(result.scope, 'LIVE_ACCOUNT');
});

test('income partial pages, transport failure, repeated pages and malformed records never expose a complete net value', async () => {
  for (const fetchPage of [
    async () => [row(1, 'REALIZED_PNL', '2')],
    async ({page}) => { if (page > 1) throw new Error('offline'); return [row(1, 'REALIZED_PNL', '2')]; },
  ]) {
    const result = await summary.collectIncomeSummary(fetchPage, 0, 200, { pageSize: 1, maxPages: 2 });
    assert.equal(result.coverageComplete, false);
    assert.equal(result.amount, null);
    assert.equal(result.status, 'partial');
  }
  for (const invalid of [{...row(1,'REALIZED_PNL','4'),time:300}, row(1,'REALIZED_PNL','NaN'), {...row(1,'REALIZED_PNL','2'),tranId:9007199254740992}]) {
    const result = await summary.collectIncomeSummary(async () => [invalid], 0, 200);
    assert.equal(result.amount, null);
    assert.equal(result.coverageComplete, false);
  }
  const unavailable = await summary.collectIncomeSummary(async () => {throw new Error('private error');}, 0, 200);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.amount, null);
  assert.doesNotMatch(unavailable.message, /private error/);
});

test('a fully paged empty income window is actual zero, while a deadline expiry remains unknown', async () => {
  const empty = await summary.collectIncomeSummary(async () => [], 0, 200);
  assert.equal(empty.amount, 0);
  assert.equal(empty.coverageComplete, true);
  let reads = 0;
  const expired = await summary.collectIncomeSummary(async () => { reads++; return []; }, 0, 200, { deadlineMs: 0 });
  assert.equal(reads, 0);
  assert.equal(expired.amount, null);
});

test('PnL cache is owner and credential-version scoped, spot and unverified credentials do not read private income', async () => {
  const queries = []; const reads = []; let version = 'one';
  const mod = load('lib/alpha-execution/pnl.ts', {
    '@/lib/prisma': { prisma: { alphaTradingCredential: { findUnique: async ({where}) => {
      const key = where.userId_environment_market; queries.push(key);
      return { id:key.userId, enabled:true, verifiedAt:key.userId === 'unverified' ? null : new Date('2026-01-01T00:00:00Z'), apiKeyEncrypted:key.userId+version, apiSecretEncrypted:'fixture-secret' };
    } } } },
    '@/lib/alpha-execution/credentials': { decryptTradingSecret: value => value },
    '@/lib/alpha-execution/pnl-summary': summary,
    '@/lib/alpha-execution/binance': { AlphaBinanceClient: class {
      constructor(options) { this.owner = options.apiKey; }
      async getIncomeHistoryPage() { reads.push(this.owner); return []; }
      async close() {}
    } },
  });
  await mod.getLivePnlSummary('alice','futures');
  await mod.getLivePnlSummary('alice','futures');
  await mod.getLivePnlSummary('bob','futures');
  assert.deepEqual(reads, ['aliceone','bobone']);
  version = 'two';
  await mod.getLivePnlSummary('alice','futures');
  assert.deepEqual(reads, ['aliceone','bobone','alicetwo']);
  assert.equal((await mod.getLivePnlSummary('alice','spot')).status,'unavailable');
  assert.equal((await mod.getLivePnlSummary('unverified','futures')).status,'not_configured');
  assert.equal(reads.length,3);
  assert.ok(queries.every(q => q.environment === prismaTypes.AlphaExecutionMode.LIVE));
  await assert.rejects(mod.fetchLiveIncomeForPeriod('alice','futures',Date.now()-100*86400000,Date.now()),/89/);
});

function binanceFixture(overrides = {}) {
  const position = { symbol:'BTCUSDT',positionSide:'BOTH',positionAmt:'0.01',markPrice:'50000',entryPrice:'49000',notional:'500',marginAsset:'USDT' };
  const data = {
    '/fapi/v1/accountConfig': {dualSidePosition:false,multiAssetsMargin:false,canTrade:true},
    '/fapi/v3/account': {assets:[{asset:'USDT',availableBalance:'400',marginBalance:'510',unrealizedProfit:'10'}],positions:[position]},
    '/fapi/v3/positionRisk': [position],
    '/fapi/v1/openOrders': [{symbol:'BTCUSDT',positionSide:'BOTH',side:'SELL',origQty:'0.02',executedQty:'0.005',price:'51000',orderId:1,clientOrderId:'manual-entry',reduceOnly:false}, {positionSide:'BOTH',reduceOnly:true}],
    '/fapi/v1/openAlgoOrders': [{symbol:'ETHUSDT',positionSide:'BOTH',side:'BUY',quantity:'0.1',price:'0',triggerPrice:'2500',algoId:2,clientAlgoId:'manual-conditional',closePosition:false}],
    '/fapi/v1/premiumIndex': {markPrice:'2400'},
    '/fapi/v1/income': [],
    ...overrides,
  };
  const calls = [];
  const {AlphaBinanceClient} = load('lib/alpha-execution/binance.ts', {'undici':{}}, {fetch: async (url,options) => {
    const u = new URL(url); calls.push({path:u.pathname,search:u.searchParams,method:options.method});
    if (!(u.pathname in data)) throw new Error('Unexpected endpoint');
    return Response.json(data[u.pathname]);
  }});
  return {client:new AlphaBinanceClient({environment:'live',market:'futures',apiKey:'test-key',apiSecret:'test-secret'}),calls};
}

test('automation snapshot includes all account exposure, manual and conditional entries using only GET', async () => {
  const {client,calls} = binanceFixture();
  const result = await client.getAutomationAccountSnapshot();
  assert.equal(result.equity,510);
  assert.equal(result.availableMargin,400);
  assert.equal(result.unrealizedPnl,10);
  assert.equal(result.positions[0].notional,500);
  assert.equal(result.openEntryOrders.length,2);
  assert.equal(result.openEntryOrders[0].clientOrderId,'manual-entry');
  assert.equal(result.openEntryOrders[0].notional,765);
  assert.equal(result.openEntryOrders[1].notional,250);
  assert.equal(result.openEntryOrders[1].conditional,true);
  assert.ok(calls.every(x => x.method === 'GET'));
  assert.ok(calls.filter(x => x.path !== '/fapi/v1/premiumIndex').every(x => x.search.has('signature')));
});

test('automation account reader fails closed on hedge, multiasset, missing position pages and incomplete conditional orders', async () => {
  for (const overrides of [
    {'/fapi/v1/accountConfig':{dualSidePosition:true,multiAssetsMargin:false,canTrade:true}},
    {'/fapi/v1/accountConfig':{dualSidePosition:false,multiAssetsMargin:true,canTrade:true}},
    {'/fapi/v3/positionRisk':[]},
    {'/fapi/v1/openAlgoOrders':{}},
    {'/fapi/v3/account':{assets:[],positions:[]}},
    {'/fapi/v1/openAlgoOrders':[{positionSide:'BOTH',symbol:'ETHUSDT',side:'BUY',quantity:'0.1'}]},
  ]) await assert.rejects(binanceFixture(overrides).client.getAutomationAccountSnapshot());
});

test('income history reader signs bounded, inclusive, fixed-window paginated GET requests', async () => {
  const {client,calls} = binanceFixture();
  await client.getIncomeHistoryPage({startTime:1,endTime:100,page:2,limit:1000});
  assert.equal(calls[0].path,'/fapi/v1/income');
  assert.equal(calls[0].search.get('page'),'2');
  assert.equal(calls[0].search.get('startTime'),'1');
  assert.equal(calls[0].search.get('endTime'),'100');
  assert.equal(calls[0].search.has('incomeType'),false);
  await assert.rejects(client.getIncomeHistoryPage({startTime:1,endTime:100,page:0}));
  assert.equal(calls.length,1);
});

test('income transport preserves signed int64 identifiers before Number rounding and keeps neighboring IDs distinct', async () => {
  const raw = '[{"tranId":9007199254740992,"incomeType":"REALIZED_PNL","income":"1.25","asset":"USDT","time":100},'
    + '{"tranId":9007199254740993,"incomeType":"REALIZED_PNL","income":"2.75","asset":"USDT","time":100},'
    + '{"tranId":-9223372036854775808,"incomeType":"COMMISSION","income":"-0.5","asset":"USDT","time":100}]';
  const { AlphaBinanceClient } = load('lib/alpha-execution/binance.ts', { undici: {} }, {
    fetch: async () => new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const client = new AlphaBinanceClient({ environment: 'live', market: 'futures', apiKey: 'test-only', apiSecret: 'test-only' });
  const rows = await client.getIncomeHistoryPage({ startTime: 0, endTime: 200, page: 1 });
  assert.deepEqual(Array.from(rows, item => item.tranId), ['9007199254740992', '9007199254740993', '-9223372036854775808']);
  const result = await summary.collectIncomeSummary(async () => rows, 0, 200);
  assert.equal(result.status, 'ready');
  assert.equal(result.coverageComplete, true);
  assert.equal(result.amount, 3.5);
  assert.equal(result.realizedIncomeCount, 2, 'lossless identity must not merge adjacent 64-bit transaction IDs');
  assert.deepEqual(JSON.parse(JSON.stringify(result.dataQuality)), { signedTransactionIdRows: 1, losslessTransactionIdRows: 3, invalidRows: 0, outOfWindowRows: 0,
    invalidFields: { structure: 0, incomeType: 0, asset: 0, time: 0, tranId: 0, income: 0 } });
  assert.doesNotMatch(JSON.stringify(result.dataQuality), /900719925474099[23]|9223372036854775808/);
});

test('lossless income parsing leaves text intact and never repairs malformed JSON into valid records', () => {
  const { parseBinanceIncomeJson } = load('lib/alpha-execution/binance.ts', { undici: {} });
  const info = 'Text includes "tranId": 9223372036854775807 and escaped \\ characters';
  const parsed = parseBinanceIncomeJson('{"tranId":9223372036854775807,"code":-1021,"time":100,"info":' + JSON.stringify(info) + '}');
  assert.equal(parsed.tranId, '9223372036854775807');
  assert.equal(parsed.code, -1021);
  assert.equal(parsed.time, 100);
  assert.equal(parsed.info, info);
  for (const malformed of ['{"tranId":0009223372036854775807}', '{"tranId":+9223372036854775807}', '{"tranId":9223372036854775807x}', '{"tranId":1e}', '{"tranId":9223372036854775807,}']) {
    assert.throws(() => parseBinanceIncomeJson(malformed));
  }
});

test('signed IDs are valid but lossy numbers, out-of-int64 IDs and malformed or out-of-window fields still fail closed', async () => {
  const valid = await summary.collectIncomeSummary(async () => [row(-42, 'REALIZED_PNL', '1'), row('9223372036854775807', 'COMMISSION', '-0.1')], 0, 200);
  assert.equal(valid.amount, 0.9);
  for (const invalid of [
    row(9007199254740992, 'REALIZED_PNL', '1'), row('9223372036854775808', 'REALIZED_PNL', '1'),
    row('-9223372036854775809', 'REALIZED_PNL', '1'), row('1.2', 'REALIZED_PNL', '1'),
    row('', 'REALIZED_PNL', '1'), row({}, 'REALIZED_PNL', '1'),
    {...row(-42, 'REALIZED_PNL', '1'), time: null}, {...row(-42, 'REALIZED_PNL', '1'), time: 201},
    {...row(-42, 'REALIZED_PNL', '1'), time: -1}, row(-42, 'REALIZED_PNL', 'invalid'),
  ]) {
    const result = await summary.collectIncomeSummary(async () => [invalid], 0, 200);
    assert.equal(result.coverageComplete, false);
    assert.equal(result.amount, null);
    assert.equal(result.dataQuality.invalidRows, 1);
  }
  const outOfWindow = await summary.collectIncomeSummary(async () => [{ ...row(-1, 'REALIZED_PNL', '1'), time: 201 }], 0, 200);
  assert.equal(outOfWindow.dataQuality.outOfWindowRows, 1);
  assert.match(outOfWindow.message, /超出查询时间范围 1 条/);
  const malformedRows = await summary.collectIncomeSummary(async () => [null, []], 0, 200);
  assert.equal(malformedRows.dataQuality.invalidRows, 2);
  assert.equal(malformedRows.amount, null);
});

test('income diagnostics identify only aggregate invalid field categories and never expose private row values', async () => {
  const invalid = { tranId: 'private-invalid-id', incomeType: {}, income: 'private-amount', asset: 'private-asset', time: null };
  const result = await summary.collectIncomeSummary(async () => [invalid, null], 0, 200);
  assert.equal(result.amount, null);
  assert.equal(result.coverageComplete, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.dataQuality.invalidFields)), { structure: 1, incomeType: 1, asset: 1, time: 1, tranId: 1, income: 1 });
  for (const label of ['记录结构', '流水类型', '结算币种', '时间字段', '流水编号', '金额字段']) assert.ok(result.message.includes(`${label} 1 条`));
  assert.doesNotMatch(JSON.stringify({ dataQuality: result.dataQuality, message: result.message }), /private-/);
});

test('PnL route takes owner only from authenticated viewer and rejects invalid markets before reading income', async () => {
  const reads=[]; let authenticated=true;
  const route=load('app/api/alpha-execution/pnl/route.ts',{
    '@/lib/alpha-execution/access': {requireAlphaOperator:async()=>{if(!authenticated)throw new Error('unauthorized');return{id:'alice'};},alphaExecutionErrorResponse:()=>Response.json({ok:false},{status:403})},
    '@/lib/alpha-execution/pnl': {getLivePnlSummary:async(user,market)=>{reads.push([user,market]);return summary.emptyIncomeSummary(0,1,'not_configured','missing');}},
  });
  const response=await route.GET(new Request('https://example.test/api/alpha-execution/pnl?market=futures&userId=bob'));
  assert.deepEqual(reads,[['alice','futures']]);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal((await response.json()).amount,null);
  assert.equal((await route.GET(new Request('https://example.test/api/alpha-execution/pnl?market=unknown'))).status,403);
  authenticated=false;
  assert.equal((await route.GET(new Request('https://example.test/api/alpha-execution/pnl?market=futures'))).status,403);
  assert.equal(reads.length,1);
});
