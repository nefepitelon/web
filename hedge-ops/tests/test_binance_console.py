"""Account degradation, diagnostics and console ledgers; no network or live orders."""
import asyncio
import time
import httpx
import pytest
from test_binance_lighter import settings, fixture, FakeVenues, MARKET
from binance_lighter.venues import Venues, Rejected, D
from binance_lighter.views import ledger, overview
from binance_lighter.api import create_app
from binance_lighter.config import redact


def test_redaction_preserves_http_and_numeric_key_index(tmp_path):
    s=settings(tmp_path)
    message='HTTP 401 / -2015 index 4 '+s.values['BINANCE_API_KEY']+' '+s.values['LIGHTER_API_PRIVATE_KEY']
    result=redact(message,s.values)
    assert 'HTTP 401 / -2015 index 4' in result
    assert s.values['BINANCE_API_KEY'] not in result
    assert s.values['LIGHTER_API_PRIVATE_KEY'] not in result


@pytest.mark.asyncio
async def test_binance_permissions_diagnosis_preserves_code_and_caches_read_only(tmp_path):
    v=Venues(settings(tmp_path));calls=[]
    v.clock_anchor=(1234000000000,time.monotonic());await v.clients['binance'].aclose()
    def respond(request):
        calls.append(request)
        assert request.method=='GET'
        if request.url.path.startswith('/sapi'):
            assert request.url.host=='api.binance.com'
            return httpx.Response(200,json={'enableReading':True,'enableFutures':False})
        return httpx.Response(401,json={'code':-2015,'msg':'do not echo arbitrary upstream body'})
    v.clients['binance']=httpx.AsyncClient(transport=httpx.MockTransport(respond))
    try:
        for _ in range(2):
            with pytest.raises(Rejected,match='enableFutures=false') as error: await v.binance_account()
            assert error.value.status==401 and error.value.code==-2015
        assert len(calls)==3 and sum(r.url.path.startswith('/sapi') for r in calls)==1
    finally: await v.close()


@pytest.mark.asyncio
@pytest.mark.parametrize('failed',['binance','lighter'])
async def test_independent_reads_keep_healthy_account_and_public_funding(tmp_path,failed):
    e,s,fake=fixture(tmp_path);v=Venues(e.settings);v.markets={'BTC':MARKET}
    async def b():
        if failed=='binance': raise Rejected('HTTP 401 / -2015')
        return {'availableBalance':'123','canTrade':True,'oneWay':True,'singleAsset':True},{'BTCUSDT':{'positionAmt':'0','positionSide':'BOTH'}}
    async def l():
        if failed=='lighter':raise Rejected('Lighter account unavailable')
        return {'available_balance':'456','total_asset_value':'500'},{}
    v.binance_account=b;v.lighter_account=l;v.funding=fake.funding;e.venues=v
    try:
        snapshot=await e.refresh()
        assert snapshot['funding_ready'] and not snapshot['ready'] and len(snapshot['rows'])==1
        healthy='lighter' if failed=='binance' else 'binance'
        view=overview(e)
        assert view['venues'][healthy]['connected'] and not view['venues'][failed]['connected']
        assert view['venues'][healthy]['available'] in ('123','456')
        assert view['venues'][failed].get('available') is None
        with pytest.raises(Rejected): await v.accounts()
        assert not fake.submissions
    finally: await v.close();s.close()


@pytest.mark.asyncio
async def test_console_known_equity_positions_and_unknown_fee_are_not_faked(tmp_path):
    e,s,v=fixture(tmp_path)
    try:
        await e.cycle();await e.refresh()
        view=overview(e)
        assert len(view['positions'])==2 and all(p['owned'] for p in view['positions'])
        assert view['venues']['binance']['available']=='10000'
        assert view['venues']['binance']['equity'] is None
        stats=ledger(s)
        assert stats['closed_trade_pnl_approx_usd'] is None and stats['rounds']==0
        # Pending intent must remain visible in system reconciliation.
        s.intent('BTC','binance','SELL',D('.1'),True)
        assert any(o['state']=='INTENT' for o in ledger(s)['orders'])
    finally:s.close()


@pytest.mark.asyncio
async def test_closed_round_ledger_uses_actual_cashflows_and_fees(tmp_path):
    e,s,v=fixture(tmp_path)
    try:
        await e.cycle();t=s.get('BTC');t['enabled']=False;s.put(t);await e.cycle()
        stats=ledger(s)
        assert stats['rounds']==1 and stats['tasks'][0]['opens']==1
        assert D(stats['volume'])==120 and D(stats['tasks'][0]['closed_volume'])==120
        assert D(stats['closed_trade_pnl_approx_usd'])==D('-.04')
        assert D(stats['by_venue']['binance']['volume'])==60
        order=s.orders()[0];order['fee']=None;s.save_order(order)
        assert ledger(s)['fees'] is None and ledger(s)['closed_trade_pnl_approx_usd'] is None
    finally:s.close()


@pytest.mark.asyncio
async def test_task_ranges_validate_preserve_enable_and_lock_while_open(tmp_path,monkeypatch):
    import binance_lighter.engine as module
    monkeypatch.setattr(module,'Venues',FakeVenues)
    app=create_app(settings(tmp_path));e=app.state.engine
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://fixture') as c:
            for body in [{'notional':'30','notional_max':'20'},{'hold_hours':'2','hold_hours_max':'1'},{'notional_max':'Infinity'}]:
                assert (await c.post('/api/tasks',json={'asset':'BTC',**body})).status_code==400
            r=await c.post('/api/tasks',json={'asset':'BTC','notional':'30','notional_max':'40','hold_hours':'1','hold_hours_max':'2'})
            assert r.status_code==200 and r.json()['enabled'] is False
            r=await c.post('/api/tasks',json={'asset':'BTC','enabled':True})
            assert r.json()['notional_max']=='40' and r.json()['hold_hours_max']=='2'
            await c.post('/api/cycle',json={})
            t=app.state.store.get('BTC')
            assert t['phase']=='OPEN' and 30<=D(t['sampled_notional'])<=40 and 1<=D(t['sampled_hold_hours'])<=2
            assert (await c.post('/api/tasks',json={'asset':'BTC','notional':'5'})).status_code==409
            assert (await c.post('/api/tasks',json={'asset':'BTC','enabled':False})).status_code==200
            r=await c.get('/api/funding')
            assert r.status_code==200 and '_accounts' not in r.json() and 'venues' in r.json()
            r=await c.get('/api/status')
            assert not any('KEY' in key or 'SECRET' in key for key in r.json()['settings'])
    finally:app.state.store.close()
