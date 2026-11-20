"""Run one vendored hedge engine in its own process and private data directory.

The trading strategy remains in engines/<engine>/src/parallax_hedge. This file
only supplies deployment isolation and the gateway-to-engine authentication.
"""
from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path


class InternalBearerAuth:
    """Protect every HTTP route, including the original HTML and static files."""

    def __init__(self, app, *, token: str) -> None:
        self.app = app
        self.expected = f"Bearer {token}".encode("utf-8")

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            values = [value for name, value in scope.get("headers", [])
                      if name.lower() == b"authorization"]
            if len(values) != 1 or not secrets.compare_digest(values[0], self.expected):
                body = b'{"detail":"Internal authentication required"}'
                await send({"type": "http.response.start", "status": 401,
                            "headers": [(b"content-type", b"application/json"),
                                        (b"cache-control", b"no-store"),
                                        (b"www-authenticate", b"Bearer")]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


def build_app(engine: str, data_dir: Path, host: str, port: int, token: str):
    from paired_hedge.config import PAIRS
    if engine not in {"lighter", "entropy", "binance", *PAIRS}:
        raise ValueError("Unknown engine")
    if not token:
        raise ValueError("HEDGE_OPS_INTERNAL_TOKEN is required")
    if "parallax_hedge" in sys.modules:
        raise RuntimeError("Each engine must run in a separate Python process")
    source_root = Path(__file__).resolve().parent / ("binance_lighter" if engine == "binance" else "engines/" + engine)
    sys.path.insert(0, str(source_root / "src"))

    if engine in PAIRS:
        from paired_hedge.api import create_app
        from paired_hedge.config import Settings as PairSettings, defaults
        from binance_lighter.config import sync_env_file
        source_root = Path(__file__).parent / "paired_hedge"
        class Settings:
            @staticmethod
            def load(env, data): return PairSettings.load_pair(engine, env, data)
    elif engine == "binance":
        from binance_lighter.api import create_app
        from binance_lighter.config import Settings, sync_env_file
    else:
        from parallax_hedge.api import create_app
        from parallax_hedge.config import Settings, sync_env_file

    data_dir = data_dir.resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    env_path = data_dir / ".env"
    # A missing file is safe: upstream Settings defaults to DRY_RUN=true and
    # empty credentials. Never copy environment variables or a global .env.
    sync_env_file(env_path, source_root / (engine + ".env.example" if engine in PAIRS else "env.example"))
    settings = Settings.load(env_path, data_dir)
    settings.host = host
    settings.port = port
    app = create_app(settings)

    @app.get("/api/runtime-safety", include_in_schema=False)
    async def runtime_safety():
        # The gateway checks this in addition to task/maker/position state before
        # shutdown. It is not forwarded to the browser and never alters a cycle.
        from emergency import empty_binance_journal
        return {"cycle_busy": app.state.engine._lock.locked(),
                "empty_journal": engine not in {"lighter","entropy"} and empty_binance_journal(app.state.store)}

    @app.post("/api/emergency", include_in_schema=False)
    async def emergency_action(payload: dict):
        from emergency import prepare, drain
        return prepare(app, engine) if payload.get("action") == "prepare" else await drain(app, engine)

    app.add_middleware(InternalBearerAuth, token=token)
    return app


def main() -> None:
    from paired_hedge.config import PAIRS
    parser = argparse.ArgumentParser(description="Run an isolated WeLink Hedge Ops engine")
    parser.add_argument("--engine", choices=("lighter", "entropy", "binance", *PAIRS), required=True)
    parser.add_argument("--host", default="127.0.0.1", choices=("127.0.0.1", "::1"))
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    token = os.environ.get("HEDGE_OPS_INTERNAL_TOKEN", "")
    if not token:
        parser.error("HEDGE_OPS_INTERNAL_TOKEN is required; start engines through the gateway")
    import uvicorn
    app = build_app(args.engine, args.data_dir, args.host, args.port, token)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
