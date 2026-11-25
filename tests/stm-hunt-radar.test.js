const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Error, Map, Set, Number, Array, Math, JSON, Promise, AbortSignal, Response, Request, Headers, TextDecoder, URL, setTimeout, clearTimeout,
    process: { env: {} }, require(name) { if (name === 'server-only') return {}; if (name in imports) return imports[name]; throw Error(`Unmocked ${name}`); }, ...globals }, { filename: file });
  return module.exports;
}
const plain = v => JSON.parse(JSON.stringify(v));
const sources = load('lib/stm-hunt/sources.ts', { '../../api/alpha-scan.js': {} });
const at = Date.parse('2026-11-25T09:00:00.000Z'), old = Date.parse('2026-11-17T16:33:18.496Z');
const iso = n => new Date(n).toISOString();
const wallet = '0x696d1265c8fc4f14797abebfae3c43ebfa9d8e28';
const sol = '498g1rVnFcnjBjpfw1xyqA1WvgQXUU8RWuELjxkjAayQ';
function harness(fetcher = async () => { throw Error('unexpected request'); }, options = {}) {
  let now = at;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const shared = new Map(), calls = [];
  const radar = load('lib/stm-hunt/radar.ts', {
    './sources': sources, '@/lib/prisma': { isDatabaseConfigured: () => options.database ?? false }, '@/lib/rate-limit': { checkRateLimit: options.rateLimit ?? (async () => ({ allowed: true })) },
    '@vercel/functions': { getCache: () => ({ get: async k => shared.get(k), set: async (k, v) => shared.set(k, v) }) },
  }, { Date: Clock, fetch: async (url, options) => { calls.push({ url, options }); return fetcher(url, options); } });
  return { radar, calls, advance: ms => { now += ms; } };
}
const fomo = { updatedAt: old, leaderboardSource: 'opt-in-browser', boards: { all: [{ uid: 'uid-frank', handle: 'frankdegods', name: 'frank', rank: 1, pnl: 2346725, volume: 71505304, followers: 407632, numTrades: 9703 }],
  '24h': [{ uid: 'uid-other', handle: 'dumbcrayoneater', rank: 1, pnl: 105558 }], '7d': [{ uid: 'uid-frank', handle: 'frankdegods', pnl: 500 }], '30d': [] } };

test('FOMO actual period shape preserves distinct windows, stale upstream time and non-period profile counters', () => {
  const { radar } = harness(), boards = radar.normalizeFomoBoards(fomo, iso(at));
  assert.equal(boards.all.traders[0].pnlUsd, 2346725);
  assert.equal(boards['24h'].traders[0].pnlUsd, 105558);
  assert.equal(boards['7d'].traders[0].pnlUsd, 500);
  assert.equal(boards['30d'].traders.length, 0);
  assert.equal(boards.all.traders[0].statsScope, 'unknown');
  assert.equal(boards.all.traders[0].handle, 'frankdegods');
  assert.equal(boards.all.traders[0].socialLinks.length, 0, 'FOMO handle must not become an X handle');
  assert.equal(boards.all.source.updatedAt, iso(old));
  assert.equal(boards.all.source.status, 'stale');
  assert.equal(boards.all.traders[0].updatedAt, null);
  assert.equal(boards.all.traders[0].qualified, false);
});

test('manual board refresh revalidates after shared cooldown; rapid presses and concurrent requests share one read', async () => {
  const h = harness(async () => Response.json(fomo));
  const first = await Promise.all([h.radar.getStmRadarBoard('fomo', '24h'), h.radar.getStmRadarBoard('fomo', '7d')]);
  assert.equal(h.calls.length, 1);
  await h.radar.getStmRadarBoard('fomo', '24h', true);
  assert.equal(h.calls.length, 1);
  h.advance(16000);
  const next = await h.radar.getStmRadarBoard('fomo', '24h', true);
  assert.equal(h.calls.length, 2);
  assert.equal(next.source.updatedAt, first[0].source.updatedAt, 'successful check must not rewrite old upstream time');
  assert.equal(h.calls[0].options.cache, 'no-store');
  assert.equal(h.calls[0].options.redirect, 'error');
});

test('failed revalidation retains last successful evidence and records the failed attempt separately', async () => {
  let fail = false;
  const h = harness(async () => fail ? new Response('offline', { status: 503 }) : Response.json(fomo));
  const first = await h.radar.getStmRadarBoard('fomo', '24h');
  fail = true; h.advance(16000);
  const next = await h.radar.getStmRadarBoard('fomo', '24h', true);
  assert.equal(next.traders[0].pnlUsd, first.traders[0].pnlUsd);
  assert.equal(next.source.fetchedAt, first.source.fetchedAt);
  assert.notEqual(next.source.checkedAt, first.source.checkedAt);
  assert.equal(next.source.status, 'stale');
  assert.match(next.source.message, /HTTP 503/);
});

test('transport failure retries only the public FOMO GET once and caches first failure for fifteen seconds', async () => {
  let fail = true;
  const h = harness(async () => { if (fail) throw Error('network unreachable'); return Response.json(fomo); });
  assert.equal((await h.radar.getStmRadarBoard('fomo', '24h')).source.status, 'unavailable');
  assert.equal(h.calls.length, 2);
  await h.radar.getStmRadarBoard('fomo', '24h', true);
  assert.equal(h.calls.length, 2, 'first failure without prior data must still be negatively cached');
  h.advance(16000); fail = false;
  assert.equal((await h.radar.getStmRadarBoard('fomo', '24h', true)).traders.length, 1);
  assert.equal(h.calls.length, 3);
});

test('malformed successful board responses retain prior results instead of replacing them with empty OK data', async () => {
  let malformed = false;
  const h = harness(async () => Response.json(malformed ? {} : fomo));
  await h.radar.getStmRadarBoard('fomo', '24h');
  malformed = true; h.advance(16000);
  const board = await h.radar.getStmRadarBoard('fomo', '24h', true);
  assert.equal(board.traders.length, 1);
  assert.equal(board.source.status, 'stale');
  assert.match(board.source.message, /缺少分周期榜单/);
  assert.throws(() => h.radar.normalizeHlBoards({}, iso(at), null), /缺少公开榜单/);
});

test('FOMO profile historyUpdatedAt never becomes wallet, holdings or PnL freshness; trades remain unverified', () => {
  const { radar } = harness();
  const detail = radar.normalizeFomoDetail({ ok: true, profile: { handle: 'frankdegods', userId: 'uid-frank', name: 'frank' },
    wallets: { evm: [wallet], sol: [sol], updatedAt: old }, historyUpdatedAt: iso(at),
    profitSnapshot: { updatedAt: old, items: [{ symbol: 'NIO', networkId: 1399811149, tokenAddress: sol, profitUsd: 102, realizedPnlUsd: 80, unrealizedPnlUsd: 22, closedAt: '2025-10-18T05:17:56.000Z' }] },
    trades: [{ side: 'BUY', symbol: 'ANSEM', tokenAddress: sol, networkId: 1399811149, usd: 1311.94, priceUsd: 0.0242992, createdAt: iso(at - 1000), txHash: 'tx', txUrl: 'https://solscan.io/tx/tx' },
      { side: 'TRANSFER', symbol: 'TEST', usd: 123 }],
  }, 'frankdegods', iso(at));
  assert.equal(detail.componentUpdatedAt.wallets, iso(old));
  assert.equal(detail.componentUpdatedAt.profile, null);
  assert.equal(detail.componentUpdatedAt.holdings, null);
  assert.equal(detail.componentUpdatedAt.pnl, iso(old));
  assert.equal(detail.trader.holdings.length, 0);
  assert.equal(detail.pnlPositions[0].pnlUsd, 102);
  assert.equal(detail.activities.length, 1);
  assert.equal(detail.activities[0].action, 'buy');
  assert.equal(detail.activities[0].quantity, null);
  assert.equal(detail.activities[0].verified, false);
  assert.equal(detail.activities[0].basis, 'provider-trade');
  assert.equal(detail.trader.wallets.length, 2);
  assert.throws(() => radar.normalizeFomoDetail({ ok: true, profile: { handle: 'frank' } }, 'frankdegods', iso(at)), /身份不匹配/);
});

test('FOMO detail joins WSM holdings only by supplied exact wallet, preserving their distinct historical time', async () => {
  const h = harness(async url => {
    if (url.includes('/api/fomo-watch/profile')) return Response.json({ ok: true, profile: { handle: 'frankdegods', userId: 'uid-frank' }, wallets: { evm: [wallet], updatedAt: old }, trades: [] });
    if (url.includes('/fomo/data/traders')) return Response.json({ data: [{ id: 'frank', name: 'Other name', handle: 'different_x', evm: wallet, total_usd: 1000,
      holdings_updated_at: iso(old), top_tokens: [{ symbol: 'NIO', chain: 'solana', usd: 800 }] }] });
    if (url.includes('/version.json')) return Response.json({ sources: { fomo: old } });
    throw Error(`unexpected ${url}`);
  });
  const detail = await h.radar.getStmTraderResearch('fomo', 'frankdegods');
  assert.equal(detail.trader.holdings[0].valueUsd, 800);
  assert.equal(detail.trader.holdings[0].sourceId, 'wsm-fomo');
  assert.equal(detail.trader.holdings[0].sourceUpdatedAt, iso(old));
  assert.equal(detail.componentUpdatedAt.holdings, iso(old));
  assert.equal(detail.trader.sourceTraderIds[0], 'wsm:fomo:frank');
  assert.equal(detail.trader.handle, 'frankdegods');
  assert.equal(detail.trader.qualified, false);
});

test('FOMO same handle or display name without wallet proof cannot import WSM holdings', async () => {
  const h = harness(async url => url.includes('/profile?') ? Response.json({ ok: true, profile: { handle: 'frankdegods', name: 'Frank' }, wallets: { evm: [] }, trades: [] })
    : url.includes('/version.json') ? Response.json({ sources: { fomo: old } })
      : Response.json({ data: [{ id: 'frank', name: 'Frank', handle: 'frankdegods', evm: wallet, total_usd: 1000, top_tokens: [{ symbol: 'NIO', usd: 800 }] }] }));
  const detail = await h.radar.getStmTraderResearch('fomo', 'frankdegods');
  assert.equal(detail.trader.holdings.length, 0);
  assert.equal(detail.trader.sourceTraderIds, undefined);
});

test('canonical FOMO UUID matches can preserve real WSM wallets even when profile wallet list is unavailable', async () => {
  const uid = '6fb966e5-ae85-5909-a99e-2ffa041ace5b';
  const h = harness(async url => url.includes('/profile?') ? Response.json({ ok: true, profile: { handle: 'breaktheloop', userId: uid }, wallets: {}, trades: [] })
    : url.includes('/version.json') ? Response.json({ sources: { fomo: old } })
      : Response.json({ data: [{ id: 'breaktheloop', fomo_id: uid, handle: null, evm: wallet.toUpperCase().replace('0X', '0x'), holdings_updated_at: iso(old), top_tokens: [{ symbol: 'NIO', usd: 800 }] }] }));
  const detail = await h.radar.getStmTraderResearch('fomo', 'breaktheloop');
  assert.equal(detail.trader.wallets[0].address, wallet);
  assert.equal(detail.trader.wallets[0].sourceId, 'wsm-fomo');
  assert.equal(detail.trader.wallets[0].sourceUpdatedAt, null, 'roster holding time does not timestamp wallet identity');
  assert.equal(detail.componentUpdatedAt.wallets, null, 'unknown source profile wallet time must stay unknown');
  assert.equal(detail.componentUpdatedAt.holdings, iso(old));
  assert.equal(detail.trader.sourceTraderIds[0], 'wsm:fomo:breaktheloop');
});

test('legacy case-sensitive account identifiers cannot collide in detail cache', async () => {
  const h = harness(async url => url.includes('/version.json') ? Response.json({ sources: { pump: old } })
    : url.includes('/holdings.json') ? Response.json({})
      : Response.json({ traders: [{ userId: 'CaseID', name: 'Upper' }, { userId: 'caseid', name: 'Lower' }] }));
  const upper = await h.radar.getStmTraderResearch('pump', 'wsm:pump:CaseID');
  const lower = await h.radar.getStmTraderResearch('pump', 'wsm:pump:caseid');
  assert.equal(upper.trader.name, 'Upper');
  assert.equal(lower.trader.name, 'Lower');
});

test('FOMO all preserves the actual 100 WSM ranks and preloads disclosed snapshots without any 985 dependency', async () => {
  const rankAt = old + 3600000, holdingsAt = old - 3600000;
  const data = Array.from({ length: 100 }, (_, i) => ({ id: `person${100 - i}`, name: `Person ${100 - i}`, rank: 999,
    official_rank: 100 - i, official_pnl_usd: i === 99 ? 0 : -i, handle: `x_${i}`, fomo_api_handle: `fomo_${i}`, total_usd: i < 7 ? 0 : 1000,
    evm_usd: 0, sol_usd: i < 7 ? 0 : 1000, holdings_updated_at: i < 7 ? null : iso(holdingsAt),
    top_tokens: i < 7 ? [] : [{ symbol: 'REAL', chain: 'solana', usd: 800 }], chains: i < 7 ? [] : [{ chain: 'solana', usd: 1000 }] }));
  const h = harness(async url => {
    if (url.includes('/fomo/data/traders')) return Response.json({ data });
    if (url.includes('/version.json')) return Response.json({ sources: { fomo: iso(rankAt) } });
    throw Error('985 must not be required for the 100-person total board');
  });
  const board = await h.radar.getStmRadarBoard('fomo', 'all');
  assert.equal(board.traders.length, 100); assert.equal(board.source.count, 100); assert.equal(h.calls.length, 2);
  assert.equal(board.traders[0].id, 'wsm:fomo:person1'); assert.equal(board.traders[0].rank, 1); assert.equal(board.traders[0].pnlUsd, 0);
  assert.equal(board.traders[99].rank, 100); assert.equal(board.traders.filter(t => t.holdings.length).length, 93);
  assert.equal(board.traders.filter(t => t.totalValueUsd !== null).length, 93);
  assert.equal(board.traders[0].detailReference, board.traders[0].id); assert.equal(board.traders[0].fomoHandle, 'fomo_99');
  assert.deepEqual(plain(board.traders[0].sourceTraderIds), [board.traders[0].id]);
  assert.equal(board.source.updatedAt, iso(rankAt)); assert.equal(board.traders[0].fieldSources.rank.updatedAt, iso(rankAt));
  assert.equal(board.traders[0].fieldSources.holdings.updatedAt, iso(holdingsAt));
  assert.equal(board.traders[0].chains[0].valueUsd, 1000); assert.equal(board.traders[0].holdings[0].quantity, null);
  assert.equal(board.traders[99].updatedAt, null); assert.equal(board.traders[99].totalValueUsd, null);
  assert.equal(board.traders[0].qualified, false); assert.match(board.traders[0].pnlWindow, /All time/);
});

test('FOMO missing placeholders stay unknown while an explicitly dated zero balance stays zero', () => {
  const normalized = sources.normalizeStmRoster('fomo', { data: [
    { id: 'missing', total_usd: 0, evm_usd: 0, sol_usd: 0, top_tokens: [], chains: [] },
    { id: 'observed', total_usd: 0, holdings_updated_at: iso(old), top_tokens: [], chains: [] },
  ] }, {}, iso(at));
  assert.equal(normalized[0].totalValueUsd, null); assert.equal(normalized[0].updatedAt, null);
  assert.match(normalized[0].pnlWindow, /All time/);
  assert.equal(normalized[1].totalValueUsd, 0); assert.equal(normalized[1].updatedAt, iso(old));
});

test('FOMO period enrichment uses canonical UUID and keeps original period ranks and PnL', async () => {
  const uid = '6fb966e5-ae85-5909-a99e-2ffa041ace5b';
  const boards = { ...fomo, boards: { ...fomo.boards, '7d': [{ uid, handle: 'loop', rank: 8, pnl: 77 }] } };
  const h = harness(async url => url.includes('fomo-leaderboards') ? Response.json(boards) : url.includes('/version.json') ? Response.json({ sources: { fomo: old } })
    : Response.json({ data: [{ id: 'loop-wsm', fomo_id: uid, official_rank: 90, official_pnl_usd: 123456, total_usd: 400, holdings_updated_at: iso(old),
      top_tokens: [{ symbol: 'KNOWN', usd: 300 }], chains: [{ chain: 'solana', usd: 400 }] }] }));
  const board = await h.radar.getStmRadarBoard('fomo', '7d'); const row = board.traders[0];
  assert.equal(row.id, `fomo:${uid}`); assert.equal(row.rank, 8); assert.equal(row.pnlUsd, 77); assert.equal(row.pnlWindow, '7d');
  assert.equal(row.totalValueUsd, 400); assert.equal(row.holdings[0].symbol, 'KNOWN'); assert.equal(row.chains[0].valueUsd, 400);
  assert.equal(row.fieldSources.pnl.sourceId, '985-fomo'); assert.equal(row.fieldSources.holdings.sourceId, 'wsm-fomo');
  assert.deepEqual(plain(row.sourceTraderIds), ['wsm:fomo:loop-wsm']);
  const all = await h.radar.getStmRadarBoard('fomo', 'all'); assert.equal(all.traders[0].rank, 90); assert.equal(all.traders[0].pnlUsd, 123456);
  assert.equal(h.calls.filter(c => c.url.includes('/profile')).length, 0, 'period enrichment must not fan out profile requests');
});

test('stable FOMO WSM detail retains original ID and holdings when 985 cannot prove identity; official 431 is restricted', async () => {
  const h = harness(async url => {
    if (url.includes('prod-api.fomo.family')) return Response.json({ error: 'unauthorized' }, { status: 431 });
    if (url.includes('/profile?')) return Response.json({ ok: true, profile: { handle: 'leo', userId: 'different' }, wallets: {}, trades: [{ side: 'BUY', symbol: 'UNRELATED', usd: 999 }] });
    if (url.includes('/version.json')) return Response.json({ sources: { fomo: old } });
    return Response.json({ data: [{ id: 'leo-wsm', fomo_api_handle: 'leo', official_rank: 5, official_pnl_usd: 100, evm: wallet,
      total_usd: 2000, holdings_updated_at: iso(old), top_tokens: [{ symbol: 'KNOWN', usd: 1000 }], chains: [{ chain: 'base', usd: 2000 }] }] });
  });
  const detail = await h.radar.getStmTraderResearch('fomo', 'wsm:fomo:leo-wsm');
  assert.equal(detail.reference, 'wsm:fomo:leo-wsm'); assert.equal(detail.trader.id, detail.reference);
  assert.equal(detail.trader.holdings[0].symbol, 'KNOWN'); assert.equal(detail.trader.totalValueUsd, 2000); assert.equal(detail.trader.pnlUsd, 100);
  assert.equal(detail.trader.chains[0].valueUsd, 2000); assert.equal(detail.activities.length, 0);
  assert.equal(detail.sources.find(s => s.id === 'fomo-official-profile').status, 'restricted');
  const rejected = detail.sources.find(s => s.id.startsWith('985-fomo-identity:'));
  assert.equal(rejected.status, 'unavailable'); assert.equal(rejected.count, 0); assert.equal(rejected.updatedAt, null);
  assert.match(detail.limitations.join(' '), /无法证明/);
  h.advance(16000); await h.radar.getStmTraderResearch('fomo', 'wsm:fomo:leo-wsm', true);
  assert.equal(h.calls.filter(c => c.url.includes('prod-api.fomo.family')).length, 1, 'official auth boundary probe has five-minute cooldown');
});

test('stale FOMO handle fallback is only a lookup hint and imports activity after exact unique wallet proof', async () => {
  const h = harness(async url => {
    if (url.includes('prod-api.fomo.family')) return new Response(null, { status: 431 });
    if (url.includes('/profile?')) {
      const exact = new URL(url).searchParams.get('handle'), proven = exact === 'frankdegods';
      return Response.json({ ok: true, profile: { handle: exact, name: proven ? 'Verified Frank' : 'Unrelated' }, wallets: proven ? { evm: [wallet], updatedAt: old } : {},
        profitSnapshot: { updatedAt: old - 86400000, items: [{ symbol: 'HISTORY', profitUsd: 70 }] },
        trades: [{ side: 'BUY', symbol: proven ? 'REAL' : 'WRONG', usd: 80, createdAt: iso(at) }] });
    }
    if (url.includes('/version.json')) return Response.json({ sources: { fomo: old } });
    return Response.json({ data: [{ id: 'frank', fomo_api_handle: 'blankotter96565', handle: 'frankdegods', evm: wallet,
      official_rank: 1, official_pnl_usd: 500, total_usd: 1000, holdings_updated_at: iso(old), top_tokens: [{ symbol: 'HISTORIC', usd: 900 }] }] });
  });
  const detail = await h.radar.getStmTraderResearch('fomo', 'wsm:fomo:frank');
  assert.equal(detail.trader.id, 'wsm:fomo:frank'); assert.equal(detail.trader.fomoHandle, 'frankdegods');
  assert.equal(detail.trader.rank, 1); assert.equal(detail.trader.pnlUsd, 500); assert.equal(detail.trader.holdings[0].symbol, 'HISTORIC');
  assert.equal(detail.activities[0].symbol, 'REAL'); assert.equal(detail.activities[0].verified, false); assert.equal(detail.componentUpdatedAt.holdings, iso(old));
  assert.equal(detail.pnlPositions[0].symbol, 'HISTORY');
  assert.equal(detail.componentUpdatedAt.pnl, iso(old - 86400000), '985 historical PnL uses its own snapshot time');
  assert.equal(detail.trader.fieldSources.pnl.updatedAt, iso(old), 'WSM total-ranking PnL keeps its independent source time');
  assert.equal(h.calls.filter(c => c.url.includes('/profile?')).length, 2);
});

test('conflicting canonical FOMO UUID overrides shared wallet and ambiguous wallet matches never join', async () => {
  for (const conflict of [true, false]) {
    const uid = '6fb966e5-ae85-5909-a99e-2ffa041ace5b', other = 'cbfc1810-b3d0-5735-be1c-135bc49749ff';
    const h = harness(async url => url.includes('/profile?') ? Response.json({ ok: true, profile: { handle: 'loop', userId: uid }, wallets: { evm: [wallet] }, trades: [] })
      : url.includes('/version.json') ? Response.json({ sources: { fomo: old } })
        : Response.json({ data: (conflict ? [{ id: 'one', fomo_id: other }] : [{ id: 'one' }, { id: 'two' }]).map(row => ({ ...row, evm: wallet, total_usd: 400,
          holdings_updated_at: iso(old), top_tokens: [{ symbol: 'SHOULD_NOT_JOIN', usd: 400 }] })) }));
    const detail = await h.radar.getStmTraderResearch('fomo', 'loop');
    assert.equal(detail.trader.holdings.length, 0); assert.equal(detail.trader.sourceTraderIds, undefined);
  }
});

test('malformed WSM total revalidation retains all known rows and unknown timestamps', async () => {
  let invalid = false;
  const h = harness(async url => url.includes('/version.json') ? Response.json({ sources: { fomo: old } })
    : Response.json(invalid ? {} : { data: [{ id: 'one', official_rank: 1, total_usd: 0 }] }));
  const before = await h.radar.getStmRadarBoard('fomo', 'all'); invalid = true; h.advance(16000);
  const after = await h.radar.getStmRadarBoard('fomo', 'all', true);
  assert.equal(after.traders.length, 1); assert.equal(after.traders[0].totalValueUsd, null);
  assert.equal(after.source.fetchedAt, before.source.fetchedAt); assert.equal(after.source.status, 'stale'); assert.match(after.source.message, /缺少公开榜单/);
});

test('Hyperliquid ranks each real performance window, normalizes percentage and preserves unknown data time', () => {
  const { radar } = harness();
  const boards = radar.normalizeHlBoards({ leaderboardRows: [
    { ethAddress: wallet, accountValue: '200', windowPerformances: [['day', { pnl: '30', roi: '.15', vlm: '1000' }], ['allTime', { pnl: '1000', roi: '2' }]] },
    { ethAddress: '0x542b6b4cbab54a6ae6aadccd32a24e8c8b75370c', windowPerformances: [['day', { pnl: '100', roi: '.2' }], ['allTime', { pnl: '20', roi: '.02' }]] },
  ] }, iso(at), null);
  assert.equal(boards['24h'].traders[0].pnlUsd, 100);
  assert.equal(boards.all.traders[0].pnlUsd, 1000);
  assert.equal(boards['24h'].traders[1].roi, 15);
  assert.equal(boards['7d'].traders.length, 0);
  assert.equal(boards.all.source.updatedAt, null);
  assert.equal(boards.all.traders[0].updatedAt, null);
  assert.equal(boards.all.traders[0].qualified, false);
});

test('Hyperliquid exact fill direction and signed start quantity classify open/add/reduce/close, omitting crosses', () => {
  const { radar } = harness(), fill = { coin: 'BTC', px: '100', time: at - 100, hash: `0x${'1'.repeat(64)}` };
  const detail = radar.normalizeHlDetail({ time: at, marginSummary: { accountValue: '1000' }, assetPositions: [{ position: { coin: 'BTC', szi: '-3', positionValue: '300', unrealizedPnl: '-2' } }] }, [
    { ...fill, tid: 1, dir: 'Open Long', startPosition: '0', sz: '1' },
    { ...fill, tid: 2, dir: 'Open Long', startPosition: '1', sz: '1' },
    { ...fill, tid: 3, dir: 'Close Short', startPosition: '-3', sz: '1' },
    { ...fill, tid: 4, dir: 'Close Short', startPosition: '-2', sz: '2' },
    { ...fill, tid: 5, dir: 'Short > Long', startPosition: '-2', sz: '3' },
    { ...fill, tid: 6, dir: 'Open Long', startPosition: '-2', sz: '3' },
    { ...fill, tid: 7, dir: 'Close Short', startPosition: '-2', sz: '3' },
  ], wallet, iso(at));
  assert.deepEqual(plain(detail.activities.map(v => v.action)), ['open', 'add', 'reduce', 'close']);
  assert.equal(detail.trader.holdings[0].quantity, 3);
  assert.equal(detail.trader.holdings[0].side, 'short');
  assert.equal(detail.activities[0].valueUsd, 100);
  assert.equal(detail.activities[0].verified, false);
  assert.equal(detail.trader.totalValueUsd, 1000);
});

test('Hyperliquid public array response is preserved through bounded HTTP adapter', async () => {
  const h = harness(async (_url, options) => JSON.parse(options.body).type === 'clearinghouseState'
    ? Response.json({ time: at, assetPositions: [], marginSummary: { accountValue: '20' } })
    : Response.json([{ coin: 'BTC', dir: 'Open Long', startPosition: '0', sz: '1', px: '100', time: at, tid: 1 }]));
  const detail = await h.radar.getStmTraderResearch('hl', wallet);
  assert.equal(detail.activities.length, 1);
  assert.equal(h.calls.length, 2);
  for (const { url, options } of h.calls) { assert.equal(url, 'https://api.hyperliquid.xyz/info'); assert.equal(options.method, 'POST'); }
});

test('Hyperliquid permits verified board size, caches compact rows, and revalidates unchanged upstream via ETag', async () => {
  let reads = 0;
  const h = harness(async (_url, options) => {
    reads++;
    if (reads === 2) { assert.equal(options.headers['If-None-Match'], '"official-etag"'); return new Response(null, { status: 304 }); }
    return Response.json({ leaderboardRows: [{ ethAddress: wallet, windowPerformances: [['allTime', { pnl: '5', roi: '0.1' }]] }] },
      { headers: { 'content-length': '38027021', etag: '"official-etag"', 'last-modified': 'Wed, 25 Nov 2026 08:42:01 GMT' } });
  });
  const first = await h.radar.getStmRadarBoard('hl', 'all');
  assert.equal(first.traders.length, 1);
  h.advance(16000); await h.radar.getStmRadarBoard('hl', 'all', true);
  assert.equal(h.calls.length, 1, 'large-board manual cooldown is sixty seconds');
  h.advance(45000);
  const second = await h.radar.getStmRadarBoard('hl', 'all', true);
  assert.equal(h.calls.length, 2);
  assert.equal(second.source.updatedAt, first.source.updatedAt);
  assert.notEqual(second.checkedAt, first.checkedAt);
  assert.equal(second.traders[0].pnlUsd, 5);
});

test('upstream concurrency slots are reserved before awaiting distributed rate limit', async () => {
  const gates = [];
  const h = harness(async url => Response.json({ code: 200, accounts: [{ l1_address: new URL(url).searchParams.get('value'), positions: [] }] }),
    { database: true, rateLimit: () => new Promise(resolve => gates.push(resolve)) });
  const results = Promise.allSettled(Array.from({ length: 13 }, (_, i) => h.radar.getStmTraderResearch('lighter', `0x${String(i + 1).padStart(40, '0')}`)));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(gates.length, 12);
  assert.equal(h.calls.length, 0);
  gates.forEach(resolve => resolve({ allowed: true }));
  const rows = await results;
  assert.equal(rows.filter(row => row.status === 'fulfilled').length, 12);
  assert.equal(rows.filter(row => row.status === 'rejected').length, 1);
});

test('Lighter actual leaderboard/account fields preserve quantity, unknown account time and zero exclusion', () => {
  const { radar } = harness();
  const board = radar.normalizeLighterBoard({ code: 200, updated_at: at / 1000, entries: [{ rank: 1, l1_address: wallet, account_value: 3118277, pnl: 46808447, roi: 635.118, volume: 389609164 }] }, 'all', iso(at));
  assert.equal(board.source.updatedAt, iso(at));
  assert.equal(board.traders[0].roi, 635.118, 'Lighter ROI is already percent');
  const detail = radar.normalizeLighterDetail({ code: 200, accounts: [{ l1_address: wallet, total_asset_value: '-87831.2', transaction_time: at * 1000,
    positions: [{ symbol: 'HYPE', sign: -1, position: '5063.50', position_value: '297463', unrealized_pnl: '124464' }, { symbol: 'BTC', sign: 1, position: '0.000', position_value: '0' }] }] }, wallet, iso(at));
  assert.equal(detail.trader.holdings.length, 1);
  assert.equal(detail.trader.holdings[0].quantity, 5063.5);
  assert.equal(detail.trader.holdings[0].side, 'short');
  assert.equal(detail.componentUpdatedAt.holdings, null);
  assert.equal(detail.trader.updatedAt, null);
  assert.equal(detail.activities.length, 0);
  assert.equal(detail.trader.totalValueUsd, -87831.2);
});

test('official Binance Web3 schema stays separate from CEX, native balances and historical top earners', () => {
  const { radar } = harness();
  const board = radar.normalizeBinanceWeb3Board({ code: '000000', data: { data: [{ address: sol, addressLabel: 'Public wallet', addressLogo: '/image/avatar.png',
    realizedPnl: '1200', realizedPnlPercent: '12', winRate: '63', totalVolume: '40000', totalTxCnt: 90, balance: '5.2', lastActivity: at,
    topEarningTokens: [{ tokenAddress: sol, tokenSymbol: 'HISTORICAL', realizedPnl: '999' }] }] } }, '7d', iso(at));
  assert.equal(board.traders[0].id, `binance-web3:solana:${sol}`);
  assert.equal(board.traders[0].pnlUsd, 1200);
  assert.equal(board.traders[0].totalValueUsd, null);
  assert.equal(board.traders[0].holdings.length, 0);
  assert.equal(board.traders[0].updatedAt, null);
  assert.equal(board.traders[0].sourceUpdatedAt, null);
  assert.equal(board.traders[0].qualified, false);
  assert.match(board.traders[0].pnlWindow, /7d.*DEX.*已实现/);
  assert.match(board.source.name, /Web3.*Solana.*DEX/);
});

test('oversized body and unsupported windows fail honestly without synthetic rows', async () => {
  const h = harness(async () => new Response('{}', { headers: { 'content-length': '12000001' } }));
  const bad = await h.radar.getStmRadarBoard('fomo', '24h');
  assert.equal(bad.source.status, 'unavailable'); assert.match(bad.source.message, /过大/); assert.equal(bad.traders.length, 0);
  const unsupported = await h.radar.getStmRadarBoard('okx', '24h');
  assert.equal(unsupported.source.status, 'restricted'); assert.equal(unsupported.traders.length, 0);
  await assert.rejects(() => h.radar.getStmTraderResearch('fomo', 'https://internal/secret'), /无效/);
  assert.equal(h.calls.length, 1);
});

test('research routes reject invalid venue, period and URL references before any provider call', async () => {
  let calls = 0;
  const imports = { zod: require('zod'), '@/lib/stm-hunt/radar': { getStmRadarBoard: async () => { calls++; }, getStmTraderResearch: async (venue, reference) => { calls++; return { venue, reference }; } },
    '@/lib/stm-hunt/radar-http': { limitStmResearchRequest: async () => true } };
  const board = load('app/api/stm-hunt/radar/route.ts', imports), detail = load('app/api/stm-hunt/trader/route.ts', imports);
  assert.equal((await board.GET(new Request('https://stm.test/api/stm-hunt/radar?venue=http://internal&period=all'))).status, 400);
  assert.equal((await board.GET(new Request('https://stm.test/api/stm-hunt/radar?venue=fomo&period=90d'))).status, 400);
  assert.equal((await detail.GET(new Request('https://stm.test/api/stm-hunt/trader?venue=fomo&reference=https://internal/secret'))).status, 400);
  assert.equal((await detail.GET(new Request('https://stm.test/api/stm-hunt/trader?venue=hl&reference=badwallet'))).status, 400);
  assert.equal((await board.GET(new Request('https://stm.test/api/stm-hunt/radar?venue=fomo&venue=hl'))).status, 400);
  assert.equal((await board.GET(new Request('https://stm.test/api/stm-hunt/radar?venue=fomo&url=https://internal/secret'))).status, 400);
  assert.equal((await detail.GET(new Request('https://stm.test/api/stm-hunt/trader?venue=fomo&reference=frank&reference=leo'))).status, 400);
  assert.equal((await detail.GET(new Request('https://stm.test/api/stm-hunt/trader?venue=fomo&reference=wsm:fomo:../../secret'))).status, 400);
  assert.equal(calls, 0);
  const stable = await detail.GET(new Request('https://stm.test/api/stm-hunt/trader?venue=fomo&reference=wsm:fomo:frank'));
  assert.equal(stable.status, 200); assert.equal((await stable.json()).reference, 'wsm:fomo:frank'); assert.equal(calls, 1);
});
