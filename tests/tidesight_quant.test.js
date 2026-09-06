const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("TideSight Quant is a renamed first-level navigation entry and owns a first-class route", () => {
  const header = read("components/platform-header.tsx");
  const primary = header.match(/const primaryNav = \[[\s\S]*?\] as const;/)?.[0] ?? "";
  const page = read("app/tidesight-quant/page.tsx");

  assert.match(primary, /href: "\/tidesight-quant", zh: "观潮量化"/);
  assert.match(page, /TideSightQuantSurface/);
  assert.match(page, /canUnlockLive/);
  assert.match(page, /viewer\?\.role === "admin" && viewer\.twoFactorEnabled && viewer\.twoFactorPassed/);
});

test("MACD monitor is an independent TideSight navigation page", () => {
  const surface = read("components/tidesight-quant-surface.tsx");
  const macdPage = read("app/tidesight-quant/macd/page.tsx");
  const overview = surface.match(/const renderOverview = \(\) => \([\s\S]*?const renderResearch/)?.[0] ?? "";

  assert.match(surface, /href: "\/tidesight-quant\/macd"/);
  assert.match(surface, /zh: "MACD 多周期"/);
  assert.match(surface, /activeTab === "macd" \? <TideSightMacdBoard/);
  assert.doesNotMatch(overview, /TideSightMacdBoard/);
  assert.match(macdPage, /initialTab="macd"/);
  assert.match(macdPage, /MACD 多周期监控信号/);
});

test("TideSight surface exposes the unified control-plane sequence", () => {
  const surface = read("components/tidesight-quant-surface.tsx");

  assert.match(surface, /WELINKBTC 信号/);
  assert.match(surface, /Freqtrade \/ Jesse/);
  assert.match(surface, /目标仓位/);
  assert.match(surface, /风险否决/);
  assert.match(surface, /唯一执行/);
  assert.match(surface, /交易所子账户/);
  assert.match(surface, /对账与审计/);
  assert.match(surface, /POST \/api\/tidesight\/signals/);
});

test("public market pulse is live, bounded, and fails without invented fallback values", () => {
  const route = read("app/api/tidesight/market/route.ts");
  const universe = read("lib/tidesight/market-universe.ts");

  assert.match(route, /fapi\.binance\.com/);
  assert.match(route, /AbortController/);
  assert.match(route, /15_000/);
  assert.match(route, /source: "BINANCE_FUTURES"/);
  assert.match(route, /universe: "TIDESIGHT_FEATURED_12"/);
  assert.match(route, /premiumIndexRows|premiumRows/);
  assert.match(route, /markets: \[\]/);
  assert.doesNotMatch(route, /fallback|mockPrice|demoPrice/i);
  for (const symbol of ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "ZECUSDT", "TAOUSDT", "ENAUSDT", "ONDOUSDT", "UNIUSDT", "XRPUSDT", "SUIUSDT", "HYPEUSDT"]) {
    assert.match(universe, new RegExp(`symbol: "${symbol}"`));
  }
});

test("external strategy signals cannot request live execution", () => {
  const route = read("app/api/tidesight/signals/route.ts");

  assert.match(route, /provider: z\.enum\(\["freqtrade", "jesse", "welinkbtc", "custom"\]\)/);
  assert.match(route, /mode: z\.literal\("paper"\)/);
  assert.doesNotMatch(route, /mode: z\.enum\(\[[^\]]*"live"/);
  assert.match(route, /approveTradeIntent/);
  assert.match(route, /executionRequiresAuthenticatedConfirmation: true/);
  assert.match(route, /External strategy keys can never create a live intent/);
});

test("strategy webhook authentication reuses revocable WELINKBTC API keys", () => {
  const access = read("lib/tidesight/access.ts");

  assert.match(access, /Bearer\\s\+\(wlb_live_/);
  assert.match(access, /createHmac\("sha256", signingKey\)/);
  assert.match(access, /revokedAt: null/);
  assert.match(access, /lastUsedAt: now/);
  assert.match(access, /TideSight 策略信号入口需要 Max 权限/);
});

test("live controls preserve 2FA, withdrawal, reconciliation, and kill-switch gates", () => {
  const surface = read("components/tidesight-quant-surface.tsx");

  assert.doesNotMatch(surface, /ENABLE LIVE TRADING|unlock\.phrase/);
  assert.match(surface, /acknowledgeRealFunds/);
  assert.match(surface, /acknowledgeNoWithdrawPermission/);
  assert.match(surface, /\/api\/tidesight\/execution\/reconcile/);
  assert.match(surface, /\/api\/tidesight\/execution\/kill-switch/);
  assert.match(surface, /提现与划转权限永久关闭/);
  assert.match(surface, /先长期 PAPER 验证，再小额 LIVE/);
});

test("TideSight exposes only PAPER and LIVE while keeping LIVE behind the admin interlock", () => {
  const surface = read("components/tidesight-quant-surface.tsx");
  const modeBar = surface.match(/<section className=\{styles\.modeBar\}[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(surface, /type TideSightMode = "paper" \| "live"/);
  assert.match(modeBar, /\["paper", "live"\]/);
  assert.doesNotMatch(modeBar, /mock_exchange|testnet|SHADOW|TESTNET/);
  assert.match(surface, /PRODUCTION LIVE/);
  assert.doesNotMatch(surface, /BINANCE TESTNET/);
});

test("MACD monitor covers twelve assets, six timeframes, closed candles, and the three requested signals", () => {
  const board = read("components/tidesight-macd-board.tsx");
  const chart = read("components/tidesight-macd-chart.tsx");
  const route = read("lib/tidesight/macd-data.ts");
  const chartRoute = read("app/api/tidesight/macd/chart/route.ts");
  const engine = read("lib/tidesight/macd.ts");
  const universe = read("lib/tidesight/market-universe.ts");

  assert.match(universe, /TIDESIGHT_MACD_MARKETS = TIDESIGHT_FEATURED_MARKETS/);
  assert.doesNotMatch(universe, /DOGEUSDT/);
  for (const timeframe of ["1M", "1w", "1d", "4h", "1h", "15m"]) assert.match(universe, new RegExp(`interval: "${timeframe}"`));
  assert.match(route, /limit=260/);
  assert.match(route, /Number\(row\[6\]\) < now/);
  assert.match(route, /Promise\.allSettled/);
  assert.match(route, /expiresAt: Date\.now\(\) \+ 55_000/);
  assert.match(route, /fast: 12, slow: 26, signal: 9, closedCandlesOnly: true/);
  assert.match(engine, /REBIRTH_GOLDEN_CROSS/);
  assert.match(engine, /GOLDEN_CROSS/);
  assert.match(engine, /DEATH_CROSS/);
  assert.match(board, /MACD 多周期监控信号/);
  assert.match(board, /死亡黄金十字交叉/);
  assert.match(board, /60_000/);
  assert.match(board, /技术指标监控，不构成交易建议/);
  assert.match(board, /TideSightMacdChart/);
  assert.match(chart, /多周期 MACD 实时图表/);
  assert.match(chart, /data-testid="macd-realtime-chart"/);
  assert.match(chart, /TIDESIGHT_MACD_MARKETS\.map/);
  assert.match(chart, /TIDESIGHT_MACD_INTERVALS\.map/);
  assert.match(chart, /60_000/);
  assert.match(chartRoute, /limit=260/);
  assert.match(chartRoute, /buildMacdChartSeries/);
  assert.match(chartRoute, /Number\(row\[6\]\) < now/);
  assert.match(chartRoute, /closedCandlesOnly: true/);
  assert.match(chartRoute, /cache\.set\(key, \{ expiresAt: Date\.now\(\) \+ 55_000/);
});

test("TideSight visual system supports responsive, reduced-motion, and light themes", () => {
  const css = read("components/tidesight-quant-surface.module.css");

  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:global\(html\[data-theme="light"\]\) \.page/);
  assert.match(css, /--ts-teal: #46e4d0/);
  assert.match(css, /@keyframes chartDraw/);
});
