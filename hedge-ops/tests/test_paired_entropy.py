"""HIP-3 account, signing-ID, precision and terminal-fill regressions.

All accounts and transports are synthetic. No external requests or live orders.
"""
import asyncio
from email.utils import formatdate
import json
from pathlib import Path
import sys
import time
from unittest.mock import AsyncMock
import httpx
import pytest

sys.path.insert(0,str(Path(__file__).parents[1]))
from paired_hedge.config import Settings,defaults
from paired_hedge.entropy import Entropy
from paired_hedge.venues import Venues
from binance_lighter.venues import D,Rejected,Unknown

def settings(root,pair='ondoperps_entropy'):
    values=defaults(pair)
    values.update(HYPERLIQUID_ACCOUNT_ADDRESS='0x'+'22'*20,HYPERLIQUID_PRIVATE_KEY='0x'+'11'*32)
    result=Settings(values,root);result.pair=pair
    return result

def metadata():
    return dict(collateralToken=0,universe=[dict(name='io:SNDK',szDecimals=3,maxLeverage=20,marginTableId=20,onlyIsolated=True),dict(name='io:OLD',szDecimals=0,maxLeverage=3,isDelisted=True)],marginTables=[[20,dict(marginTiers=[dict(lowerBound='0',maxLeverage=20)])]])

def state(*,mode='isolated'):
    return dict(marginSummary=dict(accountValue='35',totalMarginUsed='25'),withdrawable='10',assetPositions=[dict(position=dict(coin='io:SNDK',szi='2',positionValue='200',entryPx='99',liquidationPx='80',unrealizedPnl='2',marginUsed='30',leverage=dict(type=mode,value=5)))])

def empty_io_state():
    summary=dict(accountValue='0.0',totalMarginUsed='0.0',totalNtlPos='0.0',totalRawUsd='0.0')
    return dict(marginSummary=summary,crossMarginSummary=dict(summary),crossMaintenanceMarginUsed='0.0',
        withdrawable='0.0',assetPositions=[])

@pytest.mark.asyncio
async def test_io_metadata_uses_builder_dex_offset_and_actual_hourly_rate(tmp_path):
    adapter=Entropy(settings(tmp_path));calls=[]
    async def info(kind,**params):
        calls.append((kind,params))
        if kind=='perpDexs':return [None,dict(name='xyz'),dict(name='io')]
        if kind=='meta':assert params==dict(dex='io');return metadata()
        if kind=='metaAndAssetCtxs':
            assert params==dict(dex='io')
            return metadata(),[dict(funding='.0001',markPx='100'),dict(funding='0',markPx='1')]
    adapter.info=info
    try:
        markets=await adapter.metadata();assert set(markets)=={'SNDK'}
        assert markets['SNDK']['id']=='io:SNDK' and markets['SNDK']['wire_id']==120000
        assert markets['SNDK']['step']=='.001' or D(markets['SNDK']['step'])==D('.001')
        rate=(await adapter.funding())['SNDK'];assert rate['rate']==1 and rate['interval']==1
        assert all(params.get('dex')=='io' for kind,params in calls if kind!='perpDexs')
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('collateral',[None,1,False])
async def test_io_metadata_requires_explicit_official_usdc_collateral(tmp_path,collateral):
    adapter=Entropy(settings(tmp_path));meta=metadata()
    if collateral is None:meta.pop('collateralToken')
    else:meta['collateralToken']=collateral
    async def info(kind,**params):return [None,dict(name='io')] if kind=='perpDexs' else meta
    adapter.info=info
    try:
        with pytest.raises(Rejected,match='USDC 抵押品'):await adapter.metadata()
        assert not adapter.markets
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('mode',['unifiedAccount','portfolioMargin'])
async def test_io_unified_balance_does_not_double_subtract_reserved_margin(tmp_path,mode):
    adapter=Entropy(settings(tmp_path));calls=[]
    async def info(kind,**params):
        calls.append((kind,params))
        assert params['user']==adapter.user
        if kind=='clearinghouseState':assert params['dex']=='io';return state()
        if kind=='userRole':return dict(role='user')
        if kind=='userAbstraction':return mode
        if kind=='spotClearinghouseState':return dict(balances=[dict(coin='USDC',total='200',hold='40')])
        raise AssertionError('Account read unexpectedly depends on metadata')
    adapter.info=info
    try:
        result=await adapter.account()
        assert result['equity']=='200' and result['available']=='160' and result['pnl']=='2'
        assert result['mode']==result['account_mode']==mode and result['balance_source']=='spot_usdc'
        assert set(result['positions'])=={'io:SNDK'} and result['positions']['io:SNDK']['quantity']=='2'
        assert len(calls)==4 and not adapter.markets
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_standard_account_ignores_unneeded_spot_and_rejects_unknown_mode_or_cross(tmp_path):
    adapter=Entropy(settings(tmp_path));mode='default';margin_mode='isolated'
    async def info(kind,**params):
        if kind=='clearinghouseState':return state(mode=margin_mode)
        if kind=='userRole':return dict(role='user')
        if kind=='userAbstraction':return mode
        raise AssertionError('Standard account must not request spot/metadata')
    adapter.info=info
    try:
        result=await adapter.account();assert result['available']=='10' and result['equity']=='35'
        assert result['mode']==result['account_mode']=='default' and result['balance_source']=='io_perps'
        mode='future_unknown_mode'
        with pytest.raises(Rejected,match='账户模式'):await adapter.account()
        mode='default';margin_mode='cross'
        with pytest.raises(Rejected,match='逐仓'):await adapter.account()
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_unified_live_shape_reads_spot_usdc_when_all_io_values_are_zero(tmp_path):
    adapter=Entropy(settings(tmp_path));calls=[]
    async def info(kind,**params):
        calls.append((kind,params))
        assert params['user']==adapter.user
        if kind=='clearinghouseState':assert params['dex']=='io';return empty_io_state()
        if kind=='userRole':return dict(role='user')
        if kind=='userAbstraction':return 'unifiedAccount'
        if kind=='spotClearinghouseState':return dict(balances=[dict(coin='USDC',token=0,
            total='148.264135',hold='0.0',entryNtl='0.0')])
        raise AssertionError('No metadata, native dex or write is required')
    adapter.info=info
    try:
        result=await adapter.account()
        assert result['equity']==result['available']=='148.264135'
        assert result['pnl']=='0' and result['positions']=={}
        assert result['mode']==result['account_mode']=='unifiedAccount' and result['balance_source']=='spot_usdc'
        assert len(calls)==4 and not adapter.markets
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('modes',[
    ['default','unifiedAccount','default'],
    ['unifiedAccount','default','unifiedAccount'],
])
async def test_account_mode_switch_uses_fresh_source_without_reusing_zero_or_spot(tmp_path,modes):
    adapter=Entropy(settings(tmp_path));mode=modes[0];calls=[]
    async def info(kind,**params):
        calls.append(kind)
        assert params['user']==adapter.user
        if kind=='clearinghouseState':assert params['dex']=='io';return empty_io_state()
        if kind=='userRole':return dict(role='user')
        if kind=='userAbstraction':return mode
        if kind=='spotClearinghouseState':return dict(balances=[dict(coin='USDC',token=0,total='148.264135',hold='0')])
        raise AssertionError('Unexpected request while choosing fresh balance source')
    adapter.info=info
    try:
        for mode in modes:
            calls.clear();result=await adapter.account()
            unified=mode=='unifiedAccount'
            assert D(result['equity'])==D(result['available'])==(D('148.264135') if unified else D(0))
            assert result['mode']==result['account_mode']==mode
            assert result['balance_source']==('spot_usdc' if unified else 'io_perps')
            assert sorted(calls)==sorted(['clearinghouseState','userAbstraction','userRole']+(['spotClearinghouseState'] if unified else []))
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('mode',['default','unifiedAccount'])
async def test_explicit_true_zero_balance_is_a_successful_read_with_its_source(tmp_path,mode):
    adapter=Entropy(settings(tmp_path));calls=[]
    async def info(kind,**params):
        calls.append(kind)
        if kind=='clearinghouseState':return empty_io_state()
        if kind=='userRole':return dict(role='user')
        if kind=='userAbstraction':return mode
        if kind=='spotClearinghouseState':return dict(balances=[dict(coin='USDC',token=0,total='0.0',hold='0.0')])
        raise AssertionError('Unexpected request for explicit zero')
    adapter.info=info
    try:
        result=await adapter.account()
        assert D(result['equity'])==D(result['available'])==0 and result['positions']=={}
        assert result['account_mode']==mode and result['balance_source']==('io_perps' if mode=='default' else 'spot_usdc')
        assert len(calls)==(3 if mode=='default' else 4)
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('role',[
    dict(role='agent',data=dict(user='0x'+'44'*20)),dict(role='missing'),dict(role='future'),
    {},None,[],dict(role=['user']),dict(role='user',data=[]),dict(role='subAccount'),dict(role='subAccount',data=None),
])
async def test_agent_or_unverified_funding_address_cannot_be_reported_as_normal_zero(tmp_path,role):
    adapter=Entropy(settings(tmp_path));calls=[]
    async def info(kind,**params):
        calls.append(kind)
        assert params['user']==adapter.user
        if kind=='clearinghouseState':return empty_io_state()
        if kind=='userAbstraction':return 'default'
        if kind=='userRole':return role
        raise AssertionError('Bad identity must not trigger a fallback or address replacement')
    adapter.info=info;adapter.action=AsyncMock()
    try:
        with pytest.raises(Rejected) as error:await adapter.account()
        message=str(error.value)
        assert 'HYPERLIQUID_ACCOUNT_ADDRESS' in message and 'HYPERLIQUID_PRIVATE_KEY' in message
        assert adapter.user.lower() not in message.lower()
        assert adapter.settings.values['HYPERLIQUID_PRIVATE_KEY'] not in message
        assert sorted(calls)==sorted(['clearinghouseState','userAbstraction','userRole'])
        adapter.action.assert_not_awaited()
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('role',[dict(role='user'),dict(role='user',data=None),
    dict(role='subAccount',data=dict(master='0x'+'44'*20)),dict(role='vault'),dict(role='vault',data=None)])
async def test_verified_funding_roles_may_legitimately_have_zero_balance(tmp_path,role):
    adapter=Entropy(settings(tmp_path))
    async def info(kind,**params):
        if kind=='clearinghouseState':return empty_io_state()
        if kind=='userAbstraction':return 'default'
        if kind=='userRole':return role
        raise AssertionError('No transfer, mode change or address fallback is allowed')
    adapter.info=info;adapter.action=AsyncMock()
    try:
        result=await adapter.account()
        assert D(result['equity'])==D(result['available'])==0 and result['balance_source']=='io_perps'
        assert result['account_id']==adapter.user.lower()
        adapter.action.assert_not_awaited()
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('route',['account','preflight'])
async def test_funding_role_timeout_stays_unknown_within_one_read_budget(tmp_path,route):
    # Measure the network deadline, not eth_account's first module import.
    from eth_account import Account
    adapter=Entropy(settings(tmp_path));adapter.READ_BUDGET=.03;cancelled=[];calls=[]
    async def info(kind,**params):
        calls.append(kind)
        if kind=='userRole':
            try:await asyncio.sleep(5)
            finally:cancelled.append(kind)
        if kind=='clearinghouseState':return empty_io_state()
        if kind=='userAbstraction':return 'default'
        raise AssertionError('Unconfirmed role cannot proceed to agent or balances')
    adapter.info=info;adapter.action=AsyncMock();started=time.monotonic()
    try:
        with pytest.raises(Rejected,match='超时'):await getattr(adapter,route)()
        assert time.monotonic()-started<.25 and cancelled==['userRole']
        assert 'extraAgents' not in calls and 'spotClearinghouseState' not in calls
        adapter.action.assert_not_awaited()
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('bad_usdc',[
    [],
    [dict(coin='USDC',token=0,total='0',hold='0'),dict(coin='usdc',token=0,total='148.264135',hold='0')],
    [dict(coin='USDC',token=1,total='148.264135',hold='0')],
    [dict(coin='USDC',token=False,total='148.264135',hold='0')],
    [dict(coin='USDC',token='0',total='148.264135',hold='0')],
    [dict(coin='USDC',token=0,hold='0')],
    [dict(coin='USDC',token=0,total='148.264135')],
    [dict(coin='USDC',token=0,total='NaN',hold='0')],
    [None],
])
async def test_missing_duplicate_or_conflicting_usdc_is_unknown_not_a_successful_zero(tmp_path,bad_usdc):
    adapter=Entropy(settings(tmp_path));calls=[]
    async def info(kind,**params):
        calls.append(kind)
        if kind=='clearinghouseState':return empty_io_state()
        if kind=='userRole':return dict(role='user')
        if kind=='userAbstraction':return 'unifiedAccount'
        if kind=='spotClearinghouseState':return dict(balances=bad_usdc)
        raise AssertionError('Unknown balance must not trigger an alternate source fallback')
    adapter.info=info
    try:
        with pytest.raises(Rejected,match='USDC'):await adapter.account()
        assert sorted(calls)==sorted(['clearinghouseState','userAbstraction','userRole','spotClearinghouseState'])
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_missing_unified_collateral_and_timeout_are_unknown_not_zero(tmp_path):
    adapter=Entropy(settings(tmp_path));sleep=False
    async def info(kind,**params):
        if sleep:await asyncio.sleep(10)
        if kind=='clearinghouseState':return state()
        if kind=='userRole':return dict(role='user')
        if kind=='userAbstraction':return 'unifiedAccount'
        return dict(balances=[])
    adapter.info=info
    try:
        with pytest.raises(Rejected,match='USDC'):await adapter.account()
        adapter.READ_BUDGET=.01;sleep=True
        with pytest.raises(Rejected,match='不能按空仓'):await adapter.account()
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_leverage_uses_isolated_builder_asset_and_readback(tmp_path):
    adapter=Entropy(settings(tmp_path));m=dict(id='io:SNDK',wire_id=120000,max_leverage=20,tick='.001',step='.001')
    adapter.markets={'SNDK':m};adapter.metadata_at=time.monotonic()
    adapter.action=AsyncMock(return_value=dict(status='ok'));adapter.info=AsyncMock(return_value=dict(leverage=dict(type='isolated',value=6)))
    try:
        with pytest.raises(Rejected,match='强平距离'):await adapter.set_leverage(m,14,D(100))
        adapter.action.assert_not_awaited()
        await adapter.set_leverage(m,6,D(100))
        adapter.action.assert_awaited_once_with(dict(type='updateLeverage',asset=120000,isCross=False,leverage=6))
        adapter.info.assert_awaited_once_with('activeAssetData',user=adapter.user,coin='io:SNDK')
        adapter.info.return_value=dict(leverage=dict(type='cross',value=6))
        with pytest.raises(Rejected,match='尚未读回'):await adapter.set_leverage(m,6,D(100))
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_order_signing_persists_nonce_once_and_unknown_write_is_not_replayed(tmp_path):
    adapter=Entropy(settings(tmp_path));m=dict(id='io:SNDK',wire_id=120000,max_leverage=20,tick='.001',step='.001')
    adapter.markets={'SNDK':m};adapter.metadata_at=time.monotonic();events=[];writes=[]
    def nonce(server):events.append('commit');return server+1
    adapter.next_nonce=nonce
    async def transport(request):
        if request.url.path=='/info':return httpx.Response(200,json={},headers={'date':formatdate(usegmt=True)})
        events.append('send');writes.append(json.loads(request.content))
        raise httpx.ReadTimeout('synthetic receipt loss')
    await adapter.client.aclose();adapter.client=httpx.AsyncClient(transport=httpx.MockTransport(transport))
    order=dict(client_id='durable-entropy',quantity='.123',side='SELL',reduce_only=True)
    try:
        with pytest.raises(Unknown):await adapter.submit(order,m,D('100.01'))
        assert events==['commit','send'] and len(writes)==1
        wire=writes[0]['action']['orders'][0]
        assert wire['a']==120000 and wire['r'] is True and wire['s']=='0.123' and wire['t']['limit']['tif']=='Ioc'
        assert writes[0]['expiresAfter']-writes[0]['nonce']==60000
        with pytest.raises(Rejected,match='数量精度'):await adapter.submit({**order,'quantity':'.1234'},m,D('100.01'))
        with pytest.raises(Rejected,match='价格精度'):await adapter.submit(order,m,D('100.001'))
        assert len(writes)==1
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_lookup_requires_market_identity_terminal_order_and_exact_fills(tmp_path):
    adapter=Entropy(settings(tmp_path));order=dict(client_id='durable',quantity='.3',side='BUY',reduce_only=False,at=time.time());m=dict(id='io:SNDK')
    coin='io:SNDK';terminal='filled';filled='.2';server=int(time.time()*1000)
    adapter._server_anchor=(server,time.monotonic())
    async def info(kind,**params):
        if kind=='orderStatus':return dict(status='order',order=dict(status=terminal,order=dict(cloid=adapter.cid(order),coin=coin,side='B',reduceOnly=False,oid=4,origSz='.3',sz='0',timestamp=server-100)))
        if kind=='userFillsByTime':return [dict(oid=4,tid=1,hash='h',coin='io:SNDK',sz=filled,px='100',fee='.01',feeToken='USDC',time=server)]
    adapter.info=info
    try:
        assert await adapter.lookup(order,m) is None
        filled='.3';result=await adapter.lookup(order,m)
        assert D(result['filled'])==D('.3') and D(result['quote'])==30 and D(result['fee'])==D('.01')
        terminal='open';assert await adapter.lookup(order,m) is None
        terminal='filled';coin='SNDK'
        with pytest.raises(Unknown,match='市场'):await adapter.lookup(order,m)
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_preflight_rejects_funding_wallet_key_with_safe_actionable_guidance_and_no_write(tmp_path):
    from eth_account import Account
    config=settings(tmp_path)
    funding=Account.from_key(config.values['HYPERLIQUID_PRIVATE_KEY']).address
    config.values['HYPERLIQUID_ACCOUNT_ADDRESS']=funding
    adapter=Entropy(config)
    adapter.info=AsyncMock(return_value=dict(role='user'))
    adapter.action=AsyncMock(side_effect=AssertionError('Preflight must never sign or submit actions'))
    try:
        with pytest.raises(Rejected) as error:await adapter.preflight()
        message=str(error.value)
        assert '当前 HYPERLIQUID_PRIVATE_KEY 对应资金主账户' in message
        assert '不能使用主钱包私钥' in message and 'https://app.hyperliquid.xyz/API' in message
        assert '创建并授权专用 API agent' in message and 'agent 私钥填入 HYPERLIQUID_PRIVATE_KEY' in message
        assert 'HYPERLIQUID_ACCOUNT_ADDRESS 仍填写资金账户公开地址' in message
        assert funding.lower() not in message.lower() and config.values['HYPERLIQUID_PRIVATE_KEY'] not in message
        adapter.info.assert_awaited_once_with('userRole',user=funding);adapter.action.assert_not_awaited()
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('authorization',['authorized','unauthorized','expired','expires_soon'])
async def test_io_preflight_requires_current_authorized_agent_without_exchange_actions(tmp_path,authorization):
    from eth_account import Account
    adapter=Entropy(settings(tmp_path));server=1720000000000;calls=[]
    signer=Account.from_key(adapter.settings.values['HYPERLIQUID_PRIVATE_KEY']).address
    async def transport(request):
        assert request.method=='POST' and request.url.path=='/info'
        payload=json.loads(request.content);calls.append(payload)
        if payload==dict(type='userRole',user=adapter.user):
            return httpx.Response(200,json=dict(role='user'),headers={'date':formatdate(server/1000,usegmt=True)})
        assert payload==dict(type='extraAgents',user=adapter.user)
        address='0x'+'33'*20 if authorization=='unauthorized' else signer
        offset={'expired':-1000,'expires_soon':30000}.get(authorization,300000)
        return httpx.Response(200,json=[dict(address=address,validUntil=server+offset)],
            headers={'date':formatdate(server/1000,usegmt=True)})
    await adapter.account_client.aclose()
    adapter.account_client=httpx.AsyncClient(transport=httpx.MockTransport(transport))
    adapter.action=AsyncMock(side_effect=AssertionError('Readonly preflight must never execute an exchange action'))
    try:
        if authorization=='authorized':assert await adapter.preflight() is None
        else:
            with pytest.raises(Rejected,match='agent 未授权给资金账户、已到期或即将到期'):await adapter.preflight()
        assert len(calls)==2 and [r['type'] for r in calls]==['userRole','extraAgents']
        adapter.action.assert_not_awaited()
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('role',[dict(role='agent'),dict(role='missing'),dict(role='future'),None,dict(role='user',data=[])])
async def test_io_preflight_rejects_bad_funding_role_before_agent_authorization(tmp_path,role):
    adapter=Entropy(settings(tmp_path));adapter.info=AsyncMock(return_value=role);adapter.action=AsyncMock()
    try:
        with pytest.raises(Rejected,match='HYPERLIQUID_ACCOUNT_ADDRESS'):await adapter.preflight()
        adapter.info.assert_awaited_once_with('userRole',user=adapter.user)
        adapter.action.assert_not_awaited()
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_subaccount_preflight_reuses_funding_role_for_master_authorization(tmp_path):
    from eth_account import Account
    config=settings(tmp_path);config.values['HYPERLIQUID_VAULT_ADDRESS']=config.values['HYPERLIQUID_ACCOUNT_ADDRESS']
    adapter=Entropy(config);master='0x'+'44'*20;server=1720000000000;calls=[]
    signer=Account.from_key(config.values['HYPERLIQUID_PRIVATE_KEY']).address
    adapter._server_anchor=(server,time.monotonic())
    async def info(kind,**params):
        calls.append((kind,params))
        if kind=='userRole':
            assert params==dict(user=adapter.user)
            return dict(role='subAccount',data=dict(master=master))
        assert kind=='extraAgents' and params==dict(user=master)
        return [dict(address=signer,validUntil=server+300000)]
    adapter.info=info;adapter.action=AsyncMock()
    try:
        await adapter.preflight()
        assert [kind for kind,params in calls]==['userRole','extraAgents']
        adapter.action.assert_not_awaited()
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('clock_skew',[-3600,3600])
async def test_io_server_clock_controls_books_fills_and_agent_expiry_despite_host_drift(tmp_path,monkeypatch,clock_skew):
    from eth_account import Account
    from paired_hedge import entropy as module
    adapter=Entropy(settings(tmp_path));server=1720000000000
    order=dict(client_id='server-timed',quantity='.3',side='BUY',reduce_only=False,at=server/1000+clock_skew)
    m=dict(id='io:SNDK');calls=[]
    signer=Account.from_key(adapter.settings.values['HYPERLIQUID_PRIVATE_KEY']).address
    async def transport(request):
        payload=json.loads(request.content);kind=payload['type'];calls.append(payload)
        if kind=='l2Book':result=dict(time=server+400,levels=[[dict(px='99',sz='1')],[dict(px='100',sz='1')]])
        elif kind=='userRole':result=dict(role='user')
        elif kind=='extraAgents':result=[dict(address=signer,validUntil=server+300000)]
        elif kind=='orderStatus':result=dict(status='order',order=dict(status='filled',order=dict(cloid=adapter.cid(order),coin='io:SNDK',side='B',reduceOnly=False,oid=42,origSz='.3',sz='0',timestamp=server+100)))
        elif kind=='userFillsByTime':
            assert payload['startTime']==server+99
            # Include the fractional current second despite HTTP Date rounding.
            assert server+500<=payload['endTime']<server+2000
            result=[dict(oid=42,tid=1,hash='server-fill',coin='io:SNDK',sz='.3',px='100',fee='.01',feeToken='USDC',time=server+500)] if payload['startTime']<=server+500<=payload['endTime'] else []
        else:raise AssertionError(kind)
        return httpx.Response(200,json=result,headers={'date':formatdate(server/1000,usegmt=True)})
    for key in ('public_client','account_client'):
        await getattr(adapter,key).aclose();setattr(adapter,key,httpx.AsyncClient(transport=httpx.MockTransport(transport)))
    monkeypatch.setattr(module.time,'time',lambda:server/1000+clock_skew)
    try:
        book=await adapter.book(m);assert book['asks'][0][0]==100
        await adapter.preflight()
        result=await adapter.lookup(order,m)
        assert result['filled']=='0.3' and result['quote']=='30.0'
        assert [r['type'] for r in calls]==['l2Book','userRole','extraAgents','orderStatus','userFillsByTime']
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_missing_official_clock_or_order_timestamp_keeps_execution_unknown(tmp_path):
    adapter=Entropy(settings(tmp_path));server=1720000000000;dated=False;timestamp=server
    order=dict(client_id='unknown-time',quantity='.3',side='BUY',reduce_only=False,at=server/1000)
    calls=[]
    async def transport(request):
        kind=json.loads(request.content)['type'];calls.append(kind)
        if kind=='l2Book':result=dict(time=server,levels=[[],[]])
        elif kind=='orderStatus':result=dict(status='order',order=dict(status='filled',order=dict(cloid=adapter.cid(order),coin='io:SNDK',side='B',reduceOnly=False,oid=42,origSz='.3',sz='0',timestamp=timestamp)))
        else:raise AssertionError('Unconfirmed time must not query or confirm fills')
        return httpx.Response(200,json=result,headers={'date':formatdate(server/1000,usegmt=True)} if dated else {})
    for key in ('public_client','account_client'):
        await getattr(adapter,key).aclose();setattr(adapter,key,httpx.AsyncClient(transport=httpx.MockTransport(transport)))
    try:
        with pytest.raises(Rejected,match='服务器时间未确认'):await adapter.book(dict(id='io:SNDK'))
        assert await adapter.lookup(order,dict(id='io:SNDK')) is None
        dated=True;timestamp=None
        assert await adapter.lookup(order,dict(id='io:SNDK')) is None
        assert 'userFillsByTime' not in calls
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_filled_terminal_cannot_confirm_zero_or_partial_expected_quantity(tmp_path):
    adapter=Entropy(settings(tmp_path));order=dict(client_id='malformed-terminal',quantity='.3',side='BUY',reduce_only=False)
    adapter.raw_order=AsyncMock(return_value=dict(status='filled',order=dict(origSz='.3',sz='.3',oid=42,timestamp=1720000000000)))
    adapter.fills=AsyncMock(return_value=[])
    try:
        with pytest.raises(Unknown,match='完全成交终态'):await adapter.lookup(order,dict(id='io:SNDK'))
        adapter.raw_order.return_value['order']['sz']='.1'
        with pytest.raises(Unknown,match='完全成交终态'):await adapter.lookup(order,dict(id='io:SNDK'))
        adapter.fills.assert_not_awaited()
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_io_fill_pagination_deduplicates_official_time_boundary_and_requires_progress(tmp_path):
    adapter=Entropy(settings(tmp_path));server=1720000000000
    adapter._server_anchor=(server,time.monotonic());starts=[]
    fill=dict(oid=42,tid=1,hash='same-fill',coin='io:SNDK',sz='.3',px='100',fee='.01',feeToken='USDC',time=server-100)
    async def info(kind,**params):
        assert kind=='userFillsByTime';starts.append(params['startTime'])
        return [fill]*2000 if len(starts)==1 else [fill]
    adapter.info=info
    try:
        assert await adapter.fills({},42,server_timestamp=server-200)==[fill]
        assert starts==[server-201,server-100]
        starts.clear()
        assert await adapter.fills({},42,server_timestamp=server-99) is None
    finally:await adapter.close()

@pytest.mark.asyncio
async def test_new_pair_accounts_never_wait_for_market_metadata_and_same_account_is_blocked(tmp_path):
    for pair in ('ondoperps_entropy','ondoperps_ondoperps'):
        venues=Venues(settings(tmp_path,pair));await venues.close()
        venues.metadata=AsyncMock(side_effect=AssertionError('Private account reads must be independent'))
        def account(identity):return dict(equity='100',available='90',pnl='0',positions={},account_id=identity)
        a,b=venues.adapters.values();a.account=AsyncMock(return_value=account('A'));b.account=AsyncMock(return_value=account('B'))
        snap=await venues.account_snapshot();assert not snap['errors'] and snap['binance']['availableBalance']=='90'
        venues.metadata.assert_not_awaited()
        if pair=='ondoperps_ondoperps':
            b.account.return_value=account('A')
            snap=await venues.account_snapshot();assert set(snap['errors'])=={'binance','lighter'}
            assert snap['binance'] is None and snap['lighter_positions'] is None
            a.identity=AsyncMock(return_value='A');b.identity=AsyncMock(return_value='A')
            with pytest.raises(Rejected,match='accountID'):await venues.preflight()
            venues.metadata.assert_not_awaited()

@pytest.mark.asyncio
async def test_same_venue_rates_have_zero_edge_even_if_second_account_sample_would_differ(tmp_path):
    venues=Venues(settings(tmp_path,'ondoperps_ondoperps'));await venues.close()
    a,b=venues.adapters.values()
    m=dict(id='SNDK-USD.P',step='.001',minimum='.001',maximum='1000',tick='.01',notional='5',max_leverage=20)
    a.markets=b.markets={'SNDK':m};venues.markets={'SNDK':dict(left=m,right=m)};venues.metadata_at=time.time()
    a.funding=AsyncMock(return_value={'SNDK':dict(rate=D('2'),mark='100',interval=1)})
    b.funding=AsyncMock(return_value={'SNDK':dict(rate=D('-8'),mark='100',interval=1)})
    rows=await venues.funding();row=rows[0]
    assert row['net_bps_h']==0 and row['binance_bps_h']==row['lighter_bps_h']==2
    assert row['direction']=='BINANCE_LONG' and row['strategy']=='dual_account_rotation' and row['funding_arbitrage'] is False
    b.funding.assert_not_awaited();assert venues.settings.values['MIN_NET_FUNDING_BPS_H']=='0'

@pytest.mark.asyncio
@pytest.mark.parametrize('failure',['transient_http','timeout'])
async def test_io_public_failures_rotate_only_public_reader_never_account_or_write_pool(tmp_path,failure):
    adapter=Entropy(settings(tmp_path));adapter.READ_BUDGET=.03
    async def failed(request):
        if failure=='timeout':await asyncio.sleep(10)
        return httpx.Response(503,json={})
    async def healthy(request):return httpx.Response(200,json=dict(fresh=True))
    old=adapter.public_client;await old.aclose()
    bad=httpx.AsyncClient(transport=httpx.MockTransport(failed));adapter.public_client=bad
    old=adapter.account_client;await old.aclose()
    account=httpx.AsyncClient(transport=httpx.MockTransport(healthy));adapter.account_client=account
    writer=adapter.client
    adapter._reader_client=lambda:httpx.AsyncClient(transport=httpx.MockTransport(healthy))
    try:
        if failure=='timeout':
            with pytest.raises(Rejected,match='超时'):await adapter.info('meta',dex='io')
        assert await adapter.info('meta',dex='io')==dict(fresh=True)
        assert await adapter.info('clearinghouseState',user=adapter.user,dex='io')==dict(fresh=True)
        assert bad.is_closed and adapter.public_client is not bad
        assert adapter.account_client is account and not account.is_closed
        assert adapter.client is writer and not writer.is_closed
    finally:await adapter.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('pair',['ondoperps_entropy','ondoperps_ondoperps'])
async def test_slow_public_scan_keeps_fresh_accounts_and_control_routes_responsive(tmp_path,monkeypatch,pair):
    from paired_hedge import api as module
    venues=Venues(settings(tmp_path,pair));await venues.close();venues.PUBLIC_CYCLE_BUDGET=.03
    for index,adapter in enumerate(venues.adapters.values()):
        adapter.account=AsyncMock(return_value=dict(equity='100',available='90',pnl='0',positions={},account_id=str(index)))
    cancelled=[]
    async def slow_public():
        try:await asyncio.sleep(10)
        finally:cancelled.append(True)
    venues._funding=slow_public
    monkeypatch.setattr(module,'Venues',lambda settings:venues)
    app=module.create_app(settings(tmp_path,pair));engine=app.state.engine
    refresh=asyncio.create_task(engine.refresh())
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            status,tasks=await asyncio.wait_for(asyncio.gather(client.get('/api/status'),client.get('/api/tasks')),.2)
            assert status.status_code==tasks.status_code==200 and not refresh.done()
            await refresh
            result=(await client.get('/api/funding')).json()
            assert not result['ready'] and not result['funding_ready'] and result['venues']['binance']['available']=='90'
            assert result['venues']['lighter']['equity']=='100' and set(result['errors'])=={'funding'}
            assert cancelled==[True]
    finally:
        if not refresh.done():refresh.cancel();await asyncio.gather(refresh,return_exceptions=True)
        await venues.close();app.state.store.close()

@pytest.mark.asyncio
@pytest.mark.parametrize('pair',['ondoperps_entropy','ondoperps_ondoperps'])
async def test_new_pair_metadata_lock_wait_has_a_finite_budget(tmp_path,pair):
    venues=Venues(settings(tmp_path,pair));venues.PUBLIC_CYCLE_BUDGET=.01
    await venues.metadata_lock.acquire()
    try:
        with pytest.raises(Rejected,match='共同市场读取超时'):await venues.metadata()
        assert not venues.markets
    finally:
        venues.metadata_lock.release();await venues.close()
