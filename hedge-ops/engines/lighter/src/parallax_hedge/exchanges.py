"""两个所的行情 / 账户读取：共有币种、资金费率、盘口、持仓、成交记录。

这里没有签名下单（在 execution.py），但 Lighter 查成交要的认证令牌由
执行端的签名器生成后传进来。

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
from .config import Settings
from .books import Book, aggregate_levels
from .funding import FundingRow

# ⚠ 两个所的费率【周期不一样】，这是本项目最容易出错也最致命的一处。
#
# Arcus：官方文档 concepts/perpetuals/funding 明写「每小时收一次」，
#   /v1/markets 里的 fundingRate / nextFundingRate 本身就是【每小时】费率，
#   基准利率 0.01%/8h 按小时收 1/8（= 0.0000125），硬顶 ±4%/小时。
#   2026-09-03 实测 ETH 的 fundingRate 正好是 0.0000125 —— 就是这个基准利率。
#
# RHC Lighter：/api/v1/funding-rates 返回的是【每 8 小时】费率。
#   这不是猜的 —— 该接口同时返回 binance / bybit / hyperliquid 的费率，
#   它们就是现成的标尺：
#     binance BTC    = 0.0001  ← 币安众所周知的默认中性费率 0.01%/8h
#     hyperliquid BTC= 0.0001  ← HL 的基准利率也正是 0.01%/8h（按小时收 1/8）
#   如果这些是每小时值，BTC 光资金费就是 87.6% 年化，不可能。
#
# 2026-09-18 上一个版本把 Lighter 也当成每小时，结果差 8 倍，
# ANTH 的开仓方向被判反了。合理性闸门没能拦住 —— 8 倍误差仍在"合理区间"内，
# 那道闸门只防数量级错误。所以周期必须逐所写死并注明依据，不能想当然。
ARCUS_FUNDING_INTERVAL_SEC = 3600
LIGHTER_FUNDING_INTERVAL_SEC = 8 * 3600

# Lighter 的响应体不小，走住宅代理时 12 秒经常不够；给足超时并重试，
# 比直接判死刑合理。4xx 重试没有意义，只重试网络类错误。
_RETRIES = 3
_RETRY_BACKOFF_SEC = 0.6

# RHC REST 保留每次发起至少 1.05 秒的间隔，包括重试。
# 限流锁仅分配发起时刻；一个慢响应不能占着锁拖住账户和全部行情读取。
_LIGHTER_MIN_GAP_SEC = 1.05

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
        self._clients = {venue: self._new_client(venue) for venue in ("arcus", "lighter")}
        self._active_clients: dict[httpx.AsyncClient, int] = {}
        self._retired_clients: set[httpx.AsyncClient] = set()
        self._common_cache: list[dict[str, Any]] = []
        self._common_cached_at = 0.0
        self._arcus_markets: tuple[float, list[dict[str, Any]]] | None = None
        self._arcus_markets_lock = asyncio.Lock()
        self._arcus_markets_task: asyncio.Task | None = None
        self._lighter_books_task: asyncio.Task | None = None
        self._lighter_books_lock = asyncio.Lock()
        self._lighter_books: tuple[float, Any] | None = None
        self._lighter_details: dict[int, tuple[float, dict[str, Any]]] = {}
        self._lighter_gate = asyncio.Lock()
        self._lighter_last_call = 0.0

    async def aclose(self) -> None:
        tasks = [task for task in (self._arcus_markets_task, self._lighter_books_task)
                 if task is not None]
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await asyncio.gather(
            *(c.aclose() for c in {*self._clients.values(), *self._retired_clients}),
            return_exceptions=True,
        )

    def _new_client(self, venue: str) -> httpx.AsyncClient:
        budget = max(.1, float(self.settings.funding_timeout_seconds))
        return httpx.AsyncClient(
            timeout=httpx.Timeout(budget, connect=min(15.0, budget)),
            proxy=self.settings.proxy_for(venue), trust_env=False,
            headers={"User-Agent": "Parallax-Hedge-Arcus/1.0", "Accept": "application/json"},
            follow_redirects=True,
        )

    async def _retire_failed_client(self, venue: str, client: httpx.AsyncClient) -> None:
        # Swap only the generation that actually failed. Do not cancel concurrent
        # account/position reads that still use its pool; close once they drain.
        if self._clients[venue] is client:
            self._clients[venue] = self._new_client(venue)
            self._retired_clients.add(client)
        if client in self._retired_clients and not self._active_clients.get(client, 0):
            self._retired_clients.discard(client)
            await client.aclose()

    async def _http_read(self, client: httpx.AsyncClient, method: str, url: str, **kwargs: Any):
        self._active_clients[client] = self._active_clients.get(client, 0) + 1
        try:
            return await client.request(method, url, **kwargs)
        finally:
            self._active_clients[client] -= 1
            if not self._active_clients[client]:
                del self._active_clients[client]
                if client in self._retired_clients:
                    self._retired_clients.discard(client)
                    await client.aclose()

    async def _lighter_permit(self) -> None:
        async with self._lighter_gate:
            gap = _LIGHTER_MIN_GAP_SEC - (time.monotonic() - self._lighter_last_call)
            if gap > 0:
                await asyncio.sleep(gap)
            self._lighter_last_call = time.monotonic()

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
        budget = max(.1, float(self.settings.funding_timeout_seconds))
        deadline = time.monotonic() + budget
        attempts = 0
        failed_transport: httpx.AsyncClient | None = None
        for attempt in range(_RETRIES):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            attempts += 1
            started_read = False
            try:
                async with asyncio.timeout(remaining / (_RETRIES - attempt)):
                    if venue == "lighter":
                        await self._lighter_permit()
                    client = self._clients[venue]
                    started_read = True
                    response = await self._http_read(client, method, url, **kwargs)
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
                if started_read and isinstance(exc, (httpx.TransportError, TimeoutError)):
                    failed_transport = client
                if attempt + 1 < _RETRIES:
                    await asyncio.sleep(min(_RETRY_BACKOFF_SEC * (attempt + 1),
                                            max(0, deadline - time.monotonic()) / 4))
            except (ValueError, TypeError) as exc:
                raise ExchangeError(f"{venue} {label} 返回了无法解析的 JSON 数据") from exc
        if failed_transport is not None:
            await self._retire_failed_client(venue, failed_transport)
        detail = str(last).strip() or type(last).__name__
        raise ExchangeError(f"{venue} {label} 请求失败（{attempts} 次尝试，"
                            f"总时限 {budget:g} 秒）：{detail}") from last

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
        return await asyncio.shield(task)

    async def lighter_order_books(self) -> dict[str, Any]:
        """Share the RHC metadata read; never substitute Lighter Core metadata."""
        now = time.monotonic()
        if self._lighter_books and now - self._lighter_books[0] < _ARCUS_MARKETS_TTL_SEC:
            return self._lighter_books[1]

        async def fetch():
            payload = await self._request(
                "lighter", "GET", f"{self.settings.lighter_base_url}/api/v1/orderBooks",
                label="/orderBooks",
            )
            if not isinstance(payload, dict) or not isinstance(payload.get("order_books"), list):
                raise ExchangeError("RHC Lighter 没有返回可识别的市场列表")
            self._lighter_books = (time.monotonic(), payload)
            return payload

        async with self._lighter_books_lock:
            if self._lighter_books_task is None or self._lighter_books_task.done():
                self._lighter_books_task = asyncio.create_task(fetch())
                self._lighter_books_task.add_done_callback(_consume_task_error)
            task = self._lighter_books_task
        return await asyncio.shield(task)

    # ── 共有币种 ────────────────────────────────────────
    async def common_markets(self, *, force: bool = False) -> list[dict[str, Any]]:
        """两所都在交易的活跃永续。

        对齐规则：Arcus 的 baseAsset
        （BTC-USD 的 BTC）与 Lighter 的 symbol 直接比对。
        Arcus 只要 type=PERPETUAL 且 status=ONLINE；Lighter 只要 active 的永续。

        同名不等于同一个标的 —— 开仓前引擎还会比一次两边盘口中价，
        相差太大就拒绝开仓（见 engine._apply 的基差闸门）。
        """
        now = time.monotonic()
        if not force and self._common_cache and now - self._common_cached_at < 300:
            return [dict(item) for item in self._common_cache]

        lighter_payload, arcus_rows = await asyncio.gather(
            self.lighter_order_books(),
            self.arcus_markets(),
        )

        lighter_rows = (lighter_payload or {}).get("order_books") or []
        lighter_by_symbol: dict[str, dict[str, Any]] = {}
        for row in lighter_rows:
            symbol = str(row.get("symbol") or "").upper()
            if not symbol or "/" in symbol:
                continue
            if str(row.get("status") or "").lower() != "active":
                continue
            if str(row.get("market_type") or "perp").lower() != "perp":
                continue
            lighter_by_symbol[symbol] = row

        result: list[dict[str, Any]] = []
        for raw in arcus_rows:
            market = arcus_market_fields(raw)
            if market is None:
                continue
            base = market["asset"]
            lighter = lighter_by_symbol.get(base)
            if not lighter:
                continue
            size_decimals = int(lighter.get("supported_size_decimals") or 0)
            arcus_decimals = market["arcus_size_decimals"]
            quantity_decimals = min(size_decimals, arcus_decimals)
            # Lighter 下单要把价格乘成整数，用错这个精度会把报价算错几个数量级
            price_decimals = int(lighter.get("supported_price_decimals") or 0)
            minimum = max(
                _to_float(lighter.get("min_base_amount")) or 0.0,
                market["arcus_min_order_size"],
                10 ** (-quantity_decimals),
            )
            min_notional = max(
                _to_float(lighter.get("min_quote_amount")) or 0.0,
                market["arcus_min_notional"],
            )
            result.append(
                {
                    **market,
                    "display_name": f"{base} · {lighter.get('symbol')} / {market['arcus_symbol']}",
                    "lighter_symbol": str(lighter.get("symbol") or base).upper(),
                    "lighter_market_index": int(lighter["market_id"]),
                    "min_base_quantity": minimum,
                    "min_notional": min_notional,
                    # Lighter 自己的最小下单量 / 金额 —— 挂单模式下对冲零碎成交时要用
                    "lighter_min_base": _to_float(lighter.get("min_base_amount")) or 0.0,
                    "lighter_min_quote": _to_float(lighter.get("min_quote_amount")) or 0.0,
                    "quantity_decimals": quantity_decimals,
                    "lighter_size_decimals": size_decimals,
                    "price_decimals": price_decimals,
                }
            )

        if not result:
            raise ExchangeError("当前没有发现 Lighter 与 Arcus 共同的可交易永续市场")
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

    async def lighter_funding(self) -> dict[int, FundingRow]:
        """Lighter 每个市场的当期费率，按 market_id 索引。

        /api/v1/funding-rates 是无参接口，返回里【混了 binance / bybit /
        hyperliquid 的费率】，必须按 exchange=="lighter" 过滤，否则会拿到
        别家的数字当成自己的。
        """
        payload = await self._request(
            "lighter",
            "GET",
            f"{self.settings.lighter_base_url}/api/v1/funding-rates",
            label="/funding-rates",
        )
        rows = (payload or {}).get("funding_rates") or []
        now = time.time()
        out: dict[int, FundingRow] = {}
        for row in rows:
            if str(row.get("exchange") or "").lower() != "lighter":
                continue
            rate = _to_float(row.get("rate"))
            market_id = row.get("market_id")
            if rate is None or market_id is None:
                continue
            out[int(market_id)] = FundingRow(
                venue="lighter",
                symbol=str(row.get("symbol") or "").upper(),
                rate=rate,
                interval_sec=LIGHTER_FUNDING_INTERVAL_SEC,
                raw_symbol=str(row.get("symbol") or ""),
                fetched_at=now,
            )
        if not out:
            raise ExchangeError("Lighter 没有返回任何 exchange=lighter 的资金费率")
        return out


    # ── 订单簿 ──────────────────────────────────────
    async def lighter_book(self, market_id: int, symbol: str, limit: int = 100) -> Book:
        payload = await self._request(
            "lighter", "GET",
            f"{self.settings.lighter_base_url}/api/v1/orderBookOrders",
            label="/orderBookOrders",
            params={"market_id": market_id, "limit": limit},
        )
        if (payload or {}).get("code") not in (None, 200):
            raise ExchangeError(f"Lighter 盘口错误：{payload.get('message')}")
        return Book(
            venue="lighter", symbol=symbol,
            bids=aggregate_levels((payload or {}).get("bids"), descending=True),
            asks=aggregate_levels((payload or {}).get("asks"), descending=False),
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
        是沿用实盘验证过的口径（只认 /v1/positions）。
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

    async def lighter_account(self) -> dict[str, Any] | None:
        """/api/v1/account：只要账户索引，不签名。持仓里带 liquidation_price。"""
        index = self.settings.lighter_account_index
        if index is None:
            return None
        payload = await self._request(
            "lighter",
            "GET",
            f"{self.settings.lighter_base_url}/api/v1/account",
            label="/account",
            params={"by": "index", "value": str(index)},
        )
        if not isinstance(payload, dict) or not isinstance(payload.get("accounts"), list):
            raise ExchangeError("RHC Lighter 返回了无法识别的账户数据")
        if payload.get("code") is not None and str(payload["code"]) != "200":
            raise ExchangeError(f"RHC Lighter 账户读取失败：{payload.get('message') or payload['code']}")
        for row in payload["accounts"]:
            if not isinstance(row, dict):
                continue
            try:
                if int(row.get("account_index", row.get("index"))) == int(index):
                    return payload
            except (TypeError, ValueError):
                continue
        raise ExchangeError("RHC Lighter 返回的账户与已配置索引不匹配，持仓状态未知")

    async def lighter_market_details(self, market_id: int) -> dict[str, Any]:
        """Lighter 某个市场的保证金参数（一小时缓存）。

        /orderBooks 列表里没有这些字段，要从 /orderBookDetails 取。
        保证金率的单位是万分之一：min_initial_margin_fraction=1000 → 最高 10×；
        default_initial_margin_fraction 是账户没设过时的默认杠杆
        （OPENAI 默认 2×，这就是 Lighter 保证金被吃掉的原因）。
        """
        now = time.monotonic()
        cached = self._lighter_details.get(int(market_id))
        if cached and now - cached[0] < 3600:
            return dict(cached[1])
        payload = await self._request(
            "lighter", "GET", f"{self.settings.lighter_base_url}/api/v1/orderBookDetails",
            label="/orderBookDetails", params={"market_id": int(market_id)},
        )
        rows = (payload or {}).get("order_book_details") if isinstance(payload, dict) else None
        row = next(
            (r for r in rows or [] if int(r.get("market_id", -1)) == int(market_id)), None
        )
        if row is None:
            raise ExchangeError(f"Lighter 找不到市场 {market_id} 的保证金参数")

        def leverage_of(key: str) -> float | None:
            value = _to_float(row.get(key))
            return 10_000.0 / value if value and value > 0 else None

        details = {
            "max_leverage": leverage_of("min_initial_margin_fraction"),
            "default_leverage": leverage_of("default_initial_margin_fraction"),
            "maintenance_margin_fraction": _to_float(row.get("maintenance_margin_fraction")),
        }
        self._lighter_details[int(market_id)] = (now, details)
        return dict(details)

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

    async def lighter_trades(
        self, market_id: int, token: str, *, limit: int = 100, cursor: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """本账户在某个市场的成交（按时间倒序，一页最多 100 条）。

        交易所要求主账户 / 子账户查成交必须带认证令牌 —— 令牌由签名器生成，
        见 Executor.lighter_auth_token。参数照搬 Parallax 线上用的那组。
        """
        index = self.settings.lighter_account_index
        if index is None:
            return [], None
        params: dict[str, Any] = {
            "market_id": int(market_id),
            "market_type": "perp",
            "account_index": int(index),
            "sort_by": "timestamp",
            "sort_dir": "desc",
            "limit": max(1, min(100, int(limit))),
            "aggregate": "false",
        }
        if cursor:
            params["cursor"] = cursor
        payload = await self._request(
            "lighter", "GET", f"{self.settings.lighter_base_url}/api/v1/trades",
            label="/trades", params=params, headers={"authorization": token},
        )
        if not isinstance(payload, dict) or int(payload.get("code") or 0) != 200:
            message = (payload or {}).get("message") if isinstance(payload, dict) else payload
            raise ExchangeError(f"Lighter 成交查询失败：{message}")
        rows = payload.get("trades") or []
        if not isinstance(rows, list):
            raise ExchangeError("Lighter 返回了无法识别的成交记录")
        return rows, (payload.get("next_cursor") or None)

    async def lighter_account_limits(self, token: str) -> dict[str, Any]:
        """账户档位和当前费率档（照搬 Parallax）。0 费率账户的成交记录不带手续费字段，
        要靠这个确认手续费确实是 0，而不是「不知道」。"""
        index = self.settings.lighter_account_index
        payload = await self._request(
            "lighter", "GET", f"{self.settings.lighter_base_url}/api/v1/accountLimits",
            label="/accountLimits", params={"account_index": int(index)},
            headers={"authorization": token},
        )
        if not isinstance(payload, dict) or int(payload.get("code") or 0) != 200:
            message = (payload or {}).get("message") if isinstance(payload, dict) else payload
            raise ExchangeError(f"Lighter 账户费率查询失败：{message}")
        return payload


def _consume_task_error(task: asyncio.Task) -> None:
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
