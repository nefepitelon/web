# Hummingbot native API deployment

This adapter uses Hummingbot API **v1.0.1** and Hummingbot client
`hummingbot/hummingbot:version-2.16.0`. The two versions are distinct.
Install the official API stack with its PostgreSQL and EMQX services on the private
runtime network, then provision one bot per tenant with name
`wq-<first 16 characters of tenant hash>-hummingbot-bot`.

Use the official `/bot-orchestration/deploy-v2-controllers` or
`/bot-orchestration/deploy-v2-script` route during administrator provisioning.
Copy the reviewed controller configuration and strategy source into that bot's
native directory. `deployment.json.api` follows `api.example.json`. Credentials
are stored only in `project/api-auth.json` (`username`, `password`).
The official deploy routes append `-YYYYMMDD-HHMMSS` to the instance name; save
the exact returned `unique_instance_name` as `deployment.api.botName`. The gateway
allows only the tenant's own name/prefix and will reject another tenant's bot name.

Gateway start/stop invoke real `/bot-orchestration/start-bot` and
`/bot-orchestration/stop-bot`; stop sets `skip_order_cancellation: false`.
Backtest creates a real `/backtesting/tasks` job and polls its native ID.
The gateway never forwards raw native configuration, logs, or credentials.

The administrator must verify the selected connector's paper implementation,
inventory limits, order sizing and stop policy against the application's exact
config hash. Controller backtesting support varies. Never mark a controller as
verified solely because the API health endpoint responds.

Official API reference: https://hummingbot.org/hummingbot-api/routers/
