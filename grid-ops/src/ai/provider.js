// 多提供商 AI 接口层：一个 aiChat() 通吃三种主流 API 协议。
//   openai    — OpenAI 兼容协议（OpenAI / DeepSeek / Kimi(Moonshot) / 通义 Qwen /
//               智谱 / OpenRouter / Ollama 本地 等，只需改 AI_BASE_URL + AI_MODEL）
//   anthropic — Claude 原生协议
//   gemini    — Google Gemini 原生协议
// 配置全部从环境变量实时读取（仪表盘写 .env 后立即生效，无需重启）。
// AI 请求始终携带自己的 dispatcher，绝不隐式继承某个交易所的代理。

import { createDispatcher, DIRECT_PROXY, isDirectProxy, selectNetworkRoute } from '../proxy.js';

const DEFAULTS = {
  openai:    { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { base: 'https://api.anthropic.com', model: 'claude-3-5-haiku-latest' },
  gemini:    { base: 'https://generativelanguage.googleapis.com', model: 'gemini-2.0-flash' },
};

export function getAiConfig() {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  const d = DEFAULTS[provider] || DEFAULTS.openai;
  const proxy = String(process.env.AI_PROXY || '').trim();
  const globalProxy = String(process.env.GLOBAL_PROXY || '').trim();
  // The actual route is selected against the provider target immediately
  // before a request: direct -> AI_PROXY -> GLOBAL_PROXY.
  const effectiveProxy = DIRECT_PROXY;
  return {
    provider: DEFAULTS[provider] ? provider : 'openai',
    apiKey: process.env.AI_API_KEY || '',
    // 可为 AI 单独指定代理，避免交易所代理能联网却屏蔽 AI 服务商域名。
    proxy,
    globalProxy,
    effectiveProxy,
    proxySource: 'direct',
    proxyConfigured: false,
    baseUrl: (process.env.AI_BASE_URL || d.base).replace(/\/$/, ''),
    model: process.env.AI_MODEL || d.model,
    // 高频低成本任务（哨兵巡检）可指定更便宜的小模型；未配置则用主模型
    modelSmall: process.env.AI_MODEL_SMALL || process.env.AI_MODEL || d.model,
    sentinelMin: Number(process.env.AI_SENTINEL_MINUTES ?? 5),
    marketMin: Number(process.env.AI_MARKET_MINUTES ?? 30), // BTC 市况报告间隔（分钟，0=关闭）
    reportHour: Number(process.env.AI_REPORT_HOUR ?? 20),
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChat: process.env.TELEGRAM_CHAT_ID || '',
    webhook: process.env.NOTIFY_WEBHOOK || '',
  };
}

function errorChain(error) {
  const chain = [];
  let current = error;
  for (let i = 0; current && i < 8; i++, current = current.cause) chain.push(current);
  return chain;
}

function safeTarget(baseUrl) {
  try { return new URL(baseUrl).host; } catch { return '已配置的 AI 接口'; }
}

function providerName(provider) {
  return provider === 'openai' ? 'OpenAI / 兼容服务商'
    : provider === 'anthropic' ? 'Anthropic'
      : provider === 'gemini' ? 'Google Gemini' : 'AI 服务商';
}

function hasConfiguredProxy(cfg) {
  const effective = cfg.effectiveProxy || DIRECT_PROXY;
  return !isDirectProxy(effective);
}

function aiProbeTarget(cfg) {
  return cfg.provider === 'openai' ? `${cfg.baseUrl}/models` : cfg.baseUrl;
}

/**
 * 把 Node.js 含糊的 `fetch failed` 展开为用户可以据此处理的网络原因。
 * 只返回错误类型与目标域名，绝不包含 API Key 或代理密码。
 */
export function describeAiFetchError(error, cfg = getAiConfig()) {
  const chain = errorChain(error);
  const codes = chain.map((item) => String(item?.code || item?.errno || '')).filter(Boolean);
  const messages = chain.map((item) => String(item?.message || '')).join(' | ');
  const code = codes.find(Boolean) || 'FETCH_FAILED';
  const target = safeTarget(cfg.baseUrl);
  const service = providerName(cfg.provider);
  const throughProxy = cfg.proxyConfigured ?? hasConfiguredProxy(cfg);
  const proxyHint = throughProxy
    ? '当前代理能查询公网 IP，不代表它允许访问该 AI 域名；请更换支持 HTTPS CONNECT 且允许访问该域名的节点，或在“AI 专用代理”中填写可用节点。'
    : '请检查本机网络、防火墙、DNS，或配置一个能访问该服务商的“AI 专用代理”。';

  if (codes.includes('ECONNRESET') || /socket hang up|connection reset|ECONNRESET/i.test(messages)) {
    return `${service}（${target}）连接被${throughProxy ? '代理节点或远端' : '远端'}重置（ECONNRESET）。${proxyHint}`;
  }
  if (codes.some((item) => /UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT/.test(item))
      || /connect timeout|timed out|timeout/i.test(messages)
      || chain.some((item) => item?.name === 'TimeoutError' || item?.name === 'AbortError')) {
    return `${service}（${target}）连接超时（${code}）。${proxyHint}`;
  }
  if (codes.some((item) => /ENOTFOUND|EAI_AGAIN/.test(item)) || /getaddrinfo/i.test(messages)) {
    return `${service}（${target}）域名解析失败（${code}）。请检查 DNS；使用 SOCKS5 时建议让代理端解析域名。`;
  }
  if (codes.includes('ECONNREFUSED')) {
    return `${service}（${target}）拒绝连接（ECONNREFUSED）。请确认代理地址、端口与协议正确，且代理服务仍有效。`;
  }
  if (codes.some((item) => /CERT|TLS|SSL/.test(item)) || /certificate|tls|ssl/i.test(messages)) {
    return `${service}（${target}）TLS 证书握手失败（${code}）。请检查系统时间、HTTPS 检查软件和代理的 TLS 支持。`;
  }
  return `${service}（${target}）网络请求失败（${code}）。${proxyHint}`;
}

function safeApiMessage(value) {
  return String(value || '').replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').slice(0, 300);
}

export function describeAiHttpError(provider, status, payload) {
  const detail = safeApiMessage(payload?.error?.message || payload?.message || '服务商未返回详细信息');
  const service = providerName(provider);
  if (status === 401) return `${service} 返回 HTTP 401：API Key 无效、已失效，或当前出口 IP 不在授权名单。${detail}`;
  if (status === 403) return `${service} 返回 HTTP 403：当前账户、地区或出口 IP 无权访问。${detail}`;
  if (status === 404) return `${service} 返回 HTTP 404：接口地址或模型名不存在/当前项目无权使用。${detail}`;
  if (status === 429) return `${service} 返回 HTTP 429：余额/配额不足，或请求频率受限。请检查 API 平台 Billing、Usage 与项目限额。${detail}`;
  return `${service} 接口错误 HTTP ${status}：${detail}`;
}

async function closeDispatcher(dispatcher) {
  try { await dispatcher?.close?.(); } catch {}
}

/**
 * 统一对话接口。
 * @param {object} o
 *   o.system   系统提示词
 *   o.messages [{role:'user'|'assistant', content:string}]
 *   o.small    true=用小模型（哨兵等高频任务）
 *   o.json     true=要求返回 JSON（openai 用 response_format，其余靠提示词约束）
 * @returns {Promise<string>} 模型回复文本
 */
export async function aiChat({ system = '', messages, small = false, json = false, maxTokens = 1500, temperature = 0.3, timeoutMs = 60000, proxyOverride }) {
  const cfg = getAiConfig();
  // Used by the connectivity screen to perform a one-off direct test without
  // mutating the saved AI_PROXY or exposing the API key to the browser.
  if (proxyOverride !== undefined) {
    cfg.proxy = String(proxyOverride || '');
    cfg.effectiveProxy = cfg.proxy || DIRECT_PROXY;
    cfg.proxySource = isDirectProxy(cfg.effectiveProxy) ? 'direct' : 'ai';
    cfg.proxyConfigured = !isDirectProxy(cfg.effectiveProxy);
  } else {
    const route = await selectNetworkRoute({
      targetUrl: aiProbeTarget(cfg),
      dedicatedProxy: cfg.proxy,
      globalProxy: cfg.globalProxy,
      dedicatedSource: 'ai',
      timeoutMs: Math.min(10000, timeoutMs),
    });
    if (!route.ok) {
      const error = new Error(route.error || 'AI 的直连、专用代理和全局代理均不可用。');
      error.diagnosticCode = route.code || 'ALL_ROUTES_FAILED';
      error.target = route.targetHost;
      error.routeAttempts = route.attempts;
      throw error;
    }
    cfg.effectiveProxy = route.proxy;
    cfg.proxySource = route.source;
    cfg.proxyConfigured = !isDirectProxy(route.proxy);
  }
  if (!cfg.apiKey) throw new Error('未配置 AI_API_KEY，请在「AI 助手」页填写接入信息。');
  const model = small ? cfg.modelSmall : cfg.model;
  const signal = AbortSignal.timeout(timeoutMs);
  const dispatcher = await createDispatcher(cfg.effectiveProxy || DIRECT_PROXY);
  if (!dispatcher) throw new Error('AI 网络通道初始化失败，请检查代理地址、协议和依赖。');
  const request = async (url, init) => {
    try {
      return await fetch(url, { ...init, ...(dispatcher ? { dispatcher } : {}) });
    } catch (error) {
      const wrapped = new Error(describeAiFetchError(error, cfg), { cause: error });
      wrapped.diagnosticCode = errorChain(error).map((item) => item?.code).find(Boolean) || 'FETCH_FAILED';
      wrapped.target = safeTarget(cfg.baseUrl);
      throw wrapped;
    }
  };

  try {
    if (cfg.provider === 'anthropic') {
      const res = await request(cfg.baseUrl + '/v1/messages', {
      method: 'POST', signal,
      headers: { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature,
        system: system + (json ? '\n必须只输出一个合法 JSON 对象，不要任何其他文字。' : ''),
        messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      }),
    });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(describeAiHttpError(cfg.provider, res.status, j));
      const text = (j?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      if (!text) throw new Error('Anthropic 返回为空');
      return text;
    }

    if (cfg.provider === 'gemini') {
      const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const res = await request(`${cfg.baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { system_instruction: { parts: [{ text: system + (json ? '\n必须只输出一个合法 JSON 对象，不要任何其他文字。' : '') }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(describeAiHttpError(cfg.provider, res.status, j));
      const text = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) throw new Error('Gemini 返回为空');
      return text;
    }

    // openai 兼容协议（默认）
    const res = await request(cfg.baseUrl + '/chat/completions', {
      method: 'POST', signal,
      headers: { Authorization: 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature,
        messages: [
          ...(system ? [{ role: 'system', content: system + (json ? '\n必须只输出一个合法 JSON 对象，不要任何其他文字。' : '') }] : []),
          ...messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
        ],
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(describeAiHttpError(cfg.provider, res.status, j));
    const text = j?.choices?.[0]?.message?.content;
    if (!text) throw new Error('AI 返回为空');
    return text;
  } finally {
    await closeDispatcher(dispatcher);
  }
}

/** 从模型回复里稳健地抠出第一个 JSON 对象（容忍 ```json 包裹、前后废话）。 */
export function extractJson(text) {
  if (!text) return null;
  const s = String(text);
  const start = s.indexOf('{');
  if (start < 0) return null;
  // 从第一个 { 起做括号配对，忽略字符串内部的花括号
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; } } }
  }
  return null;
}

async function routedNotificationFetch(url, init, cfg) {
  let probeUrl = url;
  try { probeUrl = new URL(url).origin; } catch {}
  const route = await selectNetworkRoute({
    targetUrl: probeUrl,
    dedicatedProxy: cfg.proxy,
    globalProxy: cfg.globalProxy,
    dedicatedSource: 'ai',
    timeoutMs: 8000,
  });
  if (!route.ok) throw new Error(route.error || '通知通道没有可用网络路由。');
  const dispatcher = await createDispatcher(route.proxy);
  try { return await fetch(url, { ...init, dispatcher }); }
  finally { await closeDispatcher(dispatcher); }
}

/** 推送通知：Telegram + 通用 Webhook，配了哪个发哪个；失败只记日志绝不抛。 */
export async function notify(text) {
  const cfg = getAiConfig();
  const jobs = [];
  if (cfg.telegramToken && cfg.telegramChat) {
    jobs.push(routedNotificationFetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.telegramChat, text: String(text).slice(0, 3800) }),
    }, cfg).then((r) => { if (!r.ok) console.error('[通知] Telegram 发送失败 HTTP ' + r.status); }));
  }
  if (cfg.webhook) {
    jobs.push(routedNotificationFetch(cfg.webhook, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: String(text).slice(0, 3800) }),
    }, cfg).then((r) => { if (!r.ok) console.error('[通知] Webhook 发送失败 HTTP ' + r.status); }));
  }
  if (!jobs.length) return false;
  await Promise.allSettled(jobs);
  return true;
}
