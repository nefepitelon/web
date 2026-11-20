"""Stop/cancel/flatten fixtures: no live account or network calls."""
import asyncio
import sqlite3
from types import SimpleNamespace
import httpx
import pytest
from fastapi import HTTPException
from test_binance_lighter import fixture, settings, D
from binance_lighter.store import Store
from emergency import drain, prepare, latched, latch_connection, empty_binance_journal, sweep_arcus
from gateway import RuntimeManager, EngineProcess


@pytest.mark.asyncio
async def test_empty_program_stops_during_account_outage_but_unknown_history_does_not(tmp_path):
    manager = RuntimeManager(tmp_path)
    record = EngineProcess(123, 8123, 'f'*64, False)
    requests = []
    def reply(request):
        requests.append(request.url.path)
        if request.url.path.endswith('/tasks'): return httpx.Response(200, json={'tasks': [], 'busy': False})
        if request.url.path.endswith('/runtime-safety'): return httpx.Response(200, json={'cycle_busy': False, 'empty_journal': True})
        return httpx.Response(200, json={'ready': False, 'accounts': {'errors': {'binance':'HTTP 401'}}})
    manager.client = httpx.AsyncClient(transport=httpx.MockTransport(reply))
    try:
        await manager.assert_safe_to_stop(record, True, engine='binance')
        assert not any(p.endswith('/funding') for p in requests)
        with pytest.raises(HTTPException): await manager.assert_safe_to_stop(record, True, engine='lighter')
        manager.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200,json={
            '/api/tasks': {'tasks': []}, '/api/runtime-safety': {'cycle_busy':False,'empty_journal':False},
            '/api/funding':{'ready':False,'accounts':{'errors':{'binance':'HTTP 401'}}}
        }[r.url.path])))
        with pytest.raises(HTTPException): await manager.assert_safe_to_stop(record, True, engine='binance')
    finally: await manager.client.aclose()


@pytest.mark.asyncio
async def test_force_stop_closes_both_owned_legs_reduce_only_and_latches_restart(tmp_path):
    engine, store, venue = fixture(tmp_path)
    app = SimpleNamespace(state=SimpleNamespace(engine=engine,store=store))
    try:
        await engine.cycle()
        assert any(venue.positions_now.values())
        result = await drain(app, 'binance')
        assert result['phase'] == 'flat'
        assert not any(venue.positions_now.values())
        assert all(o['reduce_only'] for o in venue.submissions[2:])
        assert latched(store) and not store.get('BTC')['enabled']
        await engine.cycle()
        assert len(venue.submissions) == 4  # No re-open after stopping.
        again = await drain(app,'binance')
        assert again['phase'] == 'flat' and len(venue.submissions) == 4
    finally: store.close()


@pytest.mark.asyncio
async def test_force_stop_outage_keeps_latch_and_resumes_without_ever_claiming_flat(tmp_path):
    engine, store, venue = fixture(tmp_path)
    app = SimpleNamespace(state=SimpleNamespace(engine=engine,store=store))
    try:
        await engine.cycle(); venue.fail_reads = True
        result = await drain(app,'binance')
        assert result['phase'] == 'draining' and latched(store)
        assert len(venue.submissions) == 2 and not store.get('BTC')['enabled']
        venue.fail_reads = False
        assert (await drain(app,'binance'))['phase'] == 'flat'
        assert len(venue.submissions) == 4
    finally: store.close()


@pytest.mark.asyncio
async def test_foreign_position_is_never_flattened_as_program_position(tmp_path):
    engine, store, venue = fixture(tmp_path)
    app = SimpleNamespace(state=SimpleNamespace(engine=engine,store=store))
    try:
        venue.positions_now['binance'] = D('1')
        assert (await drain(app,'binance'))['phase'] == 'draining'
        assert not venue.submissions and venue.positions_now['binance'] == D('1')
    finally: store.close()


@pytest.mark.asyncio
async def test_unknown_ioc_is_cancelled_by_owned_id_and_never_resubmitted(tmp_path):
    engine, store, venue = fixture(tmp_path)
    app = SimpleNamespace(state=SimpleNamespace(engine=engine,store=store))
    try:
        intent = store.intent('BTC','binance','BUY',D('.3'),False)
        cancelled=[]
        async def cancel(order,market): cancelled.append(order['client_id'])
        venue.cancel_owned = cancel
        assert (await drain(app,'binance'))['phase'] == 'draining'
        assert cancelled == [intent['client_id']] and not venue.submissions
        venue.results[intent['client_id']] = dict(filled='0',quote='0',fee='0')
        assert (await drain(app,'binance'))['phase'] == 'flat'
        assert len(store.orders()) == 1 and not venue.submissions
    finally: store.close()


def test_sql_latch_handles_both_legacy_task_schemas_and_maker_cancel_events(tmp_path):
    for name in ('lighter','entropy'):
        conn=sqlite3.connect(':memory:')
        conn.executescript("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE tasks(asset TEXT,enabled INT,arcus_order_type TEXT);INSERT INTO tasks VALUES('BTC',1,'limit');")
        event=asyncio.Event()
        app=SimpleNamespace(state=SimpleNamespace(store=SimpleNamespace(conn=conn),engine=SimpleNamespace(_stops={'BTC':event})))
        prepare(app,name)
        assert event.is_set() and latched(app.state.store)
        assert conn.execute('SELECT enabled,arcus_order_type FROM tasks').fetchone() == (0,'market')
        conn.close()


def test_empty_journal_requires_exact_uncapped_zero_counts(tmp_path):
    store=Store(tmp_path/'hedge.db')
    try:
        assert empty_binance_journal(store)
        store.save_order(dict(id='x',asset='BTC',state='UNKNOWN'))
        assert not empty_binance_journal(store)
    finally: store.close()


@pytest.mark.asyncio
async def test_gateway_latches_actual_database_before_scheduling_drain(tmp_path, monkeypatch):
    manager=RuntimeManager(tmp_path)
    owner='a'*64
    directory=manager.directory(owner,'binance');directory.mkdir(parents=True)
    store=Store(directory/'hedge.db')
    store.put(dict(asset='BTC',enabled=True,phase='IDLE',managed={'binance':'0','lighter':'0'}))
    manager.processes[(owner,'binance')]=EngineProcess(123,8123,'f'*64,False)
    scheduled=[]
    monkeypatch.setattr(manager,'ensure_emergency_job',lambda owner,engine:scheduled.append((owner,engine)))
    try:
        result=await manager.prepare_emergency(owner,'binance')
        assert result['phase']=='draining' and scheduled==[(owner,'binance')]
        assert latched(store) and not store.get('BTC')['enabled']
        reloaded=RuntimeManager(tmp_path)
        assert reloaded.emergency_state(owner,'binance')['phase']=='draining'
        with pytest.raises(HTTPException): await reloaded.start(owner,'binance',True,live_authorized=True)
        await reloaded.client.aclose()
    finally:
        store.close();await manager.client.aclose()


@pytest.mark.asyncio
async def test_gateway_pending_drain_preserves_process_and_reports_partial_result(tmp_path, monkeypatch):
    manager=RuntimeManager(tmp_path);owner='a'*64
    directory=manager.directory(owner,'binance');directory.mkdir(parents=True)
    store=Store(directory/'hedge.db');store.close()
    manager.processes[(owner,'binance')]=EngineProcess(123,8123,'f'*64,False)
    manager.client=httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'phase':'draining','message':'fixture account unavailable'})))
    async def never_stop(*args): pytest.fail('pending drain killed a protective process')
    async def end_after_attempt(*args): raise asyncio.CancelledError
    monkeypatch.setattr(manager,'stop',never_stop)
    monkeypatch.setattr(asyncio,'sleep',end_after_attempt)
    try:
        with pytest.raises(asyncio.CancelledError): await manager.drain_emergency(owner,'binance')
        assert manager.record(owner,'binance') is not None
        assert manager.emergency_state(owner,'binance')['phase']=='draining'
        assert 'unavailable' in manager.emergency_state(owner,'binance')['message']
    finally: await manager.client.aclose()


@pytest.mark.asyncio
async def test_arcus_cancel_verifies_owned_prefix_and_does_not_touch_manual_orders(monkeypatch):
    orders=[{'orderId':'owned','clientId':'ph123'},{'orderId':'manual','clientId':'user123'}]
    cancelled=[]
    class Client:
        async def arcus_markets(self):return [{'baseAsset':'BTC','marketId':1}]
        async def arcus_open_orders(self,market):return orders
    class Executor:
        async def _arcus_cancel(self,market,ref):
            cancelled.append(ref);orders[:]=[r for r in orders if r['orderId']!=ref]
            return True,'accepted'
    assert await sweep_arcus(Executor(),Client(),['BTC']) == 1
    assert cancelled==['owned'] and orders==[{'orderId':'manual','clientId':'user123'}]
    class Stale(Executor):
        async def _arcus_cancel(self,market,ref):return True,'accepted'
    orders.append({'orderId':'stale','clientId':'ph456'})
    with pytest.raises(RuntimeError,match='仍在'):await sweep_arcus(Stale(),Client(),['BTC'])
