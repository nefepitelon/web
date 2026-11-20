"""Native signed REST + official Lighter SDK. No third-party order relay."""
import asyncio
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR
import hashlib
import hmac
import time
from urllib.parse import urlencode
import httpx
from .config import BINANCE_URL, LIGHTER_URL

D = lambda value: Decimal(str(value))


class Rejected(RuntimeError):
    def __init__(self, message, *, code=None, status=None, endpoint=None):
        super().__init__(message)
        self.code, self.status, self.endpoint = code, status, endpoint
class Unknown(RuntimeError): pass


def quantize(value, step, up=False):
    return (D(value) / D(step)).to_integral_value(rounding=ROUND_CEILING if up else ROUND_FLOOR) * D(step)


def common_step(a, b):
    import math
    scale = 10 ** max(-D(a).as_tuple().exponent, -D(b).as_tuple().exponent, 0)
    return D(math.lcm(int(D(a) * scale), int(D(b) * scale))) / scale


class Venues:
    def __init__(self, settings):
        self.settings, self.signer, self.offset = settings, None, 0
        self.clients = {v: httpx.AsyncClient(proxy=settings.proxy(v), trust_env=False, timeout=httpx.Timeout(20, connect=10)) for v in ('binance', 'lighter')}
        self.markets = {}
        self.markets_from_tasks=False
        self.permission_cache = None
        self.brackets, self.leverage_at, self.leverage_errors = {}, 0, {}
        self.clock_anchor = None
        self.clock_lock = asyncio.Lock()

    async def close(self):
        await asyncio.gather(*(c.aclose() for c in self.clients.values()))
        if self.signer: await self.signer.close()

    async def sync_clock(self, *, force=True):
        async with self.clock_lock:
            if not force and self.clock_anchor and time.monotonic()-self.clock_anchor[1]<60:
                return
            started=time.monotonic()
            server=await self.request('binance','/fapi/v1/time')
            finished=time.monotonic()
            # Anchor to a monotonic clock: Windows time corrections must not
            # move signed timestamps forward/backward during a running session.
            server_now=int(server['serverTime'])+(finished-started)*500
            self.clock_anchor=(server_now,finished)
            self.offset=server_now-time.time()*1000

    def signed_timestamp(self):
        if self.clock_anchor:
            server,at=self.clock_anchor
            return int(server+(time.monotonic()-at)*1000)
        return int(time.time()*1000+self.offset)

    async def request(self, venue, path, params=None, *, signed=False, method='GET', wallet=False, _clock_retry=True, _read_retry=0):
        params = dict(params or {})
        unsigned_params=dict(params)
        headers = {'Accept': 'application/json'}
        if _read_retry:
            headers.update({'Connection':'close','Cache-Control':'no-cache'})
        if signed:
            if not self.settings.values.get('BINANCE_API_KEY') or not self.settings.values.get('BINANCE_API_SECRET'):
                raise Rejected('请配置 Binance API Key / Secret 并启用 USD-M 合约交易权限')
            await self.sync_clock(force=False)
            params.update(timestamp=self.signed_timestamp(), recvWindow=5000)
            query = urlencode(params)
            params['signature'] = hmac.new(self.settings.values['BINANCE_API_SECRET'].encode(), query.encode(), hashlib.sha256).hexdigest()
            headers['X-MBX-APIKEY'] = self.settings.values['BINANCE_API_KEY']
        try:
            base = 'https://api.binance.com' if wallet and venue == 'binance' else BINANCE_URL if venue == 'binance' else LIGHTER_URL
            response = await self.clients[venue].request(method, base + path, params=params, headers=headers)
        except httpx.HTTPError:
            if method == 'GET': raise Rejected(f'{venue} 读取失败，请检查网络、代理或 API 权限') from None
            raise Unknown(f'{venue} 请求结果未确认，请核对订单与仓位') from None
        if method != 'GET':
            try: error_code = response.json().get('code')
            except (ValueError, AttributeError): error_code = None
            # A backend timeout can arrive as HTTP 408 or a JSON error. It is
            # not proof of rejection; recover the existing client order ID.
            if response.status_code == 408 or response.status_code >= 500 or venue == 'binance' and error_code in (-1000, -1006, -1007):
                raise Unknown(f'{venue} HTTP {response.status_code}，订单结果未知')
        if not response.is_success:
            try: code = response.json().get('code')
            except (ValueError, AttributeError): code = None
            if venue=='binance' and signed and code==-1021:
                self.clock_anchor=None
            if venue=='binance' and signed and method=='GET' and code==-1021 and _clock_retry:
                # Only retry a read after clock correction. Never replay writes.
                await self.sync_clock()
                return await self.request(venue,path,unsigned_params,signed=True,method=method,wallet=wallet,_clock_retry=False)
            # Read-only recovery for transient Lighter edge failures. Preserve
            # the GET method and account identity; never replay trading writes.
            transient = response.status_code in (502,503,504) or (venue=='lighter' and response.status_code==405)
            if method=='GET' and transient and _read_retry<2:
                await asyncio.sleep(.3*2**_read_retry)
                return await self.request(venue,path,unsigned_params,signed=signed,method=method,wallet=wallet,_clock_retry=_clock_retry,_read_retry=_read_retry+1)
            hint = {-2015:'API Key、出口 IP 或合约权限被拒绝；请核对主网 Key、合约权限与 IP 白名单',
                    -2014:'API Key 格式无效，请核对主网 HMAC API Key', -1022:'签名无效，请核对成对的 HMAC Key / Secret',
                    -1021:'服务器时间已重新同步，读取仍超出时间窗口；请检查网络延迟，下一轮将重新校时'}.get(code)
            if response.status_code==405 and venue=='lighter':
                hint='官方 GET 读取接口暂时拒绝请求，已有限重试；账户状态仍待核实，下一轮继续读取'
            hint = hint or ('请求限流，请稍后重试' if response.status_code in (418,429) else '接口拒绝读取，请核对权限、IP 白名单或接口状态')
            raise Rejected(f'{venue} HTTP {response.status_code}' + (f' / {code}' if code is not None else '') + f' · {path}：{hint}', code=code,status=response.status_code,endpoint=path)
        try: body = response.json()
        except ValueError:
            if method == 'GET': raise Rejected(f'{venue} 未返回有效行情 / 账户响应') from None
            raise Unknown(f'{venue} 返回非 JSON 响应') from None
        if isinstance(body, dict) and (body.get('code', 200) < 0 or venue == 'lighter' and body.get('code', 200) != 200):
            raise Rejected(f'{venue} 拒绝请求，代码 {body.get("code")}')
        return body

    async def metadata(self):
        _, exchange, light = await asyncio.gather(self.sync_clock(), self.request('binance', '/fapi/v1/exchangeInfo'), self.request('lighter', '/api/v1/orderBooks'))
        lighter = {m['symbol']: m for m in light['order_books'] if m.get('market_type') == 'perp' and m.get('status') == 'active'}
        markets = {}
        for b in exchange['symbols']:
            asset = b['baseAsset']
            if b.get('status') != 'TRADING' or b.get('contractType') != 'PERPETUAL' or b.get('quoteAsset') != 'USDT' or asset not in lighter: continue
            l = lighter[asset]
            f = {r['filterType']: r for r in b['filters']}
            if not all(k in f for k in ('LOT_SIZE', 'PRICE_FILTER', 'MIN_NOTIONAL')): continue
            markets[asset] = dict(asset=asset, symbol=b['symbol'], market_id=int(l['market_id']),
                binance_step=f['LOT_SIZE']['stepSize'], binance_min=f['LOT_SIZE']['minQty'], binance_max=f['LOT_SIZE']['maxQty'],
                tick=f['PRICE_FILTER']['tickSize'], min_notional=f['MIN_NOTIONAL']['notional'],
                lighter_step=str(D(10) ** -int(l['supported_size_decimals'])),
                size_decimals=int(l['supported_size_decimals']), price_decimals=int(l['supported_price_decimals']),
                lighter_min=l['min_base_amount'], lighter_notional=l['min_quote_amount'])
        self.markets = markets
        self.markets_from_tasks=False
        self.leverage_at = 0
        return markets

    async def funding(self):
        if not self.markets or self.markets_from_tasks: await self.metadata()
        await self.leverage_limits()
        premium, intervals, light = await asyncio.gather(self.request('binance', '/fapi/v1/premiumIndex'), self.request('binance', '/fapi/v1/fundingInfo'), self.request('lighter', '/api/v1/funding-rates'))
        b = {r['symbol']: r for r in premium}
        hours = {r['symbol']: int(r['fundingIntervalHours']) for r in intervals}
        l = {int(r['market_id']): r for r in light['funding_rates'] if r['exchange'] == 'lighter'}
        rows = []
        for asset, m in self.markets.items():
            if m['symbol'] not in b or m['market_id'] not in l: continue
            br, lr = b[m['symbol']], l[m['market_id']]
            interval = hours.get(m['symbol'], 8)  # Official default; fundingInfo lists adjustments.
            bh, lh = D(br['lastFundingRate']) * 10000 / interval, D(lr['rate']) * 10000 / 8
            if not bh.is_finite() or not lh.is_finite() or abs(bh) > 100 or abs(lh) > 100: continue
            bl, ll = m.get('binance_max_leverage'), m.get('lighter_max_leverage')
            rows.append(dict(asset=asset, binance_bps_h=float(bh), lighter_bps_h=float(lh), net_bps_h=float(abs(bh-lh)),
                             direction='BINANCE_LONG' if bh < lh else 'LIGHTER_LONG', mark=float(br['markPrice']), binance_interval_h=interval, next_funding=br['nextFundingTime'],
                             binance_max_leverage=bl,lighter_max_leverage=ll,max_leverage=min(bl,ll) if bl and ll else None,
                             leverage_error='；'.join(self.leverage_errors.values()) or None))
        return sorted(rows, key=lambda r: -r['net_bps_h'])

    async def leverage_limits(self, force=False):
        if not force and time.time()-self.leverage_at < 300: return
        results = await asyncio.gather(
            self.request('binance','/fapi/v1/leverageBracket',signed=True),
            self.request('lighter','/api/v1/orderBookDetails',{'filter':'perp'}),return_exceptions=True)
        self.leverage_errors = {}
        for venue,result in zip(('binance','lighter'),results):
            if not isinstance(result,Exception) and (venue=='binance' and not isinstance(result,list) or venue=='lighter' and not isinstance(result,dict)):
                result=Rejected('杠杆响应结构无效')
            if isinstance(result,Exception):
                self.leverage_errors[venue] = f'{venue} 杠杆上限读取失败'
                # Do not retain expired ceilings after a failed refresh.
                for market in self.markets.values(): market.pop(venue+'_max_leverage',None)
            elif venue == 'binance':
                self.brackets = {r['symbol']:r['brackets'] for r in result if isinstance(r,dict) and 'symbol' in r and 'brackets' in r}
                for m in self.markets.values():
                    tiers=self.brackets.get(m['symbol'],[])
                    m.pop('binance_max_leverage',None)
                    if tiers: m['binance_max_leverage']=max(int(r['initialLeverage']) for r in tiers)
            else:
                details={int(r['market_id']):r for r in result.get('order_book_details',[])}
                for m in self.markets.values():
                    m.pop('lighter_max_leverage',None)
                    row=details.get(m['market_id'],{});fraction=D(row.get('min_initial_margin_fraction',0))
                    if fraction.is_finite() and fraction>0:
                        m['lighter_max_leverage']=int(D(10000)/fraction)
                        m['lighter_initial_margin_fraction']=str(row['default_initial_margin_fraction'])
                        m['lighter_maintenance_margin_fraction']=str(row['maintenance_margin_fraction'])
        self.leverage_at=time.time()

    @staticmethod
    def book_spread(bid,ask):
        bid,ask=D(bid),D(ask)
        if not bid.is_finite() or not ask.is_finite() or bid<=0 or ask<bid: raise Rejected('盘口买卖价无效')
        return float((ask-bid)/((ask+bid)/2)*10000)

    @staticmethod
    def lighter_fraction(position,market):
        # AccountPosition is a percentage string ("5.00" = 20x);
        # orderBookDetails and signing transactions use 1e-4 ticks (500).
        return D(position['initial_margin_fraction'])*100 if 'initial_margin_fraction' in position else D(market['lighter_initial_margin_fraction'])

    async def spreads(self):
        if not self.markets: await self.metadata()
        tickers=await self.request('binance','/fapi/v1/ticker/bookTicker')
        books={r['symbol']:r for r in tickers}
        limit=asyncio.Semaphore(6)
        async def read(asset,m):
            row={'asset':asset,'binance_bps':None,'lighter_bps':None,'total_bps':None}
            try:
                async with limit:
                    async with asyncio.timeout(6):
                        b=books[m['symbol']]
                        l=await self.request('lighter','/api/v1/orderBookOrders',{'market_id':m['market_id'],'limit':1})
                        row.update(binance_bps=self.book_spread(b['bidPrice'],b['askPrice']),lighter_bps=self.book_spread(l['bids'][0]['price'],l['asks'][0]['price']))
                        row['total_bps']=row['binance_bps']+row['lighter_bps']
            except (Exception,asyncio.CancelledError):
                row['error']='价差未取得有效双所盘口，稍后重试'
            return row
        jobs=[asyncio.create_task(read(a,m)) for a,m in self.markets.items()]
        done,pending=await asyncio.wait(jobs,timeout=35)
        for job in pending: job.cancel()
        rows=await asyncio.gather(*jobs)
        return {'assets':sorted(rows,key=lambda r:(r['total_bps'] is None,r['total_bps'] or 0,r['asset'])),
                'scanned_at':time.time(),'note':'两所买卖价差之和，按中间价换算 bps 从窄到宽；最多缓存 10 分钟，开仓前仍实时校验盘口。'}

    async def prepare_leverage(self,market,leverage,notional,accounts):
        """Only called while both owned legs are flat, before any order intent."""
        await self.leverage_limits(force=True)
        limits=[market.get(v+'_max_leverage') for v in ('binance','lighter')]
        if not all(limits): raise Rejected('两所杠杆上限尚未核实，不能设置杠杆或新开仓')
        tiers=self.brackets.get(market['symbol'],[])
        tier=next((r for r in tiers if D(r['notionalFloor'])<=notional<D(r['notionalCap'])),None)
        if tier is None or leverage>min(*limits,int(tier['initialLeverage'])): raise Rejected('所选杠杆超过两所上限或 Binance 当前名义额档位')
        config=accounts['binance'].get('symbolConfig',{}).get(market['symbol'])
        if config is None: raise Rejected('Binance 当前币种杠杆配置未确认')
        position=accounts['lighter_positions'].get(market['market_id'],{})
        current_fraction=self.lighter_fraction(position,market)
        target_fraction=int(10000/leverage)
        if (D(1)/D(leverage)-D(market['lighter_maintenance_margin_fraction'])/10000)*100 <= D(self.settings.values['CLOSE_CORRIDOR_PCT']):
            raise Rejected('所选杠杆的估算强平距离不足平仓风控线，请降低杠杆')
        if int(config['leverage'])!=leverage:
            response=await self.request('binance','/fapi/v1/leverage',{'symbol':market['symbol'],'leverage':leverage},signed=True,method='POST')
            if int(response.get('leverage',0))!=leverage: raise Rejected('Binance 未确认目标杠杆，未发送开仓订单')
        if current_fraction!=target_fraction:
            signer=self.get_signer()
            try:
                _,response,error=await signer.update_leverage(market_index=market['market_id'],margin_mode=int(position.get('margin_mode',signer.CROSS_MARGIN_MODE)),leverage=leverage,api_key_index=int(self.settings.values['LIGHTER_API_KEY_INDEX']))
                if error or response is None or response.code!=200: raise Rejected('Lighter 杠杆设置未确认，未发送开仓订单')
            except Rejected: raise
            except Exception: raise Rejected('Lighter 杠杆请求结果未确认；下一轮先读取配置，未发送开仓订单') from None
        # A transaction receipt alone is not confirmation of the new setting.
        for _ in range(8):
            b,(l,positions)=await asyncio.gather(self.request('binance','/fapi/v1/symbolConfig',{'symbol':market['symbol']},signed=True),self.lighter_account())
            actual=positions.get(market['market_id'],{})
            fraction=self.lighter_fraction(actual,market)
            if b and int(b[0]['leverage'])==leverage and fraction==target_fraction:
                return
            await asyncio.sleep(.5)
        raise Rejected('双所杠杆尚未同步到目标值，未发送开仓订单')

    async def maker_price(self,market,side):
        book=await self.request('binance','/fapi/v1/depth',{'symbol':market['symbol'],'limit':5})
        price=D(book['bids' if side=='BUY' else 'asks'][0][0])
        if not price.is_finite() or price<=0: raise Rejected('Binance 挂单价格无效')
        return quantize(price,market['tick'],side=='SELL')

    async def maker_status(self,order,market):
        return await self.request('binance','/fapi/v1/order',{'symbol':market['symbol'],'origClientOrderId':order['client_id']},signed=True)

    async def test_order(self,market,quantity,price):
        # Binance validates TRADE authorization and parameters without sending
        # this test request to its matching engine.
        await self.request('binance','/fapi/v1/order/test',{'symbol':market['symbol'],'side':'BUY','positionSide':'BOTH','type':'LIMIT','timeInForce':'IOC','quantity':format(quantity,'f'),'price':format(price,'f')},signed=True,method='POST')

    def get_signer(self):
        if self.signer: return self.signer
        import lighter
        v = self.settings.values
        self.signer = lighter.SignerClient(url=LIGHTER_URL, account_index=int(v['LIGHTER_ACCOUNT_INDEX']), api_private_keys={int(v['LIGHTER_API_KEY_INDEX']): v['LIGHTER_API_PRIVATE_KEY']})
        proxy = self.settings.proxy('lighter')
        if proxy:
            rest = self.signer.api_client.rest_client
            if proxy.startswith(('http://', 'https://')): rest.proxy = proxy
            else:
                import aiohttp
                from aiohttp_socks import ProxyConnector
                old = rest.pool_manager
                rest.pool_manager = aiohttp.ClientSession(connector=ProxyConnector.from_url(proxy, rdns=True), trust_env=False)
                asyncio.create_task(old.close())
        return self.signer

    def token(self):
        token, error = self.get_signer().create_auth_token_with_expiry(api_key_index=int(self.settings.values['LIGHTER_API_KEY_INDEX']))
        if error: raise Rejected('Lighter API 认证令牌生成失败')
        return token

    async def binance_account(self):
        try:
            b = await self.request('binance', '/fapi/v3/account', signed=True)
        except Rejected as error:
            if error.code == -2015:
                try:
                    if not self.permission_cache or time.time()-self.permission_cache[0] > 300:
                        permissions = await self.request('binance','/sapi/v1/account/apiRestrictions',signed=True,wallet=True)
                        self.permission_cache = (time.time(), permissions)
                    if self.permission_cache[1].get('enableFutures') is False:
                        raise Rejected('Binance HTTP 401 / -2015：已确认此 API Key 的 enableFutures=false。请在 Binance「API 管理」开启合约权限后刷新；普通读取权限不能替代合约权限。',code=-2015,status=401,endpoint='/fapi/v3/account')
                except Rejected as diagnostic:
                    if 'enableFutures=false' in str(diagnostic): raise
                except Exception: pass
            raise
        config, positions, symbols = await asyncio.gather(
            self.request('binance', '/fapi/v1/accountConfig', signed=True),
            self.request('binance', '/fapi/v3/positionRisk', signed=True),
            self.request('binance', '/fapi/v1/symbolConfig', signed=True))
        usdt = next((asset for asset in b.get('assets', []) if asset.get('asset') == 'USDT'), None)
        if usdt is None: raise Rejected('Binance 未返回 USDT 保证金余额')
        b['availableBalance'] = usdt['availableBalance']
        b['usdtAsset'] = usdt
        # V3 deliberately omits canTrade and leverage. Missing fields are not
        # negative permission signals: query their authoritative config APIs.
        b['canTrade'] = config.get('canTrade')
        b['permissionSource'] = '/fapi/v1/accountConfig'
        b['oneWay'] = config.get('dualSidePosition') is False
        b['singleAsset'] = config.get('multiAssetsMargin') is False
        b['symbolConfig'] = {p['symbol']: p for p in symbols}
        return b, {p['symbol']: {**b['symbolConfig'].get(p['symbol'], {}), **p} for p in positions}

    async def lighter_account(self):
        l = await self.request('lighter', '/api/v1/account', {'by': 'index', 'value': self.settings.values['LIGHTER_ACCOUNT_INDEX']})
        account = next((a for a in l['accounts'] if int(a.get('account_index', a.get('index', -1))) == int(self.settings.values['LIGHTER_ACCOUNT_INDEX'])), None)
        if account is None: raise Rejected('Lighter Core 账户编号不存在，不能使用 RHC 账户编号')
        return account, {int(p['market_id']): p for p in account.get('positions', [])}

    async def account_snapshot(self):
        async def read(venue):
            required = ('BINANCE_API_KEY','BINANCE_API_SECRET') if venue=='binance' else ('LIGHTER_ACCOUNT_INDEX',)
            if not all(self.settings.values.get(k) for k in required): raise Rejected(f'{venue} 账户参数尚未配置')
            return await (self.binance_account() if venue=='binance' else self.lighter_account())
        values = await asyncio.gather(*(read(v) for v in ('binance','lighter')),return_exceptions=True)
        snapshot = {'errors':{}}
        for venue,result in zip(('binance','lighter'),values):
            if isinstance(result,Exception):
                snapshot['errors'][venue] = str(result)
                snapshot[venue], snapshot[venue+'_positions'] = None, None
            else: snapshot[venue], snapshot[venue+'_positions'] = result
        return snapshot

    async def accounts(self):
        snapshot = await self.account_snapshot()
        if snapshot['errors']: raise Rejected(next(iter(snapshot['errors'].values())))
        b = snapshot['binance']
        if b.get('oneWay') is not True or b.get('singleAsset') is not True:
            raise Rejected('Binance 需使用单向持仓、单资产 USD-M 模式；请在交易所核对后切换，本平台不自动改变账户模式')
        if b.get('canTrade') is False: raise Rejected('Binance accountConfig 明确返回 canTrade=false，账户当前禁止交易')
        if b.get('canTrade') is not True: raise Rejected('Binance 交易权限状态未确认：accountConfig 缺少 canTrade，禁止新开仓')
        if any(p.get('positionSide') != 'BOTH' for p in snapshot['binance_positions'].values()): raise Rejected('Binance 持仓模式不匹配')
        return snapshot

    @staticmethod
    def positions(accounts, market):
        b = accounts['binance_positions'].get(market['symbol'], {})
        l = accounts['lighter_positions'].get(market['market_id'], {})
        return {'binance': D(b.get('positionAmt', 0)), 'lighter': D(l.get('position', 0)) * (-1 if int(l.get('sign', 1)) < 0 else 1)}

    async def preflight(self):
        await self.metadata()
        accounts = await self.accounts()
        signer = self.get_signer()
        error = await asyncio.wait_for(asyncio.to_thread(signer.check_client), 20)
        if error: raise Rejected('Lighter Core API 私钥与该账户 / Key 编号不匹配')
        import lighter
        await asyncio.wait_for(lighter.TransactionApi(signer.api_client).next_nonce(account_index=int(self.settings.values['LIGHTER_ACCOUNT_INDEX']), api_key_index=int(self.settings.values['LIGHTER_API_KEY_INDEX'])), 20)
        return accounts

    async def open_orders(self, market):
        b = await self.request('binance', '/fapi/v1/openOrders', {'symbol': market['symbol']}, signed=True)
        import lighter
        l = await lighter.OrderApi(self.get_signer().api_client).account_active_orders(self.token(), int(self.settings.values['LIGHTER_ACCOUNT_INDEX']), market_id=market['market_id'], _request_timeout=15)
        return bool(b or l.orders)

    async def prices(self, market, venue, side, quantity):
        if venue == 'binance':
            book = await self.request(venue, '/fapi/v1/depth', {'symbol': market['symbol'], 'limit': 20})
            levels = [(D(p), D(q)) for p, q in book['asks' if side == 'BUY' else 'bids']]
            step = D(market['tick'])
        else:
            book = await self.request(venue, '/api/v1/orderBookOrders', {'market_id': market['market_id'], 'limit': 50})
            levels = [(D(r['price']), D(r['remaining_base_amount'])) for r in book['asks' if side == 'BUY' else 'bids']]
            step = D(10) ** -market['price_decimals']
        if not levels or levels[0][0] <= 0: raise Rejected('盘口为空或价格无效')
        limit = levels[0][0] * (1 + D(self.settings.values['ORDER_SLIPPAGE_BPS']) / 10000 * (1 if side == 'BUY' else -1))
        # A buy cap rounds down and a sell floor rounds up: never exceed slippage.
        price = quantize(limit, step, side == 'SELL')
        available = sum(q for p, q in levels if p <= price) if side == 'BUY' else sum(q for p, q in levels if p >= price)
        if available < quantity: raise Rejected('允许滑点内盘口深度不足')
        return price, levels[0][0]

    async def submit(self, order, market, price):
        venue = order['venue']
        if venue == 'binance':
            return await self.request(venue, '/fapi/v1/order', {'symbol': market['symbol'], 'side': order['side'], 'positionSide': 'BOTH', 'type': 'LIMIT', 'timeInForce': 'GTX' if order.get('execution')=='maker' else 'IOC', 'quantity': order['quantity'], 'price': format(price, 'f'), 'reduceOnly': str(order['reduce_only']).lower(), 'newClientOrderId': order['client_id'], 'newOrderRespType': 'ACK' if order.get('execution')=='maker' else 'RESULT'}, signed=True, method='POST')
        signer = self.get_signer()
        try:
            _, response, error = await signer.create_order(market_index=market['market_id'], client_order_index=int(order['client_id']), base_amount=int(D(order['quantity']) * 10**market['size_decimals']), price=int(price * 10**market['price_decimals']), is_ask=order['side']=='SELL', order_type=signer.ORDER_TYPE_MARKET, time_in_force=signer.ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL, order_expiry=signer.DEFAULT_IOC_EXPIRY, reduce_only=order['reduce_only'], api_key_index=int(self.settings.values['LIGHTER_API_KEY_INDEX']))
        except Exception: raise Unknown('Lighter 报单结果未知；禁止重复报单') from None
        if error or response is None or response.code != 200:
            raise Unknown('Lighter 报单未确认，须通过订单记录核对')
        return {'tx_hash': str(response.tx_hash)}

    async def lookup(self, order, market):
        if order['venue'] == 'binance':
            row = await self.request('binance', '/fapi/v1/order', {'symbol': market['symbol'], 'origClientOrderId': order['client_id']}, signed=True)
            if row['status'] not in ('FILLED', 'CANCELED', 'EXPIRED', 'EXPIRED_IN_MATCH', 'REJECTED'): return None
            return dict(filled=row['executedQty'], quote=row.get('cumQuote', '0'), exchange_id=str(row['orderId']), fee=None)
        import lighter
        api = lighter.OrderApi(self.get_signer().api_client)
        history = await api.account_inactive_orders(self.token(), int(self.settings.values['LIGHTER_ACCOUNT_INDEX']), 100, market_id=market['market_id'], _request_timeout=15)
        row = next((o for o in history.orders if int(o.client_order_index) == int(order['client_id'])), None)
        if row is None or not (row.status == 'filled' or row.status.startswith(('canceled', 'cancelled', 'expired', 'rejected'))): return None
        return dict(filled=row.filled_base_amount, quote=row.filled_quote_amount, exchange_id=str(row.order_index), fee=None)

    async def cancel_owned(self, order, market):
        """Cancel only a proven active ID belonging to this durable intent."""
        if order['venue'] == 'binance':
            rows = await self.request('binance', '/fapi/v1/openOrders', {'symbol': market['symbol']}, signed=True)
            if any(str(r['clientOrderId']) == order['client_id'] for r in rows):
                await self.request('binance', '/fapi/v1/order', {'symbol': market['symbol'], 'origClientOrderId': order['client_id']}, signed=True, method='DELETE')
        else:
            import lighter
            signer = self.get_signer()
            active = await lighter.OrderApi(signer.api_client).account_active_orders(self.token(), int(self.settings.values['LIGHTER_ACCOUNT_INDEX']), market_id=market['market_id'], _request_timeout=15)
            for row in active.orders:
                if int(row.client_order_index) == int(order['client_id']):
                    _, response, error = await signer.cancel_order(market_index=market['market_id'], order_index=int(row.order_index), api_key_index=int(self.settings.values['LIGHTER_API_KEY_INDEX']))
                    if error or response is None or response.code != 200: raise Unknown('Lighter 撤单回执未知，等待终态核对')

    async def fees(self, order, market):
        if D(order['filled']) == 0: return '0'
        if order['venue'] == 'binance':
            trades = await self.request('binance', '/fapi/v1/userTrades', {'symbol': market['symbol'], 'orderId': order['exchange_id'], 'limit': 1000}, signed=True)
            if not trades or sum(D(t['qty']) for t in trades) != D(order['filled']) or any(t['commissionAsset'] != 'USDT' for t in trades): return None
            return str(sum(D(t['commission']) for t in trades))
        # Fill-specific fee ticks are authoritative; current tier is not historical evidence.
        import lighter
        result = await lighter.OrderApi(self.get_signer().api_client).trades(sort_by='timestamp', limit=100, authorization=self.token(), account_index=int(self.settings.values['LIGHTER_ACCOUNT_INDEX']), market_id=market['market_id'], order_index=int(order['exchange_id']), aggregate=False, _request_timeout=15)
        trades = result.trades
        if not trades or sum(D(t.size) for t in trades) != D(order['filled']) or any(t.taker_fee is None for t in trades): return None
        return str(sum(D(t.taker_fee) / D(1000000) for t in trades))
