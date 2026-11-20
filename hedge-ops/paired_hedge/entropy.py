"""Entropy's official Hyperliquid HIP-3 ``io`` markets, always isolated.

The normalized journal uses the stable ``io:COIN`` name. The signing asset ID
is resolved from official perpDexs + io metadata, never the native perp index.
Account reads do not depend on market metadata or a trading refresh.
"""
import asyncio
from contextlib import asynccontextmanager
from email.utils import parsedate_to_datetime
import json
import time
import httpx
from .exchanges import Hyperliquid, REST
from binance_lighter.venues import D, quantize, Rejected, Unknown

DEX='io'

def number(value,label):
    try:result=D(value)
    except Exception:raise Rejected('Entropy '+label+' 数据无效') from None
    if not result.is_finite():raise Rejected('Entropy '+label+' 数据无效')
    return result

class Entropy(Hyperliquid):
    READ_BUDGET=8.0
    CLOCK_MAX_AGE=60.0
    def __init__(self,settings):
        REST.__init__(self,settings,'entropy')
        self.last_nonce=0
        self.metadata_at=0
        self._server_anchor=None
        # The inherited client is reserved for signing-clock + exchange writes.
        # Public scans and private account/order reads own separate generations.
        self.public_client=self._reader_client()
        self.account_client=self._reader_client()
        self._leases={};self._retired=set();self._closed=False

    def _reader_client(self):
        return httpx.AsyncClient(proxy=self.settings.proxy('entropy'),trust_env=False,
            timeout=httpx.Timeout(self.READ_BUDGET,connect=4),
            limits=httpx.Limits(max_connections=8,max_keepalive_connections=4,keepalive_expiry=10))

    @asynccontextmanager
    async def _lease(self,key):
        client=getattr(self,key);self._leases[client]=self._leases.get(client,0)+1
        try:yield client
        finally:
            self._leases[client]-=1
            if not self._leases[client]:
                del self._leases[client]
                if client in self._retired:
                    self._retired.remove(client);await client.aclose()

    async def _reset_reader(self,key,failed):
        if not self._closed and getattr(self,key) is failed:setattr(self,key,self._reader_client())
        if self._leases.get(failed):self._retired.add(failed)
        else:await failed.aclose()

    async def close(self):
        self._closed=True
        await asyncio.gather(*(client.aclose() for client in {self.client,self.public_client,self.account_client,*self._retired}))

    def _observe_server_time(self,response):
        # HTTP Date is official server time at one-second resolution. Keep its
        # monotonic lower bound; local wall-clock corrections must not move a
        # book/fill window or an agent's authorization deadline.
        try:
            parsed=parsedate_to_datetime(response.headers.get('date',''))
            if parsed.tzinfo is None:return
            server=int(parsed.timestamp()*1000)
            if server<=0:return
        except (TypeError,ValueError,OverflowError):return
        now=time.monotonic()
        if self._server_anchor is not None:
            previous,observed=self._server_anchor
            if 0<=now-observed<=self.CLOCK_MAX_AGE:server=max(server,int(previous+(now-observed)*1000))
        self._server_anchor=(server,now)

    def server_time_ms(self,*,upper=False):
        if self._server_anchor is None:raise Rejected('Entropy 官方服务器时间未确认，读取状态保持未知')
        server,observed=self._server_anchor;elapsed=time.monotonic()-observed
        if not 0<=elapsed<=self.CLOCK_MAX_AGE:raise Rejected('Entropy 官方服务器时间已过期，读取状态保持未知')
        # Include the Date header's fractional-second uncertainty in fill end
        # bounds / expiry checks, so a current-second fill is not omitted.
        return int(server+elapsed*1000)+(999 if upper else 0)

    @staticmethod
    def server_timestamp(value,label):
        stamp=number(value,label)
        if stamp<=0 or stamp!=stamp.to_integral_value():raise Rejected('Entropy '+label+' 数据无效')
        return int(stamp)

    async def info(self,kind,**params):
        key='account_client' if 'user' in params else 'public_client'
        deadline=time.monotonic()+self.READ_BUDGET;failed=None
        try:
            async with asyncio.timeout(self.READ_BUDGET):
                for attempt in range(2):
                    try:
                        async with self._lease(key) as client:
                            failed=client
                            headers={'Content-Type':'application/json'}
                            if attempt:headers.update({'Connection':'close','Cache-Control':'no-cache'})
                            response=await client.post(self.BASE+'/info',headers=headers,
                                content=json.dumps(dict(type=kind,**params),separators=(',',':')),
                                timeout=max(.01,(deadline-time.monotonic())/(2-attempt)))
                        if not response.is_success:
                            if attempt==0 and response.status_code in (405,408,429,500,502,503,504):
                                await self._reset_reader(key,failed);continue
                            raise Rejected(f'Entropy io {kind} HTTP {response.status_code}，读取状态仍待核实')
                        self._observe_server_time(response)
                        return response.json()
                    except (httpx.HTTPError,ValueError):
                        if failed is not None:await self._reset_reader(key,failed)
                        if attempt==0:continue
                        raise Rejected('Entropy io '+kind+' 网络读取失败，账户与订单状态保持未知') from None
        except (TimeoutError,asyncio.CancelledError) as error:
            if failed is not None:await self._reset_reader(key,failed)
            if isinstance(error,asyncio.CancelledError):raise
            raise Rejected('Entropy io '+kind+' 读取超时，账户与订单状态保持未知') from None

    async def metadata(self):
        dexes,meta=await asyncio.gather(self.info('perpDexs'),self.info('meta',dex=DEX))
        if not isinstance(dexes,list) or not isinstance(meta,dict):raise Rejected('Entropy io 市场元数据无效')
        dex_index=next((i for i,d in enumerate(dexes) if isinstance(d,dict) and d.get('name')==DEX),None)
        if dex_index is None or dex_index<1:raise Rejected('Entropy io 子交易所资产索引尚未确认')
        if type(meta.get('collateralToken')) is not int or meta['collateralToken']!=0:raise Rejected('Entropy io 未返回预期的 USDC 抵押品')
        tables=dict(meta.get('marginTables') or [])
        found={}
        for index,row in enumerate(meta.get('universe') or []):
            coin=str(row.get('name') or '')
            if row.get('isDelisted') or not coin.startswith(DEX+':'):continue
            decimals=int(row['szDecimals']);maximum=int(row['maxLeverage'])
            if not 0<=decimals<=6 or maximum<1:continue
            asset=coin.split(':',1)[1]
            if asset in found:raise Rejected('Entropy io 市场基础单位映射重复')
            found[asset]=dict(id=coin,wire_id=100000+dex_index*10000+index,
                step=str(D(10)**-decimals),minimum=str(D(10)**-decimals),maximum='1e30',
                tick=str(D(10)**-(6-decimals)),notional='10',max_leverage=maximum,
                raw=row,tiers=tables.get(row.get('marginTableId'),{}).get('marginTiers',[]))
        self.markets=found;self.metadata_at=time.monotonic()
        return found

    async def funding(self):
        meta,contexts=await self.info('metaAndAssetCtxs',dex=DEX)
        if len(meta.get('universe') or [])!=len(contexts):raise Rejected('Entropy io 市场与资金费数据未对齐')
        found={}
        by_coin={m['id']:a for a,m in self.markets.items()}
        for row,context in zip(meta['universe'],contexts):
            coin=row.get('name')
            if coin not in by_coin or row.get('isDelisted'):continue
            rate=number(context.get('funding'),'小时资金费')
            mark=number(context.get('markPx'),'标记价格')
            if mark<=0:continue
            found[by_coin[coin]]=dict(rate=rate*10000,interval=1,mark=str(mark))
        return found

    async def account(self):
        try:
            async with asyncio.timeout(self.READ_BUDGET):return await self._account()
        except TimeoutError:raise Rejected('Entropy io 账户读取超时，不能按空仓或零余额处理') from None

    @staticmethod
    def _funding_role(value):
        # Public info requests on an agent/missing address legally return empty
        # balances. An empty response is not proof of a funded account identity.
        if (not isinstance(value,dict) or value.get('role') not in ('user','subAccount','vault')
                or (value.get('data') is not None and not isinstance(value['data'],dict))):
            raise Rejected('Entropy 资金账户身份未通过：HYPERLIQUID_ACCOUNT_ADDRESS 必须填写真实资金主账户或子账户公开地址，'
                '不能填写 agent 或不存在的地址；HYPERLIQUID_PRIVATE_KEY 应填写已授权的 API agent 私钥。')
        if value['role']=='subAccount':
            master=(value.get('data') or {}).get('master')
            if (not isinstance(master,str) or len(master)!=42 or not master.startswith('0x')
                    or any(c not in '0123456789abcdefABCDEF' for c in master[2:])):
                raise Rejected('Entropy 资金子账户所属主账户未确认；请核对 HYPERLIQUID_ACCOUNT_ADDRESS 资金地址，'
                    'HYPERLIQUID_PRIVATE_KEY 应填写已授权的 API agent 私钥。')
        return value

    async def _account(self):
        if not self.user:raise Rejected('请填写 Entropy 资金账户公开地址，不能填写 agent 地址')
        state,mode,role=await asyncio.gather(self.info('clearinghouseState',user=self.user,dex=DEX),
            self.info('userAbstraction',user=self.user),self.info('userRole',user=self.user))
        self._funding_role(role)
        if not isinstance(state,dict) or not isinstance(state.get('assetPositions'),list):raise Rejected('Entropy io 账户读取未返回完整仓位')
        if mode not in {'disabled','default','dexAbstraction','unifiedAccount','portfolioMargin'}:raise Rejected('Entropy 账户模式尚未核实')
        positions={};margin=D(0);pnl=D(0)
        for item in state['assetPositions']:
            p=item.get('position') or {};quantity=number(p.get('szi'),'仓位数量')
            margin+=max(D(0),number(p.get('marginUsed',0),'逐仓保证金'))
            if not quantity:continue
            coin=str(p.get('coin') or '')
            if not coin.startswith(DEX+':'):raise Rejected('Entropy io 返回了其他交易所仓位，禁止按空仓处理')
            if coin in positions:raise Rejected('Entropy io 返回重复市场仓位，持仓仍待核实')
            leverage=p.get('leverage') or {}
            if leverage.get('type')!='isolated':raise Rejected('Entropy io 仓位必须使用逐仓模式')
            if number(leverage.get('value'),'实际杠杆')<=0:raise Rejected('Entropy io 实际杠杆无效')
            value=number(p.get('positionValue'),'仓位价值');unrealized=number(p.get('unrealizedPnl'),'浮动盈亏')
            pnl+=unrealized
            positions[coin]=dict(quantity=str(quantity),mark=str(abs(value/quantity)),
                entry=str(number(p.get('entryPx'),'持仓均价')),liquidation=str(number(p.get('liquidationPx') or 0,'强平价格')),
                pnl=str(unrealized),leverage=str(number(leverage.get('value'),'实际杠杆')),asset=coin.split(':',1)[1])
        summary=state.get('marginSummary') or {}
        if mode in {'unifiedAccount','portfolioMargin'}:
            spot=await self.info('spotClearinghouseState',user=self.user)
            if not isinstance(spot,dict) or not isinstance(spot.get('balances'),list):raise Rejected('Entropy 统一账户现货抵押品未确认')
            if any(not isinstance(row,dict) for row in spot['balances']):raise Rejected('Entropy 统一账户 USDC 抵押品结构无效，不能按零余额处理')
            candidates=[row for row in spot['balances'] if str(row.get('coin','')).upper()=='USDC']
            if not candidates:raise Rejected('Entropy 统一账户未返回 USDC 抵押品，不能按零余额处理')
            if len(candidates)!=1:raise Rejected('Entropy 统一账户返回重复 USDC 抵押品，余额仍待核实')
            usdc=candidates[0]
            # Official canonical USDC is token 0. Keep coin-only legacy reads
            # compatible, but never accept an explicitly conflicting token ID.
            if 'token' in usdc and (type(usdc['token']) is not int or usdc['token']!=0):raise Rejected('Entropy 统一账户 USDC 抵押品 token 身份不符，余额仍待核实')
            equity=number(usdc.get('total'),'USDC 总余额')
            # hold already includes collateral reservations. Do not subtract
            # it a second time from the per-position/summary margin.
            reserved=max(D(0),number(usdc.get('hold'),'USDC 冻结余额'),number(summary.get('totalMarginUsed'),'总保证金'),margin)
            available=max(D(0),equity-reserved)
        else:
            equity=number(summary.get('accountValue'),'账户权益')
            available=max(D(0),number(state.get('withdrawable'),'可用保证金'))
        return dict(equity=str(equity),available=str(available),pnl=str(pnl),positions=positions,
            account_id=self.user.lower(),mode=mode,account_mode=mode,
            balance_source='spot_usdc' if mode in {'unifiedAccount','portfolioMargin'} else 'io_perps')

    async def book(self,m):
        coin=m['id']
        if not isinstance(coin,str) or not coin.startswith(DEX+':'):raise Rejected('Entropy 盘口必须使用 io 完整市场名称')
        result=await self.info('l2Book',coin=coin)
        if abs(self.server_time_ms()-self.server_timestamp(result.get('time'),'盘口服务器时间'))>15000:raise Rejected('Entropy io 盘口已过期')
        return {side:[(number(r['px'],'盘口价格'),number(r['sz'],'盘口数量')) for r in rows] for side,rows in zip(('bids','asks'),result['levels'])}

    async def preflight(self):
        try:
            async with asyncio.timeout(self.READ_BUDGET):return await self._preflight()
        except TimeoutError:raise Rejected('Entropy 资金账户身份或 agent 授权读取超时，权限保持未知，未发送交易') from None

    async def _preflight(self):
        from eth_account import Account
        signer=Account.from_key(self.settings.values['HYPERLIQUID_PRIVATE_KEY']).address
        vault=self.settings.values.get('HYPERLIQUID_VAULT_ADDRESS')
        if vault and vault.lower()!=self.user.lower():raise Rejected('Entropy 子账户 / vault 地址须与资金账户读取地址一致')
        role=self._funding_role(await self.info('userRole',user=self.user))
        master=self.user
        if vault:
            master=(role.get('data') or {}).get('master')
            if (not isinstance(master,str) or len(master)!=42 or not master.startswith('0x')
                    or any(c not in '0123456789abcdefABCDEF' for c in master[2:])):
                raise Rejected('Entropy 子账户所属主账户尚未确认')
        if signer.lower()==master.lower():raise Rejected(
            '当前 HYPERLIQUID_PRIVATE_KEY 对应资金主账户，不能使用主钱包私钥。'
            '请在 https://app.hyperliquid.xyz/API 创建并授权专用 API agent，'
            '将 agent 私钥填入 HYPERLIQUID_PRIVATE_KEY；'
            'HYPERLIQUID_ACCOUNT_ADDRESS 仍填写资金账户公开地址。')
        agents=await self.info('extraAgents',user=master)
        now=self.server_time_ms(upper=True)
        if not any(str(a.get('address','')).lower()==signer.lower() and self.server_timestamp(a.get('validUntil',0),'agent 到期服务器时间')>now+60000 for a in agents):raise Rejected('Entropy agent 未授权给资金账户、已到期或即将到期')

    async def open_orders(self,m):
        return [row for row in await self.info('openOrders',user=self.user,dex=DEX) if row.get('coin')==m['id']]

    async def signing_market(self,m):
        if not self.markets or time.monotonic()-self.metadata_at>60:await self.metadata()
        current=next((r for r in self.markets.values() if r['id']==m['id']),None)
        if not current or not isinstance(current.get('wire_id'),int):raise Rejected('Entropy io 交易资产索引未确认，未发送订单')
        return current

    async def set_leverage(self,m,lev,notional):
        current=await self.signing_market(m)
        tiers=[r for r in current.get('tiers',[]) if number(r['lowerBound'],'杠杆档位')<=notional]
        maximum=int(tiers[-1]['maxLeverage']) if tiers else current['max_leverage']
        if not 1<=lev<=maximum:raise Rejected('Entropy io 当前名义额档位不支持所选杠杆')
        corridor=(D(1)/lev-D(1)/(2*maximum))*100
        if corridor<=D(self.settings.values['CLOSE_CORRIDOR_PCT']):raise Rejected('Entropy 逐仓杠杆的强平距离不足风控门槛')
        await self.action(dict(type='updateLeverage',asset=current['wire_id'],isCross=False,leverage=lev))
        result=await self.info('activeAssetData',user=self.user,coin=current['id'])
        leverage=result.get('leverage') or {}
        if leverage.get('type')!='isolated' or number(leverage.get('value'),'实际杠杆')!=lev:raise Rejected('Entropy io 逐仓杠杆尚未读回确认，未开仓')

    async def submit(self,order,m,price):
        current=await self.signing_market(m)
        quantity=number(order['quantity'],'订单数量')
        if quantity<=0 or quantize(quantity,current['step'])!=quantity:raise Rejected('Entropy io 订单数量精度无效')
        price=number(price,'订单价格')
        if price<=0 or self.round_price(current,price)!=price:raise Rejected('Entropy io 订单价格精度无效')
        return await super().submit(order,{**current,'id':current['wire_id']},price)

    async def raw_order(self,order,m):
        result=await super().raw_order(order,m)
        if result is None:return None
        raw=result.get('order') or {}
        if raw.get('coin')!=m['id'] or number(raw.get('origSz'),'订单原始数量')!=number(order['quantity'],'订单数量'):
            raise Unknown('Entropy io 订单市场或数量身份待核实')
        if raw.get('side') not in ('B' if order['side']=='BUY' else 'A',):raise Unknown('Entropy io 订单方向身份待核实')
        if 'reduceOnly' in raw and raw['reduceOnly'] is not order['reduce_only']:raise Unknown('Entropy io 订单只减仓身份待核实')
        return result

    async def lookup(self,order,m):
        result=await self.raw_order(order,m)
        if result is None:return None
        status=str(result.get('status','')).lower()
        if status!='filled' and not status.endswith(('canceled','rejected')):return None
        raw=result['order'];expected=number(raw['origSz'],'订单原始数量')-number(raw['sz'],'剩余订单数量')
        if not 0<=expected<=D(order['quantity']):raise Unknown('Entropy io 订单实际成交数量无效')
        if status=='filled' and expected!=D(order['quantity']):raise Unknown('Entropy io 完全成交终态与实际成交数量不符')
        fills=await self.fills(order,raw['oid'],server_timestamp=raw.get('timestamp'))
        if fills is None or any(r.get('coin')!=m['id'] for r in fills):return None
        quantity=sum((number(r['sz'],'成交数量') for r in fills),D(0))
        if quantity!=expected:return None
        fee=str(sum((number(r['fee'],'实际手续费') for r in fills),D(0))) if all(r.get('feeToken')=='USDC' for r in fills) else None
        return dict(filled=str(quantity),quote=str(sum((number(r['sz'],'成交数量')*number(r['px'],'成交价格') for r in fills),D(0))),exchange_id=str(raw['oid']),fee=fee)

    async def fills(self,order,oid,*,server_timestamp=None):
        # A signed order can succeed while the host clock is hours wrong. Use
        # the exchange's order timestamp, never the journal's local ``at``.
        try:
            start=max(0,self.server_timestamp(server_timestamp,'订单服务器时间')-1)
            end=self.server_time_ms(upper=True)
        except Rejected:return None
        if start>end:return None
        found={}
        try:
            async with asyncio.timeout(self.READ_BUDGET):
                for _ in range(10):
                    rows=await self.info('userFillsByTime',user=self.user,startTime=start,endTime=end,aggregateByTime=False)
                    if not isinstance(rows,list):return None
                    for row in rows:
                        if str(row.get('oid'))==str(oid):found[(row['tid'],row['hash'])]=row
                    if len(rows)<2000:return list(found.values())
                    last=max(self.server_timestamp(row.get('time'),'成交服务器时间') for row in rows)
                    if last<=start:return None
                    start=last # overlap the inclusive boundary and deduplicate
        except (TimeoutError,KeyError,TypeError,Rejected):return None
        return None

    async def cancel(self,order,m):
        result=await self.raw_order(order,m)
        if result and result.get('status')=='open':
            current=await self.signing_market(m)
            await self.action(dict(type='cancelByCloid',cancels=[dict(asset=current['wire_id'],cloid=self.cid(order))]))
