"""持久化：老库升级、随机轮换的抽签落库、成交账本的汇总口径。"""
import sqlite3
import tempfile
from pathlib import Path

import pytest

from parallax_hedge.store import Store, summarize_fills

# 升级前线上库的 tasks 表结构（原样照抄）。线上库里有真实持仓状态，
# 升级必须只加列、不丢数据。
OLD_TASKS_SCHEMA = """
CREATE TABLE tasks (
    asset               TEXT PRIMARY KEY,
    enabled             INTEGER NOT NULL DEFAULT 0,
    leverage            REAL    NOT NULL,
    rotation_hours      REAL    NOT NULL,
    notional_usdc       REAL,
    opened_at           REAL,
    corridor_at_open    REAL,
    last_closed_at      REAL,
    open_direction      TEXT,
    open_quantity       REAL,
    created_at          REAL    NOT NULL,
    updated_at          REAL    NOT NULL
);
"""


def fresh(tmp):
    return Store(Path(tmp) / "t.db")


def test_old_database_gains_new_columns_without_losing_the_open_position():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "hedge.db"
        conn = sqlite3.connect(path)
        conn.executescript(OLD_TASKS_SCHEMA)
        conn.execute(
            "INSERT INTO tasks VALUES ('OAI',1,6.0,0.5,200.0,1789783062.9,7.68,NULL,"
            "'long_entropy_short_arcus',0.126,1789752908.0,1789783062.9)"
        )
        conn.commit()
        conn.close()

        store = Store(path)
        task = store.get_task("OAI")
        assert task["opened_at"] == pytest.approx(1789783062.9)
        assert task["open_quantity"] == pytest.approx(0.126)
        assert task["rotation_hours"] == pytest.approx(0.5)
        assert task["rotation_hours_max"] is None       # 老任务 = 固定周期，行为不变
        assert task["hold_hours"] is None
        store.record_fill(asset="OAI", venue="arcus", action="open", side="sell",
                          dry_run=False, market_id=None, order_ref="1",
                          requested_qty=0.1, quantity=0.1, price=100.0,
                          source="receipt", status="pending")
        store.close()
        # 再开一次也不能出错（迁移必须是幂等的）
        Store(path).close()


def test_the_drawn_hold_time_is_stored_at_open_and_cleared_at_close():
    with tempfile.TemporaryDirectory() as tmp:
        store = fresh(tmp)
        store.upsert_task("OAI", enabled=1, leverage=6.0, rotation_hours=1.0,
                          rotation_hours_max=2.0)
        store.mark_opened("OAI", direction="long_entropy_short_arcus",
                          quantity=0.1, corridor_pct=8.0, hold_hours=1.37)
        assert store.get_task("OAI")["hold_hours"] == pytest.approx(1.37)
        store.mark_closed("OAI")
        task = store.get_task("OAI")
        assert task["hold_hours"] is None and task["opened_at"] is None
        assert task["rotation_hours_max"] == pytest.approx(2.0)     # 设置不受影响


def test_log_cycle_returns_the_row_id():
    with tempfile.TemporaryDirectory() as tmp:
        store = fresh(tmp)
        a = store.log_cycle("OAI", "open", "x")
        b = store.log_cycle("OAI", "close", "y")
        assert b == a + 1


def _fill(store, **kw):
    base = dict(asset="OAI", venue="entropy", action="open", side="buy", dry_run=False,
                market_id=42, order_ref=None, requested_qty=0.1, quantity=0.1,
                price=100.0, source="position", status="pending")
    base.update(kw)
    return store.record_fill(**base)


def test_the_same_order_is_only_booked_once():
    """回填和实时记录会重叠，同一个订单号只能记一次。"""
    with tempfile.TemporaryDirectory() as tmp:
        store = fresh(tmp)
        assert _fill(store, order_ref="abc") is not None
        assert _fill(store, order_ref="abc", action="rescue") is None
        assert _fill(store, venue="arcus", order_ref="abc") is not None   # 不同所可以同号
        assert store.fill_stats(dry_run=False)["total"]["fills"] == 2


def test_pending_rows_are_settled_or_given_up():
    with tempfile.TemporaryDirectory() as tmp:
        store = fresh(tmp)
        a = _fill(store, order_ref="a", created_at=100.0)
        b = _fill(store, order_ref="b", created_at=100.0)
        _fill(store, order_ref="c", created_at=10_000.0)
        assert {r["order_ref"] for r in store.pending_fills(older_than=200.0)} == {"a", "b"}
        store.settle_fill(a, quantity=0.1, price=101.0, fee=0.02, realized_pnl=0.0, side="buy")
        store.give_up_fill(b, "对不上")
        assert {r["order_ref"] for r in store.pending_fills(older_than=20_000.0)} == {"c"}
        stats = store.fill_stats(dry_run=False)["venues"]["entropy"]
        assert stats["pending"] == 1 and stats["estimated"] == 1


def test_volume_and_fees_add_up_per_venue_and_in_total():
    rows = [
        {"asset": "OAI", "venue": "entropy", "action": "open", "quantity": 0.1, "price": 1000.0,
         "fee": 0.0, "realized_pnl": 0.0, "status": "final", "created_at": 1.0},
        {"asset": "OAI", "venue": "arcus", "action": "open", "quantity": 0.1, "price": 998.0,
         "fee": 0.03, "realized_pnl": 0.0, "status": "final", "created_at": 2.0},
        {"asset": "ANTH", "venue": "arcus", "action": "open", "quantity": 0.2, "price": 2000.0,
         "fee": 0.05, "realized_pnl": 0.0, "status": "final", "created_at": 3.0},
        # 失败的尝试：Entropy 成交了、Arcus 没成交（随后被抢救平掉）
        {"asset": "SNDK", "venue": "entropy", "action": "open", "quantity": 0.01, "price": 1700.0,
         "fee": 0.0, "realized_pnl": 0.0, "status": "final", "created_at": 4.0},
    ]
    s = summarize_fills(rows)
    assert s["venues"]["entropy"]["volume"] == pytest.approx(100.0 + 17.0)
    assert s["venues"]["arcus"]["volume"] == pytest.approx(99.8 + 400.0)
    assert s["total"]["volume"] == pytest.approx(616.8)
    assert s["total"]["fees"] == pytest.approx(0.08)
    assert s["by_asset"]["OAI"]["total"]["volume"] == pytest.approx(199.8)
    assert s["by_asset"]["OAI"]["opens"] == 1
    assert s["by_asset"]["ANTH"]["opens"] == 1
    assert s["by_asset"]["SNDK"]["opens"] == 0          # 失败的尝试不算一次开仓
    assert s["since"] == pytest.approx(1.0)


def test_net_pnl_is_withheld_until_both_venues_closing_fills_are_known():
    """对冲的两条腿一赚一亏。只拿到 Arcus 那边就算净损益，
    会把一轮亏损显示成「赚了」—— 一夜实盘里 ANTH 的 Arcus 腿就是 +4.40。"""
    open_legs = [
        {"asset": "ANTH", "venue": "entropy", "action": "open", "quantity": 0.23, "price": 2180.0,
         "fee": 0.0, "realized_pnl": None, "status": "pending"},
        {"asset": "ANTH", "venue": "arcus", "action": "open", "quantity": 0.23, "price": 2172.0,
         "fee": 0.04, "realized_pnl": 0.0, "status": "final"},
    ]
    arcus_close = {"asset": "ANTH", "venue": "arcus", "action": "close", "quantity": 0.23,
                     "price": 2165.0, "fee": 0.04, "realized_pnl": 1.61, "status": "final"}
    entropy_close = {"asset": "ANTH", "venue": "entropy", "action": "close", "quantity": 0.23,
                     "price": 2170.0, "fee": 0.0, "realized_pnl": None, "status": "pending"}

    half = summarize_fills(open_legs + [arcus_close, entropy_close])
    assert half["total"]["net_pnl"] is None
    assert half["total"]["wear_per_10k"] is None
    assert half["total"]["pnl_unknown"] == 1

    entropy_close = {**entropy_close, "realized_pnl": -2.30, "status": "final"}
    full = summarize_fills(open_legs + [arcus_close, entropy_close])
    assert full["total"]["net_pnl"] == pytest.approx(1.61 - 2.30 - 0.08)
    assert full["total"]["wear_per_10k"] == pytest.approx(
        0.77 / full["total"]["volume"] * 10_000)


def test_an_unknown_fee_also_withholds_net_pnl():
    rows = [{"asset": "OAI", "venue": "arcus", "action": "close", "quantity": 0.1,
             "price": 100.0, "fee": None, "realized_pnl": 0.5, "status": "pending"}]
    assert summarize_fills(rows)["total"]["net_pnl"] is None


def test_zero_quantity_rows_do_not_count_as_fills():
    """IOC 零成交的单子会在账本里留一行（数量 0），不能算进成交笔数或交易量。"""
    rows = [{"asset": "OAI", "venue": "entropy", "action": "open", "quantity": 0.0,
             "price": 100.0, "fee": None, "realized_pnl": None, "status": "estimated"}]
    s = summarize_fills(rows)
    assert s["total"]["fills"] == 0 and s["total"]["volume"] == 0
    assert s["total"]["fee_unknown"] == 0       # 没成交就谈不上手续费未知


def test_simulated_and_live_fills_never_mix():
    with tempfile.TemporaryDirectory() as tmp:
        store = fresh(tmp)
        _fill(store, dry_run=True, source="simulated", status="final")
        _fill(store, order_ref="x")
        assert store.fill_stats(dry_run=True)["total"]["fills"] == 1
        assert store.fill_stats(dry_run=False)["total"]["fills"] == 1


def test_meta_is_a_simple_key_value_store():
    with tempfile.TemporaryDirectory() as tmp:
        store = fresh(tmp)
        assert store.get_meta("k") is None
        store.set_meta("k", "1")
        store.set_meta("k", "2")
        assert store.get_meta("k") == "2"


# ── v1.6：按完整轮次实时算净损益 / 磨损 ─────────────────────

def _f(asset, venue, action, side, qty, price, fee=None, cycle=1, t=1.0, status="final"):
    return {"asset": asset, "venue": venue, "action": action, "side": side, "quantity": qty,
            "price": price, "fee": fee, "realized_pnl": None, "status": status,
            "created_at": t, "cycle_id": cycle, "id": int(t * 100)}


def test_a_closed_round_is_priced_from_the_fills_without_waiting_for_reconciliation():
    from parallax_hedge.store import summarize_rounds
    rows = [
        _f("OAI", "entropy", "open", "buy", 1.0, 100.0, 0.0, cycle=1, t=1),
        _f("OAI", "arcus", "open", "sell", 1.0, 100.2, 0.02254, cycle=1, t=1.1),   # 2.25 bps
        # 平仓：Arcus 这笔还在对账（手续费未知），一样计入（按费率估）
        _f("OAI", "entropy", "close", "sell", 1.0, 101.0, 0.0, cycle=2, t=2, status="pending"),
        _f("OAI", "arcus", "close", "buy", 1.0, 101.3, None, cycle=2, t=2.1, status="pending"),
    ]
    r = summarize_rounds(rows)["by_asset"]["OAI"]
    assert r["rounds"] == 1 and r["fee_estimated"] == 1
    # 价差：Entropy +1.0，Arcus −1.1 → −0.1
    assert r["spread_pnl"] == pytest.approx(-0.1)
    assert r["volume"] == pytest.approx(100 + 100.2 + 101 + 101.3)
    # 已知手续费 0.02254 + 估算的那笔（按已对账的 2.25 bps 费率 × 101.3）
    assert r["fees"] == pytest.approx(0.02254 + 101.3 * 0.02254 / 100.2)
    assert r["wear_per_10k"] == pytest.approx(-r["net_pnl"] / r["volume"] * 10_000)


def test_the_open_round_is_not_counted_until_it_closes():
    from parallax_hedge.store import summarize_rounds
    rows = [
        _f("OAI", "entropy", "open", "buy", 1.0, 100.0, 0.0, cycle=1, t=1),
        _f("OAI", "arcus", "open", "sell", 1.0, 100.2, 0.0, cycle=1, t=1.1),
    ]
    r = summarize_rounds(rows)["by_asset"]["OAI"]
    assert r["rounds"] == 0 and r["net_pnl"] is None and r["in_progress"]


def test_an_unbalanced_round_is_skipped_not_guessed():
    from parallax_hedge.store import summarize_rounds
    rows = [
        _f("OAI", "entropy", "open", "buy", 1.0, 100.0, 0.0, cycle=1, t=1),
        _f("OAI", "arcus", "open", "sell", 1.0, 100.0, 0.0, cycle=1, t=1.1),
        _f("OAI", "entropy", "close", "sell", 0.5, 101.0, 0.0, cycle=2, t=2),   # 只记到一半
        _f("OAI", "arcus", "close", "buy", 1.0, 101.0, 0.0, cycle=2, t=2.1),
    ]
    r = summarize_rounds(rows)["by_asset"]["OAI"]
    assert r["rounds"] == 0 and r["skipped"] == 1


def test_topups_and_trims_belong_to_the_round_they_happen_in():
    from parallax_hedge.store import summarize_rounds
    rows = [
        _f("OAI", "entropy", "open", "buy", 1.0, 100.0, 0.0, cycle=1, t=1),
        _f("OAI", "arcus", "open", "sell", 1.0, 100.0, 0.0, cycle=1, t=1.1),
        _f("OAI", "entropy", "topup", "buy", 0.5, 100.0, 0.0, cycle=3, t=1.5),
        _f("OAI", "arcus", "topup", "sell", 0.6, 100.0, 0.0, cycle=3, t=1.6),
        _f("OAI", "arcus", "rescue", "buy", 0.1, 100.0, 0.0, cycle=3, t=1.7),
        _f("OAI", "entropy", "close", "sell", 1.5, 100.0, 0.0, cycle=4, t=2),
        _f("OAI", "arcus", "close", "buy", 1.5, 100.0, 0.0, cycle=4, t=2.1),
    ]
    r = summarize_rounds(rows)["by_asset"]["OAI"]
    assert r["rounds"] == 1 and r["skipped"] == 0 and r["net_pnl"] == pytest.approx(0.0)


def test_unreconciled_entropy_fees_are_estimated_at_the_observed_rate():
    """Entropy 有吃单费：没对上账的按已对账成交的平均费率估。"""
    from parallax_hedge.store import DEFAULT_ENTROPY_FEE_RATE, summarize_rounds

    def r(venue, action, side, qty, price, fee, cid, rid):
        return {"asset": "OAI", "venue": venue, "action": action, "side": side,
                "quantity": qty, "price": price, "fee": fee, "realized_pnl": None,
                "status": "final", "created_at": rid, "cycle_id": cid, "id": rid}
    rows = [r("entropy", "open", "buy", 1, 100, 0.0172 / 2, 1, 1),
            r("arcus", "open", "sell", 1, 100, 0.0225, 1, 2),
            r("entropy", "close", "sell", 1, 100, None, 2, 3),
            r("arcus", "close", "buy", 1, 100, 0.0225, 2, 4)]
    out = summarize_rounds(rows)
    assert out["entropy_fee_rate"] == pytest.approx(0.0172 / 2 / 100)
    rd = out["by_asset"]["OAI"]
    assert rd["fee_estimated"] == 1
    assert rd["fees"] == pytest.approx(0.0086 * 2 + 0.045)
    assert summarize_rounds([])["entropy_fee_rate"] == DEFAULT_ENTROPY_FEE_RATE
