# Windows local engine installer

This package starts the chosen engine on the user's own Docker Desktop Linux engine. It does not install Docker, start a cloud VM, set live-verification flags, or place an exchange order. Windows requires Docker Desktop with WSL 2, Linux containers, and the Compose plugin. Docker Desktop licensing requirements remain the user's responsibility.

Run from the extracted `quant-runtime` package, or use the supplied local manager:

```powershell
node bin/install-engine.mjs --user-id ACCOUNT_ID --engine freqtrade --root C:\Users\YOUR_USER\AppData\Local\WelinkQuant --config saved-paper-config.json
node bin/install-engine.mjs --user-id ACCOUNT_ID --engine freqtrade --root C:\Users\YOUR_USER\AppData\Local\WelinkQuant --stop true
node bin/install-engine.mjs --user-id ACCOUNT_ID --engine freqtrade --root C:\Users\YOUR_USER\AppData\Local\WelinkQuant --resume true --config saved-paper-config.json
```

`--config` binds installation to the exact saved execution configuration. Omission creates an explicit PAPER preset. A supplied LIVE configuration is rejected; it is never silently converted. `--port` selects another local UI port when the default is occupied. Hummingbot uses the next port for its API. Run a second account with different ports.

The six Compose JSON files are standard Docker Compose documents. The helper resolves public image/port placeholders, writes account-local `compose.json`, and stores secret substitutions in `native/.compose.env`. Only the selected stack is pulled or built. Official image digests are locked in `manifest.mjs` and the Compose files; platform-specific image resolution is performed by Docker. Dependency snapshots are PostgreSQL 16 Alpine, Redis 7.4 Alpine, and EMQX 5 as published on 2026-09-07.

| Engine | What actually starts | Default local URL | Initial limits |
| --- | --- | --- | --- |
| Freqtrade 2026.8 | Official image, original FreqUI and `freqtrade webserver` | `http://127.0.0.1:8791` | Research server, `dry_run=true`, initial state stopped; no trade process. Only spot pairs with one quote currency in the initial template. |
| NautilusTrader 1.231.0 | Built Python wheel SDK runner; version command only | None | The open-source SDK has no original full trading web UI. Native strategy/config/data validation remains required. |
| Hummingbot 2.16.0 / API 1.0.1 | Original Streamlit Dashboard, API, PostgreSQL and authenticated EMQX | Dashboard `http://127.0.0.1:8793`; API `http://127.0.0.1:8794` | Dashboard digest is the official 2025-08-20 image, now deprecated upstream. UI/API startup does not prove current Dashboard/API operation compatibility. No bot is created. |
| QuantConnect LEAN build 18057 | Official SDK image; `dotnet --info` only | None | Original LEAN engine and report generation; QuantConnect's cloud IDE is not included. Data, brokerage and native configuration must be supplied. |
| Jesse 3.1.1 | Official `salehmir/jesse` server/UI, PostgreSQL and Redis; separate recipe research image built | `http://127.0.0.1:8795` | Runs `jesse run --skip-agent-rules`. Does not run `install-live`, purchase a license, or accept commercial plugin terms. |
| OctoBot 2.1.1 | Official OctoBot server with its original web interface | `http://127.0.0.1:8796` | `--simulate --no-telegram`; no exchange keys installed, original first-run onboarding/terms remain. Simulation can run according to the native profile; no real-money mode is enabled. |

## Local files and credentials

Accounts are separated under `ROOT/tenants/SHA256(userId)[0:32]/ENGINE`. The installer creates a disabled `deployment.json` matching the gateway schema, `requested-config.json`, `local-install.json`, native project files and credentials. POSIX modes are private; on Windows, use the protected per-user state directory supplied by the local manager so the directory inherits that account's ACL. Never put this directory inside a public web root or a shared cloud folder.

`native/credentials.json` contains `{username,password,jwtSecret,wsToken,databasePassword,redisPassword,configPassword,brokerPassword,brokerAdminPassword,note}`. The original FreqUI uses username/password; Jesse uses password; Hummingbot API uses username/password, while the loopback-only Dashboard has no extra login. OctoBot uses its original onboarding rather than this generated password. SDK-only engines have no login. The local manager must expose only the applicable login fields behind its authenticated local credential-view action. It must never upload these secrets, include them in pairing payloads, or expose the database/JWT/MQTT fields.

`local-install.json.status` is `installing`, `ui-ready`, `installed`, `stopped` or `failed`. `ui-ready` means an original local health endpoint responded. `installed` can mean an SDK installation or a UI still starting; read `message`. These statuses never set `enabled`, `verifiedActions`, `paperVerified` or `liveVerified`. The separate verifier owns evidence-based research approval.

The helper exports `installEngine`, `readLocalInstall`, `stopLocalEngine`, `resumeLocalEngine`. Results contain `ok, engine, status, uiUrl, apiUrl, credentialsFile, profilePath, configHash, enabled:false, verifiedActions:[], message`; flags describe what the installer approved, not later verifier state. `--stop true` persists a local halt, acquires the mutation fence, verifies exact managed/tenant/engine labels and the safe name of each observed running gateway container, stops it by immutable ID, confirms it exited, then stops the known Compose stack. It does not delete volumes or claim to close positions. A concurrent mutation blocks stop completion while the halt remains. Hummingbot bots independently created by its original interface do not carry these management labels and need separate checking/stopping in that original interface or Docker Desktop. `--resume true` preserves native configuration, credentials, research approval flags and the local halt fence. It only resumes existing PAPER-bound UI services or returns a no-op SDK status; changed native Freqtrade/OctoBot live modes are rejected. The manager separately verifies and explicitly clears its halt fence.

Reinstallation with the same configuration preserves credentials and data. Unknown profiles, changed execution hashes, active runtime containers, pending task records and reconciliation/mutation locks block overwrite. A failure after provisioning can be retried. An interruption in the middle of first-time configuration requires local inspection, rather than resetting credentials against an existing database.

## Runtime prerequisites beyond opening a UI

The installer creates/checks the named `welink-quant` Docker bridge used by isolated gateway jobs (`QUANT_DOCKER_NETWORK` can select another named bridge). It does not connect native engine credentials to a cloud worker. Freqtrade/Jesse/Nautilus/LEAN/OctoBot runners mount the shipped `recipes/ENGINE` directory at `/integration`; therefore the corresponding upstream image can be used with the gateway's explicit Python/.NET entry point. Nautilus and Jesse's dedicated recipe images are also built for the requested engine.

Hummingbot API requires Docker socket access to manage bots. This is provided only inside the explicitly selected local stack. The current API creates bot containers with `network_mode=host` and builds host bind paths from `BOTS_PATH`; the installer leaves bot execution unverified. Docker Desktop host networking (supported in newer Desktop releases, and separately enabled), valid host-visible `BOTS_PATH`, MQTT port routing and connector config must be completed before bot execution can be approved. The initial private API/Dashboard/EMQX stack does not require host networking. No broker port is exposed publicly.

Initial native files are deliberately incomplete for non-Freqtrade execution: Nautilus examples need matching approved strategy/risk configuration and market data; LEAN needs data and brokerage mode configuration; Jesse's research wrapper needs candles; OctoBot's original UI manages its tentacles in a Docker volume, while gateway jobs need an approved corresponding `project/tentacles`. The independent verification helper should report these concrete gaps. Installed SDKs and available original UIs are not evidence that these requirements have been met.

## Authoritative sources

- [Freqtrade Docker and API setup](https://www.freqtrade.io/en/stable/docker_quickstart/) and [REST API](https://www.freqtrade.io/en/stable/rest-api/)
- [NautilusTrader pinned source](https://github.com/nautechsystems/nautilus_trader/tree/v1.231.0)
- [Hummingbot official API Compose](https://github.com/hummingbot/hummingbot-api/blob/8b2ba4292cb3507dfad3d56572498c100741f55e/docker-compose.yml), [official Dashboard](https://hummingbot.org/dashboard/), [bot Docker service](https://github.com/hummingbot/hummingbot-api/blob/8b2ba4292cb3507dfad3d56572498c100741f55e/services/docker_service.py)
- [LEAN source](https://github.com/QuantConnect/Lean/tree/23b735d99a357807dc0df9f4c51d30f05fe0d277)
- [Jesse official project Compose](https://github.com/jesse-ai/project-template/blob/master/docker/docker-compose.yml), [pinned CLI](https://github.com/jesse-ai/jesse/blob/v3.1.1/jesse/cli.py), [live trading documentation](https://docs.jesse.trade/docs/live-trading/)
- [OctoBot pinned CLI](https://github.com/Drakkar-Software/OctoBot/blob/2.1.1/octobot/cli.py), [Docker image](https://hub.docker.com/r/drakkarsoftware/octobot)

The vendored Hummingbot ACL retains its Apache-2.0 license. The OctoBot default configuration retains its GPL-3.0 license. Official dependency/container licenses apply independently. Docker Desktop and full native-stack testing must take place on a user's consenting Windows host; this development host has no Docker daemon, so current automated tests cover installer orchestration, credentials, fences, argument safety and exact runner invocation without launching real engines.
