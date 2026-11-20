"""Durable stop-opening latch and bounded, verified liquidation of program tasks.

No account-wide cancel-all is used. Existing maker jobs cancel their own orders;
Binance/Lighter IOC intents are recovered by client ID before reducing exposure.
"""
import asyncio
from contextlib import closing
import time


KEY = "emergency_stop"


async def sweep_arcus(executor, client, assets):
    """Re-use the vendored signer; confirm removal of program-prefixed orders."""
    markets = {str(r.get('baseAsset', '')).upper(): {'arcus_market_id': int(r['marketId'])}
               for r in await client.arcus_markets() if r.get('marketId') is not None}
    cancelled = 0
    for asset in assets:
        if asset not in markets: raise RuntimeError(f'{asset} Arcus 市场无法核对，不能确认撤单')
        market = markets[asset]
        orders = await client.arcus_open_orders(market['arcus_market_id'])
        ours = [o for o in orders if str(o.get('clientId') or '').lower().startswith('ph')]
        for order in ours:
            if not order.get('orderId'): raise RuntimeError('挂单缺少订单号，撤单结果未知')
            ok, _ = await executor._arcus_cancel(market, str(order['orderId']))
            if not ok: raise RuntimeError('Arcus 程序挂单尚未确认撤销')
            cancelled += 1
        if ours:
            await asyncio.sleep(.5)
            if any(str(o.get('clientId') or '').lower().startswith('ph') for o in await client.arcus_open_orders(market['arcus_market_id'])):
                raise RuntimeError('Arcus 撤单已提交但挂单仍在，等待交易所确认')
    return cancelled


async def legacy_sweep(name, directory):
    """Cancel-only compatibility for live pre-upgrade processes, no order opens.

    Load under separate package names so the two vendored implementations never
    share module globals. This adapter never submits or flattens a position.
    """
    import importlib
    import importlib.util
    import sqlite3
    import sys
    from pathlib import Path
    package = '_hedge_emergency_' + name
    source = Path(__file__).parent / 'engines' / name / 'src/parallax_hedge'
    if package not in sys.modules:
        spec = importlib.util.spec_from_file_location(package, source / '__init__.py', submodule_search_locations=[str(source)])
        module = importlib.util.module_from_spec(spec)
        sys.modules[package] = module
        spec.loader.exec_module(module)
    settings = importlib.import_module(package + '.config').Settings.load(directory / '.env', directory)
    if settings.dry_run: return 0
    with closing(sqlite3.connect((directory / 'hedge.db').as_uri() + '?mode=ro', uri=True)) as conn:
        assets = [r[0] for r in conn.execute('SELECT asset FROM tasks')]
    if not assets: return 0
    client = importlib.import_module(package + '.exchanges').MarketClient(settings)
    executor = importlib.import_module(package + '.execution').Executor(settings, client, dry_run=False)
    try: return await sweep_arcus(executor, client, assets)
    finally:
        await executor.aclose()
        await client.aclose()


def latched(store):
    row = store.conn.execute("SELECT value FROM meta WHERE key=?", (KEY,)).fetchone()
    return bool(row and row[0] == "1")


def latch_connection(conn, engine):
    conn.execute("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)", (KEY, "1"))
    if engine not in {"lighter","entropy"}:
        import json
        for asset, raw in conn.execute("SELECT asset,data FROM tasks").fetchall():
            task = json.loads(raw)
            task['enabled'] = False
            conn.execute("UPDATE tasks SET data=? WHERE asset=?", (json.dumps(task), asset))
    else:
        # Existing live versions also understand these fields; no process restart
        # or market-data dependency is needed to stop their next opening cycle.
        conn.execute("UPDATE tasks SET enabled=0, arcus_order_type='market'")
    conn.commit()


def prepare(app, name):
    latch_connection(app.state.store.conn, name)
    for event in getattr(app.state.engine, '_stops', {}).values():
        event.set()  # Maker's own cancel/reconcile/rescue finally path.
    return {"phase": "draining", "message": "已禁止开仓，正在撤单平仓"}


def empty_binance_journal(store):
    # Exact SQL counts, never a capped/display-only order list. Failure is unknown.
    return (store.conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0] == 0
            and store.conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0)


def unknown_orders(conn, name):
    if name not in {'lighter','entropy'}:
        return bool(conn.execute("SELECT COUNT(*) FROM orders WHERE json_extract(data,'$.state') IN ('INTENT','SUBMITTED','UNKNOWN')").fetchone()[0])
    return bool(conn.execute("SELECT COUNT(*) FROM fills WHERE dry_run=0 AND status='pending' AND confirmed_qty IS NULL").fetchone()[0])


async def drain(app, name):
    prepare(app, name)
    engine, store = app.state.engine, app.state.store
    if name not in {'lighter','entropy'} and empty_binance_journal(store):
        return {"phase": "flat", "message": "无任务及订单意图，已确认本程序无交易暴露"}
    try:
        async with asyncio.timeout(235):
            if name not in {'lighter','entropy'}:
                # cycle() is serial and recovers unknown submissions before any
                # new reduce-only intent. Visit every task in the bounded batch.
                for _ in store.tasks():
                    await engine.cycle()
                pending = unknown_orders(store.conn, name)
                tasks = store.tasks()
                if pending or any(t['phase'] != 'IDLE' or any(float(q) for q in t['managed'].values()) for t in tasks):
                    return {"phase": "draining", "message": next((t.get('error') for t in tasks if t.get('error')), "仍有待核实订单或剩余仓位，继续保护")}
                accounts = await engine.venues.accounts()
                for task in tasks:
                    market = engine.venues.markets[task['asset']]
                    engine.assert_owned(task, accounts, market)
                    if await engine.venues.open_orders(market):
                        return {"phase": "draining", "message": "任务市场仍有挂单，请核对订单归属"}
            else:
                # In-flight opens finish through their existing hedge/rescue path.
                # All later decisions see the durable disabled + market-close task.
                pending = [j for j in engine._jobs.values() if not j.done()]
                if pending:
                    await asyncio.wait(pending, timeout=15)
                    if any(not j.done() for j in pending):
                        return {"phase": "draining", "message": "挂单撤销与成交核对中"}
                assets = {t['asset'] for t in store.list_tasks()}
                if not engine.dry_run and assets:
                    await sweep_arcus(engine.executor, app.state.service.client, assets)
                await engine.run_cycle()
                if not engine.dry_run and assets and await sweep_arcus(engine.executor, app.state.service.client, assets):
                    return {"phase": "draining", "message": "残留挂单已撤销，下一轮重新核对成交与仓位"}
                if not engine.dry_run:
                    await app.state.reconciler.run_once()
                    if unknown_orders(store.conn, name):
                        return {"phase": "draining", "message": "未知成交仍在对账，暂不能确认完全停止"}
                snap = await app.state.service.refresh()
                if not engine.dry_run and ((snap.get('accounts') or {}).get('errors') or not snap.get('ready')):
                    return {"phase": "draining", "message": "账户状态未知；已禁止开仓，恢复连接后继续平仓"}
                tasks = store.list_tasks()
                assets = {t['asset'] for t in tasks}
                if any(t.get('opened_at') or t.get('open_quantity') for t in tasks) or any(
                    r['asset'] in assets and (r.get('position') or {}).get('status') not in (None, 'flat') for r in snap.get('rows', [])
                ):
                    return {"phase": "draining", "message": "任务剩余仓位尚未确认平仓，继续保护"}
            return {"phase": "flat", "message": "任务挂单及仓位已核对，等待停止引擎"}
    except Exception as error:
        # Never call a timeout/authorization failure a successful flatten.
        return {"phase": "draining", "message": "撤单平仓待确认：" + str(error)[:250]}
