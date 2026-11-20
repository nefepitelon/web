"""Read-only console projections; unavailable exchange data stays unknown."""
import time
from .venues import D

VENUES = ('binance','lighter')


def ledger(store):
    orders = sorted((o for o in store.orders() if o['state']=='CONFIRMED' and D(o['filled'])>0),key=lambda o:(o['at'],o['id']))
    assets = sorted({o['asset'] for o in orders}|{t['asset'] for t in store.tasks()})
    tasks=[]
    truncated = len(store.orders()) >= 10000
    for asset in assets:
        selected=[o for o in orders if o['asset']==asset]
        volume={v:sum(D(o['quote']) for o in selected if o['venue']==v) for v in VENUES}
        fees=sum(D(o['fee']) for o in selected) if all(o.get('fee') is not None for o in selected) else None
        exposure={v:D(0) for v in VENUES}; pending=[]; completed=[]; opens=0
        for order in selected:
            if not any(exposure.values()) and not order['reduce_only']: opens+=1
            pending.append(order)
            exposure[order['venue']]+=D(order['filled'])*(1 if order['side']=='BUY' else -1)
            if not any(exposure.values()): completed.append(pending); pending=[]
        closed=[o for group in completed for o in group]
        spread=sum(D(o['quote'])*(1 if o['side']=='SELL' else -1) for o in closed)
        closed_volume=sum(D(o['quote']) for o in closed)
        closed_fees=sum(D(o['fee']) for o in closed) if all(o.get('fee') is not None for o in closed) else None
        net=spread-closed_fees if completed and closed_fees is not None and not truncated else None
        tasks.append(dict(asset=asset,opens=opens,rounds=len(completed),volume={k:str(v) for k,v in volume.items()},
            total_volume=str(sum(volume.values())),closed_volume=str(closed_volume),fees=str(fees) if fees is not None else None,
            spread_pnl=str(spread) if completed and not truncated else None,closed_pnl=str(net) if net is not None else None,
            wear_per_10k=str(-net/closed_volume*10000) if net is not None and closed_volume else None))
    result={'tasks':tasks,'orders':sorted(store.orders(),key=lambda o:(o['at'],o['id']),reverse=True)[:100],'history_truncated':truncated,'rounds':sum(t['rounds'] for t in tasks)}
    result['volume']=str(sum(D(t['total_volume']) for t in tasks))
    result['fees']=str(sum(D(t['fees']) for t in tasks)) if all(t['fees'] is not None for t in tasks) else None
    closed=[t for t in tasks if t['rounds']]
    result['closed_trade_pnl_approx_usd']=str(sum(D(t['closed_pnl']) for t in closed)) if closed and all(t['closed_pnl'] is not None for t in closed) else None
    result['volume_24h']=str(sum(D(o['quote']) for o in orders if o['at']>time.time()-86400))
    result['by_venue']={}
    for venue in VENUES:
        selected=[o for o in orders if o['venue']==venue]
        result['by_venue'][venue]={'volume':str(sum(D(o['quote']) for o in selected)),'fills':len(selected),
            'fees':str(sum(D(o['fee']) for o in selected)) if all(o.get('fee') is not None for o in selected) else None}
    result['note']='仅本平台已确认成交；USDT/USDC 按近似 USD 汇总。闭仓损益不含资金费，非账户净收益；未知手续费不当作零。最近 10000 条订单，截断历史不计算损益。'
    return result


def overview(engine):
    snapshot=engine.snapshot
    raw=snapshot.get('_accounts') or {}
    summaries={}; positions=[]
    for venue in VENUES:
        account=raw.get(venue)
        book=raw.get(venue+'_positions')
        error=snapshot.get('accounts',{}).get('errors',{}).get(venue) or snapshot.get('accounts',{}).get('errors',{}).get('connection')
        summary={'connected':account is not None,'error':error,'unit':'USDT' if venue=='binance' else 'USDC',
            'route':'独立代理' if engine.settings.values.get(venue.upper()+'_PROXY') else '共用代理' if engine.settings.values.get('GLOBAL_PROXY') else '直连'}
        if account is not None:
            active=[p for p in (book or {}).values() if D(p.get('positionAmt' if venue=='binance' else 'position',0))]
            if venue=='binance':
                asset=account.get('usdtAsset') or {}
                summary.update(equity=asset.get('marginBalance',account.get('totalMarginBalance')),available=account.get('availableBalance'),
                    unrealized=asset.get('unrealizedProfit',account.get('totalUnrealizedProfit')),positions=len(active),
                    mode='单向 / 单资产' if account.get('oneWay') and account.get('singleAsset') else '账户模式待预检')
            else:
                summary.update(equity=account.get('total_asset_value'),available=account.get('available_balance'),
                    unrealized=str(sum(D(p.get('unrealized_pnl',0)) for p in active)),positions=len(active),mode='Lighter Core')
            for market_id,p in (book or {}).items():
                quantity=D(p.get('positionAmt' if venue=='binance' else 'position',0))
                if not quantity: continue
                if venue=='lighter' and int(p.get('sign',1))<0: quantity=-quantity
                asset=p.get('symbol',str(market_id))
                if venue=='binance':
                    market=next((m for m in engine.venues.markets.values() if m['symbol']==asset),None)
                    asset=market['asset'] if market else asset
                mark=D(p.get('markPrice',0)) if venue=='binance' else abs(D(p.get('position_value',0))/quantity)
                liquidation=D(p.get('liquidationPrice' if venue=='binance' else 'liquidation_price',0))
                distance=abs(mark-liquidation)/mark*100 if mark>0 and liquidation>0 else None
                sane=liquidation<=0 or liquidation<mark if quantity>0 else liquidation<=0 or liquidation>mark
                task=engine.store.get(asset)
                owned=task is not None and D(task['managed'][venue])==quantity
                leverage=p.get('leverage')
                if venue=='lighter' and D(p.get('initial_margin_fraction',0))>0: leverage=str(D(100)/D(p['initial_margin_fraction']))
                positions.append(dict(asset=asset,venue=venue,quantity=str(quantity),mark=str(mark) if mark else None,
                    entry=p.get('entryPrice' if venue=='binance' else 'avg_entry_price'),liquidation=str(liquidation) if liquidation else None,
                    distance_pct=float(distance) if distance is not None else None,
                    unrealized=p.get('unRealizedProfit' if venue=='binance' else 'unrealized_pnl'),leverage=leverage,
                    owned=owned,sane=bool(sane),risk=distance is not None and distance<engine.settings.number('CLOSE_CORRIDOR_PCT')))
        summaries[venue]=summary
    return {'venues':summaries,'positions':positions,'updated_at':snapshot.get('refreshed_at'),'liquidation_warn_pct':engine.settings.values['CLOSE_CORRIDOR_PCT']}


def capacity(engine, stats):
    enabled=[t for t in engine.store.tasks() if t['enabled']]
    estimated=sum(float(t.get('sampled_notional',t['notional']))*4*24/(float(t.get('sampled_hold_hours',t['hold_hours']))+engine.settings.number('REOPEN_COOLDOWN_SECONDS')/3600+engine.settings.number('ENGINE_CYCLE_SECONDS')*max(1,len(engine.store.tasks()))/3600) for t in enabled)
    raw=engine.snapshot.get('_accounts') or {}
    available=[(raw.get(v) or {}).get('availableBalance' if v=='binance' else 'available_balance') for v in VENUES]
    ceiling=min(float(x) for x in available)/engine.settings.number('MARGIN_BUFFER') if all(x is not None for x in available) else None
    return {'max_task_notional':engine.settings.values['MAX_TASK_NOTIONAL'],'margin_buffer':engine.settings.values['MARGIN_BUFFER'],
        'max_tasks':4,'estimated_daily_volume':estimated,'volume_24h':stats['volume_24h'],
        'capital_notional_capacity':min(ceiling,engine.settings.number('MAX_TASK_NOTIONAL')) if ceiling is not None else None,
        'maximum_daily_volume':min(ceiling,engine.settings.number('MAX_TASK_NOTIONAL'))*4*24/(0.01+engine.settings.number('REOPEN_COOLDOWN_SECONDS')/3600+engine.settings.number('ENGINE_CYCLE_SECONDS')*max(1,len(engine.store.tasks()))/3600) if ceiling is not None else None,
        'note':'估算为每轮双边开平名义额，不含挂单等待、拒单或行情中断；资金容量按两所较小可用保证金计算。'}
