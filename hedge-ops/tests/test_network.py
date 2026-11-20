from pathlib import Path
import socket
import ssl
import sys

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import network


@pytest.mark.asyncio
async def test_diagnostics_retry_transport_and_use_only_official_public_reads(monkeypatch):
    real_client = httpx.AsyncClient
    calls = []
    options = []
    def respond(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ConnectTimeout('private-proxy-password')
        return httpx.Response(200, json={'code': 200, 'order_books': []})
    def client(**kwargs):
        options.append(kwargs.copy())
        kwargs['proxy'] = None  # Keep mocked requests in-process, not on a real proxy transport.
        return real_client(transport=httpx.MockTransport(respond), **kwargs)
    monkeypatch.setattr(httpx, 'AsyncClient', client)
    result = await network.probe_network('lighter', 'http://user:password@127.0.0.1:8888', '独立代理')
    assert result['ok'] and result['attempts'] == 2
    assert all(str(request.url) == network.TARGETS['lighter'] and request.method == 'GET' for request in calls)
    assert all('authorization' not in request.headers for request in calls)
    assert options[0]['timeout'].read == 30 and options[0]['trust_env'] is False
    assert 'password' not in str(result)


@pytest.mark.asyncio
@pytest.mark.parametrize('status,body,expected', [(403, {}, 'HTTP_ERROR'), (429, {}, 'HTTP_ERROR'), (200, {'code': 999}, 'INVALID_RESPONSE'), (200, '<html>login</html>', 'INVALID_RESPONSE')])
async def test_http_and_invalid_payload_are_not_reported_connected(monkeypatch, status, body, expected):
    real_client = httpx.AsyncClient
    def client(**kwargs):
        return real_client(transport=httpx.MockTransport(lambda _: httpx.Response(status, json=body)), **kwargs)
    monkeypatch.setattr(httpx, 'AsyncClient', client)
    result = await network.probe_network('lighter', None, '直连')
    assert not result['ok'] and result['code'] == expected
    assert result['attempts'] == 1


def test_safe_error_categories_never_disclose_proxy_credentials():
    dns = httpx.ConnectError('secret')
    dns.__cause__ = socket.gaierror(-2, 'secret')
    tls = httpx.ConnectError('secret')
    tls.__cause__ = ssl.SSLError('secret')
    for error, expected in [(dns, 'DNS_ERROR'), (tls, 'TLS_ERROR'), (httpx.ProxyError('407 secret'), 'PROXY_AUTH'), (httpx.ProxyError('secret'), 'PROXY_ERROR'), (httpx.ConnectTimeout('secret'), 'TIMEOUT'), (ValueError('secret'), 'PROXY_CONFIG')]:
        code, message = network.network_error(error)
        assert code == expected and 'secret' not in message


@pytest.mark.asyncio
async def test_independent_shared_and_direct_route_selection(monkeypatch):
    calls = []
    async def probe(venue, proxy, route):
        calls.append((venue, proxy, route))
        return {'venue': venue, 'ok': True}
    monkeypatch.setattr(network, 'probe_network', probe)
    await network.check_network('lighter', {'LIGHTER_PROXY': 'http://individual:1', 'GLOBAL_PROXY': 'http://shared:2'})
    assert calls == [('arcus', 'http://shared:2', '共用代理'), ('lighter', 'http://individual:1', '独立代理')]
    calls.clear()
    await network.check_network('entropy', {})
    assert calls == [('arcus', None, '直连'), ('entropy', None, '直连')]
