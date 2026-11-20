"""Two normalized ledger slots reuse the existing proven state machine.

`binance` means left leg and `lighter` means right leg in the shared journal;
market records carry real venue IDs. No adapter may silently change accounts.
"""
import asyncio
import time
from binance_lighter.venues import D, quantize, Venues as Legacy, Rejected
from .config import PAIRS, NAMES
from .exchanges import Existing, OKX, Hyperliquid

SLOTS=('binance','lighter')
NEW_PAIRS={'ondoperps_entropy','ondoperps_ondoperps'}

def adapter(settings,name):
    if name.startswith('ondoperps'):
        from .ondo import OndoperpsVenue
        return OndoperpsVenue(settings,name=name,prefix=name.upper())
    if name=='entropy':
        from .entropy import Entropy
        return Entropy(settings)
    return OKX(settings) if name=='okx' else Hyperliquid(settings) if name=='hyperliquid' else Existing(settings,name)

class Venues:
    PUBLIC_CYCLE_BUDGET=8.0
    def __init__(self,settings):
        self.settings=settings
        self.names=dict(zip(SLOTS,PAIRS[settings.pair]))
        self.adapters={slot:adapter(settings,name) for slot,name in self.names.items()}
        self.markets={};self.markets_from_tasks=False;self.metadata_at=0
        self.metadata_lock=asyncio.Lock()
    async def close(self):await asyncio.gather(*(a.close() for a in self.adapters.values()))
    async def metadata(self):
        if self.settings.pair in NEW_PAIRS:
            try:
                async with asyncio.timeout(self.PUBLIC_CYCLE_BUDGET):return await self._locked_metadata()
            except TimeoutError:raise Rejected('共同市场读取超时，账户独立读取仍保留；新开仓暂停') from None
        return await self._locked_metadata()
    async def _locked_metadata(self):
        async with self.metadata_lock:
            if not self.markets_from_tasks and self.markets and time.time()-self.metadata_at<5:return self.markets
            return await self._metadata()
    async def _metadata(self):
        left,right=await asyncio.gather(*(a.metadata() for a in self.adapters.values()))
        self.markets={a:dict(asset=a,symbol=left[a]['id'],market_id=right[a]['id'],binance_step=left[a]['step'],binance_min=left[a]['minimum'],binance_max=left[a]['maximum'],tick=left[a]['tick'],min_notional=left[a]['notional'],lighter_step=right[a]['step'],lighter_min=right[a]['minimum'],lighter_notional=right[a]['notional'],left=left[a],right=right[a],left_venue=self.names['binance'],right_venue=self.names['lighter']) for a in sorted(left.keys() & right.keys())}
        self.markets_from_tasks=False;self.metadata_at=time.time()
        # Funding requests only need common instruments; this also bounds OKX's
        # per-instrument endpoint work instead of polling every listed swap.
        for a in self.adapters.values():a.markets={k:v for k,v in a.markets.items() if k in self.markets}
        return self.markets
    async def funding(self):
        if self.settings.pair in NEW_PAIRS:
            try:
                async with asyncio.timeout(self.PUBLIC_CYCLE_BUDGET):return await self._funding()
            except TimeoutError:raise Rejected('行情读取超时，账户独立读取仍保留；新开仓暂停') from None
        return await self._funding()
    async def _funding(self):
        if not self.markets or self.markets_from_tasks or time.time()-self.metadata_at>300:await self.metadata()
        dual=self.settings.pair=='ondoperps_ondoperps'
        if dual:
            # Both accounts trade the same venue/market. One public sample
            # prevents sampling delay from inventing a funding differential.
            left=await self.adapters['binance'].funding();right=left
        else:left,right=await asyncio.gather(*(a.funding() for a in self.adapters.values()))
        rows=[]
        for asset,m in self.markets.items():
            if asset not in left or asset not in right:continue
            l,r=left[asset],right[asset];lr,rr=D(l['rate']),D(r['rate'])
            if not lr.is_finite() or not rr.is_finite() or max(abs(lr),abs(rr))>100:continue
            # Adapter limits may refresh after metadata (Binance private tiers).
            ml=self.adapters['binance'].markets[asset];mr=self.adapters['lighter'].markets[asset]
            bl,ll=ml.get('max_leverage'),mr.get('max_leverage')
            m.update(left=ml,right=mr,binance_max_leverage=bl,lighter_max_leverage=ll)
            mark=l.get('mark') or r.get('mark')
            if mark is None:
                book=await self.adapters['binance'].book(ml);mark=(book['bids'][0][0]+book['asks'][0][0])/2
            rows.append(dict(asset=asset,binance_bps_h=float(lr),lighter_bps_h=float(rr),net_bps_h=0.0 if dual else float(abs(lr-rr)),direction='BINANCE_LONG' if dual or lr<rr else 'LIGHTER_LONG',mark=float(mark),binance_interval_h=l['interval'],lighter_interval_h=r['interval'],binance_max_leverage=bl,lighter_max_leverage=ll,max_leverage=min(bl,ll) if bl and ll else None,leverage_error=None if bl and ll else '需读取两所杠杆档位；尚未核实的上限不用于开仓',funding_arbitrage=not dual,strategy='dual_account_rotation' if dual else 'funding_hedge',funding_note='同所同市场资金费差为0；仅双账户对冲轮换，手续费和滑点均为真实成本' if dual else None))
        return sorted(rows,key=lambda r:-r['net_bps_h'])
    async def account_snapshot(self):
        if self.settings.pair not in NEW_PAIRS and (not self.markets or self.markets_from_tasks):await self.metadata()
        async def read(account):
            if self.settings.pair not in NEW_PAIRS:return await account.account()
            try:
                async with asyncio.timeout(8):return await account.account()
            except TimeoutError:raise Rejected(NAMES[account.name]+' 账户读取超时，持仓仍待核实，未按空仓处理') from None
        results=await asyncio.gather(*(read(a) for a in self.adapters.values()),return_exceptions=True)
        if self.settings.pair=='ondoperps_ondoperps' and all(not isinstance(r,Exception) for r in results):
            identities=[str(r.get('account_id') or '').strip() for r in results]
            if not all(identities) or identities[0]==identities[1]:
                error=Rejected('OndoPerps 双账户须由 API 返回两个不同的真实 accountID；同一账户的不同 API Key 不能互相对冲')
                results=[error,error]
        snap={'errors':{}}
        for slot,result in zip(SLOTS,results):
            if isinstance(result,Exception):
                snap[slot]=snap[slot+'_positions']=None;snap['errors'][slot]=str(result);continue
            if slot=='binance':
                snap[slot]=dict(availableBalance=result['available'],totalMarginBalance=result['equity'],totalUnrealizedProfit=result['pnl'],oneWay=True,singleAsset=True,canTrade=True)
                snap[slot+'_positions']={i:dict(positionAmt=p['quantity'],markPrice=p['mark'],entryPrice=p['entry'],liquidationPrice=p['liquidation'],unRealizedProfit=p['pnl'],leverage=p.get('leverage'),symbol=i) for i,p in result['positions'].items()}
            else:
                snap[slot]=dict(available_balance=result['available'],total_asset_value=result['equity'])
                snap[slot+'_positions']={i:dict(position=str(abs(D(p['quantity']))),sign=-1 if D(p['quantity'])<0 else 1,position_value=str(abs(D(p['quantity']))*D(p['mark'])),avg_entry_price=p['entry'],liquidation_price=p['liquidation'],unrealized_pnl=p['pnl'],initial_margin_fraction=str(100/D(p['leverage'])) if p.get('leverage') else '0',symbol=p['asset']) for i,p in result['positions'].items()}
            if self.names[slot]=='entropy':
                snap[slot].update(account_mode=result.get('account_mode'),balance_source=result.get('balance_source'))
        return snap
    async def accounts(self):
        snap=await self.account_snapshot()
        if snap['errors']:raise Rejected(next(iter(snap['errors'].values())))
        return snap
    positions=staticmethod(Legacy.positions)
    async def preflight(self):
        if self.settings.pair=='ondoperps_ondoperps':
            identities=await asyncio.gather(*(a.identity() for a in self.adapters.values()))
            if not all(str(i or '').strip() for i in identities) or str(identities[0])==str(identities[1]):
                raise Rejected('OndoPerps 双账户须为两个不同的真实 accountID，不能使用同一主/子账户的两组凭据')
        await self.metadata()
        await asyncio.gather(*(a.preflight() for a in self.adapters.values()))
        return await self.accounts()
    def market(self,m,slot):return m['left' if slot=='binance' else 'right']
    async def open_orders(self,m):return any(await asyncio.gather(*(self.adapters[s].open_orders(self.market(m,s)) for s in SLOTS)))
    async def prices(self,m,slot,side,quantity):
        a=self.adapters[slot];meta=self.market(m,slot);book=await a.book(meta)
        rows=book['asks' if side=='BUY' else 'bids']
        if not rows or rows[0][0]<=0:raise Rejected('盘口为空，未发送订单')
        limit=rows[0][0]*(1+D(self.settings.values['ORDER_SLIPPAGE_BPS'])/10000*(1 if side=='BUY' else -1))
        price=a.round_price(meta,limit,side=='SELL') if hasattr(a,'round_price') else quantize(limit,meta['tick'],side=='SELL')
        available=sum(q for p,q in rows if (p<=price if side=='BUY' else p>=price))
        if price<=0 or available<quantity:raise Rejected('允许滑点内盘口深度不足')
        if quantity>D(meta['maximum']):raise Rejected('订单数量超过交易所上限')
        return price,rows[0][0]
    async def maker_price(self,m,side):
        a=self.adapters['binance'];meta=m['left'];book=await a.book(meta);price=book['bids' if side=='BUY' else 'asks'][0][0]
        return a.round_price(meta,price,side=='SELL') if hasattr(a,'round_price') else quantize(price,meta['tick'],side=='SELL')
    async def prepare_leverage(self,m,lev,notional,accounts):
        if any(self.positions(accounts,m).values()):raise Rejected('双腿空仓后才能设置杠杆')
        if (D(1)/lev-D('0.01'))*100<=D(self.settings.values['CLOSE_CORRIDOR_PCT']):raise Rejected('所选杠杆的保证金余量不足风控距离，请降低杠杆')
        for s in SLOTS:
            meta=self.market(m,s);maximum=meta.get('max_leverage')
            if not maximum or lev>maximum:raise Rejected(NAMES[self.names[s]]+' 杠杆上限尚未核实或超限')
            await self.adapters[s].set_leverage(meta,lev,notional)
    async def submit(self,o,m,p):return await self.adapters[o['venue']].submit(o,self.market(m,o['venue']),p)
    async def lookup(self,o,m):return await self.adapters[o['venue']].lookup(o,self.market(m,o['venue']))
    async def cancel_owned(self,o,m):return await self.adapters[o['venue']].cancel(o,self.market(m,o['venue']))
    async def maker_status(self,o,m):return await self.adapters[o['venue']].status(o,self.market(m,o['venue']))
    async def fees(self,o,m):return await self.adapters[o['venue']].fees(o,self.market(m,o['venue']))
    async def spreads(self):
        if not self.markets:await self.metadata()
        sem=asyncio.Semaphore(4)
        async def read(asset,m):
            row=dict(asset=asset,binance_bps=None,lighter_bps=None,total_bps=None)
            try:
                async with sem:
                    async with asyncio.timeout(6):books=await asyncio.gather(*(self.adapters[s].book(self.market(m,s)) for s in SLOTS))
                values=[Legacy.book_spread(b['bids'][0][0],b['asks'][0][0]) for b in books]
                row.update(binance_bps=values[0],lighter_bps=values[1],total_bps=sum(values))
            except (Exception,asyncio.CancelledError):row['error']='双所价差待扫描'
            return row
        jobs=[asyncio.create_task(read(a,m)) for a,m in self.markets.items()]
        if not jobs:return dict(assets=[],scanned_at=time.time())
        _,pending=await asyncio.wait(jobs,timeout=35)
        for job in pending:job.cancel()
        rows=await asyncio.gather(*jobs)
        return dict(assets=sorted(rows,key=lambda r:(r['total_bps'] is None,r['total_bps'] or 0,r['asset'])),scanned_at=time.time(),note='两所买卖价差之和，从窄到宽；未知值排末尾，开仓前重新核实实时盘口')
