"""API 层：任务的随机区间校验、首页统计接口的形状。

直接调用路由函数（不起服务器）。真实的 fastapi 和测试替身都能跑。
"""
import asyncio
import tempfile
from pathlib import Path

import pytest

from parallax_hedge.config import Settings


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def endpoint(app, method, path):
    for route in app.routes:
        if getattr(route, "path", None) == path and method in (getattr(route, "methods", None) or ()):
            return route.endpoint
    raise LookupError(f"{method} {path}")


class Client:
    async def common_markets(self, force=False):
        return [{"asset": "OAI", "lighter_market_index": 42}]

    async def aclose(self):
        pass


def make_app(tmp):
    from parallax_hedge.api import create_app
    settings = Settings(env_path=Path("."), data_dir=Path(tmp), lighter_account_index=77)
    app = create_app(settings)
    app.state.service.client = Client()
    return app


def http_error(coro):
    with pytest.raises(Exception) as info:
        run(coro)
    return getattr(info.value, "status_code", None), str(getattr(info.value, "detail", info.value))


def test_task_accepts_a_random_rotation_range():
    with tempfile.TemporaryDirectory() as tmp:
        app = make_app(tmp)
        save = endpoint(app, "POST", "/api/tasks")
        task = run(save({"asset": "oai", "enabled": True, "leverage": 6,
                         "rotation_hours": 1, "rotation_hours_max": 2}))["task"]
        assert task["rotation_hours"] == 1.0 and task["rotation_hours_max"] == 2.0
        # 只改一个字段不能把区间冲掉
        task = run(save({"asset": "OAI", "enabled": False}))["task"]
        assert task["rotation_hours_max"] == 2.0
        # 清空上限 = 回到固定周期
        task = run(save({"asset": "OAI", "rotation_hours_max": ""}))["task"]
        assert task["rotation_hours_max"] is None
        app.state.store.close()


def test_a_range_whose_maximum_is_below_its_minimum_is_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        app = make_app(tmp)
        save = endpoint(app, "POST", "/api/tasks")
        status, detail = http_error(save({"asset": "OAI", "leverage": 6,
                                          "rotation_hours": 2, "rotation_hours_max": 1}))
        assert status == 400 and "不能小于" in detail
        run(save({"asset": "OAI", "leverage": 6, "rotation_hours": 1, "rotation_hours_max": 2}))
        # 只改下限、把它抬到上限之上，也要拦住
        status, _ = http_error(save({"asset": "OAI", "rotation_hours": 3}))
        assert status == 400
        status, _ = http_error(save({"asset": "OAI", "rotation_hours_max": "abc"}))
        assert status == 400
        app.state.store.close()


def test_stats_endpoint_shape():
    with tempfile.TemporaryDirectory() as tmp:
        app = make_app(tmp)
        store = app.state.store
        store.upsert_task("OAI", enabled=1, leverage=6.0, rotation_hours=1.0)
        store.record_fill(asset="OAI", venue="lighter", action="open", side="buy",
                          dry_run=True, market_id=42, order_ref=None, requested_qty=0.1,
                          quantity=0.1, price=1590.0, source="simulated", status="final")
        s = run(endpoint(app, "GET", "/api/stats")())
        assert s["dry_run"] is True
        assert s["ledger"]["venues"]["lighter"]["volume"] == pytest.approx(159.0)
        assert s["ledger"]["total"]["fills"] == 1
        assert s["tasks"] == [{"asset": "OAI", "enabled": True, "opened_at": None}]
        assert "balances" in s and "reconciler" in s
        store.close()


def test_task_accepts_an_amount_range_and_an_order_type():
    with tempfile.TemporaryDirectory() as tmp:
        app = make_app(tmp)
        save = endpoint(app, "POST", "/api/tasks")
        task = run(save({"asset": "OAI", "leverage": 6, "rotation_hours": 1,
                         "notional_usdc": 200, "notional_usdc_max": 500,
                         "arcus_order_type": "market"}))["task"]
        assert task["notional_usdc"] == 200.0 and task["notional_usdc_max"] == 500.0
        assert task["arcus_order_type"] == "market"
        task = run(save({"asset": "OAI", "enabled": True}))["task"]      # 只改启用不冲掉区间
        assert task["notional_usdc_max"] == 500.0 and task["arcus_order_type"] == "market"
        task = run(save({"asset": "OAI", "notional_usdc_max": None}))["task"]
        assert task["notional_usdc_max"] is None                          # 回到固定金额
        app.state.store.close()


def test_bad_amount_ranges_and_order_types_are_rejected():
    with tempfile.TemporaryDirectory() as tmp:
        app = make_app(tmp)
        save = endpoint(app, "POST", "/api/tasks")
        code, msg = http_error(save({"asset": "OAI", "notional_usdc": 500, "notional_usdc_max": 200}))
        assert code == 400 and "不能小于" in msg
        code, msg = http_error(save({"asset": "OAI", "notional_usdc_max": 200}))
        assert code == 400 and "最小值" in msg
        code, msg = http_error(save({"asset": "OAI", "arcus_order_type": "stop"}))
        assert code == 400
        app.state.store.close()


def test_capacity_endpoint_shape():
    with tempfile.TemporaryDirectory() as tmp:
        app = make_app(tmp)
        save = endpoint(app, "POST", "/api/tasks")
        run(save({"asset": "OAI", "enabled": True, "leverage": 6, "rotation_hours": 1,
                  "notional_usdc": 100}))
        cap = run(endpoint(app, "GET", "/api/capacity")())
        for key in ("current_daily", "max_daily", "actual_24h", "tasks", "max_binding", "equity"):
            assert key in cap
        assert cap["tasks"][0]["asset"] == "OAI" and cap["current_daily"] > 0
        app.state.store.close()
