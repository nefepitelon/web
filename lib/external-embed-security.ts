// Remote documents must remain untrusted even when someone opens a proxy URL
// directly: an iframe attribute only protects the embedded browsing context.
// In particular, never grant allow-same-origin to a proxied remote document.
export const EXTERNAL_EMBED_CSP = [
  "sandbox allow-scripts allow-forms allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox",
  "frame-ancestors 'self'",
  "base-uri 'self'"
].join("; ");
