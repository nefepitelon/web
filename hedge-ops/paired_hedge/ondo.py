"""Ondo Perps REST boundary, using the official HMAC API specification.

Quantities are base units and funding is bps/hour. Each instance owns its
account credentials and its public/private transports. A write is sent once;
only a signed client-order lookup and terminal fills can settle its journal.
"""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from email.utils import parsedate_to_datetime
import hashlib
import hmac
import json
import re
import time
from urllib.parse import quote, urlencode

import httpx

from binance_lighter.venues import D, Rejected, Unknown, quantize


def decimal_text(value):
    value = D(value)
    if not value.is_finite():
        raise Rejected('Ondo Perps 数值无效')
    text = format(value, 'f')
    return text.rstrip('0').rstrip('.') if '.' in text else text


def epoch(value):
    return datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()


class OndoperpsVenue:
    BASE = 'https://api.ondoperps.xyz'
    READ_BUDGET = 8.0
    WRITE_BUDGET = 12.0
    ACTIVE = frozenset(('open', 'pending', 'untriggered'))
    TERMINAL = frozenset(('fullyfilled', 'canceled'))

    def __init__(self, settings, name='ondoperps', prefix='ONDOPERPS'):
        self.settings, self.name, self.prefix = settings, name, prefix
        self.markets = {}
        self._permission_at = 0.0
        self._permission_report = {}
        self._permission_binding = None
        self._authorized_markets = {}
        self._account_id = None
        self._clock_anchor = None
        self._clock_lock = asyncio.Lock()
        self._last_stamp = 0
        self._closed = False
        self._leases = {}
        self._retired = set()
        self.client = self._client()
        self.private_client = self._client()

    @property
    def key_id(self):
        return self.settings.values.get(self.prefix + '_API_KEY_ID', '')

    @property
    def secret(self):
        return self.settings.values.get(self.prefix + '_API_SECRET', '')

    def _client(self):
        values = self.settings.values
        proxy = values.get(self.prefix + '_PROXY') or values.get('GLOBAL_PROXY') or None
        return httpx.AsyncClient(proxy=proxy, trust_env=False,
                                 timeout=httpx.Timeout(8, connect=4),
                                 limits=httpx.Limits(max_connections=8,
                                                    max_keepalive_connections=4,
                                                    keepalive_expiry=10))

    @asynccontextmanager
    async def _lease(self, signed):
        client = self.private_client if signed else self.client
        self._leases[client] = self._leases.get(client, 0) + 1
        try:
            yield client
        finally:
            self._leases[client] -= 1
            if not self._leases[client]:
                del self._leases[client]
                if client in self._retired:
                    self._retired.remove(client)
                    await client.aclose()

    async def _reset(self, signed, failed):
        # Retire only the failed generation; do not cancel another account read
        # still using it or replace a healthy successor after a concurrent error.
        attr = 'private_client' if signed else 'client'
        if not self._closed and getattr(self, attr) is failed:
            setattr(self, attr, self._client())
        if self._leases.get(failed):
            self._retired.add(failed)
        else:
            await failed.aclose()

    async def close(self):
        self._closed = True
        await asyncio.gather(*(c.aclose() for c in
                               {self.client, self.private_client, *self._retired}))

    def _credentials(self):
        # The prefixes form part of the secret/key. Neither is a wallet key,
        # UUID, or fixed-width hex string; see api_key_authentication.md.
        for key, value, marker in ((self.prefix + '_API_KEY_ID', self.key_id, 'ondoKeyId_'),
                                   (self.prefix + '_API_SECRET', self.secret, 'ondoApiSecret_')):
            if not value.startswith(marker) or len(value) <= len(marker) or any(c.isspace() for c in value):
                raise Rejected(key + ' 请完整填写官方 API 凭据并保留 ' + marker + ' 前缀')

    @staticmethod
    def signature(secret, timestamp, method, target, body=''):
        return hmac.new(secret.encode(), (str(timestamp) + method.upper() + target + body).encode(),
                        hashlib.sha256).hexdigest()

    def _observe_clock(self, response):
        try:
            server = parsedate_to_datetime(response.headers['date']).timestamp() * 1000
        except (KeyError, TypeError, ValueError, OverflowError):
            return
        # HTTP Date has second precision. Using its lower bound stays safely
        # behind the server (allowed 10 s), never the disallowed >1 s ahead.
        self._clock_anchor = (server - 100, time.monotonic())

    async def _clock(self, force=False):
        async with self._clock_lock:
            if not force and self._clock_anchor and time.monotonic() - self._clock_anchor[1] < 15:
                return
            await self.request('GET', '/status')
            if not self._clock_anchor:
                raise Rejected('Ondo Perps 服务器时间未确认，未签名发送请求')
            if force:
                self._last_stamp = 0

    def _timestamp(self):
        server, at = self._clock_anchor
        stamp = max(int(server + (time.monotonic() - at) * 1000), self._last_stamp + 1)
        self._last_stamp = stamp
        return str(stamp)

    def now(self):
        if self._clock_anchor:
            server, at = self._clock_anchor
            return server / 1000 + time.monotonic() - at
        return time.time()

    @staticmethod
    def _target(path, params):
        query = urlencode([(k, str(v).lower() if isinstance(v, bool) else str(v))
                           for k, v in (params or {}).items() if v is not None and v != ''])
        return path + ('?' + query if query else '')

    def _error(self, status, code, path):
        hints = {
            'timestamp_too_far': '服务器时间窗口未通过，下一次只读请求将重新校时',
            'signature_mismatch': '签名不匹配，请核对成对 API Key / Secret，保留官方前缀',
            'key_doesnt_have_scope': '当前 API Key 未开放所需权限，请启用 trade 权限',
            'key_not_allowed_for_action': ('当前 API Key 不允许管理 API Key；不能据此判断 trade 权限'
                                           if path == '/v1/api_keys' else
                                           '当前 API Key 不允许此操作，请核对交易权限与账户限制'),
            'ip_not_permitted': '当前出口 IP 不在此 API Key 的白名单中',
            'api_key_not_found': 'API Key 不存在或已删除',
            'post_only_has_match': '挂单将立即成交，交易所已拒绝该 Post-only 订单',
            'order_matches_against_self': '交易所自成交保护已拒绝此订单，请核对独立账户',
        }
        safe_code = str(code) if code and re.fullmatch(r'[A-Za-z0-9_]{1,80}', str(code)) else None
        message = (f'{self.name} HTTP {status}' + (f' / {safe_code}' if safe_code else '')
                   + f' · {path}：' + hints.get(code, '请求被拒绝，请核对账户权限、IP 白名单与参数'))
        return Rejected(message, code=safe_code, status=status, endpoint=path)

    async def request(self, method, path, params=None, *, payload=None, signed=False, envelope=False):
        method = method.upper()
        read = method == 'GET'
        body = json.dumps(payload, separators=(',', ':'), ensure_ascii=False) if payload is not None else ''
        target = self._target(path, params)
        sent = False
        failed = None
        deadline = time.monotonic() + (self.READ_BUDGET if read else self.WRITE_BUDGET)
        try:
            async with asyncio.timeout(self.READ_BUDGET if read else self.WRITE_BUDGET):
                if signed:
                    self._credentials()
                    await self._clock()
                for attempt in range(2 if read else 1):
                    headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
                    if signed:
                        stamp = self._timestamp()
                        headers.update({'ONDO-KEY-ID': self.key_id, 'ONDO-TIMESTAMP': stamp,
                                        'ONDO-SIGN': self.signature(self.secret, stamp, method, target, body)})
                    if attempt:
                        headers.update({'Connection': 'close', 'Cache-Control': 'no-cache'})
                    try:
                        async with self._lease(signed) as client:
                            failed = client
                            sent = True
                            # Send the exact encoded target/body that was signed.
                            response = await client.request(method, self.BASE + target, headers=headers,
                                                            content=body.encode() if body else None,
                                                            timeout=max(.01, (deadline-time.monotonic()) /
                                                                        ((2-attempt) if read else 1)))
                    except httpx.HTTPError:
                        if failed is not None:
                            await self._reset(signed, failed)
                        if read and not attempt:
                            await asyncio.sleep(.15)
                            continue
                        raise (Rejected(f'{self.name} 网络读取失败，账户状态仍待核实') if read
                               else Unknown(f'{self.name} 写入回执丢失，请按 clientOrderId 核对，禁止重复报单')) from None
                    self._observe_clock(response)
                    try:
                        data = response.json()
                    except ValueError:
                        if not read:
                            raise Unknown(f'{self.name} 写入返回非 JSON，结果未知') from None
                        if not attempt:
                            await asyncio.sleep(.15)
                            continue
                        raise Rejected(f'{self.name} 返回非 JSON，未确认读取结果') from None
                    code = data.get('error_code') if isinstance(data, dict) else None
                    if response.status_code >= 500 or response.status_code == 408:
                        if not read:
                            raise Unknown(f'{self.name} HTTP {response.status_code}，写入结果未知，禁止重复报单')
                        if not attempt:
                            await asyncio.sleep(.15)
                            continue
                    if code == 'timestamp_too_far':
                        self._clock_anchor = None
                        if read and not attempt:
                            await self._clock(force=True)
                            continue
                    if not read and code == 'clientOrderID_collision':
                        # Client IDs are recovery keys, not replay/idempotency
                        # keys. The original accepted intent may already be filled.
                        raise Unknown(f'{self.name} clientOrderId 已存在，请核对原订单，禁止重发')
                    if response.status_code == 429 and read and not attempt:
                        await asyncio.sleep(.3)
                        continue
                    if not response.is_success or not isinstance(data, dict) or data.get('success') is not True:
                        if response.is_success and not isinstance(data, dict):
                            raise Rejected(f'{self.name} 读取结构无效') if read else Unknown(f'{self.name} 写入响应结构不明')
                        if not read and response.is_success and data.get('success') is not False:
                            raise Unknown(f'{self.name} 写入未返回明确接受或拒绝状态，继续核对原订单')
                        raise self._error(response.status_code, code, path)
                    return data if envelope else data.get('result')
        except TimeoutError:
            if read:
                # Cancellation of a slow HTTP read must not poison the next
                # generation, while the other independent pool remains intact.
                if sent and failed is not None:
                    await self._reset(signed, failed)
                raise Rejected(f'{self.name} 读取超过总时间预算，稍后自动重试；未将未知账户视为空仓') from None
            if sent:
                raise Unknown(f'{self.name} 写入超时，结果未知；按原 clientOrderId 核对，禁止重发') from None
            raise Rejected(f'{self.name} 签名前校时超时，未发送写入') from None

    async def metadata(self):
        config, contracts = await asyncio.gather(self.request('GET', '/v1/markets'),
                                                self.request('GET', '/v1/perps/contracts', {'sparkline': False}))
        if not isinstance(config, dict) or not isinstance(contracts, list):
            raise Rejected('Ondo Perps 市场配置读取结构无效')
        pairs = (config.get('perps') or {}).get('tradingPairs')
        if not isinstance(pairs, list):
            raise Rejected('Ondo Perps 未返回永续市场配置')
        by_id = {r['market']: r for r in contracts}
        markets = {}
        for row in pairs:
            market = row.get('market')
            contract = by_id.get(market, {})
            asset = (row.get('pair') or {}).get('base') or contract.get('baseCurrency')
            if not asset or not market or not contract or contract.get('productType') != 'perpetual' or contract.get('contractType') != 'linear':
                continue
            if ((row.get('pair') or {}).get('quote') not in ('USD', 'USDC')
                    or row.get('disabled') or contract.get('disabled') or contract.get('reduceOnly')
                    or row.get('tradingState', 'TRADING') != 'TRADING'):
                continue
            step, tick = D(row['baseIncrement']), D(row['quoteIncrement'])
            if not step.is_finite() or not tick.is_finite() or min(step, tick) <= 0:
                continue
            tiers = row.get('marginInfo') or []
            maximums = [int(D(t['maxLeverage'])) for t in tiers if D(t.get('maxLeverage', 0)) > 0]
            maximum = D(row.get('maxPositionBaseSize') or '0')
            if not maximum.is_finite() or maximum <= 0 or asset in markets:
                # Never guess an unknown size cap or silently alias two contracts.
                raise Rejected('Ondo Perps 市场数量上限或基础资产映射不明，未用于交易')
            markets[asset] = dict(id=market, step=str(step), minimum=str(step), maximum=str(maximum),
                                  tick=str(tick), notional='0', max_leverage=max(maximums) if maximums else None,
                                  tiers=tiers, raw=row, closed=bool(contract.get('isClosed')))
        self.markets = markets
        return markets

    async def funding(self):
        contracts, marks = await asyncio.gather(self.request('GET', '/v1/perps/contracts', {'sparkline': False}),
                                               self.request('GET', '/v1/perps/mark_prices'))
        if not isinstance(contracts, list) or not isinstance(marks, dict):
            raise Rejected('Ondo Perps 资金费或标记价格读取结构无效')
        by_id = {m['id']: a for a, m in self.markets.items()}
        result = {}
        for row in contracts:
            market = row.get('market')
            if market not in by_id or row.get('disabled') or row.get('reduceOnly'):
                continue
            try:
                remaining = epoch(row['nextFundingRateTimestamp']) - self.now()
                mark = D((marks.get(market) or {})['markPrice'])
                rate = D(row['nextFundingRate'])
                if not -15 <= remaining <= 3720 or not rate.is_finite() or not mark.is_finite() or mark <= 0:
                    continue
            except (KeyError, ValueError, TypeError):
                continue
            # Funding settles hourly. fundingIntervalDivisions=8 in markets
            # is the premium smoothing divisor, NOT an eight-hour settlement.
            result[by_id[market]] = dict(rate=rate * 10000, mark=str(mark), interval=1)
        if self.markets and not result:
            raise Rejected('Ondo Perps 未取得当前周期的有效资金费，禁止开新仓')
        return result

    def _bind_account(self, info):
        identity = info.get('accountID') if isinstance(info, dict) else None
        if not isinstance(identity, str) or not identity:
            raise Rejected('Ondo Perps 未返回实际 accountID，账户身份未确认')
        if self._account_id is not None and self._account_id != identity:
            self._permission_at = 0.0
            self._permission_report = {}
            self._authorized_markets = {}
            raise Rejected('Ondo Perps API 凭据对应账户发生变化，已禁止继续交易')
        if info.get('accountState') != 'open':
            raise Rejected('Ondo Perps 资金账户未开放交易')
        disabled = info.get('disabledFunctionality') or {}
        if disabled.get('disablePerps') or disabled.get('disableBalance'):
            raise Rejected('Ondo Perps 账户永续交易或余额读取被停用')
        self._account_id = identity
        return identity

    async def identity(self):
        return self._bind_account(await self.request('GET', '/v1/account', signed=True))

    async def account(self):
        # No metadata/funding lock or cache is used for trading balances.
        info, balance, positions = await asyncio.gather(self.request('GET', '/v1/account', signed=True),
                                                       self.request('GET', '/v1/perps/balance', signed=True),
                                                       self.request('GET', '/v1/perps/positions', signed=True))
        identity = self._bind_account(info)
        if not isinstance(balance, dict) or not isinstance(positions, list):
            raise Rejected('Ondo Perps 账户结构不完整，持仓状态仍待核实')
        if balance.get('underLiquidation') is not False:
            raise Rejected('Ondo Perps 账户正在清算或清算状态未知')
        try:
            equity, available, pnl = (D(balance[k]) for k in ('marginBalance', 'availableMargin', 'unrealizedPnl'))
            if not all(x.is_finite() for x in (equity, available, pnl)) or available < 0:
                raise ValueError()
            normalized = {}
            for row in positions:
                quantity = D(row['netQuantity'])
                if not quantity.is_finite():
                    raise ValueError()
                if not quantity:
                    continue
                if row.get('direction') not in ('long', 'short'):
                    raise ValueError()
                quantity = abs(quantity) * (-1 if row['direction'] == 'short' else 1)
                market = row['market']
                mark, entry, liquidation, upnl, lev = (D(row[k]) for k in
                    ('markPrice', 'averageEntryPrice', 'liquidationPrice', 'unrealizedPnl', 'leverage'))
                if not all(x.is_finite() for x in (mark, entry, liquidation, upnl, lev)) or min(mark, entry, lev) <= 0 or liquidation < 0 or market in normalized:
                    raise ValueError()
                asset = next((a for a, m in self.markets.items() if m['id'] == market),
                             market.removesuffix('-USD.P'))
                normalized[market] = dict(quantity=str(quantity), mark=str(mark), entry=str(entry),
                                           liquidation=str(liquidation), pnl=str(upnl), leverage=str(lev), asset=asset)
        except (KeyError, TypeError, ValueError, ArithmeticError):
            raise Rejected('Ondo Perps 余额或仓位字段无效，未将未知持仓视为空仓') from None
        return dict(equity=str(equity), available=str(available), pnl=str(pnl), positions=normalized,
                    account_id=identity)

    @property
    def permission_report(self):
        # No credentials are exposed, and callers cannot mutate the cached proof.
        return dict(self._permission_report)

    async def _trade_permission(self, force=False):
        binding = (self.key_id, self.secret)
        if (not force and self._permission_report and self._permission_binding == binding
                and 0 <= time.monotonic() - self._permission_at < 15):
            return self.permission_report
        self._permission_at = 0.0
        self._permission_report = {}
        self._authorized_markets = {}

        async def current_scope():
            try:
                return await self.request('GET', '/v1/api_keys', signed=True), False
            except Rejected as error:
                # This endpoint lists/manages the account's API keys. Official
                # REST docs expose no current-key/self scope endpoint. A trade
                # key may be forbidden from key management; this exact denial
                # is not evidence that trading itself is forbidden. All other
                # auth, IP, account, scope and transport errors remain fatal.
                if (error.status == 403 and error.code == 'key_not_allowed_for_action'
                        and error.endpoint == '/v1/api_keys'):
                    return None, True
                raise

        info, scope, config = await asyncio.gather(self.request('GET', '/v1/account', signed=True),
                                                  current_scope(),
                                                  self.request('GET', '/v1/markets', signed=True))
        self._bind_account(info)
        keys, management_denied = scope
        if not management_denied:
            matches = [row for row in keys if isinstance(row, dict) and row.get('keyId') == self.key_id] if isinstance(keys, list) else []
            scopes = matches[0].get('scopes') if len(matches) == 1 else None
            if not isinstance(scopes, list) or 'trade' not in scopes:
                raise Rejected('Ondo Perps 当前 API Key 的 trade 权限未通过，未发送交易请求')
        pairs = (config.get('perps') or {}).get('tradingPairs') if isinstance(config, dict) else None
        if (not isinstance(pairs, list) or not pairs
                or any(not isinstance(row, dict) or not isinstance(row.get('market'), str) or not row['market'] for row in pairs)
                or len({row['market'] for row in pairs}) != len(pairs)):
            raise Rejected('Ondo Perps 当前账户的永续市场权限未确认')
        self._authorized_markets = {row['market']: row for row in pairs}
        self._permission_report = dict(
            account_id=self._account_id, account_verified=True, market_permissions_verified=True,
            trade_scope='unavailable' if management_denied else 'verified',
            trade_scope_verified=not management_denied,
            api_key_management='not_allowed' if management_denied else 'available',
            message=('账户身份与市场读取已通过；API Key 管理接口不允许访问，'
                     '无法只读自查 trade 权限；未发送真实交易，实际指令仍由交易所校验'
                     if management_denied else '当前 API Key 的 trade 权限及账户市场读取已通过'))
        self._permission_binding = binding
        self._permission_at = time.monotonic()
        return self.permission_report

    async def preflight(self):
        await self._trade_permission(force=True)
        await self.account()
        return self.permission_report

    async def book(self, market):
        row = await self.request('GET', '/v1/perps/depth', {'market': market['id'], 'depth': 20})
        try:
            if row['market'] != market['id'] or abs(epoch(row['time']) - self.now()) > 15:
                raise ValueError()
            result = {side: [(D(p), D(q)) for p, q in row[side]] for side in ('bids', 'asks')}
            if not all(result.values()) or any(not p.is_finite() or not q.is_finite() or min(p, q) <= 0
                                              for levels in result.values() for p, q in levels):
                raise ValueError()
            if result['bids'][0][0] >= result['asks'][0][0]:
                raise ValueError()
            return result
        except (KeyError, TypeError, ValueError, ArithmeticError):
            raise Rejected('Ondo Perps 盘口身份、时间或深度无效，未发送订单') from None

    async def open_orders(self, market):
        orders, cursor, seen = [], None, set()
        async with asyncio.timeout(self.READ_BUDGET):
            for _ in range(10):
                # The live endpoint enforces 1..500, despite the public OpenAPI
                # example still showing 1000. Use the accepted maximum and keep
                # following its opaque cursor; page size never proves completion.
                page = await self.request('GET', '/v1/perps/orders', {'market': market['id'],
                                          'limit': 500, 'cursor': cursor}, signed=True, envelope=True)
                rows = page.get('result')
                if not isinstance(rows, list):
                    raise Rejected('Ondo Perps 未完成订单列表不完整')
                for row in rows:
                    if row.get('market') != market['id']:
                        raise Rejected('Ondo Perps 返回其他市场订单，未确认本市场空单状态')
                    if row.get('status') not in self.ACTIVE | self.TERMINAL:
                        raise Rejected('Ondo Perps 存在未知订单状态，未确认本市场空单状态')
                    if row['status'] in self.ACTIVE:
                        orders.append(row)
                cursor = (page.get('pageInfo') or {}).get('nextCursor')
                if not cursor:
                    return orders
                if cursor in seen:
                    break
                seen.add(cursor)
        raise Rejected('Ondo Perps 订单分页未完整读取，未确认空单状态')

    async def set_leverage(self, market, leverage, notional):
        await self._trade_permission()
        row = self._authorized_markets.get(market['id']) or {}
        tiers = sorted(row.get('marginInfo') or [], key=lambda t: D(t['positionBracketUsd']))
        tier = next((t for t in tiers if D(notional) <= D(t['positionBracketUsd'])), None)
        if leverage != int(leverage) or leverage < 1 or tier is None or leverage > D(tier['maxLeverage']):
            raise Rejected('Ondo Perps 当前账户名义额档位不支持所选杠杆')
        current = await self.request('GET', '/v1/perps/leverage', {'market': market['id']}, signed=True)
        if not isinstance(current, list):
            raise Rejected('Ondo Perps 杠杆读取结果不明')
        if not any(r.get('market') == market['id'] and D(r['leverage']) == leverage for r in current):
            await self.request('POST', '/v1/perps/leverage', payload={'market': market['id'],
                               'leverage': str(leverage)}, signed=True)
        confirmed = await self.request('GET', '/v1/perps/leverage', {'market': market['id']}, signed=True)
        if not isinstance(confirmed, list) or not any(r.get('market') == market['id'] and D(r['leverage']) == leverage for r in confirmed):
            raise Rejected('Ondo Perps 杠杆未读回确认，未开仓')

    @staticmethod
    def cid(order):
        # Stable across process restart; allowed charset and <=64 characters.
        return 'wh_' + hashlib.sha256(order['client_id'].encode()).hexdigest()[:56]

    def _order_identity(self, row, order, market):
        try:
            if (not isinstance(row, dict) or not row.get('orderId')
                    or row.get('market') != market['id'] or row.get('side') != order['side'].lower()
                    or row.get('type') != 'limit'
                    or D(row['size']) != D(order['quantity'])
                    or row.get('clientOrderId', self.cid(order)) != self.cid(order)
                    or ('reduceOnly' in row and row['reduceOnly'] is not bool(order['reduce_only']))):
                raise ValueError()
            price = D(row['price'])
            if not price.is_finite() or price <= 0 or ('price' in order and price != D(order['price'])):
                raise ValueError()
            filled = D(row['filledSize'])
            cost = D(row['filledCost'])
            if not filled.is_finite() or not cost.is_finite() or not 0 <= filled <= D(order['quantity']) or cost < 0:
                raise ValueError()
            return row
        except (KeyError, ValueError, TypeError, ArithmeticError):
            raise Unknown('Ondo Perps 客户订单身份或成交数量不符，继续保留未确认订单') from None

    async def submit(self, order, market, price):
        quantity, price = D(order['quantity']), D(price)
        if (not quantity.is_finite() or not price.is_finite() or min(quantity, price) <= 0
                or quantize(quantity, market['step']) != quantity or quantize(price, market['tick']) != price
                or quantity > D(market['maximum']) or order['side'] not in ('BUY', 'SELL')):
            raise Rejected('Ondo Perps 订单数量或价格不符合官方市场精度')
        if not order['reduce_only']:
            await self._trade_permission()
            config = self._authorized_markets.get(market['id'])
            if not config or config.get('disabled') or config.get('reduceOnly') or config.get('tradingState', 'TRADING') != 'TRADING':
                raise Rejected('Ondo Perps 当前账户无此市场开仓权限')
            # Public contracts are read again at execution, not borrowed from
            # the UI funding snapshot. isClosed describes the underlying's
            # trading hours, not whether the perpetual itself accepts orders.
            contracts = await self.request('GET', '/v1/perps/contracts', {'sparkline': False})
            contract = next((r for r in contracts if r.get('market') == market['id']), None) if isinstance(contracts, list) else None
            if not contract or contract.get('disabled') or contract.get('reduceOnly'):
                raise Rejected('Ondo Perps 永续市场已暂停或仅允许减仓，未开新仓；减仓仍可执行')
            try:
                cap = D(config['maxPositionBaseSize'])
                if not cap.is_finite() or cap <= 0 or quantity > cap:
                    raise ValueError()
            except (KeyError, TypeError, ValueError, ArithmeticError):
                raise Rejected('Ondo Perps 当前账户开仓数量上限未确认或已超限') from None
        maker = order.get('execution') == 'maker'
        wire = dict(market=market['id'], side=order['side'].lower(), type='limit',
                    size=decimal_text(quantity), price=decimal_text(price), clientOrderId=self.cid(order),
                    reduceOnly=bool(order['reduce_only']), timeInForce='GTC' if maker else 'IOC', postOnly=maker)
        # No user-selectable self-match prevention override exists in the
        # official schema. Exchange self-trade protection is never disabled.
        row = await self.request('POST', '/v1/perps/orders', payload=wire, signed=True)
        return self._order_identity(row, order, market)

    async def raw_order(self, order, market):
        try:
            row = await self.request('GET', '/v1/perps/orders/client:' + quote(self.cid(order), safe=''), signed=True)
        except Rejected as error:
            if error.code == 'order_not_found':
                return None
            raise
        return self._order_identity(row, order, market)

    async def lookup(self, order, market):
        row = await self.raw_order(order, market)
        if not row or row.get('status') not in self.TERMINAL:
            return None
        filled, cost = D(row['filledSize']), D(row['filledCost'])
        if row['status'] == 'fullyfilled' and filled != D(order['quantity']):
            return None
        if (filled == 0) != (cost == 0):
            return None
        if filled:
            fills = await self.request('GET', '/v1/perps/orders/client:' + quote(self.cid(order), safe='') + '/fills', signed=True)
            if not isinstance(fills, list):
                return None
            found = {}
            try:
                for fill in fills:
                    if (not fill.get('id') or fill.get('orderId') != row['orderId'] or fill.get('market') != market['id']
                            or fill.get('side') != order['side'].lower()
                            or fill.get('clientOrderId', self.cid(order)) != self.cid(order)):
                        return None
                    if fill['id'] in found and found[fill['id']] != fill:
                        return None
                    if not all(D(fill[k]).is_finite() and D(fill[k]) > 0 for k in ('size', 'filledCost')):
                        return None
                    found[fill['id']] = fill
                if sum((D(f['size']) for f in found.values()), D(0)) != filled or sum((D(f['filledCost']) for f in found.values()), D(0)) != cost:
                    return None
            except (KeyError, ValueError, TypeError, ArithmeticError):
                return None
        fee = None
        if row.get('fee') not in (None, ''):
            try:
                amount = D(row['fee']) - D(row.get('feeRebate') or 0)
                if amount.is_finite():
                    fee = str(amount)
            except (ValueError, TypeError, ArithmeticError):
                pass
        return dict(filled=str(filled), quote=str(cost), exchange_id=row['orderId'], fee=fee)

    async def status(self, order, market):
        row = await self.raw_order(order, market)
        if not row:
            return dict(status='NEW', executedQty='0')
        return dict(status={'fullyfilled': 'FILLED', 'canceled': 'CANCELED'}.get(row.get('status'), 'NEW'),
                    executedQty=row['filledSize'])

    async def cancel(self, order, market):
        row = await self.raw_order(order, market)
        if not row:
            raise Unknown('Ondo Perps 原订单尚未找到，撤单结果待核实')
        if row.get('status') in self.TERMINAL:
            return
        try:
            await self.request('DELETE', '/v1/perps/orders/client:' + quote(self.cid(order), safe=''), signed=True)
        except Rejected as error:
            if error.code not in ('order_already_cancelled', 'order_not_in_cancellable_state', 'order_already_filled'):
                raise
        # A cancellation acknowledgement cannot undo fills. Let the executor
        # confirm terminal fills before sending the hedge or any rescue leg.
        row = await self.raw_order(order, market)
        if not row or row.get('status') not in self.TERMINAL:
            raise Unknown('Ondo Perps 撤单后尚未确认终态，禁止继续对冲或重发')

    async def fees(self, order, market):
        row = await self.lookup(order, market)
        return row.get('fee') if row and D(row['filled']) == D(order['filled']) else None


# Keep a concise import available for scripts while the application factory
# uses the explicit venue name.
Ondoperps = OndoperpsVenue
