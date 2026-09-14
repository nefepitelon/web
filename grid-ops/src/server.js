// Config-driven multi-exchange server. Exchange routes, overview, SSE, live
// checks and dashboard metadata all come from the central exchange manifest.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, ROOT } from './config.js';
import { createRegisteredExchanges, publicExchangeManifest } from './exchange/registry.js';
import { EXCHANGE_MANIFEST as BASE_EXCHANGE_MANIFEST, exchangeOnboardingTemplate } from './exchange/manifest.js';
import {
  EXCHANGE_INSTANCE_ENV,
  enabledInstanceValue,
  instanceOwnedEnvKeys,
  nextExchangeInstance,
  removeExchangeInstance,
} from './exchange/instances.js';
import { inspectExchangeInstanceExposure } from './exchange/instance-removal.js';
import { GridBot } from './bot.js';
import { analyzeTrendWithLivePrice } from './trend.js';
import {
  setupProxies,
  checkProxy,
  resolveNetworkRoutes,
  selectNetworkRoute,
  proxyRuntimeState,
} from './proxy.js';
import { deleteSnapshot, loadSnapshot, saveSnapshot } from './persist.js';
import { createAiService } from './ai/service.js';
import { getAiConfig } from './ai/provider.js';
import { ENV_EDIT_KEYS, createEnvView, parseEnvText, removeEnvTextKeys, upsertEnvText, validateEnvUpdate } from './env-config.js';
import { HedgeCycleManager, HEDGE_STATES } from './hedge/cycle.js';

async function awaitStartupTask(task) {
  // AbortSignal.timeout() intentionally uses an unref'ed timer. During the
  // very first top-level await there may be no HTTP server/socket keeping the
  // process alive yet, so Node can otherwise exit with an unsettled await on
  // Windows. This short-lived guard exists only while startup probes run.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    return await task;
  } finally {
    clearInterval(keepAlive);
  }
}

// ── 启动配置 ─────────────────────────────────────────────────────────────────
const cfg = getConfig();
const INSTANCE_MANIFEST = cfg.instanceManifest;
const ENGINE_METADATA = (() => {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine-build.json'), 'utf8'));
    return {
      schemaVersion: Number(manifest.schemaVersion || 1),
      service: 'ai-grid-ops-local-engine',
      version: String(manifest.version || 'unknown'),
      buildId: String(manifest.buildId || 'unknown'),
      builtAt: manifest.builtAt || null,
    };
  } catch {
    try {
      const packageMetadata = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      return {
        schemaVersion: 1,
        service: 'ai-grid-ops-local-engine',
        version: String(packageMetadata.version || 'development'),
        buildId: `development-${packageMetadata.version || 'unknown'}`,
        builtAt: null,
      };
    } catch {
      return {
        schemaVersion: 1,
        service: 'ai-grid-ops-local-engine',
        version: 'unknown',
        buildId: 'development-unknown',
        builtAt: null,
      };
    }
  }
})();

// ── 实盘凭据预检查：缺什么直接列出来，不甩堆栈吓人 ─────────────────────────────
{
  const missing = [];
  for (const definition of INSTANCE_MANIFEST) {
    const exchangeConfig = cfg.exchanges[definition.key];
    if (exchangeConfig.mode !== 'live') continue;
    if (definition.liveAvailable === false) {
      console.error(`[${definition.name}] LIVE 暂未开放：${definition.liveUnavailableReason || '请切换为 paper。'}`);
      continue;
    }
    for (const field of definition.fields.filter((item) => item.requiredLive)) {
      if (!String(exchangeConfig[field.prop] ?? '').trim()) missing.push([definition.name.padEnd(9), field.env, definition.liveGuide?.url || '交易所 API 管理页面']);
    }
    for (const group of definition.requiredLiveAnyOf || []) {
      const fields = group.map((env) => definition.fields.find((field) => field.env === env)).filter(Boolean);
      if (!fields.some((field) => exchangeConfig[field.prop])) {
        missing.push([definition.name.padEnd(9), `${group.join(' / ')}（二选一）`, definition.liveGuide?.url || '交易所钱包设置页面']);
      }
    }
  }
  if (missing.length) {
    console.error('\n[启动失败] 有交易所被设为 live 实盘模式，但 .env 里还缺以下凭据：\n');
    for (const [ex, key, where] of missing) {
      console.error(`  ${ex}  缺 ${key}`);
      console.error(`            获取方式：${where}`);
    }
    console.error('\n解决办法（二选一）：');
    console.error('  1. 用记事本打开项目里的 .env，补齐上面列出的字段');
    console.error('     （详细获取教程见 README.md 第七节）');
    console.error('  2. 暂时不实盘：在「环境设置」里把对应交易所切回 paper\n');
    process.exit(1);
  }
}

// ── 代理设置 ─────────────────────────────────────────────────────────────────
// 控制台优先启动：网络探测只负责选路和安全降级，不再充当启动闸门。
// 每项服务按固定优先级探测真实目标：直连 -> 独立代理 -> 全局代理。
// 这里只选择通道，不重放任何下单 POST，因此不会产生重复订单。
let activeRouteResults = await awaitStartupTask(resolveNetworkRoutes(cfg, { timeoutMs: 10000 }));
for (const result of activeRouteResults) {
  if (result.ok) {
    const route = result.source === 'direct' ? '本机直连' : result.source === 'global' ? '全局代理' : '独立代理';
    console.log(`[网络选路] ✓ ${result.name} ${result.targetHost} · ${route}${result.autoSwitched ? '（自动降级）' : ''}`);
  } else {
    console.error(`[网络选路] ✗ ${result.name}：${result.error || result.code}`);
  }
}
const failedLiveRoutes = activeRouteResults.filter((result) => cfg.exchanges[result.key].mode === 'live' && !result.ok);
if (failedLiveRoutes.length) {
  console.warn('  [安全降级] 本地控制台仍会启动；上述 LIVE 交易所保持离线，禁止恢复或启动网格。');
  console.warn('  请进入仪表盘“IP 配置”修复网络，再使用对应交易所的“重连”按钮。');
}

const proxyResult = await setupProxies(cfg);
if (proxyResult.error) {
  console.warn('[网络] 路由初始化失败，控制台将以本机直连降级启动：' + proxyResult.error);
}

function liveRouteReady(key) {
  if (cfg.exchanges[key]?.mode !== 'live') return true;
  return activeRouteResults.some((result) => result.key === key && result.ok);
}

function liveRouteError(key, name) {
  const route = activeRouteResults.find((result) => result.key === key);
  const error = new Error(`${name} 当前没有可用网络通道，已阻止实盘网格操作。请先到“IP 配置”修复网络并重连交易所。`);
  error.code = 'LIVE_ROUTE_UNAVAILABLE';
  error.route = route || null;
  return error;
}

// ── Create every registered exchange and bot ─────────────────────────────────
const registered = createRegisteredExchanges(cfg);
const exchanges = {};
const bots = {};
const exchangeClients = {};
for (const [key, item] of Object.entries(registered)) {
  exchanges[key] = item.exchange;
  bots[key] = new GridBot(item.exchange, {
    exchangeName: item.definition.name,
    onChange: (state) => saveSnapshot(key, state),
  });
  bots[key].restore(loadSnapshot(key));
  exchangeClients[key] = new Set();
}

// Belt-and-suspenders: ensure every exchange always has an 'error' listener so a
// stray emit can never crash the process (the GridBot also attaches one).
for (const ex of Object.values(exchanges)) {
  ex.on('error', (e) => { try { console.error('[交易所错误] ' + (e?.message || e)); } catch {} });
}

// 对冲交易拥有独立的轮次/状态机和快照，但复用同一批账户适配器。
// 它不修改 GridBot 的网格循环，也不会把任何 API 密钥写入状态文件。
const hedgeManager = new HedgeCycleManager({
  exchanges,
  definitions: INSTANCE_MANIFEST,
  configs: cfg.exchanges,
  onChange: (state) => saveSnapshot('hedge-cycle', state),
});
hedgeManager.restore(loadSnapshot('hedge-cycle'));
for (const [accountKey, exchange] of Object.entries(exchanges)) {
  for (const type of [
    'fill', 'partial_fill', 'order_update', 'position_closed',
    'tp_filled', 'sl_filled', 'liquidated', 'abnormal_exit',
  ]) {
    exchange.on(type, (event = {}) => hedgeManager.ingestEvent({ ...event, type, accountKey }));
  }
}

// ── AI 服务（哨兵/日报/分析/对话/出区间建议）────────────────────────────────
const aiService = createAiService({
  bots,
  exchanges,
  exchangeNames: Object.fromEntries(INSTANCE_MANIFEST.map((definition) => [definition.key, definition.name])),
});
aiService.start();

const ENV_FILE = path.join(ROOT, '.env');
let restartScheduled = false;

function readEditableEnv() {
  const fileValues = fs.existsSync(ENV_FILE) ? parseEnvText(fs.readFileSync(ENV_FILE, 'utf8')) : {};
  const values = {};
  for (const key of ENV_EDIT_KEYS) values[key] = fileValues[key] ?? process.env[key] ?? '';
  return values;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function send(res, code, obj) {
  const body = JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  if (res.headersSent) { try { res.end(); } catch { /* ignore */ } return; }
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve) => {
    let b = '', n = 0, done = false;
    req.on('data', (c) => {
      if (done) return;
      n += c.length;
      if (n > maxBytes) { done = true; try { req.destroy(); } catch { /* ignore */ } resolve({}); return; }
      b += c;
    });
    req.on('end', () => { if (done) return; done = true; try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}

let routeRefreshPromise = null;
async function refreshNetworkRoutes() {
  if (routeRefreshPromise) return routeRefreshPromise;
  routeRefreshPromise = (async () => {
    const current = getConfig();
    const results = await resolveNetworkRoutes(current, { timeoutMs: 10000 });
    for (const result of results) {
      if (!result.ok) continue;
      const next = current.exchanges[result.key];
      Object.assign(cfg.exchanges[result.key], {
        dedicatedProxy: next.dedicatedProxy,
        globalProxy: current.globalProxy,
        proxy: result.proxy,
        proxySource: result.source,
        routeAttempts: result.attempts,
      });
    }
    cfg.globalProxy = current.globalProxy;
    const proxyState = await setupProxies(cfg);
    if (proxyState.error) throw new Error(proxyState.error);
    for (const result of results) {
      if (!result.ok || typeof exchanges[result.key]?.setProxy !== 'function') continue;
      await exchanges[result.key].setProxy(result.proxy);
    }
    activeRouteResults = results;
    return { results, proxyState };
  })();
  try { return await routeRefreshPromise; }
  finally { routeRefreshPromise = null; }
}

async function repairExchangeRoute(key) {
  const { results } = await refreshNetworkRoutes();
  return results.find((item) => item.key === key) || { ok: false, code: 'UNKNOWN_EXCHANGE' };
}

// ── 交易所路由处理器工厂 ───────────────────────────────────────────────────────
function makeExchangeHandler(prefix, bot, exchange, exCfg, clients, name, repairRoute) {
  const exchangeKey = prefix.split('/').pop();
  return async (req, res, subPath, url) => {
    if (subPath === '/markets') {
      return send(res, 200, {
        exchange: name,
        mode: exCfg.mode,
        dataSource: exchange.dataSource || (exCfg.mode === 'live' ? 'real' : 'synthetic'),
        network: exchange.network || exCfg.network,
        apiUrl: exchange.apiUrl || exCfg.apiUrl,
        markets: await exchange.getMarkets(),
      });
    }

    if (subPath === '/trend') {
      const marketId = Number(url.searchParams.get('marketId') || 1);
      const intervalSec = Number(url.searchParams.get('intervalSec') || 3600);
      let candles = [];
      try { candles = await exchange.getCandles(marketId, intervalSec, 200); } catch { /* tolerate */ }
      let price = null;
      try { price = await exchange.getPrice(marketId); } catch {}
      const analysis = (candles && candles.length >= 20)
        ? analyzeTrendWithLivePrice(candles, price)
        : {
            trend: 'range', recommended: 'neutral', strength: 0, atrPct: null, price,
            detail: '暂时拿不到足够K线数据，已默认中性网格。可手动设置上下边界后启动；不影响下单。',
          };
      return send(res, 200, { analysis, candles: (candles || []).slice(-120) });
    }

    if (subPath === '/state') return send(res, 200, bot.getState());

    const hedgeCycle = hedgeManager.status().cycle;
    const hedgeUsesAccount = hedgeManager.status().active
      && Object.values(hedgeCycle?.legs || {}).some((leg) => leg.accountKey === exchangeKey);
    if (hedgeUsesAccount && ['/start', '/stop', '/adjust', '/cancel-orders', '/start-recovery'].includes(subPath)) {
      return send(res, 409, {
        error: `${name} 正在参与对冲轮次，已阻止网格写操作。请先在 AI 对冲交易 Ops 中停止并确认双边归零。`,
        code: 'ACCOUNT_HEDGE_RUNNING',
      });
    }

    if (subPath === '/start' && req.method === 'POST') {
      try {
        if (!liveRouteReady(exchangeKey)) throw liveRouteError(exchangeKey, name);
        return send(res, 200, await bot.start(await readBody(req)));
      } catch (e) { return send(res, e.code === 'LIVE_ROUTE_UNAVAILABLE' ? 503 : 400, { error: e.message, code: e.code || null }); }
    }

    if (subPath === '/stop' && req.method === 'POST') {
      try { return send(res, 200, await bot.stop(await readBody(req))); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }

    if (subPath === '/adjust' && req.method === 'POST') {
      try { return send(res, 200, await bot.adjustRange(await readBody(req))); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }

    if (subPath === '/reset' && req.method === 'POST') {
      try { return send(res, 200, await bot.resetStats()); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }

    if (subPath === '/cancel-orders' && req.method === 'POST') {
      try { return send(res, 200, await bot.cancelAllOrders()); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }

    if (subPath === '/start-recovery' && req.method === 'POST') {
      try {
        if (!liveRouteReady(exchangeKey)) throw liveRouteError(exchangeKey, name);
        return send(res, 200, await bot.startRecovery(await readBody(req)));
      } catch (e) { return send(res, e.code === 'LIVE_ROUTE_UNAVAILABLE' ? 503 : 400, { error: e.message, code: e.code || null }); }
    }

    // 重新与交易所建立连接：重建客户端/解卡轮询/重启轮询循环。
    // 不撤单、不平仓、不动网格状态 —— 挂单照常被跟踪；重连成功后立刻对账一次。
    // 若该所启动时未连上导致续跑被跳过（快照仍为运行状态），重连成功后自动续跑接管挂单。
    if (subPath === '/reconnect' && req.method === 'POST') {
      try {
        const selectedRoute = await repairRoute();
        if (!selectedRoute.ok) throw new Error(selectedRoute.error || selectedRoute.code || '没有可用网络通道');
        if (typeof exchange.reconnect === 'function') await exchange.reconnect();
        else if (typeof exchange.init === 'function') await exchange.init();
        let resumed = false, resumeError = null;
        if (!bot.running) {
          const key = exchangeKey;
          const snap = loadSnapshot(key);
          if (snap?.running && snap?.config) {
            try {
              // marketId 是按连接会话编号的，可能已漂移：按市场名称重新解析
              const markets = await exchange.getMarkets();
              const norm = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              const m = markets.find((x) => norm(x.displayName) === norm(snap.config.displayName) || norm(x.name) === norm(snap.config.displayName));
              if (m) snap.config.marketId = m.marketId;
              await bot.resume(snap);
              resumed = true;
              console.log(`[恢复] ${key.toUpperCase()} 重连成功后已自动续跑，接管挂单并完成对账。`);
            } catch (e) {
              resumeError = e?.message || String(e); // 续跑失败不撤单：挂单保留，可重启程序再试
              console.error(`[恢复] ${key.toUpperCase()} 重连后续跑失败（${resumeError}），挂单保留未动。`);
            }
          }
        }
        if (bot.running) await bot.reconcileOpenOrders().catch(() => {});
        return send(res, 200, { ok: true, resumed, resumeError, route: { source: selectedRoute.source, targetHost: selectedRoute.targetHost, attempts: selectedRoute.attempts }, state: bot.getState() });
      } catch (e) {
        return send(res, 500, { error: e?.message || String(e) });
      }
    }

    if (subPath === '/close-position' && req.method === 'POST') {
      try { const b = await readBody(req); return send(res, 200, await bot.closePositionNow(b && b.marketId)); }
      catch (e) { return send(res, 400, { error: e.message }); }
    }

    if (subPath === '/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`data: ${JSON.stringify(bot.getState())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    send(res, 404, { error: 'not found: ' + subPath });
  };
}

const exchangeHandlers = Object.fromEntries(INSTANCE_MANIFEST.map((definition) => [
  definition.key,
  makeExchangeHandler(
    `/api/${definition.key}`,
    bots[definition.key],
    exchanges[definition.key],
    cfg.exchanges[definition.key],
    exchangeClients[definition.key],
    definition.name,
    () => repairExchangeRoute(definition.key),
  ),
]));

function overviewSnapshot() {
  return Object.fromEntries(INSTANCE_MANIFEST.map((definition) => [
    definition.key,
    pick(bots[definition.key].getState(), cfg.exchanges[definition.key].mode),
  ]));
}

const EMERGENCY_CONFIRMATION = 'EMERGENCY_STOP_CANCEL_CLOSE_ALL';
let emergencyStopPromise = null;

function isLoopbackConsoleRequest(request) {
  const origin = String(request.headers.origin || '');
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function emergencyStopRunningExchanges() {
  if (emergencyStopPromise) return emergencyStopPromise;
  emergencyStopPromise = (async () => {
    const startedAt = Date.now();
    const running = INSTANCE_MANIFEST.filter((definition) => bots[definition.key].running);
    const rows = await Promise.all(running.map(async (definition) => {
      try {
        const state = await bots[definition.key].stop({ closePosition: true, requireConfirmedClose: true });
        return [definition.key, { ok: true, name: definition.name, state }];
      } catch (error) {
        return [definition.key, {
          ok: false,
          name: definition.name,
          code: error?.code || 'EMERGENCY_ACTION_FAILED',
          error: error?.message || String(error),
          details: error?.details || null,
          state: error?.state || bots[definition.key].getState(),
        }];
      }
    }));
    const results = Object.fromEntries(rows);
    const hedgeWasActive = hedgeManager.status().active;
    if (hedgeWasActive) {
      try { results.hedge = { ok: true, name: 'AI 对冲交易', state: await hedgeManager.emergency() }; }
      catch (error) { results.hedge = { ok: false, name: 'AI 对冲交易', error: error?.message || String(error) }; }
    }
    const requested = running.length + (hedgeWasActive ? 1 : 0);
    const succeeded = Object.values(results).filter((result) => result.ok).length;
    return {
      startedAt,
      completedAt: Date.now(),
      requested,
      succeeded,
      failed: requested - succeeded,
      results,
      overview: overviewSnapshot(),
    };
  })();
  try { return await emergencyStopPromise; }
  finally { emergencyStopPromise = null; }
}

let liveOrderRefreshPromise = null;
async function refreshLiveOrderSnapshots() {
  if (liveOrderRefreshPromise) return liveOrderRefreshPromise;
  liveOrderRefreshPromise = (async () => {
    const rows = await Promise.all(INSTANCE_MANIFEST
      .filter((definition) => cfg.exchanges[definition.key].mode === 'live')
      .map(async (definition) => [definition.key, await bots[definition.key].refreshExchangeOpenOrders()]));
    return { refreshedAt: Date.now(), results: Object.fromEntries(rows), overview: overviewSnapshot() };
  })();
  try { return await liveOrderRefreshPromise; }
  finally { liveOrderRefreshPromise = null; }
}

// ── HTTP 服务器 ───────────────────────────────────────────────────────────────
const server = http.createServer(async (request, res) => {
  const url = new URL(request.url, 'http://localhost');
  const p = url.pathname;

  try {
    // 只向 welinkBTC 页面暴露无敏感信息的健康检查。交易 API 仍保持同源，
    // 防止任意网页跨域操控本机机器人。
    if (p === '/api/health') {
      const origin = String(request.headers.origin || '');
      const allowedOrigin = [
        'https://welinkbtc-onchainmain.xyz',
        'https://www.welinkbtc-onchainmain.xyz',
        'https://welinkbtc-main.vercel.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ].includes(origin) || /^https:\/\/welinkbtc-main-[a-z0-9-]+-welink-btc\.vercel\.app$/i.test(origin);

      if (allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        if (request.headers['access-control-request-private-network'] === 'true') {
          res.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
      }
      res.setHeader('Cache-Control', 'no-store');
      if (request.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }
      return send(res, 200, {
        ok: true,
        service: 'welinkbtc-grid-ops',
        version: ENGINE_METADATA.version,
        consoleApiVersion: 8,
        networkReady: INSTANCE_MANIFEST
          .filter((definition) => cfg.exchanges[definition.key].mode === 'live')
          .every((definition) => liveRouteReady(definition.key)),
        unavailableLiveExchanges: INSTANCE_MANIFEST
          .filter((definition) => cfg.exchanges[definition.key].mode === 'live' && !liveRouteReady(definition.key))
          .map((definition) => definition.key),
        exchanges: INSTANCE_MANIFEST.map((definition) => definition.key),
      });
    }

    if (p === '/api/exchanges') {
      return send(res, 200, { exchanges: publicExchangeManifest(INSTANCE_MANIFEST), maxInstances: 3 });
    }

    if (p === '/api/exchanges/template') {
      return send(res, 200, exchangeOnboardingTemplate());
    }

    // Enable the next account slot for one exchange family. Account/API values
    // are deliberately never copied: the new slot starts in PAPER mode and gets
    // its own suffixed .env keys (for example BINANCE_API_KEY_2).
    if (p === '/api/exchanges/clone' && request.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      if (!isLoopbackConsoleRequest(request)) {
        return send(res, 403, { error: '复制交易所仅允许从本机控制台发起。', code: 'LOCAL_CONSOLE_REQUIRED' });
      }
      if (hedgeManager.status().active) {
        return send(res, 409, {
          error: '当前有对冲轮次正在运行。请先停止并确认双边归零，再新增账号。',
          code: 'HEDGE_ACTIVE',
        });
      }
      if (restartScheduled) return send(res, 409, { error: '本地引擎正在重启，请稍候。', code: 'ENGINE_RESTARTING' });
      const body = await readBody(request, 4096);
      const baseKey = String(body?.baseKey || '').trim().toLowerCase();
      const base = BASE_EXCHANGE_MANIFEST.find((item) => item.key === baseKey);
      if (!base) return send(res, 400, { error: '未知交易所类型。', code: 'UNKNOWN_EXCHANGE_FAMILY' });
      const next = nextExchangeInstance(baseKey, INSTANCE_MANIFEST);
      if (!next) return send(res, 409, { error: `${base.name} 已达到 3 个账号上限。`, code: 'INSTANCE_LIMIT_REACHED' });

      const running = INSTANCE_MANIFEST.filter((definition) => bots[definition.key].running).map((definition) => definition.name);
      if (running.length && body?.confirmation !== 'CLONE_AND_RESTART') {
        return send(res, 409, {
          error: `新增账号需要重启本地引擎；当前运行中的网格会短暂重连并按快照续跑：${running.join('、')}。`,
          code: 'RESTART_CONFIRMATION_REQUIRED',
          running,
        });
      }

      const content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
      const updates = {
        [EXCHANGE_INSTANCE_ENV]: enabledInstanceValue([...INSTANCE_MANIFEST, next]),
        [next.modeEnv]: 'paper',
        [next.networkEnv]: cfg.exchanges[baseKey]?.network || next.defaultNetwork || 'mainnet',
      };
      fs.writeFileSync(ENV_FILE, upsertEnvText(content, updates), 'utf8');
      restartScheduled = true;
      send(res, 200, {
        ok: true,
        restarting: true,
        instance: publicExchangeManifest([next])[0],
        message: `${next.name} 已创建为独立 PAPER 账号；本地引擎重启后即可单独配置密钥。`,
      });
      setTimeout(() => process.exit(75), 1200).unref();
      return;
    }

    // Retire one secondary account only after a fail-closed order/position
    // verification. This never cancels orders or closes positions implicitly:
    // users must first stop + cancel + close from that account's console.
    if (p === '/api/exchanges/delete' && request.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      if (!isLoopbackConsoleRequest(request)) {
        return send(res, 403, { error: '删除交易所账号仅允许从本机控制台发起。', code: 'LOCAL_CONSOLE_REQUIRED' });
      }
      if (restartScheduled) return send(res, 409, { error: '本地引擎正在重启，请稍候。', code: 'ENGINE_RESTARTING' });
      const body = await readBody(request, 4096);
      let removal;
      try {
        removal = removeExchangeInstance(body?.key, INSTANCE_MANIFEST);
      } catch (error) {
        const status = error?.code === 'UNKNOWN_EXCHANGE_INSTANCE' ? 404 : 409;
        return send(res, status, { error: error?.message || String(error), code: error?.code || 'INSTANCE_DELETE_REJECTED' });
      }

      const { target, definitions } = removal;
      const hedgeStatus = hedgeManager.status();
      const hedgeAccounts = Object.values(hedgeStatus.cycle?.legs || {}).map((leg) => leg.accountKey);
      if (hedgeStatus.active && hedgeAccounts.includes(target.key)) {
        return send(res, 409, {
          error: `${target.name} 正在参与对冲轮次，请先在“AI 对冲交易 Ops”执行停止并确认双边归零。`,
          code: 'INSTANCE_USED_BY_HEDGE',
        });
      }
      let exposure;
      try {
        exposure = await inspectExchangeInstanceExposure({
          bot: bots[target.key],
          exchange: exchanges[target.key],
          mode: cfg.exchanges[target.key]?.mode,
        });
      } catch (error) {
        return send(res, 503, {
          error: error?.message || String(error),
          code: error?.code || 'INSTANCE_RISK_CHECK_FAILED',
        });
      }
      if (!exposure.safeToDelete) {
        return send(res, 409, {
          error: exposure.running
            ? `${target.name} 的网格仍在运行，请先执行“停止 + 撤单 + 平仓”。`
            : `${target.name} 仍有 ${exposure.openOrders} 个挂单或 ${exposure.positions.length} 个持仓，不能删除。`,
          code: 'INSTANCE_HAS_EXPOSURE',
          exposure,
        });
      }

      const running = INSTANCE_MANIFEST
        .filter((definition) => definition.key !== target.key && bots[definition.key].running)
        .map((definition) => definition.name);
      if (running.length && body?.confirmation !== 'DELETE_INSTANCE_AND_RESTART') {
        return send(res, 409, {
          error: `删除账号需要重启本地引擎；其他运行中的网格会短暂重连并按快照续跑：${running.join('、')}。`,
          code: 'RESTART_CONFIRMATION_REQUIRED',
          running,
        });
      }

      const content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
      const cleaned = removeEnvTextKeys(content, instanceOwnedEnvKeys(target));
      fs.writeFileSync(ENV_FILE, upsertEnvText(cleaned, {
        [EXCHANGE_INSTANCE_ENV]: enabledInstanceValue(definitions),
      }), 'utf8');
      deleteSnapshot(target.key);
      restartScheduled = true;
      send(res, 200, {
        ok: true,
        restarting: true,
        removed: target.key,
        message: `${target.name} 已安全删除；独立密钥配置、仪表盘、控制台和环境设置将在重启后一起移除。`,
      });
      setTimeout(() => process.exit(75), 1200).unref();
      return;
    }

    // ── 总览 API ──────────────────────────────────────────────────────────
    if (p === '/api/version') {
      res.setHeader('Cache-Control', 'no-store');
      return send(res, 200, ENGINE_METADATA);
    }

    if (p === '/api/overview') {
      return send(res, 200, overviewSnapshot());
    }

    // ── 独立 HedgeCycle 协调层 ───────────────────────────────────────────
    if (p === '/api/hedge/options' && request.method === 'GET') {
      return send(res, 200, { accounts: await hedgeManager.options(), states: HEDGE_STATES });
    }
    if (p === '/api/hedge' && request.method === 'GET') return send(res, 200, await hedgeManager.dashboard());
    if (p.startsWith('/api/hedge/') && request.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      if (!isLoopbackConsoleRequest(request)) return send(res, 403, { error: '对冲交易仅允许从本机控制台发起。', code: 'LOCAL_CONSOLE_REQUIRED' });
      const action = p.slice('/api/hedge/'.length);
      const body = await readBody(request, 8192);
      try {
        if (action === 'start') {
          for (const key of [body.accountA, body.accountB]) {
            const definition = INSTANCE_MANIFEST.find((item) => item.key === key);
            if (!definition) return send(res, 400, { error: `未知账户：${key}` });
            if (bots[key].running) return send(res, 409, { error: `${definition.name} 正在运行网格，不能同时参与对冲交易。`, code: 'ACCOUNT_GRID_RUNNING' });
            if (cfg.exchanges[key]?.mode === 'live' && !liveRouteReady(key)) throw liveRouteError(key, definition.name);
          }
          return send(res, 200, await hedgeManager.start(body));
        }
        if (action === 'stop') return send(res, 200, await hedgeManager.stop(body?.reason || '用户停止'));
        if (action === 'emergency') {
          if (body?.confirmation !== 'HEDGE_EMERGENCY_CANCEL_CLOSE') return send(res, 400, { error: '紧急操作确认无效。' });
          return send(res, 200, await hedgeManager.emergency());
        }
        if (action === 'reconcile') return send(res, 200, await hedgeManager.reconcile());
        return send(res, 404, { error: '未知对冲操作。' });
      } catch (error) {
        return send(res, 409, { error: error?.message || String(error), code: error?.code || 'HEDGE_ACTION_FAILED', status: hedgeManager.status() });
      }
    }

    // Read-only LIVE order retrieval for the overview detail table. This calls
    // exchange order-list endpoints only; it never reconciles, adopts, cancels,
    // replaces or submits an order.
    if (p === '/api/overview/refresh-live' && request.method === 'POST') {
      return send(res, 200, await refreshLiveOrderSnapshots());
    }

    // High-risk local-only action. The dashboard requires two human confirmations,
    // while the server independently requires loopback origin plus matching header/body tokens.
    if (p === '/api/overview/emergency-stop' && request.method === 'POST') {
      res.setHeader('Cache-Control', 'no-store');
      if (!isLoopbackConsoleRequest(request)) {
        return send(res, 403, { error: '紧急停撤平仅允许从本机控制台发起。', code: 'LOCAL_CONSOLE_REQUIRED' });
      }
      const body = await readBody(request, 4096);
      const headerConfirmation = String(request.headers['x-grid-emergency-confirm'] || '');
      if (headerConfirmation !== EMERGENCY_CONFIRMATION || body.confirmation !== EMERGENCY_CONFIRMATION) {
        return send(res, 400, { error: '紧急操作确认无效，未执行任何交易操作。', code: 'EMERGENCY_CONFIRMATION_REQUIRED' });
      }
      return send(res, 200, await emergencyStopRunningExchanges());
    }

    // ── 总览 SSE 流 ───────────────────────────────────────────────────────
    if (p === '/api/overview/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      // send the current snapshot immediately (don't leave the client blank
      // until the next 1s broadcast tick)
      const initial = overviewSnapshot();
      res.write(`data: ${JSON.stringify(initial, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}\n\n`);
      const overviewClients = server._overviewClients;
      overviewClients.add(res);
      request.on('close', () => overviewClients.delete(res));
      return;
    }

    // ── 本机 .env 图形化配置 ─────────────────────────────────────────────
    if (p === '/api/env-config' && request.method === 'GET') {
      return send(res, 200, createEnvView(readEditableEnv()));
    }

    if (p === '/api/env-config' && request.method === 'POST') {
      try {
        if (hedgeManager.status().active) return send(res, 409, { error: '保存环境配置前，请先停止对冲轮次并确认双边归零。' });
        const running = INSTANCE_MANIFEST.filter((definition) => bots[definition.key].running).map((definition) => definition.name);
        if (running.length) {
          return send(res, 409, { error: `保存环境配置前，请先停止正在运行的网格：${running.join('、')}。` });
        }
        if (restartScheduled) return send(res, 409, { error: '本地引擎正在重启，请稍候。' });
        const body = await readBody(request);
        const current = readEditableEnv();
        const { updates } = validateEnvUpdate(body?.values, current);
        if (!Object.keys(updates).length) return send(res, 400, { error: '没有可保存的配置。' });
        const content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
        fs.writeFileSync(ENV_FILE, upsertEnvText(content, updates), 'utf8');
        restartScheduled = true;
        send(res, 200, { ok: true, restarting: true, message: '配置已保存到本机 .env，本地引擎正在重启。' });
        setTimeout(() => process.exit(75), 800).unref();
        return;
      } catch (e) {
        return send(res, 400, { error: e?.message || String(e) });
      }
    }

    // ── AI 助手 API ───────────────────────────────────────────────────────
    if (p === '/api/ai/status') {
      return send(res, 200, aiService.status());
    }
    if (p === '/api/ai/test' && request.method === 'POST') {
      try {
        const body = await readBody(request);
        return send(res, 200, await aiService.test({ direct: body?.direct === true }));
      }
      catch (e) {
        return send(res, 200, {
          ok: false,
          error: e?.message || String(e),
          code: e?.diagnosticCode || null,
          target: e?.target || null,
          directAvailable: Boolean(e?.directAvailable),
          directStatus: e?.directStatus || null,
          routeAttempts: e?.routeAttempts || [],
        });
      }
    }
    if (p === '/api/ai/sentinel-run' && request.method === 'POST') {
      try {
        const r = await aiService.runSentinel();
        return send(res, 200, r || { error: aiService.sentinelError || '巡检失败' });
      } catch (e) { return send(res, 500, { error: e?.message || String(e) }); }
    }
    if (p === '/api/ai/market-run' && request.method === 'POST') {
      try { return send(res, 200, await aiService.runMarketAnalysis()); }
      catch (e) { return send(res, 500, { error: e?.message || String(e) }); }
    }
    if (p === '/api/ai/report' && request.method === 'POST') {
      try { return send(res, 200, await aiService.makeReport()); }
      catch (e) { return send(res, 500, { error: e?.message || String(e) }); }
    }
    if (p === '/api/ai/analyze' && request.method === 'POST') {
      try {
        const b = await readBody(request);
        return send(res, 200, await aiService.analyze(String(b.ex || 'de')));
      } catch (e) { return send(res, 500, { error: e?.message || String(e) }); }
    }
    if (p === '/api/ai/chat' && request.method === 'POST') {
      try {
        const b = await readBody(request);
        if (!b.message) return send(res, 400, { error: '消息为空' });
        return send(res, 200, await aiService.chatControl(b.message, Array.isArray(b.history) ? b.history : []));
      } catch (e) { return send(res, 500, { error: e?.message || String(e) }); }
    }

    // ── 代理配置 API ──────────────────────────────────────────────────────
    if (p === '/api/proxy-check') {
      const exchangeKey = String(url.searchParams.get('exchange') || '').toLowerCase();
      if (exchangeKey) {
        const definition = INSTANCE_MANIFEST.find((item) => item.key === exchangeKey);
        if (!definition) return send(res, 400, { error: '未知交易所。' });
        const result = await repairExchangeRoute(exchangeKey);
        const saved = getConfig();
        return send(res, 200, {
          ...result,
          exchange: exchangeKey,
          proxyConfigured: Boolean(saved.exchanges[exchangeKey].dedicatedProxy || saved.globalProxy),
          autoApplied: Boolean(result.ok),
        });
      }
      const current = getConfig();
      const configuredGlobal = current.globalProxy || 'direct';
      const [globalResult, autoRoute] = await Promise.all([
        checkProxy(configuredGlobal),
        selectNetworkRoute({ targetUrl: 'https://api.ipify.org', globalProxy: current.globalProxy, timeoutMs: 10000 }),
      ]);
      const selectedIp = autoRoute.ok ? await checkProxy(autoRoute.proxy) : { ok: false, error: autoRoute.error };
      return send(res, 200, {
        ...selectedIp,
        source: autoRoute.source,
        attempts: autoRoute.attempts,
        autoSwitched: autoRoute.autoSwitched,
        globalHealthy: Boolean(globalResult.ok),
        globalError: globalResult.ok ? null : globalResult.error,
        globalDetectedProtocol: globalResult.detectedProtocol || null,
        globalEnteredProtocol: globalResult.enteredProtocol || null,
      });
    }

    if (p === '/api/network-diagnostics') {
      const current = getConfig();
      const aiConfig = getAiConfig();
      const aiTarget = aiConfig.provider === 'openai' ? `${aiConfig.baseUrl}/models` : aiConfig.baseUrl;
      const [routeRefresh, aiResult, globalResult] = await Promise.all([
        refreshNetworkRoutes(),
        selectNetworkRoute({
          targetUrl: aiTarget,
          dedicatedProxy: aiConfig.proxy,
          globalProxy: aiConfig.globalProxy,
          dedicatedSource: 'ai',
          timeoutMs: 10000,
        }),
        checkProxy(current.globalProxy || 'direct'),
      ]);
      const exchangeResults = routeRefresh.results;
      return send(res, 200, {
        ok: exchangeResults.every((item) => item.ok) && aiResult.ok,
        ambientProxyIgnored: Boolean(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY),
        priority: ['direct', 'dedicated', 'global'],
        globalHealthy: Boolean(globalResult.ok),
        globalSource: current.globalProxy && String(current.globalProxy).toLowerCase() !== 'direct' ? 'global' : 'direct',
        exchanges: exchangeResults,
        ai: { provider: aiConfig.provider, ...aiResult },
      });
    }

    if (p === '/api/proxy-config') {
      return send(res, 200, {
        global: process.env.GLOBAL_PROXY || '',
        ...Object.fromEntries(INSTANCE_MANIFEST.map((definition) => [definition.key, process.env[definition.proxyEnv] || ''])),
        ambientProxyIgnored: Boolean(process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.ALL_PROXY),
        runtime: proxyRuntimeState(),
      });
    }

    if (p === '/api/env' && request.method === 'POST') {
      try {
        const { key, value } = await readBody(request);
        const PROXY_KEYS = ['GLOBAL_PROXY', ...INSTANCE_MANIFEST.map((definition) => definition.proxyEnv)];
        const AI_KEYS = ['AI_PROVIDER','AI_API_KEY','AI_BASE_URL','AI_MODEL','AI_MODEL_SMALL','AI_PROXY','AI_SENTINEL_MINUTES','AI_MARKET_MINUTES','AI_REPORT_HOUR','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID','NOTIFY_WEBHOOK'];
        if (!PROXY_KEYS.includes(key) && !AI_KEYS.includes(key)) return send(res, 400, { error: '不允许修改该字段: ' + key });
        // SECURITY: the value is written verbatim into .env. Reject anything that
        // could break out of a single KEY=VALUE line (newlines / control chars)
        // — otherwise a crafted value could inject arbitrary env lines (e.g. flip
        // DE_MODE=live, set private keys). Per-key format validation below.
        const val = value == null ? '' : String(value).trim();
        if (val) {
          if (/\s/.test(val) || [...val].some((c) => c.charCodeAt(0) < 32) || val.length > 500) {
            return send(res, 400, { error: '值包含非法字符（空白/换行/控制字符）或过长。' });
          }
          if (PROXY_KEYS.includes(key) || key === 'AI_PROXY') {
            // host:port | host:port:user:pass | scheme://[user:pass@]host:port
            const directAllowed = (PROXY_KEYS.includes(key) || key === 'AI_PROXY') && val.toLowerCase() === 'direct';
            const ok = directAllowed || /^[\w.-]+:\d{1,5}(:[^:\s@]+:[^:\s@]+)?$/.test(val)
              || /^(https?|socks[45]?):\/\/([^:@/\s]+(:[^@/\s]+)?@)?[\w.-]+:\d{1,5}\/?$/i.test(val);
            if (!ok) return send(res, 400, { error: '代理地址格式无效。示例：http://127.0.0.1:7890、socks5://user:pass@host:1080；也可填写 direct 强制本机直连。' });
          } else if (key === 'AI_PROVIDER') {
            if (!/^(openai|anthropic|gemini)$/i.test(val)) return send(res, 400, { error: 'AI_PROVIDER 只能是 openai / anthropic / gemini（OpenAI 兼容协议的服务商选 openai）。' });
          } else if (key === 'AI_SENTINEL_MINUTES' || key === 'AI_MARKET_MINUTES') {
            if (!/^\d{1,4}$/.test(val)) return send(res, 400, { error: '间隔必须是数字（分钟，0=关闭）。' });
          } else if (key === 'AI_REPORT_HOUR') {
            if (!/^\d{1,2}$/.test(val) || Number(val) > 23) return send(res, 400, { error: '日报时间必须是 0-23 的整点小时。' });
          } else if (key === 'AI_BASE_URL' || key === 'NOTIFY_WEBHOOK') {
            if (!/^https?:\/\/\S+$/i.test(val)) return send(res, 400, { error: '必须是 http(s):// 开头的 URL。' });
          }
        }
        // 更新内存中的环境变量
        if (val) process.env[key] = val; else delete process.env[key];
        // 写入 .env 文件
        const envFile = path.join(ROOT, '.env');
        let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
        const regex = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
        const line = val ? `${key}=${val}` : `# ${key}=`;
        if (regex.test(content)) {
          content = content.replace(regex, line);
        } else {
          content = content.trimEnd() + '\n' + line + '\n';
        }
        fs.writeFileSync(envFile, content, 'utf8');
        // 全局/交易所代理修改后立即替换 fetch dispatcher，避免页面显示新代理、
        // 实际请求却仍走进程启动时的旧连接。AI_PROXY 是逐请求读取，无需重载。
        const routeRefresh = PROXY_KEYS.includes(key) ? await refreshNetworkRoutes() : null;
        const proxyState = routeRefresh?.proxyState || null;
        return send(res, 200, {
          ok: true,
          ...(proxyState ? {
            proxyApplied: true,
            proxyActive: proxyState.mode === 'proxy',
            proxyMode: proxyState.mode,
            routes: routeRefresh.results.map((item) => ({ key: item.key, ok: item.ok, source: item.source, targetHost: item.targetHost })),
          } : {}),
        });
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }

    // ── 交易所子路由 ──────────────────────────────────────────────────────
    const route = INSTANCE_MANIFEST.find((definition) => p.startsWith(`/api/${definition.key}/`));
    if (route) {
      return await exchangeHandlers[route.key](request, res, p.slice(`/api/${route.key}`.length), url);
    }

    // ── 静态文件 ──────────────────────────────────────────────────────────
    let file = p === '/' ? '/index.html' : p;
    const full = path.join(ROOT, 'public', path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
        ...(path.extname(full) === '.html' ? { 'Cache-Control': 'no-store, max-age=0' } : {}),
      });
      return fs.createReadStream(full).pipe(res);
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server._overviewClients = new Set();

// ── SSE 推送定时器 ────────────────────────────────────────────────────────────
setInterval(() => {
  const stringify = (obj) =>
    JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

  for (const definition of INSTANCE_MANIFEST) {
    const clients = exchangeClients[definition.key];
    if (!clients.size) continue;
    const data = `data: ${stringify(bots[definition.key].getState())}\n\n`;
    for (const response of clients) { try { response.write(data); } catch { clients.delete(response); } }
  }
  if (server._overviewClients.size > 0) {
    const overview = overviewSnapshot();
    const data = `data: ${stringify(overview)}\n\n`;
    for (const r of server._overviewClients) { try { r.write(data); } catch { server._overviewClients.delete(r); } }
  }
}, 1000);

function pick(s, mode) {
  return {
    running: s.running,
    mode,
    balance: s.balance,
    equity: s.equity,
    totalPnl: s.totalPnl,
    realizedPnl: s.realizedPnl,
    unrealizedPnl: s.unrealizedPnl,
    returnPct: s.returnPct,
    volume: s.volume,
    completedRungs: s.stats?.completedRungs ?? 0,
    openOrders: s.openOrders ?? 0,
    exchangeOpenOrders: s.exchangeOpenOrders ?? null,
    ordersSyncedAt: s.ordersSyncedAt ?? null,
    ordersSyncError: s.ordersSyncError ?? null,
    position: s.position ?? null,
    gridCount: s.grid?.count ?? s.config?.gridCount ?? null,
    dataUpdatedAt: s.health?.lastOkAgeMs != null ? Date.now() - s.health.lastOkAgeMs : null,
    outOfRange: s.outOfRange ?? false,
    health: s.health ?? null,
    lastPrice: s.lastPrice,
    config: s.config,
    // Read-only grid visualization payload. This is sourced from bot memory,
    // so the overview can render the exact ladder without another exchange
    // request or exposing any account credentials.
    grid: s.grid ? {
      levels: Array.isArray(s.grid.levels) ? s.grid.levels : [],
      spacing: s.grid.spacing ?? null,
      count: s.grid.count ?? null,
    } : null,
    openByLevel: s.openByLevel ?? {},
    completedByLevel: s.completedByLevel ?? {},
    recentFills: Array.isArray(s.fills) ? s.fills.slice(0, 20) : [],
  };
}

// ── 错误处理 ──────────────────────────────────────────────────────────────────
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n[启动失败] 端口 ${cfg.port} 已被占用。`);
    console.error('请先关闭之前的程序窗口，或在 .env 里改 PORT=8081 用别的端口。\n');
  } else {
    console.error('[服务器错误] ' + (e?.message || e));
  }
  process.exit(1);
});

// ── 初始化各交易所 ────────────────────────────────────────────────────────────
async function initExchange(exchange, name, exCfg) {
  try {
    await exchange.init();
    console.log(`[${name}] ✓ 连接成功 [${exCfg.mode.toUpperCase()} 模式]`);
  } catch (e) {
    console.error(`\n[${name}] ✗ 初始化失败：${e?.message || e}`);
    console.error(`  目标接口: ${exCfg.apiUrl}   网络: ${exCfg.network}`);
    const cause = e?.cause || {};
    const code = cause.code || '';
    if (code === 'ENOTFOUND') {
      console.error('  ➤ 域名解析失败：检查网络，或配置代理。');
    } else if (code === 'ECONNREFUSED' && String(cause.address || '').includes('127.0.0.1')) {
      console.error('  ➤ 本机代理端口连不上，检查代理软件是否开启。');
    } else if (code === 'UND_ERR_CONNECT_TIMEOUT' || /timeout/i.test(cause.message || '')) {
      console.error('  ➤ 连接超时，接口被网络拦截，或代理未正确转发。');
    }
    console.error(`  该交易所将以离线模式运行（行情可能使用合成数据）。\n`);
    // 不退出，让其他交易所继续工作
  }
}

await Promise.all(INSTANCE_MANIFEST.map((definition) => initExchange(
  exchanges[definition.key], definition.name, cfg.exchanges[definition.key],
)));

// ── 崩溃恢复 / 续跑 ────────────────────────────────────────────────────────────
// If a bot was "running" when the process died, RESUME it: re-attach to the
// orders still resting on the exchange and keep managing the grid. If resume
// fails (e.g. exchange offline), fall back to cancelling stray orders so we
// never operate a half-known grid.
async function resumeIfWasRunning(bot, exchange, key) {
  const snap = loadSnapshot(key);
  if (!(snap?.running && snap?.config)) return;
  if (!liveRouteReady(key)) {
    console.log(`[恢复] ${key.toUpperCase()} LIVE 网络通道不可用，跳过续跑；控制台仍可进入，挂单保留待修复后重连。`);
    return;
  }
  if (exchange.dataSource == null) {
    console.log(`[恢复] ${key.toUpperCase()} 交易所未连接，跳过续跑；保留挂单待下次连接。`);
    return;
  }
  try {
    console.log(`[恢复] 检测到 ${key.toUpperCase()} 上次为运行状态，正在接管续跑...`);
    await bot.resume(snap);
    console.log(`[恢复] ${key.toUpperCase()} 已续跑，接管挂单并完成对账。`);
  } catch (e) {
    console.error(`[恢复] ${key.toUpperCase()} 续跑失败（${e?.message || e}），改为撤销遗留挂单。`);
    await bot.recoverStrayOrders().catch(() => {});
  }
}
await Promise.all(INSTANCE_MANIFEST.map((definition) => resumeIfWasRunning(
  bots[definition.key], exchanges[definition.key], definition.key,
)));

// HedgeCycle persistence is intentionally separate from every grid snapshot.
// Resume only after all exchange adapters are initialized so recovery can use
// the exchanges' real positions as the source of truth and flatten residuals.
try {
  const hedgeStatus = await hedgeManager.resume();
  if (hedgeStatus?.cycle) console.log(`[对冲恢复] ${hedgeStatus.cycle.id}：${hedgeStatus.cycle.state}`);
} catch (error) {
  console.error(`[对冲恢复] 对账失败：${error?.message || error}。已保持恢复/对账状态，禁止开始新轮次。`);
}

// Background route healer: only runs when an exchange is actually offline or
// reports a network error. It re-probes direct -> dedicated -> global and
// rebuilds the connection. It never replays an order-placement request.
let routeHealBusy = false;
setInterval(async () => {
  if (routeHealBusy) return;
  const affected = INSTANCE_MANIFEST.filter((definition) => {
    const state = bots[definition.key].getState();
    return exchanges[definition.key].dataSource == null || state.health?.status === 'error';
  });
  if (!affected.length) return;
  routeHealBusy = true;
  try {
    const { results } = await refreshNetworkRoutes();
    for (const definition of affected) {
      const route = results.find((item) => item.key === definition.key);
      if (!route?.ok) continue;
      try {
        const exchange = exchanges[definition.key];
        if (typeof exchange.reconnect === 'function') await exchange.reconnect();
        else await exchange.init();
        if (bots[definition.key].running) await bots[definition.key].reconcileOpenOrders().catch(() => {});
        console.log(`[网络自愈] ✓ ${definition.name} 已通过${route.source === 'direct' ? '本机直连' : route.source === 'global' ? '全局代理' : '独立代理'}恢复连接。`);
      } catch (error) {
        console.error(`[网络自愈] ${definition.name} 重连仍失败：${error?.message || error}`);
      }
    }
  } catch (error) {
    console.error('[网络自愈] 路由刷新失败：' + (error?.message || error));
  } finally {
    routeHealBusy = false;
  }
}, 60000).unref?.();

// After init, surface any LEFTOVER position so the dashboard can prompt the user
// (recovery ladder / re-grid / market close). Decibel & Extended RE-NUMBER their
// marketIds every run, so the persisted numeric id may point at the wrong market
// — re-resolve it by the market NAME, then start watching it so the position is
// polled into getState.
const _norm = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function detectOrphanPosition(bot, ex) {
  if (!bot.config?.displayName || ex.dataSource == null || typeof ex.getMarkets !== 'function') return;
  try {
    const markets = await ex.getMarkets();
    const want = _norm(bot.config.displayName);
    const m = markets.find((x) => _norm(x.displayName) === want || _norm(x.name) === want || _norm(x.symbol) === want);
    if (m) {
      bot.config.marketId = m.marketId;            // fix stale/ephemeral id -> current
      await ex.getPrice(m.marketId).catch(() => {}); // seed watch -> position gets polled
    }
  } catch { /* ignore */ }
}
await Promise.all(INSTANCE_MANIFEST.map((definition) => detectOrphanPosition(
  bots[definition.key], exchanges[definition.key],
)));

server.listen(cfg.port, cfg.host, () => {
  console.log(`\n${'═'.repeat(52)}`);
  console.log(`  ${INSTANCE_MANIFEST.length} 个交易所账号实例整合网格机器人 已启动`);
  console.log(`  仪表盘: http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${cfg.port}`);
  if (cfg.host === '0.0.0.0') console.log('  ⚠ 当前监听所有网卡(0.0.0.0)，局域网内可访问，请确保有防护。');
  console.log(`${'═'.repeat(52)}`);
  for (const definition of INSTANCE_MANIFEST) {
    const exchangeConfig = cfg.exchanges[definition.key];
    console.log(`  ${definition.name.padEnd(9)} [${exchangeConfig.mode.toUpperCase()}]  ${exchangeConfig.network}`);
  }
  console.log(`${'─'.repeat(52)}`);
  if (INSTANCE_MANIFEST.some((definition) => cfg.exchanges[definition.key].mode === 'paper')) {
    console.log('  ⚠ 部分交易所为模拟模式，不涉及真实资金。');
    console.log('    可在仪表盘「环境设置」中逐个切换 live 实盘。');
  }
  console.log('');
});
