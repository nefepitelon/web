"""侧栏仪表盘的交易量估算。"""
import pytest

from parallax_hedge.capacity import (
    MIN_ROTATION_HOURS, VERIFY_SECONDS, account_notional_limit, estimate, rounds_per_day,
    task_notional,
)


def test_rounds_per_day_counts_the_idle_overhead():
    assert rounds_per_day(1.0, 0) == pytest.approx(24)
    assert rounds_per_day(1.0, 3600) == pytest.approx(12)


def test_a_range_uses_its_midpoint_and_unset_amounts_fall_back():
    assert task_notional({"notional_usdc": 200, "notional_usdc_max": 600},
                         position_notional=None, fill_capacity=None) == (400, "区间中值")
    assert task_notional({"notional_usdc": 200}, position_notional=None, fill_capacity=None)[0] == 200
    assert task_notional({}, position_notional=950, fill_capacity=3000)[0] == 950
    assert task_notional({}, position_notional=None, fill_capacity=3000)[0] == 3000


def test_the_account_limit_keeps_the_open_corridor():
    # 权益 1000、维持保证金率 2%、门槛 3%：T ≤ 1000 / (0.03 × 1.02 + 0.02)
    limit, why = account_notional_limit(1000, 50, 0.02, 3.0)
    assert limit == pytest.approx(1000 / (0.03 * 1.02 + 0.02))
    x = (1000 - limit * 0.02) / (limit * 1.02)                  # 按这个仓位，离强平正好 3%
    assert x == pytest.approx(0.03)
    assert "开仓门槛" in why
    # 杠杆上限更紧时被杠杆卡住
    limit, why = account_notional_limit(1000, 5, 0.02, 3.0)
    assert limit == pytest.approx(1000 * 5 * 0.95) and "杠杆" in why


def test_estimate_adds_up_tasks_and_takes_the_tighter_venue():
    markets = {"BTC": {"arcus_max_leverage": 25, "arcus_mmf": 0.02,
                       "lighter_max_leverage": 50, "lighter_mmf": 0.012}}
    tasks = [{"asset": "BTC", "enabled": 1, "rotation_hours": 1, "rotation_hours_max": 3,
              "notional_usdc": 1000}]
    cap = estimate(tasks=tasks, markets=markets, lighter_equity=1500, arcus_equity=1650,
                   position_notional={}, fill_capacity={}, maker_for=lambda t: False,
                   cooldown=60, cycle=20, maker_wait=120, min_corridor_pct=3.0)
    overhead = 60 + 20 + VERIFY_SECONDS
    assert cap.current_daily == pytest.approx(24 / (2 + overhead / 3600) * 4 * 1000)
    lighter = 1500 / (0.03 * 1.012 + 0.012)
    arcus = 1650 / (0.03 * 1.02 + 0.02)
    assert cap.max_notional == pytest.approx(min(lighter, arcus))
    assert cap.max_daily == pytest.approx(
        24 / (MIN_ROTATION_HOURS + overhead / 3600) * 4 * min(lighter, arcus))
    assert cap.max_daily > cap.current_daily


def test_maker_tasks_wait_longer_per_round():
    tasks = [{"asset": "BTC", "enabled": 1, "rotation_hours": 1, "notional_usdc": 1000}]
    kw = dict(tasks=tasks, markets={}, lighter_equity=0, arcus_equity=0, position_notional={},
              fill_capacity={}, cooldown=60, cycle=20, maker_wait=120, min_corridor_pct=3.0)
    taker = estimate(maker_for=lambda t: False, **kw).current_daily
    maker = estimate(maker_for=lambda t: True, **kw).current_daily
    assert maker < taker


def test_disabled_tasks_do_not_count():
    tasks = [{"asset": "BTC", "enabled": 0, "rotation_hours": 1, "notional_usdc": 1000}]
    cap = estimate(tasks=tasks, markets={}, lighter_equity=0, arcus_equity=0, position_notional={},
                   fill_capacity={}, maker_for=lambda t: False, cooldown=60, cycle=20,
                   maker_wait=120, min_corridor_pct=3.0)
    assert cap.current_daily == 0
