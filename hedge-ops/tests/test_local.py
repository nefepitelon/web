import json
import re
from pathlib import Path
import sys
import httpx
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from local import create_local_app, normalize_local_proxy

@pytest.mark.asyncio
async def test_config_saved_locally_masked_reloaded_and_clear(tmp_path):
    app = create_local_app(tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8011") as client:
        html = (await client.get("/")).text
        token = json.loads(re.search(r"const csrf=(\"[^\"]+\")", html)[1])
        headers = {"Origin": "http://127.0.0.1:8011", "X-Local-CSRF": token}
        payload = {"values": {"ARCUS_ADDRESS": "0x" + "ab" * 20, "ARCUS_API_PRIVATE_KEY": "12" * 32, "GLOBAL_PROXY": "127.0.0.1:8888:user:pass", "DRY_RUN": "true"}}
        assert (await client.put("/local/lighter/config", json=payload)).status_code == 403
        saved = await client.put("/local/lighter/config", json=payload, headers=headers)
        assert saved.status_code == 200, saved.text
        assert saved.json()["values"]["GLOBAL_PROXY"] == ""
        assert "pass" not in saved.text and "12" * 32 not in saved.text
        assert (await client.get("/local/entropy/config")).json()["values"]["ARCUS_ADDRESS"] == ""
        await client.put("/local/lighter/config", json={"values": {"GLOBAL_PROXY": ""}}, headers=headers)
        values = app.state.manager.read_config(__import__('local').OWNER, "lighter")
        assert values["GLOBAL_PROXY"] == "http://user:pass@127.0.0.1:8888"
        await client.put("/local/lighter/config", json={"values": {}, "clear": ["GLOBAL_PROXY"]}, headers=headers)
        assert app.state.manager.read_config(__import__('local').OWNER, "lighter")["GLOBAL_PROXY"] == ""
    reloaded = create_local_app(tmp_path)
    assert reloaded.state.manager.read_config(__import__('local').OWNER, "lighter")["ARCUS_ADDRESS"] == "0x" + "ab" * 20
    await app.state.manager.client.aclose()
    await reloaded.state.manager.client.aclose()

@pytest.mark.asyncio
async def test_local_health_and_dns_rebinding(tmp_path):
    app = create_local_app(tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8011") as client:
        health = await client.get("/health")
        assert health.json()["service"] == "welinkbtc-hedge-local"
        assert health.headers["access-control-allow-origin"] == "*"
        assert (await client.get("/", headers={"Host": "attacker.test:8011"})).status_code == 403
        assert (await client.get("/console/lighter/static/%2e%2e/%2e%2e/gateway.py")).status_code == 404
    await app.state.manager.client.aclose()

def test_local_proxy_normalization():
    assert normalize_local_proxy("127.0.0.1:7890") == "http://127.0.0.1:7890"
    assert normalize_local_proxy("socks5://user:pass@127.0.0.1:1080") == "socks5://user:pass@127.0.0.1:1080"
    assert normalize_local_proxy("direct") == ""
    with pytest.raises(Exception): normalize_local_proxy("file:///tmp/secret")


@pytest.mark.asyncio
async def test_binance_local_configuration_and_console_are_independent(tmp_path):
    app=create_local_app(tmp_path)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://127.0.0.1:8011') as client:
        html=(await client.get('/')).text
        assert 'data-engine="binance"' in html
        token=json.loads(re.search(r'const csrf=("[^"]+")',html)[1])
        headers={'Origin':'http://127.0.0.1:8011','X-Local-CSRF':token}
        saved=await client.put('/local/binance/config',headers=headers,json={'values':{'BINANCE_API_KEY':'a'*64,'BINANCE_API_SECRET':'b'*64,'LIGHTER_API_PRIVATE_KEY':'ab'*40}})
        assert saved.status_code==200
        assert 'b'*64 not in saved.text and saved.json()['values']['BINANCE_API_KEY']==''
        assert (await client.get('/local/lighter/config')).json()['values']['LIGHTER_API_PRIVATE_KEY']==''
        page=await client.get('/console/binance/')
        assert page.status_code==200 and '/console/binance/static/app.js' in page.text
        assert (await client.get('/console/binance/static/app.js')).status_code==200
    await app.state.manager.client.aclose()


@pytest.mark.asyncio
async def test_unsaved_network_can_be_checked_without_saving_keys_or_mutating_configuration(tmp_path, monkeypatch):
    import local
    app = create_local_app(tmp_path)
    observed = []
    async def check(engine, values):
        observed.append((engine, values.copy()))
        return {"checks": [{"venue": "lighter", "ok": True, "proxy": "独立代理"}]}
    monkeypatch.setattr(local, "check_network", check)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://127.0.0.1:8011") as client:
        html = (await client.get("/")).text
        token = json.loads(re.search(r"const csrf=(\"[^\"]+\")", html)[1])
        headers = {"Origin": "http://127.0.0.1:8011", "X-Local-CSRF": token}
        # The form's Lighter key need not be saved before testing its proxy.
        payload = {"values": {"LIGHTER_PROXY": "127.0.0.1:8888:user:pass"}}
        assert (await client.post("/local/lighter/network", json=payload)).status_code == 403
        response = await client.post("/local/lighter/network", json=payload, headers=headers)
        assert response.status_code == 200 and "pass" not in response.text
        assert observed[-1][1]["LIGHTER_PROXY"] == "http://user:pass@127.0.0.1:8888"
        assert app.state.manager.read_config(local.OWNER, "lighter")["LIGHTER_PROXY"] == ""
        assert not list(tmp_path.iterdir())
        assert (await client.post("/local/lighter/network", json={"values": {"LIGHTER_BASE_URL": "http://evil"}}, headers=headers)).status_code == 400
        assert (await client.post("/local/lighter/network", json={"values": {}, "clear": [[]]}, headers=headers)).status_code == 400
        saved = await client.put("/local/lighter/config", json={"values": {"LIGHTER_API_PRIVATE_KEY": "ab" * 40}}, headers=headers)
        assert saved.status_code == 200 and "ab" * 40 not in saved.text
    await app.state.manager.client.aclose()
