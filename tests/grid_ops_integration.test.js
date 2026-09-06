const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("production uploads exclude local trading state and private runtime caches", () => {
  const ignored = new Set(read(".vercelignore").split(/\r?\n/).map(line => line.trim()));
  for (const entry of [".env*", "grid-ops/.state.json", "grid-ops/.state.json.bak-*", "grid-ops/.runtime/", "grid-ops/data/"]) {
    assert.ok(ignored.has(entry), `missing production exclusion: ${entry}`);
  }
});

test("AI grid is renamed and placed immediately before TideSight Quant", () => {
  const header = read("components/platform-header.tsx");
  const gridOps = header.indexOf('{ href: "/grid-ops"');
  const tideSight = header.indexOf('{ href: "/tidesight-quant"');

  assert.ok(gridOps >= 0 && tideSight > gridOps);
  assert.match(header.slice(gridOps, tideSight), /zh: "AI网格"/);
});

test("AI grid Ops route connects safely to the loopback-only trading console", () => {
  const page = read("app/grid-ops/page.tsx");
  const surface = read("components/grid-ops-surface.tsx");
  const config = read("grid-ops/src/config.js");
  const server = read("grid-ops/src/server.js");
  const dashboard = read("grid-ops/public/index.html");
  const manual = read("grid-ops/public/complete-manual.md");
  const renderedManual = read("grid-ops/public/complete-manual-content.html");

  assert.match(page, /GridOpsSurface/);
  assert.match(surface, /http:\/\/127\.0\.0\.1:8080/);
  assert.match(surface, /ENGINE_VERSION = "2\.2\.7"/);
  assert.match(surface, /CONSOLE_API_VERSION = 8/);
  assert.match(surface, /MIN_COMPATIBLE_ENGINE_VERSION = "1\.2\.3"/);
  assert.match(surface, /isCompatibleEngine\(result\)/);
  assert.match(surface, /api\/health\?webVersion=\$\{ENGINE_VERSION\}/);
  assert.match(surface, /controller\.abort\(\), 5000/);
  assert.doesNotMatch(surface, /COMPATIBLE_ENGINE_VERSIONS/);
  assert.match(surface, /先启动本地交易引擎/);
  assert.match(surface, /Ondo Perps \/ Phoenix \/ Nado \/ OKX \/ GRVT \/ RHC Lighter/);
  assert.match(surface, /setInterval\(\(\) => void checkEngine\(false\), 3000\)/);
  assert.match(surface, /src=\{`\$\{ENGINE_URL\}\/\?embedded=1&webVersion=\$\{ENGINE_VERSION\}&reload=\$\{frameVersion\}`\}/);
  assert.doesNotMatch(surface, /target="_blank"/);
  assert.match(dashboard, /id="startup-trigger"/);
  assert.match(dashboard, /id="startup-modal"/);
  assert.match(dashboard, /aria-modal="true"/);
  assert.match(dashboard, /启动本地交易引擎/);
  assert.match(dashboard, /openStartupModal/);
  assert.match(dashboard, /copyStartupCommand/);
  assert.match(dashboard, /checkStartupEngine/);
  assert.match(dashboard, /welinkbtc-onchainmain\.xyz\/downloads\/%E5%90%AF%E5%8A%A8AI/);
  assert.match(dashboard, /event\.key === 'Escape'/);
  assert.match(dashboard, /\.overview-grid \{[\s\S]*?display: flex;[\s\S]*?overflow-x: auto;[\s\S]*?scroll-snap-type: x proximity;/);
  assert.match(dashboard, /\.ov-card \{[\s\S]*?flex: 0 0 286px;[\s\S]*?scroll-snap-align: start;/);
  assert.match(dashboard, /aria-label="交易所总览，可左右滑动查看更多"/);
  assert.match(dashboard, /enableOverviewHorizontalScroll/);
  assert.doesNotMatch(dashboard, /\.overview-grid \{ grid-template-columns:/);
  assert.match(dashboard, /class="header-status-strip" role="region" aria-label="交易所运行状态，可左右滑动"/);
  assert.match(dashboard, /\.header-status-strip \{[\s\S]*?overflow-x: auto;/);
  assert.match(dashboard, /\.header-right > \* \{ flex: 0 0 auto; \}/);
  assert.match(dashboard, /@media \(max-width: 1400px\) \{[\s\S]*?\.header-right \{ grid-column: 1 \/ -1;/);
  assert.match(dashboard, /document\.querySelector\('\.header-status-strip'\)/);
  assert.match(dashboard, /A \/ B 交易所总控制台/);
  assert.match(dashboard, /id="hedge-console-leg-a"/);
  assert.match(dashboard, /id="hedge-console-leg-b"/);
  assert.match(dashboard, /renderHedgeConsoleLeg\('A', payload\)/);
  assert.match(dashboard, /renderHedgeConsoleLeg\('B', payload\)/);
  assert.match(dashboard, /Cycle ID · 双交易所对冲订单历史/);
  assert.match(dashboard, /id="hedge-history-filter"/);
  assert.match(dashboard, /renderHedgeHistory\(payload \|\| \{\}\)/);
  assert.match(dashboard, /hedge-history-legs/);
  assert.match(dashboard, /整体汇总详情/);
  assert.match(dashboard, /id="overview-summary-body"/);
  assert.match(dashboard, /挂单\(实盘\/本地\)/);
  assert.match(dashboard, /<th class="summary-num">余额<\/th>/);
  assert.match(dashboard, /<th class="summary-center">模式 \/ 市场<\/th>/);
  assert.match(dashboard, /<th class="summary-start-head">本次启动参数<\/th>/);
  assert.match(dashboard, /LIVE 回捞<\/th><th class="summary-start-head">本次启动参数/);
  assert.match(dashboard, /summaryStartConfig/);
  assert.match(dashboard, /table-layout: fixed/);
  assert.match(dashboard, /<colgroup>/);
  assert.match(dashboard, /refreshLiveOrders/);
  assert.match(dashboard, /LIVE_ORDER_REFRESH_MS = 300_000/);
  assert.match(dashboard, /id="overview-ladders-title">挂单档位分布/);
  assert.match(dashboard, /id="overview-ladders-grid"/);
  assert.match(dashboard, /renderOverviewOrderLadders/);
  assert.match(dashboard, /refreshOrderLadders/);
  assert.match(dashboard, /ORDER_LADDER_REFRESH_MS = 5_000/);
  assert.match(dashboard, /completedByLevel/);
  assert.match(dashboard, /openByLevel/);
  assert.match(dashboard, /距下边界/);
  assert.match(dashboard, /距上边界/);
  assert.ok(dashboard.indexOf('id="overview-ladders-title"') > dashboard.indexOf('id="overview-summary-body"'));
  assert.ok(dashboard.indexOf('id="overview-ladders-title"') < dashboard.indexOf('AI 市况分析'));
  assert.match(dashboard, /id="overview-emergency-stop"/);
  assert.match(dashboard, /请输入“紧急停撤平”/);
  assert.match(dashboard, /X-Grid-Emergency-Confirm/);
  assert.match(dashboard, /id="overview-filter-mode"/);
  assert.match(dashboard, /仅运行实盘/);
  assert.match(dashboard, /选择交易所/);
  assert.match(dashboard, /visibleExchangeDefinitions/);
  assert.match(dashboard, /toggleOverviewSelection/);
  assert.match(dashboard, /id="guide-modal"/);
  assert.match(dashboard, /使用指南支持/);
  assert.match(dashboard, /id="guide-manual-content"/);
  assert.match(dashboard, /fetch\('\/complete-manual-content\.html'/);
  assert.match(dashboard, /23 个主章节、46 个常见问题/);
  assert.doesNotMatch(dashboard, /打开完整使用手册/);
  assert.doesNotMatch(dashboard, /href="https:\/\/github\.com\/ZAIJIN88\/WGALL-ZJ005"/);
  assert.match(manual, /# 完整使用手册/);
  assert.match(manual, /## 1\. 先理解四个词/);
  assert.match(manual, /## 23\. 最重要的实盘安全清单/);
  assert.match(manual, /# 常见问题/);
  assert.match(manual, /### 46\. RHC LIVE/);
  assert.match(manual, /127\.0\.0\.1:8080/);
  assert.doesNotMatch(manual, /127\.0\.0\.1:8283/);
  assert.doesNotMatch(manual, /referral=ZAIJIN/);
  assert.ok(renderedManual.length > 50_000);
  assert.match(renderedManual, /guide-manual-article/);
  assert.match(renderedManual, /23\. 最重要的实盘安全清单/);
  assert.match(dashboard, /app\.extended\.exchange\/join\/WELINKBTC/);
  assert.match(dashboard, /app\.decibel\.trade\/r\/C5WV3H/);
  assert.match(dashboard, /robinhoodchain\.lighter\.xyz\/\?referral=WELINKBTC/);
  assert.doesNotMatch(dashboard, /robinhoodchain\.lighter\.xyz\/\?referral=ZAIJIN/);
  assert.doesNotMatch(dashboard, /其他内容待定/);
  assert.match(dashboard, /本程序仅供学习和研究/);
  assert.match(dashboard, /id="overview-sentinel-body"/);
  assert.match(dashboard, /交易所分类.*巡检时间.*巡检结果.*状态.*建议.*操作/);
  assert.match(dashboard, /renderOverviewSentinel/);
  assert.match(dashboard, /position\.className = 'ov-position'/);
  assert.match(dashboard, /方向 \/ 数量/);
  assert.match(dashboard, /持仓均价/);
  assert.match(dashboard, /强平价格/);
  assert.match(config, /getConfigFromEnvironment\(process\.env\)/);
  assert.match(config, /source\.HOST \|\| '127\.0\.0\.1'/);
  assert.match(server, /p === '\/api\/health'/);
  assert.match(server, /consoleApiVersion: 8/);
  assert.match(server, /p === '\/api\/overview\/emergency-stop'/);
  assert.match(server, /requireConfirmedClose: true/);
  assert.match(server, /isLoopbackConsoleRequest/);
  assert.match(server, /Access-Control-Allow-Private-Network/);
  for (const surface of ["Decibel", "Extended", "RISEx", "Binance", "Ondo Perps", "Phoenix", "Nado", "OKX", "GRVT", "RHC Lighter", "AI助手", "环境设置", "IP配置"]) {
    assert.match(dashboard, new RegExp(surface));
  }
});

test("AI grid Ops publishes a standalone launcher and correct CMD guidance", () => {
  const surface = read("components/grid-ops-surface.tsx");
  const launcher = read("public/downloads/启动AI网格交易Ops.bat");
  const launcherBytes = fs.readFileSync(path.join(root, "public/downloads/启动AI网格交易Ops.bat"));
  const rootLauncherBytes = fs.readFileSync(path.join(root, "启动AI网格交易Ops.bat"));

  assert.match(surface, /\/downloads\/启动AI网格交易Ops\.bat/);
  assert.match(surface, /cd \/d.*welinkbtc-main.*npm run grid:start/);
  assert.match(surface, /Win \+ R/);
  assert.match(surface, /线上页面不能替你启动电脑上的交易程序/);
  assert.match(surface, /线上服务器托管运行/);
  assert.match(surface, /grid-ops-hosted-console/);
  assert.match(surface, /AI网格交易Ops 与 AI对冲交易Ops 线上托管控制台/);
  assert.doesNotMatch(surface, /classic-grid-surface/);
  assert.match(surface, /RUN_MODE_STORAGE_KEY/);
  assert.ok(surface.includes("C:\\Windows\\System32"));
  assert.match(launcher, /ai-grid-ops-engine\.zip/);
  assert.match(launcher, /%LOCALAPPDATA%\\welinkBTC\\AI-Grid-Ops/);
  assert.match(launcher, /npm --prefix "%ENGINE_DIR%" start/);
  assert.match(launcher, /scripts\\windows-launcher\.ps1/);
  assert.match(launcher, /env\.example/);
  assert.match(launcher, /Downloaded engine package is incomplete/);
  assert.doesNotMatch(launcher, /\bwinget\b/i);
  assert.doesNotMatch(launcher, /start\s+https?:\/\//i);
  assert.ok([...launcherBytes].every((byte) => byte < 128), "launcher content must be ASCII-only for cmd.exe");
  assert.equal(launcherBytes.toString("ascii").replaceAll("\r\n", "").includes("\n"), false, "launcher must use Windows CRLF lines");
  assert.deepEqual(launcherBytes, rootLauncherBytes);
  assert.ok(fs.statSync(path.join(root, "public/downloads/ai-grid-ops-engine.zip")).size > 1000);
  assert.ok(fs.existsSync(path.join(root, "grid-ops/env.example")));
});

test("trading console edits local env safely and reloads paper or live mode", () => {
  const dashboard = read("grid-ops/public/index.html");
  const server = read("grid-ops/src/server.js");
  const envConfig = read("grid-ops/src/env-config.js");
  const manifest = read("grid-ops/src/exchange/manifest.js");
  const instances = read("grid-ops/src/exchange/instances.js");
  const registry = read("grid-ops/src/exchange/registry.js");
  const launcher = read("grid-ops/src/launcher.js");
  const removal = read("grid-ops/src/exchange/instance-removal.js");
  const persist = read("grid-ops/src/persist.js");

  assert.match(dashboard, /本机 \.env 环境设置/);
  assert.match(dashboard, /env-de-mode/);
  assert.match(dashboard, /env-ex-mode/);
  assert.match(dashboard, /env-rs-mode/);
  assert.match(dashboard, /保存并重启本地引擎/);
  assert.equal((dashboard.match(/实盘模式：API 密钥获取与配置/g) || []).length, 5);
  assert.match(dashboard, /geomi\.dev/);
  assert.match(dashboard, /app\.decibel\.trade\/api/);
  assert.match(dashboard, /app\.extended\.exchange/);
  assert.match(dashboard, /API Management/);
  assert.match(dashboard, /RISEX_API_URL/);
  assert.match(dashboard, /initializeExchangeUi/);
  assert.match(dashboard, /\/api\/exchanges/);
  assert.match(dashboard, /不要填写主钱包助记词/);
  assert.match(server, /p === '\/api\/env-config'/);
  assert.match(server, /version: ENGINE_METADATA\.version/);
  assert.match(server, /INSTANCE_MANIFEST\.filter\(\(definition\) => bots\[definition\.key\]\.running\)/);
  assert.match(server, /p === '\/api\/exchanges\/clone'/);
  assert.match(server, /CLONE_AND_RESTART/);
  assert.match(server, /p === '\/api\/exchanges\/delete'/);
  assert.match(server, /inspectExchangeInstanceExposure/);
  assert.match(server, /INSTANCE_HAS_EXPOSURE/);
  assert.match(server, /DELETE_INSTANCE_AND_RESTART/);
  assert.match(instances, /PRIMARY_INSTANCE_REQUIRED/);
  assert.match(removal, /INSTANCE_RISK_CHECK_FAILED/);
  assert.match(removal, /fetchOpenOrders/);
  assert.match(persist, /deleteSnapshot/);
  assert.match(instances, /MAX_EXCHANGE_INSTANCES = 3/);
  assert.match(instances, /EXCHANGE_INSTANCES/);
  assert.match(instances, /isAccountScopedField/);
  assert.match(dashboard, /复制交易所（多账号）/);
  assert.match(dashboard, /删除此多账号实例/);
  assert.match(dashboard, /deleteExchangeInstance/);
  assert.match(dashboard, /instance-switcher/);
  assert.match(dashboard, /arrangeExchangeInstanceUi/);
  assert.match(manifest, /key: 'bn'.*name: 'Binance'.*defaultNetwork: 'testnet'/);
  assert.match(manifest, /BINANCE_API_KEY/);
  assert.match(registry, /bn: createBinance/);
  assert.match(manifest, /key: 'op'.*name: 'Ondo Perps'.*defaultNetwork: 'testnet'/);
  assert.match(manifest, /ONDO_KEY_ID/);
  assert.match(registry, /op: createOndoPerps/);
  assert.match(manifest, /key: 'ph'.*name: 'Phoenix'.*defaultNetwork: 'mainnet'/);
  assert.match(manifest, /PHOENIX_PRIVATE_KEY/);
  assert.match(manifest, /PHOENIX_SOLANA_RPC/);
  assert.match(manifest, /requiredLiveAnyOf/);
  assert.match(registry, /ph: createPhoenix/);
  assert.match(manifest, /key: 'nd'.*name: 'Nado'.*defaultNetwork: 'mainnet'/);
  assert.match(manifest, /NADO_PRIVATE_KEY/);
  assert.match(manifest, /NADO_INK_RPC/);
  assert.match(manifest, /NADO_BTC_PRODUCT_ID/);
  assert.match(registry, /nd: createNado/);
  assert.match(registry, /validateExchangeAdapter/);
  assert.match(server, /p === '\/api\/exchanges\/template'/);
  assert.match(server, /p === '\/api\/overview\/refresh-live'/);
  assert.match(server, /refreshLiveOrderSnapshots/);
  assert.match(server, /ordersSyncedAt/);
  assert.match(server, /position: s\.position/);
  assert.match(server, /gridCount: s\.grid\?\.count/);
  assert.match(server, /completedByLevel: s\.completedByLevel/);
  assert.match(server, /openByLevel: s\.openByLevel/);
  assert.match(server, /recentFills: Array\.isArray\(s\.fills\)/);
  assert.match(launcher, /RELOAD_EXIT_CODE = 75/);
  const bot = read("grid-ops/src/bot.js");
  assert.match(bot, /liquidationPrice:/);
  assert.match(bot, /async refreshExchangeOpenOrders\(\)/);
  assert.match(bot, /This deliberately does not reconcile\/adopt\/cancel\/reseed anything/);
  assert.match(dashboard, /交易所接入中心/);
  assert.match(dashboard, /copyExchangeTemplate/);
  assert.match(dashboard, /id="network-route-diagnostics"/);
  assert.match(dashboard, /\$\('network-route-diagnostics'\) \|\| \$\('ip-test-result'\)\?\.closest/);
  assert.doesNotMatch(dashboard, /includes\('代理连接测试'\)/);
  assert.match(dashboard, /const exchangeUiReady = initializeExchangeUi\(\)/);
  assert.match(dashboard, /await exchangeUiReady/);
  assert.doesNotMatch(dashboard, /new EventSource\(`\/api\/\$\{prefix\}\/stream`\)/);
  assert.match(dashboard, /setInterval\(pollState, 1500\)/);
  assert.match(dashboard, /initialState\?\.config\?\.marketId/);
  assert.match(dashboard, /P\('lower'\)\.value = config\.lower/);
  assert.match(server, /process\.exit\(75\)/);
  assert.match(envConfig, /切换 live 前请填写/);
  assert.match(envConfig, /maskSecret/);
});

test("Extended signs current account fees and refreshes only after explicit fee rejection", () => {
  const extended = read("grid-ops/src/exchange/ex/extended.js");
  const bot = read("grid-ops/src/bot.js");
  const manifest = read("grid-ops/src/exchange/manifest.js");

  assert.match(extended, /\/api\/v1\/user\/fees/);
  assert.match(extended, /makerFeeRate/);
  assert.match(extended, /takerFeeRate/);
  assert.match(extended, /isInvalidTradingFeeError/);
  assert.match(extended, /if \(!allowFeeRefreshRetry \|\| !isInvalidTradingFeeError\(error\)\) throw error/);
  assert.match(extended, /return this\._submitOrderOnce\(m, order\)/);
  assert.match(extended, /安全上限 EXTENDED_MAX_FEE=/);
  assert.match(bot, /preflightTrading\(this\.config\.marketId, \{ config: this\.config, risk: this\.risk \}\)/);
  assert.match(manifest, /手续费安全上限（实际费率自动读取）/);
});

test("AI assistant explains every provider and how to obtain a local API key", () => {
  const dashboard = read("grid-ops/public/index.html");
  const provider = read("grid-ops/src/ai/provider.js");
  const service = read("grid-ops/src/ai/service.js");
  const server = read("grid-ops/src/server.js");

  assert.match(dashboard, /服务商与 Key 配置获取（详细说明）/);
  for (const provider of [
    "OpenAI", "DeepSeek", "Kimi", "通义千问", "智谱 GLM", "SiliconFlow",
    "OpenRouter", "Anthropic Claude", "Google Gemini", "xAI Grok", "Ollama（本地）",
  ]) {
    assert.match(dashboard, new RegExp(provider));
  }
  assert.match(dashboard, /platform\.openai\.com\/api-keys/);
  assert.match(dashboard, /platform\.deepseek\.com\/api_keys/);
  assert.match(dashboard, /aistudio\.google\.com\/app\/apikey/);
  assert.match(dashboard, /openrouter\.ai\/settings\/keys/);
  assert.match(dashboard, /ollama-local/);
  assert.match(dashboard, /Key 只写入当前电脑的 <code>\.env<\/code> 文件/);
  assert.match(dashboard, /仅测试本机直连/);
  assert.match(dashboard, /清空 AI 独立代理/);
  assert.match(dashboard, /aiTestDirect/);
  assert.match(provider, /proxyOverride/);
  assert.match(service, /selectNetworkRoute/);
  assert.match(server, /body\?\.direct === true/);
});

test("IP settings links to the proxy provider and diagnoses wrong HTTPS or SOCKS5 schemes", () => {
  const dashboard = read("grid-ops/public/index.html");
  const proxy = read("grid-ops/src/proxy.js");
  const config = read("grid-ops/src/config.js");

  assert.match(dashboard, /href="https:\/\/panel\.proxyline\.net\/"/);
  assert.match(dashboard, /获取代理IP/);
  assert.match(dashboard, /修复为 HTTP 前缀并写入 \.env/);
  assert.match(dashboard, /maskProxyDisplay/);
  assert.match(proxy, /刚写入的配置无需重启即可检测/);
  assert.match(proxy, /普通 HTTP CONNECT/);
  assert.match(proxy, /HTTPS\/TLS 代理连接/);
  assert.match(proxy, /enteredProtocol/);
  assert.match(proxy, /detectedProtocol: 'http'/);
  assert.match(proxy, /directAvailable/);
  assert.match(dashboard, /改用本机直连并立即生效/);
  assert.match(dashboard, /useDirectExchange/);
  assert.match(dashboard, /一键检测全部链路/);
  assert.match(dashboard, /本机直连 → 服务独立代理 → 全局代理/);
  assert.match(config, /proxySource/);
  assert.doesNotMatch(config, /process\.env\.HTTPS_PROXY\s*\|\|\s*process\.env\.HTTP_PROXY/);
  assert.match(proxy, /installRouteAwareFetch/);
  assert.match(proxy, /createAptosClientProvider/);
  assert.match(proxy, /selectNetworkRoute/);
  assert.match(proxy, /checkGlobalProxyReadiness/);
});

test("network diagnostics expose route-aware AI and exchange checks without secrets", () => {
  const server = read("grid-ops/src/server.js");
  const provider = read("grid-ops/src/ai/provider.js");

  assert.match(server, /p === '\/api\/network-diagnostics'/);
  assert.match(server, /ambientProxyIgnored/);
  assert.match(provider, /effectiveProxy/);
  assert.match(provider, /proxySource/);
});

test("upstream grid engine is bundled locally with no GitHub runtime dependency", () => {
  const upstream = read("grid-ops/UPSTREAM.md");
  const server = read("grid-ops/src/server.js");
  const launcher = read("public/downloads/启动AI网格交易Ops.bat");

  assert.match(upstream, /github\.com\/ZAIJIN88\/3xx-wangge/);
  assert.match(upstream, /完整展开并保存在本项目/);
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/de/decibel.js")));
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/ex/extended.js")));
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/rs/risex.js")));
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/binance/binance.js")));
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/ondo/ondo.js")));
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/phoenix/phoenix.js")));
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/phoenix/paper.js")));
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/nado/nado.js")));
  assert.ok(fs.existsSync(path.join(root, "grid-ops/src/exchange/nado/paper.js")));
  assert.doesNotMatch(server + launcher, /github\.com\/ZAIJIN88\/3xx-wangge/);
});

test("the standard local commands start both the site and grid service", () => {
  const pkg = JSON.parse(read("package.json"));
  const enginePkg = JSON.parse(read("grid-ops/package.json"));
  const runner = read("scripts/run-with-grid.mjs");
  const launcher = read("启动AI网格交易Ops.bat");

  assert.equal(pkg.scripts.dev, "node scripts/run-with-grid.mjs dev");
  assert.equal(pkg.scripts.start, "node scripts/run-with-grid.mjs start");
  assert.equal(pkg.scripts["grid:start"], "npm --prefix grid-ops start");
  assert.equal(enginePkg.scripts.preflight, "node src/preflight.js");
  assert.match(runner, /path\.join\(root, "grid-ops", "src", "launcher\.js"\)/);
  assert.match(runner, /127\.0\.0\.1:8080\/api\/overview/);
  assert.match(launcher, /npm --prefix "%ENGINE_DIR%" run preflight/);
  assert.doesNotMatch(launcher, /network_preflight_failed|trading bot was NOT started/i);
  assert.match(launcher, /Network warnings do not block IP configuration/);
  assert.doesNotMatch(read("grid-ops/src/preflight.js"), /process\.exit\(1\)/);
  assert.doesNotMatch(read("components/grid-ops-surface.tsx"), /result\.networkReady !== false/);
  assert.match(read("grid-ops/src/server.js"), /LIVE_ROUTE_UNAVAILABLE/);
});
