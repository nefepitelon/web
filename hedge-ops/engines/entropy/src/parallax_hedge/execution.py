"""双腿执行 —— 开仓、平仓、孤腿抢救、保护性挂单。

编排顺序照搬 Parallax 实盘验证过的那套（2026-09-17 它刚救下一条裸腿）：

    1. 先读两边真实仓位（before）
    2. 【先下 Entropy】—— 它是对冲腿（Hyperliquid io 子 dex，IOC 吃单）
    3. 轮询真实仓位，直到 Entropy 那边发生变化
    4. 用 fills.classify_fill 判定，【不看订单返回】
    5. 没成交且 Arcus 没动过 → 直接返回，【根本不向 Arcus 下单】
    6. 成交了 → 按【实际成交量】而不是请求量去 Arcus 对冲
    7. Arcus 失败 → 立刻市价平掉 Entropy 那条腿（抢救）

第 6 步用实际成交量是关键：IOC 可能只成一部分，按请求量对冲会
多出一截反向敞口。
"""
from __future__ import annotations

import asyncio
import json
import math
import time
from dataclasses import dataclass, field
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from typing import Any

from . import arcus as ax
from .config import ENTROPY_DEX, Settings
from .exchanges import ExchangeError, MarketClient
from .fills import (
    MEANINGFUL_FILL_FRACTION,
    FillVerdict,
    align_quantity,
    classify_fill,
    closing_sides,
    hedge_side,
    positions_match,
    slippage_limit_price,
)
from .positions import parse_arcus_position, parse_entropy_position

# 下单后轮询仓位的节奏。Hyperliquid 回执里就带成交量，但仓位接口偶尔慢半拍；
# Parallax 用的是 4 次重试，这里沿用。
_CONFIRM_RETRIES = 4
_CONFIRM_DELAY_SEC = 0.45

# Arcus 下单回执 202 = 已转给撮合引擎，仓位接口要稍等才反映；
# 对冲腿按仓位确认时多给几次机会（累计约 3 秒），免得把「还没刷新」当成「没成交」。
_ARCUS_CONFIRM_RETRIES = 6

# Arcus 下单 / 设杠杆的 HTTP 超时。下单【绝不重试】—— 超时的时候单子可能已经发出去了，
# 重发就是两张单。超时一律按「结果未知」处理，交给仓位去判定。
_ARCUS_WRITE_TIMEOUT_SEC = 12.0


def arcus_limit_price(market: dict[str, Any], price: float, side: str) -> float:
    """Arcus 限价：对齐到该价位的 tick，方向朝着更激进的一侧（买往上、卖往下）。"""
    try:
        return float(ax.round_arcus_price(market, price, side))
    except ValueError as exc:
        raise ExchangeError(str(exc)) from exc


# Entropy（Hyperliquid）下单 / 设杠杆的 HTTP 超时。和 Arcus 一样【绝不重试】。
_ENTROPY_WRITE_TIMEOUT_SEC = 12.0


def normalize_tx_hash(value: Any) -> str | None:
    """订单号 / 成交号统一成小写字符串（对账比对用）。"""
    if value in (None, ""):
        return None
    text = str(value).strip().lower()
    if text.startswith("0x"):
        text = text[2:]
    return text or None


def entropy_price_step(price: float, size_decimals: int) -> Decimal:
    """Entropy 能表达的最小价格间隔。两条规则同时生效，取【较粗】的那一个：
      · 小数位不超过 6 - szDecimals
      · 有效数字不超过 5 位
    （实盘验证过的那一版）
    """
    max_decimals = max(0, 6 - int(size_decimals))
    decimal_step = Decimal(1).scaleb(-max_decimals)
    sigfig_step = Decimal(1).scaleb(Decimal(str(price)).adjusted() - 4)
    return max(decimal_step, sigfig_step)


def round_entropy_price(price: float, size_decimals: int, side: str) -> float:
    """把限价对齐到 Entropy 允许的价格档位，【方向朝着更激进的一侧】（买往上、卖往下）。

    2026-09-18 实盘教训：不对齐会被拒（"Order has invalid price."），而顶层 status 仍是 "ok"。
    四舍五入在档位比滑点预算还宽时会把买单压到卖一之下 —— 报单成功、零成交。
    """
    if price != price or price in (float("inf"), float("-inf")):
        raise ExchangeError("Entropy 限价不是有效数字")
    if price <= 0:
        raise ExchangeError("Entropy 限价必须大于 0")
    if side not in ("buy", "sell"):
        raise ExchangeError(f"Entropy 限价对齐需要知道买卖方向，收到 {side!r}")
    step = entropy_price_step(price, size_decimals)
    rounding = ROUND_CEILING if side == "buy" else ROUND_FLOOR
    units = (Decimal(str(price)) / step).to_integral_value(rounding=rounding)
    rounded = float(units * step)
    if rounded <= 0:
        raise ExchangeError("Entropy 限价对齐后无效")
    return rounded


def parse_entropy_order_response(raw: Any) -> tuple[bool, float, str | None]:
    """把 Hyperliquid 的下单回执解析成 (是否成交, 成交量, 错误)。

    顶层 status == "ok" 只是 HTTP 信封，真正的拒单理由在 response.data.statuses[i].error。
    只看信封会把被拒的单记成成功 —— 2026-09-18 就是这么留下一条裸腿的。
    """
    if not isinstance(raw, dict):
        return False, 0.0, "Entropy 返回了无法识别的下单结果"
    if raw.get("status") != "ok":
        return False, 0.0, str(raw.get("response") or raw)
    response = raw.get("response")
    if not isinstance(response, dict) or response.get("type") != "order":
        return False, 0.0, f"Entropy 返回了非订单结果：{response}"
    data = response.get("data")
    statuses = data.get("statuses") if isinstance(data, dict) else None
    if not isinstance(statuses, list) or not statuses:
        return False, 0.0, "Entropy 下单结果缺少订单状态"
    total_filled = 0.0
    for status in statuses:
        if not isinstance(status, dict):
            return False, 0.0, f"Entropy 返回了无法识别的订单状态：{status}"
        if status.get("error"):
            # 交易所原话，不翻译 —— 排查时要的就是这句
            return False, 0.0, str(status["error"])
        filled = status.get("filled")
        if not isinstance(filled, dict):
            if "resting" in status:
                return False, 0.0, "Entropy IOC 订单未立即成交"
            return False, 0.0, f"Entropy 订单未确认成交：{status}"
        try:
            total_filled += abs(float(filled.get("totalSz") or 0))
        except (TypeError, ValueError):
            return False, 0.0, "Entropy 成交回执缺少有效的成交数量"
    if total_filled <= 0:
        return False, 0.0, "Entropy 回执显示成交量为 0"
    return True, total_filled, None


def entropy_receipt_fill(raw: Any) -> tuple[int | None, float | None]:
    """(订单号, 成交均价)。IOC 回执里的 avgPx 是撮合引擎给的成交均价，是准的。"""
    try:
        statuses = raw["response"]["data"]["statuses"]
    except (TypeError, KeyError):
        return None, None
    oid: int | None = None
    quantity = notional = 0.0
    for status in statuses if isinstance(statuses, list) else []:
        filled = status.get("filled") if isinstance(status, dict) else None
        if not isinstance(filled, dict):
            continue
        if oid is None and filled.get("oid") not in (None, ""):
            try:
                oid = int(filled["oid"])
            except (TypeError, ValueError):
                oid = None
        try:
            size = abs(float(filled.get("totalSz") or 0))
            price = float(filled.get("avgPx") or 0)
        except (TypeError, ValueError):
            continue
        if size > 0 and price > 0:
            quantity += size
            notional += size * price
    return oid, (notional / quantity if quantity > 0 else None)


def entropy_order_id(raw: Any) -> str | None:
    """回执里的订单号（成交的 filled.oid 或挂着的 resting.oid）—— 对账用。"""
    oid, _ = entropy_receipt_fill(raw)
    if oid is not None:
        return str(oid)
    try:
        for status in raw["response"]["data"]["statuses"]:
            resting = status.get("resting") if isinstance(status, dict) else None
            if isinstance(resting, dict) and resting.get("oid") not in (None, ""):
                return str(int(resting["oid"]))
    except (TypeError, KeyError, ValueError):
        pass
    return None


def _is_open(size: float) -> bool:
    return math.isfinite(size) and abs(size) > 1e-12


def _is_flat(after: float, before: float) -> bool:
    """平仓后这条腿算不算平干净了。读不到（nan）一律不算 —— 不能当成 0。"""
    if not math.isfinite(after):
        return False
    return abs(after) <= max(1e-9, abs(before) * MEANINGFUL_FILL_FRACTION)


@dataclass
class LegResult:
    venue: str
    ok: bool
    submitted: bool = True
    raw: Any = None
    error: str | None = None
    filled: float = 0.0
    # ── 账本字段：成交量 / 手续费统计靠它们 ──
    side: str | None = None
    requested: float = 0.0
    # 成交均价。两边的下单回执都不带成交均价：先填参考价（盘口 VWAP），
    # 之后由交易所成交记录校正（Entropy 按 oid，Arcus 按 orderId）。
    price: float | None = None
    price_is_estimate: bool = True
    fill_confirmed: bool = False        # filled 是否已被仓位变化或交易所回执证实
    order_ref: str | None = None        # Entropy oid / Arcus orderId —— 对账用
    # 结果未知：请求可能已经发出（超时、断流）。这种腿【必须按仓位判定】，
    # 不能当成「没下出去」—— 当成没下，万一其实成交了就是一条没人管的裸腿。
    uncertain: bool = False
    # Entropy 回执已经给出【确定的】成交量（Hyperliquid IOC 回执里有 totalSz / avgPx）
    receipt_fill: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "venue": self.venue, "ok": self.ok, "submitted": self.submitted,
            "error": self.error, "filled": self.filled,
            "side": self.side, "requested": self.requested,
            "price": self.price, "price_is_estimate": self.price_is_estimate,
            "fill_confirmed": self.fill_confirmed, "order_ref": self.order_ref,
            "uncertain": self.uncertain,
            "raw": None if self.raw is None else str(self.raw)[:400],
        }


def order_ref_of(leg: LegResult) -> str | None:
    if leg.venue == "entropy":
        return entropy_order_id(leg.raw)
    raw = leg.raw if isinstance(leg.raw, dict) else {}
    return ax.order_ref(raw.get("orderId"), raw.get("clientId"))


def _stamp(leg: LegResult, *, side: str, requested: float,
           reference_price: float | None) -> LegResult:
    """补齐账本字段。

    放在【调用方】而不是下单函数里 —— 下单函数在测试里会被替身整个换掉，
    写在里面的话，替身跑出来的账本就是空的，测了等于没测。
    """
    leg.side = leg.side or side
    if not leg.requested:
        leg.requested = abs(float(requested))
    if leg.price is None and reference_price and reference_price > 0:
        leg.price = float(reference_price)
        leg.price_is_estimate = True
    if leg.order_ref is None:
        leg.order_ref = order_ref_of(leg)
    return leg


def _simulate_fill(leg: LegResult) -> None:
    """演练模式：按请求量、参考价记一笔模拟成交。"""
    if leg.submitted:
        leg.filled = leg.requested
        leg.fill_confirmed = True


@dataclass
class PairResult:
    ok: bool
    stage: str
    entropy: LegResult | None = None
    arcus: LegResult | None = None
    rescue: LegResult | None = None
    reason: str | None = None
    dry_run: bool = False
    elapsed_ms: float = 0.0
    notes: list[str] = field(default_factory=list)
    # 诊断：实际发出的限价 + 当时两边的买一卖一。
    # 没有这个，「报单成功但零成交」只能靠猜。
    quotes: dict[str, Any] = field(default_factory=dict)
    # 这一次动作里【真正发出去】的每一条腿：(动作, 腿)。
    # 引擎据此逐条落账，首页的成交量 / 手续费就从这里来。
    ledger: list[tuple[str, LegResult]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok, "stage": self.stage, "reason": self.reason,
            "dry_run": self.dry_run, "elapsed_ms": round(self.elapsed_ms, 1),
            "notes": self.notes,
            "quotes": self.quotes,
            "entropy": self.entropy.to_dict() if self.entropy else None,
            "arcus": self.arcus.to_dict() if self.arcus else None,
            "rescue": self.rescue.to_dict() if self.rescue else None,
        }


class Executor:
    """两个所的下单端。dry_run=True 时只记录意图，不提交任何订单。"""

    def __init__(self, settings: Settings, market: MarketClient, *, dry_run: bool = True) -> None:
        self.settings = settings
        self.market = market
        self.dry_run = dry_run
        self._entropy_exchange: Any = None
        self._arcus_key: Any = None
        self._arcus_api_key: str | None = None
        self._arcus_http: Any = None
        self._entropy_lock = asyncio.Lock()
        self._init_lock = asyncio.Lock()

    # ── 签名客户端（惰性初始化）──────────────────────
    def _require_live(self) -> None:
        if self.dry_run:
            raise ExchangeError("dry_run 模式下不应触及签名客户端")

    def _get_entropy_exchange(self) -> Any:
        """Hyperliquid 官方 SDK 的 Exchange（同步、基于 requests）。

        构造时 SDK 就会去拉 meta（含 io 子 dex），所以【构造期间】也得走代理 ——
        见 build_entropy_exchange。必须在线程里调用（warm / to_thread）。
        """
        if self._entropy_exchange is not None:
            return self._entropy_exchange
        self._entropy_exchange = build_entropy_exchange(self.settings)
        return self._entropy_exchange

    def _get_arcus_key(self) -> tuple[Any, str]:
        """(Ed25519 私钥, 公钥 hex)。

        ARCUS_API_KEY 没填就由私钥推导 —— 能推导的不让人填。
        填了就必须和私钥是同一对，否则拒绝下单：
        对不上的时候签出来的单交易所一定拒，而且报错信息很难看懂。
        """
        if self._arcus_key is not None and self._arcus_api_key:
            return self._arcus_key, self._arcus_api_key
        if not ax.ADDRESS_RE.match(self.settings.arcus_address or ""):
            raise ExchangeError("ARCUS_ADDRESS 必须是 0x 开头的 40 位钱包公开地址")
        if not 0 <= int(self.settings.arcus_account_index) <= 9:
            raise ExchangeError("ARCUS_ACCOUNT_INDEX 必须是 0~9")
        try:
            key = ax.load_private_key(
                self.settings.arcus_api_private_key, self.settings.arcus_api_private_key_file
            )
        except ValueError as exc:
            raise ExchangeError(str(exc)) from exc
        derived = ax.public_key_hex(key)
        configured = (self.settings.arcus_api_key or "").lower()
        if configured and configured != derived:
            raise ExchangeError(
                "ARCUS_API_KEY 与 ARCUS_API_PRIVATE_KEY 不是同一对 Ed25519 密钥，已拒绝下单"
            )
        self._arcus_key, self._arcus_api_key = key, derived
        return key, derived

    def _arcus_client(self) -> Any:
        if self._arcus_http is None:
            import httpx
            self._arcus_http = httpx.AsyncClient(
                timeout=httpx.Timeout(_ARCUS_WRITE_TIMEOUT_SEC, connect=10.0),
                proxy=self.settings.proxy_for("arcus"),
                headers={"User-Agent": "Parallax-Hedge-Arcus/1.0",
                         "Content-Type": "application/json", "Accept": "application/json"},
            )
        return self._arcus_http

    async def aclose(self) -> None:
        if self._arcus_http is not None:
            await self._arcus_http.aclose()
            self._arcus_http = None

    async def _arcus_post(self, path: str, body: dict[str, Any],
                          timestamp: int, signature: str) -> tuple[int, Any]:
        """发一个签过名的 POST，【只发一次】。返回 (HTTP 状态码, JSON)。

        网络层异常原样抛出，由调用方按「结果未知」处理 —— 这里绝不重试。
        """
        _, api_key = self._get_arcus_key()
        client = self._arcus_client()
        response = await client.post(
            f"{self.settings.arcus_api_url}{path}",
            params={"address": self.settings.arcus_address},
            content=json.dumps(body, separators=(",", ":")),
            headers={"X-API-Key": api_key, "X-Timestamp": str(timestamp),
                     "X-Signature": signature},
        )
        try:
            data = response.json()
        except ValueError:
            data = {"error": response.text[:300]}
        return response.status_code, data

    async def set_leverage(
        self, market: dict[str, Any], *, entropy_leverage: int, arcus_leverage: int,
    ) -> tuple[bool, str | None]:
        """开仓前把两边这个市场的杠杆设成任务要的值。

        保证金模式：
          · Arcus 用【全仓】—— 整个 Arcus 账户的钱给这条腿兜底，强平价由程序按
            最坏情况复算（见 arcus.cross_distance）；从逐仓切回全仓交易所总是允许的。
          · Entropy（io 子 dex）只支持【逐仓】—— 每个仓位只拿自己的保证金兜底，
            杠杆直接决定强平距离（约 1/杠杆 − 维持保证金率）。所以 Entropy 的杠杆
            由引擎按开仓门槛自动压低过（见 engine 里的 entropy_safe_leverage）。
        任何一边设置失败都返回 False —— 不知道实际杠杆，就不知道强平走廊有多宽，不开。
        """
        if self.dry_run:
            return True, None
        symbol = market["arcus_symbol"]
        ok, error = await self._set_arcus_leverage(market, int(arcus_leverage))
        if not ok:
            return False, f"Arcus 设置 {symbol} {arcus_leverage}× 全仓失败：{error}"
        name = market["entropy_symbol"]
        try:
            async with self._entropy_lock:
                exchange = await asyncio.to_thread(self._get_entropy_exchange)
                raw = await asyncio.to_thread(
                    exchange.update_leverage, int(entropy_leverage), name, False
                )
        except Exception as exc:  # noqa: BLE001
            return False, f"Entropy 设置 {name} {entropy_leverage}× 逐仓失败：{exc}"
        if not (isinstance(raw, dict) and raw.get("status") == "ok"):
            return False, f"Entropy 设置 {name} {entropy_leverage}× 逐仓被拒：{raw}"
        return True, None

    async def _set_arcus_leverage(self, market: dict[str, Any], leverage: int) -> tuple[bool, str | None]:
        """POST /v1/setLeverage（旧式签名：ts + "setLeverage" + canonicalJSON(body)）。

        200 APPLIED = 已生效；202 ACK = 已转给撮合引擎、还没确认 ——
        ACK 时去 /v1/leverages 查一下，确认杠杆和全仓都到位了才算数。
        """
        try:
            key, _ = self._get_arcus_key()
            body = {
                "address": self.settings.arcus_address,
                "accountIndex": int(self.settings.arcus_account_index),
                "marketId": int(market["arcus_market_id"]),
                "leverage": int(leverage),
                "isolated": False,
            }
            ts = ax.timestamp_ns()
            signature = ax.sign_hex(key, ax.legacy_message(ts, "setLeverage", body))
            status, data = await self._arcus_post("/v1/setLeverage", body, ts, signature)
        except ExchangeError as exc:
            return False, str(exc)
        except Exception as exc:  # noqa: BLE001 —— 网络问题：没设上就不开
            return False, f"请求失败：{exc}"
        state = str((data or {}).get("status") or "").upper() if isinstance(data, dict) else ""
        if status == 200 and state in ("APPLIED", ""):
            return True, None
        if status == 202 or state == "ACK":
            return await self._confirm_arcus_leverage(market, leverage)
        reason = (data or {}).get("rejectReason") if isinstance(data, dict) else None
        return False, f"HTTP {status} {reason or data}"

    async def _confirm_arcus_leverage(self, market: dict[str, Any], leverage: int) -> tuple[bool, str | None]:
        last = None
        for _ in range(4):
            await asyncio.sleep(0.5)
            try:
                payload = await self.market._request(
                    "arcus", "GET", f"{self.settings.arcus_api_url}/v1/leverages",
                    label="/v1/leverages",
                    params={"address": self.settings.arcus_address,
                            "accountIndex": str(self.settings.arcus_account_index),
                            "market": str(int(market["arcus_market_id"]))},
                )
            except Exception as exc:  # noqa: BLE001
                last = str(exc)
                continue
            for row in (payload or {}).get("leverages") or []:
                if int(row.get("marketId", -1)) != int(market["arcus_market_id"]):
                    continue
                last = row
                if int(row.get("leverage") or 0) == int(leverage) and (
                    row.get("isolated") is False
                    or str(row.get("marginMode") or "").upper() == "CROSS"
                ):
                    return True, None
        return False, f"交易所确认超时（最后读到：{last}）"

    async def warm(self) -> None:
        """提前把签名客户端建好，别让它们的初始化延迟落在下单路径上。

        Hyperliquid SDK 构造时要联网拉 meta（同步 requests），丢进线程里做，不卡事件循环。
        """
        if self.dry_run:
            return
        async with self._init_lock:
            await asyncio.to_thread(self._get_entropy_exchange)
            self._get_arcus_key()

    # ── 读仓位 ──────────────────────────────────────
    async def read_positions(self, entropy_symbol: str, arcus_market_id: int) -> tuple[float, float]:
        """返回两边的带符号仓位。读不到时返回 nan —— 调用方必须按
        「可能已成交」处理，不能当成 0。"""
        entropy_acct, arcus_acct = await asyncio.gather(
            self.market.entropy_positions(), self.market.arcus_account(),
            return_exceptions=True,
        )
        entropy = float("nan")
        arcus = float("nan")
        if not isinstance(entropy_acct, Exception) and entropy_acct is not None:
            leg = parse_entropy_position(entropy_acct, entropy_symbol)
            if leg is not None:
                entropy = leg.size
        if not isinstance(arcus_acct, Exception):
            leg = parse_arcus_position(arcus_acct, arcus_market_id)
            if leg is not None:
                arcus = leg.size
        return entropy, arcus

    async def _await_position_change(
        self, entropy_symbol: str, arcus_market_id: int,
        before_entropy: float, requested_signed: float,
    ) -> tuple[float, float, FillVerdict]:
        """轮询直到 Entropy 仓位出现变化，或重试用尽。"""
        entropy = before_entropy
        arcus = float("nan")
        verdict = classify_fill(
            before=before_entropy, after=before_entropy, requested_signed=requested_signed
        )
        for attempt in range(_CONFIRM_RETRIES):
            await asyncio.sleep(_CONFIRM_DELAY_SEC * (1 if attempt == 0 else 1.5))
            entropy, arcus = await self.read_positions(entropy_symbol, arcus_market_id)
            verdict = classify_fill(
                before=before_entropy, after=entropy, requested_signed=requested_signed
            )
            if verdict.is_fill:
                break
        return entropy, arcus, verdict

    async def _await_arcus_change(
        self, entropy_symbol: str, arcus_market_id: int,
        before_arcus: float, requested_signed: float,
    ) -> tuple[float, FillVerdict]:
        """对冲腿发出后，轮询 Arcus 仓位直到出现变化。"""
        after = before_arcus
        verdict = classify_fill(before=before_arcus, after=before_arcus,
                                requested_signed=requested_signed)
        for attempt in range(_ARCUS_CONFIRM_RETRIES):
            await asyncio.sleep(_CONFIRM_DELAY_SEC * (1 if attempt == 0 else 1.2))
            _, after = await self.read_positions(entropy_symbol, arcus_market_id)
            verdict = classify_fill(before=before_arcus, after=after,
                                    requested_signed=requested_signed)
            if verdict.kind == "full" or (verdict.is_fill and math.isfinite(verdict.filled)):
                break
        return after, verdict

    # ── 单腿下单 ────────────────────────────────────
    async def _entropy_ioc(
        self, symbol: str, side: str, quantity: float,
        price: float, decimals: tuple[int, int], reduce_only: bool = False,
    ) -> LegResult:
        """Entropy IOC 限价单（symbol = "io:XXX"）。decimals[0] 必须是 Entropy 自己的 szDecimals ——
        限价的小数位上限是 6 − szDecimals，用两所取小的精度会算宽一档被拒。"""
        size_decimals = int(decimals[0])
        if self.dry_run:
            return LegResult("entropy", True, raw={
                "dry_run": True, "side": side, "quantity": quantity, "price": price,
                "reduce_only": reduce_only,
            })
        aligned = align_quantity(quantity, size_decimals)
        if aligned <= 0:
            return LegResult("entropy", False, submitted=False,
                             error=f"数量 {quantity:g} 对齐后为 0", side=side, requested=quantity)
        try:
            limit = round_entropy_price(price, size_decimals, side)
        except ExchangeError as exc:
            return LegResult("entropy", False, submitted=False, error=str(exc),
                             side=side, requested=aligned)
        async with self._entropy_lock:
            try:
                exchange = await asyncio.to_thread(self._get_entropy_exchange)
            except Exception as exc:  # noqa: BLE001 —— 客户端建不起来：这张单肯定没发
                return LegResult("entropy", False, submitted=False,
                                 error=f"Entropy 下单客户端不可用：{exc}"[:300],
                                 side=side, requested=aligned)
            try:
                raw = await asyncio.to_thread(
                    exchange.order, symbol, side == "buy", aligned, limit,
                    {"limit": {"tif": "Ioc"}}, reduce_only,
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                # 一律变成一条失败的腿，由调用方按仓位判断 + 重试 / 抢救，绝不让异常打断整轮。
                # 连接都没建立起来 / 交易所 4xx 拒收 = 肯定没成交；其它（超时等）= 结果未知。
                not_sent = _is_connect_error(exc)
                return LegResult(
                    "entropy", False, submitted=not not_sent, uncertain=not not_sent,
                    error=f"Entropy 下单{'没发出去' if not_sent else '结果未知'}：{exc}"[:300],
                    side=side, requested=aligned,
                )
        ok, filled, error = parse_entropy_order_response(raw)
        oid, avg_price = entropy_receipt_fill(raw)
        # IOC 没成交 / 被拒 ≠ 下单失败需要抢救：成交与否最终仍【看仓位】
        return LegResult(
            "entropy", ok, raw=raw, error=error, filled=filled,
            side=side, requested=aligned,
            price=avg_price, price_is_estimate=avg_price is None,
            fill_confirmed=ok, order_ref=entropy_order_id(raw),
            # 信封 ok 时每个状态都是定论：filled（成交多少）/ error（拒单，0）/ IOC 剩余撤销（0）
            receipt_fill=isinstance(raw, dict) and raw.get("status") == "ok",
        )

    def build_arcus_order(
        self, market: dict[str, Any], side: str, quantity: float, price: float,
        reduce_only: bool = False, time_in_force: str = "IOC",
    ) -> dict[str, Any]:
        """对齐精度 + 签名 + 组装请求体，但不发送。实盘预检也用它「只签不发」。

        价格按方向对齐到 tick（买往上、卖往下），数量向下对齐到 stepSize。
        """
        key, _ = self._get_arcus_key()
        if time_in_force == "ALO":
            # 挂单价由调用方算好（ax.passive_price，已对齐 tick 且在自己这一侧），
            # 这里不能再按「更激进」取整 —— 往对手方向挪一格可能就变成吃单被拒
            limit = ax.D(price)
            ax.to_units(limit, market["arcus_tick_size"])
        else:
            limit = ax.round_arcus_price(market, price, side)
        qty = ax.align_arcus_quantity(market, quantity)
        if qty <= 0:
            raise ExchangeError(f"数量 {quantity:g} 对齐到 Arcus 步长 {market['arcus_step_size']} 后为 0")
        max_size = float(market.get("arcus_max_order_size") or 0)
        if max_size and float(qty) > max_size:
            raise ExchangeError(f"数量 {qty} 超过 Arcus 单笔上限 {max_size:g}")
        tick_units = ax.to_units(limit, market["arcus_tick_size"])
        step_units = ax.to_units(qty, market["arcus_step_size"])
        ts = ax.timestamp_ns()
        gtt = ax.good_til_us()
        client_id = ax.new_client_id()
        order_side = "SELL" if side == "sell" else "BUY"
        payload = ax.build_place_payload(
            address=self.settings.arcus_address,
            account_index=self.settings.arcus_account_index,
            client_id=client_id, timestamp=ts, good_til_us_value=gtt,
            market_id=int(market["arcus_market_id"]), price_ticks=tick_units,
            quantity_quantums=step_units, reduce_only=reduce_only,
            side=order_side, time_in_force=time_in_force,
        )
        body = {
            "address": self.settings.arcus_address,
            "accountIndex": int(self.settings.arcus_account_index),
            "marketId": int(market["arcus_market_id"]),
            "orderSide": order_side,
            "orderType": "LIMIT",
            "quantity": ax.fmt_decimal(qty),
            "price": ax.fmt_decimal(limit),
            "timeInForce": time_in_force,
            # HTTP 里 goodTilTime 是【微秒】十进制字符串；签名载荷里的 g 是纳秒
            "goodTilTime": str(gtt),
            "reduceOnly": bool(reduce_only),
            "clientId": client_id,
            "timestamp": ts,
        }
        return {
            "body": body, "payload": payload, "timestamp": ts,
            "signature": ax.sign_hex(key, payload), "client_id": client_id,
            "quantity": float(qty), "price": float(limit),
        }

    async def _arcus_ioc(
        self, market: dict[str, Any], side: str, quantity: float,
        price: float, reduce_only: bool = False,
    ) -> LegResult:
        """Arcus IOC 限价单。成交与否最终【看仓位】，回执只作参考。"""
        return await self._arcus_place(market, side, quantity, price, reduce_only, "IOC")

    async def _arcus_place(
        self, market: dict[str, Any], side: str, quantity: float,
        price: float, reduce_only: bool = False, time_in_force: str = "IOC",
    ) -> LegResult:
        """发一张 Arcus 限价单（IOC 吃单 / ALO 只挂单）。只发一次，绝不重试。"""
        if self.dry_run:
            return LegResult("arcus", True, raw={
                "dry_run": True, "side": side, "quantity": quantity, "price": price,
                "reduce_only": reduce_only,
            })
        try:
            order = self.build_arcus_order(market, side, quantity, price, reduce_only,
                                           time_in_force)
        except (ExchangeError, ValueError, KeyError) as exc:
            # 还没发出去：签名 / 精度层面的问题
            return LegResult("arcus", False, submitted=False, error=str(exc),
                             side=side, requested=abs(quantity))
        try:
            status, data = await self._arcus_post(
                "/v1/placeOrder", order["body"], order["timestamp"], order["signature"]
            )
        except Exception as exc:  # noqa: BLE001
            # 超时 / 断流：单子可能已经到了交易所。标记为结果未知，交给仓位判定。
            return LegResult(
                "arcus", False, raw={"clientId": order["client_id"], "error": str(exc)},
                error=f"Arcus 下单请求中断，结果未知（{exc}）",
                side=side, requested=order["quantity"], uncertain=True,
                order_ref=ax.order_ref(None, order["client_id"]),
            )
        receipt = ax.parse_order_response(status, data, order["client_id"])
        raw = {"http": status, "orderId": receipt.order_id, "clientId": receipt.client_id,
               "status": receipt.status, "body": data}
        # 202 时回执里没有成交量；有的话先记上，稍后仍按仓位复核
        filled = receipt.filled or 0.0
        return LegResult(
            "arcus", receipt.accepted, raw=raw, error=receipt.error,
            filled=filled if receipt.accepted else 0.0,
            side=side, requested=order["quantity"],
            order_ref=ax.order_ref(receipt.order_id, receipt.client_id),
            # 被交易所当场拒掉的单不可能成交；没被拒的都有可能成交
            submitted=receipt.accepted or bool(receipt.order_id),
        )

    async def _arcus_cancel(self, market: dict[str, Any], order_id: str) -> tuple[bool, str]:
        """撤一张 Arcus 挂单。返回 (请求是否被受理, 状态)。

        状态 FILLED = 想撤的时候已经成交了 —— 那不是「撤掉了」，是有仓位，
        调用方必须重新读仓位去对冲。所以调用方撤完一律重读仓位，不看这里的状态做决定。
        """
        try:
            key, _ = self._get_arcus_key()
            ts = ax.timestamp_ns()
            payload = ax.build_cancel_payload(
                address=self.settings.arcus_address,
                account_index=self.settings.arcus_account_index,
                timestamp=ts, market_id=int(market["arcus_market_id"]), order_id=str(order_id),
            )
            body = {"kind": "orderId", "orderId": str(order_id),
                    "address": self.settings.arcus_address,
                    "marketId": int(market["arcus_market_id"]),
                    "accountIndex": int(self.settings.arcus_account_index), "timestamp": ts}
            status, data = await self._arcus_post("/v1/cancelOrder", body, ts,
                                                  ax.sign_hex(key, payload))
        except Exception as exc:  # noqa: BLE001
            return False, f"撤单请求失败：{exc}"
        state = str((data or {}).get("status") or "").upper() if isinstance(data, dict) else ""
        return status in (200, 202), state or f"HTTP {status}"

    async def read_arcus_size(self, market_id: int) -> float:
        """只读 Arcus 一个市场的仓位（挂单轮询用）。读不到返回 nan。"""
        try:
            return float(await self.market.arcus_position_size(int(market_id)))
        except Exception:  # noqa: BLE001
            return float("nan")

    # ── 双腿开仓 ────────────────────────────────────
    async def open_pair(
        self, *, market: dict[str, Any], direction: str, quantity: float,
        entropy_price: float, arcus_price: float,
        slippage_bps: float, entropy_decimals: tuple[int, int],
        quotes: dict[str, Any] | None = None,
    ) -> PairResult:
        started = time.monotonic()
        entropy_side, arcus_side = hedge_side(direction)
        quotes = dict(quotes or {})
        quotes["entropy_limit"] = slippage_limit_price(entropy_price, entropy_side, slippage_bps)
        # 记录【真正发出去的】限价，而不是对齐前那个 —— 定位「报单成功零成交」全靠它
        quotes["arcus_limit_raw"] = slippage_limit_price(arcus_price, arcus_side, slippage_bps)
        try:
            quotes["arcus_limit"] = arcus_limit_price(
                market, quotes["arcus_limit_raw"], arcus_side
            )
        except ExchangeError as exc:
            # 价格算不出来就【在下第一单之前】退出。_run_cycle 没有 try/except，
            # 让异常穿出去会打断整轮所有币种的任务。
            return PairResult(
                False, "bad_arcus_price", reason=str(exc),
                dry_run=self.dry_run, quotes=quotes,
                elapsed_ms=(time.monotonic() - started) * 1000,
                notes=["尚未下任何单"],
            )
        quotes["entropy_side"] = entropy_side
        quotes["arcus_side"] = arcus_side
        quotes["slippage_bps"] = slippage_bps
        entropy_symbol = market["entropy_symbol"]
        arcus_id = int(market["arcus_market_id"])
        notes: list[str] = []

        if not self.dry_run:
            # 先把 Arcus 那张单【签好但不发】：私钥不对、精度对不上、超出单笔上限
            # 这类问题必须在下 Entropy 之前暴露。否则 Entropy 成交了才发现 Arcus
            # 下不出去，只能再花一笔去抢救裸腿。
            try:
                self.build_arcus_order(market, arcus_side, quantity, quotes["arcus_limit"])
            except (ExchangeError, ValueError, KeyError) as exc:
                return PairResult(
                    False, "arcus_order_invalid", reason=f"Arcus 这张单签不出来：{exc}",
                    dry_run=False, quotes=quotes,
                    elapsed_ms=(time.monotonic() - started) * 1000,
                    notes=["尚未下任何单"],
                )

        before_entropy, before_arcus = await self.read_positions(entropy_symbol, arcus_id)
        requested_signed = quantity if entropy_side == "buy" else -quantity

        # 第 2 步：先下 Entropy
        entropy = await self._entropy_ioc(
            market["entropy_symbol"], entropy_side, quantity,
            slippage_limit_price(entropy_price, entropy_side, slippage_bps),
            entropy_decimals,
        )
        _stamp(entropy, side=entropy_side, requested=quantity, reference_price=entropy_price)

        if self.dry_run:
            arcus = await self._arcus_ioc(
                market, arcus_side, quantity,
                slippage_limit_price(arcus_price, arcus_side, slippage_bps),
            )
            _stamp(arcus, side=arcus_side, requested=quantity, reference_price=arcus_price)
            _simulate_fill(entropy)
            _simulate_fill(arcus)
            return PairResult(
                True, "dry_run", entropy, arcus, dry_run=True, quotes=quotes,
                elapsed_ms=(time.monotonic() - started) * 1000,
                notes=[f"演练：Entropy {entropy_side} {quantity:g} / Arcus {arcus_side} {quantity:g}"],
                ledger=[("open", entropy), ("open", arcus)],
            )

        # 第 3~4 步：仓位变化 + Hyperliquid 回执（回执里的成交量是撮合引擎给的定论）
        receipt_qty = float(entropy.filled or 0) if entropy.receipt_fill else None
        after_entropy, after_arcus, verdict = await self._await_position_change(
            entropy_symbol, arcus_id, before_entropy, requested_signed
        )
        entropy.filled = 0.0 if verdict.kind == "none" else abs(verdict.filled)
        # 读不到仓位时 filled 是 nan：不算「已证实」，交给成交记录对账
        entropy.fill_confirmed = math.isfinite(entropy.filled)
        if not entropy.fill_confirmed:
            entropy.filled = 0.0
        if receipt_qty is not None and receipt_qty > 0:
            # 回执说成交了，就按回执算 —— 仓位接口慢半拍时也不能当成没成交（那会留下裸腿）
            entropy.filled, entropy.fill_confirmed = receipt_qty, True

        # 第 5 步：没成交 → 根本不向 Arcus 下单
        arcus_untouched = positions_match(after_arcus, before_arcus, quantity)
        receipt_filled = receipt_qty is not None and receipt_qty > 0
        if not verdict.should_hedge and not receipt_filled and arcus_untouched:
            return PairResult(
                False, "entropy_not_filled", entropy,
                LegResult("arcus", False, submitted=False,
                          raw={"blocked_by": "entropy_not_filled"},
                          error="Entropy 未成交，因此未向 Arcus 下单"),
                reason=verdict.reason or entropy.error or "Entropy IOC 未产生仓位变化",
                quotes=quotes,
                elapsed_ms=(time.monotonic() - started) * 1000,
                notes=["两边均无仓位变化，已安全退出"],
                ledger=[("open", entropy)] if entropy.submitted else [],
            )

        # 第 6 步：按【实际成交量】对冲，不是请求量
        hedge_quantity = quantity
        if receipt_filled and receipt_qty < quantity * (1 - 1e-9):
            hedge_quantity = align_quantity(receipt_qty, market["quantity_decimals"])
            notes.append(
                f"Entropy 只成交 {receipt_qty:g}/{quantity:g}，Arcus 按实际成交量对冲"
            )
        elif receipt_filled:
            hedge_quantity = quantity
        elif verdict.kind == "partial" and verdict.filled == verdict.filled:  # 非 nan
            hedge_quantity = align_quantity(abs(verdict.filled), market["quantity_decimals"])
            notes.append(
                f"Entropy 只成交 {hedge_quantity:g}/{quantity:g}，Arcus 按实际成交量对冲"
            )
        if hedge_quantity <= 0:
            hedge_quantity = quantity

        arcus = await self._arcus_ioc(
            market, arcus_side, hedge_quantity,
            slippage_limit_price(arcus_price, arcus_side, slippage_bps),
        )
        _stamp(arcus, side=arcus_side, requested=hedge_quantity, reference_price=arcus_price)

        # Arcus 也必须按【仓位变化】确认成交。报单被接受 ≠ 成交：
        # 上一个版本 2026-09-18 就是只看了回执，程序以为对冲好了，实际留着一条裸腿。
        # 请求中断（结果未知）的也要看仓位 —— 它可能已经成交了。
        arcus_requested = hedge_quantity if arcus_side == "buy" else -hedge_quantity
        if arcus.ok or arcus.uncertain:
            after_arcus2, arcus_verdict = await self._await_arcus_change(
                entropy_symbol, arcus_id, after_arcus, arcus_requested,
            )
            measured = 0.0 if arcus_verdict.kind == "none" else abs(arcus_verdict.filled)
            if math.isfinite(measured):
                arcus.filled = measured
                arcus.fill_confirmed = True
            if arcus_verdict.should_hedge:
                if arcus.uncertain:
                    arcus.ok = True
                    arcus.submitted = True
                    arcus.error = None
                    notes.append("Arcus 下单请求中断，但仓位确认已成交")
            else:
                arcus.ok = False
                arcus.error = (
                    f"Arcus 报单被接受但仓位没有变化（{arcus_verdict.reason}）"
                    if not arcus.uncertain else
                    f"Arcus 下单请求中断，仓位也没有变化（{arcus_verdict.reason}）"
                )

        # 第 7 步：Arcus 没成交 → 立刻抢救 Entropy 那条腿
        if not arcus.ok:
            rescue = await self._flatten(
                market, "entropy", hedge_quantity,
                "sell" if entropy_side == "buy" else "buy",
                entropy_price, slippage_bps, entropy_decimals,
            )
            ledger = [("open", entropy)]
            # 被交易所拒掉的单（没有订单号）不可能有成交，不进账本；
            # 有订单号的带着订单号进账本，交给对账去定
            if arcus.submitted and arcus.order_ref:
                ledger.append(("open", arcus))
            if rescue.submitted:
                ledger.append(("rescue", rescue))
            return PairResult(
                False, "arcus_failed_rescued", entropy, arcus, rescue,
                reason=f"Arcus 下单失败：{arcus.error} —— 已市价平掉 Entropy 那条腿",
                quotes=quotes,
                elapsed_ms=(time.monotonic() - started) * 1000,
                notes=notes + ["Entropy 曾裸露，已抢救" if rescue.ok else "⚠ 抢救失败，Entropy 仍裸露"],
                ledger=ledger,
            )

        return PairResult(
            True, "opened", entropy, arcus, quotes=quotes,
            elapsed_ms=(time.monotonic() - started) * 1000, notes=notes,
            ledger=[("open", entropy), ("open", arcus)],
        )

    # ── 平仓 ────────────────────────────────────────
    async def close_pair(
        self, *, market: dict[str, Any], entropy_size: float, arcus_size: float,
        entropy_price: float, arcus_price: float, slippage_bps: float,
        entropy_decimals: tuple[int, int],
    ) -> PairResult:
        """双腿同时平掉。两条腿都用 reduce_only，防止方向算错时反手开仓。

        成交同样【只认仓位变化】：两条腿都要在仓位上看到归零才算平掉。
        （上一个版本 2026-09-19 之前平仓只看报单返回，一夜 22 次平仓的
        Entropy 腿全记成 filled=0 —— 那是「没测」，不是「没成交」。）
        """
        started = time.monotonic()
        entropy_side, arcus_side = closing_sides(entropy_size, arcus_size)

        async def already_flat(venue: str) -> LegResult:
            # 已经是 0 的腿不下单 —— 发一张数量 0 的单只会换来一条报错
            return LegResult(venue, True, submitted=False,
                             raw={"skipped": "already_flat"}, fill_confirmed=True)

        entropy_task = (
            self._entropy_ioc(
                market["entropy_symbol"], entropy_side, abs(entropy_size),
                slippage_limit_price(entropy_price, entropy_side, slippage_bps),
                entropy_decimals, reduce_only=True,
            ) if _is_open(entropy_size) else already_flat("entropy")
        )
        arcus_task = (
            self._arcus_ioc(
                market, arcus_side, abs(arcus_size),
                slippage_limit_price(arcus_price, arcus_side, slippage_bps),
                reduce_only=True,
            ) if _is_open(arcus_size) else already_flat("arcus")
        )
        entropy, arcus = await asyncio.gather(entropy_task, arcus_task)
        _stamp(entropy, side=entropy_side, requested=abs(entropy_size),
               reference_price=entropy_price)
        _stamp(arcus, side=arcus_side, requested=abs(arcus_size),
               reference_price=arcus_price)
        ledger = [("close", leg) for leg in (entropy, arcus) if leg.submitted or leg.uncertain]

        if self.dry_run:
            _simulate_fill(entropy)
            _simulate_fill(arcus)
            return PairResult(
                True, "closed", entropy, arcus, dry_run=True,
                elapsed_ms=(time.monotonic() - started) * 1000, ledger=ledger,
            )

        after_entropy, after_arcus = await self._await_flat(
            market["entropy_symbol"], int(market["arcus_market_id"]),
            entropy_size, arcus_size,
        )
        still_open: list[str] = []
        for name, leg, before, after in (
            ("Entropy", entropy, entropy_size, after_entropy),
            ("Arcus", arcus, arcus_size, after_arcus),
        ):
            if math.isfinite(after) and (leg.submitted or leg.uncertain):
                # reduce_only 不会反手，所以成交量就是仓位绝对值缩小了多少
                leg.filled = max(0.0, abs(before) - abs(after))
                leg.fill_confirmed = True
            if not (_is_flat(after, before)
                    or (not leg.submitted and not leg.uncertain and not _is_open(after))):
                still_open.append(name)
        ok = not still_open
        return PairResult(
            ok, "closed" if ok else "close_partial", entropy, arcus,
            reason=None if ok else (
                f"{'、'.join(still_open)} 腿平仓后仍有仓位（或读不到仓位）"
                f" —— 不标记为已平，下一轮会重新检查并处理孤腿"
            ),
            dry_run=False,
            elapsed_ms=(time.monotonic() - started) * 1000,
            notes=[f"平仓后仓位：Entropy {after_entropy:g} / Arcus {after_arcus:g}"],
            ledger=ledger,
        )

    async def _await_flat(
        self, entropy_symbol: str, arcus_market_id: int,
        entropy_before: float, arcus_before: float,
    ) -> tuple[float, float]:
        """轮询直到两条腿都归零，或重试用尽。节奏和开仓确认一致。"""
        after_entropy = after_arcus = float("nan")
        for attempt in range(_CONFIRM_RETRIES):
            await asyncio.sleep(_CONFIRM_DELAY_SEC * (1 if attempt == 0 else 1.5))
            after_entropy, after_arcus = await self.read_positions(
                entropy_symbol, arcus_market_id
            )
            entropy_done = _is_flat(after_entropy, entropy_before) or (
                not _is_open(entropy_before) and not _is_open(after_entropy)
            )
            arcus_done = _is_flat(after_arcus, arcus_before) or (
                not _is_open(arcus_before) and not _is_open(after_arcus)
            )
            if entropy_done and arcus_done:
                break
        return after_entropy, after_arcus

    async def _flatten(
        self, market: dict[str, Any], venue: str, quantity: float, side: str,
        price: float, slippage_bps: float, entropy_decimals: tuple[int, int],
    ) -> LegResult:
        """单腿市价平掉 —— 只用于抢救裸腿，滑点放宽到 3 倍。"""
        wide = slippage_bps * 3
        if venue == "entropy":
            leg = await self._entropy_ioc(
                market["entropy_symbol"], side, quantity,
                slippage_limit_price(price, side, wide), entropy_decimals,
                reduce_only=True,
            )
        else:
            leg = await self._arcus_ioc(
                market, side, quantity,
                slippage_limit_price(price, side, wide), reduce_only=True,
            )
        _stamp(leg, side=side, requested=quantity, reference_price=price)
        if self.dry_run:
            _simulate_fill(leg)
        return leg

    async def flatten_orphan(
        self, *, market: dict[str, Any], venue: str, size: float,
        price: float, slippage_bps: float, entropy_decimals: tuple[int, int],
    ) -> LegResult:
        """孤腿抢救：无条件市价平掉。这是整套设计里优先级最高的动作。"""
        side = "sell" if size > 0 else "buy"
        return await self._flatten(
            market, venue, abs(size), side, price, slippage_bps, entropy_decimals
        )


def _is_connect_error(exc: BaseException) -> bool:
    """这张单【肯定没到撮合】：连接阶段就失败（DNS / TCP / TLS / 代理握手），
    或者交易所直接 4xx 拒收（SDK 的 ClientError）。超时、5xx 都算结果未知。"""
    name = type(exc).__name__
    if name in ("ProxyError", "ConnectTimeout", "SSLError", "ProxyConnectionError",
                "ClientError", "InvalidSchema", "InvalidURL", "MissingSchema"):
        return True
    text = str(exc)
    return any(marker in text for marker in (
        "NewConnectionError", "Failed to establish a new connection",
        "Name or service not known", "getaddrinfo failed", "Cannot connect to host",
        "Missing dependencies for SOCKS support",
    ))


def entropy_proxies(proxy: str | None) -> dict[str, str] | None:
    """requests 用的代理字典。socks5:// 改成 socks5h://（域名交给代理解析，防 DNS 污染）。"""
    if not proxy:
        return None
    url = proxy
    if url.lower().startswith("socks5://"):
        url = "socks5h://" + url[len("socks5://"):]
    return {"http": url, "https": url}


def build_entropy_exchange(settings: Settings) -> Any:
    """建 Hyperliquid SDK 的 Exchange，并让它【从构造开始】就走 Entropy 的代理。

    SDK 内部用 requests.Session：构造时就会请求 /info 拉 meta。只在构造后改 session 的代理
    来不及 —— 那一次请求已经直连出去了（另一个交易所的 SDK 2026-10-01 就出过绕过代理的事，
    面板正常、唯独下单连不上）。所以构造期间临时把新建的 Session 默认带上代理，构造完再
    显式设一遍 exchange / info 两个 session 的代理。
    """
    if not settings.entropy_private_key:
        raise ExchangeError("缺少 HYPERLIQUID_PRIVATE_KEY")
    if not settings.entropy_configured:
        raise ExchangeError("HYPERLIQUID_ACCOUNT_ADDRESS 必须是 0x 开头的 40 位钱包公开地址")
    try:
        import eth_account
        import requests
        from hyperliquid.exchange import Exchange
    except ImportError as exc:
        raise ExchangeError("未安装 Hyperliquid 实盘依赖（hyperliquid-python-sdk）") from exc
    try:
        wallet = eth_account.Account.from_key(settings.entropy_private_key)
    except Exception as exc:  # noqa: BLE001 —— 不把私钥内容带进报错
        raise ExchangeError("HYPERLIQUID_PRIVATE_KEY 不是有效的私钥") from exc
    proxies = entropy_proxies(settings.proxy_for("entropy"))
    if proxies and proxies["https"].lower().startswith("socks"):
        try:
            import socks  # noqa: F401 —— requests[socks] 提供
        except ImportError as exc:
            raise ExchangeError(
                "Entropy 配了 socks5 代理，但没装 PySocks —— 重新运行一键启动.bat 会自动安装"
            ) from exc

    original_init = requests.Session.__init__

    def patched_init(self: Any, *args: Any, **kwargs: Any) -> None:
        original_init(self, *args, **kwargs)
        if proxies:
            self.proxies.update(proxies)
            self.trust_env = False

    requests.Session.__init__ = patched_init  # type: ignore[method-assign]
    try:
        exchange = Exchange(
            wallet, settings.entropy_api_url,
            account_address=settings.entropy_address,
            perp_dexs=[ENTROPY_DEX],
            timeout=_ENTROPY_WRITE_TIMEOUT_SEC,
        )
    finally:
        requests.Session.__init__ = original_init  # type: ignore[method-assign]
    apply_entropy_proxy(exchange, proxies)
    return exchange


def apply_entropy_proxy(exchange: Any, proxies: dict[str, str] | None) -> None:
    """把代理设到 SDK 的两个 requests.Session 上（Exchange 自己的、它内部 Info 的）。"""
    if not proxies:
        return
    for holder in (exchange, getattr(exchange, "info", None)):
        session = getattr(holder, "session", None)
        if session is not None:
            session.proxies.update(proxies)
            session.trust_env = False
