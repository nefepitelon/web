"""成交账本：按订单号对账。

Entropy（Hyperliquid io 子 dex）按 userFills 里的 oid 加总；
Arcus 按 /v1/fills 的 orderId（或 clientId）加总，字段照官方文档。
"""
import asyncio
import json
import tempfile
from pathlib import Path

import pytest

from parallax_hedge import ledger as L
from parallax_hedge.execution import LegResult
from parallax_hedge.store import Store


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ── Entropy userFills → 单张订单 ──────────────────────────

def hl_fill(oid, sz, px, *, side="B", fee="0.0108", closed="0.0", tid=None,
            fee_token="USDC", coin="io:SNDK", time_ms=1789756505000):
    return {"coin": coin, "px": px, "sz": sz, "side": side, "time": time_ms,
            "startPosition": "0", "dir": "Open Long", "closedPnl": closed,
            "hash": "0xabc", "oid": oid, "crossed": True, "fee": fee,
            "tid": tid if tid is not None else hash((oid, sz, px)) & 0xFFFFFFFF,
            "feeToken": fee_token}


def test_entropy_fills_of_one_order_are_summed_at_their_vwap():
    rows = [hl_fill(901, "0.1", "1590", tid=1), hl_fill(901, "0.026", "1591", tid=2),
            hl_fill(902, "9", "1", tid=3)]                         # 别的单
    hit = L.match_entropy_fills(rows, "901")
    assert hit.quantity == pytest.approx(0.126)
    assert hit.price == pytest.approx((0.1 * 1590 + 0.026 * 1591) / 0.126)
    assert hit.side == "buy" and hit.matched == 2
    assert hit.fee == pytest.approx(0.0216)


def test_entropy_closed_pnl_and_sell_side():
    hit = L.match_entropy_fills([hl_fill(5, "0.3", "100", side="A", closed="-0.35")], 5)
    assert hit.realized_pnl == pytest.approx(-0.35) and hit.side == "sell"


def test_a_fee_in_an_unknown_token_makes_the_fee_unknown_not_wrong():
    hit = L.match_entropy_fills([hl_fill(5, "0.3", "100", fee="0.2", fee_token="HYPE")], 5)
    assert hit.fee is None


def test_a_fill_seen_twice_is_counted_once():
    row = hl_fill(7, "0.5", "10", tid=99)
    assert L.match_entropy_fills([row, dict(row)], 7).quantity == pytest.approx(0.5)


def test_entropy_no_match_returns_none():
    assert L.match_entropy_fills([hl_fill(2, "1", "1")], 1) is None
    assert L.match_entropy_fills([], 1) is None
    assert L.match_entropy_fills([hl_fill(1, "1", "1")], None) is None
    assert L.match_entropy_fills([hl_fill(1, "1", "1")], "not-a-number") is None


# ── Arcus /v1/fills → 单张订单 ─────────────────────────

def arcus_fill(order_id, size, price, *, side="SELL", fee="0.0451", closed="0.0",
               trade_id=None, client_id=None):
    return {"tradeId": trade_id or f"t{order_id}{size}{price}", "orderId": order_id,
            "clientId": client_id, "marketId": 26, "marketDisplayName": "OAI-USD",
            "side": side, "size": size, "price": price, "fee": fee,
            "closedPnl": closed, "role": "TAKER", "createdAt": 1790000000000000}


def test_arcus_fills_matched_by_order_id():
    rows = [arcus_fill("o-1", "0.1", "1584.4"), arcus_fill("o-1", "0.026", "1584.3"),
            arcus_fill("o-2", "5", "1")]
    hit = L.match_arcus_fills(rows, "o-1")
    assert hit.quantity == pytest.approx(0.126)
    assert hit.price == pytest.approx((0.1 * 1584.4 + 0.026 * 1584.3) / 0.126)
    assert hit.fee == pytest.approx(0.0902)
    assert hit.realized_pnl == pytest.approx(0.0902)   # closedPnl 0 + 手续费加回
    assert hit.side == "sell" and hit.matched == 2


def test_arcus_closed_pnl_is_kept_and_duplicates_are_counted_once():
    row = arcus_fill("o-7", "0.1", "100", side="BUY", fee="0.02", closed="1.25", trade_id="T1")
    hit = L.match_arcus_fills([row, dict(row)], "o-7")      # 同一笔成交出现两次
    assert hit.quantity == pytest.approx(0.1)
    assert hit.realized_pnl == pytest.approx(1.27) and hit.side == "buy"


def test_arcus_order_without_an_order_id_is_matched_by_client_id():
    rows = [arcus_fill("o-9", "0.2", "10", client_id="ph123"), arcus_fill("o-8", "1", "10")]
    hit = L.match_arcus_fills(rows, "cid:ph123")
    assert hit.quantity == pytest.approx(0.2)
    assert L.match_arcus_fills(rows, "cid:nobody") is None
    assert L.match_arcus_fills(rows, None) is None


# ── 执行结果 → 账本行 ────────────────────────────────────

def test_live_arcus_leg_is_booked_with_its_order_id_for_reconciliation():
    leg = LegResult("arcus", True, raw={"orderId": "o-1"}, filled=0.126, side="sell",
                    requested=0.126, price=1584.4, fill_confirmed=True, order_ref="o-1")
    row = L.fill_row_from_leg("OAI", "open", leg, dry_run=False, market_id=42)
    assert row["source"] == "position" and row["status"] == "pending"
    assert row["quantity"] == pytest.approx(0.126) and row["confirmed_qty"] == pytest.approx(0.126)
    assert row["order_ref"] == "o-1"
    assert row["market_id"] is None                  # 市场号只对 Entropy 有意义


def test_an_arcus_leg_with_an_unknown_outcome_is_still_booked():
    """请求超时的腿：没被当成「没发出去」，按 clientId 进账本等对账。"""
    leg = LegResult("arcus", False, submitted=False, uncertain=True, side="sell",
                    requested=0.1, price=10.0, order_ref="cid:ph1")
    row = L.fill_row_from_leg("OAI", "open", leg, dry_run=False, market_id=None)
    assert row is not None and row["order_ref"] == "cid:ph1" and row["status"] == "pending"


def test_unconfirmed_entropy_leg_is_booked_at_zero_until_the_exchange_says_otherwise():
    """抢救单这种没测成交量的腿，先记 0，交给交易所成交记录定。
    宁可暂时少算，也不能把可能没成交的单算进交易量。"""
    leg = LegResult("entropy", True, raw={}, side="sell", requested=0.125,
                    price=1590.0, order_ref="4242")
    row = L.fill_row_from_leg("OAI", "rescue", leg, dry_run=False, market_id=42)
    assert row["quantity"] == 0.0 and row["status"] == "pending"
    assert row["market_id"] == 42 and row["order_ref"] == "4242"
    assert "未证实" in row["note"]


def test_an_entropy_receipt_with_no_fill_is_not_booked():
    """Hyperliquid 回执明确说没成交（IOC 落空 / 拒单）：没有交易量、没有手续费，不记账。"""
    leg = LegResult("entropy", False, raw={"status": "ok"}, error="Order could not immediately match",
                    side="buy", requested=0.1, price=10.0, receipt_fill=True)
    assert L.fill_row_from_leg("OAI", "open", leg, dry_run=False, market_id=42) is None
    filled = LegResult("entropy", True, raw={"status": "ok"}, filled=0.1, fill_confirmed=True,
                       side="buy", requested=0.1, price=10.0, receipt_fill=True, order_ref="77")
    row = L.fill_row_from_leg("OAI", "open", filled, dry_run=False, market_id=42)
    assert row["quantity"] == pytest.approx(0.1) and row["order_ref"] == "77"


def test_leg_without_an_order_ref_is_finalised_as_an_estimate():
    leg = LegResult("entropy", True, raw={"weird": 1}, filled=0.1, fill_confirmed=True,
                    side="buy", requested=0.1, price=1.0)
    row = L.fill_row_from_leg("OAI", "open", leg, dry_run=False, market_id=42)
    assert row["status"] == "estimated" and row["order_ref"] is None


def test_unsubmitted_legs_are_not_booked_and_dry_run_is_simulated():
    assert L.fill_row_from_leg("OAI", "open", LegResult("arcus", False, submitted=False),
                               dry_run=False, market_id=None) is None
    leg = LegResult("entropy", True, filled=0.2, requested=0.2, price=100.0, side="buy",
                    fill_confirmed=True)
    row = L.fill_row_from_leg("OAI", "open", leg, dry_run=True, market_id=42)
    assert row["source"] == "simulated" and row["status"] == "final"
    assert row["quantity"] == pytest.approx(0.2) and row["order_ref"] is None


# ── 对账 ────────────────────────────────────────────────

class FakeClient:
    def __init__(self, arcus_fills=None, entropy_fills=None, fail_arcus=False,
                 fail_entropy=False):
        self.arcus_rows = arcus_fills or []
        self.arcus_since = []
        self.entropy_rows = entropy_fills or []
        self.fail_arcus = fail_arcus
        self.fail_entropy = fail_entropy
        self.entropy_calls = 0

    async def arcus_fills(self, since, market_id=None):
        if self.fail_arcus:
            raise RuntimeError("Arcus 超时")
        self.arcus_since.append(since)
        return self.arcus_rows

    async def entropy_user_fills(self):
        if self.fail_entropy:
            raise RuntimeError("Entropy 429")
        self.entropy_calls += 1
        return self.entropy_rows


def book(store, venue, ref, *, created_at, action="open", quantity=0.0, market_id=42,
         confirmed=None):
    return store.record_fill(asset="OAI", venue=venue, action=action, side=None,
                             dry_run=False, market_id=market_id if venue == "entropy" else None,
                             order_ref=ref, requested_qty=0.126, quantity=quantity,
                             price=1590.0, source="position", status="pending",
                             created_at=created_at, confirmed_qty=confirmed)


def reconcile(store, client, now=10_000.0):
    rec = L.FillReconciler(store, client, clock=lambda: now)
    return run(rec.run_once())


def fills(store):
    return {r["order_ref"]: dict(r) for r in store.conn.execute("SELECT * FROM fills")}


def test_matched_rows_take_the_exchanges_numbers():
    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        book(store, "arcus", "o-5491", created_at=9_000.0, quantity=0.126)
        book(store, "entropy", "901", created_at=9_000.0)
        client = FakeClient(
            arcus_fills=[arcus_fill("o-5491", "0.126", "1584.4", fee="0.0540")],
            entropy_fills=[hl_fill(901, "0.126", "1590.6", fee="0.0172")],
        )
        summary = reconcile(store, client)
        assert summary["matched"] == 2 and not summary["errors"]
        rows = fills(store)
        assert rows["o-5491"]["fee"] == pytest.approx(0.054)
        assert rows["o-5491"]["status"] == "final"
        assert rows["o-5491"]["price"] == pytest.approx(1584.4)
        # 成交按时间查：从最早那张单往前再留 5 分钟
        assert client.arcus_since == [9_000.0 - L.ARCUS_FILLS_MARGIN_SEC]
        assert rows["901"]["quantity"] == pytest.approx(0.126)   # 原来记的是 0
        assert rows["901"]["price"] == pytest.approx(1590.6)     # 原来是参考价 1590
        assert rows["901"]["fee"] == pytest.approx(0.0172)       # Entropy 有手续费
        assert rows["901"]["side"] == "buy" and rows["901"]["source"] == "exchange"


def test_rows_are_only_checked_after_a_grace_period():
    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        book(store, "arcus", "1", created_at=10_000.0 - 5)
        book(store, "entropy", "2", created_at=10_000.0 - 30)
        client = FakeClient(entropy_fills=[hl_fill(2, "0.126", "1")])
        summary = reconcile(store, client)
        assert summary["checked"] == 0 and client.entropy_calls == 0


def test_unmatched_rows_are_given_up_only_when_the_exchange_answered():
    """交易所数据拿到了、却找不到这张单 → 多半是 IOC 零成交，按估计值定稿。
    交易所数据本身没拿到 → 不能下任何结论，继续等。"""
    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        book(store, "arcus", "1", created_at=10.0)
        book(store, "arcus", "2", created_at=9_990.0 - L.MATCH_GRACE_SEC)
        book(store, "entropy", "3", created_at=10.0)
        reconcile(store, FakeClient(arcus_fills=[]), now=10_000.0)
        rows = fills(store)
        assert rows["1"]["status"] == "estimated"          # 老的：定稿
        assert rows["2"]["status"] == "pending"            # 新的：再等等
        assert rows["3"]["status"] == "estimated"

    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        book(store, "arcus", "1", created_at=10.0)
        book(store, "entropy", "3", created_at=10.0)
        summary = reconcile(store, FakeClient(fail_arcus=True, fail_entropy=True), now=10_000.0)
        assert fills(store)["1"]["status"] == "pending"    # 接口挂了不定稿
        assert fills(store)["3"]["status"] == "pending"
        assert any("Arcus" in e for e in summary["errors"])
        assert any("Entropy" in e for e in summary["errors"])


def test_a_partial_match_is_not_settled_while_the_record_may_still_be_filling_in():
    """仓位实测 0.2776，交易所记录暂时只有 0.015：不定稿，下一轮再对。"""
    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        book(store, "entropy", "9", created_at=9_000.0, quantity=0.2776, confirmed=0.2776)
        summary = reconcile(store, FakeClient(entropy_fills=[hl_fill(9, "0.015", "1780.21", tid=1)]))
        row = fills(store)["9"]
        assert row["status"] == "pending" and summary["waiting"] == 1
        assert row["quantity"] == pytest.approx(0.2776)          # 不被残缺数据改小
        full = [hl_fill(9, "0.015", "1780.21", tid=1), hl_fill(9, "0.2626", "1780.2", tid=2)]
        reconcile(store, FakeClient(entropy_fills=full), now=10_100.0)
        row = fills(store)["9"]
        assert row["status"] == "final" and row["quantity"] == pytest.approx(0.2776)


def test_a_match_that_never_completes_keeps_the_confirmed_quantity():
    """一直对不全：数量按仓位实测，价格用对上那部分的均价，手续费和盈亏不瞎算。"""
    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        book(store, "entropy", "9", created_at=10.0, quantity=0.2776, confirmed=0.2776)
        reconcile(store, FakeClient(entropy_fills=[hl_fill(9, "0.015", "1780.21", side="A")]),
                  now=10_000.0)
        row = fills(store)["9"]
        assert row["status"] == "estimated"
        assert row["quantity"] == pytest.approx(0.2776)
        assert row["price"] == pytest.approx(1780.21)
        assert row["fee"] is None and row["realized_pnl"] is None
        assert "0.015" in row["note"]


def test_a_match_bigger_than_the_order_is_not_trusted():
    """IOC 单不可能成交超过下单量；对上的比下单量还多，只能是对错了单。"""
    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        book(store, "entropy", "9", created_at=9_000.0, quantity=0.126, confirmed=0.126)
        summary = reconcile(store, FakeClient(entropy_fills=[hl_fill(9, "0.2776", "1780")]))
        row = fills(store)["9"]
        assert row["status"] == "estimated" and summary["gave_up"] == 1
        assert row["quantity"] == pytest.approx(0.126)
        assert row["fee"] is None and "超过下单量" in row["note"]


def test_arcus_closed_pnl_already_contains_the_fee():
    """实盘数据（2026-09-26）：ETH 空 0.7438，2688.62 开、2690.55 平，平仓 closedPnl −1.8858，
    手续费 0.4503。价差损益应是 −1.4355，不能再把手续费扣一遍。"""
    row = arcus_fill("o-c", "0.7438", "2690.55", side="BUY", fee="0.450276995",
                     closed="-1.885810995")
    hit = L.match_arcus_fills([row], "o-c")
    assert hit.realized_pnl == pytest.approx((2688.62 - 2690.55) * 0.7438, abs=1e-4)


def test_repair_adds_the_fee_back_once():
    with tempfile.TemporaryDirectory() as tmp:
        store = Store(Path(tmp) / "t.db")
        store.record_fill(asset="ETH", venue="arcus", action="close", side="buy", dry_run=False,
                          market_id=None, order_ref="o1", requested_qty=1, quantity=1,
                          price=10.0, source="exchange", status="final", fee=0.45,
                          realized_pnl=-1.8858)
        assert L.repair_arcus_double_counted_fees(store) == 1
        assert L.repair_arcus_double_counted_fees(store) == 0
        row = store.conn.execute("SELECT realized_pnl FROM fills").fetchone()
        assert row[0] == pytest.approx(-1.4358)
