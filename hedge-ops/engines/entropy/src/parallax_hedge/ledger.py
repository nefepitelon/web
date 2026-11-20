"""成交账本 —— 首页「交易量 / 手续费 / 磨损」的数据来源。

原则（照搬 Parallax 实盘验证过的做法）：

  1. 每发出一条腿就记一笔：哪个币、哪个所、什么动作、方向、请求量，
     以及订单号（Entropy 的 oid / Arcus 的 orderId）和当下最好的估计值
     （仓位变化量、盘口参考价 / 回执均价）。
     两个所的成交记录每一笔都带订单号，直接按它加总。
  2. 之后拿订单号去【交易所自己的成交记录】里对账，换成准确的成交价、
     成交量、手续费和已实现盈亏。交易所的记录是唯一的真相。
  3. 对不上的单子等一段时间；拿到了交易所数据但超时仍对不上，就按估计值
     定稿，并如实标成「估算」。交易所数据本身拿不到时【不定稿】，下次再试。
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

from . import arcus as ax
from .execution import LegResult

# 下单后等 2 分钟再对账，给交易所的成交记录留出落库时间。
MATCH_GRACE_SEC = 120
GIVE_UP_AFTER_SEC = 30 * 60     # 交易所数据拿到了、超过这么久还对不全，就按估计值定稿
COMPLETE_FRACTION = 0.99        # 对上的成交量至少要到仓位实测量的 99% 才算对全了
ARCUS_FILLS_MARGIN_SEC = 300    # Arcus 成交按时间查，同样往前多留 5 分钟


@dataclass(frozen=True)
class VenueFill:
    """一张订单在交易所成交记录里的汇总。"""

    quantity: float
    price: float
    fee: float | None
    realized_pnl: float
    side: str | None
    matched: int


def _f(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# ── 交易所成交记录 → 单张订单 ────────────────────────────

def match_entropy_fills(
    rows: list[dict[str, Any]] | None, oid: Any
) -> VenueFill | None:
    """按订单号 oid 把 userFills 里属于这张订单的成交加总起来。

    Hyperliquid 每一档成交都带着订单号，一张单吃了好几档也能收齐；
    fee 是这笔成交实付的手续费（USDC），closedPnl 是平仓价差盈亏（不含手续费）。
    """
    try:
        target = int(oid)
    except (TypeError, ValueError):
        return None
    if not rows:
        return None
    quantity = notional = fees = pnl = 0.0
    matched = 0
    side: str | None = None
    fee_known = True
    seen: set[Any] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            if int(row.get("oid")) != target:
                continue
        except (TypeError, ValueError):
            continue
        key = row.get("tid") or (row.get("hash"), row.get("time"), row.get("px"), row.get("sz"))
        if key in seen:
            continue
        seen.add(key)
        price = abs(_f(row.get("px")) or 0.0)
        size = abs(_f(row.get("sz")) or 0.0)
        if price <= 0 or size <= 0:
            continue
        matched += 1
        quantity += size
        notional += price * size
        side = {"B": "buy", "A": "sell"}.get(str(row.get("side") or "").upper(), side)
        # 只加 USDC 计价的手续费；别的币种计价的换算不了，宁可标「未知」也不瞎算
        if str(row.get("feeToken") or "USDC").upper() in ("USDC", "USDH", "USDE", "USDT0"):
            fees += _f(row.get("fee")) or 0.0
        else:
            fee_known = False
        pnl += _f(row.get("closedPnl")) or 0.0
    if quantity <= 0:
        return None
    return VenueFill(
        quantity=quantity, price=notional / quantity, fee=fees if fee_known else None,
        realized_pnl=pnl, side=side, matched=matched,
    )


def match_arcus_fills(rows: list[dict[str, Any]] | None, ref: Any) -> VenueFill | None:
    """按订单号（或 cid:clientId）把 /v1/fills 里属于这张订单的成交加总起来。"""
    hit = ax.match_fills(rows, None if ref is None else str(ref))
    if hit is None:
        return None
    quantity, price, fee, pnl, side, matched = hit
    return VenueFill(quantity=quantity, price=price, fee=fee,
                     realized_pnl=pnl, side=side, matched=matched)


# ── 执行结果 → 账本行 ────────────────────────────────────

def fill_row_from_leg(
    asset: str, action: str, leg: LegResult, *, dry_run: bool,
    market_id: int | None, cycle_id: int | None = None,
    created_at: float | None = None,
) -> dict[str, Any] | None:
    """把一条腿翻译成一行账。没真正发出去的腿不记。"""
    if leg is None or not (leg.submitted or leg.uncertain):
        return None
    if leg.receipt_fill and float(leg.filled or 0) <= 0 and not dry_run:
        # Entropy 回执明确说一点没成交（IOC 落空 / 拒单）：没有交易量也没有手续费，不记
        return None
    base = {
        "asset": asset, "venue": leg.venue, "action": action, "side": leg.side,
        "dry_run": dry_run, "market_id": market_id if leg.venue == "entropy" else None,
        "requested_qty": float(leg.requested or 0.0),
        "price": leg.price, "cycle_id": cycle_id, "created_at": created_at,
    }
    if dry_run:
        return {**base, "order_ref": None, "quantity": float(leg.filled or 0.0),
                "source": "simulated", "status": "final", "note": "演练"}
    quantity = float(leg.filled or 0.0) if leg.fill_confirmed else 0.0
    # 仓位变化 / 回执证实过的成交量：对账时拿它判断交易所的记录是不是对全了
    base["confirmed_qty"] = quantity if leg.fill_confirmed and quantity > 0 else None
    ref = leg.order_ref
    source = "position"
    if not ref:
        # 没有订单号就永远对不上账 —— 直接按估计值定稿，并说清楚为什么
        return {**base, "order_ref": None, "quantity": quantity, "source": source,
                "status": "estimated", "note": "回执里没有订单号，无法对账"}
    note = None if leg.fill_confirmed else "成交量未证实，等交易所成交记录"
    return {**base, "order_ref": ref, "quantity": quantity, "source": source,
            "status": "pending", "note": note}


def ledger_rows_for_result(
    asset: str, result: Any, *, dry_run: bool, market_id: int | None,
    cycle_id: int | None = None,
) -> list[dict[str, Any]]:
    rows = []
    for action, leg in getattr(result, "ledger", None) or []:
        row = fill_row_from_leg(asset, action, leg, dry_run=dry_run,
                                market_id=market_id, cycle_id=cycle_id)
        if row is not None:
            rows.append(row)
    return rows


# ── 对账 ────────────────────────────────────────────────

class FillReconciler:
    """每隔一段时间，拿待对账的单子去两个所的成交记录里核对。"""

    def __init__(self, store: Any, client: Any, executor: Any = None,
                 *, clock: Any = time.time) -> None:
        self.store = store
        self.client = client
        self.executor = executor
        self.clock = clock
        self.last_summary: dict[str, Any] = {}

    async def run_once(self) -> dict[str, Any]:
        now = self.clock()
        pending = self.store.pending_fills(older_than=now - MATCH_GRACE_SEC)
        summary: dict[str, Any] = {
            "at": now, "checked": len(pending), "matched": 0,
            "gave_up": 0, "waiting": 0, "errors": [],
        }
        if pending:
            await self._arcus([r for r in pending if r["venue"] == "arcus"], now, summary)
            await self._entropy([r for r in pending if r["venue"] == "entropy"], now, summary)
        self.last_summary = summary
        return summary

    def _settle(self, row: dict[str, Any], hit: VenueFill | None, now: float,
                fetched: bool, summary: dict[str, Any]) -> None:
        confirmed = row.get("confirmed_qty")
        too_old = now - float(row["created_at"]) > GIVE_UP_AFTER_SEC
        ceiling = max(float(confirmed or 0.0), float(row.get("requested_qty") or 0.0))
        if hit is not None and ceiling > 0 and hit.quantity > ceiling * (2 - COMPLETE_FRACTION):
            # 对上的成交比下单量还多：IOC 单不可能超量成交，只能是对错了单。
            # 宁可按仓位实测记成估算，也不能让对错的成交把交易量虚增。
            self.store.give_up_fill(
                row["id"],
                f"交易所记录对上 {hit.quantity:g}，超过下单量 {ceiling:g}，"
                "疑似对错了单，数量按仓位实测，手续费和盈亏不计",
            )
            summary["gave_up"] += 1
            return
        if hit is not None and confirmed and hit.quantity < float(confirmed) * COMPLETE_FRACTION:
            # 交易所只对上了一部分：仓位明明动了 confirmed 这么多，记录却不够。
            # 【不能】拿残缺的数据定稿 —— v0.2.0 就是这么把 Entropy 交易量少算一半多的。
            if too_old:
                self.store.give_up_fill(
                    row["id"],
                    f"交易所成交记录只对上 {hit.quantity:g}/{float(confirmed):g}，"
                    "数量按仓位实测，手续费和盈亏不计",
                    price=hit.price,
                )
                summary["gave_up"] += 1
            else:
                self.store.touch_fill(row["id"])
                summary["waiting"] += 1
            return
        if hit is not None:
            self.store.settle_fill(
                row["id"], quantity=hit.quantity, price=hit.price, fee=hit.fee,
                realized_pnl=hit.realized_pnl, side=hit.side,
            )
            summary["matched"] += 1
        elif fetched and too_old:
            self.store.give_up_fill(
                row["id"], "交易所成交记录里找不到这张单（多半是 IOC 零成交），按估计值定稿"
            )
            summary["gave_up"] += 1
        else:
            self.store.touch_fill(row["id"])
            summary["waiting"] += 1

    async def _arcus(self, rows: list[dict[str, Any]], now: float,
                     summary: dict[str, Any]) -> None:
        """Arcus：按时间一次查回最早那张待对账单之后的全部成交，再按 orderId 分拣。"""
        if not rows:
            return
        fills, fetched = None, False
        since = min(float(r["created_at"]) for r in rows) - ARCUS_FILLS_MARGIN_SEC
        try:
            fills = await self.client.arcus_fills(since)
            fetched = isinstance(fills, list)
        except Exception as exc:
            summary["errors"].append(f"Arcus 成交记录：{exc}")
        for row in rows:
            hit = match_arcus_fills(fills, row.get("order_ref")) if fetched else None
            self._settle(row, hit, now, fetched, summary)

    async def _entropy(self, rows: list[dict[str, Any]], now: float,
                       summary: dict[str, Any]) -> None:
        """Entropy：一次拉回最近的成交（userFills，最多 2000 条），按 oid 分拣。"""
        if not rows:
            return
        fills, fetched = None, False
        try:
            fills = await self.client.entropy_user_fills()
            fetched = isinstance(fills, list)
        except Exception as exc:
            summary["errors"].append(f"Entropy 成交记录：{exc}")
        for row in rows:
            hit = match_entropy_fills(fills, row.get("order_ref")) if fetched else None
            self._settle(row, hit, now, fetched, summary)


ARCUS_PNL_FEE_KEY = "arcus_pnl_fee_fix_v1"


def repair_arcus_double_counted_fees(store: Any) -> int:
    """一次性修复（v1.0.1）：v1.0.0 把 Arcus 的 closedPnl 原样当成「价差损益」，
    而 closedPnl 已经扣过手续费，首页净损益里 Arcus 手续费被扣了两遍。
    把已定稿的 Arcus 行的已实现盈亏加回手续费。只跑一次。"""
    if store.get_meta(ARCUS_PNL_FEE_KEY):
        return 0
    cursor = store.conn.execute(
        "UPDATE fills SET realized_pnl = realized_pnl + fee"
        " WHERE venue='arcus' AND source='exchange' AND fee IS NOT NULL"
        " AND realized_pnl IS NOT NULL"
    )
    store.conn.commit()
    store.set_meta(ARCUS_PNL_FEE_KEY, json.dumps({"at": time.time(), "rows": cursor.rowcount}))
    return cursor.rowcount
