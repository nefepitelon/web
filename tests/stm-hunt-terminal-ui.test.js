const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cheerio = require('cheerio');

function load(relative, overrides = {}) {
  const filename = path.join(__dirname, '..', relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => overrides[name] ?? require(name), Date, Intl, URL, URLSearchParams,
    Map, Set, Number, Array, Math, JSON, AbortController, AbortSignal,
  }, { filename });
  return module.exports;
}
const modelApi = load('lib/stm-hunt/terminal-model.ts');
const { StmHuntTerminal, TerminalWatchList, resolveStmTerminalFocus, buildStmTerminalRadarFocus, MarketChart } = load('components/stm-hunt-terminal.tsx', {
  '@/lib/stm-hunt/terminal-model': modelApi,
});
const sourceAt = '2026-11-19T02:10:00.000Z', holdingsAt = '2026-11-18T01:52:00.000Z';
const checkedAt = '2026-11-25T09:00:00.000Z';
const tokenAddress = '0x' + 'a'.repeat(40), otherAddress = '0x' + 'b'.repeat(40);
const wallet = rank => '0x' + rank.toString(16).padStart(40, '0');
function trader(rank) {
  return { id: `wsm:fomo:identity-${rank}`, venue: 'fomo', source: 'wsm-fomo', rank,
    name: `Trader ${String(rank).padStart(3, '0')}`, address: null, fomoHandle: `fomo_${rank}`,
    pnlUsd: rank, roi: null, winRate: null, pnlWindow: 'ALL-TIME', updatedAt: holdingsAt,
    sourceUpdatedAt: sourceAt, visibility: 'public', qualified: false, tags: [], totalValueUsd: rank * 100,
    holdings: [{ asset: 'source:BTC', symbol: 'BTC', chain: 'bsc', address: tokenAddress,
      quantity: null, valueUsd: rank * 10, side: 'spot', sourceId: 'wsm-fomo', sourceUpdatedAt: holdingsAt }],
    wallets: [{ chain: 'bsc', address: wallet(rank), explorerUrl: null, sourceId: 'wsm-fomo', sourceUpdatedAt: holdingsAt }],
    chains: [{ chain: 'bsc', valueUsd: rank * 100, holdingsCount: 1 }], chainsScope: 'reported',
    fieldSources: { assets: { sourceId: 'wsm-fomo', updatedAt: holdingsAt }, holdings: { sourceId: 'wsm-fomo', updatedAt: holdingsAt }, pnl: { sourceId: 'wsm-fomo', updatedAt: sourceAt } } };
}
const cex = { id: 'cex:BTC', symbol: 'BTC', name: 'Bitcoin', address: null, chain: null, market: 'cex',
  sources: ['binance'], price: 123456, change24h: 2, volumeUsd: 1000, liquidityUsd: null,
  score: 90, bias: 'long', reason: 'Market evidence', updatedAt: checkedAt, risk: 'pass', holders: 0 };
const exact = { ...cex, id: 'bsc:exact', market: 'onchain', chain: 'bsc', address: tokenAddress, price: .42 };
function dashboard() {
  return { asOf: checkedAt, traders: Array.from({ length: 100 }, (_, index) => trader(100 - index)),
    sources: [{ id: 'wsm-fomo', name: 'WSM FOMO', status: 'stale', url: 'https://web3smartmoney.com/',
      updatedAt: sourceAt, fetchedAt: checkedAt, count: 100, semantics: 'snapshot', latencyMs: 1, message: 'Historical snapshot' }],
    candidates: [cex], strategies: ['S1', 'S2', 'S3', 'S4', 'S5'].map(id => ({ id, name: id, enabled: true })),
    signals: [{ id: 'btc:ready', strategy: 'S1', candidateId: cex.id, symbol: 'BTC', status: 'ready', actionable: true,
      strategyVersion: 1, entities: 5, score: 90, reasons: [], missing: [], asOf: checkedAt }],
    sharedHoldings: [{ id: 'shared:btc', chain: 'bsc', address: tokenAddress, symbol: 'BTC', name: 'Source BTC',
      totalValueUsd: 900, priceUsd: .42, holdersCount: 12, holderIds: ['wsm:fomo:identity-1', 'wsm:fomo:identity-2', 'unmapped-id'],
      holders: [], wallets: [], socialLinks: [], sourceId: 'wsm-fomo', sourceUpdatedAt: holdingsAt, reported: true, scope: 'source-reported' }],
    metrics: { traders: 100, candidates: 1, ready: 1, watched: 0, snapshots: 0, paperPnlUsd: 0 },
    state: { authenticated: false, persistent: false, watchlist: [], paper: [], alerts: [], journal: [], replays: [] },
    capabilities: { persistence: false, exactTraderEvents: false, onchainEvents: false, liveExecution: false, notes: [] } };
}
const model = data => modelApi.buildStmTerminalModel({ dashboardTraders: data.traders, candidates: data.candidates, sharedHoldings: data.sharedHoldings, venue: 'fomo', period: 'all' });
const html = element => cheerio.load(renderToStaticMarkup(element));
const props = data => ({ data, selected: cex, busy: false, autoRefresh: false, onSelect() {}, onWatch() {}, onExecute() {}, onStrategies() {}, onSources() {}, onSimulate() {}, onRefresh() {} });

test('default terminal renders all 100 ranked identities and four searchable observation views', () => {
  const $ = html(React.createElement(StmHuntTerminal, props(dashboard())));
  const rows = $('.stm-orbit-watch-results .stm-orbit-watch-row');
  assert.equal(rows.length, 100);
  assert.match(rows.first().text(), /Trader 001/);
  assert.match(rows.last().text(), /Trader 100/);
  assert.equal($('.stm-orbit-watch-switch button').length, 4);
  assert.equal($('.stm-orbit-watch-switch button[aria-pressed=true]').text(), '交易员');
  assert.equal($('input[aria-label="搜索观察池交易员钱包或持仓"]').length, 1);
  assert.equal($('select[aria-label="观察池来源平台"] option').length, 6);
  assert.equal($('.stm-orbit-watch-periods button[aria-pressed=true]').text(), '总榜');
  assert.match($('.stm-orbit-dossier-title h3').text(), /Trader 001/);
});

test('default identity focus never inherits parent BTC signal or mislabels chart as a holding price', () => {
  const $ = html(React.createElement(StmHuntTerminal, props(dashboard())));
  assert.equal($('.stm-orbit-verdict').length, 0, 'an unrelated ready parent selection must stay outside the research focus');
  assert.match($('.stm-orbit-verdict-empty').text(), /UNBOUND/);
  assert.match($('.stm-orbit-market-context').text(), /独立行情参考.*BTCUSDT.*不代表 Trader 001 的持仓价格/);
  assert.equal($('.stm-orbit-workflow-actions button').last().is(':disabled'), true);
  assert.equal($('.stm-orbit-asset-detail > button').is(':disabled'), true);
  assert.match($('.stm-orbit-portfolio').text(), /数量 —/, 'unknown quantity must not become zero');
});

test('source asset and PnL dates remain distinct despite a newer fetch date', () => {
  const $ = html(React.createElement(StmHuntTerminal, props(dashboard())));
  const dates = $('.stm-orbit-dossier > .stm-orbit-provenance').map((_, node) => $(node).text()).get();
  assert.match(dates[0], /资产.*11\/18.*09:52/);
  assert.match(dates[1], /收益.*11\/19.*10:10/);
  assert.doesNotMatch(dates.join(' '), /11\/25/);
  assert.match($('.stm-orbit-holding-list').text(), /BTC/);
  assert.match($('.stm-orbit-chain-allocation').text(), /BSC/);
});

test('a same-symbol CEX or wrong-chain token cannot bind holding evidence; exact contract can', () => {
  const data = dashboard(), m = model(data), entry = modelApi.buildStmTerminalHoldings(m.traders[0])[0];
  const focus = { kind: 'holding', id: entry.key, traderId: entry.traderId };
  const wrong = { ...exact, id: 'wrongchain', chain: 'base' };
  const unrelated = { ...exact, id: 'wrongaddress', address: otherAddress };
  assert.equal(resolveStmTerminalFocus(m, focus, [cex, wrong, unrelated]).candidate, null);
  const resolved = resolveStmTerminalFocus(m, focus, [cex, exact]);
  assert.equal(resolved.candidate.id, exact.id);
  assert.equal(resolved.trader.id, entry.traderId);
  assert.equal(resolved.linkedIds.length, 100);
  assert.equal(resolveStmTerminalFocus(m, { kind: 'candidate', id: cex.id }, [cex]).candidate.id, cex.id);
});

test('shared source count stays separate from exact local identity matches', () => {
  const data = dashboard(), m = model(data), row = m.sharedHoldings[0];
  const $ = html(React.createElement(TerminalWatchList, { model: m, view: 'shared', query: '', focus: null, onFocus() {} }));
  assert.match($('.stm-orbit-watch-row').text(), /来源报告 12 人 · 本榜匹配 2/);
  const resolved = resolveStmTerminalFocus(m, { kind: 'shared', id: row.id }, [cex]);
  assert.equal(resolved.linkedIds.length, 2);
  assert.equal(resolved.shared.holdersCount, 12);
  assert.equal(resolved.trader, null, 'a shared holding must not choose an arbitrary identity');
});

test('radar navigation keeps exact selected identity independent of a conflicting free search', () => {
  const data = dashboard(), m = model(data);
  const selected = resolveStmTerminalFocus(m, { kind: 'trader', id: 'wsm:fomo:identity-1' }, data.candidates);
  const conflicting = 'Trader 002';
  const result = buildStmTerminalRadarFocus(selected, 'fomo', 'all');
  assert.equal(result.traderId, selected.trader.id);
  assert.equal(result.query, undefined);
  assert.equal(result.chain, undefined);
  assert.notEqual(result.query, conflicting);
  const asset = resolveStmTerminalFocus(m, { kind: 'shared', id: m.sharedHoldings[0].id }, data.candidates);
  const assetFocus = buildStmTerminalRadarFocus(asset, 'fomo', 'all');
  assert.equal(assetFocus.query, tokenAddress);
  assert.equal(assetFocus.chain, 'bsc');
  assert.notEqual(assetFocus.query, asset.shared.symbol);
  assert.equal(assetFocus.traderId, undefined);
  const entry = m.wallets[0];
  const ambiguous = { ...selected, trader: null, wallet: entry, assetKey: null };
  const walletFocus = buildStmTerminalRadarFocus(ambiguous, 'fomo', '7d');
  assert.equal(walletFocus.query, entry.address);
  assert.equal(walletFocus.chain, entry.chain);
  assert.equal(walletFocus.period, '7d');
});

test('ambiguous wallet focus offers exact related identities without inventing one owner', () => {
  const data = dashboard(); data.traders[1].wallets = data.traders[0].wallets.map(row => ({ ...row }));
  const m = model(data), row = m.wallets.find(row => row.matchedTraderIds.length === 2);
  const resolved = resolveStmTerminalFocus(m, { kind: 'wallet', id: row.key }, data.candidates);
  assert.equal(resolved.trader, null);
  assert.equal(resolved.linkedIds.length, 2);
  const selected = resolveStmTerminalFocus(m, { kind: 'wallet', id: row.key, traderId: row.matchedTraderIds[0] }, data.candidates);
  assert.equal(selected.trader.id, row.matchedTraderIds[0]);
  assert.equal(resolveStmTerminalFocus(m, { kind: 'wallet', id: row.key, traderId: 'wsm:fomo:identity-1' }, data.candidates).trader, null,
    'an unrelated identity cannot be assigned to an ambiguous wallet');
});

test('wallet searches and principal holdings preserve non-mainstream assets, owners and unknown quantity', () => {
  const data = dashboard(), m = model(data);
  const $ = html(React.createElement(TerminalWatchList, { model: m, view: 'wallets', query: wallet(42), focus: null, onFocus() {} }));
  assert.equal($('.stm-orbit-watch-row').length, 1);
  assert.match($('.stm-orbit-watch-row').text(), /BSC/);
  m.traders[0].holdings[0].symbol = 'NIO';
  m.traders[1].holdings[0].symbol = 'worth';
  const majors = html(React.createElement(TerminalWatchList, { model: m, view: 'majors', query: '', focus: null, onFocus() {} }));
  assert.equal(majors('.stm-orbit-watch-row').length, 100, 'independent CEX markets are not held assets');
  assert.match(majors('.stm-orbit-watch-divider').text(), /全部已披露持仓/);
  assert.match(majors('.stm-orbit-watch-row').first().text(), /NIO.*Trader 100.*数量 —/);
  assert.match(majors('.stm-orbit-watch-row').eq(1).text(), /worth/);
  assert.match(majors('.stm-orbit-watch-row').first().text(), /Trader 100/);
});

test('selecting a principal holding emits its exact owner and holding key for linked panels', () => {
  const data = dashboard(), m = model(data); m.traders[0].holdings[0].symbol = 'NIO';
  let selection;
  const tree = TerminalWatchList({ model: m, view: 'majors', query: 'NIO', focus: null, onFocus: value => { selection = value; } });
  const buttons = [];
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object' || !node.props) return;
    if (node.type === 'button') buttons.push(node);
    visit(node.props.children);
  }
  visit(tree);
  assert.equal(buttons.length, 1);
  buttons[0].props.onClick();
  const expected = modelApi.buildStmTerminalHoldings(m.traders[0])[0];
  assert.equal(selection.kind, 'holding');
  assert.equal(selection.id, expected.key);
  assert.equal(selection.traderId, m.traders[0].id);
  const resolved = resolveStmTerminalFocus(m, selection, data.candidates);
  assert.equal(resolved.holding.holding.symbol, 'NIO');
  assert.equal(resolved.holding.holding.quantity, null);
  assert.equal(resolved.candidate, null);
});

test('private holdings remain absent and unknown snapshots do not create financial charts', () => {
  const data = dashboard(); data.traders.find(row => row.rank === 1).visibility = 'private';
  const $ = html(React.createElement(StmHuntTerminal, props(data)));
  assert.match($('.stm-orbit-dossier').text(), /未公开/);
  assert.equal($('.stm-orbit-holding-list button').length, 0);
  assert.match($('.stm-orbit-portfolio').text(), /持仓未公开/);
  assert.equal($('.stm-orbit-equity svg polyline').length, 0);
  assert.match($('.stm-orbit-depth').text(), /盘口未提供/);
});

test('one real candle produces finite SVG coordinates without creating extra candles', () => {
  const market = { symbol: 'BTCUSDT', candles: [{ time: Date.parse(checkedAt), open: 10, high: 11, low: 9, close: 10.5, volume: 2, closed: false }] };
  const markup = renderToStaticMarkup(React.createElement(MarketChart, { market }));
  assert.doesNotMatch(markup, /NaN|Infinity/);
  const $ = cheerio.load(markup);
  assert.match($('svg').attr('aria-label'), /最近 1 根真实/);
  assert.equal($('polyline').length, 1);
});
