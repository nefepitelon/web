import type { HedgeEngine } from "./protocol";

// The original console remains editable in hedge-ops/engines. This small host
// adapter scopes its API and assets to the platform, without a remote iframe.
export function integrateHedgeConsole(source: string, engine: HedgeEngine) {
  const base = `/hedge-ops/console/${engine}`;
  const bridge = `<script>
(() => {
  const originalFetch = window.fetch.bind(window);
  const prefix = '/api/hedge-ops/${engine}';
  const pendingReads = new Set();
  let parentActive = true;
  const inactiveError = () => { const e = new Error('控制台已隐藏，暂停页面读取'); e.name = 'AbortError'; e.hedgeConsoleInactive = true; return e; };
  window.hedgeConsoleIsActive = () => { if (document.hidden || !parentActive) return false; try { return !window.frameElement?.hidden; } catch { return parentActive; } };
  let wasActive = window.hedgeConsoleIsActive();
  const syncVisibility = () => {
    const active = window.hedgeConsoleIsActive();
    if (!active) { for (const controller of pendingReads) controller.abort(inactiveError()); }
    else if (!wasActive) window.dispatchEvent(new Event('hedge-console-active'));
    wasActive = active;
  };
  document.addEventListener('visibilitychange', syncVisibility);
  try { if (window.frameElement && typeof MutationObserver !== 'undefined') new MutationObserver(syncVisibility).observe(window.frameElement, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] }); } catch {}
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.type !== 'hedge-console-visibility' || event.data.engine !== '${engine}' || typeof event.data.active !== 'boolean') return;
    parentActive = event.data.active; syncVisibility();
  });
  const showError = (message, endpoint = '', method = 'POST') => {
    let box = document.getElementById('welink-hedge-error');
    if (box?.dataset.method !== 'GET' && method === 'GET' && box) return;
    if (!box) { box = document.createElement('div'); box.id = 'welink-hedge-error'; box.setAttribute('role', 'alert'); document.body.appendChild(box); }
    box.textContent = message;
    box.dataset.endpoint = endpoint;
    box.dataset.method = method;
    const dismiss = document.createElement('button');
    dismiss.type = 'button'; dismiss.textContent = '关闭'; dismiss.setAttribute('aria-label', '关闭错误提示');
    dismiss.style.cssText = 'margin-left:12px;padding:3px 8px;color:inherit;background:transparent;border:1px solid #9c7043;border-radius:4px;cursor:pointer';
    dismiss.addEventListener('click', () => box.remove()); box.appendChild(dismiss);
    box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:1000;max-width:min(520px,calc(100vw - 36px));padding:13px 18px;border:1px solid #9c7043;border-radius:10px;background:#201a13;color:#ffcf91;font:13px/1.6 system-ui;box-shadow:0 8px 32px #0008';
  };
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, init);
    const target = prefix + url.pathname.slice(4) + url.search;
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const read = method === 'GET' || method === 'HEAD';
    if (read && !window.hedgeConsoleIsActive()) throw inactiveError();
    const controller = read ? new AbortController() : null;
    if (controller) pendingReads.add(controller);
    const originalSignal = init?.signal || (input instanceof Request ? input.signal : undefined);
    const signal = controller ? (originalSignal ? AbortSignal.any([originalSignal, controller.signal]) : controller.signal) : originalSignal;
    let response;
    try { response = await originalFetch(input instanceof Request ? new Request(target, input) : target, { ...init, signal }); }
    catch (e) { if (controller?.signal.aborted) throw controller.signal.reason; throw e; }
    finally { if (controller) pendingReads.delete(controller); }
    if (!response.ok) {
      const data = await response.clone().json().catch(() => ({}));
      const message = data.detail || data.message || data.error || ('请求失败：' + response.status);
      showError(message, url.pathname, method);
      throw new Error(message);
    }
    const box = document.getElementById('welink-hedge-error');
    if (box?.dataset.endpoint === url.pathname && box.dataset.method === method) box.remove();
    return response;
  };
  window.addEventListener('unhandledrejection', (event) => { if (!event.reason?.hedgeConsoleInactive) showError(event.reason?.message || '操作失败，请刷新状态后重试'); event.preventDefault(); });
})();
</script>`;
  return source
    .replaceAll('href="/static/', `href="${base}/static/`)
    .replaceAll('src="/static/', `src="${base}/static/`)
    .replace('class="brand" href="/"', 'class="brand" href="/hedge-ops" target="_top"')
    .replace('<b>PARALLAX</b>', '<b>套利对冲Ops</b>')
    .replace('<title>PARALLAX', '<title>套利对冲Ops')
    .replace('</head>', `${bridge}</head>`);
}
