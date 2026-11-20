"""Subprocess integration: real upstream API + SQLite + finite cloud adapter."""
import asyncio
import importlib.util
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
engine_name = sys.argv[1]
sys.path.insert(0, str(root))
sys.path.insert(0, str(root / "engines" / engine_name / "src"))
import cloud_worker
import parallax_hedge.api as api
from gateway import schema

original = api.create_app
def create(settings):
    app = original(settings)
    class Client:
        async def common_markets(self, *args, **kwargs):
            return [{"asset": "BTC", "entropy_market_index": 1, "lighter_market_id": 1}]
        async def aclose(self): pass
    app.state.service.client = Client()
    app.state.engine.executor.market = app.state.service.client
    async def refresh(**kwargs):
        app.state.service._snapshot = {"ready": True, "generated_at": 1, "rows": [], "accounts": {}, "balances": {}}
        return app.state.service.snapshot
    app.state.service.refresh = refresh
    return app
api.create_app = create

async def main():
    checkpoints = []
    def save(state, views): checkpoints.append(json.loads(json.dumps(state)))
    values = schema(engine_name)
    result = await cloud_worker.run_engine(engine_name, values, {}, {"action": "request", "path": "tasks", "method": "POST", "payload": {"asset": "BTC", "enabled": False, "leverage": 2, "rotation_hours": 4}}, save)
    assert result["status"] == 200, result
    assert checkpoints and checkpoints[-1]["sqlite"]
    # A second invocation has a new temp directory and new app but restores DB.
    result = await cloud_worker.run_engine(engine_name, values, checkpoints[-1], {"action": "request", "path": "tasks", "method": "GET"}, save)
    assert result["data"]["tasks"][0]["asset"] == "BTC", result
    assert result["data"]["tasks"][0]["leverage"] == 2
    assert result["views"]["tasks"]["dry_run"] is True
    await cloud_worker.run_engine(engine_name, values, checkpoints[-1], {"action": "safe-stop"}, save)
    print(engine_name + " cloud checkpoint roundtrip OK")
asyncio.run(main())
