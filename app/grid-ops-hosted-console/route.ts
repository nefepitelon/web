import fs from "node:fs/promises";
import path from "node:path";
import { alphaExecutionErrorResponse, requireAlphaOperator } from "@/lib/alpha-execution/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hostedBridge = String.raw`
<script>
(() => {
  const PREFIX = '/api/grid-ops-hosted';
  const nativeFetch = window.fetch.bind(window);
  const rewrite = (value) => {
    const raw = typeof value === 'string' ? value : value instanceof URL ? value.toString() : value && value.url;
    if (!raw) return raw;
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/') && !parsed.pathname.startsWith(PREFIX + '/')) {
      return PREFIX + parsed.pathname.slice(4) + parsed.search + parsed.hash;
    }
    return raw;
  };
  window.fetch = async (input, init = {}) => {
    let nextInit = init;
    const url = rewrite(input);
    if (String(url).startsWith(PREFIX + '/env-config') && String(init.method || 'GET').toUpperCase() === 'POST' && init.body) {
      try {
        const body = JSON.parse(String(init.body));
        const hasLive = Object.entries(body.values || {}).some(([key, value]) => /_MODE$/.test(key) && String(value).toLowerCase() === 'live');
        if (hasLive) {
          const accepted = window.confirm('即将把交易凭据加密保存到线上服务器并启用实盘。请确认：API 密钥已禁用提现权限，且你理解浏览器关闭后策略仍会继续运行。');
          if (!accepted) throw new Error('已取消线上实盘配置');
          body.hostedLiveAcknowledged = true;
          nextInit = { ...init, body: JSON.stringify(body) };
        }
      } catch (error) {
        if (error && error.message === '已取消线上实盘配置') throw error;
      }
    }
    if (input instanceof Request) return nativeFetch(new Request(url, input), nextInit);
    return nativeFetch(url, nextInit);
  };

  class HostedPollingEventSource {
    constructor(url) {
      this.url = String(url);
      this.readyState = 0;
      this.onmessage = null;
      this.onerror = null;
      this.closed = false;
      this.poll();
      this.timer = window.setInterval(() => this.poll(), 1200);
    }
    async poll() {
      if (this.closed || this.busy || document.hidden) return;
      this.busy = true;
      try {
        const endpoint = this.url.endsWith('/stream') ? this.url.slice(0, -7) : this.url;
        const response = await window.fetch(endpoint, { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.text();
        this.readyState = 1;
        if (typeof this.onmessage === 'function') this.onmessage(new MessageEvent('message', { data }));
      } catch (error) {
        this.readyState = 0;
        if (typeof this.onerror === 'function') this.onerror(error);
      } finally { this.busy = false; }
    }
    close() { this.closed = true; this.readyState = 2; window.clearInterval(this.timer); }
    addEventListener(type, listener) { if (type === 'message') this.onmessage = listener; if (type === 'error') this.onerror = listener; }
    removeEventListener(type, listener) { if (type === 'message' && this.onmessage === listener) this.onmessage = null; if (type === 'error' && this.onerror === listener) this.onerror = null; }
  }
  HostedPollingEventSource.CONNECTING = 0;
  HostedPollingEventSource.OPEN = 1;
  HostedPollingEventSource.CLOSED = 2;
  window.EventSource = HostedPollingEventSource;
  document.documentElement.dataset.runMode = 'hosted';
})();
</script>`;

export async function GET() {
  try {
    await requireAlphaOperator();
    const file = path.join(process.cwd(), "grid-ops", "public", "index.html");
    let html = await fs.readFile(file, "utf8");
    html = html
      .replace("</head>", `${hostedBridge}</head>`)
      .replaceAll("本机 .env", "线上加密配置")
      .replaceAll("本地 .env", "线上加密配置")
      .replaceAll("本地引擎", "线上托管引擎")
      .replaceAll("本机控制台", "线上托管控制台")
      .replaceAll("从本地交易所清单", "从线上托管交易所清单")
      .replaceAll("本机直连", "服务器直连");
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (caught) {
    return alphaExecutionErrorResponse(caught);
  }
}
