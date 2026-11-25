const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cheerio = require('cheerio');

// Render the actual client component on the server; no browser, API requests or wallet operations.
function loadRadar() {
  const filename = path.join(__dirname, '..', 'components/stm-hunt-radar.tsx');
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require, Date, Intl, URL, Map, Set, Number, Array, Math, JSON }, { filename });
  return module.exports;
}
const { StmHuntRadar, mergeRadarResearchTrader, retainRadarBoardOnFailure } = loadRadar();
const sourceAt = '2026-11-19T02:10:00.000Z';
const holdingsAt = '2026-11-19T01:52:00.000Z';
const checkedAt = '2026-11-25T09:00:00.000Z';
const source = { id: 'wsm-fomo', name: 'WSM FOMO', url: 'https://web3smartmoney.com/', status: 'stale',
  fetchedAt: checkedAt, checkedAt, updatedAt: sourceAt, count: 100, latencyMs: 1, message: 'Historical public source', semantics: 'snapshot' };

function trader(rank) {
  return { id: `wsm:fomo:fixture-${rank}`, source: 'wsm-fomo', venue: 'fomo', name: `Trader ${String(rank).padStart(3, '0')}`,
    rank, address: null, handle: `x_alias_${rank}`, fomoHandle: `fomo_handle_${rank}`, pnlUsd: rank, roi: null, winRate: null,
    pnlWindow: 'Original public total', updatedAt: holdingsAt, sourceUpdatedAt: sourceAt, visibility: 'public', qualified: false, tags: [],
    holdings: [{ asset: `solana:contract-${rank}`, symbol: `TOKEN${rank}`, chain: 'solana', address: `contract-${rank}`,
      quantity: null, valueUsd: rank * 100, side: 'spot', sourceId: 'wsm-fomo', sourceUpdatedAt: holdingsAt }],
    totalValueUsd: rank * 1000, totalValueLabel: 'Source wallet assets', valueBasis: 'wallet', holdingsCount: 1,
    chains: [{ chain: 'solana', valueUsd: rank * 1000, holdingsCount: 1 }], chainsScope: 'reported',
    wallets: [], socialLinks: [], fieldSources: { assets: { sourceId: 'wsm-fomo', updatedAt: holdingsAt } } };
}
function dashboard() {
  return { asOf: checkedAt, sources: [source], traders: Array.from({ length: 100 }, (_, index) => trader(100 - index)),
    candidates: [], signals: [], strategies: [], sharedHoldings: [], metrics: { traders: 100, candidates: 0, ready: 0, watched: 0, snapshots: 0, paperPnlUsd: 0 },
    state: { authenticated: false, persistent: false, watchlist: [], paper: [], alerts: [], journal: [], replays: [] },
    capabilities: { persistence: false, exactTraderEvents: false, onchainEvents: false, liveExecution: false, notes: [] } };
}
function render(data = dashboard(), initialFocus) {
  return cheerio.load(renderToStaticMarkup(React.createElement(StmHuntRadar, { data, initialFocus, onWatch() {}, onRefresh() {}, autoRefresh: false })));
}

test('terminal identity handoff selects only the exact source ID and opens its disclosed snapshot', () => {
  const data = dashboard();
  data.traders.find(row => row.rank === 41).name = 'Trader 042';
  const $ = render(data, { venue: 'fomo', period: 'all', traderId: 'wsm:fomo:fixture-42' });
  const rows = $('.stm-radar-table tbody > tr:not(.stm-radar-detail-row)');
  assert.equal(rows.length, 1, 'a duplicate display name cannot redirect identity focus');
  assert.equal(rows.first().find('.stm-radar-rank').text(), '42');
  assert.equal($('.stm-radar-detail-row').length, 1);
  assert.match($('.stm-radar-detail-row').text(), /TOKEN42/);
  assert.match($('.stm-radar-active-filter').text(), /终端联动.*返回完整榜单/);
});

test('terminal period handoff cannot silently show total holdings while the selected period loads', () => {
  const $ = render(dashboard(), { venue: 'fomo', period: '24h', query: 'Trader 042', chain: 'solana' });
  assert.equal($('.stm-radar-periods button[aria-pressed="true"]').text(), '24小时');
  assert.equal($('.stm-radar-table tbody > tr').length, 0);
  assert.equal($('input[aria-label="搜索当前来源的交易员或持仓"]').attr('value'), 'Trader 042');
});

test('default total renders all 100 authoritative rows in rank order without pagination', () => {
  const $ = render();
  const rows = $('.stm-radar-table tbody > tr');
  assert.equal(rows.length, 100, 'records 11–100 must be present before any detail read');
  assert.equal(rows.first().find('.stm-radar-trader-name').text(), 'Trader 001');
  assert.equal(rows.last().find('.stm-radar-trader-name').text(), 'Trader 100');
  assert.equal($('.stm-radar-periods button').first().text(), '总榜');
  assert.equal($('.stm-radar-periods button[aria-pressed="true"]').text(), '总榜');
  assert.equal($('.stm-radar-pagination, button[aria-label="上一页"], button[aria-label="下一页"]').length, 0);
  assert.equal($('.stm-radar-results-count').text(), '显示 100 / 100 位交易员');
});

test('every flat row includes transaction overview, chains and preloaded holdings without expanding a profile', () => {
  const $ = render();
  assert.equal($('.stm-radar-table thead th').length, 8);
  assert.equal($('.stm-radar-table thead th').eq(4).text(), '交易概览');
  assert.equal($('.stm-radar-table thead th').eq(5).text(), '链分布');
  assert.equal($('.stm-radar-table tbody > tr').filter((_, row) => $(row).children('td').length !== 8).length, 0);
  assert.equal($('.stm-radar-distribution').length, 100);
  assert.match($('.stm-radar-table tbody > tr').last().find('.stm-radar-token-list').text(), /TOKEN100/);
  assert.equal($('.stm-radar-detail-row').length, 0, 'profile fetch components remain unmounted until requested');
  assert.match($('.stm-radar-value').first().attr('title'), /11\/19.*09:52/,
    'asset provenance uses its holdings time in UTC+8, not the later rank-source timestamp');
});

test('private and missing snapshots remain unknown instead of reporting empty assets or synthetic distribution', () => {
  const data = dashboard();
  const privateRow = data.traders[0];
  privateRow.visibility = 'private'; privateRow.holdings = []; privateRow.chains = []; privateRow.totalValueUsd = null;
  const $ = render(data);
  const row = $('.stm-radar-table tbody > tr').last();
  assert.equal(row.find('.stm-radar-value').text(), '未公开');
  assert.equal(row.find('.stm-radar-distribution').length, 0);
  assert.match(row.text(), /持仓未公开/);
});

test('legacy cached total treats seven undated zero/empty snapshots as unknown before background refresh', () => {
  const data = dashboard();
  for (const row of data.traders.slice(0, 7)) {
    row.totalValueUsd = 0; row.updatedAt = null; row.holdings = []; row.holdingsCount = 0;
    row.chains = [{ chain: 'solana', valueUsd: 0, holdingsCount: 0 }];
    row.pnlWindow = '来源未说明';
  }
  const $ = render(data);
  assert.match($('.stm-radar-summary > div').eq(1).find('p').text(), /93\/100/);
  assert.equal($('.stm-radar-distribution').length, 93);
  assert.equal($('.stm-radar-value').filter((_, value) => $(value).text() === '—').length, 7);
  assert.equal($('.stm-radar-pnl-window').filter((_, value) => $(value).text() === 'ALL-TIME').length, 100);
  const unknown = $('.stm-radar-table tbody > tr').last();
  assert.match(unknown.find('.stm-radar-value').attr('title'), /未提供$/,
    'old rank-source dates must not be assigned to absent asset snapshots');
  assert.equal(unknown.find('.stm-radar-position-count').length, 0);
});

test('sparse or mismatched detail cannot erase known snapshots or replace board rank and PnL', () => {
  const board = trader(1);
  const sparse = { ...board, holdings: [], chains: [], wallets: [], totalValueUsd: null, visibility: 'empty',
    rank: 999, pnlUsd: 999999, pnlWindow: 'unrelated profile period', sourceTraderIds: [] };
  const merged = mergeRadarResearchTrader(board, sparse);
  assert.strictEqual(merged.holdings, board.holdings);
  assert.strictEqual(merged.chains, board.chains);
  assert.equal(merged.totalValueUsd, board.totalValueUsd);
  assert.equal(merged.updatedAt, board.updatedAt);
  assert.equal(merged.rank, board.rank); assert.equal(merged.pnlUsd, board.pnlUsd); assert.equal(merged.pnlWindow, board.pnlWindow);
  assert.strictEqual(mergeRadarResearchTrader(board, { ...sparse, id: 'fomo:another-uid' }), board);
  assert.strictEqual(mergeRadarResearchTrader(board, { ...sparse, venue: 'hl' }), board);
});

test('detail fills genuinely missing snapshot fields while preserving period fields and exact wallet identities', () => {
  const complete = trader(1);
  const empty = { ...complete, holdings: [], chains: [], totalValueUsd: null };
  const filled = mergeRadarResearchTrader(empty, complete);
  assert.strictEqual(filled.holdings, complete.holdings);
  assert.equal(filled.totalValueUsd, complete.totalValueUsd);
  assert.equal(filled.rank, empty.rank);
  const wallet = { chain: 'ethereum', address: `0x${'a'.repeat(40)}`, explorerUrl: null };
  const otherCase = { ...wallet, address: `0x${'A'.repeat(40)}` };
  assert.equal(mergeRadarResearchTrader({ ...complete, wallets: [wallet] }, { ...complete, wallets: [otherCase] }).wallets.length, 1);
});

test('failed same-period revalidation retains seed rows and old evidence time, while valid empty and other periods stay independent', () => {
  const prior = { venue: 'fomo', period: 'all', traders: [trader(1)], source, checkedAt, limitations: [], refreshAfterSeconds: 15, researchOnly: true };
  const attempt = '2026-11-25T09:01:00.000Z';
  const failed = { ...prior, traders: [], checkedAt: attempt,
    source: { ...source, status: 'unavailable', updatedAt: null, checkedAt: attempt, message: 'upstream offline' } };
  const retained = retainRadarBoardOnFailure(prior, failed);
  assert.strictEqual(retained.traders, prior.traders);
  assert.equal(retained.source.updatedAt, sourceAt);
  assert.equal(retained.source.status, 'stale');
  assert.equal(retained.source.checkedAt, attempt);
  assert.equal(retained.source.fetchedAt, source.fetchedAt);
  const validEmpty = { ...failed, source: { ...failed.source, status: 'ok' } };
  assert.strictEqual(retainRadarBoardOnFailure(prior, validEmpty), validEmpty);
  const failedPeriod = { ...failed, period: '24h' };
  assert.strictEqual(retainRadarBoardOnFailure(prior, failedPeriod), failedPeriod, 'total must never populate a missing period');
});
