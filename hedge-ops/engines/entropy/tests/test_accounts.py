"""首页余额的口径。数字要和交易所页面上看到的对得上。"""
import pytest

from parallax_hedge.accounts import combine_balances, arcus_balance, entropy_balance


def entropy_payload():
    # io 子 dex 的 clearinghouseState（普通账户）
    return {
        "marginSummary": {"accountValue": "456.95", "totalMarginUsed": "100.17"},
        "withdrawable": "356.78",
        "assetPositions": [
            {"type": "oneWay", "position": {"coin": "io:OPENAI", "szi": "0.1260",
                                            "unrealizedPnl": "-0.05", "marginUsed": "100.17"}},
            {"type": "oneWay", "position": {"coin": "io:SNDK", "szi": "0", "unrealizedPnl": "0"}},
        ],
    }


def test_entropy_equity_available_and_unrealized():
    b = entropy_balance(entropy_payload())
    assert b["equity"] == pytest.approx(456.95)
    assert b["available"] == pytest.approx(356.78)
    assert b["unrealized_pnl"] == pytest.approx(-0.05)
    assert b["open_positions"] == 1                      # 数量 0 的空位不算持仓
    assert b["mode"] == "standard"


def test_entropy_unified_account_reads_spot_usdc_without_double_counting_margin():
    """统一账户：per-dex withdrawable 合法地是 0，真正的抵押品在现货 USDC 里。
    例：total 500.00，两个逐仓仓位保证金共 250.00，hold 已经包含它 —— 不能再扣一遍。"""
    payload = entropy_payload()
    payload["withdrawable"] = "0"
    payload["marginSummary"]["totalMarginUsed"] = "250.00"
    payload["_abstraction"] = "unifiedAccount"
    payload["_spot_state"] = {"balances": [{"coin": "USDC", "total": "500.00", "hold": "250.00"}]}
    b = entropy_balance(payload)
    assert b["equity"] == pytest.approx(500.00)
    assert b["available"] == pytest.approx(500.00 - 250.00)
    assert b["mode"] == "unifiedAccount"
    assert entropy_balance(None) is None


def arcus_payload():
    """/v1/account + /v1/positions 合并后的快照（MarketClient.arcus_account 的输出形状）。"""
    return {
        "equity": "412.50", "freeCollateral": "300.25", "netQuoteBalance": "520.0",
        "_positions": [
            {"marketId": 26, "marketDisplayName": "SNDK-USD", "side": "SHORT",
             "size": "-0.5", "averageEntryPrice": "200", "markPx": "198",
             "marginMode": "ISOLATED", "marginUsed": "20"},
            {"marketId": 1, "marketDisplayName": "BTC-USD", "side": "LONG",
             "size": "0", "averageEntryPrice": "0", "markPx": "0"},
        ],
    }


def test_arcus_equity_is_equity_and_available_is_free_collateral():
    b = arcus_balance(arcus_payload())
    assert b["equity"] == pytest.approx(412.50)
    assert b["available"] == pytest.approx(300.25)
    assert b["open_positions"] == 1                      # 数量 0 的不算持仓
    # 空 0.5，200 开、现价 198：赚 1
    assert b["unrealized_pnl"] == pytest.approx(1.0)
    assert b["mode"] == "ISOLATED"


def test_arcus_short_written_as_positive_size_with_side_short():
    payload = arcus_payload()
    payload["_positions"][0]["size"] = "0.5"            # 实测见过的写法
    assert arcus_balance(payload)["unrealized_pnl"] == pytest.approx(1.0)


def test_arcus_empty_account_404_reads_as_zero():
    b = arcus_balance({"equity": "0", "freeCollateral": "0", "_positions": [], "_empty": True})
    assert b["equity"] == 0 and b["available"] == 0 and b["open_positions"] == 0


def test_available_is_never_negative():
    payload = arcus_payload()
    payload["freeCollateral"] = "-5"
    assert arcus_balance(payload)["available"] == 0.0


def test_no_total_when_either_side_is_missing():
    entropy = entropy_balance(entropy_payload())
    arcus = arcus_balance(arcus_payload())
    total = combine_balances(entropy, arcus)
    assert total["equity"] == pytest.approx(456.95 + 412.50)
    assert total["available"] == pytest.approx(356.78 + 300.25)
    assert combine_balances(entropy, None) is None
    assert combine_balances(None, arcus) is None
