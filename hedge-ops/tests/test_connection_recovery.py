"""Transient read failures and console restarts must preserve trading state."""
import asyncio
import json
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace

import httpx
import pytest
from test_binance_lighter import settings
from binance_lighter.venues import Venues, Rejected
from local import local_listener
from test_gateway import gateway, OWNER_A


@pytest.mark.asyncio
async def test_signing_uses_server_anchor_despite_wall_clock_jump_and_coalesces_sync(tmp_path, monkeypatch):
    v=Venues(settings(tmp_path));calls=[];mono=[100.0];wall=[1000.0]
    monkeypatch.setattr(time,'monotonic',lambda:mono[0])
    monkeypatch.setattr(time,'time',lambda:wall[0])
    async def respond(request):
        calls.append(request)
        if request.url.path.endswith('/time'):
            await asyncio.sleep(0)
            return httpx.Response(200,json={'serverTime':2000000})
        return httpx.Response(200,json={})
    await v.clients['binance'].aclose()
    v.clients['binance']=httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        await asyncio.gather(*(v.request('binance','/fapi/v3/account',signed=True) for _ in range(3)))
        assert sum(r.url.path.endswith('/time') for r in calls)==1
        wall[0]+=3600;mono[0]+=2
        await v.request('binance','/fapi/v3/account',signed=True)
        assert calls[-1].url.params['timestamp']=='2002000'
        mono[0]+=61
        await v.request('binance','/fapi/v3/account',signed=True)
        assert sum(r.url.path.endswith('/time') for r in calls)==2
    finally:await v.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('recover',[True,False])
async def test_lighter_405_read_retries_are_bounded_same_method_same_account(tmp_path,recover):
    v=Venues(settings(tmp_path));calls=[]
    def respond(request):
        calls.append(request)
        assert request.method=='GET' and request.url.path=='/api/v1/account'
        assert request.url.params['by']=='index' and request.url.params['value']==v.settings.values['LIGHTER_ACCOUNT_INDEX']
        return httpx.Response(200,json={'accounts':[]}) if recover and len(calls)==3 else httpx.Response(405,text='temporarily unavailable')
    await v.clients['lighter'].aclose()
    v.clients['lighter']=httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        if recover:assert await v.request('lighter','/api/v1/account',{'by':'index','value':v.settings.values['LIGHTER_ACCOUNT_INDEX']})=={'accounts':[]}
        else:
            with pytest.raises(Rejected,match='有限重试') as error:
                await v.request('lighter','/api/v1/account',{'by':'index','value':v.settings.values['LIGHTER_ACCOUNT_INDEX']})
            assert error.value.status==405
        assert len(calls)==3 and calls[-1].headers['Connection']=='close'
    finally:await v.close()


@pytest.mark.asyncio
async def test_405_write_is_never_replayed(tmp_path):
    v=Venues(settings(tmp_path));calls=[]
    def respond(request):calls.append(request);return httpx.Response(405,text='method unavailable')
    await v.clients['lighter'].aclose();v.clients['lighter']=httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        with pytest.raises(Rejected):await v.request('lighter','/api/v1/sendTx',method='POST')
        assert len(calls)==1
    finally:await v.close()


def test_local_console_duplicate_reuses_verified_instance_and_does_not_take_port():
    class Health(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200);self.end_headers();self.wfile.write(b'{"ok":true,"service":"welinkbtc-hedge-local"}')
        def log_message(self,*args):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),Health)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:assert local_listener(server.server_port) is None
    finally:server.shutdown();server.server_close();thread.join()


def test_unrelated_port_conflict_is_reported_without_killing_process():
    listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen()
    try:
        with pytest.raises(RuntimeError,match='其他程序占用'):local_listener(listener.getsockname()[1])
        assert listener.fileno()!=-1
    finally:listener.close()


@pytest.mark.asyncio
async def test_stale_console_cannot_remove_replacement_engine_record(tmp_path):
    manager=gateway.RuntimeManager(tmp_path)
    directory=manager.directory(OWNER_A,'binance');directory.mkdir(parents=True)
    manager.processes[(OWNER_A,'binance')]=gateway.EngineProcess(111,8006,'a'*64,False,SimpleNamespace(poll=lambda:1))
    replacement={'pid':222,'port':8007,'token':'b'*64,'dryRun':False}
    path=directory/'runtime.json';path.write_text(json.dumps(replacement),encoding='utf-8')
    try:
        record=manager.record(OWNER_A,'binance')
        assert record.pid==222 and json.loads(path.read_text())==replacement
    finally:await manager.client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize('alive,closed,authenticated',[(False,True,False),(False,False,False),(False,True,True),(True,True,False),(None,True,False)])
async def test_restored_record_requires_dead_process_and_closed_listener_before_cleanup(tmp_path,monkeypatch,alive,closed,authenticated):
    manager=gateway.RuntimeManager(tmp_path);directory=manager.directory(OWNER_A,'entropy');directory.mkdir(parents=True)
    path=directory/'runtime.json';data={'pid':777,'port':8177,'token':'b'*64,'dryRun':False};path.write_text(json.dumps(data))
    for name in ['.env','hedge.db']:(directory/name).write_bytes(b'preserve private state')
    def query(pid):
        if alive is None:raise OSError('query denied')
        return alive
    monkeypatch.setattr(gateway,'pid_alive',query)
    async def listener(_):return closed
    async def probe(*args,**kwargs):
        if authenticated:return httpx.Response(200,json={'dry_run':False})
        raise gateway.HTTPException(503,'unreachable')
    manager.listener_closed=listener;manager.request_engine=probe
    monkeypatch.setattr(gateway.subprocess,'Popen',lambda *a,**k:pytest.fail('Status must not start an engine'))
    try:
        status=await manager.status(OWNER_A,'entropy')
        dead=alive is False and closed and not authenticated
        assert status['processPresent'] is not dead and status['staleRecordCleared'] is dead
        assert status['running'] is authenticated
        assert status['status']==('STOPPED' if dead else 'RUNNING' if authenticated else 'CONNECTING')
        assert path.exists() is not dead
        for name in ['.env','hedge.db']:assert (directory/name).read_bytes()==b'preserve private state'
        if not dead and not authenticated:
            with pytest.raises(gateway.HTTPException) as error:await manager.start(OWNER_A,'entropy',True,live_authorized=True)
            assert error.value.status_code==409
    finally:await manager.client.aclose()


@pytest.mark.asyncio
async def test_exited_wrapper_does_not_erase_authenticated_live_child(tmp_path):
    manager=gateway.RuntimeManager(tmp_path)
    record=gateway.EngineProcess(333,8133,'b'*64,False,SimpleNamespace(poll=lambda:0))
    manager.processes[(OWNER_A,'binance')]=record
    async def probe(*args,**kwargs):return httpx.Response(200,json={'dry_run':False})
    manager.request_engine=probe
    try:
        status=await manager.status(OWNER_A,'binance')
        assert status['running'] and status['processPresent']
        assert manager.record(OWNER_A,'binance') is record
    finally:await manager.client.aclose()


@pytest.mark.asyncio
async def test_slow_old_probe_does_not_erase_new_runtime_record(tmp_path,monkeypatch):
    manager=gateway.RuntimeManager(tmp_path);directory=manager.directory(OWNER_A,'binance');directory.mkdir(parents=True)
    path=directory/'runtime.json';old={'pid':111,'port':8111,'token':'a'*64,'dryRun':True};new={**old,'pid':222,'port':8222,'token':'b'*64}
    path.write_text(json.dumps(old));monkeypatch.setattr(gateway,'pid_alive',lambda pid:False)
    async def probe(*args,**kwargs):
        path.write_text(json.dumps(new));raise gateway.HTTPException(503,'old process exited')
    async def closed(_):return True
    manager.request_engine=probe;manager.listener_closed=closed
    try:
        status=await manager.status(OWNER_A,'binance')
        assert not status['staleRecordCleared'] and status['processPresent']
        assert json.loads(path.read_text())==new
    finally:await manager.client.aclose()


@pytest.mark.asyncio
async def test_real_loopback_listener_refusal_and_open_port_are_distinguished(tmp_path):
    manager=gateway.RuntimeManager(tmp_path)
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0));listener.listen()
        record=gateway.EngineProcess(777,listener.getsockname()[1],'a'*64,True)
        try:assert await manager.listener_closed(record) is False
        finally:listener.close()
    try:assert await manager.listener_closed(record) is True
    finally:await manager.client.aclose()
