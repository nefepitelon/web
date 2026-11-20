"""Exchange fixtures only. These tests never contact a trading endpoint."""
import asyncio
from decimal import Decimal
import hashlib
import hmac
import json
from pathlib import Path
import sys
import time
from urllib.parse import parse_qsl, urlencode
import httpx
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from binance_lighter.config import Settings
from binance_lighter.engine import Engine
from binance_lighter.store import Store
from binance_lighter.venues import Venues, D, Rejected, Unknown, common_step, quantize
from binance_lighter.api import create_app

MARKET = dict(asset='BTC', symbol='BTCUSDT', market_id=1, binance_step='0.001', lighter_step='0.001', tick='0.1', size_decimals=3, price_decimals=1, binance_min='0.001', binance_max='1000', min_notional='5', lighter_min='0.001', lighter_notional='5')


def settings(root, dry=False):
    example = Path(__file__).resolve().parents[1]/'binance_lighter/env.example'
    root.mkdir(exist_ok=True)
    env = root/'.env'; env.write_text(example.read_text(encoding='utf-8'), encoding='utf-8')
    s = Settings.load(env, root)
    s.values.update(DRY_RUN='true' if dry else 'false', BINANCE_API_KEY='a'*64, BINANCE_API_SECRET='b'*64, LIGHTER_ACCOUNT_INDEX='1', LIGHTER_API_KEY_INDEX='4', LIGHTER_API_PRIVATE_KEY='ab'*40)
    return s


class FakeVenues:
    def __init__(self, s):
        self.settings, self.markets = s, {'BTC': MARKET}
        self.positions_now = {'binance':D(0), 'lighter':D(0)}
        self.submissions, self.results, self.receipts = [], {}, {}
        self.fail_second, self.partial, self.unknown, self.fail_reads, self.fail_funding = False, {}, None, False, False
    async def metadata(self): return self.markets
    async def funding(self):
        if self.fail_funding: raise Unknown('public funding unavailable')
        return [dict(asset='BTC',mark=100,net_bps_h=1,direction='BINANCE_LONG',binance_bps_h=0,lighter_bps_h=1)]
    async def accounts(self):
        if self.fail_reads: raise Unknown('account unavailable')
        b,l=self.positions_now.values()
        return dict(binance={'availableBalance':'10000'}, lighter={'available_balance':'10000'},
                    binance_positions={'BTCUSDT':{'positionAmt':str(b),'markPrice':'100','liquidationPrice':'10'}},
                    lighter_positions={1:{'symbol':'BTC','position':str(abs(l)),'sign':-1 if l<0 else 1,'position_value':str(abs(l)*100),'liquidation_price':'200'}})
    @staticmethod
    def positions(accounts, market): return Venues.positions(accounts,market)
    async def preflight(self): return await self.accounts()
    async def open_orders(self, market): return False
    async def prices(self, market, venue, side, quantity): return D(100),D(100)
    async def submit(self, order, market, price):
        self.submissions.append(order.copy())
        if self.fail_second and order['venue']=='lighter': raise Rejected('known reject')
        quantity=min(D(order['quantity']),self.partial.get(order['venue'],D(order['quantity'])))
        self.positions_now[order['venue']] += quantity*(1 if order['side']=='BUY' else -1)
        self.results[order['client_id']] = dict(filled=str(quantity), quote=str(quantity*price), exchange_id=order['client_id'], fee=None)
        if self.unknown == order['venue']: raise Unknown('lost response after acceptance')
        return {'accepted':True}
    async def lookup(self, order, market): return self.results.get(order['client_id'])
    async def fees(self, order, market): return '0.01'
    async def close(self): pass


def fixture(root):
    s=settings(root); store=Store(root/'hedge.db'); venues=FakeVenues(s); e=Engine(s,store,venues)
    store.put(dict(asset='BTC',market=MARKET,notional='30',hold_hours='8',enabled=True,phase='IDLE',managed={'binance':'0','lighter':'0'},opened_at=None,error=''))
    return e,store,venues


@pytest.mark.asyncio
async def test_live_open_disable_and_reduce_only_close_full_flow(tmp_path):
    e,s,v=fixture(tmp_path)
    try:
        await e.cycle()
        assert s.get('BTC')['phase']=='OPEN' and v.positions_now=={'binance':D('.3'),'lighter':D('-.3')}
        assert len(v.submissions)==2 and all(o['state']=='CONFIRMED' for o in s.orders())
        task=s.get('BTC');task['enabled']=False;s.put(task)
        await e.cycle()
        assert not any(v.positions_now.values()) and s.get('BTC')['phase']=='IDLE'
        assert all(o['reduce_only'] for o in v.submissions[2:])
        assert len({o['client_id'] for o in s.orders()})==4
    finally:s.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('partial,expected', [({'binance':D('.2')},D('.2')),({'lighter':D('.1')},D('.1'))])
async def test_partial_fills_hedge_actual_quantity_and_rescue_difference(tmp_path,partial,expected):
    e,s,v=fixture(tmp_path);v.partial=partial
    try:
        await e.cycle()
        assert v.positions_now['binance']==expected and v.positions_now['lighter']==-expected
        assert s.get('BTC')['phase']=='OPEN'
        if 'lighter' in partial: assert v.submissions[-1]['reduce_only'] and D(v.submissions[-1]['quantity'])==D('.2')
    finally:s.close()


@pytest.mark.asyncio
async def test_known_second_leg_rejection_flattens_first_leg(tmp_path):
    e,s,v=fixture(tmp_path);v.fail_second=True
    try:
        await e.cycle()
        assert not any(v.positions_now.values()) and s.get('BTC')['phase']=='IDLE'
        assert v.submissions[-1]['venue']=='binance' and v.submissions[-1]['reduce_only']
    finally:s.close()


@pytest.mark.asyncio
async def test_unknown_submission_is_not_resent_and_recovers_from_durable_journal(tmp_path):
    e,s,v=fixture(tmp_path);v.unknown='lighter'
    try:
        await e.cycle()
        assert s.get('BTC')['phase']=='REVIEW' and len(v.submissions)==2
        assert s.orders()[0]['state']=='UNKNOWN'
        # Simulate process restart; actual exchange state and persisted SQLite survive.
        e=Engine(e.settings,s,v);v.unknown=None
        await e.cycle()
        assert len([o for o in v.submissions if not o['reduce_only']])==2
        assert not any(v.positions_now.values()) and s.get('BTC')['phase']=='IDLE'
        assert all(o['state']=='CONFIRMED' for o in s.orders())
    finally:s.close()


@pytest.mark.asyncio
async def test_account_failure_does_not_invent_an_orphan_or_close_foreign_position(tmp_path):
    e,s,v=fixture(tmp_path)
    try:
        v.positions_now['binance']=D('.4')
        await e.cycle()
        assert not v.submissions and '仓位' in s.get('BTC')['error']
        v.fail_reads=True
        await e.cycle()
        assert not v.submissions
    finally:s.close()


@pytest.mark.asyncio
async def test_funding_outage_does_not_prevent_owned_position_close(tmp_path):
    e,s,v=fixture(tmp_path)
    try:
        await e.cycle()
        t=s.get('BTC');t['enabled']=False;s.put(t);v.fail_funding=True
        await e.cycle()
        assert not any(v.positions_now.values()) and all(o['reduce_only'] for o in v.submissions[2:])
    finally:s.close()


@pytest.mark.asyncio
async def test_demo_never_submits_even_with_live_credentials(tmp_path):
    e,s,v=fixture(tmp_path);e.settings.values['DRY_RUN']='true'
    try:
        await e.cycle();assert not v.submissions
    finally:s.close()


@pytest.mark.asyncio
async def test_unsettled_unknown_order_never_retries_or_blindly_rescues(tmp_path):
    e,s,v=fixture(tmp_path);v.unknown='lighter'
    try:
        await e.cycle();v.results.clear()
        await e.cycle();await e.cycle()
        assert len(v.submissions)==2 and s.get('BTC')['phase']=='REVIEW'
        assert v.positions_now=={'binance':D('.3'),'lighter':D('-.3')}
    finally:s.close()


@pytest.mark.asyncio
async def test_rotation_expiry_closes_both_legs_without_reopening(tmp_path):
    e,s,v=fixture(tmp_path)
    try:
        await e.cycle();t=s.get('BTC');t['opened_at']=time.time()-36000;s.put(t)
        await e.cycle();assert not any(v.positions_now.values())
        assert s.get('BTC')['phase']=='IDLE' and len(v.submissions)==4
        await e.cycle();assert len(v.submissions)==4
    finally:s.close()


@pytest.mark.asyncio
async def test_margin_buffer_blocks_opening_before_any_order(tmp_path):
    e,s,v=fixture(tmp_path);original=v.accounts
    async def accounts():
        a=await original();a['binance']['availableBalance']='10';return a
    v.accounts=accounts
    try:
        await e.cycle();assert not v.submissions and '保证金缓冲' in s.get('BTC')['error']
    finally:s.close()


@pytest.mark.asyncio
async def test_order_intent_committed_before_network_and_stop_refuses_active_tasks(tmp_path,monkeypatch):
    e,s,v=fixture(tmp_path); original=v.submit
    async def submit(order,market,price):
        other=Store(tmp_path/'hedge.db')
        try: assert next(o for o in other.orders() if o['id']==order['id'])['state']=='INTENT'
        finally:other.close()
        return await original(order,market,price)
    v.submit=submit
    try: await e.cycle();assert len(v.submissions)==2
    finally:s.close()


@pytest.mark.asyncio
async def test_binance_signed_ioc_uses_exact_hmac_and_never_retries_5xx(tmp_path):
    s=settings(tmp_path);v=Venues(s);calls=[]
    v.clock_anchor=(1234000000000,time.monotonic());await v.clients['binance'].aclose()
    def respond(request):
        calls.append(request)
        query=list(parse_qsl(request.url.query.decode()))
        signature=query.pop()[1]
        assert signature==hmac.new(s.values['BINANCE_API_SECRET'].encode(),urlencode(query).encode(),hashlib.sha256).hexdigest()
        assert request.headers['X-MBX-APIKEY']==s.values['BINANCE_API_KEY']
        p=dict(query);assert p['reduceOnly']=='true' and p['timeInForce']=='IOC' and p['positionSide']=='BOTH'
        return httpx.Response(503,json={'code':-1000})
    v.clients['binance']=httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        with pytest.raises(Unknown):await v.submit(dict(venue='binance',side='SELL',quantity='0.1',reduce_only=True,client_id='wh-test'),MARKET,D(100))
        assert len(calls)==1
    finally:await v.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('status,code', [(408,-1007),(400,-1006),(200,-1007),(400,-1000)])
async def test_binance_backend_timeout_remains_unknown_without_resubmission(tmp_path,status,code):
    v=Venues(settings(tmp_path)); calls=[]
    v.clock_anchor=(1234000000000,time.monotonic());await v.clients['binance'].aclose()
    def respond(request):
        calls.append(request)
        return httpx.Response(status,json={'code':code})
    v.clients['binance']=httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        with pytest.raises(Unknown):
            await v.submit(dict(venue='binance',side='BUY',quantity='0.1',reduce_only=False,client_id='wh-timeout'),MARKET,D(100))
        assert len(calls)==1
    finally: await v.close()


def test_common_lot_step_and_slippage_price_rounding():
    assert common_step('0.003','0.002')==D('.006')
    assert quantize('.017',common_step('.003','.002'))==D('.012')
    assert quantize('100.09','.1')==D('100.0')
    assert quantize('99.91','.1',True)==D('100.0')


@pytest.mark.asyncio
async def test_funding_intervals_and_exact_market_mapping(tmp_path):
    v=Venues(settings(tmp_path))
    async def request(venue,path,params=None,**kwargs):
        if path.endswith('/time'): return {'serverTime':int(time.time()*1000)}
        if path.endswith('exchangeInfo'): return {'symbols':[{'baseAsset':'BTC','symbol':'BTCUSDT','status':'TRADING','contractType':'PERPETUAL','quoteAsset':'USDT','filters':[{'filterType':'LOT_SIZE','stepSize':'.003','minQty':'.003','maxQty':'100'},{'filterType':'PRICE_FILTER','tickSize':'.1'},{'filterType':'MIN_NOTIONAL','notional':'5'}]}]}
        if path.endswith('orderBooks'): return {'order_books':[{'symbol':'BTC','market_id':1,'market_type':'perp','status':'active','supported_size_decimals':3,'supported_price_decimals':1,'min_base_amount':'.001','min_quote_amount':'5'}]}
        if path.endswith('premiumIndex'): return [{'symbol':'BTCUSDT','lastFundingRate':'.0004','markPrice':'100','nextFundingTime':1}]
        if path.endswith('fundingInfo'): return [{'symbol':'BTCUSDT','fundingIntervalHours':4}]
        return {'funding_rates':[{'market_id':1,'exchange':'lighter','rate':'.0008'},{'market_id':1,'exchange':'binance','rate':99}]}
    v.request=request
    try:
        await v.metadata(); rows=await v.funding()
        assert rows[0]['binance_bps_h']==1 and rows[0]['lighter_bps_h']==1
        assert v.markets['BTC']['binance_step']=='.003'
    finally: await v.close()


@pytest.mark.asyncio
async def test_sdk_order_parameters_terminal_fill_and_fee_units(tmp_path,monkeypatch):
    from types import SimpleNamespace as NS
    v=Venues(settings(tmp_path)); calls=[]
    class Signer:
        ORDER_TYPE_MARKET=1;ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL=0;DEFAULT_IOC_EXPIRY=0
        api_client=object()
        async def create_order(self,**kwargs): calls.append(kwargs);return None,NS(code=200,tx_hash='tx'),None
        async def close(self):pass
    v.signer=Signer();v.token=lambda:'test-auth'
    class Orders:
        def __init__(self,client):pass
        async def account_inactive_orders(self,*args,**kwargs):return NS(orders=[NS(client_order_index=42,status='canceled-too-much-slippage',filled_base_amount='.1',filled_quote_amount='10',order_index=9)])
        async def trades(self,**kwargs):return NS(trades=[NS(size='.1',taker_fee=5000,usd_amount='10')])
    monkeypatch.setitem(sys.modules,'lighter',NS(OrderApi=Orders))
    order=dict(venue='lighter',side='SELL',quantity='.3',client_id='42',reduce_only=True)
    try:
        await v.submit(order,MARKET,D('99.9'))
        assert calls[0]['base_amount']==300 and calls[0]['price']==999 and calls[0]['reduce_only'] is True
        assert calls[0]['api_key_index']==4
        result=await v.lookup(order,MARKET);assert result['filled']=='.1'
        assert D(await v.fees({**order,**result},MARKET))==D('.005')
    finally:await v.close()


@pytest.mark.asyncio
async def test_second_book_failure_is_known_not_submitted_and_rescued(tmp_path):
    e,s,v=fixture(tmp_path);original=v.prices;light_calls=0
    async def prices(market,venue,side,quantity):
        nonlocal light_calls
        if venue=='lighter':
            light_calls+=1
            if light_calls>1:raise Rejected('public book read failed before submitting')
        return await original(market,venue,side,quantity)
    v.prices=prices
    try:
        await e.cycle();assert not any(v.positions_now.values())
        assert len(v.submissions)==2 and all(o['venue']=='binance' for o in v.submissions)
    finally:s.close()


@pytest.mark.asyncio
async def test_local_api_task_validation_and_real_preflight_contract(tmp_path,monkeypatch):
    import binance_lighter.engine as module
    monkeypatch.setattr(module,'Venues',FakeVenues)
    app=create_app(settings(tmp_path))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://engine') as c:
        assert (await c.post('/api/tasks',json={'asset':'BTC','notional':'NaN'})).status_code==400
        assert (await c.post('/api/tasks',json={'asset':'BTC','notional':'30','hold_hours':'1','enabled':False})).status_code==200
        assert (await c.post('/api/preflight',json={})).json()['submittedOrders']==0
        await c.post('/api/tasks',json={'asset':'BTC','enabled':True})
        await c.post('/api/cycle',json={})
        assert (await c.get('/api/tasks')).json()['tasks'][0]['phase']=='OPEN'
        assert (await c.delete('/api/tasks/BTC')).status_code==409
        await c.post('/api/tasks',json={'asset':'BTC','enabled':False})
        await c.post('/api/cycle',json={})
        assert (await c.delete('/api/tasks/BTC')).status_code==200
        assert (await c.get('/api/stats')).json()['fees'] is not None
    app.state.store.close()


@pytest.mark.asyncio
async def test_cloud_real_sqlite_checkpoint_restores_orders_and_ownership(tmp_path,monkeypatch):
    import binance_lighter.engine as module
    from binance_lighter.cloud import run
    shared=FakeVenues(settings(tmp_path))
    monkeypatch.setattr(module,'Venues',lambda s:shared)
    state={}
    def checkpoint(snapshot,views):state.update(snapshot)
    values=shared.settings.values
    response=await run(values,{},dict(action='request',path='tasks',method='POST',payload={'asset':'BTC','notional':'30','hold_hours':'8','enabled':True}),checkpoint)
    assert response['status']==200 and state['sqlite']
    await run(values,state.copy(),dict(action='cycle'),checkpoint)
    result=await run(values,state.copy(),dict(action='request',path='tasks',method='GET'),checkpoint)
    assert result['data']['tasks'][0]['phase']=='OPEN' and len(shared.submissions)==2
    await run(values,state.copy(),dict(action='cycle'),checkpoint)
    assert len(shared.submissions)==2  # A fresh cloud invocation does not reopen the hedge.
