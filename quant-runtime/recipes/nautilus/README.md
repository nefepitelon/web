# NautilusTrader runtime

This recipe runs the actual `nautilus_trader==1.231.0` package in Python 3.12.
It uses `BacktestNode` for catalog replay and `TradingNode` for persistent execution.
The bundled connector registration currently supports Binance Spot / USDT Futures / Coin Futures.
Paper execution always uses `SandboxLiveExecClientFactory` with real Binance market data;
it cannot select a Binance live execution client.

Build from this directory:

```sh
docker build -t welink/nautilus:1.231.0 .
```

The gateway mounts approved project files at `/project` read-only, the immutable command at
`/request/request.json`, and writable per-run output at `/state`. The image defaults to UID 10001;
the gateway overrides it with its own host UID/GID so the engine can read the private request
and write its state directory. For a manual launch, supply the same `--user UID:GID` as the
owner of those directories. No port is exposed.

Place `backtest.json`, `paper.json`, or `live.json` in the approved project directory.
Each file uses a `schemaVersion: 1`, `requestConfig`, and native `node` wrapper.
The eight execution fields in `requestConfig` must exactly match the submitted command,
including mode, exchange, symbols, timeframe, strategy, stake amount, max positions and stop loss.
Backtest start/end dates come from the command and are applied to the native catalog query.

`backtest.example.json` requires a real Nautilus Parquet catalog containing the instrument
and bars at `/project/catalog`; an empty catalog fails instead of returning fabricated results.
It writes upstream event, order, position, return and PnL statistics to `/state/result.json`.

`paper.example.json` is an upstream EMA **research demonstration**, with fixed trade quantity.
Its `requestConfig` values are an operator approval binding, not an implementation of monetary
stake sizing or a stop loss in that example strategy. For actual use, install and validate a
native strategy that implements the requested sizing and risk parameters, and keep its native
settings consistent with the approved request. The driver does not rewrite arbitrary Python
strategy logic or claim to enforce that logic. The example is deliberately rejected for live use.

For live execution, install a reviewed strategy module under `/project`, reference its
`strategy_path` and `config_path`, set `liveReviewed: true`, and use the same native wrapper
with `mode: "live"`. Replace the sandbox client with
`nautilus_trader.adapters.binance.config:BinanceExecClientConfig`, explicitly select
`environment: "LIVE"`, keep `exec_engine.reconciliation: true`, and leave native risk checks
enabled. Supply `BINANCE_API_KEY` and `BINANCE_API_SECRET` through the runtime's secret
environment. The driver rejects credentials embedded in native client configuration and
does not include raw native exceptions in user-visible results.

Each process owns one node. Nautilus handles SIGTERM/SIGINT and calls strategy stop hooks;
Docker stop must provide enough time for reconciliation and strategy order cancellation.
Stopping the process does not promise that exchange positions have been closed: the installed
strategy defines that behavior, and the account must be reconciled afterwards.

The source/API compatibility reference is the pinned release, because current `latest`
documentation already includes incompatible v2 class names:

- [v1.231.0 source](https://github.com/nautechsystems/nautilus_trader/tree/v1.231.0)
- [v1 sandbox example](https://github.com/nautechsystems/nautilus_trader/blob/v1.231.0/examples/sandbox/binance_spot_futures_sandbox.py)
- [v1 native configuration example](https://github.com/nautechsystems/nautilus_trader/blob/v1.231.0/examples/backtest/model_configs_example.py)
- [LGPL-3.0 license](https://github.com/nautechsystems/nautilus_trader/blob/v1.231.0/LICENSE)

The Python adapter here is original integration code; the upstream engine remains an isolated
dependency with its own license. Keep the upstream license when distributing its image.
