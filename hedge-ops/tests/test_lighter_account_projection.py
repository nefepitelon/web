"""No executor imports: one failed console cannot poison another account view."""
import asyncio
from unittest.mock import AsyncMock

import pytest
from account_views import EntropyAccountView, LighterAccountView


@pytest.mark.asyncio
async def test_lighter_public_account_projection_survives_market_failure(tmp_path):
    view = LighterAccountView(tmp_path)
    view.settings.arcus_address = "0x" + "a" * 40
    view.settings.lighter_account_index = 0
    view.client.arcus_account = AsyncMock(return_value={"equity": "20", "freeCollateral": "10", "_positions": []})
    view.client.lighter_account = AsyncMock(return_value={"accounts": [{"account_index": 0, "total_asset_value": "30", "available_balance": "25", "positions": []}]})
    view.client.common_markets = AsyncMock(side_effect=AssertionError("Display account reads must not scan markets"))
    try:
        snapshots = await asyncio.gather(*(view.snapshot() for _ in range(8)))
        assert all(s["balances"]["total"]["equity"] == 50 for s in snapshots)
        assert all(s["account_source"] == "independent_read_only" for s in snapshots)
        assert set(snapshots[0]["account_read_at"]) == {"lighter", "arcus"}
        view.client.arcus_account.assert_awaited_once()
        view.client.lighter_account.assert_awaited_once()
        view.client.common_markets.assert_not_called()
    finally:
        await view.aclose()


@pytest.mark.asyncio
async def test_failed_lighter_does_not_clear_entropy_or_other_arcus_balance(tmp_path):
    lighter = LighterAccountView(tmp_path / "lighter")
    entropy = EntropyAccountView(tmp_path / "entropy")
    for view in (lighter, entropy):
        view.settings.arcus_address = "0x" + "a" * 40
        view.client.arcus_account = AsyncMock(return_value={"equity": "20", "freeCollateral": "10", "_positions": []})
    lighter.settings.lighter_account_index = 3
    lighter.client.lighter_account = AsyncMock(side_effect=TimeoutError())
    entropy.settings.entropy_address = "0x" + "b" * 40
    entropy.client.entropy_account = AsyncMock(return_value={"marginSummary": {"accountValue": "30"}, "withdrawable": "12", "assetPositions": []})
    try:
        failed, healthy = await asyncio.gather(lighter.snapshot(), entropy.snapshot())
        assert failed["balances"]["lighter"] is None
        assert failed["balances"]["total"] is None
        assert failed["balances"]["arcus"]["equity"] == 20
        assert set(failed["account_errors"]) == {"lighter"}
        assert healthy["balances"]["total"]["equity"] == 50
        assert healthy["account_errors"] == {}
        assert lighter.client is not entropy.client
        assert lighter.task is not entropy.task
    finally:
        await asyncio.gather(lighter.aclose(), entropy.aclose())
