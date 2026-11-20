"""Arcus 市场列表的解析与两所配对（不联网：把 _request 换成替身）。"""
import asyncio
from pathlib import Path

import pytest

from parallax_hedge.books import aggregate_levels
from parallax_hedge.config import Settings, normalize_proxy
from parallax_hedge.exchanges import (
    ARCUS_FUNDING_INTERVAL_SEC,
    MarketClient,
    arcus_market_fields,
)


def arcus_row(base, mid, **kw):
    row = {
        "marketDisplayName": f"{base}-USD", "marketId": mid, "status": "ONLINE",
        "type": "PERPETUAL", "baseAsset": base, "quoteAsset": "USD",
        "tickSize": "0.01", "stepSize": "0.001", "minOrderSize": "0.01",
        "minOrderNotional": "5", "maxOrderSize": "10000",
        "markPrice": "100", "fundingRate": "0.0000125", "nextFundingRate": "0.00002",
        "initialMarginFraction": "0.1", "maintenanceMarginFraction": "0.05",
        "offHoursInitialMarginFraction": "0.15", "isOutsideRth": False,
        "category": "CRYPTO",
    }
    row.update(kw)
    return row


def entropy_row(symbol, **kw):
    """metaAndAssetCtxs(dex="io") 的 universe 一行。"""
    row = {"name": f"io:{symbol}", "szDecimals": 2, "maxLeverage": 10, "onlyIsolated": True}
    row.update(kw)
    return row


def test_market_fields_take_the_current_session_margin():
    m = arcus_market_fields(arcus_row("SOL", 3))
    assert m["max_leverage"] == 10 and m["arcus_mmf"] == 0.05
    assert m["arcus_size_decimals"] == 3
    off = arcus_market_fields(arcus_row("NVDA", 21, isOutsideRth=True, category="EQUITIES"))
    assert off["max_leverage"] == 6            # 1 / 0.15，休市时段上限降低
    assert off["arcus_mmf"] == 0.05            # 维持保证金率不变
    assert off["arcus_off_hours"] is True


def test_market_fields_skip_what_cannot_be_traded():
    assert arcus_market_fields(arcus_row("X", 1, status="OFFLINE")) is None
    assert arcus_market_fields(arcus_row("X", 1, type="SPOT")) is None
    assert arcus_market_fields(arcus_row("X", 1, stepSize="0.5")) is None   # 非 10 的幂


class Client(MarketClient):
    def __init__(self, arcus_rows, entropy_rows):
        super().__init__(Settings(env_path=Path("."), data_dir=Path(".")))
        self.arcus_rows = arcus_rows
        self.entropy_rows = entropy_rows
        self.calls = []

    async def _request(self, venue, method, url, *, label, **kw):
        self.calls.append(label)
        if label == "/v1/markets":
            return {"markets": self.arcus_rows}
        if label == "info:metaAndAssetCtxs":
            assert kw["json"] == {"type": "metaAndAssetCtxs", "dex": "io"}
            ctxs = [{"funding": "0.0000125", "markPx": "100.5"} for _ in self.entropy_rows]
            return [{"universe": self.entropy_rows}, ctxs]
        if label == "info:l2Book":
            assert kw["json"] == {"type": "l2Book", "coin": "io:SOL"}
            return {"coin": "io:SOL", "levels": [
                [{"px": "100.1", "sz": "2", "n": 1}, {"px": "100.0", "sz": "3", "n": 2}],
                [{"px": "100.2", "sz": "1.5", "n": 1}]]}
        raise AssertionError(label)


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_common_markets_match_by_base_asset_and_take_the_stricter_limits():
    client = Client(
        [arcus_row("SOL", 3), arcus_row("BTC", 1, stepSize="0.0001"), arcus_row("ONLYARC", 50)],
        [entropy_row("XYZ"), entropy_row("BTC", szDecimals=5, maxLeverage=20),
         entropy_row("SOL"), entropy_row("ONLYENT")],
    )
    markets = {m["asset"]: m for m in run(client.common_markets())}
    assert set(markets) == {"BTC", "SOL"}
    sol = markets["SOL"]
    assert sol["arcus_symbol"] == "SOL-USD" and sol["arcus_market_id"] == 3
    assert sol["entropy_symbol"] == "io:SOL"             # 下单 / 盘口都要带 io: 前缀
    assert sol["entropy_market_index"] == 2              # universe 里的下标
    assert sol["quantity_decimals"] == 2                 # min(Entropy 2, Arcus 3)
    assert sol["min_base_quantity"] == pytest.approx(0.01)
    assert sol["min_notional"] == pytest.approx(10)      # max(Arcus 5, Entropy 10)
    assert sol["entropy_max_leverage"] == 10
    assert sol["entropy_mmf"] == pytest.approx(0.05)     # 1 / (2 × 最大杠杆)
    assert markets["BTC"]["quantity_decimals"] == 4      # min(Entropy 5, Arcus 4)
    assert markets["BTC"]["entropy_size_decimals"] == 5


def test_inactive_entropy_markets_are_not_matched():
    client = Client([arcus_row("SOL", 3)], [entropy_row("SOL", isDelisted=True)])
    with pytest.raises(Exception):
        run(client.common_markets())


def test_arcus_funding_is_hourly_and_prefers_the_prediction():
    client = Client([arcus_row("SOL", 3)], [])
    rows, marks = run(client.arcus_funding())
    r = rows["SOL-USD"]
    assert r.interval_sec == ARCUS_FUNDING_INTERVAL_SEC == 3600
    assert r.rate == pytest.approx(0.0000125) and r.effective_rate == pytest.approx(0.00002)
    assert r.bps_per_hour == pytest.approx(0.2)
    assert marks["SOL-USD"] == 100.0


def test_the_markets_endpoint_is_hit_once_per_round():
    """/v1/markets 一次 20 权重，共有币种和费率同一轮只打一次。"""
    client = Client([arcus_row("SOL", 3)], [entropy_row("SOL")])

    async def both():
        await client.common_markets(force=True)
        await client.arcus_funding()
    run(both())
    assert client.calls.count("/v1/markets") == 1


def test_arcus_book_rows_can_be_pairs_or_objects():
    levels = aggregate_levels([["100.5", "2"], {"price": "100.5", "size": "1"}, ["99", "0"]],
                              descending=True)
    assert [(l.price, l.size) for l in levels] == [(100.5, 3.0)]


def test_proxy_shorthands_are_normalised():
    assert normalize_proxy("1.2.3.4:1080:user:p@ss") == "socks5://user:p%40ss@1.2.3.4:1080"
    assert normalize_proxy("1.2.3.4:8080") == "http://1.2.3.4:8080"
    assert normalize_proxy("socks5://a:b@h:1") == "socks5://a:b@h:1"
    assert normalize_proxy("  ") == ""
    s = Settings(env_path=Path("."), data_dir=Path("."), arcus_proxy="1.2.3.4:1080:u:p",
                 global_proxy="http://9.9.9.9:1")
    assert s.proxy_for("arcus").startswith("socks5://")
    assert s.proxy_for("entropy") == "http://9.9.9.9:1"
    assert s.proxy_label("arcus") == "独立代理 1.*.*.4"


def test_entropy_funding_is_hourly_and_keyed_by_the_io_index():
    client = Client([], [entropy_row("XYZ"), entropy_row("SOL")])
    rows = run(client.entropy_funding())
    assert set(rows) == {0, 1}
    assert rows[1].symbol == "SOL" and rows[1].raw_symbol == "io:SOL"
    assert rows[1].interval_sec == 3600
    assert rows[1].bps_per_hour == pytest.approx(0.125)


def test_entropy_book_reads_px_sz_levels():
    client = Client([], [entropy_row("SOL")])
    book = run(client.entropy_book(0, "io:SOL"))
    assert book.best_bid == pytest.approx(100.1) and book.best_ask == pytest.approx(100.2)
    assert [l.size for l in book.bids] == [2.0, 3.0]


def test_entropy_market_details_give_the_mmf_as_a_fraction():
    client = Client([], [entropy_row("SOL", maxLeverage=20)])
    d = run(client.entropy_market_details(0))
    assert d["max_leverage"] == 20
    assert d["maintenance_margin_fraction"] == pytest.approx(0.025)
    assert d["only_isolated"] is True
