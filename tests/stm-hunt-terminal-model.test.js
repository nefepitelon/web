const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const moduleStub = { exports: {} };
const file = path.join(__dirname, '..', 'lib/stm-hunt/terminal-model.ts');
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(code, { module: moduleStub, exports: moduleStub.exports, Map, Set, Number, Array, Math }, { filename: file });
const model = moduleStub.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const old = '2026-11-19T01:52:18.573Z', rankTime = '2026-11-19T02:10:24.395Z';
const evm = '0x696d1265c8fc4f14797abebfae3c43ebfa9d8e28', sol = '498g1rVnFcnjBjpfw1xyqA1WvgQXUU8RWuELjxkjAayQ';
const otherSol = sol.replace('V', 'v');
const holding = (overrides = {}) => ({ asset: `solana:${sol}`, symbol: 'KNOWN', chain: 'solana', address: sol, quantity: null, valueUsd: 900, side: 'spot', sourceId: 'wsm-fomo', sourceUpdatedAt: old, ...overrides });
const trader = (id = 'wsm:fomo:frank', overrides = {}) => ({ id, source: 'wsm-fomo', venue: 'fomo', name: 'Frank', address: evm, pnlUsd: 100, roi: null, winRate: null,
  pnlWindow: 'All time', rank: 1, updatedAt: old, holdings: [holding()], visibility: 'truncated', tags: [], qualified: false,
  totalValueUsd: 1000, chains: [{ chain: 'solana', valueUsd: 1000, holdingsCount: 1 }], chainsScope: 'reported',
  wallets: [{ chain: 'evm', address: evm, sourceId: 'wsm-fomo', sourceUpdatedAt: null }],
  fieldSources: { pnl: { sourceId: 'wsm-fomo', updatedAt: rankTime }, holdings: { sourceId: 'wsm-fomo', updatedAt: old } }, ...overrides });
const candidate = (id = 'solana-known', overrides = {}) => ({ id, symbol: 'KNOWN', name: 'Known', chain: 'solana', address: sol, market: 'onchain', sources: ['alpha'], price: 0.1,
  change24h: null, volumeUsd: null, liquidityUsd: null, score: 0, bias: '', reason: '', updatedAt: old, risk: 'unknown', holders: 0, ...overrides });
const shared = (overrides = {}) => ({ id: `solana:${sol}`, chain: 'solana', address: sol, symbol: 'KNOWN', name: 'Known', logoUrl: null, priceUsd: null,
  totalValueUsd: 50000, holdersCount: 20, holderIds: ['wsm:fomo:frank', 'wsm:fomo:missing'], holders: [], wallets: [], socialLinks: [], description: null,
  sourceId: 'wsm-fomo', sourceUpdatedAt: old, reported: true, scope: 'source-reported', ...overrides });
const board = (traders, period = 'all', overrides = {}) => ({ venue: 'fomo', period, traders, source: { id: 'wsm-fomo', updatedAt: rankTime }, checkedAt: '2026-11-25T09:00:00Z', limitations: [], refreshAfterSeconds: 15, researchOnly: true, ...overrides });

test('terminal uses all 100 exact radar records and preserves 93 disclosed/7 unknown source semantics', () => {
  const rows = Array.from({ length: 100 }, (_, index) => trader(`wsm:fomo:person${index}`, index < 93 ? { rank: index + 1 }
    : { rank: index + 1, totalValueUsd: 0, updatedAt: null, holdings: [], chains: [], wallets: [], address: null }));
  const result = model.buildStmTerminalModel({ board: board(rows) });
  assert.equal(result.traders.length, 100); assert.equal(result.coverage.traders, 100);
  assert.equal(result.coverage.withAssets, 93); assert.equal(result.coverage.withHoldings, 93); assert.equal(result.coverage.withChains, 93);
  assert.equal(result.traders[99].totalValueUsd, null); assert.equal(result.traders[99].updatedAt, null);
  assert.equal(result.traders[0].rank, 1); assert.equal(result.traders[99].rank, 100);
  assert.equal(result.traders[0].holdings[0].quantity, null); assert.equal(result.traders[0].fieldSources.pnl.updatedAt, rankTime);
  assert.equal(result.traders[0].fieldSources.holdings.updatedAt, old); assert.equal(result.traders[0].qualified, false);
});

test('an empty period board is authoritative and never replaced by dashboard all-time data', () => {
  const seed = [trader()];
  assert.equal(model.buildStmTerminalModel({ board: board([], '24h'), dashboardTraders: seed }).traders.length, 0);
  assert.equal(model.buildStmTerminalModel({ period: '7d', dashboardTraders: seed }).traders.length, 0);
  assert.equal(model.buildStmTerminalModel({ traders: [], dashboardTraders: seed }).traders.length, 0);
  assert.equal(model.buildStmTerminalModel({ dashboardTraders: seed }).traders.length, 1);
  assert.equal(model.buildStmTerminalModel({ board: board(seed, 'all'), period: '30d', dashboardTraders: seed }).traders.length, 0);
  assert.equal(model.buildStmTerminalModel({ board: board(seed), venue: 'hl', dashboardTraders: seed }).traders.length, 0);
});

test('period PnL, ranks and IDs remain unchanged and input data is not mutated', () => {
  const source = trader('fomo:immutable-uid', { rank: 8, pnlUsd: 77, pnlWindow: '7d', sourceTraderIds: ['wsm:fomo:frank'] });
  const before = JSON.stringify(source), result = model.buildStmTerminalModel({ board: board([source], '7d') });
  assert.equal(result.traders[0].id, source.id); assert.equal(result.traders[0].rank, 8); assert.equal(result.traders[0].pnlUsd, 77); assert.equal(result.traders[0].pnlWindow, '7d');
  assert.equal(JSON.stringify(source), before); assert.notEqual(result.traders[0].holdings, source.holdings);
});

test('only complete canonical chain/contract identity matches candidates; ticker-only and cross-chain aliases fail', () => {
  const same = candidate(), evmToken = candidate('bsc-token', { chain: 'bsc', address: evm });
  assert.equal(model.matchStmTerminalCandidate(holding(), [same]), same);
  assert.equal(model.matchStmTerminalCandidate(holding({ address: null }), [same]), null);
  assert.equal(model.matchStmTerminalCandidate(holding({ chain: null }), [same]), null);
  assert.equal(model.matchStmTerminalCandidate(holding({ chain: 'ethereum', address: evm }), [evmToken]), null);
  assert.equal(model.matchStmTerminalCandidate(holding({ chain: 'BNB', address: evm.toUpperCase().replace('0X', '0x') }), [evmToken]), evmToken);
  assert.equal(model.matchStmTerminalCandidate(holding(), [candidate('same-ticker-other-contract', { address: otherSol })]), null);
  assert.equal(model.matchStmTerminalCandidate(holding(), [same, candidate('ambiguous-same-contract')]), null);
  assert.equal(model.matchStmTerminalCandidate(holding(), [candidate('fake-cex', { market: 'cex' })]), null);
});

test('Solana keys retain case and invalid/missing contracts cannot become selectable assets', () => {
  assert.equal(model.stmTerminalAssetKey('SOL', sol), `solana:${sol}`);
  assert.notEqual(model.stmTerminalAssetKey('solana', sol), model.stmTerminalAssetKey('solana', otherSol));
  assert.equal(model.stmTerminalAssetKey('solana', evm), null); assert.equal(model.stmTerminalAssetKey('ethereum', sol), null);
  assert.equal(model.stmTerminalAssetKey('https://internal', evm), null); assert.equal(model.stmTerminalAssetKey('solana', 'KNOWN'), null);
  assert.equal(model.stmTerminalAssetKey('56', evm), `bsc:${evm}`);
  assert.equal(model.stmTerminalAssetKey('unknown-svm', sol), `unknown-svm:${sol}`);
  assert.equal(model.stmTerminalAssetKey('constructor', evm), `constructor:${evm}`, 'unknown chain names cannot resolve inherited object properties');
});

test('trader selection uses unique immutable IDs or complete wallets, never names or handles', () => {
  const one = trader('fomo:uid', { sourceTraderIds: ['wsm:fomo:frank'], handle: 'frankdegods' });
  assert.equal(model.selectStmTerminalTrader('fomo:uid', [one]), one);
  assert.equal(model.selectStmTerminalTrader('wsm:fomo:frank', [one]), one);
  assert.equal(model.selectStmTerminalTrader('Frank', [one]), null); assert.equal(model.selectStmTerminalTrader('frankdegods', [one]), null);
  assert.equal(model.selectStmTerminalTrader({ chain: 'evm', address: evm }, [one]), one);
  assert.equal(model.selectStmTerminalTrader({ chain: 'ethereum', address: evm }, [one]), null, 'generic EVM wallet does not prove Ethereum coverage');
  assert.equal(model.selectStmTerminalTrader('wsm:fomo:frank', [one, trader('other', { sourceTraderIds: ['wsm:fomo:frank'] })]), null);
  assert.equal(model.selectStmTerminalTrader({ chain: 'evm', address: evm }, [one, trader('other')]), null);
});

test('wallet list aggregates exact identities and retains each independent source observation', () => {
  const rows = [trader('one'), trader('two', { wallets: [{ chain: 'evm', address: evm.toUpperCase().replace('0X', '0x'), sourceId: '985', sourceUpdatedAt: old }] })];
  const result = model.buildStmTerminalModel({ traders: rows });
  assert.equal(result.wallets.length, 1); assert.deepEqual(plain(result.wallets[0].matchedTraderIds), ['one', 'two']);
  assert.deepEqual(plain(result.wallets[0].sourceIds), ['wsm-fomo', '985']); assert.equal(result.wallets[0].sourceUpdatedAt, null, 'mixed times must not be laundered to the newest');
  assert.equal(result.wallets[0].observations[0].sourceUpdatedAt, null); assert.equal(result.wallets[0].observations[1].sourceUpdatedAt, old);
});

test('shared source count and value remain reported totals independent of matched visible holders', () => {
  const row = trader('fomo:uid', { sourceTraderIds: ['wsm:fomo:frank'] }), source = shared(), market = candidate();
  const result = model.buildStmTerminalModel({ traders: [row], sharedHoldings: [source], candidates: [market] });
  const item = result.sharedHoldings[0];
  assert.equal(item.holdersCount, 20); assert.equal(item.totalValueUsd, 50000); assert.equal(item.sourceUpdatedAt, old); assert.equal(item.reported, true);
  assert.deepEqual(plain(item.matchedTraderIds), ['fomo:uid']); assert.deepEqual(plain(item.unmatchedHolderIds), ['wsm:fomo:missing']); assert.equal(item.candidate, market);
  assert.equal(source.holderIds.length, 2); assert.equal(item.scope, 'source-reported');
});

test('shared tokens with missing contracts or inferred aggregation are excluded rather than guessed from symbols', () => {
  const result = model.buildStmTerminalModel({ traders: [trader()], sharedHoldings: [shared({ address: '' }), shared({ reported: false }), shared({ scope: 'inferred' })] });
  assert.equal(result.sharedHoldings.length, 0); assert.equal(result.coverage.reportedSharedTokens, 0);
});

test('holding selection preserves unknown quantities and explicit unknown source dates without parent-time substitution', () => {
  const source = trader('one', { holdings: [holding({ sourceUpdatedAt: null }), holding({ address: null, sourceUpdatedAt: old })] });
  const entries = model.buildStmTerminalHoldings(source, [candidate()]);
  assert.equal(entries.length, 2); assert.equal(entries[0].holding.quantity, null); assert.equal(entries[0].sourceUpdatedAt, null);
  assert.equal(entries[1].sourceUpdatedAt, old); assert.equal(entries[1].assetKey, null); assert.equal(entries[1].candidate, null); assert.notEqual(entries[0].key, entries[1].key);
  assert.equal(model.buildStmTerminalHoldings(trader('private', { visibility: 'private' }), [candidate()]).length, 0);
});

test('filters use exact reported holder IDs and complete wallet keys, with case-sensitive Solana address search', () => {
  const one = trader('one', { sourceTraderIds: ['wsm:fomo:frank'], wallets: [{ chain: 'solana', address: sol }] });
  const two = trader('two', { name: 'Other', holdings: [], chains: [], wallets: [{ chain: 'solana', address: otherSol }] });
  assert.deepEqual(plain(model.filterStmTerminalTraders([one, two], { holderIds: ['wsm:fomo:frank'] }).map(row => row.id)), ['one']);
  assert.equal(model.filterStmTerminalTraders([one, two], { holderIds: [] }).length, 0);
  assert.equal(model.filterStmTerminalTraders([one, two], { holderIds: ['Frank'] }).length, 0);
  assert.deepEqual(plain(model.filterStmTerminalTraders([one, two], { query: sol }).map(row => row.id)), ['one']);
  assert.deepEqual(plain(model.filterStmTerminalTraders([one, two], { walletKey: `solana:${otherSol}` }).map(row => row.id)), ['two']);
  assert.equal(model.filterStmTerminalTraders([one, two], { chain: '56' }).length, 0);
  assert.equal(model.filterStmTerminalTraders([one, two], { query: 'known', chain: 'sol' }).length, 1);
});

test('major market list contains only supplied CEX candidates, preserves unknown prices and never claims holdings', () => {
  const btc = candidate('btc', { market: 'cex', symbol: 'BTC', chain: null, address: null, price: null });
  const eth = candidate('eth', { market: 'cex', symbol: 'ETH', chain: null, address: null, price: 2000 });
  const input = [eth, candidate('onchain-btc', { symbol: 'BTC' }), candidate('meme', { market: 'cex', symbol: 'MEME' }), btc];
  const result = model.buildStmTerminalModel({ candidates: input });
  assert.deepEqual(plain(result.majorTokens.map(row => row.id)), ['btc', 'eth']); assert.equal(result.majorTokens[0].price, null);
  assert.equal(input[0], eth); assert.equal(result.traders.length, 0); assert.equal(result.coverage.withHoldings, 0);
});
