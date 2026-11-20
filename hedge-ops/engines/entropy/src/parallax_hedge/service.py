"""把两个所的费率拼成面板要的快照。

第一步只读：不下单、不建仓，目的是让人先用肉眼确认
「费率数字对不对、方向判断对不对」—— 单位一旦解析错，这里就能看出来。
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

from .accounts import combine_balances, arcus_balance, entropy_balance
from .config import Settings
from .exchanges import ExchangeError, MarketClient
from .funding import LastGoodCache, choose_direction, detect_period_anomaly
from .positions import (
    HedgeHealth,
    parse_arcus_position,
    parse_entropy_position,
    with_mark,
)

# 往返一轮 4 条腿的参考磨损（bps），只作面板上「回本小时」的默认假设：
#   Arcus 吃单费 2.25 bps × 2 = 4.5；Entropy 吃单费实测约 0.86 bps × 2 ≈ 1.7
#   （SNDK 实测）；再加两所各自的半价差 × 2。
# 各币种差异很大，面板上可以改；明确标注这是假设值，不是实测。
DEFAULT_ROUND_TRIP_COST_BPS = 10.0

@dataclass
class VenueStatus:
    ok: bool
    proxy: str
    error: str | None = None
    age_seconds: float = 0.0
    stale: bool = False


class FundingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = MarketClient(settings)
        self.cache = LastGoodCache()
        self._snapshot: dict[str, Any] = {"ready": False, "rows": []}
        self._lock = asyncio.Lock()
        self._requested_refresh: asyncio.Task | None = None

    async def aclose(self) -> None:
        if self._requested_refresh is not None:
            self._requested_refresh.cancel()
            await asyncio.gather(self._requested_refresh, return_exceptions=True)
        await self.client.aclose()

    @property
    def snapshot(self) -> dict[str, Any]:
        return self._snapshot

    @property
    def refreshing(self) -> bool:
        return self._lock.locked() or (self._requested_refresh is not None
                                      and not self._requested_refresh.done())

    def request_refresh(self) -> bool:
        """Schedule a display refresh without joining the trading refresh queue.

        Explicit engine refreshes still serialize and perform a new read: after
        an order, trading checks must never reuse an earlier in-flight account
        snapshot. Browser polling only needs the latest completed snapshot.
        """
        if self._lock.locked() or (self._requested_refresh is not None
                                   and not self._requested_refresh.done()):
            return False

        async def requested():
            if not self._lock.locked():
                await self.refresh()

        self._requested_refresh = asyncio.create_task(requested())
        self._requested_refresh.add_done_callback(
            lambda task: None if task.cancelled() else task.exception())
        return True

    async def refresh(self, *, round_trip_cost_bps: float | None = None) -> dict[str, Any]:
        async with self._lock:
            return await self._refresh(round_trip_cost_bps)

    async def _refresh(self, round_trip_cost_bps: float | None) -> dict[str, Any]:
        cost = (
            DEFAULT_ROUND_TRIP_COST_BPS
            if round_trip_cost_bps is None
            else float(round_trip_cost_bps)
        )
        stale_max = self.settings.funding_stale_max_seconds

        async def bounded(function):
            try:
                async with asyncio.timeout(min(30, max(1, self.settings.funding_timeout_seconds))):
                    return await function()
            except Exception as exc:
                return ExchangeError(str(exc) or '只读请求超时，稍后重试')

        (
            markets_res,
            arcus_res,
            entropy_res,
            arcus_acct_res,
            entropy_acct_res,
        ) = await asyncio.gather(
            bounded(self.client.common_markets),
            bounded(self.client.arcus_funding),
            bounded(self.client.entropy_funding),
            bounded(self.client.arcus_account),
            bounded(self.client.entropy_account),
            return_exceptions=True,
        )
        # arcus_funding 同时给出标记价（同一个 /v1/markets 接口）
        arcus_marks: dict[str, float] = {}
        if not isinstance(arcus_res, Exception):
            arcus_res, arcus_marks = arcus_res

        status: dict[str, VenueStatus] = {}

        # Account reads remain valid even if an unrelated market request fails.
        arcus_acct = None if isinstance(arcus_acct_res, Exception) else arcus_acct_res
        entropy_acct = None if isinstance(entropy_acct_res, Exception) else entropy_acct_res
        account_errors = {name: str(res) for name, res in
                          (("arcus", arcus_acct_res), ("entropy", entropy_acct_res))
                          if isinstance(res, Exception)}
        balance_entropy, balance_arcus = entropy_balance(entropy_acct), arcus_balance(arcus_acct)
        balances = {"entropy": balance_entropy, "arcus": balance_arcus,
                    "total": combine_balances(balance_entropy, balance_arcus)}

        # 市场列表拿不到就没法出表 —— 这个不沿用旧数据，直接如实报错
        if isinstance(markets_res, Exception):
            self._snapshot = {
                "ready": False,
                "error": str(markets_res),
                "round_trip_cost_bps": cost,
                "balances": balances,
                "accounts": {"arcus_configured": self.settings.arcus_configured,
                             "entropy_configured": self.settings.entropy_configured,
                             "errors": account_errors},
                "liquidation_warn_pct": self.settings.close_corridor_pct,
                "generated_at": time.time(),
                "rows": [],
                "venues": {
                    v: {
                        "ok": False,
                        "proxy": self.settings.proxy_label(v),
                        "error": str(markets_res),
                    }
                    for v in ("arcus", "entropy")
                },
            }
            return self._snapshot
        markets: list[dict[str, Any]] = markets_res  # type: ignore[assignment]

        def resolve(venue: str, result: Any) -> tuple[Any, VenueStatus]:
            label = self.settings.proxy_label(venue)
            if not isinstance(result, Exception):
                return result, VenueStatus(ok=True, proxy=label)
            fallback = self.cache.get(venue, stale_max)
            if fallback is None:
                return None, VenueStatus(ok=False, proxy=label, error=str(result))
            rows, age = fallback
            return rows, VenueStatus(
                ok=True, proxy=label, error=str(result), age_seconds=age, stale=True
            )

        arcus_map, status["arcus"] = resolve("arcus", arcus_res)
        entropy_map, status["entropy"] = resolve("entropy", entropy_res)
        if not isinstance(arcus_res, Exception):
            self.cache.put("arcus", arcus_res)  # type: ignore[arg-type]
        if not isinstance(entropy_res, Exception):
            self.cache.put("entropy", entropy_res)  # type: ignore[arg-type]

        # 周期自检：地板价隐含年化高得离谱 = 结算周期八成用错了。
        # 这是 2026-09-18 那次 8 倍误差（ANTH 方向判反）唯一能自动发现的途径。
        warnings: list[str] = []
        for venue, mapping in (("arcus", arcus_map), ("entropy", entropy_map)):
            if mapping:
                warning = detect_period_anomaly(list(mapping.values()))
                if warning:
                    warnings.append(warning)

        # ── 持仓与强平价（只读，不做任何处置）──
        arcus_acct = None if isinstance(arcus_acct_res, Exception) else arcus_acct_res
        entropy_acct = None if isinstance(entropy_acct_res, Exception) else entropy_acct_res
        account_errors = {
            name: str(res)
            for name, res in (("arcus", arcus_acct_res), ("entropy", entropy_acct_res))
            if isinstance(res, Exception)
        }
        # 面板报危险的线和引擎动手的线必须一致（都用平仓线 close_corridor_pct），
        # 否则「面板红了但程序不动」会让人以为程序出了问题。
        warn_pct = self.settings.close_corridor_pct
        entropy_ready = self.settings.entropy_configured
        # Arcus 不给强平价，要按各市场的维持保证金率自己算（见 arcus.arcus_liquidation_price）
        mmf_by_market = {
            int(m["arcus_market_id"]): float(m["arcus_mmf"])
            for m in markets if m.get("arcus_mmf")
        }
        health_by_asset: dict[str, HedgeHealth] = {}
        for market in markets:
            asset = market["asset"]
            entropy_leg = (
                parse_entropy_position(entropy_acct, market["entropy_symbol"])
                if entropy_acct is not None
                else None
            )
            arcus_leg = parse_arcus_position(
                arcus_acct, int(market["arcus_market_id"]), mmf_by_market=mmf_by_market,
            )
            if arcus_leg is not None and not arcus_leg.mark_price:
                arcus_leg = with_mark(arcus_leg, arcus_marks.get(market["arcus_symbol"]))
            health_by_asset[asset] = HedgeHealth(
                asset=asset,
                entropy=entropy_leg,
                arcus=arcus_leg,
                warn_distance_pct=warn_pct,
            )

        rows: list[dict[str, Any]] = []
        suspect = 0
        if arcus_map and entropy_map:
            for market in markets:
                arcus_row = arcus_map.get(market["arcus_symbol"])
                entropy_row = entropy_map.get(market["entropy_market_index"])
                choice = choose_direction(entropy_row, arcus_row)
                if choice is None:
                    continue
                if not choice.tradable:
                    suspect += 1
                net_h = choice.net_bps_per_hour
                # 回本小时数：资金费要收多久才能盖住一轮 4 条腿的价差磨损
                breakeven = cost / net_h if net_h > 1e-9 else None
                health = health_by_asset.get(market["asset"])
                # 引擎空仓时要靠这个价算下单数量和预检 —— 少了它会一直
                # 卡在「缺少开仓前预检结果」。
                mark = arcus_marks.get(market["arcus_symbol"])
                rows.append(
                    {
                        "asset": market["asset"],
                        "mark_price": mark,
                        "position": _health_dict(health),
                        "entropy_symbol": market["entropy_symbol"],
                        "arcus_symbol": market["arcus_symbol"],
                        "entropy_bps_per_hour": choice.entropy_bps_per_hour,
                        "arcus_bps_per_hour": choice.arcus_bps_per_hour,
                        "net_bps_per_hour": net_h,
                        "net_bps_per_day": net_h * 24,
                        "apr_pct": net_h / 10_000 * 24 * 365 * 100,
                        "direction": choice.direction,
                        "direction_label": choice.direction_label,
                        "tradable": choice.tradable,
                        "reason": choice.reason,
                        "breakeven_hours": breakeven,
                        "max_leverage": market["max_leverage"],
                        "entropy_max_leverage": market.get("entropy_max_leverage"),
                        "category": market.get("category"),
                        "off_hours": market.get("arcus_off_hours"),
                        "min_base_quantity": market["min_base_quantity"],
                        "quantity_decimals": market["quantity_decimals"],
                        "entropy_predicted": bool(
                            entropy_row and entropy_row.is_predicted
                        ),
                        "arcus_predicted": bool(
                            arcus_row and arcus_row.is_predicted
                        ),
                    }
                )
        rows.sort(key=lambda r: (not r["tradable"], -r["net_bps_per_hour"]))

        # 余额：用上面已经拿到的账户数据算，不额外请求
        balance_entropy = entropy_balance(entropy_acct)
        balance_arcus = arcus_balance(arcus_acct)
        balances = {
            "entropy": balance_entropy,
            "arcus": balance_arcus,
            "total": combine_balances(balance_entropy, balance_arcus),
        }

        self._snapshot = {
            "ready": bool(rows),
            "error": None,
            "generated_at": time.time(),
            "round_trip_cost_bps": cost,
            "round_trip_cost_is_assumption": True,
            "market_count": len(markets),
            "matched_count": len(rows),
            "suspect_count": suspect,
            "period_warnings": warnings,
            "liquidation_warn_pct": warn_pct,
            "balances": balances,
            "accounts": {
                "arcus_configured": self.settings.arcus_configured,
                "entropy_configured": entropy_ready,
                "errors": account_errors,
                "open_assets": [
                    a for a, h in health_by_asset.items() if h.open_legs
                ],
                "danger_assets": [
                    a for a, h in health_by_asset.items() if h.status in ("danger", "unhedged", "suspect")
                ],
            },
            "rows": rows,
            "venues": {
                name: {
                    "ok": s.ok,
                    "proxy": s.proxy,
                    "error": s.error,
                    "age_seconds": round(s.age_seconds, 1),
                    "stale": s.stale,
                }
                for name, s in status.items()
            },
        }
        return self._snapshot


def _health_dict(health: HedgeHealth | None) -> dict[str, Any] | None:
    """把一个币种的两条腿摊平成面板用的字典。"""
    if health is None:
        return None

    def leg(p: Any) -> dict[str, Any] | None:
        if p is None:
            return None
        return {
            "venue": p.venue,
            "size": p.size,
            "side": p.side,
            "entry_price": p.entry_price,
            "mark_price": p.mark_price,
            "liquidation_price": p.liquidation_price,
            "distance_pct": p.distance_pct,
            "unrealized_pnl": p.unrealized_pnl,
            "margin": p.margin,
            "liquidation_sane": p.liquidation_side_is_sane,
        }

    return {
        "status": health.status,
        "status_text": health.status_text,
        "is_hedged": health.is_hedged,
        "net_size": health.net_size,
        "min_distance_pct": health.min_distance_pct,
        "riskiest_venue": health.riskiest_leg.venue if health.riskiest_leg else None,
        "total_unrealized": health.total_unrealized,
        "entropy": leg(health.entropy),
        "arcus": leg(health.arcus),
    }
