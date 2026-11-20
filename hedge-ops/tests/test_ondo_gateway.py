"""New console host boundaries; fixtures never contact or trade real accounts."""
import json
import re
import sys
from pathlib import Path
from unittest.mock import AsyncMock
import httpx
import pytest

sys.path.insert(0,str(Path(__file__).parents[1]))
from gateway import RuntimeManager,is_secret,validate_value
from local import OWNER,create_local_app
from paired_hedge.resources import resources

NEW_PAIRS=('ondoperps_entropy','ondoperps_ondoperps')

def test_official_prefixed_ondo_credentials_and_redaction():
    for prefix in ('ONDOPERPS','ONDOPERPS_A','ONDOPERPS_B'):
        key=prefix+'_API_KEY_ID';secret=prefix+'_API_SECRET'
        assert is_secret(key) and is_secret(secret)
        assert validate_value(key,'ondoKeyId_abc123',set())=='ondoKeyId_abc123'
        assert validate_value(secret,'ondoApiSecret_abc123',set())=='ondoApiSecret_abc123'
        assert validate_value(secret,'ondoApiSecret_opaque+/=',set())=='ondoApiSecret_opaque+/='
        for field,value in ((key,'11'*32),(secret,'22'*32),(secret,'ondoApiSecret_bad\nheader')):
            with pytest.raises(Exception):validate_value(field,value,set())

def test_ondo_and_entropy_resources_share_real_provider_namespace():
    value='ondoKeyId_AbC123'
    assert resources('ondoperps_entropy',{'ONDOPERPS_API_KEY_ID':value}) & resources('ondoperps_ondoperps',{'ONDOPERPS_A_API_KEY_ID':value})
    assert resources('ondoperps_ondoperps',{'ONDOPERPS_A_API_KEY_ID':value}) & resources('ondoperps_ondoperps',{'ONDOPERPS_B_API_KEY_ID':value})
    assert resources('ondoperps_entropy',{'ONDOPERPS_API_KEY_ID':value}).isdisjoint(resources('ondoperps_ondoperps',{'ONDOPERPS_A_API_KEY_ID':'ondoKeyId_other'}))
    fields={'HYPERLIQUID_ACCOUNT_ADDRESS':'0x'+'12'*20,'HYPERLIQUID_PRIVATE_KEY':'0x'+'34'*32}
    assert resources('ondoperps_entropy',fields) & resources('entropy',fields)
    assert resources('ondoperps_entropy',fields) & resources('binance_hyperliquid',fields)

@pytest.mark.asyncio
async def test_new_pair_credentials_masked_and_console_reads_isolated(tmp_path):
    app=create_local_app(tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1:8011') as client:
        html=(await client.get('/')).text
        token=json.loads(re.search(r'const csrf=("[^"]+")',html)[1])
        headers={'Origin':'http://127.0.0.1:8011','X-Local-CSRF':token}
        for pair in NEW_PAIRS:
            assert f'data-engine="{pair}"' in html
            schema=await client.get(f'/local/{pair}/config')
            assert schema.status_code==200
            assert schema.json()['dryRun'] is True
            page=await client.get(f'/console/{pair}/')
            assert page.status_code==200 and 'hedge-console-visibility' in page.text
            assert '/local/'+pair in page.text
        values={'ONDOPERPS_API_KEY_ID':'ondoKeyId_testaccount','ONDOPERPS_API_SECRET':'ondoApiSecret_testsecret'}
        saved=await client.put('/local/ondoperps_entropy/config',json={'values':values},headers=headers)
        assert saved.status_code==200,saved.text
        assert not any(value in saved.text for value in values.values())
        assert app.state.manager.read_config(OWNER,'ondoperps_entropy')['ONDOPERPS_API_KEY_ID']==values['ONDOPERPS_API_KEY_ID']
        assert not app.state.manager.read_config(OWNER,'ondoperps_ondoperps')['ONDOPERPS_A_API_KEY_ID']
        duplicate=await client.put('/local/ondoperps_ondoperps/config',json={'values':{'ONDOPERPS_A_API_KEY_ID':'ondoKeyId_same','ONDOPERPS_B_API_KEY_ID':'ondoKeyId_same'}},headers=headers)
        assert duplicate.status_code==400
    await app.state.manager.client.aclose()

@pytest.mark.asyncio
async def test_network_routes_ondo_accounts_separately(monkeypatch):
    import network
    async def probe(venue,proxy,route,**kwargs):return {'venue':venue,'proxyAddress':proxy,'route':route}
    monkeypatch.setattr(network,'probe_network',probe)
    data=await network.check_network('ondoperps_ondoperps',{'ONDOPERPS_A_PROXY':'http://127.0.0.1:1001','ONDOPERPS_B_PROXY':'http://127.0.0.1:1002'})
    assert data['checks']==[{'venue':'ondoperps_a','proxyAddress':'http://127.0.0.1:1001','route':'独立代理'},{'venue':'ondoperps_b','proxyAddress':'http://127.0.0.1:1002','route':'独立代理'}]

@pytest.mark.asyncio
async def test_new_pair_cloud_dispatches_same_journaled_engine(monkeypatch):
    import binance_lighter.cloud
    import cloud_worker
    calls=[]
    async def run(values,snapshot,request,checkpoint,*,engine_name):
        calls.append(engine_name);return {'status':200,'data':{'noOrders':True}}
    monkeypatch.setattr(binance_lighter.cloud,'run',run)
    for pair in NEW_PAIRS:
        result=await cloud_worker.run_engine(pair,{}, {},{'action':'cycle'},lambda *args:None)
        assert result['status']==200
    assert calls==list(NEW_PAIRS)
