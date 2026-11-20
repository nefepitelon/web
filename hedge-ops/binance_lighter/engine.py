"""Serial, durable IOC hedge state machine. Only owned exposure may be reduced."""
import asyncio
import json
from decimal import Decimal
import time
from .config import redact
from .venues import D, Venues, Rejected, Unknown, common_step, quantize


class Engine:
    def __init__(self, settings, store, venues=None):
        self.settings, self.store = settings, store
        self.venues = venues or Venues(settings)
        self.venues.markets.update({t['asset']: t['market'] for t in store.tasks() if t.get('market')})
        if venues is None: self.venues.markets_from_tasks=bool(self.venues.markets)
        self._lock = asyncio.Lock()
        self._refresh_lock = asyncio.Lock()
        self.snapshot = {'ready': False, 'rows': [], 'accounts': {'errors': {}}, 'generated_at': None}
        self.last_cycle_at = None
        self._spread_lock = asyncio.Lock()
        self.spread_snapshot = json.loads(store.meta('spreads') or '{}')

    async def spreads(self,force=False):
        async with self._spread_lock:
            if not force and time.time()-self.spread_snapshot.get('scanned_at',0) < 600: return self.spread_snapshot
            try:
                self.spread_snapshot=await self.venues.spreads()
                self.store.meta('spreads',json.dumps(self.spread_snapshot))
            except Exception as error:
                return {**self.spread_snapshot,'error':self.safe_error(error)}
            return self.spread_snapshot

    def safe_error(self, error):
        return redact(error, self.settings.values)[:600]

    def credentials(self):
        return all(self.settings.values.get(k) for k in ('BINANCE_API_KEY', 'BINANCE_API_SECRET', 'LIGHTER_ACCOUNT_INDEX', 'LIGHTER_API_KEY_INDEX', 'LIGHTER_API_PRIVATE_KEY'))

    async def refresh(self):
        async with self._refresh_lock:
            read_accounts = self.venues.account_snapshot if hasattr(self.venues, 'account_snapshot') else self.venues.accounts
            funding, accounts = await asyncio.gather(self.venues.funding(), read_accounts(), return_exceptions=True)
            errors = {}
            if isinstance(funding, Exception):
                errors['funding'] = self.safe_error(funding)
                rows, generated = self.snapshot['rows'], self.snapshot.get('generated_at')
            else: rows, generated = funding, time.time()
            if isinstance(accounts, Exception):
                errors['accounts'] = self.safe_error(accounts)
                accounts = {'binance':None,'lighter':None,'binance_positions':None,'lighter_positions':None,'errors':{'connection':errors['accounts']}}
            errors.update({k:self.safe_error(v) for k,v in accounts.get('errors',{}).items()})
            for row in rows:
                task = self.store.get(row['asset'])
                market = self.venues.markets.get(row['asset'])
                p = self.venues.positions(accounts, market) if market and all(accounts.get(v+'_positions') is not None for v in ('binance','lighter')) else None
                row['positions'] = {k:str(v) for k,v in p.items()} if p is not None else {'binance':None,'lighter':None}
                row['position'] = {'status':'unknown' if p is None else 'flat' if not any(p.values()) else 'hedged' if p['binance']==-p['lighter'] else 'mismatch'}
                row['phase'] = task.get('phase','IDLE') if task else 'IDLE'
            open_assets = [symbol for symbol,p in (accounts.get('binance_positions') or {}).items() if D(p.get('positionAmt',0))]
            open_assets += [p.get('symbol',str(m)) for m,p in (accounts.get('lighter_positions') or {}).items() if D(p.get('position',0))]
            self.snapshot = {'ready':not errors,'funding_ready':not isinstance(funding,Exception),'rows':rows,'generated_at':generated,
                'refreshed_at':time.time(),'errors':errors,'error':'；'.join(errors.values()) or None,
                'accounts':{'errors':{k:v for k,v in errors.items() if k!='funding'},'open_assets':open_assets,
                    'binance_available':(accounts.get('binance') or {}).get('availableBalance'),
                    'lighter_available':(accounts.get('lighter') or {}).get('available_balance')},'_accounts':accounts}
            return self.snapshot

    async def preflight(self):
        if not self.credentials(): raise Rejected('请完整配置 Binance 和 Lighter Core 的专用 API 交易凭据')
        if time.time()-(self.snapshot.get('generated_at') or 0)>10: await self.refresh()
        key_index = int(self.settings.values['LIGHTER_API_KEY_INDEX'])
        if not 4 <= key_index <= 254 or key_index == 157: raise Rejected('Lighter Key 编号应为 4–254，不能使用保留编号 157')
        accounts = await self.venues.preflight()
        if D(accounts['binance']['availableBalance']) <= 0 or D(accounts['lighter']['available_balance']) <= 0:
            raise Rejected('两所均须有可用保证金')
        for task in self.store.tasks():
            market = self.venues.markets.get(task['asset'])
            if not market: raise Rejected(f'{task["asset"]} 不在两所共同交易的 USDT / USDC 永续市场中')
            if await self.venues.open_orders(market): raise Rejected(f'{task["asset"]} 有未完成订单，请在交易所核对')
            self.assert_owned(task, accounts, market)
            if not self.settings.dry_run and hasattr(self.venues,'test_order'):
                row=next((r for r in self.snapshot['rows'] if r['asset']==task['asset']),None)
                if row is None: raise Rejected('缺少任务行情，暂不能验证 Binance 交易权限')
                quantity=quantize(D(task['notional'])/D(row['mark']),common_step(market['binance_step'],market['lighter_step']))
                price,_=await self.venues.prices(market,'binance','BUY',quantity)
                await self.venues.test_order(market,quantity,price)
        owned_symbols = {self.venues.markets[t['asset']]['symbol'] for t in self.store.tasks()}
        owned_markets = {self.venues.markets[t['asset']]['market_id'] for t in self.store.tasks()}
        if any(D(p.get('positionAmt', 0)) and symbol not in owned_symbols for symbol,p in accounts['binance_positions'].items()) or any(D(p.get('position', 0)) and market not in owned_markets for market,p in accounts['lighter_positions'].items()):
            raise Rejected('专用账户存在任务外仓位，请人工核对；本平台不会接管这些仓位')
        return {'ok': True, 'checks': ['Binance accountConfig 交易许可、单向持仓和单资产模式', 'Binance 测试订单验证当前 Key 的交易权限（有任务时执行，不进入撮合）', 'Lighter Core 原生签名库、账户/Key 匹配和 nonce 通道', '余额、共同市场、已有仓位归属与挂单'], 'submittedOrders': 0}

    def assert_owned(self, task, accounts, market):
        actual = self.venues.positions(accounts, market)
        expected = {k: D(v) for k, v in task['managed'].items()}
        if actual != expected: raise Rejected('实际仓位与本任务账本不符；可能有手工仓位、其他程序或待确认订单，已禁止自动操作')
        return actual

    async def order(self, asset, venue, side, quantity, reduce_only, price, *, execution='ioc', wait_seconds=20):
        from emergency import latched
        if not reduce_only and (latched(self.store) or not self.store.get(asset)['enabled']): raise Rejected('任务已停用或停撤平已锁定开仓')
        order = self.store.intent(asset, venue, side, quantity, reduce_only)
        order.update(execution=execution,price=str(price),deadline=time.time()+wait_seconds)
        self.store.save_order(order)
        market = self.venues.markets[asset]
        try:
            response = await self.venues.submit(order, market, price)
            order.update(state='SUBMITTED', receipt=response)
            self.store.save_order(order)
        except Rejected as error:
            order.update(state='REJECTED',error=self.safe_error(error)); self.store.save_order(order)
            self.store.log(asset,self.safe_error(error))
            return D(0)
        except BaseException:
            order['state'] = 'UNKNOWN'; self.store.save_order(order)
            raise Unknown('报单结果未知，已保存订单意图并暂停该任务；核对完成前绝不重复报单') from None
        if execution=='maker':
            try:
                while True:
                    status=await self.venues.maker_status(order,market)
                    if status.get('status') in ('FILLED','CANCELED','EXPIRED','EXPIRED_IN_MATCH','REJECTED'): break
                    # Cancel as soon as any fill appears, then hedge the final
                    # terminal quantity. Never leave the remainder live while hedging.
                    if D(status.get('executedQty',0))>0 or time.time()>=order['deadline'] or latched(self.store) or not self.store.get(asset)['enabled']:
                        await self.venues.cancel_owned(order,market);break
                    await asyncio.sleep(.5)
            except BaseException:
                order['state']='UNKNOWN';self.store.save_order(order)
                raise Unknown('Binance 挂单状态未确认，已暂停；恢复时先撤原订单并核实终态，不重发') from None
        for _ in range(20):
            try:
                result = await self.venues.lookup(order, market)
                if result:
                    filled = D(result['filled'])
                    if not filled.is_finite() or filled < 0 or filled > quantity: raise Unknown('成交数量异常')
                    self.store.confirm(order, result)
                    return filled
            except (Rejected, Unknown, httpx_error_types()):
                pass
            await asyncio.sleep(1.5)
        order['state'] = 'UNKNOWN'; self.store.save_order(order)
        raise Unknown('未取得终态成交记录，已暂停任务；HTTP 接收回执不能代替成交')

    async def recover(self, task):
        for order in self.store.orders(task['asset']):
            if order['state'] not in ('INTENT', 'SUBMITTED', 'UNKNOWN'): continue
            from emergency import latched
            if latched(self.store) or order.get('execution')=='maker': await self.venues.cancel_owned(order, self.venues.markets[task['asset']])
            result = await self.venues.lookup(order, self.venues.markets[task['asset']])
            if result is None: raise Unknown('仍有未确认订单，继续暂停；请在交易所按客户订单号核对')
            self.store.confirm(order, result)
        task = self.store.get(task['asset'])
        if task['phase'] == 'REVIEW':
            task.update(phase='CLOSING', enabled=False, error='订单已核实，下一轮仅减仓恢复空仓')
            self.store.put(task)

    async def close_owned(self, task, accounts):
        market = self.venues.markets[task['asset']]
        positions = self.assert_owned(task, accounts, market)
        for venue, quantity in positions.items():
            if not quantity: continue
            side = 'SELL' if quantity > 0 else 'BUY'
            price, _ = await self.venues.prices(market, venue, side, abs(quantity))
            await self.order(task['asset'], venue, side, abs(quantity), True, price)
        current = self.store.get(task['asset'])
        if not any(D(q) for q in current['managed'].values()):
            current.update(phase='IDLE', opened_at=None, closed_at=time.time(), error='')
        else: current['phase'] = 'CLOSING'
        self.store.put(current)

    async def open_pair(self, task, row, accounts):
        market = self.venues.markets[task['asset']]
        self.assert_owned(task, accounts, market)
        if await self.venues.open_orders(market): raise Rejected('有未成交订单，不能开新对冲')
        from secrets import randbelow
        sample = lambda low, high: D(low) + (D(high)-D(low)) * D(randbelow(1_000_001)) / 1_000_000
        chosen_notional = sample(task['notional'],task.get('notional_max',task['notional']))
        chosen_hold = sample(task['hold_hours'],task.get('hold_hours_max',task['hold_hours']))
        quantity = quantize(chosen_notional / D(row['mark']), common_step(market['binance_step'], market['lighter_step']))
        if quantity < max(D(market['binance_min']), D(market['lighter_min'])) or quantity > D(market['binance_max']): raise Rejected('下单量不满足两所最小数量、精度或最大数量')
        side = 'BUY' if row['direction'] == 'BINANCE_LONG' else 'SELL'
        other = 'SELL' if side == 'BUY' else 'BUY'
        bp, btop = await self.venues.prices(market, 'binance', side, quantity)
        lp, ltop = await self.venues.prices(market, 'lighter', other, quantity)
        if abs(btop/ltop - 1) * 10000 > D(self.settings.values['MAX_OPEN_BASIS_BPS']): raise Rejected('两所盘口基差超过开仓上限')
        if quantity * bp < D(market['min_notional']) or quantity * lp < D(market['lighter_notional']): raise Rejected('订单名义额低于两所最低门槛')
        buffer = D(self.settings.values['MARGIN_BUFFER'])
        leverage=task.get('leverage')
        if leverage:
            await self.venues.prepare_leverage(market,int(leverage),quantity*max(bp,lp),accounts)
            # Re-read balances and ownership after changing settings, before orders.
            accounts=await self.venues.accounts();self.assert_owned(task,accounts,market)
        margin_leverage=D(leverage or 1)  # Legacy tasks retain conservative full-notional coverage.
        if quantity * max(bp, lp) / margin_leverage * buffer > min(D(accounts['binance']['availableBalance']), D(accounts['lighter']['available_balance'])):
            raise Rejected('保证金缓冲不足；两所可用保证金均须覆盖名义额 ÷ 已确认杠杆 × 配置缓冲倍数')
        task.update(phase='OPENING', opened_at=time.time(), direction=row['direction'], error='',sampled_notional=str(chosen_notional),sampled_hold_hours=str(chosen_hold))
        self.store.put(task)
        maker=task.get('order_type','ioc')=='binance_maker'
        if maker: bp=await self.venues.maker_price(market,side)
        first = await self.order(task['asset'], 'binance', side, quantity, False, bp,execution='maker' if maker else 'ioc',wait_seconds=task.get('maker_wait_seconds',20))
        target = quantize(first, common_step(market['binance_step'], market['lighter_step']))
        second = D(0)
        try:
            if target:
                # Refresh the second book after the first terminal fill, not a stale quote.
                lp, top = await self.venues.prices(market, 'lighter', other, target)
                if abs(bp/top-1)*10000>D(self.settings.values['MAX_OPEN_BASIS_BPS']): raise Rejected('首腿成交后基差超限，撤销对冲开仓并仅减仓补救首腿')
                if target >= D(market['lighter_min']) and target * lp >= D(market['lighter_notional']):
                    second = await self.order(task['asset'], 'lighter', other, target, False, lp)
        except Rejected:
            pass  # Known non-submission: remove the exposed first-leg quantity.
        # Unknown submission escapes immediately: never flatten a possibly hedged leg blindly.
        difference = first - second
        if difference:
            rescue_price, _ = await self.venues.prices(market, 'binance', other, difference)
            await self.order(task['asset'], 'binance', other, difference, True, rescue_price)
        current = self.store.get(task['asset'])
        b, l = (D(current['managed'][v]) for v in ('binance', 'lighter'))
        current['phase'] = 'OPEN' if b and b == -l else 'IDLE' if not b and not l else 'CLOSING'
        if current['phase'] == 'IDLE': current.update(opened_at=None, closed_at=time.time())
        self.store.put(current)
        self.store.log(task['asset'], f'{"Binance 限价挂单" if maker else "双腿 IOC"} 开仓终态确认：Binance {first}，Lighter {second}；差额仅减仓补救 {difference}')

    def urgent(self, task, accounts, market):
        if not task['enabled'] or task['phase'] in ('OPENING', 'CLOSING'): return True
        if time.time() - (task.get('opened_at') or time.time()) >= float(task.get('sampled_hold_hours',task['hold_hours'])) * 3600: return True
        for venue, position in [('binance', accounts['binance_positions'].get(market['symbol'], {})), ('lighter', accounts['lighter_positions'].get(market['market_id'], {}))]:
            if not D(task['managed'][venue]): continue
            liquidation = D(position.get('liquidationPrice' if venue == 'binance' else 'liquidation_price', 0))
            if venue == 'binance': mark = D(position.get('markPrice', 0))
            else:
                quantity = D(position.get('position', 0))
                mark = abs(D(position.get('position_value', 0)) / quantity) if quantity else D(0)
            if mark <= 0: raise Rejected('持仓标记价格未确认，暂停决策')
            if liquidation > 0 and abs(mark-liquidation)/mark*100 < D(self.settings.values['CLOSE_CORRIDOR_PCT']): return True
        return False

    async def cycle(self):
        async with self._lock:
            async with asyncio.timeout(220):
                from emergency import latched, latch_connection
                if latched(self.store): latch_connection(self.store.conn, 'binance')
                snap = await self.refresh()
                self.last_cycle_at = time.time()
                if not snap['ready']: self.store.log('-', '行情未就绪，禁止新开仓，已有仓位继续尝试账户核实与减仓')
                tasks = self.store.tasks()
                if not tasks: return
                cursor = int(self.store.meta('cursor') or 0) % len(tasks)
                # One trading task per finite cloud invocation; persist a round-robin cursor.
                task = tasks[cursor]; self.store.meta('cursor', (cursor+1) % len(tasks))
                asset = task['asset']
                try:
                    if self.settings.dry_run:
                        if task['enabled']: self.store.log(asset, '演练：完成行情决策，不调用签名下单接口')
                        return
                    if not self.credentials(): raise Rejected('实盘凭据不完整')
                    if asset not in self.venues.markets: raise Rejected('市场已下架或无法匹配，请人工核对仓位')
                    await self.recover(task)
                    task = self.store.get(asset)
                    accounts = await self.venues.accounts()
                    owned = self.assert_owned(task, accounts, self.venues.markets[asset])
                    if any(owned.values()):
                        if owned['binance'] != -owned['lighter'] or self.urgent(task, accounts, self.venues.markets[asset]): await self.close_owned(task, accounts)
                    elif task['phase'] not in ('IDLE',):
                        task.update(phase='IDLE', opened_at=None, closed_at=time.time()); self.store.put(task)
                    elif snap['ready'] and task['enabled'] and time.time() - task.get('closed_at', 0) >= self.settings.number('REOPEN_COOLDOWN_SECONDS'):
                        row = next((r for r in snap['rows'] if r['asset'] == asset), None)
                        if not row or row['net_bps_h'] < self.settings.number('MIN_NET_FUNDING_BPS_H'): return
                        if time.time() - snap['generated_at'] > self.settings.number('FUNDING_STALE_MAX_SECONDS'): return
                        await self.preflight()  # Read-only authorization checks before opening.
                        accounts = await self.venues.accounts()
                        await self.open_pair(task, row, accounts)
                    # Reconcile real commissions separately; unknown fees remain unknown.
                    for order in self.store.orders(asset)[:8]:
                        if order['state'] == 'CONFIRMED' and order.get('fee') is None:
                            try:
                                fee = await self.venues.fees(order, self.venues.markets[asset])
                                if fee is not None: order['fee'] = fee; self.store.save_order(order)
                            except Exception: pass
                except Unknown as error:
                    task = self.store.get(asset); task.update(phase='REVIEW', enabled=False, error=self.safe_error(error)); self.store.put(task)
                    self.store.log(asset, self.safe_error(error))
                except Exception as error:
                    task = self.store.get(asset); task['error'] = self.safe_error(error); self.store.put(task)
                    self.store.log(asset, self.safe_error(error))


def httpx_error_types():
    import httpx
    return httpx.HTTPError
