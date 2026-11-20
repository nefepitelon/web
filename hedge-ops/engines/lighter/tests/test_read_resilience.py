"""RHC rate limiting, transport recovery and fast display APIs stay independent."""
import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from parallax_hedge.api import create_app
from parallax_hedge.config import Settings
from parallax_hedge.exchanges import ExchangeError, MarketClient
from parallax_hedge.service import FundingService


def settings(tmp_path=Path("."), **kwargs):
    return Settings(env_path=tmp_path / ".env", data_dir=tmp_path, **kwargs)


def endpoint(app, path):
    return next(route.endpoint for route in app.routes if getattr(route, "path", None) == path)


@pytest.mark.asyncio
async def test_all_network_attempts_share_one_budget_and_recover_pool():
    client = MarketClient(settings(funding_timeout_seconds=.24))
    old = client._clients["arcus"]
    calls = 0

    async def stalled(*args, **kwargs):
        nonlocal calls
        calls += 1
        await asyncio.sleep(30)

    old.request = stalled
    try:
        start = asyncio.get_running_loop().time()
        with pytest.raises(ExchangeError, match=r"[1-3] 次尝试.*TimeoutError"):
            await client._request("arcus", "GET", "https://example.invalid", label="test")
        assert asyncio.get_running_loop().time() - start < .8
        assert 1 <= calls <= 3
        assert client._clients["arcus"] is not old
        assert old.is_closed
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_rhc_slow_response_cannot_hold_account_request_but_start_gap_is_kept(monkeypatch):
    import parallax_hedge.exchanges as exchanges
    monkeypatch.setattr(exchanges, "_LIGHTER_MIN_GAP_SEC", .03)
    client = MarketClient(settings(funding_timeout_seconds=1, lighter_account_index=77))
    release = asyncio.Event()
    first_started = asyncio.Event()
    starts = []

    async def request(method, url, **kwargs):
        starts.append(asyncio.get_running_loop().time())
        if "funding-rates" in url:
            first_started.set()
            await release.wait()
            return httpx.Response(200, json={"funding_rates": []})
        return httpx.Response(200, json={"code": 200, "accounts": [
            {"account_index": 77, "available_balance": "50"}]})

    client._clients["lighter"].request = request
    funding = asyncio.create_task(client._request(
        "lighter", "GET", "https://api.rh.lighter.xyz/api/v1/funding-rates", label="funding"))
    try:
        await first_started.wait()
        account = await asyncio.wait_for(client.lighter_account(), .4)
        assert account["accounts"][0]["available_balance"] == "50"
        assert not funding.done()
        assert starts[1] - starts[0] >= .025
        release.set()
        await funding
    finally:
        release.set()
        await asyncio.gather(funding, return_exceptions=True)
        await client.aclose()


@pytest.mark.asyncio
async def test_rhc_rate_queue_is_included_in_total_timeout():
    client = MarketClient(settings(funding_timeout_seconds=.15))
    old = client._clients["lighter"]
    request = AsyncMock()
    client._clients["lighter"].request = request
    await client._lighter_gate.acquire()
    try:
        start = asyncio.get_running_loop().time()
        with pytest.raises(ExchangeError, match="总时限"):
            await client._request("lighter", "GET", "https://example.invalid", label="queued")
        assert asyncio.get_running_loop().time() - start < .7
        request.assert_not_awaited()
        assert client._clients["lighter"] is old
    finally:
        client._lighter_gate.release()
        await client.aclose()


@pytest.mark.asyncio
async def test_retired_pool_does_not_cancel_other_inflight_account_read():
    client = MarketClient(settings())
    old = client._clients["arcus"]
    release, started = asyncio.Event(), asyncio.Event()

    async def request(*args, **kwargs):
        started.set()
        await release.wait()
        return httpx.Response(200, json={"equity": "20"})

    old.request = request
    active = asyncio.create_task(client._http_read(old, "GET", "https://example.invalid"))
    try:
        await started.wait()
        await client._retire_failed_client("arcus", old)
        assert not old.is_closed
        assert client._clients["arcus"] is not old
        release.set()
        assert (await active).json()["equity"] == "20"
        assert old.is_closed
    finally:
        release.set()
        await asyncio.gather(active, return_exceptions=True)
        await client.aclose()


@pytest.mark.asyncio
async def test_metadata_failure_is_shared_and_next_round_can_recover():
    client = MarketClient(settings())
    calls = 0

    async def failing(*args, **kwargs):
        nonlocal calls
        calls += 1
        await asyncio.sleep(.02)
        raise ExchangeError("upstream unavailable")

    client._request = failing
    try:
        results = await asyncio.gather(client.arcus_markets(), client.arcus_funding(),
                                       return_exceptions=True)
        assert all(isinstance(result, ExchangeError) for result in results)
        assert calls == 1
        client._request = AsyncMock(return_value={"markets": [{"marketDisplayName": "SNDK-USD"}]})
        assert (await client.arcus_markets())[0]["marketDisplayName"] == "SNDK-USD"
        client._request.assert_awaited_once()
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_rhc_account_must_match_saved_index_instead_of_becoming_unknown_flat():
    client = MarketClient(settings(lighter_account_index=77))
    client._request = AsyncMock(return_value={"code": 200, "accounts": [{"index": 99}]})
    try:
        with pytest.raises(ExchangeError, match="索引不匹配"):
            await client.lighter_account()
    finally:
        await client.aclose()


def stub_account_reads(service):
    service.client.arcus_account = AsyncMock(return_value={"equity": "20", "freeCollateral": "12", "_positions": []})
    service.client.lighter_account = AsyncMock(return_value={"accounts": [
        {"account_index": 77, "total_asset_value": "30", "available_balance": "18", "positions": []}]})


@pytest.mark.asyncio
async def test_market_failure_retains_fresh_accounts_and_cost_assumption():
    service = FundingService(settings(lighter_account_index=77))
    service.client.common_markets = AsyncMock(side_effect=ExchangeError("markets unavailable"))
    service.client.arcus_funding = AsyncMock(side_effect=ExchangeError("markets unavailable"))
    service.client.lighter_funding = AsyncMock(return_value={})
    stub_account_reads(service)
    try:
        snapshot = await service.refresh(round_trip_cost_bps=9)
        assert not snapshot["ready"]
        assert snapshot["round_trip_cost_bps"] == 9
        assert snapshot["balances"]["total"]["equity"] == 50
        assert snapshot["accounts"]["errors"] == {}
    finally:
        await service.aclose()


@pytest.mark.asyncio
async def test_display_accounts_are_independent_of_stalled_market_lock_and_keep_ledger(tmp_path):
    app = create_app(settings(tmp_path, lighter_account_index=77))
    service = app.state.service
    stub_account_reads(service)
    store = app.state.store
    store.record_fill(asset="SNDK", venue="arcus", action="open", side="buy", dry_run=True,
                      market_id=9, order_ref=None, requested_qty=1, quantity=1,
                      price=100, source="simulated", status="final")
    try:
        async with service._lock:
            await asyncio.wait_for(service.refresh_accounts(), .3)
            stats = await asyncio.wait_for(endpoint(app, "/api/stats")(), .3)
        assert stats["balances"]["total"]["equity"] == 50
        assert stats["account_source"] == "independent_read_only"
        assert set(stats["account_read_at"]) == {"arcus", "lighter"}
        assert stats["ledger"]["total"]["fills"] == 1
        assert service.snapshot == {"ready": False, "rows": []}
    finally:
        await service.aclose()
        store.close()


@pytest.mark.asyncio
async def test_display_cost_and_metadata_never_wait_on_market_or_trading_reads(tmp_path):
    app = create_app(settings(tmp_path, lighter_account_index=77))
    service = app.state.service
    service._snapshot = {"ready": True, "generated_at": 1, "round_trip_cost_bps": 8,
                         "rows": [{"asset": "SNDK", "net_bps_per_hour": 2}]}
    service.client.common_markets = AsyncMock(side_effect=ExchangeError("metadata unavailable"))
    service.refresh = AsyncMock(side_effect=AssertionError("display must not refresh"))
    try:
        async with service._lock:
            response = await asyncio.wait_for(endpoint(app, "/api/funding")(True, 12), .3)
            results = await asyncio.wait_for(asyncio.gather(
                endpoint(app, "/api/tasks")(), endpoint(app, "/api/capacity")(),
                endpoint(app, "/api/status")(), endpoint(app, "/api/stats")()), .3)
        assert json.loads(response.body)["rows"][0]["breakeven_hours"] == 6
        assert service.snapshot["round_trip_cost_bps"] == 8
        assert results[2]["engine_connected"] is True
        service.refresh.assert_not_awaited()
        if app.state.metadata_task:
            await app.state.metadata_task
    finally:
        await service.aclose()
        app.state.store.close()


@pytest.mark.asyncio
async def test_empty_task_engine_never_touches_external_arcus_position(tmp_path):
    from parallax_hedge.engine import HedgeEngine
    from parallax_hedge.store import Store
    store = Store(tmp_path / "isolated.db")
    service = FundingService(settings(tmp_path, lighter_account_index=77, dry_run=False))
    service.refresh = AsyncMock(return_value={"ready": True, "accounts": {"errors": {}}, "rows": [
        {"asset": "SNDK", "position": {"arcus": {"size": -.6668}, "lighter": None}}]})
    service.client.common_markets = AsyncMock(return_value=[{"asset": "SNDK"}])
    engine = HedgeEngine(service.settings, service, store, dry_run=False)
    engine.executor.open_pair = AsyncMock(side_effect=AssertionError("external position"))
    engine.executor.close_pair = AsyncMock(side_effect=AssertionError("external position"))
    try:
        assert await engine.run_cycle() == []
        assert store.list_tasks() == []
        assert engine.busy_assets() == []
        engine.executor.open_pair.assert_not_awaited()
        engine.executor.close_pair.assert_not_awaited()
    finally:
        await engine.aclose()
        await service.aclose()
        store.close()
