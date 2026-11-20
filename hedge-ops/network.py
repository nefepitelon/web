"""Public, read-only exchange diagnostics; never send keys or place orders."""
from __future__ import annotations

import asyncio
import socket
import ssl
import time

import httpx

TARGETS = {
    "binance": "https://fapi.binance.com/fapi/v1/exchangeInfo",
    "lighter_core": "https://mainnet.zklighter.elliot.ai/api/v1/orderBooks",
    "arcus": "https://api.arcus.xyz/v1/markets",
    "lighter": "https://api.rh.lighter.xyz/api/v1/orderBooks",
    "entropy": "https://api.hyperliquid.xyz/info",
    "hyperliquid": "https://api.hyperliquid.xyz/info",
    "okx": "https://www.okx.com/api/v5/public/instruments?instType=SWAP",
    "ondoperps": "https://api.ondoperps.xyz/v1/markets",
    "ondoperps_a": "https://api.ondoperps.xyz/v1/markets",
    "ondoperps_b": "https://api.ondoperps.xyz/v1/markets",
}


def network_error(error: Exception) -> tuple[str, str]:
    # Do not return raw exception text: it may include proxy credentials.
    causes = []
    current = error
    while current is not None and len(causes) < 8:
        causes.append(current)
        current = current.__cause__ or current.__context__
    if any(isinstance(cause, socket.gaierror) for cause in causes):
        return "DNS_ERROR", "DNS 解析失败，请检查网络或代理的域名解析"
    if any(isinstance(cause, ssl.SSLError) or "CERTIFICATE_VERIFY_FAILED" in str(cause) for cause in causes):
        return "TLS_ERROR", "TLS 证书验证失败，请检查系统时间、证书或代理 HTTPS 设置"
    if isinstance(error, httpx.ProxyError):
        if any("407" in str(cause) for cause in causes):
            return "PROXY_AUTH", "代理认证失败（HTTP 407），请核对代理用户名和密码"
        return "PROXY_ERROR", "代理连接失败，请核对代理协议、地址、端口与认证信息"
    if isinstance(error, (httpx.TimeoutException, TimeoutError)):
        return "TIMEOUT", "连接或响应超时，请检查该网络出口能否访问目标接口，或填写可用的独立代理后检测"
    if isinstance(error, (ValueError, ImportError)):
        return "PROXY_CONFIG", "代理配置或依赖无效，请核对协议并运行最新版启动文件更新依赖"
    return "CONNECTION_ERROR", "无法建立连接，请检查目标接口和当前网络出口；代理服务须已启动"


async def probe_network(venue: str, proxy: str | None, route: str, region='global') -> dict:
    started = time.monotonic()
    result = {"venue": venue, "target": TARGETS[venue], "proxy": route}
    if venue == 'okx':
        from paired_hedge.exchanges import OKX
        if region not in OKX.URLS: return {**result,'ok':False,'error':'OKX 注册地区无效','latencyMs':0}
        result['target']=OKX.URLS[region]+'/api/v5/public/instruments?instType=SWAP'
    attempts = 0
    try:
        # Larger payloads / residential proxies routinely exceed the former 12s.
        # Keep the total budget below the UI's 40s request deadline.
        async with asyncio.timeout(35):
            async with httpx.AsyncClient(proxy=proxy or None, trust_env=False,
                    timeout=httpx.Timeout(30, connect=15),
                    headers={"Accept": "application/json", "User-Agent": "WeLinkBTC-HedgeOps/1.0"}) as client:
                for attempt in range(2):
                    attempts += 1
                    try:
                        response = (await client.post(result['target'], json={"type": "meta", "dex": "io" if venue=='entropy' else ''})
                                    if venue in {"entropy","hyperliquid"} else await client.get(result['target']))
                        break
                    except httpx.TransportError:
                        if attempt:
                            raise
                        await asyncio.sleep(0.5)
        result["status"] = response.status_code
        if not response.is_success:
            code = response.status_code
            error = ("接口访问被拒绝，请检查该出口的访问权限" if code in {401, 403, 451} else
                     "接口请求过于频繁，请稍后重试" if code == 429 else
                     "接口暂时不可用，请稍后重试" if code >= 500 else "目标接口返回异常状态")
            result.update(ok=False, code="HTTP_ERROR", error=f"{error}（HTTP {code}）")
        else:
            try:
                body = response.json()
                if venue.startswith('ondoperps'):
                    valid = isinstance(body,dict) and body.get('success') is True and isinstance((body.get('result') or {}).get('perps',{}).get('tradingPairs'),list)
                else:
                    valid = isinstance(body, dict) and str(body.get("code", 200)) == ('0' if venue=='okx' else '200')
                    valid = valid and isinstance(body.get({"arcus": "markets", "lighter": "order_books", "entropy": "universe", "hyperliquid":"universe", "okx":"data", "binance": "symbols", "lighter_core": "order_books"}[venue]), list)
            except (ValueError, TypeError):
                valid = False
            result.update(ok=valid, code="OK" if valid else "INVALID_RESPONSE")
            if not valid:
                result["error"] = "接口已响应，但未返回预期行情数据，请检查代理是否返回了登录页或错误页"
    except Exception as error:
        code, message = network_error(error)
        result.update(ok=False, code=code, error=message)
    result.update(latencyMs=round((time.monotonic() - started) * 1000), attempts=attempts)
    return result


async def check_network(engine: str, values: dict[str, str]) -> dict:
    def route(venue):
        specific = values.get(("LIGHTER" if venue == "lighter_core" else venue.upper()) + "_PROXY")
        shared = values.get("GLOBAL_PROXY")
        return specific or shared or None, "独立代理" if specific else "共用代理" if shared else "直连"
    from paired_hedge.config import PAIRS
    venues = tuple('lighter_core' if v=='lighter' else v for v in PAIRS[engine]) if engine in PAIRS else ("binance", "lighter_core") if engine == "binance" else ("arcus", engine)
    return {"checks": await asyncio.gather(*(probe_network(venue, *route(venue),**({'region':values.get('OKX_REGION','global')} if venue=='okx' else {})) for venue in venues))}
