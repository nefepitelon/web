"""交易量仪表盘的估算 —— 纯函数，不碰网络。

两个数：
  1. 当前任务预估日交易量：按每个启用任务的开仓金额、持有时长、每轮额外开销，
     估一天能跑几轮，每轮两所各开一次、平一次（= 4 × 单边金额）。
  2. 理论最大日交易量：两边都用最大杠杆、全部权益，同时守住开仓门槛（离强平 ≥ MIN_CORRIDOR_PCT），
     并用面板允许的最短轮换（0.1 小时）、吃单开平，程序还能稳定跑的上限。
     Arcus 全仓按账户整体的强平距离算；Entropy 逐仓，每个仓位的强平距离只由它自己的杠杆决定，
     所以上限 = 权益 × 守得住门槛的最高杠杆 × 95%。

交易量口径和首页「合计交易量」一致：两个所的成交额加在一起。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# 面板允许的最短轮换周期（小时），也是「极限」估算用的持有时长
MIN_ROTATION_HOURS = 0.1
# 吃单开仓后的复核（读回两边仓位和强平价）大约耗时（秒）
VERIFY_SECONDS = 25.0
# 和 max_quantity_for 同一个余量：卡着上限开会被交易所以保证金不足拒单
SAFETY = 0.95


@dataclass
class TaskEstimate:
    asset: str
    notional: float            # 单边每轮金额（USDC）
    notional_source: str       # 金额从哪来：设定 / 区间中值 / 当前持仓 / 按余额开满
    hold_hours: float          # 平均持有时长
    overhead_seconds: float    # 每轮额外开销（冷却 + 等引擎周期 + 挂单等待）
    rounds_per_day: float
    daily_volume: float


@dataclass
class Capacity:
    current_daily: float
    max_daily: float
    tasks: list[TaskEstimate] = field(default_factory=list)
    max_notional: float = 0.0          # 极限情况下两边各自能同时持有的总仓位（USDC）
    max_rounds_per_day: float = 0.0
    max_binding: str = ""              # 极限被谁卡住
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "current_daily": self.current_daily,
            "max_daily": self.max_daily,
            "tasks": [t.__dict__ for t in self.tasks],
            "max_notional": self.max_notional,
            "max_rounds_per_day": self.max_rounds_per_day,
            "max_binding": self.max_binding,
            "notes": self.notes,
        }


def round_overhead_seconds(*, cooldown: float, cycle: float, maker: bool,
                           maker_wait: float) -> float:
    """一轮里「没在持仓」的时间：平仓后冷却 + 等下一个引擎周期 + 开仓复核；
    挂单模式开、平各按等一半的挂单时间算（成交快慢看盘口，取中间值）。"""
    base = cooldown + cycle + VERIFY_SECONDS
    return base + (maker_wait if maker else 0.0)


def rounds_per_day(hold_hours: float, overhead_seconds: float) -> float:
    period = max(1e-6, hold_hours + overhead_seconds / 3600.0)
    return 24.0 / period


def task_notional(task: dict[str, Any], *, position_notional: float | None,
                  fill_capacity: float | None) -> tuple[float, str]:
    """单边每轮金额。设了区间取中值（随机抽取的期望值）。"""
    lo, hi = task.get("notional_usdc"), task.get("notional_usdc_max")
    if lo:
        lo = float(lo)
        if hi and float(hi) > lo:
            return (lo + float(hi)) / 2.0, "区间中值"
        return lo, "设定金额"
    if position_notional:
        return float(position_notional), "当前持仓"
    return max(0.0, float(fill_capacity or 0.0)), "按余额开满"


def account_notional_limit(equity: float, max_leverage: float | None, mmf: float | None,
                           corridor_pct: float) -> tuple[float, str]:
    """全仓账户在「离强平 ≥ corridor_pct」和「杠杆上限」下能同时持有的最大总仓位。

    离强平距离（全部仓位一起往不利方向走的最坏情况）：
        x = (E − T·m) / (T·(1 + m))   →   x ≥ c  ⇔  T ≤ E / (c·(1 + m) + m)
    杠杆上限：T ≤ E × 最大杠杆 × 95%
    """
    if equity <= 0:
        return 0.0, "没有权益"
    c = max(0.0, corridor_pct) / 100.0
    m = float(mmf) if mmf else (1.0 / (2.0 * float(max_leverage)) if max_leverage else 0.0)
    by_corridor = equity / (c * (1.0 + m) + m) if (c * (1.0 + m) + m) > 0 else float("inf")
    by_leverage = equity * float(max_leverage) * SAFETY if max_leverage else float("inf")
    if by_corridor <= by_leverage:
        return by_corridor, f"开仓门槛 {corridor_pct:g}%"
    return by_leverage, f"最大杠杆 {float(max_leverage):g}×"


def isolated_notional_limit(equity: float, safe_leverage: float | None,
                            max_leverage: float | None) -> tuple[float, str]:
    """逐仓账户能同时持有的最大总仓位：权益 × 守得住开仓门槛的杠杆 × 95%。"""
    if equity <= 0:
        return 0.0, "没有权益"
    lev = safe_leverage or max_leverage
    if not lev:
        return float("inf"), "杠杆上限不明"
    why = (f"逐仓 {float(lev):g}×（守住开仓门槛）"
           if safe_leverage and max_leverage and safe_leverage < max_leverage
           else f"最大杠杆 {float(lev):g}×")
    return equity * float(lev) * SAFETY, why


def estimate(*, tasks: list[dict[str, Any]], markets: dict[str, dict[str, Any]],
             entropy_equity: float, arcus_equity: float,
             position_notional: dict[str, float], fill_capacity: dict[str, float],
             maker_for: Any, cooldown: float, cycle: float, maker_wait: float,
             min_corridor_pct: float) -> Capacity:
    """markets[asset] 需要：arcus_max_leverage、arcus_mmf、entropy_max_leverage、
    entropy_safe_leverage（逐仓下守得住开仓门槛的最高杠杆）。"""
    enabled = [t for t in tasks if t.get("enabled")]
    cap = Capacity(current_daily=0.0, max_daily=0.0)

    for task in enabled:
        asset = task["asset"]
        notional, source = task_notional(
            task, position_notional=position_notional.get(asset),
            fill_capacity=fill_capacity.get(asset))
        lo = float(task.get("rotation_hours") or 4.0)
        hi = float(task.get("rotation_hours_max") or lo)
        hold = (lo + max(lo, hi)) / 2.0
        overhead = round_overhead_seconds(cooldown=cooldown, cycle=cycle,
                                          maker=bool(maker_for(task)), maker_wait=maker_wait)
        rounds = rounds_per_day(hold, overhead)
        daily = rounds * 4.0 * notional
        cap.tasks.append(TaskEstimate(asset, notional, source, hold, overhead, rounds, daily))
        cap.current_daily += daily

    # 极限：用你启用的币种里「最保守」的参数（维持保证金率最高、杠杆上限最低）
    chosen = [markets[t["asset"]] for t in enabled if t["asset"] in markets] or \
        [m for a, m in markets.items() if a == "BTC"] or list(markets.values())[:1]
    if not chosen:
        cap.notes.append("拿不到市场参数，无法估算上限")
        return cap

    def worst(key: str, pick: Any) -> float | None:
        values = [float(m[key]) for m in chosen if m.get(key)]
        return pick(values) if values else None

    arcus_limit, arcus_why = account_notional_limit(
        arcus_equity, worst("arcus_max_leverage", min), worst("arcus_mmf", max), min_corridor_pct)
    entropy_limit, entropy_why = isolated_notional_limit(
        entropy_equity, worst("entropy_safe_leverage", min), worst("entropy_max_leverage", min))
    if arcus_limit <= entropy_limit:
        cap.max_notional, cap.max_binding = arcus_limit, f"Arcus（{arcus_why}）"
    else:
        cap.max_notional, cap.max_binding = entropy_limit, f"Entropy（{entropy_why}）"
    overhead = round_overhead_seconds(cooldown=cooldown, cycle=cycle, maker=False,
                                      maker_wait=maker_wait)
    cap.max_rounds_per_day = rounds_per_day(MIN_ROTATION_HOURS, overhead)
    cap.max_daily = cap.max_rounds_per_day * 4.0 * cap.max_notional
    return cap
