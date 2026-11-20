from pathlib import Path
from binance_lighter.api import create_app as base_app
from binance_lighter.engine import Engine as BaseEngine
from binance_lighter.views import overview as base_overview
from binance_lighter.venues import D, Rejected
from .config import PAIRS, NAMES, KEYS, redact
from .venues import Venues, SLOTS

class Engine(BaseEngine):
    def __init__(self,settings,store,venues=None):
        super().__init__(settings,store,venues or Venues(settings))
        # Saved market identifiers support recovery, but must never masquerade
        # as complete live instrument metadata after a process/cloud cold start.
        self.venues.markets_from_tasks=bool(self.venues.markets)
        for adapter in self.venues.adapters.values():
            if adapter.name in {'hyperliquid','entropy'}:
                def next_nonce(server, store=store, key=adapter.name+'_nonce'):
                    nonce=max(server,int(store.meta(key) or 0)+1)
                    store.meta(key,nonce) # Commit before signing.
                    return nonce
                adapter.next_nonce=next_nonce
    def credentials(self):return all(self.settings.values.get(k) for v in PAIRS[self.settings.pair] for k in KEYS[v])
    def safe_error(self,error):
        text=redact(error,self.settings.values)
        # Shared journal field names are internal; user-facing text uses venues.
        left,right=(NAMES[v] for v in PAIRS[self.settings.pair])
        return text.replace('Binance',left).replace('Lighter',right)[:600]
    async def preflight(self):
        if not self.credentials():raise Rejected('请完整配置两所专用交易 API 凭据')
        accounts=await self.venues.preflight()
        if D(accounts['binance']['availableBalance'])<=0 or D(accounts['lighter']['available_balance'])<=0:raise Rejected('两所均须有可用保证金')
        for task in self.store.tasks():
            if self.settings.pair in {'ondoperps_entropy','ondoperps_ondoperps'} and not task.get('leverage'):
                raise Rejected('新交易对任务须明确设置双所杠杆，开仓前将逐所设置并读回核实')
            m=self.venues.markets.get(task['asset'])
            if not m:raise Rejected('任务币种已不在两所相同单位的共同永续市场')
            self.assert_owned(task,accounts,m)
            if await self.venues.open_orders(m):raise Rejected('任务市场存在未完成挂单，禁止开仓')
            if not self.settings.dry_run and PAIRS[self.settings.pair][0]=='binance':
                from binance_lighter.venues import quantize, common_step
                book=await self.venues.adapters['binance'].book(m['left'])
                price=book['asks'][0][0]
                qty=quantize(D(task['notional'])/price,common_step(m['binance_step'],m['lighter_step']))
                if qty<=0:raise Rejected('任务金额低于共同下单精度')
                await self.venues.adapters['binance'].native.test_order({'symbol':m['symbol']},qty,price)
        symbols={m['symbol'] for t in self.store.tasks() if (m:=self.venues.markets.get(t['asset']))}
        markets={m['market_id'] for t in self.store.tasks() if (m:=self.venues.markets.get(t['asset']))}
        if any(D(p['positionAmt']) and i not in symbols for i,p in accounts['binance_positions'].items()) or any(D(p['position']) and i not in markets for i,p in accounts['lighter_positions'].items()):raise Rejected('专用账户存在任务外仓位，不自动接管')
        checks=['官方账户身份与签名读取','共同永续单位、盘口、精度与保证金','任务自有仓位和挂单归属','独立订单意图、未知订单恢复和只减仓保护']
        permissions={}
        for adapter in self.venues.adapters.values():
            report=getattr(adapter,'permission_report',{})
            if report:
                # Expose scope diagnostics without account identifiers or keys.
                permissions[adapter.name]={k:report[k] for k in ('account_verified','market_permissions_verified','trade_scope','trade_scope_verified','api_key_management','message') if k in report}
                checks.append(NAMES.get(adapter.name,adapter.name)+'：'+report['message'])
        if self.settings.pair=='ondoperps_ondoperps':checks.append('API 已确认不同真实 accountID；同所资金费差为0，仅双账户对冲轮换')
        if self.settings.pair=='ondoperps_entropy':checks.append('Entropy io HIP-3 逐仓、实际资产索引及统一账户 USDC 抵押品')
        return dict(ok=True,submittedOrders=0,checks=checks,permissions=permissions)

def overview(engine):
    data=base_overview(engine)
    for slot,name in zip(SLOTS,PAIRS[engine.settings.pair]):
        row=data['venues'][slot]
        row.update(unit='USDT' if name in ('binance','okx') else 'USDC',mode={'binance':'USD-M · 单向 / 单资产','okx':'USDT SWAP · 净持仓 / 全仓','hyperliquid':'原生 USDC 永续 · 全仓','lighter':'Core USDC 永续','entropy':'Hyperliquid io · HIP-3 逐仓','ondoperps':'USDC 永续 · 专用账户','ondoperps_a':'USDC 永续 · 账户 A','ondoperps_b':'USDC 永续 · 账户 B'}[name],route='独立代理' if engine.settings.values.get(name.upper()+'_PROXY') else '共用代理' if engine.settings.values.get('GLOBAL_PROXY') else '直连')
        if name=='entropy' and row['connected']:
            account=(engine.snapshot.get('_accounts') or {}).get(slot) or {}
            account_mode=account.get('account_mode');source=account.get('balance_source')
            mode_label={'unifiedAccount':'统一账户','portfolioMargin':'组合保证金（仅 USDC 口径）','dexAbstraction':'DEX 抽象账户','default':'标准账户','disabled':'标准账户'}.get(account_mode,'账户模式待确认')
            source_label={'spot_usdc':'现货 USDC 抵押品','io_perps':'io 独立永续余额'}.get(source,'余额来源待确认')
            row.update(account_mode=account_mode,balance_source=source,balance_note=mode_label+' · '+source_label)
    if engine.settings.pair=='ondoperps_ondoperps':
        data.update(strategy='dual_account_rotation',funding_arbitrage=False,funding_note='同所同市场资金费差为0，仅双账户对冲轮换；手续费及滑点会产生真实成本')
    return data

def create_app(settings):
    from binance_lighter.store import Store
    title=' <> '.join(NAMES[v] for v in PAIRS[settings.pair])
    if settings.pair=='ondoperps_ondoperps':title='Ondoperps <> Ondoperps'
    left,right=(NAMES[v] for v in PAIRS[settings.pair])
    class PairStore(Store):
        def log(self,asset,message):super().log(asset,str(message).replace('Binance',left).replace('Lighter',right))
    return base_app(settings,engine_factory=Engine,store_factory=PairStore,web=Path(__file__).parent/'web'/settings.pair,title=title,overview_view=overview)
