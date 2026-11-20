"""两个所的行情 / 账户读取：共有币种、资金费率、盘口、持仓、成交记录。

这里没有签名下单（在 execution.py）。Entropy 是 Hyperliquid 的 HIP-3 子 dex "io"，
所有读接口都是 POST /info，只要公开地址。

代理（独立 IP）在这一层落地：每个所一个 httpx.AsyncClient，各自带自己的
proxy。注意不要把空字符串传给 httpx —— 它会当成非法代理地址直接抛错，
而不是忽略。config.Settings.proxy_for() 已经把空值归一成 None。
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from .arcus import step_decimals
from .config import ENTROPY_DEX, Settings
from .books import Book, aggregate_levels
from .funding import FundingRow

# ⚠ 两个所的费率【周期不一样】，这是本项目最容易出错也最致命的一处。
#
# Arcus：官方文档 concepts/perpetuals/funding 明写「每小时收一次」，
#   /v1/markets 里的 fundingRate / nextFundingRate 本身就是【每小时】费率，
#   基准利率 0.01%/8h 按小时收 1/8（= 0.0000125），硬顶 ±4%/小时。
#   2026-09-03 实测 ETH 的 fundingRate 正好是 0.0000125 —— 就是这个基准利率。
#
# Entropy（Hyperliquid io 子 dex）：metaAndAssetCtxs 的 funding 是【每小时】费率（官方文档），
#   和 Arcus 同一个周期。
#
# 早期版本的教训：周期差 8 倍会把开仓方向判反，而合理性闸门拦不住 ——
# 所以周期必须逐所写死并注明依据，不能想当然。
ARCUS_FUNDING_INTERVAL_SEC = 3600
ENTROPY_FUNDING_INTERVAL_SEC = 3600

# 走住宅代理时偶尔会慢，给足超时并重试；4xx 重试没有意义，只重试网络类错误。
_RETRIES = 3
_RETRY_BACKOFF_SEC = 0.6

# Hyperliquid 的 info 接口按 IP 计权重（每分钟 1200）：metaAndAssetCtxs 20、
# clearinghouseState 2、l2Book 2、userFills 20。市场列表一轮里好几处要用，短缓存。
_ENTROPY_META_TTL_SEC = 8.0
# Hyperliquid 规定单笔订单金额至少 10 USDC
ENTROPY_MIN_ORDER_USD = 10.0

# Arcus 读接口按 IP 计权重：每分钟 1500。/v1/markets 和 /v1/fills 一次 20，
# account / positions 一次 2。/v1/markets 在一轮里会被好几处用到，
# 这里做个短缓存，同一轮内只真打一次。
_ARCUS_MARKETS_TTL_SEC = 8.0

class ExchangeError(RuntimeError):
    pass


class MarketClient:
    """两个所的只读客户端。每个所独立 httpx client，因而可以独立走代理。"""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        timeout = httpx.Timeout(settings.funding_timeout_seconds,
                                connect=min(15.0, settings.funding_timeout_seconds))
        self._clients: dict[str, httpx.AsyncClient] = {}
        for venue in ("arcus", "entropy"):
            self._clients[venue] = httpx.AsyncClient(
                timeout=timeout,
                proxy=settings.proxy_for(venue),
                headers={"User-Agent": "Parallax-Hedge-Arcus/1.0", "Accept": "application/json"},
                follow_redirects=True,
                # The UI's direct/independent/shared proxy choice must be the
                # transport actually used. Windows HTTP_PROXY/ALL_PROXY must
                # not silently override a saved direct connection.
                trust_env=False,
            )
        self._common_cache: list[dict[str, Any]] = []
        self._common_cached_at = 0.0
        self._arcus_markets: tuple[float, list[dict[str, Any]]] | None = None
        self._arcus_markets_lock = asyncio.Lock()
        self._entropy_meta: tuple[float, list[dict[str, Any]], list[dict[str, Any]]] | None = None
        self._entropy_meta_lock = asyncio.Lock()
        self._arcus_markets_task: asyncio.Task | None = None
        self._entropy_meta_task: asyncio.Task | None = None

    async def aclose(self) -> None:
        tasks = [task for task in (self._arcus_markets_task, self._entropy_meta_task)
                 if task is not None]
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await asyncio.gather(
            *(c.aclose() for c in self._clients.values()), return_exceptions=True
        )

    async def _request(
        self, venue: str, method: str, url: str, *, label: str, **kwargs: Any
    ) -> Any:
        return await self._request_inner(venue, method, url, label=label, **kwargs)

    async def _request_inner(
        self, venue: str, method: str, url: str, *, label: str,
        allow_404: bool = False, **kwargs: Any
    ) -> Any:
        client = self._clients[venue]
        last: Exception | None = None
        # FUNDING_TIMEOUT_SECONDS is the complete read budget, not a per-attempt
        # budget that could triple, then queue every waiter behind a metadata
        # lock. Each retry gets a share so a transient failure can recover even
        # in the shorter account-view deadline.
        budget = max(0.1, float(self.settings.funding_timeout_seconds))
        deadline = time.monotonic() + budget
        attempts = 0
        for attempt in range(_RETRIES):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            attempts += 1
            attempt_budget = remaining / (_RETRIES - attempt)
            try:
                async with asyncio.timeout(attempt_budget):
                    response = await client.request(method, url, **kwargs)
                if allow_404 and response.status_code == 404:
                    return None
                if response.status_code >= 400:
                    # 4xx 是我们请求写错了，重试只会浪费时间
                    if response.status_code < 500:
                        raise ExchangeError(
                            f"{venue} {label} 返回 HTTP {response.status_code}："
                            f"{response.text[:200]}"
                        )
                    raise httpx.HTTPStatusError(
                        f"HTTP {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                return response.json()
            except ExchangeError:
                raise
            except (httpx.TransportError, httpx.HTTPStatusError, TimeoutError) as exc:
                last = exc
                if attempt + 1 < _RETRIES:
                    delay = min(_RETRY_BACKOFF_SEC * (attempt + 1),
                                max(0, deadline - time.monotonic()) / 4)
                    await asyncio.sleep(delay)
            except (ValueError, TypeError) as exc:
                # Invalid JSON/shape is not a network retry and should not hide
                # the original endpoint behind a generic blank timeout.
                raise ExchangeError(f"{venue} {label} 返回了无法解析的 JSON 数据") from exc
        # asyncio.timeout uses CancelledError internally; report the outward
        # timeout, not its implementation cause as a spurious cancellation.
        detail = last
        message = str(detail).strip() if detail else ""
        if not message:
            message = type(detail).__name__ if detail else "请求超时"
        raise ExchangeError(f"{venue} {label} 请求失败（{attempts} 次尝试，"
                            f"总时限 {budget:g} 秒）：{message}") from last

    # ── Arcus 市场列表（费率 / 标记价 / 保证金参数都在这一个接口里）──
    async def arcus_markets(self) -> list[dict[str, Any]]:
        """GET /v1/markets 的原始行，短缓存。

        同一轮里「共有币种」「资金费率」都要它；每次 20 权重，分开打既浪费
        又容易撞上共用 IP 的限流。
        """
        now = time.monotonic()
        if self._arcus_markets and now - self._arcus_markets[0] < _ARCUS_MARKETS_TTL_SEC:
            return self._arcus_markets[1]

        async def fetch():
            payload = await self._request(
                "arcus", "GET", f"{self.settings.arcus_api_url}/v1/markets",
                label="/v1/markets",
            )
            rows = payload.get("markets") if isinstance(payload, dict) else payload
            if not isinstance(rows, list) or not rows:
                raise ExchangeError("Arcus /v1/markets 没有返回市场列表")
            self._arcus_markets = (time.monotonic(), rows)
            return rows

        async with self._arcus_markets_lock:
            if self._arcus_markets_task is None or self._arcus_markets_task.done():
                self._arcus_markets_task = asyncio.create_task(fetch())
                self._arcus_markets_task.add_done_callback(_consume_task_error)
            task = self._arcus_markets_task
        # A failed shared read is returned to all waiters. Holding the lock
        # during I/O instead starts one full retry sequence for every waiter.
        return await asyncio.shield(task)

    # ── 共有币种 ────────────────────────────────────────
    async def common_markets(self, *, force: bool = False) -> list[dict[str, Any]]:
        """两所都在交易的活跃永续。

        对齐规则：Arcus 的 baseAsset（SNDK-USD 的 SNDK）与 Entropy 去掉 "io:" 前缀后的名字比对。
        Arcus 只要 type=PERPETUAL 且 status=ONLINE；Entropy 去掉已下架的。

        同名不等于同一个标的 —— 开仓前引擎还会比一次两边盘口中价，
        相差太大就拒绝开仓（见 engine._apply 的基差闸门）。
        """
        now = time.monotonic()
        if not force and self._common_cache and now - self._common_cached_at < 300:
            return [dict(item) for item in self._common_cache]

        (universe, _ctxs), arcus_rows = await asyncio.gather(
            self.entropy_meta(), self.arcus_markets(),
        )

        entropy_by_base: dict[str, tuple[int, dict[str, Any]]] = {}
        for index, row in enumerate(universe):
            if not isinstance(row, dict) or bool(row.get("isDelisted")):
                continue
            name = str(row.get("name") or "")
            if not name:
                continue
            entropy_by_base[name.split(":", 1)[-1].upper()] = (index, row)

        result: list[dict[str, Any]] = []
        for raw in arcus_rows:
            market = arcus_market_fields(raw)
            if market is None:
                continue
            base = market["asset"]
            hit = entropy_by_base.get(base)
            if not hit:
                continue
            index, entropy = hit
            size_decimals = int(entropy.get("szDecimals") or 0)
            arcus_decimals = market["arcus_size_decimals"]
            quantity_decimals = min(size_decimals, arcus_decimals)
            entropy_max = int(entropy.get("maxLeverage") or 1)
            minimum = max(market["arcus_min_order_size"], 10 ** (-quantity_decimals))
            min_notional = max(ENTROPY_MIN_ORDER_USD, market["arcus_min_notional"])
            result.append(
                {
                    **market,
                    "display_name": f"{base} · {entropy.get('name')} / {market['arcus_symbol']}",
                    "entropy_symbol": str(entropy.get("name")),
                    # io 子 dex 里的下标（metaAndAssetCtxs 的两个数组按它一一对应）
                    "entropy_market_index": index,
                    "min_base_quantity": minimum,
                    "min_notional": min_notional,
                    # Entropy 自己的最小下单量 / 金额 —— 挂单模式下对冲零碎成交时要用
                    "entropy_min_base": 10 ** (-size_decimals),
                    "entropy_min_quote": ENTROPY_MIN_ORDER_USD,
                    "quantity_decimals": quantity_decimals,
                    # Entropy 自己的 szDecimals。限价的小数位上限是 6 - szDecimals，
                    # 用 quantity_decimals（两所取 min）去算会算宽，直接被拒单。
                    "entropy_size_decimals": size_decimals,
                    "entropy_max_leverage": entropy_max,
                    # 逐仓维持保证金率 = 最大杠杆下初始保证金率的一半（Hyperliquid 规则）
                    "entropy_mmf": 1.0 / (2.0 * entropy_max) if entropy_max > 0 else None,
                    "entropy_only_isolated": bool(entropy.get("onlyIsolated")),
                }
            )

        if not result:
            raise ExchangeError("当前没有发现 Entropy 与 Arcus 共同的可交易永续市场")
        result.sort(key=lambda item: item["asset"])
        self._common_cache = result
        self._common_cached_at = time.monotonic()
        return [dict(item) for item in result]

    # ── 资金费率 ────────────────────────────────────────
    async def arcus_funding(self) -> tuple[dict[str, FundingRow], dict[str, float]]:
        """Arcus 每个市场的每小时费率（按 marketDisplayName 索引）+ 标记价。

        fundingRate 是上一期实收，nextFundingRate 是下一期预测 ——
        开仓看的是「下一期会收 / 付多少」，所以预测值放进 next_rate，优先用它。
        """
        rows = await self.arcus_markets()
        now = time.time()
        out: dict[str, FundingRow] = {}
        marks: dict[str, float] = {}
        for raw in rows:
            if str(raw.get("type") or "PERPETUAL").upper() != "PERPETUAL":
                continue
            name = str(raw.get("marketDisplayName") or "")
            if not name:
                continue
            mark = _to_float(raw.get("markPrice")) or _to_float(raw.get("oraclePrice"))
            if mark and mark > 0:
                marks[name] = mark
            rate = _to_float(raw.get("fundingRate"))
            next_rate = _to_float(raw.get("nextFundingRate"))
            if rate is None and next_rate is None:
                continue
            out[name] = FundingRow(
                venue="arcus",
                symbol=str(raw.get("baseAsset") or name.split("-")[0]).upper(),
                rate=rate if rate is not None else next_rate,
                next_rate=next_rate,
                interval_sec=ARCUS_FUNDING_INTERVAL_SEC,
                raw_symbol=name,
                fetched_at=now,
            )
        if not out:
            raise ExchangeError("Arcus 没有返回任何可用的资金费率")
        return out, marks

    async def entropy_meta(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """POST /info {"type":"metaAndAssetCtxs","dex":"io"} —— (universe, assetCtxs)，短缓存。

        两个数组【按下标一一对应】。漏带 dex="io" 会安静地拿到主盘数据。
        """
        now = time.monotonic()
        if self._entropy_meta and now - self._entropy_meta[0] < _ENTROPY_META_TTL_SEC:
            return self._entropy_meta[1], self._entropy_meta[2]

        async def fetch():
            payload = await self._request(
                "entropy", "POST", f"{self.settings.entropy_api_url}/info",
                label="info:metaAndAssetCtxs",
                json={"type": "metaAndAssetCtxs", "dex": ENTROPY_DEX},
            )
            if not isinstance(payload, list) or len(payload) < 2:
                raise ExchangeError("Entropy 返回了无法识别的 metaAndAssetCtxs 结构")
            universe = (payload[0] or {}).get("universe") or []
            contexts = payload[1] or []
            if not universe:
                raise ExchangeError("Entropy 没有返回任何市场")
            self._entropy_meta = (time.monotonic(), universe, contexts)
            return universe, contexts

        async with self._entropy_meta_lock:
            if self._entropy_meta_task is None or self._entropy_meta_task.done():
                self._entropy_meta_task = asyncio.create_task(fetch())
                self._entropy_meta_task.add_done_callback(_consume_task_error)
            task = self._entropy_meta_task
        return await asyncio.shield(task)

    async def entropy_funding(self) -> dict[int, FundingRow]:
        """Entropy(io) 每个市场的当期每小时费率，按 io 子 dex 里的下标索引。"""
        universe, contexts = await self.entropy_meta()
        now = time.time()
        out: dict[int, FundingRow] = {}
        for index, market in enumerate(universe):
            if index >= len(contexts):
                break
            name = str((market or {}).get("name") or "")
            rate = _to_float((contexts[index] or {}).get("funding"))
            if not name or rate is None:
                continue
            out[index] = FundingRow(
                venue="entropy",
                symbol=name.split(":", 1)[-1].upper(),
                rate=rate,
                interval_sec=ENTROPY_FUNDING_INTERVAL_SEC,
                raw_symbol=name,
                fetched_at=now,
            )
        if not out:
            raise ExchangeError("Entropy 没有返回任何可用的资金费率")
        return out

    async def entropy_marks(self) -> dict[str, float]:
        """io 子 dex 每个市场的标记价，按 "io:XXX" 原名索引。"""
        universe, contexts = await self.entropy_meta()
        marks: dict[str, float] = {}
        for index, market in enumerate(universe):
            if index >= len(contexts):
                break
            mark = _to_float((contexts[index] or {}).get("markPx"))
            if mark and mark > 0:
                marks[str((market or {}).get("name") or "")] = mark
        return marks

    # ── 订单簿 ──────────────────────────────────────
    async def entropy_book(self, market_id: int | None, symbol: str, limit: int = 100) -> Book:
        """l2Book 的 coin 直接用带 io: 前缀的市场名（market_id 只为和调用方签名一致，用不到）。
        Hyperliquid 每边固定给 20 档，limit 不起作用。"""
        payload = await self._request(
            "entropy", "POST", f"{self.settings.entropy_api_url}/info",
            label="info:l2Book", json={"type": "l2Book", "coin": symbol},
        )
        levels = (payload or {}).get("levels") if isinstance(payload, dict) else None
        if not isinstance(levels, list) or len(levels) != 2:
            raise ExchangeError("Entropy 返回了无法识别的订单簿")
        return Book(
            venue="entropy", symbol=symbol,
            bids=aggregate_levels(levels[0], descending=True),
            asks=aggregate_levels(levels[1], descending=False),
        )

    async def arcus_book(self, symbol: str, levels: int = 50) -> Book:
        """GET /v1/l2OrderBook/{市场名}?nLevels= —— 档位可能是 [价, 量] 也可能是对象。"""
        payload = await self._request(
            "arcus", "GET",
            f"{self.settings.arcus_api_url}/v1/l2OrderBook/{symbol}",
            label="/v1/l2OrderBook", params={"nLevels": max(1, min(100, int(levels)))},
        )
        if not isinstance(payload, dict):
            raise ExchangeError("Arcus 返回了无法识别的订单簿")
        return Book(
            venue="arcus", symbol=symbol,
            bids=aggregate_levels(payload.get("bids"), descending=True),
            asks=aggregate_levels(payload.get("asks"), descending=False),
        )

    async def arcus_bbo(self, symbol: str) -> tuple[float | None, float | None]:
        """GET /v1/bbo/{市场名} —— 只要买一卖一，2 权重，挂单时反复看盘口用它。"""
        payload = await self._request(
            "arcus", "GET", f"{self.settings.arcus_api_url}/v1/bbo/{symbol}", label="/v1/bbo",
        )

        def px(side: Any) -> float | None:
            if isinstance(side, dict):
                return _to_float(side.get("price"))
            return _to_float(side)
        body = payload if isinstance(payload, dict) else {}
        return px(body.get("bestBid")), px(body.get("bestAsk"))

    async def arcus_position_size(self, market_id: int) -> float:
        """只查一个市场的 Arcus 仓位（/v1/positions?market=，2 权重）。挂单时轮询成交用。
        读不到时抛异常 —— 调用方必须当成「不知道」，不能当成 0。"""
        payload = await self._request(
            "arcus", "GET", f"{self.settings.arcus_api_url}/v1/positions",
            label="/v1/positions",
            params={"address": self.settings.arcus_address,
                    "accountIndex": str(self.settings.arcus_account_index),
                    "market": str(int(market_id))},
            allow_404=True,
        )
        rows = _position_rows((payload or {}).get("positions") if isinstance(payload, dict) else None,
                              self.settings.arcus_account_index)
        for row in rows:
            try:
                if int(row.get("marketId")) != int(market_id):
                    continue
            except (TypeError, ValueError):
                continue
            size = _to_float(row.get("size")) or 0.0
            if str(row.get("side") or "").upper() == "SHORT" and size > 0:
                size = -size
            return size
        return 0.0

    async def arcus_open_orders(self, market_id: int) -> list[dict[str, Any]]:
        """本账户在这个市场上还挂着的单（20 权重，只在挂单开始前和撤单确认时用）。"""
        payload = await self._request(
            "arcus", "GET", f"{self.settings.arcus_api_url}/v1/openOrders",
            label="/v1/openOrders",
            params={"address": self.settings.arcus_address,
                    "accountIndex": str(self.settings.arcus_account_index),
                    "market": str(int(market_id)), "status": "OPEN"},
        )
        rows = payload.get("orders") if isinstance(payload, dict) else payload
        return [r for r in rows or [] if isinstance(r, dict)]

    # ── 账户（只读，只要公开地址，不签名）────────────────
    async def arcus_account(self) -> dict[str, Any] | None:
        """账户快照 = /v1/account（权益、可用）+ /v1/positions（持仓）。

        两个都是 2 权重的小接口。持仓单独再拉一次而不是只用 account 里带的，
        是实盘验证过的口径（只认 /v1/positions）。
        新地址还没入金时 /v1/account 会是 404 —— 那不是故障，是「空账户」。
        """
        if not self.settings.arcus_configured:
            return None
        params = {
            "address": self.settings.arcus_address,
            "accountIndex": str(self.settings.arcus_account_index),
        }
        base = self.settings.arcus_api_url
        account, positions = await asyncio.gather(
            self._request("arcus", "GET", f"{base}/v1/account", label="/v1/account",
                          params=params, allow_404=True),
            self._request("arcus", "GET", f"{base}/v1/positions", label="/v1/positions",
                          params=params, allow_404=True),
        )
        if account is None:
            account = {"equity": "0", "freeCollateral": "0", "positions": {}, "_empty": True}
        if not isinstance(account, dict):
            raise ExchangeError("Arcus 返回了无法识别的账户数据")
        if isinstance(account.get("account"), dict):
            account = account["account"]
        result = dict(account)
        rows = (positions or {}).get("positions") if isinstance(positions, dict) else None
        if rows is None:
            rows = account.get("positions")
        result["_positions"] = _position_rows(rows, self.settings.arcus_account_index)
        return result

    async def entropy_account(self) -> dict[str, Any] | None:
        """账户快照：只要公开地址，不签名。

        账户模式和持仓必须读取，统一账户还必须读取现货抵押品，不能只读 clearinghouseState：
        统一账户 / 组合保证金模式下，per-DEX 的 withdrawable 可以【合法地是 0】，
        真正的抵押品在 spotClearinghouseState 里。只看第一个接口会算出
        「没有可用保证金」，从而永远开不了仓。（实盘验证过的口径）
        """
        if not self.settings.entropy_configured:
            return None
        address = self.settings.entropy_address

        async def info(payload: dict[str, Any], label: str) -> Any:
            return await self._request(
                "entropy", "POST", f"{self.settings.entropy_api_url}/info",
                label=label, json=payload,
            )

        # Spot collateral is mandatory only for unified/portfolio accounts.
        # Start it concurrently, but do not make a standard account's successful
        # position read wait for an unrelated slow spot request.
        spot_task = asyncio.create_task(info(
            {"type": "spotClearinghouseState", "user": address},
            "info:spotClearinghouseState"))
        try:
            state, abstraction = await asyncio.gather(
                info({"type": "clearinghouseState", "user": address, "dex": ENTROPY_DEX},
                     "info:clearinghouseState"),
                info({"type": "userAbstraction", "user": address}, "info:userAbstraction"),
                return_exceptions=True,
            )
            if isinstance(state, Exception):
                raise state
            if not isinstance(state, dict):
                raise ExchangeError("Entropy 返回了无法识别的账户数据")
            if isinstance(abstraction, Exception):
                raise ExchangeError(f"Entropy 账户模式读取失败：{abstraction}") from abstraction
            if not isinstance(abstraction, str):
                raise ExchangeError("Entropy 返回了无法识别的账户模式")
            result = dict(state)
            result["_abstraction"] = abstraction
            if abstraction in {"unifiedAccount", "portfolioMargin"}:
                spot = await spot_task
                if not isinstance(spot, dict) or not isinstance(spot.get("balances"), list):
                    raise ExchangeError("Entropy 统一账户没有返回现货抵押品，禁止按零余额处理")
                result["_spot_state"] = spot
            return result
        finally:
            if not spot_task.done():
                spot_task.cancel()
            await asyncio.gather(spot_task, return_exceptions=True)

    async def entropy_positions(self) -> dict[str, Any] | None:
        """只查 io 子 dex 的 clearinghouseState（2 权重）—— 挂单对冲时轮询仓位用。"""
        if not self.settings.entropy_configured:
            return None
        payload = await self._request(
            "entropy", "POST", f"{self.settings.entropy_api_url}/info",
            label="info:clearinghouseState",
            json={"type": "clearinghouseState", "user": self.settings.entropy_address,
                  "dex": ENTROPY_DEX},
        )
        if not isinstance(payload, dict):
            raise ExchangeError("Entropy 返回了无法识别的账户数据")
        return payload

    async def entropy_market_details(self, market_id: int) -> dict[str, Any]:
        """Entropy 某个市场的杠杆上限和维持保证金率（来自 meta，短缓存）。

        maintenance_margin_fraction 是【小数】（0.05 = 5%）。
        """
        universe, _ = await self.entropy_meta()
        if not 0 <= int(market_id) < len(universe):
            raise ExchangeError(f"Entropy 找不到下标 {market_id} 的市场")
        row = universe[int(market_id)] or {}
        max_leverage = _to_float(row.get("maxLeverage"))
        return {
            "max_leverage": max_leverage,
            "maintenance_margin_fraction": (1.0 / (2.0 * max_leverage)) if max_leverage else None,
            "only_isolated": bool(row.get("onlyIsolated")),
        }

    # ── 成交记录（账本对账用）──────────────────────────
    async def arcus_fills(self, since: float, market_id: int | None = None) -> list[dict[str, Any]]:
        """/v1/fills：本账户从 since（epoch 秒）起的成交，单页最多 1000 条。只要公开地址。"""
        if not self.settings.arcus_configured:
            return []
        params: dict[str, Any] = {
            "address": self.settings.arcus_address,
            "accountIndex": str(self.settings.arcus_account_index),
            "from": str(int(max(0.0, since) * 1_000_000)),
            "limit": "1000",
        }
        if market_id is not None:
            params["market"] = str(int(market_id))
        payload = await self._request(
            "arcus", "GET", f"{self.settings.arcus_api_url}/v1/fills",
            label="/v1/fills", params=params,
        )
        rows = payload.get("fills") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise ExchangeError("Arcus 返回了无法识别的成交记录")
        return rows

    async def entropy_user_fills(self) -> list[dict[str, Any]]:
        """最近的成交（交易所最多给 2000 条），按订单号 oid 对账。只要公开地址。

        userFills 按账户返回【所有 dex】的成交，io 子 dex 的成交 coin 带 "io:" 前缀。
        """
        if not self.settings.entropy_configured:
            return []
        payload = await self._request(
            "entropy", "POST", f"{self.settings.entropy_api_url}/info",
            label="info:userFills",
            json={"type": "userFills", "user": self.settings.entropy_address,
                  "aggregateByTime": True},
        )
        if not isinstance(payload, list):
            raise ExchangeError("Entropy 返回了无法识别的成交记录")
        return payload


def _consume_task_error(task: asyncio.Task) -> None:
    """A waiter timing out must not leave an unobserved shared-task exception."""
    if not task.cancelled():
        task.exception()


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def arcus_market_fields(raw: dict[str, Any]) -> dict[str, Any] | None:
    """把 /v1/markets 的一行整理成程序用的字段。不能交易的返回 None。

    保证金参数按【当前时段】取：美股等 RWA 市场在休市时段（isOutsideRth）
    初始保证金率是 offHoursInitialMarginFraction（官方现配置 = 1.5 倍），
    最大杠杆随之下降；维持保证金率不变。
    """
    if not isinstance(raw, dict):
        return None
    if str(raw.get("type") or "PERPETUAL").upper() != "PERPETUAL":
        return None
    if str(raw.get("status") or "").upper() != "ONLINE":
        return None
    try:
        market_id = int(raw.get("marketId"))
    except (TypeError, ValueError):
        return None
    name = str(raw.get("marketDisplayName") or "")
    base = str(raw.get("baseAsset") or "").upper()
    step = str(raw.get("stepSize") or "")
    tick = str(raw.get("tickSize") or "")
    if not name or not base or not step or not tick:
        return None
    try:
        decimals = step_decimals(step)
    except ValueError:
        decimals = None
    if decimals is None:
        # 步长不是 10 的整数次幂（比如 0.5）：两所共用小数位的精度口径装不下它，
        # 宁可不列出来，也不要按错的精度下单
        return None
    off_hours = bool(raw.get("isOutsideRth"))
    imf = _to_float(raw.get("offHoursInitialMarginFraction") if off_hours else None) \
        or _to_float(raw.get("initialMarginFraction"))
    mmf = _to_float(raw.get("maintenanceMarginFraction"))
    max_leverage = int(1.0 / imf + 1e-9) if imf and imf > 0 else 1
    return {
        "asset": base,
        "arcus_symbol": name,
        "arcus_market_id": market_id,
        "arcus_step_size": step,
        "arcus_tick_size": tick,
        "arcus_tick_tiers": [
            {"upToPrice": t.get("upToPrice"), "tick": t.get("tick")}
            for t in raw.get("tickTiers") or [] if isinstance(t, dict)
        ],
        "arcus_size_decimals": decimals,
        "arcus_min_order_size": _to_float(raw.get("minOrderSize")) or 0.0,
        "arcus_min_notional": _to_float(raw.get("minOrderNotional")) or 0.0,
        "arcus_max_order_size": _to_float(raw.get("maxOrderSize")) or 0.0,
        "arcus_imf": imf,
        "arcus_mmf": mmf,
        "arcus_off_hours": off_hours,
        "category": raw.get("category"),
        "max_leverage": max(1, max_leverage),
    }


def _position_rows(rows: Any, account_index: int) -> list[dict[str, Any]]:
    """positions 可能是 {marketId: {...}} 也可能是数组 —— 统一成数组，只留本子账户的。"""
    if isinstance(rows, dict):
        items = list(rows.values())
    elif isinstance(rows, list):
        items = rows
    else:
        return []
    out = []
    for row in items:
        if not isinstance(row, dict):
            continue
        if row.get("accountIndex") is not None:
            try:
                if int(row["accountIndex"]) != int(account_index):
                    continue
            except (TypeError, ValueError):
                continue
        out.append(row)
    return out
