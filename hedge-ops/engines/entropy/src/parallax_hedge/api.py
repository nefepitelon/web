"""FastAPI 应用：面板 + 引擎循环 + 对账循环。"""
from __future__ import annotations

import asyncio
import contextlib
import time
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .config import Settings
from .engine import HedgeEngine
from .ledger import FillReconciler, repair_arcus_double_counted_fees
from .preflight import run_preflight
from .service import DEFAULT_ROUND_TRIP_COST_BPS, FundingService
from .store import Store

WEB_DIR = Path(__file__).parent / "web"


def create_app(settings: Settings) -> FastAPI:
    app = FastAPI(title="Parallax Hedge · Arcus × Entropy", version=__version__)
    service = FundingService(settings)
    store = Store(settings.data_dir / "hedge.db")
    engine = HedgeEngine(settings, service, store, dry_run=settings.dry_run)
    fixed = repair_arcus_double_counted_fees(store)
    if fixed:
        store.log_cycle("-", "ledger", f"修正账本：{fixed} 条 Arcus 成交的价差损益不再重复扣手续费",
                        dry_run=settings.dry_run)
    reconciler = FillReconciler(store, service.client, engine.executor)
    app.state.settings = settings
    app.state.service = service
    app.state.store = store
    app.state.engine = engine
    app.state.refresh_task = None
    app.state.engine_task = None
    app.state.ledger_task = None
    from .spreads import SpreadScanner, SCAN_INTERVAL_SEC, sort_key
    spreads = SpreadScanner(service.client)
    app.state.spreads = spreads
    app.state.reconciler = reconciler
    app.state.spread_task = None
    app.state.metadata_task = None
    app.state.metadata_at = 0.0
    app.state.metadata = {}
    app.state.metadata_error = None

    async def read_metadata() -> None:
        """Display enrichment must never hold persisted tasks or account statistics hostage."""
        try:
            async with asyncio.timeout(8):
                common = await service.client.common_markets()
                wanted = {t["asset"] for t in store.list_tasks()} or {"BTC"}
                updated = {}
                for market in common:
                    if market["asset"] not in wanted:
                        continue
                    details = await service.client.entropy_market_details(int(market["entropy_market_index"]))
                    updated[market["asset"]] = {"market": market, "details": details}
                app.state.metadata = updated
                app.state.metadata_error = None
        except Exception as exc:  # noqa: BLE001
            app.state.metadata_error = str(exc) or "市场参数读取超时，稍后自动重试"
        finally:
            app.state.metadata_at = time.monotonic()

    def schedule_metadata() -> None:
        task = app.state.metadata_task
        if (task is None or task.done()) and time.monotonic() - app.state.metadata_at >= 30:
            app.state.metadata_task = asyncio.create_task(read_metadata())


    async def spread_loop() -> None:
        await asyncio.sleep(15.0)          # 让引擎先跑起来
        while True:
            with contextlib.suppress(Exception):
                await spreads.scan_once()
            await asyncio.sleep(SCAN_INTERVAL_SEC)

    async def loop() -> None:
        while True:
            with contextlib.suppress(Exception):
                await service.refresh()
            await asyncio.sleep(max(5.0, settings.funding_refresh_seconds))

    async def engine_loop() -> None:
        # 先等一轮费率快照就绪，别让引擎在没有数据时空转
        await asyncio.sleep(3.0)
        while True:
            try:
                await engine.run_cycle()
            except Exception as exc:  # 单轮失败不能让循环停掉
                store.log_cycle("-", "error", str(exc)[:300], dry_run=settings.dry_run)
            await asyncio.sleep(max(5.0, settings.engine_cycle_seconds))

    async def ledger_loop() -> None:
        """成交账本对账：拿订单号去两个所的成交记录里换准确的价格和手续费。

        和交易循环分开跑 —— 对账慢了、失败了，都不能拖住下单。
        演练模式没有真实成交，不需要对账。
        """
        if settings.dry_run:
            return
        await asyncio.sleep(20.0)
        while True:
            try:
                await reconciler.run_once()
            except Exception as exc:  # noqa: BLE001
                reconciler.last_summary = {"at": time.time(), "errors": [str(exc)[:300]]}
            await asyncio.sleep(60.0)

    app.state.bell = None

    @app.on_event("startup")
    async def _startup() -> None:
        if not settings.dry_run and settings.arcus_configured:
            # Arcus 订单推送当门铃：挂单一成交立刻去读仓位、对冲（连不上就退回 0.5 秒轮询）。
            # v1.4 起每个任务可以单独选限价 / 市价，所以实盘下总是连上（一条 WS，开销很小）
            from .arcus_ws import ArcusOrderBell
            app.state.bell = ArcusOrderBell(settings)
            app.state.bell.start()
            engine.bell = app.state.bell
        app.state.refresh_task = asyncio.create_task(loop())
        app.state.engine_task = asyncio.create_task(engine_loop())
        app.state.ledger_task = asyncio.create_task(ledger_loop())
        app.state.spread_task = asyncio.create_task(spread_loop())

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        for name in ("refresh_task", "engine_task", "ledger_task", "spread_task", "metadata_task"):
            task = getattr(app.state, name, None)
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        await engine.aclose()
        if app.state.bell is not None:
            await app.state.bell.stop()
        await service.aclose()
        store.close()

    @app.get("/api/status")
    async def status() -> dict[str, Any]:
        return {
            "version": __version__,
            "pair": "Arcus × Entropy",
            "port": settings.port,
            "proxies": {
                "arcus": settings.proxy_label("arcus"),
                "entropy": settings.proxy_label("entropy"),
            },
            "refresh_seconds": settings.funding_refresh_seconds,
            "stale_max_seconds": settings.funding_stale_max_seconds,
            "dry_run": engine.dry_run,
            "engine_connected": True,
            "last_cycle_at": engine.last_cycle_at,
            "market_ready": bool(service.snapshot.get("ready")),
            "market_updated_at": service.snapshot.get("generated_at"),
            "market_error": service.snapshot.get("error"),
            # 当前【实际生效】的设置 —— 不管 .env 里写没写，这里是准的
            "effective": {
                "DRY_RUN": settings.dry_run,
                "MIN_CORRIDOR_PCT（开仓门槛）": settings.min_corridor_pct,
                "CLOSE_CORRIDOR_PCT（平仓线）": settings.close_corridor_pct,
                "ENGINE_CYCLE_SECONDS": settings.engine_cycle_seconds,
                "REOPEN_COOLDOWN_SECONDS": settings.reopen_cooldown_seconds,
                "ORDER_SLIPPAGE_BPS": settings.order_slippage_bps,
                "ARCUS_MAKER（Arcus 挂单）": settings.arcus_maker,
                "MAKER_WAIT_SECONDS": settings.maker_wait_seconds,
                "FUNDING_STALE_MAX_SECONDS": settings.funding_stale_max_seconds,
            },
        }

    @app.get("/api/funding")
    async def funding(
        refresh: bool = Query(False, description="强制立刻重新拉取"),
        cost_bps: float | None = Query(None, ge=0, le=10000, description="往返成本假设 bps"),
    ) -> JSONResponse:
        if refresh or not service.snapshot.get("generated_at"):
            service.request_refresh()
        # Cost is a display-only assumption. Changing it must not trigger another exchange scan.
        snap = dict(service.snapshot)
        cost = float(cost_bps) if isinstance(cost_bps, (int, float)) else float(
            snap.get("round_trip_cost_bps", DEFAULT_ROUND_TRIP_COST_BPS))
        snap["round_trip_cost_bps"] = cost
        snap["round_trip_cost_is_assumption"] = True
        snap["rows"] = [{**row, "breakeven_hours": cost / row["net_bps_per_hour"]
                         if row.get("net_bps_per_hour", 0) > 1e-9 else None}
                        for row in snap.get("rows", [])]
        snap["refreshing"] = service.refreshing
        return JSONResponse(snap)

    # ── 任务 ────────────────────────────────────────
    async def _tasks_with_leverage() -> list[dict[str, Any]]:
        """任务列表 + 两边【此刻】真正会用的杠杆。

        任务填的是想要的杠杆，每个所各自不超过该市场的上限；Arcus 的美股等品种
        休市时上限会降（初始保证金率 ×1.5，比如 QQQ 25× → 16×）；Entropy 是逐仓，
        还会被压到守得住开仓门槛的杠杆以内 —— 所以两边可能不一样。
        """
        from .risk import effective_leverages, entropy_safe_leverage
        tasks = store.list_tasks()
        if tasks:
            schedule_metadata()
        for task in tasks:
            cached = app.state.metadata.get(task["asset"])
            if not cached:
                continue
            m, details = cached["market"], cached["details"]
            lev_l, lev_a = effective_leverages(
                float(task.get("leverage") or 1.0), arcus_max=m.get("max_leverage"),
                entropy_max=details.get("max_leverage"),
                entropy_mmf=details.get("maintenance_margin_fraction"),
                min_corridor_pct=settings.min_corridor_pct)
            task["effective_leverage"] = {
                "entropy": lev_l, "arcus": lev_a,
                "arcus_max": m.get("max_leverage"),
                "entropy_max": details.get("max_leverage"),
                "entropy_safe": entropy_safe_leverage(
                    details.get("max_leverage"), details.get("maintenance_margin_fraction"),
                    settings.min_corridor_pct),
                "min_corridor_pct": settings.min_corridor_pct,
            }
        return tasks

    @app.get("/api/tasks")
    async def list_tasks() -> dict[str, Any]:
        snapshot = service.snapshot
        managed = {t["asset"] for t in store.list_tasks() if t.get("enabled")}
        # 有持仓、但没有启用中的任务在管 —— 面板会标红，引擎却不会动手。
        # 这个落差最容易让人误以为「程序在看着」，所以必须显式报出来。
        unmanaged = [
            {
                "asset": r["asset"],
                "status": (r.get("position") or {}).get("status"),
                "status_text": (r.get("position") or {}).get("status_text"),
                "min_distance_pct": (r.get("position") or {}).get("min_distance_pct"),
            }
            for r in snapshot.get("rows", [])
            if (r.get("position") or {}).get("status") not in (None, "flat")
            and r["asset"] not in managed
        ]
        return {
            "dry_run": engine.dry_run,
            "unmanaged": unmanaged,
            "min_corridor_pct": settings.min_corridor_pct,
            "close_corridor_pct": settings.close_corridor_pct,
            "maker": settings.arcus_maker,
            "maker_wait_seconds": settings.maker_wait_seconds,
            "cycle_seconds": settings.engine_cycle_seconds,
            "busy": engine.busy_assets(),
            "bell": app.state.bell.stats() if app.state.bell is not None else None,
            "last_cycle_at": engine.last_cycle_at,
            "tasks": await _tasks_with_leverage(),
            "decisions": engine.last_decisions,
            "market_parameters_error": app.state.metadata_error,
            "market_parameters_pending": bool(app.state.metadata_task and not app.state.metadata_task.done()),
        }

    @app.post("/api/tasks")
    async def upsert_task(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        latch = store.conn.execute("SELECT value FROM meta WHERE key='emergency_stop'").fetchone()
        if latch and latch[0] == '1': raise HTTPException(409, "停撤平已锁定开仓；请停止并重新启动引擎")
        asset = str(payload.get("asset") or "").upper()
        if not asset:
            raise HTTPException(400, "缺少 asset")
        markets = {m["asset"] for m in await service.client.common_markets()}
        if asset not in markets:
            raise HTTPException(400, f"{asset} 不在两所共有币种里")
        fields: dict[str, Any] = {}
        optional_float = lambda v: None if v in ("", None) else float(v)  # noqa: E731
        for key, cast in (("enabled", lambda v: int(bool(v))),
                          ("leverage", float), ("rotation_hours", float),
                          ("rotation_hours_max", optional_float),
                          ("notional_usdc", optional_float),
                          ("notional_usdc_max", optional_float)):
            if key in payload:
                try:
                    fields[key] = cast(payload[key])
                except (TypeError, ValueError):
                    raise HTTPException(400, f"{key} 不是有效数字") from None
        if fields.get("rotation_hours") is not None and fields["rotation_hours"] <= 0:
            raise HTTPException(400, "轮换周期必须大于 0")
        if fields.get("leverage") is not None and fields["leverage"] <= 0:
            raise HTTPException(400, "杠杆必须大于 0")
        existing = store.get_task(asset) or {}
        if "arcus_order_type" in payload:
            kind = payload.get("arcus_order_type") or None
            if kind not in (None, "limit", "market"):
                raise HTTPException(400, "arcus_order_type 只能是 limit（限价挂单）或 market（市价吃单）")
            fields["arcus_order_type"] = kind
        # 开仓金额区间：最大为空 = 固定金额；填了就必须有最小、且不能比最小还小
        n_lo = fields["notional_usdc"] if "notional_usdc" in fields else existing.get("notional_usdc")
        n_hi = (fields["notional_usdc_max"] if "notional_usdc_max" in fields
                else existing.get("notional_usdc_max"))
        for value in (n_lo, n_hi):
            if value is not None and value <= 0:
                raise HTTPException(400, "开仓金额必须大于 0（不限就留空）")
        if n_hi is not None:
            if n_lo is None:
                raise HTTPException(400, "填了开仓金额最大值，就必须同时填最小值")
            if n_hi < n_lo:
                raise HTTPException(400, f"开仓金额最大 {n_hi:g} 不能小于最小 {n_lo:g}")
        # 随机区间：最长为空 = 固定周期；填了就不能比最短还短
        low = fields.get("rotation_hours", existing.get("rotation_hours"))
        high = fields.get("rotation_hours_max", existing.get("rotation_hours_max"))
        if high is not None:
            if high <= 0:
                raise HTTPException(400, "轮换周期最长值必须大于 0")
            if low is not None and high < low:
                raise HTTPException(400, f"轮换周期最长 {high:g} 小时不能小于最短 {low:g} 小时")
        return {"task": store.upsert_task(asset, **fields)}

    @app.delete("/api/tasks/{asset}")
    async def delete_task(asset: str) -> dict[str, Any]:
        task = store.get_task(asset.upper())
        if task and task.get("opened_at"):
            raise HTTPException(400, "该任务还有持仓，请先停用让它平仓收尾")
        store.delete_task(asset.upper())
        return {"ok": True}

    @app.post("/api/preflight")
    async def preflight() -> dict[str, Any]:
        """实盘预检：不下任何单，只验签名、余额、精度、以及会下出什么单。"""
        return await run_preflight(settings, service, store)

    @app.post("/api/cycle")
    async def run_cycle_now() -> dict[str, Any]:
        try:
            return {"decisions": await engine.run_cycle()}
        except Exception as exc:  # noqa: BLE001 —— 手动按钮也不能把错误吞成一个 500
            store.log_cycle("-", "error", str(exc)[:300], dry_run=settings.dry_run)
            return {"decisions": [], "error": str(exc)[:300]}

    @app.get("/api/spreads")
    async def get_spreads() -> dict[str, Any]:
        """共有币种按价差从窄到宽排好（下拉框用）。"""
        maker = settings.arcus_maker
        assets = [r["asset"] for r in service.snapshot.get("rows", [])]
        assets += [a for a in spreads.spreads if a not in assets]
        ordered = sorted(assets, key=lambda a: (sort_key(spreads.spreads.get(a), maker), a))
        return {
            "maker": maker,
            "scanned_at": spreads.scanned_at,
            "scanning": spreads.scanning,
            "assets": [{"asset": a, **(spreads.spreads.get(a) or {})} for a in ordered],
        }

    @app.get("/api/capacity")
    async def capacity() -> dict[str, Any]:
        """侧栏仪表盘：当前任务预估日交易量 vs 两边最大杠杆 + 全部权益的理论上限。"""
        from .capacity import estimate
        from .risk import effective_leverages, entropy_safe_leverage

        snapshot = service.snapshot
        balances = snapshot.get("balances") or {}
        equity = {v: float(((balances.get(v) or {}).get("equity")) or 0.0)
                  for v in ("entropy", "arcus")}
        available = {v: float(((balances.get(v) or {}).get("available")) or 0.0)
                     for v in ("entropy", "arcus")}
        rows = {r["asset"]: r for r in snapshot.get("rows", [])}
        tasks = store.list_tasks()
        schedule_metadata()
        wanted = {t["asset"] for t in tasks if t.get("enabled")} or {"BTC"}
        markets: dict[str, dict[str, Any]] = {}
        fill: dict[str, float] = {}
        for asset in wanted:
            cached = app.state.metadata.get(asset)
            if not cached:
                continue
            m, details = cached["market"], cached["details"]
            mmf = details.get("maintenance_margin_fraction")
            markets[asset] = {
                "arcus_max_leverage": m.get("max_leverage"),
                "arcus_mmf": m.get("arcus_mmf"),
                "entropy_max_leverage": details.get("max_leverage"),
                "entropy_mmf": mmf,
                # Entropy 逐仓：极限按「守得住开仓门槛的最高杠杆」算
                "entropy_safe_leverage": entropy_safe_leverage(
                    details.get("max_leverage"), mmf, settings.min_corridor_pct),
            }
            task = store.get_task(asset) or {}
            lev_l, lev_a = effective_leverages(
                float(task.get("leverage") or 1.0), arcus_max=float(m.get("max_leverage") or 1.0),
                entropy_max=details.get("max_leverage"), entropy_mmf=mmf,
                min_corridor_pct=settings.min_corridor_pct)
            fill[asset] = min(available["entropy"] * lev_l, available["arcus"] * lev_a) * 0.95
        positions: dict[str, float] = {}
        for asset, r in rows.items():
            leg = ((r.get("position") or {}).get("entropy")) or {}
            if leg.get("size") and (leg.get("mark_price") or r.get("mark_price")):
                positions[asset] = abs(float(leg["size"])) * float(leg.get("mark_price") or r["mark_price"])
        result = estimate(
            tasks=tasks, markets=markets,
            entropy_equity=equity["entropy"], arcus_equity=equity["arcus"],
            position_notional=positions, fill_capacity=fill,
            maker_for=engine._task_maker, cooldown=settings.reopen_cooldown_seconds,
            cycle=settings.engine_cycle_seconds, maker_wait=settings.maker_wait_seconds,
            min_corridor_pct=settings.min_corridor_pct,
        ).to_dict()
        result["actual_24h"] = store.volume_since(time.time() - 86_400, dry_run=engine.dry_run)
        result["equity"] = equity
        result["generated_at"] = time.time()
        return result

    @app.get("/api/stats")
    async def stats() -> dict[str, Any]:
        """首页：两边余额 + 两边各自的交易量 / 手续费 / 已实现盈亏 + 合计 + 按任务拆分。"""
        snapshot = service.snapshot
        tasks = store.list_tasks()
        return {
            "dry_run": engine.dry_run,
            "generated_at": time.time(),
            "balances": snapshot.get("balances") or {},
            "account_errors": (snapshot.get("accounts") or {}).get("errors") or {},
            "ledger": store.fill_stats(dry_run=engine.dry_run),
            "tasks": [
                {"asset": t["asset"], "enabled": bool(t.get("enabled")),
                 "opened_at": t.get("opened_at")}
                for t in tasks
            ],
            "reconciler": reconciler.last_summary,
        }

    @app.get("/api/cycles")
    async def cycles(limit: int = Query(60, ge=1, le=500)) -> dict[str, Any]:
        return {"cycles": store.recent_cycles(limit)}

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(WEB_DIR / "index.html")

    if WEB_DIR.exists():
        app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
    return app
