/*
 * WelinkBTC hosting/session adapter for the authentic FreqUI 3.1.2 distribution.
 * Copyright (C) 2026 WelinkBTC contributors. GPL-3.0-or-later.
 * This is integration code, not an upstream FreqUI file.
 */
const BASE = '/quant-native/freqtrade/';
const API_PREFIX = '/api/quant-suite/native/freqtrade/api/v1';
const AUTH_KEY = 'welink.frequi.auth';
const BOT_ID = 'welink.freqtrade';
const status = document.getElementById('welink-frequi-status');
const isChinese = (() => { try { return localStorage.getItem('welinkbtc-language') !== 'en'; } catch { return true; } })();
function message(zh, en) { return isChinese ? zh : en; }
function setStatus(text, state = 'offline') {
  if (status) { status.textContent = text; status.dataset.state = state; }
}
function apiUrl(config) {
  const base = new URL(config.baseURL || API_PREFIX, location.origin);
  const endpoint = String(config.url || '');
  const target = new URL(/^[a-z][a-z\d+.-]*:/i.test(endpoint) ? endpoint : `${base.href.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`);
  if (target.origin !== location.origin || !target.pathname.startsWith(`${API_PREFIX}/`)) {
    throw new Error(message('此工作台只允许访问本站已授权的 Freqtrade 连接。', 'This workspace only permits the authorized same-origin Freqtrade connection.'));
  }
  return target;
}

// Called from the small, documented replacement of FreqUI's Axios auth adapter.
// FreqUI's original per-action UI confirmations and all BFF checks still apply.
window.welinkFreqUiRequest = async (config) => {
  const target = apiUrl(config);
  const method = String(config.method || 'get').toUpperCase();
  config.withCredentials = true;
  config.headers.delete?.('Authorization');
  if (!['GET', 'HEAD'].includes(method)) {
    config.headers.set('X-Quant-Request-Id', crypto.randomUUID());
    if (target.pathname === `${API_PREFIX}/start`) {
      const confirmation = window.prompt(message(
        '启动操作将使用本系统已保存并经服务器验证的策略。若为 LIVE 环境，将交易真实资金。请输入 LIVE freqtrade 确认；取消则不会提交。',
        'Startup uses the saved and server-verified strategy. A LIVE environment trades real funds. Type LIVE freqtrade to confirm, or cancel to submit nothing.',
      ), '');
      if (confirmation !== 'LIVE freqtrade') throw new Error(message('已取消启动，未提交交易操作。', 'Startup canceled. No trading action was submitted.'));
      config.headers.set('X-Quant-Confirmation', confirmation);
    }
  }
  return config;
};

window.welinkFreqUiResponse = (response) => {
  if (String(response.config?.url || '').replace(/^\//, '') === 'ping' && response.data?.status === 'pong') {
    setStatus(message('原生 API 已连接 · FreqUI 3.1.2', 'Native API connected · FreqUI 3.1.2'), 'connected');
  }
};
window.welinkFreqUiError = (error) => {
  const code = error.response?.status;
  const detail = error.response?.data?.message || error.response?.data?.detail || error.message;
  if (code === 401 || code === 403) {
    setStatus(message('本站会话无效或权限不足，请返回工作台登录。', 'The site session is invalid or lacks access. Return to the workspace to sign in.'));
  } else if (code >= 500 || !error.response) {
    setStatus(message('原生 API 尚未连接；界面已加载，数据与执行不可用。', 'The native API is not connected. The UI is loaded; data and execution are unavailable.'));
  }
  if (status && detail) status.title = String(detail).slice(0, 500);
};

// The session is the authentication mechanism. No upstream password or JWT is
// put in browser storage. This namespaced descriptor only selects a BFF route.
try {
  const response = await fetch('/api/quant-suite', { credentials: 'same-origin', cache: 'no-store' });
  const access = await response.json();
  if (response.ok && access.ok && access.canOperate) {
    localStorage.setItem(AUTH_KEY, JSON.stringify({
      [BOT_ID]: { botName: 'WELINKBTC · Freqtrade', apiUrl: `${location.origin}/api/quant-suite/native/freqtrade`, username: '', accessToken: '', refreshToken: '', autoRefresh: true, sortId: 0 },
    }));
    localStorage.setItem('welink.frequi.selected', BOT_ID);
    setStatus(message('原版 FreqUI 3.1.2 · 正在检查原生 API', 'Original FreqUI 3.1.2 · Checking the native API'), 'checking');
  } else {
    // Guests may inspect the genuine upstream UI. Do not invent a bot or
    // make native API calls before the site's authenticated account is ready.
    localStorage.setItem(AUTH_KEY, '{}');
    localStorage.removeItem('welink.frequi.selected');
    setStatus(message('原版 FreqUI 3.1.2 · 登录本站后可连接账户引擎。', 'Original FreqUI 3.1.2 · Sign in to this site to connect your account engine.'));
  }
  // Upstream Iconify supports preloaded collections and provider overrides.
  // Keep its original icons without contacting external icon APIs at runtime.
  const iconResponse = await fetch(`${BASE}iconify/mdi.json`, { credentials: 'same-origin' });
  if (!iconResponse.ok) throw new Error(message('本地图标资源加载失败。', 'The local icon resource could not be loaded.'));
  const iconCollection = await iconResponse.json();
  if (iconCollection.prefix !== 'mdi' || !iconCollection.icons) throw new Error('Invalid local icon collection.');
  const lucideResponse = await fetch(`${BASE}iconify/lucide.json`, { credentials: 'same-origin' });
  if (!lucideResponse.ok) throw new Error('The local Lucide resource could not be loaded.');
  const lucideCollection = await lucideResponse.json();
  if (lucideCollection.prefix !== 'lucide' || !lucideCollection.icons) throw new Error('Invalid local Lucide collection.');
  window.IconifyPreload = [iconCollection, lucideCollection];
  window.IconifyProviders = { '': { resources: [`${location.origin}${BASE}iconify`], path: '/' } };
  if (location.pathname === `${BASE}index.html`) history.replaceState(null, '', BASE + location.search + location.hash);
  await import('./assets/index-wxgNlDZx.js');
} catch (error) {
  setStatus(error.message || message('无法验证本站会话。', 'Could not verify the site session.'));
  const app = document.getElementById('app');
  if (app) {
    const panel = document.createElement('section'); panel.className = 'welink-frequi-access';
    const title = document.createElement('h1'); title.textContent = 'FreqUI 3.1.2';
    const text = document.createElement('p'); text.textContent = error.message;
    const link = document.createElement('a'); link.href = '/quant-suite/freqtrade'; link.target = '_top'; link.textContent = message('返回量化交易集', 'Return to Quant Suite');
    panel.append(title, text, link); app.replaceChildren(panel);
  }
}
