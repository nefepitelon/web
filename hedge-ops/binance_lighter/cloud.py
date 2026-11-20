"""Finite invocations use the same engine and persist every intent before submission."""
import base64
import gzip
import json
from pathlib import Path
import tempfile
import httpx
from fastapi import HTTPException
from .api import create_app
from .config import Settings


async def run(values, snapshot, request, checkpoint, *, engine_name="binance"):
    app_factory=create_app
    load=Settings.load
    if engine_name!="binance":
        from paired_hedge.api import create_app as app_factory
        from paired_hedge.config import Settings as PairSettings
        load=lambda env,data:PairSettings.load_pair(engine_name,env,data)
    from cloud_worker import CheckpointConnection
    from gateway import dotenv_encode, GET_ENDPOINTS, POST_ENDPOINTS, ASSET_RE
    with tempfile.TemporaryDirectory(prefix='welink-binance-') as temporary:
        root = Path(temporary)
        (root/'.env').write_text(dotenv_encode(values), encoding='utf-8')
        if snapshot.get('sqlite'):
            raw = gzip.decompress(base64.b64decode(snapshot['sqlite']))
            if len(raw) > 64*1024*1024: raise ValueError('Checkpoint too large')
            (root/'hedge.db').write_bytes(raw)
        app = app_factory(load(root/'.env', root))
        engine, store = app.state.engine, app.state.store
        views = dict(snapshot.get('views') or {})
        def capture():
            data = base64.b64encode(gzip.compress(store.conn.serialize())).decode()
            if len(data) > 3_000_000: raise RuntimeError('订单账本需归档，已暂停继续下单')
            checkpoint({'sqlite':data, 'views':views}, views)
        store.conn = CheckpointConnection(store.conn, capture)
        try:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://engine') as client:
                action = request.get('action')
                if action == 'network':
                    from network import check_network
                    result = {'data':await check_network(engine_name, values), 'status':200}
                elif action == 'safe-stop':
                    from emergency import empty_binance_journal
                    tasks = store.tasks()
                    if any(o['state'] in ('INTENT','SUBMITTED','UNKNOWN') for o in store.orders()): raise HTTPException(409, '仍有未确认订单')
                    if any(t['enabled'] or t['phase']!='IDLE' or any(float(q) for q in t['managed'].values()) for t in tasks): raise HTTPException(409, '仍有任务、持仓或未确认订单')
                    if not empty_binance_journal(store):
                        snap = await engine.refresh()
                        if engine.credentials() and (not snap['ready'] or snap['accounts'].get('open_assets')): raise HTTPException(409, '账户空仓未确认')
                    result = {'data':{'ok':True}, 'status':200}
                elif action == 'release-emergency':
                    store.conn.execute("DELETE FROM meta WHERE key='emergency_stop'"); store.conn.commit()
                    result = {'data':{'ok':True}, 'status':200}
                elif action == 'emergency-drain':
                    from emergency import drain
                    result = {'data':await drain(app, engine_name), 'status':200}
                elif action == 'cycle':
                    await engine.cycle(); result = {'data':{}, 'status':200}
                else:
                    path, method = request.get('path',''), request.get('method','GET')
                    if not (method=='GET' and path in GET_ENDPOINTS or method=='POST' and path in POST_ENDPOINTS or method=='DELETE' and path.startswith('tasks/') and ASSET_RE.fullmatch(path[6:])): raise HTTPException(404)
                    response = await client.request(method, '/api/'+path+request.get('query',''), json=request.get('payload') if method!='GET' else None)
                    result = {'data':response.json(), 'status':response.status_code}
                for path in GET_ENDPOINTS:
                    response = await client.get('/api/'+path)
                    if response.is_success: views[path] = response.json()
                capture()
                return {**result, 'views':views}
        finally:
            await engine.venues.close(); store.close()
