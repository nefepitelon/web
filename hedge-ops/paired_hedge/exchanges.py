"""Official mainnet adapters. All quantities exposed here are base asset units.

Writes are never retried. An ambiguous receipt remains UNKNOWN until a terminal
order and its exact executed quantity can be recovered by the persisted ID.
"""
import asyncio
import base64
from datetime import datetime, timezone
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode
import httpx
from binance_lighter.venues import Venues, D, quantize, Rejected, Unknown

def decimal_text(value):
    return format(D(value),'f').rstrip('0').rstrip('.') if '.' in format(D(value),'f') else format(D(value),'f')

class Existing:
    """Use the already tested Binance clock/auth and official Lighter signer."""
    def __init__(self, settings, name):
        self.name,self.settings,self.native=name,settings,Venues(settings)
        self.markets={}
    async def close(self): await self.native.close()
    async def metadata(self):
        n=self.native
        if self.name=='binance':
            body=await n.request('binance','/fapi/v1/exchangeInfo')
            self.markets={}
            for r in body['symbols']:
                if r.get('status')!='TRADING' or r.get('contractType')!='PERPETUAL' or r.get('quoteAsset')!='USDT': continue
                f={x['filterType']:x for x in r['filters']}
                if not all(k in f for k in ('LOT_SIZE','PRICE_FILTER','MIN_NOTIONAL')): continue
                self.markets[r['baseAsset']]=dict(id=r['symbol'],step=f['LOT_SIZE']['stepSize'],minimum=f['LOT_SIZE']['minQty'],maximum=f['LOT_SIZE']['maxQty'],tick=f['PRICE_FILTER']['tickSize'],notional=f['MIN_NOTIONAL']['notional'])
        else:
            rows=await n.request('lighter','/api/v1/orderBookDetails',{'filter':'perp'})
            self.markets={}
            for r in rows['order_book_details']:
                if r.get('market_type')!='perp' or r.get('status')!='active': continue
                fraction=D(r['min_initial_margin_fraction'])
                self.markets[r['symbol']]=dict(id=int(r['market_id']),step=str(D(10)**-int(r['supported_size_decimals'])),minimum=r['min_base_amount'],maximum='1e30',tick=str(D(10)**-int(r['supported_price_decimals'])),notional=r['min_quote_amount'],max_leverage=int(10000/fraction),raw=r)
        return self.markets
    async def funding(self):
        n=self.native
        if self.name=='binance':
            prices,intervals,brackets=await asyncio.gather(n.request('binance','/fapi/v1/premiumIndex'),n.request('binance','/fapi/v1/fundingInfo'),n.request('binance','/fapi/v1/leverageBracket',signed=True),return_exceptions=True)
            if isinstance(prices,Exception): raise prices
            if isinstance(intervals,Exception): raise intervals
            hours={r['symbol']:int(r['fundingIntervalHours']) for r in intervals}
            tiers={} if isinstance(brackets,Exception) else {r['symbol']:r['brackets'] for r in brackets}
            for m in self.markets.values():
                m['tiers']=tiers.get(m['id'],[])
                m['max_leverage']=max((int(r['initialLeverage']) for r in m['tiers']),default=None)
            byid={r['symbol']:r for r in prices}
            return {a:dict(rate=D(byid[m['id']]['lastFundingRate'])*10000/hours.get(m['id'],8),mark=byid[m['id']]['markPrice'],interval=hours.get(m['id'],8)) for a,m in self.markets.items() if m['id'] in byid}
        rates=await n.request('lighter','/api/v1/funding-rates')
        byid={int(r['market_id']):r for r in rates['funding_rates'] if r['exchange']=='lighter'}
        return {a:dict(rate=D(byid[m['id']]['rate'])*10000/8,mark=None,interval=8) for a,m in self.markets.items() if m['id'] in byid}
    async def account(self):
        if self.name=='binance':
            b,positions=await self.native.binance_account()
            if b.get('oneWay') is not True or b.get('singleAsset') is not True or b.get('canTrade') is not True: raise Rejected('Binance accountConfig 要求 canTrade=true、单向持仓和单资产模式')
            asset=b['usdtAsset']
            rows={s:dict(quantity=p['positionAmt'],mark=p['markPrice'],entry=p['entryPrice'],liquidation=p['liquidationPrice'],pnl=p['unRealizedProfit'],leverage=p.get('leverage',1),asset=s) for s,p in positions.items()}
            return dict(equity=asset['marginBalance'],available=b['availableBalance'],pnl=asset['unrealizedProfit'],positions=rows)
        b,positions=await self.native.lighter_account()
        return dict(equity=b['total_asset_value'],available=b['available_balance'],pnl=str(sum(D(p.get('unrealized_pnl',0)) for p in positions.values())),positions={i:dict(quantity=str(D(p['position'])*(-1 if int(p.get('sign',1))<0 else 1)),mark=str(abs(D(p.get('position_value',0))/D(p['position']))) if D(p['position']) else '0',entry=p.get('avg_entry_price','0'),liquidation=p.get('liquidation_price') or '0',pnl=p.get('unrealized_pnl','0'),leverage=str(100/D(p['initial_margin_fraction'])) if D(p.get('initial_margin_fraction',0)) else None,asset=p['symbol']) for i,p in positions.items()})
    async def preflight(self):
        if self.name=='binance': return
        v=self.settings.values
        i=int(v['LIGHTER_API_KEY_INDEX'])
        if not 4<=i<=254 or i==157: raise Rejected('Lighter Key 编号须为 4–254 且不能为保留编号 157')
        signer=self.native.get_signer()
        error=await asyncio.wait_for(asyncio.to_thread(signer.check_client),20)
        if error: raise Rejected('Lighter Core API 私钥与账户 / Key 不匹配')
        import lighter
        await lighter.TransactionApi(signer.api_client).next_nonce(account_index=int(v['LIGHTER_ACCOUNT_INDEX']),api_key_index=i,_request_timeout=15)
    def native_market(self,m):
        if self.name=='binance': return dict(symbol=m['id'],tick=m['tick'])
        r=m['raw']
        return dict(market_id=m['id'],size_decimals=int(r['supported_size_decimals']),price_decimals=int(r['supported_price_decimals']))
    async def book(self,m):
        if self.name=='binance':
            b=await self.native.request('binance','/fapi/v1/depth',{'symbol':m['id'],'limit':20})
            return {s:[(D(p),D(q)) for p,q in b[s]] for s in ('bids','asks')}
        b=await self.native.request('lighter','/api/v1/orderBookOrders',{'market_id':m['id'],'limit':50})
        return {s:[(D(r['price']),D(r['remaining_base_amount'])) for r in b[s]] for s in ('bids','asks')}
    async def open_orders(self,m):
        if self.name=='binance': return await self.native.request('binance','/fapi/v1/openOrders',{'symbol':m['id']},signed=True)
        import lighter
        r=await lighter.OrderApi(self.native.get_signer().api_client).account_active_orders(self.native.token(),int(self.settings.values['LIGHTER_ACCOUNT_INDEX']),market_id=m['id'],_request_timeout=15)
        return r.orders
    async def set_leverage(self,m,lev,notional):
        if self.name=='binance':
            rows=await self.native.request('binance','/fapi/v1/leverageBracket',{'symbol':m['id']},signed=True)
            tiers=rows[0]['brackets'] if rows else []
            tier=next((r for r in tiers if D(r['notionalFloor'])<=notional<D(r['notionalCap'])),None)
            if not tier or lev>int(tier['initialLeverage']): raise Rejected('Binance 当前名义额档位不支持所选杠杆')
            config=await self.native.request('binance','/fapi/v1/symbolConfig',{'symbol':m['id']},signed=True)
            if not config or int(config[0]['leverage'])!=lev:
                await self.native.request('binance','/fapi/v1/leverage',{'symbol':m['id'],'leverage':lev},signed=True,method='POST')
            config=await self.native.request('binance','/fapi/v1/symbolConfig',{'symbol':m['id']},signed=True)
            if not config or int(config[0]['leverage'])!=lev: raise Rejected('Binance 杠杆未读回确认')
        else:
            signer=self.native.get_signer()
            _,positions=await self.native.lighter_account()
            p=positions.get(m['id'],{})
            if p.get('initial_margin_fraction') is not None and D(p['initial_margin_fraction'])*100==int(10000/lev): return
            _,response,error=await signer.update_leverage(market_index=m['id'],margin_mode=int(p.get('margin_mode',signer.CROSS_MARGIN_MODE)),leverage=lev,api_key_index=int(self.settings.values['LIGHTER_API_KEY_INDEX']))
            if error or response is None or response.code!=200: raise Rejected('Lighter 杠杆设置未确认，未开仓')
            for _ in range(8):
                _,positions=await self.native.lighter_account()
                p=positions.get(m['id'],{})
                if p.get('initial_margin_fraction') is not None and D(p['initial_margin_fraction'])*100==int(10000/lev): return
                await asyncio.sleep(.5)
            raise Rejected('Lighter 杠杆尚未读回确认，未开仓')
    async def submit(self,o,m,p): return await self.native.submit({**o,'venue':self.name},self.native_market(m),p)
    async def lookup(self,o,m): return await self.native.lookup({**o,'venue':self.name},self.native_market(m))
    async def cancel(self,o,m): return await self.native.cancel_owned({**o,'venue':self.name},self.native_market(m))
    async def fees(self,o,m): return await self.native.fees({**o,'venue':self.name},self.native_market(m))
    async def status(self,o,m): return await self.native.maker_status(o,self.native_market(m))

class REST:
    def __init__(self,settings,name):
        self.settings,self.name=settings,name
        self.client=httpx.AsyncClient(proxy=settings.proxy(name),trust_env=False,timeout=httpx.Timeout(20,connect=10))
        self.markets={}
    async def close(self): await self.client.aclose()
    async def json(self,method,url,*,headers=None,payload=None,read=False):
        # Info POSTs are read-only; exchange POSTs must not be retried.
        for attempt in range(2 if read else 1):
            try:
                r=await self.client.request(method,url,headers=headers,content=payload)
                if read and r.status_code in (405,502,503,504) and not attempt:
                    await asyncio.sleep(.4);continue
                if r.status_code>=500 or r.status_code==408:
                    raise (Rejected if read else Unknown)(f'{self.name} HTTP {r.status_code}，'+('读取待恢复' if read else '请求结果未知，禁止重复报单'))
                if not r.is_success:
                    # OKX timestamp errors may use HTTP 401. Preserve only the
                    # parsed error code for clock recovery, never its raw body.
                    if self.name=='okx' and read:
                        try:
                            data=r.json()
                            if str(data.get('code'))=='50102':return data
                        except (ValueError,AttributeError):pass
                    raise Rejected(f'{self.name} HTTP {r.status_code}，请检查 API 权限、IP 白名单及服务状态')
                return r.json()
            except (httpx.HTTPError,ValueError):
                if read and not attempt: continue
                raise (Rejected if read else Unknown)(f'{self.name} '+('读取失败' if read else '请求结果未知，禁止重复报单')) from None

class OKX(REST):
    URLS={'global':'https://www.okx.com','us':'https://us.okx.com','eea':'https://eea.okx.com'}
    def __init__(self,settings):
        super().__init__(settings,'okx')
        region=settings.values.get('OKX_REGION','global')
        if region not in self.URLS: raise Rejected('OKX_REGION 仅支持 global / us / eea，请匹配注册地区官方域名')
        self.base=self.URLS[region];self.anchor=None;self.clock_lock=asyncio.Lock()
    async def clock(self,force=False):
        async with self.clock_lock:
            if not force and self.anchor and time.monotonic()-self.anchor[1]<60:return
            start=time.monotonic()
            data=await self.request('/api/v5/public/time')
            end=time.monotonic()
            self.anchor=(int(data[0]['ts'])+(end-start)*500,end)
    async def request(self,path,params=None,*,signed=False,write=False,_retry=True):
        body=json.dumps(params,separators=(',',':')) if write else ''
        target=path+('?' + urlencode(params) if params and not write else '')
        headers={'Content-Type':'application/json'}
        if signed:
            await self.clock()
            stamp=datetime.fromtimestamp((self.anchor[0]+(time.monotonic()-self.anchor[1])*1000)/1000,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
            v=self.settings.values
            signature=base64.b64encode(hmac.new(v['OKX_API_SECRET'].encode(),(stamp+('POST' if write else 'GET')+target+body).encode(),hashlib.sha256).digest()).decode()
            headers.update({'OK-ACCESS-KEY':v['OKX_API_KEY'],'OK-ACCESS-SIGN':signature,'OK-ACCESS-TIMESTAMP':stamp,'OK-ACCESS-PASSPHRASE':v['OKX_API_PASSPHRASE']})
        response=await self.json('POST' if write else 'GET',self.base+target,headers=headers,payload=body or None,read=not write)
        code=str(response.get('code'))
        if code!='0':
            if signed and code=='50102' and not write and _retry:
                await self.clock(True);return await self.request(path,params,signed=True,_retry=False)
            if write and code in ('50004','50013','50026'): raise Unknown(f'OKX {code}，报单结果待核实')
            raise Rejected(f'OKX {code} · {path}：请求被拒绝，请核对交易权限、IP 白名单、账户模式和参数')
        return response['data']
    async def metadata(self):
        rows=await self.request('/api/v5/public/instruments',{'instType':'SWAP'})
        self.markets={}
        for r in rows:
            asset=r.get('ctValCcy')
            if r.get('state')!='live' or r.get('ctType')!='linear' or r.get('settleCcy')!='USDT' or r.get('instId')!=f'{asset}-USDT-SWAP':continue
            multiplier=D(r.get('ctMult') or '1');contract=D(r['ctVal'])*multiplier
            if contract<=0:continue
            self.markets[asset]=dict(id=r['instId'],step=str(D(r['lotSz'])*contract),minimum=str(D(r['minSz'])*contract),maximum=str(D(r.get('maxLmtSz') or '1e20')*contract),tick=r['tickSz'],notional='0',contract=str(contract),max_leverage=int(D(r['lever'])),raw=r)
        return self.markets
    async def funding(self):
        # Funding interval is derived from the actual adjacent settlement times.
        sem=asyncio.Semaphore(4)
        async def read(a,m):
            async with sem:
                r=(await self.request('/api/v5/public/funding-rate',{'instId':m['id']}))[0]
                hours=(D(r['nextFundingTime'])-D(r['fundingTime']))/3600000
                if not 0<hours<=24:raise Rejected('OKX 资金费周期无效')
                return a,dict(rate=D(r['fundingRate'])*10000/hours,interval=float(hours),mark=None)
        jobs=[asyncio.create_task(read(a,m)) for a,m in self.markets.items()]
        try:
            if jobs:
                _,pending=await asyncio.wait(jobs,timeout=35)
                for job in pending:job.cancel()
            results=await asyncio.gather(*jobs,return_exceptions=True)
        finally:
            for job in jobs:
                if not job.done():job.cancel()
            await asyncio.gather(*jobs,return_exceptions=True)
        # A slow instrument must not hold the whole console indefinitely.
        # Missing rates are omitted, so that instrument cannot open a task.
        valid=dict(r for r in results if not isinstance(r,BaseException))
        if not valid and self.markets:raise Rejected('OKX 共同市场资金费读取未取得有效结果')
        return valid
    async def account(self):
        config,balance,positions=await asyncio.gather(self.request('/api/v5/account/config',signed=True),self.request('/api/v5/account/balance',{'ccy':'USDT'},signed=True),self.request('/api/v5/account/positions',{'instType':'SWAP'},signed=True))
        c=config[0]
        if c.get('posMode')!='net_mode' or str(c.get('acctLv'))!='2':raise Rejected('OKX 需单币种保证金账户（acctLv=2）及买卖净持仓模式；请在交易所设置，本平台不自动切换模式')
        if 'trade' not in str(c.get('perm','')).split(','):raise Rejected('OKX API Key 未返回 trade 权限，请核对当前 Key 的交易权限')
        asset=next((a for a in balance[0]['details'] if a['ccy']=='USDT'),None)
        if not asset or asset.get('availEq') in ('',None):raise Rejected('OKX 未返回可用 USDT 保证金')
        byid={m['id']:(a,m) for a,m in self.markets.items()}
        normalized={}
        for p in positions:
            if not D(p['pos']):continue
            if p['instId'] not in byid:raise Rejected('OKX 存在非共同市场仓位，请使用专用子账户')
            a,m=byid[p['instId']]
            if p.get('posSide')!='net' or p.get('mgnMode')!='cross':raise Rejected('OKX 仓位须为净持仓全仓模式')
            normalized[m['id']]=dict(quantity=str(D(p['pos'])*D(m['contract'])),mark=p['markPx'],entry=p['avgPx'],liquidation=p.get('liqPx') or '0',pnl=p['upl'],leverage=p['lever'],asset=a)
        return dict(equity=asset['eq'],available=asset['availEq'],pnl=asset.get('upl') or '0',positions=normalized)
    async def preflight(self): await self.account()
    async def book(self,m):
        r=(await self.request('/api/v5/market/books',{'instId':m['id'],'sz':20}))[0]
        return {s:[(D(p[0]),D(p[1])*D(m['contract'])) for p in r[s]] for s in ('bids','asks')}
    async def open_orders(self,m):return await self.request('/api/v5/trade/orders-pending',{'instType':'SWAP','instId':m['id']},signed=True)
    async def set_leverage(self,m,lev,notional):
        tiers=await self.request('/api/v5/public/position-tiers',{'instType':'SWAP','tdMode':'cross','instFamily':m['id'].removesuffix('-SWAP')})
        # Tier bounds are contracts for linear swaps. Convert target notional
        # using a fresh book; account-specific max-size is checked as well.
        book=await self.book(m);contracts=notional/book['asks'][0][0]/D(m['contract'])
        tier=next((r for r in tiers if D(r['minSz'])<=contracts<=D(r['maxSz'])),None)
        if not tier or lev>D(tier['maxLever']):raise Rejected('OKX 当前名义额档位不支持所选杠杆')
        await self.request('/api/v5/account/set-leverage',{'instId':m['id'],'lever':str(lev),'mgnMode':'cross'},signed=True,write=True)
        r=await self.request('/api/v5/account/leverage-info',{'instId':m['id'],'mgnMode':'cross'},signed=True)
        if not r or any(D(x['lever'])!=lev for x in r):raise Rejected('OKX 杠杆尚未读回确认，未开仓')
    @staticmethod
    def cid(o):return 'wh'+hashlib.sha256(o['client_id'].encode()).hexdigest()[:28]
    async def submit(self,o,m,p):
        contracts=D(o['quantity'])/D(m['contract'])
        if contracts*D(m['contract'])!=D(o['quantity']) or quantize(D(o['quantity']),m['step'])!=D(o['quantity']):raise Rejected('OKX 张数精度无效')
        result=await self.request('/api/v5/trade/order',dict(instId=m['id'],tdMode='cross',posSide='net',side=o['side'].lower(),ordType='post_only' if o.get('execution')=='maker' else 'ioc',sz=decimal_text(contracts),px=decimal_text(p),reduceOnly=o['reduce_only'],clOrdId=self.cid(o)),signed=True,write=True)
        if not result:raise Unknown('OKX 未返回订单回执')
        r=result[0]
        if str(r.get('sCode'))!='0':
            if str(r.get('sCode')) in ('50004','50013'):raise Unknown('OKX 报单结果未知')
            raise Rejected('OKX 订单被拒绝，代码 '+str(r.get('sCode')))
        return {'orderId':r['ordId']}
    async def raw_order(self,o,m):
        r=await self.request('/api/v5/trade/order',{'instId':m['id'],'clOrdId':self.cid(o)},signed=True)
        if not r:return None
        row=r[0]
        if row.get('clOrdId')!=self.cid(o) or row.get('instId')!=m['id']:raise Unknown('OKX 订单身份不符')
        return row
    async def lookup(self,o,m):
        r=await self.raw_order(o,m)
        if not r or r['state'] not in ('filled','canceled','mmp_canceled'):return None
        filled=D(r['accFillSz'])*D(m['contract'])
        if filled and not r.get('avgPx'):return None
        return dict(filled=str(filled),quote=str(filled*D(r.get('avgPx') or 0)),exchange_id=r['ordId'],fee=str(-D(r['fee'])) if r.get('feeCcy')=='USDT' and r.get('fee') not in ('',None) else None)
    async def status(self,o,m):
        r=await self.raw_order(o,m)
        return dict(status={'filled':'FILLED','canceled':'CANCELED','mmp_canceled':'CANCELED'}.get((r or {}).get('state'),'NEW'),executedQty=str(D((r or {}).get('accFillSz') or 0)*D(m['contract'])))
    async def cancel(self,o,m):
        rows=await self.open_orders(m)
        if not any(r['clOrdId']==self.cid(o) for r in rows):return
        result=await self.request('/api/v5/trade/cancel-order',{'instId':m['id'],'clOrdId':self.cid(o)},signed=True,write=True)
        if not result or str(result[0].get('sCode'))!='0':raise Unknown('OKX 撤单未确认，继续核对终态')
    async def fees(self,o,m):
        r=await self.lookup(o,m)
        return r.get('fee') if r and D(r['filled'])==D(o['filled']) else None

class Hyperliquid(REST):
    BASE='https://api.hyperliquid.xyz'
    def __init__(self,settings):
        super().__init__(settings,'hyperliquid');self.last_nonce=0
    @property
    def user(self):return self.settings.values['HYPERLIQUID_ACCOUNT_ADDRESS']
    async def info(self,kind,**params):
        return await self.json('POST',self.BASE+'/info',headers={'Content-Type':'application/json'},payload=json.dumps(dict(type=kind,**params),separators=(',',':')),read=True)
    async def metadata(self):
        meta=await self.info('meta',dex='')
        tables=dict(meta.get('marginTables',[]))
        self.markets={r['name']:dict(id=i,step=str(D(10)**-r['szDecimals']),minimum=str(D(10)**-r['szDecimals']),maximum='1e30',tick=str(D(10)**-(6-r['szDecimals'])),notional='10',max_leverage=int(r['maxLeverage']),raw=r,tiers=tables.get(r.get('marginTableId'),{}).get('marginTiers',[])) for i,r in enumerate(meta['universe']) if not r.get('isDelisted') and not r.get('onlyIsolated') and r.get('marginMode') not in ('strictIsolated','noCross')}
        return self.markets
    async def funding(self):
        meta,ctx=await self.info('metaAndAssetCtxs',dex='')
        return {r['name']:dict(rate=D(c['funding'])*10000,interval=1,mark=c['markPx']) for r,c in zip(meta['universe'],ctx) if r['name'] in self.markets}
    async def account(self):
        if not self.user:raise Rejected('请填写 Hyperliquid 资金账户公开地址，不能填写 agent 地址')
        b=await self.info('clearinghouseState',user=self.user,dex='')
        positions={}
        for x in b['assetPositions']:
            p=x['position'];a=p['coin'];q=D(p['szi'])
            if not q:continue
            if a not in self.markets:raise Rejected('Hyperliquid 存在非支持市场仓位，请使用专用账户')
            if p['leverage']['type']!='cross':raise Rejected('Hyperliquid 仓位需使用全仓模式')
            positions[self.markets[a]['id']]=dict(quantity=str(q),mark=str(abs(D(p['positionValue'])/q)),entry=p['entryPx'],liquidation=p.get('liquidationPx') or '0',pnl=p['unrealizedPnl'],leverage=p['leverage']['value'],asset=a)
        return dict(equity=b['marginSummary']['accountValue'],available=b['withdrawable'],pnl=str(sum(D(p['pnl']) for p in positions.values())),positions=positions)
    async def preflight(self):
        from eth_account import Account
        signer=Account.from_key(self.settings.values['HYPERLIQUID_PRIVATE_KEY']).address
        vault=self.settings.values.get('HYPERLIQUID_VAULT_ADDRESS')
        if vault and vault.lower()!=self.user.lower():raise Rejected('Hyperliquid 子账户 / vault 地址须与资金账户读取地址一致')
        master=self.user
        if vault:
            role=await self.info('userRole',user=vault)
            master=(role.get('data') or {}).get('master')
            if not master:raise Rejected('Hyperliquid 子账户所属主账户尚未确认')
        if signer.lower()==master.lower():raise Rejected('请使用已授权的 Hyperliquid 专用 API agent 私钥，不能使用主钱包私钥')
        agents=await self.info('extraAgents',user=master)
        if not any(str(a.get('address','')).lower()==signer.lower() and int(a.get('validUntil',0))>int(time.time()*1000)+60000 for a in agents):raise Rejected('Hyperliquid agent 未授权给资金账户、已到期或即将到期')
    async def book(self,m):
        a=next(a for a,x in self.markets.items() if x['id']==m['id'])
        r=await self.info('l2Book',coin=a)
        if abs(time.time()*1000-int(r['time']))>15000:raise Rejected('Hyperliquid 盘口已过期')
        return {s:[(D(x['px']),D(x['sz'])) for x in rows] for s,rows in zip(('bids','asks'),r['levels'])}
    async def open_orders(self,m):
        a=next(a for a,x in self.markets.items() if x['id']==m['id'])
        return [r for r in await self.info('openOrders',user=self.user,dex='') if r['coin']==a]
    def round_price(self,m,value,up=False):
        p=D(value)
        # Integer prices are allowed; otherwise both significant digits and
        # maximum decimals constrain the price, with side-safe rounding.
        step=max(D(m['tick']),D(10)**max(0,p.adjusted()-4)) if p>=10000 else max(D(m['tick']),D(10)**(p.adjusted()-4))
        return quantize(p,step,up)
    async def action(self,action):
        from eth_account import Account
        from hyperliquid.utils.signing import sign_l1_action
        # The exchange Date header supplies server time without changing the OS.
        # Each console requires a dedicated agent, so nonce domains never race.
        probe=await self.client.post(self.BASE+'/info',json={'type':'allMids'})
        if not probe.is_success or not probe.headers.get('date'):raise Rejected('Hyperliquid 服务器时间未确认，未签名发送')
        from email.utils import parsedate_to_datetime
        server=int(parsedate_to_datetime(probe.headers['date']).timestamp()*1000)
        nonce=self.next_nonce(server) if hasattr(self,'next_nonce') else max(server,self.last_nonce+1)
        self.last_nonce=nonce
        vault=self.settings.values.get('HYPERLIQUID_VAULT_ADDRESS') or None
        expiry=nonce+60000
        signature=sign_l1_action(Account.from_key(self.settings.values['HYPERLIQUID_PRIVATE_KEY']),action,vault,nonce,expiry,True)
        result=await self.json('POST',self.BASE+'/exchange',headers={'Content-Type':'application/json'},payload=json.dumps(dict(action=action,nonce=nonce,signature=signature,vaultAddress=vault,expiresAfter=expiry),separators=(',',':')))
        if result.get('status')!='ok':raise Rejected('Hyperliquid 拒绝签名动作，请核对专用 agent 授权及 nonce')
        return result
    async def set_leverage(self,m,lev,notional):
        tiers=[r for r in m.get('tiers',[]) if D(r['lowerBound'])<=notional]
        maximum=int(tiers[-1]['maxLeverage']) if tiers else m['max_leverage']
        if lev>maximum:raise Rejected('Hyperliquid 当前名义额档位不支持所选杠杆')
        await self.action(dict(type='updateLeverage',asset=m['id'],isCross=True,leverage=lev))
        a=next(a for a,x in self.markets.items() if x['id']==m['id'])
        r=await self.info('activeAssetData',user=self.user,coin=a)
        if (r.get('leverage') or {}).get('type')!='cross' or int(r['leverage']['value'])!=lev:raise Rejected('Hyperliquid 杠杆尚未读回确认，未开仓')
    @staticmethod
    def cid(o):return '0x'+hashlib.sha256(o['client_id'].encode()).hexdigest()[:32]
    async def submit(self,o,m,p):
        wire=dict(a=m['id'],b=o['side']=='BUY',p=decimal_text(p),s=decimal_text(o['quantity']),r=o['reduce_only'],t={'limit':{'tif':'Alo' if o.get('execution')=='maker' else 'Ioc'}},c=self.cid(o))
        r=await self.action(dict(type='order',orders=[wire],grouping='na'))
        statuses=((r.get('response') or {}).get('data') or {}).get('statuses')
        if not statuses or len(statuses)!=1:raise Unknown('Hyperliquid 未返回可核对订单回执')
        row=statuses[0]
        if 'error' in row:raise Rejected('Hyperliquid 订单被拒绝，请核对参数、保证金及权限')
        if not any(k in row for k in ('filled','resting')):raise Unknown('Hyperliquid 订单结果未知')
        return row
    async def raw_order(self,o,m):
        r=await self.info('orderStatus',user=self.user,oid=self.cid(o))
        if r.get('status')=='unknownOid':return None
        data=r.get('order')
        if not isinstance(data,dict) or (data.get('order') or {}).get('cloid')!=self.cid(o):raise Unknown('Hyperliquid 订单身份待核实')
        return data
    async def fills(self,o,oid):
        # Paginate up to the documented 2000-item response; incomplete histories
        # remain unknown rather than reporting an under-sized hedge.
        start=int(o['at']*1000)-60000;end=int(time.time()*1000);found={}
        for _ in range(10):
            rows=await self.info('userFillsByTime',user=self.user,startTime=start,endTime=end,aggregateByTime=False)
            for r in rows:
                if str(r['oid'])==str(oid):found[(r['tid'],r['hash'])]=r
            if len(rows)<2000:return list(found.values())
            last=max(int(r['time']) for r in rows)
            if last<=start:return None
            start=last # overlap boundary and deduplicate
        return None
    async def lookup(self,o,m):
        r=await self.raw_order(o,m)
        if r is None or r['status'] in ('open','triggered'):return None
        # Only documented filled / canceled / rejected terminal states.
        status=r['status'].lower()
        if status!='filled' and not status.endswith(('canceled','rejected')):return None
        raw=r['order'];expected=D(raw['origSz'])-D(raw['sz'])
        fills=await self.fills(o,raw['oid'])
        if fills is None:return None
        qty=sum((D(x['sz']) for x in fills),D(0))
        if qty!=expected:return None
        fee=str(sum(D(x['fee']) for x in fills)) if all(x.get('feeToken')=='USDC' for x in fills) else None
        return dict(filled=str(qty),quote=str(sum((D(x['sz'])*D(x['px']) for x in fills),D(0))),exchange_id=str(raw['oid']),fee=fee)
    async def status(self,o,m):
        r=await self.raw_order(o,m)
        if not r:return dict(status='NEW',executedQty='0')
        return dict(status='FILLED' if r['status']=='filled' else 'CANCELED' if r['status'].lower().endswith(('canceled','rejected')) else 'NEW',executedQty=str(D(r['order']['origSz'])-D(r['order']['sz'])))
    async def cancel(self,o,m):
        r=await self.raw_order(o,m)
        if r and r['status']=='open':await self.action(dict(type='cancelByCloid',cancels=[{'asset':m['id'],'cloid':self.cid(o)}]))
    async def fees(self,o,m):
        r=await self.lookup(o,m)
        return r.get('fee') if r and D(r['filled'])==D(o['filled']) else None
