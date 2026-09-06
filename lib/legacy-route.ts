import { readFile } from "node:fs/promises";
import path from "node:path";

const rootFiles = new Set([
  "index.html",
  "alphaops.html",
  "alpha-radar.html",
  "bstock-alpha.html",
  "dashboard.html",
  "ai-ops.html",
  "styles.css",
  "dashboard.css",
  "alpha-scanner.css",
  "bstock-alpha.css",
  "bstock-alpha-ui.css",
  "bstock-equity-panel.css",
  "ai-ops.css",
  "platform-actions.css",
  "surf-assistant.css",
  "script.js",
  "home-market.js",
  "home-product-demo.js",
  "product-dashboard.js",
  "dashboard.js",
  "dashboard-product-carousel.js",
  "alpha-scanner.js",
  "bstock-alpha-storage.js",
  "bstock-alpha.js",
  "bstock-equity-panel.js",
  "ai-ops.js",
  "ai-ops-platforms.js",
  "platform-text.js",
  "surf-assistant.js",
  "ui-translations.js"
]);

const cleanPageAliases = new Map([
  ["index", "index.html"],
  ["alphaops", "alphaops.html"],
  ["alpha-radar", "alpha-radar.html"],
  ["bstock-alpha", "bstock-alpha.html"],
  ["dashboard", "dashboard.html"],
  ["ai-ops", "ai-ops.html"]
]);

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".ico": "image/x-icon"
};

async function inlineLocalStyles(html: string, absoluteRoot: string, excludedSources = new Set<string>()) {
  const matches = Array.from(
    html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*\/?\s*>/gi)
  );

  const replacements = await Promise.all(matches.map(async (match) => {
    const href = match[1];
    if (/^(?:https?:)?\/\//i.test(href) || href.startsWith("/")) return null;
    const source = href.split(/[?#]/, 1)[0];
    if (!rootFiles.has(source) || path.extname(source).toLowerCase() !== ".css") return null;
    if (excludedSources.has(source)) return { link: match[0], style: "" };
    const css = await readFile(path.resolve(absoluteRoot, source), "utf8");
    return { link: match[0], style: `<style data-legacy-source="${source}">\n${css}\n</style>` };
  }));

  return replacements.reduce(
    (result, replacement) => replacement ? result.replace(replacement.link, replacement.style) : result,
    html
  );
}

function rewriteLocalScriptUrls(html: string, excludedSources = new Set<string>()) {
  return html.replace(
    /(<script\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (tag, prefix: string, src: string, suffix: string) => {
      if (/^(?:https?:)?\/\//i.test(src) || src.startsWith("/")) return tag;
      const [source] = src.split(/[?#]/, 1);
      if (!rootFiles.has(source) || path.extname(source).toLowerCase() !== ".js") return tag;
      if (excludedSources.has(source)) return "";
      return `${prefix}/legacy/${src}${suffix}`;
    }
  );
}

const embedStyle = String.raw`
<style id="welinkbtc-embed-style">
  html.welinkbtc-embedded {
    --platform-header-height: 0px !important;
    min-height: 100%;
    scroll-padding-top: 62px;
  }
  html.welinkbtc-embedded .site-header,
  html.welinkbtc-embedded .platform-header,
  html.welinkbtc-embedded .mobile-menu,
  html.welinkbtc-embedded #surf-assistant { display: none !important; }
  html.welinkbtc-embedded body {
    min-height: 100%;
    padding-top: 0 !important;
    overflow-x: hidden;
  }
  html.welinkbtc-embedded .dashboard-subnav { top: 0 !important; }
  html.welinkbtc-embedded .cycle-radar { top: 62px !important; }
  html.welinkbtc-embedded :is(
    .alpha-content-dialog,
    .alpha-content-form,
    .detail-drawer,
    .onchain-support-drawer,
    .material-drawer
  ) { max-height: 100dvh !important; }
</style>`;

const embedBridge = String.raw`
<script>
(() => {
  if (window.top === window || !new URLSearchParams(location.search).has('embedded')) return;
  document.documentElement.classList.add('welinkbtc-embedded');
  const routes = {
    'index.html': '/',
    'alphaops.html': '/alphaops',
    'alpha-radar.html': '/alpha-radar',
    'bstock-alpha.html': '/bstock-alpha',
    'dashboard.html': '/dashboard',
    'ai-ops.html': '/ai-ops'
  };
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const url = new URL(anchor.href, location.href);
    const file = url.pathname.split('/').pop();
    if (!routes[file]) return;
    event.preventDefault();
    window.top.location.href = routes[file] + url.hash;
  });
  const readPreference = (key, fallback) => {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  };
  const writePreference = (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  };
  const applyPreferences = ({ theme, language } = {}) => {
    if (theme === 'light' || theme === 'dark') {
      writePreference('welinkbtc-theme', theme);
      document.documentElement.dataset.theme = theme;
      if (document.body.dataset.theme !== theme) {
        const themeButton = document.querySelector('.theme-toggle, .mobile-theme-toggle, #platform-theme');
        if (themeButton) themeButton.click();
        else document.body.dataset.theme = theme;
      }
    }
    if (language === 'zh' || language === 'en') {
      writePreference('welinkbtc-language', language);
      document.documentElement.dataset.language = language;
      const currentLanguage = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh';
      if (currentLanguage !== language) {
        document.querySelector('.lang-toggle, .mobile-lang-toggle, #platform-language')?.click();
      }
    }
  };
  applyPreferences({
    theme: readPreference('welinkbtc-theme', 'dark') === 'light' ? 'light' : 'dark',
    language: readPreference('welinkbtc-language', 'zh') === 'en' ? 'en' : 'zh'
  });
  addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'welinkbtc:preferences') applyPreferences(event.data);
    if (event.data?.type === 'welinkbtc:navigate' && /^#[A-Za-z][\w-]*$/.test(event.data.hash || '')) {
      document.querySelector(event.data.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
})();
</script>`;

function markEmbeddedDocument(html: string) {
  return html.replace(/<html\b([^>]*)>/i, (tag: string, attributes: string) => {
    const classAttribute = attributes.match(/\bclass=(["'])([^"']*)\1/i);
    if (classAttribute) {
      const [, quote, classes] = classAttribute;
      return tag.replace(classAttribute[0], `class=${quote}${classes} welinkbtc-embedded${quote}`);
    }
    return `<html${attributes} class="welinkbtc-embedded">`;
  });
}

function isAllowed(parts: string[]) {
  if (!parts.length) return true;
  if (parts.some((part) => part === ".." || part.includes("\\") || part.includes("\0"))) return false;
  if (parts.length === 1) return rootFiles.has(parts[0]);
  if (!["assets", "data"].includes(parts[0])) return false;
  return Boolean(contentTypes[path.extname(parts.at(-1) ?? "").toLowerCase()]);
}

function normalizeCleanPagePath(parts: string[]) {
  if (parts.length !== 1) return parts;
  const page = cleanPageAliases.get(parts[0]);
  return page ? [page] : parts;
}

export async function serveLegacy(request: Request, requestedPath?: string[]) {
  const parts = normalizeCleanPagePath(requestedPath?.length ? requestedPath : ["index.html"]);
  if (!isAllowed(parts)) return new Response("Not found", { status: 404 });

  const absoluteRoot = process.cwd();
  // The allowlist above constrains access; deployment tracing is handled by outputFileTracingIncludes.
  const absolutePath = path.resolve(/* turbopackIgnore: true */ absoluteRoot, ...parts);
  if (!absolutePath.startsWith(absoluteRoot + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const extension = path.extname(absolutePath).toLowerCase();
    const body = await readFile(absolutePath);
    let content: BodyInit = body;
    if (extension === ".html") {
      const embedded = new URL(request.url).searchParams.has("embedded");
      const excludedSources = embedded ? new Set(["surf-assistant.css", "surf-assistant.js"]) : new Set<string>();
      let html = rewriteLocalScriptUrls(
        await inlineLocalStyles(body.toString("utf8"), absoluteRoot, excludedSources),
        excludedSources
      );
      if (embedded) html = markEmbeddedDocument(html);
      content = html
        .replace("</head>", `${embedStyle}</head>`)
        .replace("</body>", `${embedBridge}</body>`);
    }
    return new Response(content, {
      headers: {
        "Content-Type": contentTypes[extension] ?? "application/octet-stream",
        "Cache-Control": [".html", ".js"].includes(extension)
          ? "no-store, max-age=0"
          : extension === ".css"
            ? "public, max-age=0, must-revalidate"
            : "public, max-age=3600"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
