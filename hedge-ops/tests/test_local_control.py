"""Fast loopback control/static channel stays separate from slow data reads."""
import asyncio
import json
import re
import sys
from pathlib import Path
from unittest.mock import AsyncMock
import httpx
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from local import create_local_app, local_control_listener

@pytest.mark.asyncio
async def test_control_channel_cors_csrf_and_private_session(tmp_path):
    app=create_local_app(tmp_path,ui_port=8811,control_port=8812)
    manager=app.state.manager
    manager.start=AsyncMock(return_value=dict(running=True,processPresent=True,dryRun=True))
    manager.status=AsyncMock(return_value=dict(running=False,processPresent=False,dryRun=True))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1:8812') as c:
        health=(await c.get('/health')).json()
        assert health['controlPort']==8812 and 'csrf' not in health
        page=await c.get('/')
        token=json.loads(re.search(r'const csrf=("[^"]+")',page.text)[1])
        assert 'http://127.0.0.1:8812' in page.text
        migration=await c.get('http://127.0.0.1:8811/?embedded=1')
        assert migration.status_code==307 and migration.headers['location']=='http://127.0.0.1:8812/?embedded=1'
        batch=(await c.get('/local/runtimes')).json()
        assert len(batch['engines'])==8 and batch['engines']['binance_okx']['processPresent'] is False
        origin='http://127.0.0.1:8811'
        headers={'Origin':origin,'X-Local-CSRF':token}
        preflight=await c.options('/local/binance_okx/runtime',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-local-csrf,content-type'})
        assert preflight.status_code==204 and preflight.headers['access-control-allow-origin']==origin
        blocked=await c.post('/local/binance_okx/runtime',headers={'Origin':'https://evil.invalid','X-Local-CSRF':token},json={'action':'start'})
        assert blocked.status_code==403 and manager.start.await_count==0
        assert (await c.post('/local/binance_okx/runtime',headers={'Origin':origin},json={'action':'start'})).status_code==403
        started=await c.post('/local/binance_okx/runtime',headers=headers,json={'action':'start'})
        assert started.status_code==200 and started.headers['access-control-allow-origin']==origin
        assert (await c.get('/local/binance_okx/api/funding')).status_code==400
        assert (await c.get('/local/session',headers={'Origin':'https://evil.invalid'})).status_code==403
        assert (await c.get('/local/session',headers={'Sec-Fetch-Site':'cross-site'})).status_code==403
        session=(await c.get('/local/session',headers={'Origin':origin})).json()
        assert session['csrf']==token and session['controlOrigin']=='http://127.0.0.1:8812'
        console=(await c.get('/console/binance_okx/')).text
        assert 'dataOrigin="http://127.0.0.1:8811"' in console
        assert 'read&&!fastRead?dataOrigin:session.origin' in console and "headers.delete('X-Local-CSRF')" in console
        assert '(stats|status|cycles)' in console
        assert "originalFetch('/local/session')" in console
    await manager.client.aclose()

@pytest.mark.asyncio
async def test_one_failed_runtime_does_not_hide_other_engines(tmp_path):
    app=create_local_app(tmp_path,ui_port=8811,control_port=8812)
    async def status(owner,name):
        if name=='entropy':raise RuntimeError('probe unavailable')
        return dict(engine=name,running=False,processPresent=False)
    app.state.manager.status=status
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1:8812') as c:
        data=(await c.get('/local/runtimes')).json()['engines']
        assert data['entropy'] is None and data['binance_okx']['processPresent'] is False
    await app.state.manager.client.aclose()

@pytest.mark.asyncio
async def test_entropy_stats_recovers_balances_without_replacing_trade_ledger(tmp_path):
    from types import SimpleNamespace
    app=create_local_app(tmp_path,ui_port=8811,control_port=8812)
    manager=app.state.manager
    manager.record=lambda *args:SimpleNamespace()
    manager.request_engine=AsyncMock(return_value=httpx.Response(200,json={
        'balances':{},'ledger':{'total':{'fills':114,'volume':109172}},'tasks':[{'asset':'SNDK'}]}))
    manager.account_view=AsyncMock(return_value={'balances':{'entropy':{'equity':30},'arcus':{'equity':20},'total':{'equity':50}},'account_errors':{}})
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1:8812') as c:
        response=await c.get('/local/entropy/api/stats')
        assert response.status_code==200
        data=response.json()
        assert data['balances']['total']['equity']==50 and data['ledger']['total']['fills']==114
        assert data['tasks']==[{'asset':'SNDK'}]
        assert manager.request_engine.call_args.args[1:]==('GET','stats')
    await manager.client.aclose()

@pytest.mark.asyncio
async def test_slow_data_request_does_not_hold_status_or_static_workspace(tmp_path):
    from types import SimpleNamespace
    app=create_local_app(tmp_path,ui_port=8811,control_port=8812)
    manager=app.state.manager;held=asyncio.Event();started=asyncio.Event()
    manager.record=lambda *args:SimpleNamespace()
    async def slow(*args,**kwargs):started.set();await held.wait();return httpx.Response(200,json={})
    manager.request_engine=slow
    manager.status=AsyncMock(return_value=dict(running=True,engine='binance_okx',processPresent=True))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1:8811') as c:
        pending=asyncio.create_task(c.get('/local/binance_okx/api/funding'))
        try:
            await asyncio.wait_for(started.wait(),1)
            async with asyncio.timeout(1):
                state=await c.get('http://127.0.0.1:8812/local/binance_okx/runtime')
                page=await c.get('http://127.0.0.1:8812/console/binance_okx/')
            assert state.json()['running'] and page.status_code==200 and not pending.done()
        finally:held.set();await pending
    await manager.client.aclose()

def test_control_port_is_loopback_persisted_and_reused(tmp_path):
    listener=local_control_listener(tmp_path)
    host,port=listener.getsockname()
    assert host=='127.0.0.1' and json.loads((tmp_path/'.manager-control.json').read_text())['port']==port
    listener.close()
    again=local_control_listener(tmp_path)
    try:assert again.getsockname()==(host,port)
    finally:again.close()

def test_busy_saved_control_port_is_not_taken_or_terminated(tmp_path):
    first=local_control_listener(tmp_path);second=local_control_listener(tmp_path)
    try:
        assert first.fileno()!=-1 and second.getsockname()[1]!=first.getsockname()[1]
    finally:first.close();second.close()
