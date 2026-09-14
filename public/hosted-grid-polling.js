// One authenticated read feeds every hosted exchange panel. No trading command
// or credential response is cached here; this cache lives only in this iframe.
window.createHostedGridPolling = function (nativeFetch, prefix) {
  let cached = null;
  let pending = null;
  let expiresAt = 0;
  let revision = 0;
  let visible = null;
  const sharedPaths = new Set(['/overview', '/overview/stream', '/hedge', '/proxy-config', '/proxy-check', '/ai/status']);
  function pathOf(url) {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && parsed.pathname.startsWith(prefix + '/')
      ? parsed.pathname.slice(prefix.length) : '';
  }
  function matches(url) {
    const path = pathOf(url);
    return sharedPaths.has(path) || /^\/[a-z0-9]+\/(state|stream)$/i.test(path);
  }
  function waitVisible() {
    if (!document.hidden) return Promise.resolve();
    if (!visible) visible = new Promise(resolve => {
      const listener = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', listener);
        visible = null;
        resolve();
      };
      document.addEventListener('visibilitychange', listener);
    });
    return visible;
  }
  async function read() {
    await waitVisible();
    if (cached && Date.now() < expiresAt) return cached;
    if (pending) return pending;
    const startedRevision = revision;
    const work = (async () => {
      let result;
      try {
        const response = await nativeFetch(prefix + '/poll', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        result = { status: response.status, body: await response.json() };
      } catch {
        result = { status: 503, body: { error: '托管状态暂时无法读取，请稍后重试' } };
      }
      if (startedRevision === revision) {
        cached = result;
        expiresAt = Date.now() + (result.status !== 200 ? 5000 : result.body.active ? 5000 : 30000);
      }
      return result;
    })();
    pending = work;
    try { return await work; }
    finally { if (pending === work) pending = null; }
  }
  return {
    matches,
    invalidate() { revision++; cached = null; expiresAt = 0; pending = null; },
    async fetch(url) {
      const result = await read();
      const path = pathOf(url);
      let body = result.body;
      let status = result.status;
      if (status >= 200 && status < 300) {
        const state = path.match(/^\/([a-z0-9]+)\/(state|stream)$/i);
        if (state) {
          body = result.body.overview?.[state[1]];
          if (!body) { status = 404; body = { error: '未知交易所账户' }; }
        } else if (path.startsWith('/overview')) body = result.body.overview;
        else if (path === '/hedge') body = result.body.hedge;
        else if (path === '/proxy-config') body = result.body.proxyConfig;
        else if (path === '/proxy-check') body = { ok: result.body.status !== 'ERROR', globalHealthy: result.body.status !== 'ERROR', globalError: result.body.error, hosted: true, source: 'server-direct' };
        else if (path === '/ai/status') body = { configured: false, hosted: true, running: false, message: '交易网格与对冲已托管；AI 辅助分析可在本地模式使用。' };
      }
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
    },
  };
};
