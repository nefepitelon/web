import asyncio
import base64
import hashlib
import hmac
import json
from pathlib import Path
import sys
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock
import httpx
import pytest
sys.path.insert(0,str(Path(__file__).parents[1]))
from paired_hedge.config import PAIRS, KEYS, Settings, defaults, redact
from paired_hedge.api import Engine, create_app, overview
from paired_hedge.venues import Venues
from paired_hedge.exchanges import OKX, Hyperliquid, Existing
from paired_hedge.resources import resources
from binance_lighter.venues import D, Unknown, Rejected
from binance_lighter.store import Store

def settings(root,pair,dry=False):
    v=defaults(pair)
    v.update(DRY_RUN='true' if dry else 'false',REOPEN_COOLDOWN_SECONDS='0')
    for venue in PAIRS[pair]:
        v.update({k:'1' for k in KEYS[venue]})
    s=Settings(v,root);s.pair=pair
    return s

class Sim:
    """Exchange boundary simulator, all quantities in real base units."""
    def __init__(self,name,slot):
        self.name,self.slot=name,slot;self.q=D(0);self.orders={};self.sent=[];self.partial=None;self.lose=False;self.reject=False;self.fail_account=False
        self.markets={};self.native=SimpleNamespace(test_order=AsyncMock())
    async def close(self):pass
    async def metadata(self):
        self.markets={'BTC':dict(id='BTCUSDT' if self.slot==0 else 1,step='0.001' if self.slot==0 else '0.01',minimum='.01',maximum='10000',tick='.01',notional='5',max_leverage=20)}
        return self.markets
    async def funding(self):return {'BTC':dict(rate=D(0 if self.slot==0 else 1),mark='100',interval=1)}
    async def account(self):
        if self.fail_account:raise Rejected(self.name+' account unavailable')
        return dict(equity='1000',available='1000',pnl='0',account_id='account-'+str(self.slot),positions={next(iter(self.markets.values()))['id']:dict(quantity=str(self.q),mark='100',entry='100',liquidation='10' if self.q>0 else '200',pnl='0',leverage='2',asset='BTC')})
    async def identity(self):return 'account-'+str(self.slot)
    async def preflight(self):pass
    async def book(self,m):return {'asks':[(D('100.01'),D(1000))],'bids':[(D('99.99'),D(1000))]}
    async def open_orders(self,m):return []
    async def set_leverage(self,m,lev,notional):self.lev=lev
    async def submit(self,o,m,p):
        self.sent.append(o.copy())
        if self.reject and not o['reduce_only']:raise Rejected('known rejection')
        qty=D(o['quantity'])
        if self.partial is not None and not o['reduce_only']:qty=min(qty,self.partial)
        self.q+=qty*(1 if o['side']=='BUY' else -1)
        self.orders[o['client_id']]=dict(filled=str(qty),quote=str(qty*p),exchange_id=o['client_id'],fee='0.01')
        if self.lose and not o['reduce_only']:raise Unknown('response lost after fill')
        return {'accepted':True}
    async def lookup(self,o,m):return self.orders.get(o['client_id'])
    async def fees(self,o,m):return '0.01'
    async def status(self,o,m):return {'status':'FILLED','executedQty':o['quantity']}
    async def cancel(self,o,m):pass

async def fixture(root,pair):
    s=settings(root,pair);store=Store(root/'hedge.db');venues=Venues(s)
    await venues.close()
    venues.adapters={slot:Sim(name,i) for i,(slot,name) in enumerate(venues.names.items())}
    engine=Engine(s,store,venues)
    await venues.metadata()
    store.put(dict(asset='BTC',market=venues.markets['BTC'],notional='30',hold_hours='8',enabled=True,phase='IDLE',managed={'binance':'0','lighter':'0'},opened_at=None,error='',leverage=2))
    return engine,store,venues

@pytest.mark.asyncio
@pytest.mark.parametrize('pair',PAIRS)
@pytest.mark.parametrize('scenario',['normal','partial_left','partial_right','rejected_right','unknown_right','maker','emergency'])
async def test_all_pairs_journaled_full_flow(tmp_path,pair,scenario):
    e,s,v=await fixture(tmp_path,pair)
    left,right=v.adapters.values()
    if scenario=='partial_left':left.partial=D('.2')
    if scenario=='partial_right':right.partial=D('.1')
    if scenario=='rejected_right':right.reject=True
    if scenario=='unknown_right':right.lose=True
    if scenario=='maker':
        t=s.get('BTC');t['order_type']='binance_maker';s.put(t)
    try:
        await e.cycle()
        task=s.get('BTC')
        if scenario=='unknown_right':
            assert task['phase']=='REVIEW' and not task['enabled']
            assert len(right.sent)==1
            right.lose=False
            await e.cycle() # Lookup, never resend unknown intent; exit only.
        elif scenario=='rejected_right':assert not left.q and not right.q
        else:assert left.q>0 and left.q==-right.q and task['phase']=='OPEN'
        if scenario=='emergency':
            from emergency import drain
            result=await drain(SimpleNamespace(state=SimpleNamespace(engine=e,store=s)),pair)
            assert result['phase']=='flat'
        else:
            t=s.get('BTC');t['enabled']=False;s.put(t)
            await e.cycle()
        assert not left.q and not right.q and s.get('BTC')['phase']=='IDLE'
        assert not any(D(q) for q in s.get('BTC')['managed'].values())
        assert all(o['reduce_only'] for o in left.sent[1:])
        assert len({o['client_id'] for o in s.orders()})==len(s.orders())
    finally:s.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('pair',PAIRS)
async def test_account_failure_unknown_not_zero_and_dry_run_does_not_submit(tmp_path,pair):
    e,s,v=await fixture(tmp_path,pair)
    try:
        v.adapters['lighter'].fail_account=True
        await e.cycle()
        assert not e.snapshot['ready'] and e.snapshot['funding_ready']
        assert e.snapshot['rows'][0]['positions']['lighter'] is None
        assert not any(a.sent for a in v.adapters.values())
        e.settings.values['DRY_RUN']='true';v.adapters['lighter'].fail_account=False
        await e.cycle()
        assert not any(a.sent for a in v.adapters.values())
    finally:s.close()

@pytest.mark.asyncio
async def test_ondo_preflight_discloses_unavailable_scope_without_exposing_identity(tmp_path):
    e,s,v=await fixture(tmp_path,'ondoperps_ondoperps')
    try:
        for a in v.adapters.values():
            a.permission_report=dict(account_id='private-account',account_verified=True,
                market_permissions_verified=True,trade_scope='unavailable',trade_scope_verified=False,
                api_key_management='not_allowed',message='无法只读自查 trade 权限；实际指令仍由交易所校验')
        result=await e.preflight()
        assert result['ok'] and result['submittedOrders']==0
        assert len(result['permissions'])==2
        assert all(p['trade_scope_verified'] is False for p in result['permissions'].values())
        assert 'private-account' not in json.dumps(result)
        assert sum('无法只读自查' in check for check in result['checks'])==2
        assert not any(a.sent for a in v.adapters.values())
    finally:s.close()

@pytest.mark.asyncio
async def test_entropy_balance_source_reaches_console_and_disappears_on_failed_read(tmp_path):
    e,s,v=await fixture(tmp_path,'ondoperps_entropy')
    right=v.adapters['lighter'];account=right.account
    async def unified():
        return {**(await account()),'equity':'148.264135','available':'148.264135','account_mode':'unifiedAccount','balance_source':'spot_usdc'}
    right.account=unified
    try:
        await e.refresh();row=overview(e)['venues']['lighter']
        assert row['connected'] and row['equity']=='148.264135'
        assert row['account_mode']=='unifiedAccount' and row['balance_source']=='spot_usdc'
        assert row['balance_note']=='统一账户 · 现货 USDC 抵押品'
        right.fail_account=True
        await e.refresh();row=overview(e)['venues']['lighter']
        assert not row['connected'] and row.get('equity') is None
        assert not row.get('balance_note') and not row.get('balance_source')
        assert not any(a.sent for a in v.adapters.values())
    finally:s.close()

@pytest.mark.asyncio
async def test_okx_contracts_signature_fees_and_no_write_replay(tmp_path):
    s=settings(tmp_path,'binance_okx');s.values.update(OKX_API_KEY='uuid-with-dashes',OKX_API_SECRET='secret',OKX_API_PASSPHRASE='pass_phrase')
    a=OKX(s);seen=[]
    async def transport(r):
        seen.append(r)
        if r.url.path.endswith('/time'):return httpx.Response(200,json={'code':'0','data':[{'ts':str(int(time.time()*1000))}]})
        stamp=r.headers['ok-access-timestamp'];body=r.content.decode();target=r.url.raw_path.decode()
        expected=base64.b64encode(hmac.new(b'secret',(stamp+r.method+target+body).encode(),hashlib.sha256).digest()).decode()
        assert r.headers['ok-access-sign']==expected and r.headers['ok-access-passphrase']=='pass_phrase'
        if r.method=='POST':
            order=json.loads(body);assert order['sz']=='3' and order['reduceOnly'] is False and order['tdMode']=='cross'
            return httpx.Response(503,json={})
        return httpx.Response(200,json={'code':'0','data':[dict(clOrdId=a.cid(o),instId=m['id'],state='canceled',accFillSz='2',avgPx='100',ordId='33',fee='-.02',feeCcy='USDT')]})
    await a.client.aclose();a.client=httpx.AsyncClient(transport=httpx.MockTransport(transport))
    m=dict(id='BTC-USDT-SWAP',contract='.01',step='.01');o=dict(client_id='original-id',quantity='.03',side='BUY',reduce_only=False)
    try:
        with pytest.raises(Unknown):await a.submit(o,m,D(100))
        assert len([r for r in seen if r.method=='POST'])==1
        result=await a.lookup(o,m)
        assert D(result['filled'])==D('.02') and D(result['quote'])==2 and D(result['fee'])==D('.02')
    finally:await a.close()

@pytest.mark.asyncio
async def test_okx_clock_error_resyncs_only_read(tmp_path):
    s=settings(tmp_path,'binance_okx');a=OKX(s);calls=[]
    async def transport(r):
        calls.append(r.url.path)
        if r.url.path.endswith('/time'):return httpx.Response(200,json={'code':'0','data':[{'ts':'1793000000000'}]})
        return httpx.Response(401,json={'code':'50102','data':[]}) if calls.count(r.url.path)==1 else httpx.Response(200,json={'code':'0','data':[]})
    await a.client.aclose();a.client=httpx.AsyncClient(transport=httpx.MockTransport(transport))
    try:
        assert await a.request('/api/v5/account/config',signed=True)==[]
        assert calls.count('/api/v5/public/time')==2
    finally:await a.close()

@pytest.mark.asyncio
async def test_hyperliquid_native_funding_rounding_and_terminal_fill_proof(tmp_path):
    a=Hyperliquid(settings(tmp_path,'hyperliquid_lighter'))
    m=dict(id=0,tick='.1')
    assert a.round_price(m,D('12345.67'))==12345
    assert a.round_price(m,D('12345.67'),True)==12346
    o=dict(client_id='durable',at=time.time(),quantity='.3')
    async def info(kind,**kw):
        if kind=='orderStatus':return dict(status='order',order={'status':'filled','order':dict(cloid=a.cid(o),oid=5,origSz='.3',sz='0')})
        if kind=='userFillsByTime':return [dict(oid=5,tid=1,hash='h',sz='.2',px='100',fee='.01',feeToken='USDC',time=int(time.time()*1000))]
    a.info=info
    try:
        assert await a.lookup(o,m) is None # Incomplete fills cannot update ledger.
        async def fills(*args):return [dict(sz='.3',px='100',fee='.01',feeToken='USDC')]
        a.fills=fills
        r=await a.lookup(o,m)
        assert D(r['filled'])==D('.3') and D(r['quote'])==30
        o2={**o,'client_id':'other'}
        assert a.cid(o)!=a.cid(o2) and len(a.cid(o))==34
    finally:await a.close()

@pytest.mark.asyncio
async def test_pair_api_routes_and_six_local_consoles(tmp_path):
    from local import create_local_app
    from gateway import ENGINES, schema, validate_value, is_secret
    assert len(ENGINES)==8
    assert validate_value('OKX_API_KEY','abc-uuid',set())=='abc-uuid'
    assert validate_value('OKX_API_PASSPHRASE','pass_123',set())=='pass_123'
    for k in ('OKX_API_KEY','OKX_API_SECRET','OKX_API_PASSPHRASE'):assert is_secret(k)
    app=create_local_app(tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1') as c:
        for pair in PAIRS:
            config=(await c.get(f'/local/{pair}/config')).json()
            assert config['dryRun'] and config['values']==schema(pair)
            html=await c.get(f'/console/{pair}/')
            assert html.status_code==200 and '资金费总览' in html.text and '保存任务' in html.text
            assert 'f-leverage' in html.text and 'funding-body' in html.text
            js=await c.get(f'/console/{pair}/static/app.js');assert js.status_code==200
    await app.state.manager.client.aclose()

def test_masked_secrets_and_rhc_core_isolation(tmp_path):
    v=defaults('binance_okx');v.update(OKX_API_KEY='key-value',OKX_API_SECRET='secret-value',OKX_API_PASSPHRASE='password-value')
    assert redact('key-value secret-value password-value',v)=='[redacted] [redacted] [redacted]'
    assert resources('lighter',{'LIGHTER_ACCOUNT_INDEX':'4'}).isdisjoint(resources('hyperliquid_lighter',{'LIGHTER_ACCOUNT_INDEX':'4'}))
    assert resources('binance',{'BINANCE_API_KEY':'same'}) & resources('binance_okx',{'BINANCE_API_KEY':'same'})

@pytest.mark.asyncio
async def test_okx_authoritative_key_permission_and_normalized_account(tmp_path):
    a=OKX(settings(tmp_path,'binance_okx'));a.markets={'BTC':dict(id='BTC-USDT-SWAP',contract='.01')}
    trade=True
    async def request(path,*args,**kwargs):
        if path.endswith('/config'):return [dict(posMode='net_mode',acctLv='2',perm='read_only,trade' if trade else 'read_only')]
        if path.endswith('/balance'):return [dict(details=[dict(ccy='USDT',eq='100',availEq='80',upl='2')])]
        return [dict(instId='BTC-USDT-SWAP',pos='-3',posSide='net',mgnMode='cross',markPx='100',avgPx='99',liqPx='120',upl='2',lever='5')]
    a.request=request
    try:
        r=await a.account();assert D(r['positions']['BTC-USDT-SWAP']['quantity'])==D('-.03') and r['available']=='80'
        trade=False
        with pytest.raises(Rejected,match='trade'):await a.account()
    finally:await a.close()

@pytest.mark.asyncio
async def test_hyperliquid_reads_master_and_rejects_main_wallet_key(tmp_path):
    from eth_account import Account
    agent=Account.from_key('0x'+'11'*32)
    s=settings(tmp_path,'hyperliquid_lighter');s.values.update(HYPERLIQUID_PRIVATE_KEY='0x'+'11'*32,HYPERLIQUID_ACCOUNT_ADDRESS='0x'+'22'*20)
    a=Hyperliquid(s);calls=[]
    async def info(kind,**kwargs):
        calls.append((kind,kwargs))
        if kind=='extraAgents':return [dict(address=agent.address,validUntil=int(time.time()*1000)+600000)]
    a.info=info
    try:
        await a.preflight();assert calls[0][1]['user']==s.values['HYPERLIQUID_ACCOUNT_ADDRESS']
        s.values['HYPERLIQUID_ACCOUNT_ADDRESS']=agent.address
        with pytest.raises(Rejected,match='主钱包'):await a.preflight()
    finally:await a.close()

@pytest.mark.asyncio
async def test_hyperliquid_nonce_commits_before_signed_write_and_recovery_id_stable(tmp_path):
    from email.utils import formatdate
    s=settings(tmp_path,'hyperliquid_lighter');s.values['HYPERLIQUID_PRIVATE_KEY']='0x'+'11'*32
    a=Hyperliquid(s);events=[]
    def nonce(server):events.append('commit');return server+1
    a.next_nonce=nonce
    async def transport(r):
        if r.url.path=='/info':return httpx.Response(200,json={},headers={'date':formatdate(usegmt=True)})
        events.append('send');body=json.loads(r.content)
        assert body['action']['orders'][0]['r'] is True and body['action']['orders'][0]['t']['limit']['tif']=='Ioc'
        assert body['expiresAfter']-body['nonce']==60000 and set(body['signature'])=={'r','s','v'}
        raise httpx.ReadTimeout('lost response')
    await a.client.aclose();a.client=httpx.AsyncClient(transport=httpx.MockTransport(transport))
    try:
        with pytest.raises(Unknown):await a.submit(dict(client_id='durable',quantity='1',side='SELL',reduce_only=True),{'id':0},D(100))
        assert events==['commit','send']
    finally:await a.close()

@pytest.mark.asyncio
async def test_all_pair_funding_units_and_common_asset_matching(tmp_path):
    s=settings(tmp_path,'binance_okx');a=OKX(s)
    a.markets={'BTC':dict(id='BTC-USDT-SWAP')}
    a.request=AsyncMock(return_value=[dict(fundingRate='.0008',fundingTime='0',nextFundingTime='14400000')])
    try:
        assert (await a.funding())['BTC']['rate']==2 # 8 bps / 4 hours.
    finally:await a.close()
    a=Hyperliquid(s);a.markets={'BTC':{}}
    a.info=AsyncMock(return_value=[dict(universe=[dict(name='BTC')]),[dict(funding='.0001',markPx='100')]])
    try:assert (await a.funding())['BTC']['rate']==1 # Native hourly, never /8.
    finally:await a.close()

@pytest.mark.asyncio
async def test_okx_slow_market_is_omitted_and_reader_cancelled(tmp_path,monkeypatch):
    a=OKX(settings(tmp_path,'binance_okx'))
    a.markets={name:dict(id=name+'-USDT-SWAP') for name in ('BTC','ETH')}
    cancelled=[];wait=asyncio.wait
    async def bounded(jobs,**kwargs):return await wait(jobs,timeout=.02)
    async def request(path,params):
        if params['instId'].startswith('ETH'):
            try:await asyncio.sleep(10)
            finally:cancelled.append('ETH')
        return [dict(fundingRate='.0008',fundingTime='0',nextFundingTime='14400000')]
    monkeypatch.setattr(asyncio,'wait',bounded);a.request=request
    try:
        assert set(await a.funding())=={'BTC'}
        assert cancelled==['ETH']
    finally:await a.close()

@pytest.mark.asyncio
async def test_local_start_blocks_known_reused_account_before_any_process(tmp_path):
    from gateway import RuntimeManager
    from local import OWNER
    from fastapi import HTTPException
    manager=RuntimeManager(tmp_path)
    config=defaults('binance_okx');config.update(DRY_RUN='false',BINANCE_API_KEY='shared')
    manager.read_config=lambda owner,engine:config
    manager.record=lambda owner,engine:SimpleNamespace(dry_run=False) if engine=='binance' else None
    manager._start=AsyncMock()
    try:
        with pytest.raises(HTTPException) as error:await manager.start(OWNER,'binance_okx',True,live_authorized=True)
        assert error.value.status_code==409 and manager._start.await_count==0
    finally:await manager.client.aclose()

@pytest.mark.asyncio
@pytest.mark.parametrize('pair',PAIRS)
async def test_new_cloud_worker_checkpoint_restore_and_dry_cycle(tmp_path,monkeypatch,pair):
    import paired_hedge.api as module
    from binance_lighter.cloud import run
    created=[]
    async def build():
        s=settings(tmp_path,pair,True);v=Venues(s);await v.close()
        v.adapters={slot:Sim(name,i) for i,(slot,name) in enumerate(v.names.items())}
        return v
    v=await build()
    monkeypatch.setattr(module,'Venues',lambda settings:v)
    saved={}
    def checkpoint(state,views):saved.update(state)
    first=await run(defaults(pair),{},dict(action='request',path='tasks',method='POST',payload=dict(asset='BTC',notional='30',hold_hours='8',leverage=2)),checkpoint,engine_name=pair)
    assert first['status']==200 and saved.get('sqlite') and not first['data']['enabled']
    v=await build()
    second=await run(defaults(pair),saved,dict(action='request',path='tasks',method='GET'),checkpoint,engine_name=pair)
    assert second['data']['tasks'][0]['asset']=='BTC'
    assert second['views']['status']['pair'].count('<>')==1
    assert second['views']['funding']['venues']['lighter']['unit']==('USDT' if pair=='binance_okx' else 'USDC')
    assert not any(a.sent for a in v.adapters.values())

@pytest.mark.asyncio
@pytest.mark.parametrize('pair',['ondoperps_entropy','ondoperps_ondoperps'])
async def test_new_pair_restart_keeps_owned_positions_and_public_failure_does_not_block_reduce_only(tmp_path,pair):
    engine,store,venues=await fixture(tmp_path,pair)
    try:
        await engine.cycle();assert store.get('BTC')['phase']=='OPEN'
        left,right=venues.adapters.values();count=len(left.sent)+len(right.sent)
        resumed=Engine(engine.settings,store,venues)
        await resumed.cycle()
        assert len(left.sent)+len(right.sent)==count and store.get('BTC')['phase']=='OPEN'
        task=store.get('BTC');task['enabled']=False;store.put(task)
        async def unavailable():await asyncio.sleep(10)
        venues.PUBLIC_CYCLE_BUDGET=.01;venues._funding=unavailable
        await resumed.cycle()
        assert not resumed.snapshot['funding_ready'] and resumed.snapshot['error']
        assert not left.q and not right.q and store.get('BTC')['phase']=='IDLE'
        assert all(o['reduce_only'] for o in left.sent[1:]+right.sent[1:])
    finally:store.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('pair',['ondoperps_entropy','ondoperps_ondoperps'])
async def test_new_pair_external_exposure_and_missing_confirmable_leverage_never_submit(tmp_path,pair):
    engine,store,venues=await fixture(tmp_path,pair)
    left,right=venues.adapters.values()
    try:
        left.q=D('.1');await engine.cycle()
        assert not left.sent and not right.sent and '账本不符' in store.get('BTC')['error']
        left.q=D(0);task=store.get('BTC');task['leverage']=None;store.put(task)
        await engine.cycle()
        assert not left.sent and not right.sent and '明确设置' in store.get('BTC')['error']
    finally:store.close()
