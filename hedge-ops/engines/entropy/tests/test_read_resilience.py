"""Read failures must not convoy UI polls or turn unknown collateral into zero."""
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest

from parallax_hedge.config import Settings
from parallax_hedge.exchanges import ExchangeError, MarketClient
from parallax_hedge.service import FundingService


def settings(**values):
    return Settings(env_path=Path("."), data_dir=Path("."), **values)


@pytest.mark.asyncio
async def test_retry_budget_covers_all_attempts_and_reports_blank_timeout():
    client = MarketClient(settings(funding_timeout_seconds=.24))
    calls = 0

    async def stalled(*args, **kwargs):
        nonlocal calls
        calls += 1
        await asyncio.sleep(3)

    client._clients["entropy"].request = stalled
    try:
        before = asyncio.get_running_loop().time()
        with pytest.raises(ExchangeError, match=r"[1-3] 次尝试.*TimeoutError"):
            await client._request("entropy", "POST", "https://example.invalid/info", label="test")
        assert asyncio.get_running_loop().time() - before < .7
        # Windows scheduling can consume the remaining budget between retries;
        # respecting that hard deadline takes precedence over all three tries.
        assert 1 <= calls <= 3
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_transport_failure_can_retry_successfully_inside_account_deadline():
    client = MarketClient(settings(funding_timeout_seconds=.5))
    response = httpx.Response(200, json={"ok": True})
    request = AsyncMock(side_effect=[httpx.ConnectError("reset"), response])
    client._clients["entropy"].request = request
    try:
        result = await client._request("entropy", "POST", "https://example.invalid/info", label="test")
        assert result == {"ok": True}
        assert request.await_count == 2
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_concurrent_metadata_failure_has_one_attempt_sequence_and_recovers():
    client = MarketClient(settings())
    calls = 0

    async def request(*args, **kwargs):
        nonlocal calls
        calls += 1
        await asyncio.sleep(.02)
        raise ExchangeError("upstream unavailable")

    client._request = request
    try:
        failures = await asyncio.gather(
            client.entropy_meta(), client.entropy_meta(), client.entropy_funding(),
            return_exceptions=True,
        )
        assert all(isinstance(value, ExchangeError) for value in failures)
        assert calls == 1
        client._request = AsyncMock(return_value=[
            {"universe": [{"name": "io:SNDK"}]}, [{"funding": "0.0001"}],
        ])
        universe, _ = await client.entropy_meta()
        assert universe[0]["name"] == "io:SNDK"
        assert client._request.await_count == 1
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_cancelled_metadata_waiter_does_not_cancel_other_readers():
    client = MarketClient(settings())
    release = asyncio.Event()

    async def request(*args, **kwargs):
        await release.wait()
        return [{"universe": [{"name": "io:SNDK"}]}, [{}]]

    client._request = request
    first = asyncio.create_task(client.entropy_meta())
    second = asyncio.create_task(client.entropy_meta())
    try:
        await asyncio.sleep(0)
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        release.set()
        assert (await second)[0][0]["name"] == "io:SNDK"
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_standard_account_does_not_wait_for_unneeded_spot_call():
    client = MarketClient(settings(entropy_address="0x" + "a" * 40))
    cancelled = asyncio.Event()

    async def request(*args, **kwargs):
        kind = kwargs["json"]["type"]
        if kind == "clearinghouseState":
            return {"marginSummary": {"accountValue": "50"}, "withdrawable": "20"}
        if kind == "userAbstraction":
            return "default"
        try:
            await asyncio.sleep(30)
        finally:
            cancelled.set()

    client._request = request
    try:
        result = await asyncio.wait_for(client.entropy_account(), .5)
        assert result["withdrawable"] == "20"
        assert cancelled.is_set()
    finally:
        await client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("failed_part", ["userAbstraction", "spotClearinghouseState"])
async def test_unknown_unified_account_collateral_is_an_error_not_zero(failed_part):
    client = MarketClient(settings(entropy_address="0x" + "a" * 40))

    async def request(*args, **kwargs):
        kind = kwargs["json"]["type"]
        if kind == failed_part:
            raise ExchangeError("read failed")
        if kind == "userAbstraction":
            return "unifiedAccount"
        return {"marginSummary": {"accountValue": "0"}, "withdrawable": "0"}

    client._request = request
    try:
        with pytest.raises(ExchangeError, match="read failed"):
            await client.entropy_account()
    finally:
        await client.aclose()


@pytest.mark.asyncio
async def test_display_refresh_skips_busy_trading_refresh_and_never_queues_more():
    service = FundingService(settings())
    refresh = AsyncMock(return_value={"ready": False, "rows": []})
    service._refresh = refresh
    try:
        async with service._lock:
            assert not service.request_refresh()
            assert service.refreshing
        assert service.request_refresh()
        assert not service.request_refresh()
        await service._requested_refresh
        assert refresh.await_count == 1
        assert not service.refreshing
        # Post-order engine refreshes still read again, never reuse the display
        # task or an earlier account response.
        await asyncio.gather(service.refresh(), service.refresh())
        assert refresh.await_count == 3
    finally:
        await service.aclose()
