// 多交易所代理管理器
// 支持 HTTP(S) 代理和 SOCKS5 代理（含认证）。
//
// 网络链路按目标域名隔离并自动选路：本机直连优先，服务专用代理
// 次之，GLOBAL_PROXY 只做最终兜底。这样一个失效节点不会劫持 AI
// 或其他交易所，也不会因为“出口 IP 可查”而误判目标 API 可用。
import net from 'node:net';
import tls from 'node:tls';
import { EXCHANGE_MANIFEST } from './exchange/manifest.js';

const ORIGINAL_FETCH = Symbol.for('welinkbtc.gridOps.originalFetch');
const ROUTED_FETCH = Symbol.for('welinkbtc.gridOps.routedFetch');
const ROUTE_STATE = Symbol.for('welinkbtc.gridOps.proxyRoutes');

if (!globalThis[ORIGINAL_FETCH]) globalThis[ORIGINAL_FETCH] = globalThis.fetch.bind(globalThis);
if (!globalThis[ROUTE_STATE]) globalThis[ROUTE_STATE] = { byHost: new Map(), summary: {} };

export const DIRECT_PROXY = 'direct';

export function isDirectProxy(value) {
  return String(value || '').trim().toLowerCase() === DIRECT_PROXY;
}

/** host:port:user:pass -> socks5://user:pass@host:port ; bare host:port -> http:// */
export function normalizeProxy(v) {
  const s = String(v).trim();
  if (isDirectProxy(s)) return DIRECT_PROXY;
  if (/^\w+:\/\//.test(s)) return s;
  const parts = s.split(':');
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    return `socks5://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  if (parts.length === 2) return `http://${s}`;
  return s;
}

/** HTTPS/SOCKS 地址在协议填写错误时，用同一凭据探测普通 HTTP CONNECT。 */
export function httpFallbackProxy(proxyUrl) {
  const proxy = normalizeProxy(proxyUrl);
  return /^(?:https|socks(?:4|5|5h)?):\/\//i.test(proxy)
    ? proxy.replace(/^(?:https|socks(?:4|5|5h)?):\/\//i, 'http://')
    : null;
}

export function maskProxyUrl(url) {
  return String(url || '').replace(/\/\/([^:@/]+):[^@/]+@/, '//$1:***@');
}

function hostOf(value) {
  try { return new URL(String(value || '')).hostname.toLowerCase(); } catch { return ''; }
}

function exchangeHosts(config = {}) {
  return [...new Set([
    config.apiUrl,
    config.wsUrl,
    config.fullnodeUrl,
    config.rpcUrl,
    config.tradingHttpUrl,
    config.tradingWsUrl,
  ].map(hostOf).filter(Boolean))];
}

function installRouteAwareFetch(byHost, summary) {
  globalThis[ROUTE_STATE] = { byHost, summary };
  if (globalThis[ROUTED_FETCH]) return;
  globalThis.fetch = async (input, init = {}) => {
    // An explicit dispatcher (AI/Binance/Ondo/connectivity probes) always wins.
    if (init?.dispatcher) return globalThis[ORIGINAL_FETCH](input, init);
    let hostname = '';
    try {
      const raw = typeof input === 'string' || input instanceof URL ? input : input?.url;
      hostname = new URL(raw).hostname.toLowerCase();
    } catch { /* native fetch will report the malformed URL */ }
    const dispatcher = globalThis[ROUTE_STATE]?.byHost?.get(hostname);
    return globalThis[ORIGINAL_FETCH](input, dispatcher ? { ...init, dispatcher } : init);
  };
  globalThis[ROUTED_FETCH] = true;
}

export function proxyRuntimeState() {
  return { ...(globalThis[ROUTE_STATE]?.summary || {}) };
}

/** 完整 SOCKS5 握手（RFC 1928/1929） */
export function socks5Connect({ host, port, user, pass }, destHost, destPort, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port: Number(port) });
    let buf = Buffer.alloc(0);
    let waiter = null;
    const fail = (msg) => { cleanup(); sock.destroy(); reject(new Error(msg)); };
    const timer = setTimeout(() => fail('SOCKS5 代理连接超时（代理无响应）'), timeoutMs);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      if (waiter && buf.length >= waiter.need) {
        const out = buf.subarray(0, waiter.need);
        buf = buf.subarray(waiter.need);
        const w = waiter; waiter = null; w.resolve(out);
      }
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const cleanup = () => { clearTimeout(timer); sock.off('data', onData); sock.off('error', onErr); };
    const read = (need) => new Promise((res) => {
      if (buf.length >= need) { const out = buf.subarray(0, need); buf = buf.subarray(need); res(out); }
      else waiter = { need, resolve: res };
    });
    sock.on('data', onData);
    sock.once('error', onErr);
    sock.once('connect', async () => {
      try {
        sock.write(Buffer.from([0x05, 0x02, 0x00, 0x02]));
        let r = await read(2);
        if (r[0] !== 0x05) return fail('不是 SOCKS5 代理（握手响应异常）');
        if (r[1] === 0x02) {
          const u = Buffer.from(String(user ?? ''), 'utf8');
          const p = Buffer.from(String(pass ?? ''), 'utf8');
          sock.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]));
          r = await read(2);
          if (r[1] !== 0x00) return fail('SOCKS5 认证被拒绝（用户名/密码错误，或套餐已过期）');
        } else if (r[1] !== 0x00) {
          return fail('SOCKS5 代理拒绝了支持的认证方式（代码 ' + r[1] + '）');
        }
        const dh = Buffer.from(String(destHost), 'utf8');
        sock.write(Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, dh.length]), dh,
          Buffer.from([(destPort >> 8) & 0xff, destPort & 0xff]),
        ]));
        const head = await read(4);
        if (head[1] !== 0x00) {
          const codes = { 1: '代理内部错误', 2: '规则不允许', 3: '网络不可达', 4: '主机不可达', 5: '连接被拒绝', 6: 'TTL 过期', 7: '命令不支持', 8: '地址类型不支持' };
          return fail('SOCKS5 无法连通目标（' + (codes[head[1]] || '代码 ' + head[1]) + '）');
        }
        const atyp = head[3];
        await read(atyp === 0x01 ? 6 : atyp === 0x04 ? 18 : (await read(1))[0] + 2);
        cleanup();
        resolve(sock);
      } catch (e) { fail(e?.message || String(e)); }
    });
  });
}

/**
 * 为指定代理 URL 创建 undici Dispatcher（Agent 或 ProxyAgent）。
 * 返回 dispatcher 实例，或 null（无代理/失败）。
 */
export async function createDispatcher(proxyUrl) {
  if (!proxyUrl) return null;
  const proxy = normalizeProxy(proxyUrl);
  try {
    const { Agent, ProxyAgent } = await import('undici');
    // Explicit per-exchange direct mode. Supplying a dedicated Agent is
    // important: omitting dispatcher would fall back to the global proxy.
    if (isDirectProxy(proxy)) return new Agent();
    if (/^socks/i.test(proxy)) {
      const u = new URL(proxy);
      const opts = {
        host: u.hostname, port: Number(u.port),
        user: u.username ? decodeURIComponent(u.username) : undefined,
        pass: u.password ? decodeURIComponent(u.password) : undefined,
      };
      return new Agent({
        connect(copts, callback) {
          const dport = Number(copts.port) || (copts.protocol === 'https:' ? 443 : 80);
          socks5Connect(opts, copts.hostname, dport)
            .then((socket) => {
              if (copts.protocol === 'https:') {
                const t = tls.connect({ socket, servername: copts.servername || copts.hostname, ALPNProtocols: ['http/1.1'] }, () => callback(null, t));
                t.once('error', (e) => callback(e, null));
              } else {
                callback(null, socket);
              }
            })
            .catch((e) => callback(e, null));
        },
      });
    }
    return new ProxyAgent(proxy);
  } catch (e) {
    console.error('⚠ 代理库加载失败，请先运行 npm install。错误：' + e.message);
    return null;
  }
}

/**
 * Aptos SDK's Node client uses `got`, so undici's global dispatcher cannot
 * affect it. Decibel installs this provider into its AptosConfig to make
 * fullnode reads, transaction submission and normal SDK fetch calls follow the
 * exact same Decibel route.
 */
export function createAptosClientProvider(dispatcher, timeoutMs = 30000) {
  return async function aptosClientProvider(request = {}) {
    const url = new URL(String(request.url));
    for (const [key, value] of Object.entries(request.params || {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = new Headers(request.headers || {});
    if (request.contentType && !headers.has('content-type')) headers.set('content-type', request.contentType);
    const accept = request.acceptType || headers.get('accept') || '';
    if (request.acceptType && !headers.has('accept')) headers.set('accept', request.acceptType);
    let body;
    if (request.body !== undefined && request.body !== null) {
      if (request.body instanceof Uint8Array || Buffer.isBuffer(request.body)) body = request.body;
      else {
        body = JSON.stringify(request.body);
        if (!headers.has('content-type')) headers.set('content-type', 'application/json');
      }
    }
    const response = await globalThis[ORIGINAL_FETCH](url, {
      method: request.method || 'GET',
      headers,
      body,
      dispatcher,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const responseType = response.headers.get('content-type') || accept;
    let data;
    if (/application\/x-bcs|application\/octet-stream/i.test(responseType)) {
      data = new Uint8Array(await response.arrayBuffer());
    } else {
      const text = await response.text();
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    }
    return {
      status: response.status,
      statusText: response.statusText,
      data,
      headers: Object.fromEntries(response.headers.entries()),
      request,
    };
  };
}

/**
 * 安装已完成目标探测的网络路由。
 * - 未命中的请求始终本机直连；GLOBAL_PROXY 绝不再成为隐形默认出口。
 * - 每个交易所 host 只绑定 resolveNetworkRoutes() 选出的可用通道。
 * - 选择结果可能是 direct、服务专用代理或最终兜底的全局代理。
 */
export async function setupProxies(cfg) {
  const globalProxy = String(cfg.globalProxy || '').trim();
  const byHost = new Map();
  const summary = {
    global: {
      source: globalProxy ? (isDirectProxy(globalProxy) ? 'direct' : 'global') : 'direct',
      configured: Boolean(globalProxy) && !isDirectProxy(globalProxy),
    },
  };
  let failure = null;
  try {
    const { Agent, setGlobalDispatcher } = await import('undici');
    // Direct is the process default. Global proxy is only bound to a target
    // after a direct and dedicated probe have both failed.
    const globalDispatcher = new Agent();
    if (!globalDispatcher) throw new Error('无法创建全局网络 dispatcher');
    setGlobalDispatcher(globalDispatcher);

    for (const definition of cfg.instanceManifest || EXCHANGE_MANIFEST) {
      const exchange = cfg.exchanges?.[definition.key] || cfg[definition.key] || {};
      const proxy = String(exchange.proxy || DIRECT_PROXY).trim() || DIRECT_PROXY;
      const source = exchange.proxySource || (isDirectProxy(proxy) ? 'direct' : 'exchange');
      const hosts = exchangeHosts(exchange);
      summary[definition.key] = {
        source,
        configured: Boolean(proxy) && !isDirectProxy(proxy),
        hosts,
      };
      const dispatcher = await createDispatcher(proxy);
      if (!dispatcher) throw new Error(`${definition.name} 网络 dispatcher 初始化失败`);
      for (const host of hosts) byHost.set(host, dispatcher);
    }
    installRouteAwareFetch(byHost, summary);
    return {
      used: globalProxy && !isDirectProxy(globalProxy) ? maskProxyUrl(normalizeProxy(globalProxy)) : null,
      mode: Object.entries(summary).some(([key, item]) => key !== 'global' && (item?.source === 'exchange' || item?.source === 'global')) ? 'proxy' : 'direct',
      dispatcher: globalDispatcher,
      routes: summary,
    };
  } catch (e) {
    failure = e;
    console.error('⚠ 设置全局代理失败：' + e.message);
  }
  installRouteAwareFetch(new Map(), summary);
  return { used: null, mode: 'direct', routes: summary, error: failure?.message || String(failure || '代理初始化失败') };
}

async function fetchPublicIp(dispatcher, timeoutMs = 10000) {
  const urls = ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com'];
  const attempts = await Promise.allSettled(urls.map(async (url) => {
    try {
      const res = await fetch(url, { dispatcher, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) {
        const ip = (await res.text()).trim();
        if (/^[0-9a-fA-F.:]+$/.test(ip)) return ip;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      throw new Error(e?.cause?.code || e?.cause?.message || e?.message || String(e));
    }
  }));
  const success = attempts.find((item) => item.status === 'fulfilled');
  if (success) return { ok: true, ip: success.value };
  const failed = attempts.find((item) => item.status === 'rejected');
  return { ok: false, error: failed?.reason?.message || '代理连接失败' };
}

async function closeDispatcher(dispatcher) {
  try { await dispatcher?.close?.(); } catch {}
}

export function connectionError(error) {
  const chain = [];
  let current = error;
  for (let i = 0; current && i < 8; i++, current = current.cause) chain.push(current);
  const code = chain.map((item) => item?.code || item?.errno).find(Boolean)
    || chain.map((item) => item?.name).find(Boolean)
    || 'FETCH_FAILED';
  return { code: String(code), message: chain.map((item) => item?.message).filter(Boolean).join(' | ') };
}

async function probeTarget(proxyUrl, targetUrl, timeoutMs) {
  let dispatcher;
  try {
    dispatcher = await createDispatcher(proxyUrl);
    if (!dispatcher) return { reachable: false, code: 'PROXY_INIT_FAILED' };
    const res = await fetch(targetUrl, {
      dispatcher,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'AI-Grid-Ops-Connectivity-Test/1.0' },
    });
    // 401/403/404 也证明 TLS/HTTP 已到达目标；这里只检测网络链路。
    return { reachable: true, status: res.status };
  } catch (error) {
    return { reachable: false, ...connectionError(error) };
  } finally {
    await closeDispatcher(dispatcher);
  }
}

async function probeDirectTarget(targetUrl, timeoutMs) {
  let dispatcher;
  try {
    const { Agent } = await import('undici');
    dispatcher = new Agent();
    const res = await fetch(targetUrl, {
      dispatcher,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'AI-Grid-Ops-Connectivity-Test/1.0' },
    });
    return { reachable: true, status: res.status };
  } catch (error) {
    return { reachable: false, ...connectionError(error) };
  } finally {
    await closeDispatcher(dispatcher);
  }
}

async function probePublicIp(proxyUrl, timeoutMs) {
  let dispatcher;
  try {
    dispatcher = await createDispatcher(proxyUrl);
    if (!dispatcher) return { ok: false, error: '代理检测器初始化失败' };
    return await fetchPublicIp(dispatcher, timeoutMs);
  } finally {
    await closeDispatcher(dispatcher);
  }
}

/**
 * Build the only supported failover order. Duplicate proxy URLs and explicit
 * `direct` values are collapsed so a service is never probed twice.
 */
export function networkRouteCandidates({ dedicatedProxy = '', globalProxy = '', dedicatedSource = 'exchange' } = {}) {
  const candidates = [{ source: 'direct', proxy: DIRECT_PROXY, label: '本机直连' }];
  const seen = new Set([DIRECT_PROXY]);
  const add = (source, value, label) => {
    const raw = String(value || '').trim();
    if (!raw || isDirectProxy(raw)) return;
    const normalized = normalizeProxy(raw);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push({ source, proxy: normalized, label });
  };
  add(dedicatedSource, dedicatedProxy, dedicatedSource === 'ai' ? 'AI 专用代理' : '服务专用代理');
  add('global', globalProxy, '全局代理');
  return candidates;
}

async function probeRouteCandidate(candidate, targetUrl, timeoutMs) {
  if (candidate.source === 'direct') {
    const result = await probeDirectTarget(targetUrl, timeoutMs);
    return { ...result, proxy: DIRECT_PROXY };
  }
  const primary = await probeTarget(candidate.proxy, targetUrl, timeoutMs);
  if (primary.reachable) return { ...primary, proxy: candidate.proxy };
  const repaired = httpFallbackProxy(candidate.proxy);
  if (repaired) {
    const fallback = await probeTarget(repaired, targetUrl, timeoutMs);
    if (fallback.reachable) {
      return { ...fallback, proxy: repaired, repairedProtocol: true, originalCode: primary.code };
    }
  }
  return { ...primary, proxy: candidate.proxy };
}

/**
 * Probe a real target sequentially and select the first usable route:
 * direct -> service-specific proxy -> GLOBAL_PROXY.
 *
 * This is deliberately a preflight selector rather than a blind request
 * replayer. Order-placement POSTs are never duplicated across routes.
 */
export async function selectNetworkRoute({
  targetUrl,
  additionalTargetUrls = [],
  dedicatedProxy = '',
  globalProxy = '',
  dedicatedSource = 'exchange',
  timeoutMs = 10000,
  probe = probeRouteCandidate,
} = {}) {
  let targetHost = '目标服务';
  try { targetHost = new URL(targetUrl).hostname; } catch {}
  if (!targetUrl) return { ok: false, code: 'NO_TARGET', targetHost, error: '未配置目标 API 地址。', attempts: [] };

  const candidates = networkRouteCandidates({ dedicatedProxy, globalProxy, dedicatedSource });
  const attempts = [];
  const targets = [targetUrl, ...additionalTargetUrls.filter(Boolean)];
  for (const candidate of candidates) {
    const targetResults = [];
    for (const url of targets) {
      let result;
      try {
        result = await probe(candidate, url, timeoutMs);
      } catch (error) {
        result = { reachable: false, ...connectionError(error) };
      }
      targetResults.push({ url, ...result });
      if (!result?.reachable) break;
    }
    const result = targetResults.at(-1) || { reachable: false, code: 'NO_TARGET' };
    const allReachable = targetResults.length === targets.length && targetResults.every((item) => item.reachable);
    const attempt = {
      source: candidate.source,
      label: candidate.label,
      ok: allReachable,
      status: result?.status || null,
      code: result?.code || null,
      repairedProtocol: Boolean(result?.repairedProtocol),
      targets: targetResults.map((item) => ({
        targetHost: (() => { try { return new URL(item.url).hostname; } catch { return item.url; } })(),
        ok: Boolean(item.reachable), status: item.status || null, code: item.code || null,
      })),
    };
    attempts.push(attempt);
    if (allReachable) {
      return {
        ok: true,
        targetHost,
        proxy: result.proxy || candidate.proxy,
        source: candidate.source,
        status: result.status,
        repairedProtocol: Boolean(result.repairedProtocol),
        autoSwitched: attempts.length > 1,
        attempts,
      };
    }
  }

  const last = attempts.at(-1) || {};
  return {
    ok: false,
    targetHost,
    code: last.code || 'ALL_ROUTES_FAILED',
    attempts,
    error: `${targetHost} 的本机直连、服务专用代理和全局代理均不可用。`,
  };
}

/** Resolve and write each exchange's selected runtime route into cfg. */
export async function resolveNetworkRoutes(cfg, { timeoutMs = 10000, select = selectNetworkRoute } = {}) {
  const definitions = cfg.instanceManifest || EXCHANGE_MANIFEST;
  const results = await Promise.all(definitions.map(async (definition) => {
    const exchange = cfg.exchanges?.[definition.key] || cfg[definition.key] || {};
    const apiUrl = String(exchange.apiUrl || '').replace(/\/$/, '');
    const targetUrl = apiUrl ? `${apiUrl}${definition.healthPath || ''}` : '';
    const additionalTargetUrls = (definition.additionalHealthProps || [])
      .map((prop) => String(exchange[prop] || '').replace(/\/$/, ''))
      .filter(Boolean);
    const result = await select({
      targetUrl,
      additionalTargetUrls,
      dedicatedProxy: exchange.dedicatedProxy || '',
      globalProxy: cfg.globalProxy || exchange.globalProxy || '',
      dedicatedSource: 'exchange',
      timeoutMs,
    });
    if (result.ok) {
      exchange.proxy = result.proxy;
      exchange.proxySource = result.source;
      exchange.routeAttempts = result.attempts;
    }
    return { key: definition.key, name: definition.name, targetUrl, ...result };
  }));
  return results;
}

/**
 * Diagnostic for the configured global channel. It checks a public IP and all
 * LIVE targets, but its result must not block the local console from starting:
 * users need that console to repair GLOBAL_PROXY. Trading safety is enforced
 * separately by per-target route checks before a LIVE grid can start/resume.
 */
export async function checkGlobalProxyReadiness(cfg, {
  timeoutMs = 10000,
  checkIp = checkProxy,
  checkTarget = checkProxyTarget,
} = {}) {
  const configured = String(cfg.globalProxy || '').trim();
  const initial = configured || DIRECT_PROXY;
  const candidates = [initial];
  const repaired = httpFallbackProxy(initial);
  if (repaired && repaired !== initial) candidates.push(repaired);
  const liveTargets = (cfg.instanceManifest || EXCHANGE_MANIFEST)
    .filter((definition) => cfg.exchanges?.[definition.key]?.mode === 'live')
    .map((definition) => {
      const exchange = cfg.exchanges[definition.key];
      const base = String(exchange.apiUrl || '').replace(/\/$/, '');
      return { key: definition.key, name: definition.name, targetUrl: base ? `${base}${definition.healthPath || ''}` : '' };
    });
  const attempts = [];

  for (const candidate of candidates) {
    const ip = await checkIp(candidate);
    const targets = await Promise.all(liveTargets.map(async (item) => ({
      ...item,
      ...(item.targetUrl
        ? await checkTarget(candidate, item.targetUrl, { timeoutMs })
        : { ok: false, code: 'NO_TARGET', error: '未配置目标 API 地址。' }),
    })));
    const ok = Boolean(ip.ok) && targets.every((item) => item.ok);
    attempts.push({
      source: isDirectProxy(candidate) ? 'direct' : 'global',
      ipOk: Boolean(ip.ok),
      targetResults: targets.map((item) => ({ key: item.key, name: item.name, ok: item.ok, status: item.status || null, code: item.code || null, targetHost: item.targetHost || null })),
    });
    if (ok) {
      return {
        ok: true,
        source: isDirectProxy(candidate) ? 'direct' : 'global',
        effectiveProxy: candidate,
        configured: Boolean(configured) && !isDirectProxy(configured),
        repairedProtocol: candidate !== initial,
        ip: ip.ip || null,
        targets,
        attempts,
      };
    }
  }

  const last = attempts.at(-1);
  return {
    ok: false,
    source: configured && !isDirectProxy(configured) ? 'global' : 'direct',
    configured: Boolean(configured) && !isDirectProxy(configured),
    code: 'GLOBAL_PROXY_NOT_READY',
    attempts,
    error: `全局网络通道未通过启动预检${last?.ipOk ? '：代理能联网，但至少一个 LIVE 交易所目标不可访问。' : '：无法获取公网出口 IP。'}`,
  };
}

export function describeProxyTargetDiagnosis({ targetHost, configuredScheme, primaryTarget, primaryIp, fallbackTarget, fallbackIp }) {
  const targetCode = fallbackTarget?.code || primaryTarget?.code || 'FETCH_FAILED';
  const protocolWrong = Boolean(fallbackTarget || fallbackIp) && configuredScheme !== 'http';
  if (fallbackTarget?.reachable) {
    return {
      ok: false,
      code: 'PROXY_PROTOCOL_MISMATCH',
      protocolWrong: true,
      detectedProtocol: 'http',
      error: `代理协议填写错误：该端口使用普通 HTTP CONNECT，不是 ${configuredScheme.toUpperCase()} 代理。请把代理前缀改为 http:// 后重新保存。`,
    };
  }
  if (protocolWrong && fallbackIp?.ok && !fallbackTarget?.reachable) {
    return {
      ok: false,
      code: 'PROXY_PROTOCOL_AND_TARGET_BLOCKED',
      protocolWrong: true,
      targetBlocked: true,
      detectedProtocol: 'http',
      error: `检测到两个问题：① 该端口实际使用 HTTP CONNECT，不能填写 ${configuredScheme}://；② 即使改为 http://，节点虽能联网，但访问 ${targetHost} 仍失败（${targetCode}）。该节点不能用于当前目标服务，请更换明确允许访问 ${targetHost}:443 的代理节点。`,
    };
  }
  if (primaryIp?.ok && !primaryTarget?.reachable) {
    return {
      ok: false,
      code: 'PROXY_TARGET_BLOCKED',
      targetBlocked: true,
      error: `代理本身可以联网，但访问 ${targetHost} 失败（${primaryTarget?.code || 'FETCH_FAILED'}）。该节点不能用于当前目标服务，请更换明确允许访问 ${targetHost}:443 的代理节点。`,
    };
  }
  return {
    ok: false,
    code: protocolWrong ? 'PROXY_PROTOCOL_MISMATCH' : 'PROXY_UNREACHABLE',
    protocolWrong,
    error: protocolWrong
      ? `代理协议或节点不可用：该端口不是 ${configuredScheme.toUpperCase()} 代理；HTTP CONNECT 探测也未能连通 ${targetHost}。请核对代理服务商提供的协议、端口和有效期。`
      : `代理无法连接 ${targetHost}（${primaryTarget?.code || 'FETCH_FAILED'}），且未能通过该代理访问公网。请核对地址、端口、用户名、密码和套餐状态。`,
  };
}

/**
 * 同时验证代理自身联网和指定目标域名；对常见的 https:// / socks5:// 前缀误填
 * 自动用同一凭据探测 HTTP CONNECT，从而区分“协议错误”和“节点屏蔽目标”。
 */
export async function checkProxyTarget(proxyUrl, targetUrl, { timeoutMs = 10000 } = {}) {
  const configured = proxyUrl ?? process.env.AI_PROXY ?? process.env.GLOBAL_PROXY ?? '';
  let targetHost = '目标服务商';
  try { targetHost = new URL(targetUrl).hostname; } catch {}
  if (isDirectProxy(configured)) {
    const directTarget = await probeDirectTarget(targetUrl, timeoutMs);
    if (directTarget.reachable) {
      return {
        ok: true,
        direct: true,
        explicitDirect: true,
        targetHost,
        status: directTarget.status,
      };
    }
    return {
      ok: false,
      direct: true,
      explicitDirect: true,
      targetHost,
      code: directTarget.code || 'FETCH_FAILED',
      error: `本机直连 ${targetHost} 失败（${directTarget.code || 'FETCH_FAILED'}）。请取消直连模式并配置允许访问该域名的交易所专用代理。`,
    };
  }
  if (!configured) {
    const directTarget = await probeDirectTarget(targetUrl, timeoutMs);
    if (directTarget.reachable) return { ok: true, direct: true, targetHost, status: directTarget.status };
    return {
      ok: false,
      direct: true,
      targetHost,
      code: directTarget.code || 'FETCH_FAILED',
      error: `本机直连 ${targetHost} 失败（${directTarget.code || 'FETCH_FAILED'}）。请配置允许访问该域名的交易所专用代理。`,
    };
  }
  const normalized = normalizeProxy(configured);
  let configuredScheme = 'http';
  try { configuredScheme = new URL(normalized).protocol.replace(':', '').toLowerCase(); } catch {}

  const [primaryTarget, primaryIp, directTarget] = await Promise.all([
    probeTarget(configured, targetUrl, timeoutMs),
    probePublicIp(configured, timeoutMs),
    probeDirectTarget(targetUrl, timeoutMs),
  ]);
  if (primaryTarget.reachable) {
    return { ok: true, targetHost, status: primaryTarget.status, configuredScheme };
  }

  const fallbackUrl = httpFallbackProxy(configured);
  let fallbackTarget = null;
  let fallbackIp = null;
  if (fallbackUrl) {
    [fallbackTarget, fallbackIp] = await Promise.all([
      probeTarget(fallbackUrl, targetUrl, timeoutMs),
      probePublicIp(fallbackUrl, timeoutMs),
    ]);
  }
  const diagnosis = describeProxyTargetDiagnosis({ targetHost, configuredScheme, primaryTarget, primaryIp, fallbackTarget, fallbackIp });
  return {
    targetHost,
    configuredScheme,
    ...diagnosis,
    directAvailable: Boolean(directTarget?.reachable),
    directStatus: directTarget?.status,
    ...(directTarget?.reachable ? {
      directSuggestion: `本机直连 ${targetHost} 正常（HTTP ${directTarget.status}），可以将该交易所代理设为 direct，以绕过失效的全局/专用代理。`,
    } : {}),
  };
}

/**
 * 验证当前 .env 中的代理。使用独立 dispatcher，因此刚写入的配置无需重启即可检测。
 * HTTPS/SOCKS5 超时时会用相同节点探测 HTTP CONNECT，以识别常见的协议前缀错误。
 */
export async function checkProxy(proxyUrl) {
  const configured = proxyUrl ?? process.env.GLOBAL_PROXY ?? '';
  let dispatcher;
  try {
    if (configured) dispatcher = await createDispatcher(configured);
    else {
      const { Agent } = await import('undici');
      dispatcher = new Agent();
    }
    if (!dispatcher) return { ok: false, error: '代理检测器初始化失败，请确认依赖已安装。' };
    const result = await fetchPublicIp(dispatcher);
    await closeDispatcher(dispatcher);
    if (result.ok) return result;

    const fallbackUrl = httpFallbackProxy(configured);
    if (fallbackUrl) {
      const fallbackDispatcher = await createDispatcher(fallbackUrl);
      if (fallbackDispatcher) {
        const fallbackResult = await fetchPublicIp(fallbackDispatcher);
        await closeDispatcher(fallbackDispatcher);
        if (fallbackResult.ok) {
          const enteredProtocol = /^https:\/\//i.test(normalizeProxy(configured)) ? 'https' : 'socks5';
          return {
            ok: false,
            error: `检测到代理协议填写错误：该节点使用普通 HTTP CONNECT，不支持 ${enteredProtocol === 'https' ? 'HTTPS/TLS 代理连接' : 'SOCKS5'}。请把地址前缀从 ${enteredProtocol}:// 改为 http://，写入 .env 后重启本地引擎。`,
            enteredProtocol,
            detectedProtocol: 'http',
            ip: fallbackResult.ip,
          };
        }
      }
    }
    return result;
  } catch (e) {
    await closeDispatcher(dispatcher);
    return { ok: false, error: e?.cause?.code || e?.cause?.message || e?.message || String(e) };
  }
}
