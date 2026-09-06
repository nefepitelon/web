const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("AIClassic grid is grouped in the first-level Products menu", () => {
  const header = read("components/platform-header.tsx");
  const primaryNav = header.match(/const primaryNav = \[[\s\S]*?\] as const;/)?.[0] ?? "";
  const products = header.match(/const productLinks:[\s\S]*?const collaborationLinks:/)?.[0] ?? "";
  assert.doesNotMatch(primaryNav, /\/classic-grid/);
  assert.match(products, /href: "\/classic-grid"/);
  assert.match(read("app/classic-grid/page.tsx"), /ClassicGridSurface/);
});

test("upstream source is pinned inside the project and never loaded from GitHub at runtime", () => {
  assert.ok(fs.existsSync(path.join(root, "classic-grid/src/loop.ts")));
  assert.ok(fs.existsSync(path.join(root, "classic-grid/public/index.html")));
  assert.match(read("classic-grid/WELINKBTC.md"), /d36446bc46185853dd9ea551647bf9420ba07fcb/);
  const runtimeFiles = [
    "components/classic-grid-surface.tsx",
    "app/classic-grid-console/route.ts",
    "lib/classic-grid/workflow.ts"
  ].map(read).join("\n");
  assert.doesNotMatch(runtimeFiles, /github\.com|git clone|127\.0\.0\.1:8088/);
});

test("server runner persists only encrypted runtime state per user", () => {
  const schema = read("prisma/schema.prisma");
  const route = read("app/api/classic-grid/config/route.ts");
  const workflow = read("lib/classic-grid/workflow.ts");
  assert.match(schema, /model ClassicGridBot[\s\S]*userId\s+String\s+@unique/);
  assert.match(route, /encryptTradingSecret/);
  assert.match(route, /start\(classicGridWorkflow/);
  assert.match(workflow, /"use workflow"/);
  assert.match(workflow, /"use step"/);
  assert.match(workflow, /runClassicGridTick\.maxRetries = 0/);
  assert.match(workflow, /serveDashboard: false/);
});

test("environment editor covers the full template and saves through a browser-local encrypted vault", () => {
  const schema = read("components/classic-grid-environment-schema.ts");
  const store = read("components/classic-grid-environment-store.ts");
  const surface = read("components/classic-grid-surface.tsx");
  for (const key of [
    "DRY_RUN", "LIVE_CONFIRM", "VENUES", "MARKETS", "TICK_MS", "GRID_LEVERAGE",
    "GRID_MARGIN_FRAC", "GRID_HALF_BAND", "DASHBOARD_PORT", "GRID_SKIP_LEVERAGE",
    "SOFT_RESUME", "EXTENDED_API_KEY", "EXTENDED_STARK_PRIVATE_KEY",
    "EXTENDED_STARK_PUBLIC_KEY", "EXTENDED_VAULT_ID", "EXTENDED_VAULT",
    "EXTENDED_API_URL", "EXTENDED_USE_PROXY", "EXTENDED_PROXY", "EXTENDED_LEVERAGE",
    "EXTENDED_ORDER_GAP_MS", "RISEX_ACCOUNT", "RISEX_SIGNER_KEY", "RISEX_API_URL",
    "RISEX_WS_URL", "RISE_ORDER_GAP_MS", "RISE_SKIP_LEVERAGE", "RISEX_LEVERAGE",
    "RISEX_HALF_BAND", "DECIBEL_ACCOUNT_PRIVATE_KEY", "DECIBEL_API_KEY",
    "DECIBEL_SUBACCOUNT", "DECIBEL_GAS_STATION_API_KEY", "DECIBEL_LEVERAGE",
    "DECIBEL_EQUITY_USD", "DECIBEL_HALF_BAND", "N1_KEYPAIR_PATH", "N1_APP_PUBLIC_KEY",
    "N1_API_URL", "N1_SOLANA_RPC", "N1_TRADING_ARMED", "N1_LEVERAGE", "N1_EQUITY_USD",
    "N1_HALF_BAND", "PHOENIX_PRIVATE_KEY", "PHOENIX_KEYPAIR_PATH", "PHOENIX_API_URL",
    "PHOENIX_SOLANA_RPC", "PHOENIX_ORDER_GAP_MS", "PHOENIX_CU_LIMIT", "PHOENIX_LEVERAGE",
    "PHOENIX_HALF_BAND", "PHOENIX2_PRIVATE_KEY", "PHOENIX2_KEYPAIR_PATH",
    "PHOENIX2_API_URL", "PHOENIX2_SOLANA_RPC", "PHOENIX2_LEVERAGE",
    "PHOENIX2_HALF_BAND", "NADO_PRIVATE_KEY", "NADO_KEY_PATH", "NADO_ADDRESS",
    "NADO_SUBACCOUNT", "NADO_BTC_PRODUCT_ID", "NADO_INK_RPC", "NADO_ORDER_GAP_MS",
    "NADO_LEVERAGE", "NADO_HALF_BAND", "POPDEX_PRIVATE_KEY", "POPDEX_KEY_PATH",
    "POPDEX_ADDRESS", "POPDEX_SYMBOL", "POPDEX_EQUITY_USD", "POPDEX_GRID_COUNT",
    "POPDEX_LEVERAGE", "POPDEX_HALF_BAND", "POPDEX_ORDER_GAP_MS", "TELEGRAM_ENABLED",
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_IDS"
  ]) assert.match(schema, new RegExp(`key: "${key}"`));
  assert.match(store, /indexedDB\.open/);
  assert.match(store, /AES-GCM/);
  assert.match(store, /generateKey\([\s\S]*false, \["encrypt", "decrypt"\]/);
  assert.doesNotMatch(store, /fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(surface, /saveClassicGridEnvironmentLocally/);
  assert.match(surface, /loadClassicGridEnvironmentLocally\(storageScope\)/);
});

test("VENUES uses fixed-order checkboxes and cannot be mistyped", () => {
  const schema = read("components/classic-grid-environment-schema.ts");
  const dialog = read("components/classic-grid-environment-dialog.tsx");
  const ordered = ["extended", "risex", "decibel", "n1", "phoenix", "phoenix2", "nado", "popdex"];
  let previous = -1;
  for (const venue of ordered) {
    const index = schema.indexOf(`value: "${venue}"`);
    assert.ok(index > previous, `${venue} must follow the canonical VENUES order`);
    previous = index;
  }
  assert.match(dialog, /type="checkbox"/);
  assert.match(dialog, /props\.onFieldChange\("VENUES", ordered\.join\(","\)\)/);
  assert.match(dialog, /VENUES=\{CLASSIC_GRID_VENUE_OPTIONS/);
  assert.match(schema, /field\.key === "VENUES" \? orderedClassicGridVenueValue/);
});

test("configuration guide exposes all requested tables and clickable exchange links", () => {
  const surface = read("components/classic-grid-surface.tsx");
  const guide = read("components/classic-grid-guide-dialog.tsx");
  assert.match(surface, /配置说明/);
  assert.match(surface, /ClassicGridGuideDialog/);
  for (const heading of ["等差网格解释", "交易所注册链接", "功能一览", "常见问题 FAQ", "默认参数（可改）"]) {
    assert.match(guide, new RegExp(heading.replace(/[（）]/g, ".")));
  }
  for (const href of [
    "https://app.extended.exchange/join/WELINKBTC",
    "https://rise.trade/",
    "https://app.decibel.trade/r/C5WV3H",
    "https://app.n1.xyz/r/orderly-loop-curve",
    "https://phoenix.trade/?code=GN4RELUC",
    "https://app.nado.xyz?join=0qvxvdx",
    "https://app.popdex.xyz/referral?referralCode=WELINKBTC"
  ]) assert.match(guide, new RegExp(href.replace(/[.?]/g, "\\$&")));
  assert.match(guide, /target="_blank"/);
  assert.match(guide, /rel="noopener noreferrer"/);
  assert.match(guide, /SOFT_RESUME/);
  assert.match(guide, /GRID_MARGIN_FRAC/);
});

test("AIClassic uses an Ops-style overview and exposes all eight venue consoles", () => {
  const surface = read("components/classic-grid-surface.tsx");
  const venueConsole = read("components/classic-grid-venue-console.tsx");
  const route = read("app/classic-grid-console/route.ts");
  assert.match(surface, /AIClassic 网格控制台导航/);
  assert.match(surface, /八所网格总看板/);
  assert.match(surface, /配置说明/);
  assert.match(surface, /环境配置/);
  assert.match(surface, /ClassicGridVenueConsole/);
  for (const venue of ["extended", "risex", "decibel", "n1", "phoenix", "phoenix2", "nado", "popdex"]) {
    assert.match(venueConsole, new RegExp(`id: "${venue}"`));
  }
  assert.match(venueConsole, /\/api\/classic-grid\/snapshot/);
  assert.match(venueConsole, /网格运行参数/);
  assert.match(venueConsole, /挂单档位分布/);
  assert.match(venueConsole, /活跃挂单明细/);
  assert.match(venueConsole, /onPauseChange/);
  assert.match(route, /classic-grid-embedded/);
});

test("mutating APIs enforce same-origin, membership, 2FA live gate, and explicit live confirmation", () => {
  const config = read("app/api/classic-grid/config/route.ts");
  const pause = read("app/api/classic-grid/pause/route.ts");
  for (const source of [config, pause]) {
    assert.match(source, /assertSameOrigin\(request\)/);
    assert.match(source, /requireAlphaOperator/);
  }
  assert.match(config, /requireAlphaOperator\(\{ live: true \}\)/);
  assert.match(config, /ENABLE CLASSIC GRID LIVE/);
  assert.match(config, /acknowledgeNoWithdrawals/);
});

test("classic engine hardening prevents public unauthenticated control and dashboard injection", () => {
  const dashboard = read("classic-grid/src/dashboard.ts");
  const html = read("classic-grid/public/index.html");
  const packageJson = JSON.parse(read("classic-grid/package.json"));
  assert.match(dashboard, /127\.0\.0\.1/);
  assert.match(dashboard, /DASHBOARD_AUTH_TOKEN/);
  assert.match(dashboard, /timingSafeEqual/);
  assert.match(dashboard, /64 \* 1024/);
  assert.match(html, /function esc\(/);
  assert.match(html, /esc\(v\.lastError/);
  assert.equal(packageJson.overrides.ws, "8.21.3");
  assert.equal(packageJson.dependencies["bigint-buffer"], "file:vendor/bigint-buffer-1.1.6.tgz");
});

test("Extended and RISEx vendor entries are statically bundled for the production workflow", () => {
  const extendedExecutor = read("classic-grid/src/venues/extended.ts");
  const risexExecutor = read("classic-grid/src/venues/risex.ts");
  const stats = read("classic-grid/src/officialStats.ts");
  assert.match(extendedExecutor, /import \{ createExchange \} from "\.\.\/\.\.\/vendor\/extended\/exchange\/index\.js"/);
  assert.match(stats, /import \{ createExchange as createExtendedExchange \} from "\.\.\/vendor\/extended\/exchange\/index\.js"/);
  assert.match(risexExecutor, /import \{ createExchange \} from "\.\.\/\.\.\/vendor\/risex\/index\.js"/);
  assert.match(stats, /import \{ createExchange as createRisexExchange \} from "\.\.\/vendor\/risex\/index\.js"/);
  assert.doesNotMatch(extendedExecutor, /import\(pathToFileURL\(vendor\)\.href\)/);
  assert.doesNotMatch(risexExecutor, /pathToFileURL|fileURLToPath|import\(pathToFileURL/);
  assert.doesNotMatch(stats, /vendor\/extended[\s\S]{0,160}import\(pathToFileURL\(vendor\)\.href\)/);
  assert.doesNotMatch(stats, /vendor\/risex[\s\S]{0,160}import\(pathToFileURL\(vendor\)\.href\)/);
});

test("all live venue adapters use statically discoverable module imports", () => {
  const adapterFiles = fs
    .readdirSync(path.join(root, "classic-grid/src/venues"))
    .filter((name) => name.endsWith(".ts"));
  const runtime = adapterFiles.map((name) => read(`classic-grid/src/venues/${name}`)).join("\n");
  assert.doesNotMatch(runtime, /pathToFileURL|fileURLToPath|createRequire/);
  for (const match of runtime.matchAll(/\bimport\(([^)]*)\)/g)) {
    assert.match(match[1].trim(), /^(?:"[^"]+"|'[^']+')$/, `dynamic module expression: ${match[0]}`);
  }
});

test("cloud configuration blocks arbitrary endpoints while supporting all eight venues", () => {
  const config = read("lib/classic-grid/config.ts");
  for (const venue of ["extended", "risex", "decibel", "n1", "phoenix", "phoenix2", "nado", "popdex"]) {
    assert.match(config, new RegExp(`"${venue}"`));
  }
  assert.match(config, /不允许的配置项/);
  assert.match(config, /validateEndpoint\(env, "EXTENDED_API_URL"[\s\S]*\["extended\.exchange"\]/);
  assert.match(config, /validateEndpoint\(env, "NADO_INK_RPC"[\s\S]*\["inkonchain\.com"\]/);
  assert.match(config, /parsed\.username \|\| parsed\.password/);
});

test("dashboard reports the real enabled set and renders all eight venues", () => {
  const surface = read("components/classic-grid-surface.tsx");
  const snapshot = read("app/api/classic-grid/snapshot/route.ts");
  const dashboard = read("classic-grid/public/index.html");
  assert.match(surface, /已启用.*CLASSIC_GRID_VENUE_COUNT/);
  assert.doesNotMatch(surface, /服务器运行中 · Extended \/ RISEx/);
  assert.match(snapshot, /enabledVenues/);
  assert.match(snapshot, /supportedVenues: CLASSIC_GRID_VENUES/);
  assert.match(dashboard, /八所状态汇总/);
  assert.match(dashboard, /const ORDER = \["extended", "risex", "decibel", "n1", "phoenix", "phoenix2", "nado", "popdex"\]/);
  assert.match(dashboard, /未启用/);
  assert.match(dashboard, /enabledIds/);
  assert.match(dashboard, /方向及杠杆/);
  assert.match(dashboard, /当前仓位\(U\)/);
  assert.match(dashboard, /实时数据回捞/);
  assert.match(dashboard, /官方已实现盈亏 − 官方手续费/);
});

test("official daily statistics are persisted and can be refreshed on demand", () => {
  const workflow = read("lib/classic-grid/workflow.ts");
  const dashboard = read("classic-grid/src/dashboard.ts");
  const ledger = read("classic-grid/src/ledger.ts");
  const stats = read("classic-grid/src/officialStats.ts");
  const refresh = read("app/api/classic-grid/refresh/route.ts");
  const snapshot = read("app/api/classic-grid/snapshot/route.ts");
  assert.match(workflow, /forceStatsRefresh/);
  assert.match(workflow, /refreshOfficialStats/);
  assert.match(workflow, /runtimeState: \{ ledger:/);
  assert.match(stats, /summarizeOfficialStats/);
  assert.match(stats, /realizedPnl - fees/);
  assert.match(dashboard, /recordOfficialDayStatistics/);
  assert.match(ledger, /officialNetPnl/);
  assert.match(ledger, /position\?: number/);
  assert.match(refresh, /assertSameOrigin\(request\)/);
  assert.match(refresh, /requireAlphaOperator/);
  assert.match(refresh, /statsRefreshRequestedAt/);
  assert.match(refresh, /wakeUp/);
  assert.match(snapshot, /runtimeState: _runtimeState/);
});
