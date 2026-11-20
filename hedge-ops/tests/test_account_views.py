import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from account_views import EntropyAccountView, entropy_modules

@pytest.mark.asyncio
async def test_account_projection_is_single_flight_and_never_calls_markets(tmp_path):
    view=EntropyAccountView(tmp_path)
    view.settings.arcus_address='0x'+'a'*40
    view.settings.entropy_address='0x'+'b'*40
    view.client.arcus_account=AsyncMock(return_value={'equity':'20','freeCollateral':'10','_positions':[]})
    view.client.entropy_account=AsyncMock(return_value={'marginSummary':{'accountValue':'30'},'withdrawable':'12','assetPositions':[]})
    view.client.common_markets=AsyncMock(side_effect=AssertionError('account reads must not scan markets'))
    try:
        results=await asyncio.gather(*(view.snapshot() for _ in range(6)))
        assert all(r['balances']['total']['equity']==50 for r in results)
        assert view.client.arcus_account.await_count==view.client.entropy_account.await_count==1
        view.client.common_markets.assert_not_called()
    finally:await view.aclose()

@pytest.mark.asyncio
async def test_failed_exchange_preserves_other_account_and_never_fabricates_total(tmp_path):
    view=EntropyAccountView(tmp_path)
    view.settings.arcus_address='0x'+'a'*40;view.settings.entropy_address='0x'+'b'*40
    view.client.arcus_account=AsyncMock(return_value={'equity':'20','freeCollateral':'10','_positions':[]})
    view.client.entropy_account=AsyncMock(side_effect=TimeoutError())
    try:
        result=await view.snapshot()
        assert result['balances']['arcus']['equity']==20
        assert result['balances']['entropy'] is None and result['balances']['total'] is None
        assert result['account_errors']['entropy'] and 'arcus' not in result['account_errors']
    finally:await view.aclose()

@pytest.mark.asyncio
async def test_market_failure_keeps_accounts_and_cost_assumption(tmp_path):
    entropy_modules()
    from welink_entropy_accounts.config import Settings
    from welink_entropy_accounts.service import FundingService
    settings=Settings(tmp_path/'.env',tmp_path,arcus_address='0x'+'a'*40,entropy_address='0x'+'b'*40)
    service=FundingService(settings)
    service.client.common_markets=AsyncMock(side_effect=RuntimeError('market feed unavailable'))
    service.client.arcus_funding=AsyncMock(return_value=({},{}))
    service.client.entropy_funding=AsyncMock(side_effect=RuntimeError('market unavailable'))
    service.client.arcus_account=AsyncMock(return_value={'equity':'20','freeCollateral':'10','_positions':[]})
    service.client.entropy_account=AsyncMock(return_value={'marginSummary':{'accountValue':'30'},'withdrawable':'12','assetPositions':[]})
    try:
        snapshot=await service.refresh(round_trip_cost_bps=10)
        assert not snapshot['ready'] and snapshot['rows']==[]
        assert snapshot['balances']['total']['equity']==50
        assert snapshot['accounts']['errors']=={} and snapshot['round_trip_cost_bps']==10
    finally:await service.aclose()


@pytest.mark.asyncio
async def test_failed_round_replaces_transport_and_fresh_round_recovers_without_stale_total(tmp_path, monkeypatch):
    """Exercise a real poll sequence: healthy -> failed -> healthy on a new pool."""
    _, exchanges, _ = entropy_modules()
    first = SimpleNamespace(
        arcus_account=AsyncMock(side_effect=[
            {'equity': '20', 'freeCollateral': '10', '_positions': []},
            {'equity': '21', 'freeCollateral': '11', '_positions': []},
        ]),
        entropy_account=AsyncMock(side_effect=[
            {'marginSummary': {'accountValue': '30'}, 'withdrawable': '12', 'assetPositions': []},
            TimeoutError(),
        ]),
        aclose=AsyncMock(),
    )
    recovered = SimpleNamespace(
        arcus_account=AsyncMock(return_value={'equity': '22', 'freeCollateral': '12', '_positions': []}),
        entropy_account=AsyncMock(return_value={
            'marginSummary': {'accountValue': '33'}, 'withdrawable': '13', 'assetPositions': [],
        }),
        aclose=AsyncMock(),
    )
    created = []

    def new_client(_settings):
        client = (first, recovered)[len(created)]
        created.append(client)
        return client

    monkeypatch.setattr(exchanges, 'MarketClient', new_client)
    view = EntropyAccountView(tmp_path)
    view.settings.arcus_address = '0x' + 'a' * 40
    view.settings.entropy_address = '0x' + 'b' * 40
    try:
        healthy = await view.snapshot()
        assert healthy['balances']['total']['equity'] == 50
        old_success = healthy['account_read_at']['entropy']
        assert set(healthy['account_attempt_at']) == {'arcus', 'entropy'}

        view.last_refresh -= 16
        await view.snapshot()
        await view.task
        failed = await view.snapshot()
        assert failed['balances']['arcus']['equity'] == 21
        assert failed['balances']['entropy'] is None
        assert failed['balances']['total'] is None
        assert failed['account_errors'].keys() == {'entropy'}
        assert failed['account_read_at']['entropy'] == old_success
        assert failed['account_attempt_at']['entropy'] >= old_success
        assert view.client is recovered and len(created) == 2
        first.aclose.assert_awaited_once()
        assert not failed['account_pending']

        view.last_refresh -= 16
        await view.snapshot()
        await view.task
        fresh = await view.snapshot()
        assert fresh['balances']['entropy']['equity'] == 33
        assert fresh['balances']['total']['equity'] == 55
        assert fresh['account_errors'] == {}
        assert fresh['account_read_at']['entropy'] >= failed['account_attempt_at']['entropy']
        assert len(created) == 2  # Healthy rounds keep the recovered pool.
        recovered.entropy_account.assert_awaited_once()
    finally:
        await view.aclose()
    first.aclose.assert_awaited_once()
    recovered.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_simultaneous_retry_polls_share_one_round_and_transport_reset(tmp_path, monkeypatch):
    _, exchanges, _ = entropy_modules()
    entered = asyncio.Event()
    release = asyncio.Event()

    async def failing_entropy():
        entered.set()
        await release.wait()
        raise TimeoutError()

    first = SimpleNamespace(
        arcus_account=AsyncMock(return_value={'equity': '20', 'freeCollateral': '10', '_positions': []}),
        entropy_account=AsyncMock(side_effect=failing_entropy),
        aclose=AsyncMock(),
    )
    replacement = SimpleNamespace(aclose=AsyncMock())
    created = []

    def new_client(_settings):
        client = (first, replacement)[len(created)]
        created.append(client)
        return client

    monkeypatch.setattr(exchanges, 'MarketClient', new_client)
    view = EntropyAccountView(tmp_path)
    view.settings.arcus_address = '0x' + 'a' * 40
    view.settings.entropy_address = '0x' + 'b' * 40
    callers = [asyncio.create_task(view.snapshot()) for _ in range(6)]
    try:
        await asyncio.wait_for(entered.wait(), 1)
        release.set()
        snapshots = await asyncio.gather(*callers)
        assert len(created) == 2
        first.arcus_account.assert_awaited_once()
        first.entropy_account.assert_awaited_once()
        first.aclose.assert_awaited_once()
        assert all(s['balances']['entropy'] is None and s['balances']['total'] is None for s in snapshots)
        assert all(s['account_errors']['entropy'] and s['account_attempt_at']['entropy'] for s in snapshots)
    finally:
        release.set()
        await asyncio.gather(*callers, return_exceptions=True)
        await view.aclose()
