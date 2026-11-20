"""Emergency latch exercises the existing real strategy with simulated orders."""
import asyncio
import pytest
from test_engine import make, row, run

def test_latch_prevents_open_and_topup_even_if_task_was_enabled(tmp_path):
    async def check():
        engine, store, service = make(tmp_path, row())
        try:
            store.upsert_task("OAI", enabled=1, leverage=6, rotation_hours=4)
            store.conn.execute("INSERT INTO meta VALUES('emergency_stop','1')"); store.conn.commit()
            decisions = await engine.run_cycle()
            assert decisions[0]['plan'] == 'idle'
            assert not store.get_task('OAI')['enabled']
            assert store.get_task('OAI')['arcus_order_type'] == 'market'
            assert not store.get_task('OAI')['opened_at']
        finally:
            await engine.aclose(); store.close()
    run(check())

def test_latch_closes_held_pair_and_does_not_reopen(tmp_path):
    async def check():
        engine, store, service = make(tmp_path, row(.2,-.2))
        try:
            import time
            store.upsert_task("OAI", enabled=1, leverage=6, rotation_hours=4, opened_at=time.time(), corridor_at_open=8.3)
            store.conn.execute("INSERT INTO meta VALUES('emergency_stop','1')"); store.conn.commit()
            decisions = await engine.run_cycle()
            assert decisions[0]['plan'] == 'close'
            assert not store.get_task('OAI')['opened_at']
            assert not store.get_task('OAI')['enabled']
        finally:
            await engine.aclose(); store.close()
    run(check())

