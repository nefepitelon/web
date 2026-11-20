import asyncio
import contextlib
from contextlib import asynccontextmanager
from pathlib import Path
import re
import time
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from .engine import Engine
from .store import Store
from .venues import D, Rejected
from .views import ledger, overview, capacity as capacity_view

WEB = Path(__file__).parent / 'web'


def create_app(settings, *, engine_factory=Engine, store_factory=Store, web=WEB, title='Binance <> Lighter', overview_view=overview):
    store = store_factory(settings.data_dir / 'hedge.db')
    engine = engine_factory(settings, store)
    async def loop():
        while True:
            try: await engine.cycle()
            except Exception as error: store.log('-', engine.safe_error(error))
            await asyncio.sleep(max(5, settings.number('ENGINE_CYCLE_SECONDS')))
    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(loop())
        yield
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError): await task
        await engine.venues.close(); store.close()
    app = FastAPI(title=title, lifespan=lifespan)
    app.state.engine, app.state.store, app.state.settings = engine, store, settings

    @app.exception_handler(Rejected)
    async def rejected(request, error):
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': engine.safe_error(error)}, 400)

    @app.get('/')
    async def page(): return FileResponse(web / 'index.html',headers={'Cache-Control':'no-store'})
    app.mount('/static', StaticFiles(directory=web), name='static')
    @app.get('/api/status')
    async def status(): return {'version': '1.4.0', 'dry_run': settings.dry_run, 'last_cycle_at': engine.last_cycle_at, 'busy': engine._lock.locked(), 'pair': title, 'error': engine.snapshot.get('error'),'port':settings.port,'cycle_seconds':settings.values['ENGINE_CYCLE_SECONDS'],'settings':{k:settings.values[k] for k in ['ORDER_SLIPPAGE_BPS','MAX_OPEN_BASIS_BPS','MIN_NET_FUNDING_BPS_H','MARGIN_BUFFER','CLOSE_CORRIDOR_PCT','MAX_TASK_NOTIONAL','REOPEN_COOLDOWN_SECONDS']}}
    @app.get('/api/funding')
    async def funding(refresh: bool = False):
        if refresh or time.time()-engine.snapshot.get('refreshed_at',0)>10: await engine.refresh()
        return {**{k:v for k,v in engine.snapshot.items() if not k.startswith('_')},**overview_view(engine)}
    @app.get('/api/tasks')
    async def tasks(): return {'tasks': store.tasks(), 'busy': engine._lock.locked(), 'unmanaged': any(t['phase']=='REVIEW' for t in store.tasks())}
    @app.post('/api/tasks')
    async def task(request: Request):
        from emergency import latched
        if latched(store): raise HTTPException(409, '全部停撤平已锁定开仓；请停止并重新启动引擎后配置任务')
        body = await request.json()
        if not isinstance(body, dict) or set(body) - {'asset','notional','hold_hours','notional_max','hold_hours_max','enabled','leverage','order_type','maker_wait_seconds'}: raise HTTPException(400, '任务格式无效')
        asset = body.get('asset')
        if not isinstance(asset, str) or not re.fullmatch(r'[A-Z0-9]{1,24}', asset): raise HTTPException(400, '币种格式无效')
        if 'enabled' in body and type(body['enabled']) is not bool: raise HTTPException(400, 'enabled 必须为布尔值')
        async with engine._lock:
            old = store.get(asset)
            if old and (old['phase'] != 'IDLE' or any(D(v) for v in old['managed'].values()) or any(o['state'] in ('INTENT','SUBMITTED','UNKNOWN') for o in store.orders(asset))):
                if body.get('enabled') is False and set(body) <= {'asset','enabled'}:
                    old['enabled'] = False; store.put(old); return old
                raise HTTPException(409, '持仓或待确认订单尚未处理；只可停用任务并等待减仓')
            try:
                notional = D(body.get('notional', old['notional'] if old else '30'))
                hold = D(body.get('hold_hours', old['hold_hours'] if old else '8'))
                notional_max = D(body.get('notional_max') or (old.get('notional_max',old['notional']) if old and 'notional' not in body else notional))
                hold_max = D(body.get('hold_hours_max') or (old.get('hold_hours_max',old['hold_hours']) if old and 'hold_hours' not in body else hold))
                leverage = body.get('leverage',(old or {}).get('leverage'))
                if leverage in ('',None): leverage=None
                else:
                    value=D(leverage)
                    if not value.is_finite() or value!=int(value) or not 1<=value<=150: raise ValueError('leverage')
                    leverage=int(value)
                order_type=body.get('order_type',(old or {}).get('order_type','ioc'))
                wait=D(body.get('maker_wait_seconds',(old or {}).get('maker_wait_seconds',20)))
                if order_type not in ('ioc','binance_maker') or not wait.is_finite() or wait!=int(wait) or not 5<=wait<=60: raise ValueError('order settings')
                valid = all(v.is_finite() for v in (notional,hold,notional_max,hold_max)) and D(5) <= notional <= notional_max <= D(settings.values['MAX_TASK_NOTIONAL']) and D('0.01') <= hold <= hold_max <= D(168)
            except Exception: valid = False
            if not valid: raise HTTPException(400, '名义额、时间或杠杆超出范围；杠杆须为 1–150 整数或留空，下单方式须为 IOC / Binance 挂单，等待须为 5–60 秒整数')
            if old is None and len(store.tasks()) >= 4: raise HTTPException(400, '最多 4 个任务；每轮串行处理一个，保持云端执行预算')
            await engine.venues.metadata()
            if asset not in engine.venues.markets: raise HTTPException(400, '两所没有相同单位的共同永续市场')
            saved = {**(old or {}), 'asset': asset, 'market': engine.venues.markets[asset], 'notional': str(notional), 'hold_hours': str(hold),'notional_max':str(notional_max),'hold_hours_max':str(hold_max), 'enabled': body.get('enabled', False), 'phase':'IDLE', 'managed': {'binance':'0','lighter':'0'}, 'opened_at':None, 'error':''}
            saved.update(leverage=leverage,order_type=order_type,maker_wait_seconds=int(wait))
            store.put(saved); return saved
    @app.delete('/api/tasks/{asset}')
    async def remove(asset: str):
        async with engine._lock:
            task = store.get(asset)
            if task and (task['enabled'] or task['phase'] != 'IDLE' or any(D(v) for v in task['managed'].values())): raise HTTPException(409, '请先停用任务并确认双腿空仓')
            store.conn.execute('DELETE FROM tasks WHERE asset=?', (asset,)); store.conn.commit()
            return {'ok':True}
    @app.post('/api/preflight')
    async def preflight():
        async with engine._lock: return await engine.preflight()
    @app.post('/api/cycle')
    async def cycle():
        await engine.cycle(); return await status()
    @app.get('/api/cycles')
    async def cycles(): return {'cycles':store.events()}
    @app.get('/api/stats')
    async def stats():
        return ledger(store)
    @app.get('/api/spreads')
    async def spreads(refresh: bool = False): return await engine.spreads(force=refresh)
    @app.get('/api/capacity')
    async def capacity(): return capacity_view(engine,ledger(store))
    return app
