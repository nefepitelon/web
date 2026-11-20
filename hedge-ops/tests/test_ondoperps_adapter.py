"""Official Ondo schema fixtures, with no stored keys or live trading requests."""
import asyncio
from email.utils import formatdate
import hashlib
import hmac
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parents[1]))
from paired_hedge.ondo import OndoperpsVenue
from binance_lighter.venues import D, Rejected, Unknown


def settings(prefix='ONDOPERPS'):
    return SimpleNamespace(values={prefix+'_API_KEY_ID': 'ondoKeyId_TEST-key',
                                   prefix+'_API_SECRET': 'ondoApiSecret_TEXT-secret'})


def market():
    return dict(id='SNDK-USD.P', step='.001', minimum='.001', maximum='10000', tick='.1',
                max_leverage=5, notional='0')


def config():
    return dict(perps=dict(tradingPairs=[dict(market='SNDK-USD.P', pair=dict(base='SNDK', quote='USD'),
                     baseIncrement='.001', quoteIncrement='.1', maxPositionBaseSize='10000',
                     marginInfo=[dict(positionBracketUsd='100000', maxLeverage='5')],
                     tradingState='TRADING', fundingIntervalDivisions=8)]))


def info(identity='account-1'):
    return dict(accountID=identity, accountState='open', disabledFunctionality=dict(disablePerps=False))


def prime_permission(a):
    a._permission_at=time.monotonic()
    a._permission_binding=(a.key_id,a.secret)
    a._permission_report=dict(trade_scope='verified',trade_scope_verified=True)
    a._authorized_markets={market()['id']:config()['perps']['tradingPairs'][0]}


def order(**overrides):
    return dict(client_id='persisted:intent/123', quantity='.03', side='BUY', reduce_only=False,
                at=time.time(), execution='ioc', **overrides)


def receipt(a, o, **changes):
    return dict(orderId='exchange-order-1', clientOrderId=a.cid(o), market='SNDK-USD.P', side='buy',
                size='.03', filledSize='.03', filledCost='3', fee='.002', feeRebate='.0005',
                status='fullyfilled', reduceOnly=False, type='limit', price='100', **changes)


def fill(**changes):
    r=dict(id='fill-1', orderId='exchange-order-1', market='SNDK-USD.P', side='buy',
           size='.03', filledCost='3', price='100', fee='.002')
    r.update(changes)
    return r


async def mock_clients(a, handler):
    await a.client.aclose()
    await a.private_client.aclose()
    a.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    a.private_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))


def reply(result=None, status=200, **extra):
    return httpx.Response(status, json=dict(success=status == 200, result=result, **extra),
                          headers={'date': formatdate(usegmt=True)})


@pytest.mark.asyncio
async def test_hmac_signs_full_prefixed_secret_exact_query_and_json_once():
    a=OndoperpsVenue(settings());seen=[]
    async def handler(r):
        seen.append(r)
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/perps/contracts':return reply([dict(market=market()['id'],isClosed=False)])
        assert r.headers['ondo-key-id']=='ondoKeyId_TEST-key'
        stamp=r.headers['ondo-timestamp']
        wire=stamp+r.method+r.url.raw_path.decode()+r.content.decode()
        expected=hmac.new(b'ondoApiSecret_TEXT-secret',wire.encode(),hashlib.sha256).hexdigest()
        assert r.headers['ondo-sign']==expected
        assert -1500 <= int(stamp)-int(time.time()*1000) <= 1000
        if r.method=='POST':
            assert r.content==b'{"market":"SNDK-USD.P","leverage":"3"}'
            return reply()
        assert r.url.raw_path.decode()=='/v1/perps/orders?market=SNDK-USD.P&cursor=a%2Bb%3D'
        return reply([])
    await mock_clients(a,handler)
    try:
        await a.request('GET','/v1/perps/orders',{'market':'SNDK-USD.P','cursor':'a+b='},signed=True)
        await a.request('POST','/v1/perps/leverage',payload={'market':'SNDK-USD.P','leverage':'3'},signed=True)
        assert len(seen)==3
    finally:await a.close()


@pytest.mark.asyncio
async def test_a_b_credentials_and_transports_do_not_fall_back_to_other_account():
    s=settings('ONDOPERPS_A');s.values.update(settings('ONDOPERPS_B').values)
    s.values['ONDOPERPS_B_API_KEY_ID']='ondoKeyId_B'
    a=OndoperpsVenue(s,'ondoperps_a','ONDOPERPS_A');b=OndoperpsVenue(s,'ondoperps_b','ONDOPERPS_B')
    try:
        assert a.key_id!=b.key_id and a.client is not b.client and a.private_client is not b.private_client
        assert a.client is not a.private_client
        assert a.secret=='ondoApiSecret_TEXT-secret'
        del s.values['ONDOPERPS_B_API_SECRET']
        with pytest.raises(Rejected,match='ONDOPERPS_B_API_SECRET'):b._credentials()
    finally:await asyncio.gather(a.close(),b.close())


@pytest.mark.asyncio
@pytest.mark.parametrize('failure',['timeout','server','collision','malformed'])
async def test_no_write_replay_and_unknown_receipt_recovers_by_original_client_id(failure):
    a=OndoperpsVenue(settings());o=order();seen=[]
    prime_permission(a)
    async def handler(r):
        seen.append(r)
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/perps/contracts':return reply([dict(market=market()['id'],isClosed=False)])
        if r.method=='POST':
            wire=json.loads(r.content);assert wire['clientOrderId']==a.cid(o)
            if failure=='timeout':raise httpx.ReadTimeout('simulated accepted write, lost response')
            if failure=='server':return reply(status=503)
            if failure=='collision':return reply(status=400,error_code='clientOrderID_collision')
            return httpx.Response(200,text='not json')
        if r.url.path.endswith('/fills'):return reply([fill()])
        assert r.url.path.endswith('/client:'+a.cid(o))
        return reply(receipt(a,o))
    await mock_clients(a,handler)
    # Preserve MockTransport on a deliberate pool recovery after transport loss.
    a._client=lambda:httpx.AsyncClient(transport=httpx.MockTransport(handler))
    try:
        with pytest.raises(Unknown):await a.submit(o,market(),D('100'))
        result=await a.lookup(o,market())
        assert result==dict(filled='0.03',quote='3',exchange_id='exchange-order-1',fee='0.0015')
        assert len([r for r in seen if r.method=='POST'])==1
        assert a.cid(o)==OndoperpsVenue.cid(o) and len(a.cid(o))<=64
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('execution,reduce_only',[('maker',False),('ioc',False),('ioc',True)])
async def test_official_limit_price_ioc_post_only_reduce_only_fields(execution,reduce_only):
    a=OndoperpsVenue(settings());o=order();o.update(execution=execution,reduce_only=reduce_only)
    prime_permission(a)
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/perps/contracts':return reply([dict(market=market()['id'],isClosed=False)])
        wire=json.loads(r.content)
        assert wire['price']=='100' and 'limit' not in wire and wire['type']=='limit'
        assert wire['timeInForce']==('GTC' if execution=='maker' else 'IOC')
        assert wire['postOnly'] is (execution=='maker') and wire['reduceOnly'] is reduce_only
        assert 'selfTradePrevention' not in wire
        row=receipt(a,o);row['reduceOnly']=reduce_only
        return reply(row)
    await mock_clients(a,handler)
    try:await a.submit(o,market(),D('100'))
    finally:await a.close()


@pytest.mark.asyncio
async def test_permission_matches_exact_current_key_and_account_identity_not_wallet():
    a=OndoperpsVenue(settings());trade=False;identity='account-1'
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/account':return reply({**info(identity), 'identifier':'same-wallet'})
        if r.url.path=='/v1/api_keys':return reply([dict(keyId='ondoKeyId_OTHER',scopes=['trade']),
                                                   dict(keyId=a.key_id,scopes=['trade'] if trade else [])])
        if r.url.path=='/v1/markets':return reply(config())
        raise AssertionError('No trading request should be made')
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected,match='trade'):await a.submit(order(),market(),D('100'))
        trade=True;await a._trade_permission(force=True)
        assert await a.identity()=='account-1'
        identity='account-2'
        with pytest.raises(Rejected,match='账户发生变化'):await a.identity()
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('prefix,account_id',[('ONDOPERPS_A','actual-account-a'),('ONDOPERPS_B','actual-account-b')])
async def test_trade_key_without_key_management_can_preflight_with_honest_scope_report(prefix,account_id):
    a=OndoperpsVenue(settings(prefix),prefix=prefix);seen=[]
    async def handler(r):
        seen.append(r)
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        assert r.method=='GET' and r.headers['ONDO-KEY-ID']==a.key_id
        if r.url.path=='/v1/api_keys':return reply(status=403,error_code='key_not_allowed_for_action')
        if r.url.path=='/v1/account':return reply(info(account_id))
        if r.url.path=='/v1/markets':return reply(config())
        if r.url.path=='/v1/perps/balance':return reply(dict(marginBalance='100',availableMargin='80',
                                                            unrealizedPnl='0',underLiquidation=False))
        if r.url.path=='/v1/perps/positions':return reply([])
        raise AssertionError(r.url.path)
    await mock_clients(a,handler)
    try:
        report=await a.preflight()
        assert report['account_id']==account_id and report['account_verified'] is True
        assert report['market_permissions_verified'] is True and report['trade_scope']=='unavailable'
        assert report['trade_scope_verified'] is False and report['api_key_management']=='not_allowed'
        assert '无法只读自查 trade' in report['message'] and '未发送真实交易' in report['message']
        assert all(r.method=='GET' for r in seen)
        assert a.key_id not in json.dumps(report) and a.secret not in json.dumps(report)
        report['trade_scope_verified']=True
        assert a.permission_report['trade_scope_verified'] is False
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('path,status,code',[
    ('/v1/api_keys',403,'key_doesnt_have_scope'),
    ('/v1/api_keys',403,'ip_not_permitted'),
    ('/v1/api_keys',403,'account_closed'),
    ('/v1/api_keys',403,'forbidden'),
    ('/v1/api_keys',401,'key_not_allowed_for_action'),
    ('/v1/api_keys',401,'signature_mismatch'),
    ('/v1/api_keys',401,'api_key_not_found'),
    ('/v1/account',403,'key_not_allowed_for_action'),
    ('/v1/markets',403,'key_not_allowed_for_action'),
])
async def test_optional_key_management_check_never_swallows_other_auth_denials(path,status,code):
    a=OndoperpsVenue(settings());seen=[]
    async def handler(r):
        seen.append(r)
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path==path:return reply(status=status,error_code=code)
        if r.url.path=='/v1/api_keys':return reply(status=403,error_code='key_not_allowed_for_action')
        if r.url.path=='/v1/account':return reply(info())
        if r.url.path=='/v1/markets':return reply(config())
        raise AssertionError(r.url.path)
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected) as error:await a._trade_permission(force=True)
        assert (error.value.endpoint,error.value.status,error.value.code)==(path,status,code)
        assert a.permission_report=={} and a._authorized_markets=={} and a._permission_at==0
        assert all(r.method=='GET' for r in seen)
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('operation,code',[('order','key_not_allowed_for_action'),
                                          ('order','key_doesnt_have_scope'),
                                          ('leverage','key_not_allowed_for_action'),
                                          ('leverage','key_doesnt_have_scope')])
async def test_real_trade_scope_denial_after_management_fallback_is_rejected_once(operation,code):
    a=OndoperpsVenue(settings());writes=[]
    path='/v1/perps/orders' if operation=='order' else '/v1/perps/leverage'
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.method=='POST':
            writes.append(r)
            assert r.url.path==path
            return reply(status=403,error_code=code)
        if r.url.path=='/v1/api_keys':return reply(status=403,error_code='key_not_allowed_for_action')
        if r.url.path=='/v1/account':return reply(info())
        if r.url.path=='/v1/markets':return reply(config())
        if r.url.path=='/v1/perps/contracts':return reply([dict(market=market()['id'],disabled=False,reduceOnly=False)])
        if r.url.path=='/v1/perps/leverage':return reply([dict(market=market()['id'],leverage='2')])
        raise AssertionError(r.url.path)
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected) as error:
            if operation=='order':await a.submit(order(),market(),D(100))
            else:await a.set_leverage(market(),3,D(100))
        assert (error.value.endpoint,error.value.status,error.value.code)==(path,403,code)
        assert len(writes)==1 and a.permission_report['trade_scope_verified'] is False
    finally:await a.close()


@pytest.mark.asyncio
async def test_permission_refresh_replaces_verified_scope_and_key_change_cannot_reuse_cache():
    a=OndoperpsVenue(settings());mode='verified';key_reads=0;identity='account-1'
    async def handler(r):
        nonlocal key_reads
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/account':return reply(info(identity))
        if r.url.path=='/v1/markets':return reply(config())
        if r.url.path=='/v1/api_keys':
            key_reads+=1
            if mode=='unavailable':return reply(status=403,error_code='key_not_allowed_for_action')
            return reply([dict(keyId=a.key_id,scopes=['trade'])])
        raise AssertionError('No actual trading call is allowed')
    await mock_clients(a,handler)
    try:
        assert (await a._trade_permission())['trade_scope_verified'] is True
        mode='unavailable'
        assert (await a._trade_permission(force=True))['trade_scope_verified'] is False
        assert key_reads==2
        # Same credential generation may reuse the short proof; replacing either
        # half requires an authenticated recheck, including actual accountID.
        await a._trade_permission();assert key_reads==2
        a.settings.values['ONDOPERPS_API_SECRET']='ondoApiSecret_REPLACED'
        await a._trade_permission();assert key_reads==3
        a.settings.values['ONDOPERPS_API_KEY_ID']='ondoKeyId_REPLACED'
        identity='account-2'
        with pytest.raises(Rejected,match='账户发生变化'):await a._trade_permission()
        assert key_reads==4 and a.permission_report=={} and a._authorized_markets=={}
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('bad_scope',[None,[],['view'],'trade',['trade','transfer','trade']])
async def test_readable_key_list_must_prove_exact_key_trade_scope(bad_scope):
    a=OndoperpsVenue(settings())
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/account':return reply(info())
        if r.url.path=='/v1/markets':return reply(config())
        if r.url.path=='/v1/api_keys':
            rows=[dict(keyId='ondoKeyId_OTHER',scopes=['trade'])]
            if bad_scope is not None:
                rows.append(dict(keyId=a.key_id,scopes=bad_scope))
                if bad_scope==['trade','transfer','trade']:rows.append(dict(keyId=a.key_id,scopes=['trade']))
            return reply(rows)
        raise AssertionError('No actual trading call is allowed')
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected,match='trade 权限未通过'):await a._trade_permission()
        assert a.permission_report=={} and a._authorized_markets=={}
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('bad_account',['missing_id','disabled','perps_disabled'])
async def test_management_denial_never_bypasses_actual_account_identity_or_trading_state(bad_account):
    a=OndoperpsVenue(settings())
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/api_keys':return reply(status=403,error_code='key_not_allowed_for_action')
        if r.url.path=='/v1/markets':return reply(config())
        if r.url.path=='/v1/account':
            row=info()
            if bad_account=='missing_id':del row['accountID']
            if bad_account=='disabled':row['accountState']='disabled'
            if bad_account=='perps_disabled':row['disabledFunctionality']['disablePerps']=True
            return reply(row)
        raise AssertionError('No actual trading call is allowed')
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected):await a._trade_permission()
        assert a.permission_report=={} and a._authorized_markets=={}
    finally:await a.close()


@pytest.mark.asyncio
async def test_management_denial_does_not_replace_authenticated_market_restrictions_with_public_metadata():
    a=OndoperpsVenue(settings());signed_config=[];writes=[]
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.method!='GET':writes.append(r);raise AssertionError('Restricted market must not be traded')
        if r.url.path=='/v1/api_keys':return reply(status=403,error_code='key_not_allowed_for_action')
        if r.url.path=='/v1/account':return reply(info())
        if r.url.path=='/v1/markets':
            signed_config.append(r)
            assert r.headers['ONDO-KEY-ID']==a.key_id and r.headers['ONDO-SIGN']
            row=config();row['perps']['tradingPairs'][0]['tradingState']='DISABLED'
            return reply(row)
        raise AssertionError(r.url.path)
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected,match='开仓权限'):await a.submit(order(),market(),D(100))
        assert not writes and len(signed_config)==1
    finally:await a.close()


@pytest.mark.asyncio
async def test_account_is_independent_from_metadata_and_validates_unknown_fields():
    a=OndoperpsVenue(settings());bad=False
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/account':return reply(info())
        if r.url.path=='/v1/perps/balance':
            data=dict(marginBalance='100',availableMargin='80',unrealizedPnl='2',underLiquidation=False)
            if bad:del data['availableMargin']
            return reply(data)
        if r.url.path=='/v1/perps/positions':return reply([dict(market='SNDK-USD.P',direction='short',
            netQuantity='.03',markPrice='100',averageEntryPrice='99',liquidationPrice='150',unrealizedPnl='2',leverage='3')])
        raise AssertionError('Accounts must not fetch funding or metadata')
    await mock_clients(a,handler)
    try:
        result=await a.account()
        assert result['account_id']=='account-1' and result['positions']['SNDK-USD.P']['quantity']=='-0.03'
        assert result['positions']['SNDK-USD.P']['asset']=='SNDK'
        assert result['equity']=='100' and result['available']=='80'
        bad=True
        with pytest.raises(Rejected,match='未知持仓'):await a.account()
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('broken',['partial_history','wrong_identity','unknown_status','bad_total','nonterminal','wrong_price','wrong_type'])
async def test_fill_proof_never_substitutes_acknowledgement_or_partial_history(broken):
    a=OndoperpsVenue(settings());o=order();o['price']='100'
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path.endswith('/fills'):
            return reply([fill(size='.02' if broken=='partial_history' else '.03')])
        row=receipt(a,o)
        if broken=='wrong_identity':row['clientOrderId']='another-intent'
        if broken=='unknown_status':row['status']='new_future_status'
        if broken=='bad_total':row['filledCost']='4'
        if broken=='nonterminal':row['status']='open'
        if broken=='wrong_price':row['price']='101'
        if broken=='wrong_type':row['type']='market'
        return reply(row)
    await mock_clients(a,handler)
    try:
        if broken in ('wrong_identity','wrong_price','wrong_type'):
            with pytest.raises(Unknown,match='身份'):await a.lookup(o,market())
        else:assert await a.lookup(o,market()) is None
    finally:await a.close()


@pytest.mark.asyncio
async def test_cancel_targets_only_owned_client_and_confirms_terminal_remaining_fill():
    a=OndoperpsVenue(settings());o=order();seen=[];canceled=False
    async def handler(r):
        nonlocal canceled
        seen.append((r.method,r.url.path))
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        assert r.url.path.startswith('/v1/perps/orders/client:'+a.cid(o))
        if r.method=='DELETE':canceled=True;return reply()
        if r.url.path.endswith('/fills'):return reply([fill(size='.01',filledCost='1')])
        row=receipt(a,o);row.update(status='canceled' if canceled else 'open',filledSize='.01',filledCost='1')
        return reply(row)
    await mock_clients(a,handler)
    try:
        await a.cancel(o,market());result=await a.lookup(o,market())
        assert result['filled']=='0.01' and result['quote']=='1'
        assert len([r for r in seen if r[0]=='DELETE'])==1
    finally:await a.close()


@pytest.mark.asyncio
async def test_not_found_is_unknown_not_zero_fill_or_cancel_success():
    a=OndoperpsVenue(settings());o=order()
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        return reply(status=400,error_code='order_not_found')
    await mock_clients(a,handler)
    try:
        assert await a.lookup(o,market()) is None
        assert (await a.status(o,market()))['status']=='NEW'
        with pytest.raises(Unknown):await a.cancel(o,market())
    finally:await a.close()


@pytest.mark.asyncio
async def test_metadata_and_hourly_estimate_do_not_divide_smoothing_factor_eight():
    a=OndoperpsVenue(settings())
    async def handler(r):
        if r.url.path=='/v1/markets':return reply(config())
        if r.url.path=='/v1/perps/mark_prices':return reply({'SNDK-USD.P':dict(markPrice='100')})
        if r.url.path=='/v1/perps/contracts':return reply([dict(market='SNDK-USD.P',productType='perpetual',
            contractType='linear',baseCurrency='SNDK',quoteCurrency='USD',disabled=False,
            fundingRate='.4',nextFundingRate='.0000125',nextFundingRateTimestamp=
            time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(time.time()+1800)))])
        raise AssertionError(r.url.path)
    await mock_clients(a,handler)
    try:
        meta=await a.metadata();assert meta['SNDK']['id']=='SNDK-USD.P' and meta['SNDK']['max_leverage']==5
        funding=await a.funding()
        assert funding['SNDK']['rate']==D('.125') and funding['SNDK']['interval']==1
    finally:await a.close()


@pytest.mark.asyncio
async def test_leverage_verifies_authenticated_tier_and_reads_back():
    a=OndoperpsVenue(settings());value=2;writes=[]
    async def handler(r):
        nonlocal value
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/account':return reply(info())
        if r.url.path=='/v1/api_keys':return reply([dict(keyId=a.key_id,scopes=['trade'])])
        if r.url.path=='/v1/markets':return reply(config())
        if r.method=='POST':writes.append(r);value=int(json.loads(r.content)['leverage']);return reply()
        return reply([dict(market='SNDK-USD.P',leverage=str(value))])
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected,match='档位'):await a.set_leverage(market(),6,D(10))
        assert not writes
        await a.set_leverage(market(),3,D(10));assert len(writes)==1
        await a.set_leverage(market(),3,D(10));assert len(writes)==1
        with pytest.raises(Rejected,match='档位'):await a.set_leverage(market(),3,D(100001))
    finally:await a.close()


@pytest.mark.asyncio
async def test_read_budget_includes_waiting_clock_and_read_transport_recovers():
    a=OndoperpsVenue(settings());a.READ_BUDGET=.06;seen=[]
    async def slow(r):seen.append(r);await asyncio.sleep(1);return reply(info())
    await mock_clients(a,slow)
    a._client=lambda:httpx.AsyncClient(transport=httpx.MockTransport(slow))
    started=time.monotonic()
    try:
        with pytest.raises(Rejected,match='总时间预算'):await a.identity()
        assert time.monotonic()-started<.25
        assert all(r.method=='GET' for r in seen)
        async def healthy(r):return reply(info() if r.url.path=='/v1/account' else dict(marketStatus='open'))
        await mock_clients(a,healthy)
        assert await a.identity()=='account-1'
    finally:await a.close()


@pytest.mark.asyncio
async def test_signed_read_clock_error_resyncs_but_signed_write_never_replays():
    a=OndoperpsVenue(settings());gets=posts=probes=0
    async def handler(r):
        nonlocal gets,posts,probes
        if r.url.path=='/status':probes+=1;return reply(dict(marketStatus='open'))
        if r.method=='POST':posts+=1;return reply(status=401,error_code='timestamp_too_far')
        gets+=1
        if gets==1:return reply(status=401,error_code='timestamp_too_far')
        return reply(info())
    await mock_clients(a,handler)
    try:
        assert await a.identity()=='account-1' and probes==2 and gets==2
        with pytest.raises(Rejected,match='timestamp_too_far'):
            await a.request('POST','/v1/perps/leverage',payload={},signed=True)
        assert posts==1
    finally:await a.close()


@pytest.mark.asyncio
async def test_open_orders_reads_all_pages_including_pending_without_false_flat():
    a=OndoperpsVenue(settings());o=order();pages=[]
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        pages.append(dict(r.url.params));row=receipt(a,o)
        if not r.url.params.get('cursor'):
            return reply([row],pageInfo=dict(nextCursor='cursor+2='))
        assert r.url.params['cursor']=='cursor+2='
        row['status']='pending'
        return reply([row],pageInfo={})
    await mock_clients(a,handler)
    try:
        rows=await a.open_orders(market())
        assert len(pages)==2 and len(rows)==1 and rows[0]['status']=='pending'
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('first_page_size',[0,1,500])
async def test_orders_live_query_limit_and_cursor_find_active_order_after_history(first_page_size):
    a=OndoperpsVenue(settings());o=order();queries=[]
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        assert r.method=='GET' and r.url.path=='/v1/perps/orders'
        params=dict(r.url.params);queries.append(params)
        # Actual exchange validation, stricter than the stale OpenAPI example.
        limit=params.get('limit','')
        if not limit.isdigit() or not 1<=int(limit)<=500:
            return httpx.Response(400,json={'success':False,'error':'limit must be a number between 1 - 500'})
        assert params['limit']=='500' and params['market']==market()['id']
        assert set(params)<= {'market','limit','cursor'} and params.get('cursor') not in ('','None')
        target=r.url.raw_path.decode()
        assert r.headers['ONDO-SIGN']==a.signature(a.secret,r.headers['ONDO-TIMESTAMP'],'GET',target)
        if 'cursor' not in params:
            rows=[{**receipt(a,o),'orderId':f'history-{i}','status':'canceled'} for i in range(first_page_size)]
            return reply(rows,pageInfo=dict(nextCursor='next+page/2='))
        assert params['cursor']=='next+page/2=' and 'cursor=next%2Bpage%2F2%3D' in target
        return reply([{**receipt(a,o),'status':'pending','orderId':'still-active'}],pageInfo={})
    await mock_clients(a,handler)
    try:
        result=await a.open_orders(market())
        assert len(queries)==2 and len(result)==1 and result[0]['orderId']=='still-active'
        assert 'cursor' not in queries[0]
    finally:await a.close()


@pytest.mark.asyncio
async def test_orders_page_cap_never_returns_false_flat_when_history_is_incomplete():
    a=OndoperpsVenue(settings());pages=[]
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        assert r.method=='GET' and r.url.path=='/v1/perps/orders' and r.url.params['limit']=='500'
        pages.append(dict(r.url.params))
        return reply([],pageInfo=dict(nextCursor=f'page-{len(pages)+1}'))
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected,match='分页未完整'):await a.open_orders(market())
        assert len(pages)==10 and 'cursor' not in pages[0]
        assert pages[-1]['cursor']=='page-10'
    finally:await a.close()


@pytest.mark.asyncio
async def test_repeating_pagination_cursor_and_unknown_order_state_never_report_empty():
    a=OndoperpsVenue(settings());o=order();unknown=False
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        row=receipt(a,o)
        if unknown:row['status']='future_status'
        return reply([row],pageInfo=dict(nextCursor='same'))
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected,match='分页'):await a.open_orders(market())
        unknown=True
        with pytest.raises(Rejected,match='未知订单状态'):await a.open_orders(market())
    finally:await a.close()


@pytest.mark.asyncio
async def test_fresh_book_uses_server_clock_despite_bad_windows_wall_clock(monkeypatch):
    a=OndoperpsVenue(settings());real_now=time.time()
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        response=reply(dict(market='SNDK-USD.P',time=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(real_now)),
                            bids=[['99.9','1']],asks=[['100.1','1']]))
        response.headers['date']=formatdate(real_now,usegmt=True)
        return response
    await mock_clients(a,handler)
    try:
        await a.request('GET','/status')
        monkeypatch.setattr('paired_hedge.ondo.time.time',lambda:real_now+86400)
        book=await a.book(market())
        assert book['bids'][0][0]==D('99.9')
    finally:await a.close()


@pytest.mark.asyncio
async def test_cancel_acknowledgement_with_still_live_order_remains_unknown():
    a=OndoperpsVenue(settings());o=order();writes=[]
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.method=='DELETE':writes.append(r);return reply()
        row=receipt(a,o);row.update(status='open',filledSize='0',filledCost='0')
        return reply(row)
    await mock_clients(a,handler)
    try:
        with pytest.raises(Unknown,match='终态'):await a.cancel(o,market())
        assert len(writes)==1
        assert await a.lookup(o,market()) is None
    finally:await a.close()


@pytest.mark.asyncio
async def test_bad_size_and_authenticated_size_cap_reject_before_post():
    a=OndoperpsVenue(settings());o=order();calls=[]
    prime_permission(a)
    a._authorized_markets[market()['id']]['maxPositionBaseSize']='.01'
    async def handler(r):
        calls.append(r)
        assert r.url.path=='/v1/perps/contracts' and r.method=='GET'
        return reply([dict(market=market()['id'],isClosed=False)])
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected,match='数量上限'):await a.submit(o,market(),D(100))
        o['quantity']='.0001'
        with pytest.raises(Rejected,match='精度'):await a.submit(o,market(),D(100))
        assert not any(r.method!='GET' for r in calls)
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('payload',[{'success':True}, {'success':True,'result':{}},
                                  {'success':True,'result':{'orderId':'incomplete'}},
                                  {'result':{'orderId':'no-acceptance-proof'}}])
async def test_http_200_missing_acceptance_or_order_identity_stays_unknown(payload):
    a=OndoperpsVenue(settings());o=order();writes=[]
    prime_permission(a)
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/perps/contracts':return reply([dict(market=market()['id'],isClosed=False)])
        writes.append(r);return httpx.Response(200,json=payload)
    await mock_clients(a,handler)
    try:
        with pytest.raises(Unknown):await a.submit(o,market(),D(100))
        assert len(writes)==1
    finally:await a.close()


@pytest.mark.asyncio
async def test_clock_failure_happens_before_any_signed_write():
    a=OndoperpsVenue(settings());seen=[]
    async def handler(r):
        seen.append(r)
        return reply(status=503)
    await mock_clients(a,handler)
    try:
        with pytest.raises(Rejected):await a.request('POST','/v1/perps/orders',payload={},signed=True)
        assert seen and all(r.method=='GET' and r.url.path=='/status' for r in seen)
    finally:await a.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('state',['underlying_closed','disabled','reduce_only'])
async def test_real_perpetual_state_blocks_open_but_not_reduce_only(state):
    a=OndoperpsVenue(settings());o=order();writes=[]
    prime_permission(a)
    async def handler(r):
        if r.url.path=='/status':return reply(dict(marketStatus='open'))
        if r.url.path=='/v1/perps/contracts':return reply([dict(market=market()['id'],
                   isClosed=state=='underlying_closed',disabled=state=='disabled',reduceOnly=state=='reduce_only')])
        writes.append(r);row=receipt(a,o);row['reduceOnly']=o['reduce_only'];return reply(row)
    await mock_clients(a,handler)
    try:
        if state=='underlying_closed':await a.submit(o,market(),D(100))
        else:
            with pytest.raises(Rejected,match='永续市场'):await a.submit(o,market(),D(100))
            assert not writes
        o['reduce_only']=True
        await a.submit(o,market(),D(100))
        assert len(writes)==(2 if state=='underlying_closed' else 1)
    finally:await a.close()
