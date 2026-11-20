import time
"""Official response shapes and execution failure boundaries; no live transactions."""
import json
from types import SimpleNamespace as NS
import httpx
import pytest
from test_binance_lighter import settings, fixture, FakeVenues, MARKET
from binance_lighter.venues import Venues, Rejected, Unknown, D
from binance_lighter.api import create_app
from binance_lighter.engine import Engine
from binance_lighter.store import Store


@pytest.mark.asyncio
async def test_restored_task_market_does_not_hide_other_common_markets(tmp_path):
    s=settings(tmp_path);store=Store(tmp_path/'hedge.db');store.put({'asset':'BTC','market':MARKET})
    engine=Engine(s,store);v=engine.venues;calls=[]
    async def request(venue,path,params=None,**kw):
        calls.append(path)
        if path.endswith('/time'):return {'serverTime':1234567890000}
        if path.endswith('/exchangeInfo'):
            return {'symbols':[{'baseAsset':a,'symbol':a+'USDT','status':'TRADING','contractType':'PERPETUAL','quoteAsset':'USDT','filters':[{'filterType':'LOT_SIZE','stepSize':'.001','minQty':'.001','maxQty':'1000'},{'filterType':'PRICE_FILTER','tickSize':'.1'},{'filterType':'MIN_NOTIONAL','notional':'5'}]} for a in ['BTC','ETH']]}
        if path.endswith('/orderBooks'):
            return {'order_books':[{'symbol':a,'market_id':i,'market_type':'perp','status':'active','supported_size_decimals':3,'supported_price_decimals':1,'min_base_amount':'.001','min_quote_amount':'5'} for i,a in enumerate(['BTC','ETH'],1)]}
        if path.endswith('/premiumIndex'):return [{'symbol':a+'USDT','lastFundingRate':'.0001','markPrice':'100','nextFundingTime':1} for a in ['BTC','ETH']]
        if path.endswith('/fundingInfo'):return []
        if path.endswith('/funding-rates'):return {'funding_rates':[{'market_id':i,'exchange':'lighter','rate':'.0002'} for i in [1,2]]}
        raise AssertionError(path)
    async def limits():pass
    v.request=request;v.leverage_limits=limits
    try:
        assert set(v.markets)=={'BTC'} and v.markets_from_tasks
        assert {r['asset'] for r in await v.funding()}=={'BTC','ETH'}
        assert not v.markets_from_tasks
        assert calls.count('/fapi/v1/exchangeInfo')==1
        await v.funding();assert calls.count('/fapi/v1/exchangeInfo')==1
    finally:await v.close();store.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('method,expected',[('GET',3),('POST',1)])
async def test_clock_window_read_resync_is_bounded_and_never_replays_writes(tmp_path,method,expected):
    v=Venues(settings(tmp_path));calls=[]
    def handler(request):
        calls.append(request)
        if request.url.path.endswith('/time'):return httpx.Response(200,json={'serverTime':1234567890000})
        if len(calls)==1 or method=='POST':return httpx.Response(400,json={'code':-1021})
        return httpx.Response(200,json={'ok':True})
    v.clock_anchor=(1234000000000,time.monotonic());await v.clients['binance'].aclose()
    v.clients['binance']=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    try:
        if method=='POST':
            with pytest.raises(Rejected):await v.request('binance','/fapi/v1/accountConfig',{'symbol':'BTCUSDT'},signed=True,method=method)
        else:
            assert await v.request('binance','/fapi/v1/accountConfig',{'symbol':'BTCUSDT'},signed=True)=={'ok':True}
            assert calls[0].url.params['signature']!=calls[-1].url.params['signature']
            assert calls[-1].url.params['symbol']=='BTCUSDT'
        assert len(calls)==expected
    finally:await v.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('permission',[True,False,None])
async def test_v3_omits_permission_authoritative_config_controls_trading(tmp_path,permission):
    v=Venues(settings(tmp_path));calls=[]
    async def request(venue,path,params=None,**kw):
        calls.append(path)
        if path.endswith('/account'): return {'assets':[{'asset':'USDT','availableBalance':'100'}]}
        if path.endswith('/accountConfig'):return {'canTrade':permission,'dualSidePosition':False,'multiAssetsMargin':False}
        if path.endswith('/symbolConfig'):return [{'symbol':'BTCUSDT','leverage':5}]
        if path.endswith('/positionRisk'):return [{'symbol':'BTCUSDT','positionAmt':'0','positionSide':'BOTH'}]
        raise AssertionError(path)
    async def lighter():return {'available_balance':'100'},{}
    v.request=request;v.lighter_account=lighter
    try:
        if permission is True:
            accounts=await v.accounts()
            assert accounts['binance']['canTrade'] is True
            assert accounts['binance_positions']['BTCUSDT']['leverage']==5
            assert accounts['binance']['permissionSource']=='/fapi/v1/accountConfig'
        else:
            with pytest.raises(Rejected,match='canTrade=false' if permission is False else '未确认'):await v.accounts()
        assert '/fapi/v1/accountConfig' in calls
        assert '/fapi/v1/positionSide/dual' not in calls
    finally:await v.close()


async def limits_venue(root):
    v=Venues(settings(root));v.markets={'BTC':dict(MARKET)}
    async def request(venue,path,params=None,**kw):
        if path.endswith('leverageBracket'):return [{'symbol':'BTCUSDT','brackets':[{'initialLeverage':25,'notionalFloor':0,'notionalCap':200},{'initialLeverage':10,'notionalFloor':200,'notionalCap':10000}]}]
        if path.endswith('orderBookDetails'):return {'order_book_details':[{'market_id':1,'min_initial_margin_fraction':500,'default_initial_margin_fraction':1000,'maintenance_margin_fraction':100}]}
        raise AssertionError(path)
    v.request=request;await v.leverage_limits()
    return v


@pytest.mark.asyncio
async def test_real_brackets_and_margin_ticks_populate_both_ceiling_sources(tmp_path):
    v=await limits_venue(tmp_path)
    try:
        m=v.markets['BTC'];assert m['binance_max_leverage']==25 and m['lighter_max_leverage']==20
        assert min(m['binance_max_leverage'],m['lighter_max_leverage'])==20
        assert v.lighter_fraction({'initial_margin_fraction':'5.00'},m)==500
    finally:await v.close()


@pytest.mark.asyncio
async def test_leverage_above_notional_tier_rejected_before_any_setting_write(tmp_path):
    v=await limits_venue(tmp_path)
    try:
        with pytest.raises(Rejected,match='名义额档位'):await v.prepare_leverage(v.markets['BTC'],15,D(300),{})
    finally:await v.close()


@pytest.mark.asyncio
async def test_both_leverage_settings_are_read_back_before_orders(tmp_path):
    v=await limits_venue(tmp_path);original=v.request;calls=[]
    async def request(venue,path,params=None,**kw):
        if path.endswith('symbolConfig'):return [{'symbol':'BTCUSDT','leverage':5}]
        if path.endswith('/leverage'):
            calls.append(('binance',params['leverage']));return {'leverage':5}
        return await original(venue,path,params,**kw)
    class Signer:
        CROSS_MARGIN_MODE=0
        async def update_leverage(self,**kw):calls.append(('lighter',kw));return None,NS(code=200),None
        async def close(self):pass
    async def lighter():return {},{1:{'initial_margin_fraction':'20.00'}}
    v.request=request;v.signer=Signer();v.lighter_account=lighter
    accounts={'binance':{'symbolConfig':{'BTCUSDT':{'leverage':2}}},'lighter_positions':{1:{'initial_margin_fraction':'10.00','margin_mode':0}}}
    try:
        await v.prepare_leverage(v.markets['BTC'],5,D(30),accounts)
        assert calls[0]==('binance',5)
        assert calls[1][1]['leverage']==5 and calls[1][1]['api_key_index']==4
    finally:await v.close()


@pytest.mark.asyncio
async def test_unknown_leverage_ack_cannot_reach_an_open_order(tmp_path):
    e,s,v=fixture(tmp_path);task=s.get('BTC');task['leverage']=5;s.put(task)
    async def prepare(*args):raise Rejected('双所杠杆尚未同步到目标值')
    v.prepare_leverage=prepare
    try:
        await e.cycle();assert not v.submissions and s.get('BTC')['phase']=='IDLE'
        assert '杠杆' in s.get('BTC')['error']
    finally:s.close()


@pytest.mark.asyncio
async def test_spread_sort_uses_sum_of_bid_ask_widths_unknown_last(tmp_path):
    v=Venues(settings(tmp_path));v.markets={a:{**MARKET,'asset':a,'symbol':a+'USDT','market_id':i} for i,a in enumerate(['WIDE','NARROW','UNKNOWN'])}
    async def request(venue,path,params=None,**kw):
        if venue=='binance':return [{'symbol':a+'USDT','bidPrice':'100','askPrice':'101' if a=='WIDE' else '100.1'} for a in v.markets]
        if params['market_id']==2:raise Rejected('unavailable')
        return {'bids':[{'price':'100'}],'asks':[{'price':'100.1'}]}
    v.request=request
    try:
        rows=(await v.spreads())['assets'];assert [r['asset'] for r in rows]==['NARROW','WIDE','UNKNOWN']
        assert rows[0]['total_bps']==rows[0]['binance_bps']+rows[0]['lighter_bps']
        assert rows[-1]['total_bps'] is None
    finally:await v.close()


def maker_fixture(root):
    e,s,v=fixture(root);task=s.get('BTC');task.update(order_type='binance_maker',maker_wait_seconds=5);s.put(task)
    submit=v.submit;v.events=[];v.maker_order=None;v.maker_fill=D('.2');v.lost=False
    async def send(order,market,price):
        if order.get('execution')!='maker':v.events.append('hedge' if not order['reduce_only'] else 'rescue');return await submit(order,market,price)
        v.maker_order=order.copy();v.submissions.append(order.copy());v.events.append('maker')
        if v.lost:raise Unknown('lost maker acknowledgement')
        return {'accepted':True}
    async def price(market,side):return D(100)
    async def status(order,market):
        v.positions_now['binance']=v.maker_fill
        if v.maker_fill==0:order['deadline']=0
        return {'status':'PARTIALLY_FILLED' if v.maker_fill else 'NEW','executedQty':str(v.maker_fill)}
    async def cancel(order,market):
        assert order['client_id']==v.maker_order['client_id'];v.events.append('cancel')
        v.results[order['client_id']]={'filled':str(v.maker_fill),'quote':str(v.maker_fill*100),'exchange_id':order['client_id'],'fee':None}
    v.submit=send;v.maker_price=price;v.maker_status=status;v.cancel_owned=cancel
    return e,s,v


@pytest.mark.asyncio
async def test_maker_partial_fill_cancels_remainder_before_hedging_exact_quantity(tmp_path):
    e,s,v=maker_fixture(tmp_path)
    try:
        await e.cycle()
        assert v.events==['maker','cancel','hedge']
        assert v.positions_now=={'binance':D('.2'),'lighter':D('-.2')}
        assert s.get('BTC')['phase']=='OPEN' and D(v.submissions[1]['quantity'])==D('.2')
    finally:s.close()


@pytest.mark.asyncio
async def test_maker_timeout_zero_fill_cancels_without_hedge(tmp_path):
    e,s,v=maker_fixture(tmp_path);v.maker_fill=D(0)
    try:
        await e.cycle();assert v.events==['maker','cancel']
        assert s.get('BTC')['phase']=='IDLE' and not any(v.positions_now.values())
    finally:s.close()


@pytest.mark.asyncio
async def test_maker_lost_ack_restart_cancels_original_id_never_resends(tmp_path):
    e,s,v=maker_fixture(tmp_path);v.lost=True;v.maker_fill=D(0)
    try:
        await e.cycle();assert s.get('BTC')['phase']=='REVIEW'
        await e.cycle();assert len(v.submissions)==1 and v.events==['maker','cancel']
        assert s.get('BTC')['phase']=='IDLE' and not s.get('BTC')['enabled']
    finally:s.close()


@pytest.mark.asyncio
async def test_emergency_during_partial_maker_cancels_and_only_reduces(tmp_path):
    e,s,v=maker_fixture(tmp_path);original=v.maker_status
    async def status(*args):s.meta('emergency_stop','1');return await original(*args)
    v.maker_status=status
    try:
        await e.cycle();assert v.events==['maker','cancel','rescue']
        assert v.submissions[-1]['reduce_only'] and not any(v.positions_now.values())
    finally:s.close()


@pytest.mark.asyncio
async def test_native_post_only_and_test_order_never_use_real_market_endpoint(tmp_path):
    v=Venues(settings(tmp_path));calls=[];v.clock_anchor=(1234000000000,time.monotonic());await v.clients['binance'].aclose()
    def respond(request):
        calls.append(request)
        if request.url.path.endswith('/test'):return httpx.Response(200,json={})
        assert request.url.params['timeInForce']=='GTX'
        assert request.url.params['newOrderRespType']=='ACK'
        return httpx.Response(200,json={'orderId':1})
    v.clients['binance']=httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        await v.test_order(MARKET,D('.3'),D(100));assert len(calls)==1 and calls[0].url.path=='/fapi/v1/order/test'
        await v.submit({'venue':'binance','side':'BUY','quantity':'.3','reduce_only':False,'client_id':'wh-maker','execution':'maker'},MARKET,D(100))
    finally:await v.close()


@pytest.mark.asyncio
async def test_task_settings_persist_toggle_edit_and_validate(tmp_path,monkeypatch):
    import binance_lighter.engine as module
    monkeypatch.setattr(module,'Venues',FakeVenues);app=create_app(settings(tmp_path))
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://engine') as c:
            body={'asset':'BTC','leverage':5,'order_type':'binance_maker','maker_wait_seconds':10}
            r=await c.post('/api/tasks',json=body);assert r.status_code==200 and r.json()['leverage']==5
            r=await c.post('/api/tasks',json={'asset':'BTC','enabled':True});assert r.json()['order_type']=='binance_maker' and r.json()['maker_wait_seconds']==10
            for invalid in [{'leverage':'NaN'},{'leverage':2.5},{'leverage':151},{'order_type':'bogus'},{'maker_wait_seconds':61}]:
                assert (await c.post('/api/tasks',json={**body,**invalid})).status_code==400
            assert (await c.post('/api/tasks',json={'asset':'BTC','leverage':None,'enabled':False})).json()['leverage'] is None
    finally:app.state.store.close()
