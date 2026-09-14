"""Pinned NautilusTrader worker; never evaluates strategy code supplied by an HTTP request.

Native configuration and strategy modules are installed by the runtime operator in
the read-only /project mount. The request can only select an approved configuration.
"""

from __future__ import annotations

import dataclasses
import asyncio
import datetime as dt
import importlib.metadata
import json
import math
import os
from pathlib import Path
import sys
from typing import Any


VERSION = "1.231.0"
BINDING_FIELDS = (
    "mode", "exchange", "symbols", "timeframe", "strategy", "stakeAmount",
    "maxOpenTrades", "stopLossPct",
)
DATA_PATH = "nautilus_trader.adapters.binance.config:BinanceDataClientConfig"
EXEC_PATH = "nautilus_trader.adapters.binance.config:BinanceExecClientConfig"
SANDBOX_PATH = "nautilus_trader.adapters.sandbox.config:SandboxExecutionClientConfig"


class ConfigurationError(ValueError):
    """An operator-facing error which is safe to show without native config values."""


def read_json(path: Path) -> dict[str, Any]:
    if path.stat().st_size > 2_000_000:
        raise ConfigurationError("Configuration exceeds the 2 MB limit.")
    value = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(value, dict):
        raise ConfigurationError("Configuration must be a JSON object.")
    return value


def same_json_value(left: Any, right: Any) -> bool:
    # Avoid accepting True in place of 1, as Python equality otherwise would.
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return math.isfinite(left) and math.isfinite(right) and left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, list):
        return len(left) == len(right) and all(same_json_value(a, b) for a, b in zip(left, right))
    return left == right


def validate_binding(request: dict, wrapper: dict) -> tuple[str, str]:
    action = request.get("action")
    config = request.get("config")
    if action not in {"start", "backtest"} or not isinstance(config, dict):
        raise ConfigurationError("Nautilus supports start and backtest actions only.")
    mode = config.get("mode")
    if mode not in {"paper", "live"}:
        raise ConfigurationError("Execution mode must be paper or live.")
    if wrapper.get("schemaVersion") != 1 or not isinstance(wrapper.get("requestConfig"), dict):
        raise ConfigurationError("Native configuration needs schemaVersion 1 and requestConfig.")
    approved = wrapper["requestConfig"]
    for field in BINDING_FIELDS:
        if field not in config or field not in approved or not same_json_value(config[field], approved[field]):
            raise ConfigurationError(f"Requested {field} differs from the approved native configuration.")
    if config["exchange"] != "binance":
        raise ConfigurationError("This pinned recipe currently registers Binance connectors only.")
    if not isinstance(wrapper.get("node"), dict):
        raise ConfigurationError("A native node configuration is required.")
    if action == "start" and mode == "live" and wrapper.get("liveReviewed") is not True:
        raise ConfigurationError("A reviewed live native strategy and configuration are required.")
    return action, mode


def validate_live_node(native: dict, mode: str) -> None:
    data_clients, exec_clients = native.get("data_clients"), native.get("exec_clients")
    if not isinstance(data_clients, dict) or not data_clients:
        raise ConfigurationError("At least one Binance market data client is required.")
    if not isinstance(exec_clients, dict) or not exec_clients:
        raise ConfigurationError("At least one execution client is required.")
    expected = SANDBOX_PATH if mode == "paper" else EXEC_PATH
    for clients, expected_path in ((data_clients, DATA_PATH), (exec_clients, expected)):
        for client in clients.values():
            if not isinstance(client, dict) or client.get("path") != expected_path or not isinstance(client.get("config"), dict):
                raise ConfigurationError("Native connector type does not match the approved execution mode.")
            values = client["config"]
            if "api_key" in values or "api_secret" in values:
                raise ConfigurationError("Provide exchange credentials through runtime environment variables.")
            if expected_path != SANDBOX_PATH and values.get("environment") != "LIVE":
                raise ConfigurationError("Binance environment must explicitly select LIVE market endpoints.")
    strategies = native.get("strategies")
    if not isinstance(strategies, list) or not strategies:
        raise ConfigurationError("At least one installed native strategy is required.")
    if native.get("risk_engine", {}).get("bypass", False):
        raise ConfigurationError("The native risk engine must remain enabled.")
    if mode == "live":
        if native.get("exec_engine", {}).get("reconciliation") is not True:
            raise ConfigurationError("Live execution requires native exchange reconciliation.")
        if any("nautilus_trader.examples." in str(strategy.get("strategy_path", "")) for strategy in strategies):
            raise ConfigurationError("Upstream demonstration strategies cannot be used as approved live strategies.")


def apply_backtest_dates(native: dict, config: dict) -> dict:
    result = json.loads(json.dumps(native))
    start, end = config.get("startDate"), config.get("endDate")
    if bool(start) != bool(end):
        raise ConfigurationError("Backtest dates must be supplied together.")
    if start:
        try:
            start_date, end_date = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
        except (ValueError, TypeError):
            raise ConfigurationError("Backtest dates must use YYYY-MM-DD.") from None
        if start_date >= end_date:
            raise ConfigurationError("Backtest end must be after its start.")
        result["start"], result["end"] = start, end
        for source in result.get("data", []):
            source["start_time"], source["end_time"] = start, end
    result["raise_exception"] = True
    # v1.231.0 clears order/position caches when it disposes before creating the
    # BacktestResult; capture intact counts first and dispose in our finally block.
    result["dispose_on_completion"] = False
    for source in result.get("data", []):
        catalog = source.get("catalog_path", "")
        if not isinstance(catalog, str) or not catalog.startswith("/project/") or ".." in Path(catalog).parts:
            raise ConfigurationError("Backtest catalogs must be inside the read-only /project mount.")
    if not result.get("data") or not result.get("venues"):
        raise ConfigurationError("Backtests require a populated catalog and venue configuration.")
    return result


def safe_json(value: Any) -> Any:
    if dataclasses.is_dataclass(value):
        value = dataclasses.asdict(value)
    if isinstance(value, dict):
        return {str(key): safe_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe_json(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return str(value)


def write_result(state_dir: Path, payload: dict) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    result = {
        "engine": "nautilus", "engineVersion": VERSION,
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(), **payload,
    }
    temporary = state_dir / "result.json.tmp"
    temporary.write_text(json.dumps(safe_json(result), ensure_ascii=False, allow_nan=False), encoding="utf-8")
    temporary.replace(state_dir / "result.json")


def run_backtest(native: dict, config: dict, state_dir: Path) -> None:
    from nautilus_trader.backtest.config import BacktestRunConfig
    from nautilus_trader.backtest.node import BacktestNode

    run_config = BacktestRunConfig.parse(json.dumps(apply_backtest_dates(native, config)).encode())
    node = BacktestNode(configs=[run_config])
    try:
        results = node.run()
        if not results or any(result.iterations == 0 for result in results):
            raise ConfigurationError("Backtest catalog produced no market events for the selected period.")
        # BacktestResult is an upstream dataclass of metrics, without native credentials/configs.
        metrics = {
            "market_events": sum(result.iterations for result in results),
            "orders": sum(result.total_orders for result in results),
            "positions": sum(result.total_positions for result in results),
        }
        # Avoid summing different currencies or annualized statistics across runs.
        if len(results) == 1:
            returns = results[0].stats_returns
            sharpe = returns.get("Sharpe Ratio (252 days)")
            if isinstance(sharpe, (int, float)) and math.isfinite(sharpe):
                metrics["sharpe_ratio"] = sharpe
            if len(results[0].stats_pnls) == 1:
                pnl = next(iter(results[0].stats_pnls.values()))
                for native_name, name in (("PnL% (total)", "return_pct"), ("Win Rate", "win_rate")):
                    value = pnl.get(native_name)
                    if isinstance(value, (int, float)) and math.isfinite(value):
                        metrics[name] = value
        write_result(state_dir, {"status": "completed", "action": "backtest", "metrics": metrics, "results": results})
    finally:
        node.dispose()


def build_trading_node(native: dict, mode: str):
    from nautilus_trader.adapters.binance import BinanceLiveDataClientFactory, BinanceLiveExecClientFactory
    from nautilus_trader.adapters.sandbox.factory import SandboxLiveExecClientFactory
    from nautilus_trader.config import TradingNodeConfig
    from nautilus_trader.live.node import TradingNode

    validate_live_node(native, mode)
    node_config = TradingNodeConfig.parse(json.dumps(native).encode())
    node = TradingNode(config=node_config)
    for client_name in native["data_clients"]:
        node.add_data_client_factory(client_name, BinanceLiveDataClientFactory)
    factory = SandboxLiveExecClientFactory if mode == "paper" else BinanceLiveExecClientFactory
    for client_name in native["exec_clients"]:
        node.add_exec_client_factory(client_name, factory)
    node.build()
    return node


def run_trading(native: dict, mode: str, state_dir: Path) -> None:
    node = build_trading_node(native, mode)
    # Do not claim connected/live-ready before Nautilus has completed its own startup.
    write_result(state_dir, {"status": "starting", "action": "start", "mode": mode})
    started = False

    async def publish_heartbeat() -> None:
        nonlocal started
        while True:
            running = node.is_running()
            started = started or running
            write_result(state_dir, {
                "status": "running" if running else "starting",
                "action": "start", "mode": mode,
            })
            await asyncio.sleep(2)

    heartbeat = node.kernel.loop.create_task(publish_heartbeat())
    try:
        # Nautilus installs SIGTERM/SIGINT handlers and performs orderly stop/reconciliation.
        node.run(raise_exception=True)
        if not started:
            raise ConfigurationError("Nautilus stopped before confirming connection and strategy startup.")
        write_result(state_dir, {"status": "stopped", "action": "start", "mode": mode})
    finally:
        heartbeat.cancel()
        node.dispose()


def main() -> int:
    state_dir = Path(os.environ.get("QUANT_STATE_DIR", "/state"))
    try:
        installed = importlib.metadata.version("nautilus_trader")
        if installed != VERSION:
            raise ConfigurationError("Installed NautilusTrader version does not match the pinned recipe.")
        request_path = Path(os.environ.get("QUANT_REQUEST_FILE", "/request/request.json"))
        request = read_json(request_path)
        action, mode = request.get("action"), request.get("config", {}).get("mode")
        if action not in {"start", "backtest"} or mode not in {"paper", "live"}:
            raise ConfigurationError("Unsupported Nautilus action or execution mode.")
        project = Path(os.environ.get("QUANT_PROJECT_DIR", "/project")).resolve()
        wrapper = read_json(project / ("backtest.json" if action == "backtest" else f"{mode}.json"))
        action, mode = validate_binding(request, wrapper)
        # Only the operator's read-only project can supply approved native strategy modules.
        sys.path.insert(0, str(project))
        os.chdir(project)
        if action == "backtest":
            run_backtest(wrapper["node"], request["config"], state_dir)
        else:
            run_trading(wrapper["node"], mode, state_dir)
        return 0
    except ConfigurationError as error:
        write_result(state_dir, {"status": "failed", "error": str(error)})
    except Exception as error:
        # Native exceptions may echo signed URLs or config values. Keep those out of
        # the user-facing result and inspect restricted runtime logs when necessary.
        write_result(state_dir, {"status": "failed", "error": f"Nautilus runtime failed ({type(error).__name__}); inspect the restricted engine logs."})
        print(f"Nautilus runtime failure: {type(error).__name__}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
