"""双腿执行编排的用例。

锁住 2026-09-17 那笔实盘救回来的行为：
Entropy 报单成功但零成交时，【绝不能向 Arcus 下单】。
以及部分成交要按实际量对冲、Arcus 失败要抢救裸腿。
"""
import asyncio
from decimal import Decimal
from pathlib import Path

import pytest

from parallax_hedge import execution as execmod
from parallax_hedge.config import Settings
from parallax_hedge.exchanges import ExchangeError
from parallax_hedge import arcus as ax
from parallax_hedge.execution import Executor, LegResult, arcus_limit_price
from parallax_hedge.fills import slippage_limit_price

execmod._CONFIRM_DELAY_SEC = 0.001          # 测试里不要真的等
execmod._CONFIRM_RETRIES = 2
execmod._ARCUS_CONFIRM_RETRIES = 2

ARCUS_SEED = "11" * 32                        # 测试专用密钥，固定种子 → 签名可复现
ARCUS_ADDRESS = "0x" + "ab" * 20

MARKET = {
    "asset": "SNDK", "entropy_symbol": "io:SNDK", "entropy_market_index": 32,
    "arcus_symbol": "SNDK-USD", "arcus_market_id": 26, "quantity_decimals": 2,
    "arcus_step_size": "0.001", "arcus_tick_size": "0.01",
    # 分段 tick：1000 以下 0.01，1000~10000 是 0.1，再往上 1
    "arcus_tick_tiers": [{"upToPrice": "1000", "tick": "0.01"},
                         {"upToPrice": "10000", "tick": "0.1"}, {"tick": "1"}],
    "arcus_max_order_size": 10000, "arcus_mmf": 0.05,
    "entropy_size_decimals": 2, "min_base_quantity": 0.01, "max_leverage": 10,
}


class FakeMarket:
    """按【真实因果】模拟：仓位只在订单成交后才变，不按固定脚本推进。

    之前用固定脚本推进，Arcus 的仓位在下单之前就变了，
    导致成交确认拿到错误的基线 —— 替身不真实，测出来的结论就不可信。
    """

    def __init__(self, entropy=0.0, arcus=0.0):
        self.entropy = entropy
        self.arcus = arcus

    async def entropy_positions(self):
        return await self.entropy_account()

    async def entropy_account(self):
        return {"withdrawable": "900", "marginSummary": {"accountValue": "1000"},
                "assetPositions": [{"type": "oneWay", "position": {
                    "coin": "io:SNDK", "szi": f"{self.entropy}",
                    "positionValue": f"{abs(self.entropy) * 1000}",
                    "entryPx": "1000", "liquidationPx": "900"}}]}

    async def arcus_account(self):
        return {"equity": "1000", "freeCollateral": "900", "_positions": [
            {"marketId": 26, "marketDisplayName": "SNDK-USD", "size": f"{self.arcus}",
             "averageEntryPrice": "1000", "markPx": "1000", "marginMode": "ISOLATED",
             "marginUsed": "20"}]}


class ScriptedExecutor(Executor):
    """下单后按配置改动 FakeMarket 的仓位，模拟成交/不成交。"""

    def __init__(self, settings, market, *, entropy_fill=None, arcus_fill=None,
                 entropy_ok=True, arcus_ok=True):
        super().__init__(settings, market, dry_run=False)
        self.market_state = market
        self.entropy_ok = entropy_ok
        self.arcus_ok = arcus_ok
        # None = 全额成交；数字 = 实际成交量（0 表示零成交）
        self.entropy_fill = entropy_fill
        self.arcus_fill = arcus_fill
        self.entropy_orders = []
        self.arcus_orders = []

    async def _entropy_ioc(self, market_id, side, quantity, price, decimals, reduce_only=False):
        self.entropy_orders.append((side, quantity, reduce_only))
        if self.entropy_ok:
            filled = quantity if self.entropy_fill is None else self.entropy_fill
            self.market_state.entropy += filled if side == "buy" else -filled
        return LegResult("entropy", self.entropy_ok,
                         raw={"status": "ok", "response": {"type": "order", "data": {
                             "statuses": [{"resting": {"oid": 4242}}]}}},
                         error=None if self.entropy_ok else "拒单")

    async def _arcus_ioc(self, market, side, quantity, price, reduce_only=False):
        # 第一个参数必须是整个市场字典 —— Arcus 下单要 marketId、tick 分段、步长
        assert market["arcus_market_id"] == 26
        self.arcus_orders.append((side, quantity, reduce_only))
        if self.arcus_ok:
            filled = quantity if self.arcus_fill is None else self.arcus_fill
            self.market_state.arcus += filled if side == "buy" else -filled
        return LegResult("arcus", self.arcus_ok,
                         raw={"orderId": "o1"} if self.arcus_ok else {"http": 400},
                         error=None if self.arcus_ok else "Arcus 拒单")


def settings(**kw):
    base = dict(env_path=Path("."), data_dir=Path("."), entropy_address="0x"+"ab"*20,
                arcus_address=ARCUS_ADDRESS, arcus_api_private_key=ARCUS_SEED)
    base.update(kw)
    return Settings(**base)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def open_with(_ignored=None, **kw):
    market = FakeMarket()
    ex = ScriptedExecutor(settings(), market, **kw)
    result = await ex.open_pair(
        market=MARKET, direction="long_entropy_short_arcus", quantity=0.2,
        entropy_price=1000.0, arcus_price=1000.0, slippage_bps=10.0,
        entropy_decimals=(2, 2),
    )
    return ex, result


# ── 没成交：绝不向 Arcus 下单 ─────────────────────────

def test_no_fill_must_not_submit_the_arcus_leg():
    """这正是 2026-09-17 那笔：报单成功、tx_hash 有、仓位没动。
    如果这时候照常向 Arcus 下单，就会留下一条裸空腿。"""
    ex, r = run(open_with(entropy_fill=0.0))
    assert r.ok is False
    assert r.stage == "entropy_not_filled"
    assert ex.arcus_orders == []                      # 一单都没发
    assert r.arcus.submitted is False
    assert "未成交" in r.arcus.error


def test_no_fill_even_though_the_order_response_looked_successful():
    ex, r = run(open_with(entropy_fill=0.0, entropy_ok=True))
    assert r.entropy.ok is True                         # 报单是"成功"的
    assert r.entropy.filled == 0.0                      # 但一张没成
    assert ex.arcus_orders == []


# ── 正常成交 ────────────────────────────────────────────

def test_full_fill_hedges_the_same_quantity():
    ex, r = run(open_with())
    assert r.ok and r.stage == "opened"
    assert len(ex.arcus_orders) == 1
    side, qty, reduce_only = ex.arcus_orders[0]
    assert side == "sell" and qty == pytest.approx(0.2) and not reduce_only


# ── 部分成交：按实际量对冲 ──────────────────────────────

def test_partial_fill_hedges_the_actual_amount_not_the_request():
    """按请求量对冲会多出一截反向敞口。"""
    ex, r = run(open_with(entropy_fill=0.12))
    assert r.ok
    side, qty, _ = ex.arcus_orders[0]
    assert qty == pytest.approx(0.12)                   # 不是 0.2
    assert any("实际成交量" in n for n in r.notes)


def test_tiny_partial_fill_is_still_hedged():
    """1% 的成交也必须对冲 —— 当成「没成交」就会留下裸腿。"""
    ex, r = run(open_with(entropy_fill=0.002))
    assert ex.arcus_orders, "极小成交也必须去对冲"


# ── Arcus 失败：抢救裸腿 ──────────────────────────────

def test_arcus_failure_triggers_rescue_of_the_entropy_leg():
    ex, r = run(open_with(arcus_ok=False))
    assert r.ok is False
    assert r.stage == "arcus_failed_rescued"
    assert r.rescue is not None and r.rescue.ok
    # 抢救单必须是反向 + reduce_only
    side, qty, reduce_only = ex.entropy_orders[-1]
    assert side == "sell" and reduce_only is True
    assert qty == pytest.approx(0.2)


# ── 方向 ────────────────────────────────────────────────

def test_short_entropy_direction_reverses_both_legs():
    market = FakeMarket()
    ex = ScriptedExecutor(settings(), market)
    r = run(ex.open_pair(
        market=MARKET, direction="short_entropy_long_arcus", quantity=0.2,
        entropy_price=1000.0, arcus_price=1000.0, slippage_bps=10.0,
        entropy_decimals=(2, 2),
    ))
    assert r.ok
    assert ex.entropy_orders[0][0] == "sell"
    assert ex.arcus_orders[0][0] == "buy"


# ── 平仓 ────────────────────────────────────────────────

def test_close_uses_reduce_only_on_both_legs():
    """reduce_only 是防止方向算错时反手开一个新仓。"""
    market = FakeMarket(entropy=0.2, arcus=-0.2)
    ex = ScriptedExecutor(settings(), market)
    r = run(ex.close_pair(
        market=MARKET, entropy_size=0.2, arcus_size=-0.2,
        entropy_price=1000.0, arcus_price=1000.0, slippage_bps=10.0,
        entropy_decimals=(2, 2),
    ))
    assert r.ok and r.stage == "closed"
    assert ex.entropy_orders[0] == ("sell", 0.2, True)
    assert ex.arcus_orders[0] == ("buy", 0.2, True)


# ── dry-run ─────────────────────────────────────────────

def test_dry_run_never_touches_the_signers():
    market = FakeMarket()
    ex = Executor(settings(), market, dry_run=True)
    r = run(ex.open_pair(
        market=MARKET, direction="long_entropy_short_arcus", quantity=0.2,
        entropy_price=1000.0, arcus_price=1000.0, slippage_bps=10.0,
        entropy_decimals=(2, 2),
    ))
    assert r.ok and r.dry_run and r.stage == "dry_run"
    assert r.entropy.raw["dry_run"] and r.arcus.raw["dry_run"]


def test_arcus_accepted_but_unfilled_is_treated_as_failure():
    """2026-09-18 发现的漏洞：Arcus 只看 HTTP 返回，从不按仓位确认成交。
    报单成功却没成交时，程序会以为对冲好了，实际留着一条 Entropy 裸腿。"""
    ex, r = run(open_with(arcus_fill=0.0))      # Arcus 接受但零成交（202 之后仓位没动）
    assert r.ok is False
    assert r.stage == "arcus_failed_rescued"
    assert "仓位没有变化" in (r.arcus.error or "")
    # 必须把 Entropy 那条腿抢救掉
    assert r.rescue is not None and r.rescue.ok
    side, qty, reduce_only = ex.entropy_orders[-1]
    assert side == "sell" and reduce_only is True


def test_arcus_fill_is_measured_not_assumed():
    ex, r = run(open_with())
    assert r.ok and r.arcus.filled == pytest.approx(0.2)


# ═══════════════════════════════════════════════════════════
# Arcus 限价档位：按价格分段选 tick，方向朝更激进的一侧取整
# ═══════════════════════════════════════════════════════════

def test_tick_is_chosen_by_price_tier():
    assert ax.choose_tick(MARKET, 999.99) == Decimal("0.01")
    assert ax.choose_tick(MARKET, 1000) == Decimal("0.01")          # upToPrice 含边界
    assert ax.choose_tick(MARKET, 1587.2) == Decimal("0.1")
    assert ax.choose_tick(MARKET, 25000) == Decimal("1")            # 最后一档没有上限
    assert ax.choose_tick({"arcus_tick_size": "0.5"}, 3) == Decimal("0.5")   # 没有分段就用 tickSize


def test_limit_rounds_toward_the_aggressive_side():
    """卖单往下取整，买单往上 —— 四舍五入可能把单子挂到被动一侧，报单成功、零成交。"""
    assert arcus_limit_price(MARKET, 1587.1584528000003, "sell") == pytest.approx(1587.1)
    assert arcus_limit_price(MARKET, 1587.1584528000003, "buy") == pytest.approx(1587.2)
    assert arcus_limit_price(MARKET, 12.3456, "buy") == pytest.approx(12.35)


def test_rounding_never_lands_on_the_passive_side():
    cases = [1588.7472, 999.999, 0.0123456789, 98765.4321, 1.23456789, 2.5001, 9.9999, 45.678]
    for reference in cases:
        buy = arcus_limit_price(MARKET, slippage_limit_price(reference, "buy", 10.0), "buy")
        sell = arcus_limit_price(MARKET, slippage_limit_price(reference, "sell", 10.0), "sell")
        assert buy >= reference, f"{reference}：买单限价 {buy} 跌到参考价之下"
        assert sell <= reference, f"{reference}：卖单限价 {sell} 涨到参考价之上"


def test_price_must_be_finite_positive_and_have_a_side():
    for bad in (0.0, -1.0, float("nan"), float("inf")):
        with pytest.raises(ExchangeError):
            arcus_limit_price(MARKET, bad, "buy")
    with pytest.raises(ExchangeError):
        arcus_limit_price(MARKET, 100.0, "")


def test_quantity_is_floored_to_the_step():
    assert ax.align_arcus_quantity(MARKET, 0.2) == Decimal("0.2")
    assert ax.align_arcus_quantity(MARKET, 0.12399) == Decimal("0.123")   # 只能往下
    assert ax.align_arcus_quantity(MARKET, 0.0004) == 0


def test_step_decimals_only_accepts_powers_of_ten():
    assert ax.step_decimals("0.0000001") == 7
    assert ax.step_decimals("1") == 0
    assert ax.step_decimals("0.5") is None                      # 共用小数位的口径装不下
    assert ax.step_decimals("25") is None


# ═══════════════════════════════════════════════════════════
# 签名：载荷必须和交易所（以及实盘跑过的 arcus-signing.js）逐字节一致
# ═══════════════════════════════════════════════════════════

def test_place_payload_matches_the_documented_layout():
    payload = ax.build_place_payload(
        address="0xABcd" + "0" * 36, account_index=0, client_id="PX1", timestamp=1790000000000000001,
        good_til_us_value=1793456000000000, market_id=26, price_ticks=158710,
        quantity_quantums=200, reduce_only=False, side="SELL", time_in_force="IOC",
    )
    assert payload == (
        '{"ad":"0xabcd' + "0" * 36 + '","ai":0,"c":"px1","ct":1790000000000000001,'
        '"g":1793456000000000000,"m":26,"op":1,"p":158710,"q":200,"r":0,"s":1,"t":2,"v":1}'
    )


def test_seed_hex_key_signs_and_verifies():
    key = ax.load_private_key(ARCUS_SEED)
    pub = ax.public_key_hex(key)
    assert len(pub) == 64
    sig = ax.sign_hex(key, "hello")
    assert len(sig) == 128
    key.public_key().verify(bytes.fromhex(sig), b"hello")        # 不抛异常就是对的


def test_a_mismatched_api_key_refuses_to_trade():
    ex = Executor(settings(arcus_api_key="00" * 32), FakeMarket(), dry_run=False)
    with pytest.raises(ExchangeError, match="不是同一对"):
        ex._get_arcus_key()


def test_the_api_key_is_derived_when_left_empty():
    ex = Executor(settings(), FakeMarket(), dry_run=False)
    _, pub = ex._get_arcus_key()
    assert pub == ax.public_key_hex(ax.load_private_key(ARCUS_SEED))


def test_built_order_is_aligned_signed_and_self_consistent():
    ex = Executor(settings(), FakeMarket(), dry_run=False)
    order = ex.build_arcus_order(MARKET, "sell", 0.2004, 1587.1584528, reduce_only=True)
    body = order["body"]
    assert body["price"] == "1587.1" and body["quantity"] == "0.2"
    assert body["orderSide"] == "SELL" and body["timeInForce"] == "IOC"
    assert body["reduceOnly"] is True and body["marketId"] == 26
    assert body["timestamp"] == order["timestamp"]
    # 载荷里的整数和 body 里的十进制字符串必须是同一个数
    # 签名里的价格整数永远以 tickSize 为单位（分段 tick 只限制能挂哪些价），
    # 和实盘跑过的 arcus-signing.js 一样：1587.1 / 0.01 = 158710
    assert '"p":158710,' in order["payload"]
    assert '"q":200,' in order["payload"]
    assert f'"ct":{order["timestamp"]},' in order["payload"]
    assert f'"g":{int(body["goodTilTime"]) * 1000},' in order["payload"]
    key = ax.load_private_key(ARCUS_SEED)
    key.public_key().verify(bytes.fromhex(order["signature"]), order["payload"].encode())


# ═══════════════════════════════════════════════════════════
# 回执解析：202 看仓位；200 里 IOC_CANCELED 只是「没吃到」
# ═══════════════════════════════════════════════════════════

def test_202_is_accepted_but_the_fill_is_unknown():
    r = ax.parse_order_response(202, {"orderId": "o9", "clientId": "c"}, "c")
    assert r.accepted and r.order_id == "o9" and r.filled is None


def test_200_filled_carries_the_size():
    r = ax.parse_order_response(200, {"orderId": "o9", "status": "FILLED", "filledSize": "0.2"}, "c")
    assert r.accepted and r.filled == pytest.approx(0.2)


def test_ioc_cancel_is_not_a_fill_and_not_a_crash():
    r = ax.parse_order_response(
        200, {"orderId": "o9", "status": "REJECTED", "rejectionReason": "IOC_CANCELED"}, "c")
    assert not r.accepted and "未成交" in r.error


def test_a_400_rejection_keeps_the_venues_reason():
    r = ax.parse_order_response(400, {"error": "bad", "rejectionReason": "UNDERCOLLATERALIZED"}, "c")
    assert not r.accepted and "UNDERCOLLATERALIZED" in r.error


def test_canceled_with_a_partial_fill_is_still_a_fill():
    r = ax.parse_order_response(200, {"orderId": "o9", "status": "CANCELED", "filledSize": "0.05"}, "c")
    assert r.accepted and r.filled == pytest.approx(0.05)


# ═══════════════════════════════════════════════════════════
# 端到端：Arcus 腿走【真实的 _arcus_ioc】，只把 HTTP 换成替身
# ═══════════════════════════════════════════════════════════

class RealArcusLegExecutor(ScriptedExecutor):
    """Entropy 腿仍是脚本替身，Arcus 腿走真实实现。

    回执和仓位变化保持一致 —— 替身不讲因果，测出来的结论就不可信。
    mode:
      "fill202"   202 受理 → 仓位随后变化（最常见）
      "fill200"   200 FILLED
      "ioc"       200 REJECTED/IOC_CANCELED，仓位不动
      "reject"    400 UNDERCOLLATERALIZED
      "lost_fill" 请求超时，但单子其实成交了
      "lost"      请求超时，单子也没到
    """

    def __init__(self, settings_, market, mode, **kw):
        super().__init__(settings_, market, **kw)
        self.mode = mode
        self.posts = []

    async def _arcus_ioc(self, *args, **kwargs):
        return await Executor._arcus_ioc(self, *args, **kwargs)

    async def _arcus_post(self, path, body, timestamp, signature):
        self.posts.append({"path": path, "body": body, "ts": timestamp, "sig": signature})
        qty = float(body.get("quantity") or 0)
        sign = 1 if body.get("orderSide") == "BUY" else -1
        if self.mode in ("fill202", "fill200", "lost_fill"):
            self.market_state.arcus += sign * qty
        if self.mode == "fill202":
            return 202, {"orderId": "o-77", "clientId": body["clientId"]}
        if self.mode == "fill200":
            return 200, {"orderId": "o-77", "status": "FILLED", "filledSize": str(qty)}
        if self.mode == "ioc":
            return 200, {"orderId": "o-78", "status": "REJECTED", "rejectionReason": "IOC_CANCELED"}
        if self.mode == "reject":
            return 400, {"error": "order rejected", "rejectionReason": "UNDERCOLLATERALIZED"}
        raise TimeoutError("read timeout")


def _open_through_real_arcus_leg(mode, arcus_price=1000.0, **kw):
    market = FakeMarket()
    ex = RealArcusLegExecutor(settings(**kw), market, mode)
    result = run(ex.open_pair(
        market=MARKET, direction="long_entropy_short_arcus", quantity=0.2,
        entropy_price=1000.0, arcus_price=arcus_price, slippage_bps=10.0,
        entropy_decimals=(2, 2),
    ))
    return ex, result


@pytest.mark.parametrize("mode", ["fill202", "fill200"])
def test_a_real_fill_opens_the_pair_and_is_measured_by_position(mode):
    ex, r = _open_through_real_arcus_leg(mode)
    assert r.ok is True and r.stage == "opened"
    assert r.arcus.filled == pytest.approx(0.2) and r.arcus.fill_confirmed
    assert r.arcus.order_ref == "o-77"
    assert ex.entropy_orders == [("buy", 0.2, False)]              # 没有抢救单


def test_the_request_that_reaches_the_venue_is_signed_and_on_the_grid():
    ex, _ = _open_through_real_arcus_leg("fill202", arcus_price=1588.7472)
    sent = ex.posts[0]
    assert sent["path"] == "/v1/placeOrder"
    body = sent["body"]
    assert body["orderSide"] == "SELL" and body["price"] == "1587.1"
    assert body["quantity"] == "0.2" and body["reduceOnly"] is False
    assert body["address"] == ARCUS_ADDRESS and body["timestamp"] == sent["ts"]
    # 签名要能用公钥验过（签的是 ordersign 载荷，不是 body）
    payload = ax.build_place_payload(
        address=body["address"], account_index=0, client_id=body["clientId"],
        timestamp=body["timestamp"], good_til_us_value=int(body["goodTilTime"]),
        market_id=26, price_ticks=158710, quantity_quantums=200,
        reduce_only=False, side="SELL", time_in_force="IOC")
    key = ax.load_private_key(ARCUS_SEED)
    key.public_key().verify(bytes.fromhex(sent["sig"]), payload.encode())


@pytest.mark.parametrize("mode,words", [("ioc", "未成交"), ("reject", "UNDERCOLLATERALIZED")])
def test_a_venue_rejection_flows_through_to_the_rescue(mode, words):
    ex, r = _open_through_real_arcus_leg(mode)
    assert r.ok is False and r.stage == "arcus_failed_rescued"
    assert r.arcus.ok is False and words in (r.arcus.error or "")
    side, qty, reduce_only = ex.entropy_orders[-1]
    assert side == "sell" and reduce_only is True and qty == pytest.approx(0.2)


def test_a_timeout_that_actually_filled_is_recognised_by_position():
    """请求超时 ≠ 没下出去。仓位动了就是成交了 —— 这时候去抢救 Entropy，
    反而会把对冲拆散，留下一条 Arcus 裸腿。"""
    ex, r = _open_through_real_arcus_leg("lost_fill")
    assert r.ok is True and r.stage == "opened"
    assert r.arcus.filled == pytest.approx(0.2)
    assert r.arcus.order_ref and r.arcus.order_ref.startswith("cid:")  # 没有 orderId，按 clientId 对账
    assert ex.entropy_orders == [("buy", 0.2, False)]
    assert len(ex.posts) == 1                                          # 绝不重发


def test_a_timeout_that_did_not_fill_rescues_the_entropy_leg():
    ex, r = _open_through_real_arcus_leg("lost")
    assert r.ok is False and r.stage == "arcus_failed_rescued"
    assert "结果未知" in (r.arcus.error or "") or "中断" in (r.arcus.error or "")
    assert ex.entropy_orders[-1][2] is True
    assert len(ex.posts) == 1


def test_a_bad_arcus_key_aborts_before_the_entropy_leg_is_placed():
    """签不出 Arcus 的单，就不能先去 Entropy 开一条注定对冲不上的腿。"""
    ex, r = _open_through_real_arcus_leg("fill202", arcus_api_private_key="zz")
    assert r.ok is False and r.stage == "arcus_order_invalid"
    assert ex.entropy_orders == [] and ex.posts == []


def test_an_order_below_the_step_aborts_before_the_entropy_leg():
    market = FakeMarket()
    ex = RealArcusLegExecutor(settings(), market, "fill202")
    r = run(ex.open_pair(
        market=MARKET, direction="long_entropy_short_arcus", quantity=0.0004,
        entropy_price=1000.0, arcus_price=1000.0, slippage_bps=10.0, entropy_decimals=(4, 2),
    ))
    assert r.stage == "arcus_order_invalid" and ex.entropy_orders == []


def test_an_unusable_arcus_price_aborts_before_any_order_is_sent():
    """_run_cycle 没有 try/except —— 异常穿出去会打断整轮所有币种的任务。
    而且必须在【下第一单之前】退出，否则就是一条裸腿。"""
    market = FakeMarket()
    ex = ScriptedExecutor(settings(), market)
    r = run(ex.open_pair(
        market=MARKET, direction="long_entropy_short_arcus", quantity=0.2,
        entropy_price=1000.0, arcus_price=float("nan"), slippage_bps=10.0,
        entropy_decimals=(2, 2),
    ))
    assert r.ok is False and r.stage == "bad_arcus_price"
    assert ex.entropy_orders == [] and ex.arcus_orders == []


def test_quotes_record_the_price_that_was_actually_submitted():
    _, r = run(open_with())
    assert r.quotes["arcus_limit"] == arcus_limit_price(
        MARKET, r.quotes["arcus_limit_raw"], r.quotes["arcus_side"])


def test_close_and_orphan_paths_pass_the_whole_market():
    """开仓、平仓、孤腿抢救三条路都要把市场字典传进去 —— 替身里有断言。"""
    ex2 = ScriptedExecutor(settings(), FakeMarket(entropy=0.2, arcus=-0.2))
    run(ex2.close_pair(market=MARKET, entropy_size=0.2, arcus_size=-0.2,
                       entropy_price=1000.0, arcus_price=1000.0, slippage_bps=10.0,
                       entropy_decimals=(2, 2)))
    assert ex2.arcus_orders == [("buy", 0.2, True)]
    ex3 = ScriptedExecutor(settings(), FakeMarket(arcus=-0.2))
    run(ex3.flatten_orphan(market=MARKET, venue="arcus", size=-0.2,
                           price=1000.0, slippage_bps=10.0, entropy_decimals=(2, 2)))
    assert ex3.arcus_orders == [("buy", 0.2, True)]


# ═══════════════════════════════════════════════════════════
# 平仓也只认仓位变化（上一个版本 2026-09-19 的教训）
# ═══════════════════════════════════════════════════════════

def close_with(market, **kw):
    ex = ScriptedExecutor(settings(), market, **kw)
    r = run(ex.close_pair(
        market=MARKET, entropy_size=market.entropy, arcus_size=market.arcus,
        entropy_price=1000.0, arcus_price=1000.0, slippage_bps=10.0,
        entropy_decimals=(2, 2),
    ))
    return ex, r


def test_close_measures_both_legs_by_position():
    ex, r = close_with(FakeMarket(entropy=0.2, arcus=-0.2))
    assert r.ok and r.stage == "closed"
    assert r.entropy.filled == pytest.approx(0.2) and r.entropy.fill_confirmed
    assert r.arcus.filled == pytest.approx(0.2) and r.arcus.fill_confirmed


def test_close_order_accepted_but_entropy_did_not_move_is_not_closed():
    ex, r = close_with(FakeMarket(entropy=0.2, arcus=-0.2), entropy_fill=0.0)
    assert r.ok is False and r.stage == "close_partial"
    assert "Entropy" in r.reason and "Arcus" not in r.reason
    assert r.entropy.filled == 0.0 and r.entropy.fill_confirmed
    assert r.arcus.filled == pytest.approx(0.2)


def test_close_arcus_ioc_that_did_not_fill_is_not_closed():
    ex, r = close_with(FakeMarket(entropy=0.2, arcus=-0.2), arcus_fill=0.0)
    assert r.ok is False and "Arcus" in r.reason


class BlindMarket(FakeMarket):
    """Entropy 账户接口读不到。"""

    async def entropy_positions(self):
        return await self.entropy_account()

    async def entropy_account(self):
        raise RuntimeError("Entropy /account 超时")


def test_close_with_unreadable_positions_is_not_assumed_flat():
    ex, r = close_with(BlindMarket(entropy=0.2, arcus=-0.2))
    assert r.ok is False and r.stage == "close_partial"
    assert r.entropy.fill_confirmed is False


def test_close_skips_a_leg_that_is_already_flat():
    ex, r = close_with(FakeMarket(entropy=0.0, arcus=-0.2))
    assert ex.entropy_orders == []
    assert r.entropy.submitted is False
    assert r.ok and r.stage == "closed"
    assert [a for a, _ in r.ledger] == ["close"]


# ── 账本：每一条真正发出去的腿都要带着方向、数量、价格和订单号 ──

def test_open_ledger_carries_side_quantity_and_reference_price():
    ex, r = run(open_with())
    actions = [(a, leg.venue) for a, leg in r.ledger]
    assert actions == [("open", "entropy"), ("open", "arcus")]
    entropy, arcus = (leg for _, leg in r.ledger)
    assert entropy.side == "buy" and entropy.requested == pytest.approx(0.2)
    assert entropy.filled == pytest.approx(0.2) and entropy.fill_confirmed
    assert entropy.price == pytest.approx(1000.0) and entropy.price_is_estimate
    assert arcus.side == "sell" and arcus.order_ref == "o1"


def test_rescue_is_booked_as_its_own_leg():
    ex, r = run(open_with(arcus_ok=False))
    assert [a for a, _ in r.ledger] == ["open", "rescue"]
    rescue = r.ledger[-1][1]
    assert rescue.side == "sell" and rescue.requested == pytest.approx(0.2)


def test_a_400_rejected_arcus_order_is_not_booked():
    """被当场拒掉的单没有订单号、不可能有成交 —— 不进账本。"""
    ex, r = _open_through_real_arcus_leg("reject")
    assert [(a, leg.venue) for a, leg in r.ledger] == [("open", "entropy"), ("rescue", "entropy")]
    assert r.arcus.filled == 0.0


def test_an_ioc_cancel_with_an_order_id_is_booked_for_reconciliation():
    ex, r = _open_through_real_arcus_leg("ioc")
    venues = [(a, leg.venue) for a, leg in r.ledger]
    assert ("open", "arcus") in venues
    assert r.arcus.order_ref == "o-78"


def test_entropy_not_filled_books_only_the_entropy_attempt_at_zero():
    ex, r = run(open_with(entropy_fill=0.0))
    assert [(a, leg.venue) for a, leg in r.ledger] == [("open", "entropy")]
    assert r.ledger[0][1].filled == 0.0 and r.ledger[0][1].fill_confirmed


def test_dry_run_books_simulated_fills_at_the_reference_price():
    ex = Executor(settings(), FakeMarket(), dry_run=True)
    r = run(ex.open_pair(
        market=MARKET, direction="long_entropy_short_arcus", quantity=0.2,
        entropy_price=1001.0, arcus_price=999.0, slippage_bps=10.0,
        entropy_decimals=(2, 2),
    ))
    legs = {leg.venue: leg for _, leg in r.ledger}
    assert legs["entropy"].filled == pytest.approx(0.2) and legs["entropy"].price == 1001.0
    assert legs["arcus"].filled == pytest.approx(0.2) and legs["arcus"].price == 999.0


# ═══════════════════════════════════════════════════════════
# 开仓前设杠杆
# ═══════════════════════════════════════════════════════════

class FakeEntropyExchange:
    """Hyperliquid SDK Exchange 的替身（同步方法，程序会丢进线程里调）。"""

    def __init__(self, leverage_reply=None, order_reply=None, order_error=None):
        self.leverage_reply = leverage_reply or {"status": "ok", "response": {"type": "default"}}
        self.order_reply = order_reply
        self.order_error = order_error
        self.calls = []
        self.orders = []

    def update_leverage(self, leverage, name, is_cross=True):
        self.calls.append((leverage, name, is_cross))
        return self.leverage_reply

    def order(self, name, is_buy, sz, limit_px, order_type, reduce_only=False):
        self.orders.append((name, is_buy, sz, limit_px, order_type, reduce_only))
        if self.order_error is not None:
            raise self.order_error
        return self.order_reply


class LeverageExecutor(Executor):
    def __init__(self, response=(200, {"status": "APPLIED"}), signer=None):
        super().__init__(settings(), FakeMarket(), dry_run=False)
        self.response = response
        self.posts = []
        self._entropy_exchange = signer or FakeEntropyExchange()

    async def _arcus_post(self, path, body, timestamp, signature):
        self.posts.append((path, body, timestamp, signature))
        return self.response


def test_set_leverage_sets_arcus_cross_with_a_legacy_signature():
    ex = LeverageExecutor()
    ok, error = run(ex.set_leverage(MARKET, entropy_leverage=6, arcus_leverage=5))
    assert ok and error is None
    path, body, ts, sig = ex.posts[0]
    assert path == "/v1/setLeverage"
    assert body == {"address": ARCUS_ADDRESS, "accountIndex": 0, "marketId": 26,
                    "leverage": 5, "isolated": False}
    # 旧式签名：ts + "setLeverage" + 键排序的紧凑 JSON
    message = (f'{ts}setLeverage{{"accountIndex":0,"address":"{ARCUS_ADDRESS}",'
               f'"isolated":false,"leverage":5,"marketId":26}}')
    ax.load_private_key(ARCUS_SEED).public_key().verify(bytes.fromhex(sig), message.encode())
    assert ex._entropy_exchange.calls == [(6, "io:SNDK", False)]       # Entropy 逐仓


def test_set_leverage_reports_a_rejection_from_either_side():
    ex = LeverageExecutor(response=(422, {"status": "REJECTED", "rejectReason": "INVALID_LEVERAGE"}))
    ok, error = run(ex.set_leverage(MARKET, entropy_leverage=6, arcus_leverage=50))
    assert not ok and "Arcus" in error and "INVALID_LEVERAGE" in error
    assert ex._entropy_exchange.calls == []                            # 第一边失败就不动第二边

    ex = LeverageExecutor(signer=FakeEntropyExchange(
        leverage_reply={"status": "err", "response": "max leverage 3"}))
    ok, error = run(ex.set_leverage(MARKET, entropy_leverage=6, arcus_leverage=6))
    assert not ok and "Entropy" in error and "max leverage 3" in error


def test_an_acknowledged_leverage_change_is_confirmed_before_use():
    class Confirming(LeverageExecutor):
        pass
    ex = Confirming(response=(202, {"status": "ACK"}))

    async def fake_request(venue, method, url, **kw):
        return {"leverages": [{"marketId": 26, "leverage": 5, "isolated": False,
                               "marginMode": "CROSS"}]}
    ex.market._request = fake_request
    ok, error = run(ex.set_leverage(MARKET, entropy_leverage=6, arcus_leverage=5))
    assert ok, error

    ex2 = Confirming(response=(202, {"status": "ACK"}))

    async def never(venue, method, url, **kw):
        return {"leverages": [{"marketId": 26, "leverage": 5, "isolated": True,
                               "marginMode": "ISOLATED"}]}
    ex2.market._request = never
    ok, error = run(ex2.set_leverage(MARKET, entropy_leverage=6, arcus_leverage=5))
    assert not ok and "确认超时" in error


def test_dry_run_never_touches_leverage():
    ex = Executor(settings(), FakeMarket(), dry_run=True)
    assert run(ex.set_leverage(MARKET, entropy_leverage=6, arcus_leverage=6)) == (True, None)


# ── Entropy 下单：回执解析、连不上、走代理 ────────────────────

def _receipt(*statuses):
    return {"status": "ok", "response": {"type": "order", "data": {"statuses": list(statuses)}}}


def _live_ioc(exchange, **kw):
    ex = Executor(settings(), FakeMarket(), dry_run=False)
    ex._entropy_exchange = exchange
    args = dict(symbol="io:SNDK", side="buy", quantity=0.5, price=1000.04, decimals=(3, 2))
    args.update(kw)
    return run(ex._entropy_ioc(args["symbol"], args["side"], args["quantity"], args["price"],
                               args["decimals"])), exchange


def test_entropy_ioc_sends_an_aligned_ioc_and_reads_the_receipt():
    leg, exch = _live_ioc(FakeEntropyExchange(order_reply=_receipt(
        {"filled": {"totalSz": "0.5", "avgPx": "1000.1", "oid": 77}})))
    name, is_buy, sz, px, order_type, reduce_only = exch.orders[0]
    assert name == "io:SNDK" and is_buy and sz == 0.5 and not reduce_only
    assert order_type == {"limit": {"tif": "Ioc"}}
    assert px == pytest.approx(1000.1)            # 5 位有效数字，买单向上取整
    assert leg.ok and leg.receipt_fill and leg.filled == pytest.approx(0.5)
    assert leg.price == pytest.approx(1000.1) and leg.price_is_estimate is False
    assert leg.order_ref == "77"


def test_an_ok_envelope_with_an_error_status_is_a_rejection_not_a_fill():
    leg, _ = _live_ioc(FakeEntropyExchange(order_reply=_receipt({"error": "Order has invalid price."})))
    assert not leg.ok and leg.error == "Order has invalid price."
    assert leg.receipt_fill and leg.filled == 0          # 回执是定论：0 成交


def test_entropy_price_grid_rounds_toward_the_aggressive_side():
    assert execmod.round_entropy_price(1587.1584528, 2, "buy") == pytest.approx(1587.2)
    assert execmod.round_entropy_price(1587.1584528, 2, "sell") == pytest.approx(1587.1)
    # 便宜币 + 大 szDecimals：小数位那条更粗（6 - 5 = 1 位）
    assert execmod.round_entropy_price(2.537, 5, "buy") == pytest.approx(2.6)


def test_a_entropy_connect_failure_is_a_failed_leg_not_an_exception():
    import requests
    leg, _ = _live_ioc(FakeEntropyExchange(order_error=requests.exceptions.ConnectionError(
        "HTTPSConnectionPool: Max retries exceeded (Caused by NewConnectionError('Failed to establish a new connection'))")))
    assert leg.ok is False and leg.submitted is False and not leg.uncertain
    assert "没发出去" in leg.error


def test_an_unknown_entropy_error_is_marked_uncertain():
    leg, _ = _live_ioc(FakeEntropyExchange(order_error=TimeoutError("read timeout")))
    assert leg.ok is False and leg.submitted is True and leg.uncertain


def test_entropy_proxies_use_remote_dns_for_socks():
    assert execmod.entropy_proxies(None) is None
    assert execmod.entropy_proxies("http://1.2.3.4:8080") == {
        "http": "http://1.2.3.4:8080", "https": "http://1.2.3.4:8080"}
    assert execmod.entropy_proxies("socks5://u:p@1.2.3.4:1080")["https"] == \
        "socks5h://u:p@1.2.3.4:1080"


def test_the_sdk_sessions_get_the_proxy():
    import requests

    class Holder:
        def __init__(self):
            self.session = requests.Session()
    exch = Holder()
    exch.info = Holder()
    execmod.apply_entropy_proxy(exch, {"http": "http://h:1", "https": "http://h:1"})
    assert exch.session.proxies["https"] == "http://h:1"
    assert exch.info.session.proxies["https"] == "http://h:1"
    assert exch.session.trust_env is False


def test_the_sdk_is_built_behind_the_proxy_from_the_first_request(monkeypatch):
    """SDK 构造时就会请求 /info —— 那一次也必须走代理。"""
    import sys
    import types
    import requests
    seen = {}

    class Exchange:
        def __init__(self, wallet, base_url, **kw):
            self.session = requests.Session()             # 构造期间新建的 session
            seen["proxies_during_init"] = dict(self.session.proxies)
            seen["kw"] = kw
            self.info = types.SimpleNamespace(session=requests.Session())
            self.wallet = wallet
    hl = types.ModuleType("hyperliquid")
    hl_ex = types.ModuleType("hyperliquid.exchange")
    hl_ex.Exchange = Exchange
    eth = types.ModuleType("eth_account")
    eth.Account = types.SimpleNamespace(from_key=lambda k: types.SimpleNamespace(address="0xagent"))
    monkeypatch.setitem(sys.modules, "hyperliquid", hl)
    monkeypatch.setitem(sys.modules, "hyperliquid.exchange", hl_ex)
    monkeypatch.setitem(sys.modules, "eth_account", eth)
    st = settings(entropy_private_key="0x" + "12" * 32, entropy_proxy="http://9.9.9.9:3128")
    exch = execmod.build_entropy_exchange(st)
    assert seen["proxies_during_init"]["https"] == "http://9.9.9.9:3128"
    assert seen["kw"]["perp_dexs"] == ["io"]
    assert exch.info.session.proxies["https"] == "http://9.9.9.9:3128"
    # 构造完就恢复原样：别的 requests 调用不受影响
    assert requests.Session().proxies == {}


def test_a_missing_private_key_is_a_clear_error():
    with pytest.raises(ExchangeError, match="HYPERLIQUID_PRIVATE_KEY"):
        execmod.build_entropy_exchange(settings())


# ── Hyperliquid 回执说成交了，仓位接口还没刷新 ─────────────────

class LaggingReceiptExecutor(ScriptedExecutor):
    """回执给出成交量，但仓位接口慢半拍、还没反映出来。"""

    def __init__(self, *a, receipt_qty, **kw):
        super().__init__(*a, **kw)
        self.receipt_qty = receipt_qty

    async def _entropy_ioc(self, market_id, side, quantity, price, decimals, reduce_only=False):
        self.entropy_orders.append((side, quantity, reduce_only))
        got = self.receipt_qty
        return LegResult("entropy", got > 0, raw={"status": "ok"}, filled=got,
                         fill_confirmed=got > 0, receipt_fill=True, side=side,
                         requested=quantity, order_ref="31337" if got else None,
                         error=None if got else "Order could not immediately match")


def _open_lagging(receipt_qty):
    market = FakeMarket()
    ex = LaggingReceiptExecutor(settings(), market, receipt_qty=receipt_qty)
    result = run(ex.open_pair(
        market=MARKET, direction="long_entropy_short_arcus", quantity=0.2,
        entropy_price=1000.0, arcus_price=1000.0, slippage_bps=10.0, entropy_decimals=(2, 2)))
    return ex, result


def test_a_receipt_fill_is_hedged_even_before_the_position_shows_it():
    ex, r = _open_lagging(0.2)
    assert ex.arcus_orders and ex.arcus_orders[0][:2] == ("sell", 0.2)   # 没有留下 Entropy 裸腿
    assert r.entropy.filled == pytest.approx(0.2) and r.entropy.fill_confirmed


def test_a_partial_receipt_hedges_only_what_filled():
    ex, r = _open_lagging(0.13)
    assert ex.arcus_orders[0][:2] == ("sell", pytest.approx(0.13))


def test_a_receipt_with_no_fill_never_touches_arcus():
    ex, r = _open_lagging(0.0)
    assert r.stage == "entropy_not_filled" and ex.arcus_orders == []
    assert r.ledger == [] or all(leg.venue == "entropy" for _, leg in r.ledger)
