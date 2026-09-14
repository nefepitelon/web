# Genuine Jesse 3.1.1 dashboard

The public UI in `public/quant-native/jesse` is the **actual compiled Nuxt dashboard**
published with upstream Jesse 3.1.1, commit `44a0ed432fd74133edaf273f3b56100042f564b3`.
It is not a recreation, screenshot or a relabelled older Jesse frontend.

- Source: https://github.com/jesse-ai/jesse/tree/44a0ed432fd74133edaf273f3b56100042f564b3/jesse/static
- Upstream root license: MIT; preserved in `LICENSE` and the public assets.
- `upstream-ui.tar.gz` preserves the unmodified original assets and license.
- `UPSTREAM.json` records the original archive digest and every asset digest.
- `PATCHES.json` records exactly which distributed files changed and why.
- The two `monaco-metadata.*` copies reproduce original files inside the upstream
  static `node_modules` path, which Vercel omits from source uploads. The build
  restores them only after checking their original hashes from `UPSTREAM.json`.

The older public `jesse-ai/dashboard` Vue CLI source repository was archived and last
pushed on March 16, 2024. It is not the source project for the Nuxt build in 3.1.1.
The current Nuxt source project was not found in the official public repositories;
the compiled assets themselves are distributed in the current MIT core release.

## Reproduce the import

Download the archive URL in `UPSTREAM.json`, then run:

```sh
python third-party/quant-ui/jesse/vendor.py /path/to/source.tar.gz
python third-party/quant-ui/jesse/patch.py
```

The first step refuses an archive whose SHA-256 differs from the audited source.
The second refuses modified input and applies five narrow hosting patches: three HTML
entry documents, the socket startup module, and isolated auth-store naming. It retains
the original screens, routes, styles, forms, research features and upstream branding.
`welink-bootstrap.mjs` configures the local API base and an authenticated host handshake.

## Runtime contract and limits

This static UI needs a **real tenant-isolated Jesse 3.1.1 Python/FastAPI service**,
its PostgreSQL/Redis state, market data and strategies. Vercel serves browser assets;
it does not run the trading engine. Unconfigured services return actual errors.

The UI uses `/api/quant-suite/native/jesse` as its same-origin API base. Its bootstrap
reads metadata at that URL. Only `{ok:true, configured:true, sessionAuthorized:true}`
permits a non-secret 64-character local session marker. The BFF must verify the site's
HttpOnly user session on **every request**, resolve that user's isolated native service,
and supply the real upstream credential server-side. The marker is not authorization.
No native password, password digest, exchange key or license token is embedded here.
Without this handshake the original login screen remains visible.

Upstream authenticates `/auth/login` with `{password}` and returns
`{auth_token: SHA256(PASSWORD)}`. Other API calls use that digest directly in the
`Authorization` header, without `Bearer`. The native `/ws?token=...` endpoint expects
the same digest. A local marker cannot authenticate directly to that WebSocket.

The original production client hardcodes the site's `/ws` endpoint and its Pyright
client uses a localhost socket. Both startup points are explicitly disabled in this
embedded build. There are no fabricated socket messages. The host must show that live
streaming and language-service connections are unavailable. An operator-supplied WSS
URL alone is insufficient: a separate gateway must authenticate a short-lived tenant
ticket and inject native credentials, or users must use their independent native UI
with original authentication. No such WSS gateway is included in these static assets.

The native dashboard exposes powerful features, including strategy editing, key
management, exports and process shutdown. It is not inherently multi-tenant. Proxy
allowlists must distinguish reads, configuration writes, research jobs and live
actions. In particular `/config/get` performs initialization/database timestamp writes;
`/download/download-api-keys` exports real secrets and must not be treated as a normal
report download. `/auth/jesse-trade-token` returns a commercial account bearer token.

Paper and live trading need Jesse's separately licensed live plugin. The ordinary
commercial license is single-user and prohibits redistribution of installation files
and competing cloud trading services. Shipping these MIT UI files supplies **no live
plugin license** and does not enable or certify live trading.

- https://docs.jesse.trade/docs/livetrade
- https://jesse.trade/terms-of-service
