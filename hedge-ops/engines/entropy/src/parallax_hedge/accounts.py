"""两边账户的余额 —— 首页的「账户权益 / 可用 / 浮动盈亏」。

  · Entropy（Hyperliquid io 子 dex，逐仓）：口径经过实盘验证，
    见 entropy_balance 的说明。
  · Arcus：权益取 /v1/account 的 equity，可用取 freeCollateral
    （官方定义：equity − Σ 各仓位初始保证金要求，就是还能拿来开新仓的钱）。

引擎算「能开多大」也调用这里的 arcus_balance —— 首页显示的可用和开仓用的可用
是同一个数，不会各算各的。
"""
from __future__ import annotations

from typing import Any


def _num(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def entropy_balance(payload: Any) -> dict[str, Any] | None:
    """MarketClient.entropy_account() 的快照 → 权益 / 可用 / 浮盈。

    普通账户：权益 = marginSummary.accountValue，可用 = withdrawable。
    统一账户 / 组合保证金：抵押品在现货 USDC 里，可用 = total − max(hold, 总保证金, Σ逐仓保证金)
    （hold 已经包含仓位占用的保证金，不能再扣一遍 —— 早期版本在这里扣过两遍，可用被严重低估）。
    """
    if not isinstance(payload, dict):
        return None
    positions = [
        item for item in payload.get("assetPositions") or []
        if isinstance(item, dict)
        and abs(_num((item.get("position") or {}).get("szi"))) > 1e-12
    ]
    summary = payload.get("marginSummary") or {}
    unrealized = sum(_num((item.get("position") or {}).get("unrealizedPnl")) for item in positions)
    equity = _num(summary.get("accountValue"))
    available = _num(payload.get("withdrawable"))
    abstraction = str(payload.get("_abstraction") or "")
    if abstraction in {"unifiedAccount", "portfolioMargin"}:
        spot = payload.get("_spot_state") or {}
        usdc = next(
            (r for r in spot.get("balances") or []
             if isinstance(r, dict) and str(r.get("coin", "")).upper() == "USDC"),
            None,
        )
        if isinstance(usdc, dict):
            equity = _num(usdc.get("total"))
            held = max(0.0, _num(usdc.get("hold")))
            summary_margin = max(0.0, _num(summary.get("totalMarginUsed")))
            position_margin = sum(
                max(0.0, _num((item.get("position") or {}).get("marginUsed")))
                for item in payload.get("assetPositions") or []
                if isinstance(item, dict)
            )
            available = max(0.0, equity - max(held, summary_margin, position_margin))
    return {
        "equity": equity,
        "available": max(0.0, available),
        "unrealized_pnl": unrealized,
        "open_positions": len(positions),
        "mode": abstraction or "standard",
    }


def arcus_balance(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    positions = [
        p for p in payload.get("_positions") or []
        if isinstance(p, dict) and abs(_num(p.get("size"))) > 1e-12
    ]
    equity = _num(payload.get("equity"))
    free = payload.get("freeCollateral")
    available = _num(free) if free not in (None, "") else _num(payload.get("netQuoteBalance"))
    unrealized = 0.0
    for p in positions:
        size = _num(p.get("size"))
        if str(p.get("side") or "").upper() == "SHORT" and size > 0:
            size = -size
        entry, mark = _num(p.get("averageEntryPrice")), _num(p.get("markPx"))
        unrealized += size * (mark - entry) if (entry and mark) else _num(p.get("unrealizedPnl"))
    modes = {str(p.get("marginMode") or "").upper() for p in positions} - {""}
    return {
        "equity": equity,
        "available": max(0.0, available),
        "unrealized_pnl": unrealized,
        "open_positions": len(positions),
        "mode": "/".join(sorted(modes)) or None,
    }


def combine_balances(entropy: dict[str, Any] | None,
                     arcus: dict[str, Any] | None) -> dict[str, Any] | None:
    """两边合计。任何一边读不到就不给合计 —— 半个合计比没有合计更误导人。"""
    if entropy is None or arcus is None:
        return None
    return {
        key: _num(entropy.get(key)) + _num(arcus.get(key))
        for key in ("equity", "available", "unrealized_pnl", "open_positions")
    }
